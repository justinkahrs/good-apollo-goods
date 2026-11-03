import { z } from 'zod';
import { atomic, db, Prisma } from './db';
import { DomainError } from './domain';
import { provider, recordRefund, reconcileSession, STORE } from './payments';
import { lockStock, movement } from './stock';
import { enqueue } from './email';
export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`,
  );
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: { items: true, shipment: true, refunds: true, dispute: true },
  });
}
export function packable(order: {
  paymentStatus: string;
  attention: string | null;
  canceledAt: Date | null;
  refundedCents: number;
  totalCents: number;
  fulfillmentStatus: string;
  dispute?: { status: string } | null;
  refunds?: Array<{ status: string }>;
}) {
  return (
    order.paymentStatus === 'paid' &&
    !order.attention &&
    !order.canceledAt &&
    order.refundedCents < order.totalCents &&
    order.fulfillmentStatus === 'unfulfilled' &&
    (!order.dispute ||
      ['won', 'warning_closed'].includes(order.dispute.status)) &&
    !order.refunds?.some((r) =>
      ['requested', 'pending', 'requires_action'].includes(r.status),
    )
  );
}
const shippingInput = z.object({
  orderId: z.uuid(),
  operationKey: z.uuid(),
  revision: z.number().int(),
  carrier: z.enum(['USPS', 'UPS', 'FedEx', 'DHL']),
  trackingNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{6,80}$/),
});
export function trackingUrl(carrier: string, number: string) {
  const n = encodeURIComponent(number.replaceAll(' ', ''));
  const urls: Record<string, string> = {
    USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
    UPS: `https://www.ups.com/track?tracknum=${n}`,
    FedEx: `https://www.fedex.com/fedextrack/?trknbr=${n}`,
    DHL: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`,
  };
  if (!urls[carrier]) throw new DomainError('Choose a supported carrier.');
  return urls[carrier];
}
export async function shipOrder(actorId: string, input: unknown) {
  const v = shippingInput.parse(input);
  return atomic(async (tx) => {
    const order = await lockOrder(tx, v.orderId);
    if (order.shipment) {
      if (order.shipment.operationKey === v.operationKey) return order.shipment;
      throw new DomainError('This order has already shipped.', 409);
    }
    if (order.revision !== v.revision)
      throw new DomainError(
        'Order status changed. Refresh before shipping.',
        409,
        'revision',
      );
    if (!packable(order))
      throw new DomainError(
        'Only paid, unblocked, uncanceled orders can ship.',
        409,
      );
    const url = trackingUrl(v.carrier, v.trackingNumber);
    const shipment = await tx.shipment.create({
      data: {
        orderId: order.id,
        operationKey: v.operationKey,
        carrier: v.carrier,
        trackingNumber: v.trackingNumber,
        trackingUrl: url,
        actorId,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: 'shipped', revision: { increment: 1 } },
    });
    await enqueue(tx, `shipment:${order.id}`, 'shipment', {
      email: order.email,
      number: order.number,
      carrier: v.carrier,
      trackingNumber: v.trackingNumber,
      trackingUrl: url,
    });
    await tx.audit.create({
      data: {
        actorId,
        action: 'order.ship',
        entityId: order.id,
        metadata: { carrier: v.carrier },
      },
    });
    return shipment;
  });
}
export async function cancelOrder(actorId: string, input: unknown) {
  const v = z
    .object({
      orderId: z.uuid(),
      revision: z.number().int(),
      reason: z.string().trim().min(3).max(300),
    })
    .parse(input);
  return atomic(async (tx) => {
    const order = await lockOrder(tx, v.orderId);
    if (order.canceledAt) return order;
    if (order.revision !== v.revision)
      throw new DomainError(
        'Order status changed. Refresh before canceling.',
        409,
        'revision',
      );
    if (order.shipment)
      throw new DomainError(
        'A shipped order cannot be canceled. Review an exceptional refund instead.',
        409,
      );
    if (order.paymentStatus !== 'paid')
      throw new DomainError(
        'Expire an unpaid checkout through payment reconciliation first.',
        409,
      );
    const canceled = await tx.order.update({
      where: { id: order.id },
      data: { canceledAt: new Date(), revision: { increment: 1 } },
    });
    await tx.audit.create({
      data: {
        actorId,
        action: 'order.cancel',
        entityId: order.id,
        metadata: { reason: v.reason },
      },
    });
    return canceled;
  });
}
export async function requestRefund(actorId: string, input: unknown) {
  const v = z
    .object({
      orderId: z.uuid(),
      operationKey: z.uuid(),
      amountCents: z.number().int().positive(),
      reason: z.string().trim().min(3).max(300),
    })
    .parse(input);
  const refund = await atomic(async (tx) => {
    const order = await lockOrder(tx, v.orderId),
      old = await tx.refund.findUnique({
        where: { operationKey: v.operationKey },
      });
    if (old) {
      if (old.orderId !== order.id || old.amountCents !== v.amountCents)
        throw new DomainError(
          'Refund operation conflicts with an earlier request.',
          409,
        );
      return old;
    }
    if (order.paymentStatus !== 'paid' || !order.stripePaymentId)
      throw new DomainError('Only verified paid orders can be refunded.', 409);
    const committed = order.refunds
      .filter((r) => !['failed', 'canceled'].includes(r.status))
      .reduce((s, r) => s + r.amountCents, 0);
    if (v.amountCents > order.totalCents - committed)
      throw new DomainError('Refund exceeds the remaining paid amount.', 409);
    const r = await tx.refund.create({
      data: {
        orderId: order.id,
        operationKey: v.operationKey,
        amountCents: v.amountCents,
        reason: v.reason,
        actorId,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { revision: { increment: 1 } },
    });
    await tx.audit.create({
      data: {
        actorId,
        action: 'refund.request',
        entityId: order.id,
        metadata: { amountCents: v.amountCents, reason: v.reason },
      },
    });
    return r;
  });
  if (!['requested', 'pending'].includes(refund.status)) return refund;
  return performRefund(refund.id);
}
export async function performRefund(id: string) {
  const refund = await db().refund.findUniqueOrThrow({
    where: { id },
    include: { order: true },
  });
  if (refund.stripeId) return refund;
  // Never recreate an unlinked request after the provider's idempotency retention window.
  if (Date.now() - refund.createdAt.getTime() > 23 * 3600000) {
    await db().refund.update({ where: { id }, data: { status: 'attention' } });
    await db().order.update({
      where: { id: refund.orderId },
      data: {
        attention: 'Refund response needs Stripe Dashboard reconciliation.',
      },
    });
    return db().refund.findUniqueOrThrow({ where: { id } });
  }
  try {
    const result = await provider().refunds.create(
      {
        payment_intent: refund.order.stripePaymentId!,
        amount: refund.amountCents,
        metadata: {
          store: STORE,
          order_id: refund.orderId,
          operation_key: refund.operationKey,
        },
      },
      { idempotencyKey: `${STORE}:refund:${refund.operationKey}` },
    );
    await atomic(async (tx) => {
      await lockOrder(tx, refund.orderId);
      await recordRefund(tx, refund.orderId, result);
    });
    if (refund.order.stripeSessionId)
      await reconcileSession(refund.order.stripeSessionId);
    return db().refund.findUniqueOrThrow({ where: { id } });
  } catch (error) {
    const rejected =
      error instanceof Error &&
      error.constructor.name === 'StripeInvalidRequestError';
    await db().refund.update({
      where: { id },
      data: { status: rejected ? 'failed' : 'pending' },
    });
    throw new DomainError(
      rejected
        ? 'Stripe rejected this refund. The money has not been reported as returned.'
        : 'Refund response is uncertain. It will be reconciled; use this same request.',
      503,
      'refund',
    );
  }
}
export async function restockOrder(actorId: string, input: unknown) {
  const v = z
    .object({
      orderId: z.uuid(),
      itemId: z.uuid(),
      operationKey: z.uuid(),
      quantity: z.number().int().positive(),
      condition: z.literal(true),
      presence: z.enum(['unshipped_present', 'return_received']),
      reason: z.string().trim().min(3).max(300),
    })
    .parse(input);
  return atomic(async (tx) => {
    const order = await lockOrder(tx, v.orderId),
      item = order.items.find((i) => i.id === v.itemId);
    if (!item) throw new DomainError('This item is not part of this order.');
    const existing = await tx.stockMovement.findUnique({
      where: { operationKey: v.operationKey },
    });
    if (existing) {
      if (
        existing.orderId !== order.id ||
        existing.variantId !== item.variantId
      )
        throw new DomainError('Restock request conflicts.', 409);
      return item;
    }
    const reservation = await tx.reservation.findUnique({
      where: {
        orderId_variantId: { orderId: order.id, variantId: item.variantId },
      },
    });
    if (reservation?.state !== 'consumed')
      throw new DomainError(
        'These units were not recorded as sold; do not add them again.',
        409,
      );
    if (
      v.presence === 'unshipped_present' &&
      (!order.canceledAt || order.shipment)
    )
      throw new DomainError(
        'Unshipped items must be canceled and physically present.',
        409,
      );
    if (v.presence === 'return_received' && !order.shipment)
      throw new DomainError(
        'Use unshipped cancellation for pieces that never shipped.',
        409,
      );
    if (v.quantity > item.quantity - item.restockedQty)
      throw new DomainError(
        'This exceeds the quantity still eligible to restock.',
        409,
      );
    await lockStock(tx, [item.variantId]);
    await movement(tx, {
      variantId: item.variantId,
      unsoldDelta: v.quantity,
      heldDelta: 0,
      reason: v.reason,
      operationKey: v.operationKey,
      actorId,
      orderId: order.id,
    });
    const changed = await tx.orderItem.update({
      where: { id: item.id },
      data: { restockedQty: { increment: v.quantity } },
    });
    await tx.audit.create({
      data: {
        actorId,
        action: 'order.restock',
        entityId: order.id,
        metadata: {
          itemId: item.id,
          quantity: v.quantity,
          presence: v.presence,
          reason: v.reason,
        },
      },
    });
    return changed;
  });
}

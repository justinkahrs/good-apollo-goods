import Stripe from 'stripe';
import { db, atomic } from './db';
import { provider, reconcileSession, STORE } from './payments';
import { lockOrder } from './orders';
import { enqueue } from './email';
const subscribed = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
];
export async function receiveEvent(event: Stripe.Event) {
  if (!subscribed.includes(event.type)) return { ignored: true };
  const object = event.data.object as { id: string };
  await db().stripeEvent.createMany({
    data: { id: event.id, type: event.type, objectId: object.id },
    skipDuplicates: true,
  });
  const row = await db().stripeEvent.findUniqueOrThrow({
    where: { id: event.id },
  });
  if (row.status === 'complete') return { duplicate: true };
  await processEvent(row.id);
  return { ok: true };
}
export async function processEvent(id: string) {
  const now = new Date(),
    claim = await db().stripeEvent.updateMany({
      where: {
        id,
        status: { not: 'complete' },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseUntil: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
      },
    });
  if (!claim.count) return;
  const row = await db().stripeEvent.findUniqueOrThrow({ where: { id } });
  try {
    const stripe = provider();
    let orderId: string | undefined;
    if (row.type.startsWith('checkout.session.')) {
      if (await reconcileSession(row.objectId, id)) return;
    } else if (row.type.startsWith('payment_intent.')) {
      const payment = await stripe.paymentIntents.retrieve(row.objectId);
      if (payment.metadata.store === STORE) orderId = payment.metadata.order_id;
    } else if (row.type === 'charge.refunded') {
      const charge = await stripe.charges.retrieve(row.objectId);
      const pi =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (pi) {
        const payment = await stripe.paymentIntents.retrieve(pi);
        if (payment.metadata.store === STORE)
          orderId = payment.metadata.order_id;
      }
    } else if (row.type.startsWith('refund.')) {
      const refund = await stripe.refunds.retrieve(row.objectId),
        pi =
          typeof refund.payment_intent === 'string'
            ? refund.payment_intent
            : refund.payment_intent?.id;
      if (pi) {
        const payment = await stripe.paymentIntents.retrieve(pi);
        if (payment.metadata.store === STORE)
          orderId = payment.metadata.order_id;
      }
    } else if (row.type.startsWith('charge.dispute.')) {
      const dispute = await stripe.disputes.retrieve(row.objectId),
        pi =
          typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
      if (pi) {
        const payment = await stripe.paymentIntents.retrieve(pi);
        if (payment.metadata.store === STORE)
          orderId = payment.metadata.order_id;
      }
      if (orderId) {
        const found = await db().order.findUnique({ where: { id: orderId } });
        if (!found?.stripeSessionId) throw new Error('retry_binding');
        await reconcileSession(found.stripeSessionId);
        await atomic(async (tx) => {
          const order = await lockOrder(tx, orderId!);
          if (order.stripePaymentId !== pi) throw new Error('binding');
          await tx.dispute.upsert({
            where: { id: dispute.id },
            create: {
              id: dispute.id,
              orderId: order.id,
              status: dispute.status,
              reason: dispute.reason,
              deadline: dispute.evidence_details.due_by
                ? new Date(dispute.evidence_details.due_by * 1000)
                : null,
            },
            update: {
              status: dispute.status,
              reason: dispute.reason,
              deadline: dispute.evidence_details.due_by
                ? new Date(dispute.evidence_details.due_by * 1000)
                : null,
            },
          });
          await enqueue(
            tx,
            `dispute:${dispute.id}:${dispute.status}`,
            'alert',
            {
              reason: `Payment dispute ${dispute.status}; review the Orders screen and Stripe deadline`,
            },
          );
          await tx.stripeEvent.update({
            where: { id },
            data: {
              status: 'complete',
              completedAt: new Date(),
              leaseUntil: null,
            },
          });
        });
        return;
      }
    }
    if (orderId) {
      const order = await db().order.findUnique({ where: { id: orderId } });
      if (!order?.stripeSessionId) throw new Error('retry_binding');
      if (await reconcileSession(order.stripeSessionId, id)) return;
    }
    await db().stripeEvent.update({
      where: { id },
      data: {
        status: 'complete',
        completedAt: new Date(),
        leaseUntil: null,
        lastError: null,
      },
    });
  } catch {
    await db().stripeEvent.update({
      where: { id },
      data: {
        status: 'retry',
        leaseUntil: null,
        lastError: 'provider_reconciliation_failed',
      },
    });
    throw new Error('provider_reconciliation_failed');
  }
}

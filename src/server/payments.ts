import Stripe from 'stripe';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomic, db, Prisma, type Tx } from './db';
import { config, requiredSecret, salesReady } from './config';
import { DomainError, normalizeCart, total } from './domain';
import { lockStock, movement, settleStock } from './stock';
import { secretEquals } from './http';
import { enqueue } from './email';
import { healthReport, requireOperationalCheckout } from './readiness';
export const STORE = 'good-apollo-goods';
export const TAX_CODES: Record<string, string> = {
  hats: 'txcd_30060006',
  clothing: 'txcd_30011000',
  children: 'txcd_30011200',
  general: 'txcd_99999999',
};
export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function provider() {
  const key = config().STRIPE_SECRET_KEY;
  if (!key) throw new DomainError('Payment service is not configured.', 503);
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 8000 });
}
const quoteRow = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().positive(),
  variantRevision: z.number().int(),
  productRevision: z.number().int(),
});
const quotePayload = z.object({
  id: z.uuid(),
  guestHash: z.string(),
  expires: z.number(),
  rows: z.array(quoteRow),
  settingsRevision: z.number().int(),
  fingerprint: z.string(),
});
type Quote = z.infer<typeof quotePayload>;
function sign(payload: Quote) {
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${raw}.${createHmac('sha256', requiredSecret('QUOTE_SECRET')).update(raw).digest('base64url')}`;
}
function decode(token: string) {
  if (token.length > 15000) throw new DomainError('Invalid checkout quote.');
  const [raw, signature, ...extra] = token.split('.');
  if (
    extra.length ||
    !raw ||
    !signature ||
    !secretEquals(
      signature,
      createHmac('sha256', requiredSecret('QUOTE_SECRET'))
        .update(raw)
        .digest('base64url'),
    )
  )
    throw new DomainError(
      'The checkout quote is invalid. Refresh your cart.',
      400,
      'quote',
    );
  try {
    return quotePayload.parse(
      JSON.parse(Buffer.from(raw, 'base64url').toString()),
    );
  } catch {
    throw new DomainError('The checkout quote is invalid.');
  }
}
export async function quoteCart(guest: string, input: unknown) {
  const cart = normalizeCart(input);
  const settings = await db().storeSettings.findUnique({
    where: { id: 'store' },
  });
  if (
    !settings ||
    !settings.processingWindow.trim() ||
    !settings.taxDecision.trim()
  )
    throw new DomainError(
      'Store shipping and tax settings are incomplete.',
      503,
    );
  const variants = await db().variant.findMany({
    where: { id: { in: cart.map((c) => c.variantId) } },
    include: {
      product: {
        include: {
          images: {
            where: { archivedAt: null, verified: true, placeholder: false },
            orderBy: { position: 'asc' },
            take: 1,
          },
        },
      },
      stock: true,
    },
  });
  const rows = cart.map((line) => {
    const v = variants.find((v) => v.id === line.variantId);
    if (!v || !v.active || v.product.status !== 'published')
      throw new DomainError(
        'A piece is no longer available. Remove it from your cart.',
        409,
        'unavailable',
      );
    const available = (v.stock?.unsoldQty ?? 0) - (v.stock?.heldQty ?? 0);
    return {
      ...line,
      unitPriceCents: v.priceCents,
      variantRevision: v.revision,
      productRevision: v.product.revision,
      name: v.product.name,
      label: v.label,
      slug: v.product.slug,
      available,
      image: v.product.images[0]
        ? `/media/${v.product.images[0].id}/400/`
        : null,
    };
  });
  const subtotal = rows.reduce((s, r) => s + r.unitPriceCents * r.quantity, 0);
  if (total(subtotal, settings.shippingCents, 0) < 50)
    throw new DomainError('The order total must be at least $0.50.');
  const safe = rows.map(
    ({
      variantId,
      quantity,
      unitPriceCents,
      variantRevision,
      productRevision,
    }) => ({
      variantId,
      quantity,
      unitPriceCents,
      variantRevision,
      productRevision,
    }),
  );
  const fingerprint = hash(
    JSON.stringify({ rows: safe, settingsRevision: settings.revision }),
  );
  const q = {
    id: randomUUID(),
    guestHash: hash(guest),
    expires: Date.now() + 600000,
    rows: safe,
    settingsRevision: settings.revision,
    fingerprint,
  };
  const ready =
    salesReady() && settings.taxConfigured && (await healthReport()).ready;
  return {
    rows,
    subtotalCents: subtotal,
    shippingCents: settings.shippingCents,
    taxEnabled: settings.taxEnabled,
    processingWindow: settings.processingWindow,
    token: sign(q),
    salesEnabled: ready,
    canCheckout: rows.every((r) => r.available >= r.quantity) && ready,
  };
}
async function lockedOrder(tx: Tx, id: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`,
  );
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: { items: true, attempt: true, reservations: true },
  });
}
export async function beginCheckout(guest: string, token: string) {
  if (!salesReady())
    throw new DomainError(
      'Checkout is temporarily closed. Your cart is saved.',
      503,
      'closed',
    );
  const q = decode(token),
    guestHash = hash(guest);
  if (q.guestHash !== guestHash)
    throw new DomainError(
      'Use the same browser that reviewed this cart.',
      403,
      'ownership',
    );
  let attempt = await db().checkoutAttempt.findUnique({ where: { id: q.id } });
  if (
    attempt &&
    (attempt.guestHash !== guestHash || attempt.fingerprint !== q.fingerprint)
  )
    throw new DomainError('This checkout belongs to another cart.', 403);
  if (!attempt) {
    await requireOperationalCheckout();
    if (q.expires < Date.now())
      throw new DomainError(
        'Prices need a fresh review. Refresh your cart.',
        409,
        'stale',
      );
    attempt = await atomic(async (tx) => {
      const prior = await tx.checkoutAttempt.findUnique({
        where: { id: q.id },
      });
      if (prior) return prior;
      await lockStock(
        tx,
        q.rows.map((r) => r.variantId),
      );
      const settings = await tx.storeSettings.findUniqueOrThrow({
        where: { id: 'store' },
      });
      if (!settings.taxConfigured)
        throw new DomainError(
          'Tax configuration needs verification before checkout opens.',
          503,
          'closed',
        );
      if (settings.revision !== q.settingsRevision)
        throw new DomainError(
          'Shipping or tax settings changed. Review the new total.',
          409,
          'stale',
        );
      const variants = await tx.variant.findMany({
        where: { id: { in: q.rows.map((r) => r.variantId) } },
        include: {
          product: {
            include: {
              images: {
                where: { archivedAt: null },
                orderBy: { position: 'asc' },
                take: 1,
              },
            },
          },
          stock: true,
        },
      });
      for (const row of q.rows) {
        const v = variants.find((v) => v.id === row.variantId);
        if (
          !v ||
          !v.active ||
          v.product.status !== 'published' ||
          v.revision !== row.variantRevision ||
          v.product.revision !== row.productRevision ||
          v.priceCents !== row.unitPriceCents
        )
          throw new DomainError(
            'A piece or price changed. Review your cart again.',
            409,
            'stale',
          );
        if ((v.stock?.unsoldQty ?? 0) - (v.stock?.heldQty ?? 0) < row.quantity)
          throw new DomainError(
            'Another customer reserved the last piece. Review the available quantity.',
            409,
            'stock',
          );
      }
      const id = randomUUID(),
        statusToken = randomUUID() + randomUUID(),
        expires = new Date(Date.now() + 35 * 60000);
      const subtotal = q.rows.reduce(
        (s, r) => s + r.unitPriceCents * r.quantity,
        0,
      );
      const snapshot = {
        shippingCents: settings.shippingCents,
        processingWindow: settings.processingWindow,
        taxEnabled: settings.taxEnabled,
        taxDecision: settings.taxDecision,
        service: 'Flat-rate U.S. shipping',
        country: 'US',
        taxBehavior: 'exclusive',
      };
      const items = q.rows.map((row) => {
        const v = variants.find((v) => v.id === row.variantId)!;
        return {
          id: randomUUID(),
          variantId: v.id,
          productName: v.product.name,
          variantLabel: v.label,
          sku: v.sku,
          slug: v.product.slug,
          imageKey: (
            (v.product.images[0]?.derivatives as Array<{ key: string }>) ?? []
          ).at(-1)?.key,
          quantity: row.quantity,
          unitPriceCents: v.priceCents,
          lineTotalCents: v.priceCents * row.quantity,
        };
      });
      const request: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        branding_settings: { display_name: 'Good Apollo Goods' },
        payment_method_types: ['card'],
        customer_creation: 'if_required',
        currency: 'usd',
        billing_address_collection: 'required',
        shipping_address_collection: { allowed_countries: ['US'] },
        automatic_tax: { enabled: settings.taxEnabled },
        allow_promotion_codes: false,
        expires_at: Math.floor(expires.getTime() / 1000),
        client_reference_id: id,
        metadata: { store: STORE, order_id: id, attempt_id: q.id },
        payment_intent_data: { metadata: { store: STORE, order_id: id } },
        success_url: `${config().APP_URL}/order/?token=${statusToken}`,
        cancel_url: `${config().APP_URL}/order/?token=${statusToken}&cancel=1`,
        shipping_options: [
          {
            shipping_rate_data: {
              display_name: 'Flat-rate U.S. shipping',
              type: 'fixed_amount',
              fixed_amount: { amount: settings.shippingCents, currency: 'usd' },
              tax_behavior: 'exclusive',
              tax_code: 'txcd_92010001',
            },
          },
        ],
        custom_text: {
          submit: {
            message: `Ready-to-ship merchandise. Processing: ${settings.processingWindow}. All sales are final; contact us for order problems.`,
          },
        },
        line_items: items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: 'usd',
            unit_amount: item.unitPriceCents,
            tax_behavior: 'exclusive',
            product_data: {
              name: `${item.productName} — ${item.variantLabel}`,
              tax_code:
                TAX_CODES[
                  variants.find((v) => v.id === item.variantId)!.product
                    .taxClass
                ],
              metadata: {
                store: STORE,
                order_id: id,
                variant_id: item.variantId,
                line_id: item.id,
              },
            },
          },
        })),
      };
      await tx.order.create({
        data: {
          id,
          guestHash,
          statusTokenHash: hash(statusToken),
          subtotalCents: subtotal,
          shippingCents: settings.shippingCents,
          totalCents: subtotal + settings.shippingCents,
          settingsSnapshot: snapshot,
          items: { create: items },
        },
      });
      for (const row of q.rows) {
        await tx.reservation.create({
          data: {
            orderId: id,
            variantId: row.variantId,
            quantity: row.quantity,
          },
        });
        await movement(tx, {
          variantId: row.variantId,
          unsoldDelta: 0,
          heldDelta: row.quantity,
          reason: 'checkout.reserve',
          operationKey: `hold:${q.id}:${row.variantId}`,
          orderId: id,
        });
      }
      return tx.checkoutAttempt.create({
        data: {
          id: q.id,
          orderId: id,
          guestHash,
          fingerprint: q.fingerprint,
          request: request as never,
          idempotencyKey: `${STORE}:checkout:${q.id}`,
          expiresAt: expires,
          retryUntil: new Date(Date.now() + 23 * 3600000),
        },
      });
    });
  }
  if (attempt.guestHash !== guestHash)
    throw new DomainError('This checkout belongs to another browser.', 403);
  return createSession(attempt.id);
}
export async function createSession(id: string) {
  const attempt = await db().checkoutAttempt.findUniqueOrThrow({
    where: { id },
  });
  const url = (
    attempt.request as unknown as Stripe.Checkout.SessionCreateParams
  ).success_url!;
  const statusUrl = new URL(url).pathname + new URL(url).search;
  if (['paid', 'expired', 'failed', 'attention'].includes(attempt.status))
    return { statusUrl, status: attempt.status };
  if (attempt.sessionId && attempt.sessionUrl)
    return { url: attempt.sessionUrl, statusUrl, status: attempt.status };
  if (attempt.retryUntil.getTime() < Date.now()) {
    await db().checkoutAttempt.update({
      where: { id },
      data: { status: 'attention', lastError: 'provider_retry_window_elapsed' },
    });
    await db().order.update({
      where: { id: attempt.orderId },
      data: {
        attention:
          'Checkout response needs Stripe Dashboard reconciliation; stock remains held.',
      },
    });
    throw new DomainError(
      'This checkout needs a store review. Stock remains protected.',
      409,
      'attention',
    );
  }
  try {
    const session = await provider().checkout.sessions.create(
      attempt.request as unknown as Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: attempt.idempotencyKey },
    );
    await bindSession(attempt.orderId, session);
    return { url: session.url, statusUrl, status: 'open' };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // A transport error or cached provider failure cannot prove that no session exists.
    const definite =
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      !['idempotency_key_in_use'].includes(error.code ?? '');
    // A later invalid request cannot disprove an earlier uncertain creation.
    // In particular, immutable expiry parameters may now be too old to retry.
    const safeRejected =
      definite && attempt.status === 'creating' && attempt.failures === 0;
    await atomic(async (tx) => {
      const order = await lockedOrder(tx, attempt.orderId);
      if (order.paymentStatus === 'paid' || order.stripeSessionId) return;
      if (safeRejected) {
        await settleStock(tx, order.id, 'release');
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'failed' },
        });
      }
      if (definite && !safeRejected)
        await tx.order.update({
          where: { id: order.id },
          data: {
            attention:
              'Checkout response needs Stripe Dashboard reconciliation; stock remains held.',
          },
        });
      await tx.checkoutAttempt.update({
        where: { id },
        data: {
          status: safeRejected
            ? 'failed'
            : definite
              ? 'attention'
              : 'uncertain',
          failures: { increment: 1 },
          lastError: safeRejected
            ? 'provider_request_rejected'
            : 'provider_create_uncertain',
        },
      });
    });
    throw new DomainError(
      safeRejected
        ? 'Checkout could not start. Review your cart and try again.'
        : 'Checkout is being recovered. Your stock is reserved; use the same checkout instead of starting another.',
      503,
      safeRejected ? 'failed' : definite ? 'attention' : 'uncertain',
    );
  }
}
function modeMatches(session: { livemode: boolean }) {
  const key = config().STRIPE_SECRET_KEY ?? '';
  return (
    session.livemode ===
    (key.startsWith('sk_live_') || key.startsWith('rk_live_'))
  );
}
export async function bindSession(
  orderId: string,
  session: Stripe.Checkout.Session,
) {
  if (
    !modeMatches(session) ||
    session.metadata?.store !== STORE ||
    session.metadata.order_id !== orderId ||
    session.client_reference_id !== orderId
  )
    throw new DomainError('Payment identity does not match.', 409, 'binding');
  const current = await db().order.findUniqueOrThrow({
    where: { id: orderId },
    include: { attempt: true, items: true },
  });
  if (
    session.metadata.attempt_id !== current.attempt?.id ||
    (current.stripeSessionId && current.stripeSessionId !== session.id)
  )
    throw new DomainError('Payment session does not match.', 409, 'binding');
  const lines = await provider().checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });
  if (lines.has_more || lines.data.length !== current.items.length)
    throw new DomainError('Payment items do not match.', 409, 'binding');
  for (const item of current.items) {
    const expected = (
      current.attempt!.request as unknown as Stripe.Checkout.SessionCreateParams
    ).line_items!.find(
      (line) => line.price_data?.product_data?.metadata?.line_id === item.id,
    )?.price_data;
    const line = lines.data.find(
      (l) =>
        typeof l.price?.product === 'object' &&
        !('deleted' in l.price.product) &&
        l.price.product.metadata.line_id === item.id,
    );
    const p = line?.price?.product;
    if (
      !line ||
      !p ||
      typeof p === 'string' ||
      'deleted' in p ||
      p.metadata.store !== STORE ||
      p.metadata.order_id !== orderId ||
      p.metadata.variant_id !== item.variantId ||
      line.quantity !== item.quantity ||
      line.price?.currency !== 'usd' ||
      line.price.tax_behavior !== 'exclusive' ||
      p.name !== expected?.product_data?.name ||
      (typeof p.tax_code === 'string' ? p.tax_code : p.tax_code?.id) !==
        expected?.product_data?.tax_code ||
      line.price?.unit_amount !== item.unitPriceCents ||
      line.currency !== 'usd' ||
      line.amount_subtotal !== item.lineTotalCents
    )
      throw new DomainError(
        'Payment line values do not match.',
        409,
        'binding',
      );
  }
  const snap = current.settingsSnapshot as {
    taxEnabled: boolean;
    shippingCents: number;
  };
  if (
    session.currency !== 'usd' ||
    session.mode !== 'payment' ||
    session.amount_subtotal !== current.subtotalCents ||
    session.automatic_tax.enabled !== snap.taxEnabled ||
    session.shipping_address_collection?.allowed_countries.join(',') !== 'US' ||
    session.payment_method_types.some((m) => m !== 'card') ||
    session.recovered_from ||
    session.allow_promotion_codes ||
    session.total_details?.amount_discount
  )
    throw new DomainError('Payment settings do not match.', 409, 'binding');
  if (session.status === 'complete') {
    const tax = session.total_details?.amount_tax ?? 0,
      shipping = session.total_details?.amount_shipping ?? 0;
    const delivery = session.collected_information?.shipping_details;
    if (
      shipping !== snap.shippingCents ||
      session.amount_total !== total(current.subtotalCents, shipping, tax) ||
      delivery?.address?.country !== 'US' ||
      !delivery.name ||
      !session.customer_details?.email ||
      (snap.taxEnabled && session.automatic_tax.status !== 'complete')
    )
      throw new DomainError(
        'Payment address or totals do not match.',
        409,
        'binding',
      );
    const shippingRef = session.shipping_cost?.shipping_rate;
    const rate =
      typeof shippingRef === 'string'
        ? await provider().shippingRates.retrieve(shippingRef)
        : shippingRef;
    if (
      !rate ||
      rate.type !== 'fixed_amount' ||
      rate.fixed_amount?.amount !== snap.shippingCents ||
      rate.fixed_amount.currency !== 'usd' ||
      rate.display_name !== 'Flat-rate U.S. shipping' ||
      rate.tax_behavior !== 'exclusive'
    )
      throw new DomainError('Shipping service does not match.', 409, 'binding');
    if (session.payment_status === 'paid') {
      const id =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!id)
        throw new DomainError('Missing payment identity.', 409, 'binding');
      const payment = await provider().paymentIntents.retrieve(id);
      if (
        !modeMatches(payment) ||
        payment.metadata.store !== STORE ||
        payment.metadata.order_id !== orderId ||
        payment.currency !== 'usd' ||
        payment.amount !== session.amount_total ||
        payment.status !== 'succeeded'
      )
        throw new DomainError(
          'Payment amount or identity does not match.',
          409,
          'binding',
        );
    }
  }
  await atomic(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    if (order.stripeSessionId && order.stripeSessionId !== session.id)
      throw new DomainError('Session conflict.', 409);
    await tx.order.update({
      where: { id: orderId },
      data: { stripeSessionId: session.id },
    });
    await tx.checkoutAttempt.update({
      where: { orderId },
      data: {
        sessionId: session.id,
        sessionUrl: session.url,
        expiresAt: new Date(session.expires_at * 1000),
        status: ['paid', 'expired', 'failed', 'attention'].includes(
          order.attempt!.status,
        )
          ? order.attempt!.status
          : 'open',
      },
    });
  });
}
export async function reconcileSession(sessionId: string, eventId?: string) {
  const session = await provider().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.store !== STORE) return false;
  const orderId = session.metadata.order_id;
  if (!orderId) return false;
  await bindSession(orderId, session);
  // Provider-created refunds may precede a checkout callback; sync them before choosing a packable state.
  const paymentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  let refundData: Stripe.Refund[] = [];
  let terminalFailure = false;
  if (
    paymentId &&
    session.payment_status !== 'paid' &&
    session.status === 'complete'
  ) {
    const payment = await provider().paymentIntents.retrieve(paymentId);
    if (
      payment.metadata.store !== STORE ||
      payment.metadata.order_id !== orderId ||
      !modeMatches(payment)
    )
      throw new DomainError('Payment identity does not match.', 409, 'binding');
    terminalFailure =
      payment.status === 'canceled' ||
      (payment.status === 'requires_payment_method' &&
        Boolean(payment.last_payment_error));
  }
  if (paymentId && session.payment_status === 'paid') {
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const batch = await provider().refunds.list({
        payment_intent: paymentId,
        limit: 100,
        ...(after ? { starting_after: after } : {}),
      });
      refundData.push(...batch.data);
      if (!batch.has_more) break;
      if (page === 9)
        throw new DomainError(
          'Refund history needs manual reconciliation.',
          409,
          'attention',
        );
      after = batch.data.at(-1)!.id;
    }
  }
  return atomic(async (tx) => {
    const order = await lockedOrder(tx, orderId);
    for (const refund of refundData)
      await recordRefund(tx, orderId, refund, {
        paymentId: paymentId!,
        totalCents: session.amount_total!,
      });
    const refunded = await tx.refund.aggregate({
      where: { orderId, status: 'succeeded' },
      _sum: { amountCents: true },
    });
    const refundedCents = refunded._sum.amountCents ?? 0;
    if (session.payment_status === 'paid') {
      if (!paymentId)
        throw new DomainError(
          'Paid checkout is missing its payment identity.',
          409,
          'binding',
        );
      const sold = await settleStock(tx, orderId, 'consume');
      const tax = session.total_details?.amount_tax ?? 0,
        totalCents = session.amount_total!;
      const attention = !sold
        ? 'Paid but stock is unavailable; do not pack. Review or refund this order.'
        : order.attention?.startsWith('Paid but stock') ||
            order.attention?.startsWith('Checkout response')
          ? null
          : order.attention;
      const data = {
        paymentStatus: 'paid',
        stripePaymentId: paymentId,
        taxCents: tax,
        totalCents,
        refundedCents,
        email: session.customer_details!.email,
        customerName: session.collected_information!.shipping_details!.name,
        address: session.collected_information!.shipping_details!
          .address as never,
        paidAt: order.paidAt ?? new Date(),
        attention,
        revision: { increment: 1 },
      };
      const paid = await tx.order.update({ where: { id: orderId }, data });
      await tx.checkoutAttempt.update({
        where: { orderId },
        data: {
          status: sold ? 'paid' : 'attention',
          lastError: sold ? null : 'late_payment_stock_unavailable',
        },
      });
      const payload = {
        email: paid.email,
        number: paid.number,
        totalCents,
        refundedCents,
        canceled: Boolean(paid.canceledAt),
        attention: Boolean(attention),
        processingWindow: (
          order.settingsSnapshot as { processingWindow: string }
        ).processingWindow,
        items: order.items.map((i) => ({
          name: i.productName,
          label: i.variantLabel,
          quantity: i.quantity,
        })),
      };
      await enqueue(tx, `paid:${orderId}:buyer`, 'buyer', payload);
      await enqueue(tx, `paid:${orderId}:operator`, 'operator', payload);
    } else if (order.paymentStatus !== 'paid') {
      if (session.status === 'expired' || terminalFailure) {
        await settleStock(tx, orderId, 'release');
        await tx.order.update({
          where: { id: orderId },
          data: { paymentStatus: terminalFailure ? 'failed' : 'expired' },
        });
        await tx.checkoutAttempt.update({
          where: { orderId },
          data: { status: terminalFailure ? 'failed' : 'expired' },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus:
              session.status === 'complete' ? 'processing' : 'pending',
          },
        });
        await tx.checkoutAttempt.update({
          where: { orderId },
          data: {
            status: session.status === 'complete' ? 'processing' : 'open',
          },
        });
      }
    }
    if (eventId)
      await tx.stripeEvent.update({
        where: { id: eventId },
        data: {
          status: 'complete',
          completedAt: new Date(),
          leaseUntil: null,
          lastError: null,
        },
      });
    return true;
  });
}
export async function recordRefund(
  tx: Tx,
  orderId: string,
  r: Stripe.Refund,
  binding?: { paymentId: string; totalCents: number },
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const paymentId =
    typeof r.payment_intent === 'string'
      ? r.payment_intent
      : r.payment_intent?.id;
  // Refund objects have no mode flag; their PaymentIntent was mode-verified
  // during reconciliation, and the returned refund must bind to that payment.
  if (
    r.currency !== 'usd' ||
    !Number.isInteger(r.amount) ||
    r.amount <= 0 ||
    paymentId !== (binding?.paymentId ?? order.stripePaymentId) ||
    r.amount > (binding?.totalCents ?? order.totalCents)
  )
    throw new DomainError(
      'Refund amount or payment identity does not match.',
      409,
      'binding',
    );
  const existing = await tx.refund.findUnique({ where: { stripeId: r.id } });
  const operation = r.metadata?.operation_key;
  const requested = operation
    ? await tx.refund.findUnique({ where: { operationKey: operation } })
    : null;
  if (
    (existing && existing.orderId !== orderId) ||
    (requested &&
      (requested.orderId !== orderId || requested.amountCents !== r.amount))
  )
    throw new DomainError('Refund ownership mismatch.', 409);
  const data = {
    stripeId: r.id,
    amountCents: r.amount,
    status: r.status ?? 'pending',
  };
  if (existing || requested)
    await tx.refund.update({
      where: { id: (existing ?? requested)!.id },
      data,
    });
  else
    await tx.refund.create({
      data: {
        ...data,
        orderId,
        operationKey: `stripe:${r.id}`,
        reason: 'Stripe Dashboard refund',
      },
    });
}
export async function cancelCheckout(guest: string, statusToken: string) {
  const order = await ownedOrder(guest, statusToken);
  if (!order.stripeSessionId)
    throw new DomainError(
      'Checkout is still being recovered. Try again shortly.',
      409,
    );
  const stripe = provider(),
    session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
  if (session.status === 'open')
    await stripe.checkout.sessions.expire(session.id);
  await reconcileSession(session.id);
  return { ok: true };
}
export async function ownedOrder(guest: string, statusToken: string) {
  if (statusToken.length > 200)
    throw new DomainError('Order link is invalid.', 404);
  const order = await db().order.findUnique({
    where: { statusTokenHash: hash(statusToken) },
    include: { items: true, shipment: true, attempt: true },
  });
  if (!order || order.guestHash !== hash(guest))
    throw new DomainError(
      'Open this order on the browser used for checkout.',
      404,
      'ownership',
    );
  return order;
}

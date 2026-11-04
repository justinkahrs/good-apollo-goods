import { beforeEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createHash, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import sharp from 'sharp';
const fake = vi.hoisted(() => ({
  sessions: new Map<string, any>(),
  keys: new Map<string, string>(),
  refunds: new Map<string, any>(),
  lostResponse: false,
  createCalls: 0,
  mismatch: false,
  createRejected: false,
  refundRejected: false,
  refundLostResponse: false,
  providerOffline: false,
  disputes: new Map<string, any>(),
  mail: [] as any[],
  mailFails: false,
}));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async (message: any) => {
        if (fake.mailFails) throw new Error('fixture mail failure');
        fake.mail.push(message);
      },
      close() {},
    }),
  },
}));
vi.mock('stripe', async (importOriginal) => {
  const original = await importOriginal<typeof import('stripe')>();
  class FixtureStripe {
    static errors = original.default.errors;
    webhooks = new original.default('sk_test_isolated_fixture').webhooks;
    checkout = {
      sessions: {
        create: async (request: any, options: any) => {
          fake.createCalls++;
          if (fake.createRejected)
            throw new original.default.errors.StripeInvalidRequestError({
              message: 'fixture rejection',
            });
          const prior = fake.keys.get(options.idempotencyKey);
          if (prior) return fake.sessions.get(prior);
          const id = 'cs_test_' + randomUUID();
          const subtotal = request.line_items.reduce(
              (s: number, l: any) => s + l.quantity * l.price_data.unit_amount,
              0,
            ),
            ship =
              request.shipping_options[0].shipping_rate_data.fixed_amount
                .amount;
          const session = {
            id,
            livemode: false,
            metadata: request.metadata,
            client_reference_id: request.client_reference_id,
            currency: 'usd',
            mode: 'payment',
            status: 'open',
            payment_status: 'unpaid',
            expires_at: request.expires_at,
            url: 'https://checkout.stripe.com/c/test/' + id,
            amount_subtotal: subtotal,
            amount_total: subtotal + ship,
            automatic_tax: {
              enabled: request.automatic_tax.enabled,
              status: 'complete',
            },
            allow_promotion_codes: false,
            shipping_address_collection: { allowed_countries: ['US'] },
            payment_method_types: ['card'],
            recovered_from: null,
            shipping_cost: {
              shipping_rate: {
                type: 'fixed_amount',
                fixed_amount: { amount: ship, currency: 'usd' },
                display_name: 'Flat-rate U.S. shipping',
                tax_behavior: 'exclusive',
              },
            },
            total_details: {
              amount_shipping: ship,
              amount_tax: 0,
              amount_discount: 0,
            },
            _request: request,
          };
          fake.sessions.set(id, session);
          fake.keys.set(options.idempotencyKey, id);
          if (fake.lostResponse) {
            fake.lostResponse = false;
            throw new original.default.errors.StripeConnectionError({
              message: 'fixture timeout',
            });
          }
          return session;
        },
        retrieve: async (id: string) => {
          if (fake.providerOffline) throw new Error('fixture provider outage');
          return fake.sessions.get(id);
        },
        listLineItems: async (id: string) => ({
          has_more: false,
          data: fake.sessions.get(id)._request.line_items.map((l: any) => ({
            quantity: l.quantity,
            currency: 'usd',
            amount_subtotal: l.quantity * l.price_data.unit_amount,
            price: {
              currency: 'usd',
              tax_behavior: 'exclusive',
              unit_amount: l.price_data.unit_amount + (fake.mismatch ? 1 : 0),
              product: {
                id: 'prod_fixture',
                name: l.price_data.product_data.name,
                tax_code: l.price_data.product_data.tax_code,
                metadata: l.price_data.product_data.metadata,
              },
            },
          })),
        }),
        expire: async (id: string) => {
          const s = fake.sessions.get(id);
          s.status = 'expired';
          return s;
        },
      },
    };
    refunds = {
      retrieve: async (id: string) => fake.refunds.get(id),
      list: async ({ payment_intent }: any) => ({
        data: [...fake.refunds.values()].filter(
          (r) => r.payment_intent === payment_intent,
        ),
      }),
      create: async (r: any, o: any) => {
        if (fake.refundRejected)
          throw new original.default.errors.StripeInvalidRequestError({
            message: 'fixture refund rejection',
          });
        const old = [...fake.refunds.values()].find(
          (v) => v._key === o.idempotencyKey,
        );
        if (old) return old;
        const result = {
          id: 're_' + randomUUID(),
          ...r,
          status: 'succeeded',
          livemode: false,
          currency: 'usd',
          _key: o.idempotencyKey,
        };
        fake.refunds.set(result.id, result);
        if (fake.refundLostResponse) {
          fake.refundLostResponse = false;
          throw new original.default.errors.StripeConnectionError({
            message: 'fixture lost refund response',
          });
        }
        return result;
      },
    };
    disputes = { retrieve: async (id: string) => fake.disputes.get(id) };
    paymentIntents = {
      retrieve: async (id: string) => {
        const s = [...fake.sessions.values()].find(
          (s) => s.payment_intent === id,
        );
        return {
          id,
          livemode: false,
          metadata: {
            store: 'good-apollo-goods',
            order_id: s.metadata.order_id,
          },
          amount: s.amount_total,
          currency: 'usd',
          status: s._paymentStatus ?? 'succeeded',
          last_payment_error: s._lastPaymentError ?? null,
        };
      },
    };
  }
  return { default: FixtureStripe };
});
import { db } from '../src/server/db';
import {
  saveProduct,
  duplicateProduct,
  publicCatalog,
} from '../src/server/catalog';
import { adjustStock, stockDrift } from '../src/server/stock';
import {
  quoteCart,
  beginCheckout,
  reconcileSession,
  ownedOrder,
  cancelCheckout,
} from '../src/server/payments';
import {
  shipOrder,
  cancelOrder,
  requestRefund,
  restockOrder,
  packable,
} from '../src/server/orders';
import {
  normalizePhoto,
  uploadIntent,
  storePhotoUpload,
  finalizePhoto,
  savePhotos,
  MAX_UPLOAD,
} from '../src/server/photos';
import { receiveEvent } from '../src/server/events';
import { maintenance, monitor } from '../src/server/maintenance';
import { healthReport } from '../src/server/readiness';
import { deliverOutbox } from '../src/server/email';
import { POST as webhook } from '../src/pages/api/stripe/webhook';
import Stripe from 'stripe';
import { importDrafts } from '../scripts/seed';
const actor = randomUUID(),
  guest = 'f'.repeat(64);
async function fixture(stock = 3) {
  const p = await saveProduct(actor, {
    name: 'Fixture hat',
    slug: 'fixture-' + randomUUID(),
    description: 'A real-description fixture hat.',
    category: 'hat',
    audience: 'adult',
    materials: 'Cotton',
    care: 'Air dry',
    detail: '',
    status: 'draft',
    variants: [
      {
        label: 'Small',
        sku: '',
        options: { Size: 'Small' },
        price: '58.01',
        active: true,
        lowStockThreshold: 2,
      },
      {
        label: 'Large',
        sku: '',
        options: { Size: 'Large' },
        price: '60.00',
        active: true,
        lowStockThreshold: 2,
      },
    ],
  });
  await db().productImage.create({
    data: {
      productId: p.id,
      alt: 'A cotton hat photographed on a table',
      verified: true,
      derivatives: [{ width: 400, key: 'fixture/400.webp' }],
    },
  });
  await db().product.update({
    where: { id: p.id },
    data: { status: 'published', publishedAt: new Date() },
  });
  const variants = await db().variant.findMany({
    where: { productId: p.id },
    orderBy: { label: 'asc' },
  });
  for (const v of variants)
    await adjustStock(actor, {
      variantId: v.id,
      revision: 1,
      mode: 'add',
      quantity: stock,
      reason: 'Fixture batch',
      operationKey: randomUUID(),
    });
  return { p, variants };
}
async function checkout(variantId: string, quantity = 1, owner = guest) {
  const q = await quoteCart(owner, [{ variantId, quantity }]);
  const result = await beginCheckout(owner, q.token);
  const order = await db().order.findFirstOrThrow({
    where: {
      attempt: {
        fingerprint: (
          await db().checkoutAttempt.findFirstOrThrow({
            where: { sessionUrl: result.url },
          })
        ).fingerprint,
      },
    },
    include: { items: true },
  });
  return {
    q,
    result,
    order,
    session: fake.sessions.get(order.stripeSessionId!),
  };
}
function pay(session: any) {
  session.status = 'complete';
  session.payment_status = 'paid';
  session.payment_intent = 'pi_' + session.id;
  session.customer_details = { email: 'fixture@example.invalid' };
  session.collected_information = {
    shipping_details: {
      name: 'Fixture Buyer',
      address: {
        line1: '1 Test Street',
        city: 'Grand Rapids',
        state: 'MI',
        postal_code: '49503',
        country: 'US',
      },
    },
  };
}
beforeEach(async () => {
  await db().$executeRawUnsafe(
    'TRUNCATE TABLE "Product", "User", "Order", "StockMovement", "EmailOutbox", "Audit", "StripeEvent", "StoreSettings", "MaintenanceJob", "RequestLimit" RESTART IDENTITY CASCADE',
  );
  await db().storeSettings.create({
    data: {
      taxConfigured: true,
      taxDecision: 'Isolated test fixture; no tax registration or live charge',
    },
  });
  await db().maintenanceJob.create({ data: { lastSucceededAt: new Date() } });
  fake.sessions.clear();
  fake.keys.clear();
  fake.refunds.clear();
  fake.lostResponse = false;
  fake.createCalls = 0;
  fake.mismatch = false;
  fake.createRejected =
    fake.refundRejected =
    fake.refundLostResponse =
    fake.providerOffline =
    fake.mailFails =
      false;
  fake.disputes.clear();
  fake.mail.length = 0;
});
afterAll(async () => db().$disconnect());
it('imports private zero-stock drafts once and preserves later edits', async () => {
  expect(await importDrafts()).toBe(4);
  expect(await publicCatalog()).toHaveLength(0);
  const p = await db().product.findFirstOrThrow();
  await db().product.update({
    where: { id: p.id },
    data: { name: 'Owner edit' },
  });
  expect(await importDrafts()).toBe(0);
  expect(
    (await db().product.findUniqueOrThrow({ where: { id: p.id } })).name,
  ).toBe('Owner edit');
  expect(
    await db().stockBalance.count({ where: { unsoldQty: { gt: 0 } } }),
  ).toBe(0);
  const variant = await db().variant.findFirstOrThrow({
    where: { productId: p.id },
  });
  await adjustStock(actor, {
    variantId: variant.id,
    revision: 1,
    mode: 'add',
    quantity: 7,
    reason: 'Owner counted batch',
    operationKey: randomUUID(),
  });
  expect(await importDrafts()).toBe(0);
  expect(
    (
      await db().stockBalance.findUniqueOrThrow({
        where: { variantId: variant.id },
      })
    ).unsoldQty,
  ).toBe(7);
  const imported = await db().product.findUniqueOrThrow({
    where: { id: p.id },
    include: { variants: true },
  });
  await expect(
    saveProduct(actor, {
      ...imported,
      status: 'published',
      variants: imported.variants.map((v) => ({
        ...v,
        price: (v.priceCents / 100).toFixed(2),
      })),
    }),
  ).rejects.toThrow('real cover photo');
});
it('rejects invalid publication and stale saves; duplicate gets independent zero stock', async () => {
  const { p, variants } = await fixture();
  const edit = {
    id: p.id,
    revision: 1,
    name: 'Edited hat',
    slug: p.slug,
    description: 'Updated valid description.',
    category: 'hat',
    audience: 'adult',
    materials: 'Cotton',
    care: '',
    detail: '',
    status: 'published',
    variants: variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku,
      options: v.options,
      price: (v.priceCents / 100).toFixed(2),
      active: true,
      lowStockThreshold: 2,
    })),
  };
  await saveProduct(actor, edit);
  await expect(saveProduct(actor, edit)).rejects.toMatchObject({
    code: 'revision',
  });
  await expect(
    saveProduct(actor, { ...edit, revision: 2, description: '' }),
  ).rejects.toThrow();
  await expect(
    saveProduct(actor, {
      ...edit,
      revision: 2,
      slug: 'changed-published-address',
    }),
  ).rejects.toThrow();
  expect(
    (await db().product.findUniqueOrThrow({ where: { id: p.id } })).description,
  ).toBe(edit.description);
  const copy = await duplicateProduct(actor, p.id);
  expect(copy.status).toBe('draft');
  expect(
    await db().stockBalance.count({
      where: { variant: { productId: copy.id }, unsoldQty: 0 },
    }),
  ).toBe(2);
});
it('generates new option SKUs without colliding with inactive stock and rejects ambiguous combinations', async () => {
  const created = await saveProduct(actor, {
    name: 'Simple',
    slug: 'simple',
    description: 'A default variant draft',
    category: 'other',
    audience: 'all',
    materials: '',
    care: '',
    detail: '',
    status: 'draft',
    variants: [
      {
        label: 'One size',
        sku: '',
        options: {},
        price: '10.01',
        active: true,
        lowStockThreshold: 3,
      },
    ],
  });
  const edit = {
    id: created.id,
    revision: 1,
    name: 'Simple',
    slug: 'simple',
    description: 'A default variant draft',
    category: 'other',
    audience: 'all',
    materials: '',
    care: '',
    detail: '',
    status: 'draft',
    variants: [
      {
        label: 'Small',
        sku: '',
        options: { Size: 'Small' },
        price: '10.01',
        active: true,
        lowStockThreshold: 3,
      },
      {
        label: 'Large',
        sku: '',
        options: { Size: 'Large' },
        price: '10.02',
        active: true,
        lowStockThreshold: 3,
      },
    ],
  };
  await saveProduct(actor, edit);
  expect(
    await db().variant.count({
      where: { productId: created.id, active: true },
    }),
  ).toBe(2);
  await expect(
    saveProduct(actor, {
      ...edit,
      revision: 2,
      variants: [edit.variants[0], edit.variants[0]],
    }),
  ).rejects.toThrow();
  const old = await db().variant.findFirstOrThrow({
    where: { productId: created.id, label: 'One size' },
  });
  expect(old.active).toBe(false);
});
it('does not release an earlier uncertain attempt on a later invalid request', async () => {
  const { variants } = await fixture(),
    q = await quoteCart(guest, [{ variantId: variants[0].id, quantity: 1 }]);
  fake.lostResponse = true;
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'uncertain',
  });
  fake.createRejected = true;
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'attention',
  });
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
  fake.createRejected = false;
  const session = [...fake.sessions.values()][0];
  pay(session);
  await reconcileSession(session.id);
  const order = await db().order.findFirstOrThrow({
    include: { refunds: true, dispute: true },
  });
  expect(packable(order)).toBe(true);
  expect(await stockDrift()).toEqual([]);
});
it('database constraints reject stock-ledger rewriting and immutable purchased values', async () => {
  const { variants } = await fixture(),
    { order, session } = await checkout(variants[0].id);
  await expect(
    db().stockBalance.update({
      where: { variantId: variants[0].id },
      data: { unsoldQty: -1 },
    }),
  ).rejects.toThrow();
  const entry = await db().stockMovement.findFirstOrThrow();
  await expect(
    db().stockMovement.update({
      where: { id: entry.id },
      data: { reason: 'Rewritten history' },
    }),
  ).rejects.toThrow();
  pay(session);
  await reconcileSession(session.id);
  await expect(
    db().orderItem.update({
      where: { id: order.items[0].id },
      data: { unitPriceCents: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    db().order.update({ where: { id: order.id }, data: { shippingCents: 1 } }),
  ).rejects.toThrow();
});
it('serializes two customers racing for the last unit', async () => {
  const { variants } = await fixture(1),
    id = variants[0].id;
  const a = await quoteCart(guest, [{ variantId: id, quantity: 1 }]),
    b = await quoteCart('e'.repeat(64), [{ variantId: id, quantity: 1 }]);
  const results = await Promise.allSettled([
    beginCheckout(guest, a.token),
    beginCheckout('e'.repeat(64), b.token),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await db().stockBalance.findUniqueOrThrow({ where: { variantId: id } }))
      .heldQty,
  ).toBe(1);
  expect(await stockDrift()).toEqual([]);
});
it('rolls back every hold when one cart line is short', async () => {
  const { variants } = await fixture(1);
  const q = await quoteCart(guest, [
    { variantId: variants[0].id, quantity: 1 },
    { variantId: variants[1].id, quantity: 2 },
  ]);
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'stock',
  });
  expect(await db().reservation.count()).toBe(0);
  expect(await db().stockBalance.count({ where: { heldQty: { gt: 0 } } })).toBe(
    0,
  );
});
it('reuses a provider-created session after a lost response and consumes once', async () => {
  const { variants } = await fixture(2),
    q = await quoteCart(guest, [{ variantId: variants[0].id, quantity: 1 }]);
  fake.lostResponse = true;
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'uncertain',
  });
  expect(
    (
      await db().stockBalance.findUniqueOrThrow({
        where: { variantId: variants[0].id },
      })
    ).heldQty,
  ).toBe(1);
  const a = await beginCheckout(guest, q.token),
    b = await beginCheckout(guest, q.token);
  expect(a.url).toBe(b.url);
  expect(fake.sessions.size).toBe(1);
  const s = [...fake.sessions.values()][0];
  pay(s);
  await Promise.all([reconcileSession(s.id), reconcileSession(s.id)]);
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
  expect(await db().emailOutbox.count()).toBe(2);
  expect(await stockDrift()).toEqual([]);
});
it('does not release declined/open or completed-processing sessions at nominal expiry', async () => {
  const { variants } = await fixture(),
    { session } = await checkout(variants[0].id);
  session.expires_at = Math.floor(Date.now() / 1000) - 100;
  await reconcileSession(session.id);
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
  session.status = 'complete';
  session.collected_information = {
    shipping_details: { name: 'Fixture', address: { country: 'US' } },
  };
  session.customer_details = { email: 'fixture@example.invalid' };
  await reconcileSession(session.id);
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
  expect((await db().order.findFirstOrThrow()).paymentStatus).toBe(
    'processing',
  );
});
it('checks signatures of quote and ownership and exact provider line values', async () => {
  const { variants } = await fixture(),
    q = await quoteCart(guest, [{ variantId: variants[0].id, quantity: 1 }]);
  await expect(beginCheckout('e'.repeat(64), q.token)).rejects.toMatchObject({
    code: 'ownership',
  });
  await expect(beginCheckout(guest, q.token + 'tamper')).rejects.toThrow();
  const { session } = await checkout(variants[0].id);
  pay(session);
  fake.mismatch = true;
  await expect(reconcileSession(session.id)).rejects.toMatchObject({
    code: 'binding',
  });
  expect((await db().order.findFirstOrThrow()).paymentStatus).toBe('pending');
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
});
it('rejects stock edits below holds and applies adjustment retries once', async () => {
  const { variants } = await fixture(2);
  await checkout(variants[0].id);
  let balance = await db().stockBalance.findUniqueOrThrow({
    where: { variantId: variants[0].id },
  });
  await expect(
    adjustStock(actor, {
      variantId: variants[0].id,
      revision: balance.revision,
      mode: 'set',
      quantity: 0,
      reason: 'Wrong count',
      operationKey: randomUUID(),
    }),
  ).rejects.toThrow();
  const op = {
    variantId: variants[0].id,
    revision: balance.revision,
    mode: 'add',
    quantity: 1,
    reason: 'Extra new piece',
    operationKey: randomUUID(),
  };
  await adjustStock(actor, op);
  await adjustStock(actor, op);
  balance = await db().stockBalance.findUniqueOrThrow({
    where: { variantId: variants[0].id },
  });
  expect(balance.unsoldQty).toBe(3);
  expect(balance.heldQty).toBe(1);
});
it('blocks a late paid order without enough stock and never decrements below zero', async () => {
  const { variants } = await fixture(1),
    { session, result } = await checkout(variants[0].id);
  await cancelCheckout(
    guest,
    new URL(result.statusUrl, 'http://localhost').searchParams.get('token')!,
  );
  let stock = await db().stockBalance.findUniqueOrThrow({
    where: { variantId: variants[0].id },
  });
  await adjustStock(actor, {
    variantId: variants[0].id,
    revision: stock.revision,
    mode: 'remove',
    quantity: 1,
    reason: 'Sold in person',
    operationKey: randomUUID(),
  });
  pay(session);
  await reconcileSession(session.id);
  const order = await db().order.findFirstOrThrow();
  expect(order.paymentStatus).toBe('paid');
  expect(order.attention).toContain('stock is unavailable');
  expect(packable(order)).toBe(false);
  stock = await db().stockBalance.findUniqueOrThrow({
    where: { variantId: variants[0].id },
  });
  expect(stock.unsoldQty).toBe(0);
  expect(stock.heldQty).toBe(0);
  expect(await stockDrift()).toEqual([]);
});
it('records ship/refund/restock independently and rejects excess restocking', async () => {
  const { variants } = await fixture(3),
    { session, order } = await checkout(variants[0].id, 2);
  pay(session);
  await reconcileSession(session.id);
  const paid = await db().order.findUniqueOrThrow({ where: { id: order.id } });
  const shipping = {
    orderId: order.id,
    revision: paid.revision,
    carrier: 'USPS',
    trackingNumber: '9400111899223857000000',
    operationKey: randomUUID(),
  };
  await shipOrder(actor, shipping);
  await shipOrder(actor, shipping);
  expect(await db().shipment.count()).toBe(1);
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
  await requestRefund(actor, {
    orderId: order.id,
    amountCents: 100,
    reason: 'Reviewed order exception',
    operationKey: randomUUID(),
  });
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .refundedCents,
  ).toBe(100);
  expect(
    (
      await db().stockBalance.findUniqueOrThrow({
        where: { variantId: variants[0].id },
      })
    ).unsoldQty,
  ).toBe(1);
  const restock = {
    orderId: order.id,
    itemId: order.items[0].id,
    operationKey: randomUUID(),
    quantity: 1,
    presence: 'return_received',
    condition: true,
    reason: 'Returned hat received and sellable',
  };
  await restockOrder(actor, restock);
  await restockOrder(actor, restock);
  expect(
    (
      await db().stockBalance.findUniqueOrThrow({
        where: { variantId: variants[0].id },
      })
    ).unsoldQty,
  ).toBe(2);
  await expect(
    restockOrder(actor, {
      ...restock,
      operationKey: randomUUID(),
      quantity: 2,
    }),
  ).rejects.toThrow();
  expect(await stockDrift()).toEqual([]);
});
it('runs a multi-product test-mode order through payment, delivery, refunds, dispute, and eligible restock', async () => {
  const first = await fixture(3),
    second = await fixture(3),
    cart = [
      { variantId: first.variants[0].id, quantity: 1 },
      { variantId: first.variants[1].id, quantity: 1 },
      { variantId: second.variants[0].id, quantity: 2 },
    ],
    quote = await quoteCart(guest, cart),
    result = await beginCheckout(guest, quote.token),
    attempt = await db().checkoutAttempt.findFirstOrThrow({
      where: { sessionUrl: result.url },
    }),
    order = await db().order.findUniqueOrThrow({
      where: { id: attempt.orderId },
      include: { items: true },
    }),
    session = fake.sessions.get(order.stripeSessionId!);

  expect(
    Object.fromEntries(
      order.items.map((item) => [item.variantId, item.quantity]),
    ),
  ).toEqual({
    [first.variants[0].id]: 1,
    [first.variants[1].id]: 1,
    [second.variants[0].id]: 2,
  });
  expect(order.subtotalCents).toBe(23801);
  expect(order.shippingCents).toBe(695);
  expect(order.totalCents).toBe(24496);
  pay(session);
  await reconcileSession(session.id);

  const paid = await db().order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true, refunds: true, dispute: true },
  });
  expect(paid.paymentStatus).toBe('paid');
  expect(
    Object.fromEntries(
      paid.items.map((item) => [item.variantId, item.quantity]),
    ),
  ).toEqual({
    [first.variants[0].id]: 1,
    [first.variants[1].id]: 1,
    [second.variants[0].id]: 2,
  });
  expect(
    Object.fromEntries(
      paid.items.map((item) => [item.variantId, item.unitPriceCents]),
    ),
  ).toEqual({
    [first.variants[0].id]: 6000,
    [first.variants[1].id]: 5801,
    [second.variants[0].id]: 6000,
  });
  expect(await db().emailOutbox.count({ where: { status: 'pending' } })).toBe(2);
  expect((await deliverOutbox(10)).delivered).toBe(2);
  expect(fake.mail).toHaveLength(2);
  expect(fake.mail.map((message) => message.subject).sort()).toEqual([
    `New paid order #${order.number}`,
    `Thank you for your order #${order.number}`,
  ]);
  expect(await stockDrift()).toEqual([]);

  const shipped = await shipOrder(actor, {
    orderId: order.id,
    revision: paid.revision,
    carrier: 'USPS',
    trackingNumber: '9400111899223857000000',
    operationKey: randomUUID(),
  });
  expect(shipped.carrier).toBe('USPS');
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .fulfillmentStatus,
  ).toBe('shipped');
  expect((await deliverOutbox(10)).delivered).toBe(1);
  expect(fake.mail.at(-1).subject).toBe(
    `Your Good Apollo order #${order.number} has shipped`,
  );

  await requestRefund(actor, {
    orderId: order.id,
    amountCents: 5000,
    reason: 'Reviewed partial order exception',
    operationKey: randomUUID(),
  });
  await requestRefund(actor, {
    orderId: order.id,
    amountCents: order.totalCents - 5000,
    reason: 'Reviewed remaining order exception',
    operationKey: randomUUID(),
  });
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .refundedCents,
  ).toBe(order.totalCents);

  const dispute = {
    id: 'dp_integrated_fixture',
    payment_intent: session.payment_intent,
    status: 'needs_response',
    reason: 'fraudulent',
    evidence_details: { due_by: Math.floor(Date.now() / 1000) + 86400 },
  };
  fake.disputes.set(dispute.id, dispute);
  await receiveEvent({
    id: 'evt_integrated_dispute',
    type: 'charge.dispute.created',
    data: { object: { id: dispute.id } },
  } as Stripe.Event);
  const disputed = await db().order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true, refunds: true, dispute: true },
  });
  expect(disputed.dispute?.status).toBe('needs_response');
  expect(packable(disputed)).toBe(false);

  const returnItem = disputed.items.find(
    (item) => item.variantId === second.variants[0].id,
  )!;
  await restockOrder(actor, {
    orderId: order.id,
    itemId: returnItem.id,
    operationKey: randomUUID(),
    quantity: 1,
    presence: 'return_received',
    condition: true,
    reason: 'One returned piece was received and inspected as sellable',
  });
  const returnedBalance = await db().stockBalance.findUniqueOrThrow({
    where: { variantId: second.variants[0].id },
  });
  expect(returnedBalance.unsoldQty).toBe(2);
  expect(returnedBalance.heldQty).toBe(0);
  expect(
    (
      await db().orderItem.findUniqueOrThrow({ where: { id: returnItem.id } })
    ).restockedQty,
  ).toBe(1);
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(3);
  expect(
    await db().stockMovement.count({
      where: {
        orderId: order.id,
        reason: 'One returned piece was received and inspected as sellable',
      },
    }),
  ).toBe(1);
  expect(await db().shipment.count({ where: { orderId: order.id } })).toBe(1);
  expect(await db().refund.count({ where: { orderId: order.id } })).toBe(2);
  expect(await db().dispute.count({ where: { orderId: order.id } })).toBe(1);
  expect(await stockDrift()).toEqual([]);
});
it('serializes cancellation against shipping', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  pay(session);
  await reconcileSession(session.id);
  const paid = await db().order.findUniqueOrThrow({ where: { id: order.id } });
  const results = await Promise.allSettled([
    shipOrder(actor, {
      orderId: order.id,
      revision: paid.revision,
      carrier: 'UPS',
      trackingNumber: '1Z9999999999999999',
      operationKey: randomUUID(),
    }),
    cancelOrder(actor, {
      orderId: order.id,
      revision: paid.revision,
      reason: 'Cancel before packing',
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it('validates content, strips metadata and protects upload ownership', async () => {
  const { p } = await fixture();
  await db().product.update({ where: { id: p.id }, data: { status: 'draft' } });
  const bytes = await sharp({
    create: { width: 600, height: 800, channels: 3, background: '#6E322D' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const normalized = await normalizePhoto(bytes);
  const meta = await sharp(normalized[0].body).metadata();
  expect(meta.exif).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
  await expect(normalizePhoto(Buffer.from('<svg></svg>'))).rejects.toThrow();
  const intent = await uploadIntent(actor, {
    productId: p.id,
    type: 'image/jpeg',
    bytes: bytes.length,
  });
  await expect(finalizePhoto(randomUUID(), intent.id)).rejects.toMatchObject({
    status: 403,
  });
  await storePhotoUpload(actor, intent.id, 'image/jpeg', bytes);
  const photo = await finalizePhoto(actor, intent.id);
  expect(photo.verified).toBe(true);
  expect(await finalizePhoto(actor, intent.id)).toMatchObject({ id: photo.id });
});
it('enforces the aggregate media budget before saving a photo', async () => {
  const { p } = await fixture();
  const imageCountBefore = await db().productImage.count({
    where: { productId: p.id },
  });
  const bytes = await sharp({
    create: { width: 120, height: 160, channels: 3, background: '#6E322D' },
  })
    .jpeg()
    .toBuffer();
  const intent = await uploadIntent(actor, {
    productId: p.id,
    type: 'image/jpeg',
    bytes: bytes.length,
  });
  await storePhotoUpload(actor, intent.id, 'image/jpeg', bytes);
  const previous = process.env.MEDIA_BUDGET_BYTES;
  process.env.MEDIA_BUDGET_BYTES = '1';
  try {
    await expect(finalizePhoto(actor, intent.id)).rejects.toMatchObject({
      status: 413,
      code: 'media_budget_exceeded',
    });
  } finally {
    if (previous === undefined) delete process.env.MEDIA_BUDGET_BYTES;
    else process.env.MEDIA_BUDGET_BYTES = previous;
  }
  expect(await db().productImage.count({ where: { productId: p.id } })).toBe(
    imageCountBefore,
  );
});

it('uses immutable exact multi-product/multi-size requests and snapshots', async () => {
  const a = await fixture(5),
    b = await fixture(5);
  const q = await quoteCart(guest, [
    { variantId: a.variants[0].id, quantity: 2 },
    { variantId: a.variants[1].id, quantity: 1 },
    { variantId: b.variants[0].id, quantity: 1 },
  ]);
  const started = await beginCheckout(guest, q.token),
    s = [...fake.sessions.values()][0];
  expect(s._request.line_items.map((l: any) => l.quantity).sort()).toEqual([
    1, 1, 2,
  ]);
  expect(s.amount_subtotal).toBe(6000 * 3 + 5801);
  expect(s._request.payment_method_types).toEqual(['card']);
  expect(s._request.branding_settings.display_name).toBe('Good Apollo Goods');
  expect(s._request.shipping_address_collection.allowed_countries).toEqual([
    'US',
  ]);
  expect(s._request.after_expiration).toBeUndefined();
  expect(
    s._request.line_items.every(
      (l: any) =>
        !l.adjustable_quantity && l.price_data.tax_behavior === 'exclusive',
    ),
  ).toBe(true);
  const token = new URL(started.statusUrl, 'http://localhost').searchParams.get(
    'token',
  )!;
  const before = await ownedOrder(guest, token);
  await db().product.update({
    where: { id: a.p.id },
    data: { name: 'Later product name', status: 'archived' },
  });
  await db().storeSettings.update({
    where: { id: 'store' },
    data: {
      shippingCents: 999,
      processingWindow: 'Later window',
      revision: { increment: 1 },
    },
  });
  pay(s);
  await reconcileSession(s.id);
  const paid = await ownedOrder(guest, token);
  expect(paid.items).toEqual(before.items);
  expect(paid.shippingCents).toBe(695);
  expect((paid.settingsSnapshot as any).processingWindow).toBe(
    '3–5 business days',
  );
  expect(paid.items.some((i) => i.productName === 'Later product name')).toBe(
    false,
  );
  expect(await stockDrift()).toEqual([]);
});
it('reacquires available stock for a late payment and ignores an old expiration', async () => {
  const { variants } = await fixture(2),
    { session, result } = await checkout(variants[0].id);
  await cancelCheckout(
    guest,
    new URL(result.statusUrl, 'http://localhost').searchParams.get('token')!,
  );
  pay(session);
  await receiveEvent({
    id: 'evt_late',
    type: 'checkout.session.completed',
    data: { object: { id: session.id } },
  } as Stripe.Event);
  session.status = 'expired';
  session.payment_status = 'unpaid';
  await receiveEvent({
    id: 'evt_old_expiry',
    type: 'checkout.session.expired',
    data: { object: { id: session.id } },
  } as Stripe.Event);
  expect((await db().order.findFirstOrThrow()).paymentStatus).toBe('paid');
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
  expect(await stockDrift()).toEqual([]);
});
it('deduplicates separate and concurrent event IDs including a webhook before link persistence', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  await db().order.update({
    where: { id: order.id },
    data: { stripeSessionId: null },
  });
  await db().checkoutAttempt.update({
    where: { orderId: order.id },
    data: { sessionId: null, sessionUrl: null, status: 'uncertain' },
  });
  pay(session);
  const event = (id: string) =>
    ({
      id,
      type: 'checkout.session.completed',
      data: { object: { id: session.id } },
    }) as Stripe.Event;
  await Promise.all([
    receiveEvent(event('evt_one')),
    receiveEvent(event('evt_one')),
    receiveEvent(event('evt_two')),
  ]);
  expect(await db().stripeEvent.count({ where: { status: 'complete' } })).toBe(
    2,
  );
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
  expect(await db().emailOutbox.count()).toBe(2);
});
it('verifies raw webhook signatures and refuses mode mismatch and unrelated stores', async () => {
  const { variants } = await fixture(),
    { session } = await checkout(variants[0].id);
  pay(session);
  const event = {
    id: 'evt_signed',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { id: session.id } },
  };
  const raw = JSON.stringify(event),
    signature = new Stripe(
      'sk_test_isolated_fixture',
    ).webhooks.generateTestHeaderString({
      payload: raw,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
  const call = (payload: string, sig: string) =>
    webhook({
      request: new Request('http://localhost/api/stripe/webhook/', {
        method: 'POST',
        headers: { 'stripe-signature': sig },
        body: payload,
      }),
    } as any);
  expect((await call(raw, 'forged')).status).toBe(400);
  const wrong = JSON.stringify({ ...event, livemode: true });
  expect(
    (
      await call(
        wrong,
        new Stripe(
          'sk_test_isolated_fixture',
        ).webhooks.generateTestHeaderString({
          payload: wrong,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        }),
      )
    ).status,
  ).toBe(400);
  expect((await call(raw, signature)).status).toBe(200);
  const unrelated = { ...session, metadata: { store: 'vesper' } };
  fake.sessions.set('cs_unrelated', unrelated);
  expect(
    await receiveEvent({
      id: 'evt_unrelated',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_unrelated' } },
    } as Stripe.Event),
  ).toEqual({ ok: true });
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
});
it.each(['country', 'shipping', 'currency', 'total', 'mode'])(
  'refuses a paid provider %s mismatch without consuming stock',
  async (which) => {
    const { variants } = await fixture(),
      { session } = await checkout(variants[0].id);
    pay(session);
    if (which === 'country')
      session.collected_information.shipping_details.address.country = 'CA';
    if (which === 'shipping')
      session.shipping_cost.shipping_rate.fixed_amount.amount = 0;
    if (which === 'currency') session.currency = 'cad';
    if (which === 'total') session.amount_total++;
    if (which === 'mode') session.livemode = true;
    await expect(reconcileSession(session.id)).rejects.toMatchObject({
      code: 'binding',
    });
    expect((await db().order.findFirstOrThrow()).paymentStatus).toBe('pending');
    expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
  },
);
it('records terminal failed payments once while allowing processing to retain stock', async () => {
  const { variants } = await fixture(),
    { session } = await checkout(variants[0].id);
  pay(session);
  session.payment_status = 'unpaid';
  session._paymentStatus = 'processing';
  await reconcileSession(session.id);
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
  session._paymentStatus = 'requires_payment_method';
  session._lastPaymentError = { code: 'card_declined' };
  await reconcileSession(session.id);
  await reconcileSession(session.id);
  expect((await db().order.findFirstOrThrow()).paymentStatus).toBe('failed');
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.release' } }),
  ).toBe(1);
});
it('handles definite rejection, stale quotes and unverified tax without a payable order', async () => {
  const { variants } = await fixture();
  let q = await quoteCart(guest, [{ variantId: variants[0].id, quantity: 1 }]);
  await db().variant.update({
    where: { id: variants[0].id },
    data: { priceCents: 9999, revision: { increment: 1 } },
  });
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'stale',
  });
  expect(await db().order.count()).toBe(0);
  q = await quoteCart(guest, [{ variantId: variants[0].id, quantity: 1 }]);
  await db().storeSettings.update({
    where: { id: 'store' },
    data: { taxConfigured: false },
  });
  expect(
    (await quoteCart(guest, [{ variantId: variants[0].id, quantity: 1 }]))
      .canCheckout,
  ).toBe(false);
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'closed',
  });
  await db().storeSettings.update({
    where: { id: 'store' },
    data: { taxConfigured: true },
  });
  fake.createRejected = true;
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'failed',
  });
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(0);
});
it('serializes concurrent refund limits and reports rejected refunds as failed', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  pay(session);
  await reconcileSession(session.id);
  fake.refundRejected = true;
  await expect(
    requestRefund(actor, {
      orderId: order.id,
      amountCents: 100,
      reason: 'Reviewed exception',
      operationKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'refund' });
  expect((await db().refund.findFirstOrThrow()).status).toBe('failed');
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .refundedCents,
  ).toBe(0);
  fake.refundRejected = false;
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      requestRefund(actor, {
        orderId: order.id,
        amountCents: order.totalCents,
        reason: 'Reviewed full refund',
        operationKey: randomUUID(),
      }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .refundedCents,
  ).toBe(order.totalCents);
  expect(await stockDrift()).toEqual([]);
});
it('recovers a lost refund response with one provider refund', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  pay(session);
  await reconcileSession(session.id);
  const input = {
    orderId: order.id,
    amountCents: 100,
    reason: 'Reviewed exception',
    operationKey: randomUUID(),
  };
  fake.refundLostResponse = true;
  await expect(requestRefund(actor, input)).rejects.toMatchObject({
    code: 'refund',
  });
  await maintenance();
  expect(fake.refunds.size).toBe(1);
  expect((await db().refund.findFirstOrThrow()).status).toBe('succeeded');
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .refundedCents,
  ).toBe(100);
});
it('reconciles a full dashboard refund before paid delivery and prevents packing', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  pay(session);
  const refund = {
    id: 're_dashboard',
    livemode: false,
    currency: 'usd',
    payment_intent: session.payment_intent,
    amount: session.amount_total,
    status: 'succeeded',
  };
  fake.refunds.set(refund.id, refund);
  await receiveEvent({
    id: 'evt_refund_first',
    type: 'refund.created',
    data: { object: { id: refund.id } },
  } as Stripe.Event);
  const current = await db().order.findUniqueOrThrow({
    where: { id: order.id },
    include: { refunds: true, dispute: true },
  });
  expect(current.paymentStatus).toBe('paid');
  expect(current.refundedCents).toBe(current.totalCents);
  expect(packable(current)).toBe(false);
  await deliverOutbox();
  const buyerMessage = fake.mail.find(
    (m) => m.to === 'fixture@example.invalid',
  );
  expect(buyerMessage.text).toContain('A full refund has been recorded.');
  expect(buyerMessage.text).toContain('Refund recorded: $');
  expect(buyerMessage.text).not.toContain('We will email tracking');
  await receiveEvent({
    id: 'evt_paid_later',
    type: 'checkout.session.completed',
    data: { object: { id: session.id } },
  } as Stripe.Event);
  expect(await db().refund.count()).toBe(1);
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
});
it('keeps disputes independent of stock/refunds and blocks unshipped packing', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  pay(session);
  await reconcileSession(session.id);
  const dispute = {
    id: 'dp_fixture',
    payment_intent: session.payment_intent,
    status: 'needs_response',
    reason: 'fraudulent',
    evidence_details: { due_by: Math.floor(Date.now() / 1000) + 86400 },
  };
  fake.disputes.set(dispute.id, dispute);
  const event = {
    id: 'evt_dispute',
    type: 'charge.dispute.created',
    data: { object: { id: dispute.id } },
  } as Stripe.Event;
  await receiveEvent(event);
  await receiveEvent(event);
  const current = await db().order.findUniqueOrThrow({
    where: { id: order.id },
    include: { refunds: true, dispute: true },
  });
  expect(packable(current)).toBe(false);
  expect(await db().dispute.count()).toBe(1);
  expect(await db().refund.count()).toBe(0);
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
  expect(await db().emailOutbox.count({ where: { kind: 'alert' } })).toBe(1);
});
it('expires stale sign-in retries without contacting the mail provider', async () => {
  const message = await db().emailOutbox.create({
    data: {
      dedupeKey: `expired-signin-${randomUUID()}`,
      kind: 'signin',
      payload: {
        email: 'fixture@example.invalid',
        url: 'https://goodapollogoods.com/sign-in?token=expired-fixture',
      },
      status: 'retry',
      attempts: 2,
      createdAt: new Date(Date.now() - 16 * 60_000),
      availableAt: new Date(Date.now() - 60_000),
    },
  });

  expect(await deliverOutbox(1, 'signin')).toEqual({ delivered: 0, failed: 0 });
  expect(fake.mail).toHaveLength(0);
  expect(
    await db().emailOutbox.findUniqueOrThrow({ where: { id: message.id } }),
  ).toMatchObject({
    status: 'expired',
    attempts: 2,
    lastError: 'signin_link_expired',
  });
});
it('delivers a fresh sign-in after expiring older requests within a one-message budget', async () => {
  await db().emailOutbox.createMany({ data: [1, 2].map((n) => ({
    dedupeKey: `old-signin-${n}-${randomUUID()}`, kind: 'signin',
    payload: { email: 'fixture@example.invalid', url: 'https://example.invalid/expired' },
    createdAt: new Date(Date.now() - 16 * 60_000),
  })) });
  const fresh = await db().emailOutbox.create({ data: {
    dedupeKey: `fresh-signin-${randomUUID()}`, kind: 'signin',
    payload: { email: 'fixture@example.invalid', url: 'https://example.invalid/fresh' },
  } });
  expect(await deliverOutbox(1, 'signin')).toEqual({ delivered: 1, failed: 0 });
  expect(fake.mail).toHaveLength(1);
  expect(fake.mail[0].messageId).toBe(`<${fresh.id}@goodapollogoods.com>`);
  expect(await db().emailOutbox.count({ where: { status: 'expired' } })).toBe(2);
});
it('delivers the requested sign-in without retrying older queued links or duplicating delivery', async () => {
  const older = await db().emailOutbox.create({ data: {
    dedupeKey: `older-signin-${randomUUID()}`, kind: 'signin', status: 'retry', attempts: 2,
    createdAt: new Date(Date.now() - 60_000),
    payload: { email: 'fixture@example.invalid', url: 'https://example.invalid/older' },
  } });
  const fresh = await db().emailOutbox.create({ data: {
    dedupeKey: `target-signin-${randomUUID()}`, kind: 'signin',
    payload: { email: 'fixture@example.invalid', url: 'https://example.invalid/target' },
  } });
  expect(await deliverOutbox(1, 'signin', undefined, fresh.id)).toEqual({ delivered: 1, failed: 0 });
  expect(await deliverOutbox(1, 'signin', undefined, fresh.id)).toEqual({ delivered: 0, failed: 0 });
  expect(fake.mail).toHaveLength(1);
  expect(fake.mail[0].text).toContain('https://example.invalid/target');
  expect(await db().emailOutbox.findUniqueOrThrow({ where: { id: older.id } })).toMatchObject({ status: 'retry', attempts: 2 });
});
it('preserves durable mail during failure and leases concurrent recovery', async () => {
  const { variants } = await fixture(),
    { session } = await checkout(variants[0].id);
  pay(session);
  await reconcileSession(session.id);
  fake.mailFails = true;
  expect((await deliverOutbox(2)).failed).toBe(2);
  expect((await db().order.findFirstOrThrow()).paymentStatus).toBe('paid');
  await db().emailOutbox.updateMany({
    data: { availableAt: new Date(Date.now() - 1) },
  });
  fake.mailFails = false;
  await Promise.all([deliverOutbox(5), deliverOutbox(5)]);
  expect(fake.mail).toHaveLength(2);
  expect(new Set(fake.mail.map((m) => m.messageId)).size).toBe(2);
  expect(
    fake.mail.every(
      (m) =>
        m.text.includes('1 × Fixture hat') &&
        m.text.includes('3–5 business days'),
    ),
  ).toBe(true);
});
it('delivers the durable outbox through the signed private commerce route', async () => {
  const secret = 'fixture-commerce-email-hmac-secret-at-least-32-bytes';
  const received: any[] = [];
  const route = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8');
    const timestamp = String(request.headers['x-good-apollo-timestamp']);
    const nonce = String(request.headers['x-good-apollo-nonce']);
    const path = '/v1/good-apollo/commerce/send';
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const expected = createHmac('sha256', secret)
      .update([timestamp, nonce, 'POST', path, bodyHash].join('\n'))
      .digest('hex');
    expect(request.url).toBe(path);
    expect(request.method).toBe('POST');
    expect(request.headers['x-good-apollo-signature']).toBe(expected);
    received.push(JSON.parse(body));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'accepted', duplicate: false }));
  });
  await new Promise<void>((resolve) => route.listen(0, '127.0.0.1', resolve));
  const address = route.address();
  if (!address || typeof address === 'string') throw new Error('fixture_route_address_missing');
  vi.stubEnv('COMMERCE_EMAIL_API_URL', `http://127.0.0.1:${address.port}/`);
  vi.stubEnv('COMMERCE_EMAIL_HMAC_SECRET', secret);
  vi.stubEnv('SMTP_HOST', '');
  try {
    const messages = [
      { kind: 'signin', type: 'signin', recipient: 'buyer@example.invalid', payload: { email: 'buyer@example.invalid', url: 'https://goodapollogoods.com/signin?token=fixture' } },
      { kind: 'buyer', type: 'order', recipient: 'buyer@example.invalid', payload: { email: 'buyer@example.invalid', number: 'GAG-100', items: [{ name: 'Fixture hat', label: '60 cm', quantity: 1 }], totalCents: 8500, processingWindow: '3–5 business days' } },
      { kind: 'shipment', type: 'shipment', recipient: 'buyer@example.invalid', payload: { email: 'buyer@example.invalid', number: 'GAG-100', carrier: 'USPS', trackingNumber: 'fixture-123', trackingUrl: 'https://tools.usps.com/track' } },
      { kind: 'operator', type: 'operator', recipient: 'hello@annakahrs.com', payload: { number: 'GAG-100', items: [{ name: 'Fixture hat', label: '60 cm', quantity: 1 }], totalCents: 8500, processingWindow: '3–5 business days' } },
      { kind: 'alert', type: 'alert', recipient: 'hello@annakahrs.com', payload: { reason: 'Stock ledger drift detected' } },
    ];
    const queued = await Promise.all(messages.map((message, index) => db().emailOutbox.create({
      data: { dedupeKey: `commerce-route-fixture-${index}`, kind: message.kind, payload: message.payload },
    })));
    expect(await deliverOutbox(5)).toEqual({ delivered: 5, failed: 0 });
    expect(received.map((message) => message.type).sort()).toEqual(['alert', 'operator', 'order', 'shipment', 'signin']);
    for (const item of queued) expect((await db().emailOutbox.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('delivered');
  } finally {
    await new Promise<void>((resolve, reject) => route.close((error) => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
  }
});
it('records one retryable shipment email with safe tracking and no additional sale', async () => {
  const { variants } = await fixture(),
    { session, order } = await checkout(variants[0].id);
  pay(session);
  await reconcileSession(session.id);
  const paid = await db().order.findUniqueOrThrow({ where: { id: order.id } });
  await shipOrder(actor, {
    orderId: order.id,
    revision: paid.revision,
    carrier: 'USPS',
    trackingNumber: '9400111899223857000000',
    operationKey: randomUUID(),
  });
  fake.mailFails = true;
  await deliverOutbox(1, 'shipment');
  expect(await db().shipment.count()).toBe(1);
  fake.mailFails = false;
  await db().emailOutbox.updateMany({
    where: { kind: 'shipment' },
    data: { availableAt: new Date(Date.now() - 1) },
  });
  await deliverOutbox(1, 'shipment');
  expect(fake.mail[0].text).toContain('https://tools.usps.com/');
  expect(
    await db().stockMovement.count({ where: { reason: 'checkout.consume' } }),
  ).toBe(1);
});
it('recovers missed expiration with one runner and alerts when the worker itself is stopped', async () => {
  const { variants } = await fixture(),
    { session } = await checkout(variants[0].id);
  session.status = 'expired';
  const runners = await Promise.all([maintenance(), maintenance()]);
  expect(runners.some((r) => 'busy' in r)).toBe(true);
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(0);
  await db().maintenanceJob.update({
    where: { id: 'commerce' },
    data: { lastSucceededAt: new Date(Date.now() - 601000) },
  });
  await monitor();
  await monitor();
  expect(
    await db().emailOutbox.count({
      where: {
        kind: 'alert',
        payload: {
          path: ['reason'],
          equals: 'Maintenance has missed two scheduled intervals',
        },
      },
    }),
  ).toBe(1);
  expect((await healthReport()).ready).toBe(false);
  const q = await quoteCart(guest, [
    { variantId: variants[0].id, quantity: 1 },
  ]);
  await expect(beginCheckout(guest, q.token)).rejects.toMatchObject({
    code: 'closed',
  });
  await deliverOutbox(2, 'alert');
  expect(
    fake.mail.some((m) => m.text.includes('missed two scheduled intervals')),
  ).toBe(true);
});
it('keeps unknown holds recoverable during outages and detects ledger drift', async () => {
  const { variants } = await fixture(),
    { session } = await checkout(variants[0].id);
  fake.providerOffline = true;
  await expect(
    receiveEvent({
      id: 'evt_outage',
      type: 'checkout.session.completed',
      data: { object: { id: session.id } },
    } as Stripe.Event),
  ).rejects.toThrow();
  expect(
    (await db().stripeEvent.findUniqueOrThrow({ where: { id: 'evt_outage' } }))
      .status,
  ).toBe('retry');
  expect(await db().reservation.count({ where: { state: 'held' } })).toBe(1);
  fake.providerOffline = false;
  pay(session);
  await maintenance();
  expect((await db().order.findFirstOrThrow()).paymentStatus).toBe('paid');
  await db().stockBalance.update({
    where: { variantId: variants[0].id },
    data: { unsoldQty: { increment: 1 } },
  });
  expect(await stockDrift()).toHaveLength(1);
  expect((await healthReport()).ready).toBe(false);
});
it('rejects oversized, mismatched and excessive-pixel uploads, and keeps archived photos editable', async () => {
  const { p } = await fixture();
  await expect(
    uploadIntent(actor, {
      productId: p.id,
      type: 'image/jpeg',
      bytes: MAX_UPLOAD + 1,
    }),
  ).rejects.toThrow();
  const png = await sharp({
    create: { width: 10, height: 10, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  await expect(normalizePhoto(png, 'image/jpeg')).rejects.toThrow();
  const big = await sharp({
    create: { width: 6100, height: 6100, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  await expect(normalizePhoto(big)).rejects.toThrow();
  const images = await db().productImage.findMany({
    where: { productId: p.id },
  });
  await expect(
    savePhotos(actor, {
      productId: p.id,
      revision: 1,
      images: images.map((i) => ({
        id: i.id,
        alt: '',
        variantId: null,
        archived: false,
      })),
    }),
  ).rejects.toThrow();
  expect(
    (await db().product.findUniqueOrThrow({ where: { id: p.id } })).revision,
  ).toBe(1);
});

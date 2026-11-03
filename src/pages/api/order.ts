import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  ownedOrder,
  cancelCheckout,
  reconcileSession,
} from '../../server/payments';
import { guest } from '../../server/guest';
import { body, originGuard, limit, json, failure } from '../../server/http';
export const prerender = false;
export const GET: APIRoute = async ({ request, cookies, url }) => {
  try {
    const owner = guest(cookies);
    await limit(request, 'order-read', 30, 60, owner);
    let order = await ownedOrder(owner, url.searchParams.get('token') ?? '');
    if (order.stripeSessionId && order.paymentStatus !== 'paid') {
      await reconcileSession(order.stripeSessionId).catch(() => {});
      order = await ownedOrder(owner, url.searchParams.get('token') ?? '');
    }
    return json({
      number: order.number,
      paymentStatus: order.paymentStatus,
      attention: Boolean(order.attention),
      fulfillmentStatus: order.fulfillmentStatus,
      canceled: Boolean(order.canceledAt),
      refundedCents: order.refundedCents,
      totalCents: order.totalCents,
      items: order.items.map((i) => ({
        name: i.productName,
        label: i.variantLabel,
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      shipment: order.shipment
        ? {
            carrier: order.shipment.carrier,
            trackingNumber: order.shipment.trackingNumber,
            trackingUrl: order.shipment.trackingUrl,
          }
        : null,
      checkoutUrl:
        order.attempt?.status === 'open' ? order.attempt.sessionUrl : null,
    });
  } catch (e) {
    return failure(e);
  }
};
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    originGuard(request);
    const owner = guest(cookies);
    await limit(request, 'checkout-cancel', 10, 60, owner);
    const v = z
      .object({ token: z.string().max(200) })
      .parse(await body(request));
    return json(await cancelCheckout(owner, v.token));
  } catch (e) {
    return failure(e);
  }
};

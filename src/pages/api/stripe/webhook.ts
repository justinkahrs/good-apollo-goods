import type { APIRoute } from 'astro';
import { config } from '../../../server/config';
import { provider } from '../../../server/payments';
import { receiveEvent } from '../../../server/events';
import { json, rawBody } from '../../../server/http';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const e = config();
  if (!e.STRIPE_WEBHOOK_SECRET)
    return json({ error: 'Webhook unavailable' }, 503);
  let raw;
  try {
    raw = await rawBody(request, 1000000);
  } catch {
    return json({ error: 'Event too large' }, 413);
  }
  let event;
  try {
    event = provider().webhooks.constructEvent(
      raw,
      request.headers.get('stripe-signature') ?? '',
      e.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return json({ error: 'Invalid signature' }, 400);
  }
  const live = (e.STRIPE_SECRET_KEY ?? '').includes('_live_');
  if (event.livemode !== live) return json({ error: 'Wrong event mode' }, 400);
  try {
    return json(await receiveEvent(event));
  } catch {
    return json({ error: 'Event will be retried' }, 503);
  }
};

import type { APIRoute } from 'astro';
import { quoteCart } from '../../../server/payments';
import { guest } from '../../../server/guest';
import { body, originGuard, limit, json, failure } from '../../../server/http';
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    originGuard(request);
    const owner = guest(cookies);
    await limit(request, 'quote', 30, 60, owner);
    return json(await quoteCart(owner, await body(request, 12000)));
  } catch (e) {
    return failure(e);
  }
};

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { beginCheckout } from '../../server/payments';
import { guest } from '../../server/guest';
import { body, originGuard, limit, json, failure } from '../../server/http';
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    originGuard(request);
    const owner = guest(cookies);
    await limit(request, 'checkout', 10, 60, owner);
    const v = z
      .object({ token: z.string().max(15000) })
      .parse(await body(request, 20000));
    return json(await beginCheckout(owner, v.token));
  } catch (e) {
    return failure(e);
  }
};

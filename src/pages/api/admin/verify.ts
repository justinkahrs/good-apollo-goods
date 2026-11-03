import type { APIRoute } from 'astro';
import { z } from 'zod';
import { verifyStepUp } from '../../../server/auth';
import { body, originGuard, limit, json, failure } from '../../../server/http';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    originGuard(request);
    await limit(request, 'verify', 5, 60);
    const v = z
      .object({
        code: z.string().trim().min(6).max(100),
        recovery: z.boolean().default(false),
      })
      .parse(await body(request));
    const headers = await verifyStepUp(request, v.code, v.recovery);
    const response = json({ ok: true });
    for (const cookie of headers.getSetCookie())
      response.headers.append('set-cookie', cookie);
    return response;
  } catch (e) {
    return failure(e);
  }
};

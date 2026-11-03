import type { APIRoute } from 'astro';
import { z } from 'zod';
import { confirmNewsletter } from '../../../server/newsletter';
import { body, failure, json, limit, originGuard } from '../../../server/http';
import { config } from '../../../server/config';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    originGuard(request, config().NEWSLETTER_CONFIRMATION_ORIGIN);
    await limit(request, 'newsletter-confirm', 10, 3600);
    const input = z.object({ token: z.string().min(32).max(256) }).strict().parse(await body(request, 1024));
    const result = await confirmNewsletter(input.token);
    return json({ ...result, message: 'Your Good Apollo Goods newsletter address is confirmed.' });
  } catch (error) {
    return failure(error);
  }
};

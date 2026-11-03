import type { APIRoute } from 'astro';
import { z } from 'zod';
import { body, failure, json, limit, originGuard, rawBody } from '../../../server/http';
import { withdrawNewsletter } from '../../../server/newsletter';
import { config } from '../../../server/config';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      const form = await rawBody(request, 1024);
      if (form !== 'List-Unsubscribe=One-Click')
        return json({ error: 'Invalid newsletter preference request.' }, 400);
      const token = new URL(request.url).searchParams.get('token') ?? '';
      await withdrawNewsletter(token);
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    originGuard(request, config().NEWSLETTER_CONFIRMATION_ORIGIN);
    await limit(request, 'newsletter-unsubscribe', 20, 3600);
    const input = z.object({ token: z.string().min(40).max(100) }).strict().parse(await body(request, 1024));
    await withdrawNewsletter(input.token);
    return json({ withdrawn: true, message: 'You have been unsubscribed from the Good Apollo Goods newsletter.' });
  } catch (error) {
    return failure(error);
  }
};

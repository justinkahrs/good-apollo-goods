import type { APIRoute } from 'astro';
import { z } from 'zod';
import { body, failure, json, limit, originGuard } from '../../../server/http';
import { requestNewsletterSignup } from '../../../server/newsletter';
import { DomainError } from '../../../server/domain';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    originGuard(request);
    await limit(request, 'newsletter-signup', 5, 3600);
    const input = z.object({ email: z.email().trim().max(320), consent: z.literal('yes') }).strict().parse(await body(request, 2048));
    const source = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    await requestNewsletterSignup(input.email, source);
    return json({ accepted: true, message: 'If this address can be subscribed, a confirmation message will arrive shortly.' }, 202);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'newsletter_closed')
      return json({ error: 'Newsletter signup is not open yet.' }, 503);
    return failure(error);
  }
};

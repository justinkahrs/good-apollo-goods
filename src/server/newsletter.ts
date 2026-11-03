import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config';
import { DomainError } from './domain';

const addressSchema = z.email().max(320);
const paths = {
  request: '/v1/good-apollo/newsletter/request',
  confirm: '/v1/good-apollo/newsletter/confirm',
  preferences: '/v1/good-apollo/newsletter/preferences',
} as const;
type Operation = keyof typeof paths;

function service() {
  const e = config();
  if (!e.NEWSLETTER_API_URL || !e.NEWSLETTER_HMAC_SECRET)
    throw new DomainError('Newsletter service is not available yet.', 503, 'newsletter_unavailable');
  return { base: e.NEWSLETTER_API_URL.replace(/\/$/, ''), secret: e.NEWSLETTER_HMAC_SECRET };
}

async function signed<T extends Record<string, unknown>>(operation: 'request' | 'confirm', input: T) {
  const { base, secret } = service();
  const path = paths[operation];
  const body = JSON.stringify(input);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signature = createHmac('sha256', secret)
    .update([timestamp, nonce, 'POST', path, bodyHash].join('\n'))
    .digest('hex');
  let response: Response;
  try {
    response = await fetch(base + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-good-apollo-timestamp': timestamp,
        'x-good-apollo-nonce': nonce,
        'x-good-apollo-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new DomainError('Newsletter service is not available yet. Please try again later.', 503, 'newsletter_unavailable');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.accepted !== true)
    throw new DomainError('Newsletter service is not available yet. Please try again later.', 503, 'newsletter_unavailable');
  return result as Record<string, unknown>;
}

export async function requestNewsletterSignup(rawAddress: string, sourceIdentity: string) {
  const e = config();
  if (!e.NEWSLETTER_ENABLED || !e.NEWSLETTER_CONFIRMATION_DISPATCH_ENABLED)
    throw new DomainError('Newsletter signup is not open yet.', 503, 'newsletter_closed');
  const recipient = addressSchema.parse(rawAddress.trim().toLowerCase());
  const token = randomUUID() + randomUUID();
  const { secret } = service();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const easternDate = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
  const sourceHash = createHmac('sha256', secret)
    .update(easternDate + '\n' + sourceIdentity)
    .digest('hex');
  await signed('request', {
    recipient,
    requestId: randomUUID(),
    // Infra verifies this token against tokenHash, encrypts it in the dedicated
    // confirmation queue, and never returns or logs the plaintext value.
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    sourceHash,
  });
  // New eligible requests are accepted only after Infra commits the encrypted
  // queue item. Existing/pending addresses can be acknowledged generically
  // without revealing whether a message was queued.
  return { accepted: true };
}

export async function confirmNewsletter(token: string) {
  if (token.length < 32 || token.length > 256)
    throw new DomainError('This confirmation link is invalid or expired.', 400, 'newsletter_token_invalid');
  const result = await signed('confirm', { token, requestId: randomUUID() });
  if (result.state !== 'confirmed')
    throw new DomainError('This confirmation link is invalid or expired.', 400, 'newsletter_token_invalid');
  return { confirmed: true };
}

export async function withdrawNewsletter(token: string) {
  if (token.length < 40 || token.length > 100)
    throw new DomainError('This preference link is invalid or expired.', 400, 'newsletter_token_invalid');
  const { base } = service();
  const url = new URL(paths.preferences, base);
  url.searchParams.set('token', token);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new DomainError('Your preference could not be updated. Please retry shortly.', 503, 'newsletter_unavailable');
  }
  if (!response.ok)
    throw new DomainError('Your preference could not be updated. Please retry shortly.', 503, 'newsletter_unavailable');
  return { withdrawn: true };
}

export function newsletterPaths(): Readonly<Record<Operation, string>> {
  return paths;
}

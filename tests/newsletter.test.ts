import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { confirmNewsletter, requestNewsletterSignup, withdrawNewsletter } from '../src/server/newsletter';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function enabled() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NEWSLETTER_ENABLED', 'true');
  vi.stubEnv('NEWSLETTER_CONFIRMATION_DISPATCH_ENABLED', 'true');
  vi.stubEnv('NEWSLETTER_API_URL', 'https://n8n.fixture.test');
  vi.stubEnv('NEWSLETTER_HMAC_SECRET', 'fixture-newsletter-hmac-secret-32-bytes-min');
}

describe('Good Apollo newsletter boundary', () => {
  it('keeps public signup closed by default and never calls the service', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(requestNewsletterSignup('reader@example.test', '127.0.0.1')).rejects.toMatchObject({ code: 'newsletter_closed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signs exact admission bytes and keeps the payload minimal', async () => {
    enabled();
    const secret = process.env.NEWSLETTER_HMAC_SECRET!;
    const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const raw = String(init?.body);
      const headers = new Headers(init?.headers);
      const timestamp = headers.get('x-good-apollo-timestamp')!;
      const nonce = headers.get('x-good-apollo-nonce')!;
      const expected = createHmac('sha256', secret)
        .update([timestamp, nonce, 'POST', path, createHash('sha256').update(raw).digest('hex')].join('\n'))
        .digest('hex');
      expect(headers.get('x-good-apollo-signature')).toBe(expected);
      expect(path).toBe('/v1/good-apollo/newsletter/request');
      const body = JSON.parse(raw);
      expect(body.recipient).toBe('reader@example.test');
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(body.token).toMatch(/^[a-f0-9-]{72}$/);
      expect(body.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createHash('sha256').update(body.token).digest('hex')).toBe(body.tokenHash);
      expect(body.sourceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.keys(body).sort()).toEqual(['recipient', 'requestId', 'sourceHash', 'token', 'tokenHash']);
      return Response.json({ accepted: true, sendConfirmation: true, confirmationQueued: true });
    });
    vi.stubGlobal('fetch', fakeFetch);
    await expect(requestNewsletterSignup('Reader@Example.test', '203.0.113.8')).resolves.toEqual({ accepted: true });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps signup acknowledgement non-enumerating for already pending or subscribed addresses', async () => {
    enabled();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ accepted: true, sendConfirmation: false, confirmationQueued: false })));
    await expect(requestNewsletterSignup('reader@example.test', '203.0.113.8')).resolves.toEqual({ accepted: true });
  });

  it('confirms only through a signed POST and does not mutate on page GET', async () => {
    enabled();
    const fakeFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      return Response.json({ accepted: true, state: 'confirmed' }, { status: 202 });
    });
    vi.stubGlobal('fetch', fakeFetch);
    await expect(confirmNewsletter('T'.repeat(48))).resolves.toEqual({ confirmed: true });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('uses the token-bound RFC 8058 POST and records no newsletter state locally', async () => {
    enabled();
    const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/v1/good-apollo/newsletter/preferences');
      expect(url.searchParams.get('token')).toBe('P'.repeat(48));
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe('List-Unsubscribe=One-Click');
      return new Response('You have been unsubscribed.', { status: 200 });
    });
    vi.stubGlobal('fetch', fakeFetch);
    await expect(withdrawNewsletter('P'.repeat(48))).resolves.toEqual({ withdrawn: true });
  });
});

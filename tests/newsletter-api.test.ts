import { afterEach, expect, it, vi } from 'vitest';
const { withdraw } = vi.hoisted(() => ({ withdraw: vi.fn(async (_token: string) => ({ withdrawn: true })) }));
vi.mock('../src/server/newsletter', () => ({ withdrawNewsletter: withdraw }));
import { POST as unsubscribe } from '../src/pages/api/newsletter/unsubscribe';
import { originGuard } from '../src/server/http';

it('allows only the configured canary origin for token actions', () => {
  const canonical = 'https://goodapollogoods.com';
  const canary = 'https://good-apollo-goods-shop.netlify.app';
  vi.stubEnv('APP_URL', canonical);
  const request = (origin: string, fetchSite = 'same-origin') => new Request(canonical + '/api/newsletter/confirm', {
    method: 'POST', headers: { origin, 'sec-fetch-site': fetchSite },
  });
  originGuard(request(canary), canary);
  expect(() => originGuard(request(canary))).toThrow();
  expect(() => originGuard(request('https://untrusted.example'), canary)).toThrow();
  expect(() => originGuard(request(canary, 'cross-site'), canary)).toThrow();
  vi.unstubAllEnvs();
});

afterEach(() => vi.clearAllMocks());

it('accepts only the RFC 8058 one-click body with its token-bound URL and no browser Origin', async () => {
  const token = 'P'.repeat(48);
  const response = await unsubscribe({
    request: new Request(`https://goodapollogoods.com/api/newsletter/unsubscribe?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
  } as any);
  expect(response.status).toBe(204);
  expect(withdraw).toHaveBeenCalledWith(token);
});

it('rejects malformed one-click bodies without contacting infra', async () => {
  const response = await unsubscribe({
    request: new Request('https://goodapollogoods.com/api/newsletter/unsubscribe?token=' + 'P'.repeat(48), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=Something-Else',
    }),
  } as any);
  expect(response.status).toBe(400);
  expect(withdraw).not.toHaveBeenCalled();
});

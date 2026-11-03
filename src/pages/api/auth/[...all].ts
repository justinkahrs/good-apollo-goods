import type { APIRoute } from 'astro';
import { auth, adminSession } from '../../../server/auth';
import { originGuard, failure, rawBody } from '../../../server/http';
import { DomainError } from '../../../server/domain';
import QRCode from 'qrcode';
export const prerender = false;
const handler: APIRoute = async ({ request }) => {
  try {
    const path = new URL(request.url).pathname
      .replace(/\/$/, '')
      .slice('/api/auth'.length);
    const allowed = [
      '/sign-in/magic-link',
      '/magic-link/verify',
      '/get-session',
      '/sign-out',
      '/two-factor/enable',
      '/two-factor/get-totp-uri',
    ];
    if (!allowed.includes(path))
      throw new DomainError('This authentication action is unavailable.', 404);
    if (request.method !== 'GET') originGuard(request);
    if (path.startsWith('/two-factor/')) {
      const s = await adminSession(request, false);
      if (s.user.twoFactorEnabled) await adminSession(request, true);
    }
    const normalized = new URL(request.url);
    normalized.pathname = normalized.pathname.replace(/\/$/, '');
    const forwarded = new Request(normalized, {
      method: request.method,
      headers: request.headers,
      ...(request.method === 'GET'
        ? {}
        : { body: await rawBody(request, 12000) }),
    });
    const response = await auth().handler(forwarded);
    if (path === '/two-factor/enable' && response.ok) {
      const enrollment = await response.json();
      if (
        enrollment.method !== 'totp' ||
        typeof enrollment.totpURI !== 'string'
      )
        throw new DomainError(
          'Authenticator setup is unavailable. Try again shortly.',
          503,
        );
      const manualSetupKey = new URL(enrollment.totpURI).searchParams
        .get('secret')
        ?.toUpperCase()
        .replace(/=+$/, '');
      if (!manualSetupKey || !/^[A-Z2-7]{16,}$/.test(manualSetupKey))
        throw new DomainError(
          'Authenticator setup is unavailable. Try again shortly.',
          503,
        );
      const qrDataURL = await QRCode.toDataURL(enrollment.totpURI, {
        width: 240,
        margin: 2,
      });
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.set('cache-control', 'private, no-store');
      return new Response(
        JSON.stringify({ ...enrollment, manualSetupKey, qrDataURL }),
        { status: response.status, headers },
      );
    }
    return response;
  } catch (e) {
    return failure(e);
  }
};
export const GET = handler;
export const POST = handler;

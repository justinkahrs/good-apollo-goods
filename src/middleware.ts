import { defineMiddleware } from 'astro:middleware';
import { adminSession, isLocalDevelopmentRequest } from './server/auth';
import { failure, privateHeaders } from './server/http';
import { DomainError } from './server/domain';
import { config, productionDeployment } from './server/config';
import {
  netlifyProxyTokenStatus,
  shouldVerifyNetlifyProxy,
} from './server/netlify-proxy';
export const onRequest = defineMiddleware(async (context, next) => {
  // Astro routes accept both spellings, so authorization must do the same.
  const p = context.url.pathname.replace(/\/+$/, '') || '/';
  const e = config();
  const localAdmin = isLocalDevelopmentRequest(context.request);
  if (
    shouldVerifyNetlifyProxy(
      context.url.hostname,
      e.GAG_NETLIFY_PROXY_HOST,
      productionDeployment(),
    )
  ) {
    const proxyStatus = netlifyProxyTokenStatus(
      context.request.headers.get('x-nf-sign'),
      e.GAG_NETLIFY_PROXY_SECRET,
      e.GAG_NETLIFY_SITE_ID,
    );
    if (proxyStatus !== 'valid') {
      if (process.env.GAG_PROXY_DIAGNOSTICS === 'true')
        console.warn(`Rejected Netlify proxy request: ${proxyStatus}`);
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }
  if (localAdmin && ['/admin/sign-in', '/admin/verify'].includes(p))
    return context.redirect('/admin/');
  if (
    (p === '/admin' || p.startsWith('/admin/')) &&
    !localAdmin &&
    !['/admin/sign-in', '/admin/verify'].includes(p)
  ) {
    try {
      await adminSession(context.request);
    } catch (e) {
      if (e instanceof DomainError)
        return context.redirect(
          e.code === 'signin' ? '/admin/sign-in/' : '/admin/verify/',
        );
      return new Response('Store administration is temporarily unavailable.', {
        status: 503,
        headers: privateHeaders,
      });
    }
  }
  if ((p === '/api/admin' || p.startsWith('/api/admin/')) && p !== '/api/admin/verify') {
    try {
      await adminSession(context.request);
    } catch (e) {
      return failure(e);
    }
  }
  const response = await next();
  if (
    p === '/admin' ||
    p.startsWith('/admin/') ||
    p.startsWith('/api/') ||
    p === '/cart' ||
    p === '/order'
  ) {
    for (const [k, v] of Object.entries(privateHeaders))
      response.headers.set(k, v);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
});

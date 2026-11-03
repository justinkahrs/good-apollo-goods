import type { APIRoute } from 'astro';
import { discoveryEnabled } from '../server/config';
export const prerender = false;
export const GET: APIRoute = () =>
  new Response(
    discoveryEnabled()
      ? 'User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /cart/\nDisallow: /order/\nDisallow: /design-system/\nSitemap: https://goodapollogoods.com/sitemap.xml\n'
      : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } },
  );

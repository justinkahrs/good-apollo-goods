import type { APIRoute } from 'astro';
import { discoveryEnabled } from '../server/config';
import { publicCatalog } from '../server/catalog';
export const prerender = false;
export const GET: APIRoute = async () => {
  if (!discoveryEnabled())
    return new Response('Discovery is disabled', { status: 404 });
  try {
    const pieces = await publicCatalog(),
      paths = [
        '/',
        '/shop/',
        '/shop/hats/',
        '/about/',
        '/contact/',
        '/sizing-care/',
        '/shipping/',
        '/returns/',
        '/faq/',
        ...pieces.map((p) => `/shop/hats/${p.slug}/`),
      ];
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>https://goodapollogoods.com${p}</loc></url>`).join('')}</urlset>`,
      {
        headers: {
          'Content-Type': 'application/xml',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
};

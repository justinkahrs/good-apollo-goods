import type { APIRoute } from 'astro';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { storage } from '../../../server/photos';
import { db } from '../../../server/db';
import { adminSession } from '../../../server/auth';
import { privateHeaders } from '../../../server/http';
export const prerender = false;
export const GET: APIRoute = async ({ request, params }) => {
  try {
    if (!['400', '800', '1200'].includes(params.width ?? ''))
      return new Response('Not found', { status: 404 });
    const image = await db().productImage.findUnique({
      where: { id: params.id },
      include: { product: true },
    });
    if (!image || !image.verified || image.placeholder)
      return new Response('Not found', { status: 404 });
    const published = image.product.status === 'published' && !image.archivedAt;
    if (!published) await adminSession(request);
    const key = (
      image.derivatives as Array<{ width: number; key: string }>
    ).find((d) => d.width === Number(params.width))?.key;
    if (!key) return new Response('Not found', { status: 404 });
    const { client, bucket } = storage(),
      object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
    if (!object.Body) return new Response('Unavailable', { status: 503 });
    return new Response(
      new Uint8Array(await object.Body.transformToByteArray()).buffer,
      {
        headers: {
          ...privateHeaders,
          'Content-Type': 'image/webp',
          'Cache-Control': published ? 'public,max-age=5' : 'private,no-store',
        },
      },
    );
  } catch {
    return new Response('Unavailable', {
      status: 404,
      headers: privateHeaders,
    });
  }
};

import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config, requiredSecret } from './config';
import { db, Prisma } from './db';
import { DomainError } from './domain';
export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export function json(value: unknown, status = 200, extra?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...privateHeaders,
      ...extra,
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof DomainError)
    return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        error: 'Review the highlighted fields and try again.',
        fields: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      400,
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
    return json(
      {
        error:
          'That web address, SKU or operation already exists. Refresh and review.',
        code: 'conflict',
      },
      409,
    );
  return json(
    {
      error:
        'This action could not be completed. Your changes are still here; retry shortly.',
      code: 'unavailable',
    },
    503,
  );
}
export function originGuard(request: Request, additionalOrigin?: string) {
  const origin = request.headers.get('origin');
  const allowed = [new URL(config().APP_URL).origin];
  if (additionalOrigin) allowed.push(new URL(additionalOrigin).origin);
  if (
    !origin || !allowed.includes(origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new DomainError(
      'Open this form from the Good Apollo website.',
      403,
      'origin',
    );
}
export async function rawBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length') ?? 0) > max)
    throw new DomainError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new DomainError('This request is too large.', 413);
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}
export async function body(request: Request, max = 100000) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new DomainError('Use a JSON request.');
  const raw = await rawBody(request, max);
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError('Invalid request.');
  }
}
export async function limit(
  request: Request,
  scope: string,
  max = 30,
  seconds = 60,
  identity?: string,
) {
  const raw =
    identity ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const key = createHash('sha256')
    .update(
      `${requiredSecret('QUOTE_SECRET')}:${scope}:${raw}:${Math.floor(Date.now() / (seconds * 1000))}`,
    )
    .digest('hex');
  const row = await db().requestLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date(Date.now() + seconds * 2000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max)
    throw new DomainError(
      'Too many requests. Please try again shortly.',
      429,
      'limited',
    );
}
export function secretEquals(value: string, expected: string) {
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { createHash } from 'node:crypto';
import { Prisma, type Tx } from './db';
import { DomainError } from './domain';

export async function lockProducts(tx: Tx, ids: string[]) {
  if (ids.length)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR UPDATE`,
    );
}
export async function mutation<T>(
  tx: Tx,
  actorId: string,
  key: string | undefined,
  payload: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!key) return run(); // Legacy server callers; interactive clients always supply a key.
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  const prior = await tx.adminMutation.findUnique({ where: { id: key } });
  if (prior) {
    if (prior.actorId !== actorId || prior.fingerprint !== fingerprint)
      throw new DomainError(
        'This request belongs to different entries. Review the pending action.',
        409,
        'operation',
      );
    return prior.result as T;
  }
  const result = await run();
  await tx.adminMutation.create({
    data: {
      id: key,
      actorId,
      fingerprint,
      result: JSON.parse(JSON.stringify(result)),
    },
  });
  return result;
}
export function effectiveAlt(
  image: { alt: string; altSource?: string; variantId?: string | null },
  product: { name: string; variants?: Array<{ id: string; label: string }> },
) {
  if (image.alt.trim() && image.altSource !== 'generated')
    return image.alt.trim();
  const variant = product.variants?.find((v) => v.id === image.variantId);
  return (
    `${product.name}${variant ? ` — ${variant.label}` : ''}`.trim() ||
    'Product photo'
  );
}
export function usableImage(image: {
  verified: boolean;
  placeholder: boolean;
  archivedAt: unknown;
  derivatives: unknown;
}) {
  return (
    !image.archivedAt &&
    image.verified &&
    !image.placeholder &&
    Array.isArray(image.derivatives) &&
    image.derivatives.length > 0
  );
}

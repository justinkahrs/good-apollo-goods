import { z } from 'zod';
import type { Tx } from './db';
import { DomainError } from './domain';
import { usableImage } from './catalog-state';

export const photoInput = z.object({
  id: z.uuid(),
  alt: z.string().trim().max(400),
  altSource: z.enum(['generated', 'custom']).optional(),
  variantId: z.uuid().nullable(),
  hidden: z.boolean().optional(),
});
export async function applyPhotos(
  tx: Tx,
  productId: string,
  images: z.infer<typeof photoInput>[],
  status: string,
) {
  const p = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: { images: true, variants: true },
  });
  if (
    new Set(images.map((i) => i.id)).size !== images.length ||
    images.some(
      (i) =>
        !p.images.some((x) => x.id === i.id) ||
        (i.variantId && !p.variants.some((v) => v.id === i.variantId)),
    )
  )
    throw new DomainError('Photo or variant belongs to another product.');
  if (p.images.some((i) => !i.archivedAt && !images.some((x) => x.id === i.id)))
    throw new DomainError('Reload the complete photo list before saving.');
  const next = images.map((i) => ({
    ...p.images.find((x) => x.id === i.id)!,
    ...i,
    archivedAt:
      i.hidden === undefined
        ? p.images.find((x) => x.id === i.id)!.archivedAt
        : i.hidden
          ? new Date()
          : null,
  }));
  const visible = next.filter((i) => !i.archivedAt);
  if (visible.length > 12)
    throw new DomainError('Use up to 12 visible photos per product.');
  if (
    status === 'published' &&
    (!visible.length || visible.some((i) => !usableImage(i)))
  )
    throw new DomainError(
      'A published product needs real visible photos. Replace this photo or change Visibility to Draft.',
    );
  for (const [position, image] of next.entries())
    await tx.productImage.update({
      where: { id: image.id },
      data: {
        position,
        alt: image.alt,
        altSource: image.alt.trim()
          ? (images.find((i) => i.id === image.id)?.altSource ?? 'custom')
          : 'generated',
        variantId: image.variantId,
        archivedAt: image.archivedAt,
      },
    });
}

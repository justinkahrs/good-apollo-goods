import { z } from 'zod';
import { atomic } from './db';
import { DomainError } from './domain';
import { lockProducts, mutation } from './catalog-state';
import { editorProduct } from './catalog';
import { detachMedia } from './media-cleanup';

export async function listingLifecycle(
  actorId: string,
  action: 'product.delete' | 'product.restore' | 'product.purge',
  input: unknown,
) {
  const v = z
    .object({
      id: z.uuid(),
      revision: z.number().int().positive(),
      operationKey: z.uuid(),
      confirmed: z.literal(true),
    })
    .parse(input);
  return atomic((tx) =>
    mutation(tx, actorId, v.operationKey, { action, ...v }, async () => {
      await lockProducts(tx, [v.id]);
      const p = await editorProduct(tx, v.id);
      if (p.revision !== v.revision)
        throw new DomainError(
          'Someone saved a newer version. Review the latest listing before deleting or restoring.',
          409,
          'revision',
          { current: p },
        );
      if (action === 'product.purge') {
        if (!p.deletedAt)
          throw new DomainError('Move this listing to Trash first.');
        const ids = p.variants.map((v) => v.id);
        const history =
          (await tx.stockMovement.count({
            where: { variantId: { in: ids } },
          })) +
          (await tx.orderItem.count({ where: { variantId: { in: ids } } })) +
          (await tx.reservation.count({ where: { variantId: { in: ids } } }));
        const uploads = await tx.uploadIntent.count({
          where: {
            productId: p.id,
            completedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (
          p.publishedAt ||
          history ||
          uploads ||
          p.variants.some(
            (v) =>
              (v.stock?.unsoldQty ?? 0) !== 0 || (v.stock?.heldQty ?? 0) !== 0,
          )
        )
          throw new DomainError(
            'This listing has publication, stock, order, reservation, or upload history. It stays safely in Trash.',
          );
        for (const image of p.images) await detachMedia(tx, image);
        await tx.productImage.deleteMany({ where: { productId: p.id } });
        await tx.uploadIntent.deleteMany({ where: { productId: p.id } });
        await tx.stockBalance.deleteMany({ where: { variantId: { in: ids } } });
        await tx.variant.deleteMany({ where: { productId: p.id } });
        await tx.product.delete({ where: { id: p.id } });
        await tx.audit.create({
          data: {
            actorId,
            action,
            entityId: p.id,
            metadata: { name: p.name, slug: p.slug },
          },
        });
        return { id: p.id, purged: true };
      }
      if (action === 'product.restore' && !p.deletedAt)
        throw new DomainError('This listing is not in Trash.');
      await tx.product.update({
        where: { id: p.id },
        data: {
          deletedAt: action === 'product.delete' ? new Date() : null,
          ...(action === 'product.restore' ? { status: 'draft' } : {}),
          revision: { increment: 1 },
        },
      });
      await tx.audit.create({ data: { actorId, action, entityId: p.id } });
      return editorProduct(tx, p.id);
    }),
  );
}

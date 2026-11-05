import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomic, db } from './db';
import { cents, DomainError } from './domain';
import { config } from './config';
import {
  effectiveAlt,
  usableImage,
  lockProducts,
  mutation,
} from './catalog-state';
import { movement } from './stock';
import { photoInput, applyPhotos } from './gallery';
export const productInput = z.object({
  operationKey: z.uuid().optional(),
  images: z.array(photoInput).max(200).optional(),
  id: z.uuid().optional(),
  revision: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(150),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  description: z.string().trim().max(8000),
  category: z.enum(['hat', 'accessory', 'other']),
  audience: z.enum(['adult', 'child', 'all']),
  taxClass: z.enum(['hats', 'clothing', 'children', 'general']).default('hats'),
  materials: z.string().max(2000),
  care: z.string().max(4000),
  detail: z.string().max(4000),
  status: z.enum(['draft', 'published', 'archived']),
  variants: z
    .array(
      z.object({
        id: z.uuid().optional(),
        initialQuantity: z.number().int().min(0).max(100000).default(0),
        sku: z.string().trim().max(80),
        label: z.string().trim().min(1).max(200),
        options: z
          .record(
            z.string().trim().min(1).max(50),
            z.string().trim().min(1).max(80),
          )
          .refine(
            (o) => Object.keys(o).length <= 2,
            'Use at most two options.',
          ),
        price: z.string(),
        active: z.boolean(),
        lowStockThreshold: z.number().int().min(0).max(1000),
      }),
    )
    .min(1)
    .max(100),
});
export const productImageSelect = {
  id: true,
  productId: true,
  originalKey: true,
  derivatives: true,
  alt: true,
  altSource: true,
  assetId: true,
  position: true,
  variantId: true,
  verified: true,
  placeholder: true,
  archivedAt: true,
  createdAt: true,
} as const;
export const productInclude = {
  variants: {
    include: { stock: true },
    orderBy: { createdAt: 'asc' as const },
  },
  images: {
    where: { archivedAt: null },
    select: productImageSelect,
    orderBy: { position: 'asc' as const },
  },
};
const combination = (options: Record<string, string>) =>
  Object.keys(options).length
    ? JSON.stringify(
        Object.entries(options).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      )
    : 'default';
export async function saveProduct(actorId: string, input: unknown) {
  const v = productInput.parse(input);
  const priceErrors: Array<{ path: string; message: string }> = [];
  const rows = v.variants.map((r, index) => {
    let priceCents = 0;
    try {
      priceCents = cents(r.price);
    } catch (error) {
      priceErrors.push({
        path: `variants.${index}.price`,
        message: (error as Error).message,
      });
    }
    return {
      ...r,
      priceCents,
      combination: combination(r.options),
      sku: r.sku,
    };
  });
  if (priceErrors.length && v.status !== 'published')
    throw new DomainError(
      priceErrors.map((f) => f.message).join(' '),
      400,
      'invalid',
      { fields: priceErrors },
    );
  if (
    new Set(rows.map((r) => r.combination)).size !== rows.length ||
    new Set(rows.filter((r) => r.sku).map((r) => r.sku)).size !==
      rows.filter((r) => r.sku).length
  )
    throw new DomainError(
      'Each variant needs a unique option combination and SKU.',
    );
  return atomic(async (tx) =>
    mutation(
      tx,
      actorId,
      v.operationKey,
      { action: 'product.save', ...v },
      async () => {
        if (v.id) await lockProducts(tx, [v.id]);
        const old = v.id
          ? await tx.product.findUniqueOrThrow({
              where: { id: v.id },
              include: productInclude,
            })
          : null;
        if (old?.deletedAt)
          throw new DomainError(
            'This listing is in Trash. Restore it before editing.',
            409,
            'deleted',
          );
        if (old && old.revision !== v.revision)
          throw new DomainError(
            'Someone saved a newer version. Your changes are still here; reload the latest version before saving.',
            409,
            'revision',
            { current: old },
          );
        const slugOwner = await tx.product.findUnique({
          where: { slug: v.slug },
          select: { id: true },
        });
        if (slugOwner && slugOwner.id !== old?.id)
          throw new DomainError(
            'That web address is already in use. Choose another.',
          );
        if (rows.some((r) => r.id && !old?.variants.some((o) => o.id === r.id)))
          throw new DomainError('A variant belongs to another product.');
        // Reintroducing an option combination keeps its stock/history. Generated
        // SKUs avoid inactive variants instead of colliding with the first saved row.
        const used = new Set(old?.variants.map((r) => r.sku) ?? []);
        for (const row of rows) {
          const existing = old?.variants.find((r) =>
            row.id
              ? r.id === row.id
              : combination(r.options as Record<string, string>) ===
                row.combination,
          );
          row.id ??= existing?.id;
          if (!row.sku && existing) row.sku = existing.sku;
          if (!row.sku) {
            let number = 1;
            while (used.has(`${v.slug.toUpperCase().slice(0, 65)}-${number}`))
              number++;
            row.sku = `${v.slug.toUpperCase().slice(0, 65)}-${number}`;
          }
          used.add(row.sku);
        }
        if (old && v.images) await applyPhotos(tx, old.id, v.images, 'draft');
        const images = old
          ? await tx.productImage.findMany({
              where: { productId: old.id },
              orderBy: { position: 'asc' },
            })
          : [];
        if (v.status === 'published') {
          const fields: Array<{ path: string; message: string }> = [
            ...priceErrors,
          ];
          if (v.description.length < 10)
            fields.push({
              path: 'description',
              message: 'Add a description of at least 10 characters.',
            });
          if (!rows.some((r) => r.active && r.priceCents > 0))
            fields.push({
              path: 'variants',
              message: 'Add an active variant with a positive price.',
            });
          const visible = images.filter((i) => !i.archivedAt);
          if (!visible.length || visible.some((i) => !usableImage(i)))
            fields.push({
              path: 'photos',
              message:
                'Upload a real cover photo and hide placeholders before publishing.',
            });
          if (fields.length)
            throw new DomainError(
              fields.map((f) => f.message).join(' '),
              400,
              'publication',
              { fields },
            );
        }
        const data = {
          name: v.name,
          slug: v.slug,
          description: v.description,
          category: v.category,
          taxClass: v.taxClass,
          audience: v.audience,
          materials: v.materials,
          care: v.care,
          detail: v.detail,
          status: v.status,
        };
        const product = old
          ? await tx.product.update({
              where: { id: old.id },
              data: {
                ...data,
                revision: { increment: 1 },
                publishedAt:
                  old.publishedAt ||
                  (v.status === 'published' ? new Date() : null),
              },
            })
          : await tx.product.create({ data });
        const keep = rows.flatMap((r) => (r.id ? [r.id] : []));
        await tx.variant.updateMany({
          where: { productId: product.id, id: { notIn: keep } },
          data: { active: false, revision: { increment: 1 } },
        });
        for (const r of rows) {
          const data = {
            sku: r.sku,
            label: r.label,
            options: r.options,
            combination: r.combination,
            priceCents: r.priceCents,
            active: r.active,
            lowStockThreshold: r.lowStockThreshold,
          };
          if (r.id)
            await tx.variant.update({
              where: { id: r.id },
              data: { ...data, revision: { increment: 1 } },
            });
          else {
            const created = await tx.variant.create({
              data: { ...data, productId: product.id, stock: { create: {} } },
            });
            if (r.initialQuantity)
              await movement(tx, {
                variantId: created.id,
                unsoldDelta: r.initialQuantity,
                heldDelta: 0,
                actorId,
                reason: 'Initial stock',
                operationKey: `initial:${created.id}`,
              });
          }
        }
        await tx.audit.create({
          data: {
            actorId,
            action: old ? 'product.save' : 'product.create',
            entityId: product.id,
            metadata: {
              revision: product.revision,
              status: v.status,
              variantCount: rows.length,
            },
          },
        });
        return editorProduct(tx, product.id);
      },
    ),
  );
}
export async function duplicateProduct(
  actorId: string,
  id: string,
  operationKey?: string,
) {
  return atomic(async (tx) =>
    mutation(
      tx,
      actorId,
      operationKey,
      { action: 'product.duplicate', id },
      async () => {
        await lockProducts(tx, [id]);
        const old = await tx.product.findUniqueOrThrow({
          where: { id },
          include: productInclude,
        });
        if (old.deletedAt)
          throw new DomainError('Restore this listing before duplicating it.');
        for (const image of old.images) {
          if (image.assetId) {
            await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE id=${image.assetId} FOR UPDATE`;
            const asset = await tx.mediaAsset.findUniqueOrThrow({
              where: { id: image.assetId },
            });
            if (asset.state !== 'active')
              throw new DomainError(
                'Photo cleanup is in progress. Retry shortly.',
                409,
              );
          }
        }
        const suffix = randomUUID().slice(0, 8);
        const variantIds = new Map(
          old.variants.map((v) => [v.id, randomUUID()]),
        );
        const copy = await tx.product.create({
          data: {
            slug: `${old.slug}-copy-${suffix}`,
            name: `${old.name} (copy)`,
            description: old.description,
            category: old.category,
            taxClass: old.taxClass,
            audience: old.audience,
            materials: old.materials,
            care: old.care,
            detail: old.detail,
            variants: {
              create: old.variants.map((r) => ({
                id: variantIds.get(r.id),
                sku: `${r.sku}-${suffix}`,
                label: r.label,
                options: r.options!,
                combination: r.combination,
                priceCents: r.priceCents,
                active: r.active,
                lowStockThreshold: r.lowStockThreshold,
                stock: { create: {} },
              })),
            },
            images: {
              create: old.images.map((i) => ({
                originalKey: i.originalKey,
                derivatives: i.derivatives!,
                alt: i.alt,
                altSource: i.altSource,
                assetId: i.assetId,
                variantId: i.variantId ? variantIds.get(i.variantId) : null,
                position: i.position,
                verified: i.verified,
                placeholder: i.placeholder,
              })),
            },
          },
        });
        await tx.audit.create({
          data: {
            actorId,
            action: 'product.duplicate',
            entityId: copy.id,
            metadata: { source: id },
          },
        });
        return copy;
      },
    ),
  );
}
export async function publicCatalog() {
  const mediaOrigin = config().LOCAL_CATALOG_MEDIA_ORIGIN ?? '';
  const products = await db().product.findMany({
    where: { status: 'published', deletedAt: null },
    include: productInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    detail: p.detail,
    materials: p.materials,
    care: p.care,
    category: p.category,
    audience: p.audience,
    images: p.images.filter(usableImage).map((i) => ({
      id: i.id,
      alt: effectiveAlt(i, p),
      variantId: i.variantId,
      url: `${mediaOrigin}/media/${i.id}/1200/`,
      srcset: [400, 800, 1200]
        .map((w) => `${mediaOrigin}/media/${i.id}/${w}/ ${w}w`)
        .join(', '),
    })),
    variants: p.variants
      .filter((v) => v.active)
      .map((v) => ({
        id: v.id,
        label: v.label,
        options: v.options,
        priceCents: v.priceCents,
        revision: v.revision,
        available: Math.max(
          0,
          (v.stock?.unsoldQty ?? 0) - (v.stock?.heldQty ?? 0),
        ),
      })),
  }));
}
export type PublicProduct = Awaited<ReturnType<typeof publicCatalog>>[number];

export async function editorProduct(
  tx: Pick<ReturnType<typeof db>, 'product'>,
  id: string,
) {
  return tx.product.findUniqueOrThrow({
    where: { id },
    include: {
      variants: productInclude.variants,
      images: { select: productImageSelect, orderBy: { position: 'asc' } },
    },
  });
}

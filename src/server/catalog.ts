import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomic, db } from './db';
import { cents, DomainError } from './domain';
import { config } from './config';
export const productInput = z.object({
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
  const rows = v.variants.map((r) => ({
    ...r,
    priceCents: cents(r.price),
    combination: combination(r.options),
    sku: r.sku,
  }));
  if (
    new Set(rows.map((r) => r.combination)).size !== rows.length ||
    new Set(rows.filter((r) => r.sku).map((r) => r.sku)).size !==
      rows.filter((r) => r.sku).length
  )
    throw new DomainError(
      'Each variant needs a unique option combination and SKU.',
    );
  return atomic(async (tx) => {
    const old = v.id
      ? await tx.product.findUniqueOrThrow({
          where: { id: v.id },
          include: productInclude,
        })
      : null;
    if (old && old.revision !== v.revision)
      throw new DomainError(
        'Someone saved a newer version. Your changes are still here; reload the latest version before saving.',
        409,
        'revision',
      );
    if (old?.publishedAt && v.slug !== old.slug)
      throw new DomainError(
        'A published product keeps its original web address.',
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
    if (v.status === 'published') {
      if (
        v.description.length < 10 ||
        !rows.some((r) => r.active && r.priceCents > 0)
      )
        throw new DomainError(
          'Add a description and an active variant with a positive price before publishing.',
        );
      const cover = old?.images[0];
      if (
        !cover?.verified ||
        cover.placeholder ||
        !cover.alt.trim() ||
        !Array.isArray(cover.derivatives) ||
        !cover.derivatives.length
      )
        throw new DomainError(
          'Upload a real cover photo and describe it before publishing.',
        );
      if (
        old!.images.some((i) => !i.verified || i.placeholder || !i.alt.trim())
      )
        throw new DomainError(
          'Every visible photo needs a verified image and alt text. Archive placeholders first.',
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
              old.publishedAt || (v.status === 'published' ? new Date() : null),
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
      else
        await tx.variant.create({
          data: { ...data, productId: product.id, stock: { create: {} } },
        });
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
    return product;
  });
}
export async function duplicateProduct(actorId: string, id: string) {
  return atomic(async (tx) => {
    const old = await tx.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    });
    const suffix = randomUUID().slice(0, 8);
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
  });
}
export async function publicCatalog() {
  const mediaOrigin = config().LOCAL_CATALOG_MEDIA_ORIGIN ?? '';
  const products = await db().product.findMany({
    where: { status: 'published' },
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
    images: p.images
      .filter((i) => i.verified && !i.placeholder)
      .map((i) => ({
        id: i.id,
        alt: i.alt,
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

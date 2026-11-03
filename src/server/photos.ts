import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from './config';
import { atomic, db } from './db';
import { DomainError } from './domain';
export const MAX_UPLOAD = 10 * 1024 * 1024;
function publicPhoto<T extends { storageBytes: bigint }>(image: T) {
  const { storageBytes: _storageBytes, ...photo } = image;
  return photo;
}
export function storage() {
  const e = config();
  if (!e.S3_BUCKET)
    throw new DomainError('Photo storage is not configured.', 503);
  const clientOptions = {
    region: e.AWS_REGION,
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
  };
  return {
    client: new S3Client(clientOptions),
    bucket: e.S3_BUCKET,
  };
}
export async function uploadIntent(actorId: string, input: unknown) {
  const v = z
    .object({
      productId: z.uuid(),
      type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      bytes: z.number().int().positive().max(MAX_UPLOAD),
    })
    .parse(input);
  await db().product.findUniqueOrThrow({ where: { id: v.productId } });
  const id = randomUUID(),
    key = `originals/${v.productId}/${id}`;
  const intent = await db().uploadIntent.create({
    data: {
      id,
      productId: v.productId,
      actorId,
      key,
      contentType: v.type,
      expectedBytes: v.bytes,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  return { id: intent.id, url: `/api/admin/photo-upload/${intent.id}` };
}
export async function storePhotoUpload(
  actorId: string,
  id: string,
  contentType: string,
  bytes: Uint8Array,
) {
  const intent = await db().uploadIntent.findUniqueOrThrow({ where: { id } });
  if (intent.actorId !== actorId)
    throw new DomainError('This upload belongs to another operator.', 403);
  if (intent.imageId || intent.completedAt)
    throw new DomainError('This upload has already been completed.', 409);
  if (intent.expiresAt.getTime() < Date.now())
    throw new DomainError('Upload expired. Please retry the photo.');
  if (
    contentType !== intent.contentType ||
    bytes.length !== intent.expectedBytes ||
    bytes.length > MAX_UPLOAD
  )
    throw new DomainError('The uploaded file size or type does not match.');
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: intent.key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: 'private,no-store',
    }),
  );
  return { ok: true };
}
export async function normalizePhoto(bytes: Uint8Array, expectedType?: string) {
  if (bytes.length > MAX_UPLOAD)
    throw new DomainError('Photo must be 10 MB or smaller.');
  const image = sharp(bytes, {
    limitInputPixels: 36_000_000,
    failOn: 'error',
    animated: false,
  });
  const meta = await image.metadata();
  if (
    expectedType &&
    `image/${meta.format === 'jpeg' ? 'jpeg' : meta.format}` !== expectedType
  )
    throw new DomainError(
      'The file content does not match its image type. Export it again as JPEG, PNG or WebP.',
    );
  if (
    !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) > 1
  )
    throw new DomainError(
      'Export this photo as a single JPEG, PNG or WebP image. HEIC is not supported.',
    );
  return Promise.all(
    [400, 800, 1200].map(async (width) => ({
      width,
      body: await image
        .clone()
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
    })),
  );
}
export async function finalizePhoto(actorId: string, id: string) {
  const intent = await db().uploadIntent.findUniqueOrThrow({ where: { id } });
  if (intent.actorId !== actorId)
    throw new DomainError('This upload belongs to another operator.', 403);
  if (intent.imageId)
    return db().productImage.findUniqueOrThrow({
      where: { id: intent.imageId },
    });
  if (intent.expiresAt.getTime() < Date.now())
    throw new DomainError('Upload expired. Please retry the photo.');
  const { client, bucket } = storage();
  const file = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: intent.key }),
  );
  if (
    file.ContentLength !== intent.expectedBytes ||
    file.ContentLength > MAX_UPLOAD ||
    !file.Body
  ) {
    if (file.Body && 'destroy' in file.Body) file.Body.destroy();
    throw new DomainError('The uploaded file size does not match.');
  }
  const bytes = await file.Body.transformToByteArray();
  const derivatives = await normalizePhoto(bytes, intent.contentType);
  const imageId = randomUUID();
  const keys: Array<{ width: number; key: string }> = [];
  for (const d of derivatives) {
    const key = `photos/${intent.productId}/${imageId}/${d.width}.webp`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: d.body,
        ContentType: 'image/webp',
        CacheControl: 'private,max-age=31536000,immutable',
      }),
    );
    keys.push({ width: d.width, key });
  }
  const storageBytes = BigInt(
    bytes.length + derivatives.reduce((n, d) => n + d.body.length, 0),
  );
  try {
    return await atomic(async (tx) => {
      const fresh = await tx.uploadIntent.findUniqueOrThrow({ where: { id } });
      if (fresh.imageId)
        return publicPhoto(
          await tx.productImage.findUniqueOrThrow({
            where: { id: fresh.imageId },
          }),
        );
      const p = await tx.product.findUniqueOrThrow({
        where: { id: intent.productId },
      });
      const count = await tx.productImage.count({
        where: { productId: p.id, archivedAt: null },
      });
      if ((await tx.productImage.count({ where: { productId: p.id } })) >= 200)
        throw new DomainError(
          'Photo history is full. Contact the developer to review retained media.',
        );
      if (count >= 12)
        throw new DomainError('Use up to 12 photos per product.');
      const used = await tx.productImage.aggregate({
        _sum: { storageBytes: true },
      });
      const totalBytes = (used._sum.storageBytes ?? 0n) + storageBytes;
      if (totalBytes > BigInt(config().MEDIA_BUDGET_BYTES))
        throw new DomainError(
          'Media storage budget reached. Remove retained photos or increase the configured budget.',
          413,
          'media_budget_exceeded',
        );
      const image = await tx.productImage.create({
        data: {
          id: imageId,
          productId: p.id,
          originalKey: intent.key,
          derivatives: keys,
          storageBytes,
          position: count,
          verified: true,
          archivedAt: p.status === 'published' ? new Date() : null,
        },
      });
      await tx.uploadIntent.update({
        where: { id },
        data: { imageId, completedAt: new Date() },
      });
      await tx.product.update({
        where: { id: p.id },
        data: { revision: { increment: 1 } },
      });
      await tx.audit.create({
        data: {
          actorId,
          action: 'photo.add',
          entityId: p.id,
          metadata: { imageId },
        },
      });
      return publicPhoto(image);
    });
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === 'media_budget_exceeded'
    ) {
      await Promise.all([
        client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: intent.key }),
        ),
        ...keys.map(({ key }) =>
          client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
        ),
      ]);
    }
    throw error;
  }
}
export async function savePhotos(actorId: string, input: unknown) {
  const v = z
    .object({
      productId: z.uuid(),
      revision: z.number().int(),
      images: z
        .array(
          z.object({
            id: z.uuid(),
            alt: z.string().trim().max(400),
            variantId: z.uuid().nullable(),
            archived: z.boolean(),
          }),
        )
        .max(200),
    })
    .parse(input);
  return atomic(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({
      where: { id: v.productId },
      include: { images: true, variants: true },
    });
    if (p.revision !== v.revision)
      throw new DomainError(
        'The product changed. Reload before changing photos.',
        409,
        'revision',
      );
    if (
      new Set(v.images.map((i) => i.id)).size !== v.images.length ||
      v.images.some(
        (i) =>
          !p.images.some((x) => x.id === i.id) ||
          (i.variantId && !p.variants.some((x) => x.id === i.variantId)),
      )
    )
      throw new DomainError('Photo or variant belongs to another product.');
    const visible = v.images.filter((i) => !i.archived);
    if (
      p.images.some(
        (i) => !i.archivedAt && !v.images.some((x) => x.id === i.id),
      )
    )
      throw new DomainError('Reload the complete photo list before saving.');
    if (visible.length > 12)
      throw new DomainError('Use up to 12 visible photos per product.');
    if (
      p.status === 'published' &&
      (!visible.length ||
        visible.some((i) => {
          const image = p.images.find((x) => x.id === i.id)!;
          return (
            !i.alt ||
            image.placeholder ||
            !image.verified ||
            !Array.isArray(image.derivatives) ||
            !image.derivatives.length
          );
        }))
    )
      throw new DomainError('Published products need real, described photos.');
    for (const [position, image] of v.images.entries())
      await tx.productImage.update({
        where: { id: image.id },
        data: {
          alt: image.alt,
          variantId: image.variantId,
          position,
          archivedAt: image.archived ? new Date() : null,
        },
      });
    await tx.product.update({
      where: { id: p.id },
      data: { revision: { increment: 1 } },
    });
    await tx.audit.create({
      data: {
        actorId,
        action: 'photo.save',
        entityId: p.id,
        metadata: { count: visible.length },
      },
    });
  });
}

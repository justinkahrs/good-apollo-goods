import { randomUUID } from 'node:crypto';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from './config';
import { atomic, db, Prisma } from './db';
import { lockProducts, mutation, usableImage } from './catalog-state';
import { applyPhotos, photoInput } from './gallery';
import { editorProduct } from './catalog';
import { detachMedia } from './media-cleanup';
import { DomainError } from './domain';
export const MAX_UPLOAD = 10 * 1024 * 1024;
let cachedStorageClient: { signature: string; client: S3Client } | undefined;
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
  const signature = JSON.stringify(clientOptions);
  if (!cachedStorageClient || cachedStorageClient.signature !== signature) {
    cachedStorageClient = {
      signature,
      client: new S3Client(clientOptions),
    };
  }
  return {
    client: cachedStorageClient.client,
    bucket: e.S3_BUCKET,
  };
}
export async function uploadIntent(actorId: string, input: unknown) {
  const v = z
    .object({
      operationKey: z.uuid().optional(),
      productId: z.uuid(),
      type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      bytes: z.number().int().positive().max(MAX_UPLOAD),
    })
    .parse(input);
  const intent = await atomic((tx) =>
    mutation(
      tx,
      actorId,
      v.operationKey,
      { action: 'photo.intent', ...v },
      async () => {
        await lockProducts(tx, [v.productId]);
        const product = await tx.product.findUniqueOrThrow({
          where: { id: v.productId },
        });
        if (product.deletedAt)
          throw new DomainError('This listing is in Trash.', 409, 'deleted');
        const id = randomUUID();
        const key = `originals/${v.productId}/${id}`;
        await tx.mediaAsset.create({
          data: {
            id,
            identity: key,
            keys: [
              key,
              ...[400, 800, 1200].map(
                (w) => `photos/${v.productId}/${id}/${w}.webp`,
              ),
            ],
            storageBytes: BigInt(v.bytes),
            state: 'uploading',
            cleanup: { create: {} },
          },
        });
        return tx.uploadIntent.create({
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
      },
    ),
  );
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
  if (new Date(intent.expiresAt).getTime() < Date.now())
    throw new DomainError(
      'Upload expired. Please retry the photo.',
      400,
      'upload_expired',
    );
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
    return publicPhoto(
      await db().productImage.findUniqueOrThrow({
        where: { id: intent.imageId },
      }),
    );
  if (new Date(intent.expiresAt).getTime() < Date.now())
    throw new DomainError(
      'Upload expired. Please retry the photo.',
      400,
      'upload_expired',
    );
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
  const imageId = intent.id;
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
      await lockProducts(tx, [intent.productId]);
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
      if (p.deletedAt)
        throw new DomainError('This listing is in Trash.', 409, 'deleted');
      const count = await tx.productImage.count({
        where: { productId: p.id, archivedAt: null },
      });
      if ((await tx.productImage.count({ where: { productId: p.id } })) >= 200)
        throw new DomainError(
          'Photo history is full. Contact the developer to review retained media.',
        );
      if (count >= 12)
        throw new DomainError('Use up to 12 photos per product.');
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(67424035)::text`,
      );
      const used = await tx.mediaAsset.aggregate({
        where: { id: { not: intent.id } },
        _sum: { storageBytes: true },
      });
      const totalBytes = (used._sum.storageBytes ?? 0n) + storageBytes;
      if (totalBytes > BigInt(config().MEDIA_BUDGET_BYTES))
        throw new DomainError(
          'Media storage budget reached. Remove retained photos or increase the configured budget.',
          413,
          'media_budget_exceeded',
        );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "MediaAsset" WHERE id=${intent.id} FOR UPDATE`,
      );
      const asset = await tx.mediaAsset.findUniqueOrThrow({
        where: { id: intent.id },
      });
      if (asset.state === 'deleting')
        throw new DomainError(
          'Upload expired during processing. Choose this file again.',
        );
      await tx.mediaAsset.update({
        where: { id: intent.id },
        data: { state: 'active', storageBytes },
      });
      await tx.mediaCleanup.deleteMany({ where: { assetId: intent.id } });
      const image = await tx.productImage.create({
        data: {
          id: imageId,
          product: { connect: { id: p.id } },
          originalKey: intent.key,
          derivatives: keys,
          storageBytes,
          position:
            (
              await tx.productImage.aggregate({
                where: { productId: p.id },
                _max: { position: true },
              })
            )._max.position === null
              ? 0
              : (
                  await tx.productImage.aggregate({
                    where: { productId: p.id },
                    _max: { position: true },
                  })
                )._max.position! + 1,
          verified: true,
          archivedAt: null,
          altSource: 'generated',
          asset: { connect: { id: intent.id } },
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
    // The original and deterministic derivative keys remain tracked even when
    // processing fails. Cleanup waits for intent expiry, allowing a safe retry.
    await db().mediaCleanup.upsert({
      where: { assetId: intent.id },
      create: { assetId: intent.id },
      update: {},
    });
    throw error;
  }
}
export async function savePhotos(actorId: string, input: unknown) {
  const v = z
    .object({
      productId: z.uuid(),
      revision: z.number().int(),
      operationKey: z.uuid().optional(),
      images: z.array(photoInput).max(200),
    })
    .parse(input);
  return atomic((tx) =>
    mutation(
      tx,
      actorId,
      v.operationKey,
      { action: 'photo.save', ...v },
      async () => {
        await lockProducts(tx, [v.productId]);
        const p = await editorProduct(tx, v.productId);
        if (p.deletedAt)
          throw new DomainError('This listing is in Trash.', 409, 'deleted');
        if (p.revision !== v.revision)
          throw new DomainError(
            'Someone saved a newer version. Review the current photos.',
            409,
            'revision',
            { current: p },
          );
        await applyPhotos(tx, p.id, v.images, p.status);
        await tx.product.update({
          where: { id: p.id },
          data: { revision: { increment: 1 } },
        });
        await tx.audit.create({
          data: { actorId, action: 'photo.save', entityId: p.id },
        });
        return editorProduct(tx, p.id);
      },
    ),
  );
}
export async function deletePhoto(actorId: string, input: unknown) {
  const v = z
    .object({
      productId: z.uuid(),
      imageId: z.uuid(),
      revision: z.number().int(),
      operationKey: z.uuid().optional(),
    })
    .parse(input);
  return atomic((tx) =>
    mutation(
      tx,
      actorId,
      v.operationKey,
      { action: 'photo.delete', ...v },
      async () => {
        await lockProducts(tx, [v.productId]);
        const p = await editorProduct(tx, v.productId);
        if (p.deletedAt)
          throw new DomainError('This listing is in Trash.', 409, 'deleted');
        if (p.revision !== v.revision)
          throw new DomainError(
            'Someone saved a newer version. Review the current photos.',
            409,
            'revision',
            { current: p },
          );
        const image = p.images.find((i) => i.id === v.imageId);
        if (!image) throw new DomainError('That photo no longer exists.', 404);
        if (
          p.status === 'published' &&
          !p.images.some((i) => i.id !== image.id && usableImage(i))
        )
          throw new DomainError(
            'A published product needs at least one visible photo. Add another photo or change Visibility to Draft.',
          );
        await detachMedia(tx, image);
        await tx.productImage.delete({ where: { id: image.id } });
        await tx.product.update({
          where: { id: p.id },
          data: { revision: { increment: 1 } },
        });
        await tx.audit.create({
          data: {
            actorId,
            action: 'photo.delete',
            entityId: p.id,
            metadata: { imageId: image.id },
          },
        });
        return editorProduct(tx, p.id);
      },
    ),
  );
}

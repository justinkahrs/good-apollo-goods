import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { atomic, db, Prisma, type Tx } from './db';
import { storage } from './photos';

export async function detachMedia(
  tx: Tx,
  image: { id: string; assetId: string | null },
) {
  if (image.assetId)
    await tx.mediaCleanup.upsert({
      where: { assetId: image.assetId },
      create: { assetId: image.assetId },
      update: {},
    });
}
// The catalog commits reference removal first. Object deletion is leased,
// retryable, and never runs inside a catalog transaction.
export async function cleanupMedia(deadline = Date.now() + 10000) {
  const jobs = await db().mediaCleanup.findMany({
    where: { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    take: 10,
    orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
  });
  let cleaned = 0,
    failed = 0;
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    const asset = await atomic(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "MediaAsset" WHERE id=${job.assetId} FOR UPDATE`,
      );
      if (await tx.productImage.count({ where: { assetId: job.assetId } })) {
        await tx.mediaCleanup.deleteMany({ where: { assetId: job.assetId } });
        return null;
      }
      const current = await tx.mediaAsset.findUniqueOrThrow({
        where: { id: job.assetId },
      });
      if (current.state === 'uploading') {
        const intent = await tx.uploadIntent.findUnique({
          where: { id: current.id },
        });
        if (intent && intent.expiresAt.getTime() > Date.now()) {
          await tx.mediaCleanup.updateMany({
            where: { assetId: current.id },
            data: { leaseUntil: intent.expiresAt },
          });
          return null;
        }
      }
      const claim = await tx.mediaCleanup.updateMany({
        where: {
          assetId: job.assetId,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: {
          leaseUntil: new Date(Date.now() + 60000),
          attempts: { increment: 1 },
        },
      });
      if (!claim.count) return null;
      return tx.mediaAsset.update({
        where: { id: job.assetId },
        data: { state: 'deleting' },
      });
    });
    if (!asset) continue;
    try {
      const { client, bucket } = storage();
      for (const key of asset.keys as string[])
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
      await atomic(async (tx) => {
        await tx.mediaCleanup.delete({ where: { assetId: asset.id } });
        await tx.mediaAsset.delete({ where: { id: asset.id } });
      });
      cleaned++;
    } catch {
      failed++;
      await db().mediaCleanup.updateMany({
        where: { assetId: asset.id },
        data: { leaseUntil: null, lastError: 'storage_cleanup_retry' },
      });
    }
  }
  return { cleaned, failed };
}

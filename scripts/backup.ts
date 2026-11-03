import 'dotenv/config';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../src/server/db';
import { storage } from '../src/server/photos';
export function pgEnv(connection: string) {
  const u = new URL(connection);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGDATABASE: u.pathname.slice(1),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE: u.searchParams.get('sslmode') ?? 'prefer',
  };
}
export async function backup() {
  const rawKey = process.env.BACKUP_KEY;
  if (!rawKey || !/^[a-f0-9]{64}$/i.test(rawKey))
    throw new Error(
      'BACKUP_KEY must be an independent 32-byte hex encryption key.',
    );
  const stage = await mkdtemp(join(tmpdir(), 'gag-backup-'));
  await mkdir(join(stage, 'media'), { mode: 0o700 });
  try {
    const keys = await db().$transaction(
      async (tx) => {
        const [snapshot] = await tx.$queryRaw<
          Array<{ snapshot: string }>
        >`SELECT pg_export_snapshot() AS snapshot`;
        const images = await tx.productImage.findMany(),
          items = await tx.orderItem.findMany({ select: { imageKey: true } });
        const refs = [
          ...new Set(
            [
              ...images.flatMap((i) => [
                i.originalKey,
                ...(i.derivatives as Array<{ key: string }>).map((d) => d.key),
              ]),
              ...items.map((i) => i.imageKey),
            ].filter((k): k is string => Boolean(k)),
          ),
        ];
        execFileSync(
          process.env.PG_DUMP_BIN ?? 'pg_dump',
          [
            '--format=custom',
            '--no-owner',
            '--no-acl',
            `--snapshot=${snapshot.snapshot}`,
            `--file=${join(stage, 'database.dump')}`,
          ],
          {
            env: pgEnv(
              process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
            ),
            stdio: ['ignore', 'ignore', 'pipe'],
          },
        );
        return refs;
      },
      { isolationLevel: 'RepeatableRead', timeout: 600000 },
    );
    const { client, bucket } = storage(),
      media: Array<{ key: string; file: string; sha256: string }> = [];
    for (const key of keys) {
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!object.Body) throw new Error('Referenced media is unavailable');
      const bytes = await object.Body.transformToByteArray(),
        file = createHash('sha256').update(key).digest('hex');
      await writeFile(join(stage, 'media', file), bytes, { mode: 0o600 });
      media.push({
        key,
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const manifest = { version: 1, createdAt: new Date().toISOString(), media };
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest), {
      mode: 0o600,
    });
    const archive = execFileSync('tar', ['-czf', '-', '-C', stage, '.'], {
        maxBuffer: 512 * 1024 * 1024,
      }),
      nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(rawKey, 'hex'), nonce),
      encrypted = Buffer.concat([cipher.update(archive), cipher.final()]);
    const destination = resolve(process.env.BACKUP_DIR ?? '.local/backups');
    await mkdir(destination, { recursive: true, mode: 0o700 });
    const path = join(destination, `good-apollo-${Date.now()}.gagbackup`);
    await writeFile(
      path,
      Buffer.concat([
        Buffer.from('GAGBACK1'),
        nonce,
        cipher.getAuthTag(),
        encrypted,
      ]),
      { mode: 0o600 },
    );
    return { path, mediaCount: media.length, createdAt: manifest.createdAt };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await backup();
    console.log(JSON.stringify(result));
  } catch {
    console.error(
      'Backup failed. Inspect configuration and referenced-media availability without printing credentials.',
    );
    process.exitCode = 1;
  } finally {
    await db().$disconnect();
  }
}

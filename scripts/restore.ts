import 'dotenv/config';
import { createDecipheriv, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { storage } from '../src/server/photos';
import { pgEnv } from './backup';
const file = process.argv[2],
  target = process.env.RESTORE_DATABASE_URL,
  key = process.env.BACKUP_KEY;
if (!file || !target || !key || !/^[a-f0-9]{64}$/i.test(key))
  throw new Error(
    'Provide a backup file, RESTORE_DATABASE_URL and BACKUP_KEY.',
  );
const url = new URL(target);
if (
  !url.pathname.endsWith('_restore') ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  process.env.S3_ENDPOINT !== 'http://localhost:19000' ||
  !process.env.RESTORE_S3_BUCKET ||
  process.env.RESTORE_S3_BUCKET === process.env.S3_BUCKET
)
  throw new Error(
    'This restore drill requires an isolated local _restore database and a different local media bucket.',
  );
const pool = new Pool({ connectionString: target }),
  stage = await mkdtemp(join(tmpdir(), 'gag-restore-'));
try {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'",
  );
  if (rows[0].n) throw new Error('Restore target must be empty.');
  const input = await readFile(file);
  if (input.subarray(0, 8).toString() !== 'GAGBACK1')
    throw new Error('Unknown backup format');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    input.subarray(8, 20),
  );
  decipher.setAuthTag(input.subarray(20, 36));
  const archive = Buffer.concat([
    decipher.update(input.subarray(36)),
    decipher.final(),
  ]);
  const entries = execFileSync('tar', ['-tzf', '-'], {
    input: archive,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  if (entries.some((p) => p.startsWith('/') || p.split('/').includes('..')))
    throw new Error('Unsafe archive path');
  execFileSync('tar', ['-xzf', '-', '-C', stage], { input: archive });
  const manifest = JSON.parse(
    await readFile(join(stage, 'manifest.json'), 'utf8'),
  ) as {
    version: number;
    media: Array<{ key: string; file: string; sha256: string }>;
  };
  if (manifest.version !== 1) throw new Error('Unknown manifest');
  const { client } = storage();
  for (const image of manifest.media) {
    if (!/^[a-f0-9]{64}$/.test(image.file))
      throw new Error('Invalid media filename');
    const bytes = await readFile(join(stage, 'media', image.file));
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256)
      throw new Error('Media integrity check failed');
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.RESTORE_S3_BUCKET!,
        Key: image.key,
        Body: bytes,
        ContentType: image.key.endsWith('.webp')
          ? 'image/webp'
          : 'application/octet-stream',
      }),
    );
  }
  execFileSync(
    process.env.PG_RESTORE_BIN ?? 'pg_restore',
    [
      '--exit-on-error',
      '--no-owner',
      '--no-acl',
      '--dbname',
      url.pathname.slice(1),
      join(stage, 'database.dump'),
    ],
    { env: pgEnv(target), stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const result = await pool.query(
    'SELECT (SELECT COUNT(*)::int FROM "Product") products,(SELECT COUNT(*)::int FROM "Order") orders,(SELECT COUNT(*)::int FROM "StockMovement") movements',
  );
  console.log(
    JSON.stringify({
      restored: true,
      ...result.rows[0],
      mediaCount: manifest.media.length,
    }),
  );
} catch {
  console.error(
    'Restore drill failed; source data was not changed. Investigate the isolated target.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
  await rm(stage, { recursive: true, force: true });
}

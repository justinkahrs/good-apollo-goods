import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import assert from 'node:assert/strict';
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error('TEST_DATABASE_URL is required');
const url = new URL(value);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  !url.pathname.endsWith('_test')
)
  throw new Error(
    'Migration drill requires an isolated localhost _test database.',
  );
const client = new Client({ connectionString: value });
await client.connect();
try {
  await client.query('BEGIN');
  // All relations are connection-local temporary fixtures. Public tables cannot
  // resolve through this search path and no development/customer data is used.
  await client.query('SET LOCAL search_path=pg_temp');
  await client.query(
    `CREATE TEMP TABLE "Product"(id TEXT PRIMARY KEY); CREATE TEMP TABLE "ProductImage"(id TEXT PRIMARY KEY,"originalKey" TEXT, derivatives JSONB NOT NULL, "storageBytes" BIGINT NOT NULL, alt TEXT NOT NULL,"archivedAt" TIMESTAMP(3),"productId" TEXT,position INTEGER DEFAULT 0);`,
  );
  await client.query(
    `INSERT INTO "Product" VALUES ('synthetic'); INSERT INTO "ProductImage"(id,"originalKey",derivatives,"storageBytes",alt,"archivedAt") VALUES ('a','shared-original','[{"key":"shared-400.webp","width":400}]',500,'Custom legacy description',NULL),('b','shared-original','[{"key":"shared-400.webp","width":400}]',0,'','2026-10-01');`,
  );
  const sql = await readFile(
    new URL(
      '../prisma/migrations/20261105021500_inventory_workflow/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await client.query(sql);
  const images = (
    await client.query('SELECT * FROM "ProductImage" ORDER BY id')
  ).rows;
  const assets = (await client.query('SELECT * FROM "MediaAsset"')).rows;
  assert.equal(images.length, 2);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].storageBytes, '500');
  assert.equal(images[0].assetId, images[1].assetId);
  assert.equal(images[0].altSource, 'custom');
  assert.equal(images[1].altSource, 'generated');
  assert.equal(images[0].archivedAt, null);
  assert.ok(images[1].archivedAt);
  assert.equal(
    (await client.query('SELECT "deletedAt" FROM "Product"')).rows[0].deletedAt,
    null,
  );
  assert.deepEqual(assets[0].keys, ['shared-original', 'shared-400.webp']);
  console.log(
    'Inventory migration drill passed: references, visibility, alt sources and unique bytes preserved in temporary fixtures.',
  );
} finally {
  await client.query('ROLLBACK');
  await client.end();
}

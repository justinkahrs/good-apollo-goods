import 'dotenv/config';
import { Pool } from 'pg';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import {
  CreateBucketCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { db, atomic } from '../src/server/db';
import { saveProduct } from '../src/server/catalog';
import {
  uploadIntent,
  storePhotoUpload,
  finalizePhoto,
  savePhotos,
  storage,
} from '../src/server/photos';
import { adjustStock, movement, lockStock } from '../src/server/stock';
import { backup } from './backup';
const started = Date.now(),
  source = new URL(process.env.TEST_DATABASE_URL ?? ''),
  suffix = randomBytes(4).toString('hex');
if (
  !source.pathname.endsWith('_test') ||
  !['localhost', '127.0.0.1'].includes(source.hostname) ||
  process.env.S3_ENDPOINT !== 'http://localhost:19000'
)
  throw new Error('Restore drills require isolated local test services.');
const adminUrl =
  process.env.DRILL_ADMIN_DATABASE_URL ??
  `postgresql://${process.env.USER}@localhost/postgres`;
if (!['localhost', '127.0.0.1'].includes(new URL(adminUrl).hostname))
  throw new Error('Restore drill administration must be local.');
const admin = new Pool({ connectionString: adminUrl });
const sourceName = `good_apollo_drill_${suffix}_test`,
  targetName = `good_apollo_drill_${suffix}_restore`;
const role = decodeURIComponent(source.username);
if (!/^[a-zA-Z0-9_]+$/.test(role))
  throw new Error('Unsupported local role name');
await admin.query(`CREATE DATABASE "${sourceName}" OWNER "${role}"`);
await admin.query(`CREATE DATABASE "${targetName}" OWNER "${role}"`);
source.pathname = '/' + sourceName;
const target = new URL(source);
target.pathname = '/' + targetName;
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL = source.href;
process.env.BACKUP_KEY = randomBytes(32).toString('hex');
process.env.PG_DUMP_BIN ??=
  process.platform === 'darwin' ? '/opt/homebrew/bin/pg_dump' : 'pg_dump';
process.env.PG_RESTORE_BIN ??=
  process.platform === 'darwin' ? '/opt/homebrew/bin/pg_restore' : 'pg_restore';
const sourceBucket = `gag-drill-${suffix}`,
  restoreBucket = `${sourceBucket}-restore`;
const { client } = storage();
await client.send(new CreateBucketCommand({ Bucket: sourceBucket }));
await client.send(new CreateBucketCommand({ Bucket: restoreBucket }));
process.env.S3_BUCKET = sourceBucket;
execFileSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env: process.env, stdio: 'ignore' },
);
let server: ReturnType<typeof spawn> | undefined;
try {
  const actor = randomUUID(),
    product = await saveProduct(actor, {
      name: 'Restore fixture hat',
      slug: 'restore-fixture-hat',
      description: 'Historical restore fixture; synthetic data only.',
      category: 'hat',
      audience: 'adult',
      materials: 'Cotton',
      care: 'Air dry',
      detail: '',
      status: 'draft',
      variants: [
        {
          label: 'Small',
          sku: 'RESTORE-SMALL',
          options: { Size: 'Small' },
          price: '58.01',
          active: true,
          lowStockThreshold: 3,
        },
      ],
    });
  const bytes = await sharp({
    create: { width: 600, height: 800, channels: 3, background: '#70866B' },
  })
    .jpeg()
    .toBuffer();
  const intent = await uploadIntent(actor, {
    productId: product.id,
    type: 'image/jpeg',
    bytes: bytes.length,
  });
  await storePhotoUpload(actor, intent.id, 'image/jpeg', bytes);
  const image = await finalizePhoto(actor, intent.id);
  await savePhotos(actor, {
    productId: product.id,
    revision: 2,
    images: [
      {
        id: image.id,
        alt: 'Green sample restore photo',
        variantId: null,
        archived: false,
      },
    ],
  });
  await db().product.update({
    where: { id: product.id },
    data: { status: 'published', publishedAt: new Date() },
  });
  const variant = await db().variant.findFirstOrThrow({
    where: { productId: product.id },
  });
  await adjustStock(actor, {
    variantId: variant.id,
    revision: 1,
    mode: 'add',
    quantity: 5,
    reason: 'Restore fixture batch',
    operationKey: randomUUID(),
  });
  const imageKey = (image.derivatives as Array<{ key: string }>).at(-1)!.key;
  await atomic(async (tx) => {
    const order = await tx.order.create({
      data: {
        guestHash: 'fixture-owner',
        statusTokenHash: randomUUID(),
        subtotalCents: 11602,
        shippingCents: 695,
        totalCents: 12297,
        paymentStatus: 'paid',
        paidAt: new Date(),
        email: 'fixture@example.invalid',
        customerName: 'Synthetic restore buyer',
        settingsSnapshot: {
          shippingCents: 695,
          processingWindow: '3–5 business days',
          taxEnabled: false,
        },
        items: {
          create: {
            variantId: variant.id,
            productName: product.name,
            variantLabel: variant.label,
            sku: variant.sku,
            slug: product.slug,
            imageKey,
            quantity: 2,
            unitPriceCents: 5801,
            lineTotalCents: 11602,
          },
        },
      },
    });
    await lockStock(tx, [variant.id]);
    await movement(tx, {
      variantId: variant.id,
      unsoldDelta: -2,
      heldDelta: 0,
      reason: 'Restore fixture sale',
      operationKey: randomUUID(),
      orderId: order.id,
    });
    await tx.reservation.create({
      data: {
        orderId: order.id,
        variantId: variant.id,
        quantity: 2,
        state: 'consumed',
      },
    });
  });
  const archive = await backup();
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/restore.ts', archive.path],
      {
        env: {
          ...process.env,
          RESTORE_DATABASE_URL: target.href,
          RESTORE_S3_BUCKET: restoreBucket,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
  );
  const restored = new Pool({ connectionString: target.href });
  const { rows } = await restored.query(
    'SELECT (SELECT SUM("unsoldDelta") FROM "StockMovement")::int ledger,(SELECT "unsoldQty" FROM "StockBalance" LIMIT 1)::int balance,(SELECT "totalCents" FROM "Order" LIMIT 1)::int total,(SELECT "productName" FROM "OrderItem" LIMIT 1) name',
  );
  await restored.end();
  if (
    rows[0].ledger !== 3 ||
    rows[0].balance !== 3 ||
    rows[0].total !== 12297 ||
    rows[0].name !== 'Restore fixture hat'
  )
    throw new Error('Restored business invariants differ');
  const media = await client.send(
    new GetObjectCommand({ Bucket: restoreBucket, Key: imageKey }),
  );
  if (
    (await sharp(await media.Body!.transformToByteArray()).metadata())
      .format !== 'webp'
  )
    throw new Error('Restored media failed decoding');
  server = spawn(process.execPath, ['dist/server/entry.mjs'], {
    env: {
      ...process.env,
      DATABASE_URL: target.href,
      DIRECT_DATABASE_URL: target.href,
      S3_BUCKET: restoreBucket,
      APP_URL: 'http://localhost:4373',
      PORT: '4373',
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      SALES_ENABLED: 'false',
      ASTRO_NODE_AUTOSTART: 'enabled',
    },
    stdio: 'ignore',
  });
  let gallery = false;
  for (let i = 0; i < 40; i++) {
    try {
      const page = await fetch(
        'http://localhost:4373/pieces/restore-fixture-hat/',
      );
      const photo = await fetch(`http://localhost:4373/media/${image.id}/800/`);
      gallery =
        page.ok &&
        (await page.text()).includes('Green sample restore photo') &&
        photo.ok &&
        photo.headers.get('content-type') === 'image/webp';
      if (gallery) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!gallery) throw new Error('Restored gallery route did not render');
  const evidence = {
    timestamp: new Date().toISOString(),
    durationSeconds: Math.ceil((Date.now() - started) / 1000),
    encryptedArchive: true,
    mediaIntegrity: true,
    galleryRoute: true,
    ledgerMatches: true,
    historicalOrder: true,
    products: result.products,
    orders: result.orders,
    movements: result.movements,
    mediaCount: result.mediaCount,
    environment:
      'isolated local PostgreSQL/S3; synthetic fixture; not production backup scheduling',
  };
  await mkdir('output/validation', { recursive: true });
  await writeFile(
    'output/validation/restore-drill.json',
    JSON.stringify(evidence, null, 2),
  );
  await mkdir('.local', { recursive: true });
  await writeFile(
    '.local/restore-drill.env',
    Object.entries({
      DATABASE_URL: target.href,
      S3_BUCKET: restoreBucket,
      BACKUP_KEY: process.env.BACKUP_KEY,
    })
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} catch {
  console.error(
    'Restore drill failed. Inspect only the isolated fixture resources; credentials were not printed.',
  );
  process.exitCode = 1;
} finally {
  server?.kill('SIGTERM');
  await db().$disconnect();
  await admin.end();
}

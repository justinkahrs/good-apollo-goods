import { test, expect } from '@playwright/test';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { db, atomic } from '../../src/server/db';
import { movement, lockStock, adjustStock } from '../../src/server/stock';
import { config, requiredSecret } from '../../src/server/config';
const imagePath = 'output/playwright/browser-fixture.jpg';
let sessionCookie = '';
async function saveAndReload(
  page: import('@playwright/test').Page,
  name: string,
) {
  const loaded = page.waitForEvent('load', { timeout: 10000 }).catch(() => {
    throw new Error('A successful save did not reload the form');
  });
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/admin/action/' &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name, exact: true }).click();
  const result = await response;
  if (!result.ok()) {
    await loaded.catch(() => {});
    throw new Error('Save failed: ' + (await result.text()));
  }
  await loaded;
}
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !url.pathname.endsWith('_test') ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Unsafe browser fixture database');
  await db().$executeRawUnsafe(
    'TRUNCATE TABLE "Product", "User", "Order", "StockMovement", "EmailOutbox", "Audit", "StripeEvent", "StoreSettings", "MaintenanceJob", "RequestLimit" RESTART IDENTITY CASCADE',
  );
  await db().storeSettings.create({ data: {} });
  const user = await db().user.create({
    data: {
      email: config().ADMIN_EMAIL,
      name: 'Browser fixture operator',
      role: 'admin',
      emailVerified: true,
      twoFactorEnabled: true,
    },
  });
  const token = randomUUID(),
    session = await db().session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  await db().adminStepUp.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  sessionCookie = encodeURIComponent(
    token +
      '.' +
      createHmac('sha256', requiredSecret('BETTER_AUTH_SECRET'))
        .update(token)
        .digest('base64'),
  );
  await mkdir('output/playwright', { recursive: true });
  await sharp({
    create: { width: 640, height: 800, channels: 3, background: '#70866B' },
  })
    .jpeg()
    .toFile(imagePath);
});
test.afterAll(async () => db().$disconnect());
test('authenticator setup button displays its QR image and recovery instructions', async ({
  page,
  context,
}) => {
  const operator = await db().user.findUniqueOrThrow({
    where: { email: config().ADMIN_EMAIL },
  });
  await db().user.update({
    where: { id: operator.id },
    data: { twoFactorEnabled: false },
  });
  try {
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionCookie,
        url: config().APP_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/admin/verify/');
    await page
      .getByRole('button', { name: 'Set up authenticator', exact: true })
      .click();
    await expect(page.locator('[data-enroll-status]')).toContainText(
      'Save your recovery codes',
    );
    await expect(
      page.getByRole('button', {
        name: 'Authenticator setup ready',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole('img', {
        name: 'Scan this code in your authenticator app',
      }),
    ).toBeVisible();
    const imageLoaded = await page
      .locator('[data-qr]')
      .evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth === 240,
      );
    expect(imageLoaded).toBe(true);
    expect(
      await page
        .locator('[data-uri]')
        .evaluate((node: HTMLTextAreaElement) =>
          node.value.startsWith('otpauth://totp/'),
        ),
    ).toBe(true);
    expect(
      await page
        .locator('[data-codes]')
        .evaluate((node) => node.textContent!.trim().split('\n').length > 1),
    ).toBe(true);
    await page.screenshot({
      path: 'output/playwright/authenticator-setup-ready.png',
      mask: [page.locator('[data-enrollment]')],
    });
  } finally {
    await db().user.update({
      where: { id: operator.id },
      data: { twoFactorEnabled: true },
    });
  }
});
test('denies protected pages, exports and cross-site mutations; prelaunch stays unindexed', async ({
  page,
  request,
}) => {
  for (const path of ['/admin', '/admin/', '/admin/orders', '/admin/orders/']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/admin/sign-in/');
    expect(await response.text()).not.toContain('Your small batch');
  }
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/sign-in\//);
  const denied = await request.get('/api/admin/export/?kind=orders');
  expect(denied.status()).toBe(401);
  expect(denied.headers()['cache-control']).toContain('no-store');
  expect(
    (
      await request.post('/api/checkout/', {
        data: { token: 'forged' },
        headers: { origin: 'https://other.invalid' },
      })
    ).status(),
  ).toBe(403);
  await expect((await request.get('/robots.txt')).text()).resolves.toContain(
    'Disallow: /',
  );
  expect((await request.get('/sitemap.xml')).status()).toBe(404);
  const health = await request.get('/api/health/');
  expect(Object.keys(await health.json()).sort()).toEqual([
    'checkout',
    'status',
  ]);
  expect((await request.get('/api/monitor/')).status()).toBe(401);
  await page.goto('/cart/');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
});
test('creates an optionless piece with one price, recovers edits and preserves its stock identity', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionCookie,
      url: config().APP_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 1280, height: 1080 });
  await page.goto('/admin/products/new/');
  await expect(page.getByLabel('Price', { exact: true })).toBeVisible();
  await expect(page.locator('[data-variant-settings]')).not.toHaveAttribute(
    'open',
  );
  await expect(page.locator('[data-product-settings]')).not.toHaveAttribute(
    'open',
  );
  await expect(
    page.getByLabel('SKU (optional)', { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: 'output/playwright/product-editor-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'output/playwright/product-editor-mobile.png',
    fullPage: true,
  });
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Watermelon studio fixture');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A synthetic large hat with a green exterior and a red interior.');
  await page
    .getByRole('textbox', { name: 'Size & details', exact: true })
    .fill('Large · 32 cm diameter (synthetic measurement).');
  await page.getByLabel('Price', { exact: true }).fill('58.01');
  await saveAndReload(page, 'Save product');
  const product = await db().product.findUniqueOrThrow({
    where: { slug: 'watermelon-studio-fixture' },
    include: { variants: { include: { stock: true } } },
  });
  expect(product.variants).toHaveLength(1);
  const variant = product.variants[0];
  expect(variant.options).toEqual({});
  expect(variant.priceCents).toBe(5801);
  expect(variant.sku).not.toBe('');
  expect(variant.stock!.unsoldQty).toBe(0);
  const operator = await db().user.findUniqueOrThrow({
    where: { email: config().ADMIN_EMAIL },
  });
  await adjustStock(operator.id, {
    variantId: variant.id,
    revision: 1,
    mode: 'add',
    quantity: 4,
    reason: 'Synthetic single-piece batch',
    operationKey: randomUUID(),
  });
  await page.reload();
  await expect(page.locator('.editor-stock strong')).toHaveText('4');
  await page.getByLabel('Price', { exact: true }).fill('59.251');
  await page.reload();
  await page
    .getByRole('button', { name: 'Restore unsaved entries', exact: true })
    .click();
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('59.251');
  const invalidSave = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/admin/action/' &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  expect((await invalidSave).ok()).toBe(false);
  await expect(page.locator('[data-product-status]')).not.toBeEmpty();
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('59.251');
  expect(
    (await db().variant.findUniqueOrThrow({ where: { id: variant.id } }))
      .priceCents,
  ).toBe(5801);
  await page.getByLabel('Price', { exact: true }).fill('59.25');
  // Optional settings remain available by keyboard without manufacturing options.
  await page.locator('[data-variant-settings] > summary').focus();
  await page.keyboard.press('Enter');
  await page
    .getByText('Option details & stock alerts', { exact: true })
    .click();
  await page
    .getByLabel('SKU (optional)', { exact: true })
    .fill('WATERMELON-FIXTURE');
  await page.getByLabel('Low-stock alert at', { exact: true }).fill('2');
  await saveAndReload(page, 'Save product');
  const edited = await db().variant.findUniqueOrThrow({
    where: { id: variant.id },
    include: { stock: true },
  });
  expect(edited.priceCents).toBe(5925);
  expect(edited.options).toEqual({});
  expect(edited.sku).toBe('WATERMELON-FIXTURE');
  expect(edited.lowStockThreshold).toBe(2);
  expect(edited.stock!.unsoldQty).toBe(4);
  expect(await db().variant.count({ where: { productId: product.id } })).toBe(
    1,
  );
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(imagePath);
  await expect(
    page.getByLabel('Describe the photo (alt text)', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Show for variant', { exact: true }),
  ).not.toBeVisible();
  await page
    .getByLabel('Describe the photo (alt text)', { exact: true })
    .fill('Synthetic green hat photo');
  await saveAndReload(page, 'Save photos & order');
  await page
    .getByLabel('Visibility', { exact: true })
    .selectOption('published');
  await saveAndReload(page, 'Save product');
  await page.goto('/shop/hats/watermelon-studio-fixture/');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(
    page.locator('[data-add-to-cart] input[name=variant]'),
  ).toHaveValue(variant.id);
  await expect(
    page.getByText('Large · 32 cm diameter (synthetic measurement).', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/shop/');
  await expect(
    page.getByRole('link', { name: /Watermelon studio fixture/ }),
  ).toContainText('4 available');
});
test('creates variants/photos, recovers edits, detects stale saves, publishes sold-out and changes stock on mobile', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(60000);
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionCookie,
      url: config().APP_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Browser workflow hat');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A synthetic browser fixture with a clearly described gallery.');
  await page.locator('textarea[name=detail]').fill('60 cm');
  await page.locator('[data-variant-settings] > summary').click();
  await page.getByText('Generate sizes and colors', { exact: true }).click();
  await page
    .getByLabel('First option name', { exact: true })
    .first()
    .fill('Size');
  await page
    .getByLabel('Values, separated by commas', { exact: true })
    .nth(0)
    .fill('Small, Large');
  await page
    .getByLabel('Second option name (optional)', { exact: true })
    .fill('Color');
  await page
    .getByLabel('Values, separated by commas', { exact: true })
    .nth(1)
    .fill('Moss, Oat');
  await page
    .getByLabel('Default price in dollars', { exact: true })
    .fill('58.01');
  await page
    .getByRole('button', { name: 'Generate variants', exact: true })
    .click();
  await expect(
    page.getByLabel('Price in dollars', { exact: true }),
  ).toHaveCount(4);
  await saveAndReload(page, 'Save product');
  await expect(page).toHaveURL(/\/admin\/products\/(?!new)[^/]+\//);
  const productUrl = page.url();
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Recovered unsaved description from the browser fixture.');
  await page.reload();
  await page
    .getByRole('button', { name: 'Restore unsaved entries', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue('Recovered unsaved description from the browser fixture.');
  await saveAndReload(page, 'Save product');
  await page
    .getByLabel('Add photos', { exact: true })
    .setInputFiles([imagePath, imagePath]);
  await expect(
    page.getByLabel('Describe the photo (alt text)', { exact: true }),
  ).toHaveCount(2);
  const draftPhoto = await db().productImage.findFirstOrThrow({
    where: { product: { slug: 'browser-workflow-hat' } },
  });
  expect((await request.get(`/media/${draftPhoto.id}/400/`)).status()).toBe(
    404,
  );
  expect(
    (await request.get(`/media/${draftPhoto.id}/original/`)).status(),
  ).toBe(404);
  await page
    .getByLabel('Describe the photo (alt text)', { exact: true })
    .nth(0)
    .fill('First green test image');
  await page
    .getByLabel('Describe the photo (alt text)', { exact: true })
    .nth(1)
    .fill('Second green test image');
  await page.getByLabel('Add photos', { exact: true }).setInputFiles({
    name: 'unsupported.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('unsupported fixture'),
  });
  await expect(page.locator('[data-upload-status]')).toContainText(
    'Export HEIC',
  );
  await expect(
    page.getByLabel('Describe the photo (alt text)', { exact: true }).nth(0),
  ).toHaveValue('First green test image');
  await page
    .getByRole('button', { name: 'Make cover', exact: true })
    .nth(1)
    .click();
  await saveAndReload(page, 'Save photos & order');
  await page
    .getByRole('combobox', { name: 'Visibility', exact: true })
    .selectOption('published');
  await saveAndReload(page, 'Save product');
  const other = await context.newPage();
  await other.goto(productUrl);
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Browser workflow hat edited');
  await saveAndReload(page, 'Save product');
  await other
    .getByLabel('Product name', { exact: true })
    .fill('Stale name must not overwrite');
  await other
    .getByRole('button', { name: 'Save product', exact: true })
    .click();
  await expect(other.getByRole('status').first()).toContainText(
    'newer version',
  );
  await expect(other.getByLabel('Product name', { exact: true })).toHaveValue(
    'Stale name must not overwrite',
  );
  await other.close();
  await page.goto('/shop/hats/browser-workflow-hat/');
  await expect(page.locator('#product-title')).toHaveText(
    'Browser workflow hat edited',
  );
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.locator('.product-facts')).toContainText('60 cm');
  await expect(page.locator('.product-copy > .product-detail')).toHaveCount(0);
  await expect(page.getByRole('radio').first()).toBeDisabled();
  await expect(
    page.getByRole('img', { name: 'Second green test image' }),
  ).toBeVisible();
  await expect(page.locator('[data-gallery-slide]:visible')).toHaveCount(1);
  await expect(page.locator('[data-gallery-thumb]')).toHaveCount(0);
  await expect(page.locator('[data-gallery-dot]')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Next photo', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-gallery-dot]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-gallery-status]')).toHaveText(
    'Photo 1 of 2',
  );
  await page.getByRole('button', { name: 'Show photo 2', exact: true }).click();
  await expect(page.locator('[data-gallery-status]')).toHaveText(
    'Photo 2 of 2',
  );
  await expect(page.locator('[data-gallery-slide]:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show photo 1', exact: true }).click();
  await expect(page.locator('[data-gallery-status]')).toHaveText(
    'Photo 1 of 2',
  );
  await page.screenshot({
    path: 'output/playwright/hat-carousel-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('[data-gallery-slide]:visible')).toHaveCount(1);
  await page.screenshot({
    path: 'output/playwright/hat-carousel-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await request.get('/shop/art/')).url()).toContain('/shop/hats/');
  await expect(
    page.getByRole('link', { name: 'Wearables', exact: true }),
  ).toHaveCount(0);
  expect((await request.get(`/media/${draftPhoto.id}/800/`)).status()).toBe(
    200,
  );
  await page.goto('/admin/inventory/?q=Browser');
  await page
    .getByText('Record a stock change', { exact: true })
    .first()
    .click();
  await page.getByLabel('Number of pieces', { exact: true }).first().fill('4');
  await page
    .getByLabel('Reason', { exact: true })
    .first()
    .fill('Synthetic browser batch');
  await expect(page.locator('[data-preview]').first()).toContainText(
    '4 available',
  );
  const reload = page.waitForEvent('load');
  await page
    .getByRole('button', { name: 'Record stock change', exact: true })
    .first()
    .click();
  await reload;
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'output/playwright/browser-inventory-mobile.png',
  });
  await page.goto('/shop/hats/browser-workflow-hat/');
  await expect(
    page.getByRole('radio', { name: /Small \/ Moss/ }),
  ).toBeEnabled();
  await page.goto(productUrl);
  await page
    .getByRole('combobox', { name: 'Visibility', exact: true })
    .selectOption('archived');
  await saveAndReload(page, 'Save product');
  expect((await page.goto('/shop/hats/browser-workflow-hat/'))?.status()).toBe(
    404,
  );
  await page.goto('/admin/settings/');
  await expect(page.getByLabel('Flat U.S. shipping in dollars')).toHaveValue(
    '6.95',
  );
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'BODY',
  );
});
test('shows immutable paid packing details, ships once and exports safe financial rows', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionCookie,
      url: config().APP_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const product = await db().product.create({
    data: {
      name: 'Packing fixture hat',
      slug: 'browser-packing-fixture',
      description: 'Synthetic packing fixture',
      variants: {
        create: {
          sku: 'PACK-FIXTURE',
          label: 'One size',
          options: {},
          combination: 'default',
          priceCents: 5801,
          stock: { create: {} },
        },
      },
    },
  });
  const variant = await db().variant.findFirstOrThrow({
      where: { productId: product.id },
      include: { product: true },
    }),
    operator = await db().user.findUniqueOrThrow({
      where: { email: config().ADMIN_EMAIL },
    });
  await adjustStock(operator.id, {
    variantId: variant.id,
    revision: 1,
    mode: 'add',
    quantity: 4,
    reason: 'Synthetic packing batch',
    operationKey: randomUUID(),
  });
  const order = await atomic(async (tx) => {
    const order = await tx.order.create({
      data: {
        guestHash: 'browser-fixture',
        statusTokenHash: randomUUID(),
        subtotalCents: 11602,
        shippingCents: 695,
        totalCents: 12297,
        paymentStatus: 'paid',
        paidAt: new Date(),
        email: 'browser@example.invalid',
        customerName: 'Synthetic fixture buyer',
        address: {
          line1: '1 Fixture Street',
          city: 'Grand Rapids',
          state: 'MI',
          postal_code: '49503',
          country: 'US',
        },
        settingsSnapshot: { processingWindow: '3–5 business days' },
        items: {
          create: {
            variantId: variant.id,
            productName: '=Formula-like historical name',
            variantLabel: variant.label,
            sku: variant.sku,
            slug: variant.product.slug,
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
      operationKey: randomUUID(),
      reason: 'Browser synthetic sale',
      orderId: order.id,
    });
    await tx.reservation.create({
      data: {
        variantId: variant.id,
        orderId: order.id,
        quantity: 2,
        state: 'consumed',
      },
    });
    return order;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/orders/${order.id}/`);
  await expect(
    page.getByRole('heading', { name: 'Purchased pieces' }),
  ).toBeVisible();
  await expect(
    page.getByText('1 Fixture Street', { exact: false }),
  ).toBeVisible();
  const slip = await context.newPage();
  await slip.goto(`/admin/orders/${order.id}/packing-slip/`);
  await expect(
    slip.getByText('=Formula-like historical name', { exact: false }),
  ).toBeVisible();
  await expect(
    slip.getByText('1 Fixture Street', { exact: false }),
  ).toBeVisible();
  await slip.close();
  await page
    .getByLabel('Tracking number', { exact: true })
    .fill('9400111899223857000000');
  await page
    .getByRole('button', { name: 'Mark complete order shipped', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Shipment', exact: true }),
  ).toBeVisible();
  expect(await db().shipment.count({ where: { orderId: order.id } })).toBe(1);
  expect(
    await db().emailOutbox.count({
      where: { dedupeKey: `shipment:${order.id}` },
    }),
  ).toBe(1);
  const exported = await context.request.get('/api/admin/export/?kind=orders');
  expect(exported.ok()).toBe(true);
  expect(exported.headers()['cache-control']).toContain('no-store');
  const csv = await exported.text();
  expect(csv).toContain("'=");
  expect(csv).toContain('"122.97"');
  await page.screenshot({
    path: 'output/playwright/browser-order-desktop.png',
  });
});
test('filters studio lists and saves settings while preserving order snapshots on desktop and mobile', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionCookie,
      url: config().APP_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const original = await db().storeSettings.findUniqueOrThrow({
    where: { id: 'store' },
  });
  const order = await db().order.findFirstOrThrow();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/admin/');
  await page.getByLabel('Find a product', { exact: true }).fill('Watermelon');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.locator('.studio-record')).toHaveCount(1);
  await expect(page.locator('.studio-record')).toContainText('4 available');
  await expect(page.locator('.studio-record')).not.toContainText('1 variants');
  await page.screenshot({
    path: 'output/playwright/studio-products-desktop.png',
    fullPage: true,
  });
  await page.goto('/admin/inventory/?q=Watermelon');
  await expect(page.locator('.studio-balances .available dd')).toHaveText('4');
  await expect(page.locator('.studio-disclosure').first()).not.toHaveAttribute(
    'open',
  );
  await page.getByLabel('Show', { exact: true }).selectOption('sold-out');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No stock in this view.' }),
  ).toBeVisible();
  await page.goto('/admin/orders/');
  await expect(
    page.getByRole('heading', { name: 'Nothing to pack right now.' }),
  ).toBeVisible();
  await page.getByLabel('Show', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Show orders', exact: true }).click();
  await expect(page.locator('.studio-order-row')).toContainText('Shipped');
  await page.goto('/admin/settings/');
  await page
    .getByLabel('Flat U.S. shipping in dollars', { exact: true })
    .fill('7.25');
  await page
    .getByLabel('Processing window', { exact: true })
    .fill('4–6 business days');
  await saveAndReload(page, 'Save store settings');
  await expect(
    page.getByLabel('Flat U.S. shipping in dollars', { exact: true }),
  ).toHaveValue('7.25');
  expect(
    (await db().order.findUniqueOrThrow({ where: { id: order.id } }))
      .settingsSnapshot,
  ).toEqual(order.settingsSnapshot);
  await page
    .getByLabel('Flat U.S. shipping in dollars', { exact: true })
    .fill((original.shippingCents / 100).toFixed(2));
  await page
    .getByLabel('Processing window', { exact: true })
    .fill(original.processingWindow);
  await saveAndReload(page, 'Save store settings');
  for (const [name, url] of [
    ['products', '/admin/'],
    ['inventory', '/admin/inventory/?q=Watermelon'],
    ['orders', '/admin/orders/?filter=all'],
    ['settings', '/admin/settings/'],
  ] as const) {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(url);
    await page.screenshot({
      path: `output/playwright/studio-${name}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/studio-${name}-mobile.png`,
      fullPage: true,
    });
  }
});
test('clears legacy/corrupt carts without rendering stored HTML', async ({
  page,
}) => {
  await page.goto('/cart/');
  await page.evaluate(() => {
    localStorage.setItem(
      'good-apollo-cart',
      JSON.stringify([{ name: '<img src=x onerror="window.injected=true">' }]),
    );
  });
  await page.reload();
  await expect(page.getByRole('status').first()).toContainText(
    'old preview cart was cleared',
  );
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await page.evaluate(() =>
    localStorage.setItem('good-apollo-cart', 'bad JSON'),
  );
  await page.reload();
  await expect(page.getByRole('status').first()).toContainText(
    'could not be read',
  );
});

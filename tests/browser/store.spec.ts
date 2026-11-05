import { test, expect } from '@playwright/test';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
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
  const listing = name === 'Save listing';
  const loaded = listing
    ? Promise.resolve()
    : page.waitForEvent('load', { timeout: 10000 });
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/admin/action/' &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action ===
        (listing ? 'product.save' : 'settings.save'),
  );
  await (
    listing
      ? page.locator('[data-save-listing]')
      : page.getByRole('button', { name, exact: true })
  ).click();
  const result = await response;
  if (!result.ok()) {
    await loaded.catch(() => {});
    throw new Error('Save failed: ' + (await result.text()));
  }
  await loaded;
  if (listing) {
    await expect(page.locator('[data-save-listing]')).toBeEnabled();
    await expect(page.locator('[data-product-status]')).toContainText('saved');
  }
}

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !url.pathname.endsWith('_test') ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Unsafe browser fixture database');
  await db().$executeRawUnsafe(
    'TRUNCATE TABLE "Product", "User", "Order", "StockMovement", "EmailOutbox", "Audit", "StripeEvent", "StoreSettings", "MaintenanceJob", "RequestLimit", "AdminMutation", "MediaAsset" RESTART IDENTITY CASCADE',
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
test.beforeEach(async () => {
  await db().requestLimit.deleteMany();
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
  await saveAndReload(page, 'Save listing');
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
  await expect(page.locator('[data-draft-notice]')).toContainText(
    /restored|Recovered/,
  );
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('59.251');
  const invalidSave = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/admin/action/' &&
      r.request().method() === 'POST',
  );
  await page.locator('[data-save-listing]').click();
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
  await saveAndReload(page, 'Save listing');
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
  await saveAndReload(page, 'Save listing');
  await page
    .getByLabel('Visibility', { exact: true })
    .selectOption('published');
  await saveAndReload(page, 'Save listing');
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
  await saveAndReload(page, 'Save listing');
  await expect(page).toHaveURL(/\/admin\/products\/(?!new)[^/]+\//);
  const productUrl = page.url();
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Recovered unsaved description from the browser fixture.');
  await page.reload();
  await expect(page.locator('[data-draft-notice]')).toContainText(
    /restored|Recovered/,
  );
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue('Recovered unsaved description from the browser fixture.');
  await saveAndReload(page, 'Save listing');
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
  await saveAndReload(page, 'Save listing');
  await page
    .getByRole('button', { name: 'Remove from upload queue', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Visibility', exact: true })
    .selectOption('published');
  await saveAndReload(page, 'Save listing');
  const other = await context.newPage();
  await other.goto(productUrl);
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Browser workflow hat edited');
  await saveAndReload(page, 'Save listing');
  await other
    .getByLabel('Product name', { exact: true })
    .fill('Stale name must not overwrite');
  await other.locator('[data-save-listing]').click();
  await expect(other.locator('[data-draft-notice]')).toContainText(
    'newer version',
  );
  await expect(other.getByLabel('Product name', { exact: true })).toHaveValue(
    'Stale name must not overwrite',
  );
  await other
    .getByRole('button', { name: 'Keep my entries', exact: true })
    .first()
    .click();
  await saveAndReload(other, 'Save listing');
  await expect(other.getByLabel('Product name', { exact: true })).toHaveValue(
    'Stale name must not overwrite',
  );
  await other
    .getByLabel('Product name', { exact: true })
    .fill('Browser workflow hat edited');
  await saveAndReload(other, 'Save listing');
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
  const recorded = page.waitForResponse(
    (r) =>
      r.url().includes('/api/admin/action/') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Record stock change', exact: true })
    .first()
    .click();
  expect((await recorded).ok()).toBe(true);
  await expect(page.locator('[data-status]').first()).toContainText('recorded');
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
  await saveAndReload(page, 'Save listing');
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

test('finishes listing, photos, stock and deletion in one editor without losing entries', async ({
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
  let loads = 0;
  page.on('load', () => loads++);
  await page
    .getByLabel('Product name', { exact: true })
    .fill('One-place fixture');
  await page
    .getByLabel('Description', { exact: true })
    .fill('A synthetic one-place workflow fixture.');
  await page.getByLabel('Price', { exact: true }).fill('55.00');
  await page.locator('[data-initial-single]').fill('4');
  await page
    .getByLabel('Add photos', { exact: true })
    .setInputFiles([imagePath, imagePath, imagePath]);
  await expect(page.locator('[data-upload-queue] li')).toHaveCount(3);
  await saveAndReload(page, 'Save listing');
  await expect(page.locator('[data-photo-id]')).toHaveCount(3);
  await expect(page.locator('[data-upload-queue]')).toContainText(
    'Verified and saved',
  );
  const product = await db().product.findUniqueOrThrow({
    where: { slug: 'one-place-fixture' },
    include: { variants: { include: { stock: true } } },
  });
  expect(product.variants[0].stock?.unsoldQty).toBe(4);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Keep these unsaved description edits during photo actions.');
  await page.getByLabel('Price', { exact: true }).fill('56.00');
  await page
    .locator('[data-alt]')
    .first()
    .fill('Custom description retained during upload');
  await page.getByLabel('Add photos', { exact: true }).setInputFiles([
    {
      name: 'unsupported.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('unsupported fixture'),
    },
    {
      name: 'mixed-success.jpg',
      mimeType: 'image/jpeg',
      buffer: await readFile(imagePath),
    },
  ]);
  await expect(page.locator('[data-photo-id]')).toHaveCount(4);
  await expect(page.locator('[data-upload-queue]')).toContainText(
    'Export HEIC',
  );
  await page
    .getByRole('button', { name: 'Remove from upload queue', exact: true })
    .click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Keep these unsaved description edits during photo actions.',
  );
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('56.00');
  await expect(page.locator('[data-alt]').first()).toHaveValue(
    'Custom description retained during upload',
  );
  await saveAndReload(page, 'Save listing');
  expect(
    (await db().product.findUniqueOrThrow({ where: { id: product.id } }))
      .description,
  ).toBe('Keep these unsaved description edits during photo actions.');
  await page.locator('#stock summary').click();
  await page.getByLabel('Number of pieces', { exact: true }).fill('2');
  await page.getByLabel('Reason', { exact: true }).fill('New batch');
  await page
    .getByRole('button', { name: 'Record stock change', exact: true })
    .click();
  await expect(page.locator('#stock [data-status]')).toContainText('recorded');
  await expect(page.locator('#stock [data-balances]')).toContainText(
    '6 available',
  );
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Keep these unsaved description edits during photo actions.',
  );
  await page
    .getByLabel('Visibility', { exact: true })
    .selectOption('published');
  await saveAndReload(page, 'Save listing');
  const publicBefore = await request.get('/shop/hats/one-place-fixture/');
  expect(publicBefore.status()).toBe(200);
  expect(await publicBefore.text()).toContain(
    'Custom description retained during upload',
  );
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(imagePath);
  await expect(page.locator('[data-photo-id]')).toHaveCount(5);
  await expect(page.getByText('Hidden from shop', { exact: true })).toHaveCount(
    0,
  );
  const images = await db().productImage.findMany({
    where: { productId: product.id },
  });
  expect(images.every((i) => !i.archivedAt)).toBe(true);
  expect((await request.get(`/media/${images[4].id}/400/`)).status()).toBe(200);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Pending edits survive deletion of a photo.');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-delete]').last().click();
  await expect(page.locator('[data-photo-id]')).toHaveCount(4);
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Pending edits survive deletion of a photo.',
  );
  expect(loads).toBe(0);
  await page.screenshot({
    path: 'output/playwright/inventory-editor-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Delete listing', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(page.locator('[data-lifecycle-status]')).toContainText('Trash');
  expect((await request.get('/shop/hats/one-place-fixture/')).status()).toBe(
    404,
  );
  const overview = await context.newPage();
  await overview.goto('/admin/?q=One-place');
  await expect(
    overview.locator(`a[href="/admin/products/${product.id}/"]`),
  ).toHaveCount(0);
  await overview.goto('/admin/inventory/?q=One-place');
  await expect(overview.locator('[data-stock]')).toHaveCount(0);
  await overview.goto('/admin/?status=trash&q=One-place');
  await expect(
    overview.locator(`a[href="/admin/products/${product.id}/"]`).first(),
  ).toBeVisible();
  await overview.close();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Restore as draft', exact: true })
    .click();
  await expect(page.getByLabel('Visibility', { exact: true })).toHaveValue(
    'draft',
  );
  expect(
    (
      await db().variant.findUniqueOrThrow({
        where: { id: product.variants[0].id },
        include: { stock: true },
      })
    ).stock?.unsoldQty,
  ).toBe(6);
});

test('reconciles a lost creation response and preserves edits typed while saving', async ({
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
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Lost creation fixture');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Original description submitted with creation.');
  await page.getByLabel('Price', { exact: true }).fill('45.00');
  let lost = false;
  await page.route('**/api/admin/action/', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'product.save' && !lost) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('[data-save-listing]').click();
  await expect(page.locator('[data-persistence-state]')).toContainText(
    'failed',
  );
  await page
    .getByLabel('Description', { exact: true })
    .fill('Later typing must survive response reconciliation.');
  await saveAndReload(page, 'Save listing');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Later typing must survive response reconciliation.',
  );
  expect(
    await db().product.count({ where: { slug: 'lost-creation-fixture' } }),
  ).toBe(1);
  expect(
    (
      await db().product.findUniqueOrThrow({
        where: { slug: 'lost-creation-fixture' },
      })
    ).description,
  ).toBe('Later typing must survive response reconciliation.');
});

test('reviews legacy hidden photos and permanently removes an unused draft', async ({
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
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Unused removable fixture');
  await page.getByLabel('Price', { exact: true }).fill('20.00');
  await saveAndReload(page, 'Save listing');
  const p = await db().product.findUniqueOrThrow({
    where: { slug: 'unused-removable-fixture' },
  });
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(imagePath);
  await expect(page.locator('[data-photo-id]')).toHaveCount(1);
  await db().productImage.updateMany({
    where: { productId: p.id },
    data: { archivedAt: new Date() },
  });
  await page.reload();
  await expect(page.locator('[data-legacy-hidden]')).toBeVisible();
  await page.getByRole('button', { name: 'Show photo', exact: true }).click();
  await saveAndReload(page, 'Save listing');
  expect(
    (await db().productImage.findFirstOrThrow({ where: { productId: p.id } }))
      .archivedAt,
  ).toBeNull();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Delete listing', exact: true })
    .click();
  await expect(page.locator('[data-lifecycle-status]')).toContainText('Trash');
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Delete permanently', exact: true })
    .click();
  await expect(page).toHaveURL(/status=trash/);
  expect(await db().product.findUnique({ where: { id: p.id } })).toBeNull();
  expect(
    await db().audit.count({
      where: { action: 'product.purge', entityId: p.id },
    }),
  ).toBe(1);
});

test('keeps another stock row and pending product entries after one stock save', async ({
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
  const suffix = randomUUID();
  const product = await db().product.create({
    data: {
      name: 'Stock rows ' + suffix,
      slug: 'stock-rows-' + suffix,
      variants: {
        create: ['A', 'B'].map((label) => ({
          label,
          sku: suffix + label,
          combination: label,
          options: { Size: label },
          priceCents: 2000,
          stock: { create: {} },
        })),
      },
    },
  });
  await page.goto('/admin/inventory/?q=' + encodeURIComponent(product.name));
  const forms = page.locator('[data-stock]');
  expect(await forms.count()).toBeGreaterThan(1);
  await page
    .locator('[data-stock-card] details')
    .first()
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await forms.nth(0).locator('[name=quantity]').fill('1');
  await forms.nth(0).locator('[name=reason]').fill('New batch');
  await forms
    .nth(1)
    .locator('..')
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await forms.nth(1).locator('[name=quantity]').fill('7');
  await forms.nth(1).locator('[name=reason]').fill('Pending separate row');
  await forms
    .nth(0)
    .getByRole('button', { name: 'Record stock change', exact: true })
    .click();
  await expect(forms.nth(0).locator('[data-status]')).toContainText('recorded');
  await expect(forms.nth(1).locator('[name=quantity]')).toHaveValue('7');
  await page.reload();
  await expect(
    page.locator('[data-stock]').nth(1).locator('[name=quantity]'),
  ).toHaveValue('7');
});

test('recovers unnamed option tools and keeps entries through authentication and storage failure', async ({
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
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Recovery boundary fixture');
  await page.getByLabel('Price', { exact: true }).fill('30.00');
  await page.locator('[data-variant-settings] > summary').click();
  await page.locator('[data-generator] > summary').click();
  await page.locator('[data-option-name="1"]').fill('Size');
  await page.locator('[data-option-values="1"]').fill('Small, Large');
  await page.reload();
  await expect(page.locator('[data-option-name="1"]')).toHaveValue('Size');
  await expect(page.locator('[data-option-values="1"]')).toHaveValue(
    'Small, Large',
  );
  await page.route('**/api/admin/action/', async (route) => {
    if (route.request().postDataJSON().action === 'product.save')
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Sign in again to save.',
          code: 'signin',
        }),
      });
    else await route.continue();
  });
  await page
    .getByLabel('Description', { exact: true })
    .fill('These entries survive session expiry.');
  await page.locator('[data-save-listing]').click();
  await expect(page.locator('[data-product-status] a')).toHaveAttribute(
    'href',
    '/admin/sign-in/',
  );
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'These entries survive session expiry.',
  );
  await page.unroute('**/api/admin/action/');
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Synthetic storage quota', 'QuotaExceededError');
    };
  });
  await page
    .getByLabel('Description', { exact: true })
    .fill('Saving also works with unavailable draft storage.');
  await expect(page.locator('[data-draft-notice]')).toContainText(
    'storage is unavailable',
  );
  await saveAndReload(page, 'Save listing');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Saving also works with unavailable draft storage.',
  );
});

test('does not replace keystrokes entered while a save response is pending', async ({
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
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('In-flight typing fixture');
  await page.getByLabel('Price', { exact: true }).fill('25.00');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Description sent with the request.');
  let release!: () => void, committed!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    ready = new Promise<void>((r) => (committed = r));
  let delayed = false;
  await page.route('**/api/admin/action/', async (route) => {
    if (route.request().postDataJSON().action === 'product.save' && !delayed) {
      delayed = true;
      const response = await route.fetch();
      committed();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.locator('[data-save-listing]').click();
  await ready;
  await page
    .getByLabel('Description', { exact: true })
    .fill('Newer typing while the response is pending.');
  release();
  await expect(page.locator('[data-product-status]')).toContainText('saved');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Newer typing while the response is pending.',
  );
  expect(
    (
      await db().product.findUniqueOrThrow({
        where: { slug: 'in-flight-typing-fixture' },
      })
    ).description,
  ).toBe('Description sent with the request.');
  await saveAndReload(page, 'Save listing');
  expect(
    (
      await db().product.findUniqueOrThrow({
        where: { slug: 'in-flight-typing-fixture' },
      })
    ).description,
  ).toBe('Newer typing while the response is pending.');
});

test('one save creates and publishes selected photos, then saves details and gallery from the keyboard', async ({
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
  await page.goto('/admin/products/new/');
  await expect(
    page.getByRole('button', { name: 'Create listing', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', {
      name: /Save product|Save as draft|Save photos/,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Unified publish fixture');
  await page
    .getByLabel('Description', { exact: true })
    .fill('All submitted listing details and photos publish together.');
  await page.getByLabel('Price', { exact: true }).fill('55.00');
  await page.locator('[data-initial-single]').fill('5');
  await page
    .getByLabel('Add photos', { exact: true })
    .setInputFiles([imagePath, imagePath, imagePath]);
  await page
    .getByLabel('Visibility', { exact: true })
    .selectOption('published');
  await page
    .getByRole('button', { name: 'Create listing', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('[data-product-status]')).toContainText('saved');
  const product = await db().product.findUniqueOrThrow({
    where: { slug: 'unified-publish-fixture' },
    include: { images: true, variants: { include: { stock: true } } },
  });
  expect(product.status).toBe('published');
  expect(product.images).toHaveLength(3);
  expect(product.variants[0].stock?.unsoldQty).toBe(5);
  expect(
    await db().stockMovement.count({
      where: { variantId: product.variants[0].id },
    }),
  ).toBe(1);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Combined detail edits also save when submitting from a photo.');
  await page
    .locator('[data-alt]')
    .first()
    .fill('Custom photo description in the unified save');
  await page
    .getByRole('button', { name: 'Hide photo', exact: true })
    .last()
    .click();
  await page.getByLabel('Visibility', { exact: true }).selectOption('draft');
  await page.locator('[data-alt]').first().press('Enter');
  await expect(page.locator('[data-persistence-state]')).toHaveText('Saved');
  const saved = await db().product.findUniqueOrThrow({
    where: { id: product.id },
    include: { images: { orderBy: { position: 'asc' } } },
  });
  expect(saved.status).toBe('draft');
  expect(saved.description).toContain('Combined detail edits');
  expect(saved.images[0].alt).toBe(
    'Custom photo description in the unified save',
  );
  expect(saved.images.at(-1)?.archivedAt).not.toBeNull();
});

test('one save retains the private identity after failed upload and retries without duplicate stock', async ({
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
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Unified retry fixture');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Failed photos retain the private listing safely.');
  await page.getByLabel('Price', { exact: true }).fill('42.00');
  await page.locator('[data-initial-single]').fill('3');
  await page
    .getByLabel('Add photos', { exact: true })
    .setInputFiles([
      { name: 'bad.heic', mimeType: 'image/heic', buffer: Buffer.from('bad') },
    ]);
  await page
    .getByLabel('Visibility', { exact: true })
    .selectOption('published');
  await page
    .getByRole('button', { name: 'Create listing', exact: true })
    .click();
  await expect(page.locator('[data-product-status]')).toContainText(
    'has not been published',
  );
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeEnabled();
  const initial = await db().product.findUniqueOrThrow({
    where: { slug: 'unified-retry-fixture' },
    include: { variants: true },
  });
  expect(initial.status).toBe('draft');
  await page
    .getByRole('button', { name: 'Remove from upload queue', exact: true })
    .click();
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(imagePath);
  await expect(page.locator('[data-photo-id]')).toHaveCount(1);
  await saveAndReload(page, 'Save listing');
  expect(
    (await db().product.findUniqueOrThrow({ where: { id: initial.id } }))
      .status,
  ).toBe('published');
  expect(
    await db().product.count({ where: { slug: 'unified-retry-fixture' } }),
  ).toBe(1);
  expect(
    await db().stockMovement.count({
      where: { variantId: initial.variants[0].id },
    }),
  ).toBe(1);
});

test('publication after uploading never saves keystrokes entered during the upload', async ({
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
  await page.goto('/admin/products/new/');
  await page
    .getByLabel('Product name', { exact: true })
    .fill('Unified in-flight fixture');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Description explicitly submitted for publication.');
  await page.getByLabel('Price', { exact: true }).fill('30.00');
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(imagePath);
  await page
    .getByLabel('Visibility', { exact: true })
    .selectOption('published');
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    committed = new Promise<void>((r) => (ready = r));
  await page.route('**/api/admin/action/', async (route) => {
    if (route.request().postDataJSON()?.action === 'photo.finalize') {
      const response = await route.fetch();
      ready();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Create listing', exact: true })
    .click();
  await committed;
  await page
    .getByLabel('Description', { exact: true })
    .fill('Newer private typing while photos finish.');
  await page.getByLabel('Price', { exact: true }).fill('31.00');
  release();
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('[data-persistence-state]')).toHaveText(
    'Unsaved changes',
  );
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Newer private typing while photos finish.',
  );
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('31.00');
  const saved = await db().product.findUniqueOrThrow({
    where: { slug: 'unified-in-flight-fixture' },
    include: { variants: true },
  });
  expect(saved.status).toBe('published');
  expect(saved.description).toBe(
    'Description explicitly submitted for publication.',
  );
  expect(saved.variants[0].priceCents).toBe(3000);
});

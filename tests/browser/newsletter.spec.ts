import { expect, test } from '@playwright/test';

test('newsletter signup stays closed when the feature flag is absent', async ({ page }) => {
  await page.goto('/newsletter/');
  await expect(page.getByRole('heading', { name: 'Sign-ups are not open yet' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveCount(0);
});

test('confirmation and preference GETs render explicit forms without submitting', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(new URL(request.url()).pathname);
  });
  const token = 'P'.repeat(48);
  await page.goto('/newsletter/confirm/?token=' + token);
  await expect(page.getByRole('button', { name: 'Confirm newsletter signup' })).toBeVisible();
  await expect.poll(() => writes).toEqual([]);
  await page.goto('/newsletter/preferences/?token=' + token);
  await expect(page.getByRole('button', { name: 'Unsubscribe' })).toBeVisible();
  await expect(page.getByText(/changes only Good Apollo Goods newsletter messages/)).toBeVisible();
  expect(writes).toEqual([]);
});

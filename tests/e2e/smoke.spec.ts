import { test, expect } from './fixtures';

test('service worker is alive', async ({ extId }) => {
  expect(extId).toMatch(/^[a-z]{32}$/);
});

test('dashboard opens and renders', async ({ ctx, extId }) => {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/dashboard.html`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.main-tabs')).toBeVisible();
  await page.close();
});

test('popup opens and renders', async ({ ctx, extId }) => {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.tabs')).toBeVisible();
  await page.close();
});

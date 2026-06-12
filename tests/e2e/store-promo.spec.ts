import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const PROMO = `file://${path.resolve(__dirname, '../../docs/store-assets/promo.html')}`;
const OUT = path.resolve(__dirname, '../../docs/store-assets');

test('440×280 small promotional tile', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 440, height: 280 } });
  const page = await ctx.newPage();
  await page.goto(PROMO);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, 'promo-440x280.png'), fullPage: false });
  await ctx.close();
});

test('920×680 large promotional tile', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 920, height: 680 } });
  const page = await ctx.newPage();
  await page.goto(PROMO);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, 'promo-920x680.png'), fullPage: false });
  await ctx.close();
});

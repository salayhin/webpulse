import path from 'path';
import fs from 'fs';
import { type Page } from '@playwright/test';
import { test } from './fixtures';

const OUT = path.resolve(__dirname, '../../docs/store-assets/screenshots');

// JPEG, no alpha — required by Chrome Web Store
function ss(name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  return path.join(OUT, name);
}

async function setViewport(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('Store screenshots', () => {
  test('01-overview (1280×800)', async ({ dashboard }) => {
    await setViewport(dashboard);
    await dashboard.click('button.main-tab:has-text("Dashboard")');
    await dashboard.waitForSelector('.stats-row');
    await dashboard.click('.view-tabs button:has-text("Week")');
    await dashboard.waitForTimeout(600);
    await dashboard.evaluate(() => window.scrollTo(0, 0));
    await dashboard.screenshot({ path: ss('01-overview.jpg'), type: 'jpeg', quality: 95, fullPage: false });
  });

  test('02-youtube (1280×800)', async ({ dashboard }) => {
    await setViewport(dashboard);
    await dashboard.click('button.main-tab:has-text("YouTube Stats")');
    await dashboard.waitForSelector('.stats-row');
    await dashboard.click('.view-tabs button:has-text("Week")');
    await dashboard.waitForTimeout(800);
    await dashboard.evaluate(() => window.scrollTo(0, 0));
    await dashboard.screenshot({ path: ss('02-youtube.jpg'), type: 'jpeg', quality: 95, fullPage: false });
  });

  test('03-pomodoro (1280×800)', async ({ dashboard }) => {
    await setViewport(dashboard);
    await dashboard.click('button.main-tab:has-text("Pomodoro")');
    await dashboard.waitForTimeout(400);
    await dashboard.evaluate(() => window.scrollTo(0, 0));
    await dashboard.screenshot({ path: ss('03-pomodoro.jpg'), type: 'jpeg', quality: 95, fullPage: false });
  });

  test('04-restrictions (1280×800)', async ({ dashboard }) => {
    await setViewport(dashboard);
    await dashboard.click('button.main-tab:has-text("Restrictions")');
    await dashboard.waitForTimeout(400);
    await dashboard.evaluate(() => window.scrollTo(0, 0));
    await dashboard.screenshot({ path: ss('04-restrictions.jpg'), type: 'jpeg', quality: 95, fullPage: false });
  });

  // Popup shown at 640×400 — CWS accepted size, shows header + donut chart
  test('05-popup (640×400)', async ({ popup }) => {
    await popup.setViewportSize({ width: 640, height: 400 });
    await popup.waitForSelector('.ranked-list', { timeout: 8000 });
    await popup.waitForTimeout(400);
    await popup.evaluate(() => window.scrollTo(0, 0));
    await popup.screenshot({ path: ss('05-popup.jpg'), type: 'jpeg', quality: 95, fullPage: false });
  });
});

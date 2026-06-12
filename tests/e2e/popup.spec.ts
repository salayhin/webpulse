import path from 'path';
import { test, expect } from './fixtures';

const SS = (name: string) => path.resolve(__dirname, `../screenshots/popup-${name}.png`);

test.describe('Popup — Today tab', () => {
  test('donut + ranked list', async ({ popup }) => {
    // Today is the default tab
    await popup.waitForSelector('.ranked-list', { timeout: 8000 });
    await popup.waitForTimeout(400);
    await popup.screenshot({ path: SS('today') });
  });
});

test.describe('Popup — Total Time tab', () => {
  test('stats table + donut', async ({ popup }) => {
    await popup.click('.tab:has-text("Total time")');
    await popup.waitForSelector('.stats-table', { timeout: 8000 });
    await popup.waitForTimeout(400);
    await popup.screenshot({ path: SS('total-time') });
  });
});

test.describe('Popup — Daily tab', () => {
  test('line chart + day list', async ({ popup }) => {
    await popup.click('.tab:has-text("Daily")');
    await popup.waitForSelector('.bar-chart', { timeout: 8000 });
    await popup.waitForTimeout(500);
    await popup.screenshot({ path: SS('daily') });
  });

  test('expanded day row', async ({ popup }) => {
    await popup.click('.tab:has-text("Daily")');
    await popup.waitForSelector('.day-list', { timeout: 8000 });
    // Expand the first day row
    const firstRow = popup.locator('.day-row:not(.day-row-total) .day-toggle').first();
    await firstRow.click();
    await popup.waitForTimeout(300);
    await popup.screenshot({ path: SS('daily-expanded') });
  });
});

test.describe('Popup — header navigation', () => {
  test('header buttons visible', async ({ popup }) => {
    await popup.waitForSelector('.pop-header');
    await popup.screenshot({ path: SS('header') });
  });
});

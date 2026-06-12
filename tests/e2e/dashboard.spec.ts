import path from 'path';
import { test, expect } from './fixtures';

const SS = (name: string) => path.resolve(__dirname, `../screenshots/dashboard-${name}.png`);

test.describe('Dashboard — Overview tab', () => {
  test('today range', async ({ dashboard }) => {
    // Overview is the default tab
    await dashboard.waitForSelector('.stats-row');
    await dashboard.screenshot({ path: SS('overview-today'), fullPage: true });
  });

  test('week range', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("Dashboard")');
    await dashboard.waitForSelector('.stats-row');
    // Switch range to Week
    await dashboard.click('.view-tabs button:has-text("Week")');
    await dashboard.waitForTimeout(400);
    await dashboard.screenshot({ path: SS('overview-week'), fullPage: true });
  });

  test('month range', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("Dashboard")');
    await dashboard.click('.view-tabs button:has-text("Month")');
    await dashboard.waitForTimeout(400);
    await dashboard.screenshot({ path: SS('overview-month'), fullPage: true });
  });
});

test.describe('Dashboard — YouTube Stats tab', () => {
  test('today range', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("YouTube Stats")');
    await dashboard.waitForSelector('.stats-row');
    await dashboard.waitForTimeout(500);
    await dashboard.screenshot({ path: SS('youtube-today'), fullPage: true });
  });

  test('week range', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("YouTube Stats")');
    await dashboard.click('.view-tabs button:has-text("Week")');
    await dashboard.waitForTimeout(500);
    await dashboard.screenshot({ path: SS('youtube-week'), fullPage: true });
  });

  test('month range', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("YouTube Stats")');
    await dashboard.click('.view-tabs button:has-text("Month")');
    await dashboard.waitForTimeout(500);
    await dashboard.screenshot({ path: SS('youtube-month'), fullPage: true });
  });

  test('sorted by sessions', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("YouTube Stats")');
    await dashboard.click('.view-tabs button:has-text("Week")');
    await dashboard.waitForSelector('select');
    await dashboard.selectOption('select', 'sessions');
    await dashboard.waitForTimeout(300);
    await dashboard.screenshot({ path: SS('youtube-sorted-sessions'), fullPage: true });
  });
});

test.describe('Dashboard — Pomodoro tab', () => {
  test('idle state', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("Pomodoro")');
    await dashboard.waitForTimeout(300);
    await dashboard.screenshot({ path: SS('pomodoro-idle'), fullPage: true });
  });
});

test.describe('Dashboard — Restrictions tab', () => {
  test('empty state', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("Restrictions")');
    await dashboard.waitForTimeout(300);
    await dashboard.screenshot({ path: SS('restrictions'), fullPage: true });
  });
});

test.describe('Dashboard — Notifications tab', () => {
  test('default state', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("Notifications")');
    await dashboard.waitForTimeout(300);
    await dashboard.screenshot({ path: SS('notifications'), fullPage: true });
  });
});

test.describe('Dashboard — Settings tab', () => {
  test('settings panel', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("Settings")');
    await dashboard.waitForTimeout(300);
    await dashboard.screenshot({ path: SS('settings'), fullPage: true });
  });
});

test.describe('Dashboard — About tab', () => {
  test('about page', async ({ dashboard }) => {
    await dashboard.click('button.main-tab:has-text("About")');
    await dashboard.waitForTimeout(300);
    await dashboard.screenshot({ path: SS('about'), fullPage: true });
  });
});

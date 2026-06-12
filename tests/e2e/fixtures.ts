import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome-mv3');

export type ExtensionFixtures = {
  ctx: BrowserContext;
  extId: string;
  dashboard: Page;
  popup: Page;
};

export const test = base.extend<ExtensionFixtures>({
  // Shared persistent browser context with the extension loaded
  ctx: [async ({}, use) => {
    const background = process.env.PWHEADLESS === 'true';
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        // Move window off-screen when running in "background" mode so it
        // never steals focus. Chrome extension pages require a real window.
        ...(background ? ['--window-position=-2000,-2000', '--window-size=1400,900'] : []),
      ],
    });
    await use(ctx);
    await ctx.close();
  }, { scope: 'test' }],

  // Resolve the extension ID from the background service worker URL.
  extId: async ({ ctx }, use) => {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15_000 });
    await use(sw.url().split('/')[2]);
  },

  // Dashboard page — seeded and ready
  dashboard: async ({ ctx, extId }, use) => {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/dashboard.html`);
    await page.waitForLoadState('networkidle');
    await seedDatabase(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await use(page);
    await page.close();
  },

  // Popup page — seeded (same DB) and ready
  popup: async ({ ctx, extId }, use) => {
    // Seed via a background dashboard page, then open popup in its own tab
    const seed = await ctx.newPage();
    await seed.goto(`chrome-extension://${extId}/dashboard.html`);
    await seed.waitForLoadState('networkidle');
    await seedDatabase(seed);
    await seed.close();

    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForLoadState('networkidle');
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';

// ── Seed helper ──────────────────────────────────────────────────────────────

export async function seedDatabase(page: Page) {
  await page.evaluate(async () => {
    // Local-timezone YYYY-MM-DD, matching localDate() in the extension
    function ld(d: Date) {
      return d.toLocaleDateString('en-CA');
    }
    function daysAgo(n: number): Date {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d;
    }
    function startOf(d: Date, hour: number, min = 0): number {
      const t = new Date(d);
      t.setHours(hour, min, 0, 0);
      return t.getTime();
    }

    // ── Time entries ─────────────────────────────────────────────────────────
    const entries: Array<{
      domain: string; date: string; startedAt: number; duration: number;
    }> = [];

    const domains: Array<{ d: string; mins: number[]; hour: number }> = [
      { d: 'github.com',    mins: [42, 38, 55, 60, 28, 45, 70], hour: 9  },
      { d: 'youtube.com',   mins: [30, 48, 20, 55, 15, 40, 50], hour: 20 },
      { d: 'claude.ai',     mins: [20, 25, 18, 30, 22, 15, 28], hour: 14 },
      { d: 'reddit.com',    mins: [12, 18, 10, 22, 8,  15, 20], hour: 19 },
      { d: 'stackoverflow.com', mins: [15, 20, 12, 18, 25, 10, 22], hour: 11 },
      { d: 'twitter.com',   mins: [8,  12, 6,  15, 5,  10, 14], hour: 21 },
      { d: 'netflix.com',   mins: [45, 0,  60, 30, 0,  90, 45], hour: 22 },
      { d: 'notion.so',     mins: [25, 30, 20, 35, 18, 28, 32], hour: 10 },
    ];

    for (let i = 6; i >= 0; i--) {
      const day = daysAgo(i);
      const idx = 6 - i;
      for (const { d, mins, hour } of domains) {
        const m = mins[idx];
        if (m === 0) continue;
        entries.push({
          domain: d,
          date: ld(day),
          startedAt: startOf(day, hour),
          duration: m * 60,
        });
      }
    }

    // ── Video sessions ────────────────────────────────────────────────────────
    const videos: Array<{
      videoId: string; title: string; channelName: string;
      category: string; date: string; startedAt: number; watchedSeconds: number;
    }> = [
      {
        videoId: 'abc001', title: 'The Perfect Workflow for Developers',
        channelName: 'Fireship', category: 'Science & Technology',
        date: ld(daysAgo(0)), startedAt: startOf(daysAgo(0), 20, 0), watchedSeconds: 720,
      },
      {
        videoId: 'abc002', title: 'React 19 — Everything You Need to Know',
        channelName: 'Fireship', category: 'Science & Technology',
        date: ld(daysAgo(1)), startedAt: startOf(daysAgo(1), 20, 15), watchedSeconds: 540,
      },
      {
        videoId: 'abc003', title: 'Lo-Fi Hip Hop Radio — Beats to Study',
        channelName: 'Lofi Girl', category: 'Music',
        date: ld(daysAgo(1)), startedAt: startOf(daysAgo(1), 14, 0), watchedSeconds: 2400,
      },
      {
        videoId: 'abc004', title: 'Building a Chrome Extension in 2025',
        channelName: 'Jack Herrington', category: 'Science & Technology',
        date: ld(daysAgo(2)), startedAt: startOf(daysAgo(2), 19, 30), watchedSeconds: 1800,
      },
      {
        videoId: 'abc005', title: 'TypeScript 5.8 Deep Dive',
        channelName: 'Matt Pocock', category: 'Science & Technology',
        date: ld(daysAgo(2)), startedAt: startOf(daysAgo(2), 21, 0), watchedSeconds: 2700,
      },
      {
        videoId: 'abc006', title: 'Japan Trip Vlog — Tokyo Street Food',
        channelName: 'Luke\'s English Podcast', category: 'Travel & Events',
        date: ld(daysAgo(3)), startedAt: startOf(daysAgo(3), 20, 0), watchedSeconds: 1200,
      },
      {
        videoId: 'abc007', title: 'Chill Beats for Deep Work',
        channelName: 'Lofi Girl', category: 'Music',
        date: ld(daysAgo(4)), startedAt: startOf(daysAgo(4), 13, 0), watchedSeconds: 3600,
      },
      {
        videoId: 'abc008', title: 'PostgreSQL Performance Tuning',
        channelName: 'Jack Herrington', category: 'Science & Technology',
        date: ld(daysAgo(5)), startedAt: startOf(daysAgo(5), 18, 30), watchedSeconds: 2100,
      },
      {
        videoId: 'abc009', title: 'Cursor AI Editor — Honest Review',
        channelName: 'Fireship', category: 'Science & Technology',
        date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 20, 0), watchedSeconds: 480,
      },
      {
        videoId: 'abc010', title: 'Vim Motions in 10 Minutes',
        channelName: 'Matt Pocock', category: 'Science & Technology',
        date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 21, 0), watchedSeconds: 660,
      },
    ];

    // ── Domain categories ─────────────────────────────────────────────────────
    const categories = [
      { domain: 'github.com',         category: 'productivity' },
      { domain: 'claude.ai',          category: 'productivity' },
      { domain: 'stackoverflow.com',  category: 'productivity' },
      { domain: 'notion.so',          category: 'productivity' },
      { domain: 'youtube.com',        category: 'entertainment' },
      { domain: 'netflix.com',        category: 'entertainment' },
      { domain: 'reddit.com',         category: 'social' },
      { domain: 'twitter.com',        category: 'social' },
    ];

    // ── Settings ──────────────────────────────────────────────────────────────
    const settings = {
      key: 'default',
      ignoredDomains: [],
      notifyDailyEnabled: true,
      notifyDailyTime: '20:00',
      notifyWebsites: [],
      notifyMessage: 'You have spent a lot of time on this site',
    };

    // ── Write to IndexedDB ────────────────────────────────────────────────────
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('WebPulseDB');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const stores = Array.from(db.objectStoreNames);
        const needed = ['timeEntries', 'videoSessions', 'domainCategories', 'settings'];
        if (!needed.every(s => stores.includes(s))) {
          db.close();
          reject(new Error('DB not initialized yet'));
          return;
        }

        const tx = db.transaction(needed, 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => { db.close(); resolve(); };

        // Clear then re-seed so tests are idempotent
        tx.objectStore('timeEntries').clear();
        tx.objectStore('videoSessions').clear();
        tx.objectStore('domainCategories').clear();

        for (const e of entries)       tx.objectStore('timeEntries').add(e);
        for (const v of videos)        tx.objectStore('videoSessions').add(v);
        for (const c of categories)    tx.objectStore('domainCategories').put(c);

        const sStore = tx.objectStore('settings');
        sStore.put(settings);
      };
    });
  });
}

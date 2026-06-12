import path from 'path';
import fs from 'fs';
import { type Page } from '@playwright/test';
import { test } from './fixtures';

const SS = (name: string) => {
  const dir = path.resolve(__dirname, '../../docs/screenshots');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
};

async function seedYouTubeData(page: Page) {
  await page.evaluate(async () => {
    function ld(d: Date) { return d.toLocaleDateString('en-CA'); }
    function daysAgo(n: number): Date {
      const d = new Date(); d.setDate(d.getDate() - n); return d;
    }
    function startOf(d: Date, hour: number, min = 0): number {
      const t = new Date(d); t.setHours(hour, min, 0, 0); return t.getTime();
    }

    const videos = [
      // ── Today (day 0) ────────────────────────────────────────────────────────
      { videoId: 'bb-d0-1', title: '10 Key Data Structures We Use Every Day', channelName: 'ByteByteGo', category: 'education', date: ld(daysAgo(0)), startedAt: startOf(daysAgo(0), 20, 0), watchedSeconds: 720 },
      { videoId: 'hn-d0-1', title: 'HTTP/3 Is Faster but Is It Always Better?', channelName: 'Hussein Nasser', category: 'education', date: ld(daysAgo(0)), startedAt: startOf(daysAgo(0), 21, 0), watchedSeconds: 1320 },
      { videoId: 'kj-d0-1', title: 'My Machine Learning Journey', channelName: 'Ken Jee', category: 'education', date: ld(daysAgo(0)), startedAt: startOf(daysAgo(0), 19, 30), watchedSeconds: 1500 },
      // ── Day 1 ────────────────────────────────────────────────────────────────
      { videoId: 'gs-d1-1', title: 'Consistent Hashing | Algorithms You Should Know', channelName: 'Gaurav Sen', category: 'education', date: ld(daysAgo(1)), startedAt: startOf(daysAgo(1), 20, 0), watchedSeconds: 840 },
      { videoId: 'ak-d1-1', title: 'Apache Kafka Tutorial for Beginners', channelName: 'Andreas Kretz', category: 'education', date: ld(daysAgo(1)), startedAt: startOf(daysAgo(1), 19, 0), watchedSeconds: 2100 },
      { videoId: 'yk-d1-1', title: 'GPT-4 Technical Report – Full Paper Review', channelName: 'Yannic Kilcher', category: 'education', date: ld(daysAgo(1)), startedAt: startOf(daysAgo(1), 21, 0), watchedSeconds: 3600 },
      { videoId: 'sk-d1-1', title: 'From Teacher to Data Scientist – My Story', channelName: 'Sundas Khalid', category: 'productivity', date: ld(daysAgo(1)), startedAt: startOf(daysAgo(1), 22, 30), watchedSeconds: 1200 },
      // ── Day 2 ────────────────────────────────────────────────────────────────
      { videoId: 'bb-d2-1', title: 'Top 5 Most-Used Deployment Strategies', channelName: 'ByteByteGo', category: 'education', date: ld(daysAgo(2)), startedAt: startOf(daysAgo(2), 20, 0), watchedSeconds: 720 },
      { videoId: 'sdg-d2-1', title: 'The Modern Data Stack in 2024 – Full Overview', channelName: 'Seattle Data Guy', category: 'education', date: ld(daysAgo(2)), startedAt: startOf(daysAgo(2), 19, 30), watchedSeconds: 1320 },
      { videoId: 'cmu-d2-1', title: 'Advanced DB Systems – Storage Models & Indexes', channelName: 'CMU Database Group', category: 'education', date: ld(daysAgo(2)), startedAt: startOf(daysAgo(2), 21, 0), watchedSeconds: 4500 },
      // ── Day 3 ────────────────────────────────────────────────────────────────
      { videoId: 'hn-d3-1', title: 'The Idempotency Problem in REST APIs', channelName: 'Hussein Nasser', category: 'education', date: ld(daysAgo(3)), startedAt: startOf(daysAgo(3), 19, 0), watchedSeconds: 1080 },
      { videoId: 'gs-d3-1', title: 'What Is a Message Queue and Where Is It Used?', channelName: 'Gaurav Sen', category: 'education', date: ld(daysAgo(3)), startedAt: startOf(daysAgo(3), 20, 30), watchedSeconds: 960 },
      { videoId: 'goto-d3-1', title: 'Event-Driven Architecture – A Practical Guide', channelName: 'GOTO Conferences', category: 'education', date: ld(daysAgo(3)), startedAt: startOf(daysAgo(3), 21, 0), watchedSeconds: 2700 },
      { videoId: 'sk-d3-1', title: 'How to Negotiate Your Data Scientist Salary', channelName: 'Sundas Khalid', category: 'productivity', date: ld(daysAgo(3)), startedAt: startOf(daysAgo(3), 22, 0), watchedSeconds: 1500 },
      // ── Day 4 ────────────────────────────────────────────────────────────────
      { videoId: 'bb-d4-1', title: 'How Discord Stores Trillions of Messages', channelName: 'ByteByteGo', category: 'education', date: ld(daysAgo(4)), startedAt: startOf(daysAgo(4), 20, 0), watchedSeconds: 600 },
      { videoId: 'ak-d4-1', title: 'dbt Tutorial – Transform Your Data Warehouse', channelName: 'Andreas Kretz', category: 'education', date: ld(daysAgo(4)), startedAt: startOf(daysAgo(4), 19, 0), watchedSeconds: 1800 },
      { videoId: 'kj-d4-1', title: 'Data Science Portfolio Projects That Get You Hired', channelName: 'Ken Jee', category: 'education', date: ld(daysAgo(4)), startedAt: startOf(daysAgo(4), 21, 30), watchedSeconds: 1440 },
      { videoId: 'yk-d4-1', title: 'Attention Is All You Need – Paper Explained', channelName: 'Yannic Kilcher', category: 'education', date: ld(daysAgo(4)), startedAt: startOf(daysAgo(4), 22, 0), watchedSeconds: 3300 },
      // ── Day 5 ────────────────────────────────────────────────────────────────
      { videoId: 'bb-d5-1', title: 'Kubernetes vs Docker Compose – Full Comparison', channelName: 'ByteByteGo', category: 'education', date: ld(daysAgo(5)), startedAt: startOf(daysAgo(5), 20, 0), watchedSeconds: 660 },
      { videoId: 'sdg-d5-1', title: 'dbt Core vs dbt Cloud – What You Actually Need', channelName: 'Seattle Data Guy', category: 'education', date: ld(daysAgo(5)), startedAt: startOf(daysAgo(5), 19, 30), watchedSeconds: 1080 },
      { videoId: 'cmu-d5-1', title: 'CMU Intro to DB Systems – B+Tree Index Structures', channelName: 'CMU Database Group', category: 'education', date: ld(daysAgo(5)), startedAt: startOf(daysAgo(5), 21, 0), watchedSeconds: 4800 },
      { videoId: 'goto-d5-1', title: 'The Art of Code – Dylan Beattie [GOTO 2019]', channelName: 'GOTO Conferences', category: 'education', date: ld(daysAgo(5)), startedAt: startOf(daysAgo(5), 18, 0), watchedSeconds: 3300 },
      // ── Day 6 ────────────────────────────────────────────────────────────────
      { videoId: 'hn-d6-1', title: 'Proxies vs Reverse Proxies Explained by Example', channelName: 'Hussein Nasser', category: 'education', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 19, 0), watchedSeconds: 900 },
      { videoId: 'gs-d6-1', title: 'Rate Limiting System Design Interview', channelName: 'Gaurav Sen', category: 'education', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 20, 0), watchedSeconds: 1080 },
      { videoId: 'ak-d6-1', title: 'How to Build a Data Engineering Portfolio in 2024', channelName: 'Andreas Kretz', category: 'education', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 21, 0), watchedSeconds: 1680 },
      { videoId: 'kj-d6-1', title: 'How I Would Learn Machine Learning in 2024', channelName: 'Ken Jee', category: 'education', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 20, 30), watchedSeconds: 1200 },
      { videoId: 'sk-d6-1', title: 'Data Science Roadmap for Absolute Beginners', channelName: 'Sundas Khalid', category: 'productivity', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 22, 0), watchedSeconds: 1800 },
      { videoId: 'yk-d6-1', title: 'LoRA – Low-Rank Adaptation of Large Language Models', channelName: 'Yannic Kilcher', category: 'education', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 21, 30), watchedSeconds: 2700 },
      { videoId: 'sdg-d6-1', title: 'Snowflake Architecture Deep Dive', channelName: 'Seattle Data Guy', category: 'education', date: ld(daysAgo(6)), startedAt: startOf(daysAgo(6), 19, 30), watchedSeconds: 960 },
    ];

    // One aggregate youtube.com TimeEntry per day so "YouTube Time" stat card shows real data
    const ytDayTotals = [
      { n: 0, secs: 720 + 1320 + 1500 },
      { n: 1, secs: 840 + 2100 + 3600 + 1200 },
      { n: 2, secs: 720 + 1320 + 4500 },
      { n: 3, secs: 1080 + 960 + 2700 + 1500 },
      { n: 4, secs: 600 + 1800 + 1440 + 3300 },
      { n: 5, secs: 660 + 1080 + 4800 + 3300 },
      { n: 6, secs: 900 + 1080 + 1680 + 1200 + 1800 + 2700 + 960 },
    ];
    const entries = ytDayTotals.map(({ n, secs }) => {
      const d = daysAgo(n);
      return { domain: 'youtube.com', date: ld(d), startedAt: startOf(d, 19, 0), duration: secs, wasAudible: true };
    });

    const categories = [{ domain: 'youtube.com', category: 'entertainment' }];
    const settings = {
      key: 'default', ignoredDomains: [], notifyDailyEnabled: true,
      notifyDailyTime: '20:00', notifyWebsites: [],
      notifyMessage: 'You have spent a lot of time on this site',
    };

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('WebPulseDB');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const needed = ['timeEntries', 'videoSessions', 'domainCategories', 'settings'];
        if (!needed.every(s => Array.from(db.objectStoreNames).includes(s))) {
          db.close(); reject(new Error('DB not initialized')); return;
        }
        const tx = db.transaction(needed, 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => { db.close(); resolve(); };

        tx.objectStore('timeEntries').clear();
        tx.objectStore('videoSessions').clear();
        tx.objectStore('domainCategories').clear();

        for (const e of entries)    tx.objectStore('timeEntries').add(e);
        for (const v of videos)     tx.objectStore('videoSessions').add(v);
        for (const c of categories) tx.objectStore('domainCategories').put(c);
        tx.objectStore('settings').put(settings);
      };
    });
  });
}

test.describe('YouTube Stats — tech channels', () => {
  test('week range screenshot', async ({ ctx, extId }) => {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/dashboard.html`);
    await page.waitForLoadState('networkidle');
    await seedYouTubeData(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.click('button.main-tab:has-text("YouTube Stats")');
    await page.waitForSelector('.stats-row');
    await page.click('.view-tabs button:has-text("Week")');
    await page.waitForTimeout(800);

    await page.screenshot({ path: SS('youtube-stats'), fullPage: true });
    await page.close();
  });
});

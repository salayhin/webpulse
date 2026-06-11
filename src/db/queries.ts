import { db, type Category } from './index';
import { localDate } from '../lib/hostname';

export const CATEGORY_KEYS = [
  'productivity', 'social', 'entertainment', 'news', 'education', 'other', 'uncategorized',
] as const;
export type CategoryKey = typeof CATEGORY_KEYS[number];

export const CATEGORY_COLORS: Record<CategoryKey, string> = {
  productivity: '#34d399',  // emerald
  social:       '#f87171',  // rose
  entertainment:'#a78bfa',  // violet
  news:         '#fbbf24',  // amber
  education:    '#60a5fa',  // blue
  other:        '#94a3b8',  // slate
  uncategorized:'#e5e7eb',  // gray-200
};

export async function getYouTubeStats(start: string, end: string) {
  const sessions = await db.videoSessions
    .where('date').between(start, end, true, true)
    .toArray();

  const totalWatchedSeconds = sessions.reduce((s, v) => s + v.watchedSeconds, 0);
  const uniqueVideos = new Set(sessions.map(v => v.videoId)).size;

  return { totalWatchedSeconds, uniqueVideos, sessionCount: sessions.length };
}

export async function getYouTubeByCategoryForRange(start: string, end: string) {
  const sessions = await db.videoSessions
    .where('date').between(start, end, true, true)
    .toArray();

  const map = new Map<string, number>();
  for (const s of sessions) {
    const key = s.category || 'Unknown';
    map.set(key, (map.get(key) ?? 0) + s.watchedSeconds);
  }

  return [...map.entries()]
    .map(([category, seconds]) => ({ category, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

export async function getTopChannels(start: string, end: string, limit = 10) {
  const sessions = await db.videoSessions
    .where('date').between(start, end, true, true)
    .toArray();

  const map = new Map<string, number>();
  for (const s of sessions) {
    const key = s.channelName || 'Unknown';
    map.set(key, (map.get(key) ?? 0) + s.watchedSeconds);
  }

  return [...map.entries()]
    .map(([channelName, seconds]) => ({ channelName, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}

export async function getRecentVideos(limit = 15) {
  const all = await db.videoSessions
    .orderBy('startedAt')
    .reverse()
    .limit(limit)
    .toArray();
  return all;
}

export async function getTimeByCategory(start: string, end: string) {
  const [entries, cats] = await Promise.all([
    db.timeEntries.where('date').between(start, end, true, true).toArray(),
    db.domainCategories.toArray(),
  ]);
  const catMap = new Map(cats.map(c => [c.domain, c.category]));
  const map = new Map<string, number>();
  for (const e of entries) {
    const cat = catMap.get(e.domain) ?? 'uncategorized';
    map.set(cat, (map.get(cat) ?? 0) + e.duration);
  }
  return [...map.entries()]
    .map(([category, seconds]) => ({ category, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * Daily totals split by category for the last `days` days (most recent last).
 * Returned row keys match Recharts stacked-bar `dataKey` props.
 */
export async function getDailyByCategory(days: number): Promise<Array<
  { date: string; label: string } & Record<CategoryKey, number>
>> {
  const today = localDate();
  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayList.push(localDate(d.getTime()));
  }

  const [entries, cats] = await Promise.all([
    db.timeEntries.where('date').between(dayList[0], today, true, true).toArray(),
    db.domainCategories.toArray(),
  ]);
  const catMap = new Map(cats.map(c => [c.domain, c.category as Category]));

  // Per-day buckets initialized to all zeros for each category
  const rows = new Map<string, Record<CategoryKey, number>>();
  for (const date of dayList) {
    const row = {} as Record<CategoryKey, number>;
    for (const k of CATEGORY_KEYS) row[k] = 0;
    rows.set(date, row);
  }

  for (const e of entries) {
    const row = rows.get(e.date);
    if (!row) continue;
    const key = (catMap.get(e.domain) ?? 'uncategorized') as CategoryKey;
    row[key] += Math.round(e.duration / 60); // store as minutes for chart Y-axis
  }

  return dayList.map(date => {
    const d = new Date(date + 'T12:00:00');
    const label = date === today ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' });
    return { date, label, ...rows.get(date)! };
  });
}

/**
 * Focus sessions: stretches of uninterrupted activity on a single domain.
 * Heartbeat-fragmented entries (one per minute) are merged: consecutive
 * same-domain entries within `gapToleranceMs` are joined into one block.
 */
export async function getFocusSessions(
  start: string,
  end: string,
  minSeconds = 15 * 60,
  gapToleranceMs = 5000,
): Promise<Array<{ domain: string; startedAt: number; durationSecs: number; date: string }>> {
  const entries = await db.timeEntries
    .where('date').between(start, end, true, true)
    .toArray();
  entries.sort((a, b) => a.startedAt - b.startedAt);

  const sessions: Array<{ domain: string; startedAt: number; durationSecs: number; date: string }> = [];
  let cur: { domain: string; startedAt: number; endsAt: number; date: string } | null = null;

  for (const e of entries) {
    const eEnds = e.startedAt + e.duration * 1000;
    if (cur && cur.domain === e.domain && e.startedAt - cur.endsAt <= gapToleranceMs) {
      cur.endsAt = eEnds;
    } else {
      if (cur) {
        const dur = Math.round((cur.endsAt - cur.startedAt) / 1000);
        if (dur >= minSeconds) sessions.push({ domain: cur.domain, startedAt: cur.startedAt, durationSecs: dur, date: cur.date });
      }
      cur = { domain: e.domain, startedAt: e.startedAt, endsAt: eEnds, date: e.date };
    }
  }
  if (cur) {
    const dur = Math.round((cur.endsAt - cur.startedAt) / 1000);
    if (dur >= minSeconds) sessions.push({ domain: cur.domain, startedAt: cur.startedAt, durationSecs: dur, date: cur.date });
  }

  return sessions.sort((a, b) => b.durationSecs - a.durationSecs);
}

export function lastNDays(n: number): { start: string; end: string } {
  const end = localDate();
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  const start = localDate(d.getTime());
  return { start, end };
}

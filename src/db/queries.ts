import { db } from './index';
import { localDate } from '../lib/hostname';

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

export function lastNDays(n: number): { start: string; end: string } {
  const end = localDate();
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  const start = localDate(d.getTime());
  return { start, end };
}

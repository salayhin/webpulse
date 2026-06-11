import { db } from '../db';

function csvEscape(s: string | number | undefined): string {
  const str = String(s ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportTimeEntries(): Promise<void> {
  const entries = await db.timeEntries.toArray();
  const cats = await db.domainCategories.toArray();
  const catMap = new Map(cats.map(c => [c.domain, c.category]));

  let csv = 'date,domain,category,duration_seconds,started_at,was_audible\n';
  for (const e of entries) {
    const cat = catMap.get(e.domain) ?? 'uncategorized';
    csv += `${e.date},${csvEscape(e.domain)},${cat},${e.duration},${e.startedAt},${e.wasAudible ? 'true' : 'false'}\n`;
  }

  downloadCSV('time_entries.csv', csv);
}

export async function exportVideoSessions(): Promise<void> {
  const sessions = await db.videoSessions.toArray();

  let csv = 'date,video_id,title,channel_name,category,watched_seconds,started_at\n';
  for (const s of sessions) {
    csv += `${s.date},${csvEscape(s.videoId)},${csvEscape(s.title)},${csvEscape(s.channelName)},${csvEscape(s.category)},${s.watchedSeconds},${s.startedAt}\n`;
  }

  downloadCSV('video_sessions.csv', csv);
}

export async function exportAll(): Promise<void> {
  const timestamp = new Date().toISOString().split('T')[0];
  const [timeEntries, videoSessions] = await Promise.all([
    db.timeEntries.toArray(),
    db.videoSessions.toArray(),
  ]);
  const cats = await db.domainCategories.toArray();
  const catMap = new Map(cats.map(c => [c.domain, c.category]));

  // time_entries.csv
  let csv1 = 'date,domain,category,duration_seconds,started_at,was_audible\n';
  for (const e of timeEntries) {
    const cat = catMap.get(e.domain) ?? 'uncategorized';
    csv1 += `${e.date},${csvEscape(e.domain)},${cat},${e.duration},${e.startedAt},${e.wasAudible ? 'true' : 'false'}\n`;
  }
  downloadCSV(`webpulse_time_entries_${timestamp}.csv`, csv1);

  // video_sessions.csv
  let csv2 = 'date,video_id,title,channel_name,category,watched_seconds,started_at\n';
  for (const s of videoSessions) {
    csv2 += `${s.date},${csvEscape(s.videoId)},${csvEscape(s.title)},${csvEscape(s.channelName)},${csvEscape(s.category)},${s.watchedSeconds},${s.startedAt}\n`;
  }
  downloadCSV(`webpulse_video_sessions_${timestamp}.csv`, csv2);
}

function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

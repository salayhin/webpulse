import React, { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts';
import { db, type TimeEntry } from '../../db';
import { localDate } from '../../lib/hostname';

// ── Formatting helpers ──────────────────────────────────────────────────────

/** "11 m 19 s" / "1 h 4 m" / "42 s" — matches the screenshots. */
function fmtDur(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec === 0 ? `${m} m` : `${m} m ${sec} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** "6/11/2026" — locale-style. */
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US');
}

/** Convert YYYY-MM-DD → MM/DD/YYYY for the date-range display. */
function fmtRangeDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/** Days between two YYYY-MM-DD strings, inclusive. */
function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T12:00:00').getTime();
  const b = new Date(end + 'T12:00:00').getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Shift a YYYY-MM-DD string by N days. */
function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return localDate(d.getTime());
}

// ── Palette ─────────────────────────────────────────────────────────────────
// 10 distinct hues to differentiate slices. Wraps if there are more domains.
const PIE_COLORS = [
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#bef264', '#86efac', '#22c55e',
];

// ── Aggregation ─────────────────────────────────────────────────────────────

interface SiteAgg {
  domain: string;
  seconds: number;
  sessions: number;
}

function aggregate(entries: TimeEntry[]): SiteAgg[] {
  const map = new Map<string, SiteAgg>();
  for (const e of entries) {
    const cur = map.get(e.domain) ?? { domain: e.domain, seconds: 0, sessions: 0 };
    cur.seconds += e.duration;
    cur.sessions += 1;
    map.set(e.domain, cur);
  }
  return [...map.values()];
}

type SortKey = 'time' | 'sessions' | 'name';
function sortSites(sites: SiteAgg[], by: SortKey): SiteAgg[] {
  const copy = [...sites];
  if (by === 'time') copy.sort((a, b) => b.seconds - a.seconds);
  else if (by === 'sessions') copy.sort((a, b) => b.sessions - a.sessions);
  else copy.sort((a, b) => a.domain.localeCompare(b.domain));
  return copy;
}

// ── Header ──────────────────────────────────────────────────────────────────

function openDashboard(hash = ''): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + hash });
}

function Header(): React.ReactElement {
  return (
    <header className="pop-header">
      <div className="brand">
        <span className="brand-logo">⚡</span>
        <span className="brand-title">Web Pulse</span>
      </div>
      <div className="header-actions">
        <button className="hdr-btn" title="Pomodoro" onClick={() => openDashboard('#pomodoro')}>
          <span className="hdr-label">Pomodoro</span> <span className="hdr-emoji">🍅</span>
        </button>
        <button className="hdr-btn" title="Dashboard" onClick={() => openDashboard()}>
          <span className="hdr-label">Dashboard</span> <span className="hdr-icon">🗖</span>
        </button>
        <button className="hdr-btn" title="Settings" onClick={() => openDashboard('#settings')}>
          <span className="hdr-label">Settings</span> <span className="hdr-icon">⚙</span>
        </button>
      </div>
    </header>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = 'today' | 'total' | 'daily';

function Tabs({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }): React.ReactElement {
  const items: Array<{ k: TabKey; label: string }> = [
    { k: 'today', label: 'Today' },
    { k: 'total', label: 'Total time' },
    { k: 'daily', label: 'Daily' },
  ];
  return (
    <nav className="tabs">
      {items.map(it => (
        <button
          key={it.k}
          className={`tab ${tab === it.k ? 'tab-active' : ''}`}
          onClick={() => onTab(it.k)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}

// ── Shared donut + legend ───────────────────────────────────────────────────

function Donut({ data, size = 220 }: { data: SiteAgg[]; size?: number }): React.ReactElement {
  const top = data.slice(0, 10);
  const pieData = top.map(d => ({ name: d.domain, value: d.seconds }));
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="100%"
              paddingAngle={1.5}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => fmtDur(v)}
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12 }}
              itemStyle={{ color: '#fff' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend">
        {top.map((d, i) => (
          <li key={d.domain} className="legend-item">
            <span className="legend-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="legend-name" title={d.domain}>{d.domain}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Today tab ───────────────────────────────────────────────────────────────

function TodayTab(): React.ReactElement {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.timeEntries.where('date').equals(localDate()).toArray().then(rows => {
      setEntries(rows);
      setLoading(false);
    });
  }, []);

  const sites = useMemo(() => aggregate(entries), [entries]);
  const sorted = useMemo(() => sortSites(sites, sortBy), [sites, sortBy]);
  const total = sites.reduce((s, x) => s + x.seconds, 0);

  if (loading) return <p className="empty">Loading…</p>;
  if (sites.length === 0) return <p className="empty">No activity tracked today yet.</p>;

  return (
    <div className="view-today">
      <Donut data={sortSites(sites, 'time')} />
      <div className="summary-bar">
        <div>
          <div className="summary-label">Today</div>
          <div className="summary-value">{fmtDur(total)}</div>
        </div>
        <SortSelect value={sortBy} onChange={setSortBy} />
      </div>
      <ul className="ranked-list">
        {sorted.map(s => {
          const pct = total > 0 ? (s.seconds / total) * 100 : 0;
          return (
            <li key={s.domain} className="ranked-row">
              <img
                src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                alt=""
                className="ranked-favicon"
                width={32}
                height={32}
              />
              <div className="ranked-main">
                <div className="ranked-header">
                  <span className="ranked-domain" title={s.domain}>{s.domain}</span>
                  <span className="ranked-time">{fmtDur(s.seconds)}</span>
                </div>
                <div className="ranked-bar-row">
                  <div className="ranked-bar-wrap">
                    <div className="ranked-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="ranked-pct">{pct.toFixed(2)} %</span>
                </div>
                <div className="ranked-sub">{s.sessions} session{s.sessions === 1 ? '' : 's'}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Total time tab ──────────────────────────────────────────────────────────

interface TotalStats {
  firstActive: string | null;
  activeDays: number;
  totalDays: number;
  today: number;
  total: number;
  avgActive: number;
  mostActive: { date: string; secs: number } | null;
  leastActive: { date: string; secs: number } | null;
  sites: SiteAgg[];
}

function TotalTimeTab(): React.ReactElement {
  const [stats, setStats] = useState<TotalStats | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('time');

  useEffect(() => {
    db.timeEntries.toArray().then(rows => {
      if (rows.length === 0) {
        setStats({
          firstActive: null, activeDays: 0, totalDays: 0,
          today: 0, total: 0, avgActive: 0,
          mostActive: null, leastActive: null, sites: [],
        });
        return;
      }
      const today = localDate();
      const perDay = new Map<string, number>();
      let total = 0;
      for (const e of rows) {
        perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.duration);
        total += e.duration;
      }
      const firstActive = [...perDay.keys()].sort()[0];
      const activeDays = perDay.size;
      const totalDays = daysBetween(firstActive, today);
      const todaySecs = perDay.get(today) ?? 0;
      const dayEntries = [...perDay.entries()].sort((a, b) => b[1] - a[1]);
      const mostActive = { date: dayEntries[0][0], secs: dayEntries[0][1] };
      const leastActive = { date: dayEntries[dayEntries.length - 1][0], secs: dayEntries[dayEntries.length - 1][1] };
      const sites = aggregate(rows);
      setStats({
        firstActive, activeDays, totalDays,
        today: todaySecs, total, avgActive: total / activeDays,
        mostActive, leastActive, sites,
      });
    });
  }, []);

  if (!stats) return <p className="empty">Loading…</p>;
  if (stats.total === 0) return <p className="empty">No activity tracked yet.</p>;

  const sortedSites = sortSites(stats.sites, sortBy);

  return (
    <div className="view-total">
      <div className="stat-grid">
        <StatCard label="The first active day" value={stats.firstActive ? fmtDate(stats.firstActive) : '—'} />
        <StatCard label="Number of active days" value={String(stats.activeDays)} />
        <StatCard label="Total number of days" value={String(stats.totalDays)} />
        <StatCard label="All the time today" value={fmtDur(stats.today)} />
        <StatCard label="Total time" value={fmtDur(stats.total)} />
        <StatCard label="Average time for active days" value={fmtDur(stats.avgActive)} />
      </div>

      <div className="extreme-row">
        <ExtremeCard label="The most active day" icon="📅✅" date={stats.mostActive!.date} secs={stats.mostActive!.secs} />
        <ExtremeCard label="The most inactive day" icon="📅✅" date={stats.leastActive!.date} secs={stats.leastActive!.secs} />
      </div>

      <Donut data={sortSites(stats.sites, 'time')} />

      <div className="aggregate-bar">
        <div>
          <div className="agg-label">
            Aggregate data since {stats.firstActive ? fmtDate(stats.firstActive) : '—'} ({stats.totalDays} day{stats.totalDays === 1 ? '' : 's'}) ({stats.sites.length} websites)
          </div>
          <div className="agg-value">{fmtDur(stats.total)}</div>
        </div>
        <SortSelect value={sortBy} onChange={setSortBy} />
      </div>

      <ul className="ranked-list">
        {sortedSites.slice(0, 50).map(s => {
          const pct = stats.total > 0 ? (s.seconds / stats.total) * 100 : 0;
          return (
            <li key={s.domain} className="ranked-row">
              <img
                src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                alt=""
                className="ranked-favicon"
                width={32} height={32}
              />
              <div className="ranked-main">
                <div className="ranked-header">
                  <span className="ranked-domain" title={s.domain}>{s.domain}</span>
                  <span className="ranked-time">{fmtDur(s.seconds)}</span>
                </div>
                <div className="ranked-bar-row">
                  <div className="ranked-bar-wrap">
                    <div className="ranked-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="ranked-pct">{pct.toFixed(2)} %</span>
                </div>
                <div className="ranked-sub">{s.sessions} session{s.sessions === 1 ? '' : 's'}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  );
}

function ExtremeCard({ label, icon, date, secs }: { label: string; icon: string; date: string; secs: number }): React.ReactElement {
  return (
    <div className="extreme-card">
      <div className="extreme-label">{label} <span className="extreme-icon">{icon}</span></div>
      <div className="extreme-date">{fmtDate(date)}</div>
      <div className="extreme-secs">{fmtDur(secs)}</div>
    </div>
  );
}

// ── Daily tab ───────────────────────────────────────────────────────────────

function DailyTab(): React.ReactElement {
  const today = localDate();
  const defaultStart = shiftDate(today, -6);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(today);
  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    db.timeEntries.where('date').between(start, end, true, true).toArray().then(setRows);
  }, [start, end]);

  // Roll up totals per day; keep only days that actually have activity.
  const perDay = useMemo(() => {
    const m = new Map<string, { secs: number; sites: SiteAgg[] }>();
    const byDay = new Map<string, TimeEntry[]>();
    for (const r of rows) {
      const list = byDay.get(r.date) ?? [];
      list.push(r);
      byDay.set(r.date, list);
    }
    for (const [date, entries] of byDay) {
      const sites = sortSites(aggregate(entries), 'time');
      const secs = sites.reduce((s, x) => s + x.seconds, 0);
      m.set(date, { secs, sites });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const total = perDay.reduce((s, [, v]) => s + v.secs, 0);
  const avg = perDay.length > 0 ? total / perDay.length : 0;
  const chartData = perDay.map(([date, v]) => ({ date: fmtDate(date), secs: v.secs }));

  function toggle(key: string): void {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function exportCsv(): void {
    const lines = ['Date,Domain,Seconds,Sessions'];
    for (const [date, v] of perDay) {
      for (const s of v.sites) {
        lines.push(`${date},${s.domain},${s.seconds},${s.sessions}`);
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webpulse-${start}_to_${end}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="view-daily">
      <div className="range-row">
        <div className="range-picker">
          <span className="range-icon">📅</span>
          <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} className="range-input" />
          <span className="range-sep">–</span>
          <input type="date" value={end} min={start} max={today} onChange={e => setEnd(e.target.value)} className="range-input" />
          <button
            className="range-clear"
            title="Reset to last 7 days"
            onClick={() => { setStart(shiftDate(today, -6)); setEnd(today); }}
          >
            ✕
          </button>
        </div>
        <button className="csv-btn" onClick={exportCsv}>Export to CSV</button>
      </div>

      <div className="avg-card">
        <div className="avg-label">Average time on selected days</div>
        <div className="avg-value">{fmtDur(avg)}</div>
      </div>

      {chartData.length === 0 ? (
        <p className="empty">No activity in this range.</p>
      ) : (
        <div className="bar-chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} tickFormatter={fmtDur} width={70} />
              <Tooltip
                formatter={(v: number) => fmtDur(v)}
                labelStyle={{ color: '#fff' }}
                contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12 }}
              />
              <Bar dataKey="secs" fill="#6366f1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="day-list">
        <li className="day-row day-row-total">
          <button className="day-toggle" onClick={() => toggle('__total')}>
            <span className="day-chev">{expanded.has('__total') ? '▾' : '▸'}</span>
            <span className="day-name">Total time</span>
            <span className="day-secs">{fmtDur(total)}</span>
          </button>
          {expanded.has('__total') && (
            <ul className="day-sites">
              {sortSites(aggregate(rows), 'time').map(s => (
                <li key={s.domain} className="day-site"><span>{s.domain}</span><span>{fmtDur(s.seconds)}</span></li>
              ))}
            </ul>
          )}
        </li>
        {perDay.map(([date, v]) => (
          <li key={date} className="day-row">
            <button className="day-toggle" onClick={() => toggle(date)}>
              <span className="day-chev">{expanded.has(date) ? '▾' : '▸'}</span>
              <span className="day-name">{fmtDate(date)}</span>
              <span className="day-secs">{fmtDur(v.secs)}</span>
            </button>
            {expanded.has(date) && (
              <ul className="day-sites">
                {v.sites.map(s => (
                  <li key={s.domain} className="day-site"><span>{s.domain}</span><span>{fmtDur(s.seconds)}</span></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── SortSelect ──────────────────────────────────────────────────────────────

function SortSelect({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }): React.ReactElement {
  return (
    <label className="sort-select">
      <span className="sort-label">Sorting by</span>
      <select value={value} onChange={e => onChange(e.target.value as SortKey)}>
        <option value="time">Usage Time</option>
        <option value="sessions">Sessions</option>
        <option value="name">A → Z</option>
      </select>
    </label>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('today');
  return (
    <div className="pop">
      <Header />
      <Tabs tab={tab} onTab={setTab} />
      <main className="pop-main">
        {tab === 'today' && <TodayTab />}
        {tab === 'total' && <TotalTimeTab />}
        {tab === 'daily' && <DailyTab />}
      </main>
    </div>
  );
}

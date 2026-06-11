import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { db } from '../../db';
import { formatDuration, localDate } from '../../lib/hostname';

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#94a3b8'];

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return localDate(d.getTime());
  });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = localDate();
  if (dateStr === today) return 'Today';
  return d.toLocaleDateString('en', { weekday: 'short' });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      <p className="tooltip-value">{formatDuration(payload[0].value * 60)}</p>
    </div>
  );
}

type View = 'today' | 'week' | 'month';

export default function Dashboard() {
  const [view, setView] = useState<View>('today');
  const [todaySecs, setTodaySecs] = useState(0);
  const [weekSecs, setWeekSecs] = useState(0);
  const [allTimeSecs, setAllTimeSecs] = useState(0);
  const [dailyData, setDailyData] = useState<{ label: string; minutes: number }[]>([]);
  const [topSites, setTopSites] = useState<{ domain: string; seconds: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = localDate();
      const days7 = lastNDays(7);
      const days30 = lastNDays(30);
      const weekStart = days7[0];
      const monthStart = days30[0];

      const allEntries = await db.timeEntries.toArray();

      const todayEntries = allEntries.filter(e => e.date === today);
      const weekEntries = allEntries.filter(e => e.date >= weekStart && e.date <= today);

      setTodaySecs(todayEntries.reduce((s, e) => s + e.duration, 0));
      setWeekSecs(weekEntries.reduce((s, e) => s + e.duration, 0));
      setAllTimeSecs(allEntries.reduce((s, e) => s + e.duration, 0));

      // Daily chart — last 7 days
      const byDate = new Map<string, number>();
      for (const e of weekEntries) {
        byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.duration);
      }
      setDailyData(
        days7.map(date => ({
          label: dayLabel(date),
          minutes: Math.round((byDate.get(date) ?? 0) / 60),
        }))
      );

      // Top sites: today by default
      const siteMap = new Map<string, number>();
      const sourceEntries = view === 'today' ? todayEntries : view === 'week' ? weekEntries : allEntries.filter(e => e.date >= monthStart);
      for (const e of sourceEntries) {
        siteMap.set(e.domain, (siteMap.get(e.domain) ?? 0) + e.duration);
      }
      setTopSites(
        [...siteMap.entries()]
          .map(([domain, seconds]) => ({ domain, seconds }))
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 10)
      );

      setLoading(false);
    }
    load();
  }, [view]);

  const maxSecs = topSites[0]?.seconds ?? 1;
  const pieData = topSites.slice(0, 6).map(s => ({ name: s.domain, value: s.seconds }));

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="header-left">
          <span className="logo">⚡ WebPulse</span>
          <span className="header-sub">Activity Dashboard</span>
        </div>
      </header>

      {loading ? (
        <div className="loading">Loading your activity data…</div>
      ) : (
        <main className="dash-main">
          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">Today</span>
              <span className="stat-value">{formatDuration(todaySecs)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">This Week</span>
              <span className="stat-value">{formatDuration(weekSecs)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">All Time</span>
              <span className="stat-value">{formatDuration(allTimeSecs)}</span>
            </div>
          </div>

          {/* Daily trend */}
          <section className="card">
            <h2 className="card-title">Daily Activity — Last 7 Days</h2>
            {dailyData.every(d => d.minutes === 0) ? (
              <p className="empty">No data yet. Browse for a while and check back.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#666' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} unit="m" width={36} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f5ff' }} />
                  <Bar dataKey="minutes" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* Top sites */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Top Sites</h2>
              <div className="view-tabs">
                {(['today', 'week', 'month'] as View[]).map(v => (
                  <button key={v} className={`tab ${view === v ? 'tab-active' : ''}`} onClick={() => setView(v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {topSites.length === 0 ? (
              <p className="empty">No activity recorded for this period.</p>
            ) : (
              <div className="sites-layout">
                <ul className="site-list">
                  {topSites.map(({ domain, seconds }, i) => (
                    <li key={domain} className="site-row">
                      <div className="site-name">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                          width={16} height={16} alt="" className="favicon"
                        />
                        <span className="domain-text">{domain}</span>
                      </div>
                      <div className="bar-wrap">
                        <div className="bar" style={{ width: `${(seconds / maxSecs) * 100}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="site-time">{formatDuration(seconds)}</span>
                    </li>
                  ))}
                </ul>

                {pieData.length > 1 && (
                  <div className="pie-wrap">
                    <PieChart width={180} height={180}>
                      <Pie data={pieData} dataKey="value" cx={90} cy={90} innerRadius={50} outerRadius={80} strokeWidth={0}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatDuration(v)} />
                    </PieChart>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { db } from '../../db';
import { formatDuration, localDate } from '../../lib/hostname';
import {
  getYouTubeStats, getYouTubeByCategoryForRange,
  getTopChannels, getRecentVideos, lastNDays,
} from '../../db/queries';

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#6366f1','#8b5cf6','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#94a3b8','#fb923c','#e879f9'];
type MainTab = 'overview' | 'youtube';
type RangeTab = 'today' | 'week' | 'month';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDays7(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return localDate(d.getTime());
  });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (dateStr === localDate()) return 'Today';
  return d.toLocaleDateString('en', { weekday: 'short' });
}

function getRangeForTab(tab: RangeTab): { start: string; end: string } {
  if (tab === 'today') { const t = localDate(); return { start: t, end: t }; }
  if (tab === 'week') return lastNDays(7);
  return lastNDays(30);
}

// ── Custom tooltip ───────────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      <p className="tooltip-value">{formatDuration(payload[0].value * 60)}</p>
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{payload[0].name}</p>
      <p className="tooltip-value">{formatDuration(payload[0].value)}</p>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [todaySecs, setTodaySecs] = useState(0);
  const [weekSecs, setWeekSecs] = useState(0);
  const [allTimeSecs, setAllTimeSecs] = useState(0);
  const [dailyData, setDailyData] = useState<{ label: string; minutes: number }[]>([]);
  const [topSites, setTopSites] = useState<{ domain: string; seconds: number }[]>([]);
  const [rangeTab, setRangeTab] = useState<RangeTab>('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = localDate();
      const days7 = buildDays7();
      const { start: weekStart } = lastNDays(7);
      const { start: monthStart } = lastNDays(30);

      const all = await db.timeEntries.toArray();
      const todayE = all.filter(e => e.date === today);
      const weekE = all.filter(e => e.date >= weekStart && e.date <= today);

      setTodaySecs(todayE.reduce((s, e) => s + e.duration, 0));
      setWeekSecs(weekE.reduce((s, e) => s + e.duration, 0));
      setAllTimeSecs(all.reduce((s, e) => s + e.duration, 0));

      const byDate = new Map<string, number>();
      for (const e of weekE) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.duration);
      setDailyData(days7.map(d => ({ label: dayLabel(d), minutes: Math.round((byDate.get(d) ?? 0) / 60) })));

      const rangeEntries = rangeTab === 'today' ? todayE
        : rangeTab === 'week' ? weekE
        : all.filter(e => e.date >= monthStart && e.date <= today);
      const siteMap = new Map<string, number>();
      for (const e of rangeEntries) siteMap.set(e.domain, (siteMap.get(e.domain) ?? 0) + e.duration);
      setTopSites([...siteMap.entries()].map(([domain, seconds]) => ({ domain, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 10));

      setLoading(false);
    })();
  }, [rangeTab]);

  const maxSecs = topSites[0]?.seconds ?? 1;
  const pieData = topSites.slice(0, 6).map(s => ({ name: s.domain, value: s.seconds }));

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="stats-row">
        <StatCard label="Today" value={formatDuration(todaySecs)} />
        <StatCard label="This Week" value={formatDuration(weekSecs)} />
        <StatCard label="All Time" value={formatDuration(allTimeSecs)} />
      </div>

      <section className="card">
        <h2 className="card-title">Daily Activity — Last 7 Days</h2>
        {dailyData.every(d => d.minutes === 0)
          ? <Empty text="Browse for a bit and come back." />
          : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} unit="m" width={36} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#f5f5ff' }} />
                <Bar dataKey="minutes" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title" style={{ margin: 0 }}>Top Sites</h2>
          <RangeTabs value={rangeTab} onChange={setRangeTab} />
        </div>
        {topSites.length === 0
          ? <Empty text="No activity for this period." />
          : (
            <div className="sites-layout">
              <ul className="site-list">
                {topSites.map(({ domain, seconds }, i) => (
                  <li key={domain} className="site-row">
                    <div className="site-name">
                      <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} width={16} height={16} alt="" className="favicon" />
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
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </div>
              )}
            </div>
          )
        }
      </section>
    </>
  );
}

// ── YouTube Tab ──────────────────────────────────────────────────────────────

function YouTubeTab() {
  const [rangeTab, setRangeTab] = useState<RangeTab>('week');
  const [stats, setStats] = useState({ totalWatchedSeconds: 0, uniqueVideos: 0, sessionCount: 0 });
  const [categories, setCategories] = useState<{ category: string; seconds: number }[]>([]);
  const [channels, setChannels] = useState<{ channelName: string; seconds: number }[]>([]);
  const [recent, setRecent] = useState<{ videoId: string; title: string; channelName: string; category: string; watchedSeconds: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { start, end } = getRangeForTab(rangeTab);
      const [s, cats, chans, rec] = await Promise.all([
        getYouTubeStats(start, end),
        getYouTubeByCategoryForRange(start, end),
        getTopChannels(start, end),
        getRecentVideos(15),
      ]);
      setStats(s);
      setCategories(cats);
      setChannels(chans);
      setRecent(rec);
      setLoading(false);
    })();
  }, [rangeTab]);

  const maxCatSecs = categories[0]?.seconds ?? 1;
  const maxChanSecs = channels[0]?.seconds ?? 1;
  const hasSessions = stats.sessionCount > 0;

  return (
    <>
      <div className="stats-row">
        <StatCard label="Watch Time" value={formatDuration(stats.totalWatchedSeconds)} sub={rangeTab} />
        <StatCard label="Videos Watched" value={String(stats.uniqueVideos)} sub={rangeTab} />
        <StatCard label="Sessions" value={String(stats.sessionCount)} sub={rangeTab} />
      </div>

      <div className="range-row">
        <RangeTabs value={rangeTab} onChange={setRangeTab} />
      </div>

      {loading ? <div className="loading">Loading…</div> : !hasSessions ? (
        <div className="card"><Empty text="No YouTube watch sessions recorded yet. Go watch a video and come back." /></div>
      ) : (
        <>
          {/* Category breakdown */}
          <section className="card">
            <h2 className="card-title">Watch Time by Category</h2>
            <div className="sites-layout">
              <ul className="site-list" style={{ flex: 1 }}>
                {categories.map(({ category, seconds }, i) => (
                  <li key={category} className="site-row">
                    <div className="site-name">
                      <span className="cat-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="domain-text">{category}</span>
                    </div>
                    <div className="bar-wrap">
                      <div className="bar" style={{ width: `${(seconds / maxCatSecs) * 100}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="site-time">{formatDuration(seconds)}</span>
                  </li>
                ))}
              </ul>
              {categories.length > 1 && (
                <div className="pie-wrap">
                  <PieChart width={180} height={180}>
                    <Pie data={categories.map(c => ({ name: c.category, value: c.seconds }))} dataKey="value" cx={90} cy={90} innerRadius={50} outerRadius={80} strokeWidth={0}>
                      {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </div>
              )}
            </div>
          </section>

          {/* Top channels */}
          <section className="card">
            <h2 className="card-title">Top Channels</h2>
            <ul className="site-list">
              {channels.map(({ channelName, seconds }, i) => (
                <li key={channelName} className="site-row">
                  <div className="site-name">
                    <span className="channel-initial" style={{ background: COLORS[i % COLORS.length] }}>
                      {channelName.charAt(0).toUpperCase()}
                    </span>
                    <span className="domain-text">{channelName}</span>
                  </div>
                  <div className="bar-wrap">
                    <div className="bar" style={{ width: `${(seconds / maxChanSecs) * 100}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="site-time">{formatDuration(seconds)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Recent videos */}
          <section className="card">
            <h2 className="card-title">Recently Watched</h2>
            <ul className="video-list">
              {recent.map(v => (
                <li key={`${v.videoId}-${v.startedAt}`} className="video-row">
                  <a
                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="video-title"
                  >
                    {v.title}
                  </a>
                  <div className="video-meta">
                    <span className="video-channel">{v.channelName}</span>
                    <span className="video-cat">{v.category}</span>
                    <span className="video-dur">{formatDuration(v.watchedSeconds)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

// ── Shared small components ──────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}{sub ? ` · ${sub}` : ''}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function RangeTabs({ value, onChange }: { value: RangeTab; onChange: (v: RangeTab) => void }) {
  return (
    <div className="view-tabs">
      {(['today', 'week', 'month'] as RangeTab[]).map(v => (
        <button key={v} className={`tab ${value === v ? 'tab-active' : ''}`} onClick={() => onChange(v)}>
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

// ── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<MainTab>('overview');

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="header-left">
          <span className="logo">⚡ WebPulse</span>
        </div>
        <nav className="main-tabs">
          <button className={`main-tab ${tab === 'overview' ? 'main-tab-active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`main-tab ${tab === 'youtube' ? 'main-tab-active' : ''}`} onClick={() => setTab('youtube')}>
            <span className="yt-icon">▶</span> YouTube
          </button>
        </nav>
      </header>

      <main className="dash-main">
        {tab === 'overview' ? <OverviewTab /> : <YouTubeTab />}
      </main>
    </div>
  );
}

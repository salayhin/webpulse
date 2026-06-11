import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { db, type Category } from '../../db';
import { formatDuration, localDate } from '../../lib/hostname';
import {
  getYouTubeStats, getYouTubeByCategoryForRange,
  getTopChannels, getRecentVideos, lastNDays,
  getDailyByCategory, getFocusSessions,
  CATEGORY_KEYS, CATEGORY_COLORS, type CategoryKey,
} from '../../db/queries';

// ── Constants ────────────────────────────────────────────────────────────────

import { exportTimeEntries, exportVideoSessions, exportAll } from '../../lib/export';

const COLORS = ['#6366f1','#8b5cf6','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#94a3b8','#fb923c','#e879f9'];
type MainTab = 'overview' | 'youtube' | 'pomodoro' | 'restrictions' | 'whitelist' | 'notifications' | 'settings';
type RangeTab = 'today' | 'week' | 'month';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRangeForTab(tab: RangeTab): { start: string; end: string } {
  if (tab === 'today') { const t = localDate(); return { start: t, end: t }; }
  if (tab === 'week') return lastNDays(7);
  return lastNDays(30);
}

// ── Custom tooltip ───────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{payload[0].name}</p>
      <p className="tooltip-value">{formatDuration(payload[0].value)}</p>
    </div>
  );
}

function StackedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  const nonZero = payload.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value);
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label} · {formatDuration(total * 60)} total</p>
      {nonZero.map((p: any) => (
        <div key={p.dataKey} className="tooltip-row">
          <span className="cat-dot" style={{ background: p.color, width: 8, height: 8 }} />
          <span style={{ textTransform: 'capitalize', flex: 1 }}>{p.dataKey}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(p.value * 60)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [todaySecs, setTodaySecs] = useState(0);
  const [weekSecs, setWeekSecs] = useState(0);
  const [allTimeSecs, setAllTimeSecs] = useState(0);
  const [dailyStacked, setDailyStacked] = useState<Awaited<ReturnType<typeof getDailyByCategory>>>([]);
  const [visitedSites, setVisitedSites] = useState<{ domain: string; seconds: number; sessions: number }[]>([]);
  const [rangeTotal, setRangeTotal] = useState(0);
  const [sortBy, setSortBy] = useState<'sessions' | 'time'>('time');
  const [domainCats, setDomainCats] = useState<Map<string, Category>>(new Map());
  const [focusSessions, setFocusSessions] = useState<Awaited<ReturnType<typeof getFocusSessions>>>([]);
  const [rangeTab, setRangeTab] = useState<RangeTab>('today');
  const [heat, setHeat] = useState<number[][]>(() => Array.from({ length: 7 }, () => Array(24).fill(0)));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const today = localDate();
        const { start: weekStart } = lastNDays(7);
        const { start: monthStart } = lastNDays(30);

        const all = await db.timeEntries.toArray();
        const todayE = all.filter(e => e.date === today);
        const weekE = all.filter(e => e.date >= weekStart && e.date <= today);

        setTodaySecs(todayE.reduce((s, e) => s + e.duration, 0));
        setWeekSecs(weekE.reduce((s, e) => s + e.duration, 0));
        setAllTimeSecs(all.reduce((s, e) => s + e.duration, 0));

        // Hour × weekday heatmap (minutes), aggregated across all data.
        // Rows: Mon(0)…Sun(6); cols: hour 0…23. Bucketed by each entry's start time.
        const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
        for (const e of all) {
          const d = new Date(e.startedAt);
          const row = (d.getDay() + 6) % 7; // JS Sun=0 → Mon-first ordering
          matrix[row][d.getHours()] += e.duration / 60;
        }
        setHeat(matrix);

        const { start: rangeStart, end: rangeEnd } = getRangeForTab(rangeTab);
        const rangeEntries = rangeTab === 'today' ? todayE
          : rangeTab === 'week' ? weekE
          : all.filter(e => e.date >= monthStart && e.date <= today);

        // Group by domain; count contiguous "sessions" (a gap > 5 min = a new visit)
        const SESSION_GAP_MS = 5 * 60 * 1000;
        const byDomain = new Map<string, { seconds: number; starts: { at: number; dur: number }[] }>();
        for (const e of rangeEntries) {
          let g = byDomain.get(e.domain);
          if (!g) { g = { seconds: 0, starts: [] }; byDomain.set(e.domain, g); }
          g.seconds += e.duration;
          g.starts.push({ at: e.startedAt, dur: e.duration });
        }
        const sites = [...byDomain.entries()].map(([domain, g]) => {
          const ordered = g.starts.sort((a, b) => a.at - b.at);
          let sessions = 0, prevEnd = -Infinity;
          for (const s of ordered) {
            if (s.at - prevEnd > SESSION_GAP_MS) sessions++;
            prevEnd = Math.max(prevEnd, s.at + s.dur * 1000);
          }
          return { domain, seconds: g.seconds, sessions };
        });
        setVisitedSites(sites);
        setRangeTotal(sites.reduce((s, x) => s + x.seconds, 0));

        const [daily, dCats, focus] = await Promise.all([
          getDailyByCategory(7),
          db.domainCategories.toArray(),
          getFocusSessions(rangeStart, rangeEnd),
        ]);
        setDailyStacked(daily);
        setDomainCats(new Map(dCats.map(d => [d.domain, d.category])));
        setFocusSessions(focus);
      } catch (err) {
        console.error('Failed to load overview stats', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [rangeTab]);

  const sortedSites = [...visitedSites].sort((a, b) =>
    sortBy === 'sessions'
      ? (b.sessions - a.sessions) || (b.seconds - a.seconds)
      : (b.seconds - a.seconds)
  );
  const maxSecs = sortedSites.reduce((m, s) => Math.max(m, s.seconds), 1);
  const hasActivity = dailyStacked.some(row =>
    CATEGORY_KEYS.some(k => row[k] > 0)
  );

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="stats-row">
        <StatCard label="Today" value={formatDuration(todaySecs)} />
        <StatCard label="This Week" value={formatDuration(weekSecs)} />
        <StatCard label="All Time" value={formatDuration(allTimeSecs)} />
      </div>

      {/* Activity heatmap — when you're active by hour of day and day of week */}
      <section className="card">
        <h2 className="card-title" style={{ marginBottom: 4 }}>Activity by hour &amp; day</h2>
        <p className="card-subtitle" style={{ marginTop: 0, marginBottom: 16 }}>When you're most active across the week — darker means more time spent</p>
        <HourWeekdayHeatmap data={heat} />
      </section>

      {/* Stacked daily chart by category */}
      <section className="card">
        <h2 className="card-title">Daily Activity by Category — Last 7 Days</h2>
        {!hasActivity ? <Empty text="Browse for a bit and come back." /> : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyStacked} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} unit="m" width={36} />
                <Tooltip content={<StackedTooltip />} cursor={{ fill: '#f5f5ff' }} />
                {CATEGORY_KEYS.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="a"
                    fill={CATEGORY_COLORS[k]}
                    radius={i === CATEGORY_KEYS.length - 1 ? [6, 6, 0, 0] : 0}
                    maxBarSize={48}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <CategoryLegend />
          </>
        )}
      </section>

      {/* Focus sessions */}
      {focusSessions.length > 0 && (
        <section className="card">
          <h2 className="card-title">Focus Sessions · {rangeTab}</h2>
          <ul className="focus-list">
            {focusSessions.slice(0, 6).map(s => {
              const cat = domainCats.get(s.domain);
              return (
                <li key={`${s.domain}-${s.startedAt}`} className="focus-row">
                  <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=16`} width={16} height={16} alt="" className="favicon" />
                  <span className="domain-text" style={{ flex: 1 }}>{s.domain}</span>
                  {cat && (
                    <span className="cat-pill" style={{ background: CATEGORY_COLORS[cat as CategoryKey] + '22', color: '#444' }}>
                      <span className="cat-dot" style={{ background: CATEGORY_COLORS[cat as CategoryKey] }} />
                      {cat}
                    </span>
                  )}
                  <span className="focus-time">{formatDuration(s.durationSecs)}</span>
                  <span className="focus-when">
                    {new Date(s.startedAt).toLocaleString('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Visited sites */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title" style={{ margin: 0 }}>Visited Sites</h2>
          <RangeTabs value={rangeTab} onChange={setRangeTab} />
        </div>

        <div className="visited-toolbar">
          <span className="visited-total">
            {rangeTab === 'today' ? 'Today' : rangeTab === 'week' ? 'This Week' : 'This Month'} · <strong>{formatDuration(rangeTotal)}</strong>
          </span>
          <label className="visited-sort">
            Sort by
            <select value={sortBy} onChange={e => setSortBy(e.target.value as 'sessions' | 'time')}>
              <option value="time">Usage time</option>
              <option value="sessions">Sessions</option>
            </select>
          </label>
        </div>

        {sortedSites.length === 0 ? <Empty text="No activity for this period." /> : (
          <ul className="visited-list">
            {sortedSites.map(({ domain, seconds, sessions }) => {
              const pct = rangeTotal > 0 ? (seconds / rangeTotal) * 100 : 0;
              return (
                <li key={domain} className="visited-row">
                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} width={32} height={32} alt="" className="visited-favicon" />
                  <div className="visited-body">
                    <div className="visited-head">
                      <span className="visited-domain">{domain}</span>
                      <span className="visited-time">{formatDuration(seconds)}</span>
                    </div>
                    <div className="bar-wrap">
                      <div className="bar" style={{ width: `${(seconds / maxSecs) * 100}%`, background: '#4f8df5' }} />
                    </div>
                    <div className="visited-foot">
                      <span className="visited-sessions">{sessions} {sessions === 1 ? 'session' : 'sessions'}</span>
                      <span className="visited-pct">{pct.toFixed(2)} %</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function HourWeekdayHeatmap({ data }: { data: number[][] }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(1, ...data.flat());
  const cellColor = (v: number) => {
    if (v <= 0) return '#ebedf0';
    const alpha = 0.18 + 0.82 * (v / max);
    return `rgba(46, 160, 67, ${alpha.toFixed(3)})`;
  };

  return (
    <div className="heatmap">
      <div className="heatmap-grid">
        <div className="hm-corner" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={`h${h}`} className="hm-hour">{h % 3 === 0 ? h : ''}</div>
        ))}
        {days.map((day, r) => (
          <React.Fragment key={day}>
            <div className="hm-day">{day}</div>
            {data[r].map((v, c) => (
              <div
                key={c}
                className="hm-cell"
                style={{ background: cellColor(v) }}
                title={`${day} ${String(c).padStart(2, '0')}:00 · ${v > 0 ? formatDuration(Math.round(v * 60)) : 'no activity'}`}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="hm-legend">
        <span>less</span>
        {['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'].map(bg => (
          <span key={bg} className="hm-swatch" style={{ background: bg }} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}

function CategoryLegend() {
  return (
    <div className="legend">
      {CATEGORY_KEYS.filter(k => k !== 'uncategorized').map(k => (
        <span key={k} className="legend-item">
          <span className="cat-dot" style={{ background: CATEGORY_COLORS[k] }} />
          <span style={{ textTransform: 'capitalize' }}>{k}</span>
        </span>
      ))}
    </div>
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
      try {
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
      } catch (err) {
        console.error('Failed to load YouTube stats', err);
      } finally {
        setLoading(false);
      }
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

// ── Pomodoro Tab ────────────────────────────────────────────────────────────

interface PomodoroState {
  mode: 'idle' | 'work' | 'rest';
  startedAt: number | null;
  workMins: number;
  restMins: number;
  sessionsCompleted: number;
}

function PomodoroTab() {
  const [pom, setPom] = useState<PomodoroState>({ mode: 'idle', startedAt: null, workMins: 25, restMins: 5, sessionsCompleted: 0 });
  const [displaySecs, setDisplaySecs] = useState(0);
  const [workMinsInput, setWorkMinsInput] = useState('25');
  const [restMinsInput, setRestMinsInput] = useState('5');

  useEffect(() => {
    // Load initial state
    (async () => {
      const data = await chrome.storage.local.get('pomodoro');
      const state = data.pomodoro || pom;
      setPom(state);
    })();
  }, []);

  useEffect(() => {
    if (pom.mode === 'idle') return;
    const interval = setInterval(async () => {
      const data = await chrome.storage.local.get('pomodoro');
      const current = data.pomodoro;
      if (!current || !current.startedAt) {
        setDisplaySecs(0);
        return;
      }
      const duration = (current.mode === 'work' ? current.workMins : current.restMins) * 60;
      const elapsed = Math.floor((Date.now() - current.startedAt) / 1000);
      setDisplaySecs(Math.max(0, duration - elapsed));
      setPom(current);
    }, 1000);
    return () => clearInterval(interval);
  }, [pom.mode]);

  async function startSession() {
    const workMin = Math.max(1, parseInt(workMinsInput) || 25);
    const restMin = Math.max(1, parseInt(restMinsInput) || 5);
    const state: PomodoroState = {
      mode: 'work',
      startedAt: Date.now(),
      workMins: workMin,
      restMins: restMin,
      sessionsCompleted: 0,
    };
    setPom(state);
    await chrome.storage.local.set({ pomodoro: state });
    chrome.alarms.create('pomodoro-work', { delayInMinutes: workMin });
    setDisplaySecs(workMin * 60);
  }

  async function pauseSession() {
    const state = { ...pom, mode: 'idle' as const, startedAt: null };
    setPom(state);
    await chrome.storage.local.set({ pomodoro: state });
    chrome.alarms.clear('pomodoro-work');
    chrome.alarms.clear('pomodoro-rest');
    setDisplaySecs(0);
  }

  async function resetSession() {
    const state = { ...pom, mode: 'idle' as const, startedAt: null, sessionsCompleted: 0 };
    setPom(state);
    await chrome.storage.local.set({ pomodoro: state });
    chrome.alarms.clear('pomodoro-work');
    chrome.alarms.clear('pomodoro-rest');
    setDisplaySecs(0);
  }

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const modeColor = pom.mode === 'work' ? '#6366f1' : pom.mode === 'rest' ? '#34d399' : '#ccc';
  const modeLabel = pom.mode === 'work' ? 'Work' : pom.mode === 'rest' ? 'Rest' : 'Idle';

  return (
    <>
      <section className="card">
        <h2 className="card-title">Pomodoro Timer</h2>

        {/* Timer display */}
        <div className="pomodoro-display" style={{ borderColor: modeColor }}>
          <div className="pom-time">{formatTime(displaySecs)}</div>
          <div className="pom-mode">{modeLabel}{pom.mode !== 'idle' && ` (${pom.sessionsCompleted} complete)`}</div>
        </div>

        {/* Control buttons */}
        {pom.mode === 'idle' ? (
          <>
            <div className="form-group">
              <label>Work Duration (min)</label>
              <input
                type="number"
                className="form-input"
                min="1"
                max="60"
                value={workMinsInput}
                onChange={e => setWorkMinsInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Rest Duration (min)</label>
              <input
                type="number"
                className="form-input"
                min="1"
                max="30"
                value={restMinsInput}
                onChange={e => setRestMinsInput(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-large" onClick={startSession}>
              Start Session
            </button>
          </>
        ) : (
          <>
            <div className="pom-buttons">
              <button className="btn btn-secondary" onClick={pauseSession}>
                Pause
              </button>
              <button className="btn btn-danger" onClick={resetSession}>
                Reset
              </button>
            </div>
            <p className="pom-note">
              {pom.mode === 'work'
                ? '🎯 Focus time. Silence your notifications!'
                : '☕ Take a break. Stretch, hydrate, rest your eyes.'}
            </p>
          </>
        )}
      </section>

    </>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────

function SiteRow({ domain, subtext, onDelete, onEdit }: {
  domain: string;
  subtext?: string;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  return (
    <li className="entry-row">
      <div className="entry-head">
        <button className="icon-btn icon-delete" title="Remove" onClick={onDelete}>✕</button>
        {onEdit && <button className="icon-btn" title="Edit" onClick={onEdit}>✏️</button>}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
          width={16} height={16} alt="" className="favicon"
        />
        <strong className="entry-domain">{domain}</strong>
      </div>
      {subtext && <div className="entry-sub">{subtext}</div>}
    </li>
  );
}

const fmtHM = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

const normalizeDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '');

function RestrictionsTab() {
  const [restrictions, setRestrictions] = useState<Array<{ domain: string; dailyLimitSeconds: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [limitDomain, setLimitDomain] = useState('');
  const [limitMins, setLimitMins] = useState('60');
  const [completelyBlock, setCompletelyBlock] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rests = await db.domainRestrictions.toArray();
        setRestrictions(rests.map(r => ({ domain: r.domain, dailyLimitSeconds: r.dailyLimitSeconds })));
      } catch (err) {
        console.error('Failed to load restrictions', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addLimit() {
    if (!limitDomain.trim()) return;
    const domain = normalizeDomain(limitDomain);
    const seconds = completelyBlock ? 0 : Math.max(0, (parseInt(limitMins) || 0) * 60);
    // put() intentionally drops deferUntil/deferUsedDate — editing a limit resets today's postpone
    await db.domainRestrictions.put({ domain, dailyLimitSeconds: seconds });
    if (editingLimit && editingLimit !== domain) {
      await db.domainRestrictions.delete(editingLimit);
    }
    const rests = await db.domainRestrictions.toArray();
    setRestrictions(rests.map(r => ({ domain: r.domain, dailyLimitSeconds: r.dailyLimitSeconds })));
    setLimitDomain('');
    setLimitMins('60');
    setCompletelyBlock(false);
    setEditingLimit(null);
  }

  async function removeLimit(domain: string) {
    await db.domainRestrictions.delete(domain);
    setRestrictions(prev => prev.filter(r => r.domain !== domain));
    if (editingLimit === domain) {
      setEditingLimit(null);
      setLimitDomain('');
      setLimitMins('60');
      setCompletelyBlock(false);
    }
  }

  function startEditLimit(r: { domain: string; dailyLimitSeconds: number }) {
    setLimitDomain(r.domain);
    setLimitMins(String(Math.round(r.dailyLimitSeconds / 60)));
    setCompletelyBlock(r.dailyLimitSeconds === 0);
    setEditingLimit(r.domain);
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="card">
      <h2 className="card-title">Daily access restrictions for the websites</h2>
      <p className="card-subtitle">Set the maximum time allowed to visit the website per day. After this time, the site will be blocked.</p>
      <p className="card-subtitle" style={{ fontSize: '12px', color: '#666' }}>If you set the blocking time to 0 hours 0 minutes, the website will be blocked immediately</p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Enter website name..."
          value={limitDomain}
          onChange={e => setLimitDomain(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLimit()}
          style={{ flex: 1 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f9f9fc', border: '1px solid #ddd', borderRadius: '8px', padding: '6px 10px', opacity: completelyBlock ? 0.5 : 1 }}>
          <span style={{ fontSize: '12px', color: '#666' }}>📅</span>
          <input
            type="time"
            disabled={completelyBlock}
            value={String(Math.floor((parseInt(limitMins) || 0) / 60)).padStart(2, '0') + ':' + String((parseInt(limitMins) || 0) % 60).padStart(2, '0')}
            onChange={e => {
              const [h, m] = e.target.value.split(':');
              setLimitMins(String(parseInt(h) * 60 + parseInt(m)));
            }}
            style={{ border: 'none', background: 'transparent', fontSize: '13px', color: '#111', cursor: 'pointer', width: '60px', outline: 'none' }}
          />
          <button
            onClick={() => setLimitMins('60')}
            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
          >
            ✕
          </button>
        </div>
        <button className="btn btn-primary" onClick={addLimit} style={{ padding: '8px 20px' }}>
          {editingLimit ? 'Save' : 'Add Website'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <input
          type="checkbox"
          id="completely-block"
          checked={completelyBlock}
          onChange={e => setCompletelyBlock(e.target.checked)}
          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366f1' }}
        />
        <label htmlFor="completely-block" style={{ fontSize: '13px', color: '#333', cursor: 'pointer' }}>Completely Block</label>
      </div>

      <div className="entry-box">
        {restrictions.length > 0 ? (
          <ul className="entry-list">
            {restrictions.map(r => (
              <SiteRow
                key={r.domain}
                domain={r.domain}
                subtext={r.dailyLimitSeconds === 0 ? 'Completely Blocked' : `Limit : ${fmtHM(Math.round(r.dailyLimitSeconds / 60))}`}
                onDelete={() => removeLimit(r.domain)}
                onEdit={() => startEditLimit(r)}
              />
            ))}
          </ul>
        ) : (
          <p className="entry-empty">No restrictions yet</p>
        )}
      </div>
    </section>
  );
}

function WhitelistTab() {
  const [ignored, setIgnored] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [whitelistDomain, setWhitelistDomain] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const settings = await db.settings.get('default');
        setIgnored(settings?.ignoredDomains ?? []);
      } catch (err) {
        console.error('Failed to load whitelist', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addWhitelist() {
    if (!whitelistDomain.trim()) return;
    const domain = normalizeDomain(whitelistDomain);
    const updated = ignored.includes(domain) ? ignored : [...ignored, domain];
    await db.settings.update('default', { ignoredDomains: updated });
    setIgnored(updated);
    setWhitelistDomain('');
  }

  async function removeWhitelist(domain: string) {
    const updated = ignored.filter(d => d !== domain);
    await db.settings.update('default', { ignoredDomains: updated });
    setIgnored(updated);
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="card">
      <h2 className="card-title">Activity and spent time for these websites will not be tracked</h2>

      <div className="entry-box">
        {ignored.length > 0 ? (
          <ul className="entry-list">
            {ignored.map(d => (
              <SiteRow key={d} domain={d} onDelete={() => removeWhitelist(d)} />
            ))}
          </ul>
        ) : (
          <p className="entry-empty">No whitelisted sites yet</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Enter website name..."
          value={whitelistDomain}
          onChange={e => setWhitelistDomain(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addWhitelist()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={addWhitelist} style={{ padding: '8px 20px' }}>Add Website</button>
      </div>
    </section>
  );
}

function NotificationsTab() {
  const [notifyWebsites, setNotifyWebsites] = useState<Array<{ domain: string; intervalMins: number }>>([]);
  const [notifyDailyEnabled, setNotifyDailyEnabled] = useState(true);
  const [notifyDailyTime, setNotifyDailyTime] = useState('20:00');
  const [notifyMessage, setNotifyMessage] = useState('You have spent a lot of time on this site');
  const [loading, setLoading] = useState(true);
  const [notifyWebsite, setNotifyWebsite] = useState('');
  const [notifyInterval, setNotifyInterval] = useState('30');
  const [editingNotify, setEditingNotify] = useState<string | null>(null);

  function startEditNotify(n: { domain: string; intervalMins: number }) {
    setNotifyWebsite(n.domain);
    setNotifyInterval(String(n.intervalMins));
    setEditingNotify(n.domain);
  }

  async function rescheduleDailyRecap(timeStr: string) {
    await chrome.alarms.clear('daily-recap');
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (now > next) next.setDate(next.getDate() + 1);
    chrome.alarms.create('daily-recap', {
      delayInMinutes: Math.ceil((next.getTime() - now.getTime()) / 60000),
      periodInMinutes: 24 * 60,
    });
  }

  useEffect(() => {
    (async () => {
      try {
        const settings = await db.settings.get('default');
        setNotifyDailyEnabled(settings?.notifyDailyEnabled ?? true);
        setNotifyDailyTime(settings?.notifyDailyTime ?? '20:00');
        setNotifyWebsites(settings?.notifyWebsites ?? []);
        setNotifyMessage(settings?.notifyMessage ?? 'You have spent a lot of time on this site');
      } catch (err) {
        console.error('Failed to load notification settings', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addNotifyWebsite() {
    if (!notifyWebsite.trim()) return;
    const domain = normalizeDomain(notifyWebsite);
    const intervalMins = Math.max(1, parseInt(notifyInterval) || 30);
    let updated = notifyWebsites.find(n => n.domain === domain)
      ? notifyWebsites.map(n => (n.domain === domain ? { domain, intervalMins } : n))
      : [...notifyWebsites, { domain, intervalMins }];
    if (editingNotify && editingNotify !== domain) {
      updated = updated.filter(n => n.domain !== editingNotify);
    }
    setNotifyWebsites(updated);
    await db.settings.update('default', { notifyWebsites: updated });
    setNotifyWebsite('');
    setNotifyInterval('30');
    setEditingNotify(null);
  }

  async function removeNotifyWebsite(domain: string) {
    const updated = notifyWebsites.filter(n => n.domain !== domain);
    setNotifyWebsites(updated);
    await db.settings.update('default', { notifyWebsites: updated });
    if (editingNotify === domain) {
      setEditingNotify(null);
      setNotifyWebsite('');
      setNotifyInterval('30');
    }
  }

  async function saveNotificationSettings() {
    await db.settings.update('default', {
      notifyDailyEnabled,
      notifyDailyTime,
      notifyWebsites,
      notifyMessage,
    });
    await rescheduleDailyRecap(notifyDailyTime);
  }

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => saveNotificationSettings(), 500);
    return () => clearTimeout(timer);
  }, [notifyDailyEnabled, notifyDailyTime, notifyMessage, notifyWebsites]);

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <input
          type="checkbox"
          id="notify-daily"
          checked={notifyDailyEnabled}
          onChange={e => setNotifyDailyEnabled(e.target.checked)}
          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#6366f1' }}
        />
        <label htmlFor="notify-daily" style={{ fontSize: '15px', fontWeight: '600', color: '#111', cursor: 'pointer', margin: 0 }}>
          Daily Summary Notifications
        </label>
      </div>
      <p className="card-subtitle" style={{ marginBottom: '16px' }}>At the end of each day, you will receive a notification with a summary of your daily usage</p>

      {notifyDailyEnabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <label style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: '#111' }}>
            Notification time with summary information about your daily usage
          </label>
          <input
            type="time"
            value={notifyDailyTime}
            onChange={e => setNotifyDailyTime(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', color: '#111', fontFamily: 'inherit' }}
          />
        </div>
      )}

      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111', margin: '16px 0 4px' }}>Notifications for websites</h3>
      <p className="card-subtitle" style={{ fontSize: '12px', marginBottom: '12px' }}>Show notifications every time you spend a selected period of time on the website</p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Enter website name..."
          value={notifyWebsite}
          onChange={e => setNotifyWebsite(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNotifyWebsite()}
          style={{ flex: 1 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f9f9fc', border: '1px solid #ddd', borderRadius: '8px', padding: '6px 10px' }}>
          <span style={{ fontSize: '12px', color: '#666' }}>📅</span>
          <input
            type="time"
            value={String(Math.floor((parseInt(notifyInterval) || 0) / 60)).padStart(2, '0') + ':' + String((parseInt(notifyInterval) || 0) % 60).padStart(2, '0')}
            onChange={e => {
              const [h, m] = e.target.value.split(':');
              setNotifyInterval(String(parseInt(h) * 60 + parseInt(m)));
            }}
            style={{ border: 'none', background: 'transparent', fontSize: '13px', color: '#111', cursor: 'pointer', width: '60px', outline: 'none' }}
          />
          <button
            onClick={() => setNotifyInterval('30')}
            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
          >
            ✕
          </button>
        </div>
        <button className="btn btn-primary" onClick={addNotifyWebsite} style={{ padding: '8px 20px' }}>
          {editingNotify ? 'Save' : 'Add Website'}
        </button>
      </div>

      <div className="entry-box">
        {notifyWebsites.length > 0 ? (
          <ul className="entry-list">
            {notifyWebsites.map(n => (
              <SiteRow
                key={n.domain}
                domain={n.domain}
                subtext={`Limit : ${fmtHM(n.intervalMins)}`}
                onDelete={() => removeNotifyWebsite(n.domain)}
                onEdit={() => startEditNotify(n)}
              />
            ))}
          </ul>
        ) : (
          <p className="entry-empty">No per-website notifications yet</p>
        )}
      </div>

      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111', margin: '16px 0 4px' }}>Notification message</h3>
      <p className="card-subtitle" style={{ fontSize: '12px', marginBottom: '12px' }}>You will see this message in notification for websites every time</p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <textarea
          value={notifyMessage}
          onChange={e => setNotifyMessage(e.target.value)}
          placeholder="You have spent a lot of time on this site"
          rows={2}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', color: '#111', fontFamily: 'inherit', resize: 'vertical' }}
        />
        <button className="btn btn-primary" onClick={saveNotificationSettings} style={{ padding: '8px 20px', marginTop: '0' }}>Save</button>
      </div>
    </section>
  );
}

function SettingsTab() {
  return (
    <section className="card">
      <h2 className="card-title">Export Data</h2>
      <p className="card-subtitle">Download your activity and video watch history as CSV files.</p>
      <div className="export-buttons">
        <button className="btn btn-primary" onClick={() => exportVideoSessions()}>
          📹 Export YouTube Only
        </button>
        <button className="btn btn-primary" onClick={() => exportTimeEntries()}>
          🌐 Export Browsing Only
        </button>
        <button className="btn btn-secondary" onClick={() => exportAll()}>
          📥 Export All Data
        </button>
      </div>
    </section>
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

// ── Error boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: 24 }}>
          <h2 className="card-title">Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#b91c1c' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<MainTab>('overview');

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <button className="logo" onClick={() => setTab('overview')} title="Home" aria-label="Home">⚡ WebPulse</button>
        <nav className="main-tabs">
          <button className={`main-tab ${tab === 'overview' ? 'main-tab-active' : ''}`} onClick={() => setTab('overview')}>📊 Dashboard</button>
          <button className={`main-tab ${tab === 'youtube' ? 'main-tab-active' : ''}`} onClick={() => setTab('youtube')}>
            <span className="yt-icon">▶</span> YouTube
          </button>
          <button className={`main-tab ${tab === 'pomodoro' ? 'main-tab-active' : ''}`} onClick={() => setTab('pomodoro')}>
            ⏱️ Pomodoro
          </button>
          <button className={`main-tab ${tab === 'restrictions' ? 'main-tab-active' : ''}`} onClick={() => setTab('restrictions')}>
            🚫 Restrictions
          </button>
          <button className={`main-tab ${tab === 'whitelist' ? 'main-tab-active' : ''}`} onClick={() => setTab('whitelist')}>
            ✅ Whitelist
          </button>
          <button className={`main-tab ${tab === 'notifications' ? 'main-tab-active' : ''}`} onClick={() => setTab('notifications')}>
            🔔 Notifications
          </button>
          <button className={`main-tab ${tab === 'settings' ? 'main-tab-active' : ''}`} onClick={() => setTab('settings')}>
            ⚙️ Settings
          </button>
        </nav>
      </aside>

      <main className="dash-main">
        <ErrorBoundary>
          {tab === 'overview' ? <OverviewTab /> : tab === 'youtube' ? <YouTubeTab /> : tab === 'pomodoro' ? <PomodoroTab /> : tab === 'restrictions' ? <RestrictionsTab /> : tab === 'whitelist' ? <WhitelistTab /> : tab === 'notifications' ? <NotificationsTab /> : <SettingsTab />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

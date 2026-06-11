import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { db, type Category } from '../../db';
import { formatDuration, localDate } from '../../lib/hostname';
import {
  getYouTubeStats, getYouTubeByCategoryForRange,
  getTopChannels, getRecentVideos, lastNDays, getTimeByCategory,
  getDailyByCategory, getFocusSessions,
  CATEGORY_KEYS, CATEGORY_COLORS, type CategoryKey,
} from '../../db/queries';

// ── Constants ────────────────────────────────────────────────────────────────

import { exportTimeEntries, exportVideoSessions, exportAll } from '../../lib/export';

const COLORS = ['#6366f1','#8b5cf6','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#94a3b8','#fb923c','#e879f9'];
const MANUAL_CATS: Category[] = ['productivity', 'social', 'entertainment', 'news', 'education', 'other'];
type MainTab = 'overview' | 'youtube' | 'pomodoro' | 'settings';
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
  const [topSites, setTopSites] = useState<{ domain: string; seconds: number }[]>([]);
  const [catData, setCatData] = useState<{ category: string; seconds: number }[]>([]);
  const [domainCats, setDomainCats] = useState<Map<string, Category>>(new Map());
  const [focusSessions, setFocusSessions] = useState<Awaited<ReturnType<typeof getFocusSessions>>>([]);
  const [rangeTab, setRangeTab] = useState<RangeTab>('today');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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

        const { start: rangeStart, end: rangeEnd } = getRangeForTab(rangeTab);
        const rangeEntries = rangeTab === 'today' ? todayE
          : rangeTab === 'week' ? weekE
          : all.filter(e => e.date >= monthStart && e.date <= today);
        const siteMap = new Map<string, number>();
        for (const e of rangeEntries) siteMap.set(e.domain, (siteMap.get(e.domain) ?? 0) + e.duration);
        setTopSites(
          [...siteMap.entries()]
            .map(([domain, seconds]) => ({ domain, seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 10)
        );

        const [cats, daily, dCats, focus] = await Promise.all([
          getTimeByCategory(rangeStart, rangeEnd),
          getDailyByCategory(7),
          db.domainCategories.toArray(),
          getFocusSessions(rangeStart, rangeEnd),
        ]);
        setCatData(cats);
        setDailyStacked(daily);
        setDomainCats(new Map(dCats.map(d => [d.domain, d.category])));
        setFocusSessions(focus);
      } catch (err) {
        console.error('Failed to load overview stats', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [rangeTab, refreshKey]);

  async function setDomainCategory(domain: string, category: Category) {
    await db.domainCategories.put({ domain, category, isManual: true });
    setRefreshKey(k => k + 1);
  }

  const maxSecs = topSites[0]?.seconds ?? 1;
  const maxCatSecs = catData[0]?.seconds ?? 1;
  const pieData = topSites.slice(0, 6).map(s => ({ name: s.domain, value: s.seconds }));
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

      {/* Time by category */}
      {catData.length > 0 && (
        <section className="card">
          <h2 className="card-title">Time by Category</h2>
          <ul className="site-list">
            {catData.map(({ category, seconds }) => {
              const color = CATEGORY_COLORS[category as CategoryKey] ?? '#94a3b8';
              return (
                <li key={category} className="site-row">
                  <div className="site-name">
                    <span className="cat-dot" style={{ background: color }} />
                    <span className="domain-text" style={{ textTransform: 'capitalize' }}>{category}</span>
                  </div>
                  <div className="bar-wrap">
                    <div className="bar" style={{ width: `${(seconds / maxCatSecs) * 100}%`, background: color }} />
                  </div>
                  <span className="site-time">{formatDuration(seconds)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Top sites with category override */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title" style={{ margin: 0 }}>Top Sites</h2>
          <RangeTabs value={rangeTab} onChange={setRangeTab} />
        </div>
        {topSites.length === 0 ? <Empty text="No activity for this period." /> : (
          <div className="sites-layout">
            <ul className="site-list">
              {topSites.map(({ domain, seconds }, i) => {
                const cat = domainCats.get(domain);
                return (
                  <li key={domain} className="site-row site-row-with-cat">
                    <div className="site-name">
                      <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} width={16} height={16} alt="" className="favicon" />
                      <span className="domain-text">{domain}</span>
                    </div>
                    <div className="bar-wrap">
                      <div className="bar" style={{ width: `${(seconds / maxSecs) * 100}%`, background: cat ? CATEGORY_COLORS[cat as CategoryKey] : COLORS[i % COLORS.length] }} />
                    </div>
                    <CategoryPicker
                      value={cat ?? null}
                      onChange={c => setDomainCategory(domain, c)}
                    />
                    <span className="site-time">{formatDuration(seconds)}</span>
                  </li>
                );
              })}
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
        )}
      </section>
    </>
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

function CategoryPicker({ value, onChange }: { value: Category | null; onChange: (c: Category) => void }) {
  return (
    <select
      className="cat-picker"
      value={value ?? ''}
      onChange={e => e.target.value && onChange(e.target.value as Category)}
      style={value ? { borderColor: CATEGORY_COLORS[value as CategoryKey], color: '#333' } : undefined}
      title="Set category"
    >
      <option value="" disabled>—</option>
      {MANUAL_CATS.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
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

function SettingsTab() {
  const [restrictions, setRestrictions] = useState<Array<{ domain: string; dailyLimitSeconds: number }>>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [notifyWebsites, setNotifyWebsites] = useState<Array<{ domain: string; intervalMins: number }>>([]);
  const [notifyDailyEnabled, setNotifyDailyEnabled] = useState(true);
  const [notifyDailyTime, setNotifyDailyTime] = useState('20:00');
  const [notifyMessage, setNotifyMessage] = useState('You have spent a lot of time on this site');
  const [loading, setLoading] = useState(true);
  const [limitDomain, setLimitDomain] = useState('');
  const [limitMins, setLimitMins] = useState('60');
  const [completelyBlock, setCompletelyBlock] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  const [whitelistDomain, setWhitelistDomain] = useState('');
  const [notifyWebsite, setNotifyWebsite] = useState('');
  const [notifyInterval, setNotifyInterval] = useState('30');

  useEffect(() => {
    (async () => {
      try {
        const rests = await db.domainRestrictions.toArray();
        setRestrictions(rests.map(r => ({ domain: r.domain, dailyLimitSeconds: r.dailyLimitSeconds })));
        const settings = await db.settings.get('default');
        setIgnored(settings?.ignoredDomains ?? []);
        setNotifyDailyEnabled(settings?.notifyDailyEnabled ?? true);
        setNotifyDailyTime(settings?.notifyDailyTime ?? '20:00');
        setNotifyWebsites(settings?.notifyWebsites ?? []);
        setNotifyMessage(settings?.notifyMessage ?? 'You have spent a lot of time on this site');
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const normalizeDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '');

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

  async function addNotifyWebsite() {
    if (!notifyWebsite.trim()) return;
    const domain = normalizeDomain(notifyWebsite);
    const intervalMins = Math.max(1, parseInt(notifyInterval));
    const updated = notifyWebsites.find(n => n.domain === domain)
      ? notifyWebsites.map(n => n.domain === domain ? { domain, intervalMins } : n)
      : [...notifyWebsites, { domain, intervalMins }];
    setNotifyWebsites(updated);
    await db.settings.update('default', { notifyWebsites: updated });
    setNotifyWebsite('');
    setNotifyInterval('30');
  }

  async function removeNotifyWebsite(domain: string) {
    const updated = notifyWebsites.filter(n => n.domain !== domain);
    setNotifyWebsites(updated);
    await db.settings.update('default', { notifyWebsites: updated });
  }

  async function saveNotificationSettings() {
    await db.settings.update('default', {
      notifyDailyEnabled,
      notifyDailyTime,
      notifyWebsites,
      notifyMessage,
    });
  }

  useEffect(() => {
    const timer = setTimeout(() => saveNotificationSettings(), 500);
    return () => clearTimeout(timer);
  }, [notifyDailyEnabled, notifyDailyTime, notifyMessage, notifyWebsites]);

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      {/* Daily Limits */}
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

      {/* Whitelist */}
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

      {/* Notifications */}
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
        <p className="card-subtitle" style={{ marginBottom: '12px' }}>At the end of each day, you will receive a notification with a summary of your daily usage</p>

        {notifyDailyEnabled && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#333', marginBottom: '8px' }}>Notification time with summary information about your daily usage</label>
            <input
              type="time"
              value={notifyDailyTime}
              onChange={e => setNotifyDailyTime(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', color: '#111', fontFamily: 'inherit', width: '100px' }}
            />
          </div>
        )}

        <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#111', margin: '16px 0 8px', textTransform: 'capitalize' }}>Notifications for websites</h3>
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
              value={String(Math.floor(parseInt(notifyInterval) / 60)).padStart(2, '0') + ':' + String(parseInt(notifyInterval) % 60).padStart(2, '0')}
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
          <button className="btn btn-primary" onClick={addNotifyWebsite} style={{ padding: '8px 20px' }}>Add Website</button>
        </div>

        <div style={{ border: '1px solid #e5e5ec', borderRadius: '10px', padding: '16px', backgroundColor: '#fff', minHeight: '150px', marginBottom: '16px' }}>
          {notifyWebsites.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notifyWebsites.map(n => (
                <li key={n.domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#f9f9fc', borderRadius: '8px', border: '1px solid #f0f0f5' }}>
                  <span style={{ fontSize: '13px', color: '#333' }}>{n.domain} · {n.intervalMins}min</span>
                  <button className="btn btn-small btn-danger" onClick={() => removeNotifyWebsite(n.domain)}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999', textAlign: 'center', margin: 0, lineHeight: '150px' }}>No per-website notifications yet</p>
          )}
        </div>

        <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#111', margin: '0 0 8px', textTransform: 'capitalize' }}>Notification message</h3>
        <p className="card-subtitle" style={{ fontSize: '12px', marginBottom: '12px' }}>You will see this message in notification for websites every time</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <textarea
            value={notifyMessage}
            onChange={e => setNotifyMessage(e.target.value)}
            placeholder="You have spent a lot of time on this site"
            rows={3}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', color: '#111', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <button className="btn btn-primary" onClick={saveNotificationSettings} style={{ padding: '8px 20px', marginTop: '0' }}>Save</button>
        </div>
      </section>

      {/* Export Data */}
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
      <header className="dash-header">
        <div className="header-left">
          <span className="logo">⚡ WebPulse</span>
        </div>
        <nav className="main-tabs">
          <button className={`main-tab ${tab === 'overview' ? 'main-tab-active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`main-tab ${tab === 'youtube' ? 'main-tab-active' : ''}`} onClick={() => setTab('youtube')}>
            <span className="yt-icon">▶</span> YouTube
          </button>
          <button className={`main-tab ${tab === 'pomodoro' ? 'main-tab-active' : ''}`} onClick={() => setTab('pomodoro')}>
            ⏱️ Pomodoro
          </button>
          <button className={`main-tab ${tab === 'settings' ? 'main-tab-active' : ''}`} onClick={() => setTab('settings')}>
            ⚙️ Settings
          </button>
        </nav>
      </header>

      <main className="dash-main">
        <ErrorBoundary>
          {tab === 'overview' ? <OverviewTab /> : tab === 'youtube' ? <YouTubeTab /> : tab === 'pomodoro' ? <PomodoroTab /> : <SettingsTab />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

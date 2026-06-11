import React, { useEffect, useState } from 'react';
import { db, type TimeEntry } from '../../db';
import { formatDuration, localDate } from '../../lib/hostname';

interface SiteTime {
  domain: string;
  seconds: number;
}

export default function App() {
  const [sites, setSites] = useState<SiteTime[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.timeEntries
      .where('date')
      .equals(localDate())
      .toArray()
      .then((entries: TimeEntry[]) => {
        const map = new Map<string, number>();
        for (const e of entries) {
          map.set(e.domain, (map.get(e.domain) ?? 0) + e.duration);
        }
        const sorted = [...map.entries()]
          .map(([domain, seconds]) => ({ domain, seconds }))
          .sort((a, b) => b.seconds - a.seconds);
        setSites(sorted);
        setTotal(sorted.reduce((s, x) => s + x.seconds, 0));
        setLoading(false);
      });
  }, []);

  return (
    <div className="container">
      <header>
        <span className="logo">⚡ WebPulse</span>
        <span className="total">{formatDuration(total)} today</span>
      </header>

      <button
        className="dash-btn"
        onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })}
      >
        Open Dashboard →
      </button>

      {loading ? (
        <p className="empty">Loading…</p>
      ) : sites.length === 0 ? (
        <p className="empty">No activity tracked today yet.</p>
      ) : (
        <ul className="site-list">
          {sites.slice(0, 12).map(({ domain, seconds }) => {
            const pct = total > 0 ? (seconds / total) * 100 : 0;
            return (
              <li key={domain} className="site-item">
                <div className="site-info">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                    width={16}
                    height={16}
                    alt=""
                    className="favicon"
                  />
                  <span className="domain">{domain}</span>
                </div>
                <div className="site-bar-wrap">
                  <div className="site-bar" style={{ width: `${pct}%` }} />
                </div>
                <span className="time">{formatDuration(seconds)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

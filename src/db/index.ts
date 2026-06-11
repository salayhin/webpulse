import Dexie, { type Table } from 'dexie';

export interface TimeEntry {
  id?: number;
  domain: string;
  startedAt: number;
  duration: number;
  date: string;
  wasAudible: boolean;
}

export interface VideoSession {
  id?: number;
  videoId: string;
  title: string;
  channelName: string;
  category: string;
  watchedSeconds: number;
  date: string;
  startedAt: number;
}

export type Category =
  | 'productivity'
  | 'social'
  | 'entertainment'
  | 'news'
  | 'education'
  | 'other';

export interface DomainCategory {
  domain: string;
  category: Category;
  isManual: boolean;
}

export interface DomainRestriction {
  domain: string;        // primary key
  dailyLimitSeconds: number;
  deferUntil?: number;   // unix ms; if set and > now, block is deferred
}

export interface WebPulseSettings {
  key: 'default';        // single-document pattern
  ignoredDomains: string[];
  notifyDailyEnabled?: boolean;
  notifyDailyTime?: string;
  notifyWebsites?: Array<{ domain: string; intervalMins: number }>;
  notifyMessage?: string;
}

class WebPulseDB extends Dexie {
  timeEntries!: Table<TimeEntry>;
  videoSessions!: Table<VideoSession>;
  domainCategories!: Table<DomainCategory>;
  domainRestrictions!: Table<DomainRestriction>;
  settings!: Table<WebPulseSettings>;

  constructor() {
    super('WebPulseDB');
    this.version(1).stores({
      timeEntries: '++id, domain, date, startedAt',
      videoSessions: '++id, videoId, date, channelName, category',
      domainCategories: 'domain',
    });
    // v2: index startedAt so getRecentVideos() can orderBy it.
    this.version(2).stores({
      timeEntries: '++id, domain, date, startedAt',
      videoSessions: '++id, videoId, date, channelName, category, startedAt',
      domainCategories: 'domain',
    });
    // v3: restrictions + settings for blocking + whitelist (Session 4)
    this.version(3).stores({
      timeEntries: '++id, domain, date, startedAt',
      videoSessions: '++id, videoId, date, channelName, category, startedAt',
      domainCategories: 'domain',
      domainRestrictions: 'domain',
      settings: 'key',
    });
    // v4: notification settings (Session 5)
    this.version(4).stores({
      timeEntries: '++id, domain, date, startedAt',
      videoSessions: '++id, videoId, date, channelName, category, startedAt',
      domainCategories: 'domain',
      domainRestrictions: 'domain',
      settings: 'key',
    });
  }
}

export const db = new WebPulseDB();

// Ensure settings doc exists
db.settings.count().then(count => {
  if (count === 0) {
    db.settings.put({
      key: 'default',
      ignoredDomains: [],
      notifyDailyEnabled: true,
      notifyDailyTime: '20:00',
      notifyWebsites: [],
      notifyMessage: 'You have spent a lot of time on this site',
    }).catch(() => {});
  }
});

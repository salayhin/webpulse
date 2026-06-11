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

class WebPulseDB extends Dexie {
  timeEntries!: Table<TimeEntry>;
  videoSessions!: Table<VideoSession>;
  domainCategories!: Table<DomainCategory>;

  constructor() {
    super('WebPulseDB');
    this.version(1).stores({
      timeEntries: '++id, domain, date, startedAt',
      videoSessions: '++id, videoId, date, channelName, category',
      domainCategories: 'domain',
    });
  }
}

export const db = new WebPulseDB();

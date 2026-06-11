import { db } from '../db';
import { extractHostname, localDate } from '../lib/hostname';

interface ActiveSession {
  tabId: number;
  domain: string;
  startedAt: number;
  wasAudible: boolean;
}

let activeSession: ActiveSession | null = null;

async function flushSession(now = Date.now()): Promise<void> {
  if (!activeSession) return;
  const session = activeSession;
  activeSession = null;

  const duration = Math.round((now - session.startedAt) / 1000);
  if (duration < 1) return;

  try {
    await db.timeEntries.add({
      domain: session.domain,
      startedAt: session.startedAt,
      duration,
      date: localDate(session.startedAt),
      wasAudible: session.wasAudible,
    });
  } catch (err) {
    console.error('[WebPulse] Failed to save time entry:', err);
  }
}

async function startSession(tabId: number, url: string | undefined, audible: boolean): Promise<void> {
  if (!url) return;
  if (
    url.startsWith('chrome://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://')
  ) return;

  const domain = extractHostname(url);
  if (!domain) return;

  // Same tab and domain — just update audible state, no flush
  if (activeSession?.tabId === tabId && activeSession?.domain === domain) {
    activeSession.wasAudible = audible;
    return;
  }

  await flushSession();
  activeSession = { tabId, domain, startedAt: Date.now(), wasAudible: audible };
}

async function captureCurrentTab(): Promise<void> {
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const focused = windows.find(w => w.focused);
    if (!focused?.tabs) return;
    const tab = focused.tabs.find(t => t.active);
    if (!tab?.id) return;
    await startSession(tab.id, tab.url, tab.audible ?? false);
  } catch {
    // Browser may be shutting down or this is a headless test env
  }
}

export default defineBackground(async () => {
  // Ensure alarm exists (safe to call on every SW start)
  const existing = await chrome.alarms.get('heartbeat');
  if (!existing) {
    chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
  }

  // Capture the tab the user is already on when SW starts/restarts
  await captureCurrentTab();

  // ── Tab activation ───────────────────────────────────────────────────
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    await startSession(tabId, tab.url, tab.audible ?? false);
  });

  // ── URL change or audible state change in active tab ─────────────────
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.audible !== undefined && activeSession?.tabId === tabId) {
      activeSession.wasAudible = changeInfo.audible;
    }
    if (changeInfo.status === 'complete' && tab.active) {
      const win = await chrome.windows.get(tab.windowId).catch(() => null);
      if (!win?.focused) return;
      await startSession(tabId, tab.url, tab.audible ?? false);
    }
  });

  // ── Tab closed ───────────────────────────────────────────────────────
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (activeSession?.tabId === tabId) {
      await flushSession();
    }
  });

  // ── Window focus ─────────────────────────────────────────────────────
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await flushSession();
      return;
    }
    const win = await chrome.windows.get(windowId, { populate: true }).catch(() => null);
    if (!win?.tabs) return;
    const tab = win.tabs.find(t => t.active);
    if (!tab?.id) return;
    await startSession(tab.id, tab.url, tab.audible ?? false);
  });

  // ── System idle detection ────────────────────────────────────────────
  chrome.idle.setDetectionInterval(30);
  chrome.idle.onStateChanged.addListener(async (state) => {
    if (state === 'idle' || state === 'locked') {
      // Keep tracking if media is playing (user is watching/listening)
      if (!activeSession?.wasAudible) {
        await flushSession();
      }
    } else if (state === 'active') {
      if (!activeSession) {
        await captureCurrentTab();
      }
    }
  });

  // ── Heartbeat: flush + restart every minute ──────────────────────────
  // This also handles SW restarts — a killed SW has no activeSession,
  // so flushSession() is a no-op and captureCurrentTab() picks back up.
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'heartbeat') return;
    await flushSession();
    await captureCurrentTab();
  });

  // ── Content script messages ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'ACTIVITY_PING') {
      if (!activeSession) captureCurrentTab();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'YOUTUBE_SESSION') {
      db.videoSessions.add({
        videoId: message.videoId,
        title: message.title,
        channelName: message.channelName,
        category: message.category,
        watchedSeconds: message.watchedSeconds,
        date: localDate(message.startedAt),
        startedAt: message.startedAt,
      }).catch((err: unknown) => console.error('[WebPulse] Failed to save video session:', err));
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
});

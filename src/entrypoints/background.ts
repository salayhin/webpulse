import { db, type Category } from '../db';
import { extractHostname, localDate } from '../lib/hostname';
import { categorizeDomain, categorizeYouTubeTitle, DOMAIN_CATS } from '../lib/ai-categorize';
import { staticCategorize } from '../lib/classifier';
import { evaluateRestriction } from '../lib/blocking';
import { dueNotifyMultiple } from '../lib/notify-logic';

interface ActiveSession {
  tabId: number;
  domain: string;
  startedAt: number;
  wasAudible: boolean;
}

let activeSession: ActiveSession | null = null;

// ── AI classification (via offscreen document) ─────────────────────────
// LanguageModel is not guaranteed in MV3 service workers; offscreen
// documents are full extension pages where the Prompt API works.

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS' as chrome.offscreen.Reason],
        justification: 'Run on-device AI (Gemini Nano) to categorize domains and videos',
      })
      .catch((err) => {
        // "Only a single offscreen document may be created" — racing is fine
        if (!String(err?.message).includes('single offscreen')) throw err;
      })
      .finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function playPomodoroSound(soundId: string): Promise<void> {
  await ensureOffscreen();
  await chrome.runtime
    .sendMessage({ target: 'webpulse-offscreen', kind: 'pomodoro-sound', soundId })
    .catch(() => {});
}

type AiRequest =
  | { kind: 'domain'; domain: string }
  | { kind: 'video'; title: string; channelName: string };

async function aiClassify(req: AiRequest): Promise<string | null> {
  // Direct path if the SW exposes the API (newer Chrome versions)
  if ('LanguageModel' in globalThis) {
    return req.kind === 'domain'
      ? categorizeDomain(req.domain)
      : categorizeYouTubeTitle(req.title, req.channelName);
  }
  try {
    await ensureOffscreen();
    const res = await chrome.runtime.sendMessage({ target: 'webpulse-offscreen', ...req });
    return res?.category ?? null;
  } catch (err) {
    console.warn('[WebPulse] AI classify via offscreen failed:', err);
    return null;
  }
}

const domainCatInFlight = new Set<string>();

async function categorizeDomainOnce(domain: string): Promise<void> {
  if (domainCatInFlight.has(domain)) return;
  domainCatInFlight.add(domain);
  try {
    // Skip if already categorized (manual or auto)
    if (await db.domainCategories.get(domain)) return;

    // Layer 1: static rule map — instant, no AI call
    const staticCat = staticCategorize(domain);
    if (staticCat) {
      await db.domainCategories.put({ domain, category: staticCat, isManual: false });
      return;
    }

    // Layer 2: on-device AI fallback
    const cat = await aiClassify({ kind: 'domain', domain });
    console.log('[WebPulse] AI domain category:', domain, '→', cat);
    if (cat && (DOMAIN_CATS as readonly string[]).includes(cat)) {
      await db.domainCategories.put({ domain, category: cat as Category, isManual: false });
    }
  } catch (err) {
    console.warn('[WebPulse] Domain categorization failed:', domain, err);
  } finally {
    domainCatInFlight.delete(domain);
  }
}

const NOTIFY_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Ccircle cx="32" cy="32" r="30" fill="%236366f1"/%3E%3Ctext x="50%25" y="50%25" font-size="32" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central"%3E⏱%3C/text%3E%3C/svg%3E';

async function checkWebsiteNotifications(domain: string): Promise<void> {
  try {
    const settings = await db.settings.get('default');
    const cfg = settings?.notifyWebsites?.find(n => n.domain === domain);
    if (!cfg) return;

    const today = localDate();
    const todayEntries = await db.timeEntries.where('date').equals(today).toArray();
    const cumulative = todayEntries
      .filter(e => e.domain === domain)
      .reduce((s, e) => s + e.duration, 0);

    const stored = await chrome.storage.local.get('notifyState');
    const notifyState: Record<string, { date: string; lastMultiple: number }> =
      stored.notifyState ?? {};

    const due = dueNotifyMultiple(cfg.intervalMins, cumulative, notifyState[domain], today);
    if (due === null) return;

    notifyState[domain] = { date: today, lastMultiple: due };
    await chrome.storage.local.set({ notifyState });

    chrome.notifications.create(`notify-${domain}-${today}-${due}`, {
      type: 'basic',
      iconUrl: NOTIFY_ICON,
      title: `📌 ${domain}`,
      message: settings?.notifyMessage || 'You have spent a lot of time on this site',
    });
  } catch (err) {
    console.warn('[WebPulse] website notification check failed:', err);
  }
}

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
    void categorizeDomainOnce(session.domain);
    void checkWebsiteNotifications(session.domain);
  } catch (err) {
    console.error('[WebPulse] Failed to save time entry:', err);
  }
}

interface BlockInfo {
  blocked: boolean;
  limitSeconds: number;
  sessions: number;       // today's visit count for the domain
  deferAvailable: boolean;
}

async function checkRestrictions(domain: string): Promise<BlockInfo | null> {
  const [restriction, settings] = await Promise.all([
    db.domainRestrictions.get(domain),
    db.settings.get('default'),
  ]);

  // Whitelisted domains are never tracked or blocked
  if (settings?.ignoredDomains.includes(domain)) return null;
  if (!restriction) return null;

  const today = localDate();
  const todayEntries = await db.timeEntries.where('date').equals(today).toArray();
  const domainEntries = todayEntries.filter(e => e.domain === domain);
  const todayUsed = domainEntries.reduce((s, e) => s + e.duration, 0);

  const decision = evaluateRestriction(restriction, todayUsed, Date.now(), today);
  if (!decision.blocked) return null;

  return {
    blocked: true,
    limitSeconds: restriction.dailyLimitSeconds,
    sessions: domainEntries.length,
    deferAvailable: decision.deferAvailable,
  };
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

  // Check restrictions and enforce block
  const blockStatus = await checkRestrictions(domain);
  if (blockStatus?.blocked) {
    const q = new URLSearchParams({
      domain,
      url,
      limit: String(blockStatus.limitSeconds),
      sessions: String(blockStatus.sessions),
      defer: blockStatus.deferAvailable ? '1' : '0',
    });
    chrome.tabs.update(tabId, {
      url: `chrome-extension://${chrome.runtime.id}/block.html?${q}`,
    }).catch(() => {});
    return;
  }

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

export default defineBackground(() => {
  // IMPORTANT: every listener below must be registered synchronously.
  // An MV3 service worker woken by an event only delivers it to listeners
  // registered in the first synchronous turn — registering after an `await`
  // silently drops the waking message (lost YouTube sessions while the
  // worker was asleep during passive video watching).

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
    if (alarm.name === 'heartbeat') {
      await flushSession();
      await captureCurrentTab();
    } else if (alarm.name === 'pomodoro-work') {
      // Work period finished → start the rest period
      const state = await chrome.storage.local.get('pomodoro');
      const pom = state.pomodoro || {};
      const restMins = pom.restMins ?? 5;
      const rep = pom.currentRep ?? 1;
      const reps = pom.repetitions ?? 1;
      pom.mode = 'rest';
      pom.startedAt = Date.now();
      await chrome.storage.local.set({ pomodoro: pom });
      await playPomodoroSound(pom.workSound ?? 's3');
      chrome.notifications.create('pomodoro-work', {
        type: 'basic',
        iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Ccircle cx="32" cy="32" r="30" fill="%236366f1"/%3E%3Ctext x="50%%" y="50%%" font-size="28" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central"%3E✓%3C/text%3E%3C/svg%3E',
        title: '🎉 Work period complete!',
        message: `Take a ${restMins}-minute break. (Pomodoro ${rep} of ${reps})`,
      });
      chrome.alarms.create('pomodoro-rest', { delayInMinutes: restMins });
    } else if (alarm.name === 'pomodoro-rest') {
      // Rest period finished → next pomodoro, or finish the whole run
      const state = await chrome.storage.local.get('pomodoro');
      const pom = state.pomodoro || {};
      const reps = pom.repetitions ?? 1;
      const rep = pom.currentRep ?? 1;
      if (rep < reps) {
        pom.currentRep = rep + 1;
        pom.mode = 'work';
        pom.startedAt = Date.now();
        await chrome.storage.local.set({ pomodoro: pom });
        await playPomodoroSound(pom.restSound ?? 's4');
        chrome.notifications.create('pomodoro-rest', {
          type: 'basic',
          iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Ccircle cx="32" cy="32" r="30" fill="%2334d399"/%3E%3Ctext x="50%%" y="50%%" font-size="28" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central"%3E▶%3C/text%3E%3C/svg%3E',
          title: '⏱️ Break over!',
          message: `Back to work — pomodoro ${pom.currentRep} of ${reps}.`,
        });
        chrome.alarms.create('pomodoro-work', { delayInMinutes: pom.workMins ?? 25 });
      } else {
        pom.mode = 'idle';
        pom.startedAt = null;
        pom.currentRep = 0;
        await chrome.storage.local.set({ pomodoro: pom });
        await playPomodoroSound(pom.doneSound ?? 's6');
        chrome.notifications.create('pomodoro-done', {
          type: 'basic',
          iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23fbbf24"/%3E%3Ctext x="50%%" y="50%%" font-size="30" text-anchor="middle" dominant-baseline="central"%3E🏆%3C/text%3E%3C/svg%3E',
          title: '🏆 All pomodoros complete!',
          message: `You finished ${reps} ${reps === 1 ? 'pomodoro' : 'pomodoros'}. Great focus!`,
        });
      }
    } else if (alarm.name === 'daily-recap') {
      // Daily recap notification at user-configured time
      const settings = await db.settings.get('default');
      if (settings?.notifyDailyEnabled) {
        const today = localDate();
        const entries = await db.timeEntries.where('date').equals(today).toArray();
        const totalMins = Math.round(entries.reduce((s, e) => s + e.duration, 0) / 60);
        chrome.notifications.create('daily-recap', {
          type: 'basic',
          iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23f87171"/%3E%3Ctext x="50%%" y="50%%" font-size="20" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central"%3E📊%3C/text%3E%3C/svg%3E',
          title: '📊 Daily recap',
          message: `You spent ${totalMins} minutes browsing today. Great job!`,
        });
      }
    }
  });

  // ── Content script messages ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target === 'webpulse-offscreen') return false; // handled by offscreen doc

    if (message.type === 'ACTIVITY_PING') {
      if (!activeSession) captureCurrentTab();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'YOUTUBE_SESSION') {
      console.log('[WebPulse] YOUTUBE_SESSION received:', message.title, `${message.watchedSeconds}s`);
      (async () => {
        const id = await db.videoSessions.add({
          videoId: message.videoId,
          title: message.title,
          channelName: message.channelName,
          category: message.category ?? 'Unknown',
          watchedSeconds: message.watchedSeconds,
          date: localDate(message.startedAt),
          startedAt: message.startedAt,
        });
        // Fill in category via on-device AI when YouTube didn't provide one
        if (!message.category || message.category === 'Unknown') {
          const cat = await aiClassify({
            kind: 'video', title: message.title, channelName: message.channelName,
          });
          console.log('[WebPulse] AI video category:', message.title, '→', cat);
          if (cat) await db.videoSessions.update(id, { category: cat });
        }
      })().catch((err: unknown) => console.error('[WebPulse] Failed to save video session:', err));
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  // ── Async init — must come AFTER all listener registrations ──────────
  void (async () => {
    const [heartbeat, dailyRecap] = await Promise.all([
      chrome.alarms.get('heartbeat'),
      chrome.alarms.get('daily-recap'),
    ]);
    if (!heartbeat) {
      chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
    }
    if (!dailyRecap) {
      // Fire at user-configured time each day (default 8 PM)
      const settings = await db.settings.get('default');
      const timeStr = settings?.notifyDailyTime || '20:00';
      const [hours, minutes] = timeStr.split(':').map(Number);
      const now = new Date();
      const tonight = new Date(now);
      tonight.setHours(hours, minutes, 0, 0);
      if (now > tonight) tonight.setDate(tonight.getDate() + 1);
      const delayMs = tonight.getTime() - now.getTime();
      chrome.alarms.create('daily-recap', { delayInMinutes: Math.ceil(delayMs / 60000), periodInMinutes: 24 * 60 });
    }
    // Capture the tab the user is already on when SW starts/restarts
    await captureCurrentTab();
  })();
});

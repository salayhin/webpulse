import { db, type Category } from '../db';
import { extractHostname, localDate } from '../lib/hostname';
import { categorizeDomain, categorizeYouTubeTitle, DOMAIN_CATS } from '../lib/ai-categorize';
import { staticCategorize } from '../lib/classifier';

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
  } catch (err) {
    console.error('[WebPulse] Failed to save time entry:', err);
  }
}

async function checkRestrictions(domain: string): Promise<{ blocked: boolean; reason?: string } | null> {
  const [restriction, settings] = await Promise.all([
    db.domainRestrictions.get(domain),
    db.settings.get('default'),
  ]);

  // Skip whitelist check
  if (settings?.ignoredDomains.includes(domain)) return null;

  // Check daily limit
  if (restriction) {
    const now = Date.now();
    if (restriction.deferUntil && restriction.deferUntil > now) {
      return null; // deferred, allow access
    }

    const today = localDate();
    const todayEntries = await db.timeEntries.where('date').equals(today).toArray();
    const todayUsed = todayEntries
      .filter(e => e.domain === domain)
      .reduce((s, e) => s + e.duration, 0);

    if (todayUsed >= restriction.dailyLimitSeconds) {
      const resetMs = new Date(today).getTime() + 24 * 3600 * 1000;
      const minutesLeft = Math.ceil((resetMs - now) / 60000);
      return { blocked: true, reason: `Daily limit reached. Resets in ${minutesLeft}m.` };
    }
  }

  return null;
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
    chrome.tabs.update(tabId, {
      url: `chrome-extension://${chrome.runtime.id}/block.html?domain=${encodeURIComponent(domain)}&reason=${encodeURIComponent(blockStatus.reason || '')}`,
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
    if (alarm.name !== 'heartbeat') return;
    await flushSession();
    await captureCurrentTab();
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
    const existing = await chrome.alarms.get('heartbeat');
    if (!existing) {
      chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
    }
    // Capture the tab the user is already on when SW starts/restarts
    await captureCurrentTab();
  })();
});

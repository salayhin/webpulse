# WebPulse — Advanced Web Activity Chrome Extension

## Context
Building a **new** Chrome extension (not a fork) inspired by `web-activity-time-tracker`, with a better tracking model and advanced analytics. The key gaps in the existing extension: polling-based tracking that's fragile in MV3 service workers, no page-level interaction detection, no content categorization, and no YouTube deep-dive analytics.

**Name: WebPulse** — "The heartbeat of your browsing." Short, brandable, analytics-forward.

---

## Recommended Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Extension framework | **WXT** (wxt.dev) | MV3-native; handles SW persistence, HMR, content script injection, entrypoint routing out of the box |
| UI | **React 18 + TypeScript** | Wider ecosystem for analytics dashboards vs Vue |
| State | **Zustand** | Minimal, works in both popup and service worker contexts |
| Local storage | **Dexie.js** (IndexedDB) | Relational-like queries on time-series events; avoids chrome.storage size limits |
| Charts | **Recharts** + **shadcn/ui** | Composable, headless; shadcn gives beautiful pre-built analytics cards |
| On-device AI | **Chrome Prompt API** (Gemini Nano, Chrome 138+) | Free, private domain + video categorization; runs in offscreen document |
| Backend (Phase 2) | **Supabase** | PostgreSQL + auth + realtime; self-hostable; maps cleanly to local schema |
| Build | **Vite** (via WXT, currently v8) | Fast; WXT wraps it with extension-specific config |

---

## Critical Architecture: MV3 Service Worker

**Problem**: `setInterval` in a service worker will die silently after ~30s of inactivity (the SW is terminated by Chrome). The existing extension has this bug.

**Rule #1 — register ALL listeners synchronously (learned the hard way in Session 2):**
A sleeping SW woken by an event only delivers that event to listeners registered in the
**first synchronous turn** of SW startup. Registering `chrome.runtime.onMessage` (or any
listener) after an `await` silently drops the waking message. This lost every YouTube
session watched passively (no input → no pings → SW asleep → flush message dropped).

```ts
export default defineBackground(() => {        // NOT async
  chrome.runtime.onMessage.addListener(...)    // all listeners first, synchronously
  chrome.tabs.onActivated.addListener(...)
  // ...
  void (async () => { /* alarm setup, captureCurrentTab — async init LAST */ })();
});
```

**Correct MV3 pattern — event-driven tracking:**
1. On `chrome.tabs.onActivated` / `chrome.windows.onFocusChanged` → record `{ tabId, domain, startedAt: Date.now() }` in a variable AND persist to storage immediately.
2. On the inverse events (blur, deactivate, close) → compute `duration = now - startedAt`, write a `TimeEntry` record to Dexie.
3. Use `chrome.alarms` (1-minute minimum) as a heartbeat to flush in-progress sessions in case the SW was killed mid-session (compute `duration = alarmFiredAt - startedAt`).
4. Never rely on `setInterval` for timing — only for debouncing saves.
5. Content-script `sendMessage` should retry once (~1s) on failure — covers SW cold-start races.

---

## Activity Model — Media-Aware Hybrid

- Generic content script (`activity-detector`) fires a "ping" message to the SW every 10s while detecting any of: `mousemove`, `keydown`, `scroll`, `click`.
- SW marks tab active if a ping arrived within the last 30s.
- Exception: if `tab.audible === true` (audio playing), count as active even without pings. Handles watching YouTube in background.
- Idle state from `chrome.idle.queryState()` remains a secondary guard for system-level lock detection.

---

## YouTube Deep Tracking — DOM Scraping Content Script

Content script `youtube.content.ts` injected on `*://*.youtube.com/*` (as built in Session 2):

> ⚠️ **Content scripts run in an ISOLATED world.** They can NEVER read page JS variables —
> `window.ytInitialData` / `ytInitialPlayerResponse` are always `undefined`. The original
> plan to extract from `ytInitialData` does not work. Head meta tags (`og:title`,
> `meta[itemprop=genre]`) are also unreliable: YouTube only sets them in the initial HTML
> and does NOT update them on SPA navigation — they describe the first-loaded video forever.

1. **SPA navigation detection**: YouTube's own `yt-navigate-finish` DOM event — simpler
   and more reliable than the Navigation API or a `MutationObserver`.
2. **Data extraction — live DOM only**:
   - `videoId` from URL params
   - `title` from `ytd-watch-metadata h1 yt-formatted-string` (fallback: `document.title`)
   - `channelName` from `ytd-video-owner-renderer ytd-channel-name yt-formatted-string#text`
   - `category` from `meta[itemprop=genre]` ONLY for the initial full-page-load video;
     otherwise `'Unknown'` — the background fills it via on-device AI (see next section)
   - Metadata renders late after SPA nav → re-read in a retry loop (`refineMeta`) until the
     `h1` exists, updating the in-flight session in place
3. **Playback state**: listen to `video.addEventListener('play' / 'pause' / 'ended')`;
   accumulate only actual playing time. Flush on `visibilitychange` (hidden), `beforeunload`,
   and before each new navigation.
4. **Message to SW** via `chrome.runtime.sendMessage`: `{ type: 'YOUTUBE_SESSION', videoId, title, channelName, category, startedAt, watchedSeconds }` — with one retry on failure.

---

## AI Categorization — Chrome Built-in Prompt API (Gemini Nano)

On-device, free, private. Requires Chrome 138+ and the downloaded Gemini Nano model
(`await LanguageModel.availability()` → `'available'`).

- **Context restriction**: `LanguageModel` is NOT available in content scripts on regular
  pages and not guaranteed in the MV3 service worker. It runs in extension documents →
  WebPulse uses an **offscreen document** (`entrypoints/offscreen/`); the background routes
  requests via `{ target: 'webpulse-offscreen', kind: 'domain' | 'video', ... }` messages.
- **Domain categorization**: after a time entry is saved for a new domain, classify into
  `productivity | social | entertainment | news | education | other`; cache permanently in
  `domainCategories` (one AI call per domain, `isManual` overrides respected).
- **Video categorization**: video sessions saved with category `'Unknown'` are classified
  from title + channel into YouTube's standard categories, then the row is updated.
- **API note**: use `LanguageModel.create({ initialPrompts: [{ role: 'system', ... }] })` —
  `systemPrompt` is deprecated. Always `session.destroy()` after use.
- **Graceful degradation**: if unavailable (old Chrome, model not downloaded), everything
  still works — categories just stay `Unknown`/`uncategorized`.
- ⚠️ Chrome allows **one offscreen document per extension** — Session 5's Pomodoro audio
  must share this document.

---

## Data Schema (Dexie.js — IndexedDB)

```typescript
class WebPulseDB extends Dexie {
  timeEntries!: Table<TimeEntry>
  videoSessions!: Table<VideoSession>
  domainCategories!: Table<DomainCategory>
}

// ⚠️ Dexie only queries/sorts on INDEXED fields — orderBy on an unindexed field
// rejects with SchemaError (froze the dashboard on "Loading…" in Session 2).
// Current indexes (schema v2):
//   timeEntries:      '++id, domain, date, startedAt'
//   videoSessions:    '++id, videoId, date, channelName, category, startedAt'
//   domainCategories: 'domain'
// Once users have data, index changes need a new this.version(n) block.

interface TimeEntry {
  id?: number
  domain: string
  startedAt: number    // Unix ms
  duration: number     // seconds
  date: string         // YYYY-MM-DD
  wasAudible: boolean
}

interface VideoSession {
  id?: number
  videoId: string
  title: string
  channelName: string
  category: string     // genre meta on full page load, else AI-filled by background
  watchedSeconds: number
  date: string
  startedAt: number
}

interface DomainCategory {
  domain: string       // primary key
  category: 'productivity' | 'social' | 'entertainment' | 'news' | 'education' | 'other'
  isManual: boolean
}
```

---

## Project Structure

```
webpulse/                              # lives at ~/projects/data-lab/webpulse
└── src/
    ├── entrypoints/                   # WXT convention: *.content.ts suffix for content scripts
    │   ├── background.ts              # SW: event-driven tracking, alarm heartbeat, AI routing
    │   ├── popup/                     # React: today summary, top sites          [built]
    │   ├── dashboard/                 # React: full analytics dashboard          [built: Overview + YouTube tabs]
    │   ├── block/                     # React: friendly block page               [Session 4]
    │   ├── activity-detector.content.ts  # Generic input ping (all sites)        [built]
    │   ├── youtube.content.ts         # YouTube DOM scraper                      [built]
    │   └── offscreen/                 # AI inference (Gemini Nano) + Pomodoro audio later
    ├── db/
    │   ├── index.ts                   # Dexie DB definition (schema v2)          [built]
    │   └── queries.ts                 # Aggregation queries                      [built]
    ├── lib/
    │   ├── hostname.ts                # extractHostname, localDate, formatDuration [built]
    │   ├── ai-categorize.ts           # Prompt API wrappers (domain + video)     [built]
    │   └── classifier.ts              # Static rule map (top domains) → AI fallback [Session 3]
    ├── components/
    │   ├── CategoryDonut.tsx
    │   ├── DailyTimeline.tsx
    │   ├── YouTubeStats.tsx
    │   ├── TopSites.tsx
    │   └── FocusSessions.tsx
    └── wxt.config.ts
```

---

## Multi-Session Implementation Plan

### Session 1 — Project Scaffold + Event-Driven Core Tracker ✅ DONE
**Goal**: Working extension that accurately tracks time without polling.

- [x] `npx wxt@latest init webpulse` — scaffold with React + TypeScript template
- [x] Install: `dexie`, `zustand`, `recharts`, `lucide-react`
- [x] `src/db/index.ts` — Dexie DB: `timeEntries`, `videoSessions`, `domainCategories` tables
- [x] `src/entrypoints/background.ts`:
  - `chrome.tabs.onActivated` → save `sessionStart = { tabId, domain, startedAt }`
  - `chrome.windows.onFocusChanged` → flush active session on blur
  - `chrome.alarms.create('heartbeat', { periodInMinutes: 1 })` → flush in-progress session
  - `chrome.idle.onStateChanged` → pause/resume tracking on idle/locked
- [x] `src/entrypoints/activity-detector.content.ts` — ping SW every 10s while user input detected
- [x] `src/entrypoints/popup/` — minimal React popup: today's time per domain
- [x] **Session ends**: Load unpacked, verify `timeEntries` populate correctly in IndexedDB

---

### Session 2 — YouTube Content Script + Video Tracking ✅ DONE (approach revised)
**Goal**: YouTube watch sessions stored with category data.

- [x] `src/entrypoints/youtube.content.ts`:
  - SPA nav via YouTube's `yt-navigate-finish` event (~~Navigation API / MutationObserver~~)
  - Metadata from live DOM (~~`ytInitialData`~~ — unreadable from isolated world)
  - Listen to `video` element `play`/`pause`/`ended` events; count only playing time
  - Send `YOUTUBE_SESSION` to SW on pause/navigate/tab-hide, with retry
- [x] SW message handler: write `VideoSession` to Dexie; AI-fill `Unknown` categories
- [x] AI categorization layer: `lib/ai-categorize.ts` + offscreen document (unplanned addition)
- [x] `src/db/queries.ts` — YouTube stats, category/channel aggregations, recents
- [x] Dashboard with Overview tab (incl. Time by Category) + YouTube stats tab
- [x] **Session ends**: Watch 3 YouTube videos in different categories, verify DB records

**Bugs fixed along the way (regression checklist):**
- Sync listener registration in SW (sessions lost while SW slept)
- `startedAt` index added to `videoSessions` (schema v2) for `orderBy`
- Stale head meta tags / isolated world (metadata now DOM-first)
- "Extension context invalidated" guards (`chrome.runtime?.id` check, try/catch sends)
- Dashboard ErrorBoundary + try/catch/finally around all tab loaders

---

### Session 3 — Analytics Dashboard (General + YouTube) ✅ DONE (in App.tsx, not separate components)
**Goal**: Full dashboard with all chart views.

- [x] **Static rule map** `src/lib/classifier.ts` — ~80 top domains (dev tools, social, streaming, news, learning, AI tools). Background tries static → AI fallback → no-op. Cuts AI calls to near-zero for common browsing
- [x] **Daily stacked timeline** — `BarChart` with one `<Bar stackId="a">` per category, fixed `CATEGORY_COLORS` (productivity=emerald, social=rose, entertainment=violet, news=amber, education=blue, other=slate, uncategorized=gray) + custom multi-row tooltip + legend
- [x] **Focus sessions** — `getFocusSessions(start, end, minSeconds=900, gapToleranceMs=5000)` merges heartbeat-fragmented entries (the SW alarm flushes every minute, producing chains of ~60s entries on the same domain — the merger reconstructs the actual uninterrupted block). Renders as a list with favicon, category pill, duration, when
- [x] **Time-by-category** section — refactored to use consistent `CATEGORY_COLORS` (not the cycling rainbow palette)
- [x] **Category override UI** — inline native `<select>` styled as a small pill on each Top Sites row. Saves with `isManual: true`; background's existing "skip if any row exists" guard means AI/static never overwrite manual choices. Re-fetch via `refreshKey` bump
- [x] **Top Sites bar color** — now uses the domain's category color when categorized (uncategorized rows fall back to the cycling palette)
- [ ] *Deferred*: extracting OverviewTab into separate component files. App.tsx still has both tabs inline — refactor only if it grows past readability
- [x] **Session ends**: Full dashboard renders with real data, all charts functional

**Notes for future sessions**:
- `CATEGORY_COLORS` lives in `db/queries.ts` next to `CATEGORY_KEYS` — single source of truth for color mapping
- Recharts stacked bars need each category as a distinct `dataKey`, not a single array; `getDailyByCategory` returns rows shaped as `{date, label, productivity: 0, social: 0, ...}`
- Focus session merge tolerance is 5s — tight enough that idle gaps (lock screen, real tab switches) correctly break sessions

---

### Session 4 — Site Blocking, Restrictions + Whitelist ✅ DONE
**Goal**: Behavioral controls.

- [x] `DomainRestriction` table in Dexie: `{ domain, dailyLimitSeconds, deferUntil? }`
- [x] `WebPulseSettings` table (single-doc pattern): `{ key: 'default', ignoredDomains: string[] }`
- [x] SW enforcement: `checkRestrictions()` on `tabs.onActivated`
  - Calculates today's usage per domain, checks against limit
  - Whitelist bypass (ignoredDomains never tracked)
  - If blocked and not deferred, redirects to block page with domain + reset time
- [x] Block page (`entrypoints/block/`) with defer logic
  - Shows domain, reset time (midnight), "Defer 15 min" button
  - Defer sets `deferUntil = now + 15min` on the restriction
  - "Settings" link back to dashboard
- [x] Dashboard Settings tab: new main-tab with two sections
  - **Daily Limits**: add/remove per-domain limits (in minutes), displays in list
  - **Whitelist**: add/remove ignored domains, displays in list
  - Form inputs + validation + buttons
- [x] Styling: form elements, buttons (primary/danger), lists with proper visual hierarchy
- [x] **Session ends**: Test cycle verified: limits → block → defer → whitelist

**Key architectural notes**:
- Limits are checked BEFORE a session starts (tab activation), not after
- Deferral window is 15 min; clock resets at midnight (UTC of the browser)
- Whitelist uses string `.includes()` — no glob or regex (keep it simple)
- `ignoredDomains` are never tracked at all (no `timeEntries` row)

---

### Session 5 — Pomodoro + Smart Notifications + Export ✅ DONE
**Goal**: Focus tools and communication layer.

- [x] **Pomodoro state** via `chrome.storage.local` (not Zustand — simpler for extension)
  - `{ mode: 'idle'|'work'|'rest', startedAt?, workMins, restMins, sessionsCompleted }`
  - Persists across SW restarts (key: 'pomodoro')
- [x] **Pomodoro timer** via `chrome.alarms` (MV3-safe, heartbeat-like)
  - `pomodoro-work` alarm fires after work duration → transitions to rest + notification
  - `pomodoro-rest` alarm fires after rest duration → back to idle + notification
  - Customizable durations (1–60 min work, 1–30 min rest)
- [x] **Audio in existing offscreen** — extended for Pomodoro sounds
  - Work done: three ascending beeps (800→1000→1200 Hz)
  - Rest done: single long tone (1000 Hz, 500ms)
  - Web Audio API (zero external dependencies)
- [x] **Smart notifications**:
  - Session complete: icon + "Break over" or "Work done" + mode-specific message
  - Daily recap: fires at user-configured time (default 8 PM UTC)
  - Shows today's browsing minutes + motivational message
- [x] **Notification settings** (Session 5 extended):
  - Daily summary: checkbox + time picker
  - Per-website notifications: domain + interval threshold + list
  - Custom notification message: text area + save
- [x] **CSV export** — `lib/export.ts` functions
  - `exportTimeEntries()`: domain, category, duration, audible flag, started_at
  - `exportVideoSessions()`: video_id, title, channel, category, watched_seconds, started_at
  - Filenames include YYYY-MM-DD for batch management
  - Button in Pomodoro tab for quick export
- [x] **Dashboard Pomodoro tab** — new main-tab with timer UI + export
  - Large monospace timer (00:00 format), mode indicator, session counter
  - Work/rest input fields (1–60 / 1–30 ranges)
  - Start / Pause / Reset buttons
  - Motivational messages + Export Data button
- [x] **Settings tab redesign** — matches mockup design
  - Daily Limits: domain input + time picker + list in large white box
  - Whitelist: list in large white box + domain input + button
  - Notifications: daily summary + time picker + per-website + message
- [x] **Session ends**: Full Pomodoro cycle verified; daily recap wired; notifications functional

**Key notes**:
- Alarms are the only reliable MV3 timer — `setInterval` dies after SW idles
- Storage is per-profile (users can't share state across devices)
- Daily recap time is user-configurable (default 8 PM)
- CSV includes all data ever recorded (clients handle pagination/filtering)
- Notifications appear only if users allow `chrome.notifications` permission

---

### Session 6 — Polish + Chrome Web Store Prep
**Goal**: Production-ready.

- [ ] Dark mode via `shadcn/ui` theme variables
- [ ] Extension icon + WebPulse branding
- [ ] `wxt.config.ts` production build + zip
- [ ] Chrome Web Store listing assets
- [ ] **Session ends**: `.zip` ready for submission

---

### Phase 7 — Backend Sync (Cross-Device)
- [ ] Abstract `IStorage` interface: Dexie adapter + Supabase adapter
- [ ] Supabase schema mirrors local Dexie; incremental sync by `startedAt` cursor
- [ ] Auth via Supabase Google OAuth

---

### Phase 8 — Mobile Companion (Requires Phase 7)
> Chrome extensions don't run on mobile. Mobile tracking requires native apps.

| Approach | Effort | Accuracy |
|----------|--------|----------|
| Android `UsageStatsManager` API | Medium | High |
| iOS `FamilyControls` (Screen Time) | High | High (requires Apple entitlement) |
| React Native + Supabase sync | Medium | Medium |
| PWA dashboard only (no tracking) | Low | Display only |

**Recommended**: Android app with `UsageStatsManager` → Supabase → WebPulse dashboard shows combined data.

---

## Reference Files in This Repo (web-activity-time-tracker)
- `src/tracker.ts:90-155` — idle detection logic to replicate event-driven
- `src/utils/extract-hostname.ts` — domain extraction utility
- `src/functions/useAllTabListSummary.ts` — aggregation patterns
- `src/storage/storage-params.ts` — settings schema reference

---

## Verification Checklist
1. Load unpacked from `dist/` via `chrome://extensions`
2. ⚠️ **After every extension reload, hard-refresh all open tabs** — stale content scripts
   throw "Extension context invalidated" and silently stop tracking
3. Browse 5 min → check IndexedDB → WebPulse in DevTools
4. Watch YouTube video → page console shows `[WebPulse] tracking video:` then
   `[WebPulse] session sent:` on tab switch; SW console (chrome://extensions →
   "service worker") shows `YOUTUBE_SESSION received` + `AI video category`
5. **Passive-watch test**: watch a video 60+ s without touching mouse/keyboard, then switch
   tabs → session must still be saved (exercises the sleeping-SW wake path)
6. AI prerequisites: Chrome 138+, `await LanguageModel.availability()` → `'available'`
   (model download visible at chrome://components → Optimization Guide On Device Model)
7. Idle 45s → confirm no time added
8. Background tab with audio → confirm time continues
9. Kill/restart browser → confirm no data loss (alarm heartbeat flushed session)
10. `chrome://serviceworker-internals` → no SW errors

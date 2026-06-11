# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WebPulse — a Chrome MV3 extension for web activity analytics (time tracking, YouTube deep tracking, on-device AI categorization, site blocking, Pomodoro). Built with WXT, React 18, TypeScript, Dexie (IndexedDB), Recharts. `PLAN.md` holds the full design doc and hard-won lessons; `docs/superpowers/` holds per-feature specs and plans.

## Commands

```bash
npm run dev       # WXT dev mode with HMR (launches a browser with the extension loaded)
npm run build     # Production build → dist/
npm run zip       # Build + package for store upload
npm run compile   # Typecheck only (tsc --noEmit) — this is the main verification gate
```

There are no tests or linter configured; `npm run compile` is the check to run after changes.

## Architecture

WXT conventions: `srcDir` is `src/`, entrypoints are routed by filename under `src/entrypoints/` (`*.content.ts` → content scripts, `background.ts` → service worker, directories with `index.html` → extension pages). Manifest permissions live in `wxt.config.ts`.

### Data flow

1. **`entrypoints/background.ts`** (MV3 service worker) is the tracker. It keeps a single in-memory `activeSession` and converts tab/window/idle events into `TimeEntry` rows in Dexie. A 1-minute `chrome.alarms` heartbeat flushes and restarts sessions — this is also the recovery path when Chrome kills the SW. It also enforces daily-limit blocking (redirect to `block.html`) and drives Pomodoro + notification alarms.
2. **`entrypoints/activity-detector.content.ts`** pings the background on user interaction; **`entrypoints/youtube.content.ts`** scrapes the YouTube watch page DOM and sends `YOUTUBE_SESSION` messages.
3. **Categorization is layered**: static rule map (`lib/classifier.ts`) first, then on-device AI (Gemini Nano Prompt API, `lib/ai-categorize.ts`). `LanguageModel` is not guaranteed in the SW, so AI calls fall back to an **offscreen document** (`entrypoints/offscreen/`) reached via `chrome.runtime.sendMessage({ target: 'webpulse-offscreen', ... })`.
4. **UI**: `popup/` (quick stats) and `dashboard/` (options page; one large `App.tsx` with Overview / YouTube / Pomodoro / Settings tabs) read Dexie through the aggregation helpers in `db/queries.ts`.

### Persistence

- **Dexie** (`src/db/index.ts`): `timeEntries`, `videoSessions`, `domainCategories`, `domainRestrictions`, `settings`. Schema changes require a **new `this.version(n).stores({...})` block** — never edit an existing version.
- Settings use a single-document pattern: one row with `key: 'default'`.
- Pomodoro state lives in `chrome.storage.local` (not Dexie) and is advanced by `chrome.alarms`, since the SW can die mid-session.
- Dates are local-timezone `YYYY-MM-DD` strings via `lib/hostname.ts` `localDate()` — used as the Dexie range-query key everywhere.

## MV3 rules (violations have caused real data-loss bugs here)

- **Register every listener synchronously** inside `defineBackground(() => {...})` (which must NOT be async). A sleeping SW only delivers its waking event to listeners registered in the first synchronous turn; async init goes in a `void (async () => {...})()` at the end.
- **Never use `setInterval` for timing** in the SW — use `chrome.alarms` (1-minute minimum).
- Content scripts run in an **isolated world**: they cannot read page JS variables (`ytInitialData` etc. are always `undefined`). YouTube head meta tags are only valid for the initially-loaded video — SPA navigation (detected via the `yt-navigate-finish` event) requires re-reading the live DOM, with retry loops because metadata renders late.

# Session 6 — Chrome Web Store Submission Design

**Date:** 2026-06-13  
**Goal:** Ship WebPulse v1.0.0 as a public listing on the Chrome Web Store.  
**Out of scope:** Dark mode (deferred to v1.1).

---

## Overview

Six deliverables, worked in order. Each is independent enough to ship on its own, but the zip cannot be submitted until all six are done.

| # | Deliverable | Output |
|---|---|---|
| 1 | Privacy policy page | `docs/privacy.html` |
| 2 | Store screenshots (1280×800) | `docs/store-assets/screenshots/*.png` |
| 3 | Promotional tile (440×280) | `docs/store-assets/promo-440x280.png` |
| 4 | Store copy | pasted into Chrome Web Store dashboard |
| 5 | Manifest / wxt.config.ts review | `wxt.config.ts` updated |
| 6 | Submission checklist | `docs/store-submission.md` |

---

## 1 — Privacy Policy Page

**File:** `docs/privacy.html`  
**Live URL:** `https://salayhin.github.io/webpulse/privacy`  
**Used in:** Chrome Web Store dashboard → Privacy practices → Privacy policy URL

### Design

Matches the nav and footer of `docs/index.html` (same CSS variables, same `<nav>` and `<footer>` markup). Body is a single centered column, max-width 720px, plain prose — no tables, no legalese.

### Required statements

All of the following are true and must appear in plain language:

1. **What is collected and stored**
   - Domain visit durations (`timeEntries` — domain, date, duration in seconds)
   - YouTube watch sessions (`videoSessions` — video ID, title, channel, category, watch time)
   - Site restriction rules (`domainRestrictions` — domain, daily limit)
   - Extension settings (`settings` — ignored domains, notification prefs, Pomodoro config)

2. **Where data lives**  
   All data is stored exclusively in your browser's IndexedDB (Chrome's local storage API). It never leaves your device.

3. **What we do not do**  
   No data is transmitted to any server. No analytics, no telemetry, no third-party SDKs, no accounts, no sign-in.

4. **Third-party services**  
   None. The on-device AI feature (Gemini Nano) runs entirely inside Chrome — no network request is made.

5. **How to delete your data**  
   Open the Dashboard → Settings tab → "Wipe all data". Alternatively, uninstalling the extension removes all stored data.

6. **Contact**  
   `salayhin.lab@gmail.com`

### Structure

```
<nav>           ← identical to docs/index.html nav
<main>
  <h1>Privacy Policy</h1>
  <p class="effective">Effective: June 2026</p>
  <section> What we store </section>
  <section> Where it lives </section>
  <section> What we don't do </section>
  <section> On-device AI </section>
  <section> Deleting your data </section>
  <section> Contact </section>
</main>
<footer>        ← identical to docs/index.html footer
```

---

## 2 — Store Screenshots (1280×800)

**Output directory:** `docs/store-assets/screenshots/`  
**Dimensions:** exactly 1280×800 (Chrome Web Store hard requirement)  
**Count:** 5 (the store allows up to 5; we use all 5)

### Why a new Playwright project

The existing `extension` project uses `{ width: 1280, height: 820 }`. Changing it would break the existing screenshot tests. Instead, add a `store` project in `playwright.config.ts` with `{ width: 1280, height: 800 }` and a new spec file.

### New files

- `playwright.config.ts` — add `store` project, `testMatch: '**/store-screenshots.spec.ts'`
- `tests/e2e/store-screenshots.spec.ts` — seeds data, navigates, screenshots

### Screenshots

| File | Tab | Range | Key UI elements visible |
|---|---|---|---|
| `01-overview.png` | Dashboard → Overview | Week | Activity heatmap, focus sessions, visited sites list |
| `02-youtube.png` | Dashboard → YouTube Stats | Week | Tech channel seed: heatmap, stacked bar, channels list |
| `03-pomodoro.png` | Dashboard → Pomodoro | — | Timer UI, work/rest controls, sound selector |
| `04-restrictions.png` | Dashboard → Restrictions | — | Site blocking UI, daily limits |
| `05-popup.png` | Popup | Today | Donut chart + ranked domain list |

Screenshot 05 (popup) uses the `popup` fixture at 440×680 and is saved full-page. The other four use the `dashboard` fixture at 1280×800.

### Seed data

Reuses `seedDatabase()` from `fixtures.ts` — generic domains + the 10 tech YouTube channels already in `youtube-screenshot.spec.ts`. No new seed data needed.

---

## 3 — Promotional Tile

**Output:** `docs/store-assets/promo-440x280.png` (required), `docs/store-assets/promo-920x680.png` (optional large tile)  
**Required by:** Chrome Web Store (small promotional tile, shown in the store listing header)

### Design

Standalone HTML file: `docs/store-assets/promo.html`

```
Background: #1e1b4b (dark navy, matches extension icon background)
Layout: centered, flex column

Top: WebPulse SVG icon mark (80×80)
Middle: "WebPulse" wordmark — white, 36px, weight 800
Bottom: "The heartbeat of your browsing" — #a5b4fc (indigo-300), 16px, weight 500

Subtle decoration: faint dot grid pattern (same as icon) at low opacity in background
```

Playwright opens `promo.html` at `{ width: 440, height: 280 }`, full-page screenshot → `promo-440x280.png`.  
Second pass at `{ width: 920, height: 680 }` → `promo-920x680.png`.

### New files

- `docs/store-assets/promo.html`
- `tests/e2e/store-promo.spec.ts` — opens promo.html at both sizes, screenshots

---

## 4 — Store Copy

### Short description (132 chars max — used in search results)

```
Privacy-first web activity tracker with YouTube deep analytics, site blocking, AI categorisation, and a Pomodoro timer.
```
*(119 chars)*

### Full description

```
WebPulse — The heartbeat of your browsing

Track where your time goes online with deep analytics, all stored 100% on your device. No accounts. No servers. No telemetry.

── TIME TRACKING ──
Tracks active tab time with idle detection. Sessions survive Chrome restarting the service worker. View your history by Today, This Week, or This Month.

── YOUTUBE DEEP ANALYTICS ──
See exactly how much time you spend per channel and per video. Only counts actual playback seconds — not just time on the tab. Includes a watch-activity heatmap by hour and day of week, daily category breakdown, and a ranked channel list.

── ON-DEVICE AI CATEGORISATION ──
Sites are automatically classified into Productivity, Social, Entertainment, News, or Education using a built-in rule map plus Gemini Nano (Chrome's built-in AI). Nothing leaves your device.

── SITE BLOCKING ──
Set daily time limits per domain. When you hit your limit, you're redirected to a block page. One daily "defer" skip for when you really need it. Whitelist domains you never want tracked.

── POMODORO TIMER ──
Configurable work/rest intervals with audible tick-tock, chimes, and ambient sounds (ocean, rain). Notifications on each phase change.

── QUICK POPUP ──
Click the toolbar icon for an instant breakdown — Today's donut chart, lifetime totals, or a date-range daily view with per-site drill-down.

── PRIVACY ──
All data lives in your browser's IndexedDB. Export to CSV or wipe everything from the Settings tab at any time.

Open source: github.com/salayhin/webpulse
```

### Category

Productivity

### Language

English (United Kingdom) — matches "categorisation" spelling. Add English (United States) as secondary.

---

## 5 — Manifest / wxt.config.ts Review

### Changes

| Field | Current | Updated |
|---|---|---|
| `version` | `"0.1.0"` | `"1.0.0"` |
| `homepage_url` | absent | `"https://salayhin.github.io/webpulse"` |
| `description` | `"The heartbeat of your browsing — advanced web activity analytics"` | keep as-is (fits 132-char limit) |

### Permissions review

Current permissions: `tabs`, `activeTab`, `storage`, `idle`, `alarms`, `notifications`, `offscreen`

All are justified:
- `tabs` — read active tab URL and title
- `activeTab` — focus/activity detection
- `storage` — Pomodoro state via `chrome.storage.local`
- `idle` — detect user inactivity
- `alarms` — heartbeat + Pomodoro timer (MV3 requirement)
- `notifications` — daily summary + per-site alerts
- `offscreen` — Gemini Nano runs in an offscreen document

No permissions to remove. `host_permissions: ['<all_urls>']` is required for content scripts on all tabs — this is the broadest permission and will trigger a Chrome Web Store review question; the justification is "content scripts must run on all tabs to track active time."

---

## 6 — Submission Checklist

**File:** `docs/store-submission.md`

Step-by-step instructions for the Chrome Web Store developer dashboard, covering:

1. Create developer account at `chrome.google.com/webstore/devconsole` ($5 one-time fee)
2. New item → upload `webpulse-1.0.0.zip` (produced by `npm run zip`)
3. Fill store listing (copy from Section 4 above)
4. Upload screenshots in order (01 → 05)
5. Upload `promo-440x280.png` as Small Promotional Tile
6. Upload `promo-920x680.png` as Large Promotional Tile (optional)
7. Privacy practices tab:
   - Single purpose: "Tracks browser activity and YouTube watch time locally on your device"
   - Privacy policy URL: `https://salayhin.github.io/webpulse/privacy`
   - Data use disclosures: tick "Website content" (tab URLs) and "User activity" (time tracking)
   - Certify: "This extension does not sell or transfer user data to third parties"
8. Distribution: Public, All regions, Free
9. Submit for review (typical review time: 1–3 business days)

---

## Implementation Order

1. `wxt.config.ts` — version bump + homepage_url (5 min)
2. `docs/privacy.html` — privacy policy page (30 min)
3. `docs/store-assets/promo.html` — promo tile HTML (20 min)
4. `tests/e2e/store-promo.spec.ts` + run → generate PNG tiles (15 min)
5. `playwright.config.ts` + `tests/e2e/store-screenshots.spec.ts` → generate 5 screenshots (30 min)
6. `docs/store-submission.md` — submission checklist (15 min)
7. `npm run zip` → verify zip contents (5 min)

**Total estimated time: ~2 hours**

---

## Acceptance Criteria

- [ ] `docs/privacy.html` live at `salayhin.github.io/webpulse/privacy`
- [ ] 5 screenshots in `docs/store-assets/screenshots/` at exactly 1280×800
- [ ] `docs/store-assets/promo-440x280.png` exists
- [ ] `wxt.config.ts` version is `1.0.0`, `homepage_url` set
- [ ] `npm run zip` produces `webpulse-1.0.0.zip`
- [ ] `docs/store-submission.md` covers all dashboard steps

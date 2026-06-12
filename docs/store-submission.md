# Chrome Web Store Submission Checklist

## Pre-submission: build the zip

```bash
npm run build && npm run zip
```

Output: `webpulse-1.0.0.zip` in the project root.

---

## Step 1 — Developer account

1. Go to [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account (`salayhin.lab@gmail.com`)
3. Pay the one-time **$5 developer registration fee** if not already done

---

## Step 2 — Create new item

1. Click **+ New item**
2. Upload `webpulse-1.0.0.zip`
3. Wait for the package to parse — it will pre-fill the name and version

---

## Step 3 — Store listing

### Basic info

| Field | Value |
|---|---|
| **Name** | WebPulse |
| **Short description** | Privacy-first web activity tracker with YouTube deep analytics, site blocking, AI categorisation, and a Pomodoro timer. |
| **Category** | **Tools** (under Productivity → Tools) — if not available, pick **Productivity → Workflow & Planning** or the closest "Tools" subcategory shown |
| **Language** | English (United Kingdom) |

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

---

## Step 4 — Screenshots

Upload in this exact order from `docs/store-assets/screenshots/`:

| # | File | Size | Shows |
|---|---|---|---|
| 1 | `01-overview.jpg` | 1280×800 | Dashboard — activity heatmap + daily category chart |
| 2 | `02-youtube.jpg` | 1280×800 | YouTube Stats — watch heatmap + channel list |
| 3 | `03-pomodoro.jpg` | 1280×800 | Pomodoro timer with Focus/Break/Done phases |
| 4 | `04-restrictions.jpg` | 1280×800 | Site blocking + daily limits |
| 5 | `05-popup.jpg` | 640×400 | Quick-access popup — Today tab donut chart |

All screenshots are JPEG (no alpha), meeting the "JPEG or 24-bit PNG (no alpha)" requirement.

---

## Step 5 — Store icon

The Chrome Web Store requires the icon to be uploaded separately — it is **not** extracted from the ZIP automatically.

| Slot | File | Size |
|---|---|---|
| **Store icon** | `src/public/icon/128.png` | 128×128 |

---

## Step 6 — Promotional images

| Slot | File | Size |
|---|---|---|
| Small promotional tile | `docs/store-assets/promo-440x280.png` | 440×280 |
| Large promotional tile | `docs/store-assets/promo-920x680.png` | 920×680 |
| Marquee promotional tile | `docs/store-assets/promo-1400x560.png` | 1400×560 |

---

## Step 7 — Privacy practices

1. Click the **Privacy practices** tab
2. **Single purpose:** `Tracks browser activity and YouTube watch time locally on the user's device`
3. **Privacy policy URL:** `https://salayhin.github.io/webpulse/privacy`

### Permission justifications

Copy each text into the corresponding field (max 1,000 chars each):

**tabs justification**
```
Required to read the URL and title of the currently active tab. WebPulse tracks time spent per domain by monitoring which tab is active and when it changes. Only the tab URL and title are accessed — no page content, passwords, or form data are ever read.
```

**activeTab justification**
```
Required to detect when the user switches between tabs, which triggers the start and end of a tracked browsing session. Without this permission the extension cannot measure how long the user spends on each domain.
```

**storage justification**
```
Required to persist Pomodoro timer state (current phase, elapsed time, configuration) in chrome.storage.local. This state must survive the service worker being terminated between alarm firings, which is standard behaviour in Manifest V3.
```

**idle justification**
```
Required to detect when the user is idle (away from keyboard or screen locked). When idle is detected the active session timer is paused so idle time is not incorrectly attributed to a domain, ensuring time-tracking accuracy.
```

**alarms justification**
```
Required as the primary timing mechanism in Manifest V3. Service workers cannot use setInterval reliably as Chrome terminates them after inactivity. A 1-minute alarm heartbeat flushes in-progress sessions and triggers Pomodoro phase transitions and daily notification delivery.
```

**notifications justification**
```
Required to deliver two types of user-configured notifications: (1) a daily activity summary at a user-specified time, and (2) per-site alerts when the user exceeds a self-set time threshold on a domain. Both features are opt-in and fully configurable from the Settings tab.
```

**offscreen justification**
```
Required to run Chrome's built-in Gemini Nano (Prompt API) for on-device site categorisation. The LanguageModel API is unavailable in Manifest V3 service workers, so an offscreen document is used as a proxy. No data leaves the device — all inference runs locally inside Chrome.
```

**Host permission justification**
```
Content scripts must be injected into every tab to detect user activity (mouse, keyboard, scroll events) and to scrape YouTube watch metadata for deep video analytics. The scripts read only tab activity signals and YouTube DOM metadata — no page content, passwords, or form data are accessed. The host permission cannot be narrowed because the user may visit any domain.
```

### Remote code

Select **"No, I am not using remote code"**. All JavaScript is bundled in the extension package at build time via WXT/Vite. No external scripts are loaded and eval() is not used.

4. **Data use disclosures** — tick both:
   - ✅ Website content (tab URLs for time tracking)
   - ✅ User activity (browsing time, YouTube watch sessions)
5. **Certify:** *"This extension does not sell or transfer user data to third parties outside of the approved use cases"* ✅

---

## Step 8 — Distribution

| Setting | Value |
|---|---|
| **Visibility** | Public |
| **Distribution** | All regions |
| **Pricing** | Free |

---

## Step 9 — Submit

1. Click **Submit for review**
2. Expected review time: **1–3 business days**
3. You'll receive an email at `salayhin.lab@gmail.com` when approved or if changes are needed

---

## Post-approval

- Add the Chrome Web Store badge/link to `docs/index.html`
- Update `README.md` install instructions to link to the store listing
- Tag the release: `git tag v1.0.0 && git push origin v1.0.0`

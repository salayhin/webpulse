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

| # | File | Shows |
|---|---|---|
| 1 | `01-overview.png` | Dashboard — activity heatmap + daily category chart |
| 2 | `02-youtube.png` | YouTube Stats — watch heatmap + channel list |
| 3 | `03-pomodoro.png` | Pomodoro timer with Focus/Break/Done phases |
| 4 | `04-restrictions.png` | Site blocking + daily limits |
| 5 | `05-popup.png` | Quick-access popup — Today view |

All screenshots are 1280×800 as required.

---

## Step 5 — Promotional images

| Slot | File | Size |
|---|---|---|
| Small promotional tile | `docs/store-assets/promo-440x280.png` | 440×280 |
| Large promotional tile | `docs/store-assets/promo-920x680.png` | 920×680 |

---

## Step 6 — Privacy practices

1. Click the **Privacy practices** tab
2. **Single purpose:** `Tracks browser activity and YouTube watch time locally on the user's device`
3. **Privacy policy URL:** `https://salayhin.github.io/webpulse/privacy`
4. **Permissions justification** (Chrome will ask about `<all_urls>` and `tabs`):
   - `tabs` + `<all_urls>`: *"Content scripts must run on all tabs to detect the active tab's domain and track time. No page content is read — only the tab URL and title."*
   - `notifications`: *"Used to send a daily activity summary and per-site alerts when a configured time threshold is reached."*
   - `offscreen`: *"Used to run Gemini Nano (Chrome's built-in AI) for on-device site categorisation, as the Prompt API is unavailable in service workers."*
5. **Data use disclosures** — tick both:
   - ✅ Website content (tab URLs for time tracking)
   - ✅ User activity (browsing time, YouTube watch sessions)
6. **Certify:** *"This extension does not sell or transfer user data to third parties outside of the approved use cases"* ✅

---

## Step 7 — Distribution

| Setting | Value |
|---|---|
| **Visibility** | Public |
| **Distribution** | All regions |
| **Pricing** | Free |

---

## Step 8 — Submit

1. Click **Submit for review**
2. Expected review time: **1–3 business days**
3. You'll receive an email at `salayhin.lab@gmail.com` when approved or if changes are needed

---

## Post-approval

- Add the Chrome Web Store badge/link to `docs/index.html`
- Update `README.md` install instructions to link to the store listing
- Tag the release: `git tag v1.0.0 && git push origin v1.0.0`

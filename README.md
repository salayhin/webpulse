# WebPulse

> The heartbeat of your browsing — a privacy-first Chrome extension for web activity analytics.

WebPulse tracks where your time goes online, with deep YouTube analytics, on-device AI categorization, site blocking, a built-in Pomodoro timer, and YouTube Shorts blocking. All data stays on your device.

🌐 **[salayhin.github.io/webpulse](https://salayhin.github.io/webpulse)** · 📦 **[github.com/salayhin/webpulse](https://github.com/salayhin/webpulse)**

---

## Features

### Time Tracking
- Tracks active time per domain across all tabs
- Idle detection — stops counting when you walk away
- Session grouping with gap tolerance
- Today / This Week / This Month views

### YouTube Deep Analytics
- Per-channel and per-video watch time
- Actual playback time (only counts while the video is playing, at any speed)
- Category breakdown by video genre
- Watch activity heatmap by hour and day of week
- **Pause video automatically when you switch tabs** *(opt-in)*
- **Hide YouTube Shorts** — removes Shorts from the feed, sidebar, search, and redirects `youtube.com/shorts` *(opt-in)*

### On-Device AI Categorization
- Classifies sites into: **Productivity**, **Social**, **Entertainment**, **News**, **Education**, **Other**
- Static rule map for instant results on common domains
- Falls back to Gemini Nano (Chrome's built-in AI) for unknown sites
- No data ever leaves your device

### Dashboard
- Stacked daily activity chart by category
- Hour × weekday heatmap
- Focus sessions — long uninterrupted stretches on a single domain
- Visited sites ranked by time or sessions
- Export activity and YouTube history to CSV

### Popup (Quick Stats)
- Today tab — donut chart + ranked site list
- Total Time tab — lifetime stats, most/least active days
- Daily tab — date range picker with line chart, expandable per-day breakdown
- One-click links to Dashboard, YouTube Stats, Pomodoro, Settings

### Site Blocking & Restrictions
- Daily time limits per domain
- Complete block option
- Defer limit (skip once per day)
- Whitelist to exclude domains from tracking

### Pomodoro Timer
- Configurable work / rest intervals and repetitions
- Audible tick-tock during work, gentle chime on break
- Ambient sounds: ocean waves, rain
- Notification alerts on phase change

### Notifications
- Daily summary notification at a configured time
- Per-site alerts when you exceed a time threshold

---

## Installation

### From Source

```bash
git clone https://github.com/salayhin/webpulse.git
cd webpulse
npm install
npm run build
```

Then load the unpacked extension:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/chrome-mv3` folder

### Development

```bash
npm run dev          # WXT dev mode with HMR — launches Chrome with extension loaded
npm run build        # Production build → dist/
npm run compile      # Type-check only
npm run zip          # Build + package for store upload
npm run test         # Unit tests (Vitest)
npm run test:e2e     # End-to-end tests with Playwright (headed)
npm run test:e2e:bg  # Same, but browser runs off-screen
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | [WXT](https://wxt.dev) (WebExtension framework) |
| UI | React 18 + TypeScript |
| Charts | Recharts |
| Storage | Dexie (IndexedDB wrapper) |
| AI | Gemini Nano via Chrome Built-in AI Prompt API |
| Testing | Playwright (E2E) + Vitest (unit) |
| Target | Chrome MV3 |

---

## Privacy

- **100% on-device** — no servers, no telemetry, no accounts
- All data lives in your browser's IndexedDB
- Export or delete your data at any time from the Settings tab

---

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts                 # MV3 service worker — core tracker
│   ├── youtube.content.ts            # YouTube tracking, Shorts blocking & pause-on-switch
│   ├── activity-detector.content.ts  # Idle/activity ping
│   ├── popup/                        # Quick-stats popup
│   ├── dashboard/                    # Full analytics dashboard
│   ├── offscreen/                    # Gemini Nano AI fallback
│   └── block.html                    # Site blocking redirect page
├── db/
│   ├── index.ts                      # Dexie schema + migrations
│   └── queries.ts                    # Aggregation helpers
└── lib/
    ├── classifier.ts                 # Static domain → category map
    ├── ai-categorize.ts              # Gemini Nano integration
    ├── hostname.ts                   # URL normalization + local date
    ├── pomodoro-store.ts             # Pomodoro state (chrome.storage.local)
    └── sounds.ts                     # Audio engine

tests/
└── e2e/                              # Playwright extension tests + screenshot suite
```

---

## Developer

**Sirajus Salayhin** · [salayhin.lab@gmail.com](mailto:salayhin.lab@gmail.com) · [salayhin.github.io/me](https://salayhin.github.io/me/)

---

## License

MIT

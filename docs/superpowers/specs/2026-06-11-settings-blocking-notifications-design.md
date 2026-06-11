# Settings, Blocking & Notifications Redesign — Design Spec

**Date:** 2026-06-11
**Status:** Approved pending user review
**Scope:** Settings tab (whitelist, restrictions, notifications), block page, and the background enforcement that powers them. Brings the Session 4/5 features up to the user's mockups and makes the notification features actually fire.

## Context

The Session 5 audit found that several notification features exist only in the UI:

- `checkWebsiteNotifications()` in `background.ts` is dead code — per-website notifications never fire.
- Pomodoro sounds are sent to the offscreen document without `ensureOffscreen()`, so they silently no-op unless an AI call happened to create the document.
- Changing the daily-recap time updates Dexie but never reschedules the `daily-recap` alarm.
- `addWhitelist`/`removeWhitelist` use `db.settings.put(...)` with only `ignoredDomains`, wiping all notification settings from the single settings document.

The user supplied mockups (from the original web-activity-time-tracker extension) for the whitelist, daily restrictions, notifications section, and block page. This spec covers matching those mockups and fixing the gaps above.

## Data Model

### Dexie schema v5

`DomainRestriction` gains defer bookkeeping:

```ts
interface DomainRestriction {
  domain: string;             // primary key
  dailyLimitSeconds: number;  // 0 = completely blocked
  deferUntil?: number;        // unix ms; block postponed while > now
  deferUsedDate?: string;     // YYYY-MM-DD; postpone already used this day
}
```

- `dailyLimitSeconds === 0` means **completely blocked** (the current 60-second floor in `addLimit` is removed).
- `deferUsedDate` enforces "postpone once per day". It is set when the user clicks "+5 minutes"; the offer is hidden when `deferUsedDate === today`.
- Indexes unchanged (`domain` primary key); v5 only documents the new optional fields — Dexie needs no index change, but we bump the version to keep migration history explicit.

### Notification firing state (chrome.storage.local)

Per-website notification bookkeeping is transient, not user data, so it lives in `chrome.storage.local` under `notifyState`:

```ts
{ [domain: string]: { date: string /* YYYY-MM-DD */, lastMultiple: number } }
```

`lastMultiple` is the highest interval multiple already notified today. A new date resets it implicitly (date mismatch → treat as 0).

## Background (service worker)

### Per-website notifications — wire the dead code

Rewrite `checkWebsiteNotifications(domain)` and call it from `flushSession()` after each time entry is saved (the 1-minute heartbeat guarantees this runs at least once a minute while browsing):

1. Read `settings.notifyWebsites`; if `domain` has no entry, return.
2. Compute today's cumulative seconds for `domain` from `timeEntries`.
3. `multiple = floor(cumulativeSeconds / (intervalMins * 60))`.
4. If `multiple >= 1` and `multiple > lastMultiple` for today in `notifyState`: fire one `chrome.notifications.create` using the favicon-style icon, title `📌 {domain}`, and the user's custom `notifyMessage`; then store `{ date: today, lastMultiple: multiple }`.

Semantics confirmed with user: **cumulative daily time**, repeating at every interval multiple (30m, 60m, 90m, …), resetting at local midnight.

### Restriction enforcement

`checkRestrictions(domain)` changes:

- If `restriction.dailyLimitSeconds === 0` → blocked immediately (unless deferred).
- Defer check unchanged (`deferUntil > now` → allow).
- When blocked, redirect to the block page with query params: `domain`, `url` (the full original URL), `limit` (seconds), `sessions` (count of today's `timeEntries` rows for the domain), and `deferAvailable` (`deferUsedDate !== today`).

### Fixes folded in

- **Offscreen sounds:** call `await ensureOffscreen()` before sending `pomodoro-sound` messages in both alarm handlers.
- **Daily recap reschedule:** when the dashboard saves a new `notifyDailyTime`, it recreates the `daily-recap` alarm itself via `chrome.alarms.create` (extension pages share the alarms API; no SW round-trip needed). The SW init logic stays as the fallback for fresh installs.
- The recap-enabled checkbox continues to be honored at fire time (no alarm churn needed for on/off).

## Block page

Rebuilt to match the mockup — identical layout for limited and completely blocked sites:

```
        [⚡ logo]  WebPulse

   You've reached your limit for today on

        [favicon]  youtube.com
   https://www.youtube.com/watch?v=…   (full blocked URL, gray)

   Limit:     0 h 01 m     (configured limit; 0 h 00 m for complete block)
   Sessions:  2            (visits to this domain today)

          [ + 5 minutes ]
   You can postpone the blocking for 5 minutes only once during the day
```

- "+5 minutes" sets `deferUntil = now + 5 min` and `deferUsedDate = today`, then navigates back to the original blocked URL.
- The button and caption are hidden when `deferAvailable` is false (already used today). The rest of the page is unchanged in that state.
- When the 5 minutes expire, the next tab activation / heartbeat blocks again with no postpone offered.
- The original extension's "Try Clean Youtube" promo banner is **out of scope**.
- Favicons via `https://www.google.com/s2/favicons?domain={domain}&sz=32` (same service the dashboard already uses).

## Settings tab UI

All three sections match the mockups. Shared list-row style: red **✕** (delete) on the left, **✏️** pencil (edit) where applicable, favicon, bold domain, gray subtext below.

### Daily access restrictions

- Header + existing two subtitle lines (the "0 hours 0 minutes blocks immediately" line becomes true).
- Input row: domain text input · time picker (HH:MM duration, with ✕ reset) · primary button.
- **"Completely Block" checkbox** below the input row. Checked → time picker is disabled and the entry saves with `dailyLimitSeconds = 0`. Picking 00:00 has the same effect.
- List entries show subtext `Completely Blocked` (limit 0) or `Limit : H:MM`.
- **Pencil edit:** loads the entry's domain + time (and checkbox state) into the input row; the button label flips from "Add Website" to "Save"; saving updates the existing row and clears edit mode. Editing state also clears if the user empties the domain field.

### Whitelist

- Mockup order: list box **first**, input row + "Add Website" button **below**.
- Rows: ✕ left, favicon, bold domain (no pencil — nothing to edit).
- **Bug fix:** use `db.settings.update('default', { ignoredDomains })` instead of `put`, so notification settings survive whitelist edits.

### Notifications

- "Daily Summary Notifications" checkbox; when enabled, the time picker sits inline to the right of the explanatory label (mockup layout). Changing the time triggers the alarm reschedule described above.
- "Notifications for websites": input row (domain · interval time picker · button) with the same pencil-edit flow (button flips to "Save", per the user's edit-mode mockup). List rows show `Limit : 0:30` subtext.
- "Notification message": textarea + Save button (existing behavior, kept).

## Out of scope

- "Try Clean Youtube"-style promo banner on the block page.
- Glob/regex matching for whitelist or restrictions (stays exact-domain).
- Extracting Settings/Overview tabs into separate component files (per PLAN.md, only if readability demands).

## Testing & verification

1. `npx tsc --noEmit` and `npm run build` pass.
2. Manual pass with short values:
   - 1-minute daily limit on a test domain → block page appears with correct limit/sessions/URL; "+5 minutes" works once, then is hidden for the rest of the day; block resumes after 5 minutes.
   - "Completely Block" entry → immediate block on first visit; same postpone behavior.
   - 1-minute per-website notification interval → notification with the custom message fires at ~1m cumulative use and again at ~2m.
   - Edit (pencil) on a restriction and a notification entry → values load, "Save" updates in place.
   - Whitelist add/remove → notification settings in Dexie remain intact.
   - Change daily-recap time → `chrome.alarms.get('daily-recap')` shows the new schedule.
   - Pomodoro work session completes → sound plays even when no AI call preceded it.

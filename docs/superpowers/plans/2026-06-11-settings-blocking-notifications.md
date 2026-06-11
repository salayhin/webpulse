# Settings, Blocking & Notifications Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the Settings tab, block page, and notification behavior to the user's mockups — including making per-website notifications actually fire, "Completely Block", pencil-edit flows, and a once-per-day "+5 minutes" postpone.

**Architecture:** Pure decision logic (block evaluation, notification-interval math) is extracted into two small testable modules in `src/lib/`, unit-tested with vitest. The MV3 service worker calls them from the existing `flushSession()`/`checkRestrictions()` paths — no new alarms. UI changes live in the existing `SettingsTab` in `App.tsx` (this codebase keeps dashboard tabs inline) and a rebuilt static block page.

**Tech Stack:** WXT (MV3 Chrome extension), React 18 + TypeScript, Dexie (IndexedDB), chrome.alarms/notifications/storage, vitest (new, unit tests only).

**Spec:** `docs/superpowers/specs/2026-06-11-settings-blocking-notifications-design.md`

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/blocking.ts` | Create | Pure: should a domain be blocked / is postpone available |
| `src/lib/notify-logic.ts` | Create | Pure: which interval multiple (if any) is due for notification |
| `tests/blocking.test.ts` | Create | Unit tests for blocking.ts |
| `tests/notify-logic.test.ts` | Create | Unit tests for notify-logic.ts |
| `src/db/index.ts` | Modify | `deferUsedDate` on `DomainRestriction`, schema v5 |
| `src/entrypoints/background.ts` | Modify | Wire notifications, new block params, offscreen fix, remove dead code |
| `src/entrypoints/block/index.html` | Rewrite | Mockup layout |
| `src/entrypoints/block/main.ts` | Rewrite | Render params, "+5 minutes" once/day |
| `src/entrypoints/dashboard/App.tsx` | Modify | SettingsTab: SiteRow, Completely Block, pencil edits, whitelist fix, recap reschedule |
| `src/entrypoints/dashboard/style.css` | Modify | List-row styles (✕ / ✏️ / favicon / subtext) |
| `package.json` | Modify | vitest devDependency + `test` script |

**Conventions for every task:** run commands from the repo root `/Users/salayhin/projects/data-lab/webpulse`. The existing `domainSessionStartTime` map and old `checkWebsiteNotifications` in `background.ts` (lines ~366-387) are dead code that Task 5 deletes — do not try to reuse them.

---

### Task 1: Test tooling (vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add test script**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify the runner works (no tests yet → exits cleanly)**

Run: `npm test -- --passWithNoTests`
Expected: "No test files found" with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit tests"
```

---

### Task 2: Pure block-decision module (`blocking.ts`)

**Files:**
- Create: `src/lib/blocking.ts`
- Test: `tests/blocking.test.ts`

Note: `blocking.ts` uses `import type` from `../db` — type-only imports are erased at compile time, so the Dexie singleton in `db/index.ts` is NOT instantiated in node tests. Do not change it to a value import.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/blocking.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateRestriction } from '../src/lib/blocking';

const TODAY = '2026-06-11';
const NOW = 1_770_000_000_000;

describe('evaluateRestriction', () => {
  it('does not block when there is no restriction', () => {
    expect(evaluateRestriction(undefined, 9999, NOW, TODAY))
      .toEqual({ blocked: false, deferAvailable: false });
  });

  it('blocks immediately when dailyLimitSeconds is 0 (completely blocked)', () => {
    expect(evaluateRestriction({ domain: 'youtube.com', dailyLimitSeconds: 0 }, 0, NOW, TODAY))
      .toEqual({ blocked: true, deferAvailable: true });
  });

  it('blocks when usage reaches the limit', () => {
    expect(evaluateRestriction({ domain: 'x.com', dailyLimitSeconds: 60 }, 60, NOW, TODAY).blocked).toBe(true);
  });

  it('does not block under the limit', () => {
    expect(evaluateRestriction({ domain: 'x.com', dailyLimitSeconds: 60 }, 59, NOW, TODAY).blocked).toBe(false);
  });

  it('does not block while a defer is active, even when completely blocked', () => {
    const r = { domain: 'x.com', dailyLimitSeconds: 0, deferUntil: NOW + 1000, deferUsedDate: TODAY };
    expect(evaluateRestriction(r, 9999, NOW, TODAY).blocked).toBe(false);
  });

  it('blocks again after the defer expires, with no postpone left today', () => {
    const r = { domain: 'x.com', dailyLimitSeconds: 60, deferUntil: NOW - 1000, deferUsedDate: TODAY };
    expect(evaluateRestriction(r, 60, NOW, TODAY))
      .toEqual({ blocked: true, deferAvailable: false });
  });

  it('offers postpone again on a new day', () => {
    const r = { domain: 'x.com', dailyLimitSeconds: 60, deferUsedDate: '2026-06-10' };
    expect(evaluateRestriction(r, 60, NOW, TODAY).deferAvailable).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../src/lib/blocking`.

- [ ] **Step 3: Implement `src/lib/blocking.ts`**

```ts
import type { DomainRestriction } from '../db';

export interface BlockDecision {
  blocked: boolean;
  /** "+5 minutes" postpone has not been used yet today */
  deferAvailable: boolean;
}

export function evaluateRestriction(
  restriction: DomainRestriction | undefined,
  todayUsedSeconds: number,
  now: number,
  today: string,
): BlockDecision {
  if (!restriction) return { blocked: false, deferAvailable: false };

  const deferAvailable = restriction.deferUsedDate !== today;

  if (restriction.deferUntil && restriction.deferUntil > now) {
    return { blocked: false, deferAvailable };
  }
  if (restriction.dailyLimitSeconds === 0) {
    return { blocked: true, deferAvailable };
  }
  return { blocked: todayUsedSeconds >= restriction.dailyLimitSeconds, deferAvailable };
}
```

(This compiles only after Task 4 adds `deferUsedDate` to the interface — if executing tasks strictly in order, expect a TS error on `deferUsedDate` until then; vitest still runs because it type-strips. Alternatively run Task 4 first; both orders are fine.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocking.ts tests/blocking.test.ts
git commit -m "feat: pure block-decision logic with once-per-day postpone"
```

---

### Task 3: Pure notification-interval module (`notify-logic.ts`)

**Files:**
- Create: `src/lib/notify-logic.ts`
- Test: `tests/notify-logic.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/notify-logic.test.ts
import { describe, it, expect } from 'vitest';
import { dueNotifyMultiple } from '../src/lib/notify-logic';

const TODAY = '2026-06-11';

describe('dueNotifyMultiple', () => {
  it('returns null below the first interval', () => {
    expect(dueNotifyMultiple(30, 29 * 60, undefined, TODAY)).toBeNull();
  });

  it('returns 1 when cumulative time crosses the interval', () => {
    expect(dueNotifyMultiple(30, 30 * 60, undefined, TODAY)).toBe(1);
  });

  it('returns null when that multiple was already notified today', () => {
    expect(dueNotifyMultiple(30, 35 * 60, { date: TODAY, lastMultiple: 1 }, TODAY)).toBeNull();
  });

  it('returns 2 at the second multiple', () => {
    expect(dueNotifyMultiple(30, 61 * 60, { date: TODAY, lastMultiple: 1 }, TODAY)).toBe(2);
  });

  it('ignores state from a previous day', () => {
    expect(dueNotifyMultiple(30, 30 * 60, { date: '2026-06-10', lastMultiple: 5 }, TODAY)).toBe(1);
  });

  it('returns null for a non-positive interval', () => {
    expect(dueNotifyMultiple(0, 9999, undefined, TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../src/lib/notify-logic`.

- [ ] **Step 3: Implement `src/lib/notify-logic.ts`**

```ts
export interface NotifyState {
  date: string;        // YYYY-MM-DD the lastMultiple applies to
  lastMultiple: number;
}

/**
 * Cumulative-daily notification check. Returns the interval multiple that is
 * now due (to notify for and record), or null if nothing new is due.
 */
export function dueNotifyMultiple(
  intervalMins: number,
  cumulativeSeconds: number,
  state: NotifyState | undefined,
  today: string,
): number | null {
  if (intervalMins <= 0) return null;
  const multiple = Math.floor(cumulativeSeconds / (intervalMins * 60));
  if (multiple < 1) return null;
  const last = state && state.date === today ? state.lastMultiple : 0;
  return multiple > last ? multiple : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 13 passed (7 + 6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify-logic.ts tests/notify-logic.test.ts
git commit -m "feat: cumulative-daily notification interval logic"
```

---

### Task 4: Schema v5 — `deferUsedDate`

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: Extend the interface**

In `src/db/index.ts`, replace the `DomainRestriction` interface with:

```ts
export interface DomainRestriction {
  domain: string;             // primary key
  dailyLimitSeconds: number;  // 0 = completely blocked
  deferUntil?: number;        // unix ms; block postponed while > now
  deferUsedDate?: string;     // YYYY-MM-DD; "+5 minutes" already used this day
}
```

- [ ] **Step 2: Add the v5 version block**

After the existing `this.version(4)` block in the constructor, add:

```ts
    // v5: deferUsedDate on domainRestrictions (non-indexed field; version bump
    // kept for explicit migration history). dailyLimitSeconds = 0 now means
    // "completely blocked".
    this.version(5).stores({
      timeEntries: '++id, domain, date, startedAt',
      videoSessions: '++id, videoId, date, channelName, category, startedAt',
      domainCategories: 'domain',
      domainRestrictions: 'domain',
      settings: 'key',
    });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/db/index.ts
git commit -m "feat: schema v5 — deferUsedDate for once-per-day postpone"
```

---

### Task 5: Background — enforcement + wired notifications + offscreen fix

**Files:**
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Add imports**

At the top of `background.ts`, extend the existing imports:

```ts
import { evaluateRestriction } from '../lib/blocking';
import { dueNotifyMultiple } from '../lib/notify-logic';
```

- [ ] **Step 2: Delete the dead code at the bottom of the file**

Remove everything from `// ── Per-website notification tracking ──…` to the end of the file (the `domainSessionStartTime` map and the old, never-called `checkWebsiteNotifications` — currently lines ~366-387).

- [ ] **Step 3: Add the real `checkWebsiteNotifications` above `flushSession`**

```ts
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
```

- [ ] **Step 4: Call it from `flushSession`**

In `flushSession`, after the successful `db.timeEntries.add(...)` and next to the existing `void categorizeDomainOnce(session.domain);`, add:

```ts
    void checkWebsiteNotifications(session.domain);
```

- [ ] **Step 5: Rewrite `checkRestrictions`**

Replace the whole `checkRestrictions` function with:

```ts
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
```

- [ ] **Step 6: Pass the new params in `startSession`'s redirect**

In `startSession`, replace the `if (blockStatus?.blocked) { ... }` redirect with:

```ts
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
```

- [ ] **Step 7: Ensure the offscreen document exists before Pomodoro sounds**

In the `pomodoro-work` alarm branch, replace the sound line with:

```ts
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ target: 'webpulse-offscreen', kind: 'pomodoro-sound', type: 'work-done' }).catch(() => {});
```

Same in the `pomodoro-rest` branch with `type: 'rest-done'`.

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/entrypoints/background.ts
git commit -m "feat: wire per-website notifications, complete-block enforcement, offscreen sound fix"
```

---

### Task 6: Block page rebuild

**Files:**
- Rewrite: `src/entrypoints/block/index.html`
- Rewrite: `src/entrypoints/block/main.ts`

- [ ] **Step 1: Replace `index.html` entirely**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WebPulse — Limit Reached</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #fff;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .page { text-align: center; max-width: 560px; }
      .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-size: 22px;
        font-weight: 700;
        color: #6b7280;
        margin-bottom: 48px;
      }
      .brand-icon { font-size: 28px; }
      .headline { font-size: 22px; color: #111; margin: 0 0 24px; }
      .site {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .site img { width: 32px; height: 32px; }
      .site span { font-size: 24px; font-weight: 700; color: #111; }
      .url { font-size: 14px; color: #9ca3af; margin: 0 0 28px; word-break: break-all; }
      .facts {
        display: inline-grid;
        grid-template-columns: auto auto;
        gap: 6px 32px;
        font-size: 17px;
        margin-bottom: 32px;
      }
      .facts .label { text-align: left; color: #111; }
      .facts .value { font-weight: 700; color: #111; }
      .postpone {
        display: inline-block;
        background: #5b79b5;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        padding: 12px 64px;
        cursor: pointer;
      }
      .postpone:hover { background: #4c68a3; }
      .note { font-size: 14px; color: #6b7280; margin-top: 14px; }
      .hidden { display: none; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="brand"><span class="brand-icon">⚡</span> WebPulse</div>
      <p class="headline">You've reached your limit for today on</p>
      <div class="site">
        <img id="favicon" alt="" />
        <span id="domain"></span>
      </div>
      <p class="url" id="url"></p>
      <div class="facts">
        <span class="label">Limit:</span><span class="value" id="limit"></span>
        <span class="label">Sessions:</span><span class="value" id="sessions"></span>
      </div>
      <div>
        <button id="postpone" class="postpone hidden">+ 5 minutes</button>
        <p id="postpone-note" class="note hidden">You can postpone the blocking for 5 minutes only once during the day</p>
      </div>
    </div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `main.ts` entirely**

```ts
import { db } from '../../db';
import { localDate } from '../../lib/hostname';

const params = new URLSearchParams(location.search);
const domain = params.get('domain') || 'this site';
const blockedUrl = params.get('url') || `https://${domain}`;
const limitSeconds = parseInt(params.get('limit') || '0', 10);
const sessions = params.get('sessions') || '0';
const deferAvailable = params.get('defer') === '1';

(document.getElementById('domain') as HTMLElement).textContent = domain;
(document.getElementById('favicon') as HTMLImageElement).src =
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
(document.getElementById('url') as HTMLElement).textContent = blockedUrl;

const h = Math.floor(limitSeconds / 3600);
const m = Math.floor((limitSeconds % 3600) / 60);
(document.getElementById('limit') as HTMLElement).textContent = `${h} h ${String(m).padStart(2, '0')} m`;
(document.getElementById('sessions') as HTMLElement).textContent = sessions;

const btn = document.getElementById('postpone') as HTMLButtonElement;
const note = document.getElementById('postpone-note') as HTMLElement;

if (deferAvailable) {
  btn.classList.remove('hidden');
  note.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const restriction = await db.domainRestrictions.get(domain);
    if (restriction) {
      await db.domainRestrictions.put({
        ...restriction,
        deferUntil: Date.now() + 5 * 60 * 1000,
        deferUsedDate: localDate(),
      });
    }
    location.href = blockedUrl;
  });
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0. (`defer()` no longer exists; the old inline `onclick` is gone with the rewritten HTML.)

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/block/index.html src/entrypoints/block/main.ts
git commit -m "feat: block page matches mockup with once-per-day +5 minutes postpone"
```

---

### Task 7: Dashboard — shared row component + styles

**Files:**
- Modify: `src/entrypoints/dashboard/App.tsx`
- Modify: `src/entrypoints/dashboard/style.css`

- [ ] **Step 1: Add the `SiteRow` component**

In `App.tsx`, directly above the `SettingsTab` function, add:

```tsx
function SiteRow({ domain, subtext, onDelete, onEdit }: {
  domain: string;
  subtext?: string;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  return (
    <li className="entry-row">
      <div className="entry-head">
        <button className="icon-btn icon-delete" title="Remove" onClick={onDelete}>✕</button>
        {onEdit && <button className="icon-btn" title="Edit" onClick={onEdit}>✏️</button>}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
          width={16} height={16} alt="" className="favicon"
        />
        <strong className="entry-domain">{domain}</strong>
      </div>
      {subtext && <div className="entry-sub">{subtext}</div>}
    </li>
  );
}

const fmtHM = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
```

- [ ] **Step 2: Add row styles to `style.css`** (append at the end)

```css
/* ── Settings entry rows (mockup style) ─────────────────────────────── */
.entry-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.entry-row { padding: 2px 0; }
.entry-head { display: flex; align-items: center; gap: 12px; }
.icon-btn { background: none; border: none; cursor: pointer; font-size: 15px; padding: 0; line-height: 1; }
.icon-btn.icon-delete { color: #e74c3c; font-weight: 700; font-size: 18px; }
.entry-domain { font-size: 14px; color: #111; }
.entry-sub { font-size: 13px; color: #888; margin-top: 4px; margin-left: 64px; }
.entry-box { border: 1px solid #e5e5ec; border-radius: 10px; padding: 16px; background: #fff; min-height: 150px; margin-bottom: 16px; }
.entry-empty { color: #999; text-align: center; margin: 0; line-height: 150px; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (SiteRow is allowed to be momentarily unused — if `noUnusedLocals` complains, proceed to Task 8 before typechecking; Tasks 7-9 may be committed together in that case).

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/dashboard/App.tsx src/entrypoints/dashboard/style.css
git commit -m "feat: shared SiteRow list component and entry styles"
```

---

### Task 8: Dashboard — restrictions section (Completely Block + edit)

**Files:**
- Modify: `src/entrypoints/dashboard/App.tsx` (SettingsTab)

- [ ] **Step 1: Add state and handlers**

Inside `SettingsTab`, add to the existing state declarations:

```tsx
  const [completelyBlock, setCompletelyBlock] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
```

Replace `addLimit` and `removeLimit` with:

```tsx
  async function addLimit() {
    if (!limitDomain.trim()) return;
    const domain = normalizeDomain(limitDomain);
    const seconds = completelyBlock ? 0 : Math.max(0, (parseInt(limitMins) || 0) * 60);
    // put() intentionally drops deferUntil/deferUsedDate — editing a limit resets today's postpone
    await db.domainRestrictions.put({ domain, dailyLimitSeconds: seconds });
    if (editingLimit && editingLimit !== domain) {
      await db.domainRestrictions.delete(editingLimit);
    }
    const rests = await db.domainRestrictions.toArray();
    setRestrictions(rests.map(r => ({ domain: r.domain, dailyLimitSeconds: r.dailyLimitSeconds })));
    setLimitDomain('');
    setLimitMins('60');
    setCompletelyBlock(false);
    setEditingLimit(null);
  }

  async function removeLimit(domain: string) {
    await db.domainRestrictions.delete(domain);
    setRestrictions(prev => prev.filter(r => r.domain !== domain));
    if (editingLimit === domain) {
      setEditingLimit(null);
      setLimitDomain('');
      setLimitMins('60');
      setCompletelyBlock(false);
    }
  }

  function startEditLimit(r: { domain: string; dailyLimitSeconds: number }) {
    setLimitDomain(r.domain);
    setLimitMins(String(Math.round(r.dailyLimitSeconds / 60)));
    setCompletelyBlock(r.dailyLimitSeconds === 0);
    setEditingLimit(r.domain);
  }
```

- [ ] **Step 2: Replace the Daily Limits JSX section**

Replace the whole `{/* Daily Limits */}` `<section className="card">…</section>` with:

```tsx
      {/* Daily Limits */}
      <section className="card">
        <h2 className="card-title">Daily access restrictions for the websites</h2>
        <p className="card-subtitle">Set the maximum time allowed to visit the website per day. After this time, the site will be blocked.</p>
        <p className="card-subtitle" style={{ fontSize: '12px', color: '#666' }}>If you set the blocking time to 0 hours 0 minutes, the website will be blocked immediately</p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Enter website name..."
            value={limitDomain}
            onChange={e => setLimitDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addLimit()}
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f9f9fc', border: '1px solid #ddd', borderRadius: '8px', padding: '6px 10px', opacity: completelyBlock ? 0.5 : 1 }}>
            <span style={{ fontSize: '12px', color: '#666' }}>📅</span>
            <input
              type="time"
              disabled={completelyBlock}
              value={String(Math.floor((parseInt(limitMins) || 0) / 60)).padStart(2, '0') + ':' + String((parseInt(limitMins) || 0) % 60).padStart(2, '0')}
              onChange={e => {
                const [h, m] = e.target.value.split(':');
                setLimitMins(String(parseInt(h) * 60 + parseInt(m)));
              }}
              style={{ border: 'none', background: 'transparent', fontSize: '13px', color: '#111', cursor: 'pointer', width: '60px', outline: 'none' }}
            />
            <button
              onClick={() => setLimitMins('60')}
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
            >
              ✕
            </button>
          </div>
          <button className="btn btn-primary" onClick={addLimit} style={{ padding: '8px 20px' }}>
            {editingLimit ? 'Save' : 'Add Website'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <input
            type="checkbox"
            id="completely-block"
            checked={completelyBlock}
            onChange={e => setCompletelyBlock(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366f1' }}
          />
          <label htmlFor="completely-block" style={{ fontSize: '13px', color: '#333', cursor: 'pointer' }}>Completely Block</label>
        </div>

        <div className="entry-box">
          {restrictions.length > 0 ? (
            <ul className="entry-list">
              {restrictions.map(r => (
                <SiteRow
                  key={r.domain}
                  domain={r.domain}
                  subtext={r.dailyLimitSeconds === 0 ? 'Completely Blocked' : `Limit : ${fmtHM(Math.round(r.dailyLimitSeconds / 60))}`}
                  onDelete={() => removeLimit(r.domain)}
                  onEdit={() => startEditLimit(r)}
                />
              ))}
            </ul>
          ) : (
            <p className="entry-empty">No restrictions yet</p>
          )}
        </div>
      </section>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/dashboard/App.tsx
git commit -m "feat: restrictions UI — Completely Block checkbox and pencil edit"
```

---

### Task 9: Dashboard — whitelist section (reorder + settings-wipe fix)

**Files:**
- Modify: `src/entrypoints/dashboard/App.tsx` (SettingsTab)

- [ ] **Step 1: Fix the settings-wipe bug**

Replace `addWhitelist` and `removeWhitelist` with versions that use `update` (NOT `put`, which replaces the whole settings document and wipes notification settings):

```tsx
  async function addWhitelist() {
    if (!whitelistDomain.trim()) return;
    const domain = normalizeDomain(whitelistDomain);
    const updated = ignored.includes(domain) ? ignored : [...ignored, domain];
    await db.settings.update('default', { ignoredDomains: updated });
    setIgnored(updated);
    setWhitelistDomain('');
  }

  async function removeWhitelist(domain: string) {
    const updated = ignored.filter(d => d !== domain);
    await db.settings.update('default', { ignoredDomains: updated });
    setIgnored(updated);
  }
```

- [ ] **Step 2: Replace the Whitelist JSX section** (list box first, input row below, SiteRow without pencil)

```tsx
      {/* Whitelist */}
      <section className="card">
        <h2 className="card-title">Activity and spent time for these websites will not be tracked</h2>

        <div className="entry-box">
          {ignored.length > 0 ? (
            <ul className="entry-list">
              {ignored.map(d => (
                <SiteRow key={d} domain={d} onDelete={() => removeWhitelist(d)} />
              ))}
            </ul>
          ) : (
            <p className="entry-empty">No whitelisted sites yet</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Enter website name..."
            value={whitelistDomain}
            onChange={e => setWhitelistDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addWhitelist()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={addWhitelist} style={{ padding: '8px 20px' }}>Add Website</button>
        </div>
      </section>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/dashboard/App.tsx
git commit -m "fix: whitelist edits no longer wipe notification settings; mockup layout"
```

---

### Task 10: Dashboard — notifications section (edit flow + recap reschedule)

**Files:**
- Modify: `src/entrypoints/dashboard/App.tsx` (SettingsTab)

- [ ] **Step 1: Add edit state and recap rescheduling**

Inside `SettingsTab`, add:

```tsx
  const [editingNotify, setEditingNotify] = useState<string | null>(null);

  function startEditNotify(n: { domain: string; intervalMins: number }) {
    setNotifyWebsite(n.domain);
    setNotifyInterval(String(n.intervalMins));
    setEditingNotify(n.domain);
  }

  async function rescheduleDailyRecap(timeStr: string) {
    await chrome.alarms.clear('daily-recap');
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (now > next) next.setDate(next.getDate() + 1);
    chrome.alarms.create('daily-recap', {
      delayInMinutes: Math.ceil((next.getTime() - now.getTime()) / 60000),
      periodInMinutes: 24 * 60,
    });
  }
```

Replace `addNotifyWebsite` and `removeNotifyWebsite` with:

```tsx
  async function addNotifyWebsite() {
    if (!notifyWebsite.trim()) return;
    const domain = normalizeDomain(notifyWebsite);
    const intervalMins = Math.max(1, parseInt(notifyInterval) || 30);
    let updated = notifyWebsites.find(n => n.domain === domain)
      ? notifyWebsites.map(n => (n.domain === domain ? { domain, intervalMins } : n))
      : [...notifyWebsites, { domain, intervalMins }];
    if (editingNotify && editingNotify !== domain) {
      updated = updated.filter(n => n.domain !== editingNotify);
    }
    setNotifyWebsites(updated);
    await db.settings.update('default', { notifyWebsites: updated });
    setNotifyWebsite('');
    setNotifyInterval('30');
    setEditingNotify(null);
  }

  async function removeNotifyWebsite(domain: string) {
    const updated = notifyWebsites.filter(n => n.domain !== domain);
    setNotifyWebsites(updated);
    await db.settings.update('default', { notifyWebsites: updated });
    if (editingNotify === domain) {
      setEditingNotify(null);
      setNotifyWebsite('');
      setNotifyInterval('30');
    }
  }
```

Replace `saveNotificationSettings` so the recap alarm follows the configured time:

```tsx
  async function saveNotificationSettings() {
    await db.settings.update('default', {
      notifyDailyEnabled,
      notifyDailyTime,
      notifyWebsites,
      notifyMessage,
    });
    await rescheduleDailyRecap(notifyDailyTime);
  }
```

(The existing debounced `useEffect` that calls `saveNotificationSettings` stays as-is.)

- [ ] **Step 2: Replace the Notifications JSX section**

```tsx
      {/* Notifications */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <input
            type="checkbox"
            id="notify-daily"
            checked={notifyDailyEnabled}
            onChange={e => setNotifyDailyEnabled(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#6366f1' }}
          />
          <label htmlFor="notify-daily" style={{ fontSize: '15px', fontWeight: '600', color: '#111', cursor: 'pointer', margin: 0 }}>
            Daily Summary Notifications
          </label>
        </div>
        <p className="card-subtitle" style={{ marginBottom: '16px' }}>At the end of each day, you will receive a notification with a summary of your daily usage</p>

        {notifyDailyEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <label style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: '#111' }}>
              Notification time with summary information about your daily usage
            </label>
            <input
              type="time"
              value={notifyDailyTime}
              onChange={e => setNotifyDailyTime(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', color: '#111', fontFamily: 'inherit' }}
            />
          </div>
        )}

        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111', margin: '16px 0 4px' }}>Notifications for websites</h3>
        <p className="card-subtitle" style={{ fontSize: '12px', marginBottom: '12px' }}>Show notifications every time you spend a selected period of time on the website</p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Enter website name..."
            value={notifyWebsite}
            onChange={e => setNotifyWebsite(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNotifyWebsite()}
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f9f9fc', border: '1px solid #ddd', borderRadius: '8px', padding: '6px 10px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>📅</span>
            <input
              type="time"
              value={String(Math.floor((parseInt(notifyInterval) || 0) / 60)).padStart(2, '0') + ':' + String((parseInt(notifyInterval) || 0) % 60).padStart(2, '0')}
              onChange={e => {
                const [h, m] = e.target.value.split(':');
                setNotifyInterval(String(parseInt(h) * 60 + parseInt(m)));
              }}
              style={{ border: 'none', background: 'transparent', fontSize: '13px', color: '#111', cursor: 'pointer', width: '60px', outline: 'none' }}
            />
            <button
              onClick={() => setNotifyInterval('30')}
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
            >
              ✕
            </button>
          </div>
          <button className="btn btn-primary" onClick={addNotifyWebsite} style={{ padding: '8px 20px' }}>
            {editingNotify ? 'Save' : 'Add Website'}
          </button>
        </div>

        <div className="entry-box">
          {notifyWebsites.length > 0 ? (
            <ul className="entry-list">
              {notifyWebsites.map(n => (
                <SiteRow
                  key={n.domain}
                  domain={n.domain}
                  subtext={`Limit : ${fmtHM(n.intervalMins)}`}
                  onDelete={() => removeNotifyWebsite(n.domain)}
                  onEdit={() => startEditNotify(n)}
                />
              ))}
            </ul>
          ) : (
            <p className="entry-empty">No per-website notifications yet</p>
          )}
        </div>

        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111', margin: '16px 0 4px' }}>Notification message</h3>
        <p className="card-subtitle" style={{ fontSize: '12px', marginBottom: '12px' }}>You will see this message in notification for websites every time</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <textarea
            value={notifyMessage}
            onChange={e => setNotifyMessage(e.target.value)}
            placeholder="You have spent a lot of time on this site"
            rows={2}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', color: '#111', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <button className="btn btn-primary" onClick={saveNotificationSettings} style={{ padding: '8px 20px', marginTop: '0' }}>Save</button>
        </div>
      </section>
```

- [ ] **Step 3: Typecheck, build, and run unit tests**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: all exit 0, 13 tests passed.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/dashboard/App.tsx
git commit -m "feat: notifications UI — edit flow, inline recap time, alarm reschedule"
```

---

### Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full automated check**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 13 tests pass, typecheck clean, build succeeds.

- [ ] **Step 2: Manual verification in Chrome** (load unpacked from `dist/chrome-mv3`, hard-refresh open tabs after reload — stale content scripts silently stop tracking)

1. Settings → add restriction `example.com` with 1 minute. Browse example.com >1 min → block page shows favicon, domain, full URL, `Limit: 0 h 01 m`, `Sessions: N`, "+5 minutes" button.
2. Click "+5 minutes" → returns to the site; after 5 min, blocked again with NO postpone button.
3. Add a restriction with "Completely Block" checked → first visit is blocked, `Limit: 0 h 00 m`; postpone still offered once.
4. Pencil on a restriction → values load into inputs, button reads "Save"; change time and save → list updates in place.
5. Notifications → add `example.com` at 1 minute (00:01) → browse ~1 min → Chrome notification with the custom message; again at ~2 min.
6. Whitelist → add/remove a domain, then reload the dashboard → notification settings (time, websites, message) are still intact.
7. Change daily summary time → in the SW console run `chrome.alarms.get('daily-recap', a => console.log(new Date(a.scheduledTime)))` → matches the new time.
8. Start a 1-minute Pomodoro in a fresh browser session (no AI calls made) → completion sound plays.

- [ ] **Step 3: Mark Session 5 gaps closed in PLAN.md** (optional touch-up)

In `PLAN.md`, update the Session 5 "Per-website notifications" bullet and the export-button location note if desired; at minimum append under Session 5 notes:

```markdown
- 2026-06-11: Settings/blocking/notifications redesigned to mockups — per-website
  notifications now fire (cumulative daily, chrome.storage notifyState), complete
  block (limit 0), +5 min postpone once/day, whitelist no longer wipes settings.
  See docs/superpowers/specs/2026-06-11-settings-blocking-notifications-design.md
```

- [ ] **Step 4: Commit**

```bash
git add PLAN.md
git commit -m "docs: record settings/blocking/notifications redesign in PLAN.md"
```

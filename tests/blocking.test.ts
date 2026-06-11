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

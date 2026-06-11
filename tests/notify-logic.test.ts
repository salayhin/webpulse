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

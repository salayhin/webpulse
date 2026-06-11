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

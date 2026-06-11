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

// Pomodoro state managed via chrome.alarms + Zustand
// Sessions are 25 min work, 5 min rest, repeat. Tracked in Dexie as 'pomodoroSessions'.

export type PomodoroMode = 'idle' | 'work' | 'rest' | 'break';

export interface PomodoroState {
  mode: PomodoroMode;
  startedAt: number | null;  // unix ms, null if idle
  workMins: number;
  restMins: number;
  sessionsCompleted: number;
}

// Stored in chrome.storage.local under 'pomodoro'
export async function getPomodoroState(): Promise<PomodoroState> {
  const data = await chrome.storage.local.get('pomodoro');
  return (data.pomodoro as PomodoroState | undefined) || {
    mode: 'idle',
    startedAt: null,
    workMins: 25,
    restMins: 5,
    sessionsCompleted: 0,
  };
}

export async function setPomodoroState(state: PomodoroState): Promise<void> {
  await chrome.storage.local.set({ pomodoro: state });
}

export async function startPomodoro(workMins: number, restMins: number): Promise<void> {
  const state: PomodoroState = {
    mode: 'work',
    startedAt: Date.now(),
    workMins,
    restMins,
    sessionsCompleted: 0,
  };
  await setPomodoroState(state);
  // Alarm fires after workMins
  chrome.alarms.create('pomodoro-work', { delayInMinutes: workMins });
}

export async function pausePomodoro(): Promise<void> {
  const state = await getPomodoroState();
  if (state.mode !== 'idle') {
    state.mode = 'idle';
    state.startedAt = null;
    await setPomodoroState(state);
    chrome.alarms.clear('pomodoro-work');
    chrome.alarms.clear('pomodoro-rest');
  }
}

export async function resetPomodoro(): Promise<void> {
  await pausePomodoro();
  const state = await getPomodoroState();
  state.sessionsCompleted = 0;
  await setPomodoroState(state);
}

export async function getTimeRemainingMs(): Promise<number | null> {
  const state = await getPomodoroState();
  if (state.mode === 'idle' || !state.startedAt) return null;
  const duration = (state.mode === 'work' ? state.workMins : state.restMins) * 60 * 1000;
  return Math.max(0, duration - (Date.now() - state.startedAt));
}

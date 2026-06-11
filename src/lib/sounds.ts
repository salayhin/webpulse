// Synthesized Pomodoro alert sounds (Web Audio API, zero dependencies).
// Shared by the dashboard ("Click to listen" preview) and the offscreen
// document (playback when an alarm fires). Both run in a document context
// where `window`/AudioContext exist — do NOT import this into the service worker.

interface Note {
  freq: number;
  at: number;       // start offset in seconds
  dur: number;      // duration in seconds
  type?: OscillatorType;
}

export interface SoundPreset {
  id: string;
  label: string;
  notes: Note[];
}

export const SOUND_PRESETS: SoundPreset[] = [
  { id: 's1', label: 'Sound 1', notes: [{ freq: 880, at: 0, dur: 0.25 }] },
  { id: 's2', label: 'Sound 2', notes: [{ freq: 660, at: 0, dur: 0.15 }, { freq: 880, at: 0.2, dur: 0.22 }] },
  { id: 's3', label: 'Sound 3', notes: [{ freq: 800, at: 0, dur: 0.2 }, { freq: 1000, at: 0.25, dur: 0.2 }, { freq: 1200, at: 0.5, dur: 0.26 }] },
  { id: 's4', label: 'Sound 4', notes: [{ freq: 1000, at: 0, dur: 0.5 }] },
  { id: 's5', label: 'Sound 5', notes: [{ freq: 1200, at: 0, dur: 0.12 }, { freq: 900, at: 0.16, dur: 0.12 }, { freq: 600, at: 0.32, dur: 0.22 }] },
  { id: 's6', label: 'Sound 6', notes: [{ freq: 523, at: 0, dur: 0.18 }, { freq: 659, at: 0.18, dur: 0.18 }, { freq: 784, at: 0.36, dur: 0.32 }] },
  { id: 's7', label: 'Sound 7', notes: [{ freq: 440, at: 0, dur: 0.1 }, { freq: 440, at: 0.16, dur: 0.1 }, { freq: 440, at: 0.32, dur: 0.12 }] },
  { id: 's8', label: 'Sound 8', notes: [{ freq: 1320, at: 0, dur: 0.45, type: 'triangle' }] },
];

export const DEFAULT_WORK_SOUND = 's3';
export const DEFAULT_REST_SOUND = 's4';
export const DEFAULT_DONE_SOUND = 's6';

/** Play a preset by id. No-op if Web Audio is unavailable. */
export function playPreset(id: string): void {
  const preset = SOUND_PRESETS.find(p => p.id === id) ?? SOUND_PRESETS[0];
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime;

  for (const n of preset.notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Quick attack + smooth decay to avoid clicks
    gain.gain.setValueAtTime(0.0001, now + n.at);
    gain.gain.exponentialRampToValueAtTime(0.25, now + n.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.dur + 0.03);
  }

  const total = Math.max(...preset.notes.map(n => n.at + n.dur)) + 0.15;
  setTimeout(() => ctx.close().catch(() => {}), total * 1000 + 100);
}

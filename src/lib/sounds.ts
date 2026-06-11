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

// ── Ambient background sounds (looped while the Pomodoro timer runs) ─────────

export interface AmbientOption { id: string; label: string; }

export const AMBIENT_OPTIONS: AmbientOption[] = [
  { id: 'none', label: 'None' },
  { id: 'white', label: 'White noise' },
  { id: 'brown', label: 'Brown noise' },
  { id: 'tick', label: 'Clock tick-tock' },
];

export const DEFAULT_AMBIENT = 'none';

export interface AmbientHandle { stop(): void; }

/**
 * Start a continuously-looping ambient sound. Returns a handle whose stop()
 * fades out and releases the audio context, or null for 'none'/unavailable.
 */
export function startAmbient(id: string): AmbientHandle | null {
  if (!id || id === 'none') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  const ctx: AudioContext = new Ctx();

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const targetGain = id === 'tick' ? 0.5 : 0.12;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(targetGain, ctx.currentTime + 0.4);

  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let node: AudioBufferSourceNode | undefined;

  if (id === 'white' || id === 'brown') {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (id === 'white') {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } else {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = id === 'brown' ? 500 : 8000;
    src.connect(lp);
    lp.connect(master);
    src.start();
    node = src;
  } else if (id === 'tick') {
    // Alternating tick / tock clicks, twice per second — like an analog watch
    let tock = false;
    const click = () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = tock ? 1100 : 1500;
      tock = !tock;
      osc.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.start(t);
      osc.stop(t + 0.05);
    };
    click();
    tickTimer = setInterval(click, 500);
  }

  return {
    stop() {
      try { master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2); } catch { /* ctx may be closing */ }
      if (tickTimer) clearInterval(tickTimer);
      if (node) { try { node.stop(ctx.currentTime + 0.25); } catch { /* already stopped */ } }
      setTimeout(() => ctx.close().catch(() => {}), 400);
    },
  };
}

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

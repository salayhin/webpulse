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
  { id: 'wave', label: 'Ocean waves' },
  { id: 'rain', label: 'Rain & thunder' },
  { id: 'brown', label: 'Brown noise' },
  { id: 'tick', label: 'Clock tick-tock' },
];

export const DEFAULT_AMBIENT = 'none';

export interface AmbientHandle { stop(): void; }

// Helper: fill a buffer with brown noise (integrated white noise — deep rumble).
function fillBrownNoise(data: Float32Array, amp = 3.5): void {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * amp;
  }
}

/**
 * Start a continuously-looping ambient sound. Returns a handle whose stop()
 * fades out and releases the audio context, or null for 'none'/unavailable.
 */
export function startAmbient(id: string): AmbientHandle | null {
  if (!id || id === 'none') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  const ctx: AudioContext = new Ctx();
  // Some browsers (and the offscreen doc) start the context suspended; resume
  // proactively so the very first sample is audible.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const master = ctx.createGain();
  master.connect(ctx.destination);
  // Per-preset master level. Tick is short transients so it needs more headroom.
  const targetGain = id === 'tick' ? 0.6 : id === 'rain' ? 0.18 : 0.14;
  // Very short fade-in (10 ms) — long fades made the first tick inaudible.
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(targetGain, ctx.currentTime + 0.05);

  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let thunderTimer: ReturnType<typeof setTimeout> | undefined;
  const stoppables: AudioScheduledSourceNode[] = [];

  if (id === 'brown') {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    fillBrownNoise(buffer.getChannelData(0));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    src.connect(lp);
    lp.connect(master);
    src.start();
    stoppables.push(src);
  } else if (id === 'wave') {
    // Ocean swells: brown noise through a slow LFO-modulated low-pass to mimic
    // the rolling rise + crash of waves on a beach.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    fillBrownNoise(buffer.getChannelData(0), 4);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    // Swell envelope — LFO modulates a gain node so amplitude rises + falls.
    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13; // ~7.7s period — one full wave cycle
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.45;
    lfo.connect(lfoAmt);
    lfoAmt.connect(swell.gain);
    lfo.start();
    src.connect(lp);
    lp.connect(swell);
    swell.connect(master);
    src.start();
    stoppables.push(src, lfo);
  } else if (id === 'rain') {
    // Steady rain: white noise band-passed for the high "shhhh" of drops.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 800;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(master);
    src.start();
    stoppables.push(src);

    // Thunder: low-pass brown noise burst every 12–35s with a deep rumble decay.
    const scheduleThunder = () => {
      const delay = 12000 + Math.random() * 23000;
      thunderTimer = setTimeout(() => {
        const t = ctx.currentTime;
        const tbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3.5), ctx.sampleRate);
        fillBrownNoise(tbuf.getChannelData(0), 5);
        const tsrc = ctx.createBufferSource();
        tsrc.buffer = tbuf;
        const tlp = ctx.createBiquadFilter();
        tlp.type = 'lowpass';
        tlp.frequency.value = 220;
        const tg = ctx.createGain();
        // Sharp initial crack, long rumbling tail
        tg.gain.setValueAtTime(0.0001, t);
        tg.gain.exponentialRampToValueAtTime(2.5, t + 0.12);
        tg.gain.exponentialRampToValueAtTime(0.6, t + 0.6);
        tg.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        tsrc.connect(tlp);
        tlp.connect(tg);
        tg.connect(master);
        tsrc.start(t);
        tsrc.stop(t + 3.3);
        scheduleThunder();
      }, delay);
    };
    scheduleThunder();
  } else if (id === 'tick') {
    // Alternating tick / tock — short noise transient + a pitched triangle pop,
    // twice a second, like an analog watch. The noise burst gives it the
    // characteristic "tk" attack that pure square waves miss.
    let tock = false;
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.012), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);

    const click = () => {
      const t = ctx.currentTime;
      // 1) Noise transient (the "tk")
      const nsrc = ctx.createBufferSource();
      nsrc.buffer = noiseBuf;
      const nhp = ctx.createBiquadFilter();
      nhp.type = 'highpass';
      nhp.frequency.value = 2000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.9, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      nsrc.connect(nhp);
      nhp.connect(ng);
      ng.connect(master);
      nsrc.start(t);
      // 2) Short pitched body — tick high, tock low
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = tock ? 950 : 1450;
      tock = !tock;
      osc.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.55, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      osc.start(t);
      osc.stop(t + 0.06);
    };
    // Schedule the first tick slightly after the fade-in completes so it's
    // audible at full level.
    setTimeout(click, 60);
    tickTimer = setInterval(click, 500);
  }

  return {
    stop() {
      try { master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2); } catch { /* ctx may be closing */ }
      if (tickTimer) clearInterval(tickTimer);
      if (thunderTimer) clearTimeout(thunderTimer);
      for (const s of stoppables) { try { s.stop(ctx.currentTime + 0.25); } catch { /* already stopped */ } }
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

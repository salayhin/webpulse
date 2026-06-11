import { categorizeDomain, categorizeYouTubeTitle } from '../../lib/ai-categorize';

// Runs AI classification + Pomodoro audio in an extension document.
// LanguageModel (Gemini Nano) is available in extension documents like this one,
// but not in content scripts on regular web pages.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'webpulse-offscreen') return false;

  (async () => {
    if (message.kind === 'domain') {
      sendResponse({ category: await categorizeDomain(message.domain) });
    } else if (message.kind === 'video') {
      sendResponse({ category: await categorizeYouTubeTitle(message.title, message.channelName) });
    } else if (message.kind === 'pomodoro-sound') {
      playPomodoroSound(message.type); // 'work-done' or 'rest-done'
      sendResponse({ ok: true });
    } else {
      sendResponse({ category: null });
    }
  })();

  return true; // async response
});

// Simple Pomodoro alert sound using Web Audio API
function playPomodoroSound(type: 'work-done' | 'rest-done') {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const now = audioContext.currentTime;

  if (type === 'work-done') {
    // Three ascending beeps: 800→1000→1200 Hz, 200ms each
    for (let i = 0; i < 3; i++) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = 800 + i * 200;
      gain.gain.setValueAtTime(0.2, now + i * 0.25);
      gain.gain.setValueAtTime(0, now + i * 0.25 + 0.2);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.2);
    }
  } else if (type === 'rest-done') {
    // Single longer beep: 1000 Hz, 500ms
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.setValueAtTime(0, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

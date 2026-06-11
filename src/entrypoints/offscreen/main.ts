import { categorizeDomain, categorizeYouTubeTitle } from '../../lib/ai-categorize';
import { playPreset } from '../../lib/sounds';

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
      playPreset(message.soundId); // preset id from src/lib/sounds.ts
      sendResponse({ ok: true });
    } else {
      sendResponse({ category: null });
    }
  })();

  return true; // async response
});

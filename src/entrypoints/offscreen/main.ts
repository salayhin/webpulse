import { categorizeDomain, categorizeYouTubeTitle } from '../../lib/ai-categorize';

// Runs AI classification requests from the background service worker.
// LanguageModel (Gemini Nano) is available in extension documents like this one,
// but not in content scripts on regular web pages.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'webpulse-offscreen') return false;

  (async () => {
    if (message.kind === 'domain') {
      sendResponse({ category: await categorizeDomain(message.domain) });
    } else if (message.kind === 'video') {
      sendResponse({ category: await categorizeYouTubeTitle(message.title, message.channelName) });
    } else {
      sendResponse({ category: null });
    }
  })();

  return true; // async response
});

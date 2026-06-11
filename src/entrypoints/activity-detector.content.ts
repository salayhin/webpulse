export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',

  main() {
    const PING_INTERVAL = 10_000; // 10 seconds
    const IDLE_THRESHOLD = 30_000; // 30 seconds — mirrors background idle interval

    let lastActivity = Date.now(); // assume active on page load

    function onActivity() {
      lastActivity = Date.now();
    }

    document.addEventListener('mousemove', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity, { passive: true });
    document.addEventListener('scroll', onActivity, { passive: true });
    document.addEventListener('click', onActivity, { passive: true });
    document.addEventListener('touchstart', onActivity, { passive: true });

    const timer = setInterval(() => {
      if (!chrome.runtime?.id) { clearInterval(timer); return; }
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity >= IDLE_THRESHOLD) return;
      chrome.runtime.sendMessage({ type: 'ACTIVITY_PING' }).catch(() => {});
    }, PING_INTERVAL);
  },
});

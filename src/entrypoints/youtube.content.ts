interface YtMeta {
  videoId: string;
  title: string;
  channelName: string;
  category: string;
  startedAt?: number;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    let currentMeta: YtMeta | null = null;
    let sessionStartedAt: number | null = null;
    let accumulatedMs = 0;
    let videoEl: HTMLVideoElement | null = null;

    // ── Metadata ───────────────────────────────────────────────────────────

    function readMeta(): YtMeta | null {
      if (location.pathname !== '/watch') return null;
      const videoId = new URLSearchParams(location.search).get('v');
      if (!videoId) return null;

      const ipr = (window as any).ytInitialPlayerResponse;
      const details = ipr?.videoDetails;
      const mf = ipr?.microformat?.playerMicroformatRenderer;

      return {
        videoId,
        title: details?.title ?? document.title.replace(' - YouTube', '').trim(),
        channelName: mf?.ownerChannelName ?? details?.author ?? 'Unknown',
        category: mf?.category ?? 'Unknown',
      };
    }

    // ── Timing ─────────────────────────────────────────────────────────────

    function onPlay() {
      if (sessionStartedAt !== null) return;
      sessionStartedAt = Date.now();
    }

    function onPause() {
      if (sessionStartedAt === null) return;
      accumulatedMs += Date.now() - sessionStartedAt;
      sessionStartedAt = null;
    }

    function flush() {
      if (sessionStartedAt !== null) {
        accumulatedMs += Date.now() - sessionStartedAt;
        sessionStartedAt = null;
      }
      if (!currentMeta) return;

      const watchedSeconds = Math.round(accumulatedMs / 1000);
      const meta = currentMeta;
      currentMeta = null;
      accumulatedMs = 0;

      if (watchedSeconds < 3) return;

      chrome.runtime.sendMessage({
        type: 'YOUTUBE_SESSION',
        ...meta,
        startedAt: Date.now() - watchedSeconds * 1000,
        watchedSeconds,
      }).catch(() => {});
    }

    // ── Video element ──────────────────────────────────────────────────────

    function detachVideo() {
      if (!videoEl) return;
      videoEl.removeEventListener('play', onPlay);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('ended', onPause);
      videoEl = null;
    }

    function attachVideo(v: HTMLVideoElement) {
      videoEl = v;
      v.addEventListener('play', onPlay);
      v.addEventListener('pause', onPause);
      v.addEventListener('ended', onPause);
      if (!v.paused) onPlay();
    }

    function findAndAttach(attempts = 0) {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      if (v) { attachVideo(v); return; }
      if (attempts < 10) setTimeout(() => findAndAttach(attempts + 1), 400);
    }

    // ── Page setup ─────────────────────────────────────────────────────────

    function setupWatchPage() {
      flush();
      detachVideo();

      const meta = readMeta();
      if (!meta) return;

      currentMeta = meta;
      accumulatedMs = 0;
      sessionStartedAt = null;

      findAndAttach();
    }

    // ── Event listeners ────────────────────────────────────────────────────

    document.addEventListener('yt-navigate-finish', () => {
      if (location.pathname === '/watch') {
        setupWatchPage();
      } else {
        flush();
        detachVideo();
      }
    });

    // Handle landing directly on a watch page
    if (location.pathname === '/watch') {
      setTimeout(setupWatchPage, 500);
    }

    window.addEventListener('beforeunload', flush);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        onPause();
      } else if (currentMeta && videoEl && !videoEl.paused) {
        onPlay();
      }
    });
  },
});

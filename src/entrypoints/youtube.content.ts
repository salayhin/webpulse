interface YtMeta {
  videoId: string;
  title: string;
  channelName: string;
  category: string;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    let currentMeta: YtMeta | null = null;
    let sessionStartedAt: number | null = null;
    let accumulatedMs = 0;
    let videoEl: HTMLVideoElement | null = null;

    // Head meta tags (genre) describe only the video in the initial HTML —
    // YouTube does NOT update them on SPA navigation. Content scripts also
    // can't read page JS (ytInitialPlayerResponse), so live DOM is the source
    // of truth; the background fills missing categories via on-device AI.
    const initialVideoId = location.pathname === '/watch'
      ? new URLSearchParams(location.search).get('v')
      : null;

    const H1_TITLE = 'ytd-watch-metadata h1 yt-formatted-string';
    const CHANNEL = 'ytd-video-owner-renderer ytd-channel-name yt-formatted-string#text';

    function domText(selector: string): string | undefined {
      return (document.querySelector(selector) as HTMLElement | null)?.textContent?.trim() || undefined;
    }
    function metaContent(attr: string, value: string): string | undefined {
      return (document.querySelector(`meta[${attr}="${value}"]`) as HTMLMetaElement | null)?.content || undefined;
    }

    // ── Metadata ───────────────────────────────────────────────────────────

    function readMeta(): YtMeta | null {
      if (location.pathname !== '/watch') return null;
      const videoId = new URLSearchParams(location.search).get('v');
      if (!videoId) return null;

      const docTitle = document.title
        .replace(/^\(\d+\)\s*/, '')
        .replace(/ - YouTube$/, '')
        .trim();

      return {
        videoId,
        title: domText(H1_TITLE) ?? (docTitle || 'Unknown'),
        channelName: domText(CHANNEL) ?? domText('#owner #channel-name a') ?? 'Unknown',
        // genre meta is only trustworthy for the full-page-load video
        category: videoId === initialVideoId
          ? (metaContent('itemprop', 'genre') ?? 'Unknown')
          : 'Unknown',
      };
    }

    // The watch page renders its metadata (h1, channel) shortly after
    // navigation. Re-read until the h1 is present, updating in place.
    function refineMeta(videoId: string, attempts = 0) {
      if (attempts >= 8) return;
      setTimeout(() => {
        if (currentMeta?.videoId !== videoId) return;
        if (!domText(H1_TITLE)) { refineMeta(videoId, attempts + 1); return; }
        const fresh = readMeta();
        if (!fresh || fresh.videoId !== videoId) return;
        currentMeta.title = fresh.title;
        currentMeta.channelName = fresh.channelName;
        if (currentMeta.category === 'Unknown') currentMeta.category = fresh.category;
      }, 600);
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

      sendSession({
        type: 'YOUTUBE_SESSION',
        ...meta,
        startedAt: Date.now() - watchedSeconds * 1000,
        watchedSeconds,
      });
    }

    function sendSession(payload: Record<string, unknown>, retried = false) {
      try {
        chrome.runtime.sendMessage(payload)
          .then(() => console.log('[WebPulse] session sent:', payload.title, `${payload.watchedSeconds}s`))
          .catch((err) => {
            if (!retried) {
              // Service worker may have been asleep — retry once
              setTimeout(() => sendSession(payload, true), 1000);
            } else {
              console.warn('[WebPulse] session send failed:', err);
            }
          });
      } catch { /* stale context after extension reload */ }
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
      console.log('[WebPulse] tracking video:', meta.videoId, meta.title);

      refineMeta(meta.videoId);
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
        flush();
      } else if (location.pathname === '/watch') {
        // Restore meta after flush cleared it, then resume timing if playing
        if (!currentMeta) {
          currentMeta = readMeta();
          if (currentMeta) refineMeta(currentMeta.videoId);
        }
        if (currentMeta && videoEl && !videoEl.paused) onPlay();
      }
    });
  },
});

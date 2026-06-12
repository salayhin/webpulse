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
    // Why polling instead of play/pause/visibility events: edge-triggered
    // tracking is fragile — a single missed event (YouTube swapping the <video>
    // element during the opening ad, or the video already playing on tab-return
    // so no `play` fires) silently stops tracking forever. This loop instead
    // samples the player once a second and accumulates real time whenever
    // `video.currentTime` advanced. It is self-healing: if anything goes wrong,
    // the next tick re-syncs. It also counts background-tab playback and keeps a
    // single session alive across tab switches.
    const TICK_MS = 1000;
    const CHECKPOINT_SECS = 10;   // persist progress to the background this often
    const MIN_SESSION_SECS = 3;   // ignore trivially short watches

    const initialVideoId = location.pathname === '/watch'
      ? new URLSearchParams(location.search).get('v')
      : null;

    const H1_TITLE = 'ytd-watch-metadata h1 yt-formatted-string';
    // The owner/channel block renders late and YouTube reshuffles its DOM often,
    // so try several selectors in priority order rather than relying on one.
    const CHANNEL_SELECTORS = [
      '#owner ytd-channel-name #text a',
      '#owner ytd-channel-name #text',
      'ytd-video-owner-renderer ytd-channel-name a',
      'ytd-channel-name#channel-name a',
      '#owner #channel-name a',
    ];

    function domText(selector: string): string | undefined {
      return (document.querySelector(selector) as HTMLElement | null)?.textContent?.trim() || undefined;
    }
    function metaContent(attr: string, value: string): string | undefined {
      return (document.querySelector(`meta[${attr}="${value}"]`) as HTMLMetaElement | null)?.content || undefined;
    }

    /** Channel name from the live DOM, falling back to schema.org author
     * microdata (present in the initial HTML, but not updated on SPA nav). */
    function readChannel(): string | undefined {
      for (const sel of CHANNEL_SELECTORS) {
        const t = domText(sel);
        if (t) return t;
      }
      const author = document.querySelector('[itemprop="author"] [itemprop="name"]');
      return author?.getAttribute('content')?.trim() || undefined;
    }

    function currentVideoId(): string | null {
      if (location.pathname !== '/watch') return null;
      return new URLSearchParams(location.search).get('v');
    }

    function readMeta(videoId: string): YtMeta {
      const docTitle = document.title
        .replace(/^\(\d+\)\s*/, '')
        .replace(/ - YouTube$/, '')
        .trim();
      return {
        videoId,
        title: domText(H1_TITLE) ?? (docTitle || 'Unknown'),
        channelName: readChannel() ?? 'Unknown',
        // genre meta is only trustworthy for the full-page-load video
        category: videoId === initialVideoId
          ? (metaContent('itemprop', 'genre') ?? 'Unknown')
          : 'Unknown',
      };
    }

    // ── Session state ────────────────────────────────────────────────────────

    interface Session {
      videoId: string;
      startedAt: number;   // wall-clock ms when this watch began — half of the upsert key
      meta: YtMeta;
      watchedMs: number;   // accumulated real playback time
      sentSecs: number;    // last value reported to the background (avoids redundant sends)
    }

    let session: Session | null = null;
    let lastTickAt = Date.now();
    let lastCurrentTime: number | null = null;

    function sendSession(s: Session, retried = false) {
      const watchedSeconds = Math.round(s.watchedMs / 1000);
      const payload = {
        type: 'YOUTUBE_SESSION',
        videoId: s.videoId,
        title: s.meta.title,
        channelName: s.meta.channelName,
        category: s.meta.category,
        startedAt: s.startedAt,
        watchedSeconds,
      };
      try {
        chrome.runtime.sendMessage(payload)
          .then(() => console.log('[WebPulse] session checkpoint:', s.meta.title, `${watchedSeconds}s`))
          .catch(() => { if (!retried) setTimeout(() => sendSession(s, true), 1000); });
      } catch { /* extension context invalidated after reload */ }
    }

    // Persist the session to the background. The (videoId, startedAt) pair is a
    // stable key, so repeated checkpoints upsert the same row rather than
    // creating duplicates.
    function checkpoint(force: boolean) {
      if (!session) return;
      const secs = Math.round(session.watchedMs / 1000);
      if (secs < MIN_SESSION_SECS || secs === session.sentSecs) return;
      if (!force && secs - session.sentSecs < CHECKPOINT_SECS) return;
      session.sentSecs = secs;
      sendSession(session);
    }

    function endSession() {
      if (!session) return;
      checkpoint(true);
      session = null;
      lastCurrentTime = null;
    }

    // Channel/title render late — keep filling them in until resolved.
    function refreshMeta() {
      if (!session) return;
      if (session.meta.channelName !== 'Unknown' && session.meta.title !== 'Unknown') return;
      const fresh = readMeta(session.videoId);
      if (fresh.title !== 'Unknown') session.meta.title = fresh.title;
      if (fresh.channelName !== 'Unknown') session.meta.channelName = fresh.channelName;
      if (session.meta.category === 'Unknown' && fresh.category !== 'Unknown') session.meta.category = fresh.category;
    }

    function tick() {
      const now = Date.now();
      const realElapsed = now - lastTickAt;
      lastTickAt = now;

      const vid = currentVideoId();
      if (!vid) { endSession(); return; }

      // New video (direct land or SPA navigation) → finalize the old, start fresh.
      if (!session || session.videoId !== vid) {
        endSession();
        session = { videoId: vid, startedAt: now, meta: readMeta(vid), watchedMs: 0, sentSecs: 0 };
        lastCurrentTime = null;
        console.log('[WebPulse] tracking video:', vid, session.meta.title);
      }

      refreshMeta();

      const v = document.querySelector('video') as HTMLVideoElement | null;
      if (v && Number.isFinite(v.currentTime)) {
        const ct = v.currentTime;
        if (lastCurrentTime !== null && !v.paused && !v.ended) {
          const advanced = ct - lastCurrentTime;
          if (advanced > 0) {
            // Count real time spent watching. Dividing by playbackRate converts
            // content-seconds → real-seconds (correct at any speed); clamping to
            // realElapsed keeps forward seeks and element swaps from inflating it.
            const realPlayMs = (advanced * 1000) / (v.playbackRate || 1);
            session.watchedMs += Math.min(realElapsed, realPlayMs);
          }
        }
        lastCurrentTime = ct;
      } else {
        lastCurrentTime = null;
      }

      checkpoint(false);
    }

    setInterval(tick, TICK_MS);
    tick();

    // ── Hide Shorts ──────────────────────────────────────────────────────────
    const SHORTS_STYLE_ID = 'webpulse-hide-shorts';

    const SHORTS_CSS = `
      /* Shorts shelf on homepage and subscription feed */
      ytd-rich-shelf-renderer[is-shorts],
      ytd-reel-shelf-renderer,
      ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),

      /* Shorts in search results */
      ytd-reel-item-renderer,
      ytd-shorts-lockup-view-model,
      ytd-shorts-lockup-view-model-v2,

      /* Shorts tab on channel pages */
      tp-yt-paper-tab:has([href*="/shorts"]),
      yt-tab-shape[tab-title="Shorts"],

      /* Shorts entry in left sidebar nav (expanded + mini + chip bar) */
      ytd-guide-entry-renderer:has(a[href="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
      yt-chip-cloud-chip-renderer:has([href*="sp=EgIQAQ"]),

      /* Shorts in the new sidebar design */
      ytd-guide-section-renderer:has(a[href="/shorts"]),
      a[href="/shorts"],
      a[href^="/shorts/"] {
        display: none !important;
      }
    `;

    function redirectIfShorts() {
      if (location.pathname === '/shorts' || location.pathname.startsWith('/shorts/')) {
        location.replace('https://www.youtube.com/');
      }
    }

    function applyShorts(hide: boolean) {
      // Handle CSS hiding
      let el = document.getElementById(SHORTS_STYLE_ID);
      if (hide) {
        if (!el) {
          el = document.createElement('style');
          el.id = SHORTS_STYLE_ID;
          document.head.appendChild(el);
        }
        el.textContent = SHORTS_CSS;
        // Redirect if already on a Shorts URL
        redirectIfShorts();
      } else {
        el?.remove();
      }
    }

    // Redirect on SPA navigation to /shorts
    document.addEventListener('yt-navigate-finish', () => {
      chrome.storage.local.get('hideYouTubeShorts', (r) => {
        if ((r.hideYouTubeShorts as boolean)) redirectIfShorts();
      });
    });

    // Apply on load, then keep in sync with setting changes
    chrome.storage.local.get('hideYouTubeShorts', (r) => {
      applyShorts((r.hideYouTubeShorts as boolean) ?? false);
    });
    chrome.storage.onChanged.addListener((changes) => {
      if ('hideYouTubeShorts' in changes) {
        applyShorts((changes.hideYouTubeShorts.newValue as boolean) ?? false);
      }
    });

    // Safety nets only — the poll already keeps the session alive across tab
    // switches, but these reduce data loss if the tab is killed.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        checkpoint(true);
        chrome.storage.local.get('pauseYouTubeOnTabSwitch', (r) => {
          if (r.pauseYouTubeOnTabSwitch) {
            const v = document.querySelector('video') as HTMLVideoElement | null;
            if (v && !v.paused) v.pause();
          }
        });
      }
    });
    window.addEventListener('pagehide', endSession);
    window.addEventListener('beforeunload', endSession);
  },
});

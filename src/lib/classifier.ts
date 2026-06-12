import type { Category } from '../db';

// Static categorization for well-known domains.
// Used as a zero-latency first layer before the AI classifier — saves an AI call
// per domain on day one, and is more reliable than AI for ambiguous cases like
// `mail.google.com` (productivity, despite being "google").
//
// Matching: exact hostname first, then longest-suffix subdomain match — apex
// entries cover their subdomains ('gist.github.com' → productivity), and a more
// specific subdomain entry wins over its apex when categories differ
// ('mail.google.com' → productivity while 'google.com' stays unlisted).

const STATIC_MAP: Record<string, Category> = {
  // ── Productivity / dev tools ─────────────────────────────────────────────
  'github.com': 'productivity',
  'gitlab.com': 'productivity',
  'bitbucket.org': 'productivity',
  'stackoverflow.com': 'productivity',
  'developer.mozilla.org': 'productivity',
  'npmjs.com': 'productivity',
  'docs.google.com': 'productivity',
  'drive.google.com': 'productivity',
  'mail.google.com': 'productivity',
  'calendar.google.com': 'productivity',
  'meet.google.com': 'productivity',
  'sheets.google.com': 'productivity',
  'notion.so': 'productivity',
  'notion.com': 'productivity',
  'slack.com': 'productivity',
  'linear.app': 'productivity',
  'asana.com': 'productivity',
  'trello.com': 'productivity',
  'figma.com': 'productivity',
  'atlassian.net': 'productivity',
  'atlassian.com': 'productivity',
  'jira.com': 'productivity',
  'confluence.com': 'productivity',
  'chatgpt.com': 'productivity',
  'claude.ai': 'productivity',
  'gemini.google.com': 'productivity',
  'perplexity.ai': 'productivity',
  'cursor.com': 'productivity',
  'cursor.sh': 'productivity',
  'vercel.com': 'productivity',
  'netlify.com': 'productivity',
  'aws.amazon.com': 'productivity',
  'console.cloud.google.com': 'productivity',
  'portal.azure.com': 'productivity',
  'huggingface.co': 'productivity',
  'outlook.com': 'productivity',
  'outlook.live.com': 'productivity',
  'zoom.us': 'productivity',
  'teams.microsoft.com': 'productivity',

  // ── Social ───────────────────────────────────────────────────────────────
  'twitter.com': 'social',
  'x.com': 'social',
  'facebook.com': 'social',
  'instagram.com': 'social',
  'threads.net': 'social',
  'tiktok.com': 'social',
  'reddit.com': 'social',
  'linkedin.com': 'social',
  'discord.com': 'social',
  'whatsapp.com': 'social',
  'messenger.com': 'social',
  'bsky.app': 'social',
  'mastodon.social': 'social',
  'telegram.org': 'social',
  'pinterest.com': 'social',
  'snapchat.com': 'social',

  // ── Entertainment ────────────────────────────────────────────────────────
  'youtube.com': 'entertainment',
  'netflix.com': 'entertainment',
  'twitch.tv': 'entertainment',
  'spotify.com': 'entertainment',
  'hulu.com': 'entertainment',
  'primevideo.com': 'entertainment',
  'disneyplus.com': 'entertainment',
  'hbomax.com': 'entertainment',
  'max.com': 'entertainment',
  'soundcloud.com': 'entertainment',
  'imdb.com': 'entertainment',
  'crunchyroll.com': 'entertainment',
  'steampowered.com': 'entertainment',

  // ── News ─────────────────────────────────────────────────────────────────
  'news.ycombinator.com': 'news',
  'nytimes.com': 'news',
  'wsj.com': 'news',
  'washingtonpost.com': 'news',
  'bbc.com': 'news',
  'bbc.co.uk': 'news',
  'cnn.com': 'news',
  'reuters.com': 'news',
  'apnews.com': 'news',
  'bloomberg.com': 'news',
  'ft.com': 'news',
  'theguardian.com': 'news',
  'theverge.com': 'news',
  'techcrunch.com': 'news',
  'arstechnica.com': 'news',
  'wired.com': 'news',
  'engadget.com': 'news',
  'medium.com': 'news',
  'dev.to': 'news',
  'substack.com': 'news',

  // ── Education ────────────────────────────────────────────────────────────
  'coursera.org': 'education',
  'udemy.com': 'education',
  'khanacademy.org': 'education',
  'brilliant.org': 'education',
  'edx.org': 'education',
  'pluralsight.com': 'education',
  'duolingo.com': 'education',
  'frontendmasters.com': 'education',
  'egghead.io': 'education',
  'wikipedia.org': 'education',
  'leetcode.com': 'education',
  'freecodecamp.org': 'education',
};

export function staticCategorize(rawDomain: string): Category | null {
  const domain = rawDomain.toLowerCase().replace(/^www\./, '');
  const direct = STATIC_MAP[domain];
  if (direct) return direct;
  // Subdomain fallback: longest suffix match wins, so a specific subdomain
  // entry beats its apex regardless of insertion order
  let best: string | null = null;
  for (const key of Object.keys(STATIC_MAP)) {
    if (domain.endsWith('.' + key) && (best === null || key.length > best.length)) {
      best = key;
    }
  }
  return best !== null ? STATIC_MAP[best] : null;
}

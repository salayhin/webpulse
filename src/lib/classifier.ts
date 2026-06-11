import type { Category } from '../db';

// Static categorization for well-known domains.
// Used as a zero-latency first layer before the AI classifier — saves an AI call
// per domain on day one, and is more reliable than AI for ambiguous cases like
// `mail.google.com` (productivity, despite being "google").
//
// Matching: exact hostname or `*.endsWith('.' + key)` for subdomains. Apex
// entries (e.g. 'google.com') do NOT match subdomains; list specific subdomains
// when their category differs from the apex (gmail.com → productivity).

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
  'web.whatsapp.com': 'social',
  'messenger.com': 'social',
  'bsky.app': 'social',
  'mastodon.social': 'social',

  // ── Entertainment ────────────────────────────────────────────────────────
  'youtube.com': 'entertainment',
  'm.youtube.com': 'entertainment',
  'netflix.com': 'entertainment',
  'twitch.tv': 'entertainment',
  'spotify.com': 'entertainment',
  'open.spotify.com': 'entertainment',
  'hulu.com': 'entertainment',
  'primevideo.com': 'entertainment',
  'disneyplus.com': 'entertainment',
  'hbomax.com': 'entertainment',
  'max.com': 'entertainment',
  'soundcloud.com': 'entertainment',
  'imdb.com': 'entertainment',
  'crunchyroll.com': 'entertainment',
  'steampowered.com': 'entertainment',
  'store.steampowered.com': 'entertainment',

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
  'en.wikipedia.org': 'education',
};

export function staticCategorize(rawDomain: string): Category | null {
  const domain = rawDomain.toLowerCase().replace(/^www\./, '');
  const direct = STATIC_MAP[domain];
  if (direct) return direct;
  // Subdomain fallback: longest suffix match wins
  for (const key of Object.keys(STATIC_MAP)) {
    if (domain.endsWith('.' + key)) return STATIC_MAP[key];
  }
  return null;
}

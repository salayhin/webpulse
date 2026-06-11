interface LMSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}
interface LMApi {
  availability(opts?: object): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts: { initialPrompts: { role: string; content: string }[] }): Promise<LMSession>;
}

function lm(): LMApi | null {
  return ('LanguageModel' in globalThis) ? (globalThis as any).LanguageModel : null;
}

async function isReady(): Promise<boolean> {
  try {
    return (await lm()?.availability()) === 'available';
  } catch {
    return false;
  }
}

async function classify(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!(await isReady())) {
    console.warn('[WebPulse] LanguageModel not available in this context');
    return null;
  }
  let session: LMSession | undefined;
  try {
    session = await lm()!.create({
      initialPrompts: [{ role: 'system', content: systemPrompt }],
    });
    return (await session.prompt(userPrompt)).trim();
  } catch (err) {
    console.warn('[WebPulse] AI classify failed:', err);
    return null;
  } finally {
    session?.destroy();
  }
}

// ── Domain categorization ─────────────────────────────────────────────────────

export const DOMAIN_CATS = [
  'productivity', 'social', 'entertainment', 'news', 'education', 'other',
] as const;
export type DomainCat = typeof DOMAIN_CATS[number];

export async function categorizeDomain(domain: string): Promise<DomainCat | null> {
  const raw = await classify(
    `Categorize websites by domain name. Reply with exactly one word from this list: ${DOMAIN_CATS.join(', ')}. No punctuation, no explanation.`,
    domain,
  );
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return (DOMAIN_CATS.find(c => lower === c || lower.startsWith(c + ' ')) ?? null) as DomainCat | null;
}

// ── YouTube title categorization ──────────────────────────────────────────────

export const YT_AI_CATS = [
  'Education', 'Entertainment', 'Music', 'Gaming', 'Science & Technology',
  'News & Politics', 'Sports', 'Howto & Style', 'Film & Animation', 'People & Blogs',
] as const;

export async function categorizeYouTubeTitle(title: string, channelName: string): Promise<string | null> {
  const raw = await classify(
    `Categorize YouTube videos. Reply with exactly one category from this list: ${YT_AI_CATS.join(', ')}. No punctuation, no explanation.`,
    `Title: "${title}" | Channel: "${channelName}"`,
  );
  if (!raw) return null;
  return YT_AI_CATS.find(c => raw.toLowerCase() === c.toLowerCase() || raw.toLowerCase().startsWith(c.toLowerCase())) ?? null;
}

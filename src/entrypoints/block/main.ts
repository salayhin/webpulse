import { db } from '../../db';
import { localDate } from '../../lib/hostname';

const params = new URLSearchParams(location.search);
const domain = params.get('domain') || 'this site';
const blockedUrl = params.get('url') || `https://${domain}`;
const limitSeconds = parseInt(params.get('limit') || '0', 10);
const sessions = params.get('sessions') || '0';
const deferAvailable = params.get('defer') === '1';

(document.getElementById('domain') as HTMLElement).textContent = domain;
(document.getElementById('favicon') as HTMLImageElement).src =
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
(document.getElementById('url') as HTMLElement).textContent = blockedUrl;

const h = Math.floor(limitSeconds / 3600);
const m = Math.floor((limitSeconds % 3600) / 60);
(document.getElementById('limit') as HTMLElement).textContent = `${h} h ${String(m).padStart(2, '0')} m`;
(document.getElementById('sessions') as HTMLElement).textContent = sessions;

const btn = document.getElementById('postpone') as HTMLButtonElement;
const note = document.getElementById('postpone-note') as HTMLElement;

if (deferAvailable) {
  btn.classList.remove('hidden');
  note.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const restriction = await db.domainRestrictions.get(domain);
    if (restriction) {
      await db.domainRestrictions.put({
        ...restriction,
        deferUntil: Date.now() + 5 * 60 * 1000,
        deferUsedDate: localDate(),
      });
    }
    location.href = blockedUrl;
  });
}

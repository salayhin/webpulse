import { db } from '../../db';
import { localDate } from '../../lib/hostname';

const params = new URLSearchParams(location.search);
const domain = params.get('domain') || 'this site';
const reason = params.get('reason') || '';

document.getElementById('domain')!.textContent = domain;

// Show reset time (midnight)
const today = new Date(localDate() + 'T00:00:00');
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const resetTime = tomorrow.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
document.getElementById('resetTime')!.textContent = `at ${resetTime}`;

async function defer() {
  const domain = params.get('domain');
  if (!domain) return;

  const deferUntil = Date.now() + 15 * 60 * 1000; // 15 minutes from now
  const restriction = await db.domainRestrictions.get(domain);
  if (restriction) {
    await db.domainRestrictions.put({ ...restriction, deferUntil });
  }

  // Go back to the domain
  location.href = `https://${domain}`;
}

// Make defer accessible globally
(window as any).defer = defer;

// Update dashboard URL once extension loads
chrome.runtime.onConnect.addListener(() => {
  const dashUrl = `chrome-extension://${chrome.runtime.id}/dashboard.html`;
  const settingsLink = document.querySelector('a');
  if (settingsLink) settingsLink.href = dashUrl;
});

// Attempt to update dashboard link immediately if runtime is ready
try {
  const dashUrl = `chrome-extension://${chrome.runtime.id}/dashboard.html`;
  const settingsLink = document.querySelector('a');
  if (settingsLink) settingsLink.href = dashUrl;
} catch {}

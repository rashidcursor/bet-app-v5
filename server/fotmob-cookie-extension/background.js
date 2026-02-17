const RECEIVER_URL = 'http://localhost:4001/api/fotmob/cookie';
const FOTMOB_URL = 'https://www.fotmob.com';
const COOKIE_NAME = 'turnstile_verified';

async function getFotmobCookie() {
  const c = await chrome.cookies.get({
    url: FOTMOB_URL,
    name: COOKIE_NAME,
  });
  return c ? `${COOKIE_NAME}=${c.value}` : null;
}

async function sendCookieToReceiver(cookieStr, source = 'manual') {
  const res = await fetch(RECEIVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie: cookieStr, source }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Manual sync via toolbar click (fallback / debug)
chrome.action.onClicked.addListener(async () => {
  try {
    const cookie = await getFotmobCookie();
    if (!cookie) {
      chrome.action.setBadgeText({ text: '?' });
      console.log('[FotMobExtension] Cookie not found. Open fotmob.com and solve Turnstile first.');
      return;
    }
    await sendCookieToReceiver(cookie, 'manual');
    chrome.action.setBadgeText({ text: 'OK' });
    console.log('[FotMobExtension] Cookie synced to DB (manual click).');
  } catch (e) {
    chrome.action.setBadgeText({ text: '!' });
    console.error('[FotMobExtension] Manual sync failed:', e);
  }
});

// Automatic sync whenever FotMob's turnstile_verified cookie changes
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed, cause } = changeInfo;

  if (!cookie) return;
  if (!cookie.domain.includes('fotmob.com')) return;
  if (cookie.name !== COOKIE_NAME) return;
  if (removed) return; // only care about new/updated cookies

  try {
    const cookieStr = `${COOKIE_NAME}=${cookie.value}`;
    console.log('[FotMobExtension] Detected turnstile_verified change, cause:', cause);
    await sendCookieToReceiver(cookieStr, 'auto');
    console.log('[FotMobExtension] Cookie auto-synced to DB.');
  } catch (e) {
    console.error('[FotMobExtension] Auto-sync failed:', e);
  }
});

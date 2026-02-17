const FOTMOB_ORIGIN = 'https://www.fotmob.com';
const COOKIE_NAME = 'turnstile_verified';
const ALARM_NAME = 'fotmob-cookie-sync';
const SYNC_INTERVAL_MINUTES = 10;

async function getStoredConfig() {
  const out = await chrome.storage.sync.get(['apiBase', 'cookieSecret']);
  return {
    apiBase: (out.apiBase || '').replace(/\/$/, ''),
    cookieSecret: out.cookieSecret || '',
  };
}

async function getFotmobCookie() {
  try {
    const c = await chrome.cookies.get({
      url: FOTMOB_ORIGIN,
      name: COOKIE_NAME,
    });
    return c ? `${c.name}=${c.value}` : null;
  } catch (e) {
    console.warn('[FotMob Cookie Sync] get cookie error:', e);
    return null;
  }
}

async function sendCookieToServer(cookieValue) {
  const { apiBase, cookieSecret } = await getStoredConfig();
  if (!apiBase) {
    console.warn('[FotMob Cookie Sync] Set API base URL in extension options.');
    return false;
  }
  if (!cookieSecret) {
    console.warn('[FotMob Cookie Sync] Set cookie secret in extension options (FOTMOB_COOKIE_SECRET).');
    return false;
  }

  const url = `${apiBase}/api/fotmob/cookie`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fotmob-Cookie-Secret': cookieSecret,
      },
      body: JSON.stringify({ cookie: cookieValue }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      console.log('[FotMob Cookie Sync] Cookie sent to server.');
      return true;
    }
    console.warn('[FotMob Cookie Sync] Server response:', res.status, data);
    return false;
  } catch (e) {
    console.warn('[FotMob Cookie Sync] Send error:', e);
    return false;
  }
}

async function syncCookie() {
  const cookie = await getFotmobCookie();
  if (!cookie) return;
  await sendCookieToServer(cookie);
}

chrome.alarms.create(ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) syncCookie();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (tab.url && tab.url.startsWith(FOTMOB_ORIGIN)) {
    setTimeout(syncCookie, 2000);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  syncCookie();
});

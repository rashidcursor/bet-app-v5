/**
 * FotMob turnstile_verified cookie for API requests.
 * Use getFotmobCookieFromDb() when calling FotMob API (matchDetails, matches by date).
 * Cookie is stored in DB (fotmob_cookies) by the extension + receiver script.
 */

import mongoose from 'mongoose';

let cachedCookieValue = null; // "turnstile_verified=..." or null

export function setFotmobCookie(value) {
  if (value == null || value === '') {
    cachedCookieValue = null;
    return;
  }
  const s = String(value).trim();
  cachedCookieValue = s.includes('turnstile_verified=') ? s : `turnstile_verified=${s}`;
}

export function getFotmobCookieForRequest() {
  return cachedCookieValue ?? null;
}

/** Clear in-memory cookie cache (e.g. after 403 so next request re-reads from DB) */
export function clearFotmobCookieCache() {
  cachedCookieValue = null;
}

/** Read turnstile_verified from DB (fotmob_cookies). Use for FotMob API headers. */
export async function getFotmobCookieFromDb() {
  if (cachedCookieValue) return cachedCookieValue;
  if (!mongoose.connection?.db) return null;
  try {
    const doc = await mongoose.connection.db.collection('fotmob_cookies').findOne({ key: 'turnstile_verified' });
    if (doc?.value) {
      const cookieStr = `turnstile_verified=${doc.value}`;
      cachedCookieValue = cookieStr;
      return cookieStr;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

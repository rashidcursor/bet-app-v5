/**
 * FotMob ki network calls se cookie nikalna – koi alag generation nahi.
 * Browser open karke FotMob page load karte hain; jitni bhi fetch/network calls
 * FotMob karta hai woh chalengi, response mein jo cookie aati hai (turnstile_verified
 * etc.) woh yahan se capture karke output karte hain.
 *
 * Run from server/:
 *   node src/scripts/fotmob-get-cookie-from-network.js
 *
 * Turnstile cookie ke liye:
 *   HEADLESS=0 node src/scripts/fotmob-get-cookie-from-network.js
 * System Chrome:
 *   HEADLESS=0 USE_CHROME=1 node src/scripts/fotmob-get-cookie-from-network.js
 *
 * Persistent profile (recommended) – ek baar manually Turnstile solve karo, cookie saved rahegi:
 *   HEADLESS=0 PERSISTENT=1 node src/scripts/fotmob-get-cookie-from-network.js
 *   → Real Chrome + user-data dir; pehli run pe Turnstile solve karo, baad mein cookie reuse hogi.
 *
 * Output: turnstile_verified cookie → storage/fotmob/turnstile_verified_cookie.txt
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FOTMOB_MATCH_PAGE = 'https://www.fotmob.com/matches/sportist-svoge-vs-ludogorets-razgrad-ii/3p324a65';
const FOTMOB_HOME = 'https://www.fotmob.com/';
const WAIT_HOMEPAGE_MS = 12000;
const WAIT_MATCH_PAGE_MS = 25000;
const COOKIE_FILE = path.join(__dirname, '../../storage/fotmob/turnstile_verified_cookie.txt');
const USER_DATA_DIR = path.join(__dirname, '../../storage/fotmob/playwright-user-data');

// Headless: false = browser dikhega. USE_CHROME=1 = system Chrome. PERSISTENT=1 = real profile, cookie saved rahegi.
const HEADLESS = process.env.HEADLESS !== '0' && process.env.HEADLESS !== 'false';
const USE_SYSTEM_CHROME = process.env.USE_CHROME === '1' || process.env.USE_CHROME === 'true';
const PERSISTENT = process.env.PERSISTENT === '1' || process.env.PERSISTENT === 'true';

async function main() {
  console.log('FotMob page open ho raha hai – yahi wohi network calls chalengi jo browser mein...\n');
  if (!HEADLESS) console.log('(Browser dikhega – HEADLESS=0)\n');
  if (PERSISTENT) {
    console.log('(Persistent profile – real Chrome, ek baar Turnstile solve karo, cookie saved rahegi)\n');
  } else if (USE_SYSTEM_CHROME) {
    console.log('(System Chrome use ho raha hai – USE_CHROME=1)\n');
  }

  let context;
  let browser; // only set when not using persistent context

  if (PERSISTENT && !HEADLESS) {
    // Real Chrome + persistent profile: cookie ek baar solve karke save ho jati hai
    const persistentOptions = {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    };
    try {
      context = await chromium.launchPersistentContext(USER_DATA_DIR, persistentOptions);
    } catch (e) {
      console.warn('Chrome channel nahi mila, Chromium persistent use ho raha hai:', e.message);
      delete persistentOptions.channel;
      context = await chromium.launchPersistentContext(USER_DATA_DIR, persistentOptions);
    }
  } else {
    const launchOptions = {
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };
    if (USE_SYSTEM_CHROME) launchOptions.channel = 'chrome';

    try {
      browser = await chromium.launch(launchOptions);
    } catch (e) {
      if (USE_SYSTEM_CHROME) {
        console.warn('System Chrome nahi mila, Chromium use ho raha hai:', e.message);
        delete launchOptions.channel;
        browser = await chromium.launch(launchOptions);
      } else {
        throw e;
      }
    }

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Optional: capture last x-mas header from matchDetails request
  let lastXmas = null;
  await page.route('**/api/data/matchDetails*', (route) => {
    const headers = route.request().headers();
    if (headers['x-mas']) lastXmas = headers['x-mas'];
    route.continue();
  });

  try {
    // Step 1: Homepage pehle (Turnstile kabhi pehli request pe set hota hai)
    console.log('Step 1: Homepage open ho raha hai...');
    if (PERSISTENT) console.log('   (Agar Turnstile dikhe to solve karo – cookie profile mein save ho jayegi.)');
    await page.goto(FOTMOB_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Homepage load ho gaya, wait', WAIT_HOMEPAGE_MS / 1000, 's...');
    await page.waitForTimeout(WAIT_HOMEPAGE_MS);

    // Step 2: Match page
    console.log('Step 2: Match page open ho raha hai...');
    await page.goto(FOTMOB_MATCH_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Match page load ho gaya, Turnstile / network idle ka wait', WAIT_MATCH_PAGE_MS / 1000, 's...');
    await page.waitForTimeout(8000);

    // Step 3: Thoda user jaisa behaviour – scroll + click (Turnstile trigger ho sake)
    try {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(500);
      await page.click('body', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } catch (_) {}

    await page.waitForTimeout(WAIT_MATCH_PAGE_MS - 8000 - 3500);
  } catch (e) {
    console.warn('Page load warning:', e.message);
  }

  let cookies = await context.cookies();
  let turnstile = cookies.find((c) => c.name === 'turnstile_verified');

  // Debug: document.cookie bhi check (kabhi sirf JS context mein hoti hai)
  try {
    const docCookie = await page.evaluate(() => document.cookie);
    if (docCookie.includes('turnstile_verified') && !turnstile) {
      const match = docCookie.match(/turnstile_verified=([^;]+)/);
      if (match) {
        turnstile = { name: 'turnstile_verified', value: match[1].trim() };
        cookies = [...cookies, turnstile];
      }
    }
  } catch (_) {}

  if (browser) await browser.close();
  else await context.close();

  if (turnstile) {
    const cookieStr = `${turnstile.name}=${turnstile.value}`;
    console.log('\n--- turnstile_verified (FotMob network calls se aaya) ---');
    console.log(cookieStr);
    console.log('---\n');

    const outDir = path.join(__dirname, '../../storage/fotmob');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'turnstile_verified_cookie.txt');
    fs.writeFileSync(outFile, cookieStr, 'utf8');
    console.log('Saved:', outFile);

    if (lastXmas) {
      const xmasFile = path.join(outDir, 'xmas_token_last.txt');
      fs.writeFileSync(xmasFile, lastXmas, 'utf8');
      console.log('Last x-mas (from matchDetails request) saved:', xmasFile);
    }
  } else {
    const outDir = path.join(__dirname, '../../storage/fotmob');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    console.log('\nCookie turnstile_verified nahi mili (Cloudflare Playwright/Chromium detect kar raha hai).');
    console.log('\n--- Manual cookie (recommended) ---');
    console.log('1. Apne browser (Chrome/Firefox) mein https://www.fotmob.com kholo, koi bhi match page open karo.');
    console.log('2. DevTools → Application → Cookies → https://www.fotmob.com');
    console.log('3. turnstile_verified cookie ki value copy karo.');
    console.log('4. Is file mein sirf value paste karo (ya "turnstile_verified=VALUE" format):');
    console.log('   ' + COOKIE_FILE);
    console.log('   Example: turnstile_verified=1.1771245058.0da983b30dfb0bf1aa04755b7a66378787d64e5b43e389aa52028845db562522');
    console.log('5. App matchDetails call karte waqt is file se cookie read karegi.');
    console.log('\n--- Try system Chrome (agar installed ho) ---');
    console.log('  HEADLESS=0 USE_CHROME=1 node src/scripts/fotmob-get-cookie-from-network.js');
    console.log('\nCookies received:', cookies.map((c) => c.name).join(', ') || 'none');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Standalone server: extension se cookie receive karke DB mein store karta hai.
 * Main app code change nahi – ye script alag se chalao.
 *
 * Run from server/:
 *   node src/scripts/fotmob-cookie-receiver-server.js
 *
 * Endpoints:
 *   POST /api/fotmob/cookie   body: { cookie: "turnstile_verified=..." }  → saves to DB
 *   GET  /api/fotmob/cookie   → returns latest cookie from DB
 *
 * Extension is script ko http://localhost:4001 pe POST karega.
 * Cookie save hone ke baad ek FotMob matchDetails request foran try hoti hai (log mein 200 OK ya fail).
 */

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FOTMOB_TEST_MATCH_ID = 4873840; // default test match for "cookie try" request

const PORT = process.env.FOTMOB_COOKIE_SERVER_PORT || 4001;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI env required. Run from server/ with .env loaded.');
  process.exit(1);
}

const fotmobCookieSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, default: 'turnstile_verified' },
    value: { type: String, required: true },
  },
  { timestamps: true }
);
const FotmobCookie = mongoose.model('FotmobCookie', fotmobCookieSchema, 'fotmob_cookies');

/** Cookie save hone ke baad ek FotMob matchDetails request try karta hai – verify cookie kaam kar rahi hai ya nahi */
async function tryFotmobRequest(cookieStr) {
  const url = `https://www.fotmob.com/api/data/matchDetails?matchId=${FOTMOB_TEST_MATCH_ID}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Referer: 'https://www.fotmob.com/',
    Cookie: cookieStr,
  };
  try {
    const res = await axios.get(url, { headers, timeout: 15000 });
    const data = res.data;
    const home = data?.general?.homeTeam?.name ?? data?.header?.teams?.[0]?.name;
    const away = data?.general?.awayTeam?.name ?? data?.header?.teams?.[1]?.name;
    console.log('FotMob try request: 200 OK –', home, 'vs', away);
    return { ok: true, status: 200, match: `${home} vs ${away}` };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data != null
      ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : String(data).slice(0, 200))
      : err.message;
    console.log('FotMob try request: FAILED – status', status, msg);
    return { ok: false, status, message: msg };
  }
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.post('/api/fotmob/cookie', async (req, res) => {
  try {
    let value = req.body?.cookie ?? req.body?.value ?? '';
    if (value.includes('turnstile_verified=')) {
      value = value.replace(/^.*turnstile_verified=/, '').split(';')[0].trim();
    }
    if (!value) {
      return res.status(400).json({ ok: false, error: 'Missing cookie value' });
    }
    await FotmobCookie.findOneAndUpdate(
      { key: 'turnstile_verified' },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log('Cookie saved to DB at', new Date().toISOString());

    const cookieStr = `turnstile_verified=${value}`;
    const tryResult = await tryFotmobRequest(cookieStr);
    res.json({ ok: true, fotmobTry: tryResult });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/fotmob/cookie', async (req, res) => {
  try {
    const doc = await FotmobCookie.findOne({ key: 'turnstile_verified' }).lean();
    if (!doc) return res.status(404).json({ ok: false, cookie: null });
    res.json({ ok: true, cookie: `turnstile_verified=${doc.value}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('DB connected');
  app.listen(PORT, () => {
    console.log('FotMob cookie receiver on http://localhost:' + PORT);
    console.log('POST /api/fotmob/cookie  – extension yahan bhejega');
    console.log('GET  /api/fotmob/cookie  – latest cookie');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * DB mein saved cookie se FotMob matchDetails request try karta hai – test ke liye.
 * Run from server/: node src/scripts/fotmob-cookie-test-request.js [matchId]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import axios from 'axios';

const TEST_MATCH_ID = parseInt(process.argv[2], 10) || 4873840;

const schema = new mongoose.Schema(
  { key: String, value: String },
  { timestamps: true }
);
const FotmobCookie = mongoose.model('FotmobCookie', schema, 'fotmob_cookies');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI env required.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const doc = await FotmobCookie.findOne({ key: 'turnstile_verified' }).lean();
  await mongoose.connection.close();

  if (!doc || !doc.value) {
    console.log('DB mein turnstile_verified nahi mili. Pehle extension se sync karo.');
    process.exit(1);
  }

  const cookieStr = `turnstile_verified=${doc.value}`;
  const url = `https://www.fotmob.com/api/data/matchDetails?matchId=${TEST_MATCH_ID}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Referer: 'https://www.fotmob.com/',
    Cookie: cookieStr,
  };

  console.log('Testing FotMob request with cookie from DB, matchId:', TEST_MATCH_ID);
  try {
    const res = await axios.get(url, { headers, timeout: 15000 });
    const data = res.data;
    const home = data?.general?.homeTeam?.name ?? data?.header?.teams?.[0]?.name;
    const away = data?.general?.awayTeam?.name ?? data?.header?.teams?.[1]?.name;
    console.log('OK – status 200:', home, 'vs', away);
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data != null
      ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : String(data).slice(0, 200))
      : err.message;
    console.log('FAILED – status', status, msg);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * DB se turnstile_verified cookie read karke file mein likhta hai.
 * Main app code change nahi – jo pehle file se cookie padhta hai woh chalega;
 * ye script DB -> file sync karta hai (cron ya manually chala sakte ho).
 *
 * Run from server/:
 *   node src/scripts/fotmob-cookie-read-from-db.js
 *
 * Output: storage/fotmob/turnstile_verified_cookie.txt (same path as Playwright script)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = path.join(__dirname, '../../storage/fotmob/turnstile_verified_cookie.txt');

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
  const outDir = path.dirname(COOKIE_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(COOKIE_FILE, cookieStr, 'utf8');
  console.log('Cookie DB se file mein likhi:', COOKIE_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

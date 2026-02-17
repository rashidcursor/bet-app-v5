# FotMob Cookie → DB (extension)

Extension FotMob ki `turnstile_verified` cookie local receiver server ko bhejta hai, jo DB mein save karta hai.

## Steps (script-only, no main app code change)

1. **Receiver server chalao** (DB mein save karega):
   ```bash
   cd server && node src/scripts/fotmob-cookie-receiver-server.js
   ```
   Port 4001 pe listen karega.

2. **Extension load karo**
   - Chrome → `chrome://extensions` → "Load unpacked" → `server/fotmob-cookie-extension` select karo.

3. **FotMob pe cookie banao**
   - Browser mein https://www.fotmob.com kholo, koi match open karo, Turnstile solve karo.

4. **Extension se sync**
   - Extension icon pe click karo → cookie receiver ko POST ho jayegi, DB mein save.

5. **DB se file mein likhna** (optional – agar app file se padhta hai):
   ```bash
   cd server && node src/scripts/fotmob-cookie-read-from-db.js
   ```
   Ye `storage/fotmob/turnstile_verified_cookie.txt` mein likh dega.

## Endpoints (receiver)

- `POST /api/fotmob/cookie` — body: `{ "cookie": "turnstile_verified=..." }`
- `GET /api/fotmob/cookie` — returns latest cookie from DB

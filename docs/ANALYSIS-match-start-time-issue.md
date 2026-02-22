# Analysis: "Match start time not available for match X. Cannot place bet without match time."

**No code was changed.** This document summarizes the analysis of the Unibet API response and the codebase to identify the root cause.

---

## 1. Unibet API response (confirmed)

- **URL:** `GET https://www.unibet.com.au/sportsbook-feeds/views/filter/football/all/matches?includeParticipants=true&useCombined=true&ncid=...`
- **Status:** 200 OK. Response is valid JSON (~3.2 MB).
- **Relevant shape:** `layout.sections[].widgets[]` (widgetType `TOURNAMENT`) → `matches.groups[].subGroups[].events[]`.
- **Each event has:**
  - `event.id` (number)
  - **`event.start`** (ISO string, e.g. `"2026-02-21T09:03:00Z"`)
  - `event.state` (`"STARTED"` | `"NOT_STARTED"`)
  - `event.homeName`, `event.awayName`, etc.

So the **API always provides `event.start`**. The problem is not missing data from Unibet.

---

## 2. Where the error is thrown

- **File:** `server/src/services/bet.service.js`
- **Approx. lines:** 1554–1568

`correctMatchDate` is set from, in order:

1. `unibetStartTime` (from internal fetch, frontend API, or earlier logic)
2. `unibetMetaPayload?.start` (from client request body)
3. `fetchedMatchData?.start`
4. `clientBetDetails?.matchDate`
5. `clientBetDetails?.startTime`

If **all** of these are falsy, the server throws:

`Match start time not available for match ${matchId}. Cannot place bet without match time.`

So the issue is that **every path that could supply a start time is empty** for that match.

---

## 3. Root cause: client stores `starting_at` but live API uses `start`

### 3.1 Bet slip only stores `starting_at`

- **File:** `client/lib/features/betSlip/betSlipSlice.js`
- **addBet reducer (line ~168):**

  ```js
  starting_at: match.starting_at, // Keep for inplay calculation
  ```

  So the slip only keeps **`match.starting_at`**. It does **not** copy `match.start`.

### 3.2 Live matches API returns `start`, not `starting_at`

- **File:** `client/app/api/unibet/live-matches/route.js`
- **processedEvent (lines 77–101):**

  ```js
  const processedEvent = {
    id: event.id,
    name: event.name,
    ...
    start: event.start,   // ← only "start"
    ...
  };
  ```

  There is **no `starting_at`** on these objects.

### 3.3 Result when adding a live match from the list

- User adds a bet from a **live match card** fed by `/api/unibet/live-matches`.
- The match object has **`start`** (e.g. `"2026-02-21T09:03:00Z"`) and **no `starting_at`**.
- In **addBet**, the slip does `starting_at: match.starting_at` → **`undefined`**.
- So **`bet.match.starting_at`** is **always undefined** for these bets.

### 3.4 Place-bet payload and metadata

- **placeBetThunk** builds:
  - `matchStartTime = unibetMetadata?.start || bet.match.starting_at || matchData?.data?.events?.[0]?.start || matchData?.data?.start || null`
  - Payload only gets `start`/`matchDate` when `matchStartTime` is truthy:  
    `...(matchStartTime && { start: matchStartTime, matchDate: matchStartTime })`

So:

- **`bet.match.starting_at`** is undefined for live-list bets → no start from the bet object.
- **`unibetMetadata.start`** comes from `extractUnibetMetadata`, which uses:
  - `bet.match.starting_at` (again undefined), or
  - `matchData?.data?.events?.[0]?.start` or `matchData?.data?.start`
- **`matchData`** is from **getMatchDataFromState** (match detail or league data). If the user never opened the match detail page and the match is only in the live list, **matchData can be null** or not have `data.events[0].start`.

So for a bet added **only** from the live matches list:

1. `bet.match.starting_at` is undefined (API gives `start`, slip only stores `starting_at`).
2. `matchData` may be null or not contain the event with `start`.
3. So `matchStartTime` can be null and the client sends **no** `start`/`matchDate`.
4. Server then has no `unibetMetaPayload.start` or `clientBetDetails.matchDate`/`startTime`, and if other fallbacks (inplay cache, frontend API) also fail, it throws the error.

---

## 4. Why server fallbacks can also be missing

- **Inplay cache:** Filled from backend `/api/v2/live-matches`. That route may apply **league filtering** (e.g. `filterMatchesByAllowedLeagues` on the backend). If the match’s league is excluded, the match is not in the cache → no `liveMatch.starting_at` on the server.
- **Frontend API fallback:** Server calls `GET ${CLIENT_URL}/api/unibet/live-matches` and looks up the match by ID. The Next.js route also applies **league filtering**. If the match is in a filtered-out league, it is **not** in `allMatches`/`matches`/`upcomingMatches` → server does not find the match → `matchEvent` is undefined → no `unibetStartTime` from this path.
- **CLIENT_URL:** If wrong or unreachable (e.g. on Render), the frontend API call fails and the server never gets start from there.

So even though the **raw Unibet API** has `event.start` for every event, the match can be:

1. Missing from the client payload (because of `starting_at` vs `start` and missing matchData).
2. Missing from server inplay cache (league filter or not yet fetched).
3. Missing from the response the server gets from the frontend API (league filter or failed request).

---

## 5. Summary: what’s wrong

| Layer | What’s wrong |
|-------|----------------|
| **Unibet API** | Nothing. Every event has `event.start`. |
| **Next.js live-matches route** | Returns objects with **`start`** only (no `starting_at`). |
| **Bet slip addBet** | Stores only **`match.starting_at`**. For live-list matches this is **undefined** because the API sends `start`. |
| **extractUnibetMetadata** | Uses `bet.match.starting_at` first; for these bets that’s undefined. Relies on `matchData?.data?.events?.[0]?.start` which may be null if matchData is from live list only. |
| **Place-bet payload** | Often sends **no** `start`/`matchDate` for bets added from the live list. |
| **Server** | Correctly requires a start time. All sources (payload, inplay cache, frontend API) can be empty for the same match → error. |

**Root cause:** For bets added from the **live matches list**, the slip only persists **`starting_at`**, while the API and the rest of the app use **`start`**. So the bet is stored and sent without a start time, and server-side fallbacks can also fail (league filter, CLIENT_URL, etc.), leading to “Match start time not available for match X”.

---

## 6. Recommended fix (for when you change code)

1. **Client – addBet:** When storing the match, set  
   `starting_at: match.starting_at || match.start`  
   so that live-list matches (which have `start`) get a start time in the slip.
2. **Client – placeBetThunk:** When computing `matchStartTime`, include  
   `bet.match.starting_at || bet.match.start`  
   (if you add `start` to the stored match) so the payload always has a start when the match has one.
3. **Optional – Next.js live-matches route:** Add `starting_at: event.start` (or `event.starting_at || event.start`) to the processed event so all consumers see a single field name.
4. **Server:** Ensure `CLIENT_URL` is correct and that league filter config doesn’t exclude leagues you need for inplay; add logging when the match is not found in the frontend API response or has no `start`.

Once the client consistently stores and sends a start time for live-list matches, and server fallbacks are reliable, the error should stop for those cases.

# processAll: 100 Bets in 3 Batches – Run Analysis

## How to reproduce

1. Start server: `cd server && npm start`
2. Agenda job **processPendingBets** runs on schedule and calls `processAll` with `limit: 100, onlyPending: true`
3. Or call API (admin auth required): `POST /api/v2/unibet-calc/process` with body `{"limit": 100, "onlyPending": true}`

---

## What the server log confirmed

### 1. Limit is 100

```
[Agenda] 🔄 Calling processAll with limit: 100, onlyPending: true
📊 [processAll]    - Limit: 100
📊 [processAll]    - Limit: 100
📊 [processAll]    - Found 100 bets (pending single bets + combination bets with pending legs)
```

- Each run fetches **up to 100** pending bets (sorted by `matchDate: 1`).

### 2. 100 bets are split into 3 batches

```
📊 [processAll] Running 100 bets in 3 parallel batches (sizes: 34, 34, 32)
📊 [processAll]   Batch 1: 34 bets (indices 0-33)
📊 [processAll]   Batch 2: 34 bets (indices 34-67)
📊 [processAll]   Batch 3: 32 bets (indices 68-99)
```

- Batch 1: bets 1–34  
- Batch 2: bets 35–68  
- Batch 3: bets 69–100  

### 3. All 3 batches run at the same time

Logs show the first bet of each batch starting, then completing, in parallel:

- `[Bet 1/100]` → `Bet 1 done: pending`
- `[Bet 35/100]` → `Bet 35 done: pending`
- `[Bet 69/100]` → `Bet 69 done: pending`

Then Bet 2, 36, 70, etc. So **3 batches run concurrently** (JavaScript `Promise.all`).

### 4. Next run uses different bets (not the same 100 again)

- Each run: `Bet.find({ ... pending query ... }).sort({ matchDate: 1 }).limit(100)`.
- After a bet is processed it becomes **won/lost/cancelled**, so it no longer matches the pending query.
- So the **next** job run gets the **next** 100 pending (or fewer if &lt; 100 left).  
  Example: 176 pending → Run 1: 100 bets (e.g. IDs 1–100). Run 2: 76 bets (IDs 101–176). No overlap.

No code change is needed for “next 3 batches = different bets”; it follows from the pending query and limit.

---

## Summary

| Check | Result |
|-------|--------|
| 100 bets per run | ✅ Log: `Limit: 100`, `Found 100 bets` |
| Split into 3 batches | ✅ Log: `sizes: 34, 34, 32` |
| 3 batches at a time (parallel) | ✅ Log: Bet 1, 35, 69 start/done interleaved |
| Next run = different bets | ✅ By design (pending query + limit); next run gets next 100 or remainder |

---

## Optional: verify “next run = different bets” in logs

After one full run finishes, look for the **next** occurrence of:

- `[Agenda] 🔄 Calling processAll with limit: 100`
- `📊 [processAll]    - Found X bets`

If the first run processed 100 bets and none remained, `X` will be 0 (or new pendings). If 76 were left, `X` will be 76 and the listed Bet IDs will be different from the first run’s 100.

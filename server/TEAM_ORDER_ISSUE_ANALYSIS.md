# Team Order Issue - Root Cause Analysis

## 🔍 Problem
Bet teams are being matched incorrectly with Fotmob match data. Example:
- **Bet**: "Tottenham" (home) vs "PSG" (away)
- **Fotmob Match**: "Paris Saint-Germain" (home) vs "Tottenham Hotspur" (away)
- **Result**: Teams are swapped, causing low similarity score (0.108 instead of high score)

## 📋 Root Cause

### Issue Location: `server/src/services/bet.service.js` (Lines 737-738)

**Current Code:**
```javascript
homeName: leg.homeName || matchData.participants?.[0]?.name || this.extractHomeTeam(leg.teams),
awayName: leg.awayName || matchData.participants?.[1]?.name || this.extractAwayTeam(leg.teams),
```

### The Problem:

1. **Array Index Assumption**: Code assumes `participants[0]` is always home and `participants[1]` is always away
2. **No Position Check**: Code doesn't check the `position` field in participants before using array index
3. **Inconsistent Logic**: Other parts of the code (lines 1125-1126, 633-634) correctly check `position` field first:
   ```javascript
   const home = participants.find(p => (p.position || '').toLowerCase() === 'home') || participants[0];
   const away = participants.find(p => (p.position || '').toLowerCase() === 'away') || participants[1];
   ```

### Why This Happens:

1. **Unibet API Inconsistency**: 
   - Sometimes `participants` array has `position: 'home'` and `position: 'away'` fields
   - Sometimes it doesn't have position fields
   - Array order might not always match home/away order

2. **Data Source Variation**:
   - Different API endpoints might return participants in different orders
   - Some APIs use `position` field, others rely on array order
   - Frontend might send teams in different format than backend expects

3. **Fallback Logic Issue**:
   - When `position` field is missing, code falls back to array index
   - But array index might be wrong if API returns teams in swapped order

## 🔧 Solution

### Fix Strategy:

1. **Always check `position` field first** before using array index
2. **Use consistent logic** across all places where teams are extracted
3. **Add logging** to track when position field is missing vs when array index is used

### Implementation:

Replace direct array index access with position-based lookup:

```javascript
// ❌ WRONG (Current):
homeName: leg.homeName || matchData.participants?.[0]?.name || this.extractHomeTeam(leg.teams),
awayName: leg.awayName || matchData.participants?.[1]?.name || this.extractAwayTeam(leg.teams),

// ✅ CORRECT (Should be):
const participants = matchData.participants || [];
const homeParticipant = participants.find(p => (p.position || '').toLowerCase() === 'home') || participants[0];
const awayParticipant = participants.find(p => (p.position || '').toLowerCase() === 'away') || participants[1];
homeName: leg.homeName || homeParticipant?.name || this.extractHomeTeam(leg.teams),
awayName: leg.awayName || awayParticipant?.name || this.extractAwayTeam(leg.teams),
```

## 📊 Impact

### Before Fix:
- Teams might be swapped if Unibet API returns participants in wrong order
- Match finding fails with low similarity scores
- Bets get cancelled due to "NO_SUITABLE_MATCH_FOUND"

### After Fix:
- Teams correctly identified using `position` field when available
- Fallback to array index only when position field is missing
- Better match finding accuracy
- Fewer cancelled bets

## 🎯 Files to Update

1. `server/src/services/bet.service.js` - Lines 737-738 (combination bets)
2. `server/src/services/bet.service.js` - Lines 746-747 (fallback in same function)
3. Any other places using `participants[0]` and `participants[1]` directly

## ✅ Verification

After fix, verify:
1. Bet teams match Fotmob match teams correctly
2. Similarity scores are high (>0.6) for correct matches
3. No more "swapped teams" issues in logs
4. Match finding succeeds for valid bets




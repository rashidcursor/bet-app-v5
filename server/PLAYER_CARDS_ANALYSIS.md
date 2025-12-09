# Player Cards Market Analysis

## 📋 Current Issue
User reports: "cards main sirf red card ka kion include hai total cards k tetails hoany chhaiye"
Translation: "Why is only red card included in cards? Total cards details should be there"

## 🔍 Fotmob Response Structure for Cards

### Card Event Locations in Response

1. **Primary Location: `header.events.events[]`**
   - All card events are in a flat array
   - Each card event has:
     ```json
     {
       "type": "Card",
       "card": "Yellow" | "Red",
       "playerId": 504606,
       "player": {
         "id": 504606,
         "name": "Lucas Hernández"
       },
       "time": 90,
       "overloadTime": 3,
       "isHome": true
     }
     ```

2. **Legacy Location: `header.events.homeTeamRedCards` / `awayTeamRedCards`**
   - Grouped by player name
   - Only contains red cards
   - Example:
     ```json
     "homeTeamRedCards": {
       "Hernández": [
         {
           "card": "Red",
           "playerId": 504606,
           "player": { "id": 504606, "name": "Lucas Hernández" }
         }
       ]
     }
     ```

3. **Legacy Location: `header.events.homeTeamYellowCards` / `awayTeamYellowCards`**
   - Grouped by player name
   - Only contains yellow cards
   - Example:
     ```json
     "homeTeamYellowCards": {
       "Bergvall": [
         {
           "card": "Yellow",
           "playerId": 1386775,
           "player": { "id": 1386775, "name": "Lucas Bergvall" }
         }
       ]
     }
     ```

### Example Cards from PSG vs Tottenham Match

**Yellow Card:**
- Player: Lucas Bergvall (ID: 1386775)
- Time: 45 + 2
- Location: `header.events.events[]` at index ~1438
- Structure: `{ "type": "Card", "card": "Yellow", "playerId": 1386775, ... }`

**Red Card:**
- Player: Lucas Hernández (ID: 504606)
- Time: 90 + 3
- Location: `header.events.events[]` at index ~2194
- Also in: `header.events.homeTeamRedCards["Hernández"]`
- Structure: `{ "type": "Card", "card": "Red", "playerId": 504606, ... }`

## 🔧 Current Implementation Analysis

### `getCardEvents()` Function (fotmob-helpers.js:38-56)
```javascript
export function getCardEvents(matchDetails) {
    // Primary: events array
    const eventsArray = matchDetails?.header?.events?.events;
    if (Array.isArray(eventsArray)) {
        return eventsArray
            .filter(ev => String(ev?.type).toLowerCase() === 'card' && !!ev?.card)
            .map(ev => ({ ...ev, isHome: !!ev?.isHome }));
    }

    // Fallback: legacy per-team maps
    const homeRed = flattenEventMap(matchDetails?.header?.events?.homeTeamRedCards);
    const awayRed = flattenEventMap(matchDetails?.header?.events?.awayTeamRedCards);
    const homeYellow = flattenEventMap(matchDetails?.header?.events?.homeTeamYellowCards);
    const awayYellow = flattenEventMap(matchDetails?.header?.events?.awayTeamYellowCards);

    const homeCards = [...homeRed, ...homeYellow].map(e => ({ ...e, isHome: true }));
    const awayCards = [...awayRed, ...awayYellow].map(e => ({ ...e, isHome: false }));
    return [...homeCards, ...awayCards];
}
```

**✅ This function correctly returns ALL cards (both Yellow and Red)**

### `getPlayerEvents()` Function (fotmob-helpers.js:541-569)
```javascript
export function getPlayerEvents(matchDetails, playerId) {
    const allGoals = getGoalEvents(matchDetails);
    const goals = allGoals.filter(e => {
        const eventPlayerId = e?.playerId || e?.player?.id || e?.shotmapEvent?.playerId;
        return Number(eventPlayerId) === Number(playerId);
    });
    
    const allCards = getCardEvents(matchDetails);
    const cards = allCards.filter(e => {
        const eventPlayerId = e?.playerId || e?.player?.id;
        return Number(eventPlayerId) === Number(playerId);
    });
    
    return { goals, cards };
}
```

**✅ This function correctly returns ALL cards for a player (both Yellow and Red)**

### PLAYER_CARD Market Handler (bet-outcome-calculator.js:4277-4366)

**Current Code:**
```javascript
let { cards } = getPlayerEvents(matchDetails, Number(playerId));
const numCards = Array.isArray(cards) ? cards.length : 0;
const hasRed = (cards || []).some(c => String(c?.card || '').toLowerCase().includes('red'));
const didHit = isRedOnly ? hasRed : (numCards > 0);
```

**✅ Logic is correct:**
- Gets ALL cards (yellow + red)
- Counts total cards correctly
- Checks for red cards separately
- Uses `isRedOnly` flag to determine if checking for red only or any card

## 🐛 Issue Identified

### Problem:
The `actualOutcome` field in the return statement is **missing**! The current code only returns:
```javascript
return {
    status: won ? 'won' : 'lost',
    debugInfo: { playerId, participantName, numCards, hasRed, isRedOnly, yesSelected },
    reason: `Player ${isRedOnly ? 'Red Card' : 'Card'}: ${didHit ? 'occurred' : 'none'} → ${won ? 'WON' : 'LOST'}`
};
```

**Missing:**
- `actualOutcome`: Should show detailed card breakdown (e.g., "1 yellow, 1 red" or "2 yellow cards" or "no cards")
- Yellow/Red breakdown in response

### Expected Behavior (Based on Settlement Rules):

#### Market 1: "To Get a Card" (Any Card)
- If player has 1 Yellow Card → `actualOutcome: "1 yellow card"` → WON (if Yes selected)
- If player has 1 Red Card → `actualOutcome: "1 red card"` → WON (if Yes selected)
- If player has 2 Yellow Cards → `actualOutcome: "2 yellow cards"` → WON (if Yes selected)
- If player has no cards → `actualOutcome: "no cards"` → LOST (if Yes selected)

#### Market 2: "To Get a Red Card" (Red Card Only)
- If player has 1 Red Card → `actualOutcome: "1 red card"` → WON (if Yes selected)
- If player has only Yellow Cards → `actualOutcome: "1 yellow card"` → LOST (if Yes selected)
- If player has no cards → `actualOutcome: "no cards"` → LOST (if Yes selected)

## ✅ Solution Required

### 1. Add `actualOutcome` field with detailed card breakdown
```javascript
// Build detailed card description
let actualOutcome = '';
if (numCards === 0) {
    actualOutcome = 'no cards';
} else {
    const yellowCards = cards.filter(c => {
        const cardType = String(c?.card || '').toLowerCase();
        return cardType.includes('yellow') && !cardType.includes('red');
    });
    const redCards = cards.filter(c => {
        const cardType = String(c?.card || '').toLowerCase();
        return cardType.includes('red');
    });
    
    const parts = [];
    if (yellowCards.length > 0) {
        parts.push(`${yellowCards.length} yellow${yellowCards.length > 1 ? 's' : ''}`);
    }
    if (redCards.length > 0) {
        parts.push(`${redCards.length} red${redCards.length > 1 ? 's' : ''}`);
    }
    actualOutcome = parts.join(', ');
}
```

### 2. Add yellow/red breakdown to debugInfo
```javascript
const yellowCards = cards.filter(c => {
    const cardType = String(c?.card || '').toLowerCase();
    return cardType.includes('yellow') && !cardType.includes('red');
});
const redCards = cards.filter(c => {
    const cardType = String(c?.card || '').toLowerCase();
    return cardType.includes('red');
});

debugInfo: {
    playerId: Number(playerId),
    participantName,
    numCards,
    yellowCards: yellowCards.length,
    redCards: redCards.length,
    hasRed,
    isRedOnly,
    yesSelected
}
```

### 3. Update return statement
```javascript
return {
    status: won ? 'won' : 'lost',
    actualOutcome: actualOutcome, // Add this
    debugInfo: { ... }, // With yellow/red breakdown
    reason: `Player ${isRedOnly ? 'Red Card' : 'Card'}: ${actualOutcome} → ${won ? 'WON' : 'LOST'}`
};
```

## 📊 Summary

**Current State:**
- ✅ Card extraction logic is correct (gets all cards)
- ✅ Settlement logic is correct (checks for any card vs red only)
- ❌ Missing `actualOutcome` field with card details
- ❌ Missing yellow/red breakdown in response

**Required Changes:**
1. Calculate yellow and red card counts separately
2. Build detailed `actualOutcome` string (e.g., "1 yellow, 1 red" or "2 yellow cards")
3. Add `actualOutcome` to return object
4. Add yellow/red counts to `debugInfo`

**No changes needed to:**
- `getCardEvents()` - already returns all cards correctly
- `getPlayerEvents()` - already returns all cards correctly
- Settlement logic - already correct




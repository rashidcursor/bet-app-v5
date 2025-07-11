# Bet Outcome Calculation Flow - Simple Explanation

## Quick Summary

The bet outcome calculation follows this simple flow:

```
Input (Bet + Match Data)
    ↓
Validate Data
    ↓
Check if Match is Finished
    ↓
Find Market ID
    ↓
Choose Calculation Method:
    ├── Use API's "winning" field (Simple)
    └── Calculate manually (Complex)
    ↓
Return Result (Won/Lost/Canceled + Payout)
```

## Detailed Step-by-Step Flow

### 1. **Input Validation**

```javascript
// You provide:
const bet = {
  oddId: "12345",
  marketId: 1, // 1 = Match Result (1X2)
  betOption: "1", // "1" = Home Win
  odds: 2.5,
  stake: 100,
};

const matchData = {
  state: { id: 5 }, // 5 = Match Finished
  scores: [{ score: { goals: { home: 2, away: 1 } } }],
  odds: [{ id: "12345", winning: true }],
};
```

### 2. **Match Status Check**

```javascript
// Only calculate if match is finished
if (matchData.state.id !== 5) {
  return { status: "pending" }; // Wait for match to finish
}
```

### 3. **Market ID Detection**

```javascript
// Get market type
const marketId = bet.marketId; // 1 = Match Result
```

### 4. **Calculation Method Decision**

```javascript
// Check markets.json file
if (markets[marketId].has_winning_calculations === true) {
  // Method A: Use winning field from API
  return calculateFromWinningField();
} else {
  // Method B: Calculate manually
  return calculateManually();
}
```

### 5A. **Simple Method (Using Winning Field)**

```javascript
// For markets with has_winning_calculations: true
const selectedOdd = matchData.odds.find((odd) => odd.id === bet.oddId);
const isWinning = selectedOdd.winning === true;
const payout = isWinning ? bet.stake * bet.odds : 0;

return {
  status: isWinning ? "won" : "lost",
  payout: payout,
};
```

### 5B. **Manual Calculation Method**

```javascript
// For markets requiring calculation
switch (marketType) {
  case "MATCH_RESULT":
    // Extract scores: home = 2, away = 1
    // Determine result: HOME_WIN (because 2 > 1)
    // Check bet: "1" means HOME_WIN
    // Compare: bet matches result = WON
    return { status: "won", payout: 250 };
}
```

## Real Example Walkthrough

### Example: Home Win Bet

```javascript
// Input
const bet = {
  oddId: "abc123",
  marketId: 1, // Match Result market
  betOption: "1", // Betting on Home Win
  odds: 2.5,
  stake: 100,
};

const matchData = {
  state: { id: 5 }, // Match finished
  scores: [
    {
      score: {
        goals: { home: 2, away: 1 }, // Arsenal 2-1 Chelsea
      },
    },
  ],
};
```

### Flow:

1. ✅ **Valid Data**: Both bet and match data provided
2. ✅ **Match Finished**: state.id = 5
3. ✅ **Market ID Found**: 1 = Match Result
4. 🔍 **Check Method**: Market 1 has `has_winning_calculations: true`
5. 🎯 **Use Winning Field**: Find odd with id "abc123", check winning = true
6. ✅ **Result**: Won! Payout = 100 × 2.5 = 250

### Alternative Manual Calculation:

```javascript
// If we calculated manually instead:
const homeScore = 2, awayScore = 1;
const actualResult = homeScore > awayScore ? "HOME_WIN" :
                    homeScore < awayScore ? "AWAY_WIN" : "DRAW";
// actualResult = "HOME_WIN"

const betSelection = bet.betOption; // "1"
const normalizedBet = "1" === "HOME_WIN"; // true
const isWinning = actualResult === "HOME_WIN"; // true
const payout = 100 × 2.5 = 250;
```

## Market Types Explained

### Markets Using API Winning Field

- **Market 1**: Match Result ✅ (has_winning_calculations: true)
- **Market 10**: Half Time/Full Time ✅
- **Market 14**: Half Time Result ✅
- **Market 18**: Player Goals ✅
- **Market 19**: Clean Sheet ✅

### Markets Using Manual Calculation

- **Market 2**: Over/Under Goals (count goals vs threshold)
- **Market 3**: Both Teams Score (check if both teams scored)
- **Market 4**: Correct Score (exact score match)
- **Market 6**: Asian Handicap (apply handicap to scores)

## Key Points

1. **Two Methods**: Either use API's `winning` field or calculate manually
2. **Simple Logic**: Most common markets are straightforward
3. **Reliable Fallback**: If calculation fails, the system handles it gracefully
4. **Batch Processing**: Can process many bets at once efficiently

This system ensures accurate, fast, and reliable bet outcome calculations for all supported market types!

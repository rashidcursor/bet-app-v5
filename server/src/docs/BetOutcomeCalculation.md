# Bet Outcome Calculation Service Documentation

## Overview

The Bet Outcome Calculation Service is a comprehensive system for calculating betting outcomes across various market types in sports betting applications. It provides accurate, reliable, and flexible outcome determination for different types of bets including match results, over/under, handicaps, player markets, and specialized betting scenarios.

## Architecture

### Core Components

1. **BetOutcomeCalculationService** - Main service class handling all outcome calculations
2. **Test Suite** - Comprehensive testing framework for validation

### File Structure

```
server/src/
├── services/
│   └── betOutcomeCalculation.service.js    # Core calculation service
└── tests/
    └── betOutcomeCalculation.test.js       # Test suite and examples
```

## Features

### Supported Market Types

- **Match Result (1X2)** - Home win, Draw, Away win
- **Over/Under Goals** - Total goals over/under specific thresholds
- **Both Teams to Score** - Whether both teams score in the match
- **Correct Score** - Exact final score prediction
- **Asian Handicap** - Including quarter handicaps and splits
- **Player Markets** - Goals, cards, substitutions
- **Double Chance** - Combination of two outcomes
- **Half-Time Results** - First half outcomes
- **Corners** - Corner kick markets
- **Cards** - Yellow/red card markets
- **Draw No Bet** - Stake refunded on draw
- **Clean Sheet** - Team keeps clean sheet
- **Win to Nil** - Team wins without conceding
- **Odd/Even Goals** - Total goals odd or even

### Advanced Features

- **Performance Analytics** - Detailed betting statistics
- **Risk Analysis** - Volatility and risk metrics
- **Pattern Recognition** - Score pattern analysis
- **Batch Processing** - Calculate multiple bets efficiently

## Bet Outcome Calculation Flow

The service follows a clear, step-by-step process to determine bet outcomes:

### Step 1: Input Validation

```javascript
// Validate that both bet and match data are provided
if (!bet || !matchData) {
  throw new CustomError("Invalid bet or match data");
}
```

### Step 2: Match Status Check

```javascript
// Check if match is finished (only calculate outcomes for completed matches)
if (!this.isMatchFinished(matchData)) {
  return {
    status: "pending",
    reason: "Match not finished",
  };
}
```

### Step 3: Market ID Detection

```javascript
// Get market ID from bet object or extract from match odds
const marketId =
  bet.marketId || this.extractMarketIdFromOdd(bet.oddId, matchData);
```

### Step 4: Calculation Method Decision

```javascript
// Check if this market type uses pre-calculated winning field
const hasWinningCalculations = await this.checkMarketHasWinningCalculations(
  marketId
);

if (hasWinningCalculations) {
  // Method A: Use winning field from API
  return this.calculateOutcomeFromWinningField(bet, matchData);
} else {
  // Method B: Calculate manually based on match data
  return this.calculateOutcomeByMarketType(bet, matchData, marketId);
}
```

### Step 5A: Winning Field Method (Simple)

For markets with `has_winning_calculations: true` in markets.json:

```javascript
// Find the specific odd that was bet on
const selectedOdd = this.findSelectedOdd(bet, matchData);

// Check the pre-calculated winning field
const isWinning = selectedOdd.winning === true;

// Return result with payout
return {
  status: isWinning ? "won" : "lost",
  payout: isWinning ? bet.stake * bet.odds : 0,
};
```

### Step 5B: Manual Calculation Method

For markets requiring custom calculation logic:

```javascript
// Determine market type from market ID
const marketType = this.getMarketType(marketId); // e.g., "MATCH_RESULT"

// Call appropriate calculation method
switch (marketType) {
  case "MATCH_RESULT":
    return this.calculateMatchResult(bet, matchData);
  case "OVER_UNDER":
    return this.calculateOverUnder(bet, matchData);
  case "BOTH_TEAMS_SCORE":
    return this.calculateBothTeamsScore(bet, matchData);
  // ... other market types
}
```

### Step 6: Market-Specific Calculation Example

**Match Result (1X2) Calculation:**

```javascript
// Extract final scores from match data
const scores = this.extractMatchScores(matchData);
// Result: { homeScore: 2, awayScore: 1 }

// Determine actual match result
let actualResult;
if (homeScore > awayScore) actualResult = "HOME_WIN";
else if (homeScore < awayScore) actualResult = "AWAY_WIN";
else actualResult = "DRAW";

// Normalize bet selection for comparison
const betSelection = this.normalizeBetSelection(bet.betOption);
// "1" -> "HOME_WIN", "X" -> "DRAW", "2" -> "AWAY_WIN"

// Check if bet won
const isWinning = betSelection === actualResult;

// Calculate payout
const payout = isWinning ? bet.stake * bet.odds : 0;

return {
  status: isWinning ? "won" : "lost",
  payout: payout,
  actualResult: `${homeScore}-${awayScore}`,
  reason: `Match result: ${homeScore}-${awayScore}`,
};
```

## Usage Examples

### Basic Usage

```javascript
import BetOutcomeCalculationService from "./services/betOutcomeCalculation.service.js";

const service = new BetOutcomeCalculationService();

// Example bet object
const bet = {
  _id: "bet_001",
  oddId: "odd_001",
  marketId: 1,
  betOption: "1", // Home win
  odds: 2.5,
  stake: 100,
};

// Example match data
const matchData = {
  id: "12345",
  state: { id: 5, name: "FT" }, // Match finished
  scores: [
    {
      description: "CURRENT",
      score: { goals: { home: 2, away: 1 } },
    },
  ],
  participants: [{ name: "Arsenal" }, { name: "Chelsea" }],
  odds: [
    {
      id: "odd_001",
      market_id: 1,
      label: "1",
      value: "2.50",
      winning: true, // Set by API after match completion
    },
  ],
};

// Calculate outcome
const result = await service.calculateBetOutcome(bet, matchData);
console.log(result);
// Output: { status: "won", payout: 250, reason: "Match result: 2-1" }
```

### Batch Processing

```javascript
// Process multiple bets at once
const bets = [bet1, bet2, bet3];
const matchDataMap = {
  12345: matchData1,
  12346: matchData2,
  12347: matchData3,
};

const results = await service.calculateBatchOutcomes(bets, matchDataMap);
```

### Detailed Analysis

```javascript
// Get comprehensive bet analysis with statistics
const analysis = service.getBetAnalysis(bet, matchData);
console.log(analysis);
// Output includes win probability, expected value, ROI, etc.
```

## API Reference

### BetOutcomeCalculationService

#### Main Methods

##### `calculateBetOutcome(bet, matchData)`

- **Parameters:**
  - `bet` (Object): Bet object with id, odds, stake, etc.
  - `matchData` (Object): Match data with scores, state, participants
- **Returns:** Object with status, payout, reason, and additional details
- **Description:** Main method for calculating bet outcomes

##### `calculateBatchOutcomes(bets, matchDataMap)`

- **Parameters:**
  - `bets` (Array): Array of bet objects
  - `matchDataMap` (Object): Map of match data by match ID
- **Returns:** Array of outcome results
- **Description:** Process multiple bets in batch

##### `getBetAnalysis(bet, matchData)`

- **Parameters:**
  - `bet` (Object): Bet object
  - `matchData` (Object): Match data
- **Returns:** Detailed analysis including probability and expected value
- **Description:** Comprehensive bet analysis with statistics

#### Market-Specific Methods

##### `calculateMatchResult(bet, matchData)`

Calculate 1X2 match result outcomes

##### `calculateOverUnder(bet, matchData)`

Calculate over/under goals outcomes

##### `calculateBothTeamsScore(bet, matchData)`

Calculate both teams to score outcomes

##### `calculateCorrectScore(bet, matchData)`

Calculate correct score outcomes

##### `calculateAsianHandicap(bet, matchData)`

Calculate Asian handicap outcomes

##### `calculatePlayerGoals(bet, matchData)`

Calculate player goalscorer outcomes

## Data Structures

### Bet Object Structure

```javascript
{
  _id: "unique_bet_id",
  oddId: "odd_identifier",
  marketId: 1, // Market type identifier
  betOption: "1", // Bet selection
  odds: 2.50, // Decimal odds
  stake: 100, // Stake amount
  matchId: "match_identifier", // Optional
  selection: "Home Win" // Optional description
}
```

### Match Data Structure

```javascript
{
  id: "match_id",
  state: {
    id: 5, // 5 = finished, 2 = live, 1 = not started
    name: "FT"
  },
  scores: [
    {
      description: "CURRENT",
      score: {
        goals: {
          home: 2,
          away: 1
        }
      }
    },
    {
      description: "HT",
      score: {
        goals: {
          home: 1,
          away: 0
        }
      }
    }
  ],
  participants: [
    { name: "Home Team" },
    { name: "Away Team" }
  ],
  odds: [
    {
      id: "odd_id",
      market_id: 1,
      label: "1",
      value: "2.50",
      winning: true, // Set after match completion
      name: "Home Win"
    }
  ]
}
```

### Outcome Result Structure

```javascript
{
  status: "won", // "won", "lost", "canceled", "pending", "error"
  payout: 250, // Payout amount
  betId: "bet_001",
  reason: "Match result: 2-1",
  actualResult: "2-1", // Actual match result
  expectedResult: "HOME_WIN", // What was bet on
  calculatedAt: "2023-12-01T15:30:00.000Z"
}
```

## Market Type Mappings

| Market ID | Description         | Calculation Method      |
| --------- | ------------------- | ----------------------- |
| 1, 52     | Match Result (1X2)  | Score comparison        |
| 2, 26     | Over/Under Goals    | Goal total vs threshold |
| 3         | Both Teams to Score | Both teams scored check |
| 57        | Correct Score       | Exact score match       |
| 6, 26     | Asian Handicap      | Score + handicap        |
| 247, 11   | Player Goals        | Player statistics       |
| 66        | Player Cards        | Player statistics       |
| 13        | Double Chance       | Two outcome combination |
| 14        | Half Time Result    | Half-time scores        |
| 44        | Corners             | Corner statistics       |
| 45        | Total Cards         | Card statistics         |

## Configuration

### Environment Variables

```env
# Cache settings
BET_OUTCOME_CACHE_TTL=3600 # Cache time-to-live in seconds

# Calculation settings
LIVE_ODDS_ADJUSTMENT_FACTOR=0.95 # Live betting odds adjustment
CASHOUT_PERCENTAGE=0.80 # Cashout value percentage
MINIMUM_CASHOUT_PERCENTAGE=0.10 # Minimum cashout value
```

### Service Configuration

```javascript
// Market type configuration
const marketTypes = {
  MATCH_RESULT: [1, 52],
  OVER_UNDER: [2, 26],
  BOTH_TEAMS_SCORE: [3],
  // ... more market types
};

// Result mappings
const resultMappings = {
  HOME_WIN: ["1", "home", "Home"],
  DRAW: ["X", "draw", "Draw", "Tie"],
  AWAY_WIN: ["2", "away", "Away"],
  // ... more mappings
};
```

## Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const result = await service.calculateBetOutcome(bet, matchData);
} catch (error) {
  if (error.code === "INVALID_DATA") {
    // Handle invalid data
  } else if (error.code === "MATCH_NOT_FINISHED") {
    // Handle unfinished match
  }
}
```

### Common Error Codes

- `INVALID_DATA` - Invalid bet or match data
- `MATCH_NOT_FINISHED` - Match is still in progress
- `INVALID_ODD_ID` - Odd ID not found in match data
- `INVALID_BET_STATUS` - Invalid status in result
- `INVALID_PAYOUT` - Invalid payout calculation

## Testing

### Running Tests

```bash
# Run the test suite
node server/src/tests/betOutcomeCalculation.test.js

# Run specific test demonstrations
import { demonstrateBetOutcomeCalculation } from './tests/betOutcomeCalculation.test.js';
await demonstrateBetOutcomeCalculation();
```

### Test Coverage

The test suite covers:

- ✅ Match Result calculations
- ✅ Over/Under calculations
- ✅ Both Teams to Score
- ✅ Correct Score
- ✅ Asian Handicap
- ✅ Player Markets
- ✅ Unfinished matches
- ✅ Invalid data handling
- ✅ Batch processing
- ✅ Bet analysis

## Performance Considerations

### Caching Strategy

- Match results cached for 1 hour after completion
- Outcome calculations cached to avoid recalculation
- Market type mappings cached in memory

### Optimization Tips

1. **Batch Processing**: Use `calculateBatchOutcomes` for multiple bets
2. **Data Validation**: Validate input data before processing
3. **Lazy Loading**: Load match data only when needed
4. **Result Caching**: Cache frequently accessed results

### Memory Usage

- Service maintains minimal memory footprint
- Caches are configured with TTL to prevent memory leaks
- Large batch operations process in chunks

## Integration Examples

### Express.js Integration

```javascript
import express from "express";
import BetOutcomeCalculationService from "./services/betOutcomeCalculation.service.js";

const app = express();
const betService = new BetOutcomeCalculationService();

app.post("/api/calculate-bet-outcome", async (req, res) => {
  try {
    const { bet, matchData } = req.body;
    const result = await betService.calculateBetOutcome(bet, matchData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Scheduled Job Integration

```javascript
import cron from "node-cron";
import BetOutcomeCalculationService from "./services/betOutcomeCalculation.service.js";

const betService = new BetOutcomeCalculationService();

// Check pending bets every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  const pendingBets = await getPendingBets();
  const matchDataMap = await getMatchDataForBets(pendingBets);

  const results = await betService.calculateBatchOutcomes(
    pendingBets,
    matchDataMap
  );
  await updateBetStatuses(results);
});
```

### Database Integration

```javascript
import Bet from "../models/Bet.js";
import User from "../models/User.js";

// Update bet status and user balance
async function processBetOutcome(betId, outcome) {
  const bet = await Bet.findById(betId).populate("userId");

  bet.status = outcome.status;
  bet.payout = outcome.payout;

  if (outcome.status === "won" || outcome.status === "canceled") {
    bet.userId.balance += outcome.payout;
    await bet.userId.save();
  }

  await bet.save();
}
```

## Best Practices

### 1. Data Validation

Always validate input data before processing:

```javascript
if (!bet || !matchData) {
  throw new CustomError("Invalid input data", 400, "INVALID_DATA");
}

if (!matchData.state || matchData.state.id !== 5) {
  return { status: "pending", reason: "Match not finished" };
}
```

### 2. Error Handling

Implement comprehensive error handling:

```javascript
try {
  const outcome = await calculateBetOutcome(bet, matchData);
  return outcome;
} catch (error) {
  console.error(`Error calculating outcome for bet ${bet._id}:`, error);
  return { status: "error", reason: error.message, payout: 0 };
}
```

### 3. Performance Optimization

- Use batch processing for multiple calculations
- Implement result caching for repeated calculations
- Validate data early to avoid unnecessary processing

### 4. Testing

- Write comprehensive test cases for all market types
- Test edge cases and error conditions
- Validate calculations against known outcomes

### 5. Monitoring

- Log calculation results for auditing
- Monitor performance metrics
- Alert on calculation errors or inconsistencies

## Troubleshooting

### Common Issues

1. **Incorrect Outcomes**: Check market ID mapping and bet option format
2. **Missing Data**: Ensure match data includes required fields (scores, state)
3. **Performance Issues**: Use batch processing and implement caching
4. **Inconsistent Results**: Validate input data format and types

### Debug Mode

Enable debug logging for detailed calculation information:

```javascript
const service = new BetOutcomeCalculationService();
service.debugMode = true; // Enable detailed logging
```

### Validation Tools

Use the built-in validation methods:

```javascript
const isValid = service.validateBetResult(result);
const analysis = service.getBetAnalysis(bet, matchData);
```

## Changelog

### Version 1.0.0

- Initial release with core calculation features
- Support for major market types
- Basic testing framework
- Comprehensive error handling
- Performance optimizations
- Batch processing capabilities
- Detailed analytics and reporting

## Support

For questions, issues, or feature requests:

1. Check this documentation for common solutions
2. Review the test suite for usage examples
3. Check error codes and messages for specific issues
4. Implement debug logging for detailed troubleshooting

## License

This service is part of the betting application system and follows the project's licensing terms.

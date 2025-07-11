import BetOutcomeCalculationService from "./betOutcomeCalculation.service.js";

// Create instance of the service
const betService = new BetOutcomeCalculationService();

// Sample match data with lineups (based on your provided structure)
const sampleMatchData = {
  lineups: [
    {
      id: 14670256531,
      sport_id: 1,
      fixture_id: 19354641,
      player_id: 32315,
      team_id: 2474,
      position_id: 27,
      formation_field: "4:2",
      type_id: 11,
      formation_position: 10,
      player_name: "B. Finne",
      jersey_number: 11,
      details: [
        {
          id: 1585226517,
          fixture_id: 19354641,
          player_id: 32315,
          team_id: 2474,
          lineup_id: 14670256531,
          type_id: 42,
          data: {
            value: 5,
          },
        },
        {
          id: 1585228777,
          fixture_id: 19354641,
          player_id: 32315,
          team_id: 2474,
          lineup_id: 14670256531,
          type_id: 86, // This is shots on target
          data: {
            value: 3, // Player had 3 shots on target
          },
        },
        {
          id: 1585226716,
          fixture_id: 19354641,
          player_id: 32315,
          team_id: 2474,
          lineup_id: 14670256531,
          type_id: 41,
          data: {
            value: 2,
          },
        },
      ],
    },
    {
      id: 14670256532,
      sport_id: 1,
      fixture_id: 19354641,
      player_id: 32316,
      team_id: 2474,
      position_id: 28,
      formation_field: "4:3",
      type_id: 12,
      formation_position: 11,
      player_name: "C. Ronaldo",
      jersey_number: 7,
      details: [
        {
          id: 1585226518,
          fixture_id: 19354641,
          player_id: 32316,
          team_id: 2474,
          lineup_id: 14670256532,
          type_id: 86, // This is shots on target
          data: {
            value: 6, // Player had 6 shots on target
          },
        },
      ],
    },
  ],
};

// Test Case 1: Bet on B. Finne with threshold 2.5 (should WIN - 3 > 2.5)
const sampleBet1 = {
  _id: "bet001",
  userId: "user123",
  matchId: "19354641",
  oddId: "odd123",
  betOption: "Over 2.5 Shots on Target",
  odds: 2.5,
  stake: 100,
  betDetails: {
    market_id: "267",
    market_name: "Player Shots On Target",
    name: "B. Finne", // Player name to search for
    label: "2.5", // Threshold
  },
};

// Test Case 2: Bet on B. Finne with threshold 3.5 (should LOSE - 3 < 3.5)
const sampleBet2 = {
  _id: "bet002",
  userId: "user123",
  matchId: "19354641",
  oddId: "odd124",
  betOption: "Over 3.5 Shots on Target",
  odds: 3.0,
  stake: 50,
  betDetails: {
    market_id: "267",
    market_name: "Player Shots On Target",
    name: "B. Finne", // Player name to search for
    label: "3.5", // Threshold
  },
};

// Test Case 3: Bet on C. Ronaldo with threshold 4.5 (should WIN - 6 > 4.5)
const sampleBet3 = {
  _id: "bet003",
  userId: "user123",
  matchId: "19354641",
  oddId: "odd125",
  betOption: "Over 4.5 Shots on Target",
  odds: 1.8,
  stake: 200,
  betDetails: {
    market_id: "267",
    market_name: "Player Shots On Target",
    name: "C. Ronaldo", // Player name to search for
    label: "4.5", // Threshold
  },
};

// Test Case 4: Bet on non-existent player (should be CANCELED)
const sampleBet4 = {
  _id: "bet004",
  userId: "user123",
  matchId: "19354641",
  oddId: "odd126",
  betOption: "Over 1.5 Shots on Target",
  odds: 1.5,
  stake: 75,
  betDetails: {
    market_id: "267",
    market_name: "Player Shots On Target",
    name: "L. Messi", // Player not in lineups
    label: "1.5",
  },
};

// Test Case 5: Bet with missing betDetails.name (should be CANCELED)
const sampleBet5 = {
  _id: "bet005",
  userId: "user123",
  matchId: "19354641",
  oddId: "odd127",
  betOption: "Over 1.5 Shots on Target",
  odds: 1.5,
  stake: 75,
  betDetails: {
    market_id: "267",
    market_name: "Player Shots On Target",
    // name: missing
    label: "1.5",
  },
};

// Function to run tests
async function runTests() {
  console.log("🧪 Testing calculatePlayerShotsOnTarget function...\n");

  const testCases = [
    {
      bet: sampleBet1,
      description: "B. Finne with 2.5 threshold (should WIN: 3 > 2.5)",
    },
    {
      bet: sampleBet2,
      description: "B. Finne with 3.5 threshold (should LOSE: 3 < 3.5)",
    },
    {
      bet: sampleBet3,
      description: "C. Ronaldo with 4.5 threshold (should WIN: 6 > 4.5)",
    },
    {
      bet: sampleBet4,
      description: "Non-existent player (should be CANCELED)",
    },
    {
      bet: sampleBet5,
      description: "Missing player name (should be CANCELED)",
    },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const { bet, description } = testCases[i];

    console.log(`📋 Test Case ${i + 1}: ${description}`);
    console.log(`   Player: ${bet.betDetails?.name || "MISSING"}`);
    console.log(`   Threshold: ${bet.betDetails?.label || "MISSING"}`);
    console.log(`   Stake: $${bet.stake}`);

    try {
      const result = betService.calculatePlayerShotsOnTarget(
        bet,
        sampleMatchData
      );

      console.log(`   ✅ Result: ${result.status.toUpperCase()}`);
      console.log(`   💰 Payout: $${result.payout}`);
      console.log(`   📊 Details: ${result.reason}`);

      if (result.actualShotsOnTarget !== undefined) {
        console.log(`   🎯 Actual Shots: ${result.actualShotsOnTarget}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log(""); // Empty line for spacing
  }
}

// Run the tests
runTests().catch(console.error);

console.log("📈 Expected Results Summary:");
console.log("Test 1: WON (3 shots > 2.5 threshold)");
console.log("Test 2: LOST (3 shots < 3.5 threshold)");
console.log("Test 3: WON (6 shots > 4.5 threshold)");
console.log("Test 4: CANCELED (player not found)");
console.log("Test 5: CANCELED (missing player name)");

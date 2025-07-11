import BetOutcomeCalculationService from "../services/betOutcomeCalculation.service.js";

/**
 * Test suite for Bet Outcome Calculation Service
 * Demonstrates comprehensive testing of various bet types and outcomes
 */

// Mock data for testing
const mockMatchData = {
  id: "12345",
  state: { id: 5, name: "FT" }, // Finished match
  scores: [
    {
      description: "CURRENT",
      score: {
        goals: {
          home: 2,
          away: 1,
        },
      },
    },
    {
      description: "HT",
      score: {
        goals: {
          home: 1,
          away: 0,
        },
      },
    },
  ],
  participants: [{ name: "Arsenal" }, { name: "Chelsea" }],
  odds: [
    {
      id: "odd_001",
      market_id: 1,
      label: "1",
      value: "2.50",
      winning: true,
      name: "Arsenal",
    },
    {
      id: "odd_002",
      market_id: 1,
      label: "X",
      value: "3.20",
      winning: false,
      name: "Draw",
    },
    {
      id: "odd_003",
      market_id: 1,
      label: "2",
      value: "2.80",
      winning: false,
      name: "Chelsea",
    },
    {
      id: "odd_004",
      market_id: 2,
      label: "Over 2.5",
      value: "1.85",
      winning: true,
      name: "Over 2.5",
    },
    {
      id: "odd_005",
      market_id: 2,
      label: "Under 2.5",
      value: "1.95",
      winning: false,
      name: "Under 2.5",
    },
    {
      id: "odd_006",
      market_id: 3,
      label: "Yes",
      value: "1.70",
      winning: false,
      name: "Both Teams To Score - Yes",
    },
    {
      id: "odd_007",
      market_id: 57,
      label: "2-1",
      value: "8.50",
      winning: true,
      name: "2-1",
    },
  ],
};

const mockBets = [
  {
    _id: "bet_001",
    oddId: "odd_001",
    marketId: 1,
    betOption: "1",
    odds: 2.5,
    stake: 100,
    selection: "Home Win",
  },
  {
    _id: "bet_002",
    oddId: "odd_004",
    marketId: 2,
    betOption: "Over 2.5",
    odds: 1.85,
    stake: 50,
  },
  {
    _id: "bet_003",
    oddId: "odd_006",
    marketId: 3,
    betOption: "Yes",
    odds: 1.7,
    stake: 75,
  },
  {
    _id: "bet_004",
    oddId: "odd_007",
    marketId: 57,
    betOption: "2-1",
    odds: 8.5,
    stake: 25,
  },
];

/**
 * Test runner for bet outcome calculations
 */
class BetOutcomeTestRunner {
  constructor() {
    this.service = new BetOutcomeCalculationService();
    this.testResults = [];
  }

  async runAllTests() {
    console.log("🎯 Starting Bet Outcome Calculation Tests...\n");

    await this.testMatchResultBet();
    await this.testOverUnderBet();
    await this.testBothTeamsScoreBet();
    await this.testCorrectScoreBet();
    await this.testAsianHandicapBet();
    await this.testPlayerBet();
    await this.testUnfinishedMatchBet();
    await this.testInvalidBet();
    await this.testBatchCalculation();
    await this.testBetAnalysis();

    this.displayTestSummary();
  }

  async testMatchResultBet() {
    console.log("🏆 Testing Match Result (1X2) Bet...");

    const bet = mockBets[0]; // Home win bet
    const result = await this.service.calculateBetOutcome(bet, mockMatchData);

    this.logTestResult("Match Result - Home Win", {
      expected: { status: "won", payout: 250 },
      actual: { status: result.status, payout: result.payout },
      passed: result.status === "won" && result.payout === 250,
      details: result,
    });

    // Test losing bet
    const drawBet = {
      ...bet,
      _id: "bet_draw",
      oddId: "odd_002",
      betOption: "X",
      selection: "Draw",
    };

    const drawResult = await this.service.calculateBetOutcome(
      drawBet,
      mockMatchData
    );

    this.logTestResult("Match Result - Draw (Losing)", {
      expected: { status: "lost", payout: 0 },
      actual: { status: drawResult.status, payout: drawResult.payout },
      passed: drawResult.status === "lost" && drawResult.payout === 0,
      details: drawResult,
    });
  }

  async testOverUnderBet() {
    console.log("\n⚽ Testing Over/Under Goals Bet...");

    const bet = mockBets[1]; // Over 2.5 goals
    const result = await this.service.calculateBetOutcome(bet, mockMatchData);

    // Match ended 2-1 (3 goals total), so Over 2.5 should win
    this.logTestResult("Over/Under - Over 2.5 Goals", {
      expected: { status: "won", payout: 92.5 },
      actual: { status: result.status, payout: result.payout },
      passed: result.status === "won" && Math.abs(result.payout - 92.5) < 0.01,
      details: result,
    });
  }

  async testBothTeamsScoreBet() {
    console.log("\n🎯 Testing Both Teams to Score Bet...");

    const bet = mockBets[2]; // BTTS Yes
    const result = await this.service.calculateBetOutcome(bet, mockMatchData);

    // Match ended 2-1, only home team scored, so BTTS should lose
    this.logTestResult("Both Teams to Score - Yes", {
      expected: { status: "lost", payout: 0 },
      actual: { status: result.status, payout: result.payout },
      passed: result.status === "lost" && result.payout === 0,
      details: result,
    });
  }

  async testCorrectScoreBet() {
    console.log("\n🎲 Testing Correct Score Bet...");

    const bet = mockBets[3]; // 2-1 correct score
    const result = await this.service.calculateBetOutcome(bet, mockMatchData);

    this.logTestResult("Correct Score - 2-1", {
      expected: { status: "won", payout: 212.5 },
      actual: { status: result.status, payout: result.payout },
      passed: result.status === "won" && Math.abs(result.payout - 212.5) < 0.01,
      details: result,
    });
  }

  async testAsianHandicapBet() {
    console.log("\n📊 Testing Asian Handicap Bet...");

    const handicapBet = {
      _id: "bet_handicap",
      oddId: "odd_handicap",
      marketId: 6,
      betOption: "Arsenal -0.5",
      odds: 1.9,
      stake: 100,
    };

    const result = await this.service.calculateBetOutcome(
      handicapBet,
      mockMatchData
    );

    // Arsenal won 2-1, with -0.5 handicap they still win
    this.logTestResult("Asian Handicap - Arsenal -0.5", {
      expected: { status: "won" },
      actual: { status: result.status },
      passed: result.status === "won",
      details: result,
    });
  }

  async testPlayerBet() {
    console.log("\n👤 Testing Player Bet...");

    const playerBet = {
      _id: "bet_player",
      oddId: "odd_001", // Using existing odd for test
      marketId: 247,
      betOption: "Thierry Henry",
      odds: 3.5,
      stake: 50,
    };

    const result = await this.service.calculateBetOutcome(
      playerBet,
      mockMatchData
    );

    this.logTestResult("Player Goalscorer", {
      expected: { status: "won" }, // Based on winning field in mock data
      actual: { status: result.status },
      passed: result.status === "won",
      details: result,
    });
  }

  async testUnfinishedMatchBet() {
    console.log("\n⏱️ Testing Unfinished Match Bet...");

    const unfinishedMatchData = {
      ...mockMatchData,
      state: { id: 2, name: "LIVE" },
    };

    const bet = mockBets[0];
    const result = await this.service.calculateBetOutcome(
      bet,
      unfinishedMatchData
    );

    this.logTestResult("Unfinished Match", {
      expected: { status: "pending" },
      actual: { status: result.status },
      passed: result.status === "pending",
      details: result,
    });
  }

  async testInvalidBet() {
    console.log("\n❌ Testing Invalid Bet Data...");

    const invalidBet = {
      _id: "bet_invalid",
      oddId: "non_existent_odd",
      betOption: "Invalid",
      odds: 2.0,
      stake: 100,
    };

    const result = await this.service.calculateBetOutcome(
      invalidBet,
      mockMatchData
    );

    this.logTestResult("Invalid Bet Data", {
      expected: { status: "canceled" },
      actual: { status: result.status },
      passed: result.status === "canceled",
      details: result,
    });
  }

  async testBatchCalculation() {
    console.log("\n📦 Testing Batch Calculation...");

    const matchDataMap = {
      12345: mockMatchData,
    };

    const betsWithMatchId = mockBets.map((bet) => ({
      ...bet,
      matchId: "12345",
    }));

    const results = await this.service.calculateBatchOutcomes(
      betsWithMatchId,
      matchDataMap
    );

    this.logTestResult("Batch Calculation", {
      expected: { count: 4 },
      actual: { count: results.length },
      passed: results.length === 4 && results.every((r) => r.betId),
      details: { resultsCount: results.length, sample: results[0] },
    });
  }

  async testBetAnalysis() {
    console.log("\n📈 Testing Bet Analysis...");

    const bet = mockBets[0];
    const analysis = this.service.getBetAnalysis(bet, mockMatchData);

    this.logTestResult("Bet Analysis", {
      expected: { hasAnalysis: true },
      actual: { hasAnalysis: !!analysis.analysis },
      passed: !!analysis.analysis && analysis.analysis.winProbability,
      details: analysis,
    });
  }

  logTestResult(testName, result) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} ${testName}`);

    if (!result.passed) {
      console.log(`    Expected:`, result.expected);
      console.log(`    Actual:`, result.actual);
    }

    if (result.details && result.details.reason) {
      console.log(`    Reason: ${result.details.reason}`);
    }

    this.testResults.push({
      name: testName,
      passed: result.passed,
      ...result,
    });
  }

  displayTestSummary() {
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((r) => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
    );

    if (failedTests > 0) {
      console.log("\n❌ Failed Tests:");
      this.testResults
        .filter((r) => !r.passed)
        .forEach((test) => console.log(`  - ${test.name}`));
    }

    console.log("\n🎯 Bet Outcome Calculation Service Test Complete!");
  }
}

// Demo function to show usage
export const demonstrateBetOutcomeCalculation = async () => {
  console.log("🚀 Demonstrating Bet Outcome Calculation Service\n");

  const service = new BetOutcomeCalculationService();

  // Example 1: Simple match result bet
  console.log("Example 1: Match Result Bet");
  console.log("Match: Arsenal 2-1 Chelsea");
  console.log("Bet: Arsenal to win (odds: 2.50, stake: $100)");

  const homeWinBet = {
    _id: "demo_001",
    oddId: "odd_001",
    marketId: 1,
    betOption: "1",
    odds: 2.5,
    stake: 100,
  };

  const homeWinResult = await service.calculateBetOutcome(
    homeWinBet,
    mockMatchData
  );
  console.log("Result:", homeWinResult);
  console.log(`Status: ${homeWinResult.status.toUpperCase()}`);
  console.log(`Payout: $${homeWinResult.payout}`);
  console.log(`Profit: $${homeWinResult.payout - homeWinBet.stake}\n`);

  // Example 2: Over/Under bet
  console.log("Example 2: Over/Under Goals Bet");
  console.log("Bet: Over 2.5 goals (odds: 1.85, stake: $50)");

  const overUnderBet = {
    _id: "demo_002",
    oddId: "odd_004",
    marketId: 2,
    betOption: "Over 2.5",
    odds: 1.85,
    stake: 50,
  };

  const overUnderResult = await service.calculateBetOutcome(
    overUnderBet,
    mockMatchData
  );
  console.log("Result:", overUnderResult);
  console.log(`Total Goals: ${overUnderResult.actualGoals}`);
  console.log(`Threshold: ${overUnderResult.threshold}`);
  console.log(`Status: ${overUnderResult.status.toUpperCase()}`);
  console.log(`Payout: $${overUnderResult.payout}\n`);

  // Example 3: Comprehensive analysis
  console.log("Example 3: Comprehensive Bet Analysis");
  const analysis = service.getBetAnalysis(homeWinBet, mockMatchData);
  console.log("Analysis:", {
    outcome: analysis.status,
    payout: analysis.payout,
    winProbability: analysis.analysis.winProbability,
    expectedValue: analysis.analysis.expectedValue,
    roi: analysis.analysis.roi,
  });
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testRunner = new BetOutcomeTestRunner();
  testRunner.runAllTests().catch(console.error);
}

export default BetOutcomeTestRunner;

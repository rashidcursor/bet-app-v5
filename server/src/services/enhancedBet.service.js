import BetOutcomeCalculationService from "./betOutcomeCalculation.service.js";
import BetOutcomeUtilities from "./betOutcomeUtilities.service.js";
import Bet from "../models/Bet.js";
import User from "../models/User.js";
import { CustomError } from "../utils/customErrors.js";

/**
 * Enhanced Bet Service with Comprehensive Outcome Calculation
 * Integrates the bet outcome calculation service with the existing bet management system
 */
class EnhancedBetService {
  constructor() {
    this.outcomeCalculator = new BetOutcomeCalculationService();
    this.outcomeUtilities = new BetOutcomeUtilities();
  }

  /**
   * Enhanced bet outcome checking with comprehensive calculation
   * @param {string} betId - Bet ID to check
   * @param {Object} matchData - Optional match data (if not provided, will fetch)
   * @returns {Object} - Detailed outcome result
   */
  async checkBetOutcomeEnhanced(betId, matchData = null) {
    try {
      console.log(`[EnhancedBetService] Checking outcome for bet: ${betId}`);

      // Get bet from database
      const bet = await Bet.findById(betId).populate("userId");
      if (!bet) {
        throw new CustomError("Bet not found", 404, "BET_NOT_FOUND");
      }

      // If match data not provided, fetch it
      if (!matchData) {
        matchData = await this.fetchMatchData(bet.matchId, bet.inplay);
      }

      // Use comprehensive outcome calculation
      const outcomeResult = await this.outcomeCalculator.calculateBetOutcome(
        bet,
        matchData
      );

      // Update bet in database with detailed result
      await this.updateBetWithOutcome(bet, outcomeResult);

      // Generate analytics if bet is settled
      if (["won", "lost", "canceled"].includes(outcomeResult.status)) {
        const analytics = this.outcomeCalculator.getBetAnalysis(bet, matchData);
        outcomeResult.analytics = analytics.analysis;
      }

      console.log(
        `[EnhancedBetService] Bet ${betId} outcome: ${outcomeResult.status}, payout: ${outcomeResult.payout}`
      );

      return {
        betId: bet._id,
        originalBet: {
          stake: bet.stake,
          odds: bet.odds,
          selection: bet.selection,
          market: bet.marketId,
        },
        outcome: outcomeResult,
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error(`[EnhancedBetService] Error checking bet outcome:`, error);
      throw error;
    }
  }

  /**
   * Batch process multiple bet outcomes with enhanced calculations
   * @param {Array} betIds - Array of bet IDs to process
   * @returns {Array} - Array of outcome results
   */
  async batchCheckBetOutcomes(betIds) {
    try {
      console.log(
        `[EnhancedBetService] Batch processing ${betIds.length} bets`
      );

      // Get all bets
      const bets = await Bet.find({ _id: { $in: betIds } }).populate("userId");

      // Group by match ID to minimize API calls
      const betsByMatch = {};
      bets.forEach((bet) => {
        if (!betsByMatch[bet.matchId]) {
          betsByMatch[bet.matchId] = [];
        }
        betsByMatch[bet.matchId].push(bet);
      });

      // Fetch match data for all unique matches
      const matchIds = Object.keys(betsByMatch);
      const matchDataMap = await this.fetchMultipleMatchData(matchIds);

      // Calculate outcomes using batch processing
      const allResults = [];

      for (const [matchId, matchBets] of Object.entries(betsByMatch)) {
        const matchData = matchDataMap[matchId];

        if (matchData) {
          const batchResults =
            await this.outcomeCalculator.calculateBatchOutcomes(matchBets, {
              [matchId]: matchData,
            });

          // Update each bet with its outcome
          for (let i = 0; i < matchBets.length; i++) {
            const bet = matchBets[i];
            const result = batchResults[i];

            await this.updateBetWithOutcome(bet, result);

            allResults.push({
              betId: bet._id,
              matchId: matchId,
              outcome: result,
            });
          }
        } else {
          // Handle missing match data
          matchBets.forEach((bet) => {
            allResults.push({
              betId: bet._id,
              matchId: matchId,
              outcome: {
                status: "error",
                reason: "Match data not available",
                payout: 0,
              },
            });
          });
        }
      }

      console.log(
        `[EnhancedBetService] Batch processed ${allResults.length} bets`
      );
      return allResults;
    } catch (error) {
      console.error(`[EnhancedBetService] Error in batch processing:`, error);
      throw error;
    }
  }

  /**
   * Check combination bet outcomes (accumulators, multiples)
   * @param {string} combinationBetId - Combination bet ID
   * @returns {Object} - Combination bet outcome
   */
  async checkCombinationBetOutcome(combinationBetId) {
    try {
      // Get combination bet and its legs
      const combinationBet = await this.getCombinationBet(combinationBetId);
      const legs = combinationBet.legs;

      // Fetch match data for all legs
      const matchIds = legs.map((leg) => leg.matchId);
      const matchDataMap = await this.fetchMultipleMatchData(matchIds);

      // Calculate combination outcome
      const result = await this.outcomeUtilities.calculateCombinationBetOutcome(
        legs,
        matchDataMap,
        combinationBet.type
      );

      // Update combination bet status
      await this.updateCombinationBet(combinationBetId, result);

      return result;
    } catch (error) {
      console.error(
        `[EnhancedBetService] Error checking combination bet:`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate live betting adjustments
   * @param {string} betId - Live bet ID
   * @param {Object} liveEvents - Real-time match events
   * @returns {Object} - Adjusted bet value and recommendations
   */
  async calculateLiveBetAdjustment(betId, liveEvents = []) {
    try {
      const bet = await Bet.findById(betId);
      if (!bet) {
        throw new CustomError("Bet not found", 404, "BET_NOT_FOUND");
      }

      if (!bet.inplay) {
        return {
          message: "Not a live bet",
          cashoutValue: 0,
          recommendation: "N/A",
        };
      }

      // Get current match data
      const currentMatchData = await this.fetchMatchData(bet.matchId, true);

      // Calculate live adjustment
      const adjustment =
        await this.outcomeUtilities.calculateLiveBettingAdjustment(
          bet,
          currentMatchData,
          liveEvents
        );

      // Calculate cashout value
      const cashout = this.outcomeUtilities.calculateCashoutValue(
        bet,
        currentMatchData,
        bet.odds,
        adjustment.adjustedOdds
      );

      return {
        betId: bet._id,
        originalOdds: bet.odds,
        currentOdds: adjustment.adjustedOdds,
        adjustmentFactor: adjustment.adjustmentFactor,
        matchProgress: adjustment.matchProgress,
        cashoutValue: cashout.cashoutValue,
        recommendation: cashout.recommendedAction,
        potentialPayout: adjustment.payout,
      };
    } catch (error) {
      console.error(
        `[EnhancedBetService] Error calculating live adjustment:`,
        error
      );
      throw error;
    }
  }

  /**
   * Generate comprehensive betting analytics for a user
   * @param {string} userId - User ID
   * @param {Object} options - Analytics options (timeframe, market types, etc.)
   * @returns {Object} - Detailed analytics
   */
  async generateUserBettingAnalytics(userId, options = {}) {
    try {
      const {
        timeframe = 30, // days
        marketTypes = null,
        includeActive = false,
      } = options;

      // Get user's bets within timeframe
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - timeframe);

      const query = {
        userId: userId,
        createdAt: { $gte: dateFilter },
      };

      if (!includeActive) {
        query.status = { $in: ["won", "lost", "canceled"] };
      }

      if (marketTypes) {
        query.marketId = { $in: marketTypes };
      }

      const userBets = await Bet.find(query);

      // Generate mock outcomes for analysis (in real scenario, these would be from bet records)
      const outcomes = userBets.map((bet) => ({
        status: bet.status,
        payout: bet.payout || 0,
        betId: bet._id,
      }));

      // Generate comprehensive analytics
      const analytics = this.outcomeUtilities.generateBetAnalytics(
        userBets,
        outcomes
      );

      // Add user-specific insights
      analytics.insights = this.generateUserInsights(userBets, outcomes);
      analytics.recommendations = this.generateUserRecommendations(analytics);

      return analytics;
    } catch (error) {
      console.error(`[EnhancedBetService] Error generating analytics:`, error);
      throw error;
    }
  }

  /**
   * Validate bet before placement using outcome probabilities
   * @param {Object} betData - Bet data to validate
   * @param {Object} matchData - Match data
   * @returns {Object} - Validation result with recommendations
   */
  async validateBetPlacement(betData, matchData) {
    try {
      // Calculate implied probability from odds
      const impliedProbability = this.outcomeCalculator.calculateWinProbability(
        betData.odds
      );

      // Calculate expected value
      const expectedValue = this.outcomeCalculator.calculateExpectedValue(
        betData,
        impliedProbability
      );

      // Risk assessment
      const riskLevel = this.assessRiskLevel(betData, impliedProbability);

      // Generate recommendations
      const recommendations = this.generateBetRecommendations(
        betData,
        impliedProbability,
        expectedValue,
        riskLevel
      );

      return {
        valid: true,
        impliedProbability: impliedProbability.toFixed(2) + "%",
        expectedValue: expectedValue.toFixed(2),
        riskLevel: riskLevel,
        recommendations: recommendations,
        suggestedStake: this.calculateOptimalStake(betData, expectedValue),
      };
    } catch (error) {
      console.error(`[EnhancedBetService] Error validating bet:`, error);
      return {
        valid: false,
        reason: error.message,
      };
    }
  }

  // ===================== PRIVATE HELPER METHODS =====================

  /**
   * Update bet with outcome result
   */
  async updateBetWithOutcome(bet, outcomeResult) {
    bet.status = outcomeResult.status;
    bet.payout = outcomeResult.payout || 0;

    // Update user balance if bet won or was canceled
    if (outcomeResult.status === "won" || outcomeResult.status === "canceled") {
      const user = bet.userId;
      user.balance += outcomeResult.payout;
      await user.save();
    }

    await bet.save();
  }

  /**
   * Fetch match data (placeholder - would integrate with existing match service)
   */
  async fetchMatchData(matchId, isLive = false) {
    // This would integrate with your existing match data fetching logic
    // For now, returning a placeholder
    console.log(
      `[EnhancedBetService] Fetching match data for ${matchId}, live: ${isLive}`
    );

    // In real implementation, this would call your existing match service
    // return await FixtureOptimizationService.getMatchData(matchId, isLive);

    throw new CustomError(
      "Match data fetching not implemented",
      500,
      "NOT_IMPLEMENTED"
    );
  }

  /**
   * Fetch multiple match data in batch
   */
  async fetchMultipleMatchData(matchIds) {
    const matchDataMap = {};

    // In real implementation, this would batch fetch match data
    for (const matchId of matchIds) {
      try {
        matchDataMap[matchId] = await this.fetchMatchData(matchId);
      } catch (error) {
        console.error(`Failed to fetch data for match ${matchId}:`, error);
        matchDataMap[matchId] = null;
      }
    }

    return matchDataMap;
  }

  /**
   * Get combination bet (placeholder)
   */
  async getCombinationBet(combinationBetId) {
    // This would get combination bet from your database
    throw new CustomError(
      "Combination bet fetching not implemented",
      500,
      "NOT_IMPLEMENTED"
    );
  }

  /**
   * Update combination bet (placeholder)
   */
  async updateCombinationBet(combinationBetId, result) {
    // This would update combination bet status
    console.log(
      `Updating combination bet ${combinationBetId} with result:`,
      result
    );
  }

  /**
   * Generate user-specific insights
   */
  generateUserInsights(bets, outcomes) {
    const insights = [];

    // Win rate by market type
    const marketPerformance = {};
    bets.forEach((bet, index) => {
      const marketId = bet.marketId;
      if (!marketPerformance[marketId]) {
        marketPerformance[marketId] = { total: 0, won: 0 };
      }
      marketPerformance[marketId].total++;
      if (outcomes[index].status === "won") {
        marketPerformance[marketId].won++;
      }
    });

    // Best performing market
    let bestMarket = null;
    let bestWinRate = 0;
    Object.entries(marketPerformance).forEach(([marketId, perf]) => {
      const winRate = perf.won / perf.total;
      if (winRate > bestWinRate && perf.total >= 5) {
        // Minimum 5 bets
        bestWinRate = winRate;
        bestMarket = marketId;
      }
    });

    if (bestMarket) {
      insights.push({
        type: "BEST_MARKET",
        message: `Your best performing market is ${bestMarket} with ${(
          bestWinRate * 100
        ).toFixed(1)}% win rate`,
        marketId: bestMarket,
        winRate: bestWinRate,
      });
    }

    // Stake pattern analysis
    const stakes = bets.map((bet) => bet.stake);
    const avgStake = stakes.reduce((a, b) => a + b, 0) / stakes.length;
    const maxStake = Math.max(...stakes);

    if (maxStake > avgStake * 3) {
      insights.push({
        type: "HIGH_VARIANCE_STAKES",
        message:
          "You have high variance in stake amounts. Consider more consistent staking.",
        avgStake: avgStake,
        maxStake: maxStake,
      });
    }

    return insights;
  }

  /**
   * Generate user recommendations
   */
  generateUserRecommendations(analytics) {
    const recommendations = [];

    if (analytics.winRate < 40) {
      recommendations.push({
        type: "IMPROVE_SELECTION",
        priority: "HIGH",
        message:
          "Your win rate is below 40%. Focus on better research and value identification.",
      });
    }

    if (analytics.roi < -10) {
      recommendations.push({
        type: "REDUCE_STAKES",
        priority: "HIGH",
        message:
          "Your ROI is negative. Consider reducing stake sizes and improving selection process.",
      });
    }

    if (analytics.riskAnalysis.volatility > analytics.avgStake * 2) {
      recommendations.push({
        type: "MANAGE_RISK",
        priority: "MEDIUM",
        message:
          "High volatility detected. Consider more consistent staking strategy.",
      });
    }

    return recommendations;
  }

  /**
   * Assess risk level of a bet
   */
  assessRiskLevel(betData, impliedProbability) {
    if (impliedProbability > 70) return "LOW";
    if (impliedProbability > 45) return "MEDIUM";
    if (impliedProbability > 25) return "HIGH";
    return "VERY_HIGH";
  }

  /**
   * Generate bet placement recommendations
   */
  generateBetRecommendations(betData, probability, expectedValue, riskLevel) {
    const recommendations = [];

    if (expectedValue > 0) {
      recommendations.push("Positive expected value - good value bet");
    } else {
      recommendations.push("Negative expected value - consider avoiding");
    }

    if (riskLevel === "VERY_HIGH") {
      recommendations.push("Very high risk - only bet small amounts");
    } else if (riskLevel === "HIGH") {
      recommendations.push("High risk - bet conservatively");
    }

    if (probability < 20) {
      recommendations.push("Low probability outcome - high variance bet");
    }

    return recommendations;
  }

  /**
   * Calculate optimal stake using Kelly Criterion
   */
  calculateOptimalStake(betData, expectedValue) {
    // Simplified Kelly Criterion calculation
    const impliedProb = 1 / betData.odds;
    const fairProb = impliedProb + expectedValue / 100;

    if (fairProb <= impliedProb) return 0;

    const kellyFraction = (fairProb * betData.odds - 1) / (betData.odds - 1);

    // Conservative approach - use 25% of Kelly
    return Math.max(0, kellyFraction * 0.25 * 100); // As percentage of bankroll
  }
}

export default EnhancedBetService;

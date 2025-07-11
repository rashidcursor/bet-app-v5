import BetOutcomeCalculationService from "./betOutcomeCalculation.service.js";

/**
 * Extended Bet Outcome Utilities
 * Additional helper functions and specialized calculations for complex betting scenarios
 */
class BetOutcomeUtilities extends BetOutcomeCalculationService {
  constructor() {
    super();

    // Extended market mappings for more specific calculations
    this.extendedMarketTypes = {
      ...this.marketTypes,
      FIRST_HALF_GOALS: [25], // First Half Goals
      SECOND_HALF_GOALS: [27], // Second Half Goals
      PENALTY: [85], // Penalty markets
      CLEAN_SHEET: [86], // Clean sheet markets
      WIN_TO_NIL: [87], // Win to nil
      EXACT_GOALS: [88], // Exact number of goals
      GOALSCORER_FIRST: [247], // First goalscorer
      GOALSCORER_LAST: [248], // Last goalscorer
      GOALSCORER_ANYTIME: [11], // Anytime goalscorer
      MATCH_COMBO: [90], // Combination bets
      SUBSTITUTION: [91], // Player substitution markets
      OFFSIDE: [92], // Offside markets
      THROW_IN: [93], // Throw-in markets
      FREE_KICK: [94], // Free kick markets
      POSSESSION: [95], // Ball possession percentage
      SHOTS_ON_TARGET: [96], // Shots on target
      FOULS: [97], // Total fouls
      YELLOW_CARDS: [98], // Yellow cards
      RED_CARDS: [99], // Red cards
      MANAGER_SPECIALS: [100], // Manager-related markets
    };

    // Score pattern recognition for correct score bets
    this.scorePatterns = {
      DRAW_PATTERNS: ["0-0", "1-1", "2-2", "3-3", "4-4"],
      HIGH_SCORING: ["3-2", "4-1", "4-2", "5-0", "5-1", "4-3", "5-2"],
      LOW_SCORING: ["0-0", "1-0", "0-1", "1-1"],
      DEFENSIVE: ["0-0", "1-0", "0-1", "2-0", "0-2"],
      ATTACKING: ["3-1", "3-2", "4-1", "4-2", "2-3", "1-4", "2-4"],
    };

    // Probability modifiers for different scenarios
    this.probabilityModifiers = {
      HOME_ADVANTAGE: 0.05,
      AWAY_PERFORMANCE: -0.03,
      DERBY_MATCH: 0.08,
      CUP_FINAL: 0.1,
      RELEGATION_BATTLE: 0.15,
      TITLE_DECIDER: 0.12,
    };
  }

  /**
   * Calculate outcome for complex combination bets
   * @param {Array} legs - Array of bet legs
   * @param {Object} matchDataMap - Map of match data by match ID
   * @param {string} betType - Type of combination (accumulator, system, etc.)
   */
  async calculateCombinationBetOutcome(
    legs,
    matchDataMap,
    betType = "accumulator"
  ) {
    const legResults = [];
    let totalOdds = 1;
    let stake = 0;

    // Calculate each leg
    for (const leg of legs) {
      const matchData = matchDataMap[leg.matchId];
      if (!matchData) {
        return {
          status: "canceled",
          reason: "Match data unavailable for one or more legs",
          payout: leg.stake || 0,
        };
      }

      const legResult = await this.calculateBetOutcome(leg, matchData);
      legResults.push(legResult);

      if (legResult.status === "won") {
        totalOdds *= leg.odds;
      } else if (legResult.status === "lost") {
        // For accumulators, one lost leg loses the entire bet
        if (betType === "accumulator") {
          return {
            status: "lost",
            legs: legResults,
            totalOdds: totalOdds,
            payout: 0,
            reason: "One or more legs lost",
          };
        }
      }

      stake += leg.stake || 0;
    }

    const allLegsWon = legResults.every((leg) => leg.status === "won");
    const payout = allLegsWon ? stake * totalOdds : 0;

    return {
      status: allLegsWon ? "won" : "lost",
      legs: legResults,
      totalOdds: totalOdds,
      payout: payout,
      profit: payout - stake,
      betType: betType,
    };
  }

  /**
   * Calculate system bet outcomes (e.g., Trixie, Patent, Yankee)
   * @param {Array} selections - Array of selections
   * @param {Object} matchDataMap - Match data map
   * @param {Object} systemConfig - System bet configuration
   */
  async calculateSystemBetOutcome(selections, matchDataMap, systemConfig) {
    const { combinations, minWins, name } = systemConfig;
    const allResults = [];
    let totalPayout = 0;
    let totalStake = combinations.length * systemConfig.unitStake;

    // Generate all possible combinations
    const combos = this.generateCombinations(selections, combinations);

    for (const combo of combos) {
      const comboResult = await this.calculateCombinationBetOutcome(
        combo,
        matchDataMap,
        "combination"
      );
      allResults.push(comboResult);

      if (comboResult.status === "won") {
        totalPayout += comboResult.payout;
      }
    }

    const winningCombos = allResults.filter((r) => r.status === "won").length;
    const isSystemWin = winningCombos >= minWins;

    return {
      status: isSystemWin ? "won" : "lost",
      systemName: name,
      totalCombinations: combinations.length,
      winningCombinations: winningCombos,
      totalStake: totalStake,
      totalPayout: totalPayout,
      profit: totalPayout - totalStake,
      combinations: allResults,
    };
  }

  /**
   * Advanced correct score outcome with pattern recognition
   */
  calculateAdvancedCorrectScore(bet, matchData) {
    const basicResult = this.calculateCorrectScore(bet, matchData);
    const actualScore = `${this.extractMatchScores(matchData).homeScore}-${
      this.extractMatchScores(matchData).awayScore
    }`;

    // Determine score pattern
    let scorePattern = "NORMAL";
    if (this.scorePatterns.HIGH_SCORING.includes(actualScore)) {
      scorePattern = "HIGH_SCORING";
    } else if (this.scorePatterns.LOW_SCORING.includes(actualScore)) {
      scorePattern = "LOW_SCORING";
    } else if (this.scorePatterns.DEFENSIVE.includes(actualScore)) {
      scorePattern = "DEFENSIVE";
    } else if (this.scorePatterns.ATTACKING.includes(actualScore)) {
      scorePattern = "ATTACKING";
    }

    return {
      ...basicResult,
      scorePattern: scorePattern,
      rarity: this.calculateScoreRarity(actualScore),
      expectedFrequency: this.getScoreExpectedFrequency(actualScore),
    };
  }

  /**
   * Calculate first/last goalscorer outcomes with minute-specific data
   */
  calculateGoalscorerOutcome(bet, matchData, goalsData = []) {
    if (!goalsData || goalsData.length === 0) {
      // Fallback to basic calculation if detailed goal data unavailable
      return this.calculatePlayerGoals(bet, matchData);
    }

    const playerName = bet.betOption.toLowerCase();
    const marketType = this.getGoalscorerMarketType(bet.marketId);

    let isWinning = false;

    switch (marketType) {
      case "FIRST_GOALSCORER":
        const firstGoal = goalsData.find(
          (goal) => goal.minute === Math.min(...goalsData.map((g) => g.minute))
        );
        isWinning =
          firstGoal && firstGoal.player.toLowerCase().includes(playerName);
        break;

      case "LAST_GOALSCORER":
        const lastGoal = goalsData.find(
          (goal) => goal.minute === Math.max(...goalsData.map((g) => g.minute))
        );
        isWinning =
          lastGoal && lastGoal.player.toLowerCase().includes(playerName);
        break;

      case "ANYTIME_GOALSCORER":
        isWinning = goalsData.some((goal) =>
          goal.player.toLowerCase().includes(playerName)
        );
        break;

      default:
        return this.calculatePlayerGoals(bet, matchData);
    }

    const goalsByPlayer = goalsData.filter((goal) =>
      goal.player.toLowerCase().includes(playerName)
    );

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      playerName: bet.betOption,
      marketType: marketType,
      goalsScored: goalsByPlayer.length,
      goalTimes: goalsByPlayer.map((g) => g.minute),
      reason: `${marketType}: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate minute-specific markets (e.g., goal in specific time period)
   */
  calculateTimeBasedOutcome(bet, matchData, eventsData = []) {
    const timeRange = this.extractTimeRange(bet.betOption);
    const eventType = this.extractEventType(bet.betOption);

    if (!timeRange || !eventType) {
      return this.calculateGenericOutcome(bet, matchData);
    }

    const relevantEvents = eventsData.filter(
      (event) =>
        event.type === eventType &&
        event.minute >= timeRange.start &&
        event.minute <= timeRange.end
    );

    const threshold = this.extractThreshold(bet.betOption);
    const betType = this.extractOverUnderType(bet.betOption);

    let isWinning = false;
    if (betType === "OVER") {
      isWinning = relevantEvents.length > threshold;
    } else if (betType === "UNDER") {
      isWinning = relevantEvents.length < threshold;
    } else {
      isWinning = relevantEvents.length === threshold;
    }

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualCount: relevantEvents.length,
      threshold: threshold,
      timeRange: timeRange,
      eventType: eventType,
      events: relevantEvents.map((e) => ({
        minute: e.minute,
        player: e.player,
      })),
      reason: `${eventType} in minutes ${timeRange.start}-${timeRange.end}: ${relevantEvents.length}`,
    };
  }

  /**
   * Calculate enhanced Asian Handicap with quarter goals
   */
  calculateEnhancedAsianHandicap(bet, matchData) {
    const basicResult = this.calculateAsianHandicap(bet, matchData);
    const handicap = this.extractHandicap(bet.betOption);

    // Handle quarter handicaps (e.g., -0.25, +0.75)
    if (handicap % 0.5 === 0.25) {
      return this.calculateQuarterHandicap(bet, matchData, handicap);
    }

    return basicResult;
  }

  /**
   * Calculate quarter handicap outcomes (split stake)
   */
  calculateQuarterHandicap(bet, matchData, handicap) {
    const scores = this.extractMatchScores(matchData);
    const team = this.extractHandicapTeam(bet.betOption);

    // Split handicap into two parts
    const lowerHandicap = Math.floor(handicap * 2) / 2;
    const upperHandicap = Math.ceil(handicap * 2) / 2;

    // Calculate for both parts with half stake each
    const halfStake = bet.stake / 2;

    const lowerResult = this.calculateSingleHandicapOutcome(
      scores,
      team,
      lowerHandicap,
      halfStake,
      bet.odds
    );

    const upperResult = this.calculateSingleHandicapOutcome(
      scores,
      team,
      upperHandicap,
      halfStake,
      bet.odds
    );

    const totalPayout = lowerResult.payout + upperResult.payout;
    let status = "lost";

    if (totalPayout > bet.stake) {
      status = "won";
    } else if (totalPayout === bet.stake) {
      status = "push";
    }

    return {
      status: status,
      payout: totalPayout,
      handicap: handicap,
      team: team,
      lowerHandicap: { handicap: lowerHandicap, ...lowerResult },
      upperHandicap: { handicap: upperHandicap, ...upperResult },
      reason: `Quarter handicap split: ${lowerHandicap} & ${upperHandicap}`,
    };
  }

  /**
   * Calculate live betting adjustments
   */
  calculateLiveBettingAdjustment(bet, matchData, liveEvents = []) {
    const currentMinute = this.getCurrentMatchMinute(matchData);
    const matchProgress = currentMinute / 90; // Assume 90 minute match

    // Adjust odds based on current state
    const adjustmentFactor = this.calculateLiveOddsAdjustment(
      bet,
      matchData,
      liveEvents,
      matchProgress
    );

    const adjustedOdds = bet.odds * adjustmentFactor;
    const baseResult = this.calculateBetOutcome(bet, matchData);

    return {
      ...baseResult,
      originalOdds: bet.odds,
      adjustedOdds: adjustedOdds,
      adjustmentFactor: adjustmentFactor,
      matchProgress: `${currentMinute}:00`,
      payout:
        baseResult.status === "won"
          ? bet.stake * adjustedOdds
          : baseResult.payout,
    };
  }

  // ===================== UTILITY HELPER METHODS =====================

  generateCombinations(arr, size) {
    if (size === 1) return arr.map((item) => [item]);

    const combinations = [];
    for (let i = 0; i < arr.length - size + 1; i++) {
      const head = arr[i];
      const tailCombinations = this.generateCombinations(
        arr.slice(i + 1),
        size - 1
      );
      tailCombinations.forEach((tail) => combinations.push([head, ...tail]));
    }

    return combinations;
  }

  calculateScoreRarity(score) {
    // Historical frequency data (simplified)
    const commonScores = ["1-0", "2-1", "1-1", "2-0", "0-0", "3-1"];
    const rareScores = ["5-0", "6-1", "0-5", "4-4", "5-2"];

    if (commonScores.includes(score)) return "COMMON";
    if (rareScores.includes(score)) return "RARE";
    return "UNCOMMON";
  }

  getScoreExpectedFrequency(score) {
    const frequencies = {
      "1-0": 0.18,
      "2-1": 0.12,
      "1-1": 0.11,
      "2-0": 0.1,
      "0-0": 0.08,
      "3-1": 0.07,
      "0-1": 0.06,
      "1-2": 0.05,
    };
    return frequencies[score] || 0.02;
  }

  getGoalscorerMarketType(marketId) {
    if (marketId === 247) return "FIRST_GOALSCORER";
    if (marketId === 248) return "LAST_GOALSCORER";
    if (marketId === 11) return "ANYTIME_GOALSCORER";
    return "UNKNOWN";
  }

  extractTimeRange(betOption) {
    const timeMatch = betOption.match(/(\d+)-(\d+)/);
    if (timeMatch) {
      return {
        start: parseInt(timeMatch[1]),
        end: parseInt(timeMatch[2]),
      };
    }
    return null;
  }

  extractEventType(betOption) {
    const option = betOption.toLowerCase();
    if (option.includes("goal")) return "GOAL";
    if (option.includes("card")) return "CARD";
    if (option.includes("corner")) return "CORNER";
    if (option.includes("foul")) return "FOUL";
    return "UNKNOWN";
  }

  calculateSingleHandicapOutcome(scores, team, handicap, stake, odds) {
    let adjustedHomeScore = scores.homeScore;
    let adjustedAwayScore = scores.awayScore;

    if (team === "HOME") {
      adjustedHomeScore += handicap;
    } else {
      adjustedAwayScore += handicap;
    }

    if (adjustedHomeScore > adjustedAwayScore) {
      return {
        status: team === "HOME" ? "won" : "lost",
        payout: team === "HOME" ? stake * odds : 0,
      };
    } else if (adjustedHomeScore < adjustedAwayScore) {
      return {
        status: team === "AWAY" ? "won" : "lost",
        payout: team === "AWAY" ? stake * odds : 0,
      };
    } else {
      return { status: "push", payout: stake };
    }
  }

  getCurrentMatchMinute(matchData) {
    if (matchData.state && matchData.state.minute) {
      return matchData.state.minute;
    }
    return 90; // Default to full time if not available
  }

  calculateLiveOddsAdjustment(bet, matchData, liveEvents, progress) {
    let adjustment = 1.0;

    // Adjust based on match progress
    if (progress > 0.8) adjustment *= 0.9; // Reduce odds near end of match
    if (progress < 0.2) adjustment *= 1.1; // Increase odds early in match

    // Adjust based on current score
    const scores = this.extractMatchScores(matchData);
    const goalDifference = Math.abs(scores.homeScore - scores.awayScore);

    if (goalDifference >= 2) adjustment *= 0.8; // Reduce odds for big leads

    return adjustment;
  }

  /**
   * Calculate cashout value for ongoing bets
   */
  calculateCashoutValue(bet, currentMatchData, originalOdds, currentOdds) {
    const originalImpliedProbability = 1 / originalOdds;
    const currentImpliedProbability = 1 / currentOdds;

    const probabilityChange =
      currentImpliedProbability - originalImpliedProbability;
    const potentialPayout = bet.stake * originalOdds;

    // Simple cashout calculation based on probability shift
    const cashoutValue = bet.stake + probabilityChange * potentialPayout * 0.8; // 80% of theoretical value

    return {
      cashoutValue: Math.max(cashoutValue, bet.stake * 0.1), // Minimum 10% of stake
      originalOdds: originalOdds,
      currentOdds: currentOdds,
      probabilityShift: probabilityChange,
      recommendedAction: cashoutValue > bet.stake ? "CASHOUT" : "HOLD",
    };
  }

  /**
   * Generate detailed bet performance analytics
   */
  generateBetAnalytics(bets, outcomes) {
    const analytics = {
      totalBets: bets.length,
      wonBets: outcomes.filter((o) => o.status === "won").length,
      lostBets: outcomes.filter((o) => o.status === "lost").length,
      canceledBets: outcomes.filter((o) => o.status === "canceled").length,
      totalStaked: bets.reduce((sum, bet) => sum + bet.stake, 0),
      totalPayout: outcomes.reduce(
        (sum, outcome) => sum + (outcome.payout || 0),
        0
      ),
      winRate: 0,
      roi: 0,
      averageOdds: 0,
      profitLoss: 0,
    };

    analytics.winRate = (analytics.wonBets / analytics.totalBets) * 100;
    analytics.profitLoss = analytics.totalPayout - analytics.totalStaked;
    analytics.roi = (analytics.profitLoss / analytics.totalStaked) * 100;
    analytics.averageOdds =
      bets.reduce((sum, bet) => sum + bet.odds, 0) / bets.length;

    // Market type breakdown
    analytics.marketBreakdown = this.calculateMarketBreakdown(bets, outcomes);

    // Risk analysis
    analytics.riskAnalysis = this.calculateRiskMetrics(bets, outcomes);

    return analytics;
  }

  calculateMarketBreakdown(bets, outcomes) {
    const breakdown = {};

    bets.forEach((bet, index) => {
      const marketType = this.getMarketType(bet.marketId);
      const outcome = outcomes[index];

      if (!breakdown[marketType]) {
        breakdown[marketType] = {
          count: 0,
          won: 0,
          staked: 0,
          payout: 0,
        };
      }

      breakdown[marketType].count++;
      breakdown[marketType].staked += bet.stake;
      breakdown[marketType].payout += outcome.payout || 0;

      if (outcome.status === "won") {
        breakdown[marketType].won++;
      }
    });

    // Calculate metrics for each market type
    Object.keys(breakdown).forEach((market) => {
      const data = breakdown[market];
      data.winRate = (data.won / data.count) * 100;
      data.roi = ((data.payout - data.staked) / data.staked) * 100;
    });

    return breakdown;
  }

  calculateRiskMetrics(bets, outcomes) {
    const stakes = bets.map((bet) => bet.stake);
    const payouts = outcomes.map((outcome) => outcome.payout || 0);
    const profits = payouts.map((payout, i) => payout - stakes[i]);

    return {
      maxStake: Math.max(...stakes),
      minStake: Math.min(...stakes),
      avgStake: stakes.reduce((a, b) => a + b, 0) / stakes.length,
      maxProfit: Math.max(...profits),
      maxLoss: Math.min(...profits),
      volatility: this.calculateVolatility(profits),
      sharpeRatio: this.calculateSharpeRatio(profits),
    };
  }

  calculateVolatility(profits) {
    const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
    const variance =
      profits.reduce((sum, profit) => sum + Math.pow(profit - mean, 2), 0) /
      profits.length;
    return Math.sqrt(variance);
  }

  calculateSharpeRatio(profits) {
    const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
    const volatility = this.calculateVolatility(profits);
    return volatility === 0 ? 0 : mean / volatility;
  }
}

export default BetOutcomeUtilities;

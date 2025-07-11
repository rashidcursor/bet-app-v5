import { CustomError } from "../utils/customErrors.js";
import NodeCache from "node-cache";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Comprehensive Bet Outcome Calculation Service
 *
 * This service handles calculation of bet outcomes for ALL market types including:
 *
 * CORE MARKETS:
 * - Match Result (1X2) - Market IDs: 1, 52, 117
 * - Over/Under Goals - Market IDs: 2, 26, 47
 * - Both Teams to Score (BTTS) - Market IDs: 3, 49
 * - Correct Score - Market IDs: 4, 57
 * - Asian Handicap - Market IDs: 5, 6
 *
 * EXTENDED MARKETS:
 * - Double Chance - Market IDs: 7, 13
 * - Draw No Bet - Market ID: 8
 * - Half Time Result - Market IDs: 9, 14
 * - Half Time/Full Time - Market ID: 10
 * - Player Goals (First/Last/Anytime) - Market IDs: 11, 17, 18, 247, 248
 * - Total Goals (Exact) - Market ID: 12
 * - Team Total Goals - Market IDs: 15, 16
 * - Clean Sheet - Market IDs: 19, 20
 * - Win to Nil - Market IDs: 21, 22
 * - Odd/Even Goals - Market ID: 23
 * - Highest Scoring Half - Market ID: 24
 * - Corners - Market IDs: 25, 44
 * - Cards Total - Market IDs: 27, 45
 * - Player Cards - Market IDs: 28, 66
 * - Penalties - Market ID: 29
 *
 * CALCULATION METHODS:
 * 1. For markets with has_winning_calculations=true: Uses winning field from odds
 * 2. For other markets: Calculates based on match data and bet parameters
 *
 * SUPPORTED BET TYPES:
 * - Single bets with various market types
 * - Handicap bets (Asian, European)
 * - Over/Under with different thresholds
 * - Player-specific markets
 * - Time-based markets
 * - Statistical markets (corners, cards, etc.)
 */
class BetOutcomeCalculationService {
  constructor() {
    // Cache for match results to avoid repeated API calls
    this.outcomeCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

    // Market type mappings
    this.marketTypes = {
      MATCH_RESULT: [1, 52], // 1X2, Full Time Result
      OVER_UNDER: [2, 26], // Over/Under Goals
      BOTH_TEAMS_SCORE: [3], // BTTS
      CORRECT_SCORE: [57], // Correct Score
      ASIAN_HANDICAP: [6, 26], // Asian Handicap
      PLAYER_GOALS: [247, 11], // Player Goalscorer
      PLAYER_CARDS: [66], // Player Cards
      DOUBLE_CHANCE: [13], // Double Chance
      HALF_TIME_RESULT: [14], // Half Time Result
      CORNERS: [44], // Corners
      CARDS_TOTAL: [45], // Total Cards
    };

    // Result mapping for common outcomes
    this.resultMappings = {
      HOME_WIN: ["1", "home", "Home"],
      DRAW: ["X", "draw", "Draw", "Tie"],
      AWAY_WIN: ["2", "away", "Away"],
      YES: ["yes", "Yes", "1"],
      NO: ["no", "No", "0"],
      OVER: ["over", "Over"],
      UNDER: ["under", "Under"],
    };

    this.typeIdMapping = {
      shotsOnTarget: 86, // Type ID for shots on target
    };
  }

  /**
   * Main method to calculate bet outcome
   * @param {Object} bet - Bet object from database
   * @param {Object} matchData - Match data with scores, state, and odds
   * @returns {Object} - Bet outcome result
   */
  async calculateBetOutcome(bet, matchData) {
    try {
      // Validate inputs
      if (!bet || !matchData) {
        throw new CustomError("Invalid bet or match data", 400, "INVALID_DATA");
      }

      // Check if match is finished
      if (!this.isMatchFinished(matchData)) {
        return {
          status: "pending",
          reason: "Match not finished",
          matchState: matchData.state?.name || "Unknown",
        };
      }

      // Get market information
      const marketId =
        bet.marketId ||
        bet.betDetails?.market_id ||
        this.extractMarketIdFromOdd(bet.oddId, matchData);

      if (!marketId) {
        return {
          status: "canceled",
          reason: "Market ID not found",
          payout: bet.stake, // Refund stake
        };
      }

      // Check if market has winning calculations
      const hasWinningCalculations =
        await this.checkMarketHasWinningCalculations(marketId);

      if (hasWinningCalculations) {
        // Use the winning field from the odd
        return this.calculateOutcomeFromWinningField(bet, matchData);
      }

      // Calculate outcome based on market type
      const outcome = await this.calculateOutcomeByMarketType(
        bet,
        matchData,
        marketId
      );
      //INFO: here we will see in outcome 'won' or 'lost' and will update the bet according to that
      return {
        ...outcome,
        betId: bet._id,
        calculatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        `[BetOutcomeCalculation] Error calculating outcome for bet ${bet._id}:`,
        error
      );
      return {
        status: "error",
        reason: error.message,
        payout: 0,
      };
    }
  }

  /**
   * Calculate outcome based on market type
   */
  async calculateOutcomeByMarketType(bet, matchData, marketId) {
    const marketType = this.getMarketType(marketId);

    switch (marketType) {
      case "MATCH_RESULT":
        return this.calculateMatchResult(bet, matchData);

      case "OVER_UNDER":
        return this.calculateOverUnder(bet, matchData);

      case "BOTH_TEAMS_SCORE":
      case "BOTH_TEAMS_SCORE_1ST_HALF":
      case "BOTH_TEAMS_SCORE_2ND_HALF":
        return this.calculateBothTeamsScore(bet, matchData);

      case "CORRECT_SCORE":
        return this.calculateCorrectScore(bet, matchData);

      case "ASIAN_HANDICAP":
      case "HALF_TIME_ASIAN_HANDICAP":
        return this.calculateAsianHandicap(bet, matchData);

      case "LAST_TEAM_TO_SCORE":
      case "GOALSCORER_ANYTIME":
        return this.calculatePlayerGoals(bet, matchData);

      case "PLAYER_CARDS":
        return this.calculatePlayerCards(bet, matchData);

      case "DOUBLE_CHANCE":
        return this.calculateDoubleChance(bet, matchData);

      case "HALF_TIME_RESULT":
      case "TEAM_TO_SCORE_HALF":
        return this.calculateHalfTimeResult(bet, matchData);

      case "CORNERS":
        return this.calculateCorners(bet, matchData);

      case "CARDS_TOTAL":
        return this.calculateCardsTotal(bet, matchData);

      case "DRAW_NO_BET":
        return this.calculateDrawNoBet(bet, matchData);

      case "TEAM_TOTAL_GOALS":
      case "HOME_TEAM_EXACT_GOALS":
      case "AWAY_TEAM_EXACT_GOALS":
        return this.calculateTeamTotalGoals(bet, matchData);

      case "ODD_EVEN_GOALS":
        return this.calculateOddEvenGoals(bet, matchData);

      case "CLEAN_SHEET":
        return this.calculateCleanSheet(bet, matchData);

      case "GOAL_LINE":
      case "HALF_TIME_GOAL_LINE":
        return this.calculateOverUnder(bet, matchData); // Goal line is similar to over/under

      case "THREE_WAY_HANDICAP":
        return this.calculateAsianHandicap(bet, matchData); // Similar calculation

      case "RESULT_BOTH_TEAMS_SCORE":
        return this.calculateGenericOutcome(bet, matchData); // Complex combination bet

      case "HALF_TIME_GOALS":
        return this.calculateOverUnder(bet, matchData); // Similar to over/under for specific half

      case "HALF_TIME_FULL_TIME":
        return this.calculateHalfTimeFullTime(bet, matchData);

      case "PLAYER_SHOTS_ON_TARGET":
        return this.calculatePlayerShotsOnTarget(bet, matchData);

      default:
        return this.calculateGenericOutcome(bet, matchData);
    }
  }

  /**
   * Calculate 1X2 Match Result outcome
   */
  calculateMatchResult(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const { homeScore, awayScore } = scores;

    let actualResult;
    if (homeScore > awayScore) {
      actualResult = "HOME_WIN";
    } else if (homeScore < awayScore) {
      actualResult = "AWAY_WIN";
    } else {
      actualResult = "DRAW";
    }

    const betSelection = this.normalizeBetSelection(
      bet.betOption || bet.selection
    );
    const isWinning = this.isResultMatch(betSelection, actualResult);

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualResult: `${homeScore}-${awayScore}`,
      expectedResult: betSelection,
      reason: `Match result: ${homeScore}-${awayScore}`,
    };
  }

  /**
   * Calculate Over/Under Goals outcome
   */
  calculateOverUnder(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const totalGoals = scores.homeScore + scores.awayScore;

    // Extract threshold from bet option (e.g., "Over 2.5" -> 2.5)
    const threshold = this.extractThreshold(bet.betOption);
    const betType = this.extractOverUnderType(bet.betOption);

    let isWinning;
    if (betType === "OVER") {
      isWinning = totalGoals > threshold;
    } else if (betType === "UNDER") {
      isWinning = totalGoals < threshold;
    } else {
      // Handle exact goals
      isWinning = totalGoals === threshold;
    }

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualGoals: totalGoals,
      threshold: threshold,
      betType: betType,
      reason: `Total goals: ${totalGoals}, Threshold: ${threshold}`,
    };
  }

  /**
   * Calculate Both Teams to Score outcome
   */
  calculateBothTeamsScore(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const bothTeamsScored = scores.homeScore > 0 && scores.awayScore > 0;

    const betSelection = this.normalizeBetSelection(bet.betOption);
    const isYesBet = this.resultMappings.YES.includes(betSelection);

    const isWinning = isYesBet ? bothTeamsScored : !bothTeamsScored;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      bothTeamsScored: bothTeamsScored,
      betSelection: betSelection,
      reason: `BTTS: ${bothTeamsScored ? "Yes" : "No"}`,
    };
  }

  /**
   * Calculate Correct Score outcome
   */
  calculateCorrectScore(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const actualScore = `${scores.homeScore}-${scores.awayScore}`;

    // Normalize bet selection for comparison
    const betScore = this.normalizeScoreFormat(bet.betOption);
    const isWinning = actualScore === betScore;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualScore: actualScore,
      betScore: betScore,
      reason: `Actual score: ${actualScore}, Bet score: ${betScore}`,
    };
  }

  /**
   * Calculate Asian Handicap outcome
   */
  calculateAsianHandicap(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const handicap = this.extractHandicap(bet.betOption);
    const team = this.extractHandicapTeam(bet.betOption);

    let adjustedHomeScore = scores.homeScore;
    let adjustedAwayScore = scores.awayScore;

    // Apply handicap
    if (team === "HOME") {
      adjustedHomeScore += handicap;
    } else {
      adjustedAwayScore += handicap;
    }

    let result;
    if (adjustedHomeScore > adjustedAwayScore) {
      result = team === "HOME" ? "won" : "lost";
    } else if (adjustedHomeScore < adjustedAwayScore) {
      result = team === "AWAY" ? "won" : "lost";
    } else {
      result = "push"; // Stake refunded
    }

    const payout =
      result === "won"
        ? bet.stake * bet.odds
        : result === "push"
        ? bet.stake
        : 0;

    return {
      status: result === "push" ? "canceled" : result,
      payout: payout,
      handicap: handicap,
      team: team,
      adjustedScore: `${adjustedHomeScore}-${adjustedAwayScore}`,
      reason: `With handicap: ${adjustedHomeScore}-${adjustedAwayScore}`,
    };
  }

  /**
   * Calculate Player Goals outcome (First/Last/Anytime Goalscorer)
   */
  calculatePlayerGoals(bet, matchData) {
    // This would require detailed match events data
    // For now, we'll use the winning field from the odds if available
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Odd not found in match data",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      playerName: bet.betOption,
      reason: `Player goal bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate Player Cards outcome
   */
  calculatePlayerCards(bet, matchData) {
    // Similar to player goals, this requires detailed match events
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Odd not found in match data",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      playerName: bet.betOption,
      reason: `Player card bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate Double Chance outcome
   * NOTE: CHECKED (WORKING)
   */
  calculateDoubleChance(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const { homeScore, awayScore } = scores;

    let actualResult;
    if (homeScore > awayScore) {
      actualResult = "HOME_WIN";
    } else if (homeScore < awayScore) {
      actualResult = "AWAY_WIN";
    } else {
      actualResult = "DRAW";
    }

    // Get team names from match data
    const homeTeam = matchData.participants?.[0]?.name || "Home";
    const awayTeam = matchData.participants?.[1]?.name || "Away";

    // Double chance options: 1X (Home or Draw), X2 (Draw or Away), 12 (Home or Away)
    const betOption = bet.betOption.toLowerCase();
    let isWinning = false;

    // Check for 1X (Home or Draw) - Home team name + Draw terms
    if (
      betOption.includes("1x") ||
      (betOption.includes(homeTeam.toLowerCase()) &&
        (betOption.includes("draw") ||
          betOption.includes("tie") ||
          betOption.includes("x")))
    ) {
      isWinning = actualResult === "HOME_WIN" || actualResult === "DRAW";
    }
    // Check for X2 (Draw or Away) - Draw terms + Away team name
    else if (
      betOption.includes("x2") ||
      ((betOption.includes("draw") ||
        betOption.includes("tie") ||
        betOption.includes("x")) &&
        betOption.includes(awayTeam.toLowerCase()))
    ) {
      isWinning = actualResult === "DRAW" || actualResult === "AWAY_WIN";
    }
    // Check for 12 (Home or Away) - Both team names
    else if (
      betOption.includes("12") ||
      (betOption.includes(homeTeam.toLowerCase()) &&
        betOption.includes(awayTeam.toLowerCase()))
    ) {
      isWinning = actualResult === "HOME_WIN" || actualResult === "AWAY_WIN";
    }

    return {
      status: isWinning ? "won" : "lost",
    };
  }

  /**
   * Calculate Half Time Result outcome
   */
  calculateHalfTimeResult(bet, matchData) {
    // Extract half-time scores if available
    const halfTimeScores = this.extractHalfTimeScores(matchData);

    if (!halfTimeScores) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Half-time scores not available",
      };
    }

    let actualResult;
    if (halfTimeScores.homeScore > halfTimeScores.awayScore) {
      actualResult = "HOME_WIN";
    } else if (halfTimeScores.homeScore < halfTimeScores.awayScore) {
      actualResult = "AWAY_WIN";
    } else {
      actualResult = "DRAW";
    }

    const betSelection = this.normalizeBetSelection(bet.betOption);
    const isWinning = this.isResultMatch(betSelection, actualResult);

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualResult: `${halfTimeScores.homeScore}-${halfTimeScores.awayScore}`,
      expectedResult: betSelection,
      reason: `Half-time result: ${halfTimeScores.homeScore}-${halfTimeScores.awayScore}`,
    };
  }

  /**
   * Calculate Corners outcome
   */
  calculateCorners(bet, matchData) {
    // This would require corner statistics from match data
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Corner data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Corner bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate Total Cards outcome
   */
  calculateCardsTotal(bet, matchData) {
    // This would require card statistics from match data
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Card data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Cards bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate outcome for Draw No Bet market
   */
  calculateDrawNoBet(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const { homeScore, awayScore } = scores;

    // If it's a draw, stake is refunded
    if (homeScore === awayScore) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Draw - stake refunded",
      };
    }

    const betSelection = this.normalizeBetSelection(bet.betOption);
    let isWinning = false;

    if (homeScore > awayScore && betSelection === "HOME_WIN") {
      isWinning = true;
    } else if (awayScore > homeScore && betSelection === "AWAY_WIN") {
      isWinning = true;
    }

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualResult: `${homeScore}-${awayScore}`,
      reason: `Draw No Bet result`,
    };
  }

  /**
   * Calculate outcome for Total Goals markets (exact numbers)
   */
  calculateTotalGoals(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const totalGoals = scores.homeScore + scores.awayScore;

    const expectedGoals = parseInt(bet.betOption.match(/\d+/)?.[0] || 0);
    const isWinning = totalGoals === expectedGoals;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      actualGoals: totalGoals,
      expectedGoals: expectedGoals,
      reason: `Total goals: ${totalGoals}, Expected: ${expectedGoals}`,
    };
  }

  /**
   * Calculate outcome for Team Total Goals
   */
  calculateTeamTotalGoals(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const betOption = bet.betOption.toLowerCase();

    let teamGoals;
    if (betOption.includes("home")) {
      teamGoals = scores.homeScore;
    } else if (betOption.includes("away")) {
      teamGoals = scores.awayScore;
    } else {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Unable to determine team",
      };
    }

    const threshold = this.extractThreshold(bet.betOption);
    const betType = this.extractOverUnderType(bet.betOption);

    let isWinning;
    if (betType === "OVER") {
      isWinning = teamGoals > threshold;
    } else if (betType === "UNDER") {
      isWinning = teamGoals < threshold;
    } else {
      isWinning = teamGoals === threshold;
    }

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      teamGoals: teamGoals,
      threshold: threshold,
      reason: `Team goals: ${teamGoals}, Threshold: ${threshold}`,
    };
  }

  /**
   * Calculate outcome for First/Last Goal Scorer
   */
  calculateGoalScorer(bet, matchData) {
    // This requires detailed match events which may not be available
    // Fall back to using the winning field from the odds
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Goal scorer data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      playerName: bet.betOption,
      reason: `Goal scorer bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate outcome for Clean Sheet markets
   */
  calculateCleanSheet(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const betOption = bet.betOption.toLowerCase();

    let hasCleanSheet = false;
    if (betOption.includes("home")) {
      hasCleanSheet = scores.awayScore === 0;
    } else if (betOption.includes("away")) {
      hasCleanSheet = scores.homeScore === 0;
    } else {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Unable to determine team for clean sheet",
      };
    }

    const betSelection = this.normalizeBetSelection(bet.betOption);
    const isYesBet =
      this.resultMappings.YES.includes(betSelection) ||
      betOption.includes("yes");
    const isWinning = isYesBet ? hasCleanSheet : !hasCleanSheet;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      hasCleanSheet: hasCleanSheet,
      reason: `Clean sheet: ${hasCleanSheet ? "Yes" : "No"}`,
    };
  }

  /**
   * Calculate outcome for Win to Nil markets
   */
  calculateWinToNil(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const betOption = bet.betOption.toLowerCase();

    let winToNil = false;
    if (betOption.includes("home")) {
      winToNil = scores.homeScore > 0 && scores.awayScore === 0;
    } else if (betOption.includes("away")) {
      winToNil = scores.awayScore > 0 && scores.homeScore === 0;
    }

    return {
      status: winToNil ? "won" : "lost",
      payout: winToNil ? bet.stake * bet.odds : 0,
      actualResult: `${scores.homeScore}-${scores.awayScore}`,
      reason: `Win to nil: ${winToNil ? "Yes" : "No"}`,
    };
  }

  /**
   * Calculate outcome for Odd/Even Goals
   */
  calculateOddEvenGoals(bet, matchData) {
    const scores = this.extractMatchScores(matchData);
    const totalGoals = scores.homeScore + scores.awayScore;

    const isOdd = totalGoals % 2 === 1;
    const betOption = bet.betOption.toLowerCase();

    let isWinning;
    if (betOption.includes("odd")) {
      isWinning = isOdd;
    } else if (betOption.includes("even")) {
      isWinning = !isOdd;
    } else {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Unable to determine odd/even selection",
      };
    }

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      totalGoals: totalGoals,
      isOdd: isOdd,
      reason: `Total goals: ${totalGoals} (${isOdd ? "Odd" : "Even"})`,
    };
  }

  /**
   * Calculate outcome for Highest Scoring Half
   */
  calculateHighestScoringHalf(bet, matchData) {
    const fullTimeScores = this.extractMatchScores(matchData);
    const halfTimeScores = this.extractHalfTimeScores(matchData);

    if (!halfTimeScores) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Half-time scores not available",
      };
    }

    const firstHalfGoals = halfTimeScores.homeScore + halfTimeScores.awayScore;
    const secondHalfGoals =
      fullTimeScores.homeScore -
      halfTimeScores.homeScore +
      (fullTimeScores.awayScore - halfTimeScores.awayScore);

    let highestScoringHalf;
    if (firstHalfGoals > secondHalfGoals) {
      highestScoringHalf = "1st Half";
    } else if (secondHalfGoals > firstHalfGoals) {
      highestScoringHalf = "2nd Half";
    } else {
      highestScoringHalf = "Equal";
    }

    const betOption = bet.betOption.toLowerCase();
    let isWinning = false;

    if (betOption.includes("1st") && highestScoringHalf === "1st Half") {
      isWinning = true;
    } else if (betOption.includes("2nd") && highestScoringHalf === "2nd Half") {
      isWinning = true;
    } else if (betOption.includes("equal") && highestScoringHalf === "Equal") {
      isWinning = true;
    }

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      firstHalfGoals: firstHalfGoals,
      secondHalfGoals: secondHalfGoals,
      highestScoringHalf: highestScoringHalf,
      reason: `Highest scoring half: ${highestScoringHalf}`,
    };
  }

  /**
   * Calculate outcome for Half Time / Full Time Double Result
   */
  /**
   * Calculate outcome for Penalty markets
   */
  calculatePenalty(bet, matchData) {
    // This requires detailed match events for penalty information
    // Fall back to using the winning field from the odds
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Penalty data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Penalty bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate outcome for booking points/cards markets with handicap
   */
  calculateCardsHandicap(bet, matchData) {
    // This would require detailed card statistics
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Cards handicap data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Cards handicap bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate outcome for corners handicap markets
   */
  calculateCornersHandicap(bet, matchData) {
    // This would require detailed corner statistics
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Corners handicap data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Corners handicap bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }

  /**
   * Calculate outcome for minute-based markets (goal timing, etc.)
   */
  calculateMinuteMarkets(bet, matchData) {
    // This requires detailed match events with timing
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Minute market data not available",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Minute market bet: ${isWinning ? "Won" : "Lost"}`,
    };
  }
  /**
   * Calculate outcome for Player Shots On Target market
   * Uses betDetails.name for player name and betDetails.label for shots threshold
   */
  calculatePlayerShotsOnTarget(bet, matchData) {
    // Extract player name from betDetails
    const playerName = bet.betDetails?.name;
    const shotsThreshold = parseFloat(bet.betDetails?.label || "0.0");

    if (!playerName) {
      return null;
    }

    // Check if lineups data is available
    if (!matchData.lineups || !Array.isArray(matchData.lineups)) {
      return null;
    }

    // Find the player in lineups
    const player = matchData.lineups.find(
      (lineup) => lineup.player_name === playerName
    );

    if (!player) {
      return null;
    }

    // Find shots on target statistic using typeIdMapping
    const shotsOnTargetStat = player.details?.find(
      (detail) => detail.type_id === this.typeIdMapping.shotsOnTarget
    );

    if (!shotsOnTargetStat) {
      return null;
    }

    const actualShotsOnTarget = shotsOnTargetStat.data?.value || 0;

    // Compare actual shots with threshold (Over/Under logic)
    const isWinning = actualShotsOnTarget > shotsThreshold;

    return {
      status: isWinning ? "won" : "lost",
    };
  }

  /**
   * Calculate outcome for Half Time/Full Time market
   * Handles bets like "Tijuana - Draw" (Half Time result - Full Time result)
   */
  calculateHalfTimeFullTime(bet, matchData) {
    // Extract both half-time and full-time scores
    const halfTimeScores = this.extractHalfTimeScores(matchData);
    const fullTimeScores = this.extractMatchScores(matchData);

    if (!halfTimeScores || !fullTimeScores) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Score data not available",
      };
    }

    // Get team names from match data (similar to calculateDoubleChance)
    const homeTeam = matchData.participants?.[0]?.name || "Home";
    const awayTeam = matchData.participants?.[1]?.name || "Away";

    // Determine half-time result
    let halfTimeResult;
    if (halfTimeScores.homeScore > halfTimeScores.awayScore) {
      halfTimeResult = homeTeam; // Home team wins half time
    } else if (halfTimeScores.homeScore < halfTimeScores.awayScore) {
      halfTimeResult = awayTeam; // Away team wins half time
    } else {
      halfTimeResult = "Draw"; // Half time draw
    }

    // Determine full-time result
    let fullTimeResult;
    if (fullTimeScores.homeScore > fullTimeScores.awayScore) {
      fullTimeResult = homeTeam; // Home team wins full time
    } else if (fullTimeScores.homeScore < fullTimeScores.awayScore) {
      fullTimeResult = awayTeam; // Away team wins full time
    } else {
      fullTimeResult = "Draw"; // Full time draw
    }

    // Parse bet selection (e.g., "Tijuana - Draw")
    const betOption = bet.betOption || bet.selection || "";
    const betParts = betOption.split(" - ");

    if (betParts.length !== 2) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Invalid bet format for Half Time/Full Time",
      };
    }

    const expectedHalfTime = betParts[0].trim();
    const expectedFullTime = betParts[1].trim();

    // Check if the bet selection matches the actual results
    let halfTimeMatch = false;
    let fullTimeMatch = false;

    // Check half-time match (similar logic to calculateDoubleChance)
    if (expectedHalfTime.toLowerCase() === "draw") {
      halfTimeMatch = halfTimeResult === "Draw";
    } else if (expectedHalfTime.toLowerCase() === homeTeam.toLowerCase()) {
      halfTimeMatch = halfTimeResult === homeTeam;
    } else if (expectedHalfTime.toLowerCase() === awayTeam.toLowerCase()) {
      halfTimeMatch = halfTimeResult === awayTeam;
    }

    // Check full-time match
    if (expectedFullTime.toLowerCase() === "draw") {
      fullTimeMatch = fullTimeResult === "Draw";
    } else if (expectedFullTime.toLowerCase() === homeTeam.toLowerCase()) {
      fullTimeMatch = fullTimeResult === homeTeam;
    } else if (expectedFullTime.toLowerCase() === awayTeam.toLowerCase()) {
      fullTimeMatch = fullTimeResult === awayTeam;
    }

    const isWinning = halfTimeMatch && fullTimeMatch;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Half Time/Full Time: HT: ${halfTimeResult}, FT: ${fullTimeResult}, Expected: ${expectedHalfTime} - ${expectedFullTime}`,
      actualResult: `${halfTimeResult} - ${fullTimeResult}`,
      expectedResult: betOption,
    };
  }

  /**
   * Enhanced market type detection with more markets
   */
  getMarketType(marketId) {
    const numericMarketId = parseInt(marketId);

    // Extended market mappings based on common betting markets
    const extendedMarketTypes = {
      MATCH_RESULT: [1], // Fulltime Result
      DOUBLE_CHANCE: [2], // Double Chance
      OVER_UNDER: [4, 5], // Match Goals, Alternative Match Goals
      ASIAN_HANDICAP: [6], // Asian Handicap
      GOAL_LINE: [7], // Goal Line
      CORRECT_SCORE: [8], // Final Score
      THREE_WAY_HANDICAP: [9], // 3-Way Handicap
      DRAW_NO_BET: [10], // Draw No Bet
      LAST_TEAM_TO_SCORE: [11], // Last Team To Score
      ODD_EVEN_GOALS: [12], // Goals Odd/Even
      RESULT_BOTH_TEAMS_SCORE: [13], // Result / Both Teams To Score
      BOTH_TEAMS_SCORE: [14], // Both Teams To Score
      BOTH_TEAMS_SCORE_1ST_HALF: [15], // Both Teams to Score in 1st Half
      BOTH_TEAMS_SCORE_2ND_HALF: [16], // Both Teams to Score in 2nd Half
      CLEAN_SHEET: [17], // Team Clean Sheet
      HOME_TEAM_EXACT_GOALS: [18], // Home Team Exact Goals
      AWAY_TEAM_EXACT_GOALS: [19], // Away Team Exact Goals
      TEAM_TOTAL_GOALS: [20, 21], // Home Team Goals, Away Team Goals
      HALF_TIME_RESULT: [22, 23], // To Win 1st Half, To Win 2nd Half
      TEAM_TO_SCORE_HALF: [24, 25], // Team to Score in 1st/2nd Half
      HALF_TIME_ASIAN_HANDICAP: [26], // 1st Half Asian Handicap
      HALF_TIME_GOAL_LINE: [27], // 1st Half Goal Line
      HALF_TIME_GOALS: [28], // 1st Half Goals
      HALF_TIME_FULL_TIME: [29], // Half Time/Full Time
      PLAYER_SHOTS_ON_TARGET: [267], // Player Total Shots On Target
      ...this.marketTypes,
    };

    for (const [type, ids] of Object.entries(extendedMarketTypes)) {
      if (ids.includes(numericMarketId)) {
        return type;
      }
    }

    return "UNKNOWN";
  }

  /**
   * Calculate outcome using the winning field from odds
   */
  calculateOutcomeFromWinningField(bet, matchData) {
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Odd not found in match data",
      };
    }

    const isWinning = selectedOdd.winning === true;

    return {
      status: isWinning ? "won" : "lost",
      payout: isWinning ? bet.stake * bet.odds : 0,
      reason: `Winning field calculation: ${isWinning ? "Won" : "Lost"}`,
      winningField: selectedOdd.winning,
    };
  }

  /**
   * Check if market has winning calculations based on markets.json
   */
  async checkMarketHasWinningCalculations(marketId) {
    try {
      // Load markets data from constants file
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const marketsPath = path.join(__dirname, "../constants/markets.json");

      const marketsData = JSON.parse(fs.readFileSync(marketsPath, "utf8"));
      const market = marketsData.markets[marketId.toString()];

      return market ? market.has_winning_calculations : false;
    } catch (error) {
      console.error("Error checking market winning calculations:", error);
      return false;
    }
  }

  /**
   * Extract match scores from match data
   */
  extractMatchScores(matchData) {
    if (matchData.scores && Array.isArray(matchData.scores)) {
      // Calculate total goals by adding 1ST_HALF + 2ND_HALF_ONLY goals for each team
      let homeScore = 0;
      let awayScore = 0;

      // Get 1ST_HALF goals
      const firstHalfScores = matchData.scores.filter(
        (score) => score.description === "1ST_HALF"
      );
      firstHalfScores.forEach((score) => {
        if (score.score && score.score.goals !== undefined) {
          if (score.score.participant === "home") {
            homeScore += score.score.goals;
          } else if (score.score.participant === "away") {
            awayScore += score.score.goals;
          }
        }
      });

      // Add 2ND_HALF_ONLY goals
      const secondHalfOnlyScores = matchData.scores.filter(
        (score) => score.description === "2ND_HALF_ONLY"
      );
      secondHalfOnlyScores.forEach((score) => {
        if (score.score && score.score.goals !== undefined) {
          if (score.score.participant === "home") {
            homeScore += score.score.goals;
          } else if (score.score.participant === "away") {
            awayScore += score.score.goals;
          }
        }
      });

      return { homeScore, awayScore };
    }

    return { homeScore: 0, awayScore: 0 };
  }

  /**
   * Extract half-time scores from match data
   */
  extractHalfTimeScores(matchData) {
    if (matchData.scores && Array.isArray(matchData.scores)) {
      // Extract 1ST_HALF scores - this is the half-time result
      const firstHalfScores = matchData.scores.filter(
        (score) => score.description === "1ST_HALF"
      );

      if (firstHalfScores.length > 0) {
        let homeScore = 0;
        let awayScore = 0;

        firstHalfScores.forEach((score) => {
          if (score.score && score.score.goals !== undefined) {
            if (score.score.participant === "home") {
              homeScore = score.score.goals;
            } else if (score.score.participant === "away") {
              awayScore = score.score.goals;
            }
          }
        });

        return { homeScore, awayScore };
      }

      // Fallback: try to find legacy half time scores
      const halfTimeScore = matchData.scores.find(
        (score) =>
          score.description === "HT" || score.description === "HALFTIME"
      );

      if (halfTimeScore && halfTimeScore.score?.goals?.home !== undefined) {
        return {
          homeScore: halfTimeScore.score.goals.home || 0,
          awayScore: halfTimeScore.score.goals.away || 0,
        };
      }
    }

    return null;
  }

  /**
   * Extract market ID from odd ID using match data
   */
  extractMarketIdFromOdd(oddId, matchData) {
    if (matchData.odds && Array.isArray(matchData.odds)) {
      const odd = matchData.odds.find((o) => o.id == oddId);
      return odd ? odd.market_id : null;
    }
    return null;
  }

  /**
   * Find the selected odd in match data
   */
  findSelectedOdd(bet, matchData) {
    // Handle standard matchData.odds format
    if (matchData.odds && Array.isArray(matchData.odds)) {
      return matchData.odds.find((odd) => odd.id == bet.oddId);
    }

    // Handle response.json data format where odds are in data array
    if (matchData.data && Array.isArray(matchData.data)) {
      return matchData.data.find((odd) => odd.id == bet.oddId);
    }

    // Handle direct array format (if matchData itself is an array of odds)
    if (Array.isArray(matchData)) {
      return matchData.find((odd) => odd.id == bet.oddId);
    }

    return null;
  }

  /**
   * Normalize bet selection for comparison
   */
  normalizeBetSelection(selection) {
    if (!selection) return "";
    const normalized = selection.toString().toLowerCase().trim();

    if (this.resultMappings.HOME_WIN.includes(normalized)) return "HOME_WIN";
    if (this.resultMappings.DRAW.includes(normalized)) return "DRAW";
    if (this.resultMappings.AWAY_WIN.includes(normalized)) return "AWAY_WIN";
    if (this.resultMappings.YES.includes(normalized)) return "YES";
    if (this.resultMappings.NO.includes(normalized)) return "NO";
    if (this.resultMappings.OVER.includes(normalized)) return "OVER";
    if (this.resultMappings.UNDER.includes(normalized)) return "UNDER";

    return normalized;
  }

  /**
   * Check if result matches bet selection
   */
  isResultMatch(betSelection, actualResult) {
    return betSelection === actualResult;
  }

  /**
   * Enhanced threshold extraction for complex bet options
   */
  extractThreshold(betOption) {
    // Handle various threshold formats
    const thresholdPatterns = [
      /(\d+\.?\d*)\+/, // e.g., "2.5+"
      /over\s*(\d+\.?\d*)/i, // e.g., "Over 2.5"
      /under\s*(\d+\.?\d*)/i, // e.g., "Under 2.5"
      /(\d+\.?\d*)\s*goals?/i, // e.g., "2.5 goals"
      /(\d+\.?\d*)/, // Generic number
    ];

    for (const pattern of thresholdPatterns) {
      const match = betOption.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return 2.5; // Default threshold
  }

  /**
   * Enhanced handicap extraction
   */
  extractHandicap(betOption) {
    const handicapPatterns = [
      /([-+]?\d+\.?\d*)\s*ah/i, // Asian Handicap format
      /([-+]?\d+\.?\d*)\s*handicap/i,
      /\(([+-]?\d+\.?\d*)\)/, // Handicap in parentheses
      /([-+]?\d+\.?\d*)/, // Generic signed number
    ];

    for (const pattern of handicapPatterns) {
      const match = betOption.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return 0;
  }

  /**
   * Enhanced team extraction from bet options
   */
  extractTeam(betOption) {
    const normalized = betOption.toLowerCase();

    if (
      normalized.includes("home") ||
      (normalized.includes("1") && !normalized.includes("12"))
    ) {
      return "HOME";
    }
    if (
      normalized.includes("away") ||
      (normalized.includes("2") && !normalized.includes("12"))
    ) {
      return "AWAY";
    }
    if (normalized.includes("both") || normalized.includes("either")) {
      return "BOTH";
    }

    return "UNKNOWN";
  }

  /**
   * Enhanced validation for complex bet structures
   */
  validateComplexBet(bet, matchData) {
    // Validate required fields based on market type
    const marketType = this.getMarketType(bet.marketId);

    const validationRules = {
      ASIAN_HANDICAP: ["handicap"],
      OVER_UNDER: ["threshold"],
      PLAYER_GOALS: ["playerName"],
      CORRECT_SCORE: ["scoreFormat"],
    };

    const requiredFields = validationRules[marketType];
    if (requiredFields) {
      for (const field of requiredFields) {
        if (!this.validateBetField(bet, field)) {
          return {
            isValid: false,
            reason: `Missing or invalid ${field} for ${marketType} market`,
          };
        }
      }
    }

    return { isValid: true };
  }

  /**
   * Validate specific bet field
   */
  validateBetField(bet, fieldType) {
    switch (fieldType) {
      case "handicap":
        return bet.betOption && /[-+]?\d+\.?\d*/.test(bet.betOption);
      case "threshold":
        return bet.betOption && /\d+\.?\d*/.test(bet.betOption);
      case "playerName":
        return bet.betOption && bet.betOption.length > 0;
      case "scoreFormat":
        return bet.betOption && /\d+[-:]\d+/.test(bet.betOption);
      default:
        return true;
    }
  }

  /**
   * Batch calculate outcomes for multiple bets
   */
  async calculateBatchOutcomes(bets, matchDataMap) {
    const results = [];

    for (const bet of bets) {
      try {
        const matchData = matchDataMap[bet.matchId];
        if (matchData) {
          const outcome = await this.calculateBetOutcome(bet, matchData);
          results.push(outcome);
        } else {
          results.push({
            betId: bet._id,
            status: "error",
            reason: "Match data not available",
            payout: 0,
          });
        }
      } catch (error) {
        results.push({
          betId: bet._id,
          status: "error",
          reason: error.message,
          payout: 0,
        });
      }
    }

    return results;
  }

  /**
   * Calculate outcome for unknown or generic market types using winning field
   */
  calculateGenericOutcome(bet, matchData) {
    // For unknown market types, try to use the winning field from odds
    const selectedOdd = this.findSelectedOdd(bet, matchData);

    if (!selectedOdd) {
      return {
        status: "canceled",
        payout: bet.stake,
        reason: "Odd not found in match data",
      };
    }

    // If winning field is available, use it
    if (selectedOdd.hasOwnProperty("winning")) {
      const isWinning = selectedOdd.winning === true;
      return {
        status: isWinning ? "won" : "lost",
        payout: isWinning ? bet.stake * bet.odds : 0,
        reason: `Generic calculation using winning field: ${
          isWinning ? "Won" : "Lost"
        }`,
        winningField: selectedOdd.winning,
      };
    }

    // If no winning field, return canceled with refund
    return {
      status: "canceled",
      payout: bet.stake,
      reason: "Unable to calculate outcome for this market type",
    };
  }

  /**
   * Check if match is finished
   */
  isMatchFinished(matchData) {
    if (!matchData || !matchData.state) {
      return false;
    }

    const matchState = matchData.state.name?.toLowerCase();
    const finishedStates = [
      "finished",
      "ended",
      "ft",
      "fulltime",
      "completed",
      "closed",
    ];

    return finishedStates.includes(matchState);
  }

  /**
   * Helper methods for extracting bet option components
   */
  extractOverUnderType(betOption) {
    const normalized = betOption.toLowerCase();
    if (normalized.includes("over")) return "OVER";
    if (normalized.includes("under")) return "UNDER";
    return "EXACT";
  }

  extractHandicapTeam(betOption) {
    const normalized = betOption.toLowerCase();
    if (normalized.includes("home") || normalized.includes("1")) return "HOME";
    if (normalized.includes("away") || normalized.includes("2")) return "AWAY";
    return "UNKNOWN";
  }

  normalizeScoreFormat(betOption) {
    // Convert various score formats to "X-Y" format
    return betOption.replace(/[^\d-]/g, "").replace(/:/g, "-");
  }
}

export default BetOutcomeCalculationService;

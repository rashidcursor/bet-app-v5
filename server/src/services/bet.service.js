import Bet from "../models/Bet.js";
import User from "../models/User.js";
import MatchOdds from "../models/matchOdds.model.js";
import SportsMonksService from "./sportsMonks.service.js";
import FixtureOptimizationService from "./fixture.service.js";
import { CustomError } from "../utils/customErrors.js";
import agenda from "../config/agenda.js";
import NodeCache from "node-cache";

class BetService {
  constructor() {
    this.finalMatchResultCache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // 24 hours TTL
  }

  async placeBet(userId, matchId, oddId, stake) {
    let matchData;
    const cacheKey = `match_${matchId}`;
    const cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    // Step 0: Search all cached matches using the utility method
    const allCachedMatches = FixtureOptimizationService.getAllCachedMatches();
    matchData = allCachedMatches.find(
      (fixture) => fixture.id == matchId || fixture.id === parseInt(matchId)
    );
    if (matchData) {
      console.log(
        `Using match data from all-cached-matches utility for match ${matchId}`
      );
    } else {
      // Step 1: Check in-memory cache first
      matchData = FixtureOptimizationService.fixtureCache.get(cacheKey);
      if (
        matchData &&
        matchData.updatedAt &&
        matchData.updatedAt > new Date(Date.now() - cacheTTL)
      ) {
        console.log(`Using in-memory cached match data for match ${matchId}`);
      } else {
        // Step 2: Check MongoDB cache
        const cachedOdds = await MatchOdds.findOne({ matchId });
        if (
          cachedOdds &&
          cachedOdds.updatedAt > new Date(Date.now() - cacheTTL)
        ) {
          console.log(`Using MongoDB cached odds for match ${matchId}`);
          matchData = {
            id: matchId,
            odds: cachedOdds.odds.map((odd) => ({
              id: odd.oddId,
              marketId: odd.marketId,
              name: odd.name,
              value: odd.value,
            })),
            starting_at: cachedOdds.createdAt,
            participants: cachedOdds.participants || [], // Ensure participants are included if cached
            state: cachedOdds.state || {}, // Include state if available
          };
        } else {
          // Step 3: Fetch from SportsMonks API
          console.log(
            `Fetching match data for match ${matchId} from SportsMonks API`
          );
          const apiParams = {
            filters: `fixtureIds:${matchId}`,
            include: "odds;participants;state",
            per_page: 1,
          };
          const matches = await FixtureOptimizationService.getOptimizedFixtures(
            apiParams
          );
          if (!matches || matches.length === 0) {
            throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
          }
          matchData = matches.find(
            (match) => match.id == matchId || match.id === parseInt(matchId)
          );
          if (!matchData) {
            throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
          }
          // Update MongoDB cache
          await MatchOdds.findOneAndUpdate(
            { matchId: matchData.id },
            {
              matchId: matchData.id,
              odds: matchData.odds.map((odd) => ({
                oddId: odd.id,
                marketId: odd.market_id,
                name: odd.name,
                value: parseFloat(odd.value),
              })),
              participants: matchData.participants || [], // Store participants
              state: matchData.state || {}, // Store state
              updatedAt: new Date(),
            },
            { upsert: true }
          );
          // Update in-memory cache
          matchData.updatedAt = new Date(); // Add timestamp for cache freshness
          FixtureOptimizationService.fixtureCache.set(
            cacheKey,
            matchData,
            3600
          );
        }
      }
    }

    const odds = matchData.odds?.find((odd) => odd.id === oddId);
    if (!odds) {
      throw new CustomError("Invalid odd ID", 400, "INVALID_ODD_ID");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError("User not found", 404, "USER_NOT_FOUND");
    }
    if (user.balance < stake) {
      throw new CustomError(
        "Insufficient balance",
        400,
        "INSUFFICIENT_BALANCE"
      );
    }

    user.balance -= stake;
    await user.save();

    let teams =
      matchData.participants && matchData.participants.length >= 2
        ? `${matchData.participants[0].name} vs ${matchData.participants[1].name}`
        : "";
    const selection = `${odds.name} - ${odds.market_description}`;
    const matchDate = new Date(matchData.starting_at);
    const estimatedMatchEnd = new Date(matchDate.getTime() + 2 * 60 * 60 * 1000 + 5 * 60 * 1000); // Add 2 hours and 5 minutes
    const bet = new Bet({
      userId,
      matchId,
      oddId,
      betOption: odds.name,
      odds: parseFloat(odds.value),
      stake,
      payout: 0,
      matchDate,
      estimatedMatchEnd,
      teams,
      selection,
    });
    await bet.save();

    //INFO: Always schedule outcome check - don't process immediately
    const now = new Date();
    const nowUTC = new Date(now.toISOString());
    const estimatedMatchEndUTC = new Date(estimatedMatchEnd.toISOString());
    
    console.log(`[placeBet] Match start time (UTC): ${matchDate.toISOString()}`);
    console.log(`[placeBet] Estimated match end (UTC): ${estimatedMatchEndUTC.toISOString()}`);
    console.log(`[placeBet] Current time (UTC): ${nowUTC.toISOString()}`);
    
    // Always schedule the check instead of processing immediately
    console.log(`[placeBet] Scheduling bet outcome check`);
    this.scheduleBetOutcomeCheck(bet._id, estimatedMatchEnd, matchId);

    return {
      betId: bet._id,
      matchId,
      oddId,
      betOption: bet.betOption,
      odds: bet.odds,
      stake: bet.stake,
      status: bet.status,
      createdAt: bet.createdAt,
      estimatedMatchEnd,
    };
  }

  scheduleBetOutcomeCheck(betId, estimatedMatchEnd, matchId) {
    // Schedule with Agenda for 120 minutes after match starts
    const runAt = new Date(estimatedMatchEnd.getTime()); // 120 minutes after estimated match end
    const runAtUTC = new Date(runAt.toISOString());
    const nowUTC = new Date().toISOString();
    
    console.log(
      `[scheduleBetOutcomeCheck] Now (UTC): ${nowUTC}, runAt (UTC): ${runAtUTC.toISOString()} (should be 120 minutes after match end)`
    );
    agenda.schedule(runAtUTC, "checkBetOutcome", { betId, matchId });
    console.log(`Scheduled Agenda job for bet ${betId} at ${runAtUTC.toISOString()}`);
  }

  async fetchMatchResult(matchId) {
    const response = await SportsMonksService.client.get(
      `/football/fixtures/${matchId}`,
      {
        params: { include: "odds;state;scores;participants" },
      }
    );
    const match = response.data.data;
    if (!match) {
      throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
    }
    return match;
  }

  async checkBetOutcome(betId, match = null) {
    console.log(`[checkBetOutcome] Called for betId: ${betId}`);
    const bet = await Bet.findById(betId).populate("userId");
    if (!bet.oddId) {
      console.log(bet);
      return null;
    }
    if (!bet) {
      console.error(`[checkBetOutcome] Bet not found: ${betId}`);
      throw new CustomError("Bet not found", 404, "BET_NOT_FOUND");
    }

    let matchData = match;
    // Check the final match result cache first (node-cache)
    if (!matchData) {
      if (this.finalMatchResultCache.has(bet.matchId)) {
        matchData = this.finalMatchResultCache.get(bet.matchId);
        console.log(
          `[checkBetOutcome] Used cached final result for matchId: ${bet.matchId}`
        );
      } else {
        // Always fetch the latest fixture with odds from the API
        try {
          console.log(
            `[checkBetOutcome] Fetching latest fixture for matchId: ${bet.matchId}`
          );
          matchData = await this.fetchMatchResult(bet.matchId);
          // Only cache if match is finished
          if (matchData.state?.id === 5) {
            this.finalMatchResultCache.set(bet.matchId, matchData);
            console.log(
              `[checkBetOutcome] Cached final result for matchId: ${bet.matchId}`
            );
          }
        } catch (err) {
          console.error(`[checkBetOutcome] Error fetching match:`, err);
          throw err;
        }
      }
    }

    console.log(`[checkBetOutcome] Match state:`, matchData.state);
    //INFO: COMMENTED FOR NOW FOR TESTING PURPOSES
    if (!matchData.state || matchData.state.id !== 5) {
      console.log(
        `[checkBetOutcome] Match not finished for betId: ${betId}, state:`,
        matchData.state
      );
      // Reschedule for 10 minutes later
      const runAt = new Date(Date.now() + 10 * 60 * 1000);
      agenda.schedule(runAt, "checkBetOutcome", {
        betId,
        matchId: bet.matchId,
      });
      return {
        betId,
        status: bet.status,
        message: "Match not yet finished, rescheduled",
      };
    }

    // Always search for the oddId in the fresh odds from the API

    const selectedOdd = matchData.odds?.find((odd) => odd.id == bet.oddId);

    console.log(`[checkBetOutcome] selectedOdd:`, selectedOdd);
    if (!selectedOdd) {
      console.error(
        `[checkBetOutcome] Odd ID not found in match data for betId: ${bet.oddId}`
      );
      throw new CustomError(
        "Odd ID not found in match data",
        404,
        "ODD_NOT_FOUND"
      );
    }

    if ("winning" in selectedOdd) {
      bet.status = selectedOdd.winning ? "won" : "lost";
      bet.payout = selectedOdd.winning ? bet.stake * bet.odds : 0;
      console.log(
        `[checkBetOutcome] Set status (winning in selectedOdd): ${bet.status}`
      );
    } else {
      const homeGoals =
        matchData.scores.find(
          (s) => s.participant === "home" && s.description === "CURRENT"
        )?.score.goals || 0;
      const awayGoals =
        matchData.scores.find(
          (s) => s.participant === "away" && s.description === "CURRENT"
        )?.score.goals || 0;
      const homeTeam = matchData.participants.find(
        (p) => p.meta.location === "home"
      )?.name;
      const awayTeam = matchData.participants.find(
        (p) => p.meta.location === "away"
      )?.name;

      if (selectedOdd.market_id === "1") {
        if (homeGoals > awayGoals && bet.betOption === homeTeam) {
          bet.status = "won";
          bet.payout = bet.stake * bet.odds;
        } else if (awayGoals > homeGoals && bet.betOption === awayTeam) {
          bet.status = "won";
          bet.payout = bet.stake * bet.odds;
        } else if (homeGoals === awayGoals && bet.betOption === "Draw") {
          bet.status = "won";
          bet.payout = bet.stake * bet.odds;
        } else {
          bet.status = "lost";
          bet.payout = 0;
        }
        console.log(
          `[checkBetOutcome] Set status (market_id 1): ${bet.status}`
        );
      } else if (selectedOdd.market_id === "8") {
        const totalGoals = homeGoals + awayGoals;
        const threshold = parseFloat(bet.betOption.split(" ")[1]);
        if (bet.betOption.includes("Over") && totalGoals > threshold) {
          bet.status = "won";
          bet.payout = bet.stake * bet.odds;
        } else if (bet.betOption.includes("Under") && totalGoals < threshold) {
          bet.status = "won";
          bet.payout = bet.stake * bet.odds;
        } else {
          bet.status = "lost";
          bet.payout = 0;
        }
        console.log(
          `[checkBetOutcome] Set status (market_id 8): ${bet.status}`
        );
      } else {
        bet.status = "canceled";
        bet.payout = 0;
        console.log(`[checkBetOutcome] Set status (other market): canceled`);
      }
    }

    if (bet.status === "won") {
      const user = bet.userId;
      user.balance += bet.payout;
      await user.save();
      console.log(
        `[checkBetOutcome] User ${user._id} balance updated for win: +${bet.payout}`
      );
    } else if (bet.status === "canceled") {
      const user = bet.userId;
      user.balance += bet.stake;
      await user.save();
      console.log(
        `[checkBetOutcome] User ${user._id} balance refunded for canceled bet: +${bet.stake}`
      );
    }

    console.log(`[checkBetOutcome] Saving bet with status: ${bet.status}`);
    await bet.save();
    console.log(
      `[checkBetOutcome] Bet saved. betId: ${bet._id}, status: ${bet.status}`
    );
    return {
      betId: bet._id,
      status: bet.status,
      payout: bet.payout,
    };
  }

  async checkPendingBets() {
    const now = new Date();
    const pendingBets = await Bet.find({
      status: "pending",
      estimatedMatchEnd: { $lte: now },
    });

    if (pendingBets.length === 0) return [];

    // Group bets by matchId
    const betsByMatch = {};
    for (const bet of pendingBets) {
      if (!betsByMatch[bet.matchId]) betsByMatch[bet.matchId] = [];
      betsByMatch[bet.matchId].push(bet);
    }

    const matchIds = Object.keys(betsByMatch);
    const results = [];

    // Fetch match results in bulk
    if (matchIds.length > 0) {
      const apiParams = {
        filters: `fixtureIds:${matchIds.join(",")}`,
        include: "odds;state;scores;participants",
        per_page: matchIds.length,
      };
      const response = await FixtureOptimizationService.getOptimizedFixtures(
        apiParams
      );
      const matches = response.data || [];

      // Cache finished matches
      for (const match of matches) {
        if (match.state?.id === 5) {
          const cacheKey = `match_${match.id}`;
          FixtureOptimizationService.fixtureCache.set(
            cacheKey,
            match,
            24 * 3600
          ); // Cache for 24 hours
        }
      }

      // Process bets for each match
      for (const matchId of matchIds) {
        const match = matches.find(
          (m) => m.id == matchId || m.id === parseInt(matchId)
        );
        if (match) {
          for (const bet of betsByMatch[matchId]) {
            const result = await this.checkBetOutcome(bet._id, match);
            results.push(result);
          }
        } else {
          // If match data not found, keep bets pending and log error
          console.error(`Match ${matchId} not found in API response`);
          for (const bet of betsByMatch[matchId]) {
            results.push({
              betId: bet._id,
              status: bet.status,
              message: "Match data not found",
            });
          }
        }
      }
    }

    return results;
  }

  async getUserBets(userId) {
    if (!userId) {
      throw new CustomError("User ID is required", 400, "USER_ID_REQUIRED");
    }
    const bets = await Bet.find({ userId }).sort({ createdAt: -1 });
    return bets;
  }

  async getAllBets() {
    const bets = await Bet.find({}).populate("userId");
    const grouped = {};
    for (const bet of bets) {
      const user = bet.userId;
      let userName = "Unknown User";
      if (user && (user.firstName || user.lastName)) {
        userName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
      } else if (user && user.email) {
        userName = user.email;
      }
      if (!grouped[userName]) grouped[userName] = [];
      const betObj = bet.toObject();
      delete betObj.userId;
      grouped[userName].push(betObj);
    }
    return grouped;
  }

  // In BetService.js
  async recoverMissedBets() {
    const now = new Date();
    const overdueBets = await Bet.find({
      status: "pending",
      estimatedMatchEnd: { $lte: now },
    });

    if (overdueBets.length === 0) {
      console.log("No overdue bets to process on startup");
      return [];
    }

    console.log(`Processing ${overdueBets.length} overdue bets on startup`);

    // Group bets by matchId to minimize API calls
    const betsByMatch = {};
    for (const bet of overdueBets) {
      if (!betsByMatch[bet.matchId]) betsByMatch[bet.matchId] = [];
      betsByMatch[bet.matchId].push(bet);
    }

    const matchIds = Object.keys(betsByMatch);
    const results = [];

    if (matchIds.length > 0) {
      const apiParams = {
        filters: `fixtureIds:${matchIds.join(",")}`,
        include: "odds;state;scores;participants",
        per_page: matchIds.length,
      };
      let matches = [];
      try {
        const response = await FixtureOptimizationService.getOptimizedFixtures(
          apiParams
        );
        matches = response.data || [];
      } catch (error) {
        console.error("Error fetching match data for overdue bets:", error);
      }

      for (const match of matches) {
        // Only process bets for matches that are actually finished (state.id === 5)
        if (match.state?.id === 5) {
          FixtureOptimizationService.fixtureCache.set(
            `match_${match.id}`,
            match,
            24 * 3600
          );
          for (const bet of betsByMatch[match.id]) {
            try {
              const result = await this.checkBetOutcome(bet._id, match);
              results.push(result);
            } catch (error) {
              console.error(`Error processing overdue bet ${bet._id}:`, error);
              results.push({
                betId: bet._id,
                status: bet.status,
                message: "Error processing bet",
              });
            }
          }
        } else {
          // For matches that are not finished, reschedule the bets for later
          console.log(`Match ${match.id} is not finished (state: ${match.state?.name}), rescheduling bets`);
          for (const bet of betsByMatch[match.id]) {
            // Reschedule for 30 minutes later
            const newScheduleTime = new Date(now.getTime() + 30 * 60 * 1000);
            agenda.schedule(newScheduleTime, "checkBetOutcome", {
              betId: bet._id,
              matchId: bet.matchId,
            });
            results.push({
              betId: bet._id,
              status: bet.status,
              message: "Match not finished, rescheduled",
            });
          }
        }
      }

      // Handle matches not found in API response
      for (const matchId of matchIds) {
        if (
          !matches.find((m) => m.id == matchId || m.id === parseInt(matchId))
        ) {
          for (const bet of betsByMatch[matchId]) {
            // Reschedule for 30 minutes later
            const newScheduleTime = new Date(now.getTime() + 30 * 60 * 1000);
            agenda.schedule(newScheduleTime, "checkBetOutcome", {
              betId: bet._id,
              matchId,
            });
            results.push({
              betId: bet._id,
              status: bet.status,
              message: "Match data not found, rescheduled",
            });
          }
        }
      }
    }

    return results;
  }
}

export default new BetService();

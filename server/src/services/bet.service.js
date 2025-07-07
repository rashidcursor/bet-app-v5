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
    this.finalMatchResultCache = new NodeCache({ stdTTL: 24 * 60 * 60 });
  }

  // Helper method to get current UTC time
  getCurrentUTCTime() {
    return new Date().toISOString();
  }

  // Helper method to get current UTC time in 12-hour format
  getCurrentUTCTime12Hour() {
    return this.formatTo12Hour(new Date());
  }

  // Helper method to convert date to UTC
  toUTC(date) {
    return new Date(date.toISOString());
  }

  // Helper method to format date in 12-hour format
  formatTo12Hour(date) {
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "UTC",
    };
    return new Date(date).toLocaleString("en-US", options) + " UTC";
  }

  // Helper method to properly parse starting_at field from SportsMonks API
  parseMatchStartTime(startingAt) {
    console.log(`[DEBUG] Raw starting_at from API: ${startingAt}`);
    console.log(`[DEBUG] Type of starting_at: ${typeof startingAt}`);

    // Handle different possible formats
    let parsedDate;

    if (typeof startingAt === "string") {
      // Check if the string includes timezone info
      if (
        startingAt.includes("T") ||
        startingAt.includes("Z") ||
        startingAt.includes("+") ||
        (startingAt.includes("-") && startingAt.split("-").length > 3)
      ) {
        // String has timezone info, parse normally
        console.log(`[DEBUG] String with timezone info, parsing normally`);
        parsedDate = new Date(startingAt);
      } else {
        // String doesn't have timezone info, treat as UTC
        // Format: "2025-07-05 14:30:00" should be treated as UTC (24-hour format)
        console.log(`[DEBUG] String without timezone info, treating as UTC`);
        // Convert to ISO format and add Z for UTC
        let [date, time] = startingAt.split(" ");
        // Ensure time is in 24-hour format
        if (time) {
          let [hours, minutes, seconds] = time.split(":").map(Number);
          // If it's afternoon/evening (2:30 PM = 14:30)
          if (hours < 12 && (hours === 2 || hours === 3)) {
            // Specific check for 2 PM or 3 PM
            hours += 12;
          }
          time = `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${(seconds || 0).toString().padStart(2, "0")}`;
        }
        let isoString = `${date}T${time || "00:00:00"}Z`;
        console.log(`[DEBUG] Converted to ISO string: ${isoString}`);
        parsedDate = new Date(isoString);
      }
    } else if (startingAt instanceof Date) {
      // If it's already a Date object
      parsedDate = startingAt;
    } else {
      // Fallback to current time if invalid
      console.warn(`[WARNING] Invalid starting_at format: ${startingAt}`);
      parsedDate = new Date();
    }

    console.log(`[DEBUG] Parsed Date object: ${parsedDate}`);
    console.log(
      `[DEBUG] Parsed Date toISOString(): ${parsedDate.toISOString()}`
    );
    console.log(`[DEBUG] Parsed Date getTime(): ${parsedDate.getTime()}`);
    console.log(`[DEBUG] UTC time: ${parsedDate.toUTCString()}`);

    // Check if the date is valid
    if (isNaN(parsedDate.getTime())) {
      console.error(`[ERROR] Invalid date created from: ${startingAt}`);
      // Return current time as fallback
      return new Date();
    }

    return parsedDate;
  }

  async placeBet(userId, matchId, oddId, stake, betOption, inplay = false) {
    let matchData;
    let odds;
    const cacheKey = `match_${matchId}`;
    const cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    // For inplay bets, get odds from live odds cache
    if (inplay) {
      console.log(
        `[placeBet] Processing inplay bet for match ${matchId}, odd ${oddId}`
      );
      const liveOdds =
        await FixtureOptimizationService.liveFixturesService.ensureLiveOdds(
          matchId
        );

      // Find the odd directly in the live odds data
      let foundOdd = null;
      let foundMarket = null;
      for (const market of liveOdds) {
        const odd = market.options?.find((o) => o.id === oddId);
        if (odd) {
          foundOdd = odd;
          foundMarket = market;
          break;
        }
      }

      if (!foundOdd) {
        throw new CustomError(
          "Invalid odd ID for live bet",
          400,
          "INVALID_LIVE_ODD_ID"
        );
      }

      // Check if the odd is suspended or stopped
      if (foundOdd.suspended || foundOdd.stopped) {
        throw new CustomError(
          "This betting option is currently suspended",
          400,
          "ODD_SUSPENDED"
        );
      }

      odds = {
        id: foundOdd.id,
        value: foundOdd.value,
        name: foundOdd.name || foundOdd.label,
        market_id: foundMarket.id || foundMarket.market_id,
      };
    }

    // Step 0: Search all cached matches using the utility method
    const allCachedMatches = FixtureOptimizationService.getAllCachedMatches();
    matchData = allCachedMatches.find(
      (fixture) => fixture.id == matchId || fixture.id === parseInt(matchId)
    );
    if (matchData) {
      console.log(
        `Using match data from all-cached-matches utility for match ${matchId}`
      );
      console.log(
        `[DEBUG] Raw starting_at from cached match: ${matchData.starting_at}`
      );
      console.log(
        `[DEBUG] Type of starting_at: ${typeof matchData.starting_at}`
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
            starting_at: cachedOdds.starting_at,
            participants: cachedOdds.participants || [],
            state: cachedOdds.state || {},
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
          const response =
            await FixtureOptimizationService.getOptimizedFixtures(apiParams);
          const matches = response.data || [];
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
              starting_at: matchData.starting_at,
              odds: matchData.odds.map((odd) => ({
                oddId: odd.id,
                marketId: odd.market_id,
                name: odd.name,
                value: parseFloat(odd.value),
              })),
              participants: matchData.participants || [],
              state: matchData.state || {},
              updatedAt: new Date(),
            },
            { upsert: true }
          );
          // Update in-memory cache
          matchData.updatedAt = new Date();
          FixtureOptimizationService.fixtureCache.set(
            cacheKey,
            matchData,
            3600
          );
        }
      }
    }

    // If not an inplay bet, get odds from match data
    if (!inplay) {
      odds = matchData.odds?.find((odd) => odd.id === oddId);
      if (!odds) {
        throw new CustomError("Invalid odd ID", 400, "INVALID_ODD_ID");
      }
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
    const selection = betOption;

    const matchDate = this.parseMatchStartTime(matchData.starting_at);
    console.log(`[DEBUG] Final match date: ${this.formatTo12Hour(matchDate)}`);
    const estimatedMatchEnd = new Date(
      matchDate.getTime() + 2 * 60 * 60 * 1000 + 5 * 60 * 1000
    );

    const bet = new Bet({
      userId,
      matchId,
      oddId,
      marketId: odds.market_id,
      betOption: betOption || odds.name,
      odds: parseFloat(odds.value),
      stake,
      payout: 0,
      matchDate,
      estimatedMatchEnd,
      teams,
      selection,
      inplay,
    });

    console.log(`[placeBet] Creating bet with marketId: ${odds.market_id}`);
    await bet.save();

    const nowUTC = this.getCurrentUTCTime();
    const now = new Date();

    console.log(
      `[placeBet] Match start time (UTC): ${this.formatTo12Hour(matchDate)}`
    );
    console.log(
      `[placeBet] Estimated match end (UTC): ${this.formatTo12Hour(
        estimatedMatchEnd
      )}`
    );
    console.log(
      `[placeBet] Current time (UTC): ${this.getCurrentUTCTime12Hour()}`
    );

    // Schedule outcome check
    await this.scheduleBetOutcomeCheck(bet._id, estimatedMatchEnd, matchId);

    return bet;
  }

  scheduleBetOutcomeCheck(betId, estimatedMatchEnd, matchId) {
    // Get current time
    const now = new Date();

    // Ensure we're scheduling for the future, not the past
    let runAt = new Date(estimatedMatchEnd);

    // If the scheduled time is in the past, reschedule for 5 minutes from now
    if (runAt <= now) {
      runAt = new Date(Date.now() + 5 * 60 * 1000);
      console.log(
        `[scheduleBetOutcomeCheck] Estimated match end time is in the past. Rescheduling for 5 minutes from now at ${this.formatTo12Hour(
          runAt
        )}.`
      );
    }

    console.log(
      `[scheduleBetOutcomeCheck] Now (UTC): ${this.getCurrentUTCTime12Hour()}, runAt (UTC): ${this.formatTo12Hour(
        runAt
      )} (estimated match end time)`
    );

    // Schedule the job with Agenda
    agenda.schedule(runAt, "checkBetOutcome", { betId, matchId });
    console.log(
      `Scheduled Agenda job for bet ${betId} at ${this.formatTo12Hour(runAt)}`
    );
  }

  async fetchMatchResult(matchId, isLive = false) {
    try {
      // For both live and non-live matches, get state, scores, participants and odds in one call
      const response = await SportsMonksService.client.get(
        `/football/fixtures/${matchId}`,
        {
          params: {
            include: isLive
              ? "state;inplayOdds;scores;participants"
              : "odds;state;scores;participants",
          },
        }
      );

      if (!response.data?.data) {
        throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
      }

      // Add debug logging
      console.log(
        `[fetchMatchResult] Raw response data:`,
        JSON.stringify(response.data.data, null, 2)
      );

      const data = response.data.data;

      // The response contains match data at the root level
      const matchData = {
        id: matchId,
        state: data.state,
        scores: data.scores,
        participants: data.participants,

        odds: isLive ? data.inplayodds : data.odds,
      };

      console.log(`[fetchMatchResult] Structured match data:`, {
        id: matchData.id,
        state: matchData.state,
        oddsCount: matchData.odds?.length || 0,
      });

      return matchData;
    } catch (error) {
      console.error(`[fetchMatchResult] Error:`, error.message);
      throw error;
    }
  }

  async checkBetOutcome(betId, match = null) {
    console.log(`[checkBetOutcome] Called for betId: ${betId}`);
    const bet = await Bet.findById(betId).populate("userId");
    if (!bet) {
      console.error(`[checkBetOutcome] Bet not found: ${betId}`);
      throw new CustomError("Bet not found", 404, "BET_NOT_FOUND");
    }

    let matchData = match;
    // Check the final match result cache first
    if (!matchData) {
      if (this.finalMatchResultCache.has(bet.matchId)) {
        matchData = this.finalMatchResultCache.get(bet.matchId);
        console.log(
          `[checkBetOutcome] Used cached final result for matchId: ${bet.matchId}`
        );
      } else {
        try {
          console.log(
            `[checkBetOutcome] Fetching latest fixture for matchId: ${bet.matchId}, inplay: ${bet.inplay}`
          );
          matchData = await this.fetchMatchResult(bet.matchId, bet.inplay);
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
    console.log(
      `[checkBetOutcome] Looking for odd ID ${bet.oddId} in match data`
    );

    // Check if match is finished (state.id === 5 means finished)
    // if (!matchData.state || matchData.state.id !== 5) {
    //   console.log(`[checkBetOutcome] Match not finished for betId: ${betId}, state:`, matchData.state);

    //   // If match hasn't started yet or is in progress, reschedule for estimated end time
    //   if (!matchData.state || matchData.state.id === 1 || (matchData.state.id >= 2 && matchData.state.id <= 4)) {
    //     console.log(`[checkBetOutcome] Match is not yet finished (state: ${matchData.state?.name}). Rescheduling for estimated end time.`);
    //     agenda.schedule(bet.estimatedMatchEnd, "checkBetOutcome", { betId, matchId: bet.matchId });
    //   } else {
    //     // For other states, check again in 10 minutes
    //     const runAt = new Date(Date.now() + 10 * 60 * 1000);
    //     agenda.schedule(runAt, "checkBetOutcome", { betId, matchId: bet.matchId });
    //   }

    //   return { betId, status: bet.status, message: "Match not yet finished, rescheduled" };
    // }

    // Find the odd in the match data
    const odds = matchData.odds || [];
    console.log(
      `[checkBetOutcome] Available odds:`,
      odds.map((odd) => odd.id)
    );

    const selectedOdd = odds.find((odd) => odd.id == bet.oddId);
    console.log(`[checkBetOutcome] selectedOdd:`, selectedOdd);

    if (!selectedOdd) {
      console.log(
        `[checkBetOutcome] Odd ID ${bet.oddId} not found in match data, marking as canceled`
      );
      bet.status = "canceled";
      bet.payout = bet.stake; // Refund the stake
    } else {
      // Use the winning field to determine outcome
      bet.status = selectedOdd.winning ? "won" : "lost";
      bet.payout = selectedOdd.winning ? bet.stake * bet.odds : 0;
      console.log(
        `[checkBetOutcome] Set status based on winning field: ${bet.status}, Payout: ${bet.payout}`
      );
    }

    // Update user balance if bet was won or canceled
    if (bet.status === "won" || bet.status === "canceled") {
      const user = bet.userId;
      user.balance += bet.payout;
      await user.save();
      console.log(
        `[checkBetOutcome] User ${user._id} balance updated: +${bet.payout}`
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
    // Use current time for comparison
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
          // Only process bets for matches that are actually finished (state.id === 5)
          if (match.state?.id === 5) {
            for (const bet of betsByMatch[matchId]) {
              const result = await this.checkBetOutcome(bet._id, match);
              results.push(result);
            }
          } else {
            // For matches that are not finished, reschedule the bets for later
            console.log(
              `Match ${matchId} is not finished (state: ${match.state?.name}), rescheduling bets`
            );
            for (const bet of betsByMatch[matchId]) {
              // Reschedule for the estimated match end time or 30 minutes later if that's in the past
              const now = new Date();
              let newScheduleTime = new Date(bet.estimatedMatchEnd);

              if (newScheduleTime <= now) {
                newScheduleTime = new Date(Date.now() + 30 * 60 * 1000);
              }

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
    // Use current time for comparison
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
          console.log(
            `Match ${match.id} is not finished (state: ${match.state?.name}), rescheduling bets`
          );
          for (const bet of betsByMatch[match.id]) {
            // Determine appropriate scheduling time
            const now = new Date();
            let newScheduleTime;

            // If match hasn't started yet (state.id === 1), schedule for after estimated end time
            if (match.state?.id === 1) {
              newScheduleTime = new Date(bet.estimatedMatchEnd);
              if (newScheduleTime <= now) {
                // If somehow the end time is in the past, schedule for 30 minutes later
                newScheduleTime = new Date(Date.now() + 30 * 60 * 1000);
              }
            }
            // If match is in progress (state.id between 2-4), schedule for estimated end time
            else if (match.state?.id >= 2 && match.state?.id <= 4) {
              newScheduleTime = new Date(bet.estimatedMatchEnd);
              if (newScheduleTime <= now) {
                // If somehow the end time is in the past, schedule for 30 minutes later
                newScheduleTime = new Date(Date.now() + 30 * 60 * 1000);
              }
            }
            // For other states, check again in 30 minutes
            else {
              newScheduleTime = new Date(Date.now() + 30 * 60 * 1000);
            }

            agenda.schedule(newScheduleTime, "checkBetOutcome", {
              betId: bet._id,
              matchId: bet.matchId,
            });

            console.log(
              `Rescheduled bet ${bet._id} for ${this.formatTo12Hour(
                newScheduleTime
              )}`
            );

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
            const newScheduleTime = new Date(Date.now() + 30 * 60 * 1000);
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

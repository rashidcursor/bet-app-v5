import Bet from "../models/Bet.js";
import User from "../models/User.js";
import MatchOdds from "../models/matchOdds.model.js";
import SportsMonksService from "./sportsMonks.service.js";
import FixtureOptimizationService from "./fixture.service.js";
import BetOutcomeCalculationService from "./betOutcomeCalculation.service.js";
import { CustomError } from "../utils/customErrors.js";
import agenda from "../config/agenda.js";
import NodeCache from "node-cache";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BetService {
  constructor() {
    this.finalMatchResultCache = new NodeCache({ stdTTL: 24 * 60 * 60 });
    this.marketsCache = null;
    this.marketsCacheTime = null;
    this.MARKETS_FILE_PATH = path.join(__dirname, "../constants/markets.json");
    this.outcomeCalculator = new BetOutcomeCalculationService();
  }

  // Helper method to get markets data from JSON file
  getMarketsData() {
    try {
      // Check if cache is valid (cache for 1 hour)
      const now = Date.now();
      if (this.marketsCache && this.marketsCacheTime && (now - this.marketsCacheTime) < 60 * 60 * 1000) {
        return this.marketsCache;
      }

      // Read from file
      const marketsData = JSON.parse(fs.readFileSync(this.MARKETS_FILE_PATH, 'utf8'));
      this.marketsCache = marketsData;
      this.marketsCacheTime = now;
      return marketsData;
    } catch (error) {
      console.error('Error reading markets.json:', error);
      return { markets: {} };
    }
  }

  // Helper method to get market name by market ID
  getMarketName(marketId) {
    const marketsData = this.getMarketsData();
    const market = marketsData.markets[marketId];
    return market ? market.name : 'Unknown Market';
  }

  // Helper method to get market ID by market name/title
  getMarketIdByName(marketName) {
    const marketsData = this.getMarketsData();
    
    // Search for market by name
    for (const [id, market] of Object.entries(marketsData.markets)) {
      if (market.name === marketName) {
        return parseInt(id);
      }
    }
    
    // Fallback mapping for common market names
    const marketNameMapping = {
      'Fulltime Result': 1,
      'Double Chance': 2,
      'Match Goals': 4,
      'Asian Handicap': 6,
      'Both Teams To Score': 8,
      'Exact Goals Number': 9,
      'Highest Scoring Half': 10,
      'Goals Over/Under': 11,
      'First Goal Scorer': 12,
      'Last Goal Scorer': 13,
      'Anytime Goal Scorer': 14,
      'Player To Score 2 Or More': 15,
      'Correct Score': 16,
      'Half Time Result': 17,
      'Half Time/Full Time': 18,
      'To Qualify': 19,
      'Both Teams To Score - First Half': 20,
      'Both Teams To Score - Second Half': 21,
      'First Half Goals Over/Under': 22,
      'Second Half Goals Over/Under': 23,
      'Odd/Even Goals': 24,
      'First Half Odd/Even Goals': 25,
      'Second Half Odd/Even Goals': 26,
      'First Team To Score': 27,
      'Last Team To Score': 28,
      'Winning Margin': 29,
      'To Score In Both Halves': 30
    };

    return marketNameMapping[marketName] || null;
  }

  // Helper method to create betDetails object
  createBetDetails(odds, marketId) {
    // Ensure marketId is not undefined or null
    let safeMarketId = marketId || odds.market_id;
    
    // If still no market ID, try to resolve it from market description
    if (!safeMarketId || safeMarketId === 'unknown_market') {
      if (odds.market_description) {
        safeMarketId = this.getMarketIdByName(odds.market_description);
      }
      
      // Final fallback to prevent errors
      if (!safeMarketId || safeMarketId === 'unknown_market') {
        console.warn(`[createBetDetails] Could not resolve market ID, using fallback ID 1 for odds:`, {
          oddId: odds.id,
          label: odds.label,
          market_description: odds.market_description
        });
        safeMarketId = 1; // Default to "Fulltime Result"
      }
    }
    
    const marketName = this.getMarketName(safeMarketId);
    
    console.log(`[createBetDetails] Final market ID: ${safeMarketId}, market name: ${marketName}`);
    
    // Process the total field - keep it as string for descriptive totals like "Over 0.5", "Under 1.5"
    let processedTotal = null;
    if (odds.total !== undefined && odds.total !== null) {
      // Always keep as string since it contains descriptive text like "Over 1.5", "Under 2.5"
      processedTotal = String(odds.total);
    }
    
    console.log(`[createBetDetails] Processing total: ${odds.total} -> ${processedTotal}`);
    
    return {
      market_id: safeMarketId,
      market_name: marketName,
      label: odds.label || odds.name || '',
      value: parseFloat(odds.value) || 0,
      total: processedTotal,
      market_description: odds.market_description || null,
      handicap: odds.handicap || null,
      name: odds.name || odds.label || ''
    };
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
      
      // Force a fresh fetch for betting to ensure we have the latest odds
      console.log(`[placeBet] Forcing fresh fetch of live odds for betting...`);
      FixtureOptimizationService.liveFixturesService.liveOddsCache.del(matchId);
      
      const liveOddsResult =
        await FixtureOptimizationService.liveFixturesService.ensureLiveOdds(
          matchId
        );

      // Get the betting_data array from the result
      const liveOdds = liveOddsResult.betting_data || [];
      
      
      


      // Find the odd directly in the live odds data
      let foundOdd = null;
      let foundMarket = null;
      
      // Search for the exact odd ID in all sections
      for (const section of liveOdds) {
        
        
        
        // Simple exact match - convert both to numbers for comparison
        const odd = section.options?.find((o) => {
          const optionId = parseInt(o.id);
          const requestedId = parseInt(oddId);
          console.log(`[placeBet] Comparing: ${optionId} === ${requestedId} (${optionId === requestedId})`);
          return optionId === requestedId;
        });
        
        if (odd) {
          foundOdd = odd;
          foundMarket = section;
          console.log(`[placeBet] ✅ FOUND EXACT MATCH: ${odd.label} with ID: ${odd.id}, market_id: ${odd.market_id}`);
          break;
        }
      }

      if (!foundOdd) {
        console.log(`[placeBet] ❌ EXACT MATCH NOT FOUND for oddId: ${oddId}`);
        console.log(`[placeBet] This shouldn't happen if SportsMonks doesn't change odd IDs!`);
        
        throw new CustomError(
          `Invalid odd ID for live bet. Odd ID ${oddId} not found in current live odds.`,
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

      // Use the market ID from the found odd (check both marketId and market_id)
      const resolvedMarketId = foundOdd.marketId || foundOdd.market_id;

      if (!resolvedMarketId) {
        console.log(`[placeBet] ❌ No market ID found in live odd:`, foundOdd);
        console.log(`[placeBet] Available properties:`, Object.keys(foundOdd));
        throw new CustomError(
          "Invalid live odd data - missing market ID",
          400,
          "INVALID_LIVE_ODD_DATA"
        );
      }

      console.log(`[placeBet] Using market ID: ${resolvedMarketId} for "${foundOdd.label}" (from ${foundOdd.marketId ? 'marketId' : 'market_id'})`);

      odds = {
        id: foundOdd.id,
        value: foundOdd.value,
        name: foundOdd.name || foundOdd.label,
        market_id: resolvedMarketId,
        label: foundOdd.label,
        total: foundOdd.total,
        market_description: foundOdd.market_description || foundMarket.description || foundMarket.title,
        handicap: foundOdd.handicap
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

    // Create betDetails object
    const betDetails = this.createBetDetails(odds, odds.market_id);

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
      betDetails,
    });

    console.log(`[placeBet] Creating bet with marketId: ${odds.market_id}`);
    console.log(`[placeBet] Bet details:`, betDetails);
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
    const maxRetries = 3;
    let lastError;

    try {
      // Check cache first
      if (this.finalMatchResultCache.has(matchId)) {
        const cachedData = this.finalMatchResultCache.get(matchId);
        console.log(`[fetchMatchResult] Used cached result for matchId: ${matchId}`);
        return cachedData;
      }

      // Retry logic for API calls
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[fetchMatchResult] Attempt ${attempt}/${maxRetries} for matchId: ${matchId}`);
          
          // Use minimal includes to reduce response size and avoid timeouts
          const includes=
             "state;inplayOdds;scores;participants;lineups.details;events;statistics;odds" // Minimal on first attempt
            
          const response = await SportsMonksService.client.get(
            `/football/fixtures/${matchId}`,
            {
              params: {
                include: includes
              },
              timeout: attempt === 1 ? 10000 : attempt === 2 ? 20000 : 30000, // Increase timeout with each attempt
              headers: {
                'Accept-Encoding': 'gzip, deflate', // Avoid br compression which might cause issues
                'Connection': 'keep-alive'
              }
            }
          );

          if (!response.data?.data) {
            throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
          }

          console.log(`[fetchMatchResult] Successfully fetched data on attempt ${attempt} for matchId: ${matchId}`);

          const data = response.data.data;

          // The response contains match data at the root level
          const matchData = {
            name: data.name,
            id: matchId,
            state: data.state,
            scores: data.scores || [],
            participants: data.participants,
            starting_at: data.starting_at,
            odds: data.odds,
            inplayodds: data.inplayodds || [],
            lineups: data.lineups || [],
            events: data.events || [],
            statistics: data.statistics || [],
          };

          // Cache the match data if the match is finished (state.id === 5)
          if (matchData.state?.id === 5) {
            this.finalMatchResultCache.set(matchId, matchData);
            console.log(`[fetchMatchResult] Cached final result for matchId: ${matchId}`);
          }

          return matchData;

        } catch (error) {
          lastError = error;
          console.error(`[fetchMatchResult] Attempt ${attempt} failed for matchId: ${matchId}:`, error.message);
          
          // If it's a connection reset error and we have more attempts, wait before retrying
          if ((error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || error.message.includes('aborted')) && attempt < maxRetries) {
            const waitTime = attempt * 2000; // 2s, 4s wait times
            console.log(`[fetchMatchResult] Waiting ${waitTime}ms before retry ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          
          // If it's not a retry-able error or last attempt, throw
          if (attempt === maxRetries) {
            throw error;
          }
        }
      }

    } catch (error) {
      console.error(`[fetchMatchResult] All attempts failed for matchId: ${matchId}. Final error:`, error.message);
      
      // If it's a network error, try to provide a more user-friendly error
      if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || error.message.includes('aborted')) {
        throw new CustomError(
          `Unable to fetch match data due to network connectivity issues. Please try again later.`,
          503,
          "NETWORK_ERROR"
        );
      }
      
      throw error;
    }
  }

  async checkBetOutcome(betId, match = null) {
    console.log(`[checkBetOutcome] Called for betId: ${betId}`);
    const bet = await Bet.findById(betId);
    if (!bet) {
      console.error(`[checkBetOutcome] Bet not found: ${betId}`);
      throw new CustomError("Bet not found", 404, "BET_NOT_FOUND");
    }

    // Prevent processing bets that have already been finalized
    if (bet.status !== "pending") {
      console.log(`[checkBetOutcome] Bet ${betId} already processed with status: ${bet.status}, skipping`);
      return {
        betId: bet._id,
        status: bet.status,
        payout: bet.payout,
        message: "Already processed"
      };
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
          
          // Handle network errors gracefully
          if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED' || 
              err.message.includes('aborted') || err.message.includes('NETWORK_ERROR')) {
            
            console.log(`[checkBetOutcome] Network error for betId: ${betId}. Rescheduling for retry in 10 minutes.`);
            
            // Reschedule for retry in 10 minutes due to network issues
            const runAt = new Date(Date.now() + 10 * 60 * 1000);
            agenda.schedule(runAt, "checkBetOutcome", { betId, matchId: bet.matchId });
            
            return {
              betId: bet._id,
              status: bet.status,
              message: "Network error, rescheduled for retry"
            };
          }
          
          // For other errors, throw as before
          throw err;
        }
      }
    }

    console.log(`[checkBetOutcome] Match state:`, matchData.state);
    console.log(
      `[checkBetOutcome] Looking for odd ID ${bet.oddId} in match data`
    );

    //NOTE: Dont remove it i will uncomment it
    // Check if match is finished (state.id === 5 means finished)
    if (!matchData.state || matchData.state.id !== 5) {
      console.log(`[checkBetOutcome] Match not finished for betId: ${betId}, state:`, matchData.state);

      // If match hasn't started yet or is in progress, reschedule for estimated end time
      if (!matchData.state || matchData.state.id === 1 || (matchData.state.id >= 2 && matchData.state.id <= 4)) {
        console.log(`[checkBetOutcome] Match is not yet finished (state: ${matchData.state?.name}). Rescheduling for estimated end time.`);
        agenda.schedule(bet.estimatedMatchEnd, "checkBetOutcome", { betId, matchId: bet.matchId });
      } else {
        // For other states, check again in 10 minutes
        const runAt = new Date(Date.now() + 10 * 60 * 1000);
        agenda.schedule(runAt, "checkBetOutcome", { betId, matchId: bet.matchId });
      }

      return { betId, status: bet.status, message: "Match not yet finished, rescheduled" };
    }
   
   // Prepare match data for outcome calculation
   let final_match = matchData;
   if (bet.inplay) {
     console.log(`[checkBetOutcome] Processing inplay bet for betId: ${betId}`);
     // For inplay bets, use inplay odds from the current match data
     // The odds are already stored in the bet object from when it was placed
     final_match = {...matchData, odds: matchData.inplayodds};
     console.log(`[checkBetOutcome] Using inplay odds for outcome calculation`);
   }
   
   // Calculate bet outcome using the BetOutcomeCalculationService
   try {
     console.log(`[checkBetOutcome] Calculating outcome for betId: ${betId}`);
     console.log(`[checkBetOutcome] Bet details:`, {
       oddId: bet.oddId,
       betOption: bet.betOption,
       inplay: bet.inplay,
       marketId: bet.marketId,
       betDetails: bet.betDetails
     });
     
     const outcomeResult = await this.outcomeCalculator.calculateBetOutcome(bet, final_match);
     
     console.log(`[checkBetOutcome] Outcome calculated:`, outcomeResult);
     
     // Update bet based on the outcome
     let updateData = {
       status: outcomeResult.status,
       payout: 0
     };

     // Handle different outcome statuses
     switch (outcomeResult.status) {
       case 'won':
         const winningPayout = bet.stake * bet.odds;
         console.log(`[checkBetOutcome] Bet won. Payout: ${winningPayout}`);
         updateData.payout = winningPayout;
         // Update user balance for winning bet
         if (bet.userId) {
           await User.findByIdAndUpdate(
             bet.userId,
             { $inc: { balance: winningPayout } }
           );
           console.log(`[checkBetOutcome] User balance updated. Added: ${winningPayout}`);
         }
         break;
         
       case 'lost':
         console.log(`[checkBetOutcome] Bet lost. No payout.`);
         updateData.payout = 0;
         // No balance update needed for lost bets
         break;
         
       
       case 'cancelled':
         console.log(`[checkBetOutcome] Bet canceled. Refunding stake: ${bet.stake}`);
         updateData.payout = bet.stake;
         updateData.status = 'canceled';
         // Refund stake to user
         if (bet.userId) {
           await User.findByIdAndUpdate(
             bet.userId,
             { $inc: { balance: bet.stake } }
           );
           console.log(`[checkBetOutcome] Stake refunded to user: ${bet.stake}`);
         }
         break;
      
       default:
         console.error(`[checkBetOutcome] Unknown status in outcome calculation:`, outcomeResult);
         updateData.status = 'canceled';
         updateData.payout = bet.stake; // Refund the stake
         // Refund stake to user
         if (bet.userId) {
           await User.findByIdAndUpdate(
             bet.userId,
             { $inc: { balance: bet.stake } }
           );
           console.log(`[checkBetOutcome] Stake refunded to user due to unknown status: ${bet.stake}`);
         }
         break;
     }

     // Update the bet in database
     const updatedBet = await Bet.findByIdAndUpdate(
       betId,
       updateData,
       { new: true }
     );

     if (!updatedBet) {
       throw new CustomError("Failed to update bet", 500, "UPDATE_FAILED");
     }

     console.log(`[checkBetOutcome] Bet updated successfully. betId: ${bet._id}, status: ${updatedBet.status}, payout: ${updatedBet.payout}`);

     return {
       betId: updatedBet._id,
       status: updatedBet.status,
       payout: updatedBet.payout
     };

   } catch (error) {
     console.error(`[checkBetOutcome] Error in outcome calculation:`, error);
     
     // Update bet status to error (using canceled since error is not in enum)
     await Bet.findByIdAndUpdate(betId, {
       status: 'canceled',
       payout: bet.stake // Refund the stake due to error
     });

     // Refund stake to user due to error
     if (bet.userId) {
       await User.findByIdAndUpdate(
         bet.userId,
         { $inc: { balance: bet.stake } }
       );
       console.log(`[checkBetOutcome] Stake refunded to user due to calculation error: ${bet.stake}`);
     }

     throw new CustomError(
       `Failed to calculate bet outcome: ${error.message}`,
       500,
       "CALCULATION_ERROR"
     );
   }
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

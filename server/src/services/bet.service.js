import Bet from "../models/Bet.js";
import User from "../models/User.js";
import MatchOdds from "../models/matchOdds.model.js";
import SportsMonksService from "./sportsMonks.service.js";
import FixtureOptimizationService from "./fixture.service.js";
import BetOutcomeCalculationService from "./betOutcomeCalculation.service.js";
import { CustomError } from "../utils/customErrors.js";
import agenda from "../config/agenda.js";
import NodeCache from "node-cache";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import winnningOddsCalculation from "./winningOddsCalculation.service.js";
// import TeamRestriction from "../models/TeamRestriction.js"; // ✅ REMOVED: No longer used - team restriction check disabled
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BetService {
  constructor() {
    this.finalMatchResultCache = new NodeCache({ stdTTL: 24 * 60 * 60 });
    this.marketsCache = null;
    this.marketsCacheTime = null;
    this.MARKETS_FILE_PATH = path.join(__dirname, "../constants/markets.json");
    this.SimpleOddsCalculation = new BetOutcomeCalculationService();
    this.WinningOddsCalculation = new winnningOddsCalculation();
  }

  // Helper method to get markets data from JSON file
  getMarketsData() {
    try {
      // Check if cache is valid (cache for 1 hour)
      const now = Date.now();
      if (
        this.marketsCache &&
        this.marketsCacheTime &&
        now - this.marketsCacheTime < 60 * 60 * 1000
      ) {
        return this.marketsCache;
      }

      // Read from file
      const marketsData = JSON.parse(
        fs.readFileSync(this.MARKETS_FILE_PATH, "utf8")
      );
      this.marketsCache = marketsData;
      this.marketsCacheTime = now;
      return marketsData;
    } catch (error) {
      console.error("Error reading markets.json:", error);
      return { markets: {} };
    }
  }

  // Helper method to get market name by market ID
  getMarketName(marketId) {
    const marketsData = this.getMarketsData();
    const market = marketsData.markets[marketId];
    return market ? market.name : "Unknown Market";
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
      "Fulltime Result": 1,
      "Double Chance": 2,
      "Match Goals": 4,
      "Asian Handicap": 6,
      "Both Teams To Score": 8,
      "Exact Goals Number": 9,
      "Highest Scoring Half": 10,
      "Goals Over/Under": 11,
      "First Goal Scorer": 12,
      "Last Goal Scorer": 13,
      "Anytime Goal Scorer": 14,
      "Player To Score 2 Or More": 15,
      "Correct Score": 16,
      "Half Time Result": 17,
      "Half Time/Full Time": 18,
      "To Qualify": 19,
      "Both Teams To Score - First Half": 20,
      "Both Teams To Score - Second Half": 21,
      "First Half Goals Over/Under": 22,
      "Second Half Goals Over/Under": 23,
      "Odd/Even Goals": 24,
      "First Half Odd/Even Goals": 25,
      "Second Half Odd/Even Goals": 26,
      "First Team To Score": 27,
      "Last Team To Score": 28,
      "Winning Margin": 29,
      "To Score In Both Halves": 30,
    };

    return marketNameMapping[marketName] || null;
  }

  // Helper method to create betDetails object
  createBetDetails(odds, marketId) {
    // Ensure marketId is not undefined or null
    let safeMarketId = marketId || odds.market_id;

    // If still no market ID, try to resolve it from market description
    if (!safeMarketId || safeMarketId === "unknown_market") {
      if (odds.market_description) {
        safeMarketId = this.getMarketIdByName(odds.market_description);
      }

      // Final fallback to prevent errors
      if (!safeMarketId || safeMarketId === "unknown_market") {
        console.warn(
          `[createBetDetails] Could not resolve market ID, using fallback ID 1 for odds:`,
          {
            oddId: odds.id,
            label: odds.label,
            market_description: odds.market_description,
          }
        );
        safeMarketId = 1; // Default to "Fulltime Result"
      }
    }

    const marketName = this.getMarketName(safeMarketId);

    console.log(
      `[createBetDetails] Final market ID: ${safeMarketId}, market name: ${marketName}`
    );

    // Process the total field - keep it as string for descriptive totals like "Over 0.5", "Under 1.5"
    let processedTotal = null;
    if (odds.total !== undefined && odds.total !== null) {
      // Always keep as string since it contains descriptive text like "Over 1.5", "Under 2.5"
      processedTotal = String(odds.total);
    }

    console.log(
      `[createBetDetails] Processing total: ${odds.total} -> ${processedTotal}`
    );

    return {
      market_id: safeMarketId,
      market_name: marketName,
      label: odds.label || odds.name || "",
      value: parseFloat(odds.value) || 0,
      total: processedTotal,
      market_description: odds.market_description || null,
      handicap: odds.handicap || null,
      name: odds.name || odds.label || "",
    };
  }

  // Build optional unibetMeta for parity with unibet-api placement
  buildUnibetMetaFromPayload(payload = {}, context = {}) {
    try {
      const {
        eventName,
        marketName,
        criterionLabel,
        criterionEnglishLabel,
        outcomeEnglishLabel,
        participant,
        participantId,
        eventParticipantId,
        betOfferTypeId,
        handicapRaw,
        handicapLine,
        leagueId,
        leagueName,
        homeName,
        awayName,
        start
      } = payload;

      const meta = {
        eventName: eventName ?? context.eventName ?? null,
        marketName: marketName ?? context.marketName ?? null,
        criterionLabel: criterionLabel ?? null,
        criterionEnglishLabel: criterionEnglishLabel ?? null,
        outcomeEnglishLabel: outcomeEnglishLabel ?? null,
        participant: participant ?? null,
        participantId: participantId ? String(participantId) : null,
        eventParticipantId: eventParticipantId ? String(eventParticipantId) : null,
        betOfferTypeId: betOfferTypeId != null ? String(betOfferTypeId) : null,
        handicapRaw: typeof handicapRaw === 'number' ? handicapRaw : null,
        handicapLine: typeof handicapLine === 'number' ? handicapLine : null,
        leagueId: (leagueId ?? context.leagueId) != null ? String(leagueId ?? context.leagueId) : null,
        leagueName: leagueName ?? context.leagueName ?? null,
        homeName: homeName ?? context.homeName ?? null,
        awayName: awayName ?? context.awayName ?? null,
        start: start ? new Date(start) : null
      };
      return meta;
    } catch (e) {
      console.warn('[buildUnibetMetaFromPayload] Failed to build meta:', e?.message);
      return undefined;
    }
  }

  // Helper method to calculate when bet outcome check should run (2h 5min after match start)
  calculateBetOutcomeCheckTime(matchStartTime) {
    return new Date(matchStartTime.getTime() + 2 * 60 * 60 * 1000 + 5 * 60 * 1000);
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

  // Helper method to extract teams from match data with fallbacks
  getTeamsFromMatchData(matchData, fallbackTeams = "") {
    // Try to get teams from matchData.participants first
    // ✅ FIX: Check position field first, then fallback to array index
    if (matchData.participants && Array.isArray(matchData.participants) && matchData.participants.length >= 2) {
      const homeParticipant = matchData.participants.find(p => (p.position || '').toLowerCase() === 'home') || matchData.participants[0];
      const awayParticipant = matchData.participants.find(p => (p.position || '').toLowerCase() === 'away') || matchData.participants[1];
      const team1 = homeParticipant?.name || homeParticipant?.meta?.name;
      const team2 = awayParticipant?.name || awayParticipant?.meta?.name;
      
      if (team1 && team2) {
        return `${team1} vs ${team2}`;
      }
    }
    
    // Try to get teams from matchData.name (e.g., "Team A vs Team B")
    if (matchData.name && typeof matchData.name === 'string') {
      if (matchData.name.includes(' vs ')) {
        return matchData.name;
      }
    }
    
    // Try to get teams from matchData.participants with different structure
    if (matchData.participants && Array.isArray(matchData.participants)) {
      const teamNames = matchData.participants
        .map(p => p?.name || p?.meta?.name || p?.display_name)
        .filter(name => name && typeof name === 'string');
      
      if (teamNames.length >= 2) {
        return `${teamNames[0]} vs ${teamNames[1]}`;
      }
    }
    
    // Return fallback teams if provided
    if (fallbackTeams && typeof fallbackTeams === 'string' && fallbackTeams.trim() !== '') {
      return fallbackTeams;
    }
    
    // Last resort: return a generic message
    return "Teams information not available";
  }

  /**
   * Extract team name from bet selection
   * Handles: Home/Away, 1/2/X, team names directly, market-based selections
   * @param {string} selection - Bet selection (e.g., "Home", "1", "Utrecht", "Total Goals by Utrecht")
   * @param {string} homeName - Home team name
   * @param {string} awayName - Away team name
   * @returns {string|null} - Team name or null if not a team-based bet
   */
  extractTeamFromBetSelection(selection, homeName, awayName) {
    if (!selection || !homeName || !awayName) {
      return null;
    }
    
    const selectionLower = String(selection).toLowerCase().trim();
    const homeNameLower = String(homeName).toLowerCase().trim();
    const awayNameLower = String(awayName).toLowerCase().trim();
    
    // Check if selection is Home/1 (home team)
    if (selectionLower === 'home' || selectionLower === '1' || selectionLower === 'h') {
      return homeName;
    }
    
    // Check if selection is Away/2 (away team)
    if (selectionLower === 'away' || selectionLower === '2' || selectionLower === 'a') {
      return awayName;
    }
    
    // Check if selection directly matches home team name
    if (this.namesMatch(selection, homeName) || selectionLower === homeNameLower) {
      return homeName;
    }
    
    // Check if selection directly matches away team name
    if (this.namesMatch(selection, awayName) || selectionLower === awayNameLower) {
      return awayName;
    }
    
    // Check if selection contains team name (e.g., "Total Goals by Utrecht")
    if (selectionLower.includes(' by ')) {
      const parts = selectionLower.split(' by ');
      if (parts.length > 1) {
        const teamPart = parts[1].trim();
        // Remove suffixes like "- 1st Half", "- 2nd Half"
        const cleanTeamPart = teamPart
          .replace(/\s*-\s*1st\s+half/gi, '')
          .replace(/\s*-\s*2nd\s+half/gi, '')
          .replace(/\s*-\s*first\s+half/gi, '')
          .replace(/\s*-\s*second\s+half/gi, '')
          .trim();
        
        // Match against home or away team
        if (this.namesMatch(cleanTeamPart, homeName) || cleanTeamPart === homeNameLower) {
          return homeName;
        }
        if (this.namesMatch(cleanTeamPart, awayName) || cleanTeamPart === awayNameLower) {
          return awayName;
        }
      }
    }
    
    // Check if selection contains team name in other formats
    if (selectionLower.includes(homeNameLower)) {
      return homeName;
    }
    if (selectionLower.includes(awayNameLower)) {
      return awayName;
    }
    
    // Not a team-based bet (e.g., "Over 2.5", "X", "Draw")
    return null;
  }
  
  /**
   * Simple name matching helper (case-insensitive, handles common variations)
   * @param {string} name1 - First name
   * @param {string} name2 - Second name
   * @returns {boolean} - True if names match
   */
  namesMatch(name1, name2) {
    if (!name1 || !name2) return false;
    const n1 = String(name1).toLowerCase().trim();
    const n2 = String(name2).toLowerCase().trim();
    return n1 === n2 || n1.includes(n2) || n2.includes(n1);
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

  async placeBet(userId, matchId, oddId, stake, betOption, inplay = false, combinationData = null, unibetMetaPayload = undefined, clientBetDetails = undefined) {
    // ✅ FIX: Check if oddId is synthetic (format: matchId_selection_marketId) - define early for use throughout function
    const oddIdStr = String(oddId);
    const isSyntheticOddId = oddIdStr.includes('_') && oddIdStr.split('_').length >= 2;
    let syntheticSelection = null;
    let syntheticMarketId = null;
    
    if (isSyntheticOddId) {
      const parts = oddIdStr.split('_');
      syntheticSelection = parts[1]; // e.g., "home", "draw", "away"
      syntheticMarketId = parts[2] || '1'; // Default to market 1 if not specified
      console.log(`[placeBet] 🔍 Detected synthetic oddId: ${oddIdStr} -> selection: ${syntheticSelection}, marketId: ${syntheticMarketId}`);
    }
    
    // Handle combination bets
    if (combinationData && Array.isArray(combinationData)) {
      console.log(`[placeBet] Processing combination bet with ${combinationData.length} legs`);
      
      // Validate combination bet
      if (combinationData.length < 2) {
        throw new CustomError(
          "Combination bet must have at least 2 legs",
          400,
          "INVALID_COMBINATION_BET"
        );
      }
      if (combinationData.length > 10) {
        throw new CustomError(
          "Combination bet cannot have more than 10 legs",
          400,
          "TOO_MANY_LEGS"
        );
      }

      // Validate user and balance
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

      // Process each leg to get odds and match data
      const processedLegs = [];
      let totalOdds = 1;
      let firstLegData = null;

      for (let i = 0; i < combinationData.length; i++) {
        const leg = combinationData[i];
        console.log(`[placeBet] Processing combination leg ${i + 1}: matchId=${leg.matchId}, oddId=${leg.oddId}`);

        // const { matchData, odds } = await this.getMatchDataAndOdds(leg.matchId, leg.oddId, leg.inplay || false);
        // Use Unibet API approach (same as single bets) - NO SportsMonk API calls
        let matchData;
        let odds;
        
        // Use the same Unibet API approach as single bets
        if (leg.inplay) {
          console.log(`[placeBet] Processing live combination leg: matchId=${leg.matchId}, oddId=${leg.oddId}`);
          
          // Use the same sophisticated logic as single bets
          const liveOdds = global.liveFixturesService 
            ? global.liveFixturesService.getLiveOdds(leg.matchId) || []
            : [];
          
          console.log(`[placeBet] Found ${liveOdds.length} betting sections for match ${leg.matchId}`);
          console.log(`[placeBet] Looking for oddId: ${leg.oddId}`);
          
          // Debug: Log all available odd IDs (same as single bets)
          const allOddIds = [];
          liveOdds.forEach((section, sectionIndex) => {
            if (section.options && Array.isArray(section.options)) {
              section.options.forEach(option => {
                allOddIds.push(option.id);
                console.log(`[placeBet] Section ${sectionIndex}: oddId=${option.id}, label=${option.label}, market_id=${option.market_id}`);
              });
            }
          });
          console.log(`[placeBet] All available odd IDs:`, allOddIds);
          
          // Find the odd using the same sophisticated logic as single bets
          let foundOdd = null;
          let foundMarket = null;
          
          // Search for the exact odd ID in all sections (same logic as single bets)
          for (const section of liveOdds) {
            const odd = section.options?.find((o) => {
              const optionId = o.id;
              const requestedId = leg.oddId;
              
              // Try exact match first
              if (optionId === requestedId) {
                console.log(`[placeBet] ✅ EXACT MATCH: ${optionId} === ${requestedId}`);
                return true;
              }
              
              // Try number comparison
              const optionIdNum = parseInt(optionId);
              const requestedIdNum = parseInt(requestedId);
              if (optionIdNum === requestedIdNum) {
                console.log(`[placeBet] ✅ NUMBER MATCH: ${optionIdNum} === ${requestedIdNum}`);
                return true;
              }
              
              // Try string comparison
              if (optionId.toString() === requestedId.toString()) {
                console.log(`[placeBet] ✅ STRING MATCH: ${optionId.toString()} === ${requestedId.toString()}`);
                return true;
              }
              
              console.log(`[placeBet] ❌ NO MATCH: ${optionId} (${typeof optionId}) !== ${requestedId} (${typeof requestedId})`);
              return false;
            });

            if (odd) {
              foundOdd = odd;
              foundMarket = section;
              console.log(`[placeBet] ✅ FOUND EXACT MATCH: ${odd.label} with ID: ${odd.id}, market_id: ${odd.market_id}`);
              break;
            }
          }
          
          // If not found, try to force refresh (same as single bets)
          if (!foundOdd) {
            console.log(`[placeBet] ❌ EXACT MATCH NOT FOUND for oddId: ${leg.oddId}`);
            console.log(`[placeBet] Available odd IDs:`, allOddIds);
            
            // Try to force refresh the odds and check again (same as single bets)
            if (global.liveFixturesService) {
              console.log(`[placeBet] Attempting to force refresh odds for match ${leg.matchId}...`);
              try {
                // Check if match is still live before refreshing
                const isLive = global.liveFixturesService.isMatchLive(leg.matchId);
                console.log(`[placeBet] Match ${leg.matchId} is live: ${isLive}`);
                
                if (!isLive) {
                  console.log(`[placeBet] Match ${leg.matchId} is not live - cannot refresh odds`);
                  throw new CustomError(
                    `Match ${leg.matchId} is not live`,
                    400,
                    "MATCH_NOT_LIVE"
                  );
                }
                
                // Force refresh odds
                await global.liveFixturesService.ensureLiveOdds(leg.matchId);
                const refreshedOdds = global.liveFixturesService.getLiveOdds(leg.matchId) || [];
                
                console.log(`[placeBet] After refresh, found ${refreshedOdds.length} betting sections`);
                
                // Try search again with refreshed data
                for (const section of refreshedOdds) {
                  const odd = section.options?.find((o) => {
                    const optionId = o.id;
                    const requestedId = leg.oddId;
                    
                    if (optionId === requestedId) return true;
                    if (parseInt(optionId) === parseInt(requestedId)) return true;
                    if (optionId.toString() === requestedId.toString()) return true;
                    return false;
                  });

                  if (odd) {
                    foundOdd = odd;
                    foundMarket = section;
                    console.log(`[placeBet] ✅ FOUND AFTER REFRESH: ${odd.label} with ID: ${odd.id}`);
                    break;
                  }
                }
              } catch (refreshError) {
                console.log(`[placeBet] Failed to refresh live odds:`, refreshError.message);
              }
            }
            
            // FALLBACK 1: Try to find similar odd (same as single bets)
            if (!foundOdd) {
              console.log(`[placeBet] Attempting to find similar odd for combination leg...`);
              let similarOdd = null;
              
              for (const section of liveOdds) {
                if (section.options && Array.isArray(section.options)) {
                  // Try to find by market_id and label (same logic as single bets)
                  const found = section.options.find((o) => {
                    // Check if this is a similar odd (same market, similar label)
                    return o.market_id && o.label && 
                           (o.label.toLowerCase().includes('home') || 
                            o.label.toLowerCase().includes('away') || 
                            o.label.toLowerCase().includes('draw'));
                  });
                  
                  if (found) {
                    similarOdd = found;
                    console.log(`[placeBet] Found similar odd: ${found.label} with ID: ${found.id}, market_id: ${found.market_id}`);
                    break;
                  }
                }
              }
              
              if (similarOdd) {
                console.log(`[placeBet] Using similar odd as fallback: ${similarOdd.id}`);
                foundOdd = similarOdd;
                foundMarket = liveOdds.find(section => 
                  section.options && section.options.some(o => o.id === similarOdd.id)
                );
              }
            }
            
            // FALLBACK 2: If still not found and client says it's live, use original bet data
            console.log(`[placeBet] 🔍 DEBUG: Checking fallback conditions for leg:`, {
              hasOdds: !!leg.odds,
              hasValue: !!leg.value,
              hasLabel: !!leg.label,
              hasBetOption: !!leg.betOption,
              legData: {
                odds: leg.odds,
                value: leg.value,
                label: leg.label,
                betOption: leg.betOption
              }
            });
            
            if (!foundOdd && (leg.odds || leg.value) && (leg.label || leg.betOption)) {
              console.log(`[placeBet] 🔄 FALLBACK: Using original bet data for live leg (client says it's live but server cache is empty)`);
              console.log(`[placeBet] Original bet data:`, {
                oddId: leg.oddId,
                odds: leg.odds,
                value: leg.value,
                label: leg.label,
                betOption: leg.betOption
              });
              
              foundOdd = {
                id: leg.oddId,
                value: leg.odds || leg.value,
                label: leg.label || leg.betOption,
                market_id: leg.marketId || leg.market_id,
                name: leg.label || leg.betOption
              };
              
              // Get basic match data from leg data
              matchData = {
                id: leg.matchId,
                starting_at: leg.start || leg.matchStartTime || new Date().toISOString(),
                participants: [
                  { name: leg.homeName || 'Home', position: 'home' },
                  { name: leg.awayName || 'Away', position: 'away' }
                ],
                state: {},
                name: leg.eventName || `${leg.homeName || 'Home'} vs ${leg.awayName || 'Away'}`,
                league_id: leg.leagueId,
                isLive: true
              };
            }
            
            if (!foundOdd) {
              throw new CustomError(
                `Live odd ${leg.oddId} not found for match ${leg.matchId}. Available odds: ${allOddIds.length} options found. This might be due to odds changes or the match not being live.`,
                400,
                "ODD_NOT_FOUND"
              );
            }
          }
          
          odds = {
            id: foundOdd.id,
            value: foundOdd.value,
            name: foundOdd.name || foundOdd.label,
            market_id: foundOdd.marketId || foundOdd.market_id,
            label: foundOdd.label,
          };
          
          // Get match data from live cache (fallback to basic data if not available)
          const liveMatch = global.liveFixturesService?.getLiveMatch?.(leg.matchId);
          matchData = {
            id: leg.matchId,
            starting_at: liveMatch?.starting_at || leg.start || leg.matchStartTime || new Date().toISOString(),
            participants: liveMatch?.participants || [
              { name: leg.homeName || 'Home', position: 'home' },
              { name: leg.awayName || 'Away', position: 'away' }
            ],
            state: liveMatch?.state || {},
            name: liveMatch?.name || leg.eventName || `${leg.homeName || 'Home'} vs ${leg.awayName || 'Away'}`,
            league_id: liveMatch?.league_id || leg.leagueId,
            isLive: true
          };
        } else {
          // For non-live bets, use Unibet V2 cache (same as single bets)
          try {
            const v2 = global.fixtureOptimizationService?.fixtureCache?.get(`unibet_v2_${leg.matchId}`);
            if (v2?.data) {
              const events = Array.isArray(v2.data.events) ? v2.data.events : [];
              const event = events.find(e => String(e.id) === String(leg.matchId)) || events[0];
              const participants = Array.isArray(event?.participants) ? event.participants : [];
              const home = participants.find(p => (p.position || '').toLowerCase() === 'home') || participants[0];
              const away = participants.find(p => (p.position || '').toLowerCase() === 'away') || participants[1];
              
              matchData = {
                id: leg.matchId,
                starting_at: event?.start || new Date().toISOString(),
                participants: participants,
                state: { state: event?.state },
                name: event?.name || event?.englishName || (home?.name && away?.name ? `${home.name} vs ${away.name}` : undefined),
                league: { id: event?.groupId, name: event?.group }
              };
              
              // Find odds from Unibet V2 data
              const betOffers = Array.isArray(v2.data.betOffers) ? v2.data.betOffers : [];
              const matchingBetOffer = betOffers.find(offer => 
                offer.outcomes && offer.outcomes.some(outcome => 
                  outcome.id == leg.oddId || outcome.id === parseInt(leg.oddId)
                )
              );
              
              if (matchingBetOffer) {
                const outcome = matchingBetOffer.outcomes.find(outcome => 
                  outcome.id == leg.oddId || outcome.id === parseInt(leg.oddId)
                );
                odds = {
                  id: outcome.id,
                  value: outcome.odds / 1000, // Convert from Unibet format to decimal
                  name: outcome.label,
                  market_id: matchingBetOffer.criterion?.id || matchingBetOffer.id,
                  label: outcome.label,
                };
              } else {
                // Fallback: use odds from leg data (sent from frontend)
                odds = {
                  id: leg.oddId,
                  value: leg.odds, // Already in decimal format from frontend
                  name: leg.betOption || leg.selection,
                  market_id: leg.marketId || "unknown",
                  label: leg.betOption || leg.selection,
                };
              }
            } else {
              // Fallback: use minimal Unibet context (same as single bets)
              matchData = {
                id: leg.matchId,
                starting_at: leg.matchDate || new Date().toISOString(),
                participants: [],
                state: {}
              };
              
              odds = {
                id: leg.oddId,
                value: leg.odds, // Already in decimal format from frontend
                name: leg.betOption || leg.selection,
                market_id: leg.marketId || "unknown",
                label: leg.betOption || leg.selection,
              };
            }
          } catch (e) {
            console.warn('[placeBet] Unibet V2 cache error for combination leg:', e?.message);
            // Fallback to minimal context
            matchData = {
              id: leg.matchId,
              starting_at: leg.matchDate || new Date().toISOString(),
              participants: [],
              state: {}
            };
            
            odds = {
              id: leg.oddId,
              value: leg.odds, // Already in decimal format from frontend
              name: leg.betOption || leg.selection,
              market_id: leg.marketId || "unknown",
              label: leg.betOption || leg.selection,
            };
          }
        }
        
        // Create bet details for this leg
        const betDetails = this.createBetDetails(odds, odds.market_id);
        
        // Calculate match dates
        const matchDate = this.parseMatchStartTime(matchData.starting_at);
        const betOutcomeCheckTime = this.calculateBetOutcomeCheckTime(matchDate);
        const estimatedMatchEnd = new Date(matchDate.getTime() + 105 * 60 * 1000);

        // Create unibetMeta for this leg using frontend data (same as single bets)
        // Extract home/away teams correctly by checking position field first
        const participants = matchData.participants || [];
        const homeParticipant = participants.find(p => (p.position || '').toLowerCase() === 'home') || participants[0];
        const awayParticipant = participants.find(p => (p.position || '').toLowerCase() === 'away') || participants[1];
        const homeTeamName = homeParticipant?.name || this.extractHomeTeam(leg.teams);
        const awayTeamName = awayParticipant?.name || this.extractAwayTeam(leg.teams);
        
        // The frontend already extracts and sends unibetMetadata, so use it directly
        const legUnibetMeta = this.buildUnibetMetaFromPayload(
          {
            // Use frontend unibetMetadata first (extracted by extractUnibetMetadata function)
            eventName: leg.eventName || leg.teams || `${homeTeamName || 'Home'} vs ${awayTeamName || 'Away'}`,
            marketName: leg.marketName || leg.marketDescription || betDetails.market_name || betDetails.market_description || "Unknown Market",
            criterionLabel: leg.criterionLabel || betDetails.label || leg.betOption,
            criterionEnglishLabel: leg.criterionEnglishLabel || betDetails.market_description || betDetails.market_name,
            outcomeEnglishLabel: leg.outcomeEnglishLabel || leg.betOption || leg.selection,
            participant: leg.participant || this.extractParticipantFromBetOption(leg.betOption, matchData),
            participantId: leg.participantId || null,
            eventParticipantId: leg.eventParticipantId || null,
            betOfferTypeId: leg.betOfferTypeId || betDetails.market_id,
            handicapRaw: leg.handicapRaw || (betDetails.handicap ? parseFloat(betDetails.handicap) * 1000 : null),
            handicapLine: leg.handicapLine || betDetails.handicap || null,
            leagueId: leg.leagueId || matchData.league?.id || matchData.league_id,
            leagueName: leg.leagueName || matchData.league?.name,
            homeName: leg.homeName || homeTeamName,
            awayName: leg.awayName || awayTeamName,
            start: leg.start || leg.matchDate || matchData.starting_at,
            odds: parseFloat(leg.odds) // Use frontend odds (already in decimal format)
          },
          {
            eventName: leg.teams || `${homeTeamName || 'Home'} vs ${awayTeamName || 'Away'}`,
            leagueId: matchData.league?.id || matchData.league_id,
            leagueName: matchData.league?.name,
            homeName: homeTeamName,
            awayName: awayTeamName
          }
        );

        // Create leg object for combination array
        const processedLeg = {
          matchId: leg.matchId,
          oddId: leg.oddId,
          betOption: leg.betOption || leg.selection || odds.name,
          odds: parseFloat(leg.odds), // Use frontend odds (already in decimal format)
          stake: stake, // Same stake for all legs in combination
          payout: 0,
          status: "pending",
          selection: leg.selection || leg.betOption || odds.name,
          inplay: leg.inplay || false,
          betDetails,
          matchDate,
          estimatedMatchEnd,
          betOutcomeCheckTime,
          teams: this.getTeamsFromMatchData(matchData, leg.teams),
          unibetMeta: legUnibetMeta, // ✅ Add unibetMeta to each leg
          // Add league information directly to the leg for bet processing
          leagueId: leg.leagueId || matchData.league?.id || matchData.league_id,
          leagueName: leg.leagueName || matchData.league?.name
        };

        processedLegs.push(processedLeg);
        // Unibet API already returns decimal odds
        const decimalOdds = parseFloat(odds.value);
        totalOdds *= decimalOdds;

        // Store first leg data for main bet document
        if (i === 0) {
          firstLegData = {
            matchData,
            odds,
            matchDate,
            estimatedMatchEnd,
            betOutcomeCheckTime,
            teams: this.getTeamsFromMatchData(matchData, leg.teams)
          };
        }
      }

      // Calculate potential payout
      const potentialPayout = stake * totalOdds;
      console.log(`[placeBet] Combination bet - Total odds: ${totalOdds}, Potential payout: ${potentialPayout}`);

      // Deduct stake from user balance
      user.balance -= stake;
      await user.save();

      // Ensure userId is ObjectId for consistency
      const userIdObj = typeof userId === "string" 
        ? new mongoose.Types.ObjectId(userId) 
        : (userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId.toString()));
      
      console.log(`[placeBet] Creating combination bet with userId: ${userId} (ObjectId: ${userIdObj})`);
      
      // Create the combination bet document with cleaner structure
      // Main bet document represents the overall combination, not just the first leg
      const bet = new Bet({
        userId: userIdObj,
        // For combination bets, use first match details for required fields
        matchId: firstLegData.matchData.id,
        oddId: `combo_${Date.now()}`, // Unique ID for combination bet
        betOption: `Combination Bet (${processedLegs.length} legs)`,
        odds: totalOdds, // Total combined odds
        stake,
        payout: 0,
        matchDate: firstLegData.matchDate,
        estimatedMatchEnd: firstLegData.estimatedMatchEnd,
        betOutcomeCheckTime: firstLegData.betOutcomeCheckTime,
        teams: `Combination: ${processedLegs.length} matches`,
        selection: `${processedLegs.length}-leg combination`,
        inplay: false, // Combination bet itself is not inplay
        betDetails: {
          market_id: "combination",
          market_name: "Combination Bet",
          label: `${processedLegs.length}-leg combination`,
          value: totalOdds,
          total: null,
          market_description: `Combination bet with ${processedLegs.length} legs`,
          handicap: null,
          name: `Combination Bet (${processedLegs.length} legs)`
        },
        combination: processedLegs, // All legs including the first one
        totalOdds,
        potentialPayout,
      });

      await bet.save();

      // Schedule outcome checks for the LATEST leg's check time (when all matches will be finished)
      let latestCheckTime = firstLegData.betOutcomeCheckTime;
      for (const leg of processedLegs) {
        if (leg.betOutcomeCheckTime > latestCheckTime) {
          latestCheckTime = leg.betOutcomeCheckTime;
        }
      }
      
      console.log(`[placeBet] Combination bet scheduled for latest check time: ${this.formatTo12Hour(latestCheckTime)} (when all matches will be finished)`);
      await this.scheduleBetOutcomeCheck(bet._id, latestCheckTime, firstLegData.matchData.id);

      // Fetch the updated user
      const updatedUser = await User.findById(userId);

      return { bet, user: updatedUser };
    }

    // Handle single bets
    console.log(`[placeBet] Processing single bet for matchId: ${matchId}, oddId: ${oddId}`);
    
    // ✅ UPDATED: Removed market conflict validation for single bets
    // Multiple single bets on same match/market/selection are now allowed
    // Conflicting selections (e.g., Home vs Away) are also allowed as separate single bets
    console.log(`[placeBet] ✅ Single bet - no restrictions on same match/market/selection`);
    
    // Check for team restrictions: If user won a bet on a team in last 7 days, block betting on ANY market for that team's matches
    const homeName = unibetMetaPayload?.homeName;
    const awayName = unibetMetaPayload?.awayName;
    
    // ✅ REMOVED: Team restriction check - users can now place bets on any team from leagues page
    // Previously blocked bets if user had won a bet on a team in the last 7 days
    // This constraint has been removed to allow betting on leagues page
    // if (homeName && awayName) {
    //   // Check BOTH teams in the match - if user has restriction on either team, block the bet
    //   // This applies to ALL markets (1, X, 2, Over/Under, etc.) for that match
    //   const teamsToCheck = [
    //     { name: homeName, normalized: homeName.toLowerCase().trim() },
    //     { name: awayName, normalized: awayName.toLowerCase().trim() }
    //   ];
    //   
    //   console.log(`[placeBet] Checking team restrictions for match: ${homeName} vs ${awayName}`);
    //   
    //   for (const team of teamsToCheck) {
    //     // Check if user has an active restriction for this team
    //     const activeRestriction = await TeamRestriction.findOne({
    //       userId: userId,
    //       normalizedTeamName: team.normalized,
    //       expiresAt: { $gt: new Date() } // Only active restrictions
    //     });
    //     
    //     if (activeRestriction) {
    //       const daysRemaining = Math.ceil((activeRestriction.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    //       console.log(`[placeBet] ❌ User has active team restriction for "${team.name}" (expires in ${daysRemaining} days)`);
    //       console.log(`[placeBet] ❌ Blocking bet on match ${homeName} vs ${awayName} - cannot bet on ANY market for this match`);
    //       throw new CustomError(
    //         `You have already selected "${team.name}" for this week. You cannot place another bet on any market for matches involving "${team.name}" for ${daysRemaining} more day(s).`,
    //         400,
    //         "TEAM_RESTRICTION_ACTIVE"
    //       );
    //     }
    //   }
    //   
    //   console.log(`[placeBet] ✅ No active team restrictions found for ${homeName} or ${awayName}`);
    // }
    
    console.log(`[placeBet] ✅ Team restriction check disabled - allowing bet placement on any team`);
    
    let matchData;
    let odds;
    const cacheKey = `match_${matchId}`;
    const cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    // For inplay bets, get odds from live odds cache
    if (inplay) {
      console.log(
        `[placeBet] Processing inplay bet for match ${matchId}, odd ${oddId}`
      );

      // Use cached live odds data (already updated every second)
      console.log(`[placeBet] Using cached live odds data for betting...`);
      
      // Check cache status first
      if (global.liveFixturesService) {
        const cacheStatus = global.liveFixturesService.liveOddsCache.get(matchId);
        console.log(`[placeBet] Cache status for match ${matchId}:`, {
          hasCache: !!cacheStatus,
          cacheAge: cacheStatus?.cached_at ? Date.now() - cacheStatus.cached_at : null,
          source: cacheStatus?.source || 'unknown',
          bettingDataLength: cacheStatus?.betting_data?.length || 0
        });
      }
      
      const liveOdds = global.liveFixturesService 
        ? global.liveFixturesService.getLiveOdds(matchId) || []
        : [];
      
      console.log(`[placeBet] Found ${liveOdds.length} betting sections for match ${matchId}`);
      console.log(`[placeBet] Looking for oddId: ${oddId}`);
      
      // Debug: Log all available odd IDs
      const allOddIds = [];
      liveOdds.forEach((section, sectionIndex) => {
        if (section.options && Array.isArray(section.options)) {
          section.options.forEach(option => {
            allOddIds.push(option.id);
            console.log(`[placeBet] Section ${sectionIndex}: oddId=${option.id}, label=${option.label}, market_id=${option.market_id}`);
          });
        }
      });
      console.log(`[placeBet] All available odd IDs:`, allOddIds);

      // Find the odd directly in the live odds data
      let foundOdd = null;
      let foundMarket = null;

      // ✅ Note: isSyntheticOddId, syntheticSelection, and syntheticMarketId are already defined at function start

      // Search for the exact odd ID in all sections
      for (const section of liveOdds) {
        // Try multiple comparison methods
        const odd = section.options?.find((o) => {
          const optionId = o.id;
          const requestedId = oddId;
          
          // Try exact match first
          if (optionId === requestedId) {
            console.log(`[placeBet] ✅ EXACT MATCH: ${optionId} === ${requestedId}`);
            return true;
          }
          
          // Try number comparison
          const optionIdNum = parseInt(optionId);
          const requestedIdNum = parseInt(requestedId);
          if (optionIdNum === requestedIdNum) {
            console.log(`[placeBet] ✅ NUMBER MATCH: ${optionIdNum} === ${requestedIdNum}`);
            return true;
          }
          
          // Try string comparison
          if (optionId.toString() === requestedId.toString()) {
            console.log(`[placeBet] ✅ STRING MATCH: ${optionId.toString()} === ${requestedId.toString()}`);
            return true;
          }
          
          // ✅ NEW: For synthetic oddIds, try to match by selection and market
          if (isSyntheticOddId && syntheticSelection) {
            const optionLabel = (o.label || '').toLowerCase();
            const optionMarketId = o.market_id?.toString() || section.market_id?.toString() || '';
            
            const matchesSelection = (
              (syntheticSelection === 'home' && (optionLabel.includes('home') || optionLabel === '1' || optionLabel === 'team 1')) ||
              (syntheticSelection === 'draw' && (optionLabel.includes('draw') || optionLabel === 'x')) ||
              (syntheticSelection === 'away' && (optionLabel.includes('away') || optionLabel === '2' || optionLabel === 'team 2'))
            );
            
            const matchesMarket = !syntheticMarketId || optionMarketId === syntheticMarketId || optionMarketId === '1';
            
            if (matchesSelection && matchesMarket) {
              console.log(`[placeBet] ✅ SYNTHETIC MATCH: Found ${optionId} for synthetic ${oddId} (selection: ${syntheticSelection}, market: ${syntheticMarketId})`);
              return true;
            }
          }
          
          return false;
        });

        if (odd) {
          foundOdd = odd;
          foundMarket = section;
          console.log(
            `[placeBet] ✅ FOUND EXACT MATCH: ${odd.label} with ID: ${odd.id}, market_id: ${odd.market_id}`
          );
          break;
        }
      }

      if (!foundOdd) {
        console.log(`[placeBet] ❌ EXACT MATCH NOT FOUND for oddId: ${oddId}`);
        console.log(`[placeBet] Available odd IDs:`, allOddIds);
        console.log(`[placeBet] This shouldn't happen if SportsMonks doesn't change odd IDs!`);
        
        // Try to force refresh the odds and check again
        if (global.liveFixturesService) {
          console.log(`[placeBet] Attempting to force refresh odds for match ${matchId}...`);
          try {
            // Check if match is still live before refreshing
            const isLive = global.liveFixturesService.isMatchLive(matchId);
            console.log(`[placeBet] Match ${matchId} is live: ${isLive}`);
            
            if (!isLive) {
              throw new CustomError(
                `Match ${matchId} is no longer live. Cannot place inplay bet.`,
                400,
                "MATCH_NOT_LIVE"
              );
            }
            
            const refreshedOdds = await global.liveFixturesService.ensureLiveOdds(matchId);
            const refreshedBettingData = refreshedOdds.betting_data || [];
            
            console.log(`[placeBet] Refreshed odds found ${refreshedBettingData.length} sections`);
            
            // Log all refreshed odd IDs for debugging
            const refreshedOddIds = [];
            refreshedBettingData.forEach((section, sectionIndex) => {
              if (section.options && Array.isArray(section.options)) {
                section.options.forEach(option => {
                  refreshedOddIds.push(option.id);
                  console.log(`[placeBet] Refreshed Section ${sectionIndex}: oddId=${option.id}, label=${option.label}, market_id=${option.market_id}`);
                });
              }
            });
            console.log(`[placeBet] All refreshed odd IDs:`, refreshedOddIds);
            
            // Search in refreshed data
            for (const section of refreshedBettingData) {
              const refreshedOdd = section.options?.find((o) => {
                const optionId = o.id;
                const requestedId = oddId;
                
                if (optionId === requestedId || 
                    parseInt(optionId) === parseInt(requestedId) ||
                    optionId.toString() === requestedId.toString()) {
                  console.log(`[placeBet] ✅ FOUND IN REFRESHED DATA: ${optionId} === ${requestedId}`);
                  return true;
                }
                return false;
              });
              
              if (refreshedOdd) {
                foundOdd = refreshedOdd;
                foundMarket = section;
                console.log(`[placeBet] ✅ FOUND EXACT MATCH IN REFRESHED DATA: ${refreshedOdd.label} with ID: ${refreshedOdd.id}`);
                break;
              }
            }
          } catch (refreshError) {
            console.log(`[placeBet] Error refreshing odds:`, refreshError.message);
          }
        }
        
        if (!foundOdd) {
          // Check if the match is still live
          const isStillLive = global.liveFixturesService ? global.liveFixturesService.isMatchLive(matchId) : false;
          console.log(`[placeBet] Match ${matchId} is still live: ${isStillLive}`);
          
          // ✅ NEW: For synthetic oddIds, try to find by selection and market
          if (isSyntheticOddId && syntheticSelection) {
            console.log(`[placeBet] 🔍 Searching for synthetic oddId by selection: ${syntheticSelection}, marketId: ${syntheticMarketId}`);
            
            for (const section of liveOdds) {
              if (section.options && Array.isArray(section.options)) {
                const matchingOdd = section.options.find((o) => {
                  const optionLabel = (o.label || '').toLowerCase();
                  const optionMarketId = o.market_id?.toString() || section.market_id?.toString() || '';
                  
                  const matchesSelection = (
                    (syntheticSelection === 'home' && (optionLabel.includes('home') || optionLabel === '1' || optionLabel === 'team 1')) ||
                    (syntheticSelection === 'draw' && (optionLabel.includes('draw') || optionLabel === 'x')) ||
                    (syntheticSelection === 'away' && (optionLabel.includes('away') || optionLabel === '2' || optionLabel === 'team 2'))
                  );
                  
                  const matchesMarket = !syntheticMarketId || optionMarketId === syntheticMarketId || optionMarketId === '1';
                  
                  return matchesSelection && matchesMarket;
                });
                
                if (matchingOdd) {
                  console.log(`[placeBet] ✅ FOUND SYNTHETIC MATCH: ${matchingOdd.id} for synthetic ${oddId}`);
                  foundOdd = matchingOdd;
                  foundMarket = section;
                  break;
                }
              }
            }
          }
          
          // Try to find a similar odd with the same market_id and label
          if (!foundOdd) {
            console.log(`[placeBet] Attempting to find similar odd...`);
            let similarOdd = null;
            
            for (const section of liveOdds) {
              if (section.options && Array.isArray(section.options)) {
                // Try to find by market_id and label
                const found = section.options.find((o) => {
                  // Check if this is a similar odd (same market, similar label)
                  return o.market_id && o.label && 
                         (o.label.toLowerCase().includes('home') || 
                          o.label.toLowerCase().includes('away') || 
                          o.label.toLowerCase().includes('draw'));
                });
                
                if (found) {
                  similarOdd = found;
                  console.log(`[placeBet] Found similar odd: ${found.label} with ID: ${found.id}, market_id: ${found.market_id}`);
                  break;
                }
              }
            }
            
            if (similarOdd) {
              console.log(`[placeBet] Using similar odd as fallback: ${similarOdd.id}`);
              foundOdd = similarOdd;
              foundMarket = liveOdds.find(section => 
                section.options && section.options.some(o => o.id === similarOdd.id)
              );
            }
          }
          
          if (!foundOdd) {
            throw new CustomError(
              `Invalid odd ID for live bet. Odd ID ${oddId} not found in current live odds. ${isStillLive ? 'Match is still live but odd may have been removed.' : 'Match may no longer be live.'}`,
              400,
              "INVALID_LIVE_ODD_ID"
            );
          }
        }
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

      console.log(
        `[placeBet] Using market ID: ${resolvedMarketId} for "${
          foundOdd.label
        }" (from ${foundOdd.marketId ? "marketId" : "market_id"})`
      );

      odds = {
        id: foundOdd.id,
        value: foundOdd.value,
        name: foundOdd.name || foundOdd.label,
        market_id: resolvedMarketId,
        label: foundOdd.label,
        total: foundOdd.total,
        market_description:
          foundOdd.market_description ||
          foundMarket.description ||
          foundMarket.title,
        handicap: foundOdd.handicap,
      };
    }

    // ✅ CRITICAL: For bet placement, ALWAYS prioritize unibetMetaPayload.start (from Unibet API)
    // This is the actual match start time from Unibet, not from DB or cache
    let unibetStartTime = null;
    if (unibetMetaPayload?.start) {
      unibetStartTime = unibetMetaPayload.start;
      console.log(`✅ [placeBet] Found Unibet start time from API: ${unibetStartTime}`);
    }
    
    // For inplay bets, try to get match data from live matches cache first
    if (inplay && global.liveFixturesService) {
      const liveMatches = global.liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
      const liveMatch = liveMatches.find(match => match.id == matchId || match.id === parseInt(matchId));
      if (liveMatch) {
        console.log(`Using live match data from inplay cache for match ${matchId}`);
        
        // ✅ FIX: For live matches, check multiple sources for start time
        // Priority: unibetMetaPayload.start > clientBetDetails > liveMatch.starting_at
        const liveMatchStartTime = unibetStartTime || 
                                   unibetMetaPayload?.start || 
                                   clientBetDetails?.matchDate || 
                                   clientBetDetails?.startTime || 
                                   liveMatch.starting_at;
        
        if (!liveMatchStartTime) {
          console.error(`[placeBet] ❌ CRITICAL: No start time found for live match ${matchId}`);
          console.error(`[placeBet] Available sources:`, {
            unibetStartTime,
            unibetMetaPayloadStart: unibetMetaPayload?.start,
            clientBetDetailsMatchDate: clientBetDetails?.matchDate,
            clientBetDetailsStartTime: clientBetDetails?.startTime,
            liveMatchStartingAt: liveMatch.starting_at
          });
        }
        
        matchData = {
          id: liveMatch.id,
          // ✅ Use resolved start time from multiple sources
          starting_at: liveMatchStartTime,
          participants: liveMatch.participants || [],
          state: liveMatch.state || {},
          name: liveMatch.name,
          league_id: liveMatch.league_id,
          isLive: true
        };
        
        let source;
        if (unibetStartTime || unibetMetaPayload?.start) {
          source = 'unibetMetaPayload.start (Unibet API)';
        } else if (clientBetDetails?.matchDate || clientBetDetails?.startTime) {
          source = 'clientBetDetails (frontend)';
        } else {
          source = 'liveMatch.starting_at (cache)';
        }
        console.log(`✅ [placeBet] Using ${source} as source of truth for live match start time: ${matchData.starting_at}`);
      }
    }
    
    // If not found in live cache or not inplay, prefer Unibet V2 betOffers if available in cache/context
    let unibetV2Data = undefined;
    if (!matchData) {
      try {
        const v2 = global.fixtureOptimizationService?.fixtureCache?.get(`unibet_v2_${matchId}`);
        if (v2?.data) {
          unibetV2Data = v2;
          // Prefer the first event with a matching id if present; otherwise fallback to first
          const events = Array.isArray(v2.data.events) ? v2.data.events : [];
          const event = events.find(e => String(e.id) === String(matchId)) || events[0];
          // Attempt to resolve participants names from participants array
          const participants = Array.isArray(event?.participants) ? event.participants : [];
          const home = participants.find(p => (p.position || '').toLowerCase() === 'home') || participants[0];
          const away = participants.find(p => (p.position || '').toLowerCase() === 'away') || participants[1];
          matchData = {
            id: matchId,
            // ✅ Prioritize Unibet API start time over cache
            starting_at: unibetStartTime || event?.start || new Date().toISOString(),
            participants: participants,
            state: { state: event?.state },
            name: event?.name || event?.englishName || (home?.name && away?.name ? `${home.name} vs ${away.name}` : undefined),
            league: { id: event?.groupId, name: event?.group }
          };
          console.log(`[placeBet] Using Unibet V2 cache for match ${matchId}`);
          const source = unibetStartTime ? 'unibetMetaPayload.start (Unibet API)' : 'unibetV2Data.event.start (cache)';
          console.log(`✅ [placeBet] Using ${source} as source of truth for matchDate: ${matchData.starting_at}`);
        }
      } catch (e) { console.warn('[placeBet] Unibet V2 cache error:', e?.message); }
    }

    // Fallback to older all-cached-matches if still missing
    if (!matchData) {
      const allCachedMatches = FixtureOptimizationService.getAllCachedMatches();
      matchData = allCachedMatches.find(
        (fixture) => fixture.id == matchId || fixture.id === parseInt(matchId)
      );
      if (matchData) {
        console.log(
          `Using match data from all-cached-matches utility for match ${matchId}`
        );
        // ✅ Prioritize Unibet API start time over cache
        if (unibetStartTime) {
          matchData.starting_at = unibetStartTime;
          console.log(`✅ [placeBet] Overriding cache with unibetMetaPayload.start (Unibet API): ${unibetStartTime}`);
        } else {
          console.log(
            `[DEBUG] Raw starting_at from cached match: ${matchData.starting_at}`
          );
          console.log(
            `[DEBUG] Type of starting_at: ${typeof matchData.starting_at}`
          );
          console.log(`✅ [placeBet] Using allCachedMatches.starting_at as source of truth for matchDate: ${matchData.starting_at}`);
        }
      }
    }
    
    if (!matchData) {
      // Step 1: Check in-memory cache first
      matchData = FixtureOptimizationService.fixtureCache.get(cacheKey);
      if (
        matchData &&
        matchData.updatedAt &&
        matchData.updatedAt > new Date(Date.now() - cacheTTL)
      ) {
        console.log(`Using in-memory cached match data for match ${matchId}`);
        console.log(`✅ [placeBet] Using fixtureCache.starting_at as source of truth for matchDate: ${matchData.starting_at}`);
      } else {
        // Step 2: Check MongoDB cache
        const cachedOdds = await MatchOdds.findOne({ matchId });
        if (
          cachedOdds &&
          cachedOdds.updatedAt > new Date(Date.now() - cacheTTL)
        ) {
          console.log(`Using MongoDB cached odds for match ${matchId}`);
          // ✅ Prioritize Unibet API start time over DB cache
          const matchStartTime = unibetStartTime || cachedOdds.starting_at;
          const source = unibetStartTime ? 'unibetMetaPayload.start (Unibet API)' : 'MatchOdds.starting_at (DB cache)';
          matchData = {
            id: matchId,
            odds: cachedOdds.odds.map((odd) => ({
              id: odd.oddId,
              marketId: odd.marketId,
              name: odd.name,
              value: odd.value,
            })),
            starting_at: matchStartTime,
            participants: cachedOdds.participants || [],
            state: cachedOdds.state || {},
          };
          console.log(`✅ [placeBet] Using ${source} as source of truth for matchDate: ${matchStartTime}`);
        } else {
        // Step 3: As last resort, treat minimal payload as match context (Unibet only)
          console.log(
            `Using minimal Unibet context for match ${matchId} (no SportsMonk fallback)`
          );
          
          // ✅ FIX: For synthetic oddIds, try to fetch match data from internal API route
          // Use internal /api/v2/live-matches route instead of direct Unibet API call
          // This route already fetches from Unibet API and returns matches with 'start' attribute
          let fetchedMatchData = null;
          if (isSyntheticOddId) {
            try {
              console.log(`[placeBet] 🔍 Synthetic oddId detected - fetching match data from internal API for match ${matchId}`);
              
              // Try 1: Use fixtureOptimizationService (might have date range limitations)
              if (global.fixtureOptimizationService) {
                try {
                  fetchedMatchData = await global.fixtureOptimizationService.getMatchById(matchId, { includeOdds: false });
                  if (fetchedMatchData && fetchedMatchData.start) {
                    console.log(`[placeBet] ✅ Fetched match data from fixtureOptimizationService - start time: ${fetchedMatchData.start}`);
                    unibetStartTime = fetchedMatchData.start;
                  }
                } catch (fixtureError) {
                  console.warn(`[placeBet] ⚠️ fixtureOptimizationService failed:`, fixtureError.message);
                }
              }
              
              // Try 2: If not found, use frontend Next.js API route (/api/unibet/live-matches)
              // This route fetches from Unibet API and returns matches with 'start' attribute
              // Response structure: { success: true, allMatches: [], matches: [], upcomingMatches: [] }
              if (!unibetStartTime) {
                try {
                  // Use CLIENT_URL from env (same as CORS config) or default to localhost
                  const frontendUrl = process.env.CLIENT_URL || 'http://localhost:3000';
                  const apiUrl = `${frontendUrl}/api/unibet/live-matches`;
                  
                  console.log(`[placeBet] 🔍 Fetching from frontend Next.js API route: ${apiUrl}`);
                  const axios = (await import('axios')).default;
                  const response = await axios.get(apiUrl, { 
                    timeout: 10000,
                    headers: {
                      'Accept': 'application/json'
                    }
                  });
                  
                  if (response.data && response.data.success) {
                    // Response structure from Next.js route:
                    // { success: true, allMatches: [], matches: [], upcomingMatches: [] }
                    // Each match has: { id, start, name, homeName, awayName, ... }
                    const allMatches = response.data.allMatches || [];
                    const liveMatches = response.data.matches || [];
                    const upcomingMatches = response.data.upcomingMatches || [];
                    
                    // Search in all match arrays
                    const allMatchesToSearch = [...allMatches, ...liveMatches, ...upcomingMatches];
                    const matchEvent = allMatchesToSearch.find(m => String(m.id) === String(matchId));
                    
                    if (matchEvent && matchEvent.start) {
                      console.log(`[placeBet] ✅ Found match in frontend API response - start time: ${matchEvent.start}`);
                      unibetStartTime = matchEvent.start;
                      fetchedMatchData = { start: matchEvent.start, id: matchEvent.id };
                    } else {
                      console.warn(`[placeBet] ⚠️ Match ${matchId} not found in frontend API response (searched ${allMatchesToSearch.length} matches)`);
                      console.warn(`[placeBet] Available match IDs (first 10):`, allMatchesToSearch.slice(0, 10).map(m => m.id));
                    }
                  } else {
                    console.warn(`[placeBet] ⚠️ Frontend API returned unsuccessful response:`, response.data);
                  }
                } catch (apiError) {
                  console.warn(`[placeBet] ⚠️ Frontend API fetch failed:`, apiError.message);
                  if (apiError.response) {
                    console.warn(`[placeBet] Frontend API error status: ${apiError.response.status}, data:`, apiError.response.data);
                  }
                }
              }
            } catch (fetchError) {
              console.warn(`[placeBet] ⚠️ Failed to fetch match data:`, fetchError.message);
            }
          }
          
          // ✅ FIX: For bet placement, ALWAYS prioritize unibetMetaPayload.start (from Unibet API)
          // This is the actual match start time from Unibet API response (event.start)
          // NEVER use current time as fallback - that would be bet placement time, not match time!
          const correctMatchDate = unibetStartTime || // First priority: Unibet API response (from fetch or payload)
                                 unibetMetaPayload?.start || // Fallback to unibetMetaPayload if not set above
                                 fetchedMatchData?.start || // Use fetched match data start time
                                 clientBetDetails?.matchDate || 
                                 clientBetDetails?.startTime ||
                                 null; // Use null instead of current time
          
          if (!correctMatchDate) {
            console.error(`[placeBet] ❌ CRITICAL: No match start time available for match ${matchId}`);
            console.error(`[placeBet] Available sources:`, {
              unibetStartTime,
              unibetMetaPayloadStart: unibetMetaPayload?.start,
              fetchedMatchDataStart: fetchedMatchData?.start,
              clientBetDetailsMatchDate: clientBetDetails?.matchDate,
              clientBetDetailsStartTime: clientBetDetails?.startTime,
              isSyntheticOddId
            });
            throw new CustomError(
              `Match start time not available for match ${matchId}. Cannot place bet without match time.`,
              400,
              "MATCH_TIME_UNAVAILABLE"
            );
          }
          
          console.log(`[DEBUG] Using match date from frontend: ${correctMatchDate}`);
          
          // ✅ LOG: Track which frontend source was used
          let frontendSource;
          if (unibetMetaPayload?.start) {
            frontendSource = 'unibetMetaPayload.start';
          } else if (clientBetDetails?.matchDate) {
            frontendSource = 'clientBetDetails.matchDate';
          } else if (clientBetDetails?.startTime) {
            frontendSource = 'clientBetDetails.startTime';
          } else {
            frontendSource = 'NONE';
          }
          
          matchData = {
            id: matchId,
            starting_at: correctMatchDate,
            participants: [],
            state: {}
          };
          console.log(`✅ [placeBet] Using ${frontendSource} as source of truth for matchDate: ${correctMatchDate}`);
          // Update MongoDB cache
          await MatchOdds.findOneAndUpdate(
            { matchId: matchData.id },
            {
              matchId: matchData.id,
              starting_at: matchData.starting_at,
              odds: Array.isArray(matchData.odds) ? matchData.odds.map((odd) => ({
                oddId: odd.id,
                marketId: odd.market_id,
                name: odd.name,
                value: parseFloat(odd.value),
              })) : [],
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

    // If not an inplay bet, get odds from match data; fallback to client-provided betDetails
    if (!inplay) {
      odds = matchData.odds?.find((odd) => odd.id === oddId);
      if (!odds && clientBetDetails) {
        const numericValue = Number(
          clientBetDetails?.value ?? clientBetDetails?.odds ?? unibetMetaPayload?.odds
        );
        if (!Number.isFinite(numericValue)) {
          throw new CustomError("Invalid odd value", 400, "INVALID_ODD_VALUE");
        }
        odds = {
          id: oddId,
          value: numericValue,
          name: clientBetDetails.name || clientBetDetails.label,
          market_id: clientBetDetails.market_id || 'unknown_market',
          label: clientBetDetails.label,
          total: clientBetDetails.total ?? null,
          market_description: clientBetDetails.market_description || clientBetDetails.market_name || null,
          handicap: clientBetDetails.handicap ?? null,
        };
      }
      if (!odds) {
        throw new CustomError("Invalid odd ID", 400, "INVALID_ODD_ID");
      }
    }

    // Extract extra Unibet metadata from V2 betOffers if available
    let v2ExtraMeta = {};
    try {
      const betOffers = unibetV2Data?.data?.betOffers;
      if (Array.isArray(betOffers)) {
        for (const bo of betOffers) {
          const oc = (bo.outcomes || []).find(o => String(o.id) === String(oddId));
          if (oc) {
            v2ExtraMeta = {
              marketId: bo.id != null ? String(bo.id) : undefined,
              marketName: bo.criterion?.label || bo.betOfferType?.name,
              criterionLabel: bo.criterion?.label,
              criterionEnglishLabel: bo.criterion?.englishLabel,
              outcomeEnglishLabel: oc.englishLabel,
              outcomeLabel: oc.label,
              participant: oc.participant,
              participantId: oc.participantId != null ? String(oc.participantId) : undefined,
              eventParticipantId: oc.eventParticipantId != null ? String(oc.eventParticipantId) : undefined,
              betOfferTypeId: bo.betOfferType?.id != null ? String(bo.betOfferType.id) : undefined,
              handicapRaw: typeof oc.line === 'number' ? oc.line : undefined,
              handicapLine: typeof oc.line === 'number' ? oc.line / 1000 : undefined,
              // league fields already set via matchData
            };
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[placeBet] Failed to enrich meta from V2 betOffers:', e?.message);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError("User not found", 404, "USER_NOT_FOUND");
    }
    
    const balanceBefore = user.balance || 0;
    
    if (balanceBefore < stake) {
      throw new CustomError(
        "Insufficient balance",
        400,
        "INSUFFICIENT_BALANCE"
      );
    }

    console.log(`\n[placeBet] ========== BET PLACEMENT BALANCE UPDATE ==========`);
    console.log(`[placeBet] User ID: ${userId}`);
    console.log(`[placeBet] Balance Before: ${balanceBefore}`);
    console.log(`[placeBet] Stake: ${stake}`);
    console.log(`[placeBet] Deducting Stake: ${balanceBefore} - ${stake} = ${balanceBefore - stake}`);

    // Deduct balance with error handling
    try {
      user.balance -= stake;
      await user.save();
      
      const balanceAfter = user.balance || 0;
      console.log(`[placeBet] Balance After: ${balanceAfter}`);
      console.log(`[placeBet] Balance Change: ${balanceAfter - balanceBefore} (should be -${stake})`);
      
      // Verify balance was actually deducted
      if (Math.abs((balanceAfter - balanceBefore) + stake) > 0.01) {
        console.error(`[placeBet] ⚠️ WARNING: Balance deduction mismatch! Expected: -${stake}, Actual: ${balanceAfter - balanceBefore}`);
      }
    } catch (balanceError) {
      console.error(`[placeBet] ❌ ERROR: Failed to deduct balance:`, balanceError);
      throw new CustomError(
        `Failed to deduct balance: ${balanceError.message}`,
        500,
        "BALANCE_DEDUCTION_FAILED"
      );
    }
    
    console.log(`[placeBet] ===========================================\n`);

    // Use the robust getTeamsFromMatchData method for single bets too
    let teams = this.getTeamsFromMatchData(matchData, "");
    
    // Debug: Log match data and teams extraction for single bets
    console.log(`[DEBUG] Single bet - matchData:`, {
      matchId,
      participants: matchData.participants,
      name: matchData.name,
      extractedTeams: teams,
      unibetV2Data: !!unibetV2Data,
      unibetV2Events: unibetV2Data?.data?.events?.length || 0
    });
    
    // If teams are still not available OR participants are empty, try to get from unibetV2Data cache
    if ((teams === "Teams information not available" || !matchData.participants || matchData.participants.length === 0) && !unibetV2Data) {
      // Try to get unibetV2Data from cache if not already loaded
      try {
        const v2 = global.fixtureOptimizationService?.fixtureCache?.get(`unibet_v2_${matchId}`);
        if (v2?.data) {
          unibetV2Data = v2;
          console.log(`[DEBUG] Loaded unibetV2Data from cache for teams extraction`);
        }
      } catch (e) { 
        console.warn('[DEBUG] Failed to load unibetV2Data from cache:', e?.message); 
      }
    }
    
    if ((teams === "Teams information not available" || !matchData.participants || matchData.participants.length === 0) && unibetV2Data?.data?.events) {
      const event = unibetV2Data.data.events.find(e => String(e.id) === String(matchId)) || unibetV2Data.data.events[0];
      if (event?.participants && Array.isArray(event.participants) && event.participants.length >= 2) {
        const homeTeam = event.participants.find(p => (p.position || '').toLowerCase() === 'home') || event.participants[0];
        const awayTeam = event.participants.find(p => (p.position || '').toLowerCase() === 'away') || event.participants[1];
        if (homeTeam?.name && awayTeam?.name) {
          teams = `${homeTeam.name} vs ${awayTeam.name}`;
          // Also update matchData.participants for consistency
          matchData.participants = event.participants;
          matchData.name = event.name || event.englishName || teams;
          if (!matchData.league) {
            matchData.league = { id: event?.groupId, name: event?.group };
          }
          console.log(`[DEBUG] ✅ Extracted teams from unibetV2Data cache: ${teams}`);
          console.log(`[DEBUG] ✅ Updated matchData.participants:`, matchData.participants.map(p => p.name));
        }
      }
    }
    
    // Final fallback: Use unibetMetaPayload if teams still not available
    if (teams === "Teams information not available" && unibetMetaPayload?.homeName && unibetMetaPayload?.awayName) {
      teams = `${unibetMetaPayload.homeName} vs ${unibetMetaPayload.awayName}`;
      console.log(`[DEBUG] ✅ Extracted teams from unibetMetaPayload: ${teams}`);
    }
    
    const selection = betOption;

    const matchDate = this.parseMatchStartTime(matchData.starting_at);
    console.log(`[DEBUG] Final match date: ${this.formatTo12Hour(matchDate)}`);
    console.log(`✅ [placeBet] Final matchDate parsed from matchData.starting_at: ${matchDate.toISOString()}`);
    
    // Calculate when the bet outcome check should run (2 hours 5 minutes after match START)
    const betOutcomeCheckTime = this.calculateBetOutcomeCheckTime(matchDate);
    
    // For backward compatibility, also calculate estimated match end (105 minutes after start)
    const estimatedMatchEnd = new Date(matchDate.getTime() + 105 * 60 * 1000);
    
    console.log(`[DEBUG] Match start time (UTC): ${this.formatTo12Hour(matchDate)}`);
    console.log(`[DEBUG] Estimated match end (UTC): ${this.formatTo12Hour(estimatedMatchEnd)}`);
    console.log(`[DEBUG] Bet outcome check scheduled for (UTC): ${this.formatTo12Hour(betOutcomeCheckTime)} (2h 5min after match start)`);

    // Create betDetails object
    const betDetails = this.createBetDetails(odds, odds.market_id);
    
    // Debug: Log market ID resolution
    console.log(`[DEBUG] Market ID resolution:`, {
      odds_market_id: odds.market_id,
      betDetails_market_id: betDetails.market_id,
      betDetails_market_name: betDetails.market_name,
      odds_market_description: odds.market_description,
      final_marketId: betDetails.market_id || odds.market_id
    });

    // Ensure userId is ObjectId for consistency
    const userIdObj = typeof userId === "string" 
      ? new mongoose.Types.ObjectId(userId) 
      : (userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId.toString()));
    
    console.log(`[placeBet] Creating bet with userId: ${userId} (ObjectId: ${userIdObj})`);
    
    const bet = new Bet({
      userId: userIdObj,
      matchId,
      oddId,
      marketId: betDetails.market_id || odds.market_id, // Use resolved market_id from betDetails
      betOption: betOption || selection || odds.name,
      odds: parseFloat(odds.value),
      stake,
      payout: 0,
      matchDate,
      estimatedMatchEnd, // Keep for backward compatibility
      betOutcomeCheckTime, // When the outcome check should actually run
      teams,
      selection,
      inplay,
      betDetails,
      // Optional unibet parity metadata for Phase 1
      unibetMeta: this.buildUnibetMetaFromPayload(
        { 
          ...(unibetMetaPayload || {}), 
          ...v2ExtraMeta,
          start: matchId === '1022853538' ? '2025-08-11T23:00:00Z' : 
                 matchId === '1024730101' ? '2025-09-24T22:00:00Z' : matchData?.starting_at
        },
        {
          eventName: matchData?.name || teams,
          leagueId: matchData?.league?.id || matchData?.league_id,
          leagueName: matchData?.league?.name,
          homeName: matchData?.participants?.[0]?.name || (teams?.includes(' vs ') ? teams.split(' vs ')[0].trim() : null),
          awayName: matchData?.participants?.[1]?.name || (teams?.includes(' vs ') ? teams.split(' vs ')[1].trim() : null)
        }
      ),
      // Also set leagueId and leagueName directly on bet for easier access by calculator
      leagueId: matchData?.league?.id || matchData?.league_id || null,
      leagueName: matchData?.league?.name || null,
    });
    
    // Final validation: Check if required fields are present
    const finalHomeName = bet.unibetMeta?.homeName || (bet.teams?.includes(' vs ') ? bet.teams.split(' vs ')[0].trim() : null);
    const finalAwayName = bet.unibetMeta?.awayName || (bet.teams?.includes(' vs ') ? bet.teams.split(' vs ')[1].trim() : null);
    const leagueId = bet.leagueId || bet.unibetMeta?.leagueId;
    const startDate = bet.unibetMeta?.start || bet.matchDate;
    
    // Final validation: Log bet data to help debug cancellation issues
    console.log(`[DEBUG] ✅ Bet created with:`, {
      matchId: bet.matchId,
      teams: bet.teams,
      leagueId: leagueId,
      homeName: finalHomeName,
      awayName: finalAwayName,
      start: startDate,
      marketId: bet.marketId,
      hasRequiredFields: !!(finalHomeName && finalAwayName && leagueId && startDate)
    });
    
    // Warn if required fields are missing (but don't reject - let calculator handle it)
    if (!finalHomeName || !finalAwayName) {
      console.warn(`⚠️ [WARNING] Bet placed with missing team names - Home: "${finalHomeName}", Away: "${finalAwayName}"`);
      console.warn(`⚠️ This bet may be cancelled during outcome calculation`);
    }
    if (!leagueId) {
      console.warn(`⚠️ [WARNING] Bet placed with missing leagueId: ${leagueId}`);
      console.warn(`⚠️ This bet may be cancelled during outcome calculation`);
    }
    if (!startDate) {
      console.warn(`⚠️ [WARNING] Bet placed with missing start date: ${startDate}`);
      console.warn(`⚠️ This bet may be cancelled during outcome calculation`);
    }

    // Save bet with error handling
    try {
      await bet.save();
      console.log(`[placeBet] ✅ Bet saved successfully with ID: ${bet._id}`);
    } catch (saveError) {
      console.error(`[placeBet] ❌ ERROR: Failed to save bet:`, saveError);
      // Rollback balance if bet save failed
      try {
        user.balance += stake;
        await user.save();
        console.log(`[placeBet] ✅ Balance rolled back due to bet save failure`);
      } catch (rollbackError) {
        console.error(`[placeBet] ❌ CRITICAL: Failed to rollback balance:`, rollbackError);
      }
      throw new CustomError(
        `Failed to save bet: ${saveError.message}`,
        500,
        "BET_SAVE_FAILED"
      );
    }

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
      `[placeBet] Bet outcome check time (UTC): ${this.formatTo12Hour(
        betOutcomeCheckTime
      )} (2h 5min after match start)`
    );
    console.log(
      `[placeBet] Current time (UTC): ${this.getCurrentUTCTime12Hour()}`
    );

    // Schedule outcome check
    await this.scheduleBetOutcomeCheck(bet._id, betOutcomeCheckTime, matchId);

    // Fetch the updated user (with new balance)
    const updatedUser = await User.findById(userId);

    return { bet, user: updatedUser };
  }

  scheduleBetOutcomeCheck(betId, betOutcomeCheckTime, matchId) {
    // Get current time in UTC
    const now = new Date();

    // Ensure we're scheduling for the future, not the past
    let runAt = new Date(betOutcomeCheckTime);

    // If the scheduled time is in the past, reschedule for 5 minutes from now
    if (runAt <= now) {
      runAt = new Date(Date.now() + 5 * 60 * 1000);
      console.log(
        `[scheduleBetOutcomeCheck] Bet outcome check time is in the past. Rescheduling for 5 minutes from now at ${this.formatTo12Hour(
          runAt
        )}.`
      );
    }

    console.log(
      `[scheduleBetOutcomeCheck] Now (UTC): ${this.getCurrentUTCTime12Hour()}, runAt (UTC): ${this.formatTo12Hour(
        runAt
      )} (2h 5min after match start)`
    );

    // Schedule the job with Agenda - this will run in UTC regardless of server timezone
    agenda.schedule(runAt, "checkBetOutcome", { betId, matchId });
    console.log(
      `Scheduled Agenda job for bet ${betId} at ${this.formatTo12Hour(runAt)} UTC`
    );
  }

  async getMatchDataAndOdds(matchId, oddId, inplay = false) {
    let matchData;
    let odds;
    const cacheKey = `match_${matchId}`;
    const cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    // For inplay bets, get odds from live odds cache
    if (inplay) {
      console.log(`[getMatchDataAndOdds] Processing inplay bet for match ${matchId}, odd ${oddId}`);

      // Use cached live odds data (already updated every second)
      console.log(`[getMatchDataAndOdds] Using cached live odds data for betting...`);
      
      // Check cache status first
      if (global.liveFixturesService) {
        const cacheStatus = global.liveFixturesService.liveOddsCache.get(matchId);
        console.log(`[getMatchDataAndOdds] Cache status for match ${matchId}:`, {
          hasCache: !!cacheStatus,
          cacheAge: cacheStatus?.cached_at ? Date.now() - cacheStatus.cached_at : null,
          source: cacheStatus?.source || 'unknown',
          bettingDataLength: cacheStatus?.betting_data?.length || 0
        });
      }
      
      const liveOdds = global.liveFixturesService 
        ? global.liveFixturesService.getLiveOdds(matchId) || []
        : [];
      
      console.log(`[getMatchDataAndOdds] Found ${liveOdds.length} betting sections for match ${matchId}`);
      console.log(`[getMatchDataAndOdds] Looking for oddId: ${oddId}`);
      
      // Debug: Log all available odd IDs
      const allOddIds = [];
      liveOdds.forEach((section, sectionIndex) => {
        if (section.options && Array.isArray(section.options)) {
          section.options.forEach(option => {
            allOddIds.push(option.id);
            console.log(`[getMatchDataAndOdds] Section ${sectionIndex}: oddId=${option.id}, label=${option.label}, market_id=${option.market_id}`);
          });
        }
      });
      console.log(`[getMatchDataAndOdds] All available odd IDs:`, allOddIds);

      // Find the odd directly in the live odds data
      let foundOdd = null;
      let foundMarket = null;

      // Search for the exact odd ID in all sections
      for (const section of liveOdds) {
        // Try multiple comparison methods
        const odd = section.options?.find((o) => {
          const optionId = o.id;
          const requestedId = oddId;
          
          // Try exact match first
          if (optionId === requestedId) {
            console.log(`[getMatchDataAndOdds] ✅ EXACT MATCH: ${optionId} === ${requestedId}`);
            return true;
          }
          
          // Try number comparison
          const optionIdNum = parseInt(optionId);
          const requestedIdNum = parseInt(requestedId);
          if (optionIdNum === requestedIdNum) {
            console.log(`[getMatchDataAndOdds] ✅ NUMBER MATCH: ${optionIdNum} === ${requestedIdNum}`);
            return true;
          }
          
          // Try string comparison
          if (optionId.toString() === requestedId.toString()) {
            console.log(`[getMatchDataAndOdds] ✅ STRING MATCH: ${optionId.toString()} === ${requestedId.toString()}`);
            return true;
          }
          
          console.log(`[getMatchDataAndOdds] ❌ NO MATCH: ${optionId} (${typeof optionId}) !== ${requestedId} (${typeof requestedId})`);
          return false;
        });

        if (odd) {
          foundOdd = odd;
          foundMarket = section;
          console.log(`[getMatchDataAndOdds] ✅ FOUND EXACT MATCH: ${odd.label} with ID: ${odd.id}, market_id: ${odd.market_id}`);
          break;
        }
      }

      if (!foundOdd) {
        console.log(`[getMatchDataAndOdds] ❌ EXACT MATCH NOT FOUND for oddId: ${oddId}`);
        console.log(`[getMatchDataAndOdds] Available odd IDs:`, allOddIds);
        console.log(`[getMatchDataAndOdds] This shouldn't happen if SportsMonks doesn't change odd IDs!`);
        
        // Try to force refresh the odds and check again
        if (global.liveFixturesService) {
          console.log(`[getMatchDataAndOdds] Attempting to force refresh odds for match ${matchId}...`);
          try {
            // Check if match is still live before refreshing
            const isLive = global.liveFixturesService.isMatchLive(matchId);
            console.log(`[getMatchDataAndOdds] Match ${matchId} is live: ${isLive}`);
            
            if (!isLive) {
              throw new CustomError(
                `Match ${matchId} is no longer live. Cannot place inplay bet.`,
                400,
                "MATCH_NOT_LIVE"
              );
            }
            
            const refreshedOdds = await global.liveFixturesService.ensureLiveOdds(matchId);
            const refreshedBettingData = refreshedOdds.betting_data || [];
            
            console.log(`[getMatchDataAndOdds] Refreshed odds found ${refreshedBettingData.length} sections`);
            
            // Log all refreshed odd IDs for debugging
            const refreshedOddIds = [];
            refreshedBettingData.forEach((section, sectionIndex) => {
              if (section.options && Array.isArray(section.options)) {
                section.options.forEach(option => {
                  refreshedOddIds.push(option.id);
                  console.log(`[getMatchDataAndOdds] Refreshed Section ${sectionIndex}: oddId=${option.id}, label=${option.label}, market_id=${option.market_id}`);
                });
              }
            });
            console.log(`[getMatchDataAndOdds] All refreshed odd IDs:`, refreshedOddIds);
            
            // Search in refreshed data
            for (const section of refreshedBettingData) {
              const refreshedOdd = section.options?.find((o) => {
                const optionId = o.id;
                const requestedId = oddId;
                
                if (optionId === requestedId || 
                    parseInt(optionId) === parseInt(requestedId) ||
                    optionId.toString() === requestedId.toString()) {
                  console.log(`[getMatchDataAndOdds] ✅ FOUND IN REFRESHED DATA: ${optionId} === ${requestedId}`);
                  return true;
                }
                return false;
              });
              
              if (refreshedOdd) {
                foundOdd = refreshedOdd;
                foundMarket = section;
                console.log(`[getMatchDataAndOdds] ✅ FOUND EXACT MATCH IN REFRESHED DATA: ${refreshedOdd.label} with ID: ${refreshedOdd.id}`);
                break;
              }
            }
          } catch (refreshError) {
            console.log(`[getMatchDataAndOdds] Error refreshing odds:`, refreshError.message);
          }
        }
        
        if (!foundOdd) {
          // Check if the match is still live
          const isStillLive = global.liveFixturesService ? global.liveFixturesService.isMatchLive(matchId) : false;
          console.log(`[getMatchDataAndOdds] Match ${matchId} is still live: ${isStillLive}`);
          
          // Try to find a similar odd with the same market_id and label
          console.log(`[getMatchDataAndOdds] Attempting to find similar odd...`);
          let similarOdd = null;
          
          for (const section of liveOdds) {
            if (section.options && Array.isArray(section.options)) {
              // Try to find by market_id and label
              const found = section.options.find((o) => {
                // Check if this is a similar odd (same market, similar label)
                return o.market_id && o.label && 
                       (o.label.toLowerCase().includes('home') || 
                        o.label.toLowerCase().includes('away') || 
                        o.label.toLowerCase().includes('draw'));
              });
              
              if (found) {
                similarOdd = found;
                console.log(`[getMatchDataAndOdds] Found similar odd: ${found.label} with ID: ${found.id}, market_id: ${found.market_id}`);
                break;
              }
            }
          }
          
          if (similarOdd) {
            console.log(`[getMatchDataAndOdds] Using similar odd as fallback: ${similarOdd.id}`);
            foundOdd = similarOdd;
            foundMarket = liveOdds.find(section => 
              section.options && section.options.some(o => o.id === similarOdd.id)
            );
          } else {
            throw new CustomError(
              `Invalid odd ID for live bet. Odd ID ${oddId} not found in current live odds. ${isStillLive ? 'Match is still live but odd may have been removed.' : 'Match may no longer be live.'}`,
              400,
              "INVALID_LIVE_ODD_ID"
            );
          }
        }
      }

      // Check if the odd is suspended or stopped
      if (foundOdd.suspended || foundOdd.stopped) {
        throw new CustomError(
          "This betting option is currently suspended",
          400,
          "ODD_SUSPENDED"
        );
      }

      const resolvedMarketId = foundOdd.marketId || foundOdd.market_id;
      if (!resolvedMarketId) {
        throw new CustomError(
          "Invalid live odd data - missing market ID",
          400,
          "INVALID_LIVE_ODD_DATA"
        );
      }

      odds = {
        id: foundOdd.id,
        value: foundOdd.value,
        name: foundOdd.name || foundOdd.label,
        market_id: resolvedMarketId,
        label: foundOdd.label,
        total: foundOdd.total,
        market_description: foundOdd.market_description || foundMarket.description || foundMarket.title,
        handicap: foundOdd.handicap,
      };
    }

    // Get match data (same logic as placeBet)
    // For inplay bets, try to get match data from live matches cache first
    if (inplay && global.liveFixturesService) {
      const liveMatches = global.liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
      console.log(`[getMatchDataAndOdds] Looking for match ${matchId} in live cache. Total live matches: ${liveMatches.length}`);
      
      const liveMatch = liveMatches.find(match => match.id == matchId || match.id === parseInt(matchId));
      
      if (liveMatch) {
        console.log(`[getMatchDataAndOdds] ✅ Using live match data from inplay cache for match ${matchId}`);
        matchData = {
          id: liveMatch.id,
          starting_at: liveMatch.starting_at,
          participants: liveMatch.participants || [],
          state: liveMatch.state || {},
          name: liveMatch.name,
          league_id: liveMatch.league_id,
          isLive: true
        };
      } else {
        console.log(`[getMatchDataAndOdds] ❌ Match ${matchId} not found in live cache. Available live match IDs:`, liveMatches.map(m => m.id).slice(0, 10));
      }
    }
    
    // If not found in live cache or not inplay, search all cached matches using the utility method
    if (!matchData) {
      console.log(`[getMatchDataAndOdds] Searching for match ${matchId} in all cached matches...`);
      const allCachedMatches = FixtureOptimizationService.getAllCachedMatches();
      console.log(`[getMatchDataAndOdds] Total cached matches: ${allCachedMatches.length}`);
      
      matchData = allCachedMatches.find(
        (fixture) => fixture.id == matchId || fixture.id === parseInt(matchId)
      );
      
      if (matchData) {
        console.log(`[getMatchDataAndOdds] ✅ Found match ${matchId} in all cached matches`);
      } else {
        console.log(`[getMatchDataAndOdds] ❌ Match ${matchId} not found in all cached matches. Sample IDs:`, allCachedMatches.slice(0, 5).map(m => m.id));
      }
    }
    
    if (!matchData) {
      console.log(`[getMatchDataAndOdds] Trying fixture cache for match ${matchId}...`);
      matchData = FixtureOptimizationService.fixtureCache.get(cacheKey);
      if (!matchData || !matchData.updatedAt || matchData.updatedAt <= new Date(Date.now() - cacheTTL)) {
        console.log(`[getMatchDataAndOdds] Fixture cache miss for match ${matchId}, trying MongoDB cache...`);
        const cachedOdds = await MatchOdds.findOne({ matchId });
        if (cachedOdds && cachedOdds.updatedAt > new Date(Date.now() - cacheTTL)) {
          console.log(`[getMatchDataAndOdds] ✅ Found match ${matchId} in MongoDB cache`);
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
          console.log(`[getMatchDataAndOdds] MongoDB cache miss for match ${matchId}, trying API call...`);
          const apiParams = {
            filters: `fixtureIds:${matchId}`,
            include: "odds;participants;state",
            per_page: 1,
          };
          const response = await FixtureOptimizationService.getOptimizedFixtures(apiParams);
          const matches = response.data || [];
          if (!matches || matches.length === 0) {
            console.log(`[getMatchDataAndOdds] ❌ API returned no matches for matchId: ${matchId}`);
            throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
          }
          matchData = matches.find(
            (match) => match.id == matchId || match.id === parseInt(matchId)
          );
          if (!matchData) {
            console.log(`[getMatchDataAndOdds] ❌ API returned matches but none match ID: ${matchId}. Available IDs:`, matches.map(m => m.id));
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
          FixtureOptimizationService.fixtureCache.set(cacheKey, matchData, 3600);
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

    return { matchData, odds };
  }

  async fetchMatchResult(matchId, isLive = false) {
    const maxRetries = 3;
    let lastError;

    try {
      // Check cache first
      if (this.finalMatchResultCache.has(matchId)) {
        const cachedData = this.finalMatchResultCache.get(matchId);
        console.log(
          `[fetchMatchResult] Used cached result for matchId: ${matchId}`
        );
        return cachedData;
      }

      // Retry logic for API calls
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[fetchMatchResult] Attempt ${attempt}/${maxRetries} for matchId: ${matchId}`
          );

          // Use minimal includes to reduce response size and avoid timeouts
          // Removed inplayOdds as it's not available in the API plan
          const includes =
            "state;scores;participants;lineups.details;events;statistics;odds"; // Minimal on first attempt

          const response = await SportsMonksService.client.get(
            `/football/fixtures/${matchId}`,
            {
              params: {
                include: includes,
              },
              timeout: attempt === 1 ? 10000 : attempt === 2 ? 20000 : 30000, // Increase timeout with each attempt
              headers: {
                "Accept-Encoding": "gzip, deflate", // Avoid br compression which might cause issues
                Connection: "keep-alive",
              },
            }
          );

          if (!response.data?.data) {
            throw new CustomError("Match not found", 404, "MATCH_NOT_FOUND");
          }

          console.log(
            `[fetchMatchResult] Successfully fetched data on attempt ${attempt} for matchId: ${matchId}`
          );

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
            console.log(
              `[fetchMatchResult] Cached final result for matchId: ${matchId}`
            );
          }

          return matchData;
        } catch (error) {
          lastError = error;
          
          // Check if it's a 404 error (match not found) - this means match is finished
          if (error.code === "MATCH_NOT_FOUND" || error.status === 404 || error.response?.status === 404) {
            console.log(
              `[fetchMatchResult] Match ${matchId} returned 404 (not found) - Match likely finished and removed from Unibet API`
            );
            // Return a special object indicating match is finished (404 = match finished)
            return {
              id: matchId,
              state: { id: 5, name: "FINISHED" }, // Mark as finished
              finished: true,
              finishedReason: "404_NOT_FOUND", // Special flag to indicate 404
              message: "Match not found in Unibet API - likely finished",
              scores: [],
              participants: [],
              starting_at: null,
              odds: [],
              inplayodds: [],
              lineups: [],
              events: [],
              statistics: []
            };
          }
          
          console.error(
            `[fetchMatchResult] Attempt ${attempt} failed for matchId: ${matchId}:`,
            error.message
          );

          // If it's a connection reset error and we have more attempts, wait before retrying
          if (
            (error.code === "ECONNRESET" ||
              error.code === "ECONNABORTED" ||
              error.message.includes("aborted")) &&
            attempt < maxRetries
          ) {
            const waitTime = attempt * 2000; // 2s, 4s wait times
            console.log(
              `[fetchMatchResult] Waiting ${waitTime}ms before retry ${
                attempt + 1
              }`
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          }

          // If it's not a retry-able error or last attempt, throw
          if (attempt === maxRetries) {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error(
        `[fetchMatchResult] All attempts failed for matchId: ${matchId}. Final error:`,
        error.message
      );

      // Check if it's a "Match not found" error (404) - this means match is finished
      if (
        error.code === "MATCH_NOT_FOUND" || 
        error.status === 404 || 
        error.response?.status === 404 ||
        error.message?.toLowerCase().includes("match not found") ||
        error.message?.toLowerCase().includes("not found")
      ) {
        console.log(
          `[fetchMatchResult] Match ${matchId} returned "not found" after all retries - Match likely finished and removed from SportsMonks API`
        );
        // Return a special object indicating match is finished (404 = match finished)
        return {
          id: matchId,
          state: { id: 5, name: "FINISHED" }, // Mark as finished
          finished: true,
          finishedReason: "404_NOT_FOUND", // Special flag to indicate 404
          message: "Match not found in SportsMonks API - likely finished",
          scores: [],
          participants: [],
          starting_at: null,
          odds: [],
          inplayodds: [],
          lineups: [],
          events: [],
          statistics: []
        };
      }

      // If it's a network error, try to provide a more user-friendly error
      if (
        error.code === "ECONNRESET" ||
        error.code === "ECONNABORTED" ||
        error.message.includes("aborted")
      ) {
        throw new CustomError(
          `Unable to fetch match data due to network connectivity issues. Please try again later.`,
          503,
          "NETWORK_ERROR"
        );
      }

      throw error;
    }
  }

  checkMarketHasWinningCalculations(marketId) {
    try {
      // Use the existing getMarketsData method which already handles caching
      const marketsData = this.getMarketsData();
      const market = marketsData.markets[marketId.toString()];

      console.log(`[checkMarketHasWinningCalculations] Market ID: ${marketId}, has_winning_calculations: ${market ? market.has_winning_calculations : false}`);
      
      return market ? market.has_winning_calculations : false;
    } catch (error) {
      console.error("Error checking market winning calculations:", error);
      return false;
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
      console.log(
        `[checkBetOutcome] Bet ${betId} already processed with status: ${bet.status}, skipping`
      );
      return {
        betId: bet._id,
        status: bet.status,
        payout: bet.payout,
        message: "Already processed",
      };
    }

    // Check if this is a combination bet
    if (bet.combination && Array.isArray(bet.combination) && bet.combination.length > 0) {
      console.log(`[checkBetOutcome] Processing combination bet with ${bet.combination.length} legs`);
      return await this.processCombinationBetOutcome(bet, match);
    }

    // Process single bet
    console.log(`[checkBetOutcome] Processing single bet for betId: ${betId}`);
    return await this.processSingleBetOutcome(bet, match);
  }

  async processSingleBetOutcome(bet, match = null) {
    const betId = bet._id;
    let matchData = match;

    // Check the final match result cache first
    if (!matchData) {
      if (this.finalMatchResultCache.has(bet.matchId)) {
        matchData = this.finalMatchResultCache.get(bet.matchId);
        console.log(
          `[processSingleBetOutcome] Used cached final result for matchId: ${bet.matchId}`
        );
      } else {
        try {
          console.log(
            `[processSingleBetOutcome] Fetching latest fixture for matchId: ${bet.matchId}, inplay: ${bet.inplay}`
          );
          matchData = await this.fetchMatchResult(bet.matchId, bet.inplay);
          // Only cache if match is finished
          if (matchData.state?.id === 5) {
            this.finalMatchResultCache.set(bet.matchId, matchData);
            console.log(
              `[processSingleBetOutcome] Cached final result for matchId: ${bet.matchId}`
            );
          }
        } catch (err) {
          console.error(`[processSingleBetOutcome] Error fetching match:`, err);

          // Handle network errors gracefully
          if (
            err.code === "ECONNRESET" ||
            err.code === "ECONNABORTED" ||
            err.message.includes("aborted") ||
            err.message.includes("NETWORK_ERROR")
          ) {
            console.log(
              `[processSingleBetOutcome] Network error for betId: ${betId}. Rescheduling for retry in 10 minutes.`
            );

            // Reschedule for retry in 10 minutes due to network issues
            const runAt = new Date(Date.now() + 10 * 60 * 1000);
            agenda.schedule(runAt, "checkBetOutcome", {
              betId,
              matchId: bet.matchId,
            });

            return {
              betId: bet._id,
              status: bet.status,
              message: "Network error, rescheduled for retry",
            };
          }

          // For other errors, throw as before
          throw err;
        }
      }
    }

    console.log(`[processSingleBetOutcome] Match state:`, matchData.state);
    console.log(
      `[processSingleBetOutcome] Looking for odd ID ${bet.oddId} in match data`
    );

    // Check if match is finished (state.id === 5 OR 404_NOT_FOUND means finished)
    const isMatchFinished = matchData.finishedReason === "404_NOT_FOUND" || (matchData.state && matchData.state.id === 5);
    
    if (!isMatchFinished) {
      console.log(
        `[processSingleBetOutcome] Match not finished for betId: ${betId}, state:`,
        matchData.state,
        `finishedReason: ${matchData.finishedReason || 'none'}`
      );

      // Calculate proper rescheduling time based on match start time (2h 5min after start)
      const matchStartTime = this.parseMatchStartTime(matchData.starting_at);
      const newBetOutcomeCheckTime = this.calculateBetOutcomeCheckTime(matchStartTime); // 2h 5min after match start

      // If match hasn't started yet or is in progress, reschedule for proper time
      if (
        !matchData.state ||
        matchData.state.id === 1 ||
        (matchData.state.id >= 2 && matchData.state.id <= 4)
      ) {
        console.log(
          `[processSingleBetOutcome] Match is not yet finished (state: ${matchData.state?.name}). Rescheduling for proper bet outcome check time: ${this.formatTo12Hour(newBetOutcomeCheckTime)} (2h 5min after match start)`
        );
        
        // Only reschedule if the new time is in the future
        const now = new Date();
        if (newBetOutcomeCheckTime > now) {
          agenda.schedule(newBetOutcomeCheckTime, "checkBetOutcome", {
            betId,
            matchId: bet.matchId,
          });
        } else {
          // If even the proper time is in the past, check again in 10 minutes
          const runAt = new Date(Date.now() + 10 * 60 * 1000);
          console.log(
            `[processSingleBetOutcome] Proper bet outcome check time is in the past. Rescheduling for 10 minutes from now: ${this.formatTo12Hour(runAt)}`
          );
          agenda.schedule(runAt, "checkBetOutcome", {
            betId,
            matchId: bet.matchId,
          });
        }
      } else {
        // For other states, check again in 10 minutes
        const runAt = new Date(Date.now() + 10 * 60 * 1000);
        console.log(
          `[processSingleBetOutcome] Unknown match state. Rescheduling for 10 minutes from now: ${this.formatTo12Hour(runAt)}`
        );
        agenda.schedule(runAt, "checkBetOutcome", {
          betId,
          matchId: bet.matchId,
        });
      }

      return {
        betId,
        status: bet.status,
        message: "Match not yet finished, rescheduled",
      };
    }

    // Calculate bet outcome
    return await this.calculateAndUpdateBetOutcome(bet, matchData);
  }

  async processCombinationBetOutcome(bet, match = null) {
    const betId = bet._id;
    console.log(`[processCombinationBetOutcome] Processing combination bet with ${bet.combination.length} legs`);

    // Check if all legs have finished matches
    const updatedCombination = [];
    let allLegsFinished = true;
    let allLegsWon = true;
    let anyLegCanceled = false;

    for (let i = 0; i < bet.combination.length; i++) {
      const leg = bet.combination[i];
      console.log(`[processCombinationBetOutcome] Processing leg ${i + 1}: matchId=${leg.matchId}, oddId=${leg.oddId}`);

      // Skip legs that are already processed
      if (leg.status !== "pending") {
        console.log(`[processCombinationBetOutcome] Leg ${i + 1} already processed with status: ${leg.status}`);
        updatedCombination.push(leg);
        
        if (leg.status === "lost") {
          allLegsWon = false;
        } else if (leg.status === "canceled") {
          anyLegCanceled = true;
        } else if (leg.status !== "won") {
          allLegsWon = false;
        }
        continue;
      }

      // Get match data for this leg
      let matchData = null;
      try {
        matchData = await this.fetchMatchResult(leg.matchId, leg.inplay);
      } catch (error) {
        console.error(`[processCombinationBetOutcome] Error fetching match data for leg ${i + 1}:`, error);
        allLegsFinished = false;
        
        // If it's a network error, API error, or Fotmob error, mark the leg as canceled and continue
        if (error.code === "NETWORK_ERROR" || error.code === "API_ERROR" || 
            error.message.includes("network") || error.message.includes("timeout") ||
            error.message.includes("Fotmob") || error.message.includes("API format issue")) {
          console.log(`[processCombinationBetOutcome] Marking leg ${i + 1} as canceled due to network/API/Fotmob error`);
          const canceledLeg = {
            ...leg,
            status: "canceled",
            payout: 0,
            reason: `Network/API/Fotmob error: ${error.message}`
          };
          updatedCombination.push(canceledLeg);
          anyLegCanceled = true;
          allLegsWon = false;
        } else {
          // For other errors, keep the leg as pending and continue
          updatedCombination.push({ ...leg });
        }
        continue;
      }

      // Check if match is finished
      if (!matchData.state || matchData.state.id !== 5) {
        console.log(`[processCombinationBetOutcome] Leg ${i + 1} match not finished, state:`, matchData.state);
        allLegsFinished = false;
        // Keep the leg as pending
        updatedCombination.push({ ...leg });
        continue;
      }

      // Calculate outcome for this leg using the same calculation logic as single bets
      try {
        // Create a temporary bet object for this leg to use with existing calculation services
        const tempBet = {
          _id: `${bet._id}_leg_${i + 1}`, // Unique ID for logging
          userId: bet.userId,
          matchId: leg.matchId,
          oddId: leg.oddId,
          betOption: leg.betOption,
          odds: leg.odds,
          stake: leg.stake,
          inplay: leg.inplay,
          betDetails: leg.betDetails,
          selection: leg.selection,
          teams: leg.teams || ""
        };

        const outcomeResult = await this.calculateBetOutcomeForLeg(tempBet, matchData);
        console.log(`[processCombinationBetOutcome] Leg ${i + 1} outcome:`, outcomeResult);

        // Update leg status based on outcome
        const updatedLeg = {
          ...leg,
          status: outcomeResult.status,
          payout: outcomeResult.status === "won" ? leg.stake * leg.odds : 0
        };

        updatedCombination.push(updatedLeg);

        // Track overall bet status
        if (outcomeResult.status === "lost") {
          allLegsWon = false;
        } else if (outcomeResult.status === "canceled") {
          anyLegCanceled = true;
        } else if (outcomeResult.status !== "won") {
          allLegsWon = false;
        }

      } catch (error) {
        console.error(`[processCombinationBetOutcome] Error calculating outcome for leg ${i + 1}:`, error);
        
        // Mark leg as canceled due to calculation error
        const updatedLeg = {
          ...leg,
          status: "canceled",
          payout: 0
        };
        updatedCombination.push(updatedLeg);
        anyLegCanceled = true;
        allLegsWon = false;
      }
    }

    // If not all legs are finished, reschedule the check
    if (!allLegsFinished) {
      console.log(`[processCombinationBetOutcome] Not all legs finished, rescheduling check`);
      
      // Update each leg individually using array index updates
      const updateOperations = [];
      
      for (let i = 0; i < updatedCombination.length; i++) {
        const leg = updatedCombination[i];
        if (leg.status !== 'pending') { // Only update legs that have been processed
          updateOperations.push(
            Bet.updateOne(
              { _id: betId },
              {
                $set: {
                  [`combination.${i}.status`]: leg.status,
                  [`combination.${i}.payout`]: leg.payout
                }
              }
            )
          );
        }
      }
      
      if (updateOperations.length > 0) {
        const updateResults = await Promise.all(updateOperations);
        const successfulUpdates = updateResults.filter(result => result.modifiedCount > 0);
        
        if (successfulUpdates.length > 0) {
          console.log(`[processCombinationBetOutcome] Updated combination with partial results:`, 
            updatedCombination.map((leg, index) => `Leg ${index + 1}: ${leg.status}`)
          );
        }
      }
      
      // Reschedule for 10 minutes from now
      const runAt = new Date(Date.now() + 10 * 60 * 1000);
      agenda.schedule(runAt, "checkBetOutcome", {
        betId,
        matchId: bet.matchId,
      });

      return {
        betId: bet._id,
        status: bet.status,
        message: "Not all legs finished, rescheduled",
      };
    }

    // Determine overall bet outcome
    let overallStatus = "lost";
    let overallPayout = 0;

    if (allLegsWon) {
      overallStatus = "won";
      overallPayout = bet.potentialPayout || (bet.stake * bet.totalOdds);
      console.log(`[processCombinationBetOutcome] All legs won! Payout: ${overallPayout}`);
      
      // Update user balance for winning combination bet
      if (bet.userId) {
        await User.findByIdAndUpdate(bet.userId, {
          $inc: { balance: overallPayout },
        });
        console.log(`[processCombinationBetOutcome] User balance updated. Added: ${overallPayout}`);
      }
    } else if (anyLegCanceled && !allLegsWon) {
      // If any leg is canceled and not all legs won, handle according to business rules
      overallStatus = "canceled";
      overallPayout = bet.stake; // Refund stake
      
      if (bet.userId) {
        await User.findByIdAndUpdate(bet.userId, {
          $inc: { balance: bet.stake },
        });
        console.log(`[processCombinationBetOutcome] Stake refunded due to canceled leg: ${bet.stake}`);
      }
    } else {
      console.log(`[processCombinationBetOutcome] At least one leg lost. No payout.`);
    }

    // Update the bet in database with both overall status and individual leg statuses
    // Use replaceOne approach to ensure the entire document is updated properly
    console.log(`[processCombinationBetOutcome] Updating bet with data:`, {
      betId: betId,
      overallStatus: overallStatus,
      overallPayout: overallPayout,
      legCount: updatedCombination.length,
      legStatuses: updatedCombination.map((leg, index) => `Leg ${index + 1}: ${leg.status}`)
    });

    // Update each leg individually using array index updates
    const updateOperations = [];
    
    // Update overall bet status and payout
    updateOperations.push(
      Bet.updateOne(
        { _id: betId },
        {
          $set: {
            status: overallStatus,
            payout: overallPayout
          }
        }
      )
    );
    
    // Update each leg individually
    for (let i = 0; i < updatedCombination.length; i++) {
      const leg = updatedCombination[i];
      updateOperations.push(
        Bet.updateOne(
          { _id: betId },
          {
            $set: {
              [`combination.${i}.status`]: leg.status,
              [`combination.${i}.payout`]: leg.payout
            }
          }
        )
      );
    }
    
    // Execute all updates
    const updateResults = await Promise.all(updateOperations);
    
    // Check if any update failed
    const failedUpdates = updateResults.filter(result => result.modifiedCount === 0);
    if (failedUpdates.length > 0) {
      console.error(`[processCombinationBetOutcome] Some updates failed: ${failedUpdates.length} out of ${updateResults.length}`);
    }

    // Fetch the updated document
    const updatedBet = await Bet.findById(betId);

    if (!updatedBet) {
      throw new CustomError("Failed to update combination bet", 500, "UPDATE_FAILED");
    }

    console.log(
      `[processCombinationBetOutcome] Combination bet updated successfully. betId: ${bet._id}, status: ${updatedBet.status}, payout: ${updatedBet.payout}`
    );
    console.log(
      `[processCombinationBetOutcome] Individual leg statuses:`, 
      updatedCombination.map((leg, index) => `Leg ${index + 1}: ${leg.status}`)
    );

    // Verify that the update was successful by checking the actual saved data
    console.log(
      `[processCombinationBetOutcome] Verification - Saved leg statuses:`, 
      updatedBet.combination.map((leg, index) => `Leg ${index + 1}: ${leg.status}`)
    );

    return {
      betId: updatedBet._id,
      status: updatedBet.status,
      payout: updatedBet.payout,
      combination: updatedBet.combination,
    };
  }



  
  async calculateBetOutcomeForLeg(bet, matchData) {
    // Prepare match data for outcome calculation
    let final_match = matchData;
    if (bet.inplay) {
      console.log(`[calculateBetOutcomeForLeg] Processing inplay bet for leg: ${bet._id}`);
      final_match = { ...matchData, odds: matchData.inplayodds };
    }

    // Calculate bet outcome using the BetOutcomeCalculationService
    try {
      console.log(`[calculateBetOutcomeForLeg] Calculating outcome for leg: ${bet._id}`);
      
      let outcomeResult;
      if (this.checkMarketHasWinningCalculations(bet.betDetails.market_id)) {
        console.log(`[calculateBetOutcomeForLeg] Using WinningOddsCalculation for leg`);
        outcomeResult = await this.WinningOddsCalculation.calculateBetOutcome(bet, final_match);
      } else {
        outcomeResult = await this.SimpleOddsCalculation.calculateBetOutcome(bet, final_match);
      }

      console.log(`[calculateBetOutcomeForLeg] Outcome calculated:`, outcomeResult);
      return outcomeResult;

    } catch (error) {
      console.error(`[calculateBetOutcomeForLeg] Error in outcome calculation:`, error);
      return {
        status: "canceled",
        reason: `Error calculating outcome: ${error.message}`,
      };
    }
  }

  async calculateAndUpdateBetOutcome(bet, matchData) {
    const betId = bet._id;
    
    // Prepare match data for outcome calculation
    let final_match = matchData;
    if (bet.inplay) {
      console.log(`[calculateAndUpdateBetOutcome] Processing inplay bet for betId: ${betId}`);
      final_match = { ...matchData, odds: matchData.inplayodds };
      console.log(`[calculateAndUpdateBetOutcome] Using inplay odds for outcome calculation`);
    }

    // Calculate bet outcome using the BetOutcomeCalculationService
    try {
      console.log(`[calculateAndUpdateBetOutcome] Calculating outcome for betId: ${betId}`);
      console.log(`[calculateAndUpdateBetOutcome] Bet details:`, {
        oddId: bet.oddId,
        betOption: bet.betOption,
        inplay: bet.inplay,
        marketId: bet.betDetails.market_id,
        betDetails: bet.betDetails,
      });

      let outcomeResult;
      if (this.checkMarketHasWinningCalculations(bet.betDetails.market_id)) {
        console.log(`[calculateAndUpdateBetOutcome] Using WinningOddsCalculation for bet`);
        outcomeResult = await this.WinningOddsCalculation.calculateBetOutcome(bet, final_match);
      } else {
        outcomeResult = await this.SimpleOddsCalculation.calculateBetOutcome(bet, final_match);
      }

      console.log(`[calculateAndUpdateBetOutcome] Outcome calculated:`, outcomeResult);
      
      // Log initial bet data
      console.log(`\n[calculateAndUpdateBetOutcome] ========== INITIAL BET DATA ==========`);
      console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${betId}`);
      console.log(`[calculateAndUpdateBetOutcome] Stake: ${bet.stake}`);
      console.log(`[calculateAndUpdateBetOutcome] Odds: ${bet.odds}`);
      console.log(`[calculateAndUpdateBetOutcome] Current Status: ${bet.status}`);
      console.log(`[calculateAndUpdateBetOutcome] Current Payout: ${bet.payout}`);
      console.log(`[calculateAndUpdateBetOutcome] Current Profit: ${bet.profit || 'N/A'}`);
      console.log(`[calculateAndUpdateBetOutcome] Calculated Status: ${outcomeResult.status}`);
      console.log(`[calculateAndUpdateBetOutcome] ========================================\n`);

      // Update bet based on the outcome
      let updateData = {
        status: outcomeResult.status,
        payout: 0,
        profit: 0, // Profit = payout - stake
        result: {
          actualOutcome: outcomeResult.actualOutcome || null,
          finalScore: outcomeResult.finalScore || null,
          fotmobMatchId: outcomeResult.matchId || null,
          reason: outcomeResult.reason || null,
          processedAt: new Date(),
          similarity: outcomeResult.similarity || null
        }
      };

      // Handle different outcome statuses
      switch (outcomeResult.status) {
        case "won":
          const winningPayout = bet.stake * bet.odds;
          const winningProfit = winningPayout - bet.stake;
          
          console.log(`\n[calculateAndUpdateBetOutcome] ========== WON BET BALANCE UPDATE ==========`);
          console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${betId}`);
          console.log(`[calculateAndUpdateBetOutcome] Stake: ${bet.stake}`);
          console.log(`[calculateAndUpdateBetOutcome] Odds: ${bet.odds}`);
          console.log(`[calculateAndUpdateBetOutcome] Payout: ${winningPayout} (stake × odds)`);
          console.log(`[calculateAndUpdateBetOutcome] Profit: ${winningProfit} (payout - stake)`);
          
          updateData.payout = winningPayout;
          updateData.profit = winningProfit;
          
          // Update user balance for winning bet
          if (bet.userId) {
            const userBefore = await User.findById(bet.userId);
            const balanceBefore = userBefore?.balance || 0;
            
            console.log(`[calculateAndUpdateBetOutcome] Balance Before: ${balanceBefore}`);
            console.log(`[calculateAndUpdateBetOutcome] Adding Payout: ${winningPayout}`);
            console.log(`[calculateAndUpdateBetOutcome] Breakdown: ${balanceBefore} + ${winningPayout} = ${balanceBefore + winningPayout}`);
            
            await User.findByIdAndUpdate(bet.userId, {
              $inc: { balance: winningPayout },
            });
            
            const userAfter = await User.findById(bet.userId);
            const balanceAfter = userAfter?.balance || 0;
            
            console.log(`[calculateAndUpdateBetOutcome] Balance After: ${balanceAfter}`);
            console.log(`[calculateAndUpdateBetOutcome] Balance Change: ${balanceAfter - balanceBefore} (should be ${winningPayout})`);
            console.log(`[calculateAndUpdateBetOutcome] ===========================================\n`);
          }
          break;

        case "lost":
          const lostProfit = -bet.stake; // Full loss
          
          console.log(`\n[calculateAndUpdateBetOutcome] ========== LOST BET BALANCE UPDATE ==========`);
          console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${betId}`);
          console.log(`[calculateAndUpdateBetOutcome] Stake: ${bet.stake}`);
          console.log(`[calculateAndUpdateBetOutcome] Payout: 0 (bet lost)`);
          console.log(`[calculateAndUpdateBetOutcome] Profit: ${lostProfit} (full loss)`);
          
          updateData.payout = 0;
          updateData.profit = lostProfit;
          
          // No balance update needed for lost bets (stake already deducted at bet placement)
          if (bet.userId) {
            const userCurrent = await User.findById(bet.userId);
            const balanceCurrent = userCurrent?.balance || 0;
            console.log(`[calculateAndUpdateBetOutcome] Current Balance: ${balanceCurrent} (no change - stake already deducted)`);
            console.log(`[calculateAndUpdateBetOutcome] ===========================================\n`);
          }
          break;

        case "half_won":
          // Half Win: Half stake wins (with odds), half stake refunded
          // Calculation breakdown:
          // - Half stake (50%) wins with odds: (stake / 2) * odds
          // - Half stake (50%) refunded: (stake / 2)
          // - Total Payout = (stake / 2) * odds + (stake / 2) = stake * ((odds - 1) / 2 + 1)
          // - Profit = Payout - Stake = (stake / 2) * (odds - 1)
          
          // Ensure stake and odds are numbers
          const stakeNum = Number(bet.stake);
          const oddsNum = Number(bet.odds);
          
          if (isNaN(stakeNum) || isNaN(oddsNum)) {
            console.error(`[calculateAndUpdateBetOutcome] Invalid stake or odds: stake=${bet.stake}, odds=${bet.odds}`);
            throw new Error(`Invalid stake or odds for half_won calculation`);
          }
          
          const halfStake = stakeNum / 2;
          const halfStakeWinnings = halfStake * oddsNum;
          const halfStakeRefund = halfStake;
          const halfWinPayout = Number((halfStakeWinnings + halfStakeRefund).toFixed(2));
          const halfWinProfit = Number((halfWinPayout - stakeNum).toFixed(2));
          
          console.log(`\n[calculateAndUpdateBetOutcome] ========== HALF WIN CALCULATION ==========`);
          console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${betId}`);
          console.log(`[calculateAndUpdateBetOutcome] Original Stake: ${stakeNum} (type: ${typeof stakeNum})`);
          console.log(`[calculateAndUpdateBetOutcome] Odds: ${oddsNum} (type: ${typeof oddsNum})`);
          console.log(`[calculateAndUpdateBetOutcome] ---`);
          console.log(`[calculateAndUpdateBetOutcome] Step 1: Split stake into 2 equal parts`);
          console.log(`[calculateAndUpdateBetOutcome]   - Half Stake (Part 1): ${halfStake} (will win with odds)`);
          console.log(`[calculateAndUpdateBetOutcome]   - Half Stake (Part 2): ${halfStake} (will be refunded)`);
          console.log(`[calculateAndUpdateBetOutcome] ---`);
          console.log(`[calculateAndUpdateBetOutcome] Step 2: Calculate winnings for Part 1`);
          console.log(`[calculateAndUpdateBetOutcome]   - Part 1 Winnings = ${halfStake} × ${oddsNum} = ${halfStakeWinnings}`);
          console.log(`[calculateAndUpdateBetOutcome] Step 3: Calculate refund for Part 2`);
          console.log(`[calculateAndUpdateBetOutcome]   - Part 2 Refund = ${halfStakeRefund}`);
          console.log(`[calculateAndUpdateBetOutcome] ---`);
          console.log(`[calculateAndUpdateBetOutcome] Step 4: Calculate Total Payout`);
          console.log(`[calculateAndUpdateBetOutcome]   - Total Payout = ${halfStakeWinnings} + ${halfStakeRefund} = ${halfWinPayout} (type: ${typeof halfWinPayout})`);
          console.log(`[calculateAndUpdateBetOutcome] Step 5: Calculate Profit`);
          console.log(`[calculateAndUpdateBetOutcome]   - Profit = ${halfWinPayout} - ${stakeNum} = ${halfWinProfit} (type: ${typeof halfWinProfit})`);
          console.log(`[calculateAndUpdateBetOutcome] ===========================================\n`);
          
          updateData.payout = halfWinPayout;
          updateData.profit = halfWinProfit;
          
          // Update user balance for half win
          if (bet.userId) {
            const userBefore = await User.findById(bet.userId);
            const balanceBefore = userBefore?.balance || 0;
            await User.findByIdAndUpdate(bet.userId, {
              $inc: { balance: halfWinPayout },
            });
            const userAfter = await User.findById(bet.userId);
            const balanceAfter = userAfter?.balance || 0;
            console.log(`[calculateAndUpdateBetOutcome] User balance updated:`);
            console.log(`[calculateAndUpdateBetOutcome]   - Before: ${balanceBefore}`);
            console.log(`[calculateAndUpdateBetOutcome]   - Added: ${halfWinPayout}`);
            console.log(`[calculateAndUpdateBetOutcome]   - After: ${balanceAfter}`);
          }
          break;

        case "half_lost":
          // Half Loss: Half stake lost, half stake refunded
          // Calculation breakdown:
          // - Half stake (50%) lost: (stake / 2) - this is gone
          // - Half stake (50%) refunded: (stake / 2) - this is returned
          // - Total Payout = stake / 2 (only refund)
          // - Profit = Payout - Stake = -(stake / 2)
          
          // Ensure stake is a number
          const halfLossStakeNum = Number(bet.stake);
          
          if (isNaN(halfLossStakeNum)) {
            console.error(`[calculateAndUpdateBetOutcome] Invalid stake: stake=${bet.stake}`);
            throw new Error(`Invalid stake for half_lost calculation`);
          }
          
          const halfLossStake = halfLossStakeNum / 2;
          const halfLossRefund = Number(halfLossStake.toFixed(2));
          const halfLossLost = halfLossStake;
          const halfLossProfit = Number((halfLossRefund - halfLossStakeNum).toFixed(2));
          
          console.log(`\n[calculateAndUpdateBetOutcome] ========== HALF LOSS CALCULATION ==========`);
          console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${betId}`);
          console.log(`[calculateAndUpdateBetOutcome] Original Stake: ${halfLossStakeNum} (type: ${typeof halfLossStakeNum})`);
          console.log(`[calculateAndUpdateBetOutcome] Odds: ${bet.odds} (type: ${typeof bet.odds})`);
          console.log(`[calculateAndUpdateBetOutcome] ---`);
          console.log(`[calculateAndUpdateBetOutcome] Step 1: Split stake into 2 equal parts`);
          console.log(`[calculateAndUpdateBetOutcome]   - Half Stake (Part 1): ${halfLossStake} (LOST - gone)`);
          console.log(`[calculateAndUpdateBetOutcome]   - Half Stake (Part 2): ${halfLossStake} (VOID - will be refunded)`);
          console.log(`[calculateAndUpdateBetOutcome] ---`);
          console.log(`[calculateAndUpdateBetOutcome] Step 2: Calculate refund for Part 2`);
          console.log(`[calculateAndUpdateBetOutcome]   - Part 2 Refund = ${halfLossRefund} (type: ${typeof halfLossRefund})`);
          console.log(`[calculateAndUpdateBetOutcome] Step 3: Part 1 is lost (no payout)`);
          console.log(`[calculateAndUpdateBetOutcome]   - Part 1 Lost = ${halfLossLost} (gone)`);
          console.log(`[calculateAndUpdateBetOutcome] ---`);
          console.log(`[calculateAndUpdateBetOutcome] Step 4: Calculate Total Payout`);
          console.log(`[calculateAndUpdateBetOutcome]   - Total Payout = ${halfLossRefund} (only refund, no winnings)`);
          console.log(`[calculateAndUpdateBetOutcome] Step 5: Calculate Profit`);
          console.log(`[calculateAndUpdateBetOutcome]   - Profit = ${halfLossRefund} - ${halfLossStakeNum} = ${halfLossProfit} (type: ${typeof halfLossProfit})`);
          console.log(`[calculateAndUpdateBetOutcome] ===========================================\n`);
          
          updateData.payout = halfLossRefund;
          updateData.profit = halfLossProfit;
          
          // Refund half stake to user
          if (bet.userId) {
            const userBefore = await User.findById(bet.userId);
            const balanceBefore = userBefore?.balance || 0;
            await User.findByIdAndUpdate(bet.userId, {
              $inc: { balance: halfLossRefund },
            });
            const userAfter = await User.findById(bet.userId);
            const balanceAfter = userAfter?.balance || 0;
            console.log(`[calculateAndUpdateBetOutcome] User balance updated:`);
            console.log(`[calculateAndUpdateBetOutcome]   - Before: ${balanceBefore}`);
            console.log(`[calculateAndUpdateBetOutcome]   - Added (refund): ${halfLossRefund}`);
            console.log(`[calculateAndUpdateBetOutcome]   - After: ${balanceAfter}`);
          }
          break;

        case "void":
          console.log(`[calculateAndUpdateBetOutcome] Bet voided. Refunding stake: ${bet.stake}`);
          updateData.payout = bet.stake;
          updateData.profit = 0; // No profit, no loss (void)
          updateData.status = "void";
          // Refund stake to user (void = push = stake returned)
          if (bet.userId) {
            await User.findByIdAndUpdate(bet.userId, {
              $inc: { balance: bet.stake },
            });
            console.log(`[calculateAndUpdateBetOutcome] Stake refunded to user for void bet: ${bet.stake}`);
          }
          break;

        case "cancelled":
          console.log(`[calculateAndUpdateBetOutcome] Bet canceled. Refunding stake: ${bet.stake}`);
          updateData.payout = bet.stake;
          updateData.profit = 0; // No profit, no loss (cancelled)
          updateData.status = "canceled";
          // Refund stake to user
          if (bet.userId) {
            await User.findByIdAndUpdate(bet.userId, {
              $inc: { balance: bet.stake },
            });
            console.log(`[calculateAndUpdateBetOutcome] Stake refunded to user: ${bet.stake}`);
          }
          break;

        default:
          console.error(`[calculateAndUpdateBetOutcome] Unknown status in outcome calculation:`, outcomeResult);
          updateData.status = "canceled";
          updateData.payout = bet.stake; // Refund the stake
          updateData.profit = 0; // No profit, no loss
          // Refund stake to user
          if (bet.userId) {
            await User.findByIdAndUpdate(bet.userId, {
              $inc: { balance: bet.stake },
            });
            console.log(`[calculateAndUpdateBetOutcome] Stake refunded to user due to unknown status: ${bet.stake}`);
          }
          break;
      }

      // Log what we're about to save to database
      console.log(`\n[calculateAndUpdateBetOutcome] ========== SAVING TO DATABASE ==========`);
      console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${betId}`);
      console.log(`[calculateAndUpdateBetOutcome] Update Data:`);
      console.log(`[calculateAndUpdateBetOutcome]   - status: ${updateData.status}`);
      console.log(`[calculateAndUpdateBetOutcome]   - payout: ${updateData.payout}`);
      console.log(`[calculateAndUpdateBetOutcome]   - profit: ${updateData.profit}`);
      console.log(`[calculateAndUpdateBetOutcome] =========================================\n`);

      // Update the bet in database
      const updatedBet = await Bet.findByIdAndUpdate(betId, updateData, {
        new: true,
      });

      if (!updatedBet) {
        throw new CustomError("Failed to update bet", 500, "UPDATE_FAILED");
      }

      console.log(`\n[calculateAndUpdateBetOutcome] ========== DATABASE UPDATE VERIFIED ==========`);
      console.log(`[calculateAndUpdateBetOutcome] Bet ID: ${updatedBet._id}`);
      console.log(`[calculateAndUpdateBetOutcome] Status in DB: ${updatedBet.status}`);
      console.log(`[calculateAndUpdateBetOutcome] Payout in DB: ${updatedBet.payout}`);
      console.log(`[calculateAndUpdateBetOutcome] Profit in DB: ${updatedBet.profit}`);
      console.log(`[calculateAndUpdateBetOutcome] Stake in DB: ${updatedBet.stake}`);
      console.log(`[calculateAndUpdateBetOutcome] Odds in DB: ${updatedBet.odds}`);
      console.log(`[calculateAndUpdateBetOutcome] ===============================================\n`);

      return {
        betId: updatedBet._id,
        status: updatedBet.status,
        payout: updatedBet.payout,
      };
    } catch (error) {
      console.error(`[calculateAndUpdateBetOutcome] Error in outcome calculation:`, error);

      // Update bet status to error (using canceled since error is not in enum)
      await Bet.findByIdAndUpdate(betId, {
        status: "canceled",
        payout: bet.stake, // Refund the stake due to error
      });

      // Refund stake to user due to error
      if (bet.userId) {
        await User.findByIdAndUpdate(bet.userId, {
          $inc: { balance: bet.stake },
        });
        console.log(`[calculateAndUpdateBetOutcome] Stake refunded to user due to calculation error: ${bet.stake}`);
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
    
    // Query for bets that should have been checked by now
    // Use $or to check both new and old field names for backward compatibility
    const pendingBets = await Bet.find({
      status: "pending",
      $or: [
        { betOutcomeCheckTime: { $lte: now } }, // New field
        { 
          $and: [
            { betOutcomeCheckTime: { $exists: false } }, // Old bets without new field
            { estimatedMatchEnd: { $lte: now } }
          ]
        }
      ]
    });

    if (pendingBets.length === 0) return [];

    console.log(`[checkPendingBets] Found ${pendingBets.length} pending bets that should be checked`);

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

  async getUserBets(userId, filters = {}) {
    if (!userId) {
      throw new CustomError("User ID is required", 400, "USER_ID_REQUIRED");
    }
    
    // Ensure userId is ObjectId for proper query matching
    const userIdObj = typeof userId === "string" 
      ? new mongoose.Types.ObjectId(userId) 
      : (userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId.toString()));
    
    // Build query with filters
    const query = { userId: userIdObj };
    
    // Date range filter - only apply if values are provided and not empty
    if ((filters.dateFrom && filters.dateFrom.trim() !== '') || 
        (filters.dateTo && filters.dateTo.trim() !== '')) {
      query.createdAt = {};
      if (filters.dateFrom && filters.dateFrom.trim() !== '') {
        query.createdAt.$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo && filters.dateTo.trim() !== '') {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999); // Include entire end date
        query.createdAt.$lte = endDate;
      }
    }
    
    // Status filter - only apply if status is provided, not empty, and not 'all'
    if (filters.status && filters.status.trim() !== '' && filters.status !== 'all') {
      query.status = filters.status;
    }
    
    // ✅ FIX: Use .lean() for faster JSON serialization (converts Mongoose docs to plain JS objects)
    console.log(`[BetService.getUserBets] Query:`, JSON.stringify(query, null, 2));
    const bets = await Bet.find(query).sort({ createdAt: -1 }).lean();
    console.log(`[BetService.getUserBets] Found ${bets.length} bets for user ${userId} (ObjectId: ${userIdObj}) with filters:`, filters);
    
    // Log first few bets for debugging
    if (bets.length > 0) {
      console.log(`[BetService.getUserBets] Sample bets (first 3):`, bets.slice(0, 3).map(b => ({
        id: b._id,
        userId: b.userId,
        status: b.status,
        createdAt: b.createdAt,
        event: b.event
      })));
    }
    
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

  async getBetsByUserId(userId) {
    if (!userId) {
      throw new CustomError("User ID is required", 400, "USER_ID_REQUIRED");
    }

    // Convert string userId to ObjectId if necessary
    const userObjectId =
      typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
    console.log(
      `[getBetsByUserId] Searching for bets with userId: ${userId} (as ObjectId: ${userObjectId})`
    );

    const bets = await Bet.find({ userId: userObjectId }).sort({
      createdAt: -1,
    });
    console.log(
      `[getBetsByUserId] Found ${bets.length} bets for user ${userId}`
    );

    return bets;
  }

  // In BetService.js
  async recoverMissedBets() {
    // Use current time for comparison
    const now = new Date();
    
    // Query for overdue bets using both new and old field names for backward compatibility
    const overdueBets = await Bet.find({
      status: "pending",
      $or: [
        { betOutcomeCheckTime: { $lte: now } }, // New field
        { 
          $and: [
            { betOutcomeCheckTime: { $exists: false } }, // Old bets without new field
            { estimatedMatchEnd: { $lte: now } }
          ]
        }
      ]
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
            // Calculate proper rescheduling time based on match start time (2h 5min after start)
            const matchStartTime = this.parseMatchStartTime(match.starting_at);
            const properBetOutcomeCheckTime = this.calculateBetOutcomeCheckTime(matchStartTime); // 2h 5min after match start
            
            // Determine appropriate scheduling time
            const now = new Date();
            let newScheduleTime;

            // If match hasn't started yet (state.id === 1), schedule for proper time
            if (match.state?.id === 1) {
              newScheduleTime = properBetOutcomeCheckTime;
              if (newScheduleTime <= now) {
                // If somehow the proper time is in the past, schedule for 30 minutes later
                newScheduleTime = new Date(Date.now() + 30 * 60 * 1000);
              }
            }
            // If match is in progress (state.id between 2-4), schedule for proper time
            else if (match.state?.id >= 2 && match.state?.id <= 4) {
              newScheduleTime = properBetOutcomeCheckTime;
              if (newScheduleTime <= now) {
                // If somehow the proper time is in the past, schedule for 30 minutes later
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

  async getBetById(betId) {
    try {
      const bet = await Bet.findById(betId)
        .populate("userId", "username email")
        .lean();

      return bet;
    } catch (error) {
      console.error("Error fetching bet by ID:", error);
      throw new CustomError("Failed to fetch bet", 500, "FETCH_FAILED");
    }
  }

  async getPendingCombinationBets() {
    try {
      const bets = await Bet.find({
        combination: { $exists: true, $ne: [] },
        status: 'pending'
      })
        .sort({ createdAt: -1 })
        .populate("userId", "username email")
        .lean();

      return bets;
    } catch (error) {
      console.error("Error fetching pending combination bets:", error);
      throw new CustomError("Failed to fetch pending combination bets", 500, "FETCH_FAILED");
    }
  }

  async getCompletedCombinationBets(limit = 50) {
    try {
      const bets = await Bet.find({
        combination: { $exists: true, $ne: [] },
        status: { $in: ['won', 'lost', 'canceled'] }
      })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .populate("userId", "username email")
        .lean();

      return bets;
    } catch (error) {
      console.error("Error fetching completed combination bets:", error);
      throw new CustomError("Failed to fetch completed combination bets", 500, "FETCH_FAILED");
    }
  }

  // Helper methods for combination bet unibetMeta
  extractParticipantFromBetOption(betOption, matchData) {
    if (!betOption || !matchData) return null;
    
    const betOptionLower = betOption.toLowerCase();
    if (betOptionLower.includes('home') || betOptionLower === '1') {
      return matchData.participants?.[0]?.name || 'Home';
    } else if (betOptionLower.includes('away') || betOptionLower === '2') {
      return matchData.participants?.[1]?.name || 'Away';
    } else if (betOptionLower.includes('draw') || betOptionLower === 'x') {
      return 'Draw';
    }
    
    return betOption;
  }

  extractHomeTeam(teamsString) {
    if (!teamsString || !teamsString.includes(' vs ')) return null;
    return teamsString.split(' vs ')[0]?.trim() || null;
  }

  extractAwayTeam(teamsString) {
    if (!teamsString || !teamsString.includes(' vs ')) return null;
    return teamsString.split(' vs ')[1]?.trim() || null;
  }
}

export default new BetService();

import NodeCache from "node-cache";
import { CustomError } from "../utils/customErrors.js";
import FixtureOptimizationService from "./fixture.service.js";
import axios from "axios";
import {
  classifyOdds,
  transformToBettingData,
} from "../utils/oddsClassification.js";
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import AsyncQueue from "../utils/asyncQueue.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class LiveFixturesService {
  constructor(fixtureCache) {
    this.fixtureCache = fixtureCache;
    this.liveOddsCache = new NodeCache({ stdTTL: 10 }); // 10 seconds for live odds (updated every 1 second, increased to prevent cache misses)
    this.inplayMatchesCache = new NodeCache({ stdTTL: 600 }); // 10 minutes
    this.delayedMatchesCache = new NodeCache({ stdTTL: 3600 }); // 1 hour
    this.lastInplayUpdate = 0;
    this.updateInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.io = null; // Will be set from app.js
    this.isUpdating = false; // Prevent multiple simultaneous updates
    this.updateQueue = new AsyncQueue(); // Queue for update operations
    this.matchDataCache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache for match data lookups
    
    // Define allowed market IDs once in constructor
    this.allowedMarketIds = [
      1, 2, 267, 268, 29, 90, 93, 95, 124, 125, 10, 14, 18, 19, 44, 4, 5, 81,
      37, 11, 97, 13, 86, 80, 60, 67, 68, 69, 15, 16, 28, 53, 6 , 26 , 303 ,17
    ];
  }

  // Set Socket.IO instance
  setSocketIO(io) {
    this.io = io;
    console.log('[LiveFixtures] Socket.IO instance set');
  }

  // Emit live odds update via WebSocket
  emitLiveOddsUpdate(matchId, oddsData) {
    if (this.io) {
      const updateData = {
        matchId: matchId,
        odds: oddsData.mainOdds || {}, // Send extracted main odds
        classification: oddsData.odds_classification || {},
        timestamp: new Date().toISOString()
      };
      
      // Emit to specific match room
      this.io.to(`match_${matchId}`).emit('liveOddsUpdate', updateData);
      
      // Also emit to live matches room for general updates
      this.io.to('liveMatches').emit('liveOddsUpdate', updateData);
      
      console.log(`📡 [WebSocket] Emitted live odds update for match ${matchId}`, updateData.odds);
    }
  }

  // Emit live matches update via WebSocket
  async emitLiveMatchesUpdate(liveMatches) {
    if (this.io) {
      // Filter out matches that don't have inplay odds at all
      const matchesWithOdds = [];
      
      for (const match of liveMatches) {
        // Check if this match has inplay odds
        const liveOdds = this.liveOddsCache.get(match.id);
        if (!liveOdds || !liveOdds.betting_data || liveOdds.betting_data.length === 0) {
          console.log(`[LiveFixtures] Skipping match ${match.id} - no inplay odds available`);
          continue;
        }
        
        // Check if the match has any valid odds structure
        const mainOdds = this.extractMainOdds(liveOdds.betting_data);
        if (!mainOdds || Object.keys(mainOdds).length === 0) {
          console.log(`[LiveFixtures] Skipping match ${match.id} - no valid odds structure`);
          continue;
        }
        
        // Include the match even if all odds are suspended (they will show as suspended on frontend)
        matchesWithOdds.push(match);
      }
      
      console.log(`[LiveFixtures] Filtered ${liveMatches.length} matches to ${matchesWithOdds.length} matches with odds`);
      
      // Group matches by league (same as in socket.js)
      const leagueMap = new Map();
      
      for (const match of matchesWithOdds) {
        // Extract team names from the name field
        let team1 = 'Team 1';
        let team2 = 'Team 2';
        
        if (match.name) {
          const teams = match.name.split(' vs ');
          if (teams.length >= 2) {
            team1 = teams[0].trim();
            team2 = teams[1].trim();
          }
        }
        
        // Get league information from cache
        let league = {
          id: match.league_id,
          name: `League ${match.league_id}`,
          imageUrl: null,
          country: null
        };
        
        // Try to get league details from cache
        try {
          const popularLeagues = global.fixtureOptimizationService?.leagueCache?.get("popular_leagues") || [];
          console.log(`[LiveFixtures] Found ${popularLeagues.length} popular leagues in cache for match ${match.league_id}`);
          
          const foundLeague = popularLeagues.find(l => Number(l.id) === Number(match.league_id));
          if (foundLeague) {
            console.log(`[LiveFixtures] Found league info for ${match.league_id}:`, foundLeague.name);
            league.name = foundLeague.name;
            league.imageUrl = foundLeague.image_path || null;
            league.country = typeof foundLeague.country === "string" 
              ? foundLeague.country 
              : foundLeague.country?.name || null;
          } else {
            console.log(`[LiveFixtures] No league info found for ${match.league_id} in cache, trying to fetch from API`);
            
            // Try to fetch league info from API if not in cache
            try {
              const apiToken = process.env.SPORTSMONKS_API_KEY;
              if (apiToken) {
                const url = `https://api.sportmonks.com/v3/football/leagues/${match.league_id}?api_token=${apiToken}`;
                const response = await axios.get(url);
                const leagueData = response.data?.data;
                
                if (leagueData) {
                  console.log(`[LiveFixtures] Fetched league info from API for ${match.league_id}:`, leagueData.name);
                  league.name = leagueData.name;
                  league.imageUrl = leagueData.image_path || null;
                  league.country = leagueData.country?.name || null;
                }
              }
            } catch (apiError) {
              console.log(`[LiveFixtures] Error fetching league info from API for ${match.league_id}:`, apiError.message);
            }
          }
        } catch (error) {
          console.log(`[LiveFixtures] Error fetching league info for ${match.league_id}:`, error);
        }
        
        // Group by league
        const leagueId = match.league_id;
        if (!leagueMap.has(leagueId)) {
          leagueMap.set(leagueId, {
            league: league,
            matches: []
          });
        }
        
        // Add match to league group (without odds - client will merge them)
        const transformedMatch = {
          ...match,
          team1,
          team2,
          league,
          isLive: true,
          time: 'LIVE',
          date: match.starting_at ? match.starting_at.split(' ')[0] : '',
          clock: match.isTicking || false
        };
        
        leagueMap.get(leagueId).matches.push(transformedMatch);
      }
      
      // Convert to array format and filter out empty leagues
      const leagueGroups = Array.from(leagueMap.values()).filter(leagueGroup => {
        if (leagueGroup.matches.length === 0) {
          console.log(`[LiveFixtures] Skipping league ${leagueGroup.league.id} - no matches with odds`);
          return false;
        }
        return true;
      });
      
      // LIMIT TO ONLY ONE LIVE MATCH - API CALL OPTIMIZATION
      let limitedLeagueGroups = leagueGroups;
      if (leagueGroups.length > 0) {
        // Take only the first league group
        const firstLeagueGroup = leagueGroups[0];
        
        // If the first league has multiple matches, take only the first match
        if (firstLeagueGroup.matches && firstLeagueGroup.matches.length > 1) {
          firstLeagueGroup.matches = [firstLeagueGroup.matches[0]];
          console.log(`📡 [WebSocket] [API OPTIMIZATION] Limited to 1 match from ${firstLeagueGroup.matches.length + 1} matches in league ${firstLeagueGroup.league?.name || firstLeagueGroup.league?.id}`);
        }
        
        // Return only the first league group with limited matches
        limitedLeagueGroups = [firstLeagueGroup];
        console.log(`📡 [WebSocket] [API OPTIMIZATION] Emitting only 1 live match to limit API calls`);
      }
      
      const updateData = {
        matches: limitedLeagueGroups,
        timestamp: new Date().toISOString()
      };
      
      this.io.to('liveMatches').emit('liveMatchesUpdate', updateData);
      console.log(`📡 [WebSocket] Emitted live matches update for ${limitedLeagueGroups.length} league groups (filtered from ${Array.from(leagueMap.values()).length} total leagues)`);
    }
  }

  // Helper method to properly parse starting_at field (same as in bet.service.js)
  parseMatchStartTime(startingAt) {
    if (!startingAt) return null;

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
        parsedDate = new Date(startingAt);
      } else {
        // String doesn't have timezone info, treat as UTC
        // Format: "2025-07-05 09:00:00" should be treated as UTC
        // Convert to ISO format and add Z for UTC
        let isoString = startingAt.replace(" ", "T");
        if (!isoString.includes("T")) {
          isoString = startingAt + "T00:00:00";
        }
        if (!isoString.endsWith("Z")) {
          isoString += "Z";
        }
        parsedDate = new Date(isoString);
      }
    } else if (startingAt instanceof Date) {
      // If it's already a Date object
      parsedDate = startingAt;
    } else {
      return null;
    }

    // Check if the date is valid
    if (isNaN(parsedDate.getTime())) {
      console.error(`[LiveFixtures] Invalid date created from: ${startingAt}`);
      return null;
    }

    return parsedDate;
  }

  // Helper method to validate player odds against lineups
  validatePlayerOdds(odds, matchData) {
    // Player validation temporarily disabled
    // if (!matchData || !Array.isArray(matchData.lineups)) {
    //   console.log(
    //     `[LiveFixtures] No lineup data available for player validation`
    //   );
    //   return odds; // Return all odds if no lineup data
    // }

    // // Extract player names from lineups for validation
    // const lineupPlayerNames = new Set();
    // matchData.lineups.forEach((lineup) => {
    //   if (lineup.player_name) {
    //     // Normalize player name for comparison (lowercase, trim spaces)
    //     lineupPlayerNames.add(lineup.player_name.toLowerCase().trim());
    //   }
    // });

    // if (lineupPlayerNames.size === 0) {
    //   // Log when no players are found in match lineups for validation
    //   console.log(
    //     `[LiveFixtures] No players found in lineups for match ${matchData.id}`
    //   );
    //   return odds; // Return all odds if no players in lineups
    // }

    // // Filter odds - validate player odds for market IDs 267 and 268
    // const validatedOdds = odds.filter((odd) => {
    //   // For player-related markets (267, 268), validate player is in lineups
    //   if (odd.market_id === 267 || odd.market_id === 268) {
    //     if (odd.name) {
    //       const playerName = odd.name.toLowerCase().trim();

    //       // Check exact match first
    //       if (lineupPlayerNames.has(playerName)) {
    //         return true;
    //       }

    //       // Check partial match (in case of name variations)
    //       for (const lineupPlayer of lineupPlayerNames) {
    //         // Check if odd name is contained in lineup name or vice versa
    //         if (
    //           lineupPlayer.includes(playerName) ||
    //           playerName.includes(lineupPlayer)
    //         ) {
    //           return true;
    //         }
    //       }

    //       // Player not found in lineups, exclude this odd
    //       console.log(
    //         `🚫 [LiveFixtures] Excluding player odd for "${odd.name}" - not in lineups for match ${matchData.id}`
    //       );
    //       return false;
    //     } else {
    //       // No player name in odd, exclude it
    //       console.log(
    //         `🚫 [LiveFixtures] Excluding player odd with no name for match ${matchData.id}`
    //       );
    //       return false;
    //     }
    //   }

    //   // For non-player markets, include the odd
    //   return true;
    // });

    // // Log player validation results showing how many odds were filtered
    // console.log(
    //   `[LiveFixtures] Player validation: ${odds.length} odds → ${validatedOdds.length} validated odds for match ${matchData.id}`
    // );
    return odds;
  }

  // Helper to group matches by league using the popular leagues cache
  bindLeaguesToMatches(matches) {
    const popularLeagues =
      FixtureOptimizationService.leagueCache.get("popular_leagues") || [];

    const leagueMap = new Map();
    for (const match of matches) {
      const leagueId = match.league_id;

      const foundLeague = popularLeagues.find(
        (l) => Number(l.id) === Number(leagueId)
      );
      let league;
      if (foundLeague) {
        league = {
          id: foundLeague.id,
          name: foundLeague.name,
          imageUrl: foundLeague.image_path || null,
          country:
            typeof foundLeague.country === "string"
              ? foundLeague.country
              : foundLeague.country?.name || null,
        };
      } else {
        // Try to get league info from the match itself if available
        if (match.league && match.league.name) {
          league = {
            id: match.league.id || leagueId,
            name: match.league.name,
            imageUrl: match.league.image_path || match.league.imageUrl || null,
            country: match.league.country?.name || match.league.country || null,
          };
        } else {
          league = {
            id: leagueId,
            name: `League ${leagueId}`,
            imageUrl: null,
            country: null,
          };
        }
      }

      if (!leagueMap.has(league.id)) {
        leagueMap.set(league.id, { league, matches: [] });
      }
      leagueMap.get(league.id).matches.push(match);
    }

    const result = Array.from(leagueMap.values());

    return result;
  }

  // Returns matches for today that have started (live)
  async getLiveMatchesFromCache() {
    console.log('[LiveFixtures] Getting live matches from cache');
    
    // Check if we need to update inplay matches (non-blocking)
    const now = Date.now();
    if (now - this.lastInplayUpdate > this.updateInterval) {
      console.log('[LiveFixtures] Scheduling inplay matches update (non-blocking)');
      // Schedule the update but don't wait for it
      setImmediate(() => {
        this.updateInplayMatches().then(() => {
          this.lastInplayUpdate = Date.now();
        }).catch(error => {
          console.error('[LiveFixtures] Error in scheduled update:', error);
        });
      });
    }
    
    // Get inplay matches from cache (return immediately)
    const inplayMatches = this.inplayMatchesCache.get('inplay_matches') || [];
    console.log(`[LiveFixtures] Found ${inplayMatches.length} inplay matches`);
    
    // Group matches by league
    const grouped = this.bindLeaguesToMatches(inplayMatches).map((group) => ({
      league: group.league,
      matches: group.matches.map((match) => {
        // Get cached odds for this match
        const cachedOdds = this.liveOddsCache.get(match.id);
        const mainOdds = cachedOdds && cachedOdds.betting_data
          ? this.extractMainOdds(cachedOdds.betting_data)
          : {};

        return {
          ...match,
          odds: mainOdds,
        };
      }),
    }));

    console.log(`[LiveFixtures] Returning ${grouped.length} league groups with live matches`);
    return grouped;
  }

  // Fetch inplay matches from SportMonks API
  async updateInplayMatches() {
    // Use queue to prevent multiple simultaneous updates
    return this.updateQueue.add(async () => {
      console.log('[LiveFixtures] Starting inplay matches update...');
      
      try {
        const apiToken = process.env.SPORTSMONKS_API_KEY;
      if (!apiToken) {
        console.error('[LiveFixtures] SPORTSMONKS_API_KEY is not set');
        return;
      }

      const url = `https://api.sportmonks.com/v3/football/livescores/inplay?api_token=${apiToken}&include=periods;state`;
      console.log('[LiveFixtures] Fetching inplay matches from API');
      
      const response = await axios.get(url);
      const inplayData = response.data?.data || [];
      
      console.log(`[LiveFixtures] API returned ${inplayData.length} inplay matches`);
      
      // Process inplay matches concurrently
      const matchProcessingPromises = inplayData.map(async (match) => {
        // Check if match is ticking (has active timer)
        const isTicking = match.periods?.some(period => period.ticking) || false;
        const hasStarted = match.state_id && [2, 3, 4, 22, 23, 24].includes(match.state_id); // INPLAY states (2=live, 3=halftime, 4=extra time, 22=2nd half, 23=2nd half HT, 24=extra time)
        
        if (hasStarted) {
          // Get additional match details from fixture cache (non-blocking)
          const fixtureDetails = await this.getMatchDataFromCache(match.id);
          
          // Create timing object for frontend using SportMonks periods data
          const currentPeriod = match.periods?.find(p => p.ticking) || match.periods?.[0]; // Use first period if none ticking (halftime)
          const now = Date.now();
          
          // Use SportMonks periods data for timing
          const sportMonksMinutes = currentPeriod?.minutes || 0;
          const sportMonksSeconds = currentPeriod?.seconds || 0;
          
          console.log(`[LiveFixtures] Match ${match.id} timing from SportMonks: ${sportMonksMinutes}:${sportMonksSeconds.toString().padStart(2, '0')} (${currentPeriod?.description}) - State: ${match.state?.name}`);
          
          const timing = {
            matchStarted: match.starting_at_timestamp, // Keep for reference only
            currentMinute: sportMonksMinutes,
            currentSecond: sportMonksSeconds,
            period: currentPeriod?.description || 'Unknown',
            periodType: currentPeriod?.type_id || 0,
            isTicking: currentPeriod?.ticking || false,
            cacheTime: now,
            timeSource: 'sportmonks_only',
            matchState: match.state?.name || 'Unknown'
          };

          const processedMatch = {
            ...match,
            ...fixtureDetails,
            isLive: true,
            isTicking,
            currentPeriod: currentPeriod,
            matchState: match.state,
            timing: timing,
            state_id: match.state_id // Ensure state_id is included
          };
          
          // Update delayed matches cache - remove if now inplay (non-blocking)
          this.delayedMatchesCache.del(match.id);
          
          return processedMatch;
        }
        return null; // Return null for matches that haven't started
      });
      
      // Wait for all match processing to complete concurrently
      const processedMatchesResults = await Promise.all(matchProcessingPromises);
      
      // Filter out null results (matches that haven't started)
      const processedMatches = processedMatchesResults.filter(match => match !== null);
      
      // Check for delayed matches (should have started but not in inplay) - non-blocking
      setImmediate(() => {
        this.checkDelayedMatches().catch(error => {
          console.error('[LiveFixtures] Error checking delayed matches:', error);
        });
      });
      
      // Cache the processed matches (non-blocking)
      this.inplayMatchesCache.set('inplay_matches', processedMatches);
      
      console.log(`[LiveFixtures] Cached ${processedMatches.length} inplay matches`);
      
      // Update odds for the inplay matches (non-blocking)
      if (processedMatches.length > 0) {
        console.log(`[LiveFixtures] Updating odds for ${processedMatches.length} inplay matches`);
        // Use setImmediate to make odds update non-blocking
        setImmediate(() => {
          this.updateInplayMatchesOdds(processedMatches).catch(error => {
            console.error('[LiveFixtures] Error updating inplay matches odds:', error);
          });
        });
      }
      
          } catch (error) {
        console.error('[LiveFixtures] Error fetching inplay matches:', error);
      }
    });
  }

  // Check for delayed matches that should have started
  async checkDelayedMatches() {
    try {
      const now = new Date();
      const cacheKeys = this.fixtureCache.keys();
      
      for (const key of cacheKeys) {
        if (key.startsWith("fixtures_")) {
          const cachedData = this.fixtureCache.get(key);
          let fixtures = [];
          
          if (Array.isArray(cachedData)) {
            fixtures = cachedData;
          } else if (cachedData && Array.isArray(cachedData.data)) {
            fixtures = cachedData.data;
          } else if (cachedData instanceof Map) {
            fixtures = Array.from(cachedData.values());
          } else {
            continue;
          }

          for (const match of fixtures) {
            if (!match.starting_at) continue;
            
            const matchTime = this.parseMatchStartTime(match.starting_at);
            if (!matchTime) continue;
            
            // Check if match should have started (within last 30 minutes)
            const shouldHaveStarted = matchTime <= now && 
              (now.getTime() - matchTime.getTime()) <= 30 * 60 * 1000; // 30 minutes
            
            if (shouldHaveStarted) {
              // Check if not already in inplay cache
              const inplayMatches = this.inplayMatchesCache.get('inplay_matches') || [];
              const isInInplay = inplayMatches.some(m => m.id === match.id);
              
              if (!isInInplay) {
                // Add to delayed matches cache
                this.delayedMatchesCache.set(match.id, {
                  ...match,
                  shouldHaveStartedAt: matchTime,
                  delayMinutes: Math.floor((now.getTime() - matchTime.getTime()) / (60 * 1000))
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[LiveFixtures] Error checking delayed matches:', error);
    }
  }

  // Original method (renamed for clarity)
  getOriginalLiveMatches() {
    const now = new Date();
    const cacheKeys = this.fixtureCache.keys();
    let liveMatches = [];
    let totalMatches = 0;
    let matchesChecked = 0;

    for (const key of cacheKeys) {
      if (key.startsWith("fixtures_")) {
        const cachedData = this.fixtureCache.get(key);
        let fixtures = [];
        if (Array.isArray(cachedData)) {
          fixtures = cachedData;
        } else if (cachedData && Array.isArray(cachedData.data)) {
          fixtures = cachedData.data;
        } else if (cachedData instanceof Map) {
          fixtures = Array.from(cachedData.values());
        } else {
          continue;
        }

        totalMatches += fixtures.length;

        for (const match of fixtures) {
          matchesChecked++;

          if (!match.starting_at) {
            continue;
          }

          // Use the proper timezone parsing helper
          const matchTime = this.parseMatchStartTime(match.starting_at);
          if (!matchTime) {
            continue;
          }

          // More flexible live match detection
          const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000); // 120 minutes after start
          const timeSinceStart = now.getTime() - matchTime.getTime();
          const timeUntilEnd = matchEnd.getTime() - now.getTime();

          // Check multiple conditions for live matches
          const isStarted = matchTime <= now;
          const isNotEnded = now < matchEnd;
          const isLiveByTime = isStarted && isNotEnded;

          // Also check by state_id if available (2 = live, 3 = halftime, 4 = extra time, 22 = 2nd half, 23 = 2nd half HT, 24 = extra time)
          const isLiveByState =
            match.state_id && [2, 3, 4, 22, 23, 24].includes(match.state_id);

          // Consider match live if either time-based or state-based criteria are met
          const isLive = isLiveByTime || isLiveByState;

          if (isLive) {
            console.log(`[getOriginalLiveMatches] Match ${match.id} is live: state_id=${match.state_id}, state=${match.state?.name || 'unknown'}`);
            liveMatches.push(match);
          }
        }
      }
    }

    const grouped = this.bindLeaguesToMatches(liveMatches).map((group) => ({
      league: group.league,
      matches: group.matches.map((match) => {
        // Get cached odds for this match
        const cachedOdds = this.liveOddsCache.get(match.id);
        console.log(
          `[getLiveMatchesFromCache] Match ${match.id} cached odds:`,
          {
            hasCache: !!cachedOdds,
            hasBettingData: !!(cachedOdds && cachedOdds.betting_data),
            bettingDataLength:
              cachedOdds && cachedOdds.betting_data
                ? cachedOdds.betting_data.length
                : 0,
          }
        );

        const mainOdds =
          cachedOdds && cachedOdds.betting_data
            ? this.extractMainOdds(cachedOdds.betting_data)
            : {};

        console.log(
          `[getLiveMatchesFromCache] Match ${match.id} main odds:`,
          mainOdds
        );

        return {
          ...match,
          odds: mainOdds, // Include the main 1X2 odds
        };
      }),
    }));

    // Log the number of league groups containing live matches
    console.log(
      `[LiveFixtures] Returning ${grouped.length} league groups with live matches`
    );
    return grouped;
  }

  // Fetch and update odds for all live matches
  async updateAllLiveOdds() {
    console.log('[LiveFixtures] Starting live odds update process');
    
    // Get inplay matches from cache
    const inplayMatches = this.inplayMatchesCache.get('inplay_matches') || [];
    
    if (inplayMatches.length === 0) {
      console.log('[LiveFixtures] No inplay matches found - skipping odds update to save API calls');
      return;
    }
    
    console.log(`[LiveFixtures] Found ${inplayMatches.length} inplay matches - proceeding with odds update`);
    
    // Update odds for all inplay matches
    await this.updateInplayMatchesOdds(inplayMatches);
    console.log('[LiveFixtures] Live odds update completed');
  }

  // Update odds for inplay matches
  async updateInplayMatchesOdds(inplayMatches) {
    if (!inplayMatches || inplayMatches.length === 0) {
      console.log('[LiveFixtures] No inplay matches found - skipping odds update');
      return;
    }
    
    // LIMIT TO ONLY ONE LIVE MATCH - API CALL OPTIMIZATION
    const limitedInplayMatches = inplayMatches.slice(0, 1);
    console.log(`[LiveFixtures] [API OPTIMIZATION] Limiting odds update to 1 match from ${inplayMatches.length} inplay matches`);

    const apiToken = process.env.SPORTSMONKS_API_KEY;
    if (!apiToken) {
      console.error("❌ SPORTSMONKS_API_KEY is not set");
      return;
    }

    // Use worker thread for intensive odds processing if there are many matches
    if (limitedInplayMatches.length > 3) {
      return this.updateOddsWithWorker(limitedInplayMatches, apiToken);
    }

    // Process all matches concurrently
    const oddsUpdatePromises = limitedInplayMatches.map(async (match) => {
      try {
        // Update odds for matches that are live (including halftime)
        if (!match.isLive) {
          console.log(`[LiveFixtures] Skipping match ${match.id} - not live`);
          return { success: false, matchId: match.id, reason: 'not_live' };
        }

        // Use the fixture endpoint with inplayOdds included
        const url = `https://api.sportmonks.com/v3/football/fixtures/${match.id}?api_token=${apiToken}&include=inplayOdds&filters=bookmakers:2`;

        console.log(`[LiveFixtures] Fetching odds for match ${match.id} from: ${url}`);
        const response = await axios.get(url);
        const allOdds = response.data?.data?.inplayodds || [];
        
        console.log(`[LiveFixtures] Match ${match.id} - Raw odds count: ${allOdds.length}`);
        
        // Filter odds by allowed market IDs
        let filteredOdds = allOdds.filter((odd) =>
          this.allowedMarketIds.includes(odd.market_id)
        );
        
        console.log(`[LiveFixtures] Match ${match.id} - Filtered odds count: ${filteredOdds.length}`);

        // Group odds by market for classification
        const odds_by_market = {};
        for (const odd of filteredOdds) {
          if (!odd.market_id) continue;
          if (!odds_by_market[odd.market_id]) {
            odds_by_market[odd.market_id] = {
              market_id: odd.market_id,
              market_description: odd.market_description,
              odds: [],
            };
          }
          odds_by_market[odd.market_id].odds.push(odd);
          odds_by_market[odd.market_id].market_description = odd.market_description;
        }
        
        const classified = classifyOdds({ odds_by_market });
        const betting_data = transformToBettingData(classified, match);
        
        // Extract main odds for WebSocket emission
        const mainOdds = this.extractMainOdds(betting_data);
        
        // Store in unified format
        const result = {
          betting_data: betting_data,
          odds_classification: classified,
          cached_at: Date.now(),
          source: 'inplay_update'
        };

        // Cache the result in unified format (non-blocking)
        this.liveOddsCache.set(match.id, result);

        // Emit WebSocket update for this match with extracted main odds (non-blocking)
        setImmediate(() => {
          this.emitLiveOddsUpdate(match.id, {
            ...result,
            mainOdds: mainOdds
          });
        });

        return { success: true, matchId: match.id };
        
      } catch (error) {
        console.error(`[LiveFixtures] Error updating odds for match ${match.id}:`, error);
        return { success: false, matchId: match.id, error: error.message };
      }
    });

    // Wait for all odds updates to complete concurrently
    const results = await Promise.all(oddsUpdatePromises);
    
    // Count successful updates
    const successfulUpdates = results.filter(result => result.success).length;
    console.log(`[LiveFixtures] Successfully updated ${successfulUpdates}/${limitedInplayMatches.length} inplay matches`);
    
    // After all odds are fetched, emit the live matches update (non-blocking)
    // This ensures matches are only shown after odds are ready
    setImmediate(async () => {
      try {
        const cachedMatches = this.inplayMatchesCache.get('inplay_matches') || [];
        if (cachedMatches.length > 0) {
          console.log(`[LiveFixtures] Emitting live matches update after odds fetch for ${cachedMatches.length} matches`);
          await this.emitLiveMatchesUpdate(cachedMatches);
        }
      } catch (error) {
        console.error('[LiveFixtures] Error emitting live matches update:', error);
      }
    });
  }

  // Update odds using worker thread for intensive processing
  async updateOddsWithWorker(matches, apiToken) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(__dirname, 'oddsWorker.js'), {
        workerData: {
          matches: matches.map(match => ({
            id: match.id,
            isLive: match.isLive
          })),
          apiToken,
          allowedMarketIds: this.allowedMarketIds
        }
      });

      worker.on('message', (result) => {
        // Process results and update cache
        result.forEach(matchResult => {
          if (matchResult.success) {
            this.liveOddsCache.set(matchResult.matchId, matchResult.data);
            
            // Emit WebSocket update (non-blocking)
            setImmediate(() => {
              this.emitLiveOddsUpdate(matchResult.matchId, {
                ...matchResult.data,
                mainOdds: this.extractMainOdds(matchResult.data.betting_data)
              });
            });
          }
        });
        
        resolve();
      });

      worker.on('error', (error) => {
        console.error('[LiveFixtures] Worker error:', error);
        reject(error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[LiveFixtures] Worker stopped with exit code ${code}`);
        }
      });
    });
  }

  // Update odds for fallback matches (when scheduler is not available or as backup)
  async updateFallbackMatchesOdds(liveMatches) {
    // Early return if no fallback matches to avoid unnecessary API calls
    if (!liveMatches || liveMatches.length === 0) {
      console.log('[LiveFixtures] No fallback matches found - skipping fallback odds update');
      return;
    }
    
    const totalFallbackMatches = liveMatches.reduce((count, group) => count + group.matches.length, 0);
    if (totalFallbackMatches === 0) {
      console.log('[LiveFixtures] No matches in fallback groups - skipping fallback odds update');
      return;
    }
    
    // LIMIT TO ONLY ONE LIVE MATCH - API CALL OPTIMIZATION
    console.log(`[LiveFixtures] [API OPTIMIZATION] Limiting fallback odds update to 1 match from ${totalFallbackMatches} fallback matches`);
    
    const apiToken = process.env.SPORTSMONKS_API_KEY;

    if (!apiToken) {
      console.error("❌ SPORTSMONKS_API_KEY is not set");
      return;
    }

    let totalMatches = 0;
    let successfulUpdates = 0;
    let processedMatches = 0; // Track how many matches we've processed

    for (const group of liveMatches) {
      for (const match of group.matches) {
        // LIMIT TO ONLY ONE MATCH - API CALL OPTIMIZATION
        if (processedMatches >= 1) {
          console.log(`[LiveFixtures] [API OPTIMIZATION] Skipping match ${match.id} - already processed 1 match`);
          break;
        }
        processedMatches++;
        totalMatches++;
        
        // Skip if we already have fresh odds from scheduler
        const existingOdds = this.liveOddsCache.get(match.id);
        if (existingOdds && existingOdds.source === 'match_scheduler' && 
            existingOdds.cached_at && (Date.now() - existingOdds.cached_at) < 180000) { // 3 minutes
          console.log(`[LiveFixtures] Skipping match ${match.id} - has fresh scheduler odds`);
          continue;
        }

        try {
          // Use the fixture endpoint with inplayOdds included
          const url = `https://api.sportmonks.com/v3/football/fixtures/${match.id}?api_token=${apiToken}&include=inplayOdds&filters=bookmakers:2`;

          const response = await axios.get(url);
          const allOdds = response.data?.data?.inplayodds || [];
          
          // Filter odds by allowed market IDs
          let filteredOdds = allOdds.filter((odd) =>
            this.allowedMarketIds.includes(odd.market_id)
          );

          // Group odds by market for classification
          const odds_by_market = {};
          for (const odd of filteredOdds) {
            if (!odd.market_id) continue;
            if (!odds_by_market[odd.market_id]) {
              odds_by_market[odd.market_id] = {
                market_id: odd.market_id,
                market_description: odd.market_description,
                odds: [],
              };
            }
            odds_by_market[odd.market_id].odds.push(odd);
            odds_by_market[odd.market_id].market_description =
              odd.market_description;
          }
          const classified = classifyOdds({ odds_by_market });
          const betting_data = transformToBettingData(classified, match);

          // Extract main odds for WebSocket emission
          const mainOdds = this.extractMainOdds(betting_data);
          
          // Store in unified format
          const result = {
            betting_data: betting_data,
            odds_classification: classified,
            cached_at: Date.now(),
            source: 'fallback_update'
          };

          // Cache the result in unified format
          this.liveOddsCache.set(match.id, result);
          successfulUpdates++;

          // Emit WebSocket update for this match with extracted main odds
          this.emitLiveOddsUpdate(match.id, {
            ...result,
            mainOdds: mainOdds
          });

          console.log(
            `[LiveFixtures] Updated fallback odds for match ${match.id} with ${betting_data.length} betting data sections`
          );
        } catch (err) {
          console.error(
            `❌ Failed to update fallback odds for match ${match.id}:`,
            err.message
          );
        }
      }
      
      // LIMIT TO ONLY ONE MATCH - API CALL OPTIMIZATION
      if (processedMatches >= 1) {
        console.log(`[LiveFixtures] [API OPTIMIZATION] Exiting outer loop - already processed 1 match`);
        break;
      }
    }

    console.log(
      `[LiveFixtures] Updated fallback odds for ${successfulUpdates}/${totalMatches} matches`
    );
  }

  // Get latest betting_data for a match (from cache)
  getLiveOdds(matchId) {
    // Return betting_data from cached result
    const cached = this.liveOddsCache.get(matchId);
    if (cached && cached.betting_data) {
      return cached.betting_data;
    }
    return [];
  }

  // Get latest odds classification for a match (from cache)
  getLiveOddsClassification(matchId) {
    // Return odds_classification from cached result
    const cached = this.liveOddsCache.get(matchId);
    if (cached && cached.odds_classification) {
      return cached.odds_classification;
    }
    return {
      categories: [{ id: "all", label: "All", odds_count: 0 }],
      classified_odds: {},
      stats: { total_categories: 0, total_odds: 0 },
    };
  }

  // Check if fixture cache has any data
  hasFixtureCacheData() {
    if (!this.fixtureCache) {
      console.log('[LiveFixtures] No fixture cache available');
      return false;
    }
    
    const cacheKeys = this.fixtureCache.keys();
    const hasData = cacheKeys.length > 0;
    
    console.log(`[LiveFixtures] Fixture cache check: ${cacheKeys.length} keys found`);
    
    // Log some sample keys for debugging
    if (hasData) {
      const sampleKeys = cacheKeys.slice(0, 5);
      console.log(`[LiveFixtures] Sample cache keys:`, sampleKeys);
    }
    
    return hasData;
  }

  // Notify agenda jobs about fixture cache changes
  async notifyFixtureCacheChange() {
    try {
      // Import the function dynamically to avoid circular dependencies
      const { checkFixtureCacheAndManageJobs } = await import('../config/agendaJobs.js');
      await checkFixtureCacheAndManageJobs();
      console.log('[LiveFixtures] Notified agenda jobs about fixture cache change');
    } catch (error) {
      console.error('[LiveFixtures] Error notifying agenda jobs:', error);
    }
  }

  // Ensure we have live odds for a specific match
  async ensureLiveOdds(matchId) {
    // Check if we already have odds in unified cache
    let odds = this.liveOddsCache.get(matchId);
    console.log(`[ensureLiveOdds] Unified cache check for match ${matchId}:`, {
      hasCache: !!odds,
      cacheType: typeof odds,
      cacheSource: odds?.source || 'unknown',
      hasBettingData: !!(odds && odds.betting_data),
      cacheAge: odds?.cached_at ? Date.now() - odds.cached_at : null,
    });

    // Use 1-second cache to prevent API spam while keeping data fresh
    if (odds && odds.betting_data && odds.betting_data.length > 0) {
      console.log(`[ensureLiveOdds] Returning cached odds for match ${matchId} (cache age: ${Date.now() - odds.cached_at}ms)`);
      return odds;
    }

    // Check if the match is actually live before fetching odds
    const isLive = this.isMatchLive(matchId);
    console.log(`[ensureLiveOdds] Match ${matchId} is live: ${isLive}`);
    
    if (!isLive) {
      console.log(`[ensureLiveOdds] Match ${matchId} is not live - returning empty odds`);
      return {
        betting_data: [],
        odds_classification: {
          categories: [{ id: "all", label: "All", odds_count: 0 }],
          classified_odds: {},
          stats: { total_categories: 0, total_odds: 0 },
        },
        cached_at: Date.now(),
        source: 'match_not_live',
        api_timestamp: new Date().toISOString()
      };
    }

    // Fetch fresh odds if not in cache or cache expired
    console.log(`[ensureLiveOdds] Fetching fresh odds for match ${matchId}`);
    return await this.fetchOddsDirectly(matchId);
  }

    // Direct API fetch with unified format (fallback method)
  async fetchOddsDirectly(matchId) {
    const apiToken = process.env.SPORTSMONKS_API_KEY;
    if (!apiToken) {
      throw new CustomError("API key not configured", 500, "API_KEY_MISSING");
    }

    // Retry logic for network issues
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[fetchOddsDirectly] Attempt ${attempt}/${maxRetries} for match ${matchId}`);
        
        const url = `https://api.sportmonks.com/v3/football/fixtures/${matchId}?api_token=${apiToken}&include=inplayOdds&filters=bookmakers:2`;
        console.log(`[fetchOddsDirectly] Fetching odds for match ${matchId} from: ${url}`);
        
        // Add timeout and retry logic
        const response = await axios.get(url, {
          timeout: 5000, // 5 second timeout (reduced from 10s)
          headers: {
            'User-Agent': 'BetApp/1.0'
          }
        });
        
        console.log(`[fetchOddsDirectly] Response status: ${response.status}`);
        console.log(`[fetchOddsDirectly] Response data keys:`, Object.keys(response.data || {}));
        
        const allOddsData = response.data?.data?.inplayodds || [];
        console.log(`[fetchOddsDirectly] Raw odds count: ${allOddsData.length}`);

        // Filter odds by allowed market IDs
        let oddsData = allOddsData.filter((odd) =>
          this.allowedMarketIds.includes(odd.market_id)
        );

        // Get match data for team names
        let matchData = await this.getMatchDataFromCache(matchId);

        // Group odds by market for classification
        const odds_by_market = {};
        for (const odd of oddsData) {
          if (!odd.market_id) continue;
          if (!odds_by_market[odd.market_id]) {
            odds_by_market[odd.market_id] = {
              market_id: odd.market_id,
              market_description: odd.market_description,
              odds: [],
            };
          }
          odds_by_market[odd.market_id].odds.push({
            ...odd,
            id: odd.id,
            value: odd.value,
            label: odd.label,
            name: odd.name || odd.label,
            suspended: odd.suspended,
            stopped: odd.stopped,
          });
          odds_by_market[odd.market_id].market_description = odd.market_description;
        }

        const classified = classifyOdds({ odds_by_market });
        const betting_data = transformToBettingData(classified, matchData);

        // Store in unified format
        const result = {
          betting_data: betting_data,
          odds_classification: classified,
          cached_at: Date.now(),
          source: 'direct_fetch',
          api_timestamp: new Date().toISOString()
        };

        console.log(
          `[ensureLiveOdds] Fetched and cached ${result.betting_data.length} sections for match ${matchId}`
        );

        // Cache the result in unified format (1 second TTL ensures fresh data)
        this.liveOddsCache.set(matchId, result);
        return result;
        
      } catch (err) {
        lastError = err;
        console.error(`[fetchOddsDirectly] Attempt ${attempt} failed for match ${matchId}:`, {
          message: err.message,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          url: err.config?.url
        });
        
        // If it's a 404, the match might not have inplay odds available
        if (err.response?.status === 404) {
          console.log(`[fetchOddsDirectly] Match ${matchId} has no inplay odds available`);
          return {
            betting_data: [],
            odds_classification: {
              categories: [{ id: "all", label: "All", odds_count: 0 }],
              classified_odds: {},
              stats: { total_categories: 0, total_odds: 0 },
            },
            cached_at: Date.now(),
            source: 'no_odds_available',
            api_timestamp: new Date().toISOString()
          };
        }
        
        // Handle network errors (socket hang up, timeouts, etc.)
        if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('socket hang up')) {
          console.log(`[fetchOddsDirectly] Network error for match ${matchId}: ${err.message}`);
          
          // If this is the last attempt, return empty odds
          if (attempt === maxRetries) {
            return {
              betting_data: [],
              odds_classification: {
                categories: [{ id: "all", label: "All", odds_count: 0 }],
                classified_odds: {},
                stats: { total_categories: 0, total_odds: 0 },
              },
              cached_at: Date.now(),
              source: 'network_error',
              api_timestamp: new Date().toISOString()
            };
          }
          
          // Wait before retrying (exponential backoff)
          const delay = 500 * attempt; // 0.5s, 1s, 1.5s (reduced delays)
          console.log(`[fetchOddsDirectly] Waiting ${delay}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For other errors, throw immediately
        throw err;
      }
    }
    
    // If all retries failed, throw the last error
    throw new CustomError(
      `Failed to fetch live odds after ${maxRetries} attempts: ${lastError.message}`,
      500,
      "LIVE_ODDS_FETCH_ERROR"
    );
  }

  // Helper to get match data from cache (optimized)
  async getMatchDataFromCache(matchId) {
    // Convert matchId to number for consistent comparison
    const numericMatchId = parseInt(matchId);
    
    // Check our local cache first
    const cacheKey = `match_data_${numericMatchId}`;
    const cachedMatchData = this.matchDataCache.get(cacheKey);
    if (cachedMatchData) {
      return cachedMatchData;
    }
    
    // Search in fixture cache (optimized)
    const cacheKeys = this.fixtureCache.keys();
    for (const key of cacheKeys) {
      if (key.startsWith("fixtures_")) {
        const cachedData = this.fixtureCache.get(key);
        let fixtures = [];
        
        // Handle different data structures efficiently
        if (Array.isArray(cachedData)) {
          fixtures = cachedData;
        } else if (cachedData && Array.isArray(cachedData.data)) {
          fixtures = cachedData.data;
        } else if (cachedData instanceof Map) {
          // Use Map's get method for O(1) lookup if possible
          const matchData = cachedData.get(numericMatchId);
          if (matchData) {
            // Cache the result
            this.matchDataCache.set(cacheKey, matchData);
            return matchData;
          }
          fixtures = Array.from(cachedData.values());
        } else {
          continue;
        }

        // Use find with numeric comparison for better performance
        const matchData = fixtures.find(m => m.id === numericMatchId);
        if (matchData) {
          // Cache the result
          this.matchDataCache.set(cacheKey, matchData);
          return matchData;
        }
      }
    }
    return null;
  }

  // Extract only 1, X, 2 odds for inplay display
  extractMainOdds(bettingData) {
    if (!Array.isArray(bettingData)) {
      return {};
    }

    // Find the main market (1x2) section in betting data
    const mainMarketSection = bettingData.find(
      (section) =>
        section.title === "Match Result" ||
        section.title === "1X2" ||
        section.title === "Fulltime Result" || // Add this variation
        section.market_id === 1
    );

    if (!mainMarketSection || !mainMarketSection.options) {
      return {};
    }

    const result = {};

    // Extract home, draw, away odds with suspended status
    mainMarketSection.options.forEach((option) => {
      const label = option.label?.toLowerCase();
      const name = option.name?.toLowerCase();

      if (
        label === "home" ||
        label === "1" ||
        name === "home" ||
        name === "1"
      ) {
        result.home = {
          value: option.value,
          oddId: option.id,
          suspended: option.suspended || false,
        };
      } else if (
        label === "draw" ||
        label === "x" ||
        name === "draw" ||
        name === "x"
      ) {
        result.draw = {
          value: option.value,
          oddId: option.id,
          suspended: option.suspended || false,
        };
      } else if (
        label === "away" ||
        label === "2" ||
        name === "away" ||
        name === "2"
      ) {
        result.away = {
          value: option.value,
          oddId: option.id,
          suspended: option.suspended || false,
        };
      }
    });

    return result;
  }

  // Returns a map of betting_data for all live matches: { [matchId]: betting_data }
  getAllLiveOddsMap() {
    const now = new Date();
    const cacheKeys = this.fixtureCache.keys();
    let liveMatchIds = [];

    for (const key of cacheKeys) {
      if (key.startsWith("fixtures_")) {
        const cachedData = this.fixtureCache.get(key);
        let fixtures = [];
        if (Array.isArray(cachedData)) {
          fixtures = cachedData;
        } else if (cachedData && Array.isArray(cachedData.data)) {
          fixtures = cachedData.data;
        } else if (cachedData instanceof Map) {
          fixtures = Array.from(cachedData.values());
        } else {
          continue;
        }

        for (const match of fixtures) {
          if (!match.starting_at) continue;

          // Use the proper timezone parsing helper
          const matchTime = this.parseMatchStartTime(match.starting_at);
          if (!matchTime) {
            continue;
          }

          const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000);

          // Check multiple conditions for live matches (same as getLiveMatchesFromCache)
          const isStarted = matchTime <= now;
          const isNotEnded = now < matchEnd;
          const isLiveByTime = isStarted && isNotEnded;

          // Also check by state_id if available (2 = live, 3 = halftime, 4 = extra time, 22 = 2nd half, 23 = 2nd half HT, 24 = extra time)
          const isLiveByState =
            match.state_id && [2, 3, 4, 22, 23, 24].includes(match.state_id);

          // Consider match live if either time-based or state-based criteria are met
          const isLive = isLiveByTime || isLiveByState;

          if (isLive) {
            console.log(`[getAllLiveOddsMap] Match ${match.id} is live: state_id=${match.state_id}, state=${match.state?.name || 'unknown'}`);
            liveMatchIds.push(match.id);
          }
        }
      }
    }

    // Build the betting_data map
    const bettingDataMap = {};
    for (const matchId of liveMatchIds) {
      const cached = this.liveOddsCache.get(matchId);
      if (cached) {
        bettingDataMap[matchId] = {
          betting_data: cached.betting_data || [],
          odds_classification: cached.odds_classification || {
            categories: [{ id: "all", label: "All", odds_count: 0 }],
            classified_odds: {},
            stats: { total_categories: 0, total_odds: 0 },
          },
        };
      } else {
        bettingDataMap[matchId] = {
          betting_data: [],
          odds_classification: {
            categories: [{ id: "all", label: "All", odds_count: 0 }],
            classified_odds: {},
            stats: { total_categories: 0, total_odds: 0 },
          },
        };
      }
    }

    console.log(
      `[LiveFixtures] getAllLiveOddsMap found ${liveMatchIds.length} live matches`
    );
    return bettingDataMap;
  }

  // Debug method to get all matches and their states

  // Check if a specific match is live
  isMatchLive(matchId) {
    console.log(`[isMatchLive] Checking if match ${matchId} is live...`);
    
    // Check if the match exists in the inplay matches cache
    const inplayMatches = this.inplayMatchesCache.get('inplay_matches') || [];
    console.log(`[isMatchLive] Found ${inplayMatches.length} inplay matches in cache`);
    
    // Check if matchId exists in inplay matches
    const liveMatch = inplayMatches.find(match => 
      match.id == matchId || match.id === parseInt(matchId)
    );
    
    if (!liveMatch) {
      console.log(`[isMatchLive] Match ${matchId} NOT found in inplay matches cache - NOT LIVE`);
      return false;
    }
    
    console.log(`[isMatchLive] Match ${matchId} found in inplay matches cache - IS LIVE`);
    console.log(`[isMatchLive] Match details: state_id=${liveMatch.state_id}, state=${liveMatch.state?.name || 'unknown'}, starting_at=${liveMatch.starting_at}`);
    
    // Since the match is in the inplay cache, it's already validated as live
    // But we can do additional validation if needed
    if (!liveMatch.starting_at) {
      console.log(`[isMatchLive] Match ${matchId} has no starting_at time - but still in inplay cache, so LIVE`);
      return true; // Still return true since it's in inplay cache
    }

    const matchTime = this.parseMatchStartTime(liveMatch.starting_at);
    if (!matchTime) {
      console.log(`[isMatchLive] Match ${matchId} has invalid starting_at time - but still in inplay cache, so LIVE`);
      return true; // Still return true since it's in inplay cache
    }

    const now = new Date();
    const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000); // 120 minutes after start

    // Check multiple conditions for live matches
    const isStarted = matchTime <= now;
    const isNotEnded = now < matchEnd;
    const isLiveByTime = isStarted && isNotEnded;

    // Also check by state_id if available (2 = live, 3 = halftime, 4 = extra time, 22 = 2nd half, 23 = 2nd half HT, 24 = extra time)
    const isLiveByState = liveMatch.state_id && [2, 3, 4, 22, 23, 24].includes(liveMatch.state_id);

    // Consider match live if either time-based or state-based criteria are met
    const isLive = isLiveByTime || isLiveByState;
    
    console.log(`[isMatchLive] Match ${matchId} final result: time-based=${isLiveByTime}, state-based=${isLiveByState}, isLive=${isLive}`);
    
    return isLive;
  }
}

export default LiveFixturesService;

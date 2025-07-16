import NodeCache from "node-cache";
import { CustomError } from "../utils/customErrors.js";
import FixtureOptimizationService from "./fixture.service.js";
import axios from "axios";
import { classifyOdds, transformToBettingData } from "../utils/oddsClassification.js";

class LiveFixturesService {
  constructor(fixtureCache) {
    this.fixtureCache = fixtureCache;
    this.liveOddsCache = new NodeCache({ stdTTL: 180 }); // 3 minutes
  }

  // Helper method to properly parse starting_at field (same as in bet.service.js)
  parseMatchStartTime(startingAt) {
    if (!startingAt) return null;
    
    // Handle different possible formats
    let parsedDate;
    
    if (typeof startingAt === 'string') {
      // Check if the string includes timezone info
      if (startingAt.includes('T') || startingAt.includes('Z') || startingAt.includes('+') || startingAt.includes('-') && startingAt.split('-').length > 3) {
        // String has timezone info, parse normally
        parsedDate = new Date(startingAt);
      } else {
        // String doesn't have timezone info, treat as UTC
        // Format: "2025-07-05 09:00:00" should be treated as UTC
        // Convert to ISO format and add Z for UTC
        let isoString = startingAt.replace(' ', 'T');
        if (!isoString.includes('T')) {
          isoString = startingAt + 'T00:00:00';
        }
        if (!isoString.endsWith('Z')) {
          isoString += 'Z';
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
    if (!matchData || !Array.isArray(matchData.lineups)) {
      console.log(`[LiveFixtures] No lineup data available for player validation`);
      return odds; // Return all odds if no lineup data
    }

    // Extract player names from lineups for validation
    const lineupPlayerNames = new Set();
    matchData.lineups.forEach(lineup => {
      if (lineup.player_name) {
        // Normalize player name for comparison (lowercase, trim spaces)
        lineupPlayerNames.add(lineup.player_name.toLowerCase().trim());
      }
    });

    if (lineupPlayerNames.size === 0) {
      console.log(`[LiveFixtures] No players found in lineups for match ${matchData.id}`);
      return odds; // Return all odds if no players in lineups
    }

    // Filter odds - validate player odds for market IDs 267 and 268
    const validatedOdds = odds.filter(odd => {
      // For player-related markets (267, 268), validate player is in lineups
      if (odd.market_id === 267 || odd.market_id === 268) {
        if (odd.name) {
          const playerName = odd.name.toLowerCase().trim();
          
          // Check exact match first
          if (lineupPlayerNames.has(playerName)) {
            return true;
          }
          
          // Check partial match (in case of name variations)
          for (const lineupPlayer of lineupPlayerNames) {
            // Check if odd name is contained in lineup name or vice versa
            if (lineupPlayer.includes(playerName) || playerName.includes(lineupPlayer)) {
              return true;
            }
          }
          
          // Player not found in lineups, exclude this odd
          console.log(`🚫 [LiveFixtures] Excluding player odd for "${odd.name}" - not in lineups for match ${matchData.id}`);
          return false;
        } else {
          // No player name in odd, exclude it
          console.log(`🚫 [LiveFixtures] Excluding player odd with no name for match ${matchData.id}`);
          return false;
        }
      }

      // For non-player markets, include the odd
      return true;
    });

    console.log(`[LiveFixtures] Player validation: ${odds.length} odds → ${validatedOdds.length} validated odds for match ${matchData.id}`);
    return validatedOdds;
  }

  // Helper to group matches by league using the popular leagues cache
  bindLeaguesToMatches(matches) {
    const popularLeagues = FixtureOptimizationService.leagueCache.get("popular_leagues") || [];
   
    
    const leagueMap = new Map();
    for (const match of matches) {
      const leagueId = match.league_id;
    
      
      const foundLeague = popularLeagues.find(l => Number(l.id) === Number(leagueId));
      let league;
      if (foundLeague) {
        
        league = {
          id: foundLeague.id,
          name: foundLeague.name,
          imageUrl: foundLeague.image_path || null,
          country: typeof foundLeague.country === "string" ? foundLeague.country : foundLeague.country?.name || null,
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
  getLiveMatchesFromCache() {
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
          
          // Also check by state_id if available (2 = live, 3 = halftime, 4 = extra time)
          const isLiveByState = match.state_id && [2, 3, 4].includes(match.state_id);
          
          // Consider match live if either time-based or state-based criteria are met
          const isLive = isLiveByTime || isLiveByState;
          
       
          
          if (isLive) {
           
            liveMatches.push(match);
          }
        }
      }
    }

    
    const grouped = this.bindLeaguesToMatches(liveMatches).map(group => ({
      league: group.league,
      matches: group.matches.map(match => ({
        ...match,
        odds: [], 
      })),
    }));
    
    console.log(`[LiveFixtures] Returning ${grouped.length} league groups with live matches`);
    return grouped;
  }

  // Fetch and update odds for all live matches
  async updateAllLiveOdds() {
    const liveMatches = this.getLiveMatchesFromCache();
    const apiToken = process.env.SPORTSMONKS_API_KEY;
    
    // Define the same allowed market IDs as in fixture.service.js
    const allowedMarketIds = [1, 2, 267, 268, 29, 90, 93, 95, 124, 125, 10, 14, 18, 19, 33, 38, 39, 41, 44, 50, 51,267,268,4,5,81,37,11 , 97 , 13,86,80 ,60,67,68,69];
    
    if (!apiToken) {
      console.error("❌ SPORTSMONKS_API_KEY is not set");
      return;
    }
    
    let totalMatches = 0;
    let successfulUpdates = 0;
    
    for (const group of liveMatches) {
      for (const match of group.matches) {
        totalMatches++;
        try {
          // Use the inplay odds endpoint
          const url = `https://api.sportmonks.com/v3/football/odds/inplay/fixtures/${match.id}?api_token=${apiToken}&filters=bookmakers:2`;
          
          const response = await axios.get(url);
          const allOdds = response.data?.data || [];
          
          // Filter odds by allowed market IDs
          let filteredOdds = allOdds.filter(odd => allowedMarketIds.includes(odd.market_id));
          
          // Apply player validation for market IDs 267 and 268
          filteredOdds = this.validatePlayerOdds(filteredOdds, match);
          
          // Group odds by market for classification
          const odds_by_market = {};
          for (const odd of filteredOdds) {
            if (!odd.market_id) continue;
            if (!odds_by_market[odd.market_id]) {
              odds_by_market[odd.market_id] = { 
                market_id: odd.market_id, 
                market_description: odd.market_description, 
                odds: [] 
              };
            }
            odds_by_market[odd.market_id].odds.push(odd);
            odds_by_market[odd.market_id].market_description = odd.market_description;
          }
          const classified = classifyOdds({ odds_by_market });
          const betting_data = transformToBettingData(classified, match);
          
          // Store both betting_data and odds_classification
          const result = {
            betting_data: betting_data,
            odds_classification: classified
          };
          
          // Cache the result
          this.liveOddsCache.set(match.id, result);
          successfulUpdates++;
        } catch (err) {
          console.error(`❌ Failed to update betting_data for match ${match.id}:`, err.message);
          if (err.response) {
            console.error(`📊 Error response:`, err.response.data);
          }
        }
      }
    }
    
    console.log(`[LiveFixtures] Updated ${successfulUpdates}/${totalMatches} live matches with player validation`);
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
      categories: [{ id: 'all', label: 'All', odds_count: 0 }],
      classified_odds: {},
      stats: { total_categories: 0, total_odds: 0 }
    };
  }

  // Ensure we have live odds for a specific match
  async ensureLiveOdds(matchId) {
    // Check if we already have odds in cache
    let odds = this.liveOddsCache.get(matchId);
    console.log(`[ensureLiveOdds] Cache check for match ${matchId}:`, {
      hasCache: !!odds,
      cacheType: typeof odds,
      cacheStructure: odds ? Object.keys(odds) : null
    });
    
    if (odds && (odds.betting_data || odds.length > 0)) {
      console.log(`[ensureLiveOdds] Returning cached odds for match ${matchId}`);
      return odds;
    }

    // If not in cache, fetch them
    const apiToken = process.env.SPORTSMONKS_API_KEY;
    if (!apiToken) {
      throw new CustomError("API key not configured", 500, "API_KEY_MISSING");
    }

    // Define the same allowed market IDs as in fixture.service.js
    const allowedMarketIds = [1, 2, 267, 268, 29, 90, 93, 95, 124, 125, 10, 14, 18, 19, 33, 38, 39, 41, 44, 50, 51];

    try {
      const url = `https://api.sportmonks.com/v3/football/odds/inplay/fixtures/${matchId}?api_token=${apiToken}&filters=bookmakers:2`;
      const response = await axios.get(url);
      const allOddsData = response.data?.data || [];
      
      // Filter odds by allowed market IDs
      let oddsData = allOddsData.filter(odd => allowedMarketIds.includes(odd.market_id));
      
      // Get match data to pass to transformToBettingData for team names AND player validation
      let matchData = null;
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
          
          matchData = fixtures.find(m => m.id == matchId || m.id === parseInt(matchId));
          if (matchData) break;
        }
      }
      
      // Apply player validation for market IDs 267 and 268
      oddsData = this.validatePlayerOdds(oddsData, matchData);
      
      console.log(`[ensureLiveOdds] Fetched ${allOddsData.length} raw odds from API, filtered to ${oddsData.length} validated odds for match ${matchId}`);
      console.log(`[ensureLiveOdds] First 3 validated odds:`, oddsData.slice(0, 3).map(odd => ({ id: odd.id, label: odd.label, value: odd.value, market_id: odd.market_id })));

      // Group odds by market for classification
      const odds_by_market = {};
      for (const odd of oddsData) {
        if (!odd.market_id) continue;
        if (!odds_by_market[odd.market_id]) {
          odds_by_market[odd.market_id] = {
            market_id: odd.market_id,
            market_description: odd.market_description,
            odds: []
          };
        }
        // Preserve the original odd ID and other important fields
        odds_by_market[odd.market_id].odds.push({
          ...odd,
          id: odd.id, // Ensure ID is preserved
          value: odd.value,
          label: odd.label,
          name: odd.name || odd.label,
          suspended: odd.suspended,
          stopped: odd.stopped
        });
        odds_by_market[odd.market_id].market_description = odd.market_description;
      }

      const classified = classifyOdds({ odds_by_market });
      const betting_data = transformToBettingData(classified, matchData);

      // Return both betting_data and odds_classification structure
      const result = {
        betting_data: betting_data,
        odds_classification: classified
      };

      // Debug: Log the final result structure
      console.log(`[ensureLiveOdds] Final result structure with player validation:`, {
        bettingDataSections: result.betting_data.length,
        totalOptions: result.betting_data.reduce((sum, section) => sum + (section.options?.length || 0), 0)
      });
      
      // Debug: Log all odd IDs in the final result
      const allOddIds = [];
      result.betting_data.forEach(section => {
        section.options?.forEach(option => {
          allOddIds.push({ id: option.id, label: option.label, section: section.title });
        });
      });
      console.log(`[ensureLiveOdds] All odd IDs in final result:`, allOddIds.slice(0, 10)); // Show first 10

      // Cache the result
      this.liveOddsCache.set(matchId, result);
      return result;
    } catch (err) {
      console.error('Error fetching live odds:', err);
      throw new CustomError("Failed to fetch live odds", 500, "LIVE_ODDS_FETCH_ERROR");
    }
  }

  // Extract only 1, X, 2 odds for inplay display
  extractMainOdds(bettingData) {
    if (!Array.isArray(bettingData)) return {};
    
    // Find the main market (1x2) section in betting data
    const mainMarketSection = bettingData.find(section => 
      section.title === 'Match Result' || 
      section.title === '1X2' || 
      section.market_id === 1
    );
    
    if (!mainMarketSection || !mainMarketSection.options) {
      console.log(`[extractMainOdds] No main market section found in betting data`);
      return {};
    }
    
    const result = {};
    
    // Extract home, draw, away odds with suspended status
    mainMarketSection.options.forEach(option => {
      const label = option.label?.toLowerCase();
      const name = option.name?.toLowerCase();
      
      if (label === "home" || label === "1" || name === "home" || name === "1") {
        result.home = { 
          value: option.value, 
          oddId: option.id,
          suspended: option.suspended || false
        };
      } else if (label === "draw" || label === "x" || name === "draw" || name === "x") {
        result.draw = { 
          value: option.value, 
          oddId: option.id,
          suspended: option.suspended || false
        };
      } else if (label === "away" || label === "2" || name === "away" || name === "2") {
        result.away = { 
          value: option.value, 
          oddId: option.id,
          suspended: option.suspended || false
        };
      }
    });
    
    console.log(`[extractMainOdds] Extracted odds with suspended status:`, result);
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
          
          // Also check by state_id if available (2 = live, 3 = halftime, 4 = extra time)
          const isLiveByState = match.state_id && [2, 3, 4].includes(match.state_id);
          
          // Consider match live if either time-based or state-based criteria are met
          const isLive = isLiveByTime || isLiveByState;
          
          if (isLive) {
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
            categories: [{ id: 'all', label: 'All', odds_count: 0 }],
            classified_odds: {},
            stats: { total_categories: 0, total_odds: 0 }
          }
        };
      } else {
        bettingDataMap[matchId] = {
          betting_data: [],
          odds_classification: {
            categories: [{ id: 'all', label: 'All', odds_count: 0 }],
            classified_odds: {},
            stats: { total_categories: 0, total_odds: 0 }
          }
        };
      }
    }
    
    console.log(`[LiveFixtures] getAllLiveOddsMap found ${liveMatchIds.length} live matches`);
    return bettingDataMap;
  }

  // Debug method to get all matches and their states

  // Check if a specific match is live
  isMatchLive(matchId) {
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
        
        const match = fixtures.find(m => m.id == matchId || m.id === parseInt(matchId));
        if (match) {
          if (!match.starting_at) {
            return false;
          }
          
          const matchTime = this.parseMatchStartTime(match.starting_at);
          if (!matchTime) {
            return false;
          }
          
          const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000); // 120 minutes after start
          
          // Check multiple conditions for live matches
          const isStarted = matchTime <= now;
          const isNotEnded = now < matchEnd;
          const isLiveByTime = isStarted && isNotEnded;
          
          // Also check by state_id if available (2 = live, 3 = halftime, 4 = extra time)
          const isLiveByState = match.state_id && [2, 3, 4].includes(match.state_id);
          
          // Consider match live if either time-based or state-based criteria are met
          return isLiveByTime || isLiveByState;
        }
      }
    }
    
    return false;
  }
}

export default LiveFixturesService;
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";
import matchesService from "../../../services/matches.service";
import { markMatchAsFinished } from "@/lib/utils/finishedMatchesManager";

// ===== EXISTING ASYNC THUNKS (keeping for backward compatibility) =====

// Async thunk for fetching matches by league
export const fetchMatches = createAsyncThunk(
  "matches/fetchMatches",
  async (leagueId, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(
        `/sportsmonk/leagues/${leagueId}/matches`
      );
      return {
        leagueId,
        matches: response.data.data,
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message || "Failed to fetch matches"
      );
    }
  }
);

// Async thunk for fetching upcoming matches
export const fetchUpcomingMatches = createAsyncThunk(
  "matches/fetchUpcomingMatches",
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get("/fixtures/upcoming");

      // Transform the data from { leagueName: { league, matches, matchCount } } format to an array of leagues
      const data = response.data.data;
      const transformedData = Object.keys(data).map((leagueName) => {
        const leagueData = data[leagueName];
        return {
          id: leagueData.league?.id || Math.random().toString(36).substr(2, 9),
          name: leagueName,
          image_path: leagueData.league?.imageUrl || null,
          imageUrl: leagueData.league?.imageUrl || null,
          icon: leagueData.league?.icon || "⚽",
          country: leagueData.league?.country || null,
          league: leagueData.league, // Keep the full league object
          matches: leagueData.matches || [],
          matchCount: leagueData.matchCount || 0,
        };
      });

      return transformedData;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message ||
          "Failed to fetch upcoming matches"
      );
    }
  }
);

// Async thunk for fetching individual match data with classified odds
export const fetchMatchById = createAsyncThunk(
  "matches/fetchMatchById",
  async (matchId, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/fixtures/${matchId}`, {
        params: {
          includeOdds: true,
          includeLeague: true,
          includeParticipants: true,
        },
      });
      return {
        matchId,
        matchData: response.data.data,
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message || "Failed to fetch match details"
      );
    }
  }
);

// Async thunk for fetching live odds
export const fetchLiveOdds = createAsyncThunk(
  "matches/fetchLiveOdds",
  async (matchId, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/fixtures/${matchId}/inplay-odds`);
      return {
        matchId,
        liveOdds: response.data.data.betting_data,
        liveOddsClassification: response.data.data.odds_classification,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message || "Failed to fetch live odds"
      );
    }
  }
);

// Async thunk for silently updating live odds (no loading state)
export const silentUpdateLiveOdds = createAsyncThunk(
  "matches/silentUpdateLiveOdds",
  async (matchId, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/fixtures/${matchId}/inplay-odds`);
      return {
        matchId,
        liveOdds: response.data.data.betting_data,
        liveOddsClassification: response.data.data.odds_classification,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message || "Failed to fetch live odds"
      );
    }
  }
);

// Async thunk for fetching today's matches
export const fetchTodaysMatches = createAsyncThunk(
  "matches/fetchTodaysMatches",
  async (options = {}, { rejectWithValue }) => {
    try {
      const params = {};
      if (options.leagues && options.leagues.length > 0) {
        params.leagues = options.leagues.join(",");
      }

      const response = await apiClient.get("/fixtures/today", { params });

      // Transform the data from { leagueName: { league, matches, matchCount } } format to an array of leagues
      const data = response.data.data;
      const transformedData = Object.keys(data).map((leagueName) => {
        const leagueData = data[leagueName];
        return {
          id: leagueData.league?.id || Math.random().toString(36).substr(2, 9),
          name: leagueName,
          image_path: leagueData.league?.imageUrl || null,
          imageUrl: leagueData.league?.imageUrl || null,
          icon: leagueData.league?.icon || "⚽",
          country: leagueData.league?.country || null,
          league: leagueData.league, // Keep the full league object
          matches: leagueData.matches || [],
          matchCount: leagueData.matchCount || 0,
        };
      });

      return transformedData;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message ||
          "Failed to fetch today's matches"
      );
    }
  }
);

// ===== NEW CLEAN API ASYNC THUNKS (from unibet-api) =====

// Async thunk for fetching match data using new clean API
export const fetchMatchByIdV2 = createAsyncThunk(
  "matches/fetchMatchByIdV2",
  async (eventId, { rejectWithValue }) => {
    try {
      console.log(`🔍 Fetching match data for ${eventId} using new clean API...`);
      const data = await matchesService.getBetOffersV2(eventId);
      
      if (data.success) {
        console.log(`✅ Successfully fetched match data for ${eventId}`);
        return {
          eventId,
          matchData: data,
          betOffers: data.data?.betOffers || [],
          marketsSuspended: data.marketsSuspended || false,
          timestamp: data.timestamp,
          source: 'unibet-api'
        };
      } else {
        throw new Error(data.message || 'Failed to fetch match data');
      }
    } catch (error) {
      console.error('❌ Error fetching match data V2:', error);
      return rejectWithValue(
        error.message || "Failed to fetch match data"
      );
    }
  }
);

// Silent background update for new clean API (no loading indicator)
export const silentUpdateMatchByIdV2 = createAsyncThunk(
  "matches/silentUpdateMatchByIdV2",
  async (eventId, { rejectWithValue }) => {
    try {
      const data = await matchesService.getBetOffersV2(eventId, { noCache: true, silent: true });
      
      // If silent update returns null (e.g. network error), don't update state
      if (!data) {
        return rejectWithValue("Silent update failed - no data returned");
      }
      
      if (data.success) {
        return {
          eventId,
          matchData: data,
          betOffers: data.data?.betOffers || [],
          marketsSuspended: data.marketsSuspended || false,
          timestamp: data.timestamp,
          source: data.source || 'unibet-api'
        };
      }
      // 404 / match finished: clear match so UI stops showing bet offers
      if (data.status === 404 || data.isFinished === true) {
        if (typeof markMatchAsFinished === 'function') {
          markMatchAsFinished(String(eventId), null);
        }
        return { eventId, clear: true };
      }
      throw new Error(data.message || 'Failed to fetch match data');
    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch match data");
    }
  }
);

// Async thunk for fetching live matches using new clean API
export const fetchLiveMatchesV2 = createAsyncThunk(
  "matches/fetchLiveMatchesV2",
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔍 Fetching live matches using new clean API...');
      const data = await matchesService.getLiveMatchesV2();
      
      if (data.success) {
        console.log(`✅ Successfully fetched ${data.totalMatches} live matches`);
        return {
          liveMatches: data.matches || [],
          allMatches: data.allMatches || [],
          upcomingMatches: data.upcomingMatches || [],
          totalMatches: data.totalMatches,
          totalAllMatches: data.totalAllMatches,
          timestamp: data.lastUpdated,
          source: 'unibet-api'
        };
      } else {
        throw new Error(data.message || 'Failed to fetch live matches');
      }
    } catch (error) {
      console.error('❌ Error fetching live matches V2:', error);
      return rejectWithValue(
        error.message || "Failed to fetch live matches"
      );
    }
  }
);

// Async thunk for fetching all football matches using new clean API
export const fetchAllFootballMatchesV2 = createAsyncThunk(
  "matches/fetchAllFootballMatchesV2",
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔍 Fetching all football matches using new clean API...');
      const data = await matchesService.getAllFootballMatchesV2();
      
      if (data.success) {
        console.log(`✅ Successfully fetched ${data.totalAllMatches} total matches`);
        return {
          allMatches: data.allMatches || [],
          liveMatches: data.matches || [],
          upcomingMatches: data.upcomingMatches || [],
          totalMatches: data.totalAllMatches,
          totalLiveMatches: data.totalMatches,
          totalUpcomingMatches: data.totalUpcomingMatches,
          timestamp: data.lastUpdated,
          source: 'unibet-api'
        };
      } else {
        throw new Error(data.message || 'Failed to fetch all football matches');
      }
    } catch (error) {
      console.error('❌ Error fetching all football matches V2:', error);
      return rejectWithValue(
        error.message || "Failed to fetch all football matches"
      );
    }
  }
);

const matchesSlice = createSlice({
  name: "matches",
  initialState: {
    // Existing state
    data: {}, // matches by league
    upcomingMatches: [], // upcoming matches
    upcomingMatchesLoading: false,
    upcomingMatchesError: null,
    todaysMatches: [], // today's matches
    todaysMatchesLoading: false,
    todaysMatchesError: null,
    matchDetails: {}, // individual match details by matchId
    liveOdds: {}, // live odds by matchId
    liveOddsClassification: {}, // live odds classification by matchId
    liveOddsLoading: false,
    liveOddsError: null,
    liveOddsTimestamp: {}, // timestamp of last live odds update by matchId
    loading: false,
    matchDetailLoading: false,
    error: null,
    matchDetailError: null,
    selectedLeague: null,

    // New clean API state
    matchDetailsV2: {}, // individual match details by eventId (new API)
    liveMatchesV2: [], // live matches from new API
    allMatchesV2: [], // all football matches from new API
    upcomingMatchesV2: [], // upcoming matches from new API
    matchDetailV2Loading: false,
    liveMatchesV2Loading: false,
    allMatchesV2Loading: false,
    matchDetailV2Error: null,
    liveMatchesV2Error: null,
    allMatchesV2Error: null,
    lastUpdatedV2: null, // timestamp of last update from new API
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.matchDetailError = null;
      state.upcomingMatchesError = null;
      state.liveOddsError = null;
      // Clear new API errors
      state.matchDetailV2Error = null;
      state.liveMatchesV2Error = null;
      state.allMatchesV2Error = null;
    },
    setSelectedLeague: (state, action) => {
      state.selectedLeague = action.payload;
    },
    clearMatchDetail: (state, action) => {
      const matchId = action.payload;
      if (matchId) {
        if (state.matchDetails[matchId]) {
          delete state.matchDetails[matchId];
        }
        if (state.liveOdds[matchId]) {
          delete state.liveOdds[matchId];
        }
        if (state.liveOddsTimestamp[matchId]) {
          delete state.liveOddsTimestamp[matchId];
        }
        // Clear new API data
        if (state.matchDetailsV2[matchId]) {
          delete state.matchDetailsV2[matchId];
        }
      }
    },
    clearMatchDetailV2: (state, action) => {
      const eventId = action.payload;
      if (eventId && state.matchDetailsV2[eventId]) {
        delete state.matchDetailsV2[eventId];
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // ===== EXISTING REDUCERS (keeping for backward compatibility) =====
      
      // Fetch matches by league
      .addCase(fetchMatches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMatches.fulfilled, (state, action) => {
        state.loading = false;
        state.data[action.payload.leagueId] = action.payload.matches;
      })
      .addCase(fetchMatches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Fetch upcoming matches
      .addCase(fetchUpcomingMatches.pending, (state) => {
        state.upcomingMatchesLoading = true;
        state.upcomingMatchesError = null;
      })
      .addCase(fetchUpcomingMatches.fulfilled, (state, action) => {
        state.upcomingMatchesLoading = false;
        state.upcomingMatches = action.payload;
      })
      .addCase(fetchUpcomingMatches.rejected, (state, action) => {
        state.upcomingMatchesLoading = false;
        state.upcomingMatchesError = action.payload;
      })
      
      // Fetch individual match details
      .addCase(fetchMatchById.pending, (state) => {
        state.matchDetailLoading = true;
        state.matchDetailError = null;
      })
      .addCase(fetchMatchById.fulfilled, (state, action) => {
        state.matchDetailLoading = false;
        state.matchDetails[action.payload.matchId] = action.payload.matchData;
      })
      .addCase(fetchMatchById.rejected, (state, action) => {
        state.matchDetailLoading = false;
        state.matchDetailError = action.payload;
      })
      
      // Fetch live odds
      .addCase(fetchLiveOdds.pending, (state, action) => {
        const matchId = action.meta.arg;
        // Only show loading if we don't have existing odds (initial load)
        if (!state.liveOdds[matchId]) {
          state.liveOddsLoading = true;
        }
        state.liveOddsError = null;
      })
      .addCase(fetchLiveOdds.fulfilled, (state, action) => {
        state.liveOddsLoading = false;
        state.liveOdds[action.payload.matchId] = action.payload.liveOdds;
        state.liveOddsTimestamp[action.payload.matchId] =
          action.payload.timestamp;
        state.liveOddsClassification[action.payload.matchId] =
          action.payload.liveOddsClassification;
      })
      .addCase(fetchLiveOdds.rejected, (state, action) => {
        state.liveOddsLoading = false;
        state.liveOddsError = action.payload;
      })
      
      // Silent live odds update (no loading state changes)
      .addCase(silentUpdateLiveOdds.fulfilled, (state, action) => {
        state.liveOdds[action.payload.matchId] = action.payload.liveOdds;
        state.liveOddsTimestamp[action.payload.matchId] =
          action.payload.timestamp;
        state.liveOddsClassification[action.payload.matchId] =
          action.payload.liveOddsClassification;
        // Clear any existing errors since update was successful
        state.liveOddsError = null;
      })
      .addCase(silentUpdateLiveOdds.rejected, (state, action) => {
        // Don't update loading state, just log the error silently
        console.warn('Silent live odds update failed:', action.payload);
      })
      
      // Fetch today's matches
      .addCase(fetchTodaysMatches.pending, (state) => {
        state.todaysMatchesLoading = true;
        state.todaysMatchesError = null;
      })
      .addCase(fetchTodaysMatches.fulfilled, (state, action) => {
        state.todaysMatchesLoading = false;
        state.todaysMatches = action.payload;
      })
      .addCase(fetchTodaysMatches.rejected, (state, action) => {
        state.todaysMatchesLoading = false;
        state.todaysMatchesError = action.payload;
      })

      // ===== NEW CLEAN API REDUCERS =====

      // Fetch match by ID V2
      .addCase(fetchMatchByIdV2.pending, (state) => {
        state.matchDetailV2Loading = true;
        state.matchDetailV2Error = null;
      })
      .addCase(fetchMatchByIdV2.fulfilled, (state, action) => {
        state.matchDetailV2Loading = false;
        state.matchDetailsV2[action.payload.eventId] = {
          matchData: action.payload.matchData,
          betOffers: action.payload.betOffers,
          marketsSuspended: action.payload.marketsSuspended || false,
          timestamp: action.payload.timestamp,
          source: action.payload.source
        };
        state.lastUpdatedV2 = action.payload.timestamp;
      })
      .addCase(fetchMatchByIdV2.rejected, (state, action) => {
        state.matchDetailV2Loading = false;
        state.matchDetailV2Error = action.payload;
      })

      // Fetch live matches V2
      .addCase(fetchLiveMatchesV2.pending, (state) => {
        state.liveMatchesV2Loading = true;
        state.liveMatchesV2Error = null;
      })
      .addCase(fetchLiveMatchesV2.fulfilled, (state, action) => {
        state.liveMatchesV2Loading = false;
        state.liveMatchesV2 = action.payload.liveMatches;
        state.allMatchesV2 = action.payload.allMatches;
        state.upcomingMatchesV2 = action.payload.upcomingMatches;
        state.lastUpdatedV2 = action.payload.timestamp;
      })
      .addCase(fetchLiveMatchesV2.rejected, (state, action) => {
        state.liveMatchesV2Loading = false;
        state.liveMatchesV2Error = action.payload;
      })

      // Fetch all football matches V2
      .addCase(fetchAllFootballMatchesV2.pending, (state) => {
        state.allMatchesV2Loading = true;
        state.allMatchesV2Error = null;
      })
      .addCase(fetchAllFootballMatchesV2.fulfilled, (state, action) => {
        state.allMatchesV2Loading = false;
        state.allMatchesV2 = action.payload.allMatches;
        state.liveMatchesV2 = action.payload.liveMatches;
        state.upcomingMatchesV2 = action.payload.upcomingMatches;
        state.lastUpdatedV2 = action.payload.timestamp;
      })
      .addCase(fetchAllFootballMatchesV2.rejected, (state, action) => {
        state.allMatchesV2Loading = false;
        state.allMatchesV2Error = action.payload;
      })

      // Silent update reducers for V2
      .addCase(silentUpdateMatchByIdV2.fulfilled, (state, action) => {
        if (!action.payload) return;
        if (action.payload.clear === true && action.payload.eventId) {
          delete state.matchDetailsV2[action.payload.eventId];
          return;
        }
        const { eventId, matchData, betOffers, marketsSuspended, timestamp, source } = action.payload;
        state.matchDetailsV2[eventId] = {
          matchData,
          betOffers,
          marketsSuspended: marketsSuspended || false,
          timestamp,
          source
        };
        state.lastUpdatedV2 = timestamp;
      })
      .addCase(silentUpdateMatchByIdV2.rejected, (state, action) => {
        // For silent updates, don't update error state to avoid showing errors in UI
        // Just log the error for debugging
        console.warn('Silent update failed:', action.payload);
        // Keep existing data and don't update error state
      });
  },
});

export const { 
  clearError, 
  setSelectedLeague, 
  clearMatchDetail, 
  clearMatchDetailV2 
} = matchesSlice.actions;

export default matchesSlice.reducer;

// ===== EXISTING SELECTORS =====
export const selectMatchesByLeague = (state, leagueId) =>
  state.matches.data[leagueId] || [];
export const selectUpcomingMatches = (state) => state.matches.upcomingMatches;
export const selectUpcomingMatchesLoading = (state) =>
  state.matches.upcomingMatchesLoading;
export const selectUpcomingMatchesError = (state) =>
  state.matches.upcomingMatchesError;

// Live odds selectors
export const selectLiveOdds = (state, matchId) =>
  state.matches.liveOdds[matchId];
export const selectLiveOddsLoading = (state) => state.matches.liveOddsLoading;
export const selectLiveOddsError = (state) => state.matches.liveOddsError;
export const selectLiveOddsTimestamp = (state, matchId) =>
  state.matches.liveOddsTimestamp[matchId];
export const selectLiveOddsClassification = (state, matchId) =>
  state.matches.liveOddsClassification[matchId];

// ===== NEW CLEAN API SELECTORS =====
export const selectMatchDetailV2 = (state, eventId) =>
  state.matches.matchDetailsV2[eventId];
export const selectLiveMatchesV2 = (state) => state.matches.liveMatchesV2;
export const selectAllMatchesV2 = (state) => state.matches.allMatchesV2;
export const selectUpcomingMatchesV2 = (state) => state.matches.upcomingMatchesV2;
export const selectMatchDetailV2Loading = (state) => state.matches.matchDetailV2Loading;
export const selectLiveMatchesV2Loading = (state) => state.matches.liveMatchesV2Loading;
export const selectAllMatchesV2Loading = (state) => state.matches.allMatchesV2Loading;
export const selectMatchDetailV2Error = (state) => state.matches.matchDetailV2Error;
export const selectLiveMatchesV2Error = (state) => state.matches.liveMatchesV2Error;
export const selectAllMatchesV2Error = (state) => state.matches.allMatchesV2Error;
export const selectLastUpdatedV2 = (state) => state.matches.lastUpdatedV2;
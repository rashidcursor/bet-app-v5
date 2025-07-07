import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";

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
        liveOdds: response.data.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message || "Failed to fetch live odds"
      );
    }
  }
);

const matchesSlice = createSlice({
  name: "matches",
  initialState: {
    data: {}, // matches by league
    upcomingMatches: [], // upcoming matches
    upcomingMatchesLoading: false,
    upcomingMatchesError: null,
    matchDetails: {}, // individual match details by matchId
    liveOdds: {}, // live odds by matchId
    liveOddsLoading: false,
    liveOddsError: null,
    liveOddsTimestamp: {}, // timestamp of last live odds update by matchId
    loading: false,
    matchDetailLoading: false,
    error: null,
    matchDetailError: null,
    selectedLeague: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.matchDetailError = null;
      state.upcomingMatchesError = null;
      state.liveOddsError = null;
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
      }
    },
  },
  extraReducers: (builder) => {
    builder
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
      .addCase(fetchLiveOdds.pending, (state) => {
        state.liveOddsLoading = true;
        state.liveOddsError = null;
      })
      .addCase(fetchLiveOdds.fulfilled, (state, action) => {
        state.liveOddsLoading = false;
        state.liveOdds[action.payload.matchId] = action.payload.liveOdds;
        state.liveOddsTimestamp[action.payload.matchId] =
          action.payload.timestamp;
      })
      .addCase(fetchLiveOdds.rejected, (state, action) => {
        state.liveOddsLoading = false;
        state.liveOddsError = action.payload;
      });
  },
});

export const { clearError, setSelectedLeague, clearMatchDetail } =
  matchesSlice.actions;
export default matchesSlice.reducer;

// Selectors
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

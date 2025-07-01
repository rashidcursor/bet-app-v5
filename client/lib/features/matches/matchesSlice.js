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
      
      // Transform the data from { leagueName: [matches] } format to an array of leagues
      const data = response.data.data;
      const transformedData = Object.keys(data).map(leagueName => {
        return {
          id: data[leagueName][0]?.league?.id || Math.random().toString(36).substr(2, 9),
          name: leagueName,
          image_path: data[leagueName][0]?.league?.image_path || null,
          icon: "⚽",
          matches: data[leagueName] || []
        };
      });
      
      return transformedData;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message || "Failed to fetch upcoming matches"
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

const matchesSlice = createSlice({
  name: "matches",
  initialState: {
    data: {}, // matches by league
    upcomingMatches: [], // upcoming matches
    upcomingMatchesLoading: false,
    upcomingMatchesError: null,
    matchDetails: {}, // individual match details by matchId
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
    },
    setSelectedLeague: (state, action) => {
      state.selectedLeague = action.payload;
    },
    clearMatchDetail: (state, action) => {
      const matchId = action.payload;
      if (matchId && state.matchDetails[matchId]) {
        delete state.matchDetails[matchId];
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
      });
  },
});

export const { clearError, setSelectedLeague, clearMatchDetail } =
  matchesSlice.actions;
export default matchesSlice.reducer;

// Selectors
export const selectMatchesByLeague = (state, leagueId) => state.matches.data[leagueId] || [];
export const selectUpcomingMatches = (state) => state.matches.upcomingMatches;
export const selectUpcomingMatchesLoading = (state) => state.matches.upcomingMatchesLoading;
export const selectUpcomingMatchesError = (state) => state.matches.upcomingMatchesError;

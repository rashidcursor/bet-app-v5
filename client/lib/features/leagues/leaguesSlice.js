import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";
import { getFotmobLogoByUnibetId } from '@/lib/leagueUtils';

// Fallback leagues data
const fallbackLeagues = [
  {
    id: 1,
    name: "Premier League",
    image_path: null,
    country: { name: "England" },
    isPopular: true,
    popularOrder: 0
  },
  {
    id: 2,
    name: "La Liga",
    image_path: null,
    country: { name: "Spain" },
    isPopular: true,
    popularOrder: 1
  },
  {
    id: 3,
    name: "Serie A",
    image_path: null,
    country: { name: "Italy" },
    isPopular: true,
    popularOrder: 2
  },
  {
    id: 4,
    name: "Bundesliga",
    image_path: null,
    country: { name: "Germany" },
    isPopular: true,
    popularOrder: 3
  },
  {
    id: 5,
    name: "Ligue 1",
    image_path: null,
    country: { name: "France" },
    isPopular: true,
    popularOrder: 4
  }
];

// Async thunk for fetching popular leagues for sidebar
export const fetchPopularLeagues = createAsyncThunk(
  "leagues/fetchPopularLeagues",
  async (_, { rejectWithValue }) => {
    try {
      console.log("🔄 Fetching leagues from CSV file...");

      // Use new admin endpoint that serves leagues from CSV
      const response = await apiClient.get("/admin/leagues");
      console.log("📡 API Response:", response.data);

      const leagues = response.data.data;
      console.log(`✅ Loaded ${leagues.length} leagues from CSV`);
      return leagues;
    } catch (error) {
      // Return fallback data if API fails
      console.error("❌ Failed to fetch leagues from CSV:", error);
      console.warn("🔄 Using fallback data instead");
      return fallbackLeagues;
    }
  }
);

// Async thunk for updating league popularity
export const updateLeaguePopularity = createAsyncThunk(
  "leagues/updateLeaguePopularity",
  async (leagues, { rejectWithValue }) => {
    try {
      const response = await apiClient.post("/admin/leagues/popular", {
        leagues: leagues
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error?.message ||
        "Failed to update league popularity"
      );
    }
  }
);

// Async thunk for fetching matches by league - Updated to use Unibet breadcrumbs API
export const fetchMatchesByLeague = createAsyncThunk(
  "leagues/fetchMatchesByLeague",
  async (leagueId, { rejectWithValue }) => {
    try {
      console.log(`🔍 Fetching breadcrumbs for league: ${leagueId}`);
      
      // Use the new Unibet breadcrumbs API
      const response = await apiClient.get(`/v2/breadcrumbs/${leagueId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch breadcrumbs');
      }
      
      const { league, matches } = response.data.data;
      console.log(`✅ Successfully fetched matches for ${league.id}`);
      console.log(`📊 Matches data:`, matches);
      
      // Transform the matches data to match the expected format
      // The matches.layout.sections[1].widgets[0].matches.events contains the actual matches
      const transformedMatches = [];
      
      if (matches.layout && matches.layout.sections) {
        const mainSection = matches.layout.sections.find(section => section.position === 'MAIN');
        if (mainSection && mainSection.widgets && mainSection.widgets.length > 0) {
          const tournamentWidget = mainSection.widgets.find(widget => widget.widgetType === 'TOURNAMENT');
          if (tournamentWidget && tournamentWidget.matches && tournamentWidget.matches.events) {
            tournamentWidget.matches.events.forEach(matchData => {
              const event = matchData.event;
              transformedMatches.push({
                id: event.id,
                name: event.name,
                englishName: event.englishName,
                homeName: event.homeName,
                awayName: event.awayName,
                start: event.start,
                state: event.state,
                sport: event.sport,
                groupId: event.groupId,
                group: event.group,
                participants: event.participants,
                betOffers: matchData.betOffers,
                mainBetOffer: matchData.mainBetOffer
              });
            });
          }
        }
      }
      
      console.log(`📊 Transformed ${transformedMatches.length} matches`);
      
      // Extract league name from the first match if available
      let leagueName = 'Football'; // Default fallback
      if (transformedMatches.length > 0 && transformedMatches[0].group) {
        leagueName = transformedMatches[0].group;
      }
      
      return { 
        league: {
          id: league.id,
          url: league.url,
          name: leagueName,
          imageUrl: getFotmobLogoByUnibetId(league.id) || null
        }, 
        matches: transformedMatches 
      };
    } catch (error) {
      console.error('❌ Error fetching breadcrumbs by league:', error);
      return rejectWithValue(
        error.response?.data?.message ||
        error.message ||
        "Failed to fetch breadcrumbs for league"
      );
    }
  }
);

const leaguesSlice = createSlice({
  name: "leagues",
  initialState: {
    data: [],
    popularLeagues: [],
    loading: false,
    popularLoading: false,
    error: null,
    selectedLeague: null,
    matchesByLeague: {},
    matchesLoading: false,
    matchesError: null,
    updateLoading: false,
    updateError: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.matchesError = null;
      state.updateError = null;
    },
    setSelectedLeague: (state, action) => {
      state.selectedLeague = action.payload;
    },
    clearSelectedLeague: (state) => {
      state.selectedLeague = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Popular leagues cases
      .addCase(fetchPopularLeagues.pending, (state) => {
        state.popularLoading = true;
        state.error = null;
      })
      .addCase(fetchPopularLeagues.fulfilled, (state, action) => {
        state.popularLoading = false;
        
        // ✅ Remove duplicates based on league ID
        const uniqueLeagues = [];
        const seenIds = new Set();
        
        action.payload.forEach(league => {
          const leagueId = String(league.id || league.unibetId);
          if (!seenIds.has(leagueId)) {
            seenIds.add(leagueId);
            uniqueLeagues.push(league);
          }
        });
        
        state.popularLeagues = uniqueLeagues;
        
        if (action.payload.length !== uniqueLeagues.length) {
          console.log(`✅ Loaded ${uniqueLeagues.length} unique leagues (removed ${action.payload.length - uniqueLeagues.length} duplicates)`);
        } else {
          console.log(`✅ Loaded ${uniqueLeagues.length} leagues from CSV`);
        }
      })
      .addCase(fetchPopularLeagues.rejected, (state, action) => {
        state.popularLoading = false;
        state.error = action.payload;
      })
      // Update league popularity cases
      .addCase(updateLeaguePopularity.pending, (state) => {
        state.updateLoading = true;
        state.updateError = null;
      })
      .addCase(updateLeaguePopularity.fulfilled, (state, action) => {
        state.updateLoading = false;
        // The leagues will be refreshed by calling fetchPopularLeagues after this
      })
      .addCase(updateLeaguePopularity.rejected, (state, action) => {
        state.updateLoading = false;
        state.updateError = action.payload;
      })
      // Matches by league cases
      .addCase(fetchMatchesByLeague.pending, (state) => {
        state.matchesLoading = true;
        state.matchesError = null;
      })
      .addCase(fetchMatchesByLeague.fulfilled, (state, action) => {
        state.matchesLoading = false;

        const { league, matches } = action.payload;
        state.matchesByLeague[league.id] = { matches, league };
      })
      .addCase(fetchMatchesByLeague.rejected, (state, action) => {
        state.matchesLoading = false;
        state.matchesError = action.payload;
      });
  },
});

export const { clearError, setSelectedLeague, clearSelectedLeague } =
  leaguesSlice.actions;
export default leaguesSlice.reducer;

// Selectors
export const selectLeagues = (state) => state.leagues.data;
export const selectLeaguesLoading = (state) => state.leagues.loading;
export const selectLeaguesError = (state) => state.leagues.error;
export const selectSelectedLeague = (state) => state.leagues.selectedLeague;
export const selectPopularLeagues = (state) => state.leagues.popularLeagues;
export const selectPopularLeaguesLoading = (state) =>
  state.leagues.popularLoading;
export const selectUpdateLoading = (state) => state.leagues.updateLoading;
export const selectUpdateError = (state) => state.leagues.updateError;

export const selectMatchesByLeague = (state, leagueId) =>
  state.leagues.matchesByLeague[leagueId] || [];

export const selectMatchesLoading = (state) => state.leagues.matchesLoading;
export const selectMatchesError = (state) => state.leagues.matchesError;

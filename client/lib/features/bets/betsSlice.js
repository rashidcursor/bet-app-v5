import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";

// Async thunk to fetch user bets
export const fetchUserBets = createAsyncThunk(
  "bets/fetchUserBets",
  async (filters = {}, { rejectWithValue }) => {
    try {
      // Build query params from filters - only include non-empty values
      const params = {};
      if (filters.dateFrom && filters.dateFrom.trim() !== '') {
        params.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo && filters.dateTo.trim() !== '') {
        params.dateTo = filters.dateTo;
      }
      if (filters.status && filters.status.trim() !== '' && filters.status !== 'all') {
        params.status = filters.status;
      }
      
      const response = await apiClient.get("/bet", { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching user bets:', error);
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Network error occurred",
          error: error.message,
        }
      );
    }
  }
);

// Async thunk to fetch admin grouped-by-user bets
export const fetchAdminBets = createAsyncThunk(
  "bets/fetchAdminBets",
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get("/bet/admin/all");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Network error occurred",
          error: error.message,
        }
      );
    }
  }
);

export const fetchBetsByUserId = createAsyncThunk(
  "bets/fetchBetsByUserId",
  async (userId, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/bet/${userId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Network error occurred",
          error: error.message,
        }
      );
    }
  }
);

const initialState = {
  bets: [],
  isLoading: false,
  error: null,
  message: null,
  // Admin bets state
  adminBets: {},
  adminBetsLoading: false,
  adminBetsError: null,
};

const betsSlice = createSlice({
  name: "bets",
  initialState,
  reducers: {
    clearBetsError: (state) => {
      state.error = null;
    },
    clearBetsMessage: (state) => {
      state.message = null;
    },
    // Optionally, clear admin error
    clearAdminBetsError: (state) => {
      state.adminBetsError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserBets.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUserBets.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bets = action.payload.data || [];
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(fetchUserBets.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to fetch bets";
      })
      // Admin bets
      .addCase(fetchAdminBets.pending, (state) => {
        state.adminBetsLoading = true;
        state.adminBetsError = null;
      })
      .addCase(fetchAdminBets.fulfilled, (state, action) => {
        state.adminBetsLoading = false;
        state.adminBets = action.payload.data || {};
        state.adminBetsError = null;
      })
      .addCase(fetchAdminBets.rejected, (state, action) => {
        state.adminBetsLoading = false;
        state.adminBetsError =
          action.payload?.message || "Failed to fetch admin bets";
      })
      // Fetch bets by userId (admin)
      .addCase(fetchBetsByUserId.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchBetsByUserId.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bets = action.payload.data || [];
        state.message = action.payload.message;
        state.error = null;
      })
      .addCase(fetchBetsByUserId.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to fetch bets by userId";
      });
  },
});

export const { clearBetsError, clearBetsMessage, clearAdminBetsError } =
  betsSlice.actions;

export const selectBets = (state) => state.bets.bets;
export const selectBetsLoading = (state) => state.bets.isLoading;
export const selectBetsError = (state) => state.bets.error;
export const selectBetsMessage = (state) => state.bets.message;
// Admin selectors
export const selectAdminBets = (state) => state.bets.adminBets;
export const selectAdminBetsLoading = (state) => state.bets.adminBetsLoading;
export const selectAdminBetsError = (state) => state.bets.adminBetsError;

export default betsSlice.reducer;

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";

// Mock betting history data
const mockBettingHistory = [
  {
    id: "BET001",
    type: "single",
    amount: -25.00,
    dateTime: "2025-06-15T16:45:00Z",
    status: "won",
    odds: 2.5,
    sport: "Football",
    match: "Manchester United vs Liverpool",
    selection: "Manchester United to win",
    payout: 62.50
  },
  {
    id: "BET002",
    type: "accumulator",
    amount: -10.00,
    dateTime: "2025-06-14T14:30:00Z",
    status: "lost",
    odds: 8.5,
    sport: "Football",
    match: "Multiple matches",
    selection: "3-fold accumulator",
    payout: 0
  },
  {
    id: "BET003",
    type: "single",
    amount: -15.00,
    dateTime: "2025-06-13T19:15:00Z",
    status: "won",
    odds: 1.8,
    sport: "Basketball",
    match: "Lakers vs Warriors",
    selection: "Over 220.5 total points",
    payout: 27.00
  },
  {
    id: "BET004",
    type: "single",
    amount: -20.00,
    dateTime: "2025-06-12T21:00:00Z",
    status: "pending",
    odds: 3.2,
    sport: "Football",
    match: "Barcelona vs Real Madrid",
    selection: "Both teams to score",
    payout: 0
  }
];

// Async thunks for API calls
export const fetchTransactions = createAsyncThunk(
  "transactions/fetchTransactions",
  async (filters = {}, { rejectWithValue, getState }) => {
    try {
      // Get the current user ID from the auth state
      const { auth } = getState();
      console.log("Auth state:", auth);
      
      // Check if user exists and has an ID
      if (!auth.user) {
        console.error("User not authenticated - auth.user is null");
        return rejectWithValue({
          success: false,
          message: "User not authenticated",
        });
      }
      
      // Try to get the user ID - it could be in different formats
      const userId = auth.user._id || auth.user.id;
      
      if (!userId) {
        console.error("User ID not available in auth state:", auth.user);
        return rejectWithValue({
          success: false,
          message: "User ID not available",
        });
      }
      
      console.log(`Fetching transactions for user ID: ${userId}`);
      
      // Use the user-specific endpoint
      const response = await apiClient.get(`/finance/users/${userId}/transactions`, { 
        params: filters 
      });
      
      console.log("API response:", response.data);
      
      return response.data;
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch transactions",
          error: error.message,
        }
      );
    }
  }
);

export const fetchBettingHistory = createAsyncThunk(
  "transactions/fetchBettingHistory",
  async (filters = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get("/betting-history", { params: filters });
      return response.data;
    } catch (error) {
      // If API endpoint doesn't exist yet, fall back to mock data
      if (error.response?.status === 404) {
        const { type, dateFrom, dateTo } = filters;
        
        let filteredBets = [...mockBettingHistory];
        
        if (type && type !== 'all') {
          filteredBets = filteredBets.filter(b => b.type === type);
        }
        
        if (dateFrom) {
          filteredBets = filteredBets.filter(b => 
            new Date(b.dateTime) >= new Date(dateFrom)
          );
        }
        
        if (dateTo) {
          filteredBets = filteredBets.filter(b => 
            new Date(b.dateTime) <= new Date(dateTo)
          );
        }
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
          success: true,
          data: filteredBets,
          total: filteredBets.length
        };
      }

      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch betting history",
          error: error.message,
        }
      );
    }
  }
);

const initialState = {
  transactions: [],
  bettingHistory: [],
  loading: false,
  error: null,  filters: {
    type: 'all',
    dateFrom: '',
    dateTo: ''
  },
  total: 0
};

const transactionsSlice = createSlice({
  name: "transactions",
  initialState,
  reducers: {    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearError: (state) => {
      state.error = null;
    },resetFilters: (state) => {
      state.filters = {
        type: 'all',
        dateFrom: '',
        dateTo: ''
      };
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        
        // Handle the API response format
        if (action.payload.success) {
          state.transactions = action.payload.data || [];
          state.total = action.payload.pagination?.totalItems || 0;
        } else {
          state.error = action.payload.message || "Failed to fetch transactions";
          state.transactions = [];
        }
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.transactions = [];
        state.error = action.payload?.message || "Failed to fetch transactions";
      })
      // Fetch betting history
      .addCase(fetchBettingHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBettingHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.bettingHistory = action.payload.data;
        state.total = action.payload.total;
      })
      .addCase(fetchBettingHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message || "Failed to fetch betting history";
      });
  },
});

export const {
  setFilters,
  resetFilters,
  setCurrentPage,
  clearError
} = transactionsSlice.actions;

export default transactionsSlice.reducer;

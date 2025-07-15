import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";

// Async thunks for finance API calls
export const fetchFinanceTransactions = createAsyncThunk(
  "finance/fetchTransactions",
  async (filters = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get("/finance/transactions", {
        params: filters,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch finance transactions",
          error: error.message,
        }
      );
    }
  }
);

export const fetchFinancialSummary = createAsyncThunk(
  "finance/fetchSummary",
  async (filters = {}, { rejectWithValue }) => {
    try {
      // If filters are provided, use the filtered endpoint
      if (filters.dateFrom || filters.dateTo || filters.type || filters.userId) {
        const response = await apiClient.get("/finance/summary/filtered", {
          params: filters,
        });
        return response.data;
      } else {
        // Otherwise use the regular summary endpoint
        const response = await apiClient.get("/finance/summary");
        return response.data;
      }
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch financial summary",
          error: error.message,
        }
      );
    }
  }
);

export const fetchFilteredFinancialSummary = createAsyncThunk(
  "finance/fetchFilteredSummary",
  async (filters = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get("/finance/summary/filtered", {
        params: filters,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch filtered financial summary",
          error: error.message,
        }
      );
    }
  }
);

export const createTransaction = createAsyncThunk(
  "finance/createTransaction",
  async (transactionData, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(
        "/finance/transactions",
        transactionData
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to create transaction",
          error: error.message,
        }
      );
    }
  }
);

export const fetchTransactionById = createAsyncThunk(
  "finance/fetchTransactionById",
  async (id, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/finance/transactions/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch transaction",
          error: error.message,
        }
      );
    }
  }
);

export const fetchUserTransactions = createAsyncThunk(
  "finance/fetchUserTransactions",
  async ({ userId, filters = {} }, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(
        `/finance/users/${userId}/transactions`,
        {
          params: filters,
        }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to fetch user transactions",
          error: error.message,
        }
      );
    }
  }
);

const initialState = {
  // Transactions data
  transactions: [],
  currentTransaction: null,
  userTransactions: [],

  // Financial summary data
  summary: {
    totalDeposits: 0,
    totalWithdrawals: 0,
    currentBalance: 0,
    profits: 0,
    depositsCount: 0,
    withdrawalsCount: 0,
    totalTransactions: 0,
  },

  // Pagination
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
  },

  // UI state
  loading: {
    transactions: false,
    summary: false,
    createTransaction: false,
    userTransactions: false,
  },
  error: {
    transactions: null,
    summary: null,
    createTransaction: null,
    userTransactions: null,
  },

  // Filters
  filters: {
    page: 1,
    limit: 10,
    type: "",
    userId: "",
    dateFrom: "",
    dateTo: "",
    search: "",
    sortBy: "createdAt",
    sortOrder: "desc",
  },
};

const financeSlice = createSlice({
  name: "finance",
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    clearError: (state, action) => {
      const errorType = action.payload;
      if (errorType) {
        state.error[errorType] = null;
      } else {
        // Clear all errors
        Object.keys(state.error).forEach((key) => {
          state.error[key] = null;
        });
      }
    },

    resetFilters: (state) => {
      state.filters = {
        page: 1,
        limit: 10,
        type: "",
        userId: "",
        dateFrom: "",
        dateTo: "",
        search: "",
        sortBy: "createdAt",
        sortOrder: "desc",
      };
    },

    clearCurrentTransaction: (state) => {
      state.currentTransaction = null;
    },

    resetTransactionState: (state) => {
      state.loading.createTransaction = false;
      state.error.createTransaction = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // Fetch finance transactions
      .addCase(fetchFinanceTransactions.pending, (state) => {
        state.loading.transactions = true;
        state.error.transactions = null;
      })
      .addCase(fetchFinanceTransactions.fulfilled, (state, action) => {
        state.loading.transactions = false;
        state.transactions = action.payload.data || [];
        state.pagination = action.payload.pagination || state.pagination;
      })
      .addCase(fetchFinanceTransactions.rejected, (state, action) => {
        state.loading.transactions = false;
        state.error.transactions =
          action.payload?.message || "Failed to fetch transactions";
      })

      // Fetch financial summary
      .addCase(fetchFinancialSummary.pending, (state) => {
        state.loading.summary = true;
        state.error.summary = null;
      })
      .addCase(fetchFinancialSummary.fulfilled, (state, action) => {
        state.loading.summary = false;
        state.summary = action.payload.data || state.summary;
      })
      .addCase(fetchFinancialSummary.rejected, (state, action) => {
        state.loading.summary = false;
        state.error.summary =
          action.payload?.message || "Failed to fetch financial summary";
      })

      // Create transaction
      .addCase(createTransaction.pending, (state) => {
        state.loading.createTransaction = true;
        state.error.createTransaction = null;
      })
      .addCase(createTransaction.fulfilled, (state, action) => {
        state.loading.createTransaction = false;
        // Add new transaction to the beginning of the list
        state.transactions.unshift(action.payload.data);
        // Update pagination total
        if (state.pagination.totalItems !== undefined) {
          state.pagination.totalItems += 1;
        }
      })
      .addCase(createTransaction.rejected, (state, action) => {
        state.loading.createTransaction = false;
        state.error.createTransaction =
          action.payload?.message || "Failed to create transaction";
      })

      // Fetch transaction by ID
      .addCase(fetchTransactionById.pending, (state) => {
        state.loading.transactions = true;
        state.error.transactions = null;
      })
      .addCase(fetchTransactionById.fulfilled, (state, action) => {
        state.loading.transactions = false;
        state.currentTransaction = action.payload.data;
      })
      .addCase(fetchTransactionById.rejected, (state, action) => {
        state.loading.transactions = false;
        state.error.transactions =
          action.payload?.message || "Failed to fetch transaction";
      })

      // Fetch user transactions
      .addCase(fetchUserTransactions.pending, (state) => {
        state.loading.userTransactions = true;
        state.error.userTransactions = null;
      })
      .addCase(fetchUserTransactions.fulfilled, (state, action) => {
        state.loading.userTransactions = false;
        state.userTransactions = action.payload.data || [];
        state.pagination = action.payload.pagination || state.pagination;
      })
      .addCase(fetchUserTransactions.rejected, (state, action) => {
        state.loading.userTransactions = false;
        state.error.userTransactions =
          action.payload?.message || "Failed to fetch user transactions";
      });
  },
});

export const {
  setFilters,
  clearError,
  resetFilters,
  clearCurrentTransaction,
  resetTransactionState,
} = financeSlice.actions;

export default financeSlice.reducer;

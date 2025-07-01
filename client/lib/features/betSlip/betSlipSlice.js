import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";

const betSlipSlice = createSlice({
  name: "betSlip",
  initialState: {
    bets: [],
    isOpen: false,
    isExpanded: false, // New state for expanded/collapsed
    activeTab: "singles",
    stake: {
      singles: {},
      combination: 100.0,
      system: 100.0,
    },
    totalStake: 0,
    potentialReturn: 0,
    approveOddsChange: false,
  },
  reducers: {
    addBet: (state, action) => {
      const {
        match,
        selection,
        odds,
        type = "1x2",
        oddId = null,
      } = action.payload;

      console.log(action.payload);

      // Check if bet already exists
      const existingBetIndex = state.bets.findIndex(
        (bet) => bet.match.id === match.id && bet.selection === selection
      );

      const newBet = {
        id: `${match.id}-${selection}-${Date.now()}`,
        match: {
          id: match.id,
          team1: match.team1 || (match.participants && match.participants[0] ? match.participants[0].name : 'Team 1'),
          team2: match.team2 || (match.participants && match.participants[1] ? match.participants[1].name : 'Team 2'),
          competition: match.competition || match.league?.name || "Football",
          time: match.time || match.startTime || (match.starting_at ? match.starting_at.split(' ')[1].slice(0, 5) : ''),
          isLive: match.isLive || false,
          name: match.name || `${match.team1 || ''} vs ${match.team2 || ''}`,
        },
        selection,
        odds: parseFloat(odds),
        type,
        stake: 0,
        oddId, // Store oddId if provided
      };

      if (existingBetIndex >= 0) {
        // Update existing bet
        state.bets[existingBetIndex] = newBet;
      } else {
        // Add new bet
        state.bets.push(newBet);
      } // Auto-open bet slip when bet is added
      state.isOpen = true;
      state.isExpanded = false; // Start collapsed when new bet is added

      // Update active tab based on number of bets
      if (state.bets.length === 1) {
        state.activeTab = "singles";
      } else if (state.bets.length >= 2) {
        // Keep current tab or switch to combination if on singles
        if (state.activeTab === "singles") {
          state.activeTab = "combination";
        }
      }
    },
    removeBet: (state, action) => {
      state.bets = state.bets.filter((bet) => bet.id !== action.payload);

      // Update state based on remaining bets
      if (state.bets.length === 0) {
        state.isOpen = false;
        state.isExpanded = false;
      } else if (state.bets.length === 1) {
        state.activeTab = "singles";
      }
    },
    clearAllBets: (state) => {
      state.bets = [];
      state.isOpen = false;
      state.isExpanded = false;
      state.activeTab = "singles";
      state.stake = {
        singles: {},
        combination: 100.0,
        system: 100.0,
      };
      state.totalStake = 0;
      state.potentialReturn = 0;
    },

    toggleBetSlip: (state) => {
      if (state.bets.length > 0) {
        state.isExpanded = !state.isExpanded;
      } else {
        state.isOpen = false;
        state.isExpanded = false;
      }
    },

    expandBetSlip: (state) => {
      if (state.bets.length > 0) {
        state.isExpanded = true;
      }
    },

    collapseBetSlip: (state) => {
      state.isExpanded = false;
    },

    closeBetSlip: (state) => {
      state.isOpen = false;
      state.isExpanded = false;
    },

    setActiveTab: (state, action) => {
      state.activeTab = action.payload;
    },

    updateSingleStake: (state, action) => {
      const { betId, stake } = action.payload;
      state.stake.singles[betId] = parseFloat(stake) || 0;

      // Update the bet's stake
      const bet = state.bets.find((b) => b.id === betId);
      if (bet) {
        bet.stake = parseFloat(stake) || 0;
      }
    },

    updateCombinationStake: (state, action) => {
      state.stake.combination = parseFloat(action.payload) || 0;
    },

    updateSystemStake: (state, action) => {
      state.stake.system = parseFloat(action.payload) || 0;
    },

    setApproveOddsChange: (state, action) => {
      state.approveOddsChange = action.payload;
    },

    calculateTotals: (state) => {
      let totalStake = 0;
      let potentialReturn = 0;

      if (state.activeTab === "singles") {
        // Calculate singles totals
        state.bets.forEach((bet) => {
          const stake = state.stake.singles[bet.id] || 0;
          totalStake += stake;
          potentialReturn += stake * bet.odds;
        });
      } else if (state.activeTab === "combination") {
        // Calculate combination totals
        totalStake = state.stake.combination;
        if (state.bets.length > 0) {
          const combinedOdds = state.bets.reduce(
            (acc, bet) => acc * bet.odds,
            1
          );
          potentialReturn = totalStake * combinedOdds;
        }
      } else if (state.activeTab === "system") {
        // Calculate system totals (simplified)
        totalStake = state.stake.system;
        if (state.bets.length >= 2) {
          // Simplified system calculation - in reality this would be more complex
          const avgOdds =
            state.bets.reduce((acc, bet) => acc + bet.odds, 0) /
            state.bets.length;
          potentialReturn = totalStake * avgOdds * 0.8; // System has lower potential than full combination
        }
      }

      state.totalStake = Math.round(totalStake * 100) / 100;
      state.potentialReturn = Math.round(potentialReturn * 100) / 100;
    },
  },
});

export const {
  addBet,
  removeBet,
  clearAllBets,
  toggleBetSlip,
  expandBetSlip,
  collapseBetSlip,
  closeBetSlip,
  setActiveTab,
  updateSingleStake,
  updateCombinationStake,
  updateSystemStake,
  setApproveOddsChange,
  calculateTotals,
} = betSlipSlice.actions;

// Selectors
export const selectBetSlip = (state) => state.betSlip;
export const selectBets = (state) => state.betSlip.bets;
export const selectBetSlipOpen = (state) => state.betSlip.isOpen;
export const selectBetSlipExpanded = (state) => state.betSlip.isExpanded;
export const selectActiveTab = (state) => state.betSlip.activeTab;
export const selectTotalStake = (state) => state.betSlip.totalStake;
export const selectPotentialReturn = (state) => state.betSlip.potentialReturn;

// Thunk to place bets (API integration placeholder)
export const placeBetThunk = createAsyncThunk(
  "betSlip/placeBet",
  async (_, { getState, rejectWithValue, dispatch }) => {
    const state = getState().betSlip;
    const bets = state.bets;
    const stakes = state.stake.singles;
    // Only support singles for now
    try {
      const results = [];
      console.log("This is bets: ", bets);

      for (const bet of bets) {
        console.log(bet.id);

        const stake = stakes[bet.id] || 0;
        if (!bet.match.id || !bet.oddId || !stake) {
          continue; // skip invalid
        }
        const payload = {
          matchId: bet.match.id,
          oddId: bet.oddId,
          stake,
          betOption: bet.selection,
        };
        console.log("This is the payload" + payload);

        const response = await apiClient.post("/bet/place-bet", payload);
        results.push(response.data);
      }
      console.log(results);
      dispatch(clearAllBets());
      return results;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: "Failed to place bet",
          error: error.message,
        }
      );
    }
  }
);

export default betSlipSlice.reducer;

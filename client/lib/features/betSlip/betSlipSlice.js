import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "@/config/axios";
import { setUser } from "@/lib/features/auth/authSlice";

const betSlipSlice = createSlice({
  name: "betSlip",
  initialState: {
    bets: [],
    isOpen: false,
    isExpanded: false, // New state for expanded/collapsed
    activeTab: "singles",
    stake: {
      singles: {},
      combination: 0,
      system: 0,
    },
    totalStake: 0,
    potentialReturn: 0,
    lastError: null, // For storing error messages like "same market bet exists"
    oddsChangeNotification: {
      message: '',
      timestamp: null,
      show: false
    },
    placeBetDisabled: false, // For disabling place bet button when odds change
  },
  reducers: {
    addBet: (state, action) => {
      const {
        match,
        selection,
        odds,
        type = "1x2",
        oddId = null,
        marketDescription,
        handicapValue,
        halfIndicator,
        total,
        name,
        marketId, // Add marketId to destructuring
        ...rest
      } = action.payload;


      // Check if bet already exists (same oddId) or same market bet exists (same match + marketId)
      // For combination bets, we allow multiple selections from the same market (1X2)
      const existingBetIndex = state.bets.findIndex(
        (bet) => {
          // Same exact bet (same oddId) - always conflict
          if (bet.oddId === oddId) return true;
          
          // Only check market conflicts if both bets have valid marketIds and they're the same
          if (bet.match.id === match.id && 
              bet.marketId && 
              marketId && 
              bet.marketId === marketId &&
              !(typeof marketId === 'string' && marketId.includes('_'))) {
            return true;
          }
          
          return false;
        }
      );

      // If same market bet exists, don't add it (only for non-combination markets)
      if (existingBetIndex >= 0) {
        const existingBet = state.bets[existingBetIndex];
        if (existingBet.oddId === oddId) {
          // Same exact bet, update it
        } else if (existingBet.marketId && marketId && existingBet.marketId === marketId && 
                   !(typeof marketId === 'string' && marketId.includes('_'))) {
          // Same market bet exists for non-combination markets, don't add
          state.lastError = "You already have a bet on this market for this match";
          return; // Exit early, don't add the bet
        }
      }

      // Determine if match is live/inplay
      const isMatchLive = (match) => {
        // First check if match explicitly has isLive flag (from home page components)
        if (match?.isLive === true) return true;
        
        // Check if match is from Inplay page (always live)
        if (match?.source === 'InPlayPage') return true;
        
        // Check if match has live data indicators
        if (match?.kambiLiveData || match?.liveData) return true;
        
        // Check if match has live timer data
        if (match?.timing || match?.state_id === 2) return true;
        
        // Original time-based logic as fallback
        if (!match || !match.starting_at) return false;
        const now = new Date();
        let matchTime;
        if (match.starting_at.includes('T')) {
          matchTime = new Date(match.starting_at.endsWith('Z') ? match.starting_at : match.starting_at + 'Z');
        } else {
          matchTime = new Date(match.starting_at.replace(' ', 'T') + 'Z');
        }
        const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000);
        return matchTime <= now && now < matchEnd;
      };

      const inplay = isMatchLive(match);

      // Debug: Check what match data is being received in betSlip
      console.log('🔍 betSlip addBet received match:', {
        matchId: match.id,
        league: match.league,
        groupId: match.groupId,
        leagueName: match.leagueName,
        source: match.source,
        isLive: match.isLive,
        inplay: inplay,
        hasKambiLiveData: !!match.kambiLiveData,
        hasLiveData: !!match.liveData,
        timing: match.timing,
        state_id: match.state_id
      });

      const newBet = {
        id: `${match.id}-${oddId}-${Date.now()}`,
        match: {
          id: match.id,
          // ✅ Fix team assignment by checking home/away property instead of array index
          team1: match.team1 || match.homeName || (match.participants ? 
            (match.participants.find(p => 
              (p.position && p.position.toLowerCase() === 'home') || p.home === true
            )?.name || match.participants[0]?.name) : 'Team 1'),
          team2: match.team2 || match.awayName || (match.participants ? 
            (match.participants.find(p => 
              (p.position && p.position.toLowerCase() === 'away') || p.home === false
            )?.name || match.participants[1]?.name) : 'Team 2'),
          competition: match.competition || match.league?.name || "Football",
          time: match.time || match.startTime || (match.starting_at ? match.starting_at.split(' ')[1].slice(0, 5) : ''),
          isLive: match.isLive || false,
          name: match.name || `${match.team1 || ''} vs ${match.team2 || ''}`,
          starting_at: match.starting_at, // Keep for inplay calculation
          // Add league information
          league: match.league || null,
          // Also add groupId and leagueName directly to the match object
          groupId: match.groupId,
          leagueName: match.leagueName,
        },
        selection,
        odds: parseFloat(odds),
        type,
        stake: 0,
        oddId,
        marketDescription,
        handicapValue,
        halfIndicator,
        total,
        name,
        label: action.payload.label || selection, // Use provided label if available
        marketId, // Store marketId in bet object
        marketName: marketDescription, // Store for combination bet payload
        inplay, // ✅ Add inplay flag for combination bets
        ...rest
      };

      // Debug: Check what the newBet object looks like
      console.log('🔍 betSlip newBet object created:', {
        matchId: newBet.match.id,
        league: newBet.match.league,
        groupId: newBet.match.groupId,
        leagueName: newBet.match.leagueName
      });

      if (existingBetIndex >= 0 && state.bets[existingBetIndex].oddId === oddId) {
        // Update existing bet with same oddId
        state.bets[existingBetIndex] = newBet;
      } else if (existingBetIndex === -1) {
        // Add new bet (no existing bet found)
        state.bets.push(newBet);
      }
      // If existingBetIndex >= 0 but oddId doesn't match, we already returned early above
      
      // Auto-open bet slip when bet is added
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
        combination: 0,
        system: 0,
      };
      state.totalStake = 0;
      state.potentialReturn = 0;
      state.lastError = null;
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

    setError: (state, action) => {
      state.lastError = action.payload;
    },

    clearError: (state) => {
      state.lastError = null;
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

    // New action to update odds in betslip when they change on match detail page
    updateBetOdds: (state, action) => {
      const { matchId, oddId, newOdds } = action.payload;
      
      // Find and update the bet with matching matchId and oddId
      const betIndex = state.bets.findIndex(
        bet => bet.match.id === matchId && bet.oddId === oddId
      );
      
      if (betIndex !== -1) {
        const oldOdds = state.bets[betIndex].odds;
        const newOddsValue = parseFloat(newOdds);
        
        // Only update if odds have actually changed
        if (Math.abs(newOddsValue - oldOdds) > 0.001) {
          state.bets[betIndex].odds = newOddsValue;
          
          // Add a flag to indicate odds were recently updated (for visual feedback)
          state.bets[betIndex].oddsUpdated = true;
          
          // Show notification and disable place bet button
          state.oddsChangeNotification = {
            message: `Odds changed from ${oldOdds} to ${newOddsValue}. Please review your bet.`,
            timestamp: Date.now(),
            show: true
          };
          state.placeBetDisabled = true;
          
          console.log(`🔄 Updated odds for bet ${state.bets[betIndex].id}: ${oldOdds} → ${newOddsValue}`);
          
          // Clear the oddsUpdated flag after a short delay (handled in component)
        }
      }
    },

    // Action to clear the oddsUpdated flag (for visual feedback)
    clearOddsUpdatedFlag: (state, action) => {
      const { betId } = action.payload;
      const betIndex = state.bets.findIndex(bet => bet.id === betId);
      if (betIndex !== -1) {
        state.bets[betIndex].oddsUpdated = false;
      }
    },

    // Action to show odds change notification and disable place bet button
    showOddsChangeNotification: (state, action) => {
      state.oddsChangeNotification = {
        message: action.payload.message || 'Odds have changed. Please review your bet.',
        timestamp: Date.now(),
        show: true
      };
      state.placeBetDisabled = true;
    },

    // Action to hide odds change notification and re-enable place bet button
    hideOddsChangeNotification: (state) => {
      state.oddsChangeNotification = {
        message: '',
        timestamp: null,
        show: false
      };
      state.placeBetDisabled = false;
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
  setError,
  clearError,
  calculateTotals,
  updateBetOdds,
  clearOddsUpdatedFlag,
  showOddsChangeNotification,
  hideOddsChangeNotification,
} = betSlipSlice.actions;

// Selectors
export const selectBetSlip = (state) => state.betSlip;
export const selectBets = (state) => state.betSlip.bets;
export const selectBetSlipOpen = (state) => state.betSlip.isOpen;
export const selectBetSlipExpanded = (state) => state.betSlip.isExpanded;
export const selectActiveTab = (state) => state.betSlip.activeTab;
export const selectTotalStake = (state) => state.betSlip.totalStake;
export const selectPotentialReturn = (state) => state.betSlip.potentialReturn;
export const selectLastError = (state) => state.betSlip.lastError;
export const selectOddsChangeNotification = (state) => state.betSlip.oddsChangeNotification;
export const selectPlaceBetDisabled = (state) => state.betSlip.placeBetDisabled;

// Helper function to get match data from multiple sources (match detail page or league page)
const getMatchDataFromState = (matchId, matchesState, leaguesState) => {
  // First try to get from match details (individual match page)
  let matchData = matchesState.matchDetailsV2?.[matchId]?.matchData;
  
  if (matchData) {
    return matchData;
  }
  
  // If not found, try to get from league data (league page)
  for (const leagueId in leaguesState.matchesByLeague) {
    const leagueData = leaguesState.matchesByLeague[leagueId];
    if (leagueData && leagueData.matches && Array.isArray(leagueData.matches)) {
      const leagueMatch = leagueData.matches.find(match => match.id === matchId);
      if (leagueMatch) {
        // Transform league match data to match the expected format
        return {
          data: {
            groupId: leagueMatch.groupId,
            group: leagueMatch.group,
            betOffers: leagueMatch.betOffers || [],
            events: [{
              id: leagueMatch.id,
              name: leagueMatch.name,
              englishName: leagueMatch.englishName,
              homeName: leagueMatch.homeName,
              awayName: leagueMatch.awayName,
              start: leagueMatch.start,
              state: leagueMatch.state,
              sport: leagueMatch.sport,
              groupId: leagueMatch.groupId,
              group: leagueMatch.group,
              participants: leagueMatch.participants
            }]
          }
        };
      }
    }
  }
  
  console.warn(`[getMatchDataFromState] No match data found for ${matchId} in any source`);
  return null;
};

// Helper function to extract Unibet metadata from match data
const extractUnibetMetadata = (bet, matchData) => {
  
  // Determine correct participant for base metadata
  let baseParticipant = bet.selection || bet.label;
  if (bet.selection === 'Home' || bet.selection === '1') {
    baseParticipant = bet.match.team1;
  } else if (bet.selection === 'Away' || bet.selection === '2') {
    baseParticipant = bet.match.team2;
  }

  // Base metadata that we can always extract
  const baseMetadata = {
    eventName: `${bet.match.team1} vs ${bet.match.team2}`,
    marketName: bet.marketDescription || "Unknown Market",
    criterionLabel: bet.selection || bet.label,
    criterionEnglishLabel: bet.selection || bet.label,
    outcomeEnglishLabel: bet.selection || bet.label,
    participant: baseParticipant,
    participantId: null,
    eventParticipantId: null,
    betOfferTypeId: null,
    handicapRaw: null,
    handicapLine: null,
    leagueId: matchData?.data?.groupId || matchData?.data?.events?.[0]?.groupId || null,
    leagueName: matchData?.data?.group || matchData?.data?.events?.[0]?.group || null,
    homeName: bet.match.team1,
    awayName: bet.match.team2,
    // ✅ Get start time from multiple sources: bet object, match data events, or match data root
    start: bet.match.starting_at || matchData?.data?.events?.[0]?.start || matchData?.data?.start || null
  };

  // If we have betOffers data, try to extract more detailed metadata
  if (matchData?.data?.betOffers && Array.isArray(matchData.data.betOffers)) {
    // Find the bet offer that matches this bet
    const betOffer = matchData.data.betOffers.find(offer => 
      offer.outcomes?.some(outcome => outcome.id === bet.oddId)
    );

    if (betOffer) {
      // Find the specific outcome
      const outcome = betOffer.outcomes?.find(outcome => outcome.id === bet.oddId);
      
      if (outcome) {

        // Determine correct participant based on bet selection
        let correctParticipant = outcome.participant || bet.selection;
        let correctParticipantId = outcome.participantId || null;
        
        // Fix participant assignment for Home/Away bets
        if (bet.selection === 'Home' || bet.selection === '1') {
          correctParticipant = bet.match.team1 || baseMetadata.homeName;
          // Try to find participant ID for home team
          if (matchData?.data?.events?.[0]?.participants?.[0]?.id) {
            correctParticipantId = matchData.data.events[0].participants[0].id;
          }
        } else if (bet.selection === 'Away' || bet.selection === '2') {
          correctParticipant = bet.match.team2 || baseMetadata.awayName;
          // Try to find participant ID for away team
          if (matchData?.data?.events?.[0]?.participants?.[1]?.id) {
            correctParticipantId = matchData.data.events[0].participants[1].id;
          }
        }

        // Override with detailed metadata if available
        return {
          ...baseMetadata,
          marketName: betOffer.criterion?.label || betOffer.betOfferType?.name || bet.marketDescription,
          criterionLabel: betOffer.criterion?.label || bet.selection,
          criterionEnglishLabel: betOffer.criterion?.englishLabel || bet.selection,
          outcomeEnglishLabel: outcome.englishLabel || outcome.label,
          participant: correctParticipant,
          participantId: correctParticipantId,
          eventParticipantId: outcome.eventParticipantId || null,
          betOfferTypeId: betOffer.betOfferType?.id || null,
          handicapRaw: outcome.line ? Math.round(outcome.line * 1000) : null,
          handicapLine: outcome.line || null
        };
      } else {
        console.warn(`No outcome found for oddId: ${bet.oddId}`);
      }
    } else {
      console.warn(`No bet offer found for oddId: ${bet.oddId}`);
    }
  } else {
    console.warn('No betOffers data available for metadata extraction, using base metadata');
  }

  return baseMetadata;
};

// Thunk to place bets (supports both singles and combination bets)
export const placeBetThunk = createAsyncThunk(
  "betSlip/placeBet",
  async (_, { getState, rejectWithValue, dispatch }) => {
    const state = getState().betSlip;
    const bets = state.bets;
    const activeTab = state.activeTab;
    const stakes = state.stake.singles;
    const combinationStake = state.stake.combination;
    
    // Get match data from Redux state for Unibet metadata extraction
    const matchesState = getState().matches;
    const leaguesState = getState().leagues;
    
    try {
      const results = [];

      if (activeTab === "singles") {
        // Handle single bets (clean, label-based)
        for (const bet of bets) {
          const stake = stakes[bet.id] || 0;
          if (!bet.match.id || !bet.oddId || !stake) {
            continue; // skip invalid
          }
          
          // Extract Unibet metadata from match data (try multiple sources)
          const matchData = getMatchDataFromState(bet.match.id, matchesState, leaguesState);
          const unibetMetadata = extractUnibetMetadata(bet, matchData);
          
          
          // Use label for betOption and selection
          const label = bet.label || bet.selection;
          const payload = {
            matchId: bet.match.id,
            oddId: bet.oddId,
            stake,
            odds: bet.odds,
            betOption: label,
            selection: label,
            teams: `${bet.match.team1} vs ${bet.match.team2}`,
            marketId: (typeof bet.marketId === 'string' && bet.marketId.includes('_')) ? bet.marketId.split('_')[0] : bet.marketId,
            // League information will be added after unibetMetadata to prevent override
            betDetails: {
              market_id: (typeof bet.marketId === 'string' && bet.marketId.includes('_')) ? bet.marketId.split('_')[0] : bet.marketId,
              market_name: bet.marketName || "Unknown Market",
              label,
              value: bet.odds,
              total: bet.total || null,
              market_description: bet.marketDescription || null,
              handicap: bet.handicapValue || null,
              name: bet.name || label
            },
            ...(bet.match.starting_at && { matchDate: bet.match.starting_at }),
            ...(bet.match.estimatedMatchEnd && { estimatedMatchEnd: bet.match.estimatedMatchEnd }),
            ...(bet.match.betOutcomeCheckTime && { betOutcomeCheckTime: bet.match.betOutcomeCheckTime }),
            inplay: bet.inplay || false,
            // Add these fields for live matches
            ...(bet.inplay && { 
              isLive: true,
              matchStartTime: bet.match.starting_at,
              matchEndTime: bet.match.estimatedMatchEnd || (bet.match.starting_at ? new Date(new Date(bet.match.starting_at).getTime() + 120 * 60 * 1000).toISOString() : null)
            }),
            // Add Unibet metadata for enrichment
            ...unibetMetadata,
            // Use smart fallback for leagueId and leagueName:
            // 1. First try bet.match.league (for League Card bets)
            // 2. Fallback to unibetMetadata (for Match Detail Page bets)
            leagueId: (() => {
              const fromBetMatch = bet.match.league?.id || bet.match.groupId;
              const fromUnibetMeta = unibetMetadata?.leagueId;
              const finalLeagueId = fromBetMatch || fromUnibetMeta || null;
              
              console.log('🔍 placeBetThunk leagueId extraction:', {
                'bet.match.league': bet.match.league,
                'bet.match.league?.id': bet.match.league?.id,
                'bet.match.groupId': bet.match.groupId,
                'unibetMetadata.leagueId': fromUnibetMeta,
                'finalLeagueId': finalLeagueId
              });
              return finalLeagueId;
            })(),
            leagueName: (() => {
              const fromBetMatch = bet.match.league?.name || bet.match.leagueName;
              const fromUnibetMeta = unibetMetadata?.leagueName;
              return fromBetMatch || fromUnibetMeta || null;
            })(),
          };

          // Debug: Check payload after construction
          console.log('🔍 Payload after construction:', {
            'payload.leagueId': payload.leagueId,
            'payload.leagueName': payload.leagueName
          });

          // Debug: Log the final API payload being sent
          console.log('🚀 Final API payload being sent:', payload);
          console.log('🔍 Payload leagueId check:', {
            'payload.leagueId': payload.leagueId,
            'payload.leagueName': payload.leagueName
          });
          
          const response = await apiClient.post("/bet/place-bet", payload);
          results.push(response.data);
          // Update user balance
          if (response.data.user) {
            dispatch(setUser(response.data.user));
          }
        }
      } else if (activeTab === "combination" && bets.length >= 2) {
        // Handle combination bet (NEW)
        if (!combinationStake || combinationStake <= 0) {
          throw new Error("Please enter a valid stake for combination bet");
        }

        // Prepare combination data for backend
        const combinationData = bets.map(bet => {
          const label = bet.label || bet.selection;
          
          // Extract Unibet metadata from match data for each leg (try multiple sources)
          
          const matchData = getMatchDataFromState(bet.match.id, matchesState, leaguesState);
          
          const unibetMetadata = extractUnibetMetadata(bet, matchData);
          
          return {
            matchId: bet.match.id,
            oddId: bet.oddId,
            betOption: label, // Always use label for betOption
            odds: bet.odds,
            stake: combinationStake, // Same stake for all legs
            inplay: bet.inplay || false,
            selection: label, // Always use label for selection
            teams: `${bet.match.team1} vs ${bet.match.team2}`,
            marketId: (typeof bet.marketId === 'string' && bet.marketId.includes('_')) ? bet.marketId.split('_')[0] : bet.marketId,
            betDetails: {
              market_id: (typeof bet.marketId === 'string' && bet.marketId.includes('_')) ? bet.marketId.split('_')[0] : bet.marketId,
              market_name: bet.marketName || "Unknown Market",
              label,
              value: bet.odds,
              total: bet.total || null,
              market_description: bet.marketDescription || null,
              handicap: bet.handicapValue || null,
              name: bet.name || label
            },
            ...(bet.match.starting_at && { matchDate: bet.match.starting_at }),
            ...(bet.match.estimatedMatchEnd && { estimatedMatchEnd: bet.match.estimatedMatchEnd }),
            ...(bet.match.betOutcomeCheckTime && { betOutcomeCheckTime: bet.match.betOutcomeCheckTime }),
            // Add these fields for live matches
            ...(bet.inplay && { 
              isLive: true,
              matchStartTime: bet.match.starting_at,
              matchEndTime: bet.match.estimatedMatchEnd || (bet.match.starting_at ? new Date(new Date(bet.match.starting_at).getTime() + 120 * 60 * 1000).toISOString() : null)
            }),
            // ✅ Spread unibetMeta fields at root level for backend compatibility
            ...unibetMetadata,
            // Use smart fallback for leagueId and leagueName:
            // 1. First try bet.match.league (for League Card bets)
            // 2. Fallback to unibetMetadata (for Match Detail Page bets)
            leagueId: (() => {
              const fromBetMatch = bet.match.league?.id || bet.match.groupId;
              const fromUnibetMeta = unibetMetadata?.leagueId;
              return fromBetMatch || fromUnibetMeta || null;
            })(),
            leagueName: (() => {
              const fromBetMatch = bet.match.league?.name || bet.match.leagueName;
              const fromUnibetMeta = unibetMetadata?.leagueName;
              return fromBetMatch || fromUnibetMeta || null;
            })()
          };
        });

        // Generate combination bet identifiers
        const combinationOddId = `combo_${Date.now()}`;
        const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
        
        // For combination bets, use first leg's matchId as primary matchId
        const payload = {
          matchId: bets[0].match.id, // ✅ Use first leg's matchId instead of "combination"
          oddId: combinationOddId, // ✅ Generate unique combination oddId
          stake: combinationStake,
          betOption: `Combination Bet (${bets.length} legs)`, // ✅ Proper combination description
          marketId: "combination", // ✅ Use "combination" as marketId
          combinationData // ✅ This contains all the bet details
        };


        const response = await apiClient.post("/bet/place-bet", payload);
        results.push(response.data);
        
        // Update user balance
        if (response.data.user) {
          dispatch(setUser(response.data.user));
        }
      } else {
        throw new Error(`Invalid bet configuration: ${activeTab} with ${bets.length} bets`);
      }

      dispatch(clearAllBets());
      return results;
    } catch (error) {
      // Check if this is a client error (4xx status) before logging as error
      if (error.response?.status >= 400 && error.response?.status < 500) {
        // Log client errors as info, not error
      } else {
        // Log server errors as errors
        console.error("Error placing bet:", error);
      }
      
      return rejectWithValue(
        error.response?.data || {
          success: false,
          message: error.message || "Failed to place bet",
          error: error.message,
        }
      );
    }
  }
);

export default betSlipSlice.reducer;

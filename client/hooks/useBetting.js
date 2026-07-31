import { useDispatch } from "react-redux";
import { addBet } from "@/lib/features/betSlip/betSlipSlice";
import apiClient from "@/config/axios";

export const useBetting = () => {
  const dispatch = useDispatch();

  // Add bet to slip (Redux only, no API call)
  const addBetToSlip = (match, selection, odds, type = "1x2", oddId = null, metadata = {}) => {
    // Normalize start time — live Unibet list uses `start`, other sources use `starting_at`
    const startAt = match?.starting_at || match?.start || null;
    const normalizedMatch = {
      ...match,
      starting_at: startAt,
      start: startAt,
    };

    // Debug: Check what match data is being received in useBetting
    console.log('🔍 useBetting addBetToSlip received match:', {
      matchId: normalizedMatch.id,
      league: normalizedMatch.league,
      groupId: normalizedMatch.groupId,
      leagueName: normalizedMatch.leagueName,
      source: normalizedMatch.source,
      starting_at: normalizedMatch.starting_at,
    });
    
    // Always pass both label and name for bet slip formatting
    const { label = selection, name = undefined, marketDescription, ...restMeta } = metadata;
    dispatch(
      addBet({
        match: normalizedMatch,
        selection,
        odds,
        type,
        oddId,
        label,
        name,
        marketDescription,
        ...restMeta
      })
    );
  };

  // Place bet (API call, to be used in BetSlip only)
  const placeBet = async (betData) => {
    try {
      // betData should contain matchId, oddId, stake, betOption, isInPlay
      console.log("Sending bet to server:", betData);
      const response = await apiClient.post("/bet/place-bet", betData);
      console.log("Server response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error placing bet:", error.response?.data || error);
      throw error;
    }
  };

  // Handler for adding to slip only
  const createBetHandler = (
    match,
    selection,
    odds,
    type = "1x2",
    oddId = null,
    metadata = {}
  ) => {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      addBetToSlip(match, selection, odds, type, oddId, metadata);
    };
  };

  return {
    addBetToSlip,
    placeBet,
    createBetHandler,
  };
};

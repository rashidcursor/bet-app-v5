import { useDispatch } from "react-redux";
import { addBet } from "@/lib/features/betSlip/betSlipSlice";
import apiClient from "@/config/axios";

export const useBetting = () => {
  const dispatch = useDispatch();

  const placeBet = async (match, selection, odds, type = "1x2", oddId = null, metadata = {}) => {
    try {
      // First add to local bet slip
      dispatch(
        addBet({
          match,
          selection,
          odds,
          type,
          oddId,
          ...metadata
        })
      );

      // Then send to server with required format
      const betData = {
        matchId: match.id,
        oddId: oddId,
        stake: 11, // Default stake, can be updated later
        betOption: selection // Include bet option
      };

      console.log("Sending bet to server:", betData);
      
      const response = await apiClient.post("/bet/place-bet", betData);
      console.log("Server response:", response.data);

      return response.data;
    } catch (error) {
      console.error("Error placing bet:", error.response?.data || error);
      throw error;
    }
  };

  const createBetHandler = (
    match,
    selection,
    odds,
    type = "1x2",
    oddId = null,
    metadata = {}
  ) => {
    return async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await placeBet(match, selection, odds, type, oddId, metadata);
      } catch (error) {
        console.error("Error in bet handler:", error);
      }
    };
  };

  return {
    placeBet,
    createBetHandler,
  };
};

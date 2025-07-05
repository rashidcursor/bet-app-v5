import BetService from "../services/bet.service.js";
import { CustomError } from "../utils/customErrors.js";

class BetController {
  async placeBet(req, res, next) {
    console.log("Placing bet with data:", req.body);
    try {
      const { matchId, oddId, stake, betOption } = req.body;
      const userId = req.user._id; 

      // Validate inputs
      if (!matchId || !oddId || !stake || !betOption) {
        throw new CustomError(
          "Missing required fields: matchId, oddId, stake, betOption",
          400,
          "INVALID_INPUT"
        );
      }
      if (isNaN(stake) || stake <= 0) {
        throw new CustomError(
          "Stake must be a positive number",
          400,
          "INVALID_STAKE"
        );
      }

      const result = await BetService.placeBet(userId, matchId, oddId, stake, betOption);
      res.status(201).json({
        success: true,
        data: result,
        message: "Bet placed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async checkBetOutcome(req, res, next) {
    try {
      const { betId } = req.params;

      // Validate betId
      if (!betId || !mongoose.isValidObjectId(betId)) {
        throw new CustomError("Invalid bet ID", 400, "INVALID_BET_ID");
      }

      const result = await BetService.checkBetOutcome(betId);
      res.status(200).json({
        success: true,
        data: result,
        message: "Bet outcome checked",
      });
    } catch (error) {
      next(error);
    }
  }

  async checkPendingBets(req, res, next) {
    try {
      const results = await BetService.checkPendingBets();
      res.status(200).json({
        success: true,
        data: results,
        message: "Pending bets processed",
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserBets(req, res, next) {
    try {
      const userId = req.user._id;
      const bets = await BetService.getUserBets(userId);
      res.status(200).json({
        success: true,
        data: bets,
        message: "Fetched user bets successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllBets(req, res, next) {
    try {
      const groupedBets = await BetService.getAllBets();
      res.status(200).json({
        success: true,
        data: groupedBets,
        message: "Fetched all bets grouped by user successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new BetController();

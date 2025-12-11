import BetService from "../services/bet.service.js";
import { CustomError } from "../utils/customErrors.js";
import FixtureOptimizationService from "../services/fixture.service.js";
import mongoose from "mongoose";

class BetController {
  async placeBet(req, res, next) {
    console.log("Placing bet with data:", req.body);
    try {
      const { matchId, oddId, stake, betOption, marketId, combinationData } = req.body;
      const userId = req.user._id; 

      // Handle combination bets
      if (combinationData && Array.isArray(combinationData)) {
        // Validate combination bet inputs
        if (combinationData.length < 2) {
          throw new CustomError(
            "Combination bet must have at least 2 legs",
            400,
            "INVALID_COMBINATION_BET"
          );
        }
        if (!stake || isNaN(stake) || stake <= 0) {
          throw new CustomError(
            "Stake must be a positive number",
            400,
            "INVALID_STAKE"
          );
        }

        // Validate each leg has required fields
        for (let i = 0; i < combinationData.length; i++) {
          const leg = combinationData[i];
          if (!leg.matchId || !leg.oddId || !leg.betOption) {
            throw new CustomError(
              `Missing required fields in leg ${i + 1}: matchId, oddId, betOption`,
              400,
              "INVALID_COMBINATION_LEG"
            );
          }
        }

        console.log(`Processing combination bet with ${combinationData.length} legs`);
        
        // Use the first leg's matchId as the primary matchId for the combination bet
        const primaryMatchId = combinationData[0].matchId;
        const primaryOddId = `combination_${Date.now()}`;
        
        // Create Unibet metadata for combination bet (similar to single bet)
        const unibetMetaPayload = {
          eventName: `Combination Bet (${combinationData.length} legs)`,
          marketName: "Combination",
          criterionLabel: "Multiple Markets",
          criterionEnglishLabel: "Multiple Markets",
          outcomeEnglishLabel: "Combination",
          participant: null,
          participantId: null,
          eventParticipantId: null,
          betOfferTypeId: "combination",
          handicapRaw: null,
          handicapLine: null,
          leagueId: null,
          leagueName: "Multiple Leagues",
          homeName: "Multiple Teams",
          awayName: "Multiple Teams",
          start: combinationData[0].matchDate || new Date().toISOString(),
          odds: combinationData.reduce((acc, leg) => acc * leg.odds, 1)
        };

        const result = await BetService.placeBet(
          userId, 
          primaryMatchId, 
          primaryOddId, 
          stake, 
          `Combination Bet (${combinationData.length} legs)`, 
          false, 
          combinationData,
          unibetMetaPayload,
          null
        );
        
        res.status(201).json({
          success: true,
          bet: result.bet,
          user: result.user,
          message: "Combination bet placed successfully",
        });
        return;
      }

      // Handle single bets
      // Validate single bet inputs
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

      // Log marketId if provided (for middleware to use)
      if (marketId) {
        console.log(`Market ID provided: ${marketId}`);
      }

      // Check if the match is live
      const isLive = global.liveFixturesService ? global.liveFixturesService.isMatchLive(matchId) : false;
      console.log(`Match ${matchId} is live: ${isLive}`);

      // Optional: build Unibet-like metadata from request for parity (Phase 1)
      const inferredMarketName = req.body.marketName || req.body.marketDescription || req.body?.betDetails?.market_name || req.body?.betDetails?.market_description;
      const teamsString = typeof req.body.teams === 'string' ? req.body.teams : null;
      let inferredHome = null, inferredAway = null;
      if (teamsString && teamsString.includes(' vs ')) {
        const [h, a] = teamsString.split(' vs ').map(s => s && s.trim());
        inferredHome = h || null;
        inferredAway = a || null;
      }
      const inferredHandicapFromDetails = (typeof req.body?.betDetails?.handicap === 'number') ? req.body.betDetails.handicap : (typeof req.body?.betDetails?.handicap === 'string' && !isNaN(Number(req.body.betDetails.handicap)) ? Number(req.body.betDetails.handicap) : undefined);
      const inferredHandicapLine = (typeof inferredHandicapFromDetails === 'number') ? inferredHandicapFromDetails : req.body.handicapLine;
      const inferredHandicapRaw = (typeof req.body.handicapRaw === 'number')
        ? req.body.handicapRaw
        : (typeof inferredHandicapLine === 'number' ? Math.round(inferredHandicapLine * 1000) : undefined);
      const unibetMetaPayload = {
        eventName: req.body.eventName || teamsString,
        marketName: inferredMarketName,
        criterionLabel: req.body.criterionLabel,
        criterionEnglishLabel: req.body.criterionEnglishLabel,
        outcomeEnglishLabel: req.body.outcomeEnglishLabel,
        participant: req.body.participant,
        participantId: req.body.participantId,
        eventParticipantId: req.body.eventParticipantId,
        betOfferTypeId: req.body.betOfferTypeId,
        handicapRaw: inferredHandicapRaw,
        handicapLine: inferredHandicapLine,
        leagueId: req.body.leagueId,
        leagueName: req.body.leagueName,
        homeName: req.body.homeName || inferredHome,
        awayName: req.body.awayName || inferredAway,
        start: req.body.start || req.body.matchDate,
        odds: (typeof req.body.odds === 'number') ? req.body.odds : Number(req.body.odds)
      };

      const result = await BetService.placeBet(
        userId,
        matchId,
        oddId,
        stake,
        betOption,
        isLive,
        null,
        unibetMetaPayload,
        req.body.betDetails ? {
          ...req.body.betDetails,
          // Ensure value is numeric; if client sent string, coerce here
          value: (typeof req.body.betDetails.value === 'number') ? req.body.betDetails.value : Number(req.body.betDetails.value)
        } : null
      );
      res.status(201).json({
        success: true,
        bet: result.bet,
        user: result.user,
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

      console.log(`[BetController.checkBetOutcome] Checking outcome for bet: ${betId}`);

      const result = await BetService.checkBetOutcome(betId);
      
      // Enhanced response with additional details for combination bets
      const response = {
        success: true,
        data: {
          ...result,
          // Add combination details if it's a combination bet
          ...(result.combination && {
            combination: result.combination,
            legStatuses: result.combination?.map(leg => ({
              matchId: leg.matchId,
              status: leg.status,
              payout: leg.payout
            }))
          })
        },
        message: result.combination 
          ? "Combination bet outcome checked" 
          : "Bet outcome checked",
      };

      res.status(200).json(response);
    } catch (error) {
      console.error(`[BetController.checkBetOutcome] Error:`, error);
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
      const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        status: req.query.status
      };
      const bets = await BetService.getUserBets(userId, filters);
      console.log(`Fetched ${bets.length} bets for user ${userId} with filters:`, filters);
      
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

  async getBetsByUserId(req, res, next) {
    try {
      const { userId } = req.params;
      console.log(`[BetController.getBetsByUserId] Requesting bets for user ID: ${userId}`);
      
      const bets = await BetService.getBetsByUserId(userId);
      console.log(`[BetController.getBetsByUserId] Fetched ${bets.length} bets for user ${userId}`);
      
      res.status(200).json({
        success: true,
        data: bets,
        message: "Fetched user bets successfully",
      });
    } catch (error) {
      console.error(`[BetController.getBetsByUserId] Error:`, error);
      next(error);
    }
  }
}

export default new BetController();


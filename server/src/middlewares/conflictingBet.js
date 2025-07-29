import Bet from '../models/Bet.js';

export const preventConflictingBet = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let betsToCheck = [];

    console.log('[conflictingBet] Request body:', JSON.stringify(req.body, null, 2));

    // Determine the bets/legs to check based on request structure
    if (req.body.combinationData && Array.isArray(req.body.combinationData)) {
      // Combination bet - check all legs
      betsToCheck = req.body.combinationData;
      console.log('[conflictingBet] Processing combination bet with', betsToCheck.length, 'legs');
    } else if (Array.isArray(req.body)) {
      // Array of bets
      betsToCheck = req.body;
      console.log('[conflictingBet] Processing array of', betsToCheck.length, 'bets');
    } else {
      // Single bet
      betsToCheck = [req.body];
      console.log('[conflictingBet] Processing single bet');
    }

    // Check for missing required fields in any bet
    for (const bet of betsToCheck) {
      if (!userId || !bet.matchId || !(bet.marketId || (bet.betDetails && bet.betDetails.market_id))) {
        console.log('[conflictingBet] Missing required fields:', { userId, matchId: bet.matchId, marketId: bet.marketId || bet.betDetails?.market_id });
        return res.status(400).json({ 
          success: false, 
          message: 'Missing userId, matchId, or marketId for conflict check.' 
        });
      }
    }

    // Check for conflicts within the current request (same matchId + marketId in multiple bets)
    const seenCombos = new Set();
    const seenMatchIds = new Set();
    
    for (const bet of betsToCheck) {
      const matchId = bet.matchId;
      const marketId = bet.marketId || (bet.betDetails && bet.betDetails.market_id);
      const comboKey = `${matchId}:${marketId}`;
      
      // Check for duplicate match + market combinations
      if (seenCombos.has(comboKey)) {
        console.log('[conflictingBet] Conflict within request:', comboKey);
        return res.status(400).json({ 
          success: false, 
          message: 'Conflicting bets within the current request (same match and market).' 
        });
      }
      seenCombos.add(comboKey);
      
      // Check for duplicate match IDs in combination bets
      if (seenMatchIds.has(matchId)) {
        console.log('[conflictingBet] Duplicate match ID in combination bet:', matchId);
        return res.status(400).json({ 
          success: false, 
          message: 'Combination bets cannot contain the same match multiple times.' 
        });
      }
      seenMatchIds.add(matchId);
    }

    // Check for conflicts with existing pending bets in the DB
    for (const bet of betsToCheck) {
      const matchId = bet.matchId;
      const marketId = bet.marketId || (bet.betDetails && bet.betDetails.market_id);
      
      console.log('[conflictingBet] Checking for conflicts with:', { matchId, marketId });

      // Check for conflicts with single bets (non-combination bets)
      const existingSingleBet = await Bet.findOne({
        userId,
        matchId,
        'betDetails.market_id': marketId,
        status: 'pending',
        // Ensure it's not a combination bet
        $or: [
          { combination: { $exists: false } },
          { combination: { $size: 0 } }
        ]
      });

      if (existingSingleBet) {
        console.log('[conflictingBet] Found conflicting single bet:', existingSingleBet._id);
        return res.status(400).json({ 
          success: false, 
          message: 'You already have a pending bet on this market for this match.' 
        });
      }

      // Check for conflicts with combination bet legs
      const existingCombinationBet = await Bet.findOne({
        userId,
        status: 'pending',
        combination: { $exists: true, $ne: [] },
        'combination': {
          $elemMatch: {
            matchId: matchId,
            'betDetails.market_id': marketId
          }
        }
      });

      if (existingCombinationBet) {
        console.log('[conflictingBet] Found conflicting combination bet leg:', existingCombinationBet._id);
        return res.status(400).json({ 
          success: false, 
          message: 'You already have a pending bet on this market for this match (in a combination bet).' 
        });
      }
    }

    console.log('[conflictingBet] No conflicts found, proceeding with bet placement');
    next();
  } catch (err) {
    console.error('[conflictingBet] Error:', err);
    next(err);
  }
}; 
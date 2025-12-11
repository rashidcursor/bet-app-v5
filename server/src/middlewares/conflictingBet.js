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

    // Determine if this is a combination bet request (move this before the loop)
    const isCombinationBetRequest = req.body.combinationData && Array.isArray(req.body.combinationData);

    // Check for missing required fields in any bet (with graceful market key inference)
    for (const bet of betsToCheck) {
      const inferredMarketKey = bet.marketId || bet.betDetails?.market_id || bet.betDetails?.marketId || bet.betDetails?.market_description || bet.betDetails?.market_name || bet.betDetails?.label || bet.betOption || bet.selection;
      
      if (!userId || !bet.matchId) {
        console.log('[conflictingBet] Missing required fields:', { userId, matchId: bet.matchId, marketId: inferredMarketKey });
        return res.status(400).json({ 
          success: false, 
          message: 'Missing userId or matchId for conflict check.' 
        });
      }
      
      // For combination bets, we'll use a more flexible market key
      if (isCombinationBetRequest) {
        // Use oddId as market identifier for combination bets since betDetails isn't available yet
        bet.__marketKey = bet.oddId || bet.betOption || bet.selection || 'unknown';
      } else {
        bet.__marketKey = String(inferredMarketKey);
      }
    }

    // Check for conflicts within the current request (same matchId + marketId in multiple bets)
    const seenCombos = new Set();
    const seenMatchIds = new Set();
    
    for (const bet of betsToCheck) {
      const matchId = bet.matchId;
      const marketKey = bet.__marketKey || bet.marketId || (bet.betDetails && bet.betDetails.market_id);
      const comboKey = `${matchId}:${marketKey}`;
      
      // Check for duplicate match + market combinations
      if (seenCombos.has(comboKey)) {
        console.log('[conflictingBet] Conflict within request:', comboKey);
        return res.status(400).json({ 
          success: false, 
          message: 'Conflicting bets within the current request (same match and market).' 
        });
      }
      seenCombos.add(comboKey);
      
      // Allow combination bets from the same match (different markets)
      // Only check for duplicate match + market combinations (handled above)
      seenMatchIds.add(matchId); // Still add to track, but don't block
    }

    // Check for conflicts with existing pending bets in the DB
    if (isCombinationBetRequest) {
      // For combination bets, check the entire combination as a whole
      // Allow if new combination is a SUPERSET of existing combination (contains all existing legs + more)
      // Block if new combination is exact match, subset, or has significant partial overlap
      
      // Get all pending combination bets for this user
      const existingCombinationBets = await Bet.find({
        userId,
        status: 'pending',
        combination: { $exists: true, $ne: [] }
      });

      // Create a set of all legs in the new combination for quick lookup
      const newCombinationLegs = new Set();
      betsToCheck.forEach(leg => {
        const legKey = `${leg.matchId}:${leg.oddId}`;
        newCombinationLegs.add(legKey);
      });

      console.log('[conflictingBet] New combination has', newCombinationLegs.size, 'legs');
      console.log('[conflictingBet] Checking against', existingCombinationBets.length, 'existing combination bets');

      // Check each existing combination bet
      for (const existingBet of existingCombinationBets) {
        if (!existingBet.combination || existingBet.combination.length === 0) continue;

        // Create a set of all legs in the existing combination
        const existingCombinationLegs = new Set();
        existingBet.combination.forEach(leg => {
          const legKey = `${leg.matchId}:${leg.oddId}`;
          existingCombinationLegs.add(legKey);
        });

        // Check if new combination contains ALL legs of existing combination
        const allExistingLegsPresent = Array.from(existingCombinationLegs).every(legKey => 
          newCombinationLegs.has(legKey)
        );

        if (allExistingLegsPresent) {
          // New combination contains all legs of existing combination
          const newHasMoreLegs = newCombinationLegs.size > existingCombinationLegs.size;
          
          if (newHasMoreLegs) {
            // New combination is a SUPERSET (contains all existing legs + more) - ALLOW
            console.log('[conflictingBet] ✅ New combination is a superset of existing combination', existingBet._id);
            console.log('[conflictingBet] Existing legs:', existingCombinationLegs.size, 'New legs:', newCombinationLegs.size);
            // Continue checking other combinations - this one is allowed
          } else {
            // New combination is an EXACT MATCH - BLOCK
            console.log('[conflictingBet] ❌ New combination is exact match of existing combination', existingBet._id);
            return res.status(400).json({ 
              success: false, 
              message: 'You already have a pending combination bet with the exact same selections.' 
            });
          }
        } else {
          // Check if new combination is a subset (all new legs exist in existing, but existing has more)
          const allNewLegsPresent = Array.from(newCombinationLegs).every(legKey => 
            existingCombinationLegs.has(legKey)
          );
          
          if (allNewLegsPresent && newCombinationLegs.size < existingCombinationLegs.size) {
            // New combination is a SUBSET - BLOCK
            console.log('[conflictingBet] ❌ New combination is a subset of existing combination', existingBet._id);
            return res.status(400).json({ 
              success: false, 
              message: 'You already have a pending combination bet that includes these selections.' 
            });
          }
        }
      }
    } else {
      // For single bets, check conflicts with other single bets only
      for (const bet of betsToCheck) {
        const matchId = bet.matchId;
        const marketKey = bet.__marketKey || bet.marketId || (bet.betDetails && bet.betDetails.market_id);
        
        console.log('[conflictingBet] Checking for conflicts with:', { matchId, marketKey });
        // For single bets, check conflicts with other single bets only
        // Allow single bets to coexist with combination bets
        // Use oddId as the primary conflict identifier since it's unique per market+selection
        const existingSingleBet = await Bet.findOne({
          userId,
          matchId,
          status: 'pending',
          // Ensure it's not a combination bet
          $or: [
            { combination: { $exists: false } },
            { combination: { $size: 0 } }
          ],
          // Use oddId as the primary conflict identifier
          oddId: bet.oddId
        });

        if (existingSingleBet) {
          console.log('[conflictingBet] Found conflicting single bet:', existingSingleBet._id);
          return res.status(400).json({ 
            success: false, 
            message: 'You already have a pending bet on this market for this match.' 
          });
        }
      }
    }

    console.log('[conflictingBet] No conflicts found, proceeding with bet placement');
    next();
  } catch (err) {
    console.error('[conflictingBet] Error:', err);
    next(err);
  }
}; 
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectLiveMatchesRaw } from '@/lib/features/matches/liveMatchesSlice';
import { selectBets, updateBetOdds, removeBet } from '@/lib/features/betSlip/betSlipSlice';

/**
 * Custom hook to synchronize odds between live matches and betslip
 * This hook listens for odds updates in the live matches data and updates
 * the corresponding bets in the betslip with the new odds values.
 * 
 * Supports both:
 * - liveOdds (Kambi API format) - for match detail page
 * - matchBetOffers (Unibet betOffers format) - for home page cards
 * 
 * @param {string} matchId - The ID of the match to sync odds for
 * @returns {Object} - Object containing match data and bets count for debugging
 */
export const useLiveOddsSync = (matchId) => {
  const dispatch = useDispatch();
  const liveMatches = useSelector(selectLiveMatchesRaw);
  const matchBetOffers = useSelector(state => state.liveMatches.matchBetOffers);
  const bets = useSelector(selectBets);

  useEffect(() => {
    if (!liveMatches || !Array.isArray(liveMatches) || liveMatches.length === 0) {
      return;
    }

    // Find the specific live match
    const liveMatch = liveMatches.find(match => match.id === matchId);
    if (!liveMatch) {
      return;
    }

    // Create a map of oddId to outcome data for quick lookup
    const oddsMap = new Map();

    // Priority 1: Check mainBetOffer FIRST (latest from live matches API - updated every 200ms!)
    // This has the most current odds and should take precedence
    if (liveMatch.mainBetOffer && liveMatch.mainBetOffer.outcomes) {
      liveMatch.mainBetOffer.outcomes.forEach(outcome => {
        const oddsValue = typeof outcome.odds === 'number' ? 
          (outcome.odds > 1000 ? outcome.odds / 1000 : outcome.odds) : 
          parseFloat(outcome.odds);
        
        // Use outcome.id if available, otherwise outcomeId, or generate one
        const oddId = outcome.id || outcome.outcomeId || `${matchId}_${outcome.label?.toLowerCase() || 'unknown'}`;
        oddsMap.set(oddId, {
          odds: oddsValue,
          status: outcome.status || 'OPEN',
          suspended: outcome.status !== 'OPEN'
        });
      });
    }

    // Priority 2: Check liveOdds (Kambi API format - also updated frequently)
    if (liveMatch.liveOdds && liveMatch.liveOdds.outcomes) {
      liveMatch.liveOdds.outcomes.forEach(outcome => {
        // Convert from Kambi API format (13000 -> 13.00) if needed
        const oddsValue = typeof outcome.odds === 'number' ? 
          (outcome.odds > 1000 ? outcome.odds / 1000 : outcome.odds) : 
          parseFloat(outcome.odds);
        
        // Overwrite if already in map (mainBetOffer takes priority, but liveOdds can update)
        oddsMap.set(outcome.id, {
          odds: oddsValue,
          status: outcome.status,
          suspended: outcome.status !== 'OPEN'
        });
      });
    }

    // Priority 3: Check matchBetOffers (fallback - may be stale, but has more markets)
    // Only add if not already in map (mainBetOffer and liveOdds take priority)
    const betOffers = matchBetOffers[matchId];
    if (betOffers && Array.isArray(betOffers)) {
      betOffers.forEach(offer => {
        if (offer.outcomes && Array.isArray(offer.outcomes)) {
          offer.outcomes.forEach(outcome => {
            // Convert from Unibet format (13000 -> 13.00) if needed
            const oddsValue = typeof outcome.odds === 'number' ? 
              (outcome.odds > 1000 ? outcome.odds / 1000 : outcome.odds) : 
              parseFloat(outcome.odds);
            
            // Only add if not already in map (mainBetOffer and liveOdds take priority)
            if (!oddsMap.has(outcome.id)) {
              oddsMap.set(outcome.id, {
                odds: oddsValue,
                status: outcome.status || 'OPEN',
                suspended: outcome.status !== 'OPEN'
              });
            }
          });
        }
      });
    }

    // If no odds found, skip
    if (oddsMap.size === 0) {
      return;
    }

    console.log(`🔄 [useLiveOddsSync] Syncing odds for live match ${matchId} (${oddsMap.size} outcomes found)`);

    // Check each bet in the betslip and update odds or remove if suspended
    bets.forEach(bet => {
      // Only process bets for the current match
      if (bet.match.id === matchId && bet.oddId) {
        const outcomeData = oddsMap.get(bet.oddId);
        
        if (!outcomeData) {
          // Check if this is a synthetic/fallback oddId (e.g., "1022760294_away_2")
          // Synthetic oddIds follow the pattern: matchId_selection_number
          const isSyntheticOddId = bet.oddId.includes('_') && bet.oddId.startsWith(matchId.toString());
          
          if (isSyntheticOddId) {
            // For synthetic oddIds, try to find the real odds by matching the bet selection
            // Extract selection type from synthetic ID: "1022760294_away_2" -> "away"
            const parts = bet.oddId.split('_');
            const selectionType = parts[parts.length - 2]; // "home", "draw", "away"
            
            // Map selection type to possible outcome labels in the API
            const selectionMap = {
              'home': ['1', 'home'],
              'draw': ['x', 'draw'],
              'away': ['2', 'away']
            };
            
            const possibleLabels = selectionMap[selectionType] || [];
            
            // Try to find matching odds in the oddsMap by checking outcome labels
            let foundRealOdds = null;
            
            // Priority 1: Check mainBetOffer (latest from live matches API - updated every 200ms!)
            // This is what the cards use after transformation - it has the most current odds
            if (liveMatch.mainBetOffer && liveMatch.mainBetOffer.outcomes) {
              const targetLabel = selectionType === 'home' ? '1' : selectionType === 'draw' ? 'x' : '2';
              
              for (const outcome of liveMatch.mainBetOffer.outcomes) {
                const outcomeLabel = outcome.label?.toString().toLowerCase();
                if (outcomeLabel === targetLabel || 
                    (targetLabel === 'x' && outcomeLabel === 'draw') ||
                    (targetLabel === '1' && outcomeLabel === 'home') ||
                    (targetLabel === '2' && outcomeLabel === 'away')) {
                  const oddsValue = typeof outcome.odds === 'number' ? 
                    (outcome.odds > 1000 ? outcome.odds / 1000 : outcome.odds) : 
                    parseFloat(outcome.odds);
                  
                  foundRealOdds = {
                    oddId: outcome.id || outcome.outcomeId || bet.oddId,
                    odds: oddsValue,
                    status: outcome.status || 'OPEN'
                  };
                  break;
                }
              }
            }
            
            // Priority 2: Check liveOdds (Kambi API - also updated frequently)
            if (!foundRealOdds && liveMatch.liveOdds && liveMatch.liveOdds.outcomes) {
              const targetLabel = selectionType === 'home' ? '1' : selectionType === 'draw' ? 'x' : '2';
              
              for (const outcome of liveMatch.liveOdds.outcomes) {
                const outcomeLabel = outcome.label?.toString().toLowerCase();
                if (outcomeLabel === targetLabel || 
                    (targetLabel === 'x' && outcomeLabel === 'draw') ||
                    (targetLabel === '1' && outcomeLabel === 'home') ||
                    (targetLabel === '2' && outcomeLabel === 'away')) {
                  const oddsValue = typeof outcome.odds === 'number' ? 
                    (outcome.odds > 1000 ? outcome.odds / 1000 : outcome.odds) : 
                    parseFloat(outcome.odds);
                  
                  foundRealOdds = {
                    oddId: outcome.id || bet.oddId,
                    odds: oddsValue,
                    status: outcome.status || 'OPEN'
                  };
                  break;
                }
              }
            }
            
            // Priority 2: Fallback to betOffers if liveMatch.odds not available
            if (!foundRealOdds) {
              const betOffers = matchBetOffers[matchId];
              
              if (betOffers && Array.isArray(betOffers)) {
                for (const offer of betOffers) {
                  if (offer.outcomes && Array.isArray(offer.outcomes)) {
                    for (const outcome of offer.outcomes) {
                      const outcomeLabel = outcome.label?.toString().toLowerCase();
                      if (possibleLabels.includes(outcomeLabel)) {
                        foundRealOdds = {
                          oddId: outcome.id,
                          odds: typeof outcome.odds === 'number' ? 
                            (outcome.odds > 1000 ? outcome.odds / 1000 : outcome.odds) : 
                            parseFloat(outcome.odds),
                          status: outcome.status || 'OPEN'
                        };
                        break;
                      }
                    }
                  }
                  if (foundRealOdds) break;
                }
              }
            }
            
            if (foundRealOdds && Math.abs(foundRealOdds.odds - bet.odds) > 0.001) {
              // Found real odds that differ from current bet odds - update it!
              console.log(`🔄 [useLiveOddsSync] Updating synthetic oddId bet ${bet.id}: ${bet.odds} → ${foundRealOdds.odds}`);
              dispatch(updateBetOdds({
                matchId: bet.match.id,
                oddId: bet.oddId, // Keep the synthetic oddId for matching
                newOdds: foundRealOdds.odds
              }));
              return;
            }
            
            // Don't remove bets with synthetic oddIds - they're valid, just using fallback IDs
            console.log(`✅ [useLiveOddsSync] Keeping bet ${bet.id} - using synthetic oddId (valid fallback)`);
            return;
          }
          
          // Outcome no longer exists (real oddId not found), remove the bet
          console.log(`🗑️ [useLiveOddsSync] Removing bet ${bet.id} - outcome no longer exists`);
          dispatch(removeBet(bet.id));
          return;
        }
        
        if (outcomeData.suspended) {
          // Outcome is suspended, remove the bet
          console.log(`⏸️ [useLiveOddsSync] Removing bet ${bet.id} - outcome is suspended`);
          dispatch(removeBet(bet.id));
          return;
        }
        
        // Update odds if they've changed
        const newOdds = outcomeData.odds;
        const currentOdds = bet.odds;
        
        if (Math.abs(newOdds - currentOdds) > 0.001) {
          console.log(`🔄 [useLiveOddsSync] Syncing odds for bet ${bet.id}: ${currentOdds} → ${newOdds}`);
          
          dispatch(updateBetOdds({
            matchId: bet.match.id,
            oddId: bet.oddId,
            newOdds: newOdds
          }));
        }
      }
    });
  }, [liveMatches, matchBetOffers, bets, matchId, dispatch]);

  // Return the current live match data for debugging purposes
  const liveMatch = liveMatches?.find(match => match.id === matchId);
  const betOffers = matchBetOffers[matchId];
  return { 
    liveMatch, 
    betsCount: bets.length,
    hasLiveOdds: liveMatch?.liveOdds?.outcomes?.length > 0,
    hasBetOffers: betOffers && betOffers.length > 0
  };
};

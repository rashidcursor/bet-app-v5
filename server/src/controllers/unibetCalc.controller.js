// Unibet Calculator Processing Controller
// Admin-only endpoints for processing bets using unibet-api calculator

import BetOutcomeCalculator from '../unibet-calc/bet-outcome-calculator.js';
import { BetSchemaAdapter } from '../services/betSchemaAdapter.service.js';
import Bet from '../models/Bet.js';
import User from '../models/User.js';
import financeService from '../services/finance.service.js';

export class UnibetCalcController {
    constructor() {
        this.calculator = new BetOutcomeCalculator(null); // No DB needed for calculator
        this.financeService = financeService;
    }

    // Process all pending bets (batch processing) - includes both single and combination bets
    processAll = async (req, res) => {
        try {
            const { limit = 200, onlyPending = true } = req.body;
            
            console.log(`\n📊 [processAll] ========================================`);
            console.log(`📊 [processAll] STARTING BATCH BET PROCESSING`);
            console.log(`📊 [processAll] ========================================`);
            console.log(`📊 [processAll] Parameters:`);
            console.log(`📊 [processAll]    - Limit: ${limit}`);
            console.log(`📊 [processAll]    - Only Pending: ${onlyPending}`);
            console.log(`📊 [processAll]    - Timestamp: ${new Date().toISOString()}`);
            
            let bets = [];
            
            if (onlyPending) {
                // Remove time-based filtering - we will check match status from Unibet API and FotMob instead
                // This allows us to process bets based on actual match status, not estimated time
                // ✅ FIX: Process pending bets AND combination bets with any pending leg
                // For single bets: status must be 'pending'
                // For combination bets: status is 'pending' OR any leg has status 'pending'
                const query = {
                    $or: [
                        // Single bets: status is pending
                        { 
                            status: 'pending',
                            combination: { $exists: false } // No combination array = single bet
                        },
                        // Combination bets: status is pending
                        { 
                            status: 'pending',
                            combination: { $exists: true, $ne: [] }
                        },
                        // Combination bets: any leg has status 'pending' (even if overall status is won/lost)
                        {
                            combination: { 
                                $exists: true, 
                                $ne: [],
                                $elemMatch: { status: 'pending' }
                            }
                        }
                    ]
                };
                
                console.log(`📊 [processAll] 🔍 Querying database for pending bets and combination bets with pending legs...`);
                console.log(`📊 [processAll]    - Query includes:`);
                console.log(`📊 [processAll]      1. Single bets with status='pending'`);
                console.log(`📊 [processAll]      2. Combination bets with status='pending'`);
                console.log(`📊 [processAll]      3. Combination bets with any leg status='pending' (even if overall status is won/lost)`);
                console.log(`📊 [processAll]    - Sort: { matchDate: 1 }`);
                console.log(`📊 [processAll]    - Limit: ${parseInt(limit)}`);
                
                const queryStartTime = Date.now();
                bets = await Bet.find(query)
                .sort({ matchDate: 1 })
                .limit(parseInt(limit));
                const queryDuration = Date.now() - queryStartTime;
                
                console.log(`📊 [processAll] ✅ Database query completed in ${queryDuration}ms`);
                console.log(`📊 [processAll]    - Found ${bets.length} bets (pending single bets + combination bets with pending legs)`);
                
                if (bets.length > 0) {
                    console.log(`📊 [processAll] 📋 Bet IDs found:`);
                    bets.forEach((bet, index) => {
                        const betType = bet.combination && bet.combination.length > 0 
                            ? `Combination (${bet.combination.length} legs)` 
                            : 'Single';
                        
                        if (bet.combination && bet.combination.length > 0) {
                            // Check for pending legs
                            const pendingLegs = bet.combination.filter(leg => leg.status === 'pending');
                            const pendingLegsCount = pendingLegs.length;
                            
                            if (pendingLegsCount > 0) {
                                console.log(`📊 [processAll]    ${index + 1}. Bet ID: ${bet._id} | Type: ${betType} | Overall Status: ${bet.status} | ⚠️ ${pendingLegsCount} pending leg(s)`);
                                pendingLegs.forEach((leg, legIdx) => {
                                    console.log(`📊 [processAll]         - Pending Leg ${legIdx + 1}: Match ${leg.matchId} | ${leg.betOption} @ ${leg.odds}`);
                                });
                            } else {
                                console.log(`📊 [processAll]    ${index + 1}. Bet ID: ${bet._id} | Type: ${betType} | Status: ${bet.status}`);
                            }
                        } else {
                            console.log(`📊 [processAll]    ${index + 1}. Bet ID: ${bet._id} | Type: ${betType} | Match ID: ${bet.matchId || 'N/A'} | Status: ${bet.status}`);
                        }
                    });
                }
            } else {
                // For non-pending mode, get all bets
                const query = {};
                console.log(`📊 [processAll] 🔍 Querying database for all bets...`);
                bets = await Bet.find(query)
                    .sort({ matchDate: 1 })
                    .limit(parseInt(limit));
                console.log(`📊 [processAll]    - Found ${bets.length} bets`);
            }

            if (bets.length === 0) {
                console.log(`📊 [processAll] ⚠️ No bets found for processing`);
                return res.json({
                    success: true,
                    message: 'No bets found for processing',
                    stats: {
                        total: 0,
                        single: { processed: 0, won: 0, lost: 0, canceled: 0 },
                        combination: { processed: 0, won: 0, lost: 0, canceled: 0 },
                        failed: 0,
                        errors: []
                    }
                });
            }


            const stats = {
                total: bets.length,
                single: {
                    processed: 0,
                    won: 0,
                    lost: 0,
                    canceled: 0
                },
                combination: {
                    processed: 0,
                    won: 0,
                    lost: 0,
                    canceled: 0
                },
                failed: 0,
                errors: []
            };

            const results = [];

            // Process each bet with improved error isolation
            for (let i = 0; i < bets.length; i++) {
                const bet = bets[i];
                const betNumber = i + 1;
                
                try {
                    console.log(`\n🔄 [processAll] ========================================`);
                    console.log(`🔄 [processAll] Processing bet ${betNumber}/${bets.length}`);
                    console.log(`🔄 [processAll] ========================================`);
                    console.log(`🔄 [processAll] Bet ID: ${bet._id}`);
                    console.log(`🔄 [processAll] Bet Type: ${bet.combination && bet.combination.length > 0 ? 'Combination' : 'Single'}`);
                    if (bet.combination && bet.combination.length > 0) {
                        console.log(`🔄 [processAll]    - Legs: ${bet.combination.length}`);
                        bet.combination.forEach((leg, legIndex) => {
                            console.log(`🔄 [processAll]       Leg ${legIndex + 1}: Match ${leg.matchId} | ${leg.betOption} @ ${leg.odds} | Status: ${leg.status || 'pending'}`);
                        });
                    } else {
                        console.log(`🔄 [processAll]    - Match ID: ${bet.matchId}`);
                        console.log(`🔄 [processAll]    - Bet Option: ${bet.betOption}`);
                        console.log(`🔄 [processAll]    - Odds: ${bet.odds}`);
                    }
                    console.log(`🔄 [processAll]    - Stake: ${bet.stake}`);
                    console.log(`🔄 [processAll]    - Current Status: ${bet.status}`);
                    console.log(`🔄 [processAll]    - Created At: ${bet.createdAt}`);
                    console.log(`🔄 [processAll]    - Match Date: ${bet.matchDate}`);
                    console.log(`🔄 [processAll]    - Bet Outcome Check Time: ${bet.betOutcomeCheckTime}`);
                    
                    let result;
                    const processStartTime = Date.now();
                    
                    // Check if it's a combination bet
                    if (bet.combination && bet.combination.length > 0) {
                        console.log(`🔄 [processAll] → Routing to processCombinationBetInternal...`);
                        result = await this.processCombinationBetInternal(bet);
                        stats.combination.processed++;
                        if (result.status === 'won') stats.combination.won++;
                        else if (result.status === 'lost') stats.combination.lost++;
                        else if (result.status === 'canceled' || result.status === 'cancelled') stats.combination.canceled++;
                    } else {
                        console.log(`🔄 [processAll] → Routing to processSingleBet...`);
                        result = await this.processSingleBet(bet);
                        stats.single.processed++;
                        if (result.status === 'won') stats.single.won++;
                        else if (result.status === 'lost') stats.single.lost++;
                        else if (result.status === 'canceled' || result.status === 'cancelled') stats.single.canceled++;
                    }
                    
                    const processDuration = Date.now() - processStartTime;
                    
                    console.log(`✅ [processAll] Bet ${betNumber} processed in ${processDuration}ms`);
                    console.log(`✅ [processAll]    - Final Status: ${result.status}`);
                    console.log(`✅ [processAll]    - Payout: ${result.payout}`);
                    console.log(`✅ [processAll]    - Reason: ${result.reason || 'No reason provided'}`);
                    if (result.debugInfo && Object.keys(result.debugInfo).length > 0) {
                        console.log(`✅ [processAll]    - Debug Info: ${JSON.stringify(result.debugInfo, null, 2)}`);
                    }
                    
                    // ✅ NEW: If bet became cancelled, decrement maxRetryCount
                    if (result.status === 'cancelled' || result.status === 'canceled') {
                        try {
                            const updatedBet = await Bet.findById(bet._id);
                            if (updatedBet && updatedBet.maxRetryCount > 0) {
                                await Bet.findByIdAndUpdate(bet._id, {
                                    $inc: { maxRetryCount: -1 },
                                    $set: { retryCount: updatedBet.maxRetryCount - 1 }
                                });
                                console.log(`✅ [processAll]    - Decremented maxRetryCount: ${updatedBet.maxRetryCount} → ${updatedBet.maxRetryCount - 1}`);
                            }
                        } catch (retryError) {
                            console.warn(`⚠️ [processAll] Failed to update retry count: ${retryError.message}`);
                        }
                    }
                    
                    results.push(result);
                    
                    // ✅ NEW: Add 10 second delay before processing next bet (except for last bet)
                    if (i < bets.length - 1) {
                        console.log(`⏳ [processAll] Waiting 10 seconds before processing next bet...`);
                        await new Promise(resolve => setTimeout(resolve, 10 * 1000)); // 10 second delay
                    }
                    
                } catch (error) {
                    console.error(`\n❌ [processAll] ========================================`);
                    console.error(`❌ [processAll] ERROR processing bet ${betNumber}/${bets.length}`);
                    console.error(`❌ [processAll] ========================================`);
                    console.error(`❌ [processAll] Bet ID: ${bet._id}`);
                    console.error(`❌ [processAll] Error Message: ${error.message}`);
                    console.error(`❌ [processAll] Error Stack: ${error.stack}`);
                    console.error(`❌ [processAll] ========================================`);
                    
                    stats.failed++;
                    stats.errors.push({
                        betId: bet._id,
                        betType: bet.combination && bet.combination.length > 0 ? 'combination' : 'single',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Continue processing other bets even if one fails
                    console.log(`⚠️ [processAll] Continuing with next bet despite error...`);
                }
            }

            console.log(`\n📊 [processAll] ========================================`);
            console.log(`📊 [processAll] BATCH PROCESSING COMPLETED`);
            console.log(`📊 [processAll] ========================================`);
            console.log(`📊 [processAll] Summary:`);
            console.log(`📊 [processAll]    - Total: ${stats.total}`);
            console.log(`📊 [processAll]    - Single: ${stats.single.processed} processed (${stats.single.won} won, ${stats.single.lost} lost, ${stats.single.canceled} canceled)`);
            console.log(`📊 [processAll]    - Combination: ${stats.combination.processed} processed (${stats.combination.won} won, ${stats.combination.lost} lost, ${stats.combination.canceled} canceled)`);
            console.log(`📊 [processAll]    - Failed: ${stats.failed}`);
            if (stats.errors.length > 0) {
                console.log(`📊 [processAll]    - Errors: ${stats.errors.length}`);
                stats.errors.forEach((err, index) => {
                    console.log(`📊 [processAll]       ${index + 1}. Bet ${err.betId} (${err.betType}): ${err.error}`);
                });
            }
            console.log(`📊 [processAll] ========================================\n`);


            res.json({
                success: true,
                message: `Processed ${stats.single.processed + stats.combination.processed} out of ${stats.total} bets (${stats.single.processed} single, ${stats.combination.processed} combination)`,
                stats: stats,
                results: results.slice(0, 10) // Return first 10 results for review
            });

        } catch (error) {
            console.error(`\n❌ [processAll] ========================================`);
            console.error(`❌ [processAll] FATAL ERROR in batch processing`);
            console.error(`❌ [processAll] ========================================`);
            console.error(`❌ [processAll] Error: ${error.message}`);
            console.error(`❌ [processAll] Stack: ${error.stack}`);
            console.error(`❌ [processAll] ========================================\n`);
            
            res.status(500).json({
                success: false,
                message: 'Failed to process bets',
                error: error.message
            });
        }
    };

    // Process single bet
    processOne = async (req, res) => {
        try {
            const { betId } = req.params;
            
            console.log(`Processing single bet: ${betId}`);

            const bet = await Bet.findById(betId);
            if (!bet) {
                return res.status(404).json({
                    success: false,
                    message: 'Bet not found'
                });
            }

            const result = await this.processSingleBet(bet);

            res.json({
                success: true,
                message: 'Bet processed successfully',
                result: result
            });

        } catch (error) {
            console.error('Error processing single bet:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process bet',
                error: error.message
            });
        }
    };

    // Process single bet with known match ID
    processWithMatch = async (req, res) => {
        try {
            const { betId, matchId } = req.params;
            
            console.log(`Processing bet ${betId} with match ${matchId}`);

            const bet = await Bet.findById(betId);
            if (!bet) {
                return res.status(404).json({
                    success: false,
                    message: 'Bet not found'
                });
            }

            const result = await this.processSingleBetWithMatch(bet, matchId);

            res.json({
                success: true,
                message: 'Bet processed with match successfully',
                result: result
            });

        } catch (error) {
            console.error('Error processing bet with match:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process bet with match',
                error: error.message
            });
        }
    };

    // Internal method to process a single bet
    async processSingleBet(bet) {
        try {
            console.log(`\n🔍 [processSingleBet] ========================================`);
            console.log(`🔍 [processSingleBet] Processing bet ${bet._id}`);
            console.log(`🔍 [processSingleBet] ========================================`);
            console.log(`🔍 [processSingleBet] Bet Details:`);
            console.log(`🔍 [processSingleBet]    - Match ID: ${bet.matchId}`);
            console.log(`🔍 [processSingleBet]    - Odd ID: ${bet.oddId}`);
            console.log(`🔍 [processSingleBet]    - Bet Option: ${bet.betOption}`);
            console.log(`🔍 [processSingleBet]    - Odds: ${bet.odds}`);
            console.log(`🔍 [processSingleBet]    - Stake: ${bet.stake}`);
            console.log(`🔍 [processSingleBet]    - Status: ${bet.status}`);
            console.log(`🔍 [processSingleBet]    - Inplay: ${bet.inplay || false}`);
            console.log(`🔍 [processSingleBet]    - Match Date: ${bet.matchDate}`);
            console.log(`🔍 [processSingleBet]    - Bet Outcome Check Time: ${bet.betOutcomeCheckTime}`);
            
            // Validate bet for calculator
            const validation = BetSchemaAdapter.validateBetForCalculator(bet);
            if (!validation.isValid) {
                console.error(`❌ [processSingleBet] Bet validation failed:`, validation.errors);
                throw new Error(`Bet validation failed: ${validation.errors.join(', ')}`);
            }
            console.log(`✅ [processSingleBet] Bet validation passed`);

            // Adapt bet for calculator
            const adaptedBet = BetSchemaAdapter.adaptBetForCalculator(bet);
            
            console.log(`🔍 [processSingleBet] Adapted bet for calculator:`);
            console.log(`🔍 [processSingleBet]    - Event ID: ${adaptedBet.eventId}`);
            console.log(`🔍 [processSingleBet]    - Market Name: ${adaptedBet.marketName}`);
            console.log(`🔍 [processSingleBet]    - Outcome Label: ${adaptedBet.outcomeLabel}`);
            console.log(`🔍 [processSingleBet] Processing bet ${bet._id}: ${adaptedBet.marketName} - ${adaptedBet.outcomeLabel}`);

            // Process with calculator (calculator already updates the database)
            console.log(`🔍 [processSingleBet] Calling calculator.processBetWithMatchId...`);
            const calculatorResult = await this.calculator.processBetWithMatchId(adaptedBet, adaptedBet.eventId);
            
            console.log(`🔍 [processSingleBet] Calculator result:`, {
                success: calculatorResult.success,
                status: calculatorResult.outcome?.status,
                payout: calculatorResult.outcome?.payout,
                reason: calculatorResult.outcome?.reason,
                error: calculatorResult.error
            });
            
            // Check if calculator validation failed
            if (!calculatorResult.success) {
                console.error(`❌ [processSingleBet] Calculator validation failed: ${calculatorResult.error}`);
                console.error(`❌ [processSingleBet] Cancelling bet ${bet._id} due to validation failure`);
                
                // Cancel the bet due to validation failure
                await this.cancelBet(bet._id, calculatorResult.error);
                
                return {
                    betId: bet._id,
                    status: 'cancelled',
                    payout: 0,
                    reason: `Validation failed: ${calculatorResult.error}`,
                    processedAt: new Date(),
                    debugInfo: {
                        validationError: calculatorResult.error,
                        adaptedBet: adaptedBet
                    }
                };
            }
            
            console.log(`✅ [processSingleBet] Bet ${bet._id} processed successfully: ${calculatorResult.outcome?.status}`);
            
            // No need to update database again - calculator already did it
            // The calculator handles the database update with proper transaction and write concern
            // NOTE: Calculator already updates user balance in processBet method, so we don't update it again here
            // to avoid double balance updates

            return {
                betId: bet._id,
                status: calculatorResult.outcome?.status || 'pending',
                payout: calculatorResult.outcome?.payout || 0,
                reason: calculatorResult.outcome?.reason || 'Processing completed',
                processedAt: new Date(),
                debugInfo: calculatorResult.debugInfo || {}
            };

        } catch (error) {
            console.error(`❌ [processSingleBet] Error processing bet ${bet._id}:`, error);
            console.error(`❌ [processSingleBet] Error message:`, error.message);
            console.error(`❌ [processSingleBet] Error stack:`, error.stack);
            
            // Update bet with error status
            await Bet.findByIdAndUpdate(bet._id, {
                status: 'error',
                result: {
                    status: 'error',
                    reason: error.message,
                    processedAt: new Date(),
                    error: true
                },
                updatedAt: new Date()
            });

            throw error;
        }
    }

    // Helper method to cancel a bet
    async cancelBet(betId, reason) {
        try {
            console.log(`\n🚫 [cancelBet] ========================================`);
            console.log(`🚫 [cancelBet] Cancelling bet ${betId}`);
            console.log(`🚫 [cancelBet] Reason: ${reason}`);
            console.log(`🚫 [cancelBet] ========================================`);
            
            // Fetch bet first to get details
            const bet = await Bet.findById(betId);
            if (!bet) {
                console.error(`❌ [cancelBet] Bet ${betId} not found`);
                return null;
            }
            
            console.log(`🚫 [cancelBet] Bet details before cancellation:`);
            console.log(`🚫 [cancelBet]    - Match ID: ${bet.matchId}`);
            console.log(`🚫 [cancelBet]    - Stake: ${bet.stake}`);
            console.log(`🚫 [cancelBet]    - User ID: ${bet.userId}`);
            console.log(`🚫 [cancelBet]    - Current Status: ${bet.status}`);
            if (bet.combination && bet.combination.length > 0) {
                console.log(`🚫 [cancelBet]    - Type: Combination bet with ${bet.combination.length} legs`);
            } else {
                console.log(`🚫 [cancelBet]    - Type: Single bet`);
            }
            
            // Update bet status to cancelled
            // ✅ FIX: Preserve existing result fields and add cancellation reason
            const existingBet = await Bet.findById(betId);
            const existingResult = existingBet?.result || {};
            
            const updatedBet = await Bet.findByIdAndUpdate(
                betId,
                {
                        status: 'cancelled',
                        payout: 0,
                    profit: 0,
                    $set: {
                        'result.actualOutcome': existingResult.actualOutcome || null,
                        'result.finalScore': existingResult.finalScore || null,
                        'result.fotmobMatchId': existingResult.fotmobMatchId || null,
                        'result.status': 'cancelled',
                        'result.payout': 0,
                        'result.reason': reason || existingResult.reason || 'Bet cancelled due to validation failure or processing error',
                        'result.processedAt': new Date(),
                        'result.similarity': existingResult.similarity || null
                    }
                },
                { new: true }
            );

            if (updatedBet) {
                console.log(`✅ [cancelBet] Bet ${betId} status updated to cancelled`);
                
                // Refund the stake to user's balance
                const userUpdate = await User.findByIdAndUpdate(
                    updatedBet.userId,
                    { $inc: { balance: updatedBet.stake } },
                    { new: true }
                );
                
                if (userUpdate) {
                    console.log(`✅ [cancelBet] Stake ${updatedBet.stake} refunded to user ${updatedBet.userId}`);
                    console.log(`✅ [cancelBet] User new balance: ${userUpdate.balance}`);
                } else {
                    console.error(`❌ [cancelBet] Failed to update user balance`);
                }
                
                console.log(`✅ [cancelBet] Bet ${betId} cancelled and stake refunded`);
            } else {
                console.error(`❌ [cancelBet] Failed to update bet status`);
            }

            return updatedBet;
        } catch (error) {
            console.error(`❌ [cancelBet] Error cancelling bet ${betId}:`, error);
            console.error(`❌ [cancelBet] Error message:`, error.message);
            console.error(`❌ [cancelBet] Error stack:`, error.stack);
            throw error;
        }
    }

    // Internal method to process bet with known match ID
    async processSingleBetWithMatch(bet, matchId) {
        try {
            // Validate bet for calculator
            const validation = BetSchemaAdapter.validateBetForCalculator(bet);
            if (!validation.isValid) {
                throw new Error(`Bet validation failed: ${validation.errors.join(', ')}`);
            }

            // Adapt bet for calculator
            const adaptedBet = BetSchemaAdapter.adaptBetForCalculator(bet);
            
            console.log(`Processing bet ${bet._id} with match ${matchId}: ${adaptedBet.marketName} - ${adaptedBet.outcomeLabel}`);

            // Process with calculator using specific match ID
            const calculatorResult = await this.calculator.processBetWithMatchId(adaptedBet, matchId);
            
            // Adapt result back to bet-app format
            const updatedBet = BetSchemaAdapter.adaptCalculatorResult(calculatorResult, bet);
            
            // Update bet in database
            const savedBet = await Bet.findByIdAndUpdate(
                bet._id,
                updatedBet,
                { new: true }
            );

            // NOTE: Calculator already updates user balance in processBet method, so we don't update it again here
            // to avoid double balance updates

            return {
                betId: bet._id,
                matchId: matchId,
                status: calculatorResult.status,
                payout: calculatorResult.payout,
                reason: calculatorResult.reason,
                processedAt: new Date(),
                debugInfo: calculatorResult.debugInfo || {}
            };

        } catch (error) {
            console.error(`Error processing bet ${bet._id} with match ${matchId}:`, error);
            
            // Update bet with error status
            await Bet.findByIdAndUpdate(bet._id, {
                status: 'error',
                result: {
                    status: 'error',
                    reason: error.message,
                    processedAt: new Date(),
                    error: true,
                    matchId: matchId
                },
                updatedAt: new Date()
            });

            throw error;
        }
    }

    // Update user balance based on bet result
    async updateUserBalance(userId, calculatorResult) {
        try {
            if (!userId) {
                console.warn('No userId provided for balance update');
                return;
            }

            const user = await User.findById(userId);
            if (!user) {
                console.warn(`User ${userId} not found for balance update`);
                return;
            }

            let balanceChange = 0;
            let transactionType = '';

            if (calculatorResult.status === 'won') {
                balanceChange = calculatorResult.payout || 0;
                transactionType = 'bet_win';
            } else if (calculatorResult.status === 'lost') {
                // Balance was already deducted when bet was placed
                balanceChange = 0;
                transactionType = 'bet_loss';
            } else if (calculatorResult.status === 'canceled' || calculatorResult.status === 'cancelled') {
                // Refund the stake
                balanceChange = calculatorResult.stake || 0;
                transactionType = 'bet_cancel';
            }

            if (balanceChange !== 0) {
                // Update user balance directly using User model (same approach as combination bet)
                const updateResult = await User.findByIdAndUpdate(userId, {
                    $inc: { balance: balanceChange }
                });
                
                if (updateResult) {
                    console.log(`Updated balance for user ${userId}: ${balanceChange > 0 ? '+' : ''}${balanceChange}`);
                } else {
                    console.error(`Failed to update balance - user not found: ${userId}`);
                }
            }

        } catch (error) {
            console.error(`Error updating balance for user ${userId}:`, error);
            // Don't throw error here as it would fail the entire bet processing
        }
    }

    // Process combination bet using calculator
    processCombinationBet = async (req, res) => {
        try {
            const { betId } = req.params;
            
            console.log(`Processing combination bet: ${betId}`);

            const bet = await Bet.findById(betId);
            if (!bet) {
                return res.status(404).json({
                    success: false,
                    message: 'Bet not found'
                });
            }

            if (!bet.combination || bet.combination.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Not a combination bet'
                });
            }

            const result = await this.processCombinationBetInternal(bet);

            res.json({
                success: true,
                message: 'Combination bet processed successfully',
                result: result
            });

        } catch (error) {
            console.error('Error processing combination bet:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process combination bet',
                error: error.message
            });
        }
    };

    // Process all pending combination bets
    processAllCombinations = async (req, res) => {
        try {
            const { limit = 50 } = req.body;
            
            console.log(`Processing all pending combination bets: limit=${limit}`);

            const pendingCombinationBets = await Bet.find({
                status: 'pending',
                combination: { $exists: true, $ne: [] }
            })
            .sort({ matchDate: 1 })
            .limit(parseInt(limit));

            if (pendingCombinationBets.length === 0) {
                return res.json({
                    success: true,
                    message: 'No pending combination bets found',
                    stats: {
                        total: 0,
                        processed: 0,
                        failed: 0,
                        won: 0,
                        lost: 0,
                        canceled: 0
                    }
                });
            }

            console.log(`Found ${pendingCombinationBets.length} combination bets to process`);

            const stats = {
                total: pendingCombinationBets.length,
                processed: 0,
                failed: 0,
                won: 0,
                lost: 0,
                canceled: 0,
                errors: []
            };

            const results = [];

            // Process each combination bet
            for (const bet of pendingCombinationBets) {
                try {
                    const result = await this.processCombinationBetInternal(bet);
                    results.push(result);
                    
                    stats.processed++;
                    if (result.status === 'won') stats.won++;
                    else if (result.status === 'lost') stats.lost++;
                    else if (result.status === 'canceled') stats.canceled++;
                    
                } catch (error) {
                    console.error(`Error processing combination bet ${bet._id}:`, error);
                    stats.failed++;
                    stats.errors.push({
                        betId: bet._id,
                        error: error.message
                    });
                }
            }

            console.log(`Combination bet batch processing completed:`, stats);

            res.json({
                success: true,
                message: `Processed ${stats.processed} out of ${stats.total} combination bets`,
                stats: stats,
                results: results.slice(0, 10) // Return first 10 results for review
            });

        } catch (error) {
            console.error('Error in combination bet batch processing:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process combination bets',
                error: error.message
            });
        }
    };

    // Internal method to process a combination bet
    async processCombinationBetInternal(bet) {
        try {
            console.log(`\n🔍 [processCombinationBetInternal] ========================================`);
            console.log(`🔍 [processCombinationBetInternal] Processing combination bet ${bet._id}`);
            console.log(`🔍 [processCombinationBetInternal] ========================================`);
            console.log(`🔍 [processCombinationBetInternal] Bet Details:`);
            console.log(`🔍 [processCombinationBetInternal]    - Total Legs: ${bet.combination?.length || 0}`);
            console.log(`🔍 [processCombinationBetInternal]    - Stake: ${bet.stake}`);
            console.log(`🔍 [processCombinationBetInternal]    - Total Odds: ${bet.totalOdds || bet.odds}`);
            console.log(`🔍 [processCombinationBetInternal]    - Status: ${bet.status}`);
            console.log(`🔍 [processCombinationBetInternal]    - Match Date: ${bet.matchDate}`);
            console.log(`🔍 [processCombinationBetInternal]    - Bet Outcome Check Time: ${bet.betOutcomeCheckTime}`);
            
            // Log each leg
            if (bet.combination && bet.combination.length > 0) {
                console.log(`🔍 [processCombinationBetInternal] Legs:`);
                bet.combination.forEach((leg, index) => {
                    console.log(`🔍 [processCombinationBetInternal]    Leg ${index + 1}:`);
                    console.log(`🔍 [processCombinationBetInternal]       - Match ID: ${leg.matchId}`);
                    console.log(`🔍 [processCombinationBetInternal]       - Odd ID: ${leg.oddId}`);
                    console.log(`🔍 [processCombinationBetInternal]       - Bet Option: ${leg.betOption}`);
                    console.log(`🔍 [processCombinationBetInternal]       - Odds: ${leg.odds}`);
                    console.log(`🔍 [processCombinationBetInternal]       - Status: ${leg.status || 'pending'}`);
                    console.log(`🔍 [processCombinationBetInternal]       - Inplay: ${leg.inplay || false}`);
                });
            }
            
            // Validate combination bet for calculator
            const validation = BetSchemaAdapter.validateCombinationBetForCalculator(bet);
            if (!validation.isValid) {
                console.error(`❌ [processCombinationBetInternal] Combination bet validation failed:`, validation.errors);
                throw new Error(`Combination bet validation failed: ${validation.errors.join(', ')}`);
            }
            console.log(`✅ [processCombinationBetInternal] Combination bet validation passed`);

            // Adapt combination bet for calculator (returns array of calculator bets)
            const calculatorBets = await BetSchemaAdapter.adaptCombinationBetForCalculator(bet);
            console.log(`🔍 [processCombinationBetInternal] Adapted ${calculatorBets.length} legs for calculator`);

            // Process each leg through calculator
            const results = [];
            for (let i = 0; i < calculatorBets.length; i++) {
                const calculatorBet = calculatorBets[i];
                const leg = bet.combination[i];
                
                console.log(`\n🔍 [processCombinationBetInternal] ========================================`);
                console.log(`🔍 [processCombinationBetInternal] Processing leg ${i + 1}/${calculatorBets.length}`);
                console.log(`🔍 [processCombinationBetInternal] ========================================`);
                console.log(`🔍 [processCombinationBetInternal] Leg Details:`);
                console.log(`🔍 [processCombinationBetInternal]    - Match ID: ${leg.matchId}`);
                console.log(`🔍 [processCombinationBetInternal]    - Current Status: ${leg.status}`);
                console.log(`🔍 [processCombinationBetInternal]    - Bet Option: ${leg.betOption}`);
                
                // ✅ FIX: Skip legs that are already finalized (won/lost/canceled)
                // Only process legs that are still pending
                const isFinalStatus = leg.status === 'won' || leg.status === 'lost' || 
                                     leg.status === 'canceled' || leg.status === 'cancelled' || 
                                     leg.status === 'void';
                
                if (isFinalStatus) {
                    console.log(`⏭️ [processCombinationBetInternal] Leg ${i + 1} already finalized with status: ${leg.status}`);
                    
                    // ✅ FIX: Check if reason is generic - if so, try to get detailed reason from calculator
                    const existingReason = leg.result?.reason || '';
                    const isGenericReason = existingReason.includes('canceled for') && 
                                           !existingReason.includes(':') && 
                                           !existingReason.includes('NO_SUITABLE_MATCH') &&
                                           !existingReason.includes('FOTMOB_DATA_UNAVAILABLE') &&
                                           !existingReason.includes('LEAGUE_MAPPING_NOT_FOUND');
                    
                    if (isGenericReason && (leg.status === 'canceled' || leg.status === 'cancelled')) {
                        console.log(`🔍 [processCombinationBetInternal] Leg ${i + 1} has generic cancellation reason - attempting to get detailed reason from calculator`);
                        try {
                            // Try to get detailed cancellation reason from calculator (won't change status, just get reason)
                            const calculatorResult = await this.calculator.processBetWithMatchId(calculatorBet, calculatorBet.eventId, false);
                            
                            if (calculatorResult.outcome?.reason && calculatorResult.outcome.reason !== existingReason) {
                                console.log(`✅ [processCombinationBetInternal] Got detailed reason for leg ${i + 1}: ${calculatorResult.outcome.reason}`);
                                results.push({
                                    status: leg.status, // Keep existing status
                                    payout: leg.payout || 0,
                                    reason: calculatorResult.outcome.reason, // Use detailed reason
                                    odds: leg.odds,
                                    debugInfo: calculatorResult.debugInfo || leg.result?.debugInfo || {}
                                });
                            } else {
                                // Use existing reason if calculator didn't provide better one
                                results.push({
                                    status: leg.status,
                                    payout: leg.payout || 0,
                                    reason: existingReason || `${leg.betOption} - ${leg.status}`,
                                    odds: leg.odds,
                                    debugInfo: leg.result?.debugInfo || {}
                                });
                            }
                        } catch (error) {
                            console.warn(`⚠️ [processCombinationBetInternal] Could not get detailed reason for leg ${i + 1}: ${error.message}`);
                            // Use existing reason on error
                            results.push({
                                status: leg.status,
                                payout: leg.payout || 0,
                                reason: existingReason || `${leg.betOption} - ${leg.status}`,
                                odds: leg.odds,
                                debugInfo: leg.result?.debugInfo || {}
                            });
                        }
                    } else {
                        // Use existing leg status and result (reason is already detailed or not canceled)
                        results.push({
                            status: leg.status,
                            payout: leg.payout || 0,
                            reason: existingReason || `${leg.betOption} - ${leg.status}`,
                            odds: leg.odds,
                            debugInfo: leg.result?.debugInfo || {}
                        });
                    }
                    continue; // Skip to next leg
                }
                
                console.log(`🔍 [processCombinationBetInternal]    - Event ID: ${calculatorBet.eventId}`);
                console.log(`🔍 [processCombinationBetInternal]    - Odds: ${leg.odds}`);
                console.log(`🔍 [processCombinationBetInternal]    - Market: ${calculatorBet.marketName}`);
                console.log(`🔍 [processCombinationBetInternal]    - Outcome: ${calculatorBet.outcomeLabel}`);
                
                try {
                    // Process leg through calculator (don't update database for combination bet legs)
                    console.log(`🔍 [processCombinationBetInternal] Calling calculator.processBetWithMatchId for leg ${i + 1}...`);
                    const calculatorResult = await this.calculator.processBetWithMatchId(calculatorBet, calculatorBet.eventId, false);
                    
                    console.log(`🔍 [processCombinationBetInternal] Leg ${i + 1} calculator result:`, {
                        success: calculatorResult.success,
                        status: calculatorResult.outcome?.status,
                        payout: calculatorResult.outcome?.payout,
                        reason: calculatorResult.outcome?.reason,
                        error: calculatorResult.error,
                        debugInfo: calculatorResult.debugInfo
                    });
                    
                    // Extract outcome from calculator result
                    const legResult = {
                        status: calculatorResult.outcome?.status || 'pending',
                        payout: calculatorResult.outcome?.payout || 0,
                        reason: calculatorResult.outcome?.reason || 'Leg processed',
                        odds: leg.odds, // Include odds for payout calculation
                        debugInfo: calculatorResult.debugInfo || {}
                    };
                    
                    results.push(legResult);
                    
                    console.log(`✅ [processCombinationBetInternal] Leg ${i + 1} result: ${legResult.status} (payout: ${legResult.payout})`);
                    if (calculatorResult.error) {
                        console.error(`❌ [processCombinationBetInternal] Leg ${i + 1} error: ${calculatorResult.error}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ [processCombinationBetInternal] Error processing leg ${i + 1}:`, error);
                    console.error(`❌ [processCombinationBetInternal] Error message:`, error.message);
                    console.error(`❌ [processCombinationBetInternal] Error stack:`, error.stack);
                    
                    // Add error result for this leg
                    results.push({
                        status: 'error',
                        payout: 0,
                        reason: `Leg processing failed: ${error.message}`,
                        debugInfo: { error: error.message, stack: error.stack }
                    });
                }
            }
            
            console.log(`\n🔍 [processCombinationBetInternal] All legs processed. Results summary:`);
            results.forEach((result, index) => {
                console.log(`🔍 [processCombinationBetInternal]    Leg ${index + 1}: ${result.status} - ${result.reason}`);
            });
            
            // Adapt results back to bet-app format
            const updatedBet = BetSchemaAdapter.adaptCombinationCalculatorResult(results, bet);

            console.log(`🔍 [processCombinationBetInternal] Updated bet status: ${updatedBet.status}`);
            console.log(`🔍 [processCombinationBetInternal] Updated bet payout: ${updatedBet.payout}`);
            console.log(`🔍 [processCombinationBetInternal] Result summary:`, {
                wonLegs: updatedBet.result.wonLegs,
                lostLegs: updatedBet.result.lostLegs,
                canceledLegs: updatedBet.result.canceledLegs,
                pendingLegs: updatedBet.result.pendingLegs
            });
            
            // ✅ CRITICAL FIX: Check if any leg is still pending - cannot finalize bet status if any leg is pending
            const hasPendingLegs = updatedBet.combination.some(leg => leg.status === 'pending');
            if (hasPendingLegs) {
                console.log(`⏳ [processCombinationBetInternal] ⚠️ CRITICAL: Cannot finalize combination bet - ${updatedBet.result.pendingLegs} leg(s) still pending`);
                console.log(`⏳ [processCombinationBetInternal]    - Pending legs:`, updatedBet.combination
                    .map((leg, idx) => leg.status === 'pending' ? `Leg ${idx + 1} (${leg.betOption})` : null)
                    .filter(Boolean)
                );
                // Force status to pending if any leg is pending
                updatedBet.status = 'pending';
                updatedBet.result.status = 'pending';
                updatedBet.payout = 0; // No payout until all legs are finalized
                console.log(`⏳ [processCombinationBetInternal]    - Forced bet status to 'pending' until all legs are finalized`);
            }
            
            // Update bet in database with main fields first
            // ✅ FIX: Explicitly set result.reason and all result fields to ensure they're saved
            const mainReasonToSave = updatedBet.result.reason || 'No reason provided';
            console.log(`\n💾 [processCombinationBetInternal] Saving main combination bet to database:`);
            console.log(`💾 [processCombinationBetInternal]    - Status: ${updatedBet.status}`);
            console.log(`💾 [processCombinationBetInternal]    - Payout: ${updatedBet.payout}`);
            console.log(`💾 [processCombinationBetInternal]    - Reason: ${mainReasonToSave}`);
            console.log(`💾 [processCombinationBetInternal]    - Reason length: ${mainReasonToSave.length} characters`);
            console.log(`💾 [processCombinationBetInternal]    - Legs: ${updatedBet.result.legs} (${updatedBet.result.wonLegs} won, ${updatedBet.result.lostLegs} lost, ${updatedBet.result.canceledLegs} canceled, ${updatedBet.result.pendingLegs} pending)`);
            
            const savedBet = await Bet.findByIdAndUpdate(
                bet._id,
                { 
                    $set: {
                        status: updatedBet.status,
                        payout: updatedBet.payout,
                        'result.status': updatedBet.result.status,
                        'result.payout': updatedBet.result.payout,
                        'result.reason': mainReasonToSave,
                        'result.processedAt': updatedBet.result.processedAt || new Date(),
                        'result.legs': updatedBet.result.legs,
                        'result.wonLegs': updatedBet.result.wonLegs,
                        'result.lostLegs': updatedBet.result.lostLegs,
                        'result.canceledLegs': updatedBet.result.canceledLegs,
                        'result.pendingLegs': updatedBet.result.pendingLegs,
                        updatedAt: new Date()
                    }
                },
                { new: true, runValidators: true }
            );

            if (!savedBet) {
                console.error(`❌ [processCombinationBetInternal] Failed to update bet in database`);
            } else {
                console.log(`✅ [processCombinationBetInternal] Main bet saved successfully`);
                console.log(`✅ [processCombinationBetInternal]    - Saved reason: ${savedBet.result?.reason || 'NOT SAVED!'}`);
                console.log(`✅ [processCombinationBetInternal]    - Reason matches? ${savedBet.result?.reason === mainReasonToSave}`);
                
                if (savedBet.result?.reason !== mainReasonToSave) {
                    console.error(`❌ [processCombinationBetInternal] WARNING: Main bet reason mismatch!`);
                    console.error(`❌ [processCombinationBetInternal]    - Expected: ${mainReasonToSave}`);
                    console.error(`❌ [processCombinationBetInternal]    - Actual: ${savedBet.result?.reason || 'NULL'}`);
                }
            }
            
            // Update combination array elements individually using array index notation
            // ✅ FIX: Ensure all result fields including reason are saved
            for (let i = 0; i < updatedBet.combination.length; i++) {
                const leg = updatedBet.combination[i];
                const legResult = leg.result || {};
                
                // ✅ ENHANCED: Log the exact reason being saved
                const reasonToSave = legResult.reason || `Leg ${i + 1}: ${leg.betOption} - ${leg.status}`;
                
                console.log(`\n💾 [processCombinationBetInternal] Saving leg ${i + 1} to database:`);
                console.log(`💾 [processCombinationBetInternal]    - Match ID: ${leg.matchId}`);
                console.log(`💾 [processCombinationBetInternal]    - Bet Option: ${leg.betOption}`);
                console.log(`💾 [processCombinationBetInternal]    - Status: ${leg.status}`);
                console.log(`💾 [processCombinationBetInternal]    - Payout: ${leg.payout || 0}`);
                console.log(`💾 [processCombinationBetInternal]    - Reason: ${reasonToSave}`);
                console.log(`💾 [processCombinationBetInternal]    - Reason length: ${reasonToSave.length} characters`);
                console.log(`💾 [processCombinationBetInternal]    - Is generic? ${reasonToSave.includes('canceled for') && !reasonToSave.includes(':') && !reasonToSave.includes('NO_SUITABLE_MATCH') && !reasonToSave.includes('FOTMOB_DATA_UNAVAILABLE') && !reasonToSave.includes('LEAGUE_MAPPING_NOT_FOUND')}`);
                
                const updateResult = await Bet.findByIdAndUpdate(
                    bet._id,
                    { 
                        $set: {
                            [`combination.${i}.status`]: leg.status,
                            [`combination.${i}.payout`]: leg.payout,
                            [`combination.${i}.result.status`]: legResult.status || leg.status,
                            [`combination.${i}.result.payout`]: legResult.payout || leg.payout,
                            [`combination.${i}.result.reason`]: reasonToSave,
                            [`combination.${i}.result.processedAt`]: legResult.processedAt || new Date(),
                            [`combination.${i}.result.actualOutcome`]: legResult.actualOutcome || null,
                            [`combination.${i}.result.finalScore`]: legResult.finalScore || null,
                            [`combination.${i}.result.fotmobMatchId`]: legResult.fotmobMatchId || null
                        }
                    },
                    { new: true, runValidators: true }
                );
                
                if (updateResult) {
                    // Verify the reason was actually saved
                    const verifyLeg = updateResult.combination[i];
                    console.log(`✅ [processCombinationBetInternal] Leg ${i + 1} saved successfully`);
                    console.log(`✅ [processCombinationBetInternal]    - Saved reason: ${verifyLeg.result?.reason || 'NOT SAVED!'}`);
                    console.log(`✅ [processCombinationBetInternal]    - Reason matches? ${verifyLeg.result?.reason === reasonToSave}`);
                    
                    if (verifyLeg.result?.reason !== reasonToSave) {
                        console.error(`❌ [processCombinationBetInternal] WARNING: Leg ${i + 1} reason mismatch!`);
                        console.error(`❌ [processCombinationBetInternal]    - Expected: ${reasonToSave}`);
                        console.error(`❌ [processCombinationBetInternal]    - Actual: ${verifyLeg.result?.reason || 'NULL'}`);
                    }
                } else {
                    console.error(`❌ [processCombinationBetInternal] Failed to update leg ${i + 1} in database`);
                }
            }
            
            // Verify the combination array was updated correctly
            const verifyBet = await Bet.findById(bet._id);
            console.log(`🔍 [processCombinationBetInternal] Verification - Leg statuses:`, 
                verifyBet.combination.map((leg, index) => ({
                    leg: index + 1,
                    betOption: leg.betOption,
                    status: leg.status
                }))
            );
            
            if (savedBet) {
                console.log(`✅ [processCombinationBetInternal] Database updated successfully:`, {
                    status: savedBet.status,
                    payout: savedBet.payout,
                    updatedAt: savedBet.updatedAt
                });
            } else {
                console.error(`❌ [processCombinationBetInternal] Database update failed - no bet returned`);
            }
            
            // Update user balance if combination bet is resolved
            if (updatedBet.status !== 'pending') {
                console.log(`🔍 [processCombinationBetInternal] Updating user balance for resolved bet`);
                try {
                    await this.updateUserBalanceForCombinationBet(savedBet);
                    console.log(`✅ [processCombinationBetInternal] User balance updated successfully`);
                } catch (error) {
                    console.error(`❌ [processCombinationBetInternal] User balance update failed:`, error.message);
                    console.error(`❌ [processCombinationBetInternal] Error stack:`, error.stack);
                }
            } else {
                console.log(`⏳ [processCombinationBetInternal] Bet still pending, skipping balance update`);
            }
            
            return {
                betId: bet._id,
                status: updatedBet.status,
                payout: updatedBet.payout,
                legs: updatedBet.combination.length,
                wonLegs: updatedBet.result.wonLegs,
                lostLegs: updatedBet.result.lostLegs,
                canceledLegs: updatedBet.result.canceledLegs,
                pendingLegs: updatedBet.result.pendingLegs,
                reason: `Combination bet ${updatedBet.status}: ${updatedBet.result.wonLegs}/${updatedBet.combination.length} legs won`,
                processedAt: new Date(),
                legResults: results
            };
            
        } catch (error) {
            console.error(`❌ [processCombinationBetInternal] Error processing combination bet ${bet._id}:`, error);
            console.error(`❌ [processCombinationBetInternal] Error message:`, error.message);
            console.error(`❌ [processCombinationBetInternal] Error stack:`, error.stack);
            
            // Update bet with error status
            await Bet.findByIdAndUpdate(bet._id, {
                status: 'error',
                result: {
                    status: 'error',
                    reason: error.message,
                    processedAt: new Date(),
                    error: true,
                    legs: bet.combination?.length || 0
                },
                updatedAt: new Date()
            });

            throw error;
        }
    }

    // Update user balance for resolved combination bet
    async updateUserBalanceForCombinationBet(bet) {
        try {
            console.log(`[updateUserBalanceForCombinationBet] Looking for user: ${bet.userId} (type: ${typeof bet.userId})`);
            const user = await User.findById(bet.userId);
            if (!user) {
                console.error(`[updateUserBalanceForCombinationBet] User not found: ${bet.userId}`);
                // Try to find user by string ID
                const userByString = await User.findById(bet.userId.toString());
                if (userByString) {
                    console.log(`[updateUserBalanceForCombinationBet] Found user by string ID: ${userByString._id}`);
                } else {
                    console.error(`[updateUserBalanceForCombinationBet] User not found by string ID either`);
                }
                return;
            }
            
            let balanceChange = 0;
            let transactionType = '';

            if (bet.status === 'won') {
                // Add payout to balance (stake × product of all odds)
                balanceChange = bet.payout;
                transactionType = 'combination_bet_win';
                console.log(`[updateUserBalanceForCombinationBet] Added ${bet.payout} to user ${bet.userId} balance (combination won)`);
            } else if (bet.status === 'lost') {
                // Balance already deducted during placement, no change needed
                balanceChange = 0;
                transactionType = 'combination_bet_loss';
                console.log(`[updateUserBalanceForCombinationBet] Bet lost, no balance change for user ${bet.userId} (combination lost)`);
            } else if (bet.status === 'canceled') {
                // Refund stake (any leg canceled = whole combination canceled)
                balanceChange = bet.stake;
                transactionType = 'combination_bet_cancel';
                console.log(`[updateUserBalanceForCombinationBet] Refunded ${bet.stake} to user ${bet.userId} balance (combination canceled)`);
            }

            // Update user balance directly using User model (same approach as calculator)
            if (balanceChange !== 0) {
                console.log(`[updateUserBalanceForCombinationBet] Updating user ${bet.userId} balance by +${balanceChange}`);
                const updateResult = await User.findByIdAndUpdate(bet.userId, {
                    $inc: { balance: balanceChange }
                });
                
                if (updateResult) {
                    console.log(`[updateUserBalanceForCombinationBet] Balance updated successfully for user ${bet.userId}`);
                } else {
                    console.error(`[updateUserBalanceForCombinationBet] Failed to update balance - user not found: ${bet.userId}`);
                }
            } else {
                console.log(`[updateUserBalanceForCombinationBet] No balance change needed for user ${bet.userId}`);
            }
            
        } catch (error) {
            console.error(`[updateUserBalanceForCombinationBet] Error updating balance:`, error);
        }
    }

    // Get processing status
    getProcessingStatus = async (req, res) => {
        try {
            const status = {
                isProcessing: this.calculator.isProcessingRunning,
                stats: this.calculator.processingStats,
                config: this.calculator.config
            };

            res.json({
                success: true,
                message: 'Processing status retrieved',
                status: status
            });

        } catch (error) {
            console.error('Error getting processing status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get processing status',
                error: error.message
            });
        }
    };
}

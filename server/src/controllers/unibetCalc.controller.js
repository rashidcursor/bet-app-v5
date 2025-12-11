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
            
            let bets = [];
            
            if (onlyPending) {
                // Use time-based filtering to get bets where matches are likely finished (2h 15min ago)
                // This ensures we only process bets for matches that have likely finished
                const currentTime = new Date();
                const matchDuration = 135 * 60 * 1000; // 135 minutes = 2h 15min in milliseconds
                const likelyFinishedTime = new Date(currentTime.getTime() - matchDuration);
                
                // Check multiple date fields for backward compatibility
                const query = {
                    status: 'pending',
                    $or: [
                        { start: { $lt: likelyFinishedTime.toISOString() } },
                        { matchDate: { $lt: likelyFinishedTime } },
                        { createdAt: { $lt: likelyFinishedTime } } // Fallback: use bet creation time
                    ]
                };
                
                // Also include bets where matchFinished is explicitly true (if set)
                const finishedBetsQuery = { status: 'pending', matchFinished: true };
                const finishedBets = await Bet.find(finishedBetsQuery).limit(parseInt(limit));
                
                console.log(`🔍 [processAll] Looking for pending bets using time-based filtering (matches started ${matchDuration / 60000} minutes ago or more)`);
                console.log(`   - Time threshold: ${likelyFinishedTime.toISOString()}`);
                
                const timeBasedBets = await Bet.find(query)
                    .sort({ createdAt: 1 })
                    .limit(parseInt(limit));
                
                // Combine both queries and remove duplicates
                const allBets = [...timeBasedBets, ...finishedBets];
                bets = allBets.filter((bet, index, self) => 
                    index === self.findIndex(b => b._id.toString() === bet._id.toString())
                );
                
                console.log(`   - Found ${timeBasedBets.length} time-based bets, ${finishedBets.length} finished-flagged bets, ${bets.length} unique total`);
            } else {
                // For non-pending mode, get all bets
                const query = {};
                bets = await Bet.find(query)
                    .sort({ createdAt: 1 })
                    .limit(parseInt(limit));
            }

            if (bets.length === 0) {
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
            for (const bet of bets) {
                try {
                    let result;
                    
                    console.log(`\n🔄 Processing bet ${bet._id} (${bet.combination && bet.combination.length > 0 ? 'combination' : 'single'})...`);
                    
                    // Check if it's a combination bet
                    if (bet.combination && bet.combination.length > 0) {
                        result = await this.processCombinationBetInternal(bet);
                        stats.combination.processed++;
                        if (result.status === 'won') stats.combination.won++;
                        else if (result.status === 'lost') stats.combination.lost++;
                        else if (result.status === 'canceled' || result.status === 'cancelled') stats.combination.canceled++;
                    } else {
                        result = await this.processSingleBet(bet);
                        stats.single.processed++;
                        if (result.status === 'won') stats.single.won++;
                        else if (result.status === 'lost') stats.single.lost++;
                        else if (result.status === 'canceled' || result.status === 'cancelled') stats.single.canceled++;
                    }
                    
                    results.push(result);
                    console.log(`✅ Bet ${bet._id} processed successfully: ${result.status}`);
                    
                } catch (error) {
                    console.error(`❌ [processAll] Error processing bet ${bet._id}:`, error.message);
                    console.error(`📋 Error details:`, error.stack);
                    stats.failed++;
                    stats.errors.push({
                        betId: bet._id,
                        betType: bet.combination && bet.combination.length > 0 ? 'combination' : 'single',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Continue processing other bets even if one fails
                    console.log(`⚠️ Continuing with next bet despite error...`);
                }
            }


            res.json({
                success: true,
                message: `Processed ${stats.single.processed + stats.combination.processed} out of ${stats.total} bets (${stats.single.processed} single, ${stats.combination.processed} combination)`,
                stats: stats,
                results: results.slice(0, 10) // Return first 10 results for review
            });

        } catch (error) {
            console.error('[processAll] Error in batch processing:', error);
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
        // console.log('bet+++++++++++++++++++++++', bet);
        try {
            // Validate bet for calculator
            const validation = BetSchemaAdapter.validateBetForCalculator(bet);
            if (!validation.isValid) {
                throw new Error(`Bet validation failed: ${validation.errors.join(', ')}`);
            }

            // Adapt bet for calculator
            const adaptedBet = BetSchemaAdapter.adaptBetForCalculator(bet);
            
            // console.log('adaptedBet+++++++++++++++++++++++', adaptedBet);
            console.log(`Processing bet ${bet._id}: ${adaptedBet.marketName} - ${adaptedBet.outcomeLabel}`);

            // Process with calculator (calculator already updates the database)
            const calculatorResult = await this.calculator.processBetWithMatchId(adaptedBet, adaptedBet.eventId);
            
            // Check if calculator validation failed
            if (!calculatorResult.success) {
                console.log(`❌ Calculator validation failed: ${calculatorResult.error}`);
                
                // Cancel the bet due to validation failure
                await this.cancelBet(bet._id, calculatorResult.error);
                
                return {
                    betId: bet._id,
                    status: 'cancelled',
                    payout: 0,
                    reason: `Validation failed: ${calculatorResult.error}`,
                    processedAt: new Date(),
                    debugInfo: {}
                };
            }
            
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
            console.error(`Error processing bet ${bet._id}:`, error);
            
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
            console.log(`🚫 Cancelling bet ${betId} due to: ${reason}`);
            
            // Update bet status to cancelled
            const updatedBet = await Bet.findByIdAndUpdate(
                betId,
                {
                    status: 'cancelled',
                    result: {
                        status: 'cancelled',
                        payout: 0,
                        reason: reason,
                        processedAt: new Date()
                    }
                },
                { new: true }
            );

            if (updatedBet) {
                // Refund the stake to user's balance
                await User.findByIdAndUpdate(
                    updatedBet.userId,
                    { $inc: { balance: updatedBet.stake } }
                );
                console.log(`✅ Bet ${betId} cancelled and stake refunded`);
            }

            return updatedBet;
        } catch (error) {
            console.error(`❌ Error cancelling bet ${betId}:`, error);
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
            .sort({ createdAt: 1 })
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
            
            // Validate combination bet for calculator
            const validation = BetSchemaAdapter.validateCombinationBetForCalculator(bet);
            if (!validation.isValid) {
                throw new Error(`Combination bet validation failed: ${validation.errors.join(', ')}`);
            }

            // Adapt combination bet for calculator (returns array of calculator bets)
            const calculatorBets = await BetSchemaAdapter.adaptCombinationBetForCalculator(bet);
            

            // Process each leg through calculator
            const results = [];
            for (let i = 0; i < calculatorBets.length; i++) {
                const calculatorBet = calculatorBets[i];
                const leg = bet.combination[i];
                
                console.log(`[processCombinationBetInternal] Processing leg ${i + 1}/${calculatorBets.length}: ${leg.betOption} @ ${leg.odds}`);
                
                try {
                    // Process leg through calculator (don't update database for combination bet legs)
                    const calculatorResult = await this.calculator.processBetWithMatchId(calculatorBet, calculatorBet.eventId, false);
                    
                    // Extract outcome from calculator result
                    const legResult = {
                        status: calculatorResult.outcome?.status || 'pending',
                        payout: calculatorResult.outcome?.payout || 0,
                        reason: calculatorResult.outcome?.reason || 'Leg processed',
                        odds: leg.odds, // Include odds for payout calculation
                        debugInfo: calculatorResult.debugInfo || {}
                    };
                    
                    results.push(legResult);
                    
                    console.log(`[processCombinationBetInternal] Leg ${i + 1} result: ${legResult.status} (payout: ${legResult.payout})`);
                    
                } catch (error) {
                    console.error(`[processCombinationBetInternal] Error processing leg ${i + 1}:`, error);
                    
                    // Add error result for this leg
                    results.push({
                        status: 'error',
                        payout: 0,
                        reason: `Leg processing failed: ${error.message}`,
                        debugInfo: { error: error.message }
                    });
                }
            }
            
            // Adapt results back to bet-app format
            const updatedBet = BetSchemaAdapter.adaptCombinationCalculatorResult(results, bet);

            // console.log(`Updatedbet --------------------------------------:`,updatedBet);
            
            // console.log(`[processCombinationBetInternal] Updating database for bet ${bet._id}:`, {
            //     status: updatedBet.status,
            //     payout: updatedBet.payout,
            //     legs: updatedBet.combination.length
            // });
            
            // console.log(`[processCombinationBetInternal] Updated bet object:`, JSON.stringify(updatedBet, null, 2));
            
            // Update bet in database with main fields first
            const savedBet = await Bet.findByIdAndUpdate(
                bet._id,
                { 
                    $set: {
                        status: updatedBet.status,
                        payout: updatedBet.payout,
                        result: updatedBet.result,
                        updatedAt: new Date()
                    }
                },
                { new: true, runValidators: true }
            );

            
            // Update combination array elements individually using array index notation
            for (let i = 0; i < updatedBet.combination.length; i++) {
                const leg = updatedBet.combination[i];
                await Bet.findByIdAndUpdate(
                    bet._id,
                    { 
                        $set: {
                            [`combination.${i}.status`]: leg.status,
                            [`combination.${i}.payout`]: leg.payout,
                            [`combination.${i}.result`]: leg.result
                        }
                    },
                    { new: true, runValidators: true }
                );
                console.log(`[processCombinationBetInternal] Updated leg ${i + 1}: ${leg.betOption} → ${leg.status}`);
            }
            
            // Verify the combination array was updated correctly
            const verifyBet = await Bet.findById(bet._id);
            console.log(`Verification - Leg statuses---------------------:`, 
                verifyBet.combination.map((leg, index) => ({
                    leg: index + 1,
                    betOption: leg.betOption,
                    status: leg.status
                }))
            );
            
            if (savedBet) {
                console.log(`[processCombinationBetInternal] Database updated successfully:`, {
                    status: savedBet.status,
                    payout: savedBet.payout,
                    updatedAt: savedBet.updatedAt
                });
            } else {
                console.error(`[processCombinationBetInternal] Database update failed - no bet returned`);
            }
            
            // Update user balance if combination bet is resolved
            if (updatedBet.status !== 'pending') {
                console.log(`[processCombinationBetInternal] Updating user balance for resolved bet`);
                try {
                    await this.updateUserBalanceForCombinationBet(savedBet);
                    console.log(`[processCombinationBetInternal] User balance updated successfully`);
                } catch (error) {
                    console.error(`[processCombinationBetInternal] User balance update failed:`, error.message);
                }
            } else {
                console.log(`[processCombinationBetInternal] Bet still pending, skipping balance update`);
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
            console.error(`[processCombinationBetInternal] Error processing combination bet ${bet._id}:`, error);
            
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

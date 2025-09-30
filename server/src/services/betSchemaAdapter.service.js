// Bet Schema Adapter Service
// Maps bet-app Bet schema to unibet-api calculator format

import { normalizeBet } from '../unibet-calc/utils/market-normalizer.js';
import { identifyMarket } from '../unibet-calc/utils/market-registry.js';

export class BetSchemaAdapter {
    /**
     * Convert bet-app Bet document to calculator-compatible format
     * @param {Object} bet - bet-app Bet document
     * @returns {Object} - Calculator-compatible bet object
     */
    static adaptBetForCalculator(bet) {
        if (!bet) {
            throw new Error('Bet document is required');
        }

        // Extract data from bet-app schema
        const betDetails = bet.betDetails || {};
        const unibetMeta = bet.unibetMeta || {};

        // Build calculator-compatible bet object
        const calculatorBet = {
            // Core identifiers
            eventId: bet.matchId || unibetMeta.eventName,
            marketId: bet.marketId || betDetails.market_id || unibetMeta.marketName,
            outcomeId: bet.oddId,
            outcomeLabel: betDetails.label || bet.betOption || unibetMeta.outcomeEnglishLabel,
            outcomeEnglishLabel: betDetails.label || bet.betOption || unibetMeta.outcomeEnglishLabel,

            // Market information - prioritize market_name over market_description for better recognition
            marketName: unibetMeta.marketName || betDetails.market_name || betDetails.market_description,
            criterionLabel: unibetMeta.criterionLabel || betDetails.market_description,
            criterionEnglishLabel: unibetMeta.criterionEnglishLabel || betDetails.market_description,

            // Participant information
            participant: betDetails.name || unibetMeta.participant,
            participantId: unibetMeta.participantId,
            eventParticipantId: unibetMeta.eventParticipantId,

            // Bet details
            odds: bet.odds || betDetails.value,
            stake: bet.stake,
            payout: bet.payout || 0,
            potentialWin: bet.potentialWin || (bet.stake * (bet.odds || betDetails.value)),
            betType: bet.betType || 'single',
            betOfferTypeId: unibetMeta.betOfferTypeId,

            // Handicap/Line information
            handicapRaw: unibetMeta.handicapRaw || this.parseHandicap(betDetails.handicap),
            handicapLine: unibetMeta.handicapLine || this.parseHandicap(betDetails.handicap),
            line: this.parseHandicap(betDetails.handicap) || unibetMeta.handicapLine,
            
            // Bet details for line calculation
            betDetails: {
                total: betDetails.total,
                handicap: betDetails.handicap,
                market_name: betDetails.market_name,
                market_description: betDetails.market_description,
                label: betDetails.label,
                value: betDetails.value,
                name: betDetails.name
            },

            // Match context - prioritize direct league fields over unibetMeta, but ensure unibetMeta is used as fallback
            leagueId: bet.leagueId || unibetMeta.leagueId || null,
            leagueName: bet.leagueName || unibetMeta.leagueName || null,
            homeName: unibetMeta.homeName || this.extractTeamName(bet.teams, 'home'),
            awayName: unibetMeta.awayName || this.extractTeamName(bet.teams, 'away'),
            start: unibetMeta.start || bet.matchDate,

            // Additional fields
            eventName: unibetMeta.eventName || `${unibetMeta.homeName || 'Home'} vs ${unibetMeta.awayName || 'Away'}`,
            userId: bet.userId,
            status: bet.status,
            createdAt: bet.createdAt,
            updatedAt: bet.updatedAt,

            // Original bet-app fields for reference
            _originalBet: {
                id: bet._id,
                matchId: bet.matchId,
                oddId: bet.oddId,
                betOption: bet.betOption,
                marketId: bet.marketId,
                betDetails: betDetails,
                unibetMeta: unibetMeta
            }
        };

        // Normalize the bet for calculator
        const normalizedBet = normalizeBet(calculatorBet);
        
        // Identify market type
        const marketCode = identifyMarket(calculatorBet, normalizedBet);

        return {
            ...calculatorBet,
            normalized: normalizedBet,
            marketCode: marketCode
        };
    }

    /**
     * Parse handicap value from various formats
     * @param {any} handicap - Handicap value (string, number, etc.)
     * @returns {number|null} - Parsed handicap value
     */
    static parseHandicap(handicap) {
        if (handicap === null || handicap === undefined) return null;
        
        const num = Number(handicap);
        if (Number.isNaN(num)) return null;
        
        return num;
    }

    /**
     * Extract team name from teams string
     * @param {string} teams - Teams string like "Team A vs Team B"
     * @param {string} side - 'home' or 'away'
     * @returns {string|null} - Team name
     */
    static extractTeamName(teams, side) {
        if (!teams || typeof teams !== 'string') return null;
        
        const parts = teams.split(' vs ');
        if (parts.length !== 2) return null;
        
        return side === 'home' ? parts[0].trim() : parts[1].trim();
    }

    /**
     * Fetch match data from the fixture service
     * @param {string} matchId - Match ID
     * @returns {Object|null} - Match data or null if not found
     */
    static async fetchMatchData(matchId) {
        try {
            // Import the fixture service dynamically to avoid circular dependencies
            const { default: FixtureService } = await import('./fixture.service.js');
            const fixtureService = new FixtureService();
            
            // Try to get match data from cache or API
            const matchData = await fixtureService.getMatchById(matchId);
            return matchData;
        } catch (error) {
            console.warn(`[fetchMatchData] Failed to fetch match data for ${matchId}:`, error.message);
            return null;
        }
    }

    /**
     * Convert calculator result back to bet-app format
     * @param {Object} calculatorResult - Result from calculator
     * @param {Object} originalBet - Original bet-app bet document
     * @returns {Object} - Updated bet-app bet document
     */
    static adaptCalculatorResult(calculatorResult, originalBet) {
        const updatedBet = {
            ...originalBet,
            status: calculatorResult.status || originalBet.status,
            payout: calculatorResult.payout || originalBet.payout,
            result: {
                status: calculatorResult.status,
                payout: calculatorResult.payout,
                reason: calculatorResult.reason,
                processedAt: new Date(),
                debugInfo: calculatorResult.debugInfo || {},
                calculatorVersion: 'unibet-api-v1'
            },
            updatedAt: new Date()
        };

        return updatedBet;
    }

    /**
     * Validate that bet has required fields for calculator
     * @param {Object} bet - bet-app Bet document
     * @returns {Object} - Validation result
     */
    static validateBetForCalculator(bet) {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!bet.matchId && !bet.unibetMeta?.eventName) {
            errors.push('Missing matchId or eventName');
        }

        if (!bet.oddId) {
            errors.push('Missing oddId');
        }

        if (!bet.stake || bet.stake <= 0) {
            errors.push('Invalid or missing stake');
        }

        if (!bet.odds && !bet.betDetails?.value) {
            errors.push('Missing odds');
        }

        // Warnings for missing optional fields
        if (!bet.unibetMeta?.marketName && !bet.betDetails?.market_name) {
            warnings.push('Missing market name');
        }

        if (!bet.unibetMeta?.leagueName) {
            warnings.push('Missing league name');
        }

        if (!bet.unibetMeta?.homeName || !bet.unibetMeta?.awayName) {
            warnings.push('Missing team names');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get market family for bet
     * @param {Object} bet - bet-app Bet document
     * @returns {string} - Market family
     */
    static getMarketFamily(bet) {
        const adaptedBet = this.adaptBetForCalculator(bet);
        const marketName = (adaptedBet.marketName || '').toLowerCase();
        
        if (!marketName) return 'unknown';
        
        if (marketName.includes('match') || marketName.includes('3-way') || marketName.includes('double chance') || marketName.includes('draw no bet')) {
            return 'result';
        }
        if (marketName.includes('total') || marketName.includes('over') || marketName.includes('under') || marketName.includes('odd/even')) {
            return 'totals';
        }
        if (marketName.includes('card')) {
            return 'cards';
        }
        if (marketName.includes('corner')) {
            return 'corners';
        }
        if (marketName.includes('player') || marketName.includes('to score')) {
            return 'player';
        }
        if (marketName.includes('half') || marketName.includes('interval') || marketName.includes('minute') || marketName.includes('next')) {
            return 'time';
        }
        
        return 'unknown';
    }

    /**
     * Convert combination bet to calculator-compatible format
     * @param {Object} bet - bet-app Bet document with combination array
     * @returns {Array} - Array of calculator-compatible bet objects (one per leg)
     */
    static async adaptCombinationBetForCalculator(bet) {
        if (!bet.combination || !Array.isArray(bet.combination)) {
            throw new Error('Invalid combination bet: missing combination array');
        }
        
        console.log(`[adaptCombinationBetForCalculator] Processing combination bet ${bet._id} with ${bet.combination.length} legs`);
        
        const results = [];
        
        for (let index = 0; index < bet.combination.length; index++) {
            const leg = bet.combination[index];
            
            // Create a single bet object for this leg using the leg's data
            const legBet = {
                // Core bet fields from the main combination bet
                _id: bet._id,
                userId: bet.userId,
                status: bet.status,
                createdAt: bet.createdAt,
                updatedAt: bet.updatedAt,
                betType: bet.betType,
                
                // Leg-specific data
                matchId: leg.matchId,
                oddId: leg.oddId,
                betOption: leg.betOption,
                odds: leg.odds,
                stake: leg.stake,
                betDetails: leg.betDetails,
                unibetMeta: leg.unibetMeta, // Use leg's unibetMeta
                teams: leg.teams,
                selection: leg.selection,
                inplay: leg.inplay,
                matchDate: leg.matchDate,
                estimatedMatchEnd: leg.estimatedMatchEnd,
                betOutcomeCheckTime: leg.betOutcomeCheckTime,
                // Include league information directly from the leg
                leagueId: leg.leagueId,
                leagueName: leg.leagueName
            };
            
            console.log(`[adaptCombinationBetForCalculator] Processing leg ${index + 1}: ${leg.betOption} @ ${leg.odds} for match ${leg.matchId}`);
            console.log(`[adaptCombinationBetForCalculator] Leg ${index + 1} league info:`, {
                legLeagueId: leg.leagueId,
                legLeagueName: leg.leagueName,
                unibetMetaLeagueId: leg.unibetMeta?.leagueId,
                unibetMetaLeagueName: leg.unibetMeta?.leagueName
            });
            
            // Ensure league information is available - prioritize leg fields, then unibetMeta
            if (!legBet.leagueId && leg.unibetMeta?.leagueId) {
                legBet.leagueId = leg.unibetMeta.leagueId;
            }
            if (!legBet.leagueName && leg.unibetMeta?.leagueName) {
                legBet.leagueName = leg.unibetMeta.leagueName;
            }
            
            // If still no league information, try to fetch it from match data
            if (!legBet.leagueId || !legBet.leagueName) {
                try {
                    console.log(`[adaptCombinationBetForCalculator] Fetching league info for match ${leg.matchId}...`);
                    const matchData = await this.fetchMatchData(leg.matchId);
                    if (matchData) {
                        if (!legBet.leagueId && matchData.league?.id) {
                            legBet.leagueId = matchData.league.id;
                            console.log(`[adaptCombinationBetForCalculator] Set leagueId from match data: ${legBet.leagueId}`);
                        }
                        if (!legBet.leagueName && matchData.league?.name) {
                            legBet.leagueName = matchData.league.name;
                            console.log(`[adaptCombinationBetForCalculator] Set leagueName from match data: ${legBet.leagueName}`);
                        }
                    }
                } catch (error) {
                    console.warn(`[adaptCombinationBetForCalculator] Failed to fetch match data for ${leg.matchId}:`, error.message);
                }
            }
            
            // Use the existing single bet adapter
            const adaptedBet = this.adaptBetForCalculator(legBet);
            results.push(adaptedBet);
        }
        
        return results;
    }

    /**
     * Convert calculator results back to bet-app format for combination bets
     * @param {Array} calculatorResults - Results from calculator for each leg
     * @param {Object} originalBet - Original bet-app Bet document
     * @returns {Object} - Updated bet-app Bet document
     */
    static adaptCombinationCalculatorResult(calculatorResults, originalBet) {
        if (!originalBet.combination || !Array.isArray(originalBet.combination)) {
            throw new Error('Invalid combination bet: missing combination array');
        }
        
        if (calculatorResults.length !== originalBet.combination.length) {
            throw new Error(`Mismatch: ${calculatorResults.length} results for ${originalBet.combination.length} legs`);
        }
        
        console.log(`[adaptCombinationCalculatorResult] Processing ${calculatorResults.length} leg results for combination bet ${originalBet._id}`);
        
        // Update each leg with its calculator result
        const updatedCombination = originalBet.combination.map((leg, index) => {
            const result = calculatorResults[index];
            
            // Normalize status to handle both 'canceled' and 'cancelled' spellings
            const normalizedStatus = result.status === 'cancelled' ? 'canceled' : result.status;
            
            console.log(`[adaptCombinationCalculatorResult] Leg ${index + 1}: ${leg.betOption} → ${result.status} → ${normalizedStatus} (payout: ${result.payout})`);
            console.log(`[adaptCombinationCalculatorResult] Leg ${index + 1} status details:`, {
                originalStatus: leg.status,
                calculatorStatus: result.status,
                normalizedStatus: normalizedStatus,
                statusType: typeof result.status
            });
            
            return {
                ...leg,
                status: normalizedStatus,
                payout: result.payout || 0,
                odds: leg.odds, // Explicitly preserve odds for payout calculation
                // Add result metadata
                result: {
                    status: normalizedStatus,
                    payout: result.payout || 0,
                    reason: this.generateLegReason(leg, result, normalizedStatus),
                    processedAt: new Date(),
                    debugInfo: result.debugInfo || {},
                    calculatorVersion: 'unibet-api-v1'
                }
            };
        });
        
        // Calculate overall combination status using combination bet rules
        const overallStatus = this.calculateCombinationStatus(updatedCombination);
        const totalPayout = this.calculateCombinationPayout(updatedCombination, originalBet.stake);
        
        console.log(`[adaptCombinationCalculatorResult] Overall status: ${overallStatus}, Total payout: ${totalPayout}`);
        
        // Debug: Log the final combination array to verify leg statuses
        console.log(`[adaptCombinationCalculatorResult] Final combination array:`, updatedCombination.map((leg, index) => ({
            leg: index + 1,
            betOption: leg.betOption,
            status: leg.status,
            payout: leg.payout
        })));
        
        return {
            ...originalBet,
            combination: updatedCombination,
            status: overallStatus,
            payout: totalPayout,
            result: {
                status: overallStatus,
                payout: totalPayout,
                reason: this.generateCombinationBetReason(updatedCombination, overallStatus),
                processedAt: new Date(),
                legs: updatedCombination.length,
                wonLegs: updatedCombination.filter(leg => leg.status === 'won').length,
                lostLegs: updatedCombination.filter(leg => leg.status === 'lost').length,
                canceledLegs: updatedCombination.filter(leg => leg.status === 'canceled' || leg.status === 'error').length,
                pendingLegs: updatedCombination.filter(leg => leg.status === 'pending').length,
                calculatorVersion: 'unibet-api-v1'
            },
            updatedAt: new Date()
        };
    }

    /**
     * Calculate overall combination bet status
     * @param {Array} legs - Updated combination legs
     * @returns {string} - Overall bet status
     */
    static calculateCombinationStatus(legs) {
        // Handle both 'canceled' and 'cancelled' spellings from calculator
        // Also treat 'error' status as 'canceled' for combination bet rules
        const hasCanceled = legs.some(leg => 
            leg.status === 'canceled' || 
            leg.status === 'cancelled' || 
            leg.status === 'error'
        );
        const hasLost = legs.some(leg => leg.status === 'lost');
        const hasPending = legs.some(leg => leg.status === 'pending');
        
        // Combination bet rules:
        // - CANCELED: If any leg is canceled/cancelled/error
        // - LOST: If any leg is lost (even if others are won)
        // - PENDING: If any leg is still pending
        // - WON: Only if ALL legs are won
        
        if (hasCanceled) return 'canceled';
        if (hasLost) return 'lost';
        if (hasPending) return 'pending';
        return 'won'; // All legs won
    }

    /**
     * Calculate total payout for combination bet
     * @param {Array} legs - Updated combination legs
     * @param {number} stake - Original stake
     * @returns {number} - Total payout
     */
    static calculateCombinationPayout(legs, stake) {
        // Handle both 'canceled' and 'cancelled' spellings from calculator
        // Also treat 'error' status as 'canceled' for payout calculation
        const hasCanceled = legs.some(leg => 
            leg.status === 'canceled' || 
            leg.status === 'cancelled' || 
            leg.status === 'error'
        );
        const hasLost = legs.some(leg => leg.status === 'lost');
        const allWon = legs.every(leg => leg.status === 'won');
        
        // Combination bet payout rules:
        // - CANCELED: Refund stake
        // - LOST: No payout (0)
        // - WON: stake × (odd1 × odd2 × odd3 × ...) - product of all odds
        
        if (hasCanceled) return stake; // Refund
        if (hasLost) return 0; // No payout
        if (allWon) {
            // Odds are already in decimal format (e.g., 1.11, 1.62)
            const totalOdds = legs.reduce((acc, leg) => {
                console.log(`[calculateCombinationPayout] Leg odds: ${leg.odds}`);
                return acc * leg.odds;
            }, 1);
            console.log(`[calculateCombinationPayout] Total odds: ${totalOdds}, Stake: ${stake}, Payout: ${stake * totalOdds}`);
            return stake * totalOdds; // Product of all odds
        }
        
        return 0; // Default for pending
    }

    /**
     * Validate combination bet for calculator processing
     * @param {Object} bet - bet-app Bet document with combination array
     * @returns {Object} - Validation result
     */
    static validateCombinationBetForCalculator(bet) {
        const errors = [];
        const warnings = [];
        
        if (!bet.combination || !Array.isArray(bet.combination)) {
            errors.push('Missing or invalid combination array');
            return { isValid: false, errors, warnings };
        }
        
        if (bet.combination.length < 2) {
            errors.push('Combination bet must have at least 2 legs');
        }
        
        if (bet.combination.length > 10) {
            errors.push('Combination bet cannot have more than 10 legs');
        }
        
        // Validate each leg
        bet.combination.forEach((leg, index) => {
            const legValidation = this.validateBetForCalculator({
                matchId: leg.matchId,
                oddId: leg.oddId,
                stake: leg.stake,
                odds: leg.odds,
                betDetails: leg.betDetails,
                unibetMeta: leg.unibetMeta
            });
            
            if (!legValidation.isValid) {
                errors.push(`Leg ${index + 1}: ${legValidation.errors.join(', ')}`);
            }
            
            warnings.push(...legValidation.warnings.map(w => `Leg ${index + 1}: ${w}`));
        });
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Generate a comprehensive reason for combination bet outcome
     * @param {Array} legs - Array of combination bet legs with their results
     * @param {string} overallStatus - Overall combination bet status
     * @returns {string} Detailed reason explaining the outcome
     */
    static generateCombinationBetReason(legs, overallStatus) {
        const legCount = legs.length;
        const wonLegs = legs.filter(leg => leg.status === 'won');
        const lostLegs = legs.filter(leg => leg.status === 'lost');
        const canceledLegs = legs.filter(leg => leg.status === 'canceled');
        
        if (overallStatus === 'won') {
            const legDetails = legs.map((leg, index) => 
                `Leg ${index + 1}: ${leg.betOption} (${leg.unibetMeta?.eventName || 'Unknown match'}) - ${leg.status}`
            ).join(', ');
            return `Combination bet won: All ${legCount} legs successful.`;
        } else if (overallStatus === 'lost') {
            const lostDetails = lostLegs.map((leg, index) => 
                `Leg ${legs.indexOf(leg) + 1}: ${leg.betOption} (${leg.unibetMeta?.eventName || 'Unknown match'}) - ${leg.status}`
            ).join(', ');
            return `Combination bet lost: ${lostLegs.length} of ${legCount} legs failed.`;
        } else if (overallStatus === 'canceled') {
            const canceledDetails = canceledLegs.map((leg, index) => 
                `Leg ${legs.indexOf(leg) + 1}: ${leg.betOption} (${leg.unibetMeta?.eventName || 'Unknown match'}) - ${leg.status}`
            ).join(', ');
            return `Combination bet canceled: ${canceledLegs.length} of ${legCount} legs canceled.`;
        } else {
            return `Combination bet status: ${overallStatus} (${wonLegs.length} won, ${lostLegs.length} lost, ${canceledLegs.length} canceled)`;
        }
    }

    /**
     * Generate a reason string for individual combination bet leg results
     * @param {Object} leg - Individual leg object
     * @param {Object} result - Calculator result for this leg
     * @param {string} status - Normalized status
     * @returns {string} - Reason string for this leg
     */
    static generateLegReason(leg, result, status) {
        const betOption = leg.betOption || 'Unknown bet';
        const teams = leg.teams || 'Unknown teams';
        
        if (status === 'won') {
            return `${betOption} won for ${teams}`;
        } else if (status === 'lost') {
            return `${betOption} lost for ${teams}`;
        } else if (status === 'canceled') {
            return `${betOption} canceled for ${teams}`;
        } else {
            return `${betOption} status: ${status} for ${teams}`;
        }
    }
}

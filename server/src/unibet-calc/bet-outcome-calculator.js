// bet-outcome-calculator.js
// Full implementation of bet outcome calculation and processing

import Fotmob from '@max-xoo/fotmob';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Bet from '../models/Bet.js';
import {
    normalizeLine,
    getFinalScore,
    getHalftimeScore,
    getSecondHalfScore,
    getTeamGoalsByInterval,
    getTeamCards,
    getCornersFromStats,
    getFoulsFromStats,
    getTeamNames,
    getGoalsInWindow,
    getFirstGoalAfterMinute,
    getNthGoal,
    getPlayerStats,
    getPlayerEvents,
    findPlayerIdByName
} from './utils/fotmob-helpers.js';
import { normalizeBet } from './utils/market-normalizer.js';
import { identifyMarket, MarketCodes } from './utils/market-registry.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default class BetOutcomeCalculator {
    constructor(db) {
        this.db = db;
        this.fotmob = new Fotmob();
        this.leagueMapping = new Map();
        this.config = {
            peakHours: { start: 18, end: 23 },
            intervals: {
                peak: 4 * 1000,    // 4 seconds during peak hours
                offPeak: 4 * 1000  // 4 seconds during off-peak hours
            },
            rateLimit: {
                apiDelayMs: 5000,  // 5 seconds delay between API calls (configurable)
                enabled: true
            }
        };
        this.isProcessingRunning = false;
        this.scheduledProcessing = null;
        this.processingStats = {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            totalProcessed: 0,
            totalWon: 0,
            totalLost: 0,
            lastRun: null
        };

        console.log('✅ BetOutcomeCalculator initialized with full functionality');
    }

    /**
     * Foundation: lightweight family router (to be expanded in later phases)
     */
    determineMarketFamily(bet) {
        const name = (bet?.marketName || '').toLowerCase();
        if (!name) return 'unknown';
        if (name.includes('match') || name.includes('3-way') || name.includes('double chance') || name.includes('draw no bet')) return 'result';
        if (name.includes('total') || name.includes('over') || name.includes('under') || name.includes('odd/even')) return 'totals';
        if (name.includes('card')) return 'cards';
        if (name.includes('corner')) return 'corners';
        if (name.includes('player') || name.includes('to score')) return 'player';
        if (name.includes('half') || name.includes('interval') || name.includes('minute') || name.includes('next')) return 'time';
        return 'unknown';
    }

    /**
     * Foundation: derive basic facts from FotMob for debugging and tests
     */
    getBasicDerivedFacts(matchDetails) {
        const { homeScore, awayScore } = getFinalScore(matchDetails);
        const ht = getHalftimeScore(matchDetails);
        const sh = getSecondHalfScore(matchDetails);
        const cards = getTeamCards(matchDetails);
        const corners = getCornersFromStats(matchDetails);
        const fouls = getFoulsFromStats(matchDetails);
        const names = getTeamNames(matchDetails);
        const window30to59 = getTeamGoalsByInterval(matchDetails, 30, 59);

        return {
            teams: names,
            finalScore: { home: homeScore, away: awayScore },
            halftimeScore: ht,
            secondHalfScore: sh,
            cards,
            corners,
            fouls,
            goals_30_59: window30to59
        };
    }

    /**
     * Load league mapping from CSV file
     */
    async loadLeagueMapping() {
        try {
            const mappingPath = path.join(__dirname, 'league_mapping_clean.csv');

            if (!fs.existsSync(mappingPath)) {
                console.log('⚠️ League mapping file not found, using empty mapping');
                return;
            }

            const csvContent = fs.readFileSync(mappingPath, 'utf8');
            const lines = csvContent.split('\n').slice(1); // Skip header

            this.leagueMapping.clear();

            for (const line of lines) {
                if (line.trim()) {
                    const [unibetId, unibetName, fotmobId, fotmobName] = line.split(',').map(s => s.trim().replace(/"/g, ''));

                    if (unibetId && fotmobId) {
                        this.leagueMapping.set(unibetId, {
                            unibetId: unibetId,
                            unibetName: unibetName,
                            fotmobId: fotmobId,
                            fotmobName: fotmobName
                        });
                    }
                }
            }

            console.log(`✅ Loaded ${this.leagueMapping.size} league mappings`);
        } catch (error) {
            console.error('Error loading league mapping:', error.message);
        }
    }

    /**
     * Get pending bets from database
     */
    async getPendingBets(onlyFinished = true) {
        try {
            const query = { status: 'pending' };

            if (onlyFinished) {
                // First try to get bets where matchFinished is explicitly true
                query.matchFinished = true;
                console.log('🔍 Looking for pending bets with matchFinished = true');
            } else {
                // For legacy mode, use time-based filtering - only matches that are likely finished (105+ minutes after start)
                const currentTime = new Date();
                const matchDuration = 105 * 60 * 1000; // 105 minutes in milliseconds
                const likelyFinishedTime = new Date(currentTime.getTime() - matchDuration);
                query.start = { $lt: likelyFinishedTime.toISOString() };
                console.log('🔍 Looking for pending bets using time-based filtering (matches likely finished - 105+ minutes after start)');
            }

            const bets = await this.db.collection('bets').find(query).toArray();
            // console.log(`Found ${bets.length} pending bets${onlyFinished ? ' (with matchFinished = true)' : ' (time-based filtering)'}`);

            return bets;
        } catch (error) {
            console.error('Error fetching pending bets:', error);
            return [];
        }
    }

    /**
     * Get cached daily matches for a specific date with detailed logging
     */
    async getCachedDailyMatches(date, bet = null) {
        // console.log(bet);
        try {
            const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
            const dateFormatted = date.toISOString().slice(0, 10);

            console.log(`\n🔍 FOTMOB CACHE LOOKUP:`);
            console.log(`   - Date: ${dateFormatted} (${dateStr})`);

            // Try specific daily cache first
            const cacheFile = path.join(__dirname, `fotmob_matches_${dateStr}_${dateFormatted}.json`);
            console.log(`   - Checking daily cache: ${path.basename(cacheFile)}`);

            if (fs.existsSync(cacheFile)) {
                console.log(`✅ DAILY CACHE FOUND: Loading ${path.basename(cacheFile)}`);
                const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                console.log(`   - Leagues in daily cache: ${data.leagues?.length || 0}`);
                return data;
            } else {
                console.log(`❌ Daily cache not found: ${path.basename(cacheFile)}`);
            }

            // Try multi-day cache
            // Special case: use fotmob-11.json for test event ID 1022853538
            let multiDayCacheFile;
            let useTestDate = false;
            
            // Debug: Log bet object structure
            // console.log(`🔍 DEBUG BET OBJECT:`, {
            //     hasBet: !!bet,
            //     betKeys: bet ? Object.keys(bet) : 'no bet',
            //     matchId: bet?.matchId,
            //     matchIdType: typeof bet?.matchId,
            //     betId: bet?._id,
            //     betIdType: typeof bet?._id
            // });
            
                console.log('🧪 TEST EVENT DETECTED: Using fotmob-11.json for event ${bet.matchId}');
            if (bet && bet?.eventId === '1022853538') {
                multiDayCacheFile = path.join(__dirname, '../../storage/fotmob/fotmob-11.json');
                useTestDate = true;
                console.log(`🧪 TEST EVENT DETECTED: Using fotmob-11.json for event ${bet.matchId}`);
                console.log(`🧪 TEST MODE: Will use August 11, 2025 data regardless of bet date`);
            } else {
                multiDayCacheFile = path.join(__dirname, 'fotmob_multiday_cache.json');
            }
            console.log(`   - Checking multi-day cache: ${path.basename(multiDayCacheFile)}`);

            if (fs.existsSync(multiDayCacheFile)) {
                console.log(`✅ MULTI-DAY CACHE FOUND: Loading ${path.basename(multiDayCacheFile)}`);
                const data = JSON.parse(fs.readFileSync(multiDayCacheFile, 'utf8'));
                console.log(`   - Total leagues in multi-day cache: ${data.leagues?.length || 0}`);

                // For test event, use August 11, 2025 data; otherwise filter by actual date
                const filterDate = useTestDate ? '2025-08-11' : dateFormatted;
                console.log(`   - Filtering matches for date: ${filterDate} ${useTestDate ? '(TEST MODE)' : ''}`);
                
                let matchesForDate = 0;
                const filteredLeagues = data.leagues.map(league => {
                    const filteredMatches = (league.matches || []).filter(match => {
                        const matchDate = new Date(match.status?.utcTime || match.time);
                        const matchDateStr = matchDate.toISOString().slice(0, 10);
                        const isMatch = matchDateStr === filterDate;
                        if (isMatch) matchesForDate++;
                        return isMatch;
                    });

                    return {
                        ...league,
                        matches: filteredMatches
                    };
                }).filter(league => league.matches.length > 0);

                console.log(`   - Matches found for ${filterDate}: ${matchesForDate} across ${filteredLeagues.length} leagues`);

                return {
                    leagues: filteredLeagues,
                    source: useTestDate ? 'test-cache-fotmob-11' : 'multi-day-cache-filtered',
                    originalDate: filterDate,
                    testMode: useTestDate
                };
            } else {
                console.log(`❌ Multi-day cache not found: ${path.basename(multiDayCacheFile)}`);
            }

            // Fallback: fetch fresh data
            console.log(`📡 FALLBACK: Fetching fresh Fotmob data for ${dateStr}`);
            const freshData = await this.fotmob.getMatchesByDate(dateStr);
            if (freshData) {
                console.log(`✅ Fresh data fetched: ${freshData.leagues?.length || 0} leagues`);
            } else {
                console.log(`❌ Failed to fetch fresh data`);
            }
            return freshData;

        } catch (error) {
            // console.error(`❌ ERROR getting cached daily matches for ${date}:`, error.message);
            return null;
        }
    }

    /**
     * Normalize team name for comparison
     */
    normalizeTeamName(name) {
        if (!name) return '';

        return name
            .toLowerCase()
            .trim()
            // Remove common prefixes/suffixes
            .replace(/\b(fc|cf|ac|sc|united|utd|city|town|rovers|wanderers|athletic|albion)\b/g, '')
            // Remove special characters and extra spaces
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calculate similarity score between two team names
     */
    calculateSimilarity(name1, name2) {
        const norm1 = this.normalizeTeamName(name1);
        const norm2 = this.normalizeTeamName(name2);

        if (norm1 === norm2) return 1.0;

        // Check if one name contains the other
        if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;

        // Calculate Levenshtein distance
        const distance = this.levenshteinDistance(norm1, norm2);
        const maxLength = Math.max(norm1.length, norm2.length);

        if (maxLength === 0) return 0;

        return 1 - (distance / maxLength);
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Find matching Fotmob match for a bet
     */
    findMatchingFotmobMatch(bet, fotmobData) {
        const MINIMUM_SIMILARITY = 0.6;
        const matchingResult = {
            match: null,
            score: 0,
            leagueMapping: null,
            error: null,
            cancellationReason: null,
            debugInfo: {
                betInfo: {
                    eventId: bet.eventId,
                    homeName: bet.homeName,
                    awayName: bet.awayName,
                    leagueId: bet.leagueId,
                    leagueName: bet.leagueName,
                    start: bet.start
                },
                searchSteps: []
            }
        };

        // Step 1: Validate Fotmob data availability
        if (!fotmobData || !fotmobData.leagues) {
            matchingResult.error = 'Fotmob data unavailable';
            matchingResult.cancellationReason = 'FOTMOB_DATA_UNAVAILABLE';
            matchingResult.debugInfo.searchSteps.push('❌ Fotmob data is null or has no leagues');
            return matchingResult;
        }

        matchingResult.debugInfo.searchSteps.push(`✅ Fotmob data available: ${fotmobData.leagues.length} leagues`);

        // Step 2: Validate league mapping exists
        console.log(`\n🔍 LEAGUE MAPPING CHECK:`);
        console.log(`   - Looking for Unibet league ID: ${bet.leagueId}`);
        console.log(`   - League name: ${bet.leagueName}`);

        const leagueMapping = this.leagueMapping.get(bet.leagueId);
        if (!leagueMapping) {
            console.log(`❌ LEAGUE MAPPING NOT FOUND for Unibet league ${bet.leagueId}`);
            console.log(`📋 Available mappings: ${this.leagueMapping.size} total`);

            // Show some sample mappings for debugging
            const sampleMappings = Array.from(this.leagueMapping.entries()).slice(0, 5);
            console.log(`📋 Sample mappings:`);
            sampleMappings.forEach(([key, value]) => {
                console.log(`   - ${key} → ${value.fotmobId} (${value.fotmobName})`);
            });

            matchingResult.error = `No league mapping found for Unibet league ID: ${bet.leagueId}`;
            matchingResult.cancellationReason = 'LEAGUE_MAPPING_NOT_FOUND';
            matchingResult.debugInfo.searchSteps.push(`❌ No mapping for Unibet league ${bet.leagueId} (${bet.leagueName})`);
            return matchingResult;
        }

        console.log(`✅ LEAGUE MAPPING FOUND:`);
        console.log(`   - Unibet: ${bet.leagueId} (${leagueMapping.unibetName})`);
        console.log(`   - Fotmob: ${leagueMapping.fotmobId} (${leagueMapping.fotmobName})`);

        matchingResult.leagueMapping = leagueMapping;
        matchingResult.debugInfo.searchSteps.push(`✅ League mapping found: Unibet ${bet.leagueId} → Fotmob ${leagueMapping.fotmobId}`);

        // Step 3: Find Fotmob league in data
        console.log(`\n🔍 FOTMOB LEAGUE SEARCH:`);
        const fotmobLeagueId = parseInt(leagueMapping.fotmobId);
        console.log(`   - Looking for Fotmob league ID: ${fotmobLeagueId}`);
        console.log(`   - Available Fotmob leagues: ${fotmobData.leagues.length}`);

        // List all available Fotmob leagues for debugging
        console.log(`📋 Available Fotmob leagues:`);
        fotmobData.leagues.slice(0, 10).forEach(league => {
            console.log(`   - ${league.id}: ${league.name} (${league.matches?.length || 0} matches)`);
        });
        if (fotmobData.leagues.length > 10) {
            console.log(`   ... and ${fotmobData.leagues.length - 10} more leagues`);
        }

        // Try to find league by both id and primaryId (Fotmob uses both)
        let fotmobLeague = fotmobData.leagues.find(league => league.id === fotmobLeagueId);
        if (!fotmobLeague) {
            // Also try primaryId field
            fotmobLeague = fotmobData.leagues.find(league => league.primaryId === fotmobLeagueId);
        }

        if (!fotmobLeague) {
            console.log(`❌ FOTMOB LEAGUE NOT FOUND: ${fotmobLeagueId} not in daily data`);
            console.log(`📋 Searched both 'id' and 'primaryId' fields`);
            console.log(`📋 This means the league matches are not in the Fotmob cache for this date`);

            // Show leagues with similar names for debugging
            const similarLeagues = fotmobData.leagues.filter(league =>
                league.name.toLowerCase().includes('league') ||
                league.name.toLowerCase().includes('k-league') ||
                league.name.toLowerCase().includes('korea')
            );

            if (similarLeagues.length > 0) {
                console.log(`📋 Similar leagues found:`);
                similarLeagues.forEach(league => {
                    console.log(`   - ${league.name}: id=${league.id}, primaryId=${league.primaryId}`);
                });
            }

            matchingResult.error = `Fotmob league ${fotmobLeagueId} (${leagueMapping.fotmobName}) not found in daily matches`;
            matchingResult.cancellationReason = 'FOTMOB_LEAGUE_NOT_FOUND';
            matchingResult.debugInfo.searchSteps.push(`❌ Fotmob league ${fotmobLeagueId} not in daily data`);
            return matchingResult;
        }

        console.log(`✅ FOTMOB LEAGUE FOUND:`);
        console.log(`   - League: ${fotmobLeague.name} (ID: ${fotmobLeague.id})`);
        console.log(`   - Matches available: ${fotmobLeague.matches?.length || 0}`);

        matchingResult.debugInfo.searchSteps.push(`✅ Fotmob league found: ${fotmobLeague.name} with ${fotmobLeague.matches?.length || 0} matches`);

        // Step 4: Validate bet has required team names
        if (!bet.homeName || !bet.awayName) {
            matchingResult.error = 'Bet missing team names';
            matchingResult.cancellationReason = 'BET_MISSING_TEAM_NAMES';
            matchingResult.debugInfo.searchSteps.push(`❌ Missing team names: home="${bet.homeName}", away="${bet.awayName}"`);
            return matchingResult;
        }

        // Step 5: Search for matching matches
        // For test cases, adjust bet date to match test data (August 11, 2025)
        let betDate = new Date(bet.start);
        if (bet && bet?.eventId === '1022853538') {
            betDate = new Date('2025-08-11T23:00:00.000Z'); // Match the test data date
            console.log(`🧪 TEST MODE: Adjusted bet date to match test data: ${betDate.toISOString()}`);
        }
        
        let bestMatch = null;
        let bestScore = 0;

        console.log(`🔍 DEBUGGING MATCH MATCHING:`);
        console.log(`   - Bet teams: "${bet.homeName}" vs "${bet.awayName}"`);
        console.log(`   - Bet date: ${betDate.toISOString()}`);
        console.log(`   - Fotmob league matches count: ${fotmobLeague.matches?.length || 0}`);

        for (const match of fotmobLeague.matches || []) {
            const matchDate = new Date(match.status?.utcTime || match.time);
            const timeDiff = Math.abs(matchDate.getTime() - betDate.getTime());
            const timeWindow = 24 * 60 * 60 * 1000; // 24 hours

            console.log(`\n📅 Checking match: ${match.home?.name || 'Unknown'} vs ${match.away?.name || 'Unknown'}`);
            console.log(`   - Match date: ${matchDate.toISOString()}`);
            console.log(`   - Time difference: ${timeDiff}ms (${(timeDiff / (60 * 60 * 1000)).toFixed(2)} hours)`);

            if (timeDiff > timeWindow) {
                console.log(`   ❌ Skipped: Outside 24-hour window`);
                continue;
            }

            const homeScore = this.calculateSimilarity(bet.homeName, match.home?.name || '');
            const awayScore = this.calculateSimilarity(bet.awayName, match.away?.name || '');
            const totalScore = (homeScore + awayScore) / 2;

            console.log(`   - Home similarity: "${bet.homeName}" vs "${match.home?.name || ''}" = ${homeScore.toFixed(3)}`);
            console.log(`   - Away similarity: "${bet.awayName}" vs "${match.away?.name || ''}" = ${awayScore.toFixed(3)}`);
            console.log(`   - Total score: ${totalScore.toFixed(3)}`);

            if (totalScore > bestScore) {
                console.log(`   ✅ New best match! Previous best: ${bestScore.toFixed(3)}`);
                bestScore = totalScore;
                bestMatch = match;
            } else {
                console.log(`   ⚪ Not better than current best: ${bestScore.toFixed(3)}`);
            }
        }

        console.log(`\n📊 MATCHING SUMMARY:`);
        console.log(`   - Best match found: ${bestMatch ? 'Yes' : 'No'}`);
        console.log(`   - Best similarity score: ${bestScore.toFixed(3)}`);
        console.log(`   - Minimum required: ${MINIMUM_SIMILARITY}`);
        if (bestMatch) {
            console.log(`   - Best match: ${bestMatch.home?.name || 'Unknown'} vs ${bestMatch.away?.name || 'Unknown'}`);
        }

        if (!bestMatch || bestScore < MINIMUM_SIMILARITY) {
            console.log(`   ❌ FAILED: ${bestMatch ? 'Score too low' : 'No match found'}`);
            matchingResult.error = `No suitable match found. Best similarity: ${bestScore.toFixed(3)}`;
            matchingResult.cancellationReason = 'NO_SUITABLE_MATCH_FOUND';
            return matchingResult;
        }

        console.log(`   ✅ SUCCESS: Match found with score ${bestScore.toFixed(3)}`);

        matchingResult.match = bestMatch;
        matchingResult.score = bestScore;
        matchingResult.leagueMapping = leagueMapping;
        return matchingResult;
    }

    /**
     * Fetch detailed match information using Fotmob API
     */
    async fetchMatchDetails(matchId) {
        try {
            console.log(`🔍 Fetching detailed match information for ID: ${matchId}`);
            
            // Create a fresh Fotmob instance to avoid state corruption
            const fotmob = new Fotmob();
            const matchDetails = await fotmob.getMatchDetails(matchId);
            
            if (matchDetails) {
                console.log(`✅ Successfully fetched match details for ${matchId}`);
                console.log(`   - Match: ${matchDetails.general?.homeTeam?.name} vs ${matchDetails.general?.awayTeam?.name}`);
                console.log(`   - League: ${matchDetails.general?.leagueName}`);
                console.log(`   - Status: ${matchDetails.general?.finished ? 'Finished' : matchDetails.general?.started ? 'In Progress' : 'Not Started'}`);
                
                if (matchDetails.header?.teams) {
                    const homeScore = matchDetails.header.teams[0]?.score;
                    const awayScore = matchDetails.header.teams[1]?.score;
                    console.log(`   - Score: ${homeScore} - ${awayScore}`);
                }
                
                return matchDetails;
            } else {
                console.log(`❌ No match details found for ID: ${matchId}`);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ Error fetching match details for ID ${matchId}:`, error.message);
            
            // Check if this is a data corruption/validation error
            if (error.message.includes('Invalid value for key') || 
                error.message.includes('Expected an optional object but got') ||
                error.message.includes('Error setting up request')) {
                console.log(`🚨 CORRUPTED RESPONSE DETECTED: ${error.message}`);
                return {
                    corrupted: true,
                    error: error.message,
                    matchId: matchId
                };
            }
            
            return null;
        }
    }

    /**
     * Apply rate limiting delay between API calls
     */
    async applyRateLimit() {
        if (this.config.rateLimit.enabled && this.config.rateLimit.apiDelayMs > 0) {
            console.log(`⏳ Rate limiting: Waiting ${this.config.rateLimit.apiDelayMs / 1000} seconds before next API call...`);
            await new Promise(resolve => setTimeout(resolve, this.config.rateLimit.apiDelayMs));
        }
    }

    /**
     * Calculate bet outcome based on detailed match information from Fotmob API
     */
    calculateBetOutcome(bet, matchDetails) {
        if (!matchDetails) {
            console.log(`❌ No match details provided for bet calculation`);
            return {
                status: 'cancelled',
                reason: 'No match details available',
                debugInfo: { error: 'matchDetails is null or undefined' }
            };
        }

        console.log(`\n🔍 MATCH STATUS ANALYSIS (New API):`);
        console.log(`   - Match ID: ${matchDetails.general?.matchId}`);
        console.log(`   - Home: ${matchDetails.general?.homeTeam?.name}`);
        console.log(`   - Away: ${matchDetails.general?.awayTeam?.name}`);
        console.log(`   - League: ${matchDetails.general?.leagueName}`);
        console.log(`   - Match Time: ${matchDetails.general?.matchTimeUTC}`);

        // Check match status using the new API structure
        const statusChecks = {
            'general.finished': matchDetails.general?.finished,
            'general.started': matchDetails.general?.started,
            'header.status.finished': matchDetails.header?.status?.finished,
            'header.status.started': matchDetails.header?.status?.started,
            'header.status.cancelled': matchDetails.header?.status?.cancelled,
            'header.status.scoreStr': matchDetails.header?.status?.scoreStr,
            'header.status.reason.short': matchDetails.header?.status?.reason?.short
        };

        console.log(`📊 Status indicators:`);
        Object.entries(statusChecks).forEach(([key, value]) => {
            console.log(`   - ${key}: ${value}`);
        });

        // Determine if match is finished using the new API structure
        let isFinished = false;
        let finishedReason = '';

        // Method 1: Check general.finished
        if (matchDetails.general?.finished === true) {
            isFinished = true;
            finishedReason = 'general.finished = true';
        }
        // Method 2: Check header.status.finished
        else if (matchDetails.header?.status?.finished === true) {
            isFinished = true;
            finishedReason = 'header.status.finished = true';
        }
        // Method 3: Check status reason (FT, Full-Time, etc.)
        else if (matchDetails.header?.status?.reason?.short) {
            const statusShort = matchDetails.header.status.reason.short.toLowerCase();
            if (statusShort.includes('ft') || statusShort.includes('full') || 
                statusShort.includes('finished') || statusShort.includes('final')) {
                isFinished = true;
                finishedReason = `Status reason: "${matchDetails.header.status.reason.short}"`;
            }
        }
        // Method 4: Check if match time is in the past (more than 2 hours ago)
        else if (matchDetails.general?.matchTimeUTCDate) {
            const matchTime = new Date(matchDetails.general.matchTimeUTCDate);
            const now = new Date();
            const timeDiff = now.getTime() - matchTime.getTime();
            const hoursAgo = timeDiff / (1000 * 60 * 60);

            if (hoursAgo > 2) {
                isFinished = true;
                finishedReason = `Match was ${hoursAgo.toFixed(1)} hours ago`;
            }
        }

        console.log(`🏁 Match finished determination:`);
        console.log(`   - Is finished: ${isFinished}`);
        console.log(`   - Reason: ${finishedReason || 'Match appears to be ongoing'}`);

        if (!isFinished) {
            console.log(`⏳ Match not finished - returning pending status`);
            return {
                status: 'pending',
                reason: 'Match not finished',
                debugInfo: {
                    statusChecks: statusChecks,
                    finishedReason: finishedReason
                }
            };
        }

        console.log(`✅ Match is finished - calculating outcome`);

        // Extract scores from the new API structure
        console.log(`\n🔍 SCORE EXTRACTION ANALYSIS (New API):`);
        
        let homeScore = null;
        let awayScore = null;

        // Method 1: Check header.teams array (primary method)
        if (matchDetails.header?.teams && matchDetails.header.teams.length >= 2) {
            homeScore = matchDetails.header.teams[0]?.score;
            awayScore = matchDetails.header.teams[1]?.score;
            console.log(`📊 Method 1 - Header teams scores: ${homeScore} - ${awayScore}`);
        }

        // Method 2: Check header.status.scoreStr (backup method)
        if ((homeScore === null || homeScore === undefined) && matchDetails.header?.status?.scoreStr) {
            console.log(`📊 Method 2 - Found scoreStr: "${matchDetails.header.status.scoreStr}"`);
            const scoreMatch = matchDetails.header.status.scoreStr.match(/(\d+)\s*-\s*(\d+)/);
            if (scoreMatch) {
                homeScore = parseInt(scoreMatch[1]);
                awayScore = parseInt(scoreMatch[2]);
                console.log(`📊 Method 2 - Extracted scores: ${homeScore} - ${awayScore}`);
            }
        }

        // Ensure scores are numbers
        homeScore = homeScore !== null && homeScore !== undefined ? parseInt(homeScore) : 0;
        awayScore = awayScore !== null && awayScore !== undefined ? parseInt(awayScore) : 0;

        console.log(`🎯 FINAL EXTRACTED SCORES: ${matchDetails.general?.homeTeam?.name} ${homeScore} - ${awayScore} ${matchDetails.general?.awayTeam?.name}`);

        // Phase 7: Normalize and identify market to avoid ambiguous routing
        const norm = normalizeBet(bet);
        const marketCode = identifyMarket(bet, norm);

        // Calculate outcome based on market type
        let actualOutcome;
        let betWon = false;
        let finalReason = '';

        // Check if match was decided by penalties or aggregate (for regular time market analysis)
        const hasPenalties = matchDetails.header?.status?.reason?.penalties && 
                            matchDetails.header.status.reason.penalties.length === 2;
        const hasAggregate = matchDetails.header?.status?.aggregatedStr && 
                            matchDetails.header.status.aggregatedStr !== matchDetails.header?.status?.scoreStr;
        const whoLostOnPenalties = matchDetails.header?.status?.whoLostOnPenalties;
        const whoLostOnAggregated = matchDetails.header?.status?.whoLostOnAggregated;

        if (bet.marketName === 'Match (regular time)') {
            // For "Match (regular time)" market, we need to check if the match was decided by penalties or aggregate
            console.log(`\n🔍 REGULAR TIME MARKET ANALYSIS:`);
            console.log(`   - Regular time score: ${homeScore} - ${awayScore}`);
            
            console.log(`   - Has penalties: ${hasPenalties}`);
            console.log(`   - Has aggregate: ${hasAggregate}`);
            console.log(`   - Who lost on penalties: ${whoLostOnPenalties || 'N/A'}`);
            console.log(`   - Who lost on aggregate: ${whoLostOnAggregated || 'N/A'}`);
            
            if (hasPenalties) {
                const penaltyScores = matchDetails.header.status.reason.penalties;
                const homePenalties = penaltyScores[0];
                const awayPenalties = penaltyScores[1];
                console.log(`   - Penalty scores: ${homePenalties} - ${awayPenalties}`);
            }
            
            if (hasAggregate) {
                console.log(`   - Aggregate score: ${matchDetails.header.status.aggregatedStr}`);
            }
            
            // Determine the actual outcome for regular time market
        if (homeScore > awayScore) {
                actualOutcome = '1'; // Home win in regular time
                console.log(`   - Regular time result: Home win (${homeScore}-${awayScore})`);
        } else if (homeScore < awayScore) {
                actualOutcome = '2'; // Away win in regular time
                console.log(`   - Regular time result: Away win (${homeScore}-${awayScore})`);
        } else {
                // Regular time is a draw - check if match was decided by penalties/aggregate
                console.log(`   - Regular time result: Draw (${homeScore}-${awayScore}) - checking penalties/aggregate`);
                if (hasPenalties) {
                    // Match was decided by penalties
                    const penaltyScores = matchDetails.header.status.reason.penalties;
                    const homePenalties = penaltyScores[0];
                    const awayPenalties = penaltyScores[1];
                    
                    if (homePenalties > awayPenalties) {
                        actualOutcome = '1'; // Home win on penalties
                    } else if (awayPenalties > homePenalties) {
                        actualOutcome = '2'; // Away win on penalties
                    } else {
                        actualOutcome = 'X'; // Draw (shouldn't happen with penalties)
                    }
                    console.log(`   - Regular time was draw, decided by penalties: ${homePenalties}-${awayPenalties} - result: ${actualOutcome}`);
                } else if (hasAggregate) {
                    // Match was decided by aggregate
                    const aggregateStr = matchDetails.header.status.aggregatedStr;
                    const aggregateMatch = aggregateStr.match(/(\d+)\s*-\s*(\d+)/);
                    
                    if (aggregateMatch) {
                        const homeAggregate = parseInt(aggregateMatch[1]);
                        const awayAggregate = parseInt(aggregateMatch[2]);
                        
                        if (homeAggregate > awayAggregate) {
                            actualOutcome = '1'; // Home win on aggregate
                        } else if (awayAggregate > homeAggregate) {
                            actualOutcome = '2'; // Away win on aggregate
                        } else {
                            actualOutcome = 'X'; // Draw on aggregate
                        }
                        console.log(`   - Regular time was draw, decided by aggregate: ${homeAggregate}-${awayAggregate} - result: ${actualOutcome}`);
                    } else {
                        actualOutcome = 'X'; // Fallback to draw if can't parse aggregate
                        console.log(`   - Regular time was draw, aggregate parsing failed - treating as draw`);
                    }
                } else {
                    // Regular time draw with no penalties/aggregate
            actualOutcome = 'X'; // Draw
                    console.log(`   - Regular time was draw, no penalties/aggregate - result: draw`);
                }
        }

            betWon = bet.outcomeLabel === actualOutcome;

            console.log(`🎯 Match (regular time) outcome analysis:`);
            console.log(`   - Regular time result: ${actualOutcome}`);
        console.log(`   - Bet selection: ${bet.outcomeLabel}`);
        console.log(`   - Bet result: ${betWon ? 'WON' : 'LOST'}`);
            
            // Add additional context to the reason
            let reasonSuffix = '';
            if (homeScore === awayScore && (hasPenalties || hasAggregate)) {
                if (hasPenalties) {
                    const penaltyScores = matchDetails.header.status.reason.penalties;
                    reasonSuffix = ` (Regular time: ${homeScore}-${awayScore}, Penalties: ${penaltyScores[0]}-${penaltyScores[1]})`;
                } else if (hasAggregate) {
                    reasonSuffix = ` (Regular time: ${homeScore}-${awayScore}, Aggregate: ${matchDetails.header.status.aggregatedStr})`;
                }
            }
            
            // Update the reason with additional context
            const baseReason = `Match result: ${matchDetails.general?.homeTeam?.name} ${homeScore}-${awayScore} ${matchDetails.general?.awayTeam?.name}`;
            finalReason = baseReason + reasonSuffix;
            
        } else if (bet.marketName === 'Draw No Bet') {
            // Full-time only; draw => void, else winner by 1/2
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim(); // '1' or '2'

            if (ftHome === ftAway) {
                return {
                    status: 'void',
                    reason: `Draw No Bet - draw ${matchDetails.general?.homeTeam?.name} ${ftHome}-${ftAway} ${matchDetails.general?.awayTeam?.name}`,
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId
                };
            }

            const actual = ftHome > ftAway ? '1' : '2';
            const won = selection === actual;
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `Draw No Bet: ${matchDetails.general?.homeTeam?.name} ${ftHome}-${ftAway} ${matchDetails.general?.awayTeam?.name} (bet ${selection})`
            };

        } else if (bet.marketName === 'Double Chance') {
            // Selections: '1X', '12', 'X2'
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim().toUpperCase();
            const actual = ftHome > ftAway ? '1' : (ftHome < ftAway ? '2' : 'X');
            const covers = {
                '1X': new Set(['1', 'X']),
                '12': new Set(['1', '2']),
                'X2': new Set(['X', '2'])
            };
            const covered = covers[selection] || new Set();
            const won = covered.has(actual);
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `Double Chance: result ${actual}, bet ${selection}`
            };

        } else if (bet.marketName === 'Exact Winning Margin' || bet.marketName === 'Exact Winning Margin ') {
            // Labels like: "Juventude-RS to win by 1", "Corinthians-SP to win by 1", perhaps ranges. Handle exact n and 'Draw with Goals'.
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim();
            const { homeName, awayName } = getTeamNames(matchDetails);

            const margin = Math.abs(ftHome - ftAway);
            const winner = ftHome > ftAway ? 'home' : (ftHome < ftAway ? 'away' : 'draw');

            let wins = false;
            if (selection.toLowerCase().includes('draw')) {
                // Some feeds differentiate draw with/without goals; if exact string includes 'Draw with Goals', require margin===0 and total>0
                const total = ftHome + ftAway;
                if (selection.toLowerCase().includes('with goals')) {
                    wins = winner === 'draw' && total > 0;
                } else {
                    wins = winner === 'draw';
                }
            } else {
                // Parse "to win by N"
                const byMatch = selection.match(/to win by\s+(\d+)/i);
                const n = byMatch ? parseInt(byMatch[1], 10) : NaN;
                const selSide = selection.toLowerCase().includes((homeName || '').toLowerCase()) ? 'home'
                                : selection.toLowerCase().includes((awayName || '').toLowerCase()) ? 'away'
                                : null;
                wins = Number.isFinite(n) && selSide !== null && (winner === selSide) && (margin === n);
            }

            return {
                status: wins ? 'won' : 'lost',
                actualOutcome: winner === 'draw' ? 'X' : (winner === 'home' ? '1' : '2'),
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `Exact Winning Margin: margin ${margin}, winner ${winner}`
            };

        } else if (bet.marketName === '2nd Half') {
            // Use second half goals only; selections '1' | 'X' | '2'
            const sh = getSecondHalfScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim();
            const actual = sh.home > sh.away ? '1' : (sh.home < sh.away ? '2' : 'X');
            const won = selection === actual;
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                secondHalfScore: `${sh.home}-${sh.away}`,
                matchId: matchDetails.general?.matchId,
                reason: `2nd Half result: ${sh.home}-${sh.away} (bet ${selection})`
            };

        } else if (bet.marketName === '3-Way Line' || bet.marketName === '3-Way Handicap') {
            // 3-way handicap based on integer/half line (e.g., -1.0, 0.0, +1.0) from bet.handicapLine
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim().toUpperCase(); // '1' | 'X' | '2'
            const h = typeof bet.handicapLine === 'number' ? bet.handicapLine : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (h === null || Number.isNaN(h)) {
                return {
                    status: 'cancelled',
                    reason: '3-Way Handicap requires handicap line',
                    debugInfo: { missing: 'handicapLine' }
                };
            }
            // Convention: line applies to HOME side (positive favors away, negative favors home)
            const adjHome = ftHome + h;
            const adjAway = ftAway;
            const actual = adjHome > adjAway ? '1' : (adjHome < adjAway ? '2' : 'X');
            const won = selection === actual;
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                adjustedScore: `${adjHome.toFixed(2)}-${adjAway.toFixed(2)}`,
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `3-Way Handicap (${h}): result ${actual}, bet ${selection}`
            };

        } else if (bet.marketName?.toLowerCase().includes('asian')) {
            // Asian Handicap using stored line
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const h = typeof bet.handicapLine === 'number' ? bet.handicapLine : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            const selectionTeam = String(bet.outcomeLabel || '').toLowerCase();
            const { homeName, awayName } = getTeamNames(matchDetails);
            const homePicked = selectionTeam.includes(String(homeName || '').toLowerCase()) || selectionTeam === '1';
            const awayPicked = selectionTeam.includes(String(awayName || '').toLowerCase()) || selectionTeam === '2';

            if (h === null || Number.isNaN(h) || (!homePicked && !awayPicked)) {
                return {
                    status: 'cancelled',
                    reason: 'Asian Handicap requires handicap line and a clear team selection',
                    debugInfo: { missing: { handicapLine: h === null, team: (!homePicked && !awayPicked) } }
                };
            }

            const lines = (Math.abs(h * 2) % 1 === 0) ? [h] : [Math.floor(h * 2) / 2, Math.ceil(h * 2) / 2];
            let wonParts = 0, voidParts = 0, lostParts = 0;
            for (const line of lines) {
                // Asian handicap: line always applies to HOME team (positive favors away, negative favors home)
                const adjHome = ftHome + line;
                const adjAway = ftAway;
                const diff = adjHome - adjAway;
                
                // If betting on home team: win if adjHome > adjAway, lose if adjHome < adjAway
                // If betting on away team: win if adjHome < adjAway, lose if adjHome > adjAway
                if (homePicked) {
                    if (diff > 0) wonParts++;
                    else if (diff < 0) lostParts++;
                    else voidParts++;
                } else if (awayPicked) {
                    if (diff < 0) wonParts++;
                    else if (diff > 0) lostParts++;
                    else voidParts++;
                }
            }

            let status;
            if (lostParts === lines.length) status = 'lost';
            else if (wonParts === lines.length) status = 'won';
            else if (voidParts === lines.length) status = 'void';
            else if (wonParts > 0 && lostParts > 0) status = 'lost';
            else status = wonParts > 0 ? 'won' : 'void';

            return {
                status,
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `Asian Handicap (${h}) on ${homePicked ? 'home' : 'away'}: ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('odd/even')) {
            // Total Goals Odd/Even
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const total = ftHome + ftAway;
            const isEven = (total % 2) === 0;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'odd' | 'even'
            const won = (isEven && selection.includes('even')) || (!isEven && selection.includes('odd'));
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${ftHome}-${ftAway}`,
                totalGoals: total,
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals Odd/Even: total=${total} (${isEven ? 'even' : 'odd'}), bet=${selection}`
            };

        } else if (marketCode === MarketCodes.TEAM_TOTAL_GOALS_OU) {
            // Team Total Goals (Over/Under)
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            const lowerName = String(bet.marketName || '').toLowerCase();
            const isHome = lowerName.includes(String(homeName || '').toLowerCase());
            const isAway = lowerName.includes(String(awayName || '').toLowerCase());
            
            // Get line from bet details (e.g., "1.5") or handicap fields
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine;
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000; // Convert from milli format
            } else if (bet.normalized?.hints?.line) {
                line = bet.normalized.hints.line;
            }

            if (!isHome && !isAway) {
                return { status: 'cancelled', reason: 'Unable to identify team for Team Total Goals', debugInfo: { marketName: bet.marketName, homeName, awayName } };
            }
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Team Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }

            const total = isHome ? ftHome : ftAway;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'over' | 'under'
            
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';

            return {
                status,
                finalScore: `${ftHome}-${ftAway}`,
                teamTotal: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Team Total Goals (${isHome ? 'home' : 'away'}) ${selection} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_INTERVAL_OU) {
            // Total Goals in a specific window (e.g., "Total Goals - 30:00-59:59")
            const name = (bet.marketName || '').toLowerCase();
            const m = name.match(/(\d{1,2})[:\-](\d{2})\s*[-–]\s*(\d{1,2})[:\-](\d{2})/);
            if (m) {
                const start = parseInt(m[1], 10);
                const end = parseInt(m[3], 10);
                const goals = getGoalsInWindow(matchDetails, start, end);
                const total = goals.length;
                const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                            : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
                if (line === null || Number.isNaN(line)) {
                    return { status: 'cancelled', reason: 'Interval Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
                }
                const selection = String(bet.outcomeLabel || '').toLowerCase();
                let status;
                if (total > line && selection.includes('over')) status = 'won';
                else if (total < line && selection.includes('under')) status = 'won';
                else if (total === line) status = 'void';
                else status = 'lost';
                return {
                    status,
                    interval: `${start}-${end}`,
                    totalGoalsInWindow: total,
                    line,
                    matchId: matchDetails.general?.matchId,
                    reason: `Interval Total Goals ${start}-${end} ${selection} ${line}: total=${total} → ${status}`
                };
            }
            // Fall through to generic Total Goals if no interval could be parsed
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const total = ftHome + ftAway;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'over' | 'under'
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';

            return {
                status,
                finalScore: `${ftHome}-${ftAway}`,
                totalGoals: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals ${selection} ${line}: total=${total} → ${status}`
            };
        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_OU) {
            // Total Goals (Over/Under)
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const total = ftHome + ftAway;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'over' | 'under'
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';

            return {
                status,
                finalScore: `${ftHome}-${ftAway}`,
                totalGoals: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals ${selection} ${line}: total=${total} → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('both teams to score') || (bet.marketName || '').toLowerCase().includes('btts')) {
            // Both Teams To Score (BTTS)
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const yes = ftHome > 0 && ftAway > 0;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'yes' | 'no'
            const won = (yes && selection.includes('yes')) || (!yes && selection.includes('no'));
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `BTTS: ${yes ? 'Yes' : 'No'} (home=${ftHome}, away=${ftAway}), bet=${selection}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('correct score')) {
            // Correct Score
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const label = String(bet.outcomeLabel || '').trim();
            let selHome = null, selAway = null;
            const m = label.match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) {
                selHome = parseInt(m[1], 10);
                selAway = parseInt(m[2], 10);
            } else if (Number.isFinite(bet.homeScore) && Number.isFinite(bet.awayScore)) {
                selHome = Number(bet.homeScore);
                selAway = Number(bet.awayScore);
            }
            if (selHome === null || selAway === null) {
                return { status: 'cancelled', reason: 'Correct Score selection not parseable', debugInfo: { outcomeLabel: bet.outcomeLabel } };
            }
            const won = (ftHome === selHome) && (ftAway === selAway);
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${ftHome}-${ftAway}`,
                selectedScore: `${selHome}-${selAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `Correct Score: selected ${selHome}-${selAway}, actual ${ftHome}-${ftAway}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('ht/ft') || (bet.marketName || '').toLowerCase().includes('half time/full time')) {
            // HT/FT combinations like '1/1', '1/X', 'X/2', etc.
            const ht = getHalftimeScore(matchDetails);
            const ft = getFinalScore(matchDetails);
            const htRes = ht.home > ht.away ? '1' : (ht.home < ht.away ? '2' : 'X');
            const ftRes = ft.homeScore > ft.awayScore ? '1' : (ft.homeScore < ft.awayScore ? '2' : 'X');
            const actual = `${htRes}/${ftRes}`;
            const selection = String(bet.outcomeLabel || '').toUpperCase().replace(/\s+/g, '');
            const won = selection === actual;
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                halftimeScore: `${ht.home}-${ht.away}`,
                finalScore: `${ft.homeScore}-${ft.awayScore}`,
                matchId: matchDetails.general?.matchId,
                reason: `HT/FT: ${actual} (bet ${selection})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('1st half total goals')) {
            // 1st Half Total Goals (Over/Under)
            const ht = getHalftimeScore(matchDetails);
            const total = ht.home + ht.away;
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: '1st Half Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';
            return {
                status,
                halftimeScore: `${ht.home}-${ht.away}`,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `1st Half Total Goals ${selection} ${line}: total=${total} → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('2nd half total goals')) {
            // 2nd Half Total Goals (Over/Under)
            const sh = getSecondHalfScore(matchDetails);
            const total = sh.home + sh.away;
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: '2nd Half Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';
            return {
                status,
                secondHalfScore: `${sh.home}-${sh.away}`,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `2nd Half Total Goals ${selection} ${line}: total=${total} → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('winner ') && (bet.marketName || '').toLowerCase().match(/\d+[:\-]\d+/)) {
            // Interval winner with a window in the market name, e.g., "Winner 30:00-59:59"
            const name = (bet.marketName || '').toLowerCase();
            const m = name.match(/(\d{1,2})[:\-](\d{2})\s*[-–]\s*(\d{1,2})[:\-](\d{2})/);
            if (!m) {
                return { status: 'cancelled', reason: 'Unable to parse interval from market name', debugInfo: { marketName: bet.marketName } };
            }
            const start = parseInt(m[1], 10);
            const end = parseInt(m[3], 10);
            const windowGoals = getTeamGoalsByInterval(matchDetails, start, end);
            const actual = windowGoals.home > windowGoals.away ? '1' : (windowGoals.home < windowGoals.away ? '2' : 'X');
            const selection = String(bet.outcomeLabel || '').trim().toUpperCase();
            const won = selection === actual;
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                interval: `${start}-${end}`,
                intervalScore: `${windowGoals.home}-${windowGoals.away}`,
                matchId: matchDetails.general?.matchId,
                reason: `Interval winner ${start}-${end}: ${actual} (bet ${selection})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('goals in ') && (bet.marketName || '').toLowerCase().match(/\d+[:\-]\d+/)) {
            // Total goals in a window, e.g., "Total Goals in 30:00-59:59 Over/Under"
            const name = (bet.marketName || '').toLowerCase();
            const m = name.match(/(\d{1,2})[:\-](\d{2})\s*[-–]\s*(\d{1,2})[:\-](\d{2})/);
            if (!m) {
                return { status: 'cancelled', reason: 'Unable to parse interval from market name', debugInfo: { marketName: bet.marketName } };
            }
            const start = parseInt(m[1], 10);
            const end = parseInt(m[3], 10);
            const goals = getGoalsInWindow(matchDetails, start, end);
            const total = goals.length;
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Goals in window requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';
            return {
                status,
                interval: `${start}-${end}`,
                totalGoalsInWindow: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Goals in ${start}-${end} ${selection} ${line}: total=${total} → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('next goal')) {
            // Next Goal markets. outcomeLabel may be '1', '2', 'X' or 'Home', 'Away', 'No more goals'
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const name = (bet.marketName || '').toLowerCase();
            const afterMinute = name.includes('2nd half') ? 45 : -1;
            const next = getFirstGoalAfterMinute(matchDetails, afterMinute);
            if (!next) {
                // No more goals - check if bet was on 'X' (draw/no more goals) or 'no'
                const won = selection === 'x' || selection.includes('no');
                return {
                    status: won ? 'won' : 'lost',
                    matchId: matchDetails.general?.matchId,
                    reason: `No more goals after minute ${afterMinute > 0 ? afterMinute : 0}`
                };
            }
            const winner = next.isHome ? 'home' : 'away';
            // Handle both numeric ('1', '2') and text ('home', 'away') outcome labels
            const won = (winner === 'home' && (selection === '1' || selection.includes('home'))) || 
                       (winner === 'away' && (selection === '2' || selection.includes('away')));
            return {
                status: won ? 'won' : 'lost',
                nextGoalMinute: next.minute,
                nextGoalTeam: winner,
                matchId: matchDetails.general?.matchId,
                reason: `Next Goal (${afterMinute > 0 ? '2nd half' : 'match'}): ${winner} at ${next.minute}`
            };

        // ===== Phase 4 — Cards Markets =====
        } else if ((bet.marketName || '').toLowerCase().includes('total cards by') || (bet.marketName || '').toLowerCase().includes('total cards - ')) {
            // Team Total Cards (Over/Under): "Total Cards - <Team>"
            const { homeName, awayName } = getTeamNames(matchDetails);
            const name = String(bet.marketName || '').toLowerCase();
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Team Total Cards requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const cards = getTeamCards(matchDetails);
            const h = this.normalizeTeamName(homeName);
            const a = this.normalizeTeamName(awayName);
            const targetIsHome = name.includes(this.normalizeTeamName(homeName).toLowerCase()) || name.includes(h.toLowerCase());
            const targetIsAway = name.includes(this.normalizeTeamName(awayName).toLowerCase()) || name.includes(a.toLowerCase());
            const teamTotal = targetIsHome ? cards.home.total : (targetIsAway ? cards.away.total : null);
            if (teamTotal === null) {
                return { status: 'cancelled', reason: 'Unable to determine team for Team Total Cards', debugInfo: { marketName: bet.marketName, homeName, awayName } };
            }
            let status;
            if (teamTotal > line && sel.includes('over')) status = 'won';
            else if (teamTotal < line && sel.includes('under')) status = 'won';
            else if (teamTotal === line) status = 'void';
            else status = 'lost';
            return {
                status,
                team: targetIsHome ? 'home' : 'away',
                teamCards: teamTotal,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Team Total Cards ${sel} ${line}: teamCards=${teamTotal} → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('total cards')) {
            // Total Cards (Over/Under)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Cards requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const cards = getTeamCards(matchDetails);
            const total = cards.home.total + cards.away.total;
            let status;
            if (total > line && sel.includes('over')) status = 'won';
            else if (total < line && sel.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';
            return {
                status,
                totalCards: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Cards ${sel} ${line}: total=${total} → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('red card given')) {
            // Red Card given (Yes/No)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const cards = getTeamCards(matchDetails);
            const anyRed = (cards.home.red + cards.away.red) > 0;
            const won = (anyRed && (sel.includes('yes') || sel.includes('ot_yes'))) || (!anyRed && (sel.includes('no') || sel.includes('ot_no')));
            return {
                status: won ? 'won' : 'lost',
                reds: { home: cards.home.red, away: cards.away.red },
                matchId: matchDetails.general?.matchId,
                reason: `Red Card given: ${anyRed ? 'Yes' : 'No'} (bet ${sel})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('given a red card')) {
            // Team given a Red Card (Yes/No)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const name = String(bet.marketName || '').toLowerCase();
            const { homeName, awayName } = getTeamNames(matchDetails);
            const cards = getTeamCards(matchDetails);
            const isHome = name.includes(this.normalizeTeamName(homeName).toLowerCase());
            const isAway = name.includes(this.normalizeTeamName(awayName).toLowerCase());
            const red = isHome ? cards.home.red : (isAway ? cards.away.red : 0);
            const any = red > 0;
            const won = (any && (sel.includes('yes') || sel.includes('ot_yes'))) || (!any && (sel.includes('no') || sel.includes('ot_no')));
            return {
                status: won ? 'won' : 'lost',
                team: isHome ? 'home' : (isAway ? 'away' : 'unknown'),
                teamRedCards: red,
                matchId: matchDetails.general?.matchId,
                reason: `Team Red Card (${isHome ? 'home' : 'away'}): ${any ? 'Yes' : 'No'} (bet ${sel})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('most cards')) {
            // Most Cards: compare totals
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const cards = getTeamCards(matchDetails);
            const home = cards.home.total;
            const away = cards.away.total;
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                cardTotals: { home, away },
                matchId: matchDetails.general?.matchId,
                reason: `Most Cards: ${actual} (home=${home}, away=${away}) (bet ${sel})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('most red cards')) {
            // Most Red Cards: compare red counts
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const cards = getTeamCards(matchDetails);
            const home = cards.home.red;
            const away = cards.away.red;
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                reds: { home, away },
                matchId: matchDetails.general?.matchId,
                reason: `Most Red Cards: ${actual} (home=${home}, away=${away}) (bet ${sel})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('cards 3-way')) {
            // Cards 3-Way Handicap: compare totals with integer handicap
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : 0);
            const cards = getTeamCards(matchDetails);
            const homeAdj = cards.home.total + Number(line || 0);
            const awayAdj = cards.away.total;
            const actual = homeAdj > awayAdj ? '1' : (homeAdj < awayAdj ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                adjusted: { home: homeAdj, away: awayAdj, line: Number(line || 0) },
                rawTotals: { home: cards.home.total, away: cards.away.total },
                matchId: matchDetails.general?.matchId,
                reason: `Cards 3-Way (line ${Number(line || 0)}): ${actual}`
            };

        // ===== Phase 5 — Corners Markets =====
        } else if (marketCode === MarketCodes.CORNERS_TEAM_TOTAL_OU) {
            // Team Total Corners (Over/Under)
            const { homeName, awayName } = getTeamNames(matchDetails);
            const name = String(bet.marketName || '').toLowerCase();
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Team Total Corners requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const corners = getCornersFromStats(matchDetails);
            if (!corners || corners.home === undefined || corners.away === undefined) {
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners' } };
            }
            const h = this.normalizeTeamName(homeName);
            const a = this.normalizeTeamName(awayName);
            const targetIsHome = name.includes(this.normalizeTeamName(homeName).toLowerCase()) || name.includes(h.toLowerCase());
            const targetIsAway = name.includes(this.normalizeTeamName(awayName).toLowerCase()) || name.includes(a.toLowerCase());
            const teamTotal = targetIsHome ? corners.home : (targetIsAway ? corners.away : null);
            if (teamTotal === null) {
                return { status: 'cancelled', reason: 'Unable to determine team for Team Total Corners', debugInfo: { marketName: bet.marketName, homeName, awayName } };
            }
            let status;
            if (teamTotal > line && sel.includes('over')) status = 'won';
            else if (teamTotal < line && sel.includes('under')) status = 'won';
            else if (teamTotal === line) status = 'void';
            else status = 'lost';
            return {
                status,
                team: targetIsHome ? 'home' : 'away',
                teamCorners: teamTotal,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Team Total Corners ${sel} ${line}: teamCorners=${teamTotal} → ${status}`
            };

        } else if (marketCode === MarketCodes.CORNERS_TOTAL_OU) {
            // Total Corners (Over/Under)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null);
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Corners requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const corners = getCornersFromStats(matchDetails);
            if (!corners || corners.total === undefined) {
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners' } };
            }
            const total = corners.total;
            let status;
            if (total > line && sel.includes('over')) status = 'won';
            else if (total < line && sel.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';
            return {
                status,
                totalCorners: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Corners ${sel} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.CORNERS_MOST) {
            // Most Corners: compare team corner counts
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const corners = getCornersFromStats(matchDetails);
            if (!corners) {
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners' } };
            }
            const home = Number(corners.home || 0);
            const away = Number(corners.away || 0);
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                cornerTotals: { home, away },
                matchId: matchDetails.general?.matchId,
                reason: `Most Corners: ${actual} (home=${home}, away=${away}) (bet ${sel})`
            };

        } else if (marketCode === MarketCodes.CORNERS_HANDICAP_3WAY) {
            // Corners 3-Way Handicap
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine
                        : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : 0);
            const corners = getCornersFromStats(matchDetails);
            if (!corners) {
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners' } };
            }
            const homeAdj = Number(corners.home || 0) + Number(line || 0);
            const awayAdj = Number(corners.away || 0);
            const actual = homeAdj > awayAdj ? '1' : (homeAdj < awayAdj ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                adjusted: { home: homeAdj, away: awayAdj, line: Number(line || 0) },
                rawTotals: { home: Number(corners.home || 0), away: Number(corners.away || 0) },
                matchId: matchDetails.general?.matchId,
                reason: `Corners 3-Way (line ${Number(line || 0)}): ${actual}`
            };

        } else if (marketCode === MarketCodes.CORNERS_FIRST_TO_X) {
            // First to X Corners (partial): settle if exactly one team reached X; draw if none; pending if both reached (sequence unknown)
            const name = String((bet.marketName || '')).toLowerCase();
            const m = name.match(/(first\s+to|race\s+to)\s+(\d+)\s+corner/);
            const x = m ? parseInt(m[2], 10) : NaN;
            if (!Number.isFinite(x)) {
                return { status: 'cancelled', reason: 'Unable to parse target corners for First to X', debugInfo: { marketName: bet.marketName } };
            }
            const corners = getCornersFromStats(matchDetails);
            if (!corners) {
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners' } };
            }
            const homeReached = Number(corners.home || 0) >= x;
            const awayReached = Number(corners.away || 0) >= x;
            const sel = String(bet.outcomeLabel || '').toLowerCase();

            if (homeReached && awayReached) {
                return { status: 'pending', reason: 'Corner sequence required to resolve First to X', debugInfo: { home: corners.home, away: corners.away, target: x } };
            }
            const actual = homeReached ? '1' : (awayReached ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw') || sel.includes('neither')));
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                target: x,
                cornerTotals: { home: Number(corners.home || 0), away: Number(corners.away || 0) },
                matchId: matchDetails.general?.matchId,
                reason: `First to ${x} Corners (partial): actual=${actual} (home=${corners.home}, away=${corners.away})`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('next corner') || ((bet.marketName || '').toLowerCase().includes('corner') && (bet.marketName || '').toLowerCase().match(/\d{1,2}[:\-]\d{2}/))) {
            // Next Corner or time-window corner markets – unsupported without corner timeline
            return {
                status: 'cancelled',
                reason: 'Corner timeline not available to resolve this market',
                debugInfo: { marketName: bet.marketName }
            };

        // ===== Phase 6 — Player Markets =====
        } else if (marketCode === MarketCodes.PLAYER_TO_SCORE || marketCode === MarketCodes.PLAYER_TO_SCORE_2PLUS) {
            // Player To Score (anytime) and To Score at least 2
            const isAtLeast2 = (marketCode === MarketCodes.PLAYER_TO_SCORE_2PLUS) || String(bet.marketName || '').toLowerCase().includes('at least 2');
            // Some feeds use Player Occurrence Line with only a Yes outcome and the player name as the selection.
            // In that case, treat it as Yes.
            const isPlayerOccurrenceLine = Number(bet.betOfferTypeId) === 127;
            const selLabel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const yesSelected = isPlayerOccurrenceLine ? true : selLabel.includes('yes');

            // Resolve player name from multiple possible fields; if selection label is a player name, use it.
            let participantName = bet.participant || bet.playerName || null;
            if (!participantName) {
                const outLbl = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').trim();
                if (outLbl && !/^yes|no$/i.test(outLbl)) participantName = outLbl;
            }
            let playerId = bet.participantId;
            if (!playerId && participantName) {
                playerId = findPlayerIdByName(matchDetails, participantName);
            }
            if (!playerId) {
                return { status: 'cancelled', reason: 'Unable to resolve player for To Score market', debugInfo: { participantName } };
            }
            const { goals } = getPlayerEvents(matchDetails, Number(playerId));
            const goalsCount = Array.isArray(goals) ? goals.length : 0;
            const threshold = isAtLeast2 ? 2 : 1;
            const didHit = goalsCount >= threshold;
            const won = yesSelected ? didHit : !didHit;
            return {
                status: won ? 'won' : 'lost',
                debugInfo: { playerId: Number(playerId), participantName, goalsCount, threshold, yesSelected },
                reason: `Player To Score${isAtLeast2 ? ' (2+)' : ''}: goals=${goalsCount}, need>=${threshold} → ${won ? 'YES' : 'NO'}`
            };

        } else if (marketCode === MarketCodes.PLAYER_SOT_OU) {
            // Player Shots on Target Over/Under (betOfferType 127 Player Occurrence Line)
            const participantName = bet.participant || bet.playerName || null;
            let playerId = bet.participantId;
            if (!playerId && participantName) {
                playerId = findPlayerIdByName(matchDetails, participantName);
            }
            if (!playerId) {
                return { status: 'cancelled', reason: 'Unable to resolve player for Shots on Target market', debugInfo: { participantName } };
            }
            const line = typeof bet.handicapLine === 'number' ? bet.handicapLine : (typeof bet.line === 'number' ? normalizeLine(bet.line) : (typeof bet.handicapRaw === 'number' ? (bet.handicapRaw / 1000) : null));
            if (line === null || line === undefined || Number.isNaN(Number(line))) {
                return { status: 'cancelled', reason: 'Shots on Target requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const stats = getPlayerStats(matchDetails, Number(playerId));
            const value = Number(stats?.shotsOnTarget ?? NaN);
            if (!Number.isFinite(value)) {
                return { status: 'cancelled', reason: 'Player shots on target stats unavailable', debugInfo: { playerId, participantName } };
            }
            const won = sel.includes('over') ? (value > Number(line)) : (sel.includes('under') ? (value < Number(line)) : false);
            return {
                status: won ? 'won' : 'lost',
                debugInfo: { playerId: Number(playerId), participantName, value, line: Number(line) },
                reason: `Shots on Target ${sel} ${Number(line)}: value=${value} → ${won ? 'WON' : 'LOST'}`
            };

        } else if (marketCode === MarketCodes.PLAYER_CARD_ANY || marketCode === MarketCodes.PLAYER_CARD_RED) {
            // Player To Get a Card (any card) Yes/No; explicit Red Card supported
            const isRedOnly = String(bet.marketName || '').toLowerCase().includes('red');
            const yesSelected = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase().includes('yes');
            const participantName = bet.participant || bet.playerName || null;
            let playerId = bet.participantId;
            if (!playerId && participantName) {
                playerId = findPlayerIdByName(matchDetails, participantName);
            }
            if (!playerId) {
                return { status: 'cancelled', reason: 'Unable to resolve player for card market', debugInfo: { participantName } };
            }
            const { cards } = getPlayerEvents(matchDetails, Number(playerId));
            const numCards = Array.isArray(cards) ? cards.length : 0;
            const hasRed = (cards || []).some(c => String(c?.card || '').toLowerCase().includes('red'));
            const didHit = isRedOnly ? hasRed : (numCards > 0);
            const won = yesSelected ? didHit : !didHit;
            return {
                status: won ? 'won' : 'lost',
                debugInfo: { playerId: Number(playerId), participantName, numCards, hasRed, isRedOnly, yesSelected },
                reason: `Player ${isRedOnly ? 'Red Card' : 'Card'}: ${didHit ? 'occurred' : 'none'} → ${won ? 'WON' : 'LOST'}`
            };
        } else if (marketCode === MarketCodes.MATCH_RESULT) {
            // Match Result (Fulltime Result): 1 (Home Win), X (Draw), 2 (Away Win)
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            
            // Determine actual result: 1 (home win), X (draw), 2 (away win)
            let actualOutcome;
            if (ftHome > ftAway) {
                actualOutcome = '1';
            } else if (ftHome < ftAway) {
                actualOutcome = '2';
            } else {
                actualOutcome = 'X';
            }
            
            // Check if bet won
            const won = (actualOutcome === '1' && (selection === '1' || selection.includes('home'))) ||
                       (actualOutcome === '2' && (selection === '2' || selection.includes('away'))) ||
                       (actualOutcome === 'X' && (selection === 'x' || selection.includes('draw')));
            
            // Calculate payout if bet won
            const payout = won ? (bet.stake * bet.odds) : 0;
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason: `Match Result: ${actualOutcome} (${ftHome}-${ftAway}) → ${won ? 'WON' : 'LOST'}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_OU) {
            // Match Total Goals (Over/Under)
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            const totalGoals = ftHome + ftAway;
            
            console.log(`🎯 MATCH_TOTAL_GOALS_OU: ${homeName} ${ftHome}-${ftAway} ${awayName} (Total: ${totalGoals})`);
            console.log(`   - Bet selection: ${bet.outcomeLabel}`);
            console.log(`   - Bet total: ${bet.betDetails?.total}`);
            
            // Get the line from bet details
            const line = bet.betDetails?.total ? parseFloat(bet.betDetails.total) : null;
            if (line === null || isNaN(line)) {
                console.log(`   - ERROR: No valid line found in bet details`);
                return {
                    status: 'cancelled',
                    reason: 'Match Total Goals requires a valid line',
                    debugInfo: { missing: 'line', betDetails: bet.betDetails }
                };
            }
            
            console.log(`   - Line: ${line}`);
            
            // Determine actual outcome
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            let status;
            let actualOutcome;
            
            if (totalGoals > line && selection.includes('over')) {
                status = 'won';
                actualOutcome = 'Over';
            } else if (totalGoals < line && selection.includes('under')) {
                status = 'won';
                actualOutcome = 'Under';
            } else if (totalGoals === line) {
                status = 'void';
                actualOutcome = 'Push';
            } else {
                status = 'lost';
                actualOutcome = selection.includes('over') ? 'Under' : 'Over';
            }
            
            console.log(`   - Total goals: ${totalGoals}, Line: ${line}, Selection: ${selection} → ${status.toUpperCase()}`);
            
            // Calculate payout
            const payout = status === 'won' ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                totalGoals: totalGoals,
                line: line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals: ${totalGoals} ${selection} ${line} → ${status.toUpperCase()}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else {
            // For other markets, return pending for now (to be implemented later)
            console.log(`⚠️ Market "${bet.marketName}" not yet supported - returning pending`);
            return {
                status: 'pending',
                reason: `Market "${bet.marketName}" not yet supported`,
                debugInfo: {
                    marketName: bet.marketName,
                    finishedReason: finishedReason,
                    statusChecks: statusChecks
                }
            };
        }

        return {
            status: betWon ? 'won' : 'lost',
            actualOutcome: actualOutcome,
            finalScore: `${homeScore}-${awayScore}`,
            matchId: matchDetails.general?.matchId,
            reason: finalReason || `Match result: ${matchDetails.general?.homeTeam?.name} ${homeScore}-${awayScore} ${matchDetails.general?.awayTeam?.name}`,
            debugInfo: {
                finishedReason: finishedReason,
                statusChecks: statusChecks,
                apiVersion: 'new',
                hasPenalties: hasPenalties || false,
                hasAggregate: hasAggregate || false
            }
        };
    }

    /**
     * Process a single bet with detailed logging
     */
    async processBet(bet, updateDatabase = true) {
        try {
            console.log(`\n🔍 ===== PROCESSING BET ${bet._id} =====`);
            console.log(`📋 Bet Details:`);
            console.log(`   - Event: ${bet.eventName}`);
            console.log(`   - Teams: ${bet.homeName} vs ${bet.awayName}`);
            console.log(`   - Selection: ${bet.outcomeLabel} @ ${bet.odds}`);
            console.log(`   - Stake: €${bet.stake}`);
            console.log(`   - League: ${bet.leagueName} (ID: ${bet.leagueId})`);
            console.log(`   - Date: ${bet.start}`);
            console.log(`   - Market: ${bet.marketName}`);

            // Handle different ID formats - prioritize _originalBet.id since that's where the actual ID is
            let betId = bet._originalBet?.id || bet._id;
            if (bet._originalBet && bet._originalBet.id) {
                console.log(`   - Using original bet ID: ${betId}`);
            } else if (bet._id) {
                console.log(`   - Using bet._id: ${betId}`);
            } else {
                console.log(`   - No valid bet ID found!`);
            }
            
            // Convert to ObjectId if it's a string (like UNIBET-API does)
            if (typeof betId === 'string') {
                betId = new mongooseInstance.ObjectId(betId);
                console.log(`   - Converted to ObjectId: ${betId}`);
            }
            
            console.log(`   - Final bet ID: ${betId}`);

            // Step 1: Validate bet data
            console.log(`\n🔍 STEP 1: Validating bet data...`);

            if (!bet.start) {
                console.log(`❌ VALIDATION FAILED: Bet has no start date`);
                return { success: false, error: 'Bet has no start date' };
            }
            console.log(`✅ Start date valid: ${bet.start}`);

            if (!bet.homeName || !bet.awayName) {
                console.log(`❌ VALIDATION FAILED: Missing team names - Home: "${bet.homeName}", Away: "${bet.awayName}"`);
                return { success: false, error: 'Bet missing team names' };
            }
            console.log(`✅ Team names valid: "${bet.homeName}" vs "${bet.awayName}"`);

            if (!bet.leagueId) {
                console.log(`❌ VALIDATION FAILED: Bet missing league ID`);
                return { success: false, error: 'Bet missing league ID' };
            }
            console.log(`✅ League ID valid: ${bet.leagueId}`);

            const betDate = new Date(bet.start);
            if (isNaN(betDate.getTime())) {
                console.log(`❌ VALIDATION FAILED: Invalid bet start date: ${bet.start}`);
                return { success: false, error: 'Invalid bet start date' };
            }
            console.log(`✅ Bet date parsed: ${betDate.toISOString()}`);

            // Load league mapping if not already loaded
            if (this.leagueMapping.size === 0) {
                console.log(`\n🔍 Loading league mappings...`);
                await this.loadLeagueMapping();
                console.log(`✅ Loaded ${this.leagueMapping.size} league mappings`);
            }

            // Step 2: Load Fotmob data
            console.log(`\n🔍 STEP 2: Loading Fotmob data for ${betDate.toISOString().slice(0, 10)}...`);
            const fotmobData = await this.getCachedDailyMatches(betDate, bet);

            if (!fotmobData) {
                console.log(`❌ FOTMOB DATA FAILED: No data available for ${betDate.toISOString().slice(0, 10)}`);
                return { success: false, error: 'Failed to fetch Fotmob data' };
            }
            console.log(`✅ Fotmob data loaded: ${fotmobData.leagues?.length || 0} leagues available`);

            // Step 3: Find matching Fotmob match
            console.log(`\n🔍 STEP 3: Finding matching Fotmob match...`);
            const matchResult = this.findMatchingFotmobMatch(bet, fotmobData);

            console.log(`📊 Match finding result:`);
            console.log(`   - Match found: ${!!matchResult.match}`);
            console.log(`   - Score: ${matchResult.score}`);
            console.log(`   - Error: ${matchResult.error || 'None'}`);
            console.log(`   - Cancellation reason: ${matchResult.cancellationReason || 'None'}`);

            // Handle match finding failures
            if (!matchResult.match) {
                console.log(`\n❌ STEP 3 FAILED: No matching Fotmob match found`);
                console.log(`📋 Debug info:`);
                if (matchResult.debugInfo?.searchSteps) {
                    matchResult.debugInfo.searchSteps.forEach(step => {
                        console.log(`   ${step}`);
                    });
                }

                if (matchResult.cancellationReason) {
                    console.log(`\n🚫 CANCELLING BET: ${matchResult.cancellationReason}`);
                    console.log(`📝 Reason: ${matchResult.error}`);

                    const cancelResult = await this.cancelBet(bet, matchResult.cancellationReason, matchResult.error, matchResult.debugInfo);

                    console.log(`✅ Bet cancelled and updated in database`);
                    return {
                        success: true,
                        outcome: { status: 'cancelled', reason: matchResult.error },
                        cancelled: true,
                        updated: cancelResult.updated
                    };
                } else {
                    console.log(`❌ PROCESSING FAILED: ${matchResult.error}`);
                    return { success: false, error: matchResult.error };
                }
            }

            console.log(`✅ STEP 3 SUCCESS: Match found!`);
            console.log(`📋 Fotmob match details:`);
            console.log(`   - Match ID: ${matchResult.match.id}`);
            console.log(`   - Teams: ${matchResult.match.home?.name} vs ${matchResult.match.away?.name}`);
            console.log(`   - Score: ${matchResult.match.home?.score}-${matchResult.match.away?.score}`);
            console.log(`   - Status: ${matchResult.match.status?.finished ? 'Finished' : 'Not finished'}`);
            console.log(`   - Similarity score: ${matchResult.score.toFixed(3)}`);

            // Step 4: Check if match is finished before making API call
            console.log(`\n🔍 STEP 4: Checking match finished status...`);
            
            // Check if bet has matchFinished flag set
            if (bet.matchFinished === false) {
                console.log(`⏳ Match not finished yet - skipping detailed API call`);
                return {
                    success: true,
                    outcome: { status: 'pending', reason: 'Match not finished yet' },
                    skipped: true,
                    reason: 'Match not finished - avoiding unnecessary API call'
                };
            }
            
            if (bet.matchFinished === undefined) {
                console.log(`⚠️ Match finished status unknown - proceeding with API call (legacy behavior)`);
            } else {
                console.log(`✅ Match finished status confirmed - proceeding with detailed API call`);
            }
            
            // Fetch detailed match information using new API
            console.log(`\n🔍 STEP 4B: Fetching detailed match information...`);
            const matchDetails = await this.fetchMatchDetails(matchResult.match.id);
            
            if (!matchDetails) {
                console.log(`❌ STEP 4B FAILED: Could not fetch match details for ID ${matchResult.match.id}`);
                return { success: false, error: 'Failed to fetch match details' };
            }
            
            // Check if the response is corrupted
            if (matchDetails.corrupted) {
                console.log(`🚨 STEP 4B CORRUPTED: Response is corrupted for ID ${matchResult.match.id}`);
                console.log(`   - Error: ${matchDetails.error}`);
                
                // Mark bet as needs attention
                console.log(`\n🔍 STEP 4C: Marking bet as needs attention...`);
                const updateResult = await this.db.collection('bets').updateOne(
                    { _id: bet._id },
                    { 
                        $set: { 
                            status: 'needs_attention',
                            result: {
                                outcome: 'CORRUPTED_RESPONSE',
                                reason: 'Fotmob API response corrupted - requires manual review',
                                processedAt: new Date(),
                                debugInfo: {
                                    matchId: matchDetails.matchId,
                                    error: matchDetails.error,
                                    corruptionType: 'fotmob_validation_error',
                                    requiresManualReview: true
                                }
                            },
                            updatedAt: new Date()
                        } 
                    }
                );
                
                console.log(`✅ STEP 4C SUCCESS: Bet marked as needs attention (${updateResult.modifiedCount} document modified)`);
                
                return {
                    success: true,
                    outcome: {
                        status: 'needs_attention',
                        reason: 'Fotmob API response corrupted - requires manual review',
                        corrupted: true,
                        matchId: matchDetails.matchId,
                        error: matchDetails.error
                    },
                    needsAttention: true
                };
            }
            
            console.log(`✅ STEP 4B SUCCESS: Match details fetched successfully`);
            
            // Apply rate limiting before next API call
            await this.applyRateLimit();

            // Step 5: Calculate bet outcome
            console.log(`\n🔍 STEP 5: Calculating bet outcome...`);
            const outcome = this.calculateBetOutcome(bet, matchDetails);

            console.log(`📊 Outcome calculation:`);
            console.log(`   - Status: ${outcome.status}`);
            console.log(`   - Actual outcome: ${outcome.actualOutcome || 'N/A'}`);
            console.log(`   - Final score: ${outcome.finalScore || 'N/A'}`);
            console.log(`   - Reason: ${outcome.reason}`);

            // Step 6: Update bet in database (only if updateDatabase is true)
            if (updateDatabase) {
                console.log(`\n🔍 STEP 6: Updating bet in database...`);
            console.log(`   - Bet ID: ${bet._originalBet?.id} (type: ${typeof bet._id})`);
            
            // Import Bet model and mongoose for ObjectId
            const { default: Bet } = await import('../models/Bet.js');
            const mongoose = await import('mongoose');
            
            // Try to get the default mongoose connection
            const mongooseInstance = mongoose.default || mongoose;
            
            // Check database connection status with error handling
            console.log(`   - Mongoose imported: ${mongoose ? 'YES' : 'NO'}`);
            console.log(`   - Mongoose instance: ${mongooseInstance ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
            console.log(`   - Mongoose connection: ${mongooseInstance?.connection ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
            
            if (mongooseInstance?.connection) {
                console.log(`   - Mongoose connection state: ${mongooseInstance.connection.readyState}`);
                console.log(`   - Mongoose connection host: ${mongooseInstance.connection.host}`);
                console.log(`   - Mongoose connection name: ${mongooseInstance.connection.name}`);
                console.log(`   - Mongoose connection ready: ${mongooseInstance.connection.readyState === 1 ? 'YES' : 'NO'}`);
                
                // Also try native MongoDB driver as backup
                const db = mongooseInstance.connection.db;
                console.log(`   - Native DB connection: ${db ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
                if (db) {
                    console.log(`   - Native DB name: ${db.databaseName}`);
                }
            } else {
                console.log(`   - ERROR: Mongoose connection not available!`);
                console.log(`   - Trying to use Bet model directly...`);
                // We'll try to use the Bet model directly without checking connection
            }
            

            console.log("bet----------------------------",Bet);
            
            // Test database connectivity by trying to find the bet first
            console.log(`   - Testing database connectivity by fetching bet...`);
            try {
                const testBet = await Bet.findById(betId);
                console.log(`   - Test fetch successful: ${testBet ? 'FOUND' : 'NOT FOUND'}`);
                if (testBet) {
                    console.log(`   - Current bet status: ${testBet.status}`);
                    console.log(`   - Current bet result:`, testBet.result);
                }
            } catch (error) {
                console.log(`   - Test fetch failed:`, error.message);
            }
            
            // Use findByIdAndUpdate for reliable Mongoose updates
            console.log(`   - About to update bet with ID: ${betId}`);
            console.log(`   - Update data:`, {
                status: outcome.status,
                result: {
                    actualOutcome: outcome.actualOutcome,
                    finalScore: outcome.finalScore,
                    fotmobMatchId: outcome.matchId,
                    reason: outcome.reason,
                    processedAt: new Date(),
                    similarity: matchResult.score
                },
                updatedAt: new Date()
            });
            
            // Use a transaction with write concern to ensure the update is committed
            const session = await mongooseInstance.startSession();
            
            try {
                await session.withTransaction(async () => {
                    const updateResult = await Bet.findByIdAndUpdate(
                        betId,
                        {
                            status: outcome.status,
                            payout: outcome.payout || (outcome.status === 'won' ? bet.stake * bet.odds : 0),
                            result: {
                                actualOutcome: outcome.actualOutcome,
                                finalScore: outcome.finalScore,
                                fotmobMatchId: outcome.matchId,
                                reason: outcome.reason,
                                processedAt: new Date(),
                                similarity: matchResult.score
                            },
                            updatedAt: new Date()
                        },
                        { 
                            new: true, 
                            runValidators: true, 
                            session
                        }
                    );
                    
                    console.log(`   - Transaction update result:`, updateResult);
                    
                    // Force a read after write to ensure consistency
                    const immediateCheck = await Bet.findById(betId, null, { session });
                    console.log(`   - Immediate consistency check: ${immediateCheck?.status}`);
                    
                    return updateResult;
                });
                
            console.log(`✅ Transaction committed successfully with write concern`);
        } catch (error) {
            console.log(`❌ Transaction failed:`, error.message);
            throw error;
        } finally {
            await session.endSession();
        }

        // Update user balance based on bet outcome
        console.log(`🔍 Balance update check:`, {
            userId: bet.userId,
            outcomeStatus: outcome.status,
            betPayout: bet.payout,
            betStake: bet.stake
        });
        
        if (bet.userId && (outcome.status === 'won' || outcome.status === 'void' || outcome.status === 'cancelled')) {
            console.log(`💰 Calling updateUserBalance for user ${bet.userId}`);
            await this.updateUserBalance(bet.userId, outcome, bet);
        } else {
            console.log(`💰 Skipping balance update - conditions not met`);
        }
            } else {
                console.log(`\n🔍 STEP 6 SKIPPED: Database update disabled for combination bet leg`);
            }
            
            // Get the updated result after transaction (only if database was updated)
            let updateResult = null;
            if (updateDatabase) {
                updateResult = await Bet.findById(betId);
            
            // Verify the update by fetching the bet again
            console.log(`   - Verifying update by fetching bet again...`);
            const verifyBet = await Bet.findById(betId);
            console.log(`   - Verified bet status: ${verifyBet?.status}`);
            console.log(`   - Verified bet result:`, verifyBet?.result);
            
            // If the verification shows the bet wasn't updated, try native MongoDB driver
            if (verifyBet?.status !== outcome.status) {
                console.log(`   - Mongoose update failed, trying native MongoDB driver...`);
                const nativeUpdateResult = await db.collection('bets').updateOne(
                    { _id: betId },
                {
                    $set: {
                        status: outcome.status,
                        result: {
                            actualOutcome: outcome.actualOutcome,
                            finalScore: outcome.finalScore,
                            fotmobMatchId: outcome.matchId,
                            reason: outcome.reason,
                            processedAt: new Date(),
                            similarity: matchResult.score
                        },
                        updatedAt: new Date()
                    }
                }
            );
                console.log(`   - Native update result:`, nativeUpdateResult);
                
                // Verify again
                const finalVerify = await Bet.findById(betId);
                console.log(`   - Final verification status: ${finalVerify?.status}`);
                console.log(`   - Final verification result:`, finalVerify?.result);
            }

            console.log(`   - Update result:`, updateResult);
            
            if (updateResult) {
                console.log(`✅ STEP 6 SUCCESS: Bet updated in database (ID: ${betId})`);
                console.log(`   - Status: ${updateResult.status}`);
                console.log(`   - Result: ${JSON.stringify(updateResult.result, null, 2)}`);
            } else {
                console.log(`❌ STEP 6 FAILED: No bet found with ID ${betId}`);
                throw new Error(`Bet with ID ${betId} not found in database`);
            }

            // Final verification - wait longer and check multiple times
            console.log(`\n🔍 FINAL VERIFICATION: Checking if update persisted...`);
            
            let finalCheck;
            let attempts = 0;
            const maxAttempts = 5;
            
            do {
                attempts++;
                console.log(`   - Attempt ${attempts}/${maxAttempts}: Checking database...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                
                finalCheck = await Bet.findById(betId);
                console.log(`   - Check ${attempts} status: ${finalCheck?.status}`);
                
                if (finalCheck?.status === outcome.status) {
                    console.log(`✅ FINAL VERIFICATION SUCCESS: Update persisted correctly on attempt ${attempts}`);
                    break;
                }
                
                if (attempts < maxAttempts) {
                    console.log(`   - Update not yet visible, retrying...`);
                }
            } while (attempts < maxAttempts && finalCheck?.status !== outcome.status);
            
            if (finalCheck?.status !== outcome.status) {
                console.log(`❌ CRITICAL ERROR: Database update did not persist after ${maxAttempts} attempts!`);
                console.log(`   - Expected status: ${outcome.status}`);
                console.log(`   - Actual status: ${finalCheck?.status}`);
                console.log(`   - This indicates a serious database consistency issue`);
                throw new Error(`Database update failed to persist - status reverted to ${finalCheck?.status}`);
            }
            }

            console.log(`\n🎉 ===== BET PROCESSING COMPLETE =====`);
            console.log(`📊 Final result: ${outcome.status.toUpperCase()}`);

            return {
                success: true,
                outcome: outcome,
                matchResult: matchResult,
                updated: updateDatabase ? (updateResult?.modifiedCount > 0) : false
            };

        } catch (error) {
            console.error(`\n❌ ===== BET PROCESSING ERROR =====`);
            console.error(`🚨 Error processing bet ${bet._id}:`, error);
            console.error(`📋 Error details:`, error.stack);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update user balance based on bet outcome
     */
    async updateUserBalance(userId, outcome, bet) {
        console.log(`🔍 updateUserBalance called with:`, { userId, outcomeStatus: outcome.status, betPayout: bet.payout, betStake: bet.stake });
        try {
            if (!userId) {
                console.warn('No userId provided for balance update');
                return;
            }

            if (outcome.status === 'won') {
                // Calculate payout from odds and stake instead of using bet.payout
                const payout = (bet.odds || 0) * (bet.stake || 0);
                console.log(`🔍 Won bet - odds: ${bet.odds}, stake: ${bet.stake}, calculated payout: ${payout}`);
                if (payout > 0) {
                    console.log(`💰 Updating user ${userId} balance by +${payout}`);
                    // Simple balance update - add payout to user balance
                    const updateResult = await User.findByIdAndUpdate(userId, {
                        $inc: { balance: payout }
                    });
                    console.log(`✅ Balance update result:`, updateResult);
                    console.log(`💰 Added ${payout} to user ${userId} balance (bet won)`);
                } else {
                    console.log(`⚠️ Calculated payout is 0, skipping balance update`);
                }
            } else if (outcome.status === 'void' || outcome.status === 'cancelled') {
                // Refund the stake
                const stake = bet.stake || 0;
                console.log(`🔍 ${outcome.status} bet - stake: ${stake}`);
                if (stake > 0) {
                    console.log(`💰 Refunding user ${userId} balance by +${stake}`);
                    const updateResult = await User.findByIdAndUpdate(userId, {
                        $inc: { balance: stake }
                    });
                    console.log(`✅ Refund result:`, updateResult);
                    console.log(`💰 Refunded ${stake} to user ${userId} balance (bet ${outcome.status})`);
                } else {
                    console.log(`⚠️ Stake is 0 or undefined, skipping refund`);
                }
            } else {
                console.log(`⚠️ Unknown outcome status: ${outcome.status}, skipping balance update`);
            }

        } catch (error) {
            console.error(`❌ Error updating balance for user ${userId}:`, error);
            // Don't throw error here as it would fail the entire bet processing
        }
    }


    /**
     * Cancel a bet with detailed reason
     */
    async cancelBet(bet, cancellationCode, reason, debugInfo) {
        try {
            const updateResult = await this.db.collection('bets').updateOne(
                { _id: bet._id },
                {
                    $set: {
                        status: 'cancelled',
                        result: {
                            cancellationCode: cancellationCode,
                            reason: reason,
                            processedAt: new Date(),
                            debugInfo: debugInfo
                        },
                        updatedAt: new Date()
                    }
                }
            );

            return { updated: updateResult.modifiedCount > 0 };
        } catch (error) {
            console.error(`Error cancelling bet ${bet._id}:`, error);
            return { updated: false, error: error.message };
        }
    }

    /**
     * Process all pending bets (smart mode - only finished matches)
     */
    async processAllPendingBets(onlyFinished = true) {
        try {
            await this.loadLeagueMapping();

            const pendingBets = await this.getPendingBets(onlyFinished);
            const results = {
                total: pendingBets.length,
                processed: 0,
                won: 0,
                lost: 0,
                void: 0,
                errors: 0,
                details: [],
                onlyFinished: onlyFinished
            };

            console.log(`Processing ${pendingBets.length} bets (finished matches only: ${onlyFinished})`);
            // console.log("*************aaaaaaaaaaaaa",pendingBets);
            for (const bet of pendingBets) {
                const result = await this.processBet(bet);

                if (result.success) {
                    results.processed++;
                    if (result.outcome.status === 'won') results.won++;
                    else if (result.outcome.status === 'lost') results.lost++;
                    else if (result.outcome.status === 'void') results.void++;
                } else {
                    results.errors++;
                }

                results.details.push({
                    betId: bet._id,
                    eventName: bet.eventName,
                    result: result
                });

                // Apply rate limiting between bets
                await this.applyRateLimit();
            }

            console.log('Bet processing completed:', results);
            return results;

        } catch (error) {
            console.error('Error processing bets:', error);
            throw error;
        }
    }

    /**
     * Process all pending bets (legacy mode - all bets)
     */
    async processAllPendingBetsLegacy() {
        return this.processAllPendingBets(false);
    }

    /**
     * Manual bet processing - immediate processing without match status checks
     */
    async processAllPendingBetsManual() {
        try {
            console.log('⚡ MANUAL PROCESSING: Starting manual bet processing...');

            await this.loadLeagueMapping();

            const pendingBets = await this.db.collection('bets').find({
                status: 'pending',
                marketName: 'Match (regular time)'
            }).toArray();

            const results = {
                total: pendingBets.length,
                processed: 0,
                won: 0,
                lost: 0,
                void: 0,
                errors: 0,
                details: [],
                mode: 'manual'
            };

            console.log(`⚡ MANUAL PROCESSING: ${pendingBets.length} pending match result bets`);
            // console.log("***********************bbbbbbbbbbbbbbbb*****************",pendingBets);
            for (const bet of pendingBets) {
                console.log(`🔧 Processing bet: ${bet.eventName} (${bet.outcomeLabel} @ ${bet.odds})`);

                const result = await this.processBet(bet);

                if (result.success) {
                    results.processed++;
                    if (result.outcome.status === 'won') results.won++;
                    else if (result.outcome.status === 'lost') results.lost++;
                    else if (result.outcome.status === 'void') results.void++;
                } else {
                    results.errors++;
                }

                results.details.push({
                    betId: bet._id,
                    eventName: bet.eventName,
                    result: result
                });

                // Apply rate limiting between bets
                await this.applyRateLimit();
            }

            console.log('⚡ Manual bet processing completed:', results);
            return results;

        } catch (error) {
            console.error('❌ Error in manual bet processing:', error);
            throw error;
        }
    }

    /**
     * Process a specific bet with known match ID
     */
    async processBetWithMatchId(bet, fotmobMatchId, updateDatabase = true) {
        // Implementation similar to processBet but with specific match ID
        // console.log("****************ccccccccccccccccccccccccccccc******************",bet);
        return this.processBet(bet, updateDatabase);
    }

    /**
     * Cancel unsupported market types
     */
    async cancelUnsupportedMarkets() {
        try {
            const unsupportedBets = await this.db.collection('bets').find({
                status: 'pending',
                marketName: { $ne: 'Match (regular time)' }
            }).toArray();

            let cancelled = 0;
            for (const bet of unsupportedBets) {
                const result = await this.cancelBet(bet, 'UNSUPPORTED_MARKET', `Market "${bet.marketName}" is not supported`, {});
                if (result.updated) cancelled++;
            }

            return { success: true, cancelled: cancelled };
        } catch (error) {
            console.error('Error cancelling unsupported markets:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * Fetch Fotmob matches for a specific date
     */
    async fetchFotmobMatches(date, forceRefresh = false) {
        try {
            const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
            const cacheFile = path.join(__dirname, `fotmob_matches_${dateStr}_${date.toISOString().slice(0, 10)}.json`);

            if (!forceRefresh && fs.existsSync(cacheFile)) {
                console.log(`📊 Loading cached Fotmob data for ${dateStr}`);
                return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            }

            console.log(`📡 Fetching fresh Fotmob data for ${dateStr}`);
            const data = await this.fotmob.getMatchesByDate(dateStr);

            if (data) {
                fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
                console.log(`💾 Saved Fotmob data to ${cacheFile}`);
            }

            return data;
        } catch (error) {
            console.error(`Error fetching Fotmob matches for ${date}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch multi-day Fotmob matches (handled by server endpoint now)
     */
    async fetchMultiDayFotmobMatches(forceRefresh = false) {
        const cacheFile = path.join(__dirname, 'fotmob_multiday_cache.json');

        if (!forceRefresh && fs.existsSync(cacheFile)) {
            return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        }

        // This is now handled by the server endpoint
        return { leagues: [], message: 'Multi-day cache handled by server endpoint' };
    }

    /**
     * Start automated processing
     */
    startAutomatedProcessing() {
        if (this.scheduledProcessing) {
            console.log('Automated processing already scheduled');
            return false;
        }

        const interval = this.config.intervals.offPeak;
        const intervalStr = interval >= 60000
            ? `${(interval / 60000).toFixed(2)} minutes`
            : `${(interval / 1000).toFixed(0)} seconds`;
        console.log(`🚀 Starting automated bet processing (interval: ${intervalStr})`);

        this.scheduledProcessing = setInterval(() => {
            this.runAutomatedProcessing();
        }, interval);

        return true;
    }

    /**
     * Stop automated processing
     */
    stopAutomatedProcessing() {
        if (!this.scheduledProcessing) {
            return false;
        }

        clearInterval(this.scheduledProcessing);
        this.scheduledProcessing = null;
        console.log('🛑 Stopped automated bet processing');
        return true;
    }

    /**
     * Get processing status
     */
    getProcessingStatus() {
        return {
            isScheduled: !!this.scheduledProcessing,
            isRunning: this.isProcessingRunning,
            interval: this.config.intervals.offPeak,
            stats: this.processingStats,
            config: this.config
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('Processing configuration updated:', this.config);
    }

    /**
     * Update rate limiting configuration
     */
    updateRateLimit(delayMs, enabled = true) {
        this.config.rateLimit = {
            apiDelayMs: delayMs,
            enabled: enabled
        };
        console.log(`Rate limiting updated: ${enabled ? 'enabled' : 'disabled'}, delay: ${delayMs}ms`);
    }

    /**
     * Run automated processing job
     */
    async runAutomatedProcessing() {
        if (this.isProcessingRunning) {
            console.log('Automated processing already running, skipping...');
            return;
        }

        this.isProcessingRunning = true;
        this.processingStats.totalRuns++;
        this.processingStats.lastRun = new Date();

        try {
            console.log('🤖 Starting automated bet outcome processing...');
            const results = await this.processAllPendingBets(true);

            this.processingStats.successfulRuns++;
            this.processingStats.totalProcessed += results.processed;
            this.processingStats.totalWon += results.won;
            this.processingStats.totalLost += results.lost;

            console.log(`✅ Automated processing completed: ${results.processed} bets processed`);

        } catch (error) {
            this.processingStats.failedRuns++;
            console.error('❌ Automated processing failed:', error.message);
        } finally {
            this.isProcessingRunning = false;
        }
    }
}

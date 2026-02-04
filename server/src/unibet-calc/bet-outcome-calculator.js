// bet-outcome-calculator.js
// Full implementation of bet outcome calculation and processing

import Fotmob from '@max-xoo/fotmob';
import fs from 'fs';
import path from 'path';
import axios from '../config/axios-proxy.js';
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
    getCardEvents,
    findPlayerIdByName,
    getGoalEvents,
    getAbsoluteMinuteFromEvent,
    getGoalkeeperSaves,
    getPlayerAssists,
    getPlayerScoreOrAssist,
    getPlayerGoalsFromOutsidePenalty,
    getPlayerGoalsFromHeader,
    getTeamShots,
    getTeamShotsOnTarget,
    getTeamOffsides,
    getPenaltyKicksAwarded,
    getTeamPenaltyGoals,
    getOwnGoals
} from './utils/fotmob-helpers.js';
import { normalizeBet } from './utils/market-normalizer.js';
import { identifyMarket, MarketCodes } from './utils/market-registry.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper: get match minute from FotMob event (FotMob uses "time"/"timeStr", not "minute")
function getEventMatchMinute(event) {
    if (event.minute !== undefined && event.minute !== null) return Number(event.minute);
    if (typeof event.time === 'number') return event.time;
    if (event.timeStr !== undefined && event.timeStr !== null) return Number(event.timeStr);
    if (event.shotmapEvent?.min !== undefined && event.shotmapEvent?.min !== null) return Number(event.shotmapEvent.min);
    return null;
}

// Helper: get match second from event (FotMob may use overloadTime for added time)
function getEventMatchSecond(event) {
    if (event.second !== undefined && event.second !== null) return Number(event.second);
    if (event.overloadTime !== undefined && event.overloadTime !== null) return Number(event.overloadTime);
    return 0;
}

// Helper function to get corners in a specific time window
// FotMob: timeline is in content.matchFacts.events.events; events use "time"/"timeStr", not "minute"
function getCornersInTimeWindow(matchDetails, team, startMinute, startSecond, endMinute, endSecond) {
    const headerEvents = matchDetails?.header?.events?.events || [];
    const matchFactsEvents = matchDetails?.content?.matchFacts?.events?.events || [];
    const events = [...headerEvents, ...matchFactsEvents];
    let cornerCount = 0;

    for (const event of events) {
        if (event.type !== 'Corner') continue;
        const eventMinute = getEventMatchMinute(event);
        if (eventMinute == null) continue;

        const eventSecond = getEventMatchSecond(event);
        const eventTime = eventMinute * 60 + eventSecond;
        const startTime = startMinute * 60 + startSecond;
        const endTime = endMinute * 60 + endSecond;

        if (eventTime >= startTime && eventTime <= endTime) {
            const isHomeTeam = event.isHome === true;
            if ((team === 'home' && isHomeTeam) || (team === 'away' && !isHomeTeam)) {
                cornerCount++;
            }
        }
    }

    return cornerCount;
}

// Helper function to get 1st half corners from stats
function getFirstHalfCorners(matchDetails) {
    // Get home and away team names for logging
    const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
    const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
    
    console.log(`📊 GETTING 1ST HALF CORNERS:`);
    console.log(`   - Home Team: ${homeTeamName}`);
    console.log(`   - Away Team: ${awayTeamName}`);
    
    // Try to get from content.stats.Periods.FirstHalf (preferred method)
    const firstHalfStats = matchDetails?.content?.stats?.Periods?.FirstHalf?.stats;
    console.log(`   - FirstHalf stats available: ${!!firstHalfStats}`);
    
    if (firstHalfStats && Array.isArray(firstHalfStats)) {
        console.log(`   - FirstHalf stats array length: ${firstHalfStats.length}`);
        
        // Find the corners stat in the stats array
        for (const statGroup of firstHalfStats) {
            if (statGroup.stats && Array.isArray(statGroup.stats)) {
                for (const stat of statGroup.stats) {
                    if (stat.key === 'corners' && stat.stats && Array.isArray(stat.stats) && stat.stats.length >= 2) {
                        const homeCorners = Number(stat.stats[0]) || 0;
                        const awayCorners = Number(stat.stats[1]) || 0;
                        
                        console.log(`   ✅ Found corners in FirstHalf stats:`);
                        console.log(`      - Source: content.stats.Periods.FirstHalf.stats`);
                        console.log(`      - Raw data: [${stat.stats[0]}, ${stat.stats[1]}]`);
                        console.log(`      - ${homeTeamName} (Home): ${homeCorners} corners`);
                        console.log(`      - ${awayTeamName} (Away): ${awayCorners} corners`);
                        console.log(`      - Total: ${homeCorners + awayCorners} corners`);
                        
                        return {
                            home: homeCorners,
                            away: awayCorners,
                            total: homeCorners + awayCorners
                        };
                    }
                }
            }
        }
        console.log(`   ⚠️  Corners stat not found in FirstHalf stats array`);
    } else {
        console.log(`   ⚠️  FirstHalf stats not available, falling back to events`);
    }
    
    // Fallback: count from events if stats not available
    const events = matchDetails?.header?.events?.events || [];
    console.log(`   - Events available: ${events.length} events`);
    
    let homeCorners = 0;
    let awayCorners = 0;
    const cornerEvents = [];
    
    for (const event of events) {
        if (event.type === 'Corner' && event.minute !== undefined) {
            const eventMinute = event.minute;
            // 1st half is 0-45 minutes (including stoppage time up to ~45+)
            // We'll use <= 45 to capture all first half corners
            if (eventMinute <= 45) {
                const isHomeTeam = event.isHome === true;
                cornerEvents.push({
                    minute: eventMinute,
                    isHome: isHomeTeam,
                    team: isHomeTeam ? homeTeamName : awayTeamName
                });
                if (isHomeTeam) {
                    homeCorners++;
                } else {
                    awayCorners++;
                }
            }
        }
    }
    
    console.log(`   ✅ Counted corners from events (1st half, minute <= 45):`);
    console.log(`      - Source: header.events.events (filtered by minute <= 45)`);
    console.log(`      - Corner events found: ${cornerEvents.length}`);
    if (cornerEvents.length > 0) {
        console.log(`      - Events:`, cornerEvents.map(e => `${e.team} @ ${e.minute}'`).join(', '));
    }
    console.log(`      - ${homeTeamName} (Home): ${homeCorners} corners`);
    console.log(`      - ${awayTeamName} (Away): ${awayCorners} corners`);
    console.log(`      - Total: ${homeCorners + awayCorners} corners`);
    
    return { home: homeCorners, away: awayCorners, total: homeCorners + awayCorners };
}

// Helper function to get 2nd half corners from stats
function getSecondHalfCorners(matchDetails) {
    // Get home and away team names for logging
    const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
    const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
    
    console.log(`📊 GETTING 2ND HALF CORNERS:`);
    console.log(`   - Home Team: ${homeTeamName}`);
    console.log(`   - Away Team: ${awayTeamName}`);
    
    // Try to get from content.stats.Periods.SecondHalf (preferred method)
    const secondHalfStats = matchDetails?.content?.stats?.Periods?.SecondHalf?.stats;
    console.log(`   - SecondHalf stats available: ${!!secondHalfStats}`);
    
    if (secondHalfStats && Array.isArray(secondHalfStats)) {
        console.log(`   - SecondHalf stats array length: ${secondHalfStats.length}`);
        
        // Find the corners stat in the stats array
        for (const statGroup of secondHalfStats) {
            if (statGroup.stats && Array.isArray(statGroup.stats)) {
                for (const stat of statGroup.stats) {
                    if (stat.key === 'corners' && stat.stats && Array.isArray(stat.stats) && stat.stats.length >= 2) {
                        const homeCorners = Number(stat.stats[0]) || 0;
                        const awayCorners = Number(stat.stats[1]) || 0;
                        
                        console.log(`   ✅ Found corners in SecondHalf stats:`);
                        console.log(`      - Source: content.stats.Periods.SecondHalf.stats`);
                        console.log(`      - Raw data: [${stat.stats[0]}, ${stat.stats[1]}]`);
                        console.log(`      - ${homeTeamName} (Home): ${homeCorners} corners`);
                        console.log(`      - ${awayTeamName} (Away): ${awayCorners} corners`);
                        console.log(`      - Total: ${homeCorners + awayCorners} corners`);
                        
                        return {
                            home: homeCorners,
                            away: awayCorners,
                            total: homeCorners + awayCorners
                        };
                    }
                }
            }
        }
        console.log(`   ⚠️  Corners stat not found in SecondHalf stats array`);
    } else {
        console.log(`   ⚠️  SecondHalf stats not available, falling back to events`);
    }
    
    // Fallback: count from events if stats not available
    const events = matchDetails?.header?.events?.events || [];
    console.log(`   - Events available: ${events.length} events`);
    
    let homeCorners = 0;
    let awayCorners = 0;
    const cornerEvents = [];
    
    for (const event of events) {
        if (event.type === 'Corner' && event.minute !== undefined) {
            const eventMinute = event.minute;
            // 2nd half is > 45 minutes
            if (eventMinute > 45) {
                const isHomeTeam = event.isHome === true;
                cornerEvents.push({
                    minute: eventMinute,
                    isHome: isHomeTeam,
                    team: isHomeTeam ? homeTeamName : awayTeamName
                });
                if (isHomeTeam) {
                    homeCorners++;
                } else {
                    awayCorners++;
                }
            }
        }
    }
    
    console.log(`   ✅ Counted corners from events (2nd half, minute > 45):`);
    console.log(`      - Source: header.events.events (filtered by minute > 45)`);
    console.log(`      - Corner events found: ${cornerEvents.length}`);
    if (cornerEvents.length > 0) {
        console.log(`      - Events:`, cornerEvents.map(e => `${e.team} @ ${e.minute}'`).join(', '));
    }
    console.log(`      - ${homeTeamName} (Home): ${homeCorners} corners`);
    console.log(`      - ${awayTeamName} (Away): ${awayCorners} corners`);
    console.log(`      - Total: ${homeCorners + awayCorners} corners`);
    
    return { home: homeCorners, away: awayCorners, total: homeCorners + awayCorners };
}

class BetOutcomeCalculator {
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
     * Load league mapping from MongoDB database
     */
    async loadLeagueMapping() {
        try {
            // Import dynamically to avoid circular dependency
            const LeagueMapping = (await import('../models/LeagueMapping.js')).default;

            console.log('📥 Loading league mapping from database...');

            // Fetch all league mappings from DB
            const mappings = await LeagueMapping.find({}).lean();

            this.leagueMapping.clear();

            for (const mapping of mappings) {
                if (mapping.unibetId && mapping.fotmobId) {
                    this.leagueMapping.set(String(mapping.unibetId), {
                        unibetId: String(mapping.unibetId),
                        unibetName: mapping.unibetName,
                        fotmobId: String(mapping.fotmobId),
                        fotmobName: mapping.fotmobName
                    });
                }
            }

            console.log(`✅ Loaded ${this.leagueMapping.size} league mappings from database`);
        } catch (error) {
            console.error('Error loading league mapping from database:', error.message);
        }
    }

    /**
     * Get pending bets from database
     */
    async getPendingBets(onlyFinished = true) {
        try {
            // Remove time-based filtering - we will check match status from Unibet API and FotMob instead
            // This allows us to process bets based on actual match status, not estimated time
            const query = { status: 'pending' };

            console.log(`🔍 Fetching all pending bets (no time-based filtering - will check Unibet/FotMob match status)`);

            const bets = await this.db.collection('bets').find(query).toArray();
            
            console.log(`   - Found ${bets.length} pending bets`);

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
            // ✅ FIX: Convert UTC date to PKT date for cache lookup
            // Database stores matchDate in UTC, but Fotmob cache is stored with PKT dates
            // Example: Match at 14 Jan 1 AM PKT = 13 Jan 8 PM UTC
            // Cache key: "20260114" (PKT), but UTC date would be "20260113"
            const utcDateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
            const utcDateFormatted = date.toISOString().slice(0, 10);
            
            // Convert to PKT timezone for cache lookup using Intl.DateTimeFormat
            const pktFormatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Karachi',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            const dateFormatted = pktFormatter.format(date); // Returns "YYYY-MM-DD" in PKT
            const dateStr = dateFormatted.replace(/-/g, ''); // "YYYYMMDD" format

            // When UTC date ≠ PKT date (e.g. 03.02 19:00 UTC = 04.02 00:00 PKT), or PKT time is 12 AM–1 AM: check BOTH dates
            const pktHour = parseInt(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Karachi', hour: 'numeric', hour12: false }).format(date), 10);
            const isMidnightCrossover = (utcDateStr !== dateStr) || (pktHour >= 0 && pktHour < 1);

            console.log(`\n🔍 FOTMOB CACHE LOOKUP:`);
            console.log(`   - UTC Date: ${utcDateFormatted} (${utcDateStr})`);
            console.log(`   - PKT Date: ${dateFormatted} (${dateStr}) - Using for cache lookup`);
            if (isMidnightCrossover) {
                console.log(`   - Midnight crossover (UTC≠PKT or PKT 12 AM–1 AM): will check BOTH UTC and PKT dates`);
            }

            // Try daily cache: PKT date first; when midnight crossover, also try UTC date and merge both
            const pktCacheFile = path.join(__dirname, '../storage/fotmob', `fotmob_matches_${dateStr}_${dateFormatted}.json`);
            const utcCacheFile = path.join(__dirname, '../storage/fotmob', `fotmob_matches_${utcDateStr}_${utcDateFormatted}.json`);
            console.log(`   - Checking daily cache: ${path.basename(pktCacheFile)}`);

            const parseDailyCache = (filePath) => {
                const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                return Array.isArray(raw) ? raw : (raw.leagues || null);
            };

            if (isMidnightCrossover) {
                // Midnight crossover: load BOTH PKT and UTC daily caches and merge leagues
                const pktExists = fs.existsSync(pktCacheFile);
                const utcExists = fs.existsSync(utcCacheFile);
                if (pktExists) console.log(`✅ Daily cache (PKT): ${path.basename(pktCacheFile)}`);
                if (utcExists) console.log(`   - Checking daily cache (UTC date): ${path.basename(utcCacheFile)}`);
                if (!pktExists && utcExists) console.log(`✅ DAILY CACHE FOUND (UTC): Loading ${path.basename(utcCacheFile)}`);

                if (pktExists || utcExists) {
                    const pktLeagues = pktExists ? parseDailyCache(pktCacheFile) : [];
                    const utcLeagues = utcExists ? parseDailyCache(utcCacheFile) : [];
                    const leaguesList = Array.isArray(pktLeagues) ? pktLeagues : (pktLeagues ? [pktLeagues] : []);
                    const utcList = Array.isArray(utcLeagues) ? utcLeagues : (utcLeagues ? [utcLeagues] : []);
                    const leagueMap = new Map();
                    [...leaguesList, ...utcList].forEach(league => {
                        if (!league || league.id == null) return;
                        if (leagueMap.has(league.id)) {
                            const existing = leagueMap.get(league.id);
                            existing.matches = [...(existing.matches || []), ...(league.matches || [])];
                        } else {
                            leagueMap.set(league.id, { ...league });
                        }
                    });
                    const merged = Array.from(leagueMap.values());
                    console.log(`   - Merged daily caches (PKT+UTC): ${merged.length} leagues`);
                    return { leagues: merged };
                }
                if (!pktExists) console.log(`❌ Daily cache not found: ${path.basename(pktCacheFile)}`);
            } else {
                if (fs.existsSync(pktCacheFile)) {
                    console.log(`✅ DAILY CACHE FOUND: Loading ${path.basename(pktCacheFile)}`);
                    const data = JSON.parse(fs.readFileSync(pktCacheFile, 'utf8'));
                    if (Array.isArray(data)) {
                        return { leagues: data };
                    }
                    if (data.leagues) {
                        return data;
                    }
                    console.log(`❌ Unexpected cached data format`);
                    return null;
                }
                console.log(`❌ Daily cache not found: ${path.basename(pktCacheFile)}`);
            }

            // Try multi-day cache
            // Special case: use fotmob-11.json for test event ID 1022853538
            // Special case: use longest-cache.json for test event ID 1024730101
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
            
            if (bet && bet?.eventId === '1022853538') {
                multiDayCacheFile = path.join(__dirname, '../../storage/fotmob/fotmob-11.json');
                useTestDate = true;
                console.log(`🧪 TEST EVENT DETECTED: Using fotmob-11.json for event ${bet.matchId}`);
                console.log(`🧪 TEST MODE: Will use August 11, 2025 data regardless of bet date`);
            } else if (bet && bet?.eventId === '1024730101') {
                multiDayCacheFile = path.join(__dirname, '../../storage/fotmob/longest-cache.json');
                useTestDate = true;
                console.log(`🧪 TEST EVENT DETECTED: Using longest-cache.json for event ${bet.matchId}`);
                console.log(`🧪 TEST MODE: Will use September 24, 2025 data regardless of bet date`);
            } else if (bet && (bet?.matchId === '1024820144' || bet?.eventId === '1024820144')) {
                multiDayCacheFile = path.join(__dirname, '../../storage/fotmob/fotmob_nov26_psg_tottenham.json');
                useTestDate = true;
                console.log(`🧪 TEST EVENT DETECTED: Using fotmob_nov26_psg_tottenham.json for event ${bet.matchId}`);
                console.log(`🧪 TEST MODE: Will use November 26, 2025 data regardless of bet date`);
            } else {
                multiDayCacheFile = path.join(__dirname, '../../storage/fotmob/fotmob_multiday_cache.json');
            }
            console.log(`   - Checking multi-day cache: ${path.basename(multiDayCacheFile)}`);

            if (fs.existsSync(multiDayCacheFile)) {
                console.log(`✅ MULTI-DAY CACHE FOUND: Loading ${path.basename(multiDayCacheFile)}`);
                const data = JSON.parse(fs.readFileSync(multiDayCacheFile, 'utf8'));
                
                // Handle multi-day cache format - it's organized by date keys
                let leaguesData;
                if (Array.isArray(data)) {
                    console.log(`   - Total leagues in multi-day cache: ${data.length} (array format)`);
                    leaguesData = { leagues: data };
                } else if (data.leagues) {
                    console.log(`   - Total leagues in multi-day cache: ${data.leagues.length} (object format)`);
                    leaguesData = data;
                } else {
                    // Multi-day cache format: { "20251001": { leagues: [...] }, "20251002": { leagues: [...] } }
                    console.log(`   - Multi-day cache format detected, combining all dates`);
                    const allLeagues = [];
                    const dateKeys = Object.keys(data);
                    console.log(`   - Found data for dates: ${dateKeys.join(', ')}`);
                    
                    dateKeys.forEach(dateKey => {
                        if (data[dateKey] && data[dateKey].leagues) {
                            allLeagues.push(...data[dateKey].leagues);
                        }
                    });
                    
                    console.log(`   - Total leagues from all dates: ${allLeagues.length}`);
                    
                    // Debug: Check if Copa Paraguay is in the loaded leagues
                    const copaParaguay = allLeagues.find(league => league.id === 10230);
                    if (copaParaguay) {
                        console.log(`   🐛 Copa Paraguay found in loaded leagues: ${copaParaguay.matches?.length || 0} matches`);
                        copaParaguay.matches?.forEach(match => {
                            console.log(`     - Match: ${match.home?.name} vs ${match.away?.name} at ${match.time}`);
                        });
                    } else {
                        console.log(`   ❌ Copa Paraguay (ID 10230) NOT found in loaded leagues`);
                    }
                    
                    leaguesData = { leagues: allLeagues };
                }

                // For test events, use specific dates; otherwise filter by PKT date
                let filterDate;
                if (bet && bet?.eventId === '1022853538') {
                    filterDate = '2025-08-11';
                } else if (bet && bet?.eventId === '1024730101') {
                    filterDate = '2025-09-24';
                } else if (bet && (bet?.matchId === '1024820144' || bet?.eventId === '1024820144')) {
                    filterDate = '2025-11-26';
                } else {
                    // ✅ FIX: Use PKT date for filtering (dateFormatted is already PKT date)
                    filterDate = dateFormatted;
                }
                console.log(`   - Filtering matches for date: ${filterDate} ${useTestDate ? '(TEST MODE)' : ''} (PKT timezone)${isMidnightCrossover ? ` + UTC date ${utcDateFormatted} (midnight crossover)` : ''}`);
                
                let matchesForDate = 0;
                
                // First, merge leagues with the same ID to avoid duplicates
                const leagueMap = new Map();
                leaguesData.leagues.forEach(league => {
                    if (leagueMap.has(league.id)) {
                        // Merge matches from leagues with same ID
                        const existingLeague = leagueMap.get(league.id);
                        existingLeague.matches = [...(existingLeague.matches || []), ...(league.matches || [])];
                    } else {
                        leagueMap.set(league.id, { ...league });
                    }
                });
                const mergedLeagues = Array.from(leagueMap.values());
                
                console.log(`   - After merging: ${mergedLeagues.length} unique leagues (was ${leaguesData.leagues.length})`);
                
                const filteredLeagues = mergedLeagues.map(league => {
                    const exactDateMatches = [];
                    const within25hMatches = [];
                    
                    (league.matches || []).forEach(match => {
                        let matchDate;
                        if (match.status?.utcTime) {
                            matchDate = new Date(match.status.utcTime);
                        } else if (match.time) {
                            // Handle DD.MM.YYYY HH:mm format
                            const timeStr = match.time;
                            if (timeStr.includes('.') && timeStr.split('.').length === 3) {
                                // Convert DD.MM.YYYY HH:mm to YYYY-MM-DD HH:mm
                                const [datePart, timePart] = timeStr.split(' ');
                                const [day, month, year] = datePart.split('.');
                                const isoFormat = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}:00.000Z`;
                                matchDate = new Date(isoFormat);
                            } else {
                                matchDate = new Date(timeStr);
                            }
                        } else {
                            return;
                        }
                        
                        // ✅ FIX: Convert match UTC date to PKT date string for comparison
                        const pktFormatter = new Intl.DateTimeFormat('en-CA', {
                            timeZone: 'Asia/Karachi',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                        });
                        const matchDateStr = pktFormatter.format(matchDate); // "YYYY-MM-DD" in PKT
                        const matchUtcDateStr = matchDate.toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC
                        
                        // Exact date: PKT match, or (midnight crossover) UTC date match
                        const matchesFilterDate = (matchDateStr === filterDate) ||
                            (isMidnightCrossover && matchUtcDateStr === utcDateFormatted);
                        if (matchesFilterDate) {
                            exactDateMatches.push(match);
                        } else {
                            // Only check 25-hour window if no exact date matches found
                            // Convert filterDate (PKT date string) to UTC Date for time comparison
                            // filterDate is "YYYY-MM-DD" in PKT, convert to UTC midnight
                            // PKT is UTC+5, so PKT midnight = UTC 19:00 previous day
                            const filterDateUTC = new Date(filterDate + 'T00:00:00+05:00'); // PKT midnight to UTC
                            const timeDifference = Math.abs(matchDate.getTime() - filterDateUTC.getTime());
                            const hoursDifference = timeDifference / (1000 * 60 * 60);
                            
                            if (hoursDifference <= 25) {
                                within25hMatches.push(match);
                            }
                        }
                    });
                    
                    // Simple logic: Use exact date matches if found, otherwise use 25h window
                    const filteredMatches = exactDateMatches.length > 0 ? exactDateMatches : within25hMatches;
                    matchesForDate += filteredMatches.length;
                    
                    // Debug logging for Primera B league
                    if (league.id === 9126) {
                        console.log(`   🔍 DEBUG: Primera B league (${league.id}) filtering:`);
                        console.log(`   - Total matches in league: ${(league.matches || []).length}`);
                        console.log(`   - Exact date matches (${filterDate}): ${exactDateMatches.length}`);
                        console.log(`   - Within 25h matches: ${within25hMatches.length}`);
                        console.log(`   - Final filtered matches: ${filteredMatches.length}`);
                        
                        // Show all matches in this league
                        (league.matches || []).forEach((match, i) => {
                            let matchDate;
                            if (match.status?.utcTime) {
                                matchDate = new Date(match.status.utcTime);
                            } else if (match.time) {
                                const timeStr = match.time;
                                if (timeStr.includes('.') && timeStr.split('.').length === 3) {
                                    const [datePart, timePart] = timeStr.split(' ');
                                    const [day, month, year] = datePart.split('.');
                                    const isoFormat = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}:00.000Z`;
                                    matchDate = new Date(isoFormat);
                                } else {
                                    matchDate = new Date(timeStr);
                                }
                            }
                            if (matchDate) {
                                const matchDateStr = matchDate.toISOString().slice(0, 10);
                                console.log(`   - Match ${i + 1}: ${match.home?.name} vs ${match.away?.name} at ${matchDateStr} (${matchDate.toISOString()})`);
                            }
                        });
                    }

                    return {
                        ...league,
                        matches: filteredMatches
                    };
                }).filter(league => league.matches.length > 0);

                console.log(`   - Matches found for ${filterDate}: ${matchesForDate} across ${filteredLeagues.length} leagues`);

                // Debug: Check if Copa Paraguay survived the filtering
                const filteredCopaParaguay = filteredLeagues.find(league => league.id === 10230);
                if (filteredCopaParaguay) {
                    console.log(`   ✅ Copa Paraguay survived filtering: ${filteredCopaParaguay.matches?.length || 0} matches`);
                } else {
                    console.log(`   ❌ Copa Paraguay was filtered out during date filtering`);
                }

                // Debug: Final check before returning
                const finalCopaParaguay = filteredLeagues.find(league => league.id === 10230);
                console.log(`   🔍 FINAL RETURN CHECK: Copa Paraguay in return data: ${!!finalCopaParaguay} (${finalCopaParaguay?.matches?.length || 0} matches)`);
                console.log(`   🔍 FINAL RETURN: Returning ${filteredLeagues.length} leagues total`);

                return {
                    leagues: filteredLeagues,
                    source: useTestDate ? 'test-cache-fotmob-11' : 'multi-day-cache-filtered',
                    originalDate: filterDate,
                    testMode: useTestDate
                };
            } else {
                console.log(`❌ Multi-day cache not found: ${path.basename(multiDayCacheFile)}`);
            }

            // Fallback: fetch fresh data using correct API endpoint
            // ✅ FIX: Use PKT date for API call (dateStr is already PKT date)
            console.log(`📡 FALLBACK: Fetching fresh Fotmob data for ${dateStr} (PKT date)`);
            try {
                // Use correct API endpoint: /api/data/matches (not /api/matches)
                const timezone = 'Asia/Karachi'; // Default timezone
                const ccode3 = 'PAK'; // Default country code
                
                console.log(`📡 Calling correct Fotmob API endpoint...`);
                console.log(`📡 Using PKT date: ${dateStr} (converted from UTC: ${utcDateStr})`);
                const apiUrl = `https://www.fotmob.com/api/data/matches?date=${dateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;
                
                console.log(`📡 Calling FotMob API for daily matches: ${dateStr} (PKT) - Original UTC date: ${utcDateFormatted}`);
                
                // Get x-mas token (required for authentication)
                let xmasToken = null;
                try {
                    const xmasResponse = await axios.get('http://46.101.91.154:6006/');
                    xmasToken = xmasResponse.data['x-mas'];
                    console.log(`✅ Got x-mas token`);
                } catch (xmasError) {
                    console.warn(`⚠️ Could not get x-mas token, trying without it...`);
                }
                
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.fotmob.com/'
                };
                
                if (xmasToken) {
                    headers['x-mas'] = xmasToken;
                }
                
                console.log(`🐛 [BREAKPOINT] Making HTTP request to FotMob API...`);
                const response = await axios.get(apiUrl, { headers });
                const freshData = response.data;
                
                console.log(`🐛 [BREAKPOINT] FotMob API response received`);
                console.log(`🐛 [BREAKPOINT] Response status: ${response.status}`);
                console.log(`🐛 [BREAKPOINT] Response data available: ${!!freshData}`);
                if (freshData?.leagues) {
                    console.log(`🐛 [BREAKPOINT] Leagues found: ${freshData.leagues.length}`);
                }
                
                if (freshData) {
                    // Handle Fotmob API format - correct endpoint returns { leagues: [...], date: ... }
                    if (Array.isArray(freshData)) {
                        console.log(`✅ Fresh data fetched: ${freshData.length} leagues (array format)`);
                        return { leagues: freshData };
                    } else if (freshData.leagues) {
                        console.log(`✅ Fresh data fetched: ${freshData.leagues.length} leagues (object format)`);
                        return freshData;
                    } else {
                        console.log(`❌ Unexpected Fotmob data format`);
                        return null;
                    }
                } else {
                    console.log(`❌ Failed to fetch fresh data`);
                    return null;
                }
            } catch (fotmobError) {
                console.error(`❌ FOTMOB API ERROR:`, fotmobError.message);
                
                // Fallback: Try using the package method (old endpoint) as last resort
                console.log(`🔄 Trying fallback: Using Fotmob package method...`);
                try {
                    const fotmob = new Fotmob();
                    const freshData = await fotmob.getMatchesByDate(dateStr);
                    if (freshData) {
                        if (Array.isArray(freshData)) {
                            console.log(`✅ Fresh data fetched via package: ${freshData.length} leagues`);
                            return { leagues: freshData };
                        } else if (freshData.leagues) {
                            console.log(`✅ Fresh data fetched via package: ${freshData.leagues.length} leagues`);
                            return freshData;
                        }
                    }
                } catch (packageError) {
                    console.error(`❌ Package fallback also failed: ${packageError.message}`);
                }
                
                // Handle specific Fotmob API format errors
                if (fotmobError.message.includes('Invalid value for key "leagues"')) {
                    console.error(`📋 Fotmob API format error - leagues field format has changed`);
                    console.error(`📋 This is likely a Fotmob package compatibility issue`);
                    console.error(`📋 Returning null to skip Fotmob data for this bet`);
                    return null;
                }
                
                // If both methods failed, return null instead of throwing
                console.error(`❌ Both API methods failed, returning null`);
                return null;
            }

        } catch (error) {
            console.error(`❌ ERROR getting cached daily matches for ${date}:`, error.message);
            console.error(`📋 Cache error details:`, error.stack);
            // Return null to indicate cache failure, but don't throw - let the calling method handle it
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
            // Normalize accented characters
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            // Remove common prefixes/suffixes
            .replace(/\b(fc|cf|ac|sc|united|utd|city|town|rovers|wanderers|athletic|albion)\b/g, '')
            // Remove special characters and extra spaces
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Check if two names match using similarity calculation
     * Uses calculateSimilarity with a threshold to determine if names match
     * @param {string} name1 - First name to compare
     * @param {string} name2 - Second name to compare
     * @param {number} threshold - Similarity threshold (default: 0.6)
     * @returns {boolean} - True if names match above threshold
     */
    namesMatch(name1, name2, threshold = 0.6) {
        if (!name1 || !name2) return false;
        const similarity = this.calculateSimilarity(name1, name2);
        return similarity >= threshold;
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

        // Special handling for common abbreviations and team name variations
        const teamNameVariations = {
            'psg': ['paris saint germain', 'paris saintgermain', 'paris st germain', 'paris saint germain'],
            'paris saint germain': ['psg'],
            'tottenham': ['tottenham hotspur', 'spurs'],
            'tottenham hotspur': ['tottenham', 'spurs'],
            'spurs': ['tottenham', 'tottenham hotspur'],
            'manchester united': ['man utd', 'manchester utd', 'man u'],
            'manchester city': ['man city', 'mancity'],
            'real madrid': ['real madrid cf', 'real'],
            'barcelona': ['barca', 'fc barcelona'],
            'bayern munich': ['bayern', 'fc bayern', 'bayern munchen'],
            'juventus': ['juve', 'juventus fc'],
            'ac milan': ['milan', 'acmilan'],
            'inter milan': ['inter', 'inter milano'],
            'atletico madrid': ['atletico', 'atletico madrid']
        };

        // Check if either name matches known variations
        const checkVariations = (name1, name2) => {
            const variations1 = teamNameVariations[name1] || [];
            const variations2 = teamNameVariations[name2] || [];
            
            // Direct match in variations
            if (variations1.includes(name2) || variations2.includes(name1)) {
                return true;
            }
            
            // Check if name1 is in name2's variations or vice versa
            if (variations1.some(v => name2.includes(v) || v.includes(name2))) {
                return true;
            }
            if (variations2.some(v => name1.includes(v) || v.includes(name1))) {
                return true;
            }
            
            return false;
        };

        if (checkVariations(norm1, norm2)) {
            return 0.85; // High score for abbreviation/variation matches
        }

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
    async findMatchingFotmobMatch(bet, fotmobData) {
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
                    start: bet.matchDate || bet.start || bet.unibetMeta?.start || bet._originalBet?.matchDate || bet._originalBet?.result?.matchDate // ✅ FIX: Check all possible locations
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
        console.log(`   - Looking for Fotmob league ID: ${fotmobLeagueId} (type: ${typeof fotmobLeagueId})`);
        console.log(`   - Available Fotmob leagues: ${fotmobData.leagues.length}`);
        
        // Debug: Check if Copa Paraguay is actually in the data
        const copaParaguayInData = fotmobData.leagues.find(league => league.id === 10230);
        console.log(`   🐛 Copa Paraguay (10230) in fotmobData: ${!!copaParaguayInData} (${copaParaguayInData?.matches?.length || 0} matches)`);
        if (copaParaguayInData) {
            console.log(`   🐛 Copa Paraguay details: id=${copaParaguayInData.id} (type: ${typeof copaParaguayInData.id}), name="${copaParaguayInData.name}"`);
        }

        // List all available Fotmob leagues for debugging
        console.log(`📋 Available Fotmob leagues:`);
        fotmobData.leagues.slice(0, 10).forEach(league => {
            console.log(`   - ${league.id}: ${league.name} (${league.matches?.length || 0} matches)`);
        });
        if (fotmobData.leagues.length > 10) {
            console.log(`   ... and ${fotmobData.leagues.length - 10} more leagues`);
        }

        // Try to find league by both id and primaryId (Fotmob uses both)
        console.log(`   🔍 Searching for league with id === ${fotmobLeagueId}...`);
        let fotmobLeague = fotmobData.leagues.find(league => league.id === fotmobLeagueId);
        console.log(`   🔍 Found by id: ${!!fotmobLeague}`);
        
        if (!fotmobLeague) {
            // Also try primaryId field
            console.log(`   🔍 Searching for league with primaryId === ${fotmobLeagueId}...`);
            fotmobLeague = fotmobData.leagues.find(league => league.primaryId === fotmobLeagueId);
            console.log(`   🔍 Found by primaryId: ${!!fotmobLeague}`);
        }
        
        if (fotmobLeague) {
            console.log(`   ✅ EXACT LEAGUE FOUND: ${fotmobLeague.name} (id=${fotmobLeague.id}, matches=${fotmobLeague.matches?.length || 0})`);
        } else {
            console.log(`   ❌ EXACT LEAGUE NOT FOUND despite Copa Paraguay being in data!`);
        }

        // If exact ID not found, try to find leagues with similar names (for group leagues)
        if (!fotmobLeague) {
            console.log(`🔍 Exact league ID ${fotmobLeagueId} not found, searching for similar league names...`);
            const similarLeagues = fotmobData.leagues.filter(league => {
                const leagueName = league.name.toLowerCase();
                const fotmobName = leagueMapping.fotmobName.toLowerCase();
                
                // Check if the league name contains the Fotmob name or vice versa
                return leagueName.includes(fotmobName) || fotmobName.includes(leagueName);
            });

            if (similarLeagues.length > 0) {
                console.log(`📋 Found ${similarLeagues.length} similar leagues:`);
                similarLeagues.forEach(league => {
                    console.log(`   - ${league.name}: id=${league.id}, primaryId=${league.primaryId}, matches=${league.matches?.length || 0}`);
                });
                
                // Instead of picking one league, we'll search through ALL similar leagues
                // This will be handled in the match finding logic below
                console.log(`🔍 Will search through all ${similarLeagues.length} similar leagues for matches`);
            }
        }

        // Check if we have any matches to search through (either exact league or similar leagues)
        const hasMatchesToSearch = fotmobLeague || (fotmobData.leagues.some(league => {
            const leagueName = league.name.toLowerCase();
            const fotmobName = leagueMapping.fotmobName.toLowerCase();
            return leagueName.includes(fotmobName) || fotmobName.includes(leagueName);
        }));

        if (!hasMatchesToSearch) {
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

        // Step 4: Validate bet has required team names
        if (!bet.homeName || !bet.awayName) {
            matchingResult.error = 'Bet missing team names';
            matchingResult.cancellationReason = 'BET_MISSING_TEAM_NAMES';
            matchingResult.debugInfo.searchSteps.push(`❌ Missing team names: home="${bet.homeName}", away="${bet.awayName}"`);
            return matchingResult;
        }

        // Step 5: Search for matching matches
        // For test cases, adjust bet date to match test data (August 11, 2025)
        // ✅ FIX: Check all possible field locations for match date
        let betDate = new Date(bet.matchDate || bet.start || bet.unibetMeta?.start || bet._originalBet?.matchDate || bet._originalBet?.result?.matchDate);
        if (bet && bet?.eventId === '1022853538') {
            betDate = new Date('2025-08-11T23:00:00.000Z'); // Match the test data date
            console.log(`🧪 TEST MODE: Adjusted bet date to match test data: ${betDate.toISOString()}`);
        } else if (bet && bet?.eventId === '1024730101') {
            betDate = new Date('2025-09-24T22:00:00.000Z'); // Match the test data date
            console.log(`🧪 TEST MODE: Adjusted bet date to match test data: ${betDate.toISOString()}`);
        }
        
        let bestMatch = null;
        let bestScore = 0;
        let allMatchesToSearch = [];

        // Smart league detection: distinguish between complete leagues and group leagues
        if (fotmobLeague) {
            // Check if this is a group league (part of a larger tournament)
            const isGroupLeague = fotmobLeague.name.toLowerCase().includes('grp.') ||
                                fotmobLeague.name.toLowerCase().includes('group') ||
                                fotmobLeague.name.toLowerCase().includes('grp ') ||
                                fotmobLeague.name.toLowerCase().includes('stage') ||
                                fotmobLeague.name.toLowerCase().includes('phase');
            
            if (isGroupLeague) {
                console.log(`🔍 GROUP LEAGUE DETECTED: ${fotmobLeague.name} (id=${fotmobLeague.id})`);
                console.log(`🔍 Searching all similar groups to ensure comprehensive match coverage...`);
                
                // For group leagues, search all similar groups (A, B, C, D, etc.)
                const similarLeagues = fotmobData.leagues.filter(league => {
                    const leagueName = league.name.toLowerCase();
                    const fotmobName = leagueMapping.fotmobName.toLowerCase();
                    
                    return leagueName.includes(fotmobName) || fotmobName.includes(leagueName);
                });
                
                console.log(`📋 Found ${similarLeagues.length} similar groups to search:`);
                similarLeagues.forEach(league => {
                    console.log(`   - ${league.name}: id=${league.id}, matches=${league.matches?.length || 0}`);
                    if (league.matches && league.matches.length > 0) {
                        allMatchesToSearch.push(...league.matches);
                    }
                });
                
                matchingResult.debugInfo.searchSteps.push(`✅ Group league: searching ${similarLeagues.length} groups with ${allMatchesToSearch.length} total matches`);
            } else {
                console.log(`✅ COMPLETE LEAGUE DETECTED: ${fotmobLeague.name} (id=${fotmobLeague.id})`);
                
                // ALWAYS add matches from the exact league found first
                if (fotmobLeague.matches && fotmobLeague.matches.length > 0) {
                    allMatchesToSearch.push(...fotmobLeague.matches);
                    console.log(`   ✅ Added ${fotmobLeague.matches.length} matches from exact league: ${fotmobLeague.name}`);
                }
                
                console.log(`🔍 Searching ALL leagues with primaryId ${fotmobLeagueId} (not just the first one)`);
                
                // Find ALL leagues with the same primaryId (not just the first one)
                const allLeaguesWithSamePrimaryId = fotmobData.leagues.filter(league => 
                    league.primaryId === fotmobLeagueId && league.id !== fotmobLeague.id // Exclude the exact league we already added
                );
                console.log(`📋 Found ${allLeaguesWithSamePrimaryId.length} additional leagues with primaryId ${fotmobLeagueId}:`);
                allLeaguesWithSamePrimaryId.forEach(league => {
                    console.log(`   - ${league.name}: id=${league.id}, matches=${league.matches?.length || 0}`);
                });
                
                // For complete leagues, search ALL leagues with the same primaryId
                allLeaguesWithSamePrimaryId.forEach(league => {
                    if (league.matches && league.matches.length > 0) {
                        allMatchesToSearch.push(...league.matches);
                        console.log(`   ✅ Added ${league.matches.length} matches from ${league.name}`);
                    }
                });
                
                console.log(`🔍 Total matches from all leagues with primaryId ${fotmobLeagueId}: ${allMatchesToSearch.length}`);
                
                matchingResult.debugInfo.searchSteps.push(`✅ Complete league: searching ${1 + allLeaguesWithSamePrimaryId.length} leagues (1 exact + ${allLeaguesWithSamePrimaryId.length} with same primaryId), total matches: ${allMatchesToSearch.length}`);
            }
        } else {
            // Fallback: exact league not found, search similar leagues
            console.log(`❌ EXACT LEAGUE NOT FOUND: Searching similar leagues as fallback...`);
            const similarLeagues = fotmobData.leagues.filter(league => {
                const leagueName = league.name.toLowerCase();
                const fotmobName = leagueMapping.fotmobName.toLowerCase();
                
                return leagueName.includes(fotmobName) || fotmobName.includes(leagueName);
            });

            console.log(`📋 Found ${similarLeagues.length} similar leagues to search:`);
            similarLeagues.forEach(league => {
                console.log(`   - ${league.name}: id=${league.id}, matches=${league.matches?.length || 0}`);
                if (league.matches && league.matches.length > 0) {
                    allMatchesToSearch.push(...league.matches);
                }
            });
            
            matchingResult.debugInfo.searchSteps.push(`✅ Fallback: searching ${similarLeagues.length} similar leagues with ${allMatchesToSearch.length} total matches`);
        }
        console.log(`🔍 Total matches to search: ${allMatchesToSearch.length}`);
        // Debug info already added in the logic above

        console.log(`🔍 DEBUGGING MATCH MATCHING:`);
        console.log(`   - Bet teams: "${bet.homeName}" vs "${bet.awayName}"`);
        console.log(`   - Bet date: ${betDate.toISOString()}`);
        console.log(`   - Total matches to search: ${allMatchesToSearch.length}`);

        for (const match of allMatchesToSearch) {
            const matchDate = new Date(match.status?.utcTime || match.time);
            const timeDiff = Math.abs(matchDate.getTime() - betDate.getTime());
            const timeWindow = 25 * 60 * 60 * 1000; // 25 hours

            console.log(`\n📅 Checking match: ${match.home?.name || 'Unknown'} vs ${match.away?.name || 'Unknown'}`);
            console.log(`   - Match date: ${matchDate.toISOString()}`);
            console.log(`   - Time difference: ${timeDiff}ms (${(timeDiff / (60 * 60 * 1000)).toFixed(2)} hours)`);

            if (timeDiff > timeWindow) {
                console.log(`   ❌ Skipped: Outside 25-hour window`);
                continue;
            }

            // Check normal order: bet.home vs match.home, bet.away vs match.away
            const homeScoreNormal = this.calculateSimilarity(bet.homeName, match.home?.name || '');
            const awayScoreNormal = this.calculateSimilarity(bet.awayName, match.away?.name || '');
            const totalScoreNormal = (homeScoreNormal + awayScoreNormal) / 2;

            // Check swapped order: bet.home vs match.away, bet.away vs match.home
            const homeScoreSwapped = this.calculateSimilarity(bet.homeName, match.away?.name || '');
            const awayScoreSwapped = this.calculateSimilarity(bet.awayName, match.home?.name || '');
            const totalScoreSwapped = (homeScoreSwapped + awayScoreSwapped) / 2;

            // Use the better score (normal or swapped)
            const totalScore = Math.max(totalScoreNormal, totalScoreSwapped);
            const isSwapped = totalScoreSwapped > totalScoreNormal;

            console.log(`   - Normal order:`);
            console.log(`     Home: "${bet.homeName}" vs "${match.home?.name || ''}" = ${homeScoreNormal.toFixed(3)}`);
            console.log(`     Away: "${bet.awayName}" vs "${match.away?.name || ''}" = ${awayScoreNormal.toFixed(3)}`);
            console.log(`     Total: ${totalScoreNormal.toFixed(3)}`);
            console.log(`   - Swapped order:`);
            console.log(`     Bet Home vs Match Away: "${bet.homeName}" vs "${match.away?.name || ''}" = ${homeScoreSwapped.toFixed(3)}`);
            console.log(`     Bet Away vs Match Home: "${bet.awayName}" vs "${match.home?.name || ''}" = ${awayScoreSwapped.toFixed(3)}`);
            console.log(`     Total: ${totalScoreSwapped.toFixed(3)}`);
            console.log(`   - Using ${isSwapped ? 'SWAPPED' : 'NORMAL'} order (score: ${totalScore.toFixed(3)})`);

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
            
            // ✅ NEW: Try Gemini AI fallback if we have matches but score is too low
            if (allMatchesToSearch.length > 0 && bestMatch) {
                console.log(`   🤖 Attempting Gemini AI fallback for match finding...`);
                try {
                    const { findMatchWithGemini } = await import('./utils/gemini-match-matcher.js');
                    const geminiMatch = await findMatchWithGemini(
                        bet.homeName,
                        bet.awayName,
                        betDate,
                        bet.leagueName || leagueMapping.fotmobName,
                        allMatchesToSearch
                    );
                    
                    if (geminiMatch) {
                        console.log(`   ✅ Gemini found match: ${geminiMatch.home?.name || 'Unknown'} vs ${geminiMatch.away?.name || 'Unknown'}`);
                        matchingResult.match = geminiMatch;
                        matchingResult.score = 0.7; // Set a reasonable score for Gemini matches
                        matchingResult.leagueMapping = leagueMapping;
                        matchingResult.debugInfo.searchSteps.push(`✅ Gemini fallback: Match found via AI`);
                        return matchingResult;
                    } else {
                        console.log(`   ❌ Gemini could not find a match either`);
                    }
                } catch (geminiError) {
                    console.error(`   ❌ Gemini fallback failed:`, geminiError.message || geminiError);
                    // Continue to original error handling
                }
            }
            
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
     * Fetch detailed match information using Fotmob API (Direct API call)
     */
    async fetchMatchDetails(matchId) {
        try {
            console.log(`🔍 Fetching detailed match information for ID: ${matchId}`);
            
            // Use direct API call instead of Fotmob library
            const apiUrl = `https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`;
            
            // Get x-mas token (required for authentication)
            let xmasToken = null;
            try {
                const xmasResponse = await axios.get('http://46.101.91.154:6006/');
                xmasToken = xmasResponse.data?.['x-mas'];
                if (xmasToken) {
                    console.log(`✅ Got x-mas token`);
                }
            } catch (xmasError) {
                console.warn(`⚠️ Could not get x-mas token, trying without it...`);
            }
            
            const headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.fotmob.com/',
                'Accept-Encoding': 'gzip, deflate, br'
            };
            
            if (xmasToken) {
                headers['x-mas'] = xmasToken;
            }
            
            console.log(`🔍 Calling direct FotMob API: ${apiUrl}`);
            const response = await axios.get(apiUrl, { headers, timeout: 30000 });
            const matchDetails = response.data;
            
            console.log(`🐛 [BREAKPOINT] FotMob API response received for match ${matchId}`);
            console.log(`🐛 [BREAKPOINT] Response data available: ${!!matchDetails}`);
            if (matchDetails) {
                console.log(`🐛 [BREAKPOINT] Match: ${matchDetails.general?.homeTeam?.name} vs ${matchDetails.general?.awayTeam?.name}`);
                console.log(`🐛 [BREAKPOINT] Status: ${matchDetails.general?.finished ? 'Finished' : matchDetails.general?.started ? 'In Progress' : 'Not Started'}`);
            }
            
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
                
                // Debug: Check for unavailable array in matchDetails (correct location: content.lineup.awayTeam/homeTeam.unavailable)
                const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
                const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
                const unavailableCheck = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                          ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
                console.log(`   - Unavailable players check: ${unavailableCheck.length} total (Away: ${Array.isArray(awayUnavailable) ? awayUnavailable.length : 0}, Home: ${Array.isArray(homeUnavailable) ? homeUnavailable.length : 0})`);
                if (unavailableCheck.length > 0) {
                    console.log(`   - Unavailable players found: ${unavailableCheck.length}`);
                    unavailableCheck.slice(0, 3).forEach((p, idx) => {
                        console.log(`     ${idx + 1}. ${p?.name || 'Unknown'} (ID: ${p?.id || 'N/A'}, Type: ${p?.unavailability?.type || 'N/A'})`);
                    });
                }
                
                // Check for player stats data (it's in content.playerStats)
                const playerStats = matchDetails.content?.playerStats || matchDetails.playerStats;
                if (playerStats) {
                    console.log(`   - Player stats available: ${Object.keys(playerStats).length} players`);
                    
                    // Check for goalkeepers specifically using the correct Fotmob structure
                    let goalkeepers = 0;
                    for (const [playerId, playerData] of Object.entries(playerStats)) {
                        if (playerData.isGoalkeeper === true) {
                            goalkeepers++;
                            console.log(`   - Goalkeeper: ${playerData.name} (Team: ${playerData.teamName})`);
                            
                            // Extract saves from the stats array
                            let saves = 0;
                            if (playerData.stats && Array.isArray(playerData.stats)) {
                                for (const statGroup of playerData.stats) {
                                    if (statGroup.stats && statGroup.stats["Saves"]) {
                                        saves = Number(statGroup.stats["Saves"].stat.value) || 0;
                                        break;
                                    }
                                }
                            }
                            console.log(`   - Saves: ${saves}`);
                        }
                    }
                    console.log(`   - Goalkeepers found: ${goalkeepers}`);
                } else {
                    console.log(`   - No player stats available`);
                }
                
                return matchDetails;
            } else {
                console.log(`❌ No match details found for ID: ${matchId}`);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ Error fetching match details for ID ${matchId}:`, error.message);
            
            // Log more details about the error
            if (error.response) {
                console.error(`   - Status: ${error.response.status}`);
                console.error(`   - Status Text: ${error.response.statusText}`);
                console.error(`   - URL: ${error.config?.url || 'N/A'}`);
                if (error.response.status === 404) {
                    console.error(`   ⚠️ HTTP 404: Match details not found for ID ${matchId}`);
                }
            } else if (error.request) {
                console.error(`   - Request made but no response received`);
                console.error(`   - URL: ${error.config?.url || 'N/A'}`);
            } else {
                console.error(`   - Error setting up request: ${error.message}`);
            }
            
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
    async calculateBetOutcome(bet, matchDetails) {
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
        
        console.log(`🔍 MARKET IDENTIFICATION DEBUG:`);
        console.log(`   - bet.marketName: "${bet.marketName}"`);
        console.log(`   - bet.outcomeLabel: "${bet.outcomeLabel}"`);
        console.log(`   - bet.betDetails.total: "${bet.betDetails?.total}"`);
        console.log(`   - normalized bet:`, norm);
        console.log(`   - identified marketCode: "${marketCode}"`);

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

        // Check for regular time/full time markets (handle both naming conventions)
        // Exclude Half Time/Full Time markets from regular time analysis
        const isRegularTimeMarket = (bet.marketName === 'Match (regular time)') || 
                                   (bet.marketName?.toLowerCase().includes('regular time')) ||
                                   (bet.marketName === 'Full Time') ||
                                   (bet.marketName === 'Match Regular Time') ||
                                   (bet.marketName?.toLowerCase() === 'full time result') ||
                                   (bet.marketName?.toLowerCase() === 'match result');
        
        if (isRegularTimeMarket) {
            // For regular time/full time markets, we need to check if the match was decided by penalties or aggregate
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
                // Regular time is a draw - for Full Time Result markets, use regular time result
                console.log(`   - Regular time result: Draw (${homeScore}-${awayScore})`);
                actualOutcome = 'X'; // Draw in regular time
                console.log(`   - Full Time Result market: Using regular time result (Draw)`);
                
                // Note: Penalties/aggregate are only relevant for specific penalty/aggregate markets
                if (hasPenalties) {
                    const penaltyScores = matchDetails.header.status.reason.penalties;
                    const homePenalties = penaltyScores[0];
                    const awayPenalties = penaltyScores[1];
                    console.log(`   - Penalty shootout: ${homePenalties}-${awayPenalties} (not used for Full Time Result)`);
                } else if (hasAggregate) {
                    // Match was decided by aggregate
                    const aggregateStr = matchDetails.header.status.aggregatedStr;
                    const aggregateMatch = aggregateStr.match(/(\d+)\s*-\s*(\d+)/);
                    
                    if (aggregateMatch) {
                        const homeAggregate = parseInt(aggregateMatch[1]);
                        const awayAggregate = parseInt(aggregateMatch[2]);
                        
                        // if (homeAggregate > awayAggregate) {
                        //     actualOutcome = '1'; // Home win on aggregate
                        // } else if (awayAggregate > homeAggregate) {
                        //     actualOutcome = '2'; // Away win on aggregate
                        // } else {
                        //     actualOutcome = 'X'; // Draw on aggregate
                        // }
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

            // Normalize both values for comparison
            const normalizedBetSelection = bet.outcomeLabel?.toLowerCase().trim();
            const normalizedActualOutcome = actualOutcome?.toLowerCase().trim();
            
            // Handle different formats for draw
            let isDrawMatch = false;
            if (actualOutcome === 'X' && (normalizedBetSelection === 'draw' || normalizedBetSelection === 'x')) {
                isDrawMatch = true;
            } else if (actualOutcome === '1' && (normalizedBetSelection === 'home' || normalizedBetSelection === '1')) {
                isDrawMatch = true;
            } else if (actualOutcome === '2' && (normalizedBetSelection === 'away' || normalizedBetSelection === '2')) {
                isDrawMatch = true;
            }
            
            betWon = isDrawMatch || (bet.outcomeLabel === actualOutcome);

            console.log(`🎯 Regular Time/Full Time market outcome analysis:`);
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
            
        } else if (bet.marketName === 'Draw No Bet' || bet.marketName === 'Draw No Bet - 1st Half' || bet.marketName === 'Draw No Bet - 2nd Half') {
            // Draw No Bet (full-time, 1st half, or 2nd half); draw => void, else winner by 1/2
            const isFirstHalf = bet.marketName === 'Draw No Bet - 1st Half';
            const isSecondHalf = bet.marketName === 'Draw No Bet - 2nd Half';
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim(); // '1' or '2'

            let homeScore, awayScore, periodLabel;
            
            if (isFirstHalf) {
                // For 1st half, we need to get the halftime scores
                const firstHalfScores = getHalftimeScore(matchDetails);
                if (!firstHalfScores || firstHalfScores.home === null || firstHalfScores.home === undefined || 
                    firstHalfScores.away === null || firstHalfScores.away === undefined) {
                    return {
                        status: 'cancelled',
                        reason: 'First half score unavailable for Draw No Bet - 1st Half',
                        debugInfo: { missing: 'firstHalfScore' }
                    };
                }
                homeScore = firstHalfScores.home;
                awayScore = firstHalfScores.away;
                periodLabel = '1st Half';
            } else if (isSecondHalf) {
                // For 2nd half, we need to get the 2nd half scores
                const secondHalfScores = getSecondHalfScore(matchDetails);
                homeScore = secondHalfScores.home;
                awayScore = secondHalfScores.away;
                periodLabel = '2nd Half';
            } else {
                // For full-time, use final scores
                homeScore = ftHome;
                awayScore = ftAway;
                periodLabel = 'Full Time';
            }

            console.log(`🎯 DRAW NO BET ${periodLabel}:`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - ${periodLabel} Score: ${homeScore}-${awayScore}`);
            console.log(`   - Home Team: ${matchDetails.general?.homeTeam?.name}`);
            console.log(`   - Away Team: ${matchDetails.general?.awayTeam?.name}`);

            if (homeScore === awayScore) {
                return {
                    status: 'void',
                    reason: `Draw No Bet ${periodLabel} - draw ${matchDetails.general?.homeTeam?.name} ${homeScore}-${awayScore} ${matchDetails.general?.awayTeam?.name}`,
                    finalScore: `${homeScore}-${awayScore}`,
                    matchId: matchDetails.general?.matchId,
                    period: periodLabel
                };
            }

            const actual = homeScore > awayScore ? '1' : '2';
            const won = selection === actual;
            
            console.log(`   - Actual winner: ${actual} (${homeScore > awayScore ? 'Home' : 'Away'})`);
            console.log(`   - Bet result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                finalScore: `${homeScore}-${awayScore}`,
                matchId: matchDetails.general?.matchId,
                period: periodLabel,
                reason: `Draw No Bet ${periodLabel}: ${matchDetails.general?.homeTeam?.name} ${homeScore}-${awayScore} ${matchDetails.general?.awayTeam?.name} (bet ${selection})`
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
                
                // Extract team name from selection and match with bet team names (not Fotmob names!)
                const selectionLower = selection.toLowerCase();
                const betHomeLower = String(bet.homeName || '').toLowerCase();
                const betAwayLower = String(bet.awayName || '').toLowerCase();
                
                console.log(`🔍 Exact Winning Margin analysis: "${selection}"`);
                console.log(`   - Bet home team: "${bet.homeName}"`);
                console.log(`   - Bet away team: "${bet.awayName}"`);
                
                let selSide = null;
                
                // Check if selection contains bet home team name using similarity
                const selectionTeamPart = selectionLower.split(' to win by')[0]?.trim() || selectionLower;
                if (this.namesMatch(selectionTeamPart, bet.homeName)) {
                    selSide = 'home';
                    console.log(`✅ Identified as HOME team bet: ${bet.homeName}`);
                } else if (this.namesMatch(selectionTeamPart, bet.awayName)) {
                    selSide = 'away';
                    console.log(`✅ Identified as AWAY team bet: ${bet.awayName}`);
                } else {
                    console.log(`❌ No team match found for Exact Winning Margin`);
                    return { 
                        status: 'cancelled', 
                        reason: 'Unable to determine team for Exact Winning Margin', 
                        debugInfo: { 
                            selection: selection, 
                            betHomeName: bet.homeName,
                            betAwayName: bet.awayName
                        } 
                    };
                }
                
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

        } else if ((bet.marketName === '3-Way Line' || bet.marketName === '3-Way Handicap') && marketCode === MarketCodes.UNKNOWN) {
            // 3-way handicap based on integer/half line (e.g., -1.0, 0.0, +1.0) from bet.handicapLine
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const selection = String(bet.outcomeLabel || '').trim().toUpperCase(); // '1' | 'X' | '2'
            // Get handicap line with proper conversion
            let h = null;
            if (bet.betDetails?.total) {
                h = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                h = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                h = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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

        } else if (bet.marketName?.toLowerCase().includes('asian handicap') || 
                   (bet.marketName?.toLowerCase().includes('asian') && !bet.marketName?.toLowerCase().includes('total'))) {
            // Asian Handicap (Full Match or 1st Half) using stored line (exclude Asian Total markets)
            const isFirstHalf = bet.marketName?.toLowerCase().includes('1st half') || 
                               bet.marketName?.toLowerCase().includes('first half');
            
            console.log(`🎯 ASIAN HANDICAP MARKET CALCULATION`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Outcome Label: "${bet.outcomeLabel}"`);
            console.log(`   - Period: ${isFirstHalf ? '1st Half' : 'Full Match'}`);
            
            // Get scores based on period
            let ftHome, ftAway;
            if (isFirstHalf) {
                const firstHalfScore = getHalftimeScore(matchDetails);
                if (firstHalfScore && (firstHalfScore.home !== undefined || firstHalfScore.homeScore !== undefined)) {
                    ftHome = firstHalfScore.home || firstHalfScore.homeScore || 0;
                    ftAway = firstHalfScore.away || firstHalfScore.awayScore || 0;
                } else {
                    return { status: 'cancelled', reason: 'First half score unavailable for Asian Handicap 1st Half', debugInfo: { missing: 'firstHalfScore' } };
                }
            } else {
                const finalScore = getFinalScore(matchDetails);
                ftHome = finalScore.homeScore;
                ftAway = finalScore.awayScore;
            }
            console.log(`   📊 ORIGINAL SCORES:`);
            console.log(`      - Home: ${ftHome} (type: ${typeof ftHome})`);
            console.log(`      - Away: ${ftAway} (type: ${typeof ftAway})`);
            
            // Get handicap line with proper conversion
            // Priority: hints.line (already normalized) > unibetMeta.handicapLine > betDetails.total > handicapLine (check if needs conversion) > handicapRaw > parse from market name
            let h = null;
            if (bet.hints?.line !== undefined) {
                // hints.line is already in correct format (e.g., -1, -0.5, 2.75)
                h = Number(bet.hints.line);
                console.log(`   - Handicap from hints.line: ${h}`);
            } else if (bet.unibetMeta?.handicapLine !== undefined && bet.unibetMeta.handicapLine !== null) {
                h = Number(bet.unibetMeta.handicapLine);
                console.log(`   - Handicap from unibetMeta.handicapLine: ${h}`);
            } else if (bet.betDetails?.total) {
                h = parseFloat(bet.betDetails.total);
                console.log(`   - Handicap from betDetails.total: ${h}`);
            } else if (typeof bet.handicapLine === 'number') {
                // Check if handicapLine is already in correct format (small number) or needs conversion (large number)
                // If it's a large number (e.g., -1000, 7500), divide by 1000
                // If it's a small number (e.g., -1, -0.5), use as is
                if (Math.abs(bet.handicapLine) >= 100) {
                    h = bet.handicapLine / 1000; // Convert from 7500 to 7.5
                    console.log(`   - Handicap from handicapLine (converted): ${bet.handicapLine} / 1000 = ${h}`);
                } else {
                    h = bet.handicapLine; // Already in correct format
                    console.log(`   - Handicap from handicapLine (as is): ${h}`);
                }
            } else if (typeof bet.handicapRaw === 'number') {
                h = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
                console.log(`   - Handicap from handicapRaw: ${bet.handicapRaw} / 1000000 = ${h}`);
            }
            
            const selectionTeam = String(bet.outcomeLabel || '').toLowerCase();
            
            // Match selection with bet team names (not Fotmob names!)
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            console.log(`   🔍 TEAM IDENTIFICATION:`);
            console.log(`      - Selection: "${selectionTeam}"`);
            console.log(`      - Bet Home Team: "${bet.homeName}"`);
            console.log(`      - Bet Away Team: "${bet.awayName}"`);
            
            let homePicked = false;
            let awayPicked = false;
            
            // Check if selection contains bet home team name using similarity
            if (this.namesMatch(selectionTeam, bet.homeName)) {
                homePicked = true;
                console.log(`      ✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(selectionTeam, bet.awayName)) {
                awayPicked = true;
                console.log(`      ✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else if (selectionTeam === '1' || selectionTeam === 'home') {
                homePicked = true;
                console.log(`      ✅ Identified as HOME team bet (numeric/text): ${bet.homeName}`);
            } else if (selectionTeam === '2' || selectionTeam === 'away') {
                awayPicked = true;
                console.log(`      ✅ Identified as AWAY team bet (numeric/text): ${bet.awayName}`);
            } else {
                console.log(`      ❌ No team match found for Asian Handicap`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Asian Handicap', 
                    debugInfo: { 
                        selection: selectionTeam, 
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }

            // If handicap is still null, try to parse it from market name or criterionLabel
            // Format: "Asian Line (1 - 0)" or "Asian Handicap (1 - 0)" means home gets +1, away gets -1
            if (h === null || Number.isNaN(h)) {
                const marketName = bet.marketName || bet.unibetMeta?.marketName || '';
                const criterionLabel = bet.criterionLabel || bet.unibetMeta?.criterionLabel || '';
                const criterionEnglishLabel = bet.criterionEnglishLabel || bet.unibetMeta?.criterionEnglishLabel || '';
                
                // Try to match patterns like "(1 - 0)", "(0.5 - 0)", "(0 - 1)", "(1.5 - 0.5)", etc.
                const handicapPattern = /\(([\d.]+)\s*[-–—]\s*([\d.]+)\)/;
                const marketText = marketName + ' ' + criterionLabel + ' ' + criterionEnglishLabel;
                const match = marketText.match(handicapPattern);
                
                if (match) {
                    const homeHandicap = parseFloat(match[1]);
                    const awayHandicap = parseFloat(match[2]);
                    
                    // For format "(X - Y)": home team gets +X, away team gets -X (or equivalently, home gets +X, away gets -X)
                    // The difference (X - Y) is the handicap value
                    // If homePicked, handicap is +X (or +(X-Y) if Y is not 0)
                    // If awayPicked, handicap is -X (or -(X-Y) if Y is not 0)
                    
                    if (homePicked) {
                        // Home team selected: handicap is positive (home gets the advantage)
                        h = homeHandicap - awayHandicap; // e.g., (1 - 0) = +1, (0.5 - 0) = +0.5
                        console.log(`   - Handicap parsed from market name "${marketText}": (${homeHandicap} - ${awayHandicap}) = ${h} for HOME team`);
                    } else if (awayPicked) {
                        // Away team selected: handicap is negative (away gets the disadvantage, or home gets advantage)
                        h = -(homeHandicap - awayHandicap); // e.g., (1 - 0) = -1, (0.5 - 0) = -0.5
                        console.log(`   - Handicap parsed from market name "${marketText}": (${homeHandicap} - ${awayHandicap}) = ${h} for AWAY team`);
                    }
                } else {
                    // Try alternative pattern: just a number in parentheses like "(1)", "(0.5)", "(-1)"
                    const simplePattern = /\(([-+]?[\d.]+)\)/;
                    const simpleMatch = marketText.match(simplePattern);
                    if (simpleMatch) {
                        const parsedHandicap = parseFloat(simpleMatch[1]);
                        if (!isNaN(parsedHandicap)) {
                            if (homePicked) {
                                h = Math.abs(parsedHandicap); // Home gets positive handicap
                            } else if (awayPicked) {
                                h = -Math.abs(parsedHandicap); // Away gets negative handicap
                            }
                            console.log(`   - Handicap parsed from market name "${marketText}": ${parsedHandicap} → ${h} for ${homePicked ? 'HOME' : 'AWAY'} team`);
                        }
                    }
                }
            }

            if (h === null || Number.isNaN(h) || (!homePicked && !awayPicked)) {
                console.log(`   ❌ MISSING DATA:`);
                console.log(`      - Handicap line: ${h} (valid: ${h !== null && !Number.isNaN(h)})`);
                console.log(`      - Team selected: ${homePicked ? 'HOME' : awayPicked ? 'AWAY' : 'NONE'}`);
                return {
                    status: 'cancelled',
                    reason: 'Asian Handicap requires handicap line and a clear team selection',
                    debugInfo: { missing: { handicapLine: h === null, team: (!homePicked && !awayPicked) } }
                };
            }

            console.log(`   🔢 HANDICAP LINE ANALYSIS:`);
            console.log(`      - Original line: ${h}`);
            
            // Check line type:
            // - Whole number: -1, 0, 1, 2 (h % 1 === 0)
            // - Half number: -1.5, -0.5, 0.5, 1.5 (h % 0.5 === 0 && h % 1 !== 0)
            // - Quarter number: -1.25, -0.75, 0.25, 0.75 (h % 0.25 === 0 && h % 0.5 !== 0)
            const isWholeNumber = Math.abs(h % 1) === 0;
            const isHalfNumber = Math.abs(h % 0.5) === 0 && Math.abs(h % 1) !== 0;
            const isQuarterNumber = Math.abs(h % 0.25) === 0 && Math.abs(h % 0.5) !== 0;
            
            console.log(`      - Is whole number? ${isWholeNumber}`);
            console.log(`      - Is half number? ${isHalfNumber}`);
            console.log(`      - Is quarter number? ${isQuarterNumber}`);
            
            // Asian Handicap: Only quarter numbers (e.g., -1.25, -0.75, 0.25, 0.75) split into two bets
            // Whole numbers (-1, 0, 1) and half numbers (-1.5, -0.5, 0.5) don't split
            let lines;
            if (isQuarterNumber) {
                // Quarter line: Split into two parts (e.g., -1.25 → -1.5 and -1.0, or 0.75 → 0.5 and 1.0)
                lines = [Math.floor(h * 2) / 2, Math.ceil(h * 2) / 2];
            } else {
                // Whole or half number: No split
                lines = [h];
            }
            console.log(`      - Split lines: [${lines.join(', ')}] (${lines.length} part${lines.length > 1 ? 's' : ''})`);
            
            let wonParts = 0, voidParts = 0, lostParts = 0;
            
            console.log(`   📋 CALCULATION FOR EACH LINE:`);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                console.log(`      --- Line ${i + 1}/${lines.length}: ${line} ---`);
                
                // Asian handicap: line applies to the TEAM YOU BET ON, not always home team
                let adjHome, adjAway;
                if (homePicked) {
                    // Betting on HOME team: apply handicap to HOME
                    adjHome = Number(ftHome) + Number(line);
                    adjAway = Number(ftAway);
                    console.log(`         Step 1: Betting on HOME team → Apply handicap to HOME`);
                    console.log(`         Step 2: Adjusted Home = ${ftHome} + (${line}) = ${adjHome}`);
                    console.log(`         Step 3: Adjusted Away = ${ftAway} (unchanged)`);
                } else if (awayPicked) {
                    // Betting on AWAY team: apply handicap to AWAY
                    adjHome = Number(ftHome);
                    adjAway = Number(ftAway) + Number(line);
                    console.log(`         Step 1: Betting on AWAY team → Apply handicap to AWAY`);
                    console.log(`         Step 2: Adjusted Home = ${ftHome} (unchanged)`);
                    console.log(`         Step 3: Adjusted Away = ${ftAway} + (${line}) = ${adjAway}`);
                } else {
                    // Should not happen, but fallback
                    adjHome = Number(ftHome) + Number(line);
                    adjAway = Number(ftAway);
                    console.log(`         Step 1: No team identified → Default to HOME`);
                    console.log(`         Step 2: Adjusted Home = ${ftHome} + (${line}) = ${adjHome}`);
                    console.log(`         Step 3: Adjusted Away = ${ftAway} (unchanged)`);
                }
                
                const diff = adjHome - adjAway;
                console.log(`         Step 4: Difference = ${adjHome} - ${adjAway} = ${diff}`);
                
                // Determine result based on which team was bet on
                if (homePicked) {
                    console.log(`         Step 5: Betting on HOME team`);
                    if (diff > 0) {
                        wonParts++;
                        console.log(`         → Result: WON (${adjHome} > ${adjAway})`);
                    } else if (diff < 0) {
                        lostParts++;
                        console.log(`         → Result: LOST (${adjHome} < ${adjAway})`);
                    } else {
                        voidParts++;
                        console.log(`         → Result: VOID (${adjHome} === ${adjAway})`);
                    }
                } else if (awayPicked) {
                    console.log(`         Step 5: Betting on AWAY team`);
                    if (diff < 0) {
                        wonParts++;
                        console.log(`         → Result: WON (${adjHome} < ${adjAway}, i.e., ${adjAway} > ${adjHome})`);
                    } else if (diff > 0) {
                        lostParts++;
                        console.log(`         → Result: LOST (${adjHome} > ${adjAway}, i.e., ${adjAway} < ${adjHome})`);
                    } else {
                        voidParts++;
                        console.log(`         → Result: VOID (${adjHome} === ${adjAway})`);
                    }
                }
            }

            console.log(`   📊 FINAL RESULT SUMMARY:`);
            console.log(`      - Won parts: ${wonParts}/${lines.length}`);
            console.log(`      - Lost parts: ${lostParts}/${lines.length}`);
            console.log(`      - Void parts: ${voidParts}/${lines.length}`);
            
            let status;
            let isHalfWin = false;
            let isHalfLoss = false;
            
            if (lostParts === lines.length) {
                status = 'lost';
                console.log(`      → Final Status: LOST (all parts lost)`);
            } else if (wonParts === lines.length) {
                status = 'won';
                console.log(`      → Final Status: WON (all parts won)`);
            } else if (voidParts === lines.length) {
                status = 'void';
                console.log(`      → Final Status: VOID (all parts void)`);
            } else if (wonParts > 0 && lostParts > 0) {
                // Mixed won and lost (shouldn't happen in Asian Handicap, but handle it)
                status = 'lost';
                console.log(`      → Final Status: LOST (mixed result, but lost parts present)`);
            } else if (wonParts > 0 && voidParts > 0 && lostParts === 0) {
                // Half Win: One part won, one part void
                status = 'half_won';
                isHalfWin = true;
                console.log(`      → Final Status: HALF WIN (${wonParts} part won, ${voidParts} part void)`);
            } else if (lostParts > 0 && voidParts > 0 && wonParts === 0) {
                // Half Loss: One part lost, one part void
                status = 'half_lost';
                isHalfLoss = true;
                console.log(`      → Final Status: HALF LOSS (${lostParts} part lost, ${voidParts} part void)`);
            } else {
                // Fallback (shouldn't happen)
                status = wonParts > 0 ? 'won' : 'void';
                console.log(`      → Final Status: ${status.toUpperCase()} (fallback)`);
            }

            const periodLabel = isFirstHalf ? '1st Half' : 'Full Match';
            let reason;
            if (isHalfWin) {
                reason = `Asian Handicap ${periodLabel} (${h}) on ${homePicked ? 'home' : 'away'}: HALF WIN (half stake won, half refunded)`;
            } else if (isHalfLoss) {
                reason = `Asian Handicap ${periodLabel} (${h}) on ${homePicked ? 'home' : 'away'}: HALF LOSS (half stake lost, half refunded)`;
            } else {
                reason = `Asian Handicap ${periodLabel} (${h}) on ${homePicked ? 'home' : 'away'}: ${status}`;
            }
            
            return {
                status,
                actualOutcome: status === 'void' ? 'push' : (homePicked ? 'home' : 'away'),
                finalScore: `${ftHome}-${ftAway}`,
                matchId: matchDetails.general?.matchId,
                reason,
                isHalfWin,
                isHalfLoss
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
            // Team Total Goals (Over/Under) - Full Time, 1st Half, or 2nd Half
            const marketNameLower = (bet.marketName || '').toLowerCase();
            const isFirstHalf = marketNameLower.includes('1st half') || marketNameLower.includes('first half');
            const isSecondHalf = marketNameLower.includes('2nd half') || marketNameLower.includes('second half');
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            let homeScore, awayScore, periodLabel;
            
            if (isFirstHalf) {
                // For 1st half, get halftime scores
                const halftimeScores = getHalftimeScore(matchDetails);
                homeScore = halftimeScores.home;
                awayScore = halftimeScores.away;
                periodLabel = '1st Half';
                console.log(`   - Using 1st Half scores: ${homeScore}-${awayScore}`);
            } else if (isSecondHalf) {
                // For 2nd half, get the 2nd half scores
                const secondHalfScores = getSecondHalfScore(matchDetails);
                homeScore = secondHalfScores.home;
                awayScore = secondHalfScores.away;
                periodLabel = '2nd Half';
                console.log(`   - Using 2nd Half scores: ${homeScore}-${awayScore}`);
            } else {
                // For full-time, use final scores
                const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
                homeScore = ftHome;
                awayScore = ftAway;
                periodLabel = 'Full Time';
                console.log(`   - Using Full Time scores: ${homeScore}-${awayScore}`);
            }
            
            // Try to identify the team from multiple sources
            let targetTeam = null;
            let isHome = false;
            let isAway = false;
            
            // Method 1: Check if bet.participant contains team name (primary method)
            // if (bet.participant) {
            //     const participantLower = String(bet.participant).toLowerCase();
            //     const homeNameLower = String(homeName || '').toLowerCase();
            //     const awayNameLower = String(awayName || '').toLowerCase();
                
            //     if (participantLower.includes(homeNameLower) || homeNameLower.includes(participantLower)) {
            //         targetTeam = homeName;
            //         isHome = true;
            //     } else if (participantLower.includes(awayNameLower) || awayNameLower.includes(participantLower)) {
            //         targetTeam = awayName;
            //         isAway = true;
            //     }
            // }
            
            // Method 2: Check bet.marketName if participant method failed
            // if (!targetTeam) {
            //     const lowerName = String(bet.marketName || '').toLowerCase();
            //     const homeNameLower = String(homeName || '').toLowerCase();
            //     const awayNameLower = String(awayName || '').toLowerCase();
                
            //     if (lowerName.includes(homeNameLower)) {
            //         targetTeam = homeName;
            //         isHome = true;
            //     } else if (lowerName.includes(awayNameLower)) {
            //         targetTeam = awayName;
            //         isAway = true;
            //     }
            // }
            
            // Method 3: Check bet.marketName to identify which team the bet was placed on
            // Match with ACTUAL match team names (from matchDetails), not bet team names (which might be swapped)
            if (!targetTeam && bet.marketName) {
                console.log(`🔍 Market name analysis: "${bet.marketName}"`);
                
                // Extract team name from market name (handle "Total Goals by Team - 1st Half" format)
                let teamFromMarket = '';
                if (marketNameLower.includes(' by ')) {
                    const parts = marketNameLower.split(' by ');
                    if (parts.length > 1) {
                        // Remove "1st half", "2nd half", etc. from team name
                        teamFromMarket = parts[1]
                            .replace(/\s*-\s*1st\s+half/gi, '')
                            .replace(/\s*-\s*2nd\s+half/gi, '')
                            .replace(/\s*-\s*first\s+half/gi, '')
                            .replace(/\s*-\s*second\s+half/gi, '')
                            .trim();
                    }
                }
                
                console.log(`   - Team from market: "${teamFromMarket}"`);
                console.log(`   - Match home team: "${homeName}"`);
                console.log(`   - Match away team: "${awayName}"`);
                
                // Match team from market with ACTUAL match team names (from matchDetails)
                // This ensures we use the correct team even if bet teams are swapped
                if (teamFromMarket && this.namesMatch(teamFromMarket, homeName)) {
                    targetTeam = homeName;
                    isHome = true;
                    console.log(`✅ Identified as HOME team bet: ${homeName}`);
                } else if (teamFromMarket && this.namesMatch(teamFromMarket, awayName)) {
                    targetTeam = awayName;
                    isAway = true;
                    console.log(`✅ Identified as AWAY team bet: ${awayName}`);
                } else {
                    console.log(`❌ No team match found in market name`);
                }
            }
            
            // Method 4: Fallback - Check bet.homeName/bet.awayName if market name method failed
            // But map to actual match team names (handle swapped teams)
            if (!targetTeam && bet.homeName && bet.awayName) {
                console.log(`🔍 Fallback: Checking bet team names`);
                console.log(`   - Bet home: "${bet.homeName}" vs Match home: "${homeName}"`);
                console.log(`   - Bet away: "${bet.awayName}" vs Match away: "${awayName}"`);
                
                // Check if bet team names match match team names using similarity
                // Handle both normal and swapped cases
                if (this.namesMatch(bet.homeName, homeName)) {
                    targetTeam = homeName;
                    isHome = true;
                    console.log(`✅ Bet home team matches match home team: ${homeName}`);
                } else if (this.namesMatch(bet.awayName, awayName)) {
                    targetTeam = awayName;
                    isAway = true;
                    console.log(`✅ Bet away team matches match away team: ${awayName}`);
                } else if (this.namesMatch(bet.homeName, awayName)) {
                    // Bet teams might be swapped
                    targetTeam = awayName;
                    isAway = true;
                    console.log(`✅ Bet home team matches match away team (swapped): ${awayName}`);
                } else if (this.namesMatch(bet.awayName, homeName)) {
                    // Bet teams might be swapped
                    targetTeam = homeName;
                    isHome = true;
                    console.log(`✅ Bet away team matches match home team (swapped): ${homeName}`);
                }
            }
            
            // Get line from bet details (e.g., "1.5") or handicap fields
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            } else if (bet.normalized?.hints?.line) {
                line = bet.normalized.hints.line;
            }

            if (!isHome && !isAway) {
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to identify team for Team Total Goals', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        participant: bet.participant,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName,
                        fotmobHomeName: homeName, 
                        fotmobAwayName: awayName,
                        targetTeam: targetTeam
                    } 
                };
            }
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Team Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }

            const total = isHome ? homeScore : awayScore;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'over' | 'under'
            
            console.log(`🎯 TEAM TOTAL GOALS ${periodLabel}:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - ${periodLabel} Score: ${homeScore}-${awayScore}`);
            console.log(`   - Target Team: ${isHome ? 'Home' : 'Away'} (${isHome ? homeName : awayName})`);
            console.log(`   - Team Total: ${total}`);
            
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';
            
            console.log(`   - Bet result: ${status.toUpperCase()}`);

            return {
                status,
                finalScore: `${homeScore}-${awayScore}`,
                teamTotal: total,
                line,
                period: periodLabel,
                matchId: matchDetails.general?.matchId,
                reason: `Team Total Goals ${periodLabel} (${isHome ? 'home' : 'away'}) ${selection} ${line}: total=${total} → ${status}`
            };

        /* TIME-WINDOW MARKET commented out – re-enable in market-registry.js and here to support
        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_INTERVAL_OU) {
            // Total Goals in a specific window (e.g., "Total Goals - 30:00-59:59" or "Total Goals by Team - 30:00-59:59")
            const name = (bet.marketName || '').toLowerCase();
            const m = name.match(/(\d{1,2})[:\-](\d{2})\s*[-–]\s*(\d{1,2})[:\-](\d{2})/);
            if (m) {
                const start = parseInt(m[1], 10);
                const end = parseInt(m[3], 10);
                
                // Check if this is a team-specific time window market
                const isTeamMarket = name.includes('total goals by') || name.includes('team total goals');
                
                let total, line, selection, status, reason;
                
                if (isTeamMarket) {
                    // Team Total Goals in Time Window
                    const { homeName, awayName } = getTeamNames(matchDetails);
                    
                    // Try to identify the team from multiple sources
                    let targetTeam = null;
                    let isHome = false;
                    let isAway = false;
                    
                    // Method 1: Check if bet.participant contains team name (primary method)
                    if (bet.participant) {
                        const participant = String(bet.participant);
                        if (participant.toLowerCase().includes('home')) {
                            targetTeam = homeName;
                            isHome = true;
                        } else if (participant.toLowerCase().includes('away')) {
                            targetTeam = awayName;
                            isAway = true;
                        } else if (this.namesMatch(participant, homeName)) {
                            targetTeam = homeName;
                            isHome = true;
                        } else if (this.namesMatch(participant, awayName)) {
                            targetTeam = awayName;
                            isAway = true;
                        }
                    }
                    
                    // Method 2: Extract team name from market name using similarity
                    if (!targetTeam && bet.marketName) {
                        const marketName = String(bet.marketName);
                        // Extract potential team name from market (split by common delimiters)
                        const marketParts = marketName.split(/[-–—]/).map(part => part.trim());
                        for (const part of marketParts) {
                            if (this.namesMatch(part, homeName)) {
                                targetTeam = homeName;
                                isHome = true;
                                break;
                            } else if (this.namesMatch(part, awayName)) {
                                targetTeam = awayName;
                                isAway = true;
                                break;
                            }
                        }
                    }
                    
                    // Method 3: Check bet team names
                    if (!targetTeam && bet.homeName && bet.awayName) {
                        const betHomeLower = String(bet.homeName).toLowerCase();
                        const betAwayLower = String(bet.awayName).toLowerCase();
                        const marketLower = String(bet.marketName || '').toLowerCase();
                        
                        if (marketLower.includes(betHomeLower)) {
                            targetTeam = bet.homeName;
                            isHome = true;
                        } else if (marketLower.includes(betAwayLower)) {
                            targetTeam = bet.awayName;
                            isAway = true;
                        }
                    }
                    
                    if (!isHome && !isAway) {
                        return { 
                            status: 'cancelled', 
                            reason: 'Unable to identify team for Team Total Goals in Time Window', 
                            debugInfo: { 
                                marketName: bet.marketName, 
                                participant: bet.participant,
                                betHomeName: bet.homeName,
                                betAwayName: bet.awayName,
                                fotmobHomeName: homeName, 
                                fotmobAwayName: awayName,
                                targetTeam: targetTeam
                            } 
                        };
                    }
                    
                    // Get team goals in the time window
                const goals = getGoalsInWindow(matchDetails, start, end);
                    const teamGoals = goals.filter(goal => {
                        if (isHome) {
                            return goal.teamId === matchDetails.general?.homeTeam?.id;
                        } else {
                            return goal.teamId === matchDetails.general?.awayTeam?.id;
                        }
                    });
                    
                    total = teamGoals.length;
                    line = typeof bet.handicapLine === 'number' ? bet.handicapLine / 1000
                          : (typeof bet.handicapRaw === 'number' ? bet.handicapRaw / 1000000 : null);
                    
                    if (line === null || Number.isNaN(line)) {
                        return { status: 'cancelled', reason: 'Team Total Goals in Time Window requires a valid line', debugInfo: { missing: 'handicapLine' } };
                    }
                    
                    selection = String(bet.outcomeLabel || '').toLowerCase();
                    if (total > line && selection.includes('over')) status = 'won';
                    else if (total < line && selection.includes('under')) status = 'won';
                    else if (total === line) status = 'void';
                    else status = 'lost';
                    
                    reason = `Team Total Goals ${start}-${end} (${isHome ? 'home' : 'away'}) ${selection} ${line}: total=${total} → ${status}`;
                    
                } else {
                    // Match Total Goals in Time Window
                    const goals = getGoalsInWindow(matchDetails, start, end);
                    total = goals.length;
                    line = typeof bet.handicapLine === 'number' ? bet.handicapLine / 1000
                          : (typeof bet.handicapRaw === 'number' ? bet.handicapRaw / 1000000 : null);
                    
                if (line === null || Number.isNaN(line)) {
                    return { status: 'cancelled', reason: 'Interval Total Goals requires a valid line', debugInfo: { missing: 'handicapLine' } };
                }
                    
                    selection = String(bet.outcomeLabel || '').toLowerCase();
                if (total > line && selection.includes('over')) status = 'won';
                else if (total < line && selection.includes('under')) status = 'won';
                else if (total === line) status = 'void';
                else status = 'lost';
                    
                    reason = `Interval Total Goals ${start}-${end} ${selection} ${line}: total=${total} → ${status}`;
                }
                
                return {
                    status,
                    interval: `${start}-${end}`,
                    totalGoalsInWindow: total,
                    line,
                    matchId: matchDetails.general?.matchId,
                    reason
                };
            }
            // Fall through to generic Total Goals if no interval could be parsed
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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
        } */
        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_1ST_HALF_OU) {
            // Total Goals - 1st Half (Over/Under)
            const halftimeScores = getHalftimeScore(matchDetails);
            const total = halftimeScores.home + halftimeScores.away;
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            } else if (bet.normalized?.hints?.line) {
                line = bet.normalized.hints.line / 1000; // Convert from 1500 to 1.5
            }
            
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Goals - 1st Half requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'over' | 'under'
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';

            console.log(`🎯 TOTAL GOALS - 1ST HALF:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - 1st Half Score: ${halftimeScores.home}-${halftimeScores.away}`);
            console.log(`   - Total Goals: ${total}`);
            console.log(`   - Result: ${status.toUpperCase()}`);

            return {
                status,
                finalScore: `${halftimeScores.home}-${halftimeScores.away}`,
                totalGoals: total,
                line,
                period: '1st Half',
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals - 1st Half ${selection} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_2ND_HALF_OU) {
            // Total Goals - 2nd Half (Over/Under)
            const secondHalfScores = getSecondHalfScore(matchDetails);
            const total = secondHalfScores.home + secondHalfScores.away;
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            } else if (bet.normalized?.hints?.line) {
                line = bet.normalized.hints.line / 1000; // Convert from 1500 to 1.5
            }
            
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Goals - 2nd Half requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'over' | 'under'
            let status;
            if (total > line && selection.includes('over')) status = 'won';
            else if (total < line && selection.includes('under')) status = 'won';
            else if (total === line) status = 'void';
            else status = 'lost';

            console.log(`🎯 TOTAL GOALS - 2ND HALF:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - 2nd Half Score: ${secondHalfScores.home}-${secondHalfScores.away}`);
            console.log(`   - Total Goals: ${total}`);
            console.log(`   - Result: ${status.toUpperCase()}`);

            return {
                status,
                finalScore: `${secondHalfScores.home}-${secondHalfScores.away}`,
                totalGoals: total,
                line,
                period: '2nd Half',
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals - 2nd Half ${selection} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_OU) {
            // Total Goals (Over/Under) - Full Time
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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
                period: 'Full Time',
                matchId: matchDetails.general?.matchId,
                reason: `Total Goals ${selection} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.BTTS_1ST_HALF) {
            // Both Teams To Score - 1st Half
            const halftimeScores = getHalftimeScore(matchDetails);
            const yes = halftimeScores.home > 0 && halftimeScores.away > 0;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'yes' | 'no'
            const won = (yes && selection.includes('yes')) || (!yes && selection.includes('no'));
            
            console.log(`🎯 BTTS - 1ST HALF:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - 1st Half Score: ${halftimeScores.home}-${halftimeScores.away}`);
            console.log(`   - Both teams scored: ${yes ? 'Yes' : 'No'}`);
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${halftimeScores.home}-${halftimeScores.away}`,
                period: '1st Half',
                matchId: matchDetails.general?.matchId,
                reason: `BTTS - 1st Half: ${yes ? 'Yes' : 'No'} (home=${halftimeScores.home}, away=${halftimeScores.away}), bet=${selection}`
            };

        } else if (marketCode === MarketCodes.BTTS_2ND_HALF) {
            // Both Teams To Score - 2nd Half
            const secondHalfScores = getSecondHalfScore(matchDetails);
            const yes = secondHalfScores.home > 0 && secondHalfScores.away > 0;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'yes' | 'no'
            const won = (yes && selection.includes('yes')) || (!yes && selection.includes('no'));
            
            console.log(`🎯 BTTS - 2ND HALF:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - 2nd Half Score: ${secondHalfScores.home}-${secondHalfScores.away}`);
            console.log(`   - Both teams scored: ${yes ? 'Yes' : 'No'}`);
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${secondHalfScores.home}-${secondHalfScores.away}`,
                period: '2nd Half',
                matchId: matchDetails.general?.matchId,
                reason: `BTTS - 2nd Half: ${yes ? 'Yes' : 'No'} (home=${secondHalfScores.home}, away=${secondHalfScores.away}), bet=${selection}`
            };

        } else if (marketCode === MarketCodes.BTTS) {
            // Both Teams To Score (BTTS) - Full Time
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const yes = ftHome > 0 && ftAway > 0;
            const selection = String(bet.outcomeLabel || '').toLowerCase(); // 'yes' | 'no'
            const won = (yes && selection.includes('yes')) || (!yes && selection.includes('no'));
            
            console.log(`🎯 BTTS - FULL TIME:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selection: ${selection}`);
            console.log(`   - Full Time Score: ${ftHome}-${ftAway}`);
            console.log(`   - Both teams scored: ${yes ? 'Yes' : 'No'}`);
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${ftHome}-${ftAway}`,
                period: 'Full Time',
                matchId: matchDetails.general?.matchId,
                reason: `BTTS: ${yes ? 'Yes' : 'No'} (home=${ftHome}, away=${ftAway}), bet=${selection}`
            };

        } else if (marketCode === MarketCodes.CORRECT_SCORE) {
            // Correct Score - Full Time, 1st Half, or 2nd Half
            const marketNameLower = (bet.marketName || '').toLowerCase();
            const isFirstHalf = marketNameLower.includes('1st half') || marketNameLower.includes('first half');
            const isSecondHalf = marketNameLower.includes('2nd half') || marketNameLower.includes('second half');
            
            let homeScore, awayScore, periodLabel;
            
            if (isFirstHalf) {
                // For 1st half, get halftime scores
                const halftimeScores = getHalftimeScore(matchDetails);
                homeScore = halftimeScores.home;
                awayScore = halftimeScores.away;
                periodLabel = '1st Half';
                console.log(`   - Using 1st Half scores: ${homeScore}-${awayScore}`);
            } else if (isSecondHalf) {
                // For 2nd half, get the 2nd half scores
                const secondHalfScores = getSecondHalfScore(matchDetails);
                homeScore = secondHalfScores.home;
                awayScore = secondHalfScores.away;
                periodLabel = '2nd Half';
                console.log(`   - Using 2nd Half scores: ${homeScore}-${awayScore}`);
            } else {
                // For full-time, use final scores
                const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
                homeScore = ftHome;
                awayScore = ftAway;
                periodLabel = 'Full Time';
                console.log(`   - Using Full Time scores: ${homeScore}-${awayScore}`);
            }
            
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
                return { 
                    status: 'cancelled', 
                    reason: 'Correct Score selection not parseable', 
                    debugInfo: { outcomeLabel: bet.outcomeLabel } 
                };
            }
            
            const won = (homeScore === selHome) && (awayScore === selAway);
            
            console.log(`🎯 CORRECT SCORE ${periodLabel}:`);
            console.log(`   - Market: ${bet.marketName}`);
            console.log(`   - Selected: ${selHome}-${selAway}`);
            console.log(`   - Actual ${periodLabel}: ${homeScore}-${awayScore}`);
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                finalScore: `${homeScore}-${awayScore}`,
                selectedScore: `${selHome}-${selAway}`,
                period: periodLabel,
                matchId: matchDetails.general?.matchId,
                reason: `Correct Score ${periodLabel}: selected ${selHome}-${selAway}, actual ${homeScore}-${awayScore}`
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
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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

        } else if ((bet.marketName || '').toLowerCase().includes('next goal') && !(bet.marketName || '').toLowerCase().includes('method of scoring')) {
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
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
            
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Team Total Cards requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            
            // Extract team name from market name and match with bet team names
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            // Handle different market name formats: "Total Cards by Team" or "Total Cards - Team"
            if (marketNameLower.includes(' by ')) {
                teamFromMarket = marketNameLower.split(' by ')[1] || '';
            } else if (marketNameLower.includes(' - ')) {
                teamFromMarket = marketNameLower.split(' - ')[1] || '';
            }
            
            // Get home and away team names from match details for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 TEAM TOTAL CARDS MARKET:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Bet Selection: "${bet.outcomeLabel}" (${sel})`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Home Team (Match): ${homeTeamName}`);
            console.log(`   - Away Team (Match): ${awayTeamName}`);
            console.log(`   - Bet Home Team: "${bet.homeName}"`);
            console.log(`   - Bet Away Team: "${bet.awayName}"`);
            console.log(`   - Team from market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names (not Fotmob names!)
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            let targetIsHome = false;
            let targetIsAway = false;
            let targetTeamName = '';
            
            // Check if market team matches bet home team using similarity
            if (this.namesMatch(teamFromMarket, bet.homeName)) {
                targetIsHome = true;
                targetTeamName = bet.homeName;
                console.log(`   ✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(teamFromMarket, bet.awayName)) {
                targetIsAway = true;
                targetTeamName = bet.awayName;
                console.log(`   ✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`   ❌ No team match found for Team Total Cards`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Total Cards', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
            console.log(`   - Fetching card data...`);
            const cards = getTeamCards(matchDetails);
            
            // Get card counts for the target team
            const teamYellow = targetIsHome ? cards.home.yellow : cards.away.yellow;
            const teamRed = targetIsHome ? cards.home.red : cards.away.red;
            const teamTotal = targetIsHome ? cards.home.total : cards.away.total;
            
            // Also get opponent cards for context
            const opponentYellow = targetIsHome ? cards.away.yellow : cards.home.yellow;
            const opponentRed = targetIsHome ? cards.away.red : cards.home.red;
            const opponentTotal = targetIsHome ? cards.away.total : cards.home.total;
            const opponentTeamName = targetIsHome ? awayTeamName : homeTeamName;
            
            console.log(`   ✅ Card Data Retrieved:`);
            console.log(`      - ${targetTeamName} (${targetIsHome ? 'Home' : 'Away'}):`);
            console.log(`         • Yellow Cards: ${teamYellow}`);
            console.log(`         • Red Cards: ${teamRed}`);
            console.log(`         • Total Cards: ${teamTotal} (${teamYellow} yellow + ${teamRed} red)`);
            console.log(`      - ${opponentTeamName} (${targetIsHome ? 'Away' : 'Home'}):`);
            console.log(`         • Yellow Cards: ${opponentYellow}`);
            console.log(`         • Red Cards: ${opponentRed}`);
            console.log(`         • Total Cards: ${opponentTotal} (${opponentYellow} yellow + ${opponentRed} red)`);
            
            // Calculate outcome
            const isOver = sel.includes('over');
            const isUnder = sel.includes('under');
            let status;
            let comparison = '';
            
            if (teamTotal > line && isOver) {
                status = 'won';
                comparison = `${teamTotal} > ${line} (Over)`;
            } else if (teamTotal < line && isUnder) {
                status = 'won';
                comparison = `${teamTotal} < ${line} (Under)`;
            } else if (teamTotal === line) {
                status = 'void';
                comparison = `${teamTotal} === ${line} (Push)`;
            } else {
                status = 'lost';
                if (isOver) {
                    comparison = `${teamTotal} <= ${line} (Over bet lost)`;
                } else if (isUnder) {
                    comparison = `${teamTotal} >= ${line} (Under bet lost)`;
                } else {
                    comparison = `${teamTotal} vs ${line}`;
                }
            }
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Target Team: ${targetTeamName}`);
            console.log(`      - Team Total Cards: ${teamTotal}`);
            console.log(`      - Line: ${line}`);
            console.log(`      - Bet: ${sel} ${line}`);
            console.log(`      - Comparison: ${comparison}`);
            console.log(`      - Result: ${status.toUpperCase()} ${status === 'won' ? '✅' : status === 'lost' ? '❌' : '⚪'}`);
            
            return {
                status,
                team: targetIsHome ? 'home' : 'away',
                teamCards: teamTotal,
                teamYellowCards: teamYellow,
                teamRedCards: teamRed,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Team Total Cards ${sel} ${line}: ${targetTeamName} cards=${teamTotal} (${teamYellow}Y + ${teamRed}R) → ${status}`
            };

        } else if ((bet.marketName || '').toLowerCase().includes('total cards')) {
            // Total Cards (Over/Under)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
            
            console.log(`🎯 TOTAL CARDS CALCULATION:`);
            console.log(`   - Bet selection: "${sel}"`);
            console.log(`   - Bet details total: ${bet.betDetails?.total}`);
            console.log(`   - Handicap line: ${bet.handicapLine}`);
            console.log(`   - Handicap raw: ${bet.handicapRaw}`);
            console.log(`   - Calculated line: ${line}`);
            
            if (line === null || Number.isNaN(line)) {
                return { status: 'cancelled', reason: 'Total Cards requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            
            const cards = getTeamCards(matchDetails);
            const total = cards.home.total + cards.away.total;
            
            console.log(`   - Actual total cards: ${total}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: "${sel}"`);
            
            let status;
            if (total > line && sel.includes('over')) {
                status = 'won';
                console.log(`   - Result: WON (${total} > ${line} and selection is over)`);
            } else if (total < line && sel.includes('under')) {
                status = 'won';
                console.log(`   - Result: WON (${total} < ${line} and selection is under)`);
            } else if (total === line) {
                status = 'void';
                console.log(`   - Result: VOID (${total} = ${line})`);
            } else {
                status = 'lost';
                console.log(`   - Result: LOST (${total} vs ${line}, selection: ${sel})`);
            }
            
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
            const cards = getTeamCards(matchDetails);
            
            // Extract team name from market name and match with bet team names
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            // Handle different market name formats: "Red Card by Team" or "Team Red Cards - Team"
            if (marketNameLower.includes(' by ')) {
                teamFromMarket = marketNameLower.split(' by ')[1] || '';
            } else if (marketNameLower.includes(' - ')) {
                teamFromMarket = marketNameLower.split(' - ')[1] || '';
            } else if (marketNameLower.includes('given a red card')) {
                // Extract team name from "Team given a red card" format
                const parts = marketNameLower.split('given a red card');
                if (parts.length > 0) {
                    teamFromMarket = parts[0].trim();
                }
            }
            
            console.log(`🔍 Team Red Cards analysis: "${bet.marketName}"`);
            console.log(`   - Team from market: "${teamFromMarket}"`);
            console.log(`   - Bet home team: "${bet.homeName}"`);
            console.log(`   - Bet away team: "${bet.awayName}"`);
            
            // Match team from market with bet team names (not Fotmob names!) using similarity
            let isHome = false;
            let isAway = false;
            
            // Check if market team matches bet home team using similarity
            if (this.namesMatch(teamFromMarket, bet.homeName)) {
                isHome = true;
                console.log(`✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(teamFromMarket, bet.awayName)) {
                isAway = true;
                console.log(`✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`❌ No team match found for Team Red Cards`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Red Cards', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
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

        } else if (marketCode === MarketCodes.MOST_CARDS_2ND_HALF ||
                   ((!marketCode || marketCode === 'undefined' || marketCode === MarketCodes.UNKNOWN) && (bet.marketName || '').toLowerCase().includes('most cards') && ((bet.marketName || '').toLowerCase().includes('2nd half') || (bet.marketName || '').toLowerCase().includes('second half')))) {
            // Most Cards - 2nd Half (check FIRST before 1st half)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            // Get home and away team names for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 MOST CARDS - 2ND HALF:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Bet Selection: ${sel}`);
            console.log(`   - Home Team: ${homeTeamName}`);
            console.log(`   - Away Team: ${awayTeamName}`);
            const isFallback = !marketCode || marketCode === 'undefined' || marketCode === MarketCodes.UNKNOWN;
            console.log(`   - Market Code: ${marketCode || 'undefined'} (${isFallback ? '⚠️  FALLBACK - matched by market name' : '✅ Matched by registry'})`);
            
            console.log(`   - Fetching 2nd Half cards...`);
            const cards = getTeamCards(matchDetails, '2nd half');
            const home = cards.home.total;
            const away = cards.away.total;
            
            console.log(`   ✅ 2nd Half Cards Result:`);
            console.log(`      - ${homeTeamName} (Home): ${home} cards`);
            console.log(`      - ${awayTeamName} (Away): ${away} cards`);
            
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Period: 2nd Half`);
            console.log(`      - ${homeTeamName} (Home): ${home} cards`);
            console.log(`      - ${awayTeamName} (Away): ${away} cards`);
            console.log(`      - Actual Outcome: ${actual} (${home > away ? homeTeamName + ' wins' : home < away ? awayTeamName + ' wins' : 'Draw'})`);
            console.log(`      - Bet Selection: ${sel}`);
            console.log(`      - Result: ${won ? 'WON ✅' : 'LOST ❌'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                cardTotals: { home, away },
                period: '2nd Half',
                matchId: matchDetails.general?.matchId,
                reason: `Most Cards - 2nd Half: ${actual} (${homeTeamName}=${home}, ${awayTeamName}=${away}) (bet ${sel})`
            };

        } else if (marketCode === MarketCodes.MOST_CARDS_1ST_HALF || 
                   ((!marketCode || marketCode === 'undefined' || marketCode === MarketCodes.UNKNOWN) && (bet.marketName || '').toLowerCase().includes('most cards') && ((bet.marketName || '').toLowerCase().includes('1st half') || (bet.marketName || '').toLowerCase().includes('first half')))) {
            // Most Cards - 1st Half
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            // Get home and away team names for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 MOST CARDS - 1ST HALF:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Bet Selection: ${sel}`);
            console.log(`   - Home Team: ${homeTeamName}`);
            console.log(`   - Away Team: ${awayTeamName}`);
            const isFallback1st = !marketCode || marketCode === 'undefined' || marketCode === MarketCodes.UNKNOWN;
            console.log(`   - Market Code: ${marketCode || 'undefined'} (${isFallback1st ? '⚠️  FALLBACK - matched by market name' : '✅ Matched by registry'})`);
            
            console.log(`   - Fetching 1st Half cards...`);
            const cards = getTeamCards(matchDetails, '1st half');
            const home = cards.home.total;
            const away = cards.away.total;
            
            console.log(`   ✅ 1st Half Cards Result:`);
            console.log(`      - ${homeTeamName} (Home): ${home} cards`);
            console.log(`      - ${awayTeamName} (Away): ${away} cards`);
            
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Period: 1st Half`);
            console.log(`      - ${homeTeamName} (Home): ${home} cards`);
            console.log(`      - ${awayTeamName} (Away): ${away} cards`);
            console.log(`      - Actual Outcome: ${actual} (${home > away ? homeTeamName + ' wins' : home < away ? awayTeamName + ' wins' : 'Draw'})`);
            console.log(`      - Bet Selection: ${sel}`);
            console.log(`      - Result: ${won ? 'WON ✅' : 'LOST ❌'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                cardTotals: { home, away },
                period: '1st Half',
                matchId: matchDetails.general?.matchId,
                reason: `Most Cards - 1st Half: ${actual} (${homeTeamName}=${home}, ${awayTeamName}=${away}) (bet ${sel})`
            };

        } else if (marketCode === MarketCodes.MOST_CARDS || 
                   ((!marketCode || marketCode === 'undefined' || marketCode === MarketCodes.UNKNOWN) && (bet.marketName || '').toLowerCase().includes('most cards') && !(bet.marketName || '').toLowerCase().includes('1st half') && !(bet.marketName || '').toLowerCase().includes('2nd half') && !(bet.marketName || '').toLowerCase().includes('first half') && !(bet.marketName || '').toLowerCase().includes('second half'))) {
            // Most Cards: compare totals (Full Time)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get home and away team names for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 MOST CARDS - FULL MATCH:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Bet Selection: ${sel}`);
            console.log(`   - Home Team: ${homeTeamName}`);
            console.log(`   - Away Team: ${awayTeamName}`);
            const isFallback = !marketCode || marketCode === 'undefined' || marketCode === MarketCodes.UNKNOWN;
            console.log(`   - Market Code: ${marketCode || 'undefined'} (${isFallback ? '⚠️  FALLBACK - matched by market name' : '✅ Matched by registry'})`);
            
            console.log(`   - Fetching Full Match cards...`);
            const cards = getTeamCards(matchDetails, 'full');
            const home = cards.home.total;
            const away = cards.away.total;
            
            console.log(`   ✅ Full Match Cards Result:`);
            console.log(`      - ${homeTeamName} (Home): ${home} cards`);
            console.log(`      - ${awayTeamName} (Away): ${away} cards`);
            
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Period: Full Match`);
            console.log(`      - ${homeTeamName} (Home): ${home} cards`);
            console.log(`      - ${awayTeamName} (Away): ${away} cards`);
            console.log(`      - Actual Outcome: ${actual} (${home > away ? homeTeamName + ' wins' : home < away ? awayTeamName + ' wins' : 'Draw'})`);
            console.log(`      - Bet Selection: ${sel}`);
            console.log(`      - Result: ${won ? 'WON ✅' : 'LOST ❌'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                cardTotals: { home, away },
                period: 'Full Match',
                matchId: matchDetails.general?.matchId,
                reason: `Most Cards - Full Match: ${actual} (${homeTeamName}=${home}, ${awayTeamName}=${away}) (bet ${sel})`
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

        } else if ((bet.marketName || '').toLowerCase().includes('cards 3-way') && !(bet.marketName || '').toLowerCase().includes('line')) {
            // Cards 3-Way Handicap: compare totals with integer handicap
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            // Get line with proper conversion
            let line = 0;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
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
            // Team Total Corners (Over/Under) - Full Match, 1st Half, or 2nd Half
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            // Get home and away team names from match details for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 TEAM TOTAL CORNERS MARKET:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Bet Selection: ${sel}`);
            console.log(`   - Match Home Team: ${homeTeamName}`);
            console.log(`   - Match Away Team: ${awayTeamName}`);
            console.log(`   - Bet Home Name: "${bet.homeName || 'N/A'}"`);
            console.log(`   - Bet Away Name: "${bet.awayName || 'N/A'}"`);
            
            // Check if this is a 1st half or 2nd half market
            const isFirstHalf = marketName.includes('1st half') || marketName.includes('first half');
            const isSecondHalf = marketName.includes('2nd half') || marketName.includes('second half');
            const period = isFirstHalf ? '1st Half' : (isSecondHalf ? '2nd Half' : 'Full Match');
            
            console.log(`   - Period: ${period}`);
            console.log(`   - Is 1st Half: ${isFirstHalf}`);
            console.log(`   - Is 2nd Half: ${isSecondHalf}`);
            
            // Get line from multiple sources with proper conversion
            let line = null;
            let lineSource = 'unknown';
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
                lineSource = 'bet.betDetails.total';
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
                lineSource = 'bet.handicapLine (converted from ' + bet.handicapLine + ')';
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
                lineSource = 'bet.handicapRaw (converted from ' + bet.handicapRaw + ')';
            }
            
            console.log(`   - Line Extraction:`);
            console.log(`      - Source: ${lineSource}`);
            console.log(`      - Raw bet.betDetails.total: ${bet.betDetails?.total || 'N/A'}`);
            console.log(`      - Raw bet.handicapLine: ${bet.handicapLine || 'N/A'}`);
            console.log(`      - Raw bet.handicapRaw: ${bet.handicapRaw || 'N/A'}`);
            console.log(`      - Final Line: ${line}`);
            
            if (line === null || Number.isNaN(line)) {
                console.log(`   ❌ Invalid line - cancelling bet`);
                return { status: 'cancelled', reason: 'Team Total Corners requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            
            // Get corners based on period
            let corners;
            if (isFirstHalf) {
                console.log(`   - Fetching 1st Half corners...`);
                corners = getFirstHalfCorners(matchDetails);
                console.log(`   ✅ 1st Half Corners Result:`);
                console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                console.log(`      - Total: ${corners.total} corners`);
            } else if (isSecondHalf) {
                console.log(`   - Fetching 2nd Half corners...`);
                corners = getSecondHalfCorners(matchDetails);
                console.log(`   ✅ 2nd Half Corners Result:`);
                console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                console.log(`      - Total: ${corners.total} corners`);
            } else {
                console.log(`   - Fetching Full Match corners from stats...`);
                corners = getCornersFromStats(matchDetails);
                if (corners) {
                    console.log(`   ✅ Full Match Corners Result:`);
                    console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                    console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                    console.log(`      - Total: ${corners.total} corners`);
                }
            }
            
            if (!corners || corners.home === undefined || corners.away === undefined) {
                console.log(`   ❌ Corners statistics unavailable`);
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners', period } };
            }
            
            // Extract team name from market name and match with bet team names
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            // Handle different market name formats: "Total Corners by Team" or "Total Corners - Team"
            // Also handle "Total Corners by Team - 2nd Half" format
            if (marketNameLower.includes(' by ')) {
                const afterBy = marketNameLower.split(' by ')[1] || '';
                // Remove period suffixes like " - 2nd half", " - 1st half", etc.
                teamFromMarket = afterBy.replace(/\s*-\s*(1st|2nd|first|second)\s+half/gi, '').trim();
            } else if (marketNameLower.includes(' - ')) {
                const parts = marketNameLower.split(' - ');
                // If it's "Total Corners - Team - 2nd Half", take the middle part
                // If it's "Total Corners - Team", take the last part
                if (parts.length > 2) {
                    teamFromMarket = parts[1] || '';
                } else {
                    teamFromMarket = parts[1] || '';
                }
                // Remove period suffixes if any
                teamFromMarket = teamFromMarket.replace(/\s*(1st|2nd|first|second)\s+half/gi, '').trim();
            }
            
            console.log(`   🔍 Team Identification:`);
            console.log(`      - Market Name (lowercase): "${marketNameLower}"`);
            console.log(`      - Extracted Team from Market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names (not Fotmob names!)
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            let targetIsHome = false;
            let targetIsAway = false;
            
            console.log(`      - Comparing with bet teams:`);
            console.log(`         - Bet Home: "${bet.homeName}" (normalized: "${betHomeLower}")`);
            console.log(`         - Bet Away: "${bet.awayName}" (normalized: "${betAwayLower}")`);
            
            // Check if market team matches bet home team using similarity
            const homeMatch = this.namesMatch(teamFromMarket, bet.homeName);
            const awayMatch = this.namesMatch(teamFromMarket, bet.awayName);
            
            console.log(`      - Name Matching Results:`);
            console.log(`         - "${teamFromMarket}" vs "${bet.homeName}": ${homeMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
            console.log(`         - "${teamFromMarket}" vs "${bet.awayName}": ${awayMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
            
            if (homeMatch) {
                targetIsHome = true;
                console.log(`   ✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (awayMatch) {
                targetIsAway = true;
                console.log(`   ✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`   ❌ No team match found for Team Total Corners`);
                console.log(`      - Could not match "${teamFromMarket}" with either bet home or bet away team`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Total Corners', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
            const teamTotal = targetIsHome ? corners.home : (targetIsAway ? corners.away : null);
            const teamName = targetIsHome ? bet.homeName : bet.awayName;
            const teamType = targetIsHome ? 'HOME' : 'AWAY';
            const matchTeamName = targetIsHome ? homeTeamName : awayTeamName;
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Selected Team: ${teamName} (${teamType})`);
            console.log(`      - Match Team Name: ${matchTeamName}`);
            console.log(`      - Team Corners: ${teamTotal}`);
            console.log(`      - Line: ${line}`);
            console.log(`      - Selection: ${sel}`);
            
            let status;
            let comparison;
            if (teamTotal > line && sel.includes('over')) {
                status = 'won';
                comparison = `${teamTotal} > ${line} = TRUE (Over)`;
            } else if (teamTotal < line && sel.includes('under')) {
                status = 'won';
                comparison = `${teamTotal} < ${line} = TRUE (Under)`;
            } else if (teamTotal === line) {
                status = 'void';
                comparison = `${teamTotal} === ${line} = VOID`;
            } else {
                status = 'lost';
                if (sel.includes('over')) {
                    comparison = `${teamTotal} > ${line} = FALSE (needed Over, got ${teamTotal})`;
                } else if (sel.includes('under')) {
                    comparison = `${teamTotal} < ${line} = FALSE (needed Under, got ${teamTotal})`;
                } else {
                    comparison = 'Unknown selection';
                }
            }
            
            console.log(`      - Comparison: ${comparison}`);
            console.log(`      - Result: ${status.toUpperCase()} ${status === 'won' ? '✅' : status === 'lost' ? '❌' : '⚪'}`);
            
            return {
                status,
                team: targetIsHome ? 'home' : 'away',
                teamCorners: teamTotal,
                line,
                period: period,
                matchId: matchDetails.general?.matchId,
                reason: `Team Total Corners ${period} ${sel} ${line}: ${teamName} (${teamType}) corners=${teamTotal} vs line=${line} → ${status}`
            };

        } else if (marketCode === MarketCodes.CORNERS_TOTAL_OU) {
            // Total Corners (Over/Under) - Full Match, 1st Half, or 2nd Half
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            // Get home and away team names for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 TOTAL CORNERS MARKET:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Bet Selection: ${sel}`);
            console.log(`   - Home Team: ${homeTeamName}`);
            console.log(`   - Away Team: ${awayTeamName}`);
            
            // Check if this is a 1st half or 2nd half market
            const isFirstHalf = marketName.includes('1st half') || marketName.includes('first half');
            const isSecondHalf = marketName.includes('2nd half') || marketName.includes('second half');
            const period = isFirstHalf ? '1st Half' : (isSecondHalf ? '2nd Half' : 'Full Match');
            
            console.log(`   - Period: ${period}`);
            console.log(`   - Is 1st Half: ${isFirstHalf}`);
            console.log(`   - Is 2nd Half: ${isSecondHalf}`);
            
            // Get line from multiple sources with proper conversion
            let line = null;
            let lineSource = 'unknown';
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
                lineSource = 'bet.betDetails.total';
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
                lineSource = 'bet.handicapLine (converted from ' + bet.handicapLine + ')';
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
                lineSource = 'bet.handicapRaw (converted from ' + bet.handicapRaw + ')';
            }
            
            console.log(`   - Line Extraction:`);
            console.log(`      - Source: ${lineSource}`);
            console.log(`      - Raw bet.betDetails.total: ${bet.betDetails?.total || 'N/A'}`);
            console.log(`      - Final Line: ${line}`);
            
            if (line === null || Number.isNaN(line)) {
                console.log(`   ❌ Invalid line - cancelling bet`);
                return { status: 'cancelled', reason: 'Total Corners requires a valid line', debugInfo: { missing: 'handicapLine' } };
            }
            
            let corners;
            if (isFirstHalf) {
                // Get 1st half corners
                console.log(`   - Fetching 1st Half corners...`);
                corners = getFirstHalfCorners(matchDetails);
                console.log(`   ✅ 1st Half Corners Result:`);
                console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                console.log(`      - Total: ${corners.total} corners`);
            } else if (isSecondHalf) {
                // Get 2nd half corners
                console.log(`   - Fetching 2nd Half corners...`);
                corners = getSecondHalfCorners(matchDetails);
                console.log(`   ✅ 2nd Half Corners Result:`);
                console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                console.log(`      - Total: ${corners.total} corners`);
            } else {
                // Get full match corners from stats
                console.log(`   - Fetching Full Match corners from stats...`);
                corners = getCornersFromStats(matchDetails);
                if (corners) {
                    console.log(`   ✅ Full Match Corners Result:`);
                    console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                    console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                    console.log(`      - Total: ${corners.total} corners`);
                }
            }
            
            if (!corners || corners.total === undefined) {
                console.log(`   ❌ Corners statistics unavailable`);
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners', period } };
            }
            
            const total = corners.total;
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Period: ${period}`);
            console.log(`      - Total Corners: ${total}`);
            console.log(`      - Line: ${line}`);
            console.log(`      - Selection: ${sel}`);
            
            let status;
            let comparison;
            if (total > line && sel.includes('over')) {
                status = 'won';
                comparison = `${total} > ${line} = TRUE (Over)`;
            } else if (total < line && sel.includes('under')) {
                status = 'won';
                comparison = `${total} < ${line} = TRUE (Under)`;
            } else if (total === line) {
                status = 'void';
                comparison = `${total} === ${line} = VOID`;
            } else {
                status = 'lost';
                if (sel.includes('over')) {
                    comparison = `${total} > ${line} = FALSE (needed Over, got ${total})`;
                } else if (sel.includes('under')) {
                    comparison = `${total} < ${line} = FALSE (needed Under, got ${total})`;
                } else {
                    comparison = 'Unknown selection';
                }
            }
            
            console.log(`      - Comparison: ${comparison}`);
            console.log(`      - Result: ${status.toUpperCase()} ${status === 'won' ? '✅' : status === 'lost' ? '❌' : '⚪'}`);
            
            return {
                status,
                totalCorners: total,
                line,
                period: period,
                cornerTotals: { home: corners.home, away: corners.away, total },
                matchId: matchDetails.general?.matchId,
                reason: `Total Corners ${period} ${sel} ${line}: total=${total} vs line=${line} → ${status}`
            };

        } else if (marketCode === MarketCodes.TEAM_TOTAL_SHOTS_OU) {
            // Total Shots (Over/Under)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 28500 to 28.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 28500000 to 28.5
            }
            
            console.log(`🎯 TOTAL SHOTS MARKET: "${sel}"`);
            console.log(`   - Line: ${line}`);
            
            const shots = getTeamShots(matchDetails);
            if (!shots) {
                return { status: 'cancelled', reason: 'Shots statistics unavailable', debugInfo: { missing: 'shots' } };
            }
            
            const total = shots.total;
            const won = (sel.includes('over') && total > line) || (sel.includes('under') && total < line);
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Total shots: ${total}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                totalShots: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Shots ${sel} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.TEAM_SHOTS_ON_TARGET_OU) {
            // Total Shots on Target (Over/Under)
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 10500 to 10.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 10500000 to 10.5
            }
            
            console.log(`🎯 TOTAL SHOTS ON TARGET MARKET: "${sel}"`);
            console.log(`   - Line: ${line}`);
            
            const shotsOnTarget = getTeamShotsOnTarget(matchDetails);
            if (!shotsOnTarget) {
                return { status: 'cancelled', reason: 'Shots on target statistics unavailable', debugInfo: { missing: 'shotsOnTarget' } };
            }
            
            const total = shotsOnTarget.total;
            const won = (sel.includes('over') && total > line) || (sel.includes('under') && total < line);
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Total shots on target: ${total}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                totalShotsOnTarget: total,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Shots on Target ${sel} ${line}: total=${total} → ${status}`
            };

        } else if (marketCode === MarketCodes.TEAM_SHOTS_OU) {
            // Team-specific Shots (Over/Under) - e.g., "Total Shots by Club Bolívar"
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
            
            console.log(`🎯 TEAM SHOTS MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            
            // Extract team name from market name
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            if (marketNameLower.includes('shots by')) {
                // Extract team name from "Total Shots by Team Name" format
                const parts = marketNameLower.split('shots by');
                if (parts.length > 1) {
                    teamFromMarket = parts[1].trim();
                }
            }
            
            console.log(`   - Team from market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            let isHome = false;
            let isAway = false;
            
            // Check if market team matches bet home team using similarity
            if (this.namesMatch(teamFromMarket, bet.homeName)) {
                isHome = true;
                console.log(`✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(teamFromMarket, bet.awayName)) {
                isAway = true;
                console.log(`✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`❌ No team match found for Team Shots`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Shots', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
            const shots = getTeamShots(matchDetails);
            if (!shots) {
                return { status: 'cancelled', reason: 'Shots statistics unavailable', debugInfo: { missing: 'shots' } };
            }
            
            const teamShots = isHome ? shots.home : (isAway ? shots.away : 0);
            const won = (sel.includes('over') && teamShots > line) || (sel.includes('under') && teamShots < line);
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Team shots: ${teamShots}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                teamShots: teamShots,
                line,
                team: isHome ? 'home' : (isAway ? 'away' : 'unknown'),
                matchId: matchDetails.general?.matchId,
                reason: `Team Shots (${isHome ? 'home' : 'away'}) ${sel} ${line}: shots=${teamShots} → ${status}`
            };

        } else if (marketCode === MarketCodes.TEAM_SHOTS_ON_TARGET_BY) {
            // Team-specific Shots on Target (Over/Under) - e.g., "Total Shots on Target by Atlético Mineiro-MG"
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 4500 to 4.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 4500000 to 4.5
            }
            
            console.log(`🎯 TEAM SHOTS ON TARGET MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            
            // Extract team name from market name
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            if (marketNameLower.includes('shots on target by')) {
                // Extract team name from "Total Shots on Target by Team Name" format
                const parts = marketNameLower.split('shots on target by');
                if (parts.length > 1) {
                    teamFromMarket = parts[1].trim();
                }
            }
            
            console.log(`   - Team from market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            let isHome = false;
            let isAway = false;
            
            // Check if market team matches bet home team using similarity
            if (this.namesMatch(teamFromMarket, bet.homeName)) {
                isHome = true;
                console.log(`✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(teamFromMarket, bet.awayName)) {
                isAway = true;
                console.log(`✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`❌ No team match found for Team Shots on Target`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Shots on Target', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
            const shotsOnTarget = getTeamShotsOnTarget(matchDetails);
            if (!shotsOnTarget) {
                return { status: 'cancelled', reason: 'Shots on target statistics unavailable', debugInfo: { missing: 'shotsOnTarget' } };
            }
            
            const teamShotsOnTarget = isHome ? shotsOnTarget.home : (isAway ? shotsOnTarget.away : 0);
            const won = (sel.includes('over') && teamShotsOnTarget > line) || (sel.includes('under') && teamShotsOnTarget < line);
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Team shots on target: ${teamShotsOnTarget}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                teamShotsOnTarget: teamShotsOnTarget,
                line,
                team: isHome ? 'home' : (isAway ? 'away' : 'unknown'),
                matchId: matchDetails.general?.matchId,
                reason: `Team Shots on Target (${isHome ? 'home' : 'away'}) ${sel} ${line}: shots=${teamShotsOnTarget} → ${status}`
            };

        } else if (marketCode === MarketCodes.MOST_SHOTS_ON_TARGET) {
            // Most Shots on Target (1X2) - e.g., "Most Shots on Target (Settled using Opta data)"
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            
            console.log(`🎯 MOST SHOTS ON TARGET MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            
            const shotsOnTarget = getTeamShotsOnTarget(matchDetails);
            if (!shotsOnTarget) {
                return { status: 'cancelled', reason: 'Shots on target statistics unavailable', debugInfo: { missing: 'shotsOnTarget' } };
            }
            
            const homeShotsOnTarget = shotsOnTarget.home;
            const awayShotsOnTarget = shotsOnTarget.away;
            
            console.log(`   - Home shots on target: ${homeShotsOnTarget}`);
            console.log(`   - Away shots on target: ${awayShotsOnTarget}`);
            
            let won = false;
            let actualOutcome = '';
            
            if (homeShotsOnTarget > awayShotsOnTarget) {
                // Home team has more shots on target
                actualOutcome = '1';
                won = sel === '1';
                console.log(`   - Home team wins (${homeShotsOnTarget} > ${awayShotsOnTarget})`);
            } else if (awayShotsOnTarget > homeShotsOnTarget) {
                // Away team has more shots on target
                actualOutcome = '2';
                won = sel === '2';
                console.log(`   - Away team wins (${awayShotsOnTarget} > ${homeShotsOnTarget})`);
            } else {
                // Equal shots on target - draw
                actualOutcome = 'X';
                won = sel === 'x';
                console.log(`   - Draw (${homeShotsOnTarget} = ${awayShotsOnTarget})`);
            }
            
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                actualOutcome,
                homeShotsOnTarget,
                awayShotsOnTarget,
                matchId: matchDetails.general?.matchId,
                reason: `Most Shots on Target: Home ${homeShotsOnTarget} vs Away ${awayShotsOnTarget} → ${actualOutcome} (${status})`
            };

        } else if (marketCode === MarketCodes.TOTAL_OFFSIDES) {
            // Total Offsides (Over/Under) - e.g., "Total Offsides (Settled using Opta data)"
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 4500 to 4.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 4500000 to 4.5
            }
            
            console.log(`🎯 TOTAL OFFSIDES MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            
            const offsides = getTeamOffsides(matchDetails);
            if (!offsides) {
                return { status: 'cancelled', reason: 'Offsides statistics unavailable', debugInfo: { missing: 'offsides' } };
            }
            
            const totalOffsides = offsides.total;
            const won = (sel.includes('over') && totalOffsides > line) || (sel.includes('under') && totalOffsides < line);
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Total offsides: ${totalOffsides}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                totalOffsides: totalOffsides,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Offsides ${sel} ${line}: total=${totalOffsides} → ${status}`
            };

        } else if (marketCode === MarketCodes.TEAM_OFFSIDES_BY) {
            // Team-specific Offsides (Over/Under) - e.g., "Total Offsides by Atlético Mineiro-MG"
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 1500 to 1.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 1500000 to 1.5
            }
            
            console.log(`🎯 TEAM OFFSIDES MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            
            // Extract team name from market name
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            if (marketNameLower.includes('offsides by')) {
                // Extract team name from "Total Offsides by Team Name" format
                const parts = marketNameLower.split('offsides by');
                if (parts.length > 1) {
                    teamFromMarket = parts[1].trim();
                }
            }
            
            console.log(`   - Team from market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            let isHome = false;
            let isAway = false;
            
            // Check if market team matches bet home team using similarity
            if (this.namesMatch(teamFromMarket, bet.homeName)) {
                isHome = true;
                console.log(`✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(teamFromMarket, bet.awayName)) {
                isAway = true;
                console.log(`✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`❌ No team match found for Team Offsides`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Offsides', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
            const offsides = getTeamOffsides(matchDetails);
            if (!offsides) {
                return { status: 'cancelled', reason: 'Offsides statistics unavailable', debugInfo: { missing: 'offsides' } };
            }
            
            const teamOffsides = isHome ? offsides.home : (isAway ? offsides.away : 0);
            const won = (sel.includes('over') && teamOffsides > line) || (sel.includes('under') && teamOffsides < line);
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Team offsides: ${teamOffsides}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                teamOffsides: teamOffsides,
                line,
                team: isHome ? 'home' : (isAway ? 'away' : 'unknown'),
                matchId: matchDetails.general?.matchId,
                reason: `Team Offsides (${isHome ? 'home' : 'away'}) ${sel} ${line}: offsides=${teamOffsides} → ${status}`
            };

        } else if (marketCode === MarketCodes.THREE_WAY_HANDICAP_1ST_HALF) {
            // 3-Way Handicap - 1st Half (1X2) - e.g., "3-Way Handicap - 1st Half"
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            
            // Get handicap line from multiple sources with proper conversion
            let handicapLine = null;
            if (typeof bet.handicapLine === 'number') {
                handicapLine = bet.handicapLine; // handicapLine is already in correct format (e.g., -1)
            } else if (typeof bet.handicapRaw === 'number') {
                handicapLine = bet.handicapRaw / 1000000; // Convert handicapRaw from -1000000 to -1
            }
            
            console.log(`🎯 3-WAY HANDICAP 1ST HALF MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Handicap Line: ${handicapLine}`);
            
            const firstHalfScore = getHalftimeScore(matchDetails);
            console.log(`   - First half score from getHalftimeScore:`, firstHalfScore);
            
            let homeScore, awayScore;
            
            if (firstHalfScore && (firstHalfScore.home !== undefined || firstHalfScore.homeScore !== undefined)) {
                homeScore = firstHalfScore.home || firstHalfScore.homeScore || 0;
                awayScore = firstHalfScore.away || firstHalfScore.awayScore || 0;
                console.log(`   - Using first half score: ${homeScore} - ${awayScore}`);
            } else {
                // Fallback: Use final score as first half score (for testing purposes)
                const finalScore = getFinalScore(matchDetails);
                if (finalScore) {
                    homeScore = finalScore.homeScore || 0;
                    awayScore = finalScore.awayScore || 0;
                    console.log(`   - Fallback to final score: ${homeScore} - ${awayScore}`);
                } else {
                    return { status: 'cancelled', reason: 'First half score unavailable', debugInfo: { missing: 'firstHalfScore' } };
                }
            }
            
            console.log(`   - First half score: ${homeScore} - ${awayScore}`);
            console.log(`   - Handicap line: ${handicapLine}`);
            
            // Apply handicap to home team
            const adjustedHomeScore = homeScore + handicapLine;
            const adjustedAwayScore = awayScore;
            
            console.log(`   - Adjusted score: ${adjustedHomeScore} - ${adjustedAwayScore}`);
            
            let won = false;
            let actualOutcome = '';
            
            if (adjustedHomeScore > adjustedAwayScore) {
                // Home team wins with handicap
                actualOutcome = '1';
                won = sel === '1';
                console.log(`   - Home team wins with handicap (${adjustedHomeScore} > ${adjustedAwayScore})`);
            } else if (adjustedAwayScore > adjustedHomeScore) {
                // Away team wins with handicap
                actualOutcome = '2';
                won = sel === '2';
                console.log(`   - Away team wins with handicap (${adjustedAwayScore} > ${adjustedHomeScore})`);
            } else {
                // Draw with handicap
                actualOutcome = 'X';
                won = sel === 'x';
                console.log(`   - Draw with handicap (${adjustedHomeScore} = ${adjustedAwayScore})`);
            }
            
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                actualOutcome,
                firstHalfScore: `${homeScore}-${awayScore}`,
                adjustedScore: `${adjustedHomeScore}-${adjustedAwayScore}`,
                handicapLine,
                matchId: matchDetails.general?.matchId,
                reason: `3-Way Handicap 1st Half: ${homeScore}-${awayScore} + ${handicapLine} = ${adjustedHomeScore}-${adjustedAwayScore} → ${actualOutcome} (${status})`
            };

        } else if (marketCode === MarketCodes.ASIAN_TOTAL_1ST_HALF) {
            // Asian Total - 1st Half (Over/Under) - e.g., "Asian Total - 1st Half"
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 2250 to 2.25
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 2250000 to 2.25
            }
            
            console.log(`🎯 ASIAN TOTAL 1ST HALF MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            
            const firstHalfScore = getHalftimeScore(matchDetails);
            console.log(`   - First half score from getHalftimeScore:`, firstHalfScore);
            
            let homeScore, awayScore;
            
            if (firstHalfScore && (firstHalfScore.home !== undefined || firstHalfScore.homeScore !== undefined)) {
                homeScore = firstHalfScore.home || firstHalfScore.homeScore || 0;
                awayScore = firstHalfScore.away || firstHalfScore.awayScore || 0;
                console.log(`   - Using first half score: ${homeScore} - ${awayScore}`);
            } else {
                // Fallback: Use final score as first half score (for testing purposes)
                const finalScore = getFinalScore(matchDetails);
                if (finalScore) {
                    homeScore = finalScore.homeScore || 0;
                    awayScore = finalScore.awayScore || 0;
                    console.log(`   - Fallback to final score: ${homeScore} - ${awayScore}`);
                } else {
                    return { status: 'cancelled', reason: 'First half score unavailable', debugInfo: { missing: 'firstHalfScore' } };
                }
            }
            
            const totalGoals = homeScore + awayScore;
            console.log(`   - First half total goals: ${totalGoals}`);
            console.log(`   - Line: ${line}`);
            
            // Asian Total logic: Handle quarter lines (e.g., 2.25, 2.75) with proper split
            console.log(`   🔢 ASIAN TOTAL 1ST HALF CALCULATION:`);
            
            // Check if line is quarter line (ends in .25 or .75)
            const isQuarterLine = (line % 0.25 === 0) && (line % 0.5 !== 0);
            
            let status;
            let actualOutcome = '';
            let wonParts = 0, voidParts = 0, lostParts = 0;
            
            if (isQuarterLine) {
                // Quarter line: Split into two parts (e.g., 2.75 → 2.5 and 3.0)
                const lowerLine = Math.floor(line * 2) / 2; // 2.75 → 2.5
                const upperLine = Math.ceil(line * 2) / 2;  // 2.75 → 3.0
                
                console.log(`   - Quarter line detected: ${line}`);
                console.log(`   - Split into: ${lowerLine} and ${upperLine}`);
                
                const lines = [lowerLine, upperLine];
                
                for (let i = 0; i < lines.length; i++) {
                    const splitLine = lines[i];
                    console.log(`      --- Part ${i + 1}/2: Line ${splitLine} ---`);
                    
                    if (totalGoals > splitLine) {
                        if (sel.includes('over')) {
                            wonParts++;
                            console.log(`         → WON (${totalGoals} > ${splitLine}, bet on Over)`);
                        } else {
                            lostParts++;
                            console.log(`         → LOST (${totalGoals} > ${splitLine}, bet on Under)`);
                        }
                    } else if (totalGoals < splitLine) {
                        if (sel.includes('under')) {
                            wonParts++;
                            console.log(`         → WON (${totalGoals} < ${splitLine}, bet on Under)`);
                        } else {
                            lostParts++;
                            console.log(`         → LOST (${totalGoals} < ${splitLine}, bet on Over)`);
                        }
                    } else {
                        // Exactly on the line - VOID
                        voidParts++;
                        console.log(`         → VOID (${totalGoals} === ${splitLine})`);
                    }
                }
                
                // Determine final status based on parts
                if (wonParts === 2) {
                    status = 'won';
                    actualOutcome = sel.includes('over') ? 'over' : 'under';
                    console.log(`   📊 FINAL: WON (both parts won)`);
                } else if (lostParts === 2) {
                    status = 'lost';
                    actualOutcome = sel.includes('over') ? 'under' : 'over';
                    console.log(`   📊 FINAL: LOST (both parts lost)`);
                } else if (voidParts === 2) {
                    status = 'void';
                    actualOutcome = 'push';
                    console.log(`   📊 FINAL: VOID (both parts void)`);
                } else if (wonParts === 1 && voidParts === 1) {
                    status = 'won'; // Half Win
                    actualOutcome = sel.includes('over') ? 'over' : 'under';
                    console.log(`   📊 FINAL: HALF WIN (1 part won, 1 part void)`);
                } else if (lostParts === 1 && voidParts === 1) {
                    status = 'lost'; // Half Loss
                    actualOutcome = sel.includes('over') ? 'under' : 'over';
                    console.log(`   📊 FINAL: HALF LOSS (1 part lost, 1 part void)`);
                } else {
                    // Should not happen, but handle edge case
                    status = wonParts > lostParts ? 'won' : 'lost';
                    actualOutcome = sel.includes('over') ? 'over' : 'under';
                    console.log(`   📊 FINAL: ${status.toUpperCase()} (mixed: ${wonParts}W/${lostParts}L/${voidParts}V)`);
                }
            } else {
                // Whole number line (e.g., 2.0, 3.0) - No split needed
                console.log(`   - Whole number line: ${line}`);
                
                if (totalGoals > line) {
                    actualOutcome = 'over';
                    status = sel.includes('over') ? 'won' : 'lost';
                    console.log(`   → ${status.toUpperCase()} (${totalGoals} > ${line}, bet on ${sel})`);
                } else if (totalGoals < line) {
                    actualOutcome = 'under';
                    status = sel.includes('under') ? 'won' : 'lost';
                    console.log(`   → ${status.toUpperCase()} (${totalGoals} < ${line}, bet on ${sel})`);
                } else {
                    // Exactly on the line - VOID
                    actualOutcome = 'push';
                    status = 'void';
                    console.log(`   → VOID (${totalGoals} === ${line})`);
                }
            }
            
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Status: ${status}`);
            
            return {
                status,
                actualOutcome,
                firstHalfScore: `${homeScore}-${awayScore}`,
                totalGoals,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Asian Total 1st Half: ${homeScore}-${awayScore} = ${totalGoals} vs ${line} → ${actualOutcome} (${status})`
            };

        } else if (marketCode === MarketCodes.ASIAN_TOTAL) {
            // Asian Total (Over/Under) - e.g., "Asian Total"
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            
            // Get line from multiple sources with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 2500 to 2.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 2500000 to 2.5
            }
            
            console.log(`🎯 ASIAN TOTAL MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            
            const finalScore = getFinalScore(matchDetails);
            if (!finalScore) {
                return { status: 'cancelled', reason: 'Final score unavailable', debugInfo: { missing: 'finalScore' } };
            }
            
            const homeScore = finalScore.homeScore || 0;
            const awayScore = finalScore.awayScore || 0;
            const totalGoals = homeScore + awayScore;
            
            console.log(`   - Final score: ${homeScore} - ${awayScore}`);
            console.log(`   - Total goals: ${totalGoals}`);
            console.log(`   - Line: ${line}`);
            
            // Asian Total logic: Handle quarter lines (e.g., 2.25, 2.75) with proper split
            console.log(`   🔢 ASIAN TOTAL CALCULATION:`);
            
            // Check if line is quarter line (ends in .25 or .75)
            const isQuarterLine = (line % 0.25 === 0) && (line % 0.5 !== 0);
            
            let status;
            let actualOutcome = '';
            let wonParts = 0, voidParts = 0, lostParts = 0;
            
            if (isQuarterLine) {
                // Quarter line: Split into two parts (e.g., 2.75 → 2.5 and 3.0)
                const lowerLine = Math.floor(line * 2) / 2; // 2.75 → 2.5
                const upperLine = Math.ceil(line * 2) / 2;  // 2.75 → 3.0
                
                console.log(`   - Quarter line detected: ${line}`);
                console.log(`   - Split into: ${lowerLine} and ${upperLine}`);
                
                const lines = [lowerLine, upperLine];
                
                for (let i = 0; i < lines.length; i++) {
                    const splitLine = lines[i];
                    console.log(`      --- Part ${i + 1}/2: Line ${splitLine} ---`);
                    
                    if (totalGoals > splitLine) {
                        if (sel.includes('over')) {
                            wonParts++;
                            console.log(`         → WON (${totalGoals} > ${splitLine}, bet on Over)`);
                        } else {
                            lostParts++;
                            console.log(`         → LOST (${totalGoals} > ${splitLine}, bet on Under)`);
                        }
                    } else if (totalGoals < splitLine) {
                        if (sel.includes('under')) {
                            wonParts++;
                            console.log(`         → WON (${totalGoals} < ${splitLine}, bet on Under)`);
                        } else {
                            lostParts++;
                            console.log(`         → LOST (${totalGoals} < ${splitLine}, bet on Over)`);
                        }
                    } else {
                        // Exactly on the line - VOID
                        voidParts++;
                        console.log(`         → VOID (${totalGoals} === ${splitLine})`);
                    }
                }
                
                // Determine final status based on parts
                if (wonParts === 2) {
                    status = 'won';
                    actualOutcome = sel.includes('over') ? 'over' : 'under';
                    console.log(`   📊 FINAL: WON (both parts won)`);
                } else if (lostParts === 2) {
                    status = 'lost';
                    actualOutcome = sel.includes('over') ? 'under' : 'over';
                    console.log(`   📊 FINAL: LOST (both parts lost)`);
                } else if (voidParts === 2) {
                    status = 'void';
                    actualOutcome = 'push';
                    console.log(`   📊 FINAL: VOID (both parts void)`);
                } else if (wonParts === 1 && voidParts === 1) {
                    status = 'won'; // Half Win
                    actualOutcome = sel.includes('over') ? 'over' : 'under';
                    console.log(`   📊 FINAL: HALF WIN (1 part won, 1 part void)`);
                } else if (lostParts === 1 && voidParts === 1) {
                    status = 'lost'; // Half Loss
                    actualOutcome = sel.includes('over') ? 'under' : 'over';
                    console.log(`   📊 FINAL: HALF LOSS (1 part lost, 1 part void)`);
                } else {
                    // Should not happen, but handle edge case
                    status = wonParts > lostParts ? 'won' : 'lost';
                    actualOutcome = sel.includes('over') ? 'over' : 'under';
                    console.log(`   📊 FINAL: ${status.toUpperCase()} (mixed: ${wonParts}W/${lostParts}L/${voidParts}V)`);
                }
            } else {
                // Whole number line (e.g., 2.0, 3.0) - No split needed
                console.log(`   - Whole number line: ${line}`);
                
                if (totalGoals > line) {
                    actualOutcome = 'over';
                    status = sel.includes('over') ? 'won' : 'lost';
                    console.log(`   → ${status.toUpperCase()} (${totalGoals} > ${line}, bet on ${sel})`);
                } else if (totalGoals < line) {
                    actualOutcome = 'under';
                    status = sel.includes('under') ? 'won' : 'lost';
                    console.log(`   → ${status.toUpperCase()} (${totalGoals} < ${line}, bet on ${sel})`);
                } else {
                    // Exactly on the line - VOID
                    actualOutcome = 'push';
                    status = 'void';
                    console.log(`   → VOID (${totalGoals} === ${line})`);
                }
            }
            
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Status: ${status}`);
            
            return {
                status,
                actualOutcome,
                finalScore: `${homeScore}-${awayScore}`,
                totalGoals,
                line,
                matchId: matchDetails.general?.matchId,
                reason: `Asian Total: ${homeScore}-${awayScore} = ${totalGoals} vs ${line} → ${actualOutcome} (${status})`
            };

        } else if (marketCode === MarketCodes.FIRST_GOAL) {
            // First Goal (Draw: No Goals) - e.g., "First Goal (Draw: No Goals)"
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            console.log(`🎯 FIRST GOAL MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            
            // Check if this is a "Draw: No Goals" market
            const isDrawNoGoalsMarket = marketName.includes('draw') && 
                                       (marketName.includes('no goals') || marketName.includes('no goal'));
            
            // ✅ Get team names from matchDetails (not bet, as bet teams might be swapped)
            const { homeName: matchHomeName, awayName: matchAwayName } = getTeamNames(matchDetails);
            
            // Get final score to check for draw
            const { homeScore, awayScore } = getFinalScore(matchDetails);
            const isDraw = homeScore === awayScore;
            
            console.log(`   - Final Score: ${homeScore}-${awayScore}`);
            console.log(`   - Is Draw: ${isDraw}`);
            console.log(`   - Is "Draw: No Goals" Market: ${isDrawNoGoalsMarket}`);
            
            // ✅ FIX: For "First Goal (Draw: No Goals)" market, if match ends in draw (any score: 0-0, 1-1, 2-2, etc.), ALL bets are VOID
            if (isDrawNoGoalsMarket && isDraw) {
                console.log(`   - Match ended in draw (${homeScore}-${awayScore})`);
                console.log(`   - Market is "Draw: No Goals" → ALL bets VOID (refunded)`);
                console.log(`   - Selection: ${sel}`);
                
                return {
                    status: 'void',
                    actualOutcome: 'X',
                    firstGoal: `Draw (${homeScore}-${awayScore})`,
                    matchId: matchDetails.general?.matchId,
                    reason: `First Goal (Draw: No Goals): Match ended in draw ${homeScore}-${awayScore} → All bets VOID (refunded)`
                };
            }
            
            // Get all goal events from the match
            const goalEvents = getGoalEvents(matchDetails);
            console.log(`   - Total goal events found: ${goalEvents.length}`);
            
            if (goalEvents.length === 0) {
                // No goals scored - Draw (No Goals)
                // For regular First Goal market (without "Draw: No Goals"), only "Draw" selection wins
                const actualOutcome = 'X';
                const won = sel === 'x' || sel === 'draw';
                const status = won ? 'won' : 'lost';
                
                console.log(`   - No goals scored → Draw (X)`);
                console.log(`   - Selection: ${sel}`);
                console.log(`   - Won: ${won}`);
                
                return {
                    status,
                    actualOutcome,
                    firstGoal: 'No goals',
                    matchId: matchDetails.general?.matchId,
                    reason: `First Goal: No goals scored → Draw (${status})`
                };
            }
            
            // Find the first goal (earliest by minute)
            const firstGoal = goalEvents.reduce((earliest, goal) => {
                const currentMinute = getAbsoluteMinuteFromEvent(goal);
                const earliestMinute = getAbsoluteMinuteFromEvent(earliest);
                
                if (currentMinute === null) return earliest;
                if (earliestMinute === null) return goal;
                
                return currentMinute < earliestMinute ? goal : earliest;
            });
            
            const firstGoalMinute = getAbsoluteMinuteFromEvent(firstGoal);
            const firstGoalTeam = firstGoal.isHome ? 'home' : 'away';
            // ✅ FIX: Use team names from matchDetails (already declared above), not bet (bet teams might be swapped)
            const firstGoalTeamName = firstGoal.isHome ? matchHomeName : matchAwayName;
            
            console.log(`   - First goal: ${firstGoalTeamName} at minute ${firstGoalMinute}`);
            console.log(`   - First goal team (isHome): ${firstGoal.isHome} (${firstGoalTeam})`);
            console.log(`   - Match teams: ${matchHomeName} (home) vs ${matchAwayName} (away)`);
            
            let actualOutcome = '';
            let won = false;
            
            if (firstGoalTeam === 'home') {
                // Home team scored first
                actualOutcome = '1';
                // ✅ FIX: Check against matchDetails team names, not bet team names (bet teams might be swapped)
                const homeTeamLower = String(matchHomeName || '').toLowerCase();
                const betHomeLower = String(bet.homeName || '').toLowerCase();
                // Check both matchDetails name and bet name (in case bet has different name format)
                won = sel === '1' || sel === 'home' || 
                      this.namesMatch(sel, matchHomeName) ||
                      this.namesMatch(sel, bet.homeName);
                console.log(`   - Home team scored first → 1`);
                console.log(`   - Checking home team match: sel="${sel}", matchHomeTeam="${matchHomeName}", betHomeTeam="${bet.homeName}"`);
            } else {
                // Away team scored first
                actualOutcome = '2';
                // ✅ FIX: Check against matchDetails team names, not bet team names (bet teams might be swapped)
                const awayTeamLower = String(matchAwayName || '').toLowerCase();
                const betAwayLower = String(bet.awayName || '').toLowerCase();
                // Check both matchDetails name and bet name (in case bet has different name format) using similarity
                won = sel === '2' || sel === 'away' || 
                      this.namesMatch(sel, matchAwayName) ||
                      this.namesMatch(sel, bet.awayName);
                console.log(`   - Away team scored first → 2`);
                console.log(`   - Checking away team match: sel="${sel}", matchAwayTeam="${matchAwayName}", betAwayTeam="${bet.awayName}"`);
            }
            
            const status = won ? 'won' : 'lost';
            
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status,
                actualOutcome,
                firstGoal: `${firstGoalTeamName} (minute ${firstGoalMinute})`,
                firstGoalMinute,
                firstGoalTeam,
                matchId: matchDetails.general?.matchId,
                reason: `First Goal: ${firstGoalTeamName} at minute ${firstGoalMinute} → ${actualOutcome} (${status})`
            };

        /* TIME-WINDOW: CORNER_OCCURRENCE_TIME_WINDOW commented out
        } else if (marketCode === MarketCodes.CORNER_OCCURRENCE_TIME_WINDOW) {
            // Corner occurrence in specific time window (e.g., 45:00-49:59 - 2nd Half)
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            console.log(`🎯 CORNER OCCURRENCE TIME WINDOW MARKET: "${selection}"`);
            console.log(`   - Market name: "${marketName}"`);
            
            // Extract time window from market name (e.g., "45:00-49:59")
            const timeMatch = marketName.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
            if (!timeMatch) {
                return {
                    status: 'cancelled',
                    reason: 'Unable to extract time window from market name',
                    debugInfo: { marketName }
                };
            }
            
            const startMinute = parseInt(timeMatch[1], 10);
            const startSecond = parseInt(timeMatch[2], 10);
            const endMinute = parseInt(timeMatch[3], 10);
            const endSecond = parseInt(timeMatch[4], 10);
            
            // Adjust for half (2nd half starts at 45 minutes)
            let adjustedStartMinute = startMinute;
            let adjustedEndMinute = endMinute;
            
            if (marketName.includes('2nd half')) {
                adjustedStartMinute = startMinute + 45; // 2nd half starts at 45 minutes
                adjustedEndMinute = endMinute + 45;
            } else if (marketName.includes('1st half')) {
                // 1st half is 0-45 minutes, so no adjustment needed
                adjustedStartMinute = startMinute;
                adjustedEndMinute = endMinute;
            }
            
            console.log(`   - Time window: ${startMinute}:${startSecond.toString().padStart(2, '0')} - ${endMinute}:${endSecond.toString().padStart(2, '0')}`);
            console.log(`   - Adjusted for half: ${adjustedStartMinute}:${startSecond.toString().padStart(2, '0')} - ${adjustedEndMinute}:${endSecond.toString().padStart(2, '0')}`);
            
            // Check if any corner occurred in the time window
            const events = matchDetails?.header?.events?.events || [];
            let cornerOccurred = false;
            let cornerCount = 0;
            
            for (const event of events) {
                if (event.type === 'Corner' && event.minute !== undefined) {
                    const eventMinute = event.minute;
                    const eventSecond = event.second || 0;
                    
                    // Check if event is within time window
                    const eventTime = eventMinute * 60 + eventSecond;
                    const startTime = adjustedStartMinute * 60 + startSecond;
                    const endTime = adjustedEndMinute * 60 + endSecond;
                    
                    if (eventTime >= startTime && eventTime <= endTime) {
                        cornerOccurred = true;
                        cornerCount++;
                    }
                }
            }
            
            console.log(`   - Corner occurred: ${cornerOccurred}`);
            console.log(`   - Corner count: ${cornerCount}`);
            
            // Determine result based on selection
            let won = false;
            if (selection === 'yes' && cornerOccurred) {
                won = true;
            } else if (selection === 'no' && !cornerOccurred) {
                won = true;
            }
            
            console.log(`   - Bet selection: ${selection}`);
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: cornerOccurred ? 'Yes' : 'No',
                finalScore: cornerOccurred ? 'Yes' : 'No',
                timeWindow: `${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}`,
                cornerCount: cornerCount,
                matchId: matchDetails.general?.matchId,
                reason: `Corner ${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}: ${cornerOccurred ? 'Yes' : 'No'} (${cornerCount} corners) → ${won ? 'WON' : 'LOST'}`,
                payout: won ? (bet.stake * bet.odds) : 0,
                stake: bet.stake,
                odds: bet.odds,
                debugInfo: {
                    timeWindow: `${startMinute}:${startSecond}-${endMinute}:${endSecond}`,
                    adjustedTimeWindow: `${adjustedStartMinute}:${startSecond}-${adjustedEndMinute}:${endSecond}`,
                    cornerOccurred,
                    cornerCount,
                    betSelection: selection
                }
            };
        } */
        /* TIME-WINDOW: FIRST_CORNER_TIME_WINDOW commented out
        } else if (marketCode === MarketCodes.FIRST_CORNER_TIME_WINDOW) {
            // First corner in specific time window (e.g., 45:00-49:59 - 2nd Half)
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '');
            const marketName = String(bet.marketName || '').toLowerCase();
            
            console.log(`🎯 FIRST CORNER TIME WINDOW MARKET: "${selection}"`);
            console.log(`   - Market name: "${marketName}"`);
            
            // Extract time window from market name (e.g., "45:00-49:59")
            const timeMatch = marketName.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
            if (!timeMatch) {
                return {
                    status: 'cancelled',
                    reason: 'Unable to extract time window from market name',
                    debugInfo: { marketName }
                };
            }
            
            const startMinute = parseInt(timeMatch[1], 10);
            const startSecond = parseInt(timeMatch[2], 10);
            const endMinute = parseInt(timeMatch[3], 10);
            const endSecond = parseInt(timeMatch[4], 10);
            
            // Adjust for half (2nd half starts at 45 minutes)
            let adjustedStartMinute = startMinute;
            let adjustedEndMinute = endMinute;
            
            if (marketName.includes('2nd half')) {
                adjustedStartMinute = startMinute + 45; // 2nd half starts at 45 minutes
                adjustedEndMinute = endMinute + 45;
            } else if (marketName.includes('1st half')) {
                // 1st half is 0-45 minutes, so no adjustment needed
                adjustedStartMinute = startMinute;
                adjustedEndMinute = endMinute;
            }
            
            console.log(`   - Time window: ${startMinute}:${startSecond.toString().padStart(2, '0')} - ${endMinute}:${endSecond.toString().padStart(2, '0')}`);
            console.log(`   - Adjusted for half: ${adjustedStartMinute}:${startSecond.toString().padStart(2, '0')} - ${adjustedEndMinute}:${endSecond.toString().padStart(2, '0')}`);
            
            // Find the first corner in the time window (FotMob: use both events sources + time/timeStr)
            const headerEvents = matchDetails?.header?.events?.events || [];
            const matchFactsEvents = matchDetails?.content?.matchFacts?.events?.events || [];
            const events = [...headerEvents, ...matchFactsEvents];
            let firstCornerInWindow = null;
            let firstCornerTime = null;

            for (const event of events) {
                if (event.type !== 'Corner') continue;
                const eventMinute = getEventMatchMinute(event);
                if (eventMinute == null) continue;

                const eventSecond = getEventMatchSecond(event);
                const eventTime = eventMinute * 60 + eventSecond;
                const startTime = adjustedStartMinute * 60 + startSecond;
                const endTime = adjustedEndMinute * 60 + endSecond;

                if (eventTime >= startTime && eventTime <= endTime) {
                    if (!firstCornerInWindow || eventTime < firstCornerTime) {
                        firstCornerInWindow = event;
                        firstCornerTime = eventTime;
                    }
                }
            }

            console.log(`   - First corner in window: ${firstCornerInWindow ? 'Found' : 'None'}`);
            if (firstCornerInWindow) {
                const m = getEventMatchMinute(firstCornerInWindow);
                const s = getEventMatchSecond(firstCornerInWindow);
                console.log(`   - First corner team: ${firstCornerInWindow.isHome ? 'Home' : 'Away'}`);
                console.log(`   - First corner time: ${m}:${String(s).padStart(2, '0')}`);
            }
            
            // Determine actual outcome
            let actualOutcome;
            if (!firstCornerInWindow) {
                actualOutcome = 'X'; // No corner = Draw
            } else if (firstCornerInWindow.isHome) {
                actualOutcome = '1'; // Home team
            } else {
                actualOutcome = '2'; // Away team
            }
            
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Bet selection: ${selection}`);
            
            const won = actualOutcome === selection;
            
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actualOutcome,
                finalScore: actualOutcome,
                timeWindow: `${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}`,
                firstCornerTeam: firstCornerInWindow ? (firstCornerInWindow.isHome ? 'Home' : 'Away') : 'None',
                firstCornerTime: firstCornerInWindow ? `${firstCornerInWindow.minute}:${(firstCornerInWindow.second || 0).toString().padStart(2, '0')}` : 'N/A',
                matchId: matchDetails.general?.matchId,
                reason: `First Corner ${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}: ${actualOutcome} → ${won ? 'WON' : 'LOST'}`,
                payout: won ? (bet.stake * bet.odds) : 0,
                stake: bet.stake,
                odds: bet.odds,
                debugInfo: {
                    timeWindow: `${startMinute}:${startSecond}-${endMinute}:${endSecond}`,
                    adjustedTimeWindow: `${adjustedStartMinute}:${startSecond}-${adjustedEndMinute}:${endSecond}`,
                    firstCornerFound: !!firstCornerInWindow,
                    firstCornerTeam: firstCornerInWindow ? (firstCornerInWindow.isHome ? 'Home' : 'Away') : 'None',
                    actualOutcome,
                    betSelection: selection
                }
            };
        } */
        /* TIME-WINDOW: CORNERS_TOTAL_OU_TIME_WINDOW commented out
        } else if (marketCode === MarketCodes.CORNERS_TOTAL_OU_TIME_WINDOW) {
            // Total Corners Over/Under in specific time window (e.g., 50:00-59:59)
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            const line = parseFloat(bet.betDetails?.total || bet.hints?.line || 0);
            
            console.log(`🎯 CORNERS TOTAL OU TIME WINDOW MARKET: "${selection}"`);
            console.log(`   - Market name: "${marketName}"`);
            console.log(`   - Line: ${line}`);
            
            // Extract time window from market name (e.g., "50:00-59:59")
            const timeMatch = marketName.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
            if (!timeMatch) {
                return {
                    status: 'cancelled',
                    reason: 'Unable to extract time window from market name',
                    debugInfo: { marketName }
                };
            }
            
            const startMinute = parseInt(timeMatch[1], 10);
            const startSecond = parseInt(timeMatch[2], 10);
            const endMinute = parseInt(timeMatch[3], 10);
            const endSecond = parseInt(timeMatch[4], 10);
            
            console.log(`   - Time window: ${startMinute}:${startSecond.toString().padStart(2, '0')} - ${endMinute}:${endSecond.toString().padStart(2, '0')}`);
            
            // Get total corners in the specific time window
            const homeCorners = getCornersInTimeWindow(matchDetails, 'home', startMinute, startSecond, endMinute, endSecond);
            const awayCorners = getCornersInTimeWindow(matchDetails, 'away', startMinute, startSecond, endMinute, endSecond);
            const totalCorners = homeCorners + awayCorners;
            
            console.log(`   - Home corners in window: ${homeCorners}, Away corners in window: ${awayCorners}`);
            console.log(`   - Total corners in window: ${totalCorners}`);
            
            // Determine if over or under
            const isOver = totalCorners > line;
            const isUnder = totalCorners < line;
            const isExact = totalCorners === line;
            
            console.log(`   - Total: ${totalCorners}, Line: ${line}`);
            console.log(`   - Over: ${isOver}, Under: ${isUnder}, Exact: ${isExact}`);
            
            // Check if bet selection matches result
            let won = false;
            if (selection.includes('over') && isOver) {
                won = true;
            } else if (selection.includes('under') && isUnder) {
                won = true;
            } else if (isExact) {
                // If exact match, typically both over and under lose (push)
                won = false;
            }
            
            console.log(`   - Bet selection: ${selection}`);
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: `${totalCorners}`,
                finalScore: `${totalCorners}`,
                timeWindow: `${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}`,
                line: line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Corners ${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}: ${totalCorners} vs ${line} → ${won ? 'WON' : 'LOST'}`,
                payout: won ? (bet.stake * bet.odds) : 0,
                stake: bet.stake,
                odds: bet.odds,
                debugInfo: {
                    timeWindow: `${startMinute}:${startSecond}-${endMinute}:${endSecond}`,
                    homeCorners,
                    awayCorners,
                    totalCorners,
                    line,
                    isOver,
                    isUnder,
                    isExact,
                    betSelection: selection
                }
            };
        } */
        /* TIME-WINDOW: CORNERS_MOST_TIME_WINDOW commented out
        } else if (marketCode === MarketCodes.CORNERS_MOST_TIME_WINDOW) {
            // Most Corners in specific time window (e.g., 50:00-59:59)
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            console.log(`🎯 CORNERS MOST TIME WINDOW MARKET: "${selection}"`);
            console.log(`   - Market name: "${marketName}"`);
            
            // Extract time window from market name (e.g., "50:00-59:59")
            const timeMatch = marketName.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
            if (!timeMatch) {
                return {
                    status: 'cancelled',
                    reason: 'Unable to extract time window from market name',
                    debugInfo: { marketName }
                };
            }
            
            const startMinute = parseInt(timeMatch[1], 10);
            const startSecond = parseInt(timeMatch[2], 10);
            const endMinute = parseInt(timeMatch[3], 10);
            const endSecond = parseInt(timeMatch[4], 10);
            
            console.log(`   - Time window: ${startMinute}:${startSecond.toString().padStart(2, '0')} - ${endMinute}:${endSecond.toString().padStart(2, '0')}`);
            
            // Get corners in the specific time window
            const homeCorners = getCornersInTimeWindow(matchDetails, 'home', startMinute, startSecond, endMinute, endSecond);
            const awayCorners = getCornersInTimeWindow(matchDetails, 'away', startMinute, startSecond, endMinute, endSecond);
            
            console.log(`   - Home corners in window: ${homeCorners}, Away corners in window: ${awayCorners}`);
            
            // Determine result
            let actualOutcome;
            if (homeCorners > awayCorners) {
                actualOutcome = '1'; // Home wins
            } else if (homeCorners < awayCorners) {
                actualOutcome = '2'; // Away wins
            } else {
                actualOutcome = 'x'; // Draw
            }
            
            console.log(`   - Actual outcome: ${actualOutcome}`);
            console.log(`   - Bet selection: ${selection}`);
            
            const won = actualOutcome === selection;
            
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actualOutcome,
                finalScore: `${homeCorners}-${awayCorners}`,
                timeWindow: `${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}`,
                matchId: matchDetails.general?.matchId,
                reason: `Most Corners ${startMinute}:${startSecond.toString().padStart(2, '0')}-${endMinute}:${endSecond.toString().padStart(2, '0')}: ${actualOutcome} (${homeCorners}-${awayCorners}) → ${won ? 'WON' : 'LOST'}`,
                payout: won ? (bet.stake * bet.odds) : 0,
                stake: bet.stake,
                odds: bet.odds,
                debugInfo: {
                    timeWindow: `${startMinute}:${startSecond}-${endMinute}:${endSecond}`,
                    homeCorners,
                    awayCorners,
                    actualOutcome,
                    betSelection: selection
                }
            };
        } */
        } else if (marketCode === MarketCodes.CORNERS_MOST) {
            // Most Corners: compare team corner counts
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            // Get home and away team names for logging
            const homeTeamName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home Team';
            const awayTeamName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away Team';
            
            console.log(`🎯 MOST CORNERS MARKET:`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Home Team: ${homeTeamName}`);
            console.log(`   - Away Team: ${awayTeamName}`);
            console.log(`   - Bet Selection: ${sel}`);
            
            // Check if this is a 1st half or 2nd half market
            const isFirstHalf = marketName.includes('1st half') || marketName.includes('first half');
            const isSecondHalf = marketName.includes('2nd half') || marketName.includes('second half');
            const period = isFirstHalf ? '1st Half' : (isSecondHalf ? '2nd Half' : 'Full Match');
            
            console.log(`   - Period: ${period}`);
            console.log(`   - Is 1st Half: ${isFirstHalf}`);
            console.log(`   - Is 2nd Half: ${isSecondHalf}`);
            
            let corners;
            if (isFirstHalf) {
                // Get 1st half corners from stats/events
                console.log(`   - Fetching 1st Half corners...`);
                corners = getFirstHalfCorners(matchDetails);
                console.log(`   ✅ 1st Half Corners Result:`);
                console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
            } else if (isSecondHalf) {
                // Get 2nd half corners from stats/events
                console.log(`   - Fetching 2nd Half corners...`);
                corners = getSecondHalfCorners(matchDetails);
                console.log(`   ✅ 2nd Half Corners Result:`);
                console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
            } else {
                // Get full match corners from stats
                console.log(`   - Fetching Full Match corners from stats...`);
                corners = getCornersFromStats(matchDetails);
                if (corners) {
                    console.log(`   ✅ Full Match Corners Result:`);
                    console.log(`      - ${homeTeamName} (Home): ${corners.home} corners`);
                    console.log(`      - ${awayTeamName} (Away): ${corners.away} corners`);
                }
            }
            
            if (!corners || (corners.home === undefined && corners.away === undefined)) {
                console.log(`   ❌ Corners statistics unavailable`);
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners', period } };
            }
            const home = Number(corners.home || 0);
            const away = Number(corners.away || 0);
            const actual = home > away ? '1' : (home < away ? '2' : 'x');
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || (actual === '2' && (sel === '2' || sel.includes('away'))) || (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            
            console.log(`   📊 Outcome Calculation:`);
            console.log(`      - Period: ${period}`);
            console.log(`      - ${homeTeamName} (Home): ${home} corners`);
            console.log(`      - ${awayTeamName} (Away): ${away} corners`);
            console.log(`      - Actual Outcome: ${actual} (${home > away ? homeTeamName + ' wins' : home < away ? awayTeamName + ' wins' : 'Draw'})`);
            console.log(`      - Bet Selection: ${sel}`);
            console.log(`      - Result: ${won ? 'WON ✅' : 'LOST ❌'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                cornerTotals: { home, away },
                period: period,
                matchId: matchDetails.general?.matchId,
                reason: `Most Corners ${period}: ${actual} (${homeTeamName}=${home}, ${awayTeamName}=${away}) (bet ${sel})`
            };

        } else if (marketCode === MarketCodes.CORNERS_HANDICAP_3WAY) {
            // Corners 3-Way Handicap/Line
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            
            // Get line with proper conversion (same logic as THREE_WAY_LINE)
            let line = 0;
            if (bet.unibetMeta?.handicapLine !== undefined) {
                line = Number(bet.unibetMeta.handicapLine);
            } else if (bet.hints?.line !== undefined) {
                line = Number(bet.hints.line);
            } else if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine; // handicapLine is already in correct format (e.g., -5)
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
            
            console.log(`🎯 CORNERS 3-WAY LINE MARKET: "${sel}"`);
            console.log(`   - Handicap: ${line} (type: ${typeof line})`);
            
            const corners = getCornersFromStats(matchDetails);
            if (!corners) {
                return { status: 'cancelled', reason: 'Corners statistics unavailable', debugInfo: { missing: 'corners' } };
            }
            
            console.log(`   📊 ORIGINAL CORNERS:`);
            console.log(`      - Home: ${corners.home} (type: ${typeof corners.home})`);
            console.log(`      - Away: ${corners.away} (type: ${typeof corners.away})`);
            
            const homeAdj = Number(corners.home || 0) + Number(line || 0);
            const awayAdj = Number(corners.away || 0);
            
            console.log(`   🔢 CALCULATION STEP BY STEP:`);
            console.log(`      - Step 1: Home corners = ${corners.home}`);
            console.log(`      - Step 2: Handicap = ${line}`);
            console.log(`      - Step 3: Adjusted Home = ${corners.home} + (${line}) = ${homeAdj}`);
            console.log(`      - Step 4: Adjusted Away = ${corners.away} (unchanged)`);
            console.log(`   ✅ FINAL ADJUSTED CORNERS:`);
            console.log(`      - Home: ${homeAdj}`);
            console.log(`      - Away: ${awayAdj}`);
            
            console.log(`   🎯 COMPARISON LOGIC:`);
            console.log(`      - Is ${homeAdj} > ${awayAdj}? ${homeAdj > awayAdj}`);
            console.log(`      - Is ${homeAdj} < ${awayAdj}? ${homeAdj < awayAdj}`);
            console.log(`      - Is ${homeAdj} === ${awayAdj}? ${homeAdj === awayAdj}`);
            
            let actual;
            if (homeAdj > awayAdj) {
                actual = '1';
                console.log(`      → Result: HOME WINS (1) because ${homeAdj} > ${awayAdj}`);
            } else if (homeAdj < awayAdj) {
                actual = '2';
                console.log(`      → Result: AWAY WINS (2) because ${homeAdj} < ${awayAdj}`);
            } else {
                actual = 'x';
                console.log(`      → Result: DRAW (X) because ${homeAdj} === ${awayAdj}`);
            }
            
            const won = (actual === '1' && (sel === '1' || sel.includes('home'))) || 
                       (actual === '2' && (sel === '2' || sel.includes('away'))) || 
                       (actual === 'x' && (sel === 'x' || sel.includes('draw')));
            
            console.log(`   📋 FINAL RESULT:`);
            console.log(`      - Actual outcome: ${actual}`);
            console.log(`      - Bet selection: ${sel}`);
            console.log(`      - Match? ${actual} === ${sel}? ${won}`);
            console.log(`      - Bet status: ${won ? '✅ WON' : '❌ LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actual,
                adjusted: { home: homeAdj, away: awayAdj, line: Number(line || 0) },
                rawTotals: { home: Number(corners.home || 0), away: Number(corners.away || 0) },
                matchId: matchDetails.general?.matchId,
                reason: `Corners 3-Way (line ${Number(line || 0)}): ${actual} (${homeAdj}-${awayAdj}) → ${won ? 'WON' : 'LOST'}`,
                debugInfo: {
                    homeCorners: corners.home,
                    awayCorners: corners.away,
                    handicap: line,
                    adjustedHome: homeAdj,
                    adjustedAway: awayAdj,
                    actualOutcome: actual,
                    betSelection: sel
                }
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
            
            console.log(`🔍 PLAYER TO SCORE MARKET - Player Resolution:`);
            console.log(`   - Participant Name: "${participantName}"`);
            console.log(`   - Bet Participant ID: ${bet.participantId}`);
            
            // ALWAYS try to find player by name first (more reliable than bet.participantId)
            // This ensures we get the correct Fotmob player ID
            let playerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                playerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }
            
            // Fallback to bet.participantId only if name lookup failed
            if (!playerId && bet.participantId) {
                console.log(`   - Name lookup failed, using bet's participant ID: ${bet.participantId}`);
                playerId = bet.participantId;
            }
            
            if (!playerId) {
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        debugInfo: { participantName, geminiNoMatch: true }
                    };
                }
                console.log(`   ❌ Unable to resolve player ID`);
                return { status: 'cancelled', reason: 'Unable to resolve player for To Score market', debugInfo: { participantName } };
            }
            
            console.log(`   - Final Player ID: ${playerId}`);
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
            const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
            const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                         ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
            
            if (unavailablePlayers.length > 0) {
                const unavailablePlayer = unavailablePlayers.find(p => 
                    Number(p?.id || p?.playerId) === Number(playerId)
                );
                
                if (unavailablePlayer) {
                    const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                    const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                    const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                    
                    console.log(`   ⚠️ Player is unavailable:`);
                    console.log(`   - Player: ${playerName}`);
                    console.log(`   - Type: ${unavailabilityType}`);
                    console.log(`   - Expected Return: ${reason}`);
                    console.log(`   - Bet will be marked as LOST (player did not play)`);
                    
                    return {
                        status: 'lost',
                        actualOutcome: `Player unavailable (${unavailabilityType})`,
                        debugInfo: { 
                            playerId: Number(playerId), 
                            participantName, 
                            unavailabilityType,
                            expectedReturn: reason,
                            source: 'unavailable_check'
                        },
                        reason: `Player To Score${isAtLeast2 ? ' (2+)' : ''}: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`
                    };
                }
            }
            
            // Get goals for this player - use getGoalEvents and filter by playerId from goals
            // This is more reliable than getPlayerEvents which might have ID mismatch issues
            const allGoals = getGoalEvents(matchDetails);
            console.log(`   - Total goals in match: ${allGoals.length}`);
            
            // Filter goals by playerId - check multiple possible locations
            const playerGoals = allGoals.filter(goal => {
                const goalPlayerId = goal?.playerId || goal?.player?.id || goal?.shotmapEvent?.playerId;
                const matches = Number(goalPlayerId) === Number(playerId);
                if (matches) {
                    console.log(`   ✅ Goal found: minute ${goal.time || goal.timeStr}, playerId: ${goalPlayerId}`);
                }
                return matches;
            });
            
            const goalsCount = playerGoals.length;
            console.log(`   - Goals for player ${playerId}: ${goalsCount}`);
            
            const threshold = isAtLeast2 ? 2 : 1;
            const didHit = goalsCount >= threshold;
            const won = yesSelected ? didHit : !didHit;
            
            console.log(`   - Threshold: ${threshold}`);
            console.log(`   - Did hit: ${didHit}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status: won ? 'won' : 'lost',
                debugInfo: { playerId: Number(playerId), participantName, goalsCount, threshold, yesSelected },
                reason: `Player To Score${isAtLeast2 ? ' (2+)' : ''}: goals=${goalsCount}, need>=${threshold} → ${won ? 'YES' : 'NO'}`
            };

        } else if (marketCode === MarketCodes.PLAYER_SOT_OU) {
            // Player Shots on Target Over/Under (betOfferType 127 Player Occurrence Line)
            console.log(`🎯 PLAYER SHOTS ON TARGET MARKET:`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Selection: "${bet.outcomeLabel}"`);
            console.log(`   - Line: "${bet.betDetails?.total}"`);
            
            // Check all possible sources for player name
            console.log(`   - bet.participant: "${bet.participant}"`);
            console.log(`   - bet.playerName: "${bet.playerName}"`);
            console.log(`   - bet.betDetails?.name: "${bet.betDetails?.name}"`);
            console.log(`   - bet.unibetMeta?.participant: "${bet.unibetMeta?.participant}"`);
            console.log(`   - bet._originalBet?.unibetMeta?.participant: "${bet._originalBet?.unibetMeta?.participant}"`);
            console.log(`   - bet.criterionLabel: "${bet.criterionLabel}"`);
            console.log(`   - bet.criterionEnglishLabel: "${bet.criterionEnglishLabel}"`);
            
            // ✅ FIX: For combination bets, unibetMeta is stored in _originalBet.unibetMeta
            // Check both bet.unibetMeta and bet._originalBet.unibetMeta
            const unibetMetaParticipant = bet.unibetMeta?.participant || bet._originalBet?.unibetMeta?.participant;
            
            // ✅ FIX: Helper function to check if a string looks like a player name (not a line like "Over 0.5")
            const looksLikePlayerName = (name) => {
                if (!name || typeof name !== 'string') return false;
                const normalized = name.toLowerCase().trim();
                // Exclude common outcome labels that are not player names
                const nonPlayerPatterns = [
                    /^over\s*\d+\.?\d*$/i,
                    /^under\s*\d+\.?\d*$/i,
                    /^yes$/i,
                    /^no$/i,
                    /^\d+\.?\d*$/,
                    /^over\/under/i
                ];
                return !nonPlayerPatterns.some(pattern => pattern.test(normalized));
            };
            
            // ✅ FIX: Prioritize unibetMeta.participant first, and validate that it's a real player name
            // Check all possible sources for player name, prioritizing unibetMeta.participant
            let participantName = null;
            
            // Priority 1: unibetMeta.participant (most reliable source from Unibet API)
            // Check both bet.unibetMeta and bet._originalBet.unibetMeta for combination bets
            if (unibetMetaParticipant && looksLikePlayerName(unibetMetaParticipant)) {
                participantName = unibetMetaParticipant;
                console.log(`   - ✅ Using player name from unibetMeta.participant: "${participantName}"`);
            }
            // Priority 2: bet.participant (but only if it looks like a player name)
            else if (bet.participant && looksLikePlayerName(bet.participant)) {
                participantName = bet.participant;
                console.log(`   - ✅ Using player name from bet.participant: "${participantName}"`);
            }
            // Priority 3: bet.playerName
            else if (bet.playerName && looksLikePlayerName(bet.playerName)) {
                participantName = bet.playerName;
                console.log(`   - ✅ Using player name from bet.playerName: "${participantName}"`);
            }
            // Priority 4: bet.betDetails?.name (but only if it looks like a player name)
            else if (bet.betDetails?.name && looksLikePlayerName(bet.betDetails.name)) {
                participantName = bet.betDetails.name;
                console.log(`   - ✅ Using player name from bet.betDetails.name: "${participantName}"`);
            }
            // Priority 5: Fallback to unibetMeta.participant even if validation fails (might still be valid)
            else if (unibetMetaParticipant) {
                participantName = unibetMetaParticipant;
                console.log(`   - ⚠️ Using player name from unibetMeta.participant (fallback, validation skipped): "${participantName}"`);
            }
            
            // ✅ FIX: Check _originalBet.unibetMeta for combination bets
            let playerId = bet.participantId || bet.unibetMeta?.participantId || bet._originalBet?.unibetMeta?.participantId || bet.eventParticipantId || bet.unibetMeta?.eventParticipantId || bet._originalBet?.unibetMeta?.eventParticipantId || null;
            
            console.log(`   - Final Participant Name: "${participantName}"`);
            console.log(`   - Final Player ID (from bet): ${playerId}`);
            
            // ✅ ENHANCED: Multi-step player resolution with Gemini fallback
            let foundPlayerId = null;
            let geminiNoMatch = false; // ✅ FIX: Initialize geminiNoMatch variable
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName); // ✅ FIX: Capture full result object
                foundPlayerId = result?.playerId || null; // ✅ FIX: Extract playerId from result
                geminiNoMatch = result?.geminiNoMatch || false; // ✅ FIX: Extract geminiNoMatch flag
                console.log(`   - Found Player ID by name: ${foundPlayerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
                
                if (foundPlayerId) {
                    playerId = foundPlayerId;
                    console.log(`   - ✅ Using player ID from name lookup: ${playerId}`);
                } else if (playerId) {
                    console.log(`   - Could not find player by name, using bet's player ID: ${playerId}`);
                } else {
                    // ✅ NEW: Try Gemini AI to find player by name
                    console.log(`   - Attempting Gemini AI lookup for player: "${participantName}"`);
                    try {
                        const { findPlayerWithGemini } = await import('./utils/gemini-player-matcher.js');
                        const geminiPlayerId = await findPlayerWithGemini(matchDetails, participantName);
                        if (geminiPlayerId) {
                            playerId = geminiPlayerId;
                            foundPlayerId = geminiPlayerId;
                            console.log(`   - ✅ Found player ID via Gemini: ${playerId}`);
                        } else {
                            console.log(`   - ❌ Gemini could not find player`);
                        }
                    } catch (error) {
                        console.error(`   - ❌ Gemini lookup failed: ${error.message}`);
                    }
                }
            }
            
            // Verify the player ID exists in match data
            if (playerId) {
                const playerStatsMap = matchDetails.playerStats || matchDetails.content?.playerStats || null;
                const playerKey = String(playerId);
                const playerExists = playerStatsMap && playerStatsMap[playerKey];
                console.log(`   - Player ID ${playerId} exists in match data: ${!!playerExists}`);
                if (playerExists) {
                    console.log(`   - Player name in match data: "${playerStatsMap[playerKey]?.name || 'N/A'}"`);
                } else {
                    console.log(`   ⚠️ WARNING: Player ID ${playerId} not found in match data`);
                    
                    // ✅ NEW: Check if player scored goals - if yes, bet should be won for "Over 0.5"
                    if (participantName) {
                        const allGoals = getGoalEvents(matchDetails);
                        const playerGoals = allGoals.filter(goal => {
                            const goalPlayerId = goal?.playerId || goal?.player?.id || goal?.shotmapEvent?.playerId;
                            return goalPlayerId && Number(goalPlayerId) === Number(playerId);
                        });
                        
                        if (playerGoals.length > 0) {
                            console.log(`   - ✅ Player scored ${playerGoals.length} goal(s) - this indicates shots on target > 0`);
                            // Get line value early for goal check
                            let line = null;
                            if (bet.betDetails?.total) {
                                line = parseFloat(bet.betDetails.total);
                            } else if (typeof bet.handicapLine === 'number') {
                                line = bet.handicapLine / 1000;
                            } else if (typeof bet.line === 'number') {
                                line = normalizeLine(bet.line);
                            } else if (typeof bet.handicapRaw === 'number') {
                                line = bet.handicapRaw / 1000000;
                            }
                            
                            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
                            if (sel.includes('over') && line !== null && line <= 0.5) {
                                console.log(`   - ✅ Bet should be WON: Player scored goals = shots on target > ${line}`);
                                return {
                                    status: 'won',
                                    actualOutcome: `Player scored ${playerGoals.length} goal(s)`,
                                    debugInfo: { playerId: Number(playerId), participantName, playerGoals: playerGoals.length, source: 'goal_check' },
                                    reason: `Player Shots on Target Over ${line}: Player scored ${playerGoals.length} goal(s) → shots on target > ${line} → WON`
                                };
                            }
                        }
                    }
                    
                    // Try to find by name again as fallback
                    if (participantName && !foundPlayerId) {
                        console.log(`   - Retrying name lookup with different normalization...`);
                        foundPlayerId = await findPlayerIdByName(matchDetails, participantName);
                        if (foundPlayerId) {
                            playerId = foundPlayerId;
                            console.log(`   - Found alternative player ID: ${playerId}`);
                        }
                    }
                }
            }
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            // ✅ CORRECT LOCATION: content.lineup.awayTeam.unavailable and content.lineup.homeTeam.unavailable
            if (playerId) {
                const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
                const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
                const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                             ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
                
                if (unavailablePlayers.length > 0) {
                    const unavailablePlayer = unavailablePlayers.find(p => 
                        Number(p?.id || p?.playerId) === Number(playerId)
                    );
                    
                    if (unavailablePlayer) {
                        const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                        const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                        const playerName = unavailablePlayer?.name || unavailablePlayer?.fullName || participantName || 'Unknown';
                        
                        console.log(`   ⚠️ Player "${playerName}" (ID: ${playerId}) is UNAVAILABLE`);
                        console.log(`   - Unavailability Type: ${unavailabilityType}`);
                        console.log(`   - Expected Return: ${reason}`);
                        console.log(`   - Bet will be marked as LOST (player did not play)`);
                        
                        // Get line for proper reason message
                        let line = null;
                        if (bet.betDetails?.total) {
                            line = parseFloat(bet.betDetails.total);
                        } else if (typeof bet.handicapLine === 'number') {
                            line = bet.handicapLine / 1000;
                        } else if (typeof bet.line === 'number') {
                            line = normalizeLine(bet.line);
                        } else if (typeof bet.handicapRaw === 'number') {
                            line = bet.handicapRaw / 1000000;
                        }
                        
                        const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
                        const lineStr = line !== null ? ` ${line}` : '';
                        
                        return {
                            status: 'lost',
                            actualOutcome: `Player unavailable (${unavailabilityType})`,
                            debugInfo: { 
                                playerId: Number(playerId), 
                                participantName, 
                                unavailabilityType,
                                expectedReturn: reason,
                                source: 'unavailable_check'
                            },
                            reason: `Player Shots on Target${lineStr}: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`
                        };
                    }
                }
            }
            
            // Final fallback: If still no player ID, try to get stats directly from shotmap by name
            if (!playerId && participantName) {
                console.log(`   - Final fallback: Searching shotmap by player name "${participantName}"...`);
                const globalShotmap = Array.isArray(matchDetails?.shotmap)
                    ? matchDetails.shotmap
                    : (Array.isArray(matchDetails?.header?.events?.shotmap)
                        ? matchDetails.header.events.shotmap
                        : null);
                
                if (Array.isArray(globalShotmap)) {
                    const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const targetName = normalize(participantName);
                    
                    const playerShots = globalShotmap.filter(ev => {
                        const shotPlayerName = normalize(ev?.playerName || '');
                        return shotPlayerName === targetName || shotPlayerName.includes(targetName) || targetName.includes(shotPlayerName);
                    });
                    
                    if (playerShots.length > 0) {
                        const shotsOnTarget = playerShots.filter(ev => ev?.isOnTarget === true).length;
                        console.log(`   - Found ${playerShots.length} shots by name, ${shotsOnTarget} on target`);
                        
                        if (Number.isFinite(shotsOnTarget)) {
                            const won = sel.includes('over') ? (shotsOnTarget > Number(line)) : (sel.includes('under') ? (shotsOnTarget < Number(line)) : false);
                            console.log(`   - Comparison: ${shotsOnTarget} ${sel.includes('over') ? '>' : '<'} ${Number(line)} = ${won ? 'WON' : 'LOST'}`);
                            
                            return {
                                status: won ? 'won' : 'lost',
                                actualOutcome: `${shotsOnTarget} shots on target`,
                                debugInfo: { participantName, shotsOnTarget, line: Number(line), source: 'shotmap_by_name' },
                                reason: `Player Shots on Target ${sel} ${Number(line)}: value=${shotsOnTarget} → ${won ? 'WON' : 'LOST'} (found by name in shotmap)`
                            };
                        }
                    }
                }
            }
            
            if (!playerId) {
                console.log(`❌ Could not resolve player ID or find player in shotmap`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to resolve player for Shots on Target market', 
                    debugInfo: { participantName, betPlayerId: bet.participantId } 
                };
            }
            
            // Get line with proper conversion
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.line === 'number') {
                line = normalizeLine(bet.line);
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
            
            console.log(`   - Calculated Line: ${line}`);
            
            if (line === null || line === undefined || Number.isNaN(Number(line))) {
                console.log(`❌ Invalid line value`);
                return { 
                    status: 'cancelled', 
                    reason: 'Shots on Target requires a valid line', 
                    debugInfo: { missing: 'handicapLine', betDetails: bet.betDetails } 
                };
            }
            
            const sel = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            console.log(`   - Selection (normalized): "${sel}"`);
            console.log(`   - Fetching player stats for Player ID: ${playerId}`);
            
            // IMPORTANT: Use getPlayerStats, NOT getPlayerEvents (which is for cards)
            const stats = getPlayerStats(matchDetails, Number(playerId));
            console.log(`   - Player Stats:`, stats);
            
            const value = Number(stats?.shotsOnTarget ?? NaN);
            console.log(`   - Shots on Target Value: ${value}`);
            
            if (!Number.isFinite(value)) {
                console.log(`❌ Shots on target value is not a valid number`);
                console.log(`   - Stats object:`, JSON.stringify(stats, null, 2));
                
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        debugInfo: { playerId, participantName, stats, geminiNoMatch: true }
                    };
                }
                
                return { 
                    status: 'cancelled', 
                    reason: 'Player shots on target stats unavailable', 
                    debugInfo: { playerId, participantName, stats } 
                };
            }
            
            const won = sel.includes('over') ? (value > Number(line)) : (sel.includes('under') ? (value < Number(line)) : false);
            console.log(`   - Comparison: ${value} ${sel.includes('over') ? '>' : '<'} ${Number(line)} = ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: `${value} shots on target`,
                debugInfo: { playerId: Number(playerId), participantName, value, line: Number(line), stats },
                reason: `Player Shots on Target ${sel} ${Number(line)}: value=${value} → ${won ? 'WON' : 'LOST'}`
            };

        } else if (marketCode === MarketCodes.PLAYER_SHOTS_OU) {
            // Player Total Shots Over/Under (betOfferType 127 Player Occurrence Line)
            console.log(`🎯 PLAYER SHOTS MARKET:`);
            console.log(`   - Market: "${bet.marketName}"`);
            console.log(`   - Selection: "${bet.outcomeLabel}"`);
            console.log(`   - Line: "${bet.betDetails?.total}"`);
            
            // ✅ FIX: For combination bets, unibetMeta is stored in _originalBet.unibetMeta
            // Check both bet.unibetMeta and bet._originalBet.unibetMeta
            const unibetMetaParticipant = bet.unibetMeta?.participant || bet._originalBet?.unibetMeta?.participant;
            
            // ✅ FIX: Helper function to check if a string looks like a player name (not a line like "Over 0.5")
            const looksLikePlayerName = (name) => {
                if (!name || typeof name !== 'string') return false;
                const normalized = name.toLowerCase().trim();
                // Exclude common outcome labels that are not player names
                const nonPlayerPatterns = [
                    /^over\s*\d+\.?\d*$/i,
                    /^under\s*\d+\.?\d*$/i,
                    /^yes$/i,
                    /^no$/i,
                    /^\d+\.?\d*$/,
                    /^over\/under/i
                ];
                return !nonPlayerPatterns.some(pattern => pattern.test(normalized));
            };
            
            // ✅ FIX: Prioritize unibetMeta.participant first, and validate that it's a real player name
            // Check all possible sources for player name, prioritizing unibetMeta.participant
            let participantName = null;
            
            // Priority 1: unibetMeta.participant (most reliable source from Unibet API)
            // Check both bet.unibetMeta and bet._originalBet.unibetMeta for combination bets
            if (unibetMetaParticipant && looksLikePlayerName(unibetMetaParticipant)) {
                participantName = unibetMetaParticipant;
                console.log(`   - ✅ Using player name from unibetMeta.participant: "${participantName}"`);
            }
            // Priority 2: bet.participant (but only if it looks like a player name)
            else if (bet.participant && looksLikePlayerName(bet.participant)) {
                participantName = bet.participant;
                console.log(`   - ✅ Using player name from bet.participant: "${participantName}"`);
            }
            // Priority 3: bet.playerName
            else if (bet.playerName && looksLikePlayerName(bet.playerName)) {
                participantName = bet.playerName;
                console.log(`   - ✅ Using player name from bet.playerName: "${participantName}"`);
            }
            // Priority 4: bet.betDetails?.name (but only if it looks like a player name)
            else if (bet.betDetails?.name && looksLikePlayerName(bet.betDetails.name)) {
                participantName = bet.betDetails.name;
                console.log(`   - ✅ Using player name from bet.betDetails.name: "${participantName}"`);
            }
            // Priority 5: Fallback to unibetMeta.participant even if validation fails (might still be valid)
            else if (unibetMetaParticipant) {
                participantName = unibetMetaParticipant;
                console.log(`   - ⚠️ Using player name from unibetMeta.participant (fallback, validation skipped): "${participantName}"`);
            }
            
            // ✅ FIX: Check _originalBet.unibetMeta for combination bets
            let playerId = bet.participantId || bet.unibetMeta?.participantId || bet._originalBet?.unibetMeta?.participantId || bet.eventParticipantId || bet.unibetMeta?.eventParticipantId || bet._originalBet?.unibetMeta?.eventParticipantId || null;
            
            console.log(`   - Final Participant Name: "${participantName}"`);
            console.log(`   - Final Player ID (from bet): ${playerId}`);
            
            // ALWAYS try to find player by name first, even if we have a playerId
            let foundPlayerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                foundPlayerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${foundPlayerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
                
                if (foundPlayerId) {
                    playerId = foundPlayerId;
                    console.log(`   - Using player ID from name lookup: ${playerId}`);
                } else if (playerId) {
                    console.log(`   - Could not find player by name, using bet's player ID: ${playerId}`);
                }
            }
            
            if (!playerId) {
                return {
                    status: 'cancelled',
                    reason: 'Unable to resolve player for Player Shots market',
                    debugInfo: { participantName }
                };
            }
            
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const line = parseFloat(bet.betDetails?.total) || (typeof bet.line === 'number' ? (bet.line / 1000) : null);
            
            if (line === null || Number.isNaN(line)) {
                return {
                    status: 'cancelled',
                    reason: 'Player Shots requires a valid line',
                    debugInfo: { missing: 'line' }
                };
            }
            
            // Get player total shots from playerStats
            const playerStatsMap = matchDetails?.content?.playerStats || matchDetails?.playerStats || {};
            const playerKey = String(playerId);
            const player = playerStatsMap[playerKey];
            
            let value = null;
            
            if (player && Array.isArray(player.stats)) {
                // Look for "Total shots" or "Shots" in player stats
                for (const statGroup of player.stats) {
                    if (statGroup.stats && typeof statGroup.stats === 'object') {
                        for (const [label, obj] of Object.entries(statGroup.stats)) {
                            const key = String(obj?.key || '').toLowerCase();
                            const labelKey = String(label || '').toLowerCase();
                            const val = obj?.stat?.value;
                            
                            // Check for total shots
                            if (key === 'total_shots' || 
                                key === 'shots' ||
                                labelKey.includes('total shots') ||
                                (labelKey.includes('shots') && !labelKey.includes('on target') && !labelKey.includes('off target'))) {
                                if (typeof val === 'number') {
                                    value = Number(val);
                                    console.log(`   ✅ Found total shots in stats: ${value} (from label: "${label}", key: "${obj?.key}")`);
                                    break;
                                }
                            }
                        }
                        if (value !== null) break;
                    }
                }
            }
            
            // Fallback: Calculate from shotmap if stats not available
            if (value === null) {
                console.log(`   - Total shots not found in playerStats, trying shotmap...`);
                const globalShotmap = Array.isArray(matchDetails?.shotmap)
                    ? matchDetails.shotmap
                    : (Array.isArray(matchDetails?.header?.events?.shotmap)
                        ? matchDetails.header.events.shotmap
                        : []);
                
                if (Array.isArray(globalShotmap) && globalShotmap.length > 0) {
                    const playerShots = globalShotmap.filter(ev => {
                        const shotPlayerId = ev?.playerId || ev?.shotmapEvent?.playerId;
                        return shotPlayerId && Number(shotPlayerId) === Number(playerId);
                    });
                    
                    if (playerShots.length > 0) {
                        value = playerShots.length;
                        console.log(`   - Found ${value} shots from shotmap for player ID ${playerId}`);
                    }
                }
            }
            
            if (value === null) {
                // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
                // If player is unavailable, bet should be LOST (not cancelled)
                if (playerId) {
                    const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
                    const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
                    const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                                 ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
                    
                    if (unavailablePlayers.length > 0) {
                        const unavailablePlayer = unavailablePlayers.find(p => 
                            Number(p?.id || p?.playerId) === Number(playerId)
                        );
                        
                        if (unavailablePlayer) {
                            const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                            const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                            const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                            
                            console.log(`   ⚠️ Player is unavailable:`);
                            console.log(`   - Player: ${playerName}`);
                            console.log(`   - Type: ${unavailabilityType}`);
                            console.log(`   - Expected Return: ${reason}`);
                            console.log(`   - Bet will be marked as LOST (player did not play)`);
                            
                            const lineStr = line !== null ? ` ${line}` : '';
                            
                            return {
                                status: 'lost',
                                actualOutcome: `Player unavailable (${unavailabilityType})`,
                                debugInfo: { 
                                    playerId: Number(playerId), 
                                    participantName, 
                                    unavailabilityType,
                                    expectedReturn: reason,
                                    source: 'unavailable_check'
                                },
                                reason: `Player Shots${lineStr}: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`
                            };
                        }
                    }
                }
                
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        debugInfo: { missing: 'shots', playerId: Number(playerId), participantName, geminiNoMatch: true }
                    };
                }
                
                return {
                    status: 'cancelled',
                    reason: 'Player shots statistics unavailable',
                    debugInfo: { missing: 'shots', playerId: Number(playerId), participantName }
                };
            }
            
            const won = sel.includes('over') ? (value > line) : (sel.includes('under') ? (value < line) : false);
            console.log(`   - Player total shots: ${value}`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Selection: ${sel}`);
            console.log(`   - Comparison: ${value} ${sel.includes('over') ? '>' : '<'} ${line} = ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: `${value} shots`,
                debugInfo: { playerId: Number(playerId), participantName, value, line: Number(line) },
                reason: `Player Shots ${sel} ${Number(line)}: value=${value} → ${won ? 'WON' : 'LOST'}`
            };

        } else if (marketCode === MarketCodes.PLAYER_CARD_ANY || marketCode === MarketCodes.PLAYER_CARD_RED) {
            // Player To Get a Card (any card) Yes/No; explicit Red Card supported
            const isRedOnly = String(bet.marketName || '').toLowerCase().includes('red');
            const participantName = bet.participant || bet.playerName || null;
            
            console.log(`🔍 DEBUG: Checking Yes/No selection:`);
            console.log(`   - bet.outcomeEnglishLabel: "${bet.outcomeEnglishLabel}"`);
            console.log(`   - bet.outcomeLabel: "${bet.outcomeLabel}"`);
            console.log(`   - bet.participant: "${bet.participant}"`);
            
            // For player-specific card markets:
            // - If the outcome is a player name (not "Yes"/"No"), it's implicitly a "Yes" bet (player WILL get a card)
            // - Only if outcome explicitly says "No", it's a "No" bet
            const outcomeLabel = String(bet.outcomeEnglishLabel || bet.outcomeLabel || '').toLowerCase();
            const isNoSelection = outcomeLabel.includes('no');
            const isYesSelection = outcomeLabel.includes('yes');
            
            // If outcome is a player name (not Yes/No), treat as "Yes" bet
            const yesSelected = isYesSelection || (!isNoSelection && participantName);
            console.log(`   - Outcome label: "${outcomeLabel}"`);
            console.log(`   - Is Yes: ${isYesSelection}, Is No: ${isNoSelection}, Has participant: ${!!participantName}`);
            console.log(`   - Final yesSelected: ${yesSelected}`);
            
            // ✅ FIX: Use findPlayerIdByName with Gemini fallback and capture geminiNoMatch
            let playerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                playerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }
            
            // Fallback to bet.participantId only if name lookup failed
            if (!playerId && bet.participantId) {
                console.log(`   - Name lookup failed, using bet's participant ID: ${bet.participantId}`);
                playerId = bet.participantId;
            }
            
            if (!playerId) {
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        debugInfo: { participantName, geminiNoMatch: true }
                    };
                }
                return { status: 'cancelled', reason: 'Unable to resolve player for card market', debugInfo: { participantName } };
            }
            
            console.log(`🎯 PLAYER CARD MARKET: "${participantName}"`);
            console.log(`   - Player ID: ${playerId}`);
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
            const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
            const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                         ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
            
            if (unavailablePlayers.length > 0) {
                const unavailablePlayer = unavailablePlayers.find(p => 
                    Number(p?.id || p?.playerId) === Number(playerId)
                );
                
                if (unavailablePlayer) {
                    const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                    const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                    const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                    
                    console.log(`   ⚠️ Player is unavailable:`);
                    console.log(`   - Player: ${playerName}`);
                    console.log(`   - Type: ${unavailabilityType}`);
                    console.log(`   - Expected Return: ${reason}`);
                    console.log(`   - Bet will be marked as LOST (player did not play)`);
                    
                    return {
                        status: 'lost',
                        actualOutcome: `Player unavailable (${unavailabilityType})`,
                        debugInfo: { 
                            playerId: Number(playerId), 
                            participantName, 
                            unavailabilityType,
                            expectedReturn: reason,
                            source: 'unavailable_check'
                        },
                        reason: `Player ${isRedOnly ? 'Red Card' : 'Card'}: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`
                    };
                }
            }
            console.log(`   - Is Red Only: ${isRedOnly}`);
            console.log(`   - Yes Selected: ${yesSelected}`);
            
            // Try to get cards by player ID first
            let { cards } = getPlayerEvents(matchDetails, Number(playerId));
            console.log(`   - Cards found by ID: ${cards ? cards.length : 0}`);
            console.log(`   - Cards data by ID:`, cards);
            
            // If no cards found by ID, try to find by player name
            if (!cards || cards.length === 0) {
                console.log(`   - No cards found by ID, trying name matching...`);
                const allCards = getCardEvents(matchDetails);
                console.log(`   - All cards in match: ${allCards.length}`);
                
                // Find cards for this player by name matching
                const playerCards = allCards.filter(card => {
                    const cardPlayerName = card.player?.name || card.nameStr || card.fullName || '';
                    const normalizedCardName = cardPlayerName.toLowerCase().trim();
                    const normalizedBetName = participantName.toLowerCase().trim();
                    
                    console.log(`   - Comparing: "${normalizedCardName}" vs "${normalizedBetName}"`);
                    
                    // Try exact match first
                    if (normalizedCardName === normalizedBetName) {
                        console.log(`   - Exact name match found!`);
                        return true;
                    }
                    
                    // Try partial match
                    if (normalizedCardName.includes(normalizedBetName) || normalizedBetName.includes(normalizedCardName)) {
                        console.log(`   - Partial name match found!`);
                        return true;
                    }
                    
                    return false;
                });
                
                console.log(`   - Cards found by name: ${playerCards.length}`);
                console.log(`   - Cards data by name:`, playerCards);
                
                cards = playerCards;
            }
            
            const numCards = Array.isArray(cards) ? cards.length : 0;
            const hasRed = (cards || []).some(c => String(c?.card || '').toLowerCase().includes('red'));
            const didHit = isRedOnly ? hasRed : (numCards > 0);
            const won = yesSelected ? didHit : !didHit;
            
            console.log(`   - Num cards: ${numCards}`);
            console.log(`   - Has red: ${hasRed}`);
            console.log(`   - Did hit: ${didHit}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status: won ? 'won' : 'lost',
                debugInfo: { playerId: Number(playerId), participantName, numCards, hasRed, isRedOnly, yesSelected },
                reason: `Player ${isRedOnly ? 'Red Card' : 'Card'}: ${didHit ? 'occurred' : 'none'} → ${won ? 'WON' : 'LOST'}`
            };
            } else if (marketCode === MarketCodes.THREE_WAY_LINE) {
                // 3-Way Line: Home/Draw/Away with goal-based handicap
                const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '');
                const handicap = bet.unibetMeta?.handicapLine || bet.hints?.line || bet.betDetails?.handicap || 0;
                
                console.log(`🎯 3-WAY LINE MARKET: "${selection}"`);
                console.log(`   - Handicap: ${handicap} (type: ${typeof handicap})`);
                
                // Extract goal scores from match data
                const { homeScore, awayScore } = getFinalScore(matchDetails);
                
                console.log(`   📊 ORIGINAL SCORES:`);
                console.log(`      - Home: ${homeScore} (type: ${typeof homeScore})`);
                console.log(`      - Away: ${awayScore} (type: ${typeof awayScore})`);
                
                // Apply handicap to home team
                const adjustedHomeScore = Number(homeScore) + Number(handicap);
                const adjustedAwayScore = Number(awayScore);
                
                console.log(`   🔢 CALCULATION STEP BY STEP:`);
                console.log(`      - Step 1: Home score = ${homeScore}`);
                console.log(`      - Step 2: Handicap = ${handicap}`);
                console.log(`      - Step 3: Adjusted Home = ${homeScore} + (${handicap}) = ${adjustedHomeScore}`);
                console.log(`      - Step 4: Adjusted Away = ${awayScore} (unchanged)`);
                console.log(`   ✅ FINAL ADJUSTED SCORES:`);
                console.log(`      - Home: ${adjustedHomeScore}`);
                console.log(`      - Away: ${adjustedAwayScore}`);
                
                // Determine result
                let actualOutcome;
                console.log(`   🎯 COMPARISON LOGIC:`);
                console.log(`      - Is ${adjustedHomeScore} > ${adjustedAwayScore}? ${adjustedHomeScore > adjustedAwayScore}`);
                console.log(`      - Is ${adjustedHomeScore} < ${adjustedAwayScore}? ${adjustedHomeScore < adjustedAwayScore}`);
                console.log(`      - Is ${adjustedHomeScore} === ${adjustedAwayScore}? ${adjustedHomeScore === adjustedAwayScore}`);
                
                if (adjustedHomeScore > adjustedAwayScore) {
                    actualOutcome = '1'; // Home wins
                    console.log(`      → Result: HOME WINS (1) because ${adjustedHomeScore} > ${adjustedAwayScore}`);
                } else if (adjustedHomeScore < adjustedAwayScore) {
                    actualOutcome = '2'; // Away wins
                    console.log(`      → Result: AWAY WINS (2) because ${adjustedHomeScore} < ${adjustedAwayScore}`);
                } else {
                    actualOutcome = 'X'; // Draw
                    console.log(`      → Result: DRAW (X) because ${adjustedHomeScore} === ${adjustedAwayScore}`);
                }
                
                console.log(`   📋 FINAL RESULT:`);
                console.log(`      - Actual outcome: ${actualOutcome}`);
                console.log(`      - Bet selection: ${selection}`);
                
                const won = actualOutcome === selection;
                
                console.log(`      - Match? ${actualOutcome} === ${selection}? ${won}`);
                console.log(`      - Bet status: ${won ? '✅ WON' : '❌ LOST'}`);
                
                return {
                    status: won ? 'won' : 'lost',
                    actualOutcome: actualOutcome,
                    finalScore: `${homeScore}-${awayScore}`,
                    handicap: handicap,
                    adjustedScore: `${adjustedHomeScore}-${adjustedAwayScore}`,
                    matchId: matchDetails.general?.matchId,
                    reason: `3-Way Line (handicap ${handicap}): ${actualOutcome} (${adjustedHomeScore}-${adjustedAwayScore}) → ${won ? 'WON' : 'LOST'}`,
                    payout: won ? (bet.stake * bet.odds) : 0,
                    stake: bet.stake,
                    odds: bet.odds,
                    debugInfo: {
                        homeScore,
                        awayScore,
                        handicap,
                        adjustedHomeScore,
                        adjustedAwayScore,
                        actualOutcome,
                        betSelection: selection
                    }
                };
            } else if (marketCode === MarketCodes.CARDS_3_WAY_LINE) {
                // Cards 3-Way Line: Home/Draw/Away with handicap applied to card counts
                const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '');
                const handicap = bet.unibetMeta?.handicapLine || bet.hints?.line || bet.betDetails?.handicap || 0;
                
                console.log(`🎯 CARDS 3-WAY LINE MARKET: "${selection}"`);
                console.log(`   - Handicap: ${handicap}`);
                
                // Extract card counts from match data
                const cardsData = getTeamCards(matchDetails);
                
                // Extract numeric values from the cards data structure
                const homeCards = cardsData?.home?.total || 0;
                const awayCards = cardsData?.away?.total || 0;
                
                console.log(`   - Home cards: ${homeCards}, Away cards: ${awayCards}`);
                
                // Apply handicap to home team
                const adjustedHomeCards = Number(homeCards) + Number(handicap);
                const adjustedAwayCards = Number(awayCards);
                
                console.log(`   - After handicap: Home ${adjustedHomeCards}, Away ${adjustedAwayCards}`);
                
                // Determine result
                let actualOutcome;
                if (adjustedHomeCards > adjustedAwayCards) {
                    actualOutcome = '1'; // Home wins
                } else if (adjustedHomeCards < adjustedAwayCards) {
                    actualOutcome = '2'; // Away wins
                } else {
                    actualOutcome = 'X'; // Draw
                }
                
                console.log(`   - Actual outcome: ${actualOutcome}`);
                console.log(`   - Bet selection: ${selection}`);
                
                const won = actualOutcome === selection;
                
                console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
                
                return {
                    status: won ? 'won' : 'lost',
                    actualOutcome: actualOutcome,
                    finalScore: `${homeCards}-${awayCards}`,
                    handicap: handicap,
                    adjustedScore: `${adjustedHomeCards}-${adjustedAwayCards}`,
                    matchId: matchDetails.general?.matchId,
                    reason: `Cards 3-Way Line (handicap ${handicap}): ${actualOutcome} (${adjustedHomeCards}-${adjustedAwayCards}) → ${won ? 'WON' : 'LOST'}`,
                    payout: won ? (bet.stake * bet.odds) : 0,
                    stake: bet.stake,
                    odds: bet.odds,
                    debugInfo: {
                        homeCards,
                        awayCards,
                        handicap,
                        adjustedHomeCards,
                        adjustedAwayCards,
                        actualOutcome,
                        betSelection: selection
                    }
                };
            } else if (marketCode === MarketCodes.METHOD_OF_SCORING_NEXT_GOAL) {
            // Method of scoring next goal: Shot inside box, Header, Penalty, etc.
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const marketName = String(bet.marketName || '').toLowerCase();
            
            console.log(`🎯 METHOD OF SCORING NEXT GOAL MARKET: "${selection}"`);
            console.log(`   - Market name: "${marketName}"`);
            
            // Extract goal number from market name (e.g., "Goal 2" -> 2)
            const goalMatch = marketName.match(/goal\s+(\d+)/);
            const targetGoalNumber = goalMatch ? parseInt(goalMatch[1], 10) : 1;
            
            console.log(`   - Target goal number: ${targetGoalNumber}`);
            
            // Get all goals from the match
            const allGoals = getGoalsInWindow(matchDetails, 0, 90); // All goals in the match
            console.log(`   - Total goals in match: ${allGoals.length}`);
            
            if (allGoals.length < targetGoalNumber) {
                // Not enough goals scored - bet is void
                return {
                    status: 'void',
                    actualOutcome: 'Not enough goals',
                    finalScore: `${getFinalScore(matchDetails).homeScore}-${getFinalScore(matchDetails).awayScore}`,
                    matchId: matchDetails.general?.matchId,
                    reason: `Method of scoring next Goal ${targetGoalNumber}: Only ${allGoals.length} goals scored (need ${targetGoalNumber})`,
                    payout: bet.stake, // Refund stake for void bet
                    stake: bet.stake,
                    odds: bet.odds,
                    debugInfo: {
                        targetGoalNumber,
                        actualGoals: allGoals.length,
                        allGoals: allGoals.map(g => ({ minute: g.minute, method: g.method, team: g.team }))
                    }
                };
            }
            
            // Get the specific goal we're interested in
            const targetGoal = allGoals[targetGoalNumber - 1]; // Array is 0-indexed
            console.log(`   - Target goal: ${JSON.stringify(targetGoal)}`);
            
            if (!targetGoal) {
                return {
                    status: 'cancelled',
                    reason: `Unable to find goal number ${targetGoalNumber}`,
                    debugInfo: { targetGoalNumber, allGoals: allGoals.length }
                };
            }
            
            // Determine the method of scoring
            let actualMethod = 'unknown';
            
            // Check for own goal first
            if (targetGoal.raw?.shotmapEvent?.isOwnGoal === true) {
                actualMethod = 'own goal';
            } else if (targetGoal.raw?.shotmapEvent?.situation === 'Penalty') {
                actualMethod = 'penalty';
            } else if (targetGoal.raw?.shotmapEvent?.situation === 'FreeKick') {
                actualMethod = 'free kick';
            } else if (targetGoal.raw?.shotmapEvent?.shotType?.toLowerCase().includes('head')) {
                actualMethod = 'header';
            } else if (targetGoal.raw?.shotmapEvent?.isFromInsideBox === true) {
                actualMethod = 'shot inside the box';
            } else if (targetGoal.raw?.shotmapEvent?.isFromInsideBox === false) {
                actualMethod = 'shot outside the box';
            } else {
                // Fallback to checking method field if shotmapEvent is not available
                const goalMethod = targetGoal.method?.toLowerCase() || '';
                
                if (goalMethod.includes('penalty')) {
                    actualMethod = 'penalty';
                } else if (goalMethod.includes('free kick') || goalMethod.includes('freekick')) {
                    actualMethod = 'free kick';
                } else if (goalMethod.includes('own goal')) {
                    actualMethod = 'own goal';
                } else if (goalMethod.includes('header')) {
                    actualMethod = 'header';
                } else if (goalMethod.includes('shot')) {
                    // Determine if inside or outside box based on goal data
                    const isInsideBox = targetGoal.isInsideBox !== false; // Default to inside if not specified
                    actualMethod = isInsideBox ? 'shot inside the box' : 'shot outside the box';
                }
            }
            
            console.log(`   - Actual method: "${actualMethod}"`);
            console.log(`   - Bet selection: "${selection}"`);
            
            // Check if the method matches
            const won = actualMethod === selection;
            
            console.log(`   - Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: actualMethod,
                finalScore: `${getFinalScore(matchDetails).homeScore}-${getFinalScore(matchDetails).awayScore}`,
                goalNumber: targetGoalNumber,
                goalMinute: targetGoal.minute,
                matchId: matchDetails.general?.matchId,
                reason: `Method of scoring next Goal ${targetGoalNumber}: ${actualMethod} (bet: ${selection}) → ${won ? 'WON' : 'LOST'}`,
                payout: won ? (bet.stake * bet.odds) : 0,
                stake: bet.stake,
                odds: bet.odds,
                debugInfo: {
                    targetGoalNumber,
                    actualMethod,
                    betSelection: selection,
                    goalDetails: targetGoal
                }
            };
        } else if (marketCode === MarketCodes.HALF_TIME_FULL_TIME) {
            // Half Time/Full Time: 1/1, 1/X, 1/2, X/1, X/X, X/2, 2/1, 2/X, 2/2
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const htScores = getHalftimeScore(matchDetails);
            
            console.log(`🎯 HALF TIME/FULL TIME MARKET: HT: ${htScores.home}-${htScores.away}, FT: ${ftHome}-${ftAway}`);
            console.log(`   - Bet selection: ${bet.outcomeLabel}`);
            
            // Determine half-time result
            let htResult;
            if (htScores.home > htScores.away) {
                htResult = '1'; // Home wins half time
            } else if (htScores.home < htScores.away) {
                htResult = '2'; // Away wins half time
            } else {
                htResult = 'X'; // Half time draw
            }
            
            // Determine full-time result
            let ftResult;
            if (ftHome > ftAway) {
                ftResult = '1'; // Home wins full time
            } else if (ftHome < ftAway) {
                ftResult = '2'; // Away wins full time
            } else {
                ftResult = 'X'; // Full time draw
            }
            
            // Parse bet selection (e.g., "1/2")
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '');
            const parts = selection.split('/');
            
            if (parts.length !== 2) {
                return { 
                    status: 'cancelled', 
                    reason: 'Invalid Half Time/Full Time format - expected format like "1/2"',
                    debugInfo: { selection, marketName: bet.marketName }
                };
            }
            
            const expectedHT = parts[0].trim();
            const expectedFT = parts[1].trim();
            
            console.log(`   - Expected: HT=${expectedHT}, FT=${expectedFT}`);
            console.log(`   - Actual: HT=${htResult}, FT=${ftResult}`);
            
            // Check if both half-time and full-time results match
            const htMatch = expectedHT === htResult;
            const ftMatch = expectedFT === ftResult;
            const won = htMatch && ftMatch;
            
            console.log(`   - HT Match: ${htMatch}, FT Match: ${ftMatch}, Result: ${won ? 'WON' : 'LOST'}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: `${htResult}/${ftResult}`,
                finalScore: `${ftHome}-${ftAway}`,
                halfTimeScore: `${htScores.home}-${htScores.away}`,
                matchId: matchDetails.general?.matchId,
                reason: `Half Time/Full Time: HT: ${htResult}, FT: ${ftResult}, Expected: ${expectedHT}/${expectedFT} → ${won ? 'WON' : 'LOST'}`,
                payout: won ? (bet.stake * bet.odds) : 0,
                stake: bet.stake,
                odds: bet.odds,
                debugInfo: {
                    selection,
                    expectedHT,
                    expectedFT,
                    actualHT: htResult,
                    actualFT: ftResult,
                    htMatch,
                    ftMatch
                }
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
        } else if (marketCode === MarketCodes.MATCH_TOTAL_GOALS_OU || bet.marketName === 'Total Goals') {
            // Match Total Goals (Over/Under) - Support both market identification and direct market name
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            const totalGoals = ftHome + ftAway;
            
            console.log(`🎯 TOTAL GOALS MARKET: ${homeName} ${ftHome}-${ftAway} ${awayName} (Total: ${totalGoals})`);
            console.log(`   - Bet selection: ${bet.outcomeLabel}`);
            console.log(`   - Bet total: ${bet.betDetails?.total}`);
            console.log(`   - Market name: "${bet.marketName}"`);
            console.log(`   - Market code: "${marketCode}"`);
            
            // Get the line from bet details or handicap fields
            let line = null;
            if (bet.betDetails?.total) {
                line = parseFloat(bet.betDetails.total);
            } else if (typeof bet.handicapLine === 'number') {
                line = bet.handicapLine / 1000; // Convert handicapLine from 7500 to 7.5
            } else if (typeof bet.handicapRaw === 'number') {
                line = bet.handicapRaw / 1000000; // Convert handicapRaw from 7500000 to 7.5
            }
            
            if (line === null || isNaN(line)) {
                console.log(`   - ERROR: No valid line found in bet details`);
                return {
                    status: 'cancelled',
                    reason: 'Match Total Goals requires a valid line',
                    debugInfo: { missing: 'line', betDetails: bet.betDetails, handicapLine: bet.handicapLine, handicapRaw: bet.handicapRaw }
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
        } else if (marketCode === MarketCodes.GOAL_IN_BOTH_HALVES) {
            // Goal in Both Halves - check if selected team scored in both halves
            // Use "Total Goals by Team" markets for 1st and 2nd half instead of Fotmob halftime scores
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeName, awayName } = getTeamNames(matchDetails);
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            
            console.log(`🎯 GOAL IN BOTH HALVES MARKET: "${selection}"`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            
            // Get team goals from first half and second half using Fotmob goal events
            const getTeamGoalsInHalf = (teamName, half) => {
                // Use the existing getGoalEvents helper function
                const goalEvents = getGoalEvents(matchDetails);
                let goals = 0;
                
                for (const goal of goalEvents) {
                    // Check if this goal belongs to the specified team
                    const isHomeTeam = goal.isHome;
                    const teamMatches = isHomeTeam ? 
                        (homeName.toLowerCase() === teamName.toLowerCase()) :
                        (awayName.toLowerCase() === teamName.toLowerCase());
                    
                    if (teamMatches) {
                        const minute = getAbsoluteMinuteFromEvent(goal);
                        
                        if (half === '1st' && minute <= 45) {
                            goals++;
                        } else if (half === '2nd' && minute > 45) {
                            goals++;
                        }
                    }
                }
                
                return goals;
            };
            
            // Get goals for each team in each half
            const homeFirstHalf = getTeamGoalsInHalf(homeName, '1st');
            const homeSecondHalf = getTeamGoalsInHalf(homeName, '2nd');
            const awayFirstHalf = getTeamGoalsInHalf(awayName, '1st');
            const awaySecondHalf = getTeamGoalsInHalf(awayName, '2nd');
            
            console.log(`   - ${homeName}: 1st half=${homeFirstHalf}, 2nd half=${homeSecondHalf}`);
            console.log(`   - ${awayName}: 1st half=${awayFirstHalf}, 2nd half=${awaySecondHalf}`);
            
            let actualOutcome;
            let won = false;
            
            if (selection === 'home' || selection === 'yes') {
                // Check if home team scored in both halves
                const scoredFirstHalf = homeFirstHalf > 0;
                const scoredSecondHalf = homeSecondHalf > 0;
                won = scoredFirstHalf && scoredSecondHalf;
                actualOutcome = won ? 'Yes' : 'No';
                console.log(`   - Home team: 1st half scored=${scoredFirstHalf}, 2nd half scored=${scoredSecondHalf} → ${actualOutcome}`);
            } else if (selection === 'away') {
                // Check if away team scored in both halves
                const scoredFirstHalf = awayFirstHalf > 0;
                const scoredSecondHalf = awaySecondHalf > 0;
                won = scoredFirstHalf && scoredSecondHalf;
                actualOutcome = won ? 'Yes' : 'No';
                console.log(`   - Away team: 1st half scored=${scoredFirstHalf}, 2nd half scored=${scoredSecondHalf} → ${actualOutcome}`);
            } else {
                // For "No" selection, check if neither team scored in both halves
                const homeScoredBoth = homeFirstHalf > 0 && homeSecondHalf > 0;
                const awayScoredBoth = awayFirstHalf > 0 && awaySecondHalf > 0;
                won = !homeScoredBoth && !awayScoredBoth;
                actualOutcome = won ? 'No' : 'Yes';
                console.log(`   - No team scored in both halves: home=${homeScoredBoth}, away=${awayScoredBoth} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                firstHalfScore: `${homeFirstHalf}-${awayFirstHalf}`,
                secondHalfScore: `${homeSecondHalf}-${awaySecondHalf}`,
                matchId: matchDetails.general?.matchId,
                reason: `Goal in Both Halves: ${actualOutcome} (1st: ${homeFirstHalf}-${awayFirstHalf}, 2nd: ${homeSecondHalf}-${awaySecondHalf})`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.PLAYER_RED_CARD) {
            // To Get a Red Card - check if the selected player received a red card
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            
            console.log(`🎯 TO GET A RED CARD MARKET: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            
            // Get all card events from the match
            const cardEvents = getCardEvents(matchDetails);
            console.log(`   - Total card events found: ${cardEvents.length}`);
            
            // Filter for red cards only
            const redCardEvents = cardEvents.filter(card => {
                const cardType = card.card?.toLowerCase() || '';
                return cardType.includes('red');
            });
            
            console.log(`   - Red card events: ${redCardEvents.length}`);
            
            let actualOutcome;
            let won = false;
            
            if (selection === 'yes') {
                // Generic "Yes" bet - any player gets a red card
                won = redCardEvents.length > 0;
                actualOutcome = won ? 'Yes' : 'No';
                console.log(`   - Any player red card: ${redCardEvents.length} → ${actualOutcome}`);
            } else if (selection === 'no') {
                // Generic "No" bet - no player gets a red card
                won = redCardEvents.length === 0;
                actualOutcome = won ? 'No' : 'Yes';
                console.log(`   - No player red card: ${redCardEvents.length === 0} → ${actualOutcome}`);
            } else {
                // Specific player bet - check if that specific player got a red card
                console.log(`   - Checking specific player: "${selection}"`);
                
                // ✅ FIX: Use proper player lookup with Gemini fallback
                let participantName = bet.participant || bet.playerName || selection;
                let playerId = null;
                let geminiNoMatch = false;
                
                if (participantName) {
                    console.log(`   - Looking up player ID by name: "${participantName}"`);
                    const result = await findPlayerIdByName(matchDetails, participantName);
                    playerId = result?.playerId || null;
                    geminiNoMatch = result?.geminiNoMatch || false;
                    console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
                }
                
                // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
                // If player is unavailable, bet should be LOST (not cancelled)
                if (playerId) {
                    const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
                    const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
                    const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                                 ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
                    
                    if (unavailablePlayers.length > 0) {
                        const unavailablePlayer = unavailablePlayers.find(p => 
                            Number(p?.id || p?.playerId) === Number(playerId)
                        );
                        
                        if (unavailablePlayer) {
                            const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                            const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                            
                            console.log(`   ⚠️ Player is unavailable: ${playerName} (${unavailabilityType}) - bet will be LOST`);
                            
                            return {
                                status: 'lost',
                                actualOutcome: `Player unavailable (${unavailabilityType})`,
                                finalScore: `${ftHome}-${ftAway}`,
                                redCardsCount: redCardEvents.length,
                                matchId: matchDetails.general?.matchId,
                                reason: `Player Red Card: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`,
                                payout: 0,
                                stake: bet.stake,
                                odds: bet.odds
                            };
                        }
                    }
                }
                
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST
                if (!playerId && geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        actualOutcome: 'Player not found',
                        finalScore: `${ftHome}-${ftAway}`,
                        redCardsCount: redCardEvents.length,
                        matchId: matchDetails.general?.matchId,
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                
                // Find red cards for this specific player - use playerId if available, otherwise fallback to name matching
                let playerRedCards = [];
                if (playerId) {
                    // Use playerId for more accurate matching
                    playerRedCards = redCardEvents.filter(card => {
                        const cardPlayerId = card?.playerId || card?.player?.id;
                        return cardPlayerId && Number(cardPlayerId) === Number(playerId);
                    });
                    console.log(`   - Red cards for player ID ${playerId}: ${playerRedCards.length}`);
                } else {
                    // Fallback to name matching
                    playerRedCards = redCardEvents.filter(card => {
                    const playerName = card.player?.toLowerCase() || '';
                    const cardPlayerName = card.playerName?.toLowerCase() || '';
                    return playerName.includes(selection) || cardPlayerName.includes(selection) ||
                           selection.includes(playerName) || selection.includes(cardPlayerName);
                });
                    console.log(`   - Red cards for ${selection} (name match): ${playerRedCards.length}`);
                }
                
                // For player-specific bets, "Yes" means the player WILL get a red card
                // So if the player got a red card, the bet WINS
                won = playerRedCards.length > 0;
                actualOutcome = won ? 'Yes' : 'No';
                console.log(`   - Player ${selection} red card: ${playerRedCards.length} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                redCardsCount: redCardEvents.length,
                matchId: matchDetails.general?.matchId,
                reason: `To Get a Red Card: ${actualOutcome} (${redCardEvents.length} red cards in match)`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.TEAM_RED_CARD) {
            // Team given a Red Card (Yes/No) - using the existing logic
            const sel = String(bet.outcomeLabel || '').toLowerCase();
            const cards = getTeamCards(matchDetails);
            
            console.log(`🎯 TEAM RED CARD MARKET: "${sel}"`);
            console.log(`   - Market: "${bet.marketName}"`);
            
            // Extract team name from market name
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            if (marketNameLower.includes('given a red card')) {
                // Extract team name from "Team given a red card" format
                const parts = marketNameLower.split('given a red card');
                if (parts.length > 0) {
                    teamFromMarket = parts[0].trim();
                }
            }
            
            console.log(`   - Team from market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names using similarity
            let isHome = false;
            let isAway = false;
            
            // Check if market team matches bet home team using similarity
            if (this.namesMatch(teamFromMarket, bet.homeName)) {
                isHome = true;
                console.log(`✅ Identified as HOME team bet: ${bet.homeName}`);
            } else if (this.namesMatch(teamFromMarket, bet.awayName)) {
                isAway = true;
                console.log(`✅ Identified as AWAY team bet: ${bet.awayName}`);
            } else {
                console.log(`❌ No team match found for Team Red Cards`);
                return { 
                    status: 'cancelled', 
                    reason: 'Unable to determine team for Team Red Cards', 
                    debugInfo: { 
                        marketName: bet.marketName, 
                        teamFromMarket,
                        betHomeName: bet.homeName,
                        betAwayName: bet.awayName
                    } 
                };
            }
            
            const red = isHome ? cards.home.red : (isAway ? cards.away.red : 0);
            const any = red > 0;
            const won = (any && (sel.includes('yes') || sel.includes('ot_yes'))) || (!any && (sel.includes('no') || sel.includes('ot_no')));
            
            console.log(`   - Team red cards: ${red}`);
            console.log(`   - Any red cards: ${any}`);
            console.log(`   - Bet selection: ${sel}`);
            console.log(`   - Won: ${won}`);
            
            return {
                status: won ? 'won' : 'lost',
                actualOutcome: any ? 'Yes' : 'No',
                team: isHome ? 'home' : (isAway ? 'away' : 'unknown'),
                teamRedCards: red,
                matchId: matchDetails.general?.matchId,
                reason: `Team Red Card (${isHome ? 'home' : 'away'}): ${any ? 'Yes' : 'No'} (bet ${sel})`,
                payout: won ? bet.stake * bet.odds : 0,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.FIRST_GOAL_SCORER) {
            // First Goal Scorer - check who scored the first goal
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 FIRST GOAL SCORER MARKET: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get all goal events from the match
            const goalEvents = getGoalEvents(matchDetails);
            console.log(`   - Total goals found: ${goalEvents.length}`);
            
            let actualOutcome;
            let won = false;
            
            if (selection === 'no goal' || selection === 'no goals') {
                // Betting on "No goal" - check if any goals were scored
                won = goalEvents.length === 0;
                actualOutcome = won ? 'No goal' : 'Goal scored';
                console.log(`   - No goal bet: ${goalEvents.length === 0} → ${actualOutcome}`);
            } else {
                // Betting on a specific player to score first
                console.log(`   - Checking first goal scorer: "${selection}"`);
                
                if (goalEvents.length === 0) {
                    // No goals scored
                    won = false;
                    actualOutcome = 'No goal';
                    console.log(`   - No goals scored → LOST`);
                } else {
                    // Find the first goal (earliest minute)
                    const firstGoal = goalEvents.reduce((earliest, goal) => {
                        const currentMinute = getAbsoluteMinuteFromEvent(goal);
                        const earliestMinute = getAbsoluteMinuteFromEvent(earliest);
                        return currentMinute < earliestMinute ? goal : earliest;
                    });
                    
                    const firstGoalScorer = firstGoal.player?.name || firstGoal.nameStr || firstGoal.fullName || '';
                    const firstGoalMinute = getAbsoluteMinuteFromEvent(firstGoal);
                    const firstGoalPlayerId = firstGoal.playerId || firstGoal.player?.id || firstGoal.shotmapEvent?.playerId;
                    
                    console.log(`   - First goal: ${firstGoalScorer} at minute ${firstGoalMinute}`);
                    console.log(`   - First goal scorer player ID: ${firstGoalPlayerId}`);
                    
                    // ✅ NEW: Use findPlayerIdByName for better matching (includes Gemini fallback)
                    // Extract player name from selection (could be in bet.participant, bet.playerName, or outcomeLabel)
                    let participantName = bet.participant || bet.playerName || null;
                    if (!participantName) {
                        // If selection is not "no goal", it might be the player name
                        const outLbl = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').trim();
                        if (outLbl && !/^no\s*goal/i.test(outLbl)) {
                            participantName = outLbl;
                        }
                    }
                    
                    let matchedPlayerId = null;
                    let geminiNoMatch = false;
                    
                    if (participantName) {
                        console.log(`   - Looking up player ID by name: "${participantName}"`);
                        const result = await findPlayerIdByName(matchDetails, participantName);
                        matchedPlayerId = result?.playerId || null;
                        geminiNoMatch = result?.geminiNoMatch || false;
                        console.log(`   - Found Player ID by name: ${matchedPlayerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
                    }
                    
                    // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
                    // If player is unavailable, bet should be LOST (not cancelled)
                    if (matchedPlayerId) {
                        const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
                        const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
                        const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                                     ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
                        
                        if (unavailablePlayers.length > 0) {
                            const unavailablePlayer = unavailablePlayers.find(p => 
                                Number(p?.id || p?.playerId) === Number(matchedPlayerId)
                            );
                            
                            if (unavailablePlayer) {
                                const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                                const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                                
                                console.log(`   ⚠️ Player is unavailable: ${playerName} (${unavailabilityType}) - bet will be LOST`);
                                
                                return {
                                    status: 'lost',
                                    actualOutcome: `Player unavailable (${unavailabilityType})`,
                                    finalScore: `${ftHome}-${ftAway}`,
                                    firstGoalScorer: goalEvents.length > 0 ? (goalEvents[0]?.player?.name || 'Unknown') : 'No goal',
                                    matchId: matchDetails.general?.matchId,
                                    reason: `First Goal Scorer: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`,
                                    payout: 0,
                                    stake: bet.stake,
                                    odds: bet.odds
                                };
                            }
                        }
                    }
                    
                    // ✅ If Gemini returned NO_MATCH, mark bet as LOST
                    if (!matchedPlayerId && geminiNoMatch) {
                        console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                        return {
                            status: 'lost',
                            actualOutcome: 'Player not found',
                            finalScore: `${ftHome}-${ftAway}`,
                            firstGoalScorer: goalEvents.length > 0 ? (goalEvents[0]?.player?.name || 'Unknown') : 'No goal',
                            matchId: matchDetails.general?.matchId,
                            reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                            payout: 0,
                            stake: bet.stake,
                            odds: bet.odds
                        };
                    }
                    
                    // Check if the selected player scored the first goal
                    // Method 1: Compare player IDs (most reliable)
                    if (matchedPlayerId && firstGoalPlayerId) {
                        const idMatch = Number(matchedPlayerId) === Number(firstGoalPlayerId);
                        if (idMatch) {
                            won = true;
                            actualOutcome = firstGoalScorer;
                            console.log(`   - ✅ Player ID match: ${matchedPlayerId} === ${firstGoalPlayerId} → WON`);
                        } else {
                            won = false;
                            actualOutcome = firstGoalScorer;
                            console.log(`   - ❌ Player ID mismatch: ${matchedPlayerId} !== ${firstGoalPlayerId} → LOST`);
                        }
                    } else if (participantName) {
                        // Method 2: Fallback to string matching if IDs not available
                        const scorerMatches = firstGoalScorer.toLowerCase().includes(participantName.toLowerCase()) || 
                                           participantName.toLowerCase().includes(firstGoalScorer.toLowerCase());
                        won = scorerMatches;
                        actualOutcome = firstGoalScorer;
                        console.log(`   - First goal scorer match (string): ${scorerMatches} → ${actualOutcome}`);
                    } else {
                        // Method 3: Original string matching as last resort
                    const scorerMatches = firstGoalScorer.toLowerCase().includes(selection) || 
                                       selection.includes(firstGoalScorer.toLowerCase());
                    won = scorerMatches;
                        actualOutcome = firstGoalScorer;
                        console.log(`   - First goal scorer match (fallback string): ${scorerMatches} → ${actualOutcome}`);
                    }
                }
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                firstGoalScorer: goalEvents.length > 0 ? actualOutcome : 'No goal',
                matchId: matchDetails.general?.matchId,
                reason: `First Goal Scorer: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.GOALKEEPER_SAVES) {
            // Goalkeeper Saves Over/Under - can be:
            // 1. Home team specific goalkeeper saves
            // 2. Away team specific goalkeeper saves
            // 3. Total goalkeeper saves (both teams combined)
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const line = (Number(bet.line) || 0) / 1000; // Convert from 1500 to 1.5
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 GOALKEEPER SAVES MARKET: "${selection}"`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Determine which type of goalkeeper saves market this is
            const marketName = String(bet.marketName || '').toLowerCase();
            const homeNameLower = homeName.toLowerCase();
            const awayNameLower = awayName.toLowerCase();
            
            // Helper function to check if team name matches market name using similarity calculation
            // Uses the existing calculateSimilarity function with a threshold
            const teamMatchesMarket = (teamName, market) => {
                // Extract potential team names from market (split by common delimiters)
                // Market format is usually "Goalkeeper Saves - TeamName" or similar
                const marketParts = market.split(/[-–—]/).map(part => part.trim());
                
                // Check similarity with each part of market name
                const SIMILARITY_THRESHOLD = 0.6; // Same threshold used elsewhere in the code
                
                for (const marketPart of marketParts) {
                    // Skip common words that aren't team names
                    const skipWords = ['goalkeeper', 'saves', 'total', 'match', 'over', 'under', 'the', 'and', 'or'];
                    if (skipWords.includes(marketPart.toLowerCase())) {
                        continue;
                    }
                    
                    // Calculate similarity between team name and market part
                    const similarity = this.calculateSimilarity(teamName, marketPart);
                    
                    if (similarity >= SIMILARITY_THRESHOLD) {
                        console.log(`   - Team "${teamName}" matches market part "${marketPart}" with similarity: ${similarity.toFixed(3)}`);
                        return true;
                    }
                }
                
                // Also check if market name contains the team name (for cases like "Goalkeeper Saves - PSG")
                const teamLower = teamName.toLowerCase();
                const marketLower = market.toLowerCase();
                if (marketLower.includes(teamLower) || teamLower.includes(marketLower)) {
                    const similarity = this.calculateSimilarity(teamName, market);
                    if (similarity >= SIMILARITY_THRESHOLD) {
                        console.log(`   - Team "${teamName}" matches market name with similarity: ${similarity.toFixed(3)}`);
                        return true;
                    }
                }
                
                return false;
            };
            
            // Check if market name mentions home or away team
            const mentionsHomeTeam = teamMatchesMarket(homeName, marketName);
            const mentionsAwayTeam = teamMatchesMarket(awayName, marketName);
            
            // Check if it's a total saves market (both teams combined)
            // Indicators: "total", "match", or no specific team mentioned
            const isTotalMarket = marketName.includes('total') || 
                                  marketName.includes('match') ||
                                  (!mentionsHomeTeam && !mentionsAwayTeam);
            
            let targetTeam = null;
            let actualSaves = 0;
            let homeSaves = null;
            let awaySaves = null;
            
            console.log(`   - Market mentions home team (${homeName}): ${mentionsHomeTeam}`);
            console.log(`   - Market mentions away team (${awayName}): ${mentionsAwayTeam}`);
            
            if (isTotalMarket) {
                // Total goalkeeper saves (both teams)
                console.log(`   - Market Type: TOTAL (both teams combined)`);
                homeSaves = getGoalkeeperSaves(matchDetails, homeName);
                awaySaves = getGoalkeeperSaves(matchDetails, awayName);
                
                if (homeSaves === null || awaySaves === null) {
                    console.log(`❌ No goalkeeper saves data available for total calculation - cancelling bet`);
                    return {
                        status: 'cancelled',
                        reason: 'Goalkeeper saves data not available',
                        actualOutcome: 'Data unavailable',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                
                actualSaves = homeSaves + awaySaves;
                console.log(`   - Home team saves: ${homeSaves}`);
                console.log(`   - Away team saves: ${awaySaves}`);
                console.log(`   - Total saves: ${actualSaves}`);
                
            } else if (mentionsHomeTeam && !mentionsAwayTeam) {
                // Home team specific goalkeeper saves
                console.log(`   - Market Type: HOME TEAM SPECIFIC`);
                targetTeam = homeName;
                actualSaves = getGoalkeeperSaves(matchDetails, homeName);
                console.log(`   - Target team: ${targetTeam}`);
                console.log(`   - Actual saves: ${actualSaves}`);
                
            } else if (mentionsAwayTeam && !mentionsHomeTeam) {
                // Away team specific goalkeeper saves
                console.log(`   - Market Type: AWAY TEAM SPECIFIC`);
                targetTeam = awayName;
                actualSaves = getGoalkeeperSaves(matchDetails, awayName);
                console.log(`   - Target team: ${targetTeam}`);
                console.log(`   - Actual saves: ${actualSaves}`);
                
            } else if (mentionsHomeTeam && mentionsAwayTeam) {
                // Both teams mentioned - this is unusual, treat as total
                console.log(`   - Market Type: BOTH TEAMS MENTIONED - treating as TOTAL`);
                homeSaves = getGoalkeeperSaves(matchDetails, homeName);
                awaySaves = getGoalkeeperSaves(matchDetails, awayName);
                
                if (homeSaves === null || awaySaves === null) {
                    console.log(`❌ No goalkeeper saves data available - cancelling bet`);
                    return {
                        status: 'cancelled',
                        reason: 'Goalkeeper saves data not available',
                        actualOutcome: 'Data unavailable',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                
                actualSaves = homeSaves + awaySaves;
                console.log(`   - Home team saves: ${homeSaves}`);
                console.log(`   - Away team saves: ${awaySaves}`);
                console.log(`   - Total saves: ${actualSaves}`);
            } else {
                // If we can't determine, check if it might be total by checking bet structure
                // If no team is mentioned and it's a general "goalkeeper saves" market, treat as total
                console.log(`   - Market Type: UNKNOWN - treating as TOTAL (no specific team mentioned)`);
                homeSaves = getGoalkeeperSaves(matchDetails, homeName);
                awaySaves = getGoalkeeperSaves(matchDetails, awayName);
                
                if (homeSaves === null || awaySaves === null) {
                    console.log(`❌ No goalkeeper saves data available - cancelling bet`);
                    return {
                        status: 'cancelled',
                        reason: 'Goalkeeper saves data not available',
                        actualOutcome: 'Data unavailable',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                
                actualSaves = homeSaves + awaySaves;
                console.log(`   - Home team saves: ${homeSaves}`);
                console.log(`   - Away team saves: ${awaySaves}`);
                console.log(`   - Total saves: ${actualSaves}`);
            }
            
            // If no accurate data is available, cancel the bet
            if (actualSaves === null) {
                console.log(`❌ No goalkeeper saves data available - cancelling bet`);
                return {
                    status: 'cancelled',
                    reason: 'Goalkeeper saves data not available',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            let won = false;
            let actualOutcome;
            
            if (selection === 'over') {
                won = actualSaves > line;
                actualOutcome = won ? `Over ${line} (${actualSaves})` : `Under ${line} (${actualSaves})`;
                console.log(`   - Over bet: ${actualSaves} > ${line} = ${won} → ${actualOutcome}`);
            } else if (selection === 'under') {
                won = actualSaves < line;
                actualOutcome = won ? `Under ${line} (${actualSaves})` : `Over ${line} (${actualSaves})`;
                console.log(`   - Under bet: ${actualSaves} < ${line} = ${won} → ${actualOutcome}`);
            } else {
                // Handle other selection types or default to over
                won = actualSaves > line;
                actualOutcome = won ? `Over ${line} (${actualSaves})` : `Under ${line} (${actualSaves})`;
                console.log(`   - Default over logic: ${actualSaves} > ${line} = ${won} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            // Build return object based on market type
            const result = {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                line: line,
                matchId: matchDetails.general?.matchId,
                reason: isTotalMarket ? `Total Goalkeeper Saves: ${actualOutcome}` : `Goalkeeper Saves (${targetTeam}): ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
            
            if (isTotalMarket) {
                result.totalGoalkeeperSaves = actualSaves;
                result.homeSaves = homeSaves;
                result.awaySaves = awaySaves;
            } else {
                result.goalkeeperSaves = actualSaves;
                result.targetTeam = targetTeam;
            }
            
            return result;
        } else if (marketCode === MarketCodes.GOALKEEPER_SAVES_TOTAL) {
            // Total Goalkeeper Saves Over/Under - check total saves from both teams
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const line = (Number(bet.line) || 0) / 1000; // Convert from 1500 to 1.5
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 TOTAL GOALKEEPER SAVES MARKET: "${selection}"`);
            console.log(`   - Line: ${line}`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get saves from both teams
            const homeSaves = getGoalkeeperSaves(matchDetails, homeName);
            const awaySaves = getGoalkeeperSaves(matchDetails, awayName);
            
            console.log(`   - Home team saves: ${homeSaves}`);
            console.log(`   - Away team saves: ${awaySaves}`);
            
            // If no accurate data is available, cancel the bet
            if (homeSaves === null || awaySaves === null) {
                console.log(`❌ No goalkeeper saves data available - cancelling bet`);
                return {
                    status: 'cancelled',
                    reason: 'Goalkeeper saves data not available',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            const totalSaves = homeSaves + awaySaves;
            console.log(`   - Total saves: ${totalSaves} (${homeSaves} + ${awaySaves})`);
            
            let won = false;
            let actualOutcome;
            
            if (selection === 'over') {
                won = totalSaves > line;
                actualOutcome = won ? `Over ${line} (${totalSaves})` : `Under ${line} (${totalSaves})`;
                console.log(`   - Over bet: ${totalSaves} > ${line} = ${won} → ${actualOutcome}`);
            } else if (selection === 'under') {
                won = totalSaves < line;
                actualOutcome = won ? `Under ${line} (${totalSaves})` : `Over ${line} (${totalSaves})`;
                console.log(`   - Under bet: ${totalSaves} < ${line} = ${won} → ${actualOutcome}`);
            } else {
                // Default to over if selection is not explicitly over/under
                won = totalSaves > line;
                actualOutcome = won ? `Over ${line} (${totalSaves})` : `Under ${line} (${totalSaves})`;
                console.log(`   - Default over logic: ${totalSaves} > ${line} = ${won} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                totalGoalkeeperSaves: totalSaves,
                homeSaves: homeSaves,
                awaySaves: awaySaves,
                line: line,
                matchId: matchDetails.general?.matchId,
                reason: `Total Goalkeeper Saves: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.PLAYER_ASSIST) {
            // Player To Assist - check if specific player got an assist
            const participantName = bet.participant || bet.playerName || null;
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 PLAYER ASSIST MARKET: "${participantName}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            if (!participantName) {
                console.log(`❌ No participant name found for assist market`);
                return {
                    status: 'cancelled',
                    reason: 'No participant name found for assist market',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // Find player ID - ALWAYS try name lookup first (more reliable than bet.participantId)
            console.log(`   - Participant Name: "${participantName}"`);
            console.log(`   - Bet Participant ID: ${bet.participantId}`);
            
            let playerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                playerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }
            
            // Fallback to bet.participantId only if name lookup failed
            if (!playerId && bet.participantId) {
                console.log(`   - Name lookup failed, using bet's participant ID: ${bet.participantId}`);
                playerId = bet.participantId;
            }
            
            if (!playerId) {
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                console.log(`❌ Player not found: ${participantName}`);
                return {
                    status: 'cancelled',
                    reason: `Player "${participantName}" not found`,
                    actualOutcome: 'Player not found',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            console.log(`   - Final Player ID: ${playerId}`);
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
            const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
            const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                         ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
            
            if (unavailablePlayers.length > 0) {
                const unavailablePlayer = unavailablePlayers.find(p => 
                    Number(p?.id || p?.playerId) === Number(playerId)
                );
                
                if (unavailablePlayer) {
                    const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                    const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                    const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                    
                    console.log(`   ⚠️ Player is unavailable:`);
                    console.log(`   - Player: ${playerName}`);
                    console.log(`   - Type: ${unavailabilityType}`);
                    console.log(`   - Expected Return: ${reason}`);
                    console.log(`   - Bet will be marked as LOST (player did not play)`);
                    
                    return {
                        status: 'lost',
                        actualOutcome: `Player unavailable (${unavailabilityType})`,
                        finalScore: `${ftHome}-${ftAway}`,
                        playerAssists: 0,
                        playerName: playerName,
                        matchId: matchDetails.general?.matchId,
                        reason: `Player Assist: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
            }
            
            // Get player assists from match events
            const assists = getPlayerAssists(matchDetails, Number(playerId));
            console.log(`   - Player assists: ${assists}`);
            
            let won = false;
            let actualOutcome;
            
            if (isYesBet) {
                won = assists > 0;
                actualOutcome = won ? `Yes (${assists} assists)` : 'No (0 assists)';
                console.log(`   - Yes bet: ${assists} > 0 = ${won} → ${actualOutcome}`);
            } else if (isNoBet) {
                won = assists === 0;
                actualOutcome = won ? 'No (0 assists)' : `Yes (${assists} assists)`;
                console.log(`   - No bet: ${assists} === 0 = ${won} → ${actualOutcome}`);
            } else {
                // Default to Yes bet if selection is not explicitly Yes/No
                won = assists > 0;
                actualOutcome = won ? `Yes (${assists} assists)` : 'No (0 assists)';
                console.log(`   - Default Yes logic: ${assists} > 0 = ${won} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                playerAssists: assists,
                playerName: participantName,
                matchId: matchDetails.general?.matchId,
                reason: `Player Assist: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.PLAYER_SCORE_OR_ASSIST) {
            // Player To Score Or Assist - check if specific player scored OR assisted
            const participantName = bet.participant || bet.playerName || null;
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 PLAYER SCORE OR ASSIST MARKET: "${participantName}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            if (!participantName) {
                console.log(`❌ No participant name found for score or assist market`);
                return {
                    status: 'cancelled',
                    reason: 'No participant name found for score or assist market',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // Find player ID - ALWAYS try name lookup first (more reliable than bet.participantId)
            console.log(`   - Participant Name: "${participantName}"`);
            console.log(`   - Bet Participant ID: ${bet.participantId}`);
            
            let playerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                playerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }
            
            // Fallback to bet.participantId only if name lookup failed
            if (!playerId && bet.participantId) {
                console.log(`   - Name lookup failed, using bet's participant ID: ${bet.participantId}`);
                playerId = bet.participantId;
            }
            
            if (!playerId) {
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                console.log(`❌ Player not found: ${participantName}`);
                return {
                    status: 'cancelled',
                    reason: `Player "${participantName}" not found`,
                    actualOutcome: 'Player not found',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            console.log(`   - Final Player ID: ${playerId}`);
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
            const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
            const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                         ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
            
            if (unavailablePlayers.length > 0) {
                const unavailablePlayer = unavailablePlayers.find(p => 
                    Number(p?.id || p?.playerId) === Number(playerId)
                );
                
                if (unavailablePlayer) {
                    const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                    const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                    const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                    
                    console.log(`   ⚠️ Player is unavailable:`);
                    console.log(`   - Player: ${playerName}`);
                    console.log(`   - Type: ${unavailabilityType}`);
                    console.log(`   - Expected Return: ${reason}`);
                    console.log(`   - Bet will be marked as LOST (player did not play)`);
                    
                    return {
                        status: 'lost',
                        actualOutcome: `Player unavailable (${unavailabilityType})`,
                        finalScore: `${ftHome}-${ftAway}`,
                        playerGoals: 0,
                        playerAssists: 0,
                        playerTotal: 0,
                        playerName: playerName,
                        matchId: matchDetails.general?.matchId,
                        reason: `Player Score Or Assist: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
            }
            
            // Get player goals and assists from match events
            const { goals, assists, total } = getPlayerScoreOrAssist(matchDetails, Number(playerId));
            console.log(`   - Player goals: ${goals}, assists: ${assists}, total: ${total}`);
            
            let won = false;
            let actualOutcome;
            
            if (isYesBet) {
                won = total > 0;
                actualOutcome = won ? `Yes (${goals} goals, ${assists} assists)` : 'No (0 goals, 0 assists)';
                console.log(`   - Yes bet: ${total} > 0 = ${won} → ${actualOutcome}`);
            } else if (isNoBet) {
                won = total === 0;
                actualOutcome = won ? 'No (0 goals, 0 assists)' : `Yes (${goals} goals, ${assists} assists)`;
                console.log(`   - No bet: ${total} === 0 = ${won} → ${actualOutcome}`);
            } else {
                // Default to Yes bet if selection is not explicitly Yes/No
                won = total > 0;
                actualOutcome = won ? `Yes (${goals} goals, ${assists} assists)` : 'No (0 goals, 0 assists)';
                console.log(`   - Default Yes logic: ${total} > 0 = ${won} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                playerGoals: goals,
                playerAssists: assists,
                playerTotal: total,
                playerName: participantName,
                matchId: matchDetails.general?.matchId,
                reason: `Player Score Or Assist: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.PLAYER_SCORE_OUTSIDE_PENALTY) {
            // Player To Score From Outside Penalty Box - check if specific player scored from outside penalty box
            const participantName = bet.participant || bet.playerName || null;
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 PLAYER SCORE OUTSIDE PENALTY MARKET: "${participantName}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            if (!participantName) {
                console.log(`❌ No participant name found for score from outside penalty market`);
                return {
                    status: 'cancelled',
                    reason: 'No participant name found for score from outside penalty market',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // ✅ FIX: Use findPlayerIdByName with Gemini fallback and capture geminiNoMatch
            let playerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                playerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }
            
            // Fallback to bet.participantId only if name lookup failed
            if (!playerId && bet.participantId) {
                console.log(`   - Name lookup failed, using bet's participant ID: ${bet.participantId}`);
                playerId = bet.participantId;
            }
            
            if (!playerId) {
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                console.log(`❌ Player not found: ${participantName}`);
                return {
                    status: 'cancelled',
                    reason: `Player "${participantName}" not found`,
                    actualOutcome: 'Player not found',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            console.log(`   - Player ID: ${playerId}`);
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
            const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
            const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                         ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
            
            if (unavailablePlayers.length > 0) {
                const unavailablePlayer = unavailablePlayers.find(p => 
                    Number(p?.id || p?.playerId) === Number(playerId)
                );
                
                if (unavailablePlayer) {
                    const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                    const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                    const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                    
                    console.log(`   ⚠️ Player is unavailable:`);
                    console.log(`   - Player: ${playerName}`);
                    console.log(`   - Type: ${unavailabilityType}`);
                    console.log(`   - Expected Return: ${reason}`);
                    console.log(`   - Bet will be marked as LOST (player did not play)`);
                    
                    return {
                        status: 'lost',
                        actualOutcome: `Player unavailable (${unavailabilityType})`,
                        finalScore: `${ftHome}-${ftAway}`,
                        playerGoalsFromOutside: 0,
                        playerName: playerName,
                        matchId: matchDetails.general?.matchId,
                        reason: `Player Score From Outside Penalty: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
            }
            
            // Get player goals from outside penalty box
            const goalsFromOutside = getPlayerGoalsFromOutsidePenalty(matchDetails, Number(playerId));
            console.log(`   - Player goals from outside penalty box: ${goalsFromOutside}`);
            
            let won = false;
            let actualOutcome;
            
            if (isYesBet) {
                won = goalsFromOutside > 0;
                actualOutcome = won ? `Yes (${goalsFromOutside} goals from outside penalty box)` : 'No (0 goals from outside penalty box)';
                console.log(`   - Yes bet: ${goalsFromOutside} > 0 = ${won} → ${actualOutcome}`);
            } else if (isNoBet) {
                won = goalsFromOutside === 0;
                actualOutcome = won ? 'No (0 goals from outside penalty box)' : `Yes (${goalsFromOutside} goals from outside penalty box)`;
                console.log(`   - No bet: ${goalsFromOutside} === 0 = ${won} → ${actualOutcome}`);
            } else {
                // Default to Yes bet if selection is not explicitly Yes/No
                won = goalsFromOutside > 0;
                actualOutcome = won ? `Yes (${goalsFromOutside} goals from outside penalty box)` : 'No (0 goals from outside penalty box)';
                console.log(`   - Default Yes logic: ${goalsFromOutside} > 0 = ${won} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                playerGoalsFromOutside: goalsFromOutside,
                playerName: participantName,
                matchId: matchDetails.general?.matchId,
                reason: `Player Score From Outside Penalty: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.PLAYER_SCORE_HEADER) {
            // Player To Score From Header - check if specific player scored with a header
            const participantName = bet.participant || bet.playerName || null;
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 PLAYER SCORE HEADER MARKET: "${participantName}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            if (!participantName) {
                console.log(`❌ No participant name found for score from header market`);
                return {
                    status: 'cancelled',
                    reason: 'No participant name found for score from header market',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // ✅ FIX: Use findPlayerIdByName with Gemini fallback and capture geminiNoMatch
            let playerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player ID by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                playerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID by name: ${playerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }
            
            // Fallback to bet.participantId only if name lookup failed
            if (!playerId && bet.participantId) {
                console.log(`   - Name lookup failed, using bet's participant ID: ${bet.participantId}`);
                playerId = bet.participantId;
            }
            
            if (!playerId) {
                // ✅ If Gemini returned NO_MATCH, mark bet as LOST instead of cancelled
                if (geminiNoMatch) {
                    console.log(`   ⚠️ Gemini returned NO_MATCH - player not found in match, marking bet as LOST`);
                    return {
                        status: 'lost',
                        reason: 'Player not found in match (Gemini AI confirmed NO_MATCH)',
                        actualOutcome: 'Player not found',
                        finalScore: `${ftHome}-${ftAway}`,
                        matchId: matchDetails.general?.matchId,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
                console.log(`❌ Player not found: ${participantName}`);
                return {
                    status: 'cancelled',
                    reason: `Player "${participantName}" not found`,
                    actualOutcome: 'Player not found',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            console.log(`   - Player ID: ${playerId}`);
            
            // ✅ NEW: Check if player is unavailable (injured/suspended/international duty)
            // If player is unavailable, bet should be LOST (not cancelled)
            const awayUnavailable = matchDetails?.content?.lineup?.awayTeam?.unavailable || [];
            const homeUnavailable = matchDetails?.content?.lineup?.homeTeam?.unavailable || [];
            const unavailablePlayers = [...(Array.isArray(awayUnavailable) ? awayUnavailable : []), 
                                         ...(Array.isArray(homeUnavailable) ? homeUnavailable : [])];
            
            if (unavailablePlayers.length > 0) {
                const unavailablePlayer = unavailablePlayers.find(p => 
                    Number(p?.id || p?.playerId) === Number(playerId)
                );
                
                if (unavailablePlayer) {
                    const unavailabilityType = unavailablePlayer?.unavailability?.type || 'unknown';
                    const reason = unavailablePlayer?.unavailability?.expectedReturn || 'N/A';
                    const playerName = unavailablePlayer?.name || participantName || 'Unknown';
                    
                    console.log(`   ⚠️ Player is unavailable:`);
                    console.log(`   - Player: ${playerName}`);
                    console.log(`   - Type: ${unavailabilityType}`);
                    console.log(`   - Expected Return: ${reason}`);
                    console.log(`   - Bet will be marked as LOST (player did not play)`);
                    
                    return {
                        status: 'lost',
                        actualOutcome: `Player unavailable (${unavailabilityType})`,
                        finalScore: `${ftHome}-${ftAway}`,
                        playerHeaderGoals: 0,
                        playerName: playerName,
                        matchId: matchDetails.general?.matchId,
                        reason: `Player Score From Header: Player "${playerName}" is unavailable (${unavailabilityType}) - did not play → LOST`,
                        payout: 0,
                        stake: bet.stake,
                        odds: bet.odds
                    };
                }
            }
            
            // Get player header goals
            const headerGoals = getPlayerGoalsFromHeader(matchDetails, Number(playerId));
            console.log(`   - Player header goals: ${headerGoals}`);
            
            let won = false;
            let actualOutcome;
            
            if (isYesBet) {
                won = headerGoals > 0;
                actualOutcome = won ? `Yes (${headerGoals} header goals)` : 'No (0 header goals)';
                console.log(`   - Yes bet: ${headerGoals} > 0 = ${won} → ${actualOutcome}`);
            } else if (isNoBet) {
                won = headerGoals === 0;
                actualOutcome = won ? 'No (0 header goals)' : `Yes (${headerGoals} header goals)`;
                console.log(`   - No bet: ${headerGoals} === 0 = ${won} → ${actualOutcome}`);
            } else {
                // Default to Yes bet if selection is not explicitly Yes/No
                won = headerGoals > 0;
                actualOutcome = won ? `Yes (${headerGoals} header goals)` : 'No (0 header goals)';
                console.log(`   - Default Yes logic: ${headerGoals} > 0 = ${won} → ${actualOutcome}`);
            }
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                playerHeaderGoals: headerGoals,
                playerName: participantName,
                matchId: matchDetails.general?.matchId,
                reason: `Player Score From Header: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.PENALTY_KICK_AWARDED) {
            // Penalty Kick Awarded - check if any penalty kicks were awarded during the match
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 PENALTY KICK AWARDED MARKET: "${selection}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get penalty kicks awarded
            const penaltyKicksAwarded = getPenaltyKicksAwarded(matchDetails);
            console.log(`   - Penalty kicks awarded: ${penaltyKicksAwarded}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            // Check if penalty kicks were awarded (any penalty kick = Yes)
            const penaltyKicksWereAwarded = penaltyKicksAwarded > 0;
            
            let won = false;
            let actualOutcome = '';
            
            if (isYesBet) {
                won = penaltyKicksWereAwarded;
                actualOutcome = won ? `Yes (${penaltyKicksAwarded} penalty kick${penaltyKicksAwarded > 1 ? 's' : ''} awarded)` : 'No (0 penalty kicks awarded)';
            } else if (isNoBet) {
                won = !penaltyKicksWereAwarded;
                actualOutcome = won ? 'No (0 penalty kicks awarded)' : `Yes (${penaltyKicksAwarded} penalty kick${penaltyKicksAwarded > 1 ? 's' : ''} awarded)`;
            } else {
                // Default to Yes logic if selection is unclear
                won = penaltyKicksWereAwarded;
                actualOutcome = won ? `Yes (${penaltyKicksAwarded} penalty kick${penaltyKicksAwarded > 1 ? 's' : ''} awarded)` : 'No (0 penalty kicks awarded)';
            }
            
            const payout = won ? bet.stake * bet.odds : 0;
            
            console.log(`   - Result: ${won ? 'WON' : 'LOST'} - ${actualOutcome}`);
            console.log(`   - Payout: ${payout}`);
            
            return {
                status: won ? 'won' : 'lost',
                reason: `Penalty Kick Awarded: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.TEAM_SCORE_FROM_PENALTY) {
            // Team To Score From Penalty - check if specific team scored from a penalty
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 TEAM SCORE FROM PENALTY MARKET: "${selection}"`);
            console.log(`   - Market Name: "${bet.marketName}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Home Team (Match): ${homeName}`);
            console.log(`   - Away Team (Match): ${awayName}`);
            console.log(`   - Bet Home Team: "${bet.homeName}"`);
            console.log(`   - Bet Away Team: "${bet.awayName}"`);
            
            // Extract team name from market name
            // Market format: "PSG to score from a penalty" or "Team Name to score from a penalty"
            const marketNameLower = String(bet.marketName || '').toLowerCase();
            let teamFromMarket = '';
            
            // Extract team name before "to score from a penalty"
            if (marketNameLower.includes(' to score from a penalty')) {
                teamFromMarket = marketNameLower.split(' to score from a penalty')[0].trim();
            } else if (marketNameLower.includes(' to score from penalty')) {
                teamFromMarket = marketNameLower.split(' to score from penalty')[0].trim();
            }
            
            console.log(`   - Team extracted from market: "${teamFromMarket}"`);
            
            // Match team from market with bet team names using namesMatch (similar to Team Total Cards)
            const betHomeLower = String(bet.homeName || '').toLowerCase();
            const betAwayLower = String(bet.awayName || '').toLowerCase();
            
            let targetTeamName = null;
            let targetIsHome = false;
            let targetIsAway = false;
            
            // Check if market team matches bet home team using similarity
            if (teamFromMarket && this.namesMatch(teamFromMarket, bet.homeName)) {
                targetTeamName = homeName; // Use match team name, not bet name
                targetIsHome = true;
                console.log(`   ✅ Identified as HOME team bet: ${bet.homeName} → ${homeName}`);
            } else if (teamFromMarket && this.namesMatch(teamFromMarket, bet.awayName)) {
                targetTeamName = awayName; // Use match team name, not bet name
                targetIsAway = true;
                console.log(`   ✅ Identified as AWAY team bet: ${bet.awayName} → ${awayName}`);
            } else if (teamFromMarket) {
                // Try direct matching with match team names
                if (this.namesMatch(teamFromMarket, homeName)) {
                    targetTeamName = homeName;
                    targetIsHome = true;
                    console.log(`   ✅ Identified as HOME team (direct match): ${homeName}`);
                } else if (this.namesMatch(teamFromMarket, awayName)) {
                    targetTeamName = awayName;
                    targetIsAway = true;
                    console.log(`   ✅ Identified as AWAY team (direct match): ${awayName}`);
                }
            }
            
            if (!targetTeamName) {
                console.log(`   ❌ Could not determine target team for penalty scoring market`);
                console.log(`      - Market name: "${bet.marketName}"`);
                console.log(`      - Extracted team: "${teamFromMarket}"`);
                console.log(`      - Bet teams: "${bet.homeName}" / "${bet.awayName}"`);
                console.log(`      - Match teams: "${homeName}" / "${awayName}"`);
                return {
                    status: 'cancelled',
                    reason: 'Could not determine target team for penalty scoring market',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            console.log(`   - Target team: ${targetTeamName} (${targetIsHome ? 'Home' : 'Away'})`);
            
            // Get penalty goals for the target team
            const penaltyGoals = getTeamPenaltyGoals(matchDetails, targetTeamName);
            console.log(`   - Penalty goals for ${targetTeamName}: ${penaltyGoals}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            // Check if team scored from penalty (any penalty goal = Yes)
            const teamScoredFromPenalty = penaltyGoals > 0;
            
            let won = false;
            let actualOutcome = '';
            
            if (isYesBet) {
                won = teamScoredFromPenalty;
                actualOutcome = won ? `Yes (${penaltyGoals} penalty goal${penaltyGoals > 1 ? 's' : ''} scored)` : 'No (0 penalty goals scored)';
            } else if (isNoBet) {
                won = !teamScoredFromPenalty;
                actualOutcome = won ? 'No (0 penalty goals scored)' : `Yes (${penaltyGoals} penalty goal${penaltyGoals > 1 ? 's' : ''} scored)`;
            } else {
                // Default to Yes logic if selection is unclear
                won = teamScoredFromPenalty;
                actualOutcome = won ? `Yes (${penaltyGoals} penalty goal${penaltyGoals > 1 ? 's' : ''} scored)` : 'No (0 penalty goals scored)';
            }
            
            const payout = won ? bet.stake * bet.odds : 0;
            
            console.log(`   - Result: ${won ? 'WON' : 'LOST'} - ${actualOutcome}`);
            console.log(`   - Payout: ${payout}`);
            
            return {
                status: won ? 'won' : 'lost',
                reason: `Team Score From Penalty: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.SCORER_OF_GOAL_X) {
            // Scorer of Goal (2), (3), etc. - who scored the Nth goal (not OWN_GOAL market)
            const marketName = String(bet.marketName || '').toLowerCase();
            const matchGoalNum = marketName.match(/scorer of goal\s*\(\s*(\d+)\s*\)/);
            const goalNumber = matchGoalNum ? parseInt(matchGoalNum[1], 10) : null;
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);

            console.log(`🎯 SCORER OF GOAL (X) MARKET: goal #${goalNumber}, selection="${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);

            if (!goalNumber || goalNumber < 1) {
                console.log(`   ❌ Could not parse goal number from market name`);
                return {
                    status: 'cancelled',
                    reason: 'Scorer of Goal (X): could not parse goal number from market name',
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }

            const nthGoalData = getNthGoal(matchDetails, goalNumber);
            const totalGoals = (getGoalEvents(matchDetails)).length;

            if (selection === 'no goal' || selection === 'no goals') {
                const noNthGoal = !nthGoalData;
                const won = noNthGoal;
                const actualOutcome = noNthGoal ? `No goal (fewer than ${goalNumber} goals)` : `Goal #${goalNumber} was scored`;
                const payout = won ? bet.stake * bet.odds : 0;
                console.log(`   - No goal bet: ${actualOutcome} → ${won ? 'WON' : 'LOST'}`);
                return {
                    status: won ? 'won' : 'lost',
                    reason: `Scorer of Goal (${goalNumber}): ${actualOutcome}`,
                    payout,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }

            if (!nthGoalData) {
                console.log(`   - Fewer than ${goalNumber} goals in match (total: ${totalGoals}) → LOST`);
                return {
                    status: 'lost',
                    reason: `Scorer of Goal (${goalNumber}): Only ${totalGoals} goal(s) scored`,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }

            const nthGoal = nthGoalData.raw;
            const nthScorerName = nthGoal.player?.name || nthGoal.nameStr || nthGoal.fullName || '';
            const nthScorerPlayerId = nthGoal.playerId || nthGoal.player?.id || nthGoal.shotmapEvent?.playerId;
            const nthGoalMinute = getAbsoluteMinuteFromEvent(nthGoal);
            console.log(`   - Goal #${goalNumber}: ${nthScorerName} at minute ${nthGoalMinute} (playerId: ${nthScorerPlayerId})`);

            let participantName = bet.participant || bet.playerName || null;
            if (!participantName) {
                const outLbl = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').trim();
                if (outLbl && !/^no\s*goal/i.test(outLbl)) participantName = outLbl;
            }
            if (!participantName) participantName = selection;

            let matchedPlayerId = null;
            let geminiNoMatch = false;
            if (participantName) {
                console.log(`   - Looking up player by name: "${participantName}"`);
                const result = await findPlayerIdByName(matchDetails, participantName);
                matchedPlayerId = result?.playerId || null;
                geminiNoMatch = result?.geminiNoMatch || false;
                console.log(`   - Found Player ID: ${matchedPlayerId}${geminiNoMatch ? ' (Gemini NO_MATCH)' : ''}`);
            }

            let won = false;
            if (matchedPlayerId && nthScorerPlayerId) {
                won = Number(matchedPlayerId) === Number(nthScorerPlayerId);
                console.log(`   - Player ID match: ${matchedPlayerId} === ${nthScorerPlayerId} → ${won ? 'WON' : 'LOST'}`);
            } else if (participantName && nthScorerName) {
                const nameMatch = nthScorerName.toLowerCase().includes(participantName.toLowerCase()) ||
                    participantName.toLowerCase().includes(nthScorerName.toLowerCase());
                won = nameMatch;
                console.log(`   - Name match (fallback): ${nameMatch} → ${won ? 'WON' : 'LOST'}`);
            }

            if (geminiNoMatch && !won) {
                console.log(`   - Gemini NO_MATCH and no name match → LOST`);
            }

            const payout = won ? bet.stake * bet.odds : 0;
            const actualOutcome = `Goal #${goalNumber}: ${nthScorerName}`;
            console.log(`   - Result: ${won ? 'WON' : 'LOST'} - ${actualOutcome}`);

            return {
                status: won ? 'won' : 'lost',
                reason: `Scorer of Goal (${goalNumber}): ${actualOutcome}`,
                payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.OWN_GOAL) {
            // Own Goal - check if any own goals were scored during the match
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 OWN GOAL MARKET: "${selection}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get own goals
            const ownGoals = getOwnGoals(matchDetails);
            console.log(`   - Own goals: ${ownGoals}`);
            
            // Determine if this is a "Yes" or "No" bet
            const isYesBet = selection === 'yes';
            const isNoBet = selection === 'no';
            
            // Check if own goals were scored (any own goal = Yes)
            const ownGoalsWereScored = ownGoals > 0;
            
            let won = false;
            let actualOutcome = '';
            
            if (isYesBet) {
                won = ownGoalsWereScored;
                actualOutcome = won ? `Yes (${ownGoals} own goal${ownGoals > 1 ? 's' : ''} scored)` : 'No (0 own goals scored)';
            } else if (isNoBet) {
                won = !ownGoalsWereScored;
                actualOutcome = won ? 'No (0 own goals scored)' : `Yes (${ownGoals} own goal${ownGoals > 1 ? 's' : ''} scored)`;
            } else {
                // Default to Yes logic if selection is unclear
                won = ownGoalsWereScored;
                actualOutcome = won ? `Yes (${ownGoals} own goal${ownGoals > 1 ? 's' : ''} scored)` : 'No (0 own goals scored)';
            }
            
            const payout = won ? bet.stake * bet.odds : 0;
            
            console.log(`   - Result: ${won ? 'WON' : 'LOST'} - ${actualOutcome}`);
            console.log(`   - Payout: ${payout}`);
            
            return {
                status: won ? 'won' : 'lost',
                reason: `Own Goal: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.HALF_TIME) {
            // Half Time Result - check the halftime score
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 HALF TIME MARKET: "${selection}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get halftime score
            const halftimeScore = getHalftimeScore(matchDetails);
            console.log(`   - Halftime Score: ${halftimeScore.home}-${halftimeScore.away}`);
            
            if (!halftimeScore || halftimeScore.home === null || halftimeScore.away === null) {
                console.log(`❌ Halftime score not available`);
                return {
                    status: 'cancelled',
                    reason: 'Halftime score not available',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // Determine the actual halftime result
            let actualResult;
            if (halftimeScore.home > halftimeScore.away) {
                actualResult = '1'; // Home win
            } else if (halftimeScore.away > halftimeScore.home) {
                actualResult = '2'; // Away win
            } else {
                actualResult = 'X'; // Draw
            }
            
            console.log(`   - Actual halftime result: ${actualResult}`);
            
            // Check if the bet won - use case-insensitive comparison
            const selectionUpper = selection.toUpperCase();
            const actualResultUpper = actualResult.toUpperCase();
            const won = selectionUpper === actualResultUpper;
            const actualOutcome = `Halftime: ${halftimeScore.home}-${halftimeScore.away} (${actualResult})`;
            
            console.log(`   - Bet selection: "${selection}" (normalized: "${selectionUpper}") vs Actual: "${actualResult}" (normalized: "${actualResultUpper}") = ${won}`);
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                halftimeScore: `${halftimeScore.home}-${halftimeScore.away}`,
                halftimeResult: actualResult,
                matchId: matchDetails.general?.matchId,
                reason: `Half Time Result: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.DOUBLE_CHANCE_2ND_HALF) {
            // Double Chance - 2nd Half - check the second half result
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 DOUBLE CHANCE 2ND HALF MARKET: "${selection}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get second half score
            const secondHalfScore = getSecondHalfScore(matchDetails);
            console.log(`   - Second Half Score: ${secondHalfScore.home}-${secondHalfScore.away}`);
            
            if (!secondHalfScore || secondHalfScore.home === null || secondHalfScore.away === null) {
                console.log(`❌ Second half score not available`);
                return {
                    status: 'cancelled',
                    reason: 'Second half score not available',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // Determine the actual second half result
            let actualResult;
            if (secondHalfScore.home > secondHalfScore.away) {
                actualResult = '1'; // Home win
            } else if (secondHalfScore.away > secondHalfScore.home) {
                actualResult = '2'; // Away win
            } else {
                actualResult = 'X'; // Draw
            }
            
            console.log(`   - Actual second half result: ${actualResult}`);
            
            // Check if the bet won based on double chance selection
            let won = false;
            if (selection === '1x') {
                won = actualResult === '1' || actualResult === 'X'; // Home win or Draw
            } else if (selection === '12') {
                won = actualResult === '1' || actualResult === '2'; // Home win or Away win
            } else if (selection === 'x2') {
                won = actualResult === 'X' || actualResult === '2'; // Draw or Away win
            }
            
            const actualOutcome = `2nd Half: ${secondHalfScore.home}-${secondHalfScore.away} (${actualResult})`;
            
            console.log(`   - Bet selection: "${selection}" vs Actual: "${actualResult}" = ${won}`);
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                secondHalfScore: `${secondHalfScore.home}-${secondHalfScore.away}`,
                secondHalfResult: actualResult,
                matchId: matchDetails.general?.matchId,
                reason: `Double Chance 2nd Half: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.DOUBLE_CHANCE_1ST_HALF) {
            // Double Chance - 1st Half - check the first half result
            const selection = String(bet.outcomeLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 DOUBLE CHANCE 1ST HALF MARKET: "${selection}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Full Time: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            
            // Get first half score
            const firstHalfScore = getHalftimeScore(matchDetails);
            console.log(`   - First Half Score: ${firstHalfScore.home}-${firstHalfScore.away}`);
            
            if (!firstHalfScore || firstHalfScore.home === null || firstHalfScore.away === null) {
                console.log(`❌ First half score not available`);
                return {
                    status: 'cancelled',
                    reason: 'First half score not available',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            // Determine the actual first half result
            let actualResult;
            if (firstHalfScore.home > firstHalfScore.away) {
                actualResult = '1'; // Home win
            } else if (firstHalfScore.away > firstHalfScore.home) {
                actualResult = '2'; // Away win
            } else {
                actualResult = 'X'; // Draw
            }
            
            console.log(`   - Actual first half result: ${actualResult}`);
            
            // Check if the bet won based on double chance selection
            let won = false;
            if (selection === '1x') {
                won = actualResult === '1' || actualResult === 'X'; // Home win or Draw
            } else if (selection === '12') {
                won = actualResult === '1' || actualResult === '2'; // Home win or Away win
            } else if (selection === 'x2') {
                won = actualResult === 'X' || actualResult === '2'; // Draw or Away win
            }
            
            const actualOutcome = `1st Half: ${firstHalfScore.home}-${firstHalfScore.away} (${actualResult})`;
            
            console.log(`   - Bet selection: "${selection}" vs Actual: "${actualResult}" = ${won}`);
            
            const status = won ? 'won' : 'lost';
            const payout = won ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                firstHalfScore: `${firstHalfScore.home}-${firstHalfScore.away}`,
                firstHalfResult: actualResult,
                matchId: matchDetails.general?.matchId,
                reason: `Double Chance 1st Half: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else if (marketCode === MarketCodes.WIN_TO_NIL) {
            // Win to Nil (Yes/No) - e.g., "Club Bolívar to Win to Nil"
            const selection = String(bet.outcomeLabel || bet.outcomeEnglishLabel || '').toLowerCase();
            const { homeScore: ftHome, awayScore: ftAway } = getFinalScore(matchDetails);
            const { homeName, awayName } = getTeamNames(matchDetails);
            
            console.log(`🎯 WIN TO NIL MARKET: "${selection}"`);
            console.log(`   - Selection: "${selection}"`);
            console.log(`   - Final Score: ${ftHome}-${ftAway}`);
            console.log(`   - Teams: ${homeName} vs ${awayName}`);
            console.log(`   - Bet criterion: "${bet.criterion}"`);
            console.log(`   - Bet marketName: "${bet.marketName}"`);
            console.log(`   - Bet criterionLabel: "${bet.criterionLabel}"`);
            console.log(`   - Bet criterionEnglishLabel: "${bet.criterionEnglishLabel}"`);
            
            // Determine which team the bet is for based on the criterion or market name
            const criterion = String(bet.criterion || bet.marketName || bet.criterionLabel || bet.criterionEnglishLabel || '').toLowerCase();
            let targetTeam = null;
            let isHomeTeam = false;
            
            console.log(`   - Checking criterion: "${criterion}"`);
            console.log(`   - Home name: "${homeName.toLowerCase()}"`);
            console.log(`   - Away name: "${awayName.toLowerCase()}"`);
            
            // Normalize team names for better matching (remove accents, extra words, etc.)
            const normalizeTeamName = (name) => {
                return name.toLowerCase()
                    .replace(/[áàäâã]/g, 'a')
                    .replace(/[éèëê]/g, 'e')
                    .replace(/[íìïî]/g, 'i')
                    .replace(/[óòöôõ]/g, 'o')
                    .replace(/[úùüû]/g, 'u')
                    .replace(/[ñ]/g, 'n')
                    .replace(/[ç]/g, 'c')
                    .replace(/\bclub\b/g, '')
                    .replace(/\bfc\b/g, '')
                    .replace(/\bfootball\b/g, '')
                    .replace(/\bteam\b/g, '')
                    .replace(/\bunited\b/g, '')
                    .replace(/\bcity\b/g, '')
                    .replace(/\bathletic\b/g, '')
                    .replace(/\batletico\b/g, '')
                    .replace(/\bmineiro\b/g, '')
                    .replace(/\bmg\b/g, '')
                    .replace(/\b-mg\b/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            
            const normalizedHomeName = normalizeTeamName(homeName);
            const normalizedAwayName = normalizeTeamName(awayName);
            const normalizedCriterion = normalizeTeamName(criterion);
            
            console.log(`   - Normalized home: "${normalizedHomeName}"`);
            console.log(`   - Normalized away: "${normalizedAwayName}"`);
            console.log(`   - Normalized criterion: "${normalizedCriterion}"`);
            
            // More precise team matching - check for exact team name presence or partial matches
            // Method 1: Direct string matching (full team name in criterion)
            if (criterion.includes(homeName.toLowerCase())) {
                targetTeam = homeName;
                isHomeTeam = true;
                console.log(`   - Found home team match (direct): ${targetTeam}`);
            } else if (criterion.includes(awayName.toLowerCase())) {
                targetTeam = awayName;
                isHomeTeam = false;
                console.log(`   - Found away team match (direct): ${targetTeam}`);
            }
            
            // Method 2: Partial matching - check if any significant word from team name is in criterion
            if (!targetTeam) {
                // Extract significant words from team names (longer than 2 chars, exclude common words)
                const commonWords = new Set(['the', 'fc', 'club', 'team', 'united', 'city', 'athletic', 'atletico']);
                const homeWords = normalizedHomeName.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w));
                const awayWords = normalizedAwayName.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w));
                
                console.log(`   - Home words: [${homeWords.join(', ')}]`);
                console.log(`   - Away words: [${awayWords.join(', ')}]`);
                
                // Check if any significant word from home team appears in criterion
                const homeMatch = homeWords.some(word => normalizedCriterion.includes(word));
                // Check if any significant word from away team appears in criterion
                const awayMatch = awayWords.some(word => normalizedCriterion.includes(word));
                
                console.log(`   - Home match: ${homeMatch}, Away match: ${awayMatch}`);
                
                if (homeMatch && !awayMatch) {
                    targetTeam = homeName;
                    isHomeTeam = true;
                    console.log(`   - Found home team match (partial word): ${targetTeam}`);
                } else if (awayMatch && !homeMatch) {
                    targetTeam = awayName;
                    isHomeTeam = false;
                    console.log(`   - Found away team match (partial word): ${targetTeam}`);
                } else if (homeMatch && awayMatch) {
                    // Both match - use the one with longer/more specific match
                    const homeScore = homeWords.filter(w => normalizedCriterion.includes(w)).length;
                    const awayScore = awayWords.filter(w => normalizedCriterion.includes(w)).length;
                    if (homeScore >= awayScore) {
                        targetTeam = homeName;
                        isHomeTeam = true;
                        console.log(`   - Found home team match (best partial): ${targetTeam}`);
                    } else {
                        targetTeam = awayName;
                        isHomeTeam = false;
                        console.log(`   - Found away team match (best partial): ${targetTeam}`);
                    }
                }
            }
            
            // Method 3: Reverse matching - check if criterion words appear in team name
            if (!targetTeam) {
                // Extract significant words from criterion (exclude common market words)
                const marketWords = new Set(['win', 'nil', 'to', 'the', 'and', 'or', 'with', 'without']);
                const criterionWords = normalizedCriterion.split(/\s+/).filter(w => w.length > 2 && !marketWords.has(w));
                
                console.log(`   - Criterion words: [${criterionWords.join(', ')}]`);
                
                // Check if any criterion word appears in team names
                const homeMatch = criterionWords.some(word => normalizedHomeName.includes(word));
                const awayMatch = criterionWords.some(word => normalizedAwayName.includes(word));
                
                console.log(`   - Reverse match - Home: ${homeMatch}, Away: ${awayMatch}`);
                
                if (homeMatch && !awayMatch) {
                    targetTeam = homeName;
                    isHomeTeam = true;
                    console.log(`   - Found home team match (reverse): ${targetTeam}`);
                } else if (awayMatch && !homeMatch) {
                    targetTeam = awayName;
                    isHomeTeam = false;
                    console.log(`   - Found away team match (reverse): ${targetTeam}`);
                } else if (homeMatch && awayMatch) {
                    // Both match - check which has more matching words
                    const homeScore = criterionWords.filter(w => normalizedHomeName.includes(w)).length;
                    const awayScore = criterionWords.filter(w => normalizedAwayName.includes(w)).length;
                    if (homeScore >= awayScore) {
                        targetTeam = homeName;
                        isHomeTeam = true;
                        console.log(`   - Found home team match (best reverse): ${targetTeam}`);
                    } else {
                        targetTeam = awayName;
                        isHomeTeam = false;
                        console.log(`   - Found away team match (best reverse): ${targetTeam}`);
                    }
                }
            }
            
            // Fallback: If we still can't determine the team, but we can determine the outcome
            if (!targetTeam) {
                console.log(`⚠️ Could not determine target team from criterion: "${criterion}"`);
                console.log(`   - Attempting fallback logic based on match result...`);
                
                // Fallback logic: Check if we can determine the outcome without knowing the exact team
                // For "Yes" selection: Win to Nil requires team to win AND opponent to score 0
                // If opponent scored > 0, it's definitely LOST (can't be win to nil)
                // If neither team won with clean sheet, it's LOST
                
                const homeWon = ftHome > ftAway;
                const awayWon = ftAway > ftHome;
                const homeCleanSheet = ftAway === 0;
                const awayCleanSheet = ftHome === 0;
                const homeWinToNil = homeWon && homeCleanSheet;
                const awayWinToNil = awayWon && awayCleanSheet;
                
                console.log(`   - Home won: ${homeWon}, Away won: ${awayWon}`);
                console.log(`   - Home clean sheet: ${homeCleanSheet}, Away clean sheet: ${awayCleanSheet}`);
                console.log(`   - Home win to nil: ${homeWinToNil}, Away win to nil: ${awayWinToNil}`);
                
                if (selection === 'yes') {
                    // For "Yes" selection, if neither team achieved win to nil, bet is LOST
                    if (!homeWinToNil && !awayWinToNil) {
                        console.log(`   - Fallback: Neither team achieved win to nil, bet is LOST`);
                        return {
                            status: 'lost',
                            reason: `Win to Nil: Neither team won with a clean sheet (Final: ${ftHome}-${ftAway})`,
                            actualOutcome: `No team won to nil`,
                            finalScore: `${ftHome}-${ftAway}`,
                            matchId: matchDetails.general?.matchId,
                            payout: 0,
                            stake: bet.stake,
                            odds: bet.odds
                        };
                    }
                } else if (selection === 'no') {
                    // For "No" selection, if both teams achieved win to nil (impossible), or if neither did, bet is WON
                    // Actually, if neither achieved win to nil, "No" bet wins
                    if (!homeWinToNil && !awayWinToNil) {
                        console.log(`   - Fallback: Neither team achieved win to nil, "No" bet is WON`);
                        return {
                            status: 'won',
                            reason: `Win to Nil: Neither team won with a clean sheet (Final: ${ftHome}-${ftAway})`,
                            actualOutcome: `No team won to nil`,
                            finalScore: `${ftHome}-${ftAway}`,
                            matchId: matchDetails.general?.matchId,
                            payout: bet.stake * bet.odds,
                            stake: bet.stake,
                            odds: bet.odds
                        };
                    }
                }
                
                // If we still can't determine, return cancelled (but this should be rare)
                console.log(`❌ Could not determine target team or outcome from criterion: "${criterion}"`);
                return {
                    status: 'cancelled',
                    reason: 'Could not determine target team for Win to Nil bet',
                    actualOutcome: 'Data unavailable',
                    finalScore: `${ftHome}-${ftAway}`,
                    matchId: matchDetails.general?.matchId,
                    payout: 0,
                    stake: bet.stake,
                    odds: bet.odds
                };
            }
            
            console.log(`   - Target team: ${targetTeam} (${isHomeTeam ? 'home' : 'away'})`);
            
            // Check if the target team won and kept a clean sheet
            const targetScore = isHomeTeam ? ftHome : ftAway;
            const opponentScore = isHomeTeam ? ftAway : ftHome;
            const won = targetScore > opponentScore;
            const cleanSheet = opponentScore === 0;
            const winToNil = won && cleanSheet;
            
            console.log(`   - Target team score: ${targetScore}`);
            console.log(`   - Opponent score: ${opponentScore}`);
            console.log(`   - Won: ${won}`);
            console.log(`   - Clean sheet: ${cleanSheet}`);
            console.log(`   - Win to Nil: ${winToNil}`);
            
            // Determine if the bet won
            let betWon = false;
            if (selection === 'yes') {
                betWon = winToNil;
            } else if (selection === 'no') {
                betWon = !winToNil;
            }
            
            const actualOutcome = `${targetTeam} ${won ? 'won' : 'did not win'} ${cleanSheet ? 'with clean sheet' : 'without clean sheet'}`;
            
            console.log(`   - Bet selection: "${selection}" vs Actual: "${winToNil ? 'Yes' : 'No'}" = ${betWon}`);
            
            const status = betWon ? 'won' : 'lost';
            const payout = betWon ? bet.stake * bet.odds : 0;
            
            return {
                status: status,
                actualOutcome: actualOutcome,
                finalScore: `${ftHome}-${ftAway}`,
                targetTeam: targetTeam,
                targetScore: targetScore,
                opponentScore: opponentScore,
                won: won,
                cleanSheet: cleanSheet,
                winToNil: winToNil,
                matchId: matchDetails.general?.matchId,
                reason: `Win to Nil: ${actualOutcome}`,
                payout: payout,
                stake: bet.stake,
                odds: bet.odds
            };
        } else {
            // For unsupported markets, return cancelled (not pending)
            console.log(`⚠️ Market "${bet.marketName}" not yet supported - returning cancelled`);
            return {
                status: 'cancelled',
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
        // 🐛 BREAKPOINT: START - Live matches details extraction for bet calculation
        console.log(`🐛 [BREAKPOINT] ========================================`);
        console.log(`🐛 [BREAKPOINT] ===== START: PROCESSING BET =====`);
        console.log(`🐛 [BREAKPOINT] ========================================`);
        console.log(`🐛 [BREAKPOINT] Bet ID: ${bet._id || bet.id || 'N/A'}`);
        console.log(`🐛 [BREAKPOINT] Bet Match ID: ${bet.matchId || bet.eventId || 'N/A'}`);
        console.log(`🐛 [BREAKPOINT] Is Live Match: ${bet.inplay || false}`);
        console.log(`🐛 [BREAKPOINT] Market: ${bet.marketName || 'N/A'}`);
        console.log(`\n🔍 ===== PROCESSING BET ${bet._id} =====`);
        
        try {
            console.log(`\n🔍 ===== PROCESSING BET ${bet._id} =====`);
            console.log(`📋 Bet Details:`);
            console.log(`   - Event: ${bet.eventName}`);
            console.log(`   - Teams: ${bet.homeName} vs ${bet.awayName}`);
            console.log(`   - Selection: ${bet.outcomeLabel} @ ${bet.odds}`);
            console.log(`   - Stake: €${bet.stake}`);
            console.log(`   - League: ${bet.leagueName} (ID: ${bet.leagueId})`);
            // ✅ FIX: Check all possible field locations for match date
            // Priority: bet.matchDate (DB) > betDetails.matchDate (combination legs) > bet.start > other sources
            let matchDateValue, matchDateSource;
            if (bet.matchDate) {
                matchDateValue = bet.matchDate;
                matchDateSource = 'bet.matchDate (from DB)';
            } else if (bet.betDetails?.matchDate) {
                matchDateValue = bet.betDetails.matchDate;
                matchDateSource = 'bet.betDetails.matchDate (combination leg)';
            } else if (bet.start) {
                matchDateValue = bet.start;
                matchDateSource = 'bet.start (from adapter)';
            } else if (bet.unibetMeta?.start) {
                matchDateValue = bet.unibetMeta.start;
                matchDateSource = 'bet.unibetMeta.start';
            } else if (bet._originalBet?.matchDate) {
                matchDateValue = bet._originalBet.matchDate;
                matchDateSource = 'bet._originalBet.matchDate';
            } else if (bet._originalBet?.result?.matchDate) {
                matchDateValue = bet._originalBet.result.matchDate;
                matchDateSource = 'bet._originalBet.result.matchDate';
            } else {
                matchDateValue = null;
                matchDateSource = 'NONE';
            }
            
            console.log(`   - Date: ${matchDateValue}`);
            console.log(`   - Date sources checked: bet.matchDate=${bet.matchDate}, bet.betDetails.matchDate=${bet.betDetails?.matchDate}, bet.start=${bet.start}, bet.unibetMeta.start=${bet.unibetMeta?.start}`);
            console.log(`✅ Using ${matchDateSource} as source of truth for matchDate: ${matchDateValue}`);
            console.log(`   - Market: ${bet.marketName}`);

            // Import mongoose for ObjectId conversion
            const mongoose = await import('mongoose');
            const mongooseInstance = mongoose.default || mongoose;

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

            // ✅ FIX: Check all possible field locations for match date
            // Priority: bet.matchDate (DB) > betDetails.matchDate (combination legs) > bet.start > other sources
            if (!bet.matchDate && !bet.betDetails?.matchDate && !bet.start && !bet.unibetMeta?.start && !bet._originalBet?.matchDate && !bet._originalBet?.result?.matchDate) {
                console.log(`❌ VALIDATION FAILED: Bet has no match date in any expected location`);
                console.log(`   - bet.matchDate (DB): ${bet.matchDate}`);
                console.log(`   - bet.betDetails?.matchDate: ${bet.betDetails?.matchDate}`);
                console.log(`   - bet.start: ${bet.start}`);
                console.log(`   - bet.unibetMeta?.start: ${bet.unibetMeta?.start}`);
                console.log(`   - bet._originalBet?.matchDate: ${bet._originalBet?.matchDate}`);
                console.log(`   - bet._originalBet?.result?.matchDate: ${bet._originalBet?.result?.matchDate}`);
                return { success: false, error: 'Bet has no match date' };
            }
            console.log(`✅ Match date valid: ${matchDateValue}`);

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

            // ✅ FIX: Use matchDate field (set when bet is placed)
            const betDate = new Date(matchDateValue);
            if (isNaN(betDate.getTime())) {
                console.log(`❌ VALIDATION FAILED: Invalid bet match date: ${matchDateValue}`);
                return { success: false, error: 'Invalid bet match date' };
            }
            console.log(`✅ Bet date parsed: ${betDate.toISOString()}`);

            // Load league mapping if not already loaded
            if (this.leagueMapping.size === 0) {
                console.log(`\n🔍 Loading league mappings...`);
                await this.loadLeagueMapping();
                console.log(`✅ Loaded ${this.leagueMapping.size} league mappings`);
            }

            // Step 2: TIME-BASED CHECK - Check if enough time has passed since match start (2hrs 15min = 135 minutes)
            // REMOVED: Unibet API call - using time-based logic instead
            // ✅ FIX: Check all possible field locations (matchDate, start, unibetMeta.start, result.matchDate)
            console.log(`\n🔍 STEP 2: Checking if enough time has passed since match start (TIME-BASED LOGIC)...`);
            
            // Check all possible locations for match date:
            // 1. bet.matchDate (root level from database)
            // 2. bet.start (from BetSchemaAdapter.adaptBetForCalculator)
            // 3. bet.unibetMeta?.start (from unibetMeta object)
            // 4. bet._originalBet?.matchDate (original bet document)
            // 5. bet._originalBet?.result?.matchDate (from result object in database)
            const betStartTime = bet.matchDate 
                ? new Date(bet.matchDate) 
                : (bet.start 
                    ? new Date(bet.start) 
                    : (bet.unibetMeta?.start 
                        ? new Date(bet.unibetMeta.start) 
                        : (bet._originalBet?.matchDate 
                            ? new Date(bet._originalBet.matchDate)
                            : (bet._originalBet?.result?.matchDate 
                                ? new Date(bet._originalBet.result.matchDate)
                                : null))));
            const currentTime = new Date();
            let timeSinceStart = null;
            
            if (!betStartTime || isNaN(betStartTime.getTime())) {
                console.warn(`⚠️ No valid match start time found for bet - skipping time check`);
                console.log(`   - bet.matchDate: ${bet.matchDate}`);
                console.log(`   - bet.start: ${bet.start}`);
                console.log(`   - bet.unibetMeta?.start: ${bet.unibetMeta?.start}`);
                console.log(`   - bet._originalBet?.matchDate: ${bet._originalBet?.matchDate}`);
                console.log(`   - bet._originalBet?.result?.matchDate: ${bet._originalBet?.result?.matchDate}`);
                return {
                    success: true,
                    outcome: { status: 'pending', reason: 'No match start time available' },
                    skipped: true,
                    reason: 'Missing match start time - cannot use time-based logic'
                };
            }
            
            timeSinceStart = (currentTime.getTime() - betStartTime.getTime()) / (1000 * 60); // minutes
            console.log(`   - Match start time: ${betStartTime.toISOString()}`);
            console.log(`   - Current time: ${currentTime.toISOString()}`);
            console.log(`   - Time since start: ${timeSinceStart.toFixed(1)} minutes`);
            
            // Estimated match end time: Match start + 2 hours 15 minutes (135 minutes)
            const ESTIMATED_MATCH_DURATION = 135; // 2h 15min in minutes
            const hasEnoughTimePassed = timeSinceStart >= ESTIMATED_MATCH_DURATION;
            
            if (!hasEnoughTimePassed) {
                const remainingTime = ESTIMATED_MATCH_DURATION - timeSinceStart;
                console.log(`⏳ Not enough time passed (${timeSinceStart.toFixed(1)} min < ${ESTIMATED_MATCH_DURATION} min)`);
                console.log(`   - Remaining time: ${remainingTime.toFixed(1)} minutes`);
                console.log(`   - Will check again in next cycle (every 5 seconds)`);
                return {
                    success: true,
                    outcome: { status: 'pending', reason: `Match estimated end time not reached yet (${remainingTime.toFixed(1)} min remaining)` },
                    skipped: true,
                    reason: 'Match estimated end time not reached - skipping FotMob API call'
                };
            }
            
            console.log(`✅ Enough time has passed (${timeSinceStart.toFixed(1)} min >= ${ESTIMATED_MATCH_DURATION} min) - proceeding with FotMob call`);
            console.log(`   - Match estimated end time reached - calling FotMob API`);
            
            // Step 2B: Load Fotmob data (isolated from database operations)
            console.log(`\n🔍 STEP 2B: Loading Fotmob data for ${betDate.toISOString().slice(0, 10)}...`);
            let fotmobData;
            try {
                fotmobData = await this.getCachedDailyMatches(betDate, bet);
            } catch (cacheError) {
                console.error(`❌ CACHE LOADING ERROR:`, cacheError.message);
                console.error(`📋 Cache error details:`, cacheError.stack);
                // Don't let cache errors affect the bet processing flow
                fotmobData = null;
            }

            if (!fotmobData) {
                console.log(`❌ FOTMOB DATA FAILED: No data available for ${betDate.toISOString().slice(0, 10)}`);
                console.log(`📋 This could be due to Fotmob API format changes or network issues`);
                console.log(`📋 Marking bet as canceled with detailed reason`);
                
                // ✅ FIX: Return proper cancellation instead of throwing error
                const cancellationReason = 'FOTMOB_DATA_UNAVAILABLE';
                const detailedError = `Failed to fetch Fotmob match data for date ${betDate.toISOString().slice(0, 10)}. This could be due to Fotmob API format changes, network issues, or the match date being outside the cache range.`;
                
                const cancelResult = await this.cancelBet(bet, cancellationReason, detailedError, {
                    betDate: betDate.toISOString(),
                    dateStr: betDate.toISOString().slice(0, 10),
                    error: 'Fotmob data unavailable'
                });
                
                return {
                    success: true,
                    outcome: {
                        status: 'cancelled',
                        reason: detailedError,
                        stake: bet.stake,
                        payout: bet.stake
                    },
                    cancelled: true,
                    updated: cancelResult.updated
                };
            }
            console.log(`✅ Fotmob data loaded: ${fotmobData.leagues?.length || 0} leagues available`);

            // Debug: Check if Copa Paraguay is in the received data
            const receivedCopaParaguay = fotmobData.leagues?.find(league => league.id === 10230);
            console.log(`   🔍 RECEIVED DATA CHECK: Copa Paraguay in received data: ${!!receivedCopaParaguay} (${receivedCopaParaguay?.matches?.length || 0} matches)`);

            // Step 3: Find matching Fotmob match
            console.log(`\n🔍 STEP 3: Finding matching Fotmob match...`);
            const matchResult = await this.findMatchingFotmobMatch(bet, fotmobData);

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

                    // ✅ FIX: Create detailed cancellation reason with code and error message
                    let detailedReason = `${matchResult.cancellationReason}: ${matchResult.error}`;
                    if (matchResult.debugInfo?.searchSteps && matchResult.debugInfo.searchSteps.length > 0) {
                        const searchSteps = matchResult.debugInfo.searchSteps.slice(-3).join('; '); // Last 3 steps
                        detailedReason = `${detailedReason} (${searchSteps})`;
                    }

                    const cancelResult = await this.cancelBet(bet, matchResult.cancellationReason, detailedReason, matchResult.debugInfo);

                    console.log(`✅ Bet cancelled and updated in database`);
                    return {
                        success: true,
                        outcome: { 
                            status: 'cancelled', 
                            reason: detailedReason,
                            stake: bet.stake,
                            payout: bet.stake // Refund the stake
                        },
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
            
            // Reuse time values from Step 2 (already calculated above)
            // betStartTime, currentTime, timeSinceStart are already available from Step 2
            
            // First check the match status from FotMob match result
            const matchStatusFinished = matchResult.match.status?.finished === true;
            const matchStatusReason = matchResult.match.status?.reason?.short?.toLowerCase() || '';
            const isMatchFinishedFromStatus = matchStatusFinished || 
                matchStatusReason.includes('ft') || 
                matchStatusReason.includes('full') || 
                matchStatusReason.includes('finished');
            
            // Check if enough time has passed since match start (5-10 minutes threshold)
            const MIN_WAIT_TIME = 5; // 5 minutes minimum wait after match start
            const MAX_WAIT_TIME = 10; // 10 minutes maximum wait
            const hasEnoughTimePassedStep4 = timeSinceStart !== null && timeSinceStart >= MIN_WAIT_TIME;
            const hasTooMuchTimePassed = timeSinceStart !== null && timeSinceStart >= MAX_WAIT_TIME;
            
            console.log(`   - Has enough time passed (${MIN_WAIT_TIME} min): ${hasEnoughTimePassedStep4}`);
            console.log(`   - Has too much time passed (${MAX_WAIT_TIME} min): ${hasTooMuchTimePassed}`);
            
            // Check if match is not finished from FotMob - implement 5-minute retry logic with max limit
            // ESTIMATED_MATCH_DURATION is already defined in Step 2 (135 minutes = 2hrs 15mins)
            // Total retry time = 500 - 135 = 365 mins
            // Max retries = 365 / 5 = 73 retries (every 5 mins)
            const MAX_TOTAL_TIME = 500; // 500 minutes = ~8.3 hours
            const MAX_RETRIES = Math.floor((MAX_TOTAL_TIME - ESTIMATED_MATCH_DURATION) / 5); // 73 retries
            
            if (!isMatchFinishedFromStatus && timeSinceStart !== null && timeSinceStart >= ESTIMATED_MATCH_DURATION) {
                // Match should be finished (135 min passed) but FotMob says not finished
                // ✅ FIX: At 500 minutes, refresh FotMob data and check match status again before cancelling
                if (timeSinceStart >= MAX_TOTAL_TIME) {
                    console.log(`🚫 Match exceeded maximum retry time (${timeSinceStart.toFixed(1)} min > ${MAX_TOTAL_TIME} min)`);
                    console.log(`   - Retry count: ${bet.fotmobRetryCount || 0}/${MAX_RETRIES}`);
                    console.log(`   - Total time limit: ${MAX_TOTAL_TIME} minutes (~${(MAX_TOTAL_TIME/60).toFixed(1)} hours)`);
                    console.log(`   - ⚠️ CRITICAL: Refreshing FotMob data to check match finish status one final time before cancelling...`);
                    
                    // ✅ CRITICAL FIX: Refresh FotMob data and re-check match finish status at 500 minutes
                    try {
                        console.log(`   - Reloading FotMob data for fresh status check...`);
                        const refreshedFotmobData = await this.getCachedDailyMatches(betDate, bet);
                        
                        if (refreshedFotmobData) {
                            console.log(`   - Refreshed FotMob data loaded successfully`);
                            const refreshedMatchResult = await this.findMatchingFotmobMatch(bet, refreshedFotmobData);
                            
                            if (refreshedMatchResult.match) {
                                // Re-check match finish status with fresh data
                                const refreshedMatchStatusFinished = refreshedMatchResult.match.status?.finished === true;
                                const refreshedMatchStatusReason = refreshedMatchResult.match.status?.reason?.short?.toLowerCase() || '';
                                const isMatchFinishedFromRefreshedStatus = refreshedMatchStatusFinished || 
                                    refreshedMatchStatusReason.includes('ft') || 
                                    refreshedMatchStatusReason.includes('full') || 
                                    refreshedMatchStatusReason.includes('finished');
                                
                                console.log(`   - Refreshed match status check:`);
                                console.log(`     - Match found: ${!!refreshedMatchResult.match}`);
                                console.log(`     - Status finished: ${refreshedMatchStatusFinished}`);
                                console.log(`     - Status reason: ${refreshedMatchResult.match.status?.reason?.short || 'N/A'}`);
                                console.log(`     - Is finished: ${isMatchFinishedFromRefreshedStatus ? 'YES ✅' : 'NO ❌'}`);
                                
                                if (isMatchFinishedFromRefreshedStatus) {
                                    console.log(`   ✅ MATCH IS FINISHED (from refreshed FotMob data) - proceeding with processing instead of cancelling`);
                                    // Match is finished! Update the status and continue processing
                                    // We'll continue to the detailed match fetch below
                                    // Set isMatchFinishedFromStatus to true so we skip the cancellation logic
                                    isMatchFinishedFromStatus = true;
                                    // Update matchResult with refreshed data
                                    matchResult.match = refreshedMatchResult.match;
                                } else {
                                    console.log(`   ❌ Match is still NOT finished after ${timeSinceStart.toFixed(1)} minutes - cancelling bet`);
                                    console.log(`   - Cancelling bet due to match exceeding too much time AND confirmed not finished`);
                    
                    // Cancel the bet with reason
                    const cancelResult = await this.cancelBet(bet, 'MATCH_EXCEEDED_MAX_TIME', 
                                        `Match exceeded maximum processing time (${MAX_TOTAL_TIME} minutes / ${(MAX_TOTAL_TIME/60).toFixed(1)} hours). Match confirmed NOT finished after ${timeSinceStart.toFixed(1)} minutes from start (checked with refreshed FotMob data).`,
                                        { 
                                            timeSinceStart: timeSinceStart.toFixed(1),
                                            maxTotalTime: MAX_TOTAL_TIME,
                                            retryCount: bet.fotmobRetryCount || 0,
                                            maxRetries: MAX_RETRIES,
                                            finalStatusCheck: {
                                                matchFound: true,
                                                statusFinished: refreshedMatchStatusFinished,
                                                statusReason: refreshedMatchResult.match.status?.reason?.short || 'N/A',
                                                isFinished: false
                                            }
                                        }
                                    );
                                    
                                    return {
                                        success: true,
                                        outcome: { 
                                            status: 'cancelled', 
                                            reason: `Match exceeded too much time (${timeSinceStart.toFixed(1)} min > ${MAX_TOTAL_TIME} min limit) AND confirmed NOT finished after final status check` 
                                        },
                                        cancelled: true,
                                        reason: 'Match exceeded maximum retry time AND confirmed not finished - bet cancelled'
                                    };
                                }
                            } else {
                                console.log(`   ⚠️ Match not found in refreshed FotMob data - cancelling bet`);
                                // Match not found in refreshed data - cancel
                                const cancelResult = await this.cancelBet(bet, 'MATCH_EXCEEDED_MAX_TIME', 
                                    `Match exceeded maximum processing time (${MAX_TOTAL_TIME} minutes / ${(MAX_TOTAL_TIME/60).toFixed(1)} hours). Match not found in refreshed FotMob data after ${timeSinceStart.toFixed(1)} minutes from start.`,
                                    { 
                                        timeSinceStart: timeSinceStart.toFixed(1),
                                        maxTotalTime: MAX_TOTAL_TIME,
                                        retryCount: bet.fotmobRetryCount || 0,
                                        maxRetries: MAX_RETRIES,
                                        finalStatusCheck: {
                                            matchFound: false,
                                            error: refreshedMatchResult.error || 'Match not found'
                                        }
                                    }
                                );
                                
                                return {
                                    success: true,
                                    outcome: { 
                                        status: 'cancelled', 
                                        reason: `Match exceeded too much time (${timeSinceStart.toFixed(1)} min > ${MAX_TOTAL_TIME} min limit) AND match not found in refreshed data` 
                                    },
                                    cancelled: true,
                                    reason: 'Match exceeded maximum retry time AND match not found - bet cancelled'
                                };
                            }
                        } else {
                            console.log(`   ⚠️ Failed to refresh FotMob data - cancelling bet`);
                            // Failed to refresh data - cancel
                            const cancelResult = await this.cancelBet(bet, 'MATCH_EXCEEDED_MAX_TIME', 
                                `Match exceeded maximum processing time (${MAX_TOTAL_TIME} minutes / ${(MAX_TOTAL_TIME/60).toFixed(1)} hours). Failed to refresh FotMob data for final status check after ${timeSinceStart.toFixed(1)} minutes from start.`,
                                { 
                                    timeSinceStart: timeSinceStart.toFixed(1),
                                    maxTotalTime: MAX_TOTAL_TIME,
                                    retryCount: bet.fotmobRetryCount || 0,
                                    maxRetries: MAX_RETRIES,
                                    finalStatusCheck: {
                                        error: 'Failed to refresh FotMob data'
                                    }
                                }
                            );
                            
                            return {
                                success: true,
                                outcome: { 
                                    status: 'cancelled', 
                                    reason: `Match exceeded too much time (${timeSinceStart.toFixed(1)} min > ${MAX_TOTAL_TIME} min limit) AND failed to refresh FotMob data` 
                                },
                                cancelled: true,
                                reason: 'Match exceeded maximum retry time AND failed to refresh data - bet cancelled'
                            };
                        }
                    } catch (refreshError) {
                        console.error(`   ❌ Error refreshing FotMob data: ${refreshError.message}`);
                        console.log(`   - Cancelling bet due to error refreshing data`);
                        // Error refreshing - cancel
                        const cancelResult = await this.cancelBet(bet, 'MATCH_EXCEEDED_MAX_TIME', 
                            `Match exceeded maximum processing time (${MAX_TOTAL_TIME} minutes / ${(MAX_TOTAL_TIME/60).toFixed(1)} hours). Error refreshing FotMob data for final status check: ${refreshError.message}`,
                            { 
                                timeSinceStart: timeSinceStart.toFixed(1),
                                maxTotalTime: MAX_TOTAL_TIME,
                                retryCount: bet.fotmobRetryCount || 0,
                                maxRetries: MAX_RETRIES,
                                finalStatusCheck: {
                                    error: refreshError.message
                                }
                            }
                        );
                        
                        return {
                            success: true,
                            outcome: { 
                                status: 'cancelled', 
                                reason: `Match exceeded too much time (${timeSinceStart.toFixed(1)} min > ${MAX_TOTAL_TIME} min limit) AND error refreshing data: ${refreshError.message}` 
                            },
                            cancelled: true,
                            reason: 'Match exceeded maximum retry time AND error refreshing data - bet cancelled'
                        };
                    }
                    
                    // If we reach here and isMatchFinishedFromStatus is still false, something went wrong
                    if (!isMatchFinishedFromStatus) {
                        console.log(`   ⚠️ Unexpected state - match status check incomplete, cancelling bet`);
                        const cancelResult = await this.cancelBet(bet, 'MATCH_EXCEEDED_MAX_TIME', 
                            `Match exceeded maximum processing time (${MAX_TOTAL_TIME} minutes / ${(MAX_TOTAL_TIME/60).toFixed(1)} hours). Unexpected state after final status check.`,
                        { 
                            timeSinceStart: timeSinceStart.toFixed(1),
                            maxTotalTime: MAX_TOTAL_TIME,
                            retryCount: bet.fotmobRetryCount || 0,
                            maxRetries: MAX_RETRIES
                        }
                    );
                    
                    return {
                        success: true,
                        outcome: { 
                            status: 'cancelled', 
                                reason: `Match exceeded too much time (${timeSinceStart.toFixed(1)} min > ${MAX_TOTAL_TIME} min limit) - unexpected state` 
                        },
                        cancelled: true,
                            reason: 'Match exceeded maximum retry time - unexpected state - bet cancelled'
                    };
                    }
                }
                
                // ✅ FIX: Skip retry logic if match is finished (e.g., after 500-minute refresh confirmed it's finished)
                if (isMatchFinishedFromStatus) {
                    console.log(`✅ Match is finished - skipping retry logic and proceeding to detailed match fetch`);
                    // Continue to detailed match fetch below
                } else {
                // Check last FotMob check time to implement 5-minute retry
                const lastFotmobCheckTime = bet.lastFotmobCheckTime ? new Date(bet.lastFotmobCheckTime) : betStartTime;
                const timeSinceLastCheck = (currentTime.getTime() - lastFotmobCheckTime.getTime()) / (1000 * 60); // minutes
                const RETRY_INTERVAL = 5; // 5 minutes between retries
                const currentRetryCount = bet.fotmobRetryCount || 0;
                
                if (timeSinceLastCheck < RETRY_INTERVAL) {
                    const remainingWait = RETRY_INTERVAL - timeSinceLastCheck;
                    console.log(`⏳ Match not finished yet from FotMob (${timeSinceStart.toFixed(1)} min since start)`);
                    console.log(`   - Last FotMob check: ${timeSinceLastCheck.toFixed(1)} minutes ago`);
                    console.log(`   - Retry count: ${currentRetryCount}/${MAX_RETRIES}`);
                    console.log(`   - Waiting ${remainingWait.toFixed(1)} more minutes before next FotMob retry`);
                    
                    // Update last check time in database (don't increment retry count yet - wait for actual retry)
                    try {
                        await Bet.findByIdAndUpdate(
                            bet._id,
                            { $set: { lastFotmobCheckTime: currentTime } }
                        );
                    } catch (updateError) {
                        console.warn(`⚠️ Failed to update lastFotmobCheckTime: ${updateError.message}`);
                    }
                    
                    return {
                        success: true,
                        outcome: { status: 'pending', reason: `Match not finished yet - will retry in ${remainingWait.toFixed(1)} minutes (retry ${currentRetryCount + 1}/${MAX_RETRIES})` },
                        skipped: true,
                        reason: 'Match not finished - waiting 5 minutes before next FotMob retry'
                    };
                } else {
                    // Enough time passed - this is a new retry attempt
                    const newRetryCount = currentRetryCount + 1;
                    console.log(`✅ Enough time passed since last FotMob check (${timeSinceLastCheck.toFixed(1)} min) - proceeding with retry ${newRetryCount}/${MAX_RETRIES}`);
                    
                    // Update retry count and last check time
                    try {
                        await Bet.findByIdAndUpdate(
                            bet._id,
                            { 
                                $set: { 
                                    lastFotmobCheckTime: currentTime,
                                    fotmobRetryCount: newRetryCount
                                } 
                            }
                        );
                    } catch (updateError) {
                        console.warn(`⚠️ Failed to update retry count: ${updateError.message}`);
                    }
                    
                    // Check if we've reached max retries
                    if (newRetryCount >= MAX_RETRIES) {
                        console.log(`🚫 Maximum retry count reached (${newRetryCount}/${MAX_RETRIES})`);
                        console.log(`   - Time since start: ${timeSinceStart.toFixed(1)} minutes`);
                        console.log(`   - Cancelling bet due to maximum retries exceeded`);
                        
                        // Cancel the bet with reason
                        const cancelResult = await this.cancelBet(bet, 'MAX_RETRIES_EXCEEDED', 
                            `Match did not finish after ${MAX_RETRIES} retry attempts (${MAX_RETRIES * 5} minutes) following the initial ${ESTIMATED_MATCH_DURATION} minute wait. Total time: ${timeSinceStart.toFixed(1)} minutes.`,
                            { 
                                timeSinceStart: timeSinceStart.toFixed(1),
                                retryCount: newRetryCount,
                                maxRetries: MAX_RETRIES,
                                totalRetryTime: MAX_RETRIES * 5
                            }
                        );
                        
                        return {
                            success: true,
                            outcome: { 
                                status: 'cancelled', 
                                reason: `Match exceeded too much time - maximum retries (${MAX_RETRIES}) exceeded` 
                            },
                            cancelled: true,
                            reason: 'Maximum retry count exceeded - bet cancelled'
                        };
                        }
                    }
                }
            }
            
            // Check if bet has matchFinished flag set (if explicitly false, skip unless enough time passed)
            if (bet.matchFinished === false && !isMatchFinishedFromStatus && !hasEnoughTimePassedStep4) {
                console.log(`⏳ Match not finished yet (bet flag = false, status check = ${isMatchFinishedFromStatus}, time = ${timeSinceStart?.toFixed(1)} min) - skipping detailed API call`);
                return {
                    success: true,
                    outcome: { status: 'pending', reason: 'Match not finished yet' },
                    skipped: true,
                    reason: 'Match not finished - avoiding unnecessary API call'
                };
            }
            
            // IMPORTANT: Only call FotMob fetchMatchDetails if enough time has passed (2hrs 15min = 135 minutes)
            // Note: Time-based check is done earlier (Step 2) and returns early if not enough time
            // This is a safety check in case we reach here somehow
            
            // If match appears finished from status, proceed even if bet flag is not set
            if (isMatchFinishedFromStatus) {
                console.log(`✅ Match finished confirmed from FotMob status - proceeding with detailed API call`);
            } else if (hasEnoughTimePassedStep4) {
                console.log(`⏰ Enough time has passed since match start (${timeSinceStart.toFixed(1)} min) - proceeding with FotMob call (minimum 135 min / 2hrs 15min required)`);
            } else if (bet.matchFinished === undefined) {
                console.log(`⚠️ Match finished status unknown - proceeding with API call to verify`);
            } else {
                console.log(`✅ Match finished status confirmed - proceeding with detailed API call`);
            }
            
            // Fetch detailed match information using new API
            // NOTE: This is only called if enough time has passed (2hrs 15min = 135 minutes from match start)
            console.log(`\n🔍 STEP 4B: Fetching detailed match information from FotMob...`);
            console.log(`   ✅ This call happens after ${timeSinceStart.toFixed(1)} minutes from match start (minimum ${ESTIMATED_MATCH_DURATION} min required)`);
            console.log(`   Match ID: ${matchResult.match.id}`);
            console.log(`   Match: ${matchResult.match.home?.name} vs ${matchResult.match.away?.name}`);
            
            const matchDetails = await this.fetchMatchDetails(matchResult.match.id);
            
            if (matchDetails) {
                console.log(`✅ Match details received: ${matchDetails.general?.homeTeam?.name} vs ${matchDetails.general?.awayTeam?.name}`);
            } else {
                console.log(`⚠️ Match details is NULL/UNDEFINED - No data received!`);
            }
            
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
                const updateResult = await Bet.findByIdAndUpdate(
                    bet._id,
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
                
                console.log(`✅ STEP 4C SUCCESS: Bet marked as needs attention`);
                
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

            // Step 5: Verify match is actually finished before calculating outcome
            console.log(`\n🔍 STEP 5: Verifying match is finished before calculating outcome...`);
            
            // Check if match is finished using multiple methods
            let isMatchFinished = false;
            let finishedReason = '';
            
            // Method 1: Check general.finished
            if (matchDetails.general?.finished === true) {
                isMatchFinished = true;
                finishedReason = 'general.finished = true';
            }
            // Method 2: Check header.status.finished
            else if (matchDetails.header?.status?.finished === true) {
                isMatchFinished = true;
                finishedReason = 'header.status.finished = true';
            }
            // Method 3: Check status reason (FT, Full-Time, etc.)
            else if (matchDetails.header?.status?.reason?.short) {
                const statusShort = matchDetails.header.status.reason.short.toLowerCase();
                if (statusShort.includes('ft') || statusShort.includes('full') || 
                    statusShort.includes('finished') || statusShort.includes('final')) {
                    isMatchFinished = true;
                    finishedReason = `Status reason: "${matchDetails.header.status.reason.short}"`;
                }
            }
            
            console.log(`   - Match finished check: ${isMatchFinished ? 'YES ✅' : 'NO ❌'}`);
            console.log(`   - Reason: ${finishedReason || 'Match still in progress'}`);
            console.log(`   - General finished: ${matchDetails.general?.finished || false}`);
            console.log(`   - Header status finished: ${matchDetails.header?.status?.finished || false}`);
            console.log(`   - Status reason: ${matchDetails.header?.status?.reason?.short || 'N/A'}`);
            
            if (!isMatchFinished) {
                console.log(`⏳ Match is NOT finished yet - keeping bet as pending`);
                console.log(`   - Match status: ${matchDetails.general?.finished ? 'Finished' : matchDetails.general?.started ? 'In Progress' : 'Not Started'}`);
                console.log(`   - Header status: ${matchDetails.header?.status?.finished ? 'Finished' : 'Not Finished'}`);
                
                // Update last check time
                try {
                    await Bet.findByIdAndUpdate(
                        bet._id,
                        { $set: { lastFotmobCheckTime: new Date() } }
                    );
                } catch (updateError) {
                    console.warn(`⚠️ Failed to update lastFotmobCheckTime: ${updateError.message}`);
                }
                
                return {
                    success: true,
                    outcome: { 
                        status: 'pending', 
                        reason: `Match not finished yet - ${finishedReason || 'Match still in progress'}` 
                    },
                    skipped: true,
                    reason: 'Match still in progress - will retry later'
                };
            }
            
            console.log(`✅ Match is finished - proceeding with outcome calculation`);

            // Step 6: Calculate bet outcome (only if match is finished)
            console.log(`\n🔍 STEP 6: Calculating bet outcome...`);
            const outcome = await this.calculateBetOutcome(bet, matchDetails);

            console.log(`📊 Outcome calculation:`);
            console.log(`   - Status: ${outcome.status}`);
            console.log(`   - Actual outcome: ${outcome.actualOutcome || 'N/A'}`);
            console.log(`   - Final score: ${outcome.finalScore || 'N/A'}`);
            console.log(`   - Reason: ${outcome.reason}`);

            // Step 7: Update bet in database (only if updateDatabase is true)
            if (updateDatabase) {
            console.log(`\n🔍 STEP 7: Updating bet in database...`);
            console.log(`   - Bet ID: ${bet._originalBet?.id} (type: ${typeof bet._id})`);
            
            // Import Bet model
            const { default: Bet } = await import('../models/Bet.js');
            
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
            
            // Calculate payout and profit based on outcome status
            let calculatedPayout = 0;
            let calculatedProfit = 0;
            
            // Get original bet data for calculation
            const originalBet = await Bet.findById(betId);
            if (!originalBet) {
                throw new Error(`Bet with ID ${betId} not found`);
            }
            
            const stake = Number(originalBet.stake);
            const odds = Number(originalBet.odds);
            
            console.log(`\n💰 ========== PAYOUT & PROFIT CALCULATION ==========`);
            console.log(`💰 Bet ID: ${betId}`);
            console.log(`💰 Status: ${outcome.status}`);
            console.log(`💰 Stake: ${stake} (type: ${typeof stake})`);
            console.log(`💰 Odds: ${odds} (type: ${typeof odds})`);
            
            switch (outcome.status) {
                case 'pending':
                    // Pending bets should NOT have any payout calculation
                    calculatedPayout = 0;
                    calculatedProfit = 0;
                    console.log(`💰 Calculation: PENDING`);
                    console.log(`💰   - Payout = 0 (bet still being processed)`);
                    console.log(`💰   - Profit = 0 (no calculation until bet is finalized)`);
                    break;
                    
                case 'won':
                    calculatedPayout = stake * odds;
                    calculatedProfit = calculatedPayout - stake;
                    console.log(`💰 Calculation: WON`);
                    console.log(`💰   - Payout = ${stake} × ${odds} = ${calculatedPayout}`);
                    console.log(`💰   - Profit = ${calculatedPayout} - ${stake} = ${calculatedProfit}`);
                    break;
                    
                case 'lost':
                    calculatedPayout = 0;
                    calculatedProfit = -stake;
                    console.log(`💰 Calculation: LOST`);
                    console.log(`💰   - Payout = 0`);
                    console.log(`💰   - Profit = 0 - ${stake} = ${calculatedProfit}`);
                    break;
                    
                case 'half_won':
                    // Half Win: Half stake wins (with odds), half stake refunded
                    // Payout = (stake / 2) * odds + (stake / 2) = stake * ((odds - 1) / 2 + 1)
                    const halfStake = stake / 2;
                    const halfStakeWinnings = halfStake * odds;
                    const halfStakeRefund = halfStake;
                    calculatedPayout = Number((halfStakeWinnings + halfStakeRefund).toFixed(2));
                    calculatedProfit = Number((calculatedPayout - stake).toFixed(2));
                    
                    console.log(`💰 Calculation: HALF WON`);
                    console.log(`💰   Step 1: Split stake → ${halfStake} + ${halfStake}`);
                    console.log(`💰   Step 2: Part 1 wins = ${halfStake} × ${odds} = ${halfStakeWinnings}`);
                    console.log(`💰   Step 3: Part 2 refund = ${halfStakeRefund}`);
                    console.log(`💰   Step 4: Total Payout = ${halfStakeWinnings} + ${halfStakeRefund} = ${calculatedPayout}`);
                    console.log(`💰   Step 5: Profit = ${calculatedPayout} - ${stake} = ${calculatedProfit}`);
                    break;
                    
                case 'half_lost':
                    // Half Loss: Half stake lost, half stake refunded
                    const halfLossStake = stake / 2;
                    calculatedPayout = Number(halfLossStake.toFixed(2));
                    calculatedProfit = Number((calculatedPayout - stake).toFixed(2));
                    
                    console.log(`💰 Calculation: HALF LOST`);
                    console.log(`💰   Step 1: Split stake → ${halfLossStake} + ${halfLossStake}`);
                    console.log(`💰   Step 2: Part 1 LOST (gone) = ${halfLossStake}`);
                    console.log(`💰   Step 3: Part 2 VOID (refund) = ${halfLossStake}`);
                    console.log(`💰   Step 4: Total Payout = ${calculatedPayout} (only refund)`);
                    console.log(`💰   Step 5: Profit = ${calculatedPayout} - ${stake} = ${calculatedProfit}`);
                    break;
                    
                case 'void':
                case 'cancelled':
                case 'canceled':
                    calculatedPayout = stake;
                    calculatedProfit = 0;
                    console.log(`💰 Calculation: ${outcome.status.toUpperCase()}`);
                    console.log(`💰   - Payout = ${stake} (full refund)`);
                    console.log(`💰   - Profit = 0 (no profit, no loss)`);
                    break;
                    
                default:
                    console.log(`💰 Warning: Unknown status '${outcome.status}', defaulting to cancelled`);
                    calculatedPayout = stake;
                    calculatedProfit = 0;
                    break;
            }
            
            console.log(`💰 ================================================\n`);
            
            // Use findByIdAndUpdate for reliable Mongoose updates
            console.log(`   - About to update bet with ID: ${betId}`);
            console.log(`   - Update data:`, {
                status: outcome.status,
                payout: calculatedPayout,
                profit: calculatedProfit,
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
                            payout: calculatedPayout,
                            profit: calculatedProfit,
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
        // IMPORTANT: Do NOT update balance for pending status - bet is still being processed
        console.log(`\n💰 ========== USER BALANCE UPDATE ==========`);
        console.log(`💰 User ID: ${originalBet.userId || bet.userId}`);
        console.log(`💰 Outcome Status: ${outcome.status}`);
        console.log(`💰 Calculated Payout: ${calculatedPayout}`);
        console.log(`💰 Calculated Profit: ${calculatedProfit}`);
        
        // Block balance update for pending status
        if (outcome.status === 'pending') {
            console.log(`⏸️ SKIPPING balance update - bet status is still PENDING`);
            console.log(`   - Balance will be updated when bet is processed (won/lost/void/cancelled)`);
            console.log(`💰 ===========================================\n`);
            // Skip balance update and return early
        } else {
        const userId = originalBet.userId || bet.userId;
        
        if (userId) {
            // Import User model
            const { default: User } = await import('../models/User.js');
            
            // Get user before update
            const userBefore = await User.findById(userId);
            const balanceBefore = userBefore?.balance || 0;
            console.log(`💰 Balance Before: ${balanceBefore}`);
            
            // Update balance based on payout
            if (calculatedPayout > 0) {
                await User.findByIdAndUpdate(userId, {
                    $inc: { balance: calculatedPayout }
                });
                console.log(`💰 Added to balance: ${calculatedPayout}`);
            }
            
            // Get user after update
            const userAfter = await User.findById(userId);
            const balanceAfter = userAfter?.balance || 0;
            console.log(`💰 Balance After: ${balanceAfter}`);
            console.log(`💰 Balance Change: ${balanceAfter - balanceBefore}`);
            console.log(`💰 ===========================================\n`);
        } else {
            console.log(`💰 No user ID found, skipping balance update`);
            console.log(`💰 ===========================================\n`);
        }
        }
        
        // ✅ REMOVED: Team restriction creation code - feature disabled
            } else {
                console.log(`\n🔍 STEP 6 SKIPPED: Database update disabled for combination bet leg`);
            }
            
            // Get the updated result after transaction (only if database was updated)
            let updateResult = null;
            if (updateDatabase) {
                try {
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
                } catch (dbError) {
                    console.error(`❌ DATABASE UPDATE ERROR:`, dbError.message);
                    console.error(`📋 Database error details:`, dbError.stack);
                    // Don't let database errors affect the overall bet processing result
                    // The bet outcome calculation was successful, so we can still return success
                    console.log(`⚠️ Database update failed, but bet outcome calculation was successful`);
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
            // Use the original bet ID from the adapter
            const betId = bet._originalBet?.id || bet._id;
            console.log(`🔧 [CANCEL BET] Attempting to cancel bet ${betId}`);
            console.log(`🔧 [CANCEL BET] Bet status before update: ${bet.status}`);
            
            // Fetch existing bet to preserve existing result fields
            const existingBet = await Bet.findById(betId);
            const existingResult = existingBet?.result || {};
            
            const updateResult = await Bet.findByIdAndUpdate(
                betId,
                {
                    $set: {
                        status: 'cancelled',
                        payout: 0,
                        profit: 0,
                        result: {
                            ...existingResult, // Preserve existing result fields
                            cancellationCode: cancellationCode,
                            reason: reason || existingResult.reason || 'Bet cancelled due to validation failure or processing error',
                            processedAt: new Date(),
                            debugInfo: debugInfo
                        },
                        updatedAt: new Date()
                    }
                },
                { new: true, runValidators: true }
            );

            console.log(`🔧 [CANCEL BET] Update result:`, updateResult ? 'SUCCESS' : 'FAILED');
            console.log(`🔧 [CANCEL BET] Updated bet status: ${updateResult?.status}`);
            console.log(`🔧 [CANCEL BET] Updated bet reason: ${updateResult?.result?.reason}`);
            
            return { updated: !!updateResult };
        } catch (error) {
            console.error(`❌ [CANCEL BET] Error cancelling bet ${bet._id}:`, error);
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
                skipped: 0, // Track skipped bets (match not finished)
                details: [],
                onlyFinished: onlyFinished
            };

            console.log(`Processing ${pendingBets.length} bets (finished matches only: ${onlyFinished})`);
            // console.log("*************aaaaaaaaaaaaa",pendingBets);
            for (const bet of pendingBets) {
                let result;
                
                // Wrap each bet processing in try-catch to prevent one bet's error from stopping all bets
                try {
                    result = await this.processBet(bet);
                } catch (betError) {
                    console.error(`❌ Error processing bet ${bet._id}:`, betError.message);
                    console.error(`📋 Bet error stack:`, betError.stack);
                    
                    // Create error result so we can continue processing other bets
                    result = {
                        success: false,
                        error: betError.message,
                        outcome: {
                            status: 'pending',
                            reason: `Processing error: ${betError.message}`
                        }
                    };
                }

                if (result.success) {
                    // Check if bet was skipped (match not finished)
                    if (result.skipped === true) {
                        results.skipped++;
                        console.log(`⏭️ Bet ${bet._id} skipped - match not finished yet`);
                    } else {
                    results.processed++;
                    if (result.outcome.status === 'won') results.won++;
                    else if (result.outcome.status === 'lost') results.lost++;
                    else if (result.outcome.status === 'void') results.void++;
                    }
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

            // Find all regular time/full time market bets
            const regularTimeMarketNames = ['Match (regular time)', 'Full Time', 'Match Regular Time'];
            const pendingBets = await this.db.collection('bets').find({
                status: 'pending',
                marketName: { $in: regularTimeMarketNames }
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
        // 🐛 BREAKPOINT: Start of bet processing - Live matches details extraction
        console.log(`🐛 [BREAKPOINT] ===== START: Processing bet with match ID =====`);
        console.log(`🐛 [BREAKPOINT] Bet ID: ${bet._id || bet.id || 'N/A'}`);
        console.log(`🐛 [BREAKPOINT] FotMob Match ID: ${fotmobMatchId}`);
        console.log(`\n🔍 ===== PROCESSING BET WITH MATCH ID ${bet._id} =====`);
        // Implementation similar to processBet but with specific match ID
        // console.log("****************ccccccccccccccccccccccccccccc******************",bet);
        return this.processBet(bet, updateDatabase);
    }

    /**
     * Cancel unsupported market types
     */
    async cancelUnsupportedMarkets() {
        try {
            // Exclude all regular time/full time market variations
            const regularTimeMarketNames = ['Match (regular time)', 'Full Time', 'Match Regular Time'];
            const unsupportedBets = await this.db.collection('bets').find({
                status: 'pending',
                marketName: { $nin: regularTimeMarketNames }
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
            const cacheFile = path.join(__dirname, '../storage/fotmob', `fotmob_matches_${dateStr}_${date.toISOString().slice(0, 10)}.json`);

            if (!forceRefresh && fs.existsSync(cacheFile)) {
                console.log(`📊 Loading cached Fotmob data for ${dateStr}`);
                return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            }

            console.log(`📡 Fetching fresh Fotmob data for ${dateStr}`);
            // Create a fresh Fotmob instance to avoid state corruption
            const fotmob = new Fotmob();
            const data = await fotmob.getMatchesByDate(dateStr);

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
        const cacheFile = path.join(__dirname, '../storage/fotmob/fotmob_multiday_cache.json');

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

export default BetOutcomeCalculator;

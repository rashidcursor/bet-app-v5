import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
// ✅ REMOVED: Cloudinary - using local files only for testing
// import { v2 as cloudinary } from 'cloudinary';
// import { downloadLeagueMappingClean } from '../utils/cloudinaryCsvLoader.js';
import { normalizeTeamName, calculateNameSimilarity } from '../unibet-calc/utils/fotmob-helpers.js';
import { waitForRateLimit } from '../utils/geminiRateLimiter.js';
import LeagueMapping from '../models/LeagueMapping.js';
import FailedLeagueMappingAttempt from '../models/FailedLeagueMappingAttempt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LeagueMappingAutoUpdate {
    constructor() {
        // ✅ REMOVED: clientCsvPath - No longer needed, frontend uses backend API
        this.serverCsvPath = path.join(__dirname, '../unibet-calc/league_mapping_clean.csv');
        this.urlsCsvPath = path.join(__dirname, '../unibet-calc/league_mapping_with_urls.csv');
        this.tempDir = path.join(__dirname, '../temp'); // ✅ NEW: Temp directory for debug files
        
        // ✅ Helper function to get PKT timestamp string
        this.getPKTTimeString = () => {
            const now = new Date();
            const pktTime = now.toLocaleString("en-US", { 
                timeZone: "Asia/Karachi",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            // Format: "01/13/2026, 02:39:20" -> "2026-01-13T02:39:20+05:00 (PKT)"
            const [datePart, timePart] = pktTime.split(', ');
            const [month, day, year] = datePart.split('/');
            return `${year}-${month}-${day}T${timePart}+05:00 (PKT)`;
        };
        
        // ✅ Create temp directory if it doesn't exist
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
            console.log(`[LeagueMapping] 📁 Created temp directory: ${this.tempDir}`);
        }
        
        // ✅ Add path verification logging
        console.log('[LeagueMapping] 📁 File paths initialized:');
        console.log(`[LeagueMapping]   - Server CSV: ${this.serverCsvPath}`);
        console.log(`[LeagueMapping]   - URLs CSV: ${this.urlsCsvPath}`);
        console.log(`[LeagueMapping]   - Temp Dir: ${this.tempDir}`);
        console.log(`[LeagueMapping]   - URLs CSV exists: ${fs.existsSync(this.urlsCsvPath)}`);
        console.log(`[LeagueMapping]   - Current working directory: ${process.cwd()}`);
        console.log(`[LeagueMapping]   - __dirname: ${__dirname}`);
        
        this.existingMappings = new Map(); // Key: Unibet_ID, Value: mapping object
        this.existingFotmobIds = new Set(); // Track all Fotmob IDs already mapped
        this.newMappings = []; // Store new mappings to add
    }

    /**
     * Load existing mappings from local CSV file
     */
    async loadExistingMappings() {
        console.log('[LeagueMapping] Loading existing mappings from local CSV file...');
        
        try {
            // ✅ CHANGED: Read directly from local file (no Cloudinary)
            if (!fs.existsSync(this.serverCsvPath)) {
                console.warn(`[LeagueMapping] ⚠️ CSV file not found: ${this.serverCsvPath}`);
                return;
            }
            
            const csvContent = fs.readFileSync(this.serverCsvPath, 'utf-8');
            const lines = csvContent.split('\n').slice(1); // Skip header

            this.existingMappings.clear();
            this.existingFotmobIds.clear();
            
            // Track duplicates for reporting
            const duplicateUnibetIds = new Set();
            const duplicateFotmobIds = new Set();
            const seenUnibetIds = new Set();
            const seenFotmobIds = new Map(); // Map<fotmobId, unibetId> to track which Unibet ID mapped to this Fotmob ID

            for (const line of lines) {
                if (!line.trim() || line.startsWith(',')) continue; // Skip empty lines
                
                const [unibetId, unibetName, fotmobId, fotmobName, matchType, country] = 
                    line.split(',').map(s => s.trim().replace(/"/g, ''));

                if (unibetId && fotmobId) {
                    // Normalize IDs to strings for consistent comparison
                    const unibetIdStr = String(unibetId);
                    const fotmobIdStr = String(fotmobId);
                    
                    // ✅ Check for duplicate Unibet IDs
                    if (seenUnibetIds.has(unibetIdStr)) {
                        duplicateUnibetIds.add(unibetIdStr);
                        console.warn(`[LeagueMapping] ⚠️ Duplicate Unibet ID found in CSV: ${unibetIdStr} (${unibetName}) - skipping duplicate entry`);
                        continue; // Skip duplicate, keep first occurrence
                    }
                    seenUnibetIds.add(unibetIdStr);
                    
                    // ✅ Check for duplicate Fotmob IDs (same Fotmob ID mapped to different Unibet IDs)
                    if (seenFotmobIds.has(fotmobIdStr)) {
                        const existingUnibetId = seenFotmobIds.get(fotmobIdStr);
                        duplicateFotmobIds.add(fotmobIdStr);
                        console.warn(`[LeagueMapping] ⚠️ Duplicate Fotmob ID found in CSV: ${fotmobIdStr} (${fotmobName}) - already mapped to Unibet ID ${existingUnibetId}, now also mapped to ${unibetIdStr} - keeping first mapping`);
                        continue; // Skip duplicate, keep first occurrence
                    }
                    seenFotmobIds.set(fotmobIdStr, unibetIdStr);
                    
                    this.existingMappings.set(unibetIdStr, {
                        unibetId: unibetIdStr,
                        unibetName,
                        fotmobId: fotmobIdStr,
                        fotmobName,
                        matchType,
                        country
                    });
                    // ✅ REMOVED: Track Fotmob ID - Now allow multiple Unibet IDs per Fotmob ID
                }
            }
            
            // Report duplicates found
            if (duplicateUnibetIds.size > 0) {
                console.warn(`[LeagueMapping] ⚠️ Found ${duplicateUnibetIds.size} duplicate Unibet ID(s) in CSV: ${Array.from(duplicateUnibetIds).join(', ')}`);
            }
            if (duplicateFotmobIds.size > 0) {
                console.warn(`[LeagueMapping] ⚠️ Found ${duplicateFotmobIds.size} duplicate Fotmob ID(s) in CSV: ${Array.from(duplicateFotmobIds).join(', ')}`);
            }

            console.log(`[LeagueMapping] Loaded ${this.existingMappings.size} existing mappings`);
        } catch (error) {
            console.error('[LeagueMapping] Error loading existing mappings:', error);
        }
    }

    /**
     * Extract league ID and info from Unibet path array
     * Path structure: [Soccer, Country, League] - we need League (not Soccer, not Country)
     */
    extractLeagueFromPath(pathArray) {
        if (!pathArray || !Array.isArray(pathArray) || pathArray.length < 2) {
            return null;
        }

        // Find league (not soccer/football, not country)
        // Usually it's the last entry, but verify it's not "Soccer" or "Football"
        for (let i = pathArray.length - 1; i >= 0; i--) {
            const item = pathArray[i];
            const termKey = (item.termKey || '').toLowerCase();
            const name = (item.name || '').toLowerCase();
            
            // Skip if it's soccer/football
            if (termKey === 'football' || termKey === 'soccer' || 
                name === 'soccer' || name === 'football') {
                continue;
            }
            
            // This should be the league
            return {
                id: item.id,
                name: item.name,
                englishName: item.englishName || item.name,
                termKey: item.termKey
            };
        }

        // Fallback: return second last if exists (usually country is last, league is second last)
        if (pathArray.length >= 2) {
            const item = pathArray[pathArray.length - 2];
            return {
                id: item.id,
                name: item.name,
                englishName: item.englishName || item.name,
                termKey: item.termKey
            };
        }

        return null;
    }

    /**
     * Extract country from Unibet path array
     * For international leagues, path is: [Football, League] (no country) - only 2 entries
     * For country leagues, path is: [Football, Country, League] - 3+ entries
     */
    extractCountryFromPath(pathArray) {
        if (!pathArray || !Array.isArray(pathArray)) return null;
        
        // ✅ SIMPLE FIX: If path has only 2 entries total (Football + League), it's international
        // If path has 3+ entries (Football + Country + League), first non-football is country
        if (pathArray.length === 2) {
            // Only Football and League - no country = International
            return 'International';
        }
        
        // For 3+ entries, first non-football entry is usually the country
        for (const item of pathArray) {
            const termKey = (item.termKey || '').toLowerCase();
            // Skip soccer/football
            if (termKey === 'football' || termKey === 'soccer') continue;
            // First non-soccer entry is usually country
            return item.name;
        }
        
        return null;
    }

    /**
     * Fetch Unibet matches for a specific date
     */
    async fetchUnibetMatches(dateStr) {
        console.log(`[LeagueMapping] Fetching Unibet matches for date: ${dateStr}`);
        const fetchStartTime = Date.now();
        
        try {
            // Use the Unibet API endpoint
            const url = `https://www.unibet.com.au/sportsbook-feeds/views/filter/football/all/matches?includeParticipants=true&useCombined=true&ncid=${Date.now()}`;
            
            console.log(`[LeagueMapping] 🔗 Unibet API URL: ${url}`);
            console.log(`[LeagueMapping] ⏳ Starting Unibet API request (timeout: 30s)...`);
            
            const headers = {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'referer': 'https://www.unibet.com.au/betting/sports/filter/football/all/matches',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            };

            const response = await axios.get(url, { 
                headers, 
                timeout: 30000,
                validateStatus: () => true // Don't throw on non-200
            });
            
            const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
            console.log(`[LeagueMapping] ✅ Unibet API response received (${fetchDuration}s)`);
            console.log(`[LeagueMapping] 📊 Response status: ${response.status}`);
            
            if (response.status !== 200) {
                throw new Error(`Unibet API returned status ${response.status}: ${response.statusText}`);
            }
            
            const data = response.data;
            console.log(`[LeagueMapping] 📦 Response data received, processing...`);

            // Extract matches from the response structure
            // Structure: layout.sections[].widgets[].matches.groups[].subGroups[].events[].event
            const leaguesMap = new Map(); // Group by league

            const extractFromWidgets = (widgets) => {
                if (!Array.isArray(widgets)) return;

                for (const widget of widgets) {
                    if (widget.matches && widget.matches.groups) {
                        extractFromGroups(widget.matches.groups);
                    }
                }
            };

            const extractFromGroups = (groups) => {
                if (!Array.isArray(groups)) return;

                for (const group of groups) {
                    // Check if group has events directly
                    if (group.events && Array.isArray(group.events)) {
                        extractFromEvents(group.events);
                    }

                    // Check subGroups
                    if (group.subGroups && Array.isArray(group.subGroups)) {
                        for (const subGroup of group.subGroups) {
                            if (subGroup.events && Array.isArray(subGroup.events)) {
                                extractFromEvents(subGroup.events);
                            }
                        }
                    }
                }
            };

            const extractFromEvents = (events) => {
                if (!Array.isArray(events)) return;

                for (const eventObj of events) {
                    if (eventObj.event && eventObj.event.path) {
                        const league = this.extractLeagueFromPath(eventObj.event.path);
                        if (league) {
                            const leagueId = String(league.id);
                            
                            if (!leaguesMap.has(leagueId)) {
                                leaguesMap.set(leagueId, {
                                    id: leagueId,
                                    name: league.name,
                                    englishName: league.englishName,
                                    country: this.extractCountryFromPath(eventObj.event.path),
                                    matches: []
                                });
                            }

                            leaguesMap.get(leagueId).matches.push({
                                eventId: eventObj.event.id,
                                homeName: eventObj.event.homeName,
                                awayName: eventObj.event.awayName,
                                start: eventObj.event.start,
                                path: eventObj.event.path
                            });
                        }
                    }
                }
            };

            // Navigate through the response structure
            if (data.layout && data.layout.sections) {
                for (const section of data.layout.sections) {
                    if (section.widgets) {
                        extractFromWidgets(section.widgets);
                    }
                }
            }

            const processDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
            console.log(`[LeagueMapping] ✅ Found ${leaguesMap.size} unique leagues in Unibet data (total time: ${processDuration}s)`);
            return Array.from(leaguesMap.values());
        } catch (error) {
            const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
            console.error('[LeagueMapping] ========================================');
            console.error('[LeagueMapping] ❌ ERROR fetching Unibet matches');
            console.error('[LeagueMapping] ========================================');
            console.error(`[LeagueMapping] ⏱️  Failed after: ${fetchDuration} seconds`);
            console.error(`[LeagueMapping] Error name: ${error.name}`);
            console.error(`[LeagueMapping] Error message: ${error.message}`);
            if (error.code) {
                console.error(`[LeagueMapping] Error code: ${error.code}`);
            }
            if (error.response) {
                console.error(`[LeagueMapping] Response status: ${error.response.status}`);
                console.error(`[LeagueMapping] Response data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
            }
            if (error.stack) {
                console.error(`[LeagueMapping] Stack trace: ${error.stack}`);
            }
            console.error('[LeagueMapping] ========================================');
            throw error;
        }
    }

    /**
     * Fetch Fotmob matches for a specific date
     */
    async fetchFotmobMatches(dateStr) {
        console.log(`[LeagueMapping] Fetching Fotmob matches for date: ${dateStr}`);
        
        try {
            const timezone = 'Asia/Karachi';
            const ccode3 = 'PAK';
            const apiUrl = `https://www.fotmob.com/api/data/matches?date=${dateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;

            // Get x-mas token (required for authentication)
            let xmasToken = null;
            try {
                console.log(`[LeagueMapping] 🔑 Attempting to fetch x-mas token...`);
                const xmasResponse = await Promise.race([
                    axios.get('http://46.101.91.154:6006/', { timeout: 5000 }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('x-mas token fetch timeout')), 8000))
                ]);
                xmasToken = xmasResponse.data?.['x-mas'];
                if (xmasToken) {
                    console.log(`[LeagueMapping] ✅ Got x-mas token`);
                } else {
                    console.warn(`[LeagueMapping] ⚠️ x-mas token response missing token`);
                }
            } catch (xmasError) {
                console.warn(`[LeagueMapping] ⚠️ Could not get x-mas token (${xmasError.message}), trying without it...`);
            }

            const headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.fotmob.com/'
            };

            if (xmasToken) {
                headers['x-mas'] = xmasToken;
            }

            const response = await axios.get(apiUrl, { headers, timeout: 30000 });
            const data = response.data;

            if (!data.leagues || !Array.isArray(data.leagues)) {
                throw new Error('Invalid Fotmob response format');
            }

            // ✅ DETAILED LOGGING: Analyze the API response
            console.log(`[LeagueMapping] 📥 FotMob API Response Analysis:`);
            console.log(`[LeagueMapping]   - Date requested: ${dateStr}`);
            console.log(`[LeagueMapping]   - API URL: ${apiUrl}`);
            console.log(`[LeagueMapping]   - Response status: ${response.status}`);
            console.log(`[LeagueMapping]   - Total leagues in API response: ${data.leagues.length}`);
            
            // Count leagues with and without matches
            const leaguesWithMatches = data.leagues.filter(l => l.matches && Array.isArray(l.matches) && l.matches.length > 0).length;
            const leaguesWithoutMatches = data.leagues.filter(l => !l.matches || !Array.isArray(l.matches) || l.matches.length === 0).length;
            console.log(`[LeagueMapping]   - Leagues WITH matches: ${leaguesWithMatches}`);
            console.log(`[LeagueMapping]   - Leagues WITHOUT matches: ${leaguesWithoutMatches}`);
            
            // Count groups vs regular leagues
            const groupLeagues = data.leagues.filter(l => l.isGroup === true).length;
            const regularLeagues = data.leagues.filter(l => !l.isGroup).length;
            console.log(`[LeagueMapping]   - Group leagues: ${groupLeagues}`);
            console.log(`[LeagueMapping]   - Regular leagues: ${regularLeagues}`);
            
            // Log first 10 league names for verification
            console.log(`[LeagueMapping] 📋 First 10 leagues from API:`);
            data.leagues.slice(0, 10).forEach((l, i) => {
                const name = l.name || l.parentLeagueName || 'Unknown';
                const matchCount = (l.matches && Array.isArray(l.matches)) ? l.matches.length : 0;
                const isGroup = l.isGroup ? ' (GROUP)' : '';
                console.log(`[LeagueMapping]   ${i + 1}. "${name}"${isGroup} (${l.ccode || 'N/A'}) - ${matchCount} matches`);
            });
            
            // ✅ NEW: Filter matches - only include non-finished matches from TODAY
            // ✅ STRICT: Exclude Esports and Club Friendly Matches
            const filteredLeagues = data.leagues
                .filter(league => {
                    // ✅ STRICT: Filter out Esports leagues
                    const leagueName = (league.name || '').toLowerCase();
                    if (leagueName.includes('esports') || leagueName.includes('esport')) {
                        console.log(`[LeagueMapping] ⏭️ Skipping Esports league from Fotmob: ${league.name}`);
                        return false;
                    }
                    
                    // ✅ STRICT: Filter out Club Friendly Matches
                    if (leagueName.includes('club friendly') || leagueName.includes('club friendly matches')) {
                        console.log(`[LeagueMapping] ⏭️ Skipping Club Friendly Matches league from Fotmob: ${league.name}`);
                        return false;
                    }
                    
                    return true;
                })
                .map(league => {
                    if (!league.matches || !Array.isArray(league.matches)) {
                        return league;
                    }
                    
                    const filteredMatches = league.matches.filter(match => {
                        const status = match.status || {};
                        const isNotFinished = status.finished === false;
                        const isNotStarted = status.started === false;
                        
                        // ✅ NEW: Verify match date is today (not tomorrow)
                        const matchTimeUTC = new Date(match.status?.utcTime || match.timeTS);
                        const matchTimePKT = new Date(matchTimeUTC.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
                        const matchDateStr = `${matchTimePKT.getFullYear()}${String(matchTimePKT.getMonth() + 1).padStart(2, '0')}${String(matchTimePKT.getDate()).padStart(2, '0')}`;
                        const isTodayDate = matchDateStr === dateStr;
                        
                        return isNotFinished && isNotStarted && isTodayDate;
                    });
                    
                    return {
                        ...league,
                        matches: filteredMatches
                    };
                }).filter(league => league.matches && league.matches.length > 0);
            
            console.log(`[LeagueMapping] ✅ Filtered to ${filteredLeagues.length} leagues with non-finished matches (from ${data.leagues.length} total leagues)`);
            
            // ✅ NEW: Save filtered response to temp file for debugging
            try {
                const tempFilePath = path.join(this.tempDir, `fotmob_filtered_${dateStr}.json`);
                await fs.promises.writeFile(tempFilePath, JSON.stringify({
                    date: dateStr,
                    timestamp: this.getPKTTimeString(), // ✅ FIX: Use PKT time instead of UTC
                    totalLeagues: data.leagues.length,
                    filteredLeagues: filteredLeagues.length,
                    leagues: filteredLeagues
                }, null, 2));
                console.log(`[LeagueMapping] 💾 Saved filtered Fotmob response to: ${tempFilePath}`);
            } catch (saveError) {
                console.warn(`[LeagueMapping] ⚠️ Failed to save temp file:`, saveError.message);
            }
            
            return filteredLeagues;
        } catch (error) {
            console.error('[LeagueMapping] Error fetching Fotmob matches:', error.message);
            throw error;
        }
    }

    /**
     * Fetch Fotmob matches for tomorrow (next day) - COMPLETE DAY
     * ✅ FIX: Changed from 12-hour filter to complete day
     */
    async fetchFotmobMatchesTomorrow(dateStr) {
        console.log(`[LeagueMapping] Fetching Fotmob matches for TOMORROW (complete day)...`);
        
        try {
            // Calculate tomorrow's date
            const today = new Date();
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
            const day = parseInt(dateStr.substring(6, 8));
            const todayDate = new Date(year, month, day);
            const tomorrowDate = new Date(todayDate);
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            
            const tomorrowYear = tomorrowDate.getFullYear();
            const tomorrowMonth = String(tomorrowDate.getMonth() + 1).padStart(2, '0');
            const tomorrowDay = String(tomorrowDate.getDate()).padStart(2, '0');
            const tomorrowDateStr = `${tomorrowYear}${tomorrowMonth}${tomorrowDay}`;
            
            console.log(`[LeagueMapping] 📅 Tomorrow's date: ${tomorrowDateStr}`);
            
            const timezone = 'Asia/Karachi';
            const ccode3 = 'PAK';
            const apiUrl = `https://www.fotmob.com/api/data/matches?date=${tomorrowDateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;

            // Get x-mas token (required for authentication)
            let xmasToken = null;
            try {
                console.log(`[LeagueMapping] 🔑 Attempting to fetch x-mas token for tomorrow...`);
                const xmasResponse = await Promise.race([
                    axios.get('http://46.101.91.154:6006/', { timeout: 5000 }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('x-mas token fetch timeout')), 8000))
                ]);
                xmasToken = xmasResponse.data?.['x-mas'];
                if (xmasToken) {
                    console.log(`[LeagueMapping] ✅ Got x-mas token for tomorrow`);
                } else {
                    console.warn(`[LeagueMapping] ⚠️ x-mas token response missing token`);
                }
            } catch (xmasError) {
                console.warn(`[LeagueMapping] ⚠️ Could not get x-mas token (${xmasError.message}), trying without it...`);
            }

            const headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.fotmob.com/'
            };

            if (xmasToken) {
                headers['x-mas'] = xmasToken;
            }

            const response = await axios.get(apiUrl, { headers, timeout: 30000 });
            const data = response.data;

            if (!data.leagues || !Array.isArray(data.leagues)) {
                console.warn(`[LeagueMapping] ⚠️ Invalid Fotmob response format for tomorrow`);
                return [];
            }

            console.log(`[LeagueMapping] 📥 FotMob Tomorrow API Response:`);
            console.log(`[LeagueMapping]   - Tomorrow date: ${tomorrowDateStr}`);
            console.log(`[LeagueMapping]   - Total leagues: ${data.leagues.length}`);
            
            // ✅ FIX: Filter matches - only include non-finished matches from TOMORROW (complete day)
            // ✅ STRICT: Exclude Esports and Club Friendly Matches
            const filteredLeagues = data.leagues
                .filter(league => {
                    // ✅ STRICT: Filter out Esports leagues
                    const leagueName = (league.name || '').toLowerCase();
                    if (leagueName.includes('esports') || leagueName.includes('esport')) {
                        console.log(`[LeagueMapping] ⏭️ Skipping Esports league from Fotmob (tomorrow): ${league.name}`);
                        return false;
                    }
                    
                    // ✅ STRICT: Filter out Club Friendly Matches
                    if (leagueName.includes('club friendly') || leagueName.includes('club friendly matches')) {
                        console.log(`[LeagueMapping] ⏭️ Skipping Club Friendly Matches league from Fotmob (tomorrow): ${league.name}`);
                        return false;
                    }
                    
                    return true;
                })
                .map(league => {
                    if (!league.matches || !Array.isArray(league.matches)) {
                        return league;
                    }
                    
                    const filteredMatches = league.matches.filter(match => {
                        // Check status
                        const status = match.status || {};
                        const isNotFinished = status.finished === false;
                        const isNotStarted = status.started === false;
                        
                        if (!isNotFinished || !isNotStarted) {
                            return false;
                        }
                        
                        // ✅ FIX: Verify match date is tomorrow (complete day, not just 12 hours)
                        const matchTimeUTC = new Date(match.status?.utcTime || match.timeTS);
                        const matchDatePKT = new Date(matchTimeUTC.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
                        const matchDateStr = `${matchDatePKT.getFullYear()}${String(matchDatePKT.getMonth() + 1).padStart(2, '0')}${String(matchDatePKT.getDate()).padStart(2, '0')}`;
                        const isTomorrowDate = matchDateStr === tomorrowDateStr;
                        
                        return isTomorrowDate;
                    });
                    
                    return {
                        ...league,
                        matches: filteredMatches
                    };
                }).filter(league => league.matches && league.matches.length > 0);
            
            console.log(`[LeagueMapping] ✅ Filtered to ${filteredLeagues.length} leagues with matches for tomorrow (complete day, non-finished matches only)`);
            
            // ✅ NEW: Save filtered response to temp file for debugging
            try {
                const tempFilePath = path.join(this.tempDir, `fotmob_filtered_tomorrow_${tomorrowDateStr}.json`);
                await fs.promises.writeFile(tempFilePath, JSON.stringify({
                    date: tomorrowDateStr,
                    timestamp: this.getPKTTimeString(),
                    description: "Tomorrow's complete day (all matches, non-finished only)",
                    totalLeagues: data.leagues.length,
                    filteredLeagues: filteredLeagues.length,
                    leagues: filteredLeagues
                }, null, 2));
                console.log(`[LeagueMapping] 💾 Saved filtered Fotmob tomorrow response to: ${tempFilePath}`);
            } catch (saveError) {
                console.warn(`[LeagueMapping] ⚠️ Failed to save temp file:`, saveError.message);
            }
            
            return filteredLeagues;
        } catch (error) {
            console.error('[LeagueMapping] Error fetching Fotmob matches for tomorrow:', error.message);
            // Don't throw - return empty array if tomorrow fetch fails
            return [];
        }
    }

    /**
     * Fetch Fotmob matches for day after tomorrow (first 12 hours only)
     * ✅ NEW: Added to fetch day after tomorrow's matches for better league mapping
     */
    async fetchFotmobMatchesDayAfterTomorrow(dateStr) {
        console.log(`[LeagueMapping] Fetching Fotmob matches for DAY AFTER TOMORROW (12hr filter)...`);
        
        try {
            // Calculate day after tomorrow's date
            const today = new Date();
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
            const day = parseInt(dateStr.substring(6, 8));
            const todayDate = new Date(year, month, day);
            const dayAfterDate = new Date(todayDate);
            dayAfterDate.setDate(dayAfterDate.getDate() + 2); // +2 for day after tomorrow
            
            const dayAfterYear = dayAfterDate.getFullYear();
            const dayAfterMonth = String(dayAfterDate.getMonth() + 1).padStart(2, '0');
            const dayAfterDay = String(dayAfterDate.getDate()).padStart(2, '0');
            const dayAfterDateStr = `${dayAfterYear}${dayAfterMonth}${dayAfterDay}`;
            
            console.log(`[LeagueMapping] 📅 Day after tomorrow's date: ${dayAfterDateStr}`);
            
            const timezone = 'Asia/Karachi';
            const ccode3 = 'PAK';
            const apiUrl = `https://www.fotmob.com/api/data/matches?date=${dayAfterDateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;

            // Get x-mas token (required for authentication)
            let xmasToken = null;
            try {
                console.log(`[LeagueMapping] 🔑 Attempting to fetch x-mas token for day after tomorrow...`);
                const xmasResponse = await Promise.race([
                    axios.get('http://46.101.91.154:6006/', { timeout: 5000 }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('x-mas token fetch timeout')), 8000))
                ]);
                xmasToken = xmasResponse.data?.['x-mas'];
                if (xmasToken) {
                    console.log(`[LeagueMapping] ✅ Got x-mas token for day after tomorrow`);
                } else {
                    console.warn(`[LeagueMapping] ⚠️ x-mas token response missing token`);
                }
            } catch (xmasError) {
                console.warn(`[LeagueMapping] ⚠️ Could not get x-mas token (${xmasError.message}), trying without it...`);
            }

            const headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.fotmob.com/'
            };

            if (xmasToken) {
                headers['x-mas'] = xmasToken;
            }

            const response = await axios.get(apiUrl, { headers, timeout: 30000 });
            const data = response.data;

            if (!data.leagues || !Array.isArray(data.leagues)) {
                console.warn(`[LeagueMapping] ⚠️ Invalid Fotmob response format for day after tomorrow`);
                return [];
            }

            console.log(`[LeagueMapping] 📥 FotMob Day After Tomorrow API Response:`);
            console.log(`[LeagueMapping]   - Day after tomorrow date: ${dayAfterDateStr}`);
            console.log(`[LeagueMapping]   - Total leagues: ${data.leagues.length}`);
            
            // ✅ Calculate day after tomorrow's first 12 hours (00:01 AM to 12:01 PM PKT)
            const dayAfterStartPKTStr = `${dayAfterYear}-${dayAfterMonth}-${dayAfterDay}T00:01:00+05:00`;
            const dayAfterStartPKT = new Date(dayAfterStartPKTStr);
            
            const dayAfterEndPKTStr = `${dayAfterYear}-${dayAfterMonth}-${dayAfterDay}T12:01:00+05:00`;
            const dayAfterEndPKT = new Date(dayAfterEndPKTStr);
            
            const startTimeStr = dayAfterStartPKT.toLocaleString("en-US", { 
                timeZone: "Asia/Karachi",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            const endTimeStr = dayAfterEndPKT.toLocaleString("en-US", { 
                timeZone: "Asia/Karachi",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            console.log(`[LeagueMapping] ⏰ Day after tomorrow's window: ${startTimeStr} to ${endTimeStr} PKT`);
            
            // ✅ Filter matches - only include matches within day after tomorrow's first 12 hours (00:01 AM to 12:01 PM PKT)
            // ✅ STRICT: Exclude Esports and Club Friendly Matches
            const filteredLeagues = data.leagues
                .filter(league => {
                    // ✅ STRICT: Filter out Esports leagues
                    const leagueName = (league.name || '').toLowerCase();
                    if (leagueName.includes('esports') || leagueName.includes('esport')) {
                        console.log(`[LeagueMapping] ⏭️ Skipping Esports league from Fotmob (day after tomorrow): ${league.name}`);
                        return false;
                    }
                    
                    // ✅ STRICT: Filter out Club Friendly Matches
                    if (leagueName.includes('club friendly') || leagueName.includes('club friendly matches')) {
                        console.log(`[LeagueMapping] ⏭️ Skipping Club Friendly Matches league from Fotmob (day after tomorrow): ${league.name}`);
                        return false;
                    }
                    
                    return true;
                })
                .map(league => {
                    if (!league.matches || !Array.isArray(league.matches)) {
                        return league;
                    }
                    
                    const filteredMatches = league.matches.filter(match => {
                        // Check status
                        const status = match.status || {};
                        const isNotFinished = status.finished === false;
                        const isNotStarted = status.started === false;
                        
                        if (!isNotFinished || !isNotStarted) {
                            return false;
                        }
                        
                        // ✅ Check if match time is within day after tomorrow's first 12 hours (00:01 AM to 12:01 PM PKT)
                        const matchTimeUTC = new Date(match.status?.utcTime || match.timeTS);
                        
                        // Match should be >= day after tomorrow 00:01 AM PKT and <= day after tomorrow 12:01 PM PKT
                        const isWithinDayAfterFirst12Hours = matchTimeUTC >= dayAfterStartPKT && matchTimeUTC <= dayAfterEndPKT;
                        
                        return isWithinDayAfterFirst12Hours;
                    });
                    
                    return {
                        ...league,
                        matches: filteredMatches
                    };
                }).filter(league => league.matches && league.matches.length > 0);
            
            console.log(`[LeagueMapping] ✅ Filtered to ${filteredLeagues.length} leagues with matches within day after tomorrow's first 12 hours (00:01 AM to 12:01 PM PKT)`);
            
            // ✅ NEW: Save filtered response to temp file for debugging
            try {
                const tempFilePath = path.join(this.tempDir, `fotmob_filtered_dayafter_${dayAfterDateStr}.json`);
                await fs.promises.writeFile(tempFilePath, JSON.stringify({
                    date: dayAfterDateStr,
                    timestamp: this.getPKTTimeString(),
                    window: {
                        start: dayAfterStartPKT.toISOString(),
                        end: dayAfterEndPKT.toISOString(),
                        startStr: startTimeStr,
                        endStr: endTimeStr,
                        description: "Day after tomorrow's first 12 hours (00:01 AM to 12:01 PM PKT)"
                    },
                    totalLeagues: data.leagues.length,
                    filteredLeagues: filteredLeagues.length,
                    leagues: filteredLeagues
                }, null, 2));
                console.log(`[LeagueMapping] 💾 Saved filtered Fotmob day after tomorrow response to: ${tempFilePath}`);
            } catch (saveError) {
                console.warn(`[LeagueMapping] ⚠️ Failed to save temp file:`, saveError.message);
            }
            
            return filteredLeagues;
        } catch (error) {
            console.error('[LeagueMapping] Error fetching Fotmob matches for day after tomorrow:', error.message);
            // Don't throw - return empty array if day after tomorrow fetch fails
            return [];
        }
    }

    /**
     * Compare countries from Unibet (country name) and Fotmob (ccode)
     * Returns true if countries match, false otherwise
     * Handles International leagues (ccode: "INT") specially
     */
    compareCountries(unibetCountry, fotmobCcode) {
        // If both are missing/empty, consider them as match (unknown countries)
        if (!unibetCountry && !fotmobCcode) return true;
        if (!unibetCountry || !fotmobCcode) return false;
        
        // Normalize both for comparison
        const unibetCountryNorm = (unibetCountry || '').toLowerCase().trim();
        const fotmobCcodeNorm = (fotmobCcode || '').toUpperCase().trim();
        
        // International leagues (Fotmob uses "INT" for international tournaments)
        // Unibet might use "International" or similar
        if (fotmobCcodeNorm === 'INT' || fotmobCcodeNorm === 'INTERNATIONAL') {
            const internationalKeywords = ['international', 'int', 'world', 'global'];
            return internationalKeywords.some(keyword => unibetCountryNorm.includes(keyword));
        }
        
        // Create a mapping from common country names to ISO codes
        // This is based on actual responses, not hardcoded
        const countryNameToCode = {
            'israel': 'ISR',
            'oman': 'OMN',
            'qatar': 'QAT',
            'saudi arabia': 'SAU',
            'egypt': 'EGY',
            'turkey': 'TUR',
            'england': 'ENG',
            'spain': 'ESP',
            'france': 'FRA',
            'germany': 'GER',
            'italy': 'ITA',
            'netherlands': 'NED',
            'portugal': 'POR',
            'brazil': 'BRA',
            'argentina': 'ARG',
            'mexico': 'MEX',
            'usa': 'USA',
            'united states': 'USA',
            'algeria': 'DZA',
            'tunisia': 'TUN',
            'morocco': 'MAR',
            'jordan': 'JOR',
            'iran': 'IRN',
            'uae': 'ARE',
            'united arab emirates': 'ARE'
        };
        
        // Check if Unibet country name maps to Fotmob code
        const expectedCode = countryNameToCode[unibetCountryNorm];
        if (expectedCode && expectedCode === fotmobCcodeNorm) {
            return true;
        }
        
        // Fallback: Check if country name contains the code or vice versa
        // This handles cases where country name might be "Israel" and code is "ISR"
        const countryNameFirst3 = unibetCountryNorm.substring(0, 3).toUpperCase();
        if (countryNameFirst3 === fotmobCcodeNorm) {
            return true;
        }
        
        // If no match found, return false (strict matching)
        return false;
    }

    /**
     * Compare two team names using existing similarity logic
     */
    compareTeamNames(name1, name2) {
        const similarity = calculateNameSimilarity(name1, name2);
        return similarity >= 0.7; // Threshold for match
    }

    /**
     * Compare both teams together (home and away)
     */
    compareTeams(unibetHome, unibetAway, fotmobHome, fotmobAway) {
        // Normal case: home matches home, away matches away
        const normalMatch = 
            this.compareTeamNames(unibetHome, fotmobHome) &&
            this.compareTeamNames(unibetAway, fotmobAway);

        // Swapped case: home matches away, away matches home
        const swappedMatch = 
            this.compareTeamNames(unibetHome, fotmobAway) &&
            this.compareTeamNames(unibetAway, fotmobHome);

        return normalMatch || swappedMatch;
    }

    /**
     * Compare match times (within tolerance)
     */
    compareTime(unibetTime, fotmobTime, toleranceMinutes = 30) {
        try {
            const unibetDate = new Date(unibetTime);
            const fotmobDate = new Date(fotmobTime);

            if (isNaN(unibetDate.getTime()) || isNaN(fotmobDate.getTime())) {
                return false;
            }

            const diffMinutes = Math.abs((unibetDate.getTime() - fotmobDate.getTime()) / (1000 * 60));
            return diffMinutes <= toleranceMinutes;
        } catch (error) {
            return false;
        }
    }

    /**
     * Find matching Fotmob league for Unibet league
     */
    findMatchingFotmobLeague(unibetLeague, fotmobLeagues) {
        console.log(`[LeagueMapping] Finding match for Unibet league: ${unibetLeague.name} (ID: ${unibetLeague.id})`);
        console.log(`[LeagueMapping]   - Unibet country: "${unibetLeague.country || '(empty)'}"`);
        console.log(`[LeagueMapping]   - Unibet englishName: "${unibetLeague.englishName || unibetLeague.name}"`);
        console.log(`[LeagueMapping]   - Unibet league has ${unibetLeague.matches?.length || 0} matches`);

        // PRIORITY 1: Exact country + league name match
        for (const fotmobLeague of fotmobLeagues) {
            const unibetCountry = unibetLeague.country || '';
            const fotmobCcode = fotmobLeague.ccode || '';
            
            // Use parentLeagueName if it's a group, otherwise use name
            const fotmobName = fotmobLeague.isGroup && fotmobLeague.parentLeagueName 
                ? fotmobLeague.parentLeagueName 
                : (fotmobLeague.name || fotmobLeague.parentLeagueName || '');
            const unibetName = unibetLeague.englishName || unibetLeague.name || '';
            
            // Normalize names for comparison
            const fotmobNameNorm = normalizeTeamName(fotmobName);
            const unibetNameNorm = normalizeTeamName(unibetName);
            
            // ✅ ROOT CAUSE FIX: Check international status first
            const isInternational = !unibetCountry || 
                                   unibetCountry.toLowerCase().includes('international') ||
                                   fotmobCcode === 'INT' ||
                                   fotmobCcode === 'INTERNATIONAL' ||
                                   !fotmobCcode;
            
            const countryMatch = this.compareCountries(unibetCountry, fotmobCcode);
            const nameMatch = fotmobNameNorm === unibetNameNorm;
            
            // Detailed logging for debugging
            if (nameMatch || fotmobNameNorm.includes('africa') || unibetNameNorm.includes('africa') || 
                fotmobNameNorm.includes('professional') || unibetNameNorm.includes('professional') ||
                fotmobNameNorm.includes('pro league') || unibetNameNorm.includes('pro league')) {
                console.log(`[LeagueMapping] 🔍 Checking: "${fotmobName}" (FotMob) vs "${unibetName}" (Unibet)`);
                console.log(`[LeagueMapping]   - Normalized: "${fotmobNameNorm}" vs "${unibetNameNorm}"`);
                console.log(`[LeagueMapping]   - Country match: ${countryMatch} (Unibet: "${unibetCountry}", FotMob: "${fotmobCcode}")`);
                console.log(`[LeagueMapping]   - Name match: ${nameMatch}`);
                console.log(`[LeagueMapping]   - Is international: ${isInternational}`);
            }
            
            // ✅ PRIORITY 1: For international leagues OR if names match exactly, accept it
            if (nameMatch && (countryMatch || isInternational)) {
                const fotmobId = String(fotmobLeague.primaryId || fotmobLeague.id);
                console.log(`[LeagueMapping] ✅ Exact name match found: ${fotmobName} (Fotmob ID: ${fotmobId}, Country: ${fotmobCcode})`);
                return {
                    id: fotmobLeague.primaryId || fotmobLeague.id,
                    name: fotmobName,
                    exactMatch: true
                };
            }
        }

        // PRIORITY 2: Match by teams + time (check ALL leagues, prioritize by score)
        console.log(`[LeagueMapping] No exact match found, trying team + time comparison...`);
        console.log(`[LeagueMapping]   - Will check ALL FotMob leagues for team+time matches`);
        
        let bestMatch = null;
        let bestMatchScore = 0;
        let checkedLeagues = 0;
        let leaguesWithMatches = 0;

        for (const fotmobLeague of fotmobLeagues) {
            const unibetCountry = unibetLeague.country || '';
            const fotmobCcode = fotmobLeague.ccode || '';
            
            // Use parentLeagueName if it's a group, otherwise use name
            const fotmobName = fotmobLeague.isGroup && fotmobLeague.parentLeagueName 
                ? fotmobLeague.parentLeagueName 
                : (fotmobLeague.name || fotmobLeague.parentLeagueName || '');
            
            if (!fotmobLeague.matches || !Array.isArray(fotmobLeague.matches) || fotmobLeague.matches.length === 0) {
                continue;
            }
            
            checkedLeagues++;
            
            // ✅ FIX: Check international status for team+time matching
            const isInternational = !unibetCountry || 
                                   unibetCountry.toLowerCase().includes('international') ||
                                   fotmobCcode === 'INT' ||
                                   fotmobCcode === 'INTERNATIONAL' ||
                                   !fotmobCcode;
            
            const countryMatch = this.compareCountries(unibetCountry, fotmobCcode);
            
            // ✅ IMPORTANT: For team+time matching, we check ALL leagues first
            // Then we'll prioritize matches with same country, but won't skip if country doesn't match
            // This allows "Professional League" (Saudi) to match "Saudi Pro League" (Saudi) via teams+time

            let matchCount = 0;
            let totalScore = 0;
            let perfectMatches = 0; // Teams + time both match
            let teamOnlyMatches = 0; // Teams match but time doesn't

            for (const fotmobMatch of fotmobLeague.matches) {
                for (const unibetMatch of unibetLeague.matches) {
                    // Compare teams
                    const teamsMatch = this.compareTeams(
                        unibetMatch.homeName,
                        unibetMatch.awayName,
                        fotmobMatch.home?.name || fotmobMatch.home?.longName,
                        fotmobMatch.away?.name || fotmobMatch.away?.longName
                    );

                    if (teamsMatch) {
                        // Compare time
                        const fotmobTime = fotmobMatch.status?.utcTime || fotmobMatch.time;
                        const timeMatch = this.compareTime(unibetMatch.start, fotmobTime);

                        if (timeMatch) {
                            matchCount++;
                            perfectMatches++;
                            totalScore += 1.0; // Perfect match (teams + time)
                        } else {
                            matchCount++;
                            teamOnlyMatches++;
                            totalScore += 0.5; // Teams match but time doesn't
                        }
                    }
                }
            }

            // Calculate match score (percentage of matches that matched)
            if (matchCount > 0) {
                leaguesWithMatches++;
                const score = totalScore / Math.max(unibetLeague.matches.length, fotmobLeague.matches.length);
                
                // ✅ PRIORITY LOGIC: 
                // - If country matches, use standard threshold (0.5)
                // - If country doesn't match BUT we have perfect matches (teams+time), still consider it
                //   but require higher threshold (0.7) to avoid false positives
                const requiredScore = (countryMatch || isInternational) ? 0.5 : 0.7;
                
                if (score > bestMatchScore && score >= requiredScore) {
                    // Additional check: if country doesn't match, require at least some perfect matches
                    if (!countryMatch && !isInternational && perfectMatches === 0) {
                        continue; // Skip if no perfect matches and country doesn't match
                    }
                    
                    bestMatchScore = score;
                    bestMatch = {
                        id: fotmobLeague.primaryId || fotmobLeague.id,
                        name: fotmobName,
                        exactMatch: false,
                        matchScore: score,
                        matchCount,
                        perfectMatches,
                        teamOnlyMatches,
                        countryMatch
                    };
                    
                    console.log(`[LeagueMapping]   📊 Found candidate: "${fotmobName}" (Score: ${score.toFixed(2)}, Perfect: ${perfectMatches}, Team-only: ${teamOnlyMatches}, Country: ${countryMatch ? '✅' : '❌'})`);
                }
            }
        }

        console.log(`[LeagueMapping]   📈 Team+Time summary: Checked ${checkedLeagues} leagues with matches, ${leaguesWithMatches} had team matches`);

        if (bestMatch) {
            console.log(`[LeagueMapping] ✅ Team+time match found: ${bestMatch.name} (Fotmob ID: ${bestMatch.id}, Score: ${bestMatch.matchScore.toFixed(2)}, Perfect matches: ${bestMatch.perfectMatches})`);
            return {
                id: bestMatch.id,
                name: bestMatch.name,
                exactMatch: false
            };
        }

        // ✅ PRIORITY 3: Gemini AI Fallback (when all other methods fail)
        console.log(`[LeagueMapping] ❌ No match found with standard methods, trying Gemini AI fallback...`);
        // Note: This will be called asynchronously from executeInternal
        return null; // Return null to trigger Gemini fallback in executeInternal
    }

    /**
     * Use Gemini AI to find matching FotMob league when all other methods fail
     * @param {Object} unibetLeague - Unibet league object with name, country, matches
     * @param {Array} fotmobLeagues - Array of FotMob league objects
     * @returns {Object|null} - { id, name } if match found, null otherwise
     */
    async findMatchingFotmobLeagueWithGemini(unibetLeague, fotmobLeagues) {
        // Get both API keys
        const geminiApiKey1 = process.env.GEMINI_API_KEY_1;
        const geminiApiKey2 = process.env.GEMINI_API_KEY_2;
        
        if (!geminiApiKey1 && !geminiApiKey2) {
            console.log(`[LeagueMapping] ⚠️ No Gemini API keys found (GEMINI_API_KEY_1 or GEMINI_API_KEY_2), skipping Gemini fallback`);
            return null;
        }

        // Helper function to check if error is quota-related
        const isQuotaError = (error) => {
            if (!error) return false;
            const errorMessage = (error.message || '').toLowerCase();
            const errorCode = error.code || error.status || error.statusCode;
            
            return (
                errorCode === 429 ||
                errorCode === 'RESOURCE_EXHAUSTED' ||
                errorMessage.includes('quota') ||
                errorMessage.includes('rate limit') ||
                errorMessage.includes('resource_exhausted')
            );
        };

        // Try with first key, then fallback to second key if quota error
        const apiKeys = [
            { key: geminiApiKey1, name: 'GEMINI_API_KEY_1' },
            { key: geminiApiKey2, name: 'GEMINI_API_KEY_2' }
        ].filter(k => k.key); // Only include keys that exist

        if (apiKeys.length === 0) {
            console.log(`[LeagueMapping] ⚠️ No valid Gemini API keys found, skipping Gemini fallback`);
            return null;
        }

        let lastError = null;

        for (let i = 0; i < apiKeys.length; i++) {
            const { key: geminiApiKey, name: keyName } = apiKeys[i];
            
            try {
                // ✅ RATE LIMIT: Wait before making Gemini API call
                await waitForRateLimit();
                
                console.log(`[LeagueMapping] 🤖 Using Gemini AI fallback (${keyName}) for: ${unibetLeague.name} (${unibetLeague.country || 'Unknown country'})`);
                
                // ✅ FIX: Filter matches - only send non-finished matches to Gemini
                // Prepare Unibet league data for Gemini
                const unibetData = {
                    leagueName: unibetLeague.englishName || unibetLeague.name,
                    country: unibetLeague.country || '',
                    matches: (unibetLeague.matches || []).map(m => ({
                        homeTeam: m.homeName,
                        awayTeam: m.awayName,
                        startTime: m.start
                    }))
                    // Note: Unibet matches are already filtered (only upcoming/live)
                };

                // ✅ FIX: Send ALL FotMob leagues (NO LIMIT) - complete API data
                // IMPORTANT: We send ALL leagues from fotmobLeagues array, not just 25 or any limited subset
                console.log(`[LeagueMapping] 📥 Received ${fotmobLeagues.length} FotMob leagues to process for Gemini`);
                
                // Prepare FotMob leagues data (simplified for Gemini)
                // ✅ FIX: Filter matches - only include non-finished matches
                // Include ALL leagues, even if they have no matches (for Priority 1 name matching)
                const fotmobData = fotmobLeagues.map(league => {
                    // Filter matches: only non-finished and not started
                    const filteredMatches = (league.matches || []).filter(m => {
                        const status = m.status || {};
                        const isNotFinished = status.finished === false;
                        const isNotStarted = status.started === false;
                        return isNotFinished && isNotStarted;
                    });
                    
                    return {
                    id: String(league.primaryId || league.id),
                    name: (league.isGroup && league.parentLeagueName) 
                        ? league.parentLeagueName 
                        : (league.name || league.parentLeagueName || ''),
                    country: league.ccode || '',
                        matches: filteredMatches.map(m => ({
                        homeTeam: m.home?.name || m.home?.longName || '',
                        awayTeam: m.away?.name || m.away?.longName || '',
                        startTime: m.status?.utcTime || m.time || ''
                    }))
                    };
                });
                
                // ✅ VERIFY: Log total leagues being sent (should match fotmobLeagues.length)
                console.log(`[LeagueMapping] ✅ Prepared ${fotmobData.length} FotMob leagues for Gemini (should match ${fotmobLeagues.length})`);
                
                // ✅ DEBUG: Log what leagues are being sent to Gemini (especially for La Liga)
                const laligaLeagues = fotmobData.filter(l => 
                    l.name.toLowerCase().includes('laliga') || 
                    l.name.toLowerCase().includes('la liga') ||
                    (l.country === 'ESP' && l.name.toLowerCase().includes('liga'))
                );
                if (laligaLeagues.length > 0) {
                    console.log(`[LeagueMapping] 🔍 Found ${laligaLeagues.length} La Liga related leagues in FotMob data:`);
                    laligaLeagues.forEach(l => {
                        console.log(`   - ID: ${l.id}, Name: "${l.name}", Country: ${l.country}`);
                    });
                } else {
                    console.log(`[LeagueMapping] ⚠️ WARNING: No La Liga related leagues found in FotMob data!`);
                    console.log(`[LeagueMapping] 📋 Sample FotMob league names (first 20):`);
                    fotmobData.slice(0, 20).forEach(l => {
                        console.log(`   - "${l.name}" (${l.country})`);
                    });
                }
                // ✅ VERIFY: Log total leagues being sent (should be ALL, not limited)
                console.log(`[LeagueMapping] 📤 Sending ${fotmobData.length} total FotMob leagues to Gemini for "${unibetData.leagueName}" (ALL leagues, NO LIMIT)`);
                console.log(`[LeagueMapping] 📊 Input: ${fotmobLeagues.length} leagues from API → Output: ${fotmobData.length} leagues to Gemini`);
                console.log(`[LeagueMapping] 📊 Unibet league has ${unibetData.matches.length} matches (ALL matches included)`);
                const totalFotmobMatches = fotmobData.reduce((sum, l) => sum + l.matches.length, 0);
                console.log(`[LeagueMapping] 📊 FotMob leagues have ${totalFotmobMatches} total matches (ALL matches included)`);
                
                // ✅ DEBUG: Count leagues with and without matches
                const leaguesWithMatches = fotmobData.filter(l => l.matches.length > 0).length;
                const leaguesWithoutMatches = fotmobData.filter(l => l.matches.length === 0).length;
                console.log(`[LeagueMapping] 📊 Breakdown: ${leaguesWithMatches} leagues with matches, ${leaguesWithoutMatches} leagues without matches`);

                // Initialize Gemini
                const ai = new GoogleGenAI({ apiKey: geminiApiKey });

                const prompt = `You are a football league matching expert. I need to find which FotMob league matches a given Unibet league using TWO PRIORITIES.

**Unibet League:**
- Name: "${unibetData.leagueName}"
- Country: "${unibetData.country}"
- All Matches (${unibetData.matches.length} total):
${unibetData.matches.map((m, i) => `  ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} (Time: ${m.startTime})`).join('\n')}

**Available FotMob Leagues:**
${fotmobData.map((league, idx) => `
${idx + 1}. League Name: "${league.name}"
   - ID: ${league.id}
   - Country: "${league.country}"
   - All Matches (${league.matches.length} total):
${league.matches.map((m, i) => `     ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} (Time: ${m.startTime})`).join('\n')}
`).join('\n')}

**Task:**
Find the FotMob league that matches the Unibet league "${unibetData.leagueName}" from "${unibetData.country}".

**MATCHING PRIORITY (Follow in this exact order):**

**PRIORITY 1: EXACT LEAGUE NAME MATCH (Check this FIRST)**
- Compare league names by NORMALIZING them:
  - Remove ALL spaces, underscores, hyphens, and special characters
  - Convert to lowercase
  - Examples:
    * "La Liga" → "laliga"
    * "LaLiga" → "laliga"  
    * "Premier_League" → "premierleague"
    * "Premier League" → "premierleague"
    * "Serie A" → "seriea"
- Countries MUST match (e.g., "Spain" = "ESP", "England" = "ENG")
- Country code mapping: Spain=ESP, England=ENG, France=FRA, Italy=ITA, Germany=GER, etc.
- If normalized league names match AND countries match → THIS IS THE MATCH (return immediately)

**PRIORITY 2: TEAM NAMES + EXACT MATCH TIME (Only if Priority 1 fails)**
- If league names don't match after normalization, check match data:
- For each Unibet match, find a FotMob match where:
  1. Team names match (home team = home team, away team = away team)
  2. Match time is EXACTLY the same (same date and time, not approximate)
- If you find at least ONE match where both teams AND exact time match → THIS IS THE MATCH
- Team name matching should be flexible (ignore case, small variations are OK)

**Important Rules:**
- ALWAYS try Priority 1 FIRST (league name match)
- Only use Priority 2 if Priority 1 finds NO match
- For Priority 1: "La Liga" (Unibet) = "LaLiga" (FotMob) = SAME (both normalize to "laliga")
- For Priority 2: Analyze the data and find the best match based on the team names and time. Team names must match AND time must be EXACT

**Response Format (JSON only, no other text):**
{
  "matched": true/false,
  "fotmobLeagueId": "12345" (if matched),
  "fotmobLeagueName": "La Liga" (if matched),
  "priority": "1" or "2" (which priority method was used - 1 for name match, 2 for team+time match),
  "reason": "Brief explanation of why this match was found (e.g., 'League name normalized match' or 'Team names and exact time matched')"
}

If no match found, return:
{
  "matched": false,
  "reason": "Why no match was found (e.g., 'No league name match found and no matching teams with exact time')"
}`;

                // ✅ NEW: Save Gemini request to temp file for debugging
                try {
                    const requestFilePath = path.join(this.tempDir, `gemini_request_${unibetLeague.id}_${Date.now()}.json`);
                    await fs.promises.writeFile(requestFilePath, JSON.stringify({
                        timestamp: this.getPKTTimeString(), // ✅ FIX: Use PKT time instead of UTC
                        unibetLeague: {
                            id: unibetLeague.id,
                            name: unibetData.leagueName,
                            country: unibetData.country,
                            matches: unibetData.matches
                        },
                        fotmobLeagues: fotmobData,
                        prompt: prompt
                    }, null, 2));
                    console.log(`[LeagueMapping] 💾 Saved Gemini request to: ${requestFilePath}`);
                } catch (saveError) {
                    console.warn(`[LeagueMapping] ⚠️ Failed to save Gemini request:`, saveError.message);
                }

                console.log(`[LeagueMapping] 📤 Sending request to Gemini (${keyName})...`);
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt
                });

                const responseText = (response.text || '').trim();
                console.log(`[LeagueMapping] 📥 Gemini response (${keyName}): ${responseText.substring(0, 200)}...`);
                
                // ✅ NEW: Save Gemini response to temp file for debugging
                try {
                    const responseFilePath = path.join(this.tempDir, `gemini_response_${unibetLeague.id}_${Date.now()}.json`);
                    await fs.promises.writeFile(responseFilePath, JSON.stringify({
                        timestamp: this.getPKTTimeString(), // ✅ FIX: Use PKT time instead of UTC
                        unibetLeagueId: unibetLeague.id,
                        unibetLeagueName: unibetData.leagueName,
                        responseText: responseText,
                        fullResponse: response
                    }, null, 2));
                    console.log(`[LeagueMapping] 💾 Saved Gemini response to: ${responseFilePath}`);
                } catch (saveError) {
                    console.warn(`[LeagueMapping] ⚠️ Failed to save Gemini response:`, saveError.message);
                }

                // Parse JSON response
                let geminiResult;
                try {
                    // Extract JSON from response (handle markdown code blocks)
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        geminiResult = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error('No JSON found in response');
                    }
                } catch (parseError) {
                    console.error(`[LeagueMapping] ❌ Could not parse Gemini response as JSON:`, parseError.message);
                    console.error(`[LeagueMapping] Full response: ${responseText}`);
                    return null;
                }

                if (geminiResult.matched && geminiResult.fotmobLeagueId) {
                    const matchedLeague = fotmobLeagues.find(l => 
                        String(l.primaryId || l.id) === String(geminiResult.fotmobLeagueId)
                    );

                    if (matchedLeague) {
                        console.log(`[LeagueMapping] ✅ Gemini matched (${keyName}): "${geminiResult.fotmobLeagueName}" (ID: ${geminiResult.fotmobLeagueId})`);
                        console.log(`[LeagueMapping]    Reason: ${geminiResult.reason || 'Team names and league name matched'}`);
                        
                        return {
                            id: parseInt(geminiResult.fotmobLeagueId),
                            name: geminiResult.fotmobLeagueName || matchedLeague.name,
                            exactMatch: false,
                            geminiMatch: true
                        };
                    } else {
                        console.log(`[LeagueMapping] ⚠️ Gemini returned ID ${geminiResult.fotmobLeagueId} but league not found in FotMob data`);
                    }
                } else {
                    console.log(`[LeagueMapping] ❌ Gemini could not find a match: ${geminiResult.reason || 'No match found'}`);
                }

                // If we got here, the request succeeded but no match was found
                return null;

            } catch (error) {
                lastError = error;
                console.error(`[LeagueMapping] ❌ Gemini API error (${keyName}):`, error.message);
                
                // Check if it's a quota error and we have another key to try
                if (isQuotaError(error) && i < apiKeys.length - 1) {
                    console.log(`[LeagueMapping] ⚠️ Quota error with ${keyName}, trying fallback key...`);
                    continue; // Try next key
                }
                
                // If it's not a quota error, or it's the last key, return null
                if (!isQuotaError(error)) {
                    // Non-quota error - don't try other keys
                    return null;
                }
            }
        }

        // All keys failed
        if (lastError && isQuotaError(lastError)) {
            console.error(`[LeagueMapping] ❌ All Gemini API keys exhausted quota`);
        }
        return null;
    }

    /**
     * Add new mapping to CSV files
     */
    async addMappingToCsv(mapping) {
        // ✅ Normalize IDs to strings for consistent comparison
        const unibetIdStr = String(mapping.unibetId);
        const fotmobIdStr = String(mapping.fotmobId);
        
        // ✅ FIX: Check DB (source of truth) for duplicates before adding
        try {
            const unibetIdNum = parseInt(mapping.unibetId);
            const existingInDB = await LeagueMapping.findOne({ unibetId: unibetIdNum });
            if (existingInDB) {
                console.log(`[LeagueMapping] ⚠️ Skipping duplicate Unibet ID: ${unibetIdStr} (${mapping.unibetName}) - already exists in DB`);
            return false;
        }
        } catch (dbError) {
            console.error(`[LeagueMapping] ❌ Error checking DB for duplicate:`, dbError.message);
            // Continue processing if DB check fails
        }
        
        // ✅ REMOVED: Check for existing Fotmob ID - Now allow multiple Unibet IDs per Fotmob ID
        // Multiple Unibet leagues (like "Segunda RFEF 5") can map to one Fotmob league (primaryId: 9138)
        
        const matchType = mapping.exactMatch ? 'Exact Match' : 'Different Name';
        const row = [
            unibetIdStr,
            `"${mapping.unibetName}"`,
            fotmobIdStr,
            `"${mapping.fotmobName}"`,
            matchType,
            mapping.country || ''
        ].join(',');

        try {
            // ✅ FIX: Use async file operations
            const ensureNewline = async (filePath) => {
                if (fs.existsSync(filePath)) {
                    const content = await fs.promises.readFile(filePath, 'utf8');
                    const trimmed = content.replace(/\n+$/, '');
                    if (trimmed && !trimmed.endsWith('\n')) {
                        await fs.promises.writeFile(filePath, trimmed + '\n', 'utf8');
                    } else if (trimmed) {
                        await fs.promises.writeFile(filePath, trimmed + '\n', 'utf8');
                    }
                }
            };

            // ✅ REMOVED: Client CSV update - Frontend now uses backend API
            // Append to server CSV file only
            // ✅ REMOVED: CSV duplicate check - DB is source of truth, CSV is just for backup
            if (fs.existsSync(this.serverCsvPath)) {
                await ensureNewline(this.serverCsvPath);
                await fs.promises.appendFile(this.serverCsvPath, row + '\n', 'utf8');
                console.log(`[LeagueMapping] ✅ Added to server CSV: ${mapping.unibetName} → ${mapping.fotmobName}`);
            } else {
                console.warn(`[LeagueMapping] ⚠️ Server CSV not found: ${this.serverCsvPath}`);
            }

            // Also add to existing mappings cache (normalize IDs)
            this.existingMappings.set(unibetIdStr, {
                unibetId: unibetIdStr,
                unibetName: mapping.unibetName,
                fotmobId: fotmobIdStr,
                fotmobName: mapping.fotmobName,
                matchType,
                country: mapping.country || ''
            });
            // ✅ REMOVED: Track Fotmob ID - Now allow multiple Unibet IDs per Fotmob ID
            
            return true;

            return {
                success: true,
                mapping: {
                    unibetId: mapping.unibetId,
                    unibetName: mapping.unibetName,
                    fotmobId: mapping.fotmobId,
                    fotmobName: mapping.fotmobName,
                    matchType: matchType,
                    country: mapping.country || ''
                }
            };
        } catch (error) {
            console.error(`[LeagueMapping] ❌ Error adding mapping to CSV:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save league mapping to MongoDB database
     * @param {Object} mapping - Mapping object with all league data
     * @returns {Promise<boolean>} - True if successful
     */
    async saveMappingToDatabase(mapping) {
        try {
            const unibetId = parseInt(mapping.unibetId);
            const fotmobId = parseInt(mapping.fotmobId);
            const matchType = mapping.exactMatch ? 'Exact Match' : 'Different Name';
            
            // ✅ FIX: Only check unibetId (allow multiple unibetIds per fotmobId)
            const existing = await LeagueMapping.findOne({
                unibetId: unibetId
            });
            
            if (existing) {
                console.log(`[LeagueMapping] ⚠️ Mapping already exists in DB - Unibet ID: ${unibetId} (Fotmob ID: ${existing.fotmobId})`);
                return false;
            }
            
            // Create new mapping
            const leagueMapping = new LeagueMapping({
                unibetId: unibetId,
                unibetName: mapping.unibetName,
                fotmobId: fotmobId,
                fotmobName: mapping.fotmobName,
                matchType: matchType,
                country: mapping.country || '',
                unibetUrl: mapping.unibetUrl || '',
                fotmobUrl: mapping.fotmobUrl || `https://www.fotmob.com/leagues/${fotmobId}`
            });
            
            await leagueMapping.save();
            console.log(`[LeagueMapping] ✅ Saved to DB: ${mapping.unibetName} (Unibet: ${unibetId}, Fotmob: ${fotmobId})`);
            return true;
        } catch (error) {
            // Handle duplicate key error (E11000)
            if (error.code === 11000) {
                console.log(`[LeagueMapping] ⚠️ Duplicate key error in DB - mapping already exists`);
                return false;
            }
            console.error(`[LeagueMapping] ❌ Error saving to database:`, error.message);
            throw error;
        }
    }

    /**
     * Normalize a string to URL slug format
     * @param {string} str - String to normalize
     * @returns {string} - Normalized slug
     */
    normalizeToSlug(str) {
        if (!str) return '';
        
        return str
            .toLowerCase()
            // ✅ FIX: Convert accented characters to ASCII equivalents FIRST
            .normalize('NFD') // Decompose accented characters (é -> e + ́)
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks (accents)
            .replace(/[''"]/g, '') // Remove apostrophes/quotes
            .replace(/[^a-z0-9\s()-]/g, '') // Keep parentheses, spaces, hyphens
            .replace(/\s+/g, '_') // Replace spaces with underscore
            .replace(/\(/g, '_') // ✅ ONE-LINER: Replace ( with _ (creates __ when after space)
            .replace(/\)/g, '_') // ✅ ONE-LINER: Replace ) with _
            .replace(/([^_])_{3,}([^_])/g, '$1_$2') // Collapse 3+ underscores to single
            .replace(/^_+/, '') // Remove only leading underscores, keep trailing ones
            .trim();
    }

    /**
     * Construct Unibet URL from league data
     * @param {Object} league - League object with unibetName and country
     * @returns {string} - Constructed Unibet URL
     */
    constructUnibetUrl(league) {
        const baseUrl = 'https://www.unibet.com.au/betting/sports/filter/football';
        
        // For international leagues (no country or country is "International")
        if (!league.country || league.country === 'International' || league.country === 'Unknown') {
            const leagueSlug = this.normalizeToSlug(league.unibetName);
            return `${baseUrl}/${leagueSlug}`;
        }
        
        // ✅ FIX: If country and league name are the same (e.g., "Africa Cup of Nations"),
        // use only the league slug, not both
        const countrySlug = this.normalizeToSlug(league.country);
        const leagueSlug = this.normalizeToSlug(league.unibetName);
        
        // Normalize both for comparison
        const countryNorm = normalizeTeamName(league.country || '');
        const leagueNorm = normalizeTeamName(league.unibetName || '');
        
        // If country and league name are essentially the same, use only league slug
        if (countryNorm === leagueNorm || countrySlug === leagueSlug) {
            return `${baseUrl}/${leagueSlug}`;
        }
        
        // For country-based leagues (different country and league)
        return `${baseUrl}/${countrySlug}/${leagueSlug}`;
    }

    /**
     * Verify if a Unibet URL is valid by checking if it returns data
     * @param {string} url - URL to verify
     * @returns {Promise<boolean>} - True if URL is valid
     */
    async verifyUnibetUrl(url) {
        try {
            // Convert webpage URL to API URL
            const urlParts = url.split('/');
            const filterIndex = urlParts.findIndex(part => part === 'filter');
            if (filterIndex === -1) return false;
            
            const matchesPath = urlParts.slice(filterIndex + 1).join('/');
            const apiUrl = `https://www.unibet.com.au/sportsbook-feeds/views/filter/${matchesPath}/all/matches?includeParticipants=true&useCombined=true&ncid=${Date.now()}`;
            
            const response = await axios.get(apiUrl, {
                headers: {
                    'accept': '*/*',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'referer': url
                },
                timeout: 10000,
                validateStatus: (status) => status < 500 // Don't throw on 404
            });
            
            // If we get valid JSON with data, URL is valid
            if (response.status === 200 && response.data && response.data.layout) {
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Add a league to league_mapping_with_urls.csv
     * @param {Object} mapping - Mapping object with all league data
     * @param {string} url - Unibet URL
     * @returns {boolean} - True if successful
     */
    async addToUrlsCsv(mapping, url) {
        try {
            console.log(`[LeagueMapping] 🔍 Attempting to add to URLs CSV:`);
            console.log(`[LeagueMapping]   - Path: ${this.urlsCsvPath}`);
            console.log(`[LeagueMapping]   - Path exists: ${fs.existsSync(this.urlsCsvPath)}`);
            console.log(`[LeagueMapping]   - League: ${mapping.unibetName} (ID: ${mapping.unibetId})`);
            
            if (!fs.existsSync(this.urlsCsvPath)) {
                console.error(`[LeagueMapping] ❌ URLs CSV not found at: ${this.urlsCsvPath}`);
                console.error(`[LeagueMapping] ❌ Current working directory: ${process.cwd()}`);
                console.error(`[LeagueMapping] ❌ __dirname: ${__dirname}`);
                return false;
            }

            // Construct Fotmob URL from Fotmob ID
            const fotmobUrl = mapping.fotmobId 
                ? `https://www.fotmob.com/leagues/${mapping.fotmobId}`
                : '';

            // ✅ FIX: Calculate matchType from exactMatch if not present
            let matchType = mapping.matchType;
            if (!matchType && mapping.hasOwnProperty('exactMatch')) {
                matchType = mapping.exactMatch ? 'Exact Match' : 'Different Name';
            }
            if (!matchType) {
                matchType = ''; // Fallback to empty if neither matchType nor exactMatch exists
            }

            // Create row: Unibet_ID,Unibet_URL,Unibet_Name,Fotmob_URL,Fotmob_Name,Match_Type,Country/Region
            const row = [
                mapping.unibetId,
                url,
                mapping.unibetName,
                fotmobUrl,
                mapping.fotmobName,
                matchType, // ✅ Now properly set
                mapping.country || ''
            ].join(',');

            // ✅ FIX: Use async file operations
            const content = await fs.promises.readFile(this.urlsCsvPath, 'utf8');
            console.log(`[LeagueMapping] 📄 Current file size: ${content.length} bytes`);
            console.log(`[LeagueMapping] 📄 Current file lines: ${content.split('\n').length}`);
            
            // ✅ Check if entry already exists - parse CSV properly to check first column (Unibet_ID)
            const lines = content.split('\n');
            const unibetIdStr = String(mapping.unibetId);
            for (const line of lines) {
                if (!line.trim()) continue;
                const firstColumn = line.split(',')[0]?.trim().replace(/"/g, '');
                if (firstColumn === unibetIdStr) {
                    console.log(`[LeagueMapping] ⚠️ League ID ${unibetIdStr} already exists in URLs CSV - skipping`);
                    return false;
                }
            }
            
            // Ensure file ends with newline before appending
            const trimmed = content.replace(/\n+$/, '');
            const finalContent = trimmed + (trimmed.endsWith('\n') ? '' : '\n') + row + '\n';
            
            // Write to file
            await fs.promises.writeFile(this.urlsCsvPath, finalContent, 'utf8');
            
            // Verify write
            const verifyContent = await fs.promises.readFile(this.urlsCsvPath, 'utf8');
            const verifyLines = verifyContent.split('\n').length;
            console.log(`[LeagueMapping] ✅ File written successfully`);
            console.log(`[LeagueMapping] ✅ New file size: ${verifyContent.length} bytes`);
            console.log(`[LeagueMapping] ✅ New file lines: ${verifyLines}`);
            console.log(`[LeagueMapping] ✅ Added to URLs CSV: ${mapping.unibetName} → ${url}`);
            console.log(`[LeagueMapping] ✅ Row added: ${row}`);
            
            return true;
        } catch (error) {
            console.error(`[LeagueMapping] ❌ Error adding to URLs CSV:`, error);
            console.error(`[LeagueMapping] ❌ Error stack:`, error.stack);
            console.error(`[LeagueMapping] ❌ Path attempted: ${this.urlsCsvPath}`);
            return false;
        }
    }

    /**
     * Sync newly added leagues to league_mapping_with_urls.csv
     * @param {Array} newMappings - Array of mapping objects to sync
     * @returns {Promise<Object>} - Sync result
     */
    async syncLeagueUrlsForNewMappings(newMappings) {
        if (!newMappings || newMappings.length === 0) {
            return { success: true, added: 0, skipped: 0 };
        }

        console.log(`[LeagueMapping] 🔄 Syncing ${newMappings.length} new league(s) to URLs CSV...`);
        
        let added = 0;
        let skipped = 0;
        const skippedLeagues = [];

        for (const mapping of newMappings) {
            try {
                // Construct URL
                const constructedUrl = this.constructUnibetUrl(mapping);
                console.log(`[LeagueMapping] 🔍 Verifying URL for ${mapping.unibetName}: ${constructedUrl}`);
                
                // Verify URL
                const isValid = await this.verifyUnibetUrl(constructedUrl);
                
                if (isValid) {
                    // Add to URLs CSV
                    const success = await this.addToUrlsCsv(mapping, constructedUrl);
                    if (success) {
                        added++;
                    } else {
                        skipped++;
                        skippedLeagues.push(mapping.unibetName);
                    }
                } else {
                    skipped++;
                    skippedLeagues.push(mapping.unibetName);
                    console.log(`[LeagueMapping] ⚠️ URL verification failed for ${mapping.unibetName} - skipping`);
                }
            } catch (error) {
                console.error(`[LeagueMapping] ❌ Error syncing ${mapping.unibetName}:`, error.message);
                skipped++;
                skippedLeagues.push(mapping.unibetName);
            }
        }

        console.log(`[LeagueMapping] ✅ URL Sync Summary: ${added} added, ${skipped} skipped`);
        if (skippedLeagues.length > 0) {
            console.log(`[LeagueMapping] ⚠️ Skipped leagues: ${skippedLeagues.join(', ')}`);
        }

        return {
            success: true,
            added,
            skipped,
            skippedLeagues
        };
    }

    /**
     * ✅ REMOVED: generateLeagueUtils() function
     * Frontend now fetches league mapping from backend API (/api/admin/leagues/mapping)
     * No need to generate client-side files anymore
     */

    /**
     * Upload CSV files to Cloudinary
     */
    async uploadCsvToCloudinary() {
        try {
            // Configure Cloudinary
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });

            if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
                console.log('[LeagueMapping] ⚠️ Cloudinary credentials not found, skipping upload');
                return { success: false, reason: 'Cloudinary credentials not configured' };
            }

            console.log('[LeagueMapping] ☁️ Starting Cloudinary upload...');
            
            const uploads = [];

            // Upload league_mapping_clean.csv (always update same file)
            if (fs.existsSync(this.serverCsvPath)) {
                console.log('[LeagueMapping] 📤 Uploading league_mapping_clean.csv...');
                const cleanCsvUpload = cloudinary.uploader.upload(this.serverCsvPath, {
                    resource_type: 'raw',
                    public_id: `league-mapping/league_mapping_clean.csv`, // ✅ Include .csv extension
                    overwrite: true,
                    invalidate: true, // ✅ Force CDN cache invalidation
                    format: 'csv'
                });
                uploads.push({ name: 'league_mapping_clean.csv', promise: cleanCsvUpload });
            }

            // Upload league_mapping_with_urls.csv (always update same file)
            if (fs.existsSync(this.urlsCsvPath)) {
                console.log('[LeagueMapping] 📤 Uploading league_mapping_with_urls.csv...');
                const urlsCsvUpload = cloudinary.uploader.upload(this.urlsCsvPath, {
                    resource_type: 'raw',
                    public_id: `league-mapping/league_mapping_with_urls.csv`, // ✅ Include .csv extension
                    overwrite: true,
                    invalidate: true, // ✅ Force CDN cache invalidation
                    format: 'csv'
                });
                uploads.push({ name: 'league_mapping_with_urls.csv', promise: urlsCsvUpload });
            }

            if (uploads.length === 0) {
                console.log('[LeagueMapping] ⚠️ No CSV files found to upload');
                return { success: false, reason: 'No CSV files found' };
            }

            // Wait for all uploads to complete
            const results = await Promise.allSettled(uploads.map(u => u.promise));
            
            const uploaded = [];
            const failed = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    uploaded.push({
                        file: uploads[index].name,
                        url: result.value.secure_url,
                        public_id: result.value.public_id
                    });
                    console.log(`[LeagueMapping] ✅ Uploaded ${uploads[index].name}: ${result.value.secure_url}`);
                } else {
                    failed.push({
                        file: uploads[index].name,
                        error: result.reason?.message || 'Unknown error'
                    });
                    console.error(`[LeagueMapping] ❌ Failed to upload ${uploads[index].name}:`, result.reason?.message);
                }
            });

            console.log('[LeagueMapping] ☁️ Cloudinary upload completed');
            console.log(`[LeagueMapping]   - Successfully uploaded: ${uploaded.length} file(s)`);
            if (failed.length > 0) {
                console.log(`[LeagueMapping]   - Failed: ${failed.length} file(s)`);
            }

            return {
                success: uploaded.length > 0,
                uploaded,
                failed
            };
        } catch (error) {
            console.error('[LeagueMapping] ❌ Error uploading to Cloudinary:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Main execution method
     */
    async execute() {
        const startTime = Date.now();
        console.log('[LeagueMapping] ========================================');
        console.log('[LeagueMapping] 🚀 Starting League Mapping Auto-Update');
        console.log('[LeagueMapping] ========================================');
        console.log(`[LeagueMapping] ⏰ Start time: ${new Date().toISOString()}`);

        // Add overall timeout (10 minutes max)
        const MAX_EXECUTION_TIME = 10 * 60 * 1000; // 10 minutes
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`League Mapping update timed out after ${MAX_EXECUTION_TIME / 1000} seconds`));
            }, MAX_EXECUTION_TIME);
        });

        try {
            // Race between execution and timeout
            const result = await Promise.race([
                this.executeInternal(),
                timeoutPromise
            ]);
            
            return result;
        } catch (error) {
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            console.error('[LeagueMapping] ========================================');
            console.error('[LeagueMapping] ❌ League Mapping Auto-Update Failed');
            console.error('[LeagueMapping] ========================================');
            console.error(`[LeagueMapping] ⏰ Failed after: ${duration} seconds`);
            console.error(`[LeagueMapping] ⏰ Error time: ${new Date().toISOString()}`);
            console.error('[LeagueMapping] Error:', error.message || error);
            console.error('[LeagueMapping] Stack:', error.stack);
            throw error;
        }
    }

    async executeInternal() {
        const startTime = Date.now();
        
        try {
            // 1. Load existing mappings
            console.log('[LeagueMapping] 📋 Step 1: Loading existing mappings...');
            await this.loadExistingMappings();
            console.log('[LeagueMapping] ✅ Step 1 complete: Existing mappings loaded');

            // 2. Get today's date in Pakistani timezone (Asia/Karachi)
            // ✅ FIX: Use Pakistani timezone instead of UTC to get correct date
            const now = new Date();
            // Get date components in Pakistani timezone
            const pakistaniDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
            const year = pakistaniDate.getFullYear();
            const month = String(pakistaniDate.getMonth() + 1).padStart(2, '0');
            const day = String(pakistaniDate.getDate()).padStart(2, '0');
            const dateStr = `${year}${month}${day}`;
            
            // Log both UTC and Pakistani time for debugging
            const utcDateStr = now.toISOString().split('T')[0].replace(/-/g, '');
            const pakistaniTimeStr = now.toLocaleString("en-US", { 
                timeZone: "Asia/Karachi",
                dateStyle: "full",
                timeStyle: "long"
            });
            console.log(`[LeagueMapping] 📅 Step 2: Processing date: ${dateStr} (Pakistani timezone)`);
            console.log(`[LeagueMapping] 📅 UTC date would be: ${utcDateStr} (not using - using PKT instead)`);
            console.log(`[LeagueMapping] 📅 Pakistani time: ${pakistaniTimeStr}`);

            // 3. Fetch Unibet matches
            console.log('[LeagueMapping] 🌐 Step 3: Fetching Unibet matches...');
            const unibetLeagues = await this.fetchUnibetMatches(dateStr);
            console.log(`[LeagueMapping] ✅ Step 3 complete: Found ${unibetLeagues.length} Unibet leagues`);

            // 4. Fetch Fotmob matches (today)
            console.log('[LeagueMapping] 🌐 Step 4: Fetching Fotmob matches for TODAY...');
            let fotmobLeagues = await this.fetchFotmobMatches(dateStr);
            
            // ✅ FIX: Filter today's matches - only include non-finished matches from TODAY
            fotmobLeagues = fotmobLeagues.map(league => {
                if (!league.matches || !Array.isArray(league.matches)) {
                    return league;
                }
                
                const filteredMatches = league.matches.filter(match => {
                    const status = match.status || {};
                    const isNotFinished = status.finished === false;
                    const isNotStarted = status.started === false;
                    
                    // ✅ NEW: Verify match date is today (not tomorrow)
                    const matchTimeUTC = new Date(match.status?.utcTime || match.timeTS);
                    const matchTimePKT = new Date(matchTimeUTC.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
                    const matchDateStr = `${matchTimePKT.getFullYear()}${String(matchTimePKT.getMonth() + 1).padStart(2, '0')}${String(matchTimePKT.getDate()).padStart(2, '0')}`;
                    const isTodayDate = matchDateStr === dateStr;
                    
                    return isNotFinished && isNotStarted && isTodayDate;
                });
                
                return {
                    ...league,
                    matches: filteredMatches
                };
            }).filter(league => league.matches && league.matches.length > 0);
            
            console.log(`[LeagueMapping] ✅ Step 4a complete: Found ${fotmobLeagues.length} Fotmob leagues (today, non-finished matches only)`);
            
            // 4b. Fetch Fotmob matches (tomorrow) - ✅ COMPLETE DAY
            console.log('[LeagueMapping] 🌐 Step 4b: Fetching Fotmob matches for TOMORROW (complete day)...');
            const fotmobLeaguesTomorrow = await this.fetchFotmobMatchesTomorrow(dateStr);
            console.log(`[LeagueMapping] ✅ Step 4b complete: Found ${fotmobLeaguesTomorrow.length} Fotmob leagues (tomorrow, complete day, non-finished matches only)`);
            
            // 4c. Fetch Fotmob matches (day after tomorrow) - ✅ NEW
            console.log('[LeagueMapping] 🌐 Step 4c: Fetching Fotmob matches for DAY AFTER TOMORROW (12hr filter)...');
            const fotmobLeaguesDayAfter = await this.fetchFotmobMatchesDayAfterTomorrow(dateStr);
            console.log(`[LeagueMapping] ✅ Step 4c complete: Found ${fotmobLeaguesDayAfter.length} Fotmob leagues (day after tomorrow, within 12hrs, non-finished matches only)`);
            
            // ✅ Save today's leagues separately before combining
            const fotmobLeaguesToday = [...fotmobLeagues];
            
            // Combine today, tomorrow, and day after tomorrow leagues
            fotmobLeagues = [...fotmobLeagues, ...fotmobLeaguesTomorrow, ...fotmobLeaguesDayAfter];
            console.log(`[LeagueMapping] ✅ Step 4 complete: Total ${fotmobLeagues.length} Fotmob leagues (${fotmobLeaguesToday.length} today + ${fotmobLeaguesTomorrow.length} tomorrow + ${fotmobLeaguesDayAfter.length} day after)`);
            
            // ✅ NEW: Save combined filtered data for verification (what will be sent to Gemini/Unibet matching)
            try {
                const combinedFilePath = path.join(this.tempDir, `fotmob_combined_filtered_${dateStr}.json`);
                await fs.promises.writeFile(combinedFilePath, JSON.stringify({
                    date: dateStr,
                    timestamp: this.getPKTTimeString(),
                    summary: {
                        todayLeaguesCount: fotmobLeaguesToday.length,
                        tomorrowLeaguesCount: fotmobLeaguesTomorrow.length,
                        dayAfterLeaguesCount: fotmobLeaguesDayAfter.length,
                        totalCombinedLeagues: fotmobLeagues.length,
                        description: "This is the filtered data that will be used for matching with Unibet leagues and sent to Gemini"
                    },
                    todayLeagues: fotmobLeaguesToday,
                    tomorrowLeagues: fotmobLeaguesTomorrow,
                    dayAfterLeagues: fotmobLeaguesDayAfter,
                    allCombinedLeagues: fotmobLeagues
                }, null, 2));
                console.log(`[LeagueMapping] 💾 Saved combined filtered data to: ${combinedFilePath}`);
                console.log(`[LeagueMapping] 📊 Combined data breakdown: ${fotmobLeaguesToday.length} today + ${fotmobLeaguesTomorrow.length} tomorrow + ${fotmobLeaguesDayAfter.length} day after = ${fotmobLeagues.length} total`);
            } catch (saveError) {
                console.warn(`[LeagueMapping] ⚠️ Failed to save combined data:`, saveError.message);
            }

            // 5. Process each Unibet league
            console.log('[LeagueMapping] 🔄 Step 5: Processing leagues and finding matches...');
            let newMappingsCount = 0;
            let skippedCount = 0;
            let notFoundCount = 0;
            let processedCount = 0;

            for (const unibetLeague of unibetLeagues) {
                processedCount++;
                if (processedCount % 10 === 0) {
                    console.log(`[LeagueMapping] 📊 Progress: Processed ${processedCount}/${unibetLeagues.length} leagues...`);
                }
                // Skip Esports leagues
                const leagueNameLower = (unibetLeague.name || '').toLowerCase();
                if (leagueNameLower.includes('esports') || leagueNameLower.includes('esport')) {
                    console.log(`[LeagueMapping] ⏭️ Skipping Esports league: ${unibetLeague.name}`);
                    skippedCount++;
                    continue;
                }
                
                // ✅ ADD: Skip Club Friendly Matches
                if (leagueNameLower.includes('club friendly') || leagueNameLower.includes('club friendly matches')) {
                    console.log(`[LeagueMapping] ⏭️ Skipping Club Friendly Matches league: ${unibetLeague.name}`);
                    skippedCount++;
                    continue;
                }

                // ✅ FIX: Check database FIRST before processing
                const unibetIdStr = String(unibetLeague.id);
                const unibetIdNum = parseInt(unibetLeague.id);
                
                // Check if league already exists in database (successful mapping)
                try {
                    const existingInDB = await LeagueMapping.findOne({ unibetId: unibetIdNum });
                    if (existingInDB) {
                        console.log(`[LeagueMapping] ⚠️ Skipping ${unibetLeague.name} - Unibet ID ${unibetIdStr} already exists in DATABASE (Fotmob ID: ${existingInDB.fotmobId})`);
                        skippedCount++;
                        continue;
                    }
                    
                    // ✅ NEW: Check if mapping was previously attempted and failed (separate collection)
                    const failedAttempt = await FailedLeagueMappingAttempt.findOne({ 
                        unibetId: unibetIdNum
                    });
                    if (failedAttempt) {
                        console.log(`[LeagueMapping] ⚠️ Skipping ${unibetLeague.name} - Previous mapping attempt failed (Unibet ID: ${unibetIdStr}, Attempts: ${failedAttempt.attemptCount})`);
                        skippedCount++;
                        continue;
                    }
                } catch (dbError) {
                    console.error(`[LeagueMapping] ❌ Error checking database for Unibet ID ${unibetIdStr}:`, dbError.message);
                    // Continue processing if DB check fails (don't skip)
                }

                // Skip if no matches (can't compare)
                if (!unibetLeague.matches || unibetLeague.matches.length === 0) {
                    console.log(`[LeagueMapping] ⚠️ Skipping ${unibetLeague.name} - no matches`);
                    skippedCount++;
                    continue;
                }

                // Find matching Fotmob league (Priority 1 & 2: Exact match and team+time)
                let fotmobLeague = this.findMatchingFotmobLeague(unibetLeague, fotmobLeagues);

                // ✅ PRIORITY 3: If no match found, try Gemini AI fallback
                if (!fotmobLeague) {
                    console.log(`[LeagueMapping] 🔄 Trying Gemini AI fallback for: ${unibetLeague.name}...`);
                    fotmobLeague = await this.findMatchingFotmobLeagueWithGemini(unibetLeague, fotmobLeagues);
                }

                if (fotmobLeague) {
                    // ✅ FIX: Use primaryId instead of id (primaryId is the actual league ID, id might be group ID)
                    const fotmobId = String(fotmobLeague.primaryId || fotmobLeague.id);
                    const unibetIdStr = String(unibetLeague.id);
                    
                    // ✅ VALIDATION: Only save properly mapped leagues (must have valid Fotmob ID)
                    const fotmobIdNum = parseInt(fotmobId);
                    if (isNaN(fotmobIdNum) || fotmobIdNum <= 0) {
                        console.log(`[LeagueMapping] ⚠️ Skipping ${unibetLeague.name} - Invalid Fotmob ID: ${fotmobId}`);
                        notFoundCount++;
                        continue;
                    }
                    
                    // ✅ REMOVED: Check for existing Fotmob ID mapping - Now allow multiple Unibet IDs per Fotmob ID
                    // Multiple Unibet leagues (like "Segunda RFEF 5") can map to one Fotmob league (primaryId: 9138)
                    
                    // ✅ FIX: Check DB (source of truth) - Verify the combination doesn't exist
                    try {
                        const existingMappingInDB = await LeagueMapping.findOne({
                            unibetId: unibetIdNum,
                            fotmobId: fotmobIdNum
                        });
                        if (existingMappingInDB) {
                            console.log(`[LeagueMapping] ⚠️ Skipping ${unibetLeague.name} - Combination (Unibet ID: ${unibetIdStr}, Fotmob ID: ${fotmobId}) already exists in DB`);
                        skippedCount++;
                        continue;
                    }
                    } catch (dbError) {
                        console.error(`[LeagueMapping] ❌ Error checking DB for combination:`, dbError.message);
                        // Continue processing if DB check fails
                    }
                    
                    // ✅ VALIDATION: Must have valid Fotmob name
                    if (!fotmobLeague.name || !fotmobLeague.name.trim()) {
                        console.log(`[LeagueMapping] ⚠️ Skipping ${unibetLeague.name} - Missing Fotmob name`);
                        notFoundCount++;
                        continue;
                    }
                    
                    // ✅ Construct Unibet URL before saving
                    const constructedUrl = this.constructUnibetUrl({
                        unibetName: unibetLeague.englishName || unibetLeague.name,
                        country: unibetLeague.country || ''
                    });
                    
                    // Add to CSV
                    const mappingData = {
                        unibetId: unibetIdStr,
                        unibetName: unibetLeague.englishName || unibetLeague.name, // Use englishName
                        fotmobId: fotmobId,
                        fotmobName: fotmobLeague.name, // Already using parentLeagueName for groups
                        exactMatch: fotmobLeague.exactMatch,
                        country: unibetLeague.country || '',
                        unibetUrl: constructedUrl, // ✅ Add Unibet URL
                        fotmobUrl: `https://www.fotmob.com/leagues/${fotmobId}` // ✅ Add Fotmob URL
                    };

                    const success = await this.addMappingToCsv(mappingData);

                    if (success) {
                        newMappingsCount++;
                        // ✅ REMOVED: Track Fotmob ID - Now allow multiple Unibet IDs per Fotmob ID
                        
                        // ✅ NEW: Save to Database (only properly mapped leagues)
                        try {
                            await this.saveMappingToDatabase(mappingData);
                            console.log(`[LeagueMapping] ✅ Saved ${mappingData.unibetName} to database`);
                        } catch (error) {
                            console.warn(`[LeagueMapping] ⚠️ Failed to save ${mappingData.unibetName} to database:`, error.message);
                            // Don't fail the whole job if DB save fails
                        }
                        
                        // ✅ NEW: Sync to URLs CSV
                        try {
                            await this.syncLeagueUrlsForNewMappings([mappingData]);
                            console.log(`[LeagueMapping] ✅ Synced ${mappingData.unibetName} to URLs CSV`);
                        } catch (error) {
                            console.warn(`[LeagueMapping] ⚠️ Failed to sync ${mappingData.unibetName} to URLs CSV:`, error.message);
                            // Don't fail the whole job if URL sync fails
                        }
                    }
                } else {
                    notFoundCount++;
                    
                    // ✅ NEW: Save unsuccessful mapping attempt to separate collection
                    try {
                        const unibetIdNum = parseInt(unibetLeague.id);
                        const existingFailed = await FailedLeagueMappingAttempt.findOne({ 
                            unibetId: unibetIdNum
                        });
                        
                        if (!existingFailed) {
                            // Create a new entry to track failed mapping
                            const failedMapping = new FailedLeagueMappingAttempt({
                                unibetId: unibetIdNum,
                                unibetName: unibetLeague.englishName || unibetLeague.name,
                                country: unibetLeague.country || '',
                                unibetUrl: this.constructUnibetUrl({
                                    unibetName: unibetLeague.englishName || unibetLeague.name,
                                    country: unibetLeague.country || ''
                                }),
                                mappingAttempted: true,
                                mappingFailed: true,
                                lastMappingAttempt: new Date(),
                                attemptCount: 1
                            });
                            
                            await failedMapping.save();
                            console.log(`[LeagueMapping] 📝 Saved failed mapping attempt for: ${unibetLeague.name} (Unibet ID: ${unibetIdNum})`);
                        } else {
                            // Update last attempt time and increment count
                            existingFailed.lastMappingAttempt = new Date();
                            existingFailed.attemptCount = (existingFailed.attemptCount || 0) + 1;
                            await existingFailed.save();
                            console.log(`[LeagueMapping] 📝 Updated failed mapping attempt for: ${unibetLeague.name} (Unibet ID: ${unibetIdNum}, Attempts: ${existingFailed.attemptCount})`);
                        }
                    } catch (error) {
                        console.warn(`[LeagueMapping] ⚠️ Failed to save unsuccessful mapping for ${unibetLeague.name}:`, error.message);
                        // Don't fail the whole job if this fails
                    }
                }
            }

            console.log('[LeagueMapping] ✅ Step 5 complete: All leagues processed');
            console.log('[LeagueMapping] ========================================');
            console.log('[LeagueMapping] ✅ League Mapping Auto-Update Completed');
            console.log('[LeagueMapping] ========================================');
            console.log(`[LeagueMapping] Summary:`);
            console.log(`  - New mappings added: ${newMappingsCount}`);
            console.log(`  - Already exists (skipped): ${skippedCount}`);
            console.log(`  - No match found: ${notFoundCount}`);
            console.log(`  - Total processed: ${processedCount}`);
            console.log('[LeagueMapping] ========================================');
            
            // ✅ REMOVED: generateLeagueUtils() call
            // Frontend now fetches league mapping from backend API
            // No need to generate client-side files anymore
            
            console.log('[LeagueMapping] ========================================');
            console.log(''); // Empty line for better readability

            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            const result = {
                success: true,
                newMappings: newMappingsCount,
                skipped: skippedCount,
                notFound: notFoundCount,
                duration: `${duration}s`
            };
            
            console.log(`[LeagueMapping] ⏰ Total execution time: ${duration} seconds`);
            console.log(`[LeagueMapping] ⏰ End time: ${new Date().toISOString()}`);
            
            // ✅ REMOVED: Cloudinary upload - using local files only for testing
            // Upload CSV files to Cloudinary after job completes
            // try {
            //     const uploadResult = await this.uploadCsvToCloudinary();
            //     if (uploadResult.success) {
            //         console.log('[LeagueMapping] ☁️ CSV files uploaded to Cloudinary successfully');
            //         result.cloudinaryUpload = uploadResult;
            //     } else {
            //         console.log('[LeagueMapping] ⚠️ Cloudinary upload skipped or failed:', uploadResult.reason || uploadResult.error);
            //     }
            // } catch (uploadError) {
            //     console.error('[LeagueMapping] ⚠️ Cloudinary upload error (non-blocking):', uploadError.message);
            //     // Don't fail the job if upload fails
            // }
            
            // Ensure we return immediately without any blocking operations
            return result;
        } catch (error) {
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            console.error('[LeagueMapping] ========================================');
            console.error('[LeagueMapping] ❌ League Mapping Auto-Update Failed (Internal)');
            console.error('[LeagueMapping] ========================================');
            console.error(`[LeagueMapping] ⏰ Failed after: ${duration} seconds`);
            console.error(`[LeagueMapping] ⏰ Error time: ${new Date().toISOString()}`);
            console.error('[LeagueMapping] Error:', error.message || error);
            console.error('[LeagueMapping] Stack:', error.stack);
            throw error;
        }
    }
}

export default LeagueMappingAutoUpdate;


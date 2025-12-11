// FotMob Cache Management Controller
// Admin-only endpoints for managing FotMob caches

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Fotmob from '@max-xoo/fotmob';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to storage directory
const STORAGE_PATH = path.join(__dirname, '../../storage/fotmob');

export class FotmobController {
    constructor() {
        try {
            this.fotmob = new Fotmob();
            this.fotmobAvailable = true;
        } catch (error) {
            console.warn('FotMob package not available:', error.message);
            this.fotmob = null;
            this.fotmobAvailable = false;
        }
        this.ensureStorageDir();
    }

    ensureStorageDir() {
        if (!fs.existsSync(STORAGE_PATH)) {
            fs.mkdirSync(STORAGE_PATH, { recursive: true });
        }
    }

    // Clear all FotMob caches
    clearCache = async (req, res) => {
        try {
            const files = ['fotmob_multiday_cache.json', 'fotmob_cache_meta.json'];
            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(STORAGE_PATH, file);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }

            res.json({
                success: true,
                message: `Cleared ${deletedCount} cache files`,
                deletedFiles: files.filter(f => fs.existsSync(path.join(STORAGE_PATH, f)) === false)
            });
        } catch (error) {
            console.error('Error clearing FotMob cache:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to clear cache',
                error: error.message
            });
        }
    };

    // Refresh cache for specific date
    refreshCache = async (req, res) => {
        try {
            if (!this.fotmobAvailable) {
                return res.status(503).json({
                    success: false,
                    message: 'FotMob service not available',
                    error: 'FotMob package not installed or not working'
                });
            }

            const date = req.params.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const dateStr = date.replace(/-/g, ''); // YYYYMMDD

            console.log(`Refreshing FotMob cache for date: ${date} (${dateStr})`);

            // Use direct API call (same as refreshMultidayCache)
            const timezone = 'Asia/Karachi';
            const ccode3 = 'PAK';
            const apiUrl = `https://www.fotmob.com/api/data/matches?date=${dateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;
            
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
            
            console.log(`📡 Calling FotMob API: ${apiUrl}`);
            const response = await axios.get(apiUrl, { headers });
            const apiData = response.data;
            
            // Convert API response format to expected format
            let matches = [];
            if (apiData?.leagues && Array.isArray(apiData.leagues)) {
                // Flatten all matches from all leagues
                apiData.leagues.forEach(league => {
                    if (league.matches && Array.isArray(league.matches)) {
                        matches = matches.concat(league.matches);
                    }
                });
                console.log(`✅ Fetched ${matches.length} matches from ${apiData.leagues.length} leagues`);
            } else {
                console.log(`⚠️ WARNING: API response does not have expected structure`);
                matches = Array.isArray(apiData) ? apiData : [];
            }
            
            // Save to cache file
            const cacheFile = path.join(STORAGE_PATH, `fotmob_matches_${dateStr}_${date}.json`);
            fs.writeFileSync(cacheFile, JSON.stringify(matches, null, 2));

            // Update metadata
            const metaFile = path.join(STORAGE_PATH, 'fotmob_cache_meta.json');
            const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
            meta[date] = {
                lastRefresh: new Date().toISOString(),
                matchCount: Array.isArray(matches) ? matches.length : 0
            };
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

            res.json({
                success: true,
                message: `Cache refreshed for ${date}`,
                matchCount: Array.isArray(matches) ? matches.length : 0,
                cacheFile: cacheFile
            });
        } catch (error) {
            console.error('Error refreshing FotMob cache:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to refresh cache',
                error: error.message
            });
        }
    };

    // Refresh multi-day cache
    refreshMultidayCache = async (req, res) => {
        console.log(`[FotMob] Starting refreshMultidayCache`);
        console.log(`[FotMob] Request body:`, req.body);
        
        try {
            if (!this.fotmobAvailable) {
                console.log(`[FotMob] Service not available`);
                return res.status(503).json({
                    success: false,
                    message: 'FotMob service not available',
                    error: 'FotMob package not installed or not working'
                });
            }

            const days = req.body.days || 20; // Default 20 days (21 total including yesterday)
            const startDate = new Date();
            const cacheData = {};

            console.log(`[FotMob] Building multi-day cache for ${days + 1} days (including 1 previous day)`);
            console.log(`[FotMob] Start date: ${startDate.toISOString()}`);
            console.log(`[FotMob] Days to fetch: ${days + 1}`);

            // Start from yesterday (i = -1) to include previous day
            for (let i = -1; i < days; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
                const dateFormatted = date.toISOString().split('T')[0]; // YYYY-MM-DD format

                console.log(`\n[FotMob] Processing date ${i + 2}/${days + 1}: ${dateFormatted} (${dateStr})`);

                try {
                    console.log(`[FotMob] Calling FotMob API for date: ${dateStr}`);
                    
                    // Use direct API call (same as bet-outcome-calculator.js)
                    const timezone = 'Asia/Karachi';
                    const ccode3 = 'PAK';
                    const apiUrl = `https://www.fotmob.com/api/data/matches?date=${dateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;
                    
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
                    
                    const response = await axios.get(apiUrl, { headers });
                    const apiData = response.data;
                    
                    // API returns: { leagues: [...], date: ... }
                    // Save in correct format: { "20251210": { leagues: [...] } }
                    if (apiData?.leagues && Array.isArray(apiData.leagues)) {
                        const totalMatches = apiData.leagues.reduce((sum, league) => sum + (league.matches?.length || 0), 0);
                        console.log(`✅ Successfully fetched ${totalMatches} matches from ${apiData.leagues.length} leagues for ${dateStr}`);
                        
                        // Save in correct format that getCachedDailyMatches expects
                        cacheData[dateStr] = { leagues: apiData.leagues };
                    } else {
                        console.log(`⚠️ WARNING: API response does not have expected structure`);
                        console.log(`   Response keys:`, apiData ? Object.keys(apiData) : 'null');
                        cacheData[dateStr] = { leagues: [] };
                    }
                    
                    // Add delay to respect rate limits
                    if (i < days - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`❌ ERROR fetching matches for ${dateStr}:`, error.message);
                    console.error(`   Error details:`, {
                        message: error.message,
                        stack: error.stack,
                        dateStr: dateStr,
                        dateFormatted: dateFormatted
                    });
                    cacheData[dateStr] = { leagues: [] };
                    console.log(`⚠️  Set empty leagues for ${dateStr} due to error`);
                }
            }

            console.log(`\n[FotMob] Loop completed. Total dates processed: ${Object.keys(cacheData).length}`);
            console.log(`[FotMob] Cache data summary:`);
            Object.keys(cacheData).forEach(dateKey => {
                const leagues = cacheData[dateKey]?.leagues || [];
                const matchCount = leagues.reduce((sum, league) => sum + (league.matches?.length || 0), 0);
                console.log(`   - ${dateKey}: ${matchCount} matches across ${leagues.length} leagues`);
            });

            // Save multi-day cache
            const multiDayFile = path.join(STORAGE_PATH, 'fotmob_multiday_cache.json');
            fs.writeFileSync(multiDayFile, JSON.stringify(cacheData, null, 2));
            console.log(`✅ Cache file saved successfully`);

            // Update metadata
            const metaFile = path.join(STORAGE_PATH, 'fotmob_cache_meta.json');
            const totalMatches = Object.values(cacheData).reduce((sum, dateData) => {
                const leagues = dateData?.leagues || [];
                return sum + leagues.reduce((leagueSum, league) => leagueSum + (league.matches?.length || 0), 0);
            }, 0);
            const meta = {
                lastRefresh: new Date().toISOString(),
                days: days + 1, // Include the previous day
                totalMatches: totalMatches
            };
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
            console.log(`✅ Metadata file saved`);

            const response = {
                success: true,
                message: `Multi-day cache built for ${days + 1} days (including 1 previous day)`,
                totalMatches: meta.totalMatches,
                cacheFile: multiDayFile
            };
            
            if (res && typeof res.json === 'function') {
                res.json(response);
            }
            
            console.log(`[FotMob] refreshMultidayCache completed successfully`);
            return response;
        } catch (error) {
            console.error('❌ ERROR refreshing multi-day cache:', error);
            if (res && typeof res.status === 'function') {
                res.status(500).json({
                    success: false,
                    message: 'Failed to refresh multi-day cache',
                    error: error.message
                });
            }
            throw error;
        }
    };

    // Get cache content
    getCacheContent = async (req, res) => {
        try {
            const multiDayFile = path.join(STORAGE_PATH, 'fotmob_multiday_cache.json');
            
            if (!fs.existsSync(multiDayFile)) {
                return res.json({
                    success: true,
                    message: 'No multi-day cache found',
                    data: {}
                });
            }

            const data = JSON.parse(fs.readFileSync(multiDayFile, 'utf8'));
            
            res.json({
                success: true,
                message: 'Cache content retrieved',
                data: data
            });
        } catch (error) {
            console.error('Error getting cache content:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get cache content',
                error: error.message
            });
        }
    };

    // Get cache analysis
    getCacheAnalysis = async (req, res) => {
        try {
            const multiDayFile = path.join(STORAGE_PATH, 'fotmob_multiday_cache.json');
            
            if (!fs.existsSync(multiDayFile)) {
                return res.json({
                    success: true,
                    message: 'No cache found for analysis',
                    analysis: {
                        totalDays: 0,
                        totalMatches: 0,
                        leagues: [],
                        sampleLeagues: []
                    }
                });
            }

            const data = JSON.parse(fs.readFileSync(multiDayFile, 'utf8'));
            const analysis = this.analyzeCacheData(data);

            res.json({
                success: true,
                message: 'Cache analysis completed',
                analysis: analysis
            });
        } catch (error) {
            console.error('Error analyzing cache:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to analyze cache',
                error: error.message
            });
        }
    };

    // Get cache stats
    getCacheStats = async (req, res) => {
        try {
            const metaFile = path.join(STORAGE_PATH, 'fotmob_cache_meta.json');
            
            if (!fs.existsSync(metaFile)) {
                return res.json({
                    success: true,
                    message: 'No cache metadata found',
                    stats: {
                        lastRefresh: null,
                        totalMatches: 0,
                        days: 0
                    }
                });
            }

            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            
            res.json({
                success: true,
                message: 'Cache stats retrieved',
                stats: meta
            });
        } catch (error) {
            console.error('Error getting cache stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get cache stats',
                error: error.message
            });
        }
    };

    // Trigger auto-refresh
    triggerAutoRefresh = async (req, res) => {
        try {
            // This would typically start a background job
            // For now, just refresh today's cache
            const today = new Date().toISOString().split('T')[0];
            await this.refreshCache({ params: { date: today } }, { json: () => {} });

            res.json({
                success: true,
                message: 'Auto-refresh triggered',
                refreshedDate: today
            });
        } catch (error) {
            console.error('Error triggering auto-refresh:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to trigger auto-refresh',
                error: error.message
            });
        }
    };

    // Get auto-refresh status
    getAutoRefreshStatus = async (req, res) => {
        try {
            // This would check if auto-refresh is running
            // For now, return a simple status
            res.json({
                success: true,
                message: 'Auto-refresh status retrieved',
                status: {
                    enabled: false,
                    lastRun: null,
                    nextRun: null
                }
            });
        } catch (error) {
            console.error('Error getting auto-refresh status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get auto-refresh status',
                error: error.message
            });
        }
    };

    // Test endpoint to fetch and summarize FotMob matches
    testFotmob = async (req, res) => {
        try {
            if (!this.fotmobAvailable) {
                return res.status(503).json({
                    success: false,
                    message: 'FotMob service not available',
                    error: 'FotMob package not installed or not working'
                });
            }

            const date = req.params.date || new Date().toISOString().split('T')[0];
            const dateStr = date.replace(/-/g, '');

            console.log(`Testing FotMob API for date: ${date}`);

            const matches = await this.fotmob.getMatchesByDate(dateStr);
            
            // Summarize the matches
            const summary = {
                date: date,
                totalMatches: Array.isArray(matches) ? matches.length : 0,
                leagues: [],
                sampleMatches: []
            };

            if (Array.isArray(matches)) {
                const leagueMap = new Map();
                matches.slice(0, 10).forEach(match => {
                    const league = match.league?.name || 'Unknown League';
                    leagueMap.set(league, (leagueMap.get(league) || 0) + 1);
                    
                    if (summary.sampleMatches.length < 5) {
                        summary.sampleMatches.push({
                            id: match.id,
                            home: match.home?.name || 'Home',
                            away: match.away?.name || 'Away',
                            league: league,
                            start: match.startTimestamp
                        });
                    }
                });

                summary.leagues = Array.from(leagueMap.entries()).map(([name, count]) => ({ name, count }));
            }

            res.json({
                success: true,
                message: `FotMob test completed for ${date}`,
                summary: summary
            });
        } catch (error) {
            console.error('Error testing FotMob:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to test FotMob API',
                error: error.message
            });
        }
    };

    // Helper method to analyze cache data
    analyzeCacheData(data) {
        const analysis = {
            totalDays: Object.keys(data).length,
            totalMatches: 0,
            leagues: new Map(),
            sampleLeagues: []
        };

        Object.values(data).forEach(matches => {
            if (Array.isArray(matches)) {
                analysis.totalMatches += matches.length;
                
                matches.forEach(match => {
                    const league = match.league?.name || 'Unknown League';
                    analysis.leagues.set(league, (analysis.leagues.get(league) || 0) + 1);
                });
            }
        });

        analysis.sampleLeagues = Array.from(analysis.leagues.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        return analysis;
    }
}

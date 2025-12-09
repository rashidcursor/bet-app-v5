import Fotmob from '@max-xoo/fotmob';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchFotmobDataForDate(dateStr = null) {
    try {
        // Use provided date, or default to today, or fallback to Nov 26, 2025
        if (!dateStr) {
            // Try to get date from command line args
            const args = process.argv.slice(2);
            if (args.length > 0) {
                dateStr = args[0];
            } else {
                // Default to today's date
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                dateStr = `${year}${month}${day}`;
            }
        }
        
        // Validate date format
        if (!/^\d{8}$/.test(dateStr)) {
            console.error('❌ Invalid date format. Please use YYYYMMDD format (e.g., 20251126)');
            process.exit(1);
        }
        
        // Parse date for display
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const displayDate = `${year}-${month}-${day}`;
        
        console.log(`📡 Fetching Fotmob data for ${displayDate} (${dateStr})...`);
        
        // First, check if we have cached data for this date
        const storageDir = path.join(__dirname, 'storage/fotmob');
        const multiDayCacheFile = path.join(storageDir, 'fotmob_multiday_cache.json');
        let useCache = false;
        let cachedData = null;
        
        if (fs.existsSync(multiDayCacheFile)) {
            const cacheData = JSON.parse(fs.readFileSync(multiDayCacheFile, 'utf8'));
            if (cacheData[dateStr]) {
                cachedData = cacheData[dateStr];
                if (Array.isArray(cachedData) && cachedData.length > 0) {
                    console.log(`✅ Found cached data for ${dateStr} (${cachedData.length} items)`);
                    console.log(`💡 Using cached data instead of fetching from API`);
                    useCache = true;
                } else {
                    console.log(`⚠️ Cache exists but is empty for ${dateStr}, trying API...`);
                }
            }
        }
        
        // Try to fetch from API if cache is not available or empty
        let data = null;
        if (!useCache) {
            try {
                // Use direct API call with correct endpoint and parameters
                // Correct endpoint: /api/data/matches (not /api/matches)
                const timezone = 'Asia/Karachi'; // Default timezone
                const ccode3 = 'PAK'; // Default country code
                
                console.log(`📡 Calling correct Fotmob API endpoint...`);
                const apiUrl = `https://www.fotmob.com/api/data/matches?date=${dateStr}&timezone=${encodeURIComponent(timezone)}&ccode3=${ccode3}`;
                
                // First, get x-mas token (required for authentication)
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
                data = response.data;
                console.log(`✅ Successfully fetched from Fotmob API (correct endpoint)`);
            } catch (apiError) {
                console.error(`❌ API Error: ${apiError.message}`);
                if (apiError.response) {
                    console.error(`   Status: ${apiError.response.status}`);
                    console.error(`   Status Text: ${apiError.response.statusText}`);
                }
                
                // Fallback: Try using the package method (old endpoint)
                console.log(`🔄 Trying fallback: Using Fotmob package method...`);
                try {
        const fotmob = new Fotmob();
                    data = await fotmob.getMatchesByDate(dateStr);
                    console.log(`✅ Successfully fetched using package fallback`);
                } catch (fallbackError) {
                    console.error(`❌ Fallback also failed: ${fallbackError.message}`);
                    
                    // If API fails, try to use cache even if empty
                    if (cachedData !== null) {
                        console.log(`💡 Using cached data (even if empty) as fallback`);
                        data = cachedData;
                    } else {
                        // Check if date is in the future
                        const dateObj = new Date(`${year}-${month}-${day}`);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        dateObj.setHours(0, 0, 0, 0);
                        
                        if (dateObj > today) {
                            console.error(`💡 Date ${displayDate} is in the future. Fotmob API may not have data for future dates.`);
                            console.error(`💡 Try using a past date or wait until the match date approaches.`);
                        }
                        
                        throw apiError; // Re-throw if we couldn't get any data
                    }
                }
            }
        } else {
            data = cachedData;
        }
        
        console.log('📦 Raw data type:', Array.isArray(data) ? 'Array' : typeof data);
        console.log('📦 Raw data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            console.log('📦 Data structure:', JSON.stringify(data, null, 2).substring(0, 500));
        }
        
        if (data) {
            // Ensure storage directory exists
            const storageDir = path.join(__dirname, 'storage/fotmob');
            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir, { recursive: true });
            }
            
            // Save to multi-day cache format
            const outputPath = path.join(storageDir, 'fotmob_multiday_cache.json');
            
            // API returns { leagues: [...], date: ... }
            // Convert to multi-day cache format: { "20251126": { leagues: [...] } }
            let leagues = [];
            
            if (data.leagues && Array.isArray(data.leagues)) {
                leagues = data.leagues.map(league => {
                    // Convert matches to expected format
                    const matches = (league.matches || []).map(match => {
                        // Parse time string (format: "26.11.2025 18:45")
                        let utcTime = null;
                        if (match.time) {
                            const timeStr = match.time;
                            if (timeStr.includes('.') && timeStr.split('.').length === 3) {
                                const [datePart, timePart] = timeStr.split(' ');
                                const [day, month, year] = datePart.split('.');
                                const isoFormat = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}:00.000Z`;
                                utcTime = isoFormat;
                            }
                        }
                        
                        return {
                            id: String(match.id),
                            home: {
                                name: match.home?.name || match.home?.longName,
                                id: match.home?.id
                            },
                            away: {
                                name: match.away?.name || match.away?.longName,
                                id: match.away?.id
                            },
                            status: {
                                utcTime: utcTime || match.status?.utcTime,
                                finished: match.status?.finished || match.finished || (match.home?.score !== undefined && match.away?.score !== undefined),
                                started: match.status?.started || match.started || false,
                                scoreStr: match.status?.scoreStr || (match.home?.score !== undefined && match.away?.score !== undefined ? `${match.home.score} - ${match.away.score}` : null),
                                reason: match.status?.reason || (match.finished ? { short: 'FT', long: 'Full-Time' } : null)
                            },
                            time: match.time,
                            leagueId: league.id || league.primaryId,
                            leagueName: league.name
                        };
                    });
                    
                    return {
                        id: league.primaryId || league.id,
                        name: league.name,
                        country: league.ccode || 'INT',
                        matches: matches
                    };
                });
            }
            
            // Convert to multi-day cache format
            const cacheData = {
                [dateStr]: {
                    leagues: leagues
                }
            };
            
            // If file exists, merge with existing data
            if (fs.existsSync(outputPath)) {
                const existingData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
                const mergedData = { ...existingData, ...cacheData };
                fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));
                console.log('✅ Successfully merged Fotmob data into multi-day cache');
            } else {
                fs.writeFileSync(outputPath, JSON.stringify(cacheData, null, 2));
                console.log('✅ Successfully saved Fotmob data to multi-day cache');
            }
            
            const totalMatches = leagues.reduce((sum, league) => sum + (league.matches?.length || 0), 0);
            console.log(`📊 Total matches found: ${totalMatches} across ${leagues.length} leagues`);
            
            // Check if our target match (PSG vs Tottenham) is in the data
            let targetMatch = null;
            for (const league of leagues) {
                targetMatch = league.matches?.find(match => 
                    (match.home?.name?.includes('Paris') || match.home?.name?.includes('PSG') || match.home?.name?.includes('Saint-Germain')) &&
                    (match.away?.name?.includes('Tottenham') || match.away?.name?.includes('Spurs'))
                );
                if (targetMatch) {
                    targetMatch.league = league;
                    break;
                }
            }
                
                if (targetMatch) {
                    console.log('🎯 Found target match:');
                    console.log(`   - ${targetMatch.home?.name} vs ${targetMatch.away?.name}`);
                    console.log(`   - League: ${targetMatch.league?.name}`);
                console.log(`   - Score: ${targetMatch.status?.scoreStr || 'N/A'}`);
                } else {
                console.log('❌ Target match (PSG vs Tottenham) not found');
                console.log('📋 Available leagues and matches:');
                leagues.slice(0, 5).forEach((league, index) => {
                    console.log(`   ${index + 1}. ${league.name} (${league.matches?.length || 0} matches)`);
                    league.matches?.slice(0, 3).forEach((match, mIndex) => {
                        console.log(`      - ${match.home?.name} vs ${match.away?.name}`);
                    });
                });
            }
        } else {
            console.log('❌ No data received from Fotmob API');
        }
        
    } catch (error) {
        console.error('❌ Error fetching Fotmob data:', error.message);
        
        if (error.message.includes('404')) {
            console.error('💡 This usually means:');
            console.error('   1. The date is too far in the future (API may not have data yet)');
            console.error('   2. The date is too far in the past (data may have been removed)');
            console.error('   3. No matches were scheduled for this date');
            console.error('');
            console.error('💡 Try using a recent date:');
            const today = new Date();
            const recentDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            console.error(`   node fetch-fotmob-sept24.js ${recentDate}`);
        } else if (error.message.includes('HTTP error')) {
            console.error('💡 HTTP error - the Fotmob API may be temporarily unavailable');
        }
        
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the fetch
// Usage: node fetch-fotmob-sept24.js [YYYYMMDD]
// Example: node fetch-fotmob-sept24.js 20251126
// If no date provided, uses today's date
fetchFotmobDataForDate();

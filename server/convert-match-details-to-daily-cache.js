/**
 * Script to convert Fotmob match details JSON to daily matches cache format
 * Usage: node convert-match-details-to-daily-cache.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the match details file
const matchDetailsFile = path.join(__dirname, 'fot_mob+response_psgvsTottenham.json');
const matchDetails = JSON.parse(fs.readFileSync(matchDetailsFile, 'utf8'));

// Extract match information
const general = matchDetails.general;
const header = matchDetails.header;

// Convert to daily matches format
const match = {
    id: general.matchId,
    home: {
        name: general.homeTeam.name,
        id: general.homeTeam.id
    },
    away: {
        name: general.awayTeam.name,
        id: general.awayTeam.id
    },
    status: {
        utcTime: general.matchTimeUTCDate,
        finished: general.finished,
        started: general.started,
        scoreStr: header?.status?.scoreStr || `${header?.teams?.[0]?.score || 0} - ${header?.teams?.[1]?.score || 0}`,
        reason: header?.status?.reason || { short: general.finished ? 'FT' : 'LIVE' }
    },
    time: general.matchTimeUTC,
    leagueId: general.parentLeagueId || general.leagueId,
    leagueName: general.leagueName
};

// Create league object
const league = {
    id: general.parentLeagueId || general.leagueId,
    name: general.leagueName,
    country: general.countryCode,
    matches: [match]
};

// Create daily cache format
const dateStr = '20251126'; // Nov 26, 2025
const dailyCache = {
    [dateStr]: {
        leagues: [league]
    }
};

// Save to cache file
const cacheFile = path.join(__dirname, 'storage/fotmob/fotmob_nov26_psg_tottenham.json');
fs.writeFileSync(cacheFile, JSON.stringify(dailyCache, null, 2));

console.log('✅ Converted match details to daily cache format');
console.log(`📁 Saved to: ${cacheFile}`);
console.log(`📊 League: ${league.name} (ID: ${league.id})`);
console.log(`⚽ Match: ${match.home.name} vs ${match.away.name} (ID: ${match.id})`);
console.log(`📅 Date: ${dateStr}`);










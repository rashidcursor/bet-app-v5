#!/usr/bin/env node
// Script to fetch Fotmob data for a specific date and save to file
// Usage: node fetch-fotmob-date.mjs YYYYMMDD
// Example: node fetch-fotmob-date.mjs 20251002

import Fotmob from '@max-xoo/fotmob';
import fs from 'fs';
import path from 'path';

// Get command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('❌ Error: Please provide a date');
    console.log('📋 Usage: node fetch-fotmob-date.mjs YYYYMMDD');
    console.log('📋 Example: node fetch-fotmob-date.mjs 20251002');
    process.exit(1);
}

const dateStr = args[0];

// Validate date format
if (!/^\d{8}$/.test(dateStr)) {
    console.log('❌ Error: Invalid date format');
    console.log('📋 Please use YYYYMMDD format (e.g., 20251002)');
    process.exit(1);
}

// Parse and validate date
const year = parseInt(dateStr.substring(0, 4));
const month = parseInt(dateStr.substring(4, 6));
const day = parseInt(dateStr.substring(6, 8));

if (year < 2020 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
    console.log('❌ Error: Invalid date values');
    console.log('📋 Please check year (2020-2030), month (01-12), and day (01-31)');
    process.exit(1);
}

const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
const outputFileName = `fotmob_${dateStr}_response.json`;

async function fetchFotmobData() {
    try {
        console.log(`🔍 Initializing Fotmob...`);
        const fotmob = new Fotmob();
        
        console.log(`📡 Fetching matches for ${dateStr} (${formattedDate})...`);
        const matches = await fotmob.getMatchesByDate(dateStr);
        
        if (!matches) {
            console.log('❌ No data returned from Fotmob API');
            process.exit(1);
        }
        
        console.log(`💾 Saving response to ${outputFileName}...`);
        fs.writeFileSync(outputFileName, JSON.stringify(matches, null, 2));
        
        // Display summary
        const leagues = matches.leagues || matches;
        if (Array.isArray(leagues)) {
            const totalMatches = leagues.reduce((sum, league) => {
                return sum + (league.matches ? league.matches.length : 0);
            }, 0);
            
            console.log(`✅ Success!`);
            console.log(`📊 Summary:`);
            console.log(`   - Date: ${formattedDate}`);
            console.log(`   - Total leagues: ${leagues.length}`);
            console.log(`   - Total matches: ${totalMatches}`);
            console.log(`   - Output file: ${outputFileName}`);
            console.log(`   - File size: ${(fs.statSync(outputFileName).size / 1024).toFixed(1)} KB`);
            
            // Show top 5 leagues with most matches
            const leaguesWithMatches = leagues
                .filter(league => league.matches && league.matches.length > 0)
                .sort((a, b) => (b.matches?.length || 0) - (a.matches?.length || 0))
                .slice(0, 5);
                
            if (leaguesWithMatches.length > 0) {
                console.log(`🏆 Top leagues by match count:`);
                leaguesWithMatches.forEach((league, index) => {
                    console.log(`   ${index + 1}. ${league.name} (${league.matches.length} matches)`);
                });
            }
        } else {
            console.log(`✅ Success! Data saved to ${outputFileName}`);
            console.log(`📋 Response keys: ${Object.keys(matches).join(', ')}`);
        }
        
    } catch (error) {
        console.error('❌ Error fetching Fotmob data:', error.message);
        
        if (error.message.includes('Invalid value for key')) {
            console.error('📋 This might be a Fotmob API format issue');
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
            console.error('📋 This appears to be a network connectivity issue');
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            console.error('📋 No data available for this date');
        }
        
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the script
fetchFotmobData();

import Fotmob from '@max-xoo/fotmob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fetch match details for a specific match ID
 * Usage: node fetch-fotmob-match-details.js <matchId>
 * Example: node fetch-fotmob-match-details.js 4947156
 */
async function fetchMatchDetails(matchId) {
    try {
        if (!matchId) {
            // Try to get from command line args
            const args = process.argv.slice(2);
            if (args.length > 0) {
                matchId = args[0];
            } else {
                console.error('❌ Error: Please provide a match ID');
                console.error('📋 Usage: node fetch-fotmob-match-details.js <matchId>');
                console.error('📋 Example: node fetch-fotmob-match-details.js 4947156');
                process.exit(1);
            }
        }

        matchId = String(matchId).trim();
        console.log(`📡 Fetching Fotmob match details for match ID: ${matchId}...`);

        const fotmob = new Fotmob();
        const matchDetails = await fotmob.getMatchDetails(Number(matchId));

        if (!matchDetails) {
            console.error('❌ No data returned from Fotmob API');
            process.exit(1);
        }

        console.log('✅ Successfully fetched match details!');
        console.log(`📊 Match: ${matchDetails?.general?.matchName || 'N/A'}`);
        console.log(`   Home: ${matchDetails?.header?.teams?.[0]?.name || 'N/A'} (${matchDetails?.header?.teams?.[0]?.score || 0})`);
        console.log(`   Away: ${matchDetails?.header?.teams?.[1]?.name || 'N/A'} (${matchDetails?.header?.teams?.[1]?.score || 0})`);
        console.log(`   Status: ${matchDetails?.header?.status?.scoreStr || 'N/A'}`);

        // Save to file
        const storageDir = path.join(__dirname, 'storage/fotmob');
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        const outputFile = path.join(storageDir, `fotmob_match_${matchId}_details.json`);
        fs.writeFileSync(outputFile, JSON.stringify(matchDetails, null, 2));

        console.log(`\n💾 Match details saved to: ${outputFile}`);
        console.log(`📦 File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);

        // Show some stats
        if (matchDetails?.content?.playerStats) {
            const playerCount = Object.keys(matchDetails.content.playerStats).length;
            console.log(`👥 Players in stats: ${playerCount}`);
        }

        if (matchDetails?.content?.shotmap) {
            const shotCount = matchDetails.content.shotmap.length;
            console.log(`⚽ Shots in match: ${shotCount}`);
        }

        if (matchDetails?.header?.events?.events) {
            const eventCount = matchDetails.header.events.events.length;
            console.log(`📋 Events in match: ${eventCount}`);
        }

        return matchDetails;

    } catch (error) {
        console.error('❌ Error fetching match details:', error.message);
        
        if (error.message.includes('404')) {
            console.error('💡 Match ID not found. Please verify the match ID is correct.');
        } else if (error.message.includes('401')) {
            console.error('💡 Authentication error. The Fotmob package should handle this automatically.');
        }
        
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the fetch
fetchMatchDetails();




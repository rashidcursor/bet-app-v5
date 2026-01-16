import "dotenv/config";
import connectDB from '../config/database.js';
import LeagueMapping from '../models/LeagueMapping.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Remove league mappings added in the last X hours
 * Usage: node src/scripts/removeRecentLeagueMappings.js [hours] [--force]
 * Example: node src/scripts/removeRecentLeagueMappings.js 2 --force
 */
async function removeRecentLeagueMappings() {
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        let hours = 1; // Default: 1 hour
        let force = false;

        for (const arg of args) {
            if (arg === '--force') {
                force = true;
            } else if (!isNaN(parseFloat(arg)) && isFinite(arg)) {
                hours = parseFloat(arg);
            }
        }

        console.log('🔄 Starting removal of recent league mappings...');
        console.log(`⏰ Will remove leagues added in the last ${hours} hour(s)`);
        console.log(`📍 Using PKT (Asia/Karachi) time for comparison\n`);

        // Connect to database
        await connectDB();
        console.log('✅ Connected to MongoDB\n');

        // Get current time
        const now = new Date();
        
        // Get current PKT time string for display
        const nowPKTStr = now.toLocaleString("en-US", { 
            timeZone: "Asia/Karachi",
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        // ✅ FIX: Calculate cutoff time based on PKT time, not UTC
        // Step 1: Get current PKT time components
        const nowPKT = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
        
        // Step 2: Calculate cutoff PKT time (current PKT - hours)
        const cutoffPKTMs = nowPKT.getTime() - (hours * 60 * 60 * 1000);
        
        // Step 3: Create a Date object for cutoff PKT time
        // We need to interpret this as PKT time and convert to UTC for MongoDB query
        // Get PKT timezone offset (usually +5 hours = +18000000 ms)
        const nowUTC = new Date();
        const nowPKTFormatted = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
        const pktOffset = nowPKTFormatted.getTime() - nowUTC.getTime();
        
        // Step 4: Calculate cutoff UTC time (cutoff PKT time - PKT offset)
        const cutoffTime = new Date(cutoffPKTMs - pktOffset);
        
        // Convert cutoff UTC to PKT for display
        const cutoffPKTStr = cutoffTime.toLocaleString("en-US", { 
            timeZone: "Asia/Karachi",
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        console.log(`📅 Current PKT time: ${nowPKTStr} (UTC: ${nowUTC.toISOString()})`);
        console.log(`📅 Cutoff PKT time: ${cutoffPKTStr} (UTC: ${cutoffTime.toISOString()})`);
        console.log(`   (Leagues created after this time will be removed)\n`);

        // Find leagues created after cutoff time (MongoDB stores UTC internally)
        const recentLeagues = await LeagueMapping.find({
            createdAt: { $gte: cutoffTime }
        }).sort({ createdAt: -1 }); // Newest first

        console.log(`📋 Found ${recentLeagues.length} league(s) created in the last ${hours} hour(s):\n`);

        if (recentLeagues.length === 0) {
            console.log('ℹ️  No recent leagues found to remove');
            process.exit(0);
        }

        // Display leagues that will be deleted
        console.log('📝 Leagues to be deleted:');
        console.log('─'.repeat(100));
        recentLeagues.forEach((league, index) => {
            // Convert UTC createdAt to PKT for display
            const createdPKT = league.createdAt.toLocaleString("en-US", { 
                timeZone: "Asia/Karachi",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            console.log(`${index + 1}. Unibet: "${league.unibetName}" (ID: ${league.unibetId})`);
            console.log(`   Fotmob: "${league.fotmobName}" (ID: ${league.fotmobId})`);
            console.log(`   Country: ${league.country || 'N/A'}`);
            console.log(`   Match Type: ${league.matchType}`);
            console.log(`   Created At (PKT): ${createdPKT} (UTC: ${league.createdAt.toISOString()})`);
            console.log('');
        });
        console.log('─'.repeat(100));

        // Confirmation
        if (!force) {
            console.log(`⚠️  WARNING: This will delete ${recentLeagues.length} league mapping(s) from the database.`);
            console.log(`   To skip confirmation, use: node src/scripts/removeRecentLeagueMappings.js ${hours} --force\n`);
            
            // In a script, we'll just proceed after logging (can't use readline easily in ESM)
            // For safety, require --force flag by default or add a small delay
            console.log('⏳ Proceeding in 3 seconds... (Press Ctrl+C to cancel)\n');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Delete from database
        let deletedCount = 0;
        console.log('🗑️  Deleting leagues from database...\n');

        for (const league of recentLeagues) {
            try {
                await LeagueMapping.deleteOne({ _id: league._id });
                console.log(`✅ Deleted: ${league.unibetName} (Unibet ID: ${league.unibetId})`);
                deletedCount++;
            } catch (error) {
                console.error(`❌ Error deleting ${league.unibetName}: ${error.message}`);
            }
        }

        console.log('\n✅ Removal complete!');
        console.log(`📊 Summary:`);
        console.log(`   - Found: ${recentLeagues.length} league(s)`);
        console.log(`   - Deleted: ${deletedCount} league(s) from database`);
        console.log(`   - Cutoff time (PKT): ${cutoffPKTStr} (UTC: ${cutoffTime.toISOString()})`);
        console.log(`   - Current time (PKT): ${nowPKTStr} (UTC: ${nowUTC.toISOString()})`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Removal failed:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run removal
removeRecentLeagueMappings();

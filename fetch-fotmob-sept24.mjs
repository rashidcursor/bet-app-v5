import Fotmob from 'fotmob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchFotmobDataForSept24() {
    try {
        console.log('📡 Fetching Fotmob data for September 24, 2025...');
        
        const fotmob = new Fotmob();
        const dateStr = '20250924'; // September 24, 2025
        const data = await fotmob.getMatchesByDate(dateStr);
        
        if (data) {
            // Save to longest-cache.json (fotmob-24.json)
            const outputPath = path.join(__dirname, 'server/storage/fotmob/longest-cache.json');
            fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
            
            console.log('✅ Successfully saved Fotmob data to longest-cache.json');
            console.log(`📊 Total matches found: ${Array.isArray(data) ? data.length : 'Unknown'}`);
            
            // Check if our target match is in the data
            if (Array.isArray(data)) {
                const targetMatch = data.find(match => 
                    (match.home?.name?.includes('Atlético Mineiro') || match.home?.name?.includes('Mineiro')) &&
                    (match.away?.name?.includes('Bolívar') || match.away?.name?.includes('Bolivar'))
                );
                
                if (targetMatch) {
                    console.log('🎯 Found target match:');
                    console.log(`   - ${targetMatch.home?.name} vs ${targetMatch.away?.name}`);
                    console.log(`   - League: ${targetMatch.league?.name}`);
                    console.log(`   - Score: ${targetMatch.home?.score} - ${targetMatch.away?.score}`);
                } else {
                    console.log('❌ Target match (Atlético Mineiro vs Club Bolívar) not found');
                    console.log('📋 Available matches:');
                    data.slice(0, 10).forEach((match, index) => {
                        console.log(`   ${index + 1}. ${match.home?.name} vs ${match.away?.name} (${match.league?.name})`);
                    });
                }
            }
        } else {
            console.log('❌ No data received from Fotmob API');
        }
        
    } catch (error) {
        console.error('❌ Error fetching Fotmob data:', error.message);
    }
}

// Run the fetch
fetchFotmobDataForSept24();

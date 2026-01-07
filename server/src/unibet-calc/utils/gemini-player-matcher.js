import { GoogleGenAI } from '@google/genai';

/**
 * Use Gemini AI to match player name when normal matching fails
 * This is a fallback when similarity score is too low or player not found
 */
export async function findPlayerWithGemini(matchDetails, participantName) {
    // Get both API keys
    const geminiApiKey1 = process.env.GEMINI_API_KEY_1;
    const geminiApiKey2 = process.env.GEMINI_API_KEY_2;
    
    if (!geminiApiKey1 && !geminiApiKey2) {
        console.log(`   ⚠️ No Gemini API keys found (GEMINI_API_KEY_1 or GEMINI_API_KEY_2), skipping Gemini fallback`);
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
        console.log(`   ⚠️ No valid Gemini API keys found, skipping Gemini fallback`);
        return null;
    }

    let lastError = null;

    for (let i = 0; i < apiKeys.length; i++) {
        const { key: geminiApiKey, name: keyName } = apiKeys[i];
        
        try {
            console.log(`   🤖 Using Gemini AI fallback (${keyName}) to find player: "${participantName}"`);
            
            // Extract all team players from matchDetails
            const allPlayers = [];
            
            // Method 1: Extract from playerStats
            const playerStats = matchDetails?.content?.playerStats || matchDetails?.playerStats || {};
            for (const [id, player] of Object.entries(playerStats)) {
                if (player?.name) {
                    allPlayers.push({
                        id: id,
                        name: player.name,
                        team: player.team || 'Unknown'
                    });
                }
            }
            
            // Method 2: Extract from lineups if available
            if (matchDetails?.lineups && Array.isArray(matchDetails.lineups)) {
                for (const lineup of matchDetails.lineups) {
                    if (lineup?.player_name && lineup?.player_id) {
                        // Avoid duplicates
                        if (!allPlayers.find(p => p.id === String(lineup.player_id))) {
                            allPlayers.push({
                                id: String(lineup.player_id),
                                name: lineup.player_name,
                                team: lineup.team || 'Unknown'
                            });
                        }
                    }
                }
            }
            
            // Method 3: Extract from shotmap
            const globalShotmap = Array.isArray(matchDetails?.shotmap)
                ? matchDetails.shotmap
                : (Array.isArray(matchDetails?.header?.events?.shotmap)
                    ? matchDetails.header.events.shotmap
                    : null);
            
            if (Array.isArray(globalShotmap)) {
                for (const shot of globalShotmap) {
                    const playerId = shot?.playerId || shot?.shotmapEvent?.playerId;
                    const playerName = shot?.playerName;
                    if (playerId && playerName) {
                        // Avoid duplicates
                        if (!allPlayers.find(p => p.id === String(playerId))) {
                            allPlayers.push({
                                id: String(playerId),
                                name: playerName,
                                team: 'Unknown'
                            });
                        }
                    }
                }
            }
            
            if (allPlayers.length === 0) {
                console.log(`   ⚠️ No players found in match data for Gemini matching`);
                return null;
            }
            
            console.log(`   📋 Found ${allPlayers.length} players in match data for Gemini matching`);
            
            // Initialize Gemini with current API key
            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            
            // Create prompt - Simple and direct
            const playersList = allPlayers.map((p, idx) => `${idx + 1}. ID: ${p.id}, Name: "${p.name}"${p.team !== 'Unknown' ? `, Team: ${p.team}` : ''}`).join('\n');
            
            const prompt = `Player name from bet: "${participantName}"

This player name might be written differently in Fotmob data, but it's the same player. Find the matching player from this list:

${playersList}

Return ONLY the player ID number if you find a match, or "NO_MATCH" if not found.

Example: If player name is "K. Etta" and list has "Karl Etta" with ID 1234567, return: 1234567`;

            console.log(`   📤 Sending request to Gemini Flash 2.5 (${keyName})...`);
            // Use new API: ai.models.generateContent
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            
            // Extract text from response (new API structure)
            const text = (response.text || '').trim();
            
            console.log(`   📥 Gemini response (${keyName}): "${text}"`);
            
            // Parse response
            if (text === 'NO_MATCH' || text.toLowerCase().includes('no match')) {
                console.log(`   ❌ Gemini could not find a match`);
                return null;
            }
            
            // Try to extract player ID from response
            const playerIdMatch = text.match(/\d+/);
            if (playerIdMatch) {
                const matchedPlayerId = Number(playerIdMatch[0]);
                const matchedPlayer = allPlayers.find(p => p.id === String(matchedPlayerId));
                
                if (matchedPlayer) {
                    console.log(`   ✅ Gemini matched (${keyName}): "${matchedPlayer.name}" (ID: ${matchedPlayerId})`);
                    return matchedPlayerId;
                } else {
                    console.log(`   ⚠️ Gemini returned ID ${matchedPlayerId} but player not found in our list`);
                    return null;
                }
            }
            
            console.log(`   ⚠️ Could not parse player ID from Gemini response`);
            return null;
            
        } catch (error) {
            lastError = error;
            console.error(`   ❌ Gemini API error (${keyName}):`, error.message);
            
            // Check if it's a quota error and we have another key to try
            if (isQuotaError(error) && i < apiKeys.length - 1) {
                console.log(`   ⚠️ Quota error with ${keyName}, trying fallback key...`);
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
        console.error(`   ❌ All Gemini API keys exhausted quota`);
    }
    return null;
}


// FotMob helper utilities for extracting standardized data from match details

// Normalize team/player name for comparison
export function normalizeTeamName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Calculate similarity score between two names (0-1)
export function calculateNameSimilarity(name1, name2) {
    const norm1 = normalizeTeamName(name1);
    const norm2 = normalizeTeamName(name2);

    if (norm1 === norm2) return 1.0;

    // Check if one name contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;

    // Special handling for common abbreviations and name variations
    const nameVariations = {
        'psg': ['paris saint germain', 'paris saintgermain', 'paris st germain'],
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
    const checkVariations = (n1, n2) => {
        const variations1 = nameVariations[n1] || [];
        const variations2 = nameVariations[n2] || [];
        
        if (variations1.includes(n2) || variations2.includes(n1)) {
            return true;
        }
        
        if (variations1.some(v => n2.includes(v) || v.includes(n2))) {
            return true;
        }
        if (variations2.some(v => n1.includes(v) || v.includes(n1))) {
            return true;
        }
        
        return false;
    };

    if (checkVariations(norm1, norm2)) {
        return 0.85; // High score for abbreviation/variation matches
    }

    // Calculate Levenshtein distance
    const distance = levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);

    if (maxLength === 0) return 0;

    return 1 - (distance / maxLength);
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
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

    return matrix[len2][len1];
}

// Check if two names match using similarity calculation
export function namesMatch(name1, name2, threshold = 0.6) {
    if (!name1 || !name2) return false;
    const similarity = calculateNameSimilarity(name1, name2);
    return similarity >= threshold;
}

// Normalize Unibet numeric line (e.g., 7500 -> 7.5)
export function normalizeLine(rawLine) {
    if (rawLine === null || rawLine === undefined) return null;
    const n = Number(rawLine);
    if (Number.isNaN(n)) return null;
    return n / 1000;
}

export function getFinalScore(matchDetails) {
    const homeScore = Number(matchDetails?.header?.teams?.[0]?.score ?? 0);
    const awayScore = Number(matchDetails?.header?.teams?.[1]?.score ?? 0);
    return { homeScore, awayScore };
}

export function getTeamNames(matchDetails) {
    const homeName = matchDetails?.general?.homeTeam?.name || matchDetails?.header?.teams?.[0]?.name || 'Home';
    const awayName = matchDetails?.general?.awayTeam?.name || matchDetails?.header?.teams?.[1]?.name || 'Away';
    return { homeName, awayName };
}

function flattenEventMap(eventMap) {
    // FotMob events like goals/cards are grouped by player name -> [events]
    if (!eventMap || typeof eventMap !== 'object') return [];
    const arrays = Object.values(eventMap).filter(Array.isArray);
    return arrays.flat();
}

export function getGoalEvents(matchDetails) {
    const home = flattenEventMap(matchDetails?.header?.events?.homeTeamGoals);
    const away = flattenEventMap(matchDetails?.header?.events?.awayTeamGoals);
    const homeGoals = home.map(e => ({ ...e, isHome: true }));
    const awayGoals = away.map(e => ({ ...e, isHome: false }));
    return [...homeGoals, ...awayGoals];
}

export function getCardEvents(matchDetails) {
    // Cards can be in multiple locations:
    // 1. header.events.events (primary location)
    // 2. content.matchFacts.events.events (alternative location)
    // 3. Legacy per-team maps (homeTeamRedCards, awayTeamRedCards, etc.)
    
    let allCardEvents = [];
    
    // Check header.events.events first
    const headerEvents = matchDetails?.header?.events?.events;
    if (Array.isArray(headerEvents)) {
        const headerCards = headerEvents
            .filter(ev => String(ev?.type).toLowerCase() === 'card' && !!ev?.card)
            .map(ev => ({ ...ev, isHome: !!ev?.isHome }));
        allCardEvents.push(...headerCards);
    }
    
    // Check content.matchFacts.events.events (alternative location)
    const matchFactsEvents = matchDetails?.content?.matchFacts?.events?.events;
    if (Array.isArray(matchFactsEvents)) {
        const matchFactsCards = matchFactsEvents
            .filter(ev => String(ev?.type).toLowerCase() === 'card' && !!ev?.card)
            .map(ev => ({ ...ev, isHome: !!ev?.isHome }));
        allCardEvents.push(...matchFactsCards);
    }
    
    // If we found cards in events arrays, return them
    if (allCardEvents.length > 0) {
        return allCardEvents;
    }

    // Fallback to legacy per-team maps if present
    const homeRed = flattenEventMap(matchDetails?.header?.events?.homeTeamRedCards);
    const awayRed = flattenEventMap(matchDetails?.header?.events?.awayTeamRedCards);
    const homeYellow = flattenEventMap(matchDetails?.header?.events?.homeTeamYellowCards);
    const awayYellow = flattenEventMap(matchDetails?.header?.events?.awayTeamYellowCards);

    const homeCards = [...homeRed, ...homeYellow].map(e => ({ ...e, isHome: true }));
    const awayCards = [...awayRed, ...awayYellow].map(e => ({ ...e, isHome: false }));
    return [...homeCards, ...awayCards];
}

// Best-effort absolute minute from event
export function getAbsoluteMinuteFromEvent(event) {
    // Prefer explicit numeric minute if available
    if (typeof event?.time === 'number') {
        // Some feeds already provide absolute minutes across halves
        if (event.time > 45) return event.time;
        const period = String(event?.shotmapEvent?.period || event?.period || '').toLowerCase();
        if (period.includes('second')) return event.time + 45;
        return event.time;
    }
    // Fallback to timeStr if numeric
    const t = Number(event?.timeStr);
    if (!Number.isNaN(t)) return t;
    return null;
}

export function isWithinWindow(absMinute, startInclusive, endInclusive) {
    if (absMinute === null || absMinute === undefined) return false;
    return absMinute >= startInclusive && absMinute <= endInclusive;
}

export function getHalftimeScore(matchDetails) {
    const goals = getGoalEvents(matchDetails);
    let home = 0, away = 0;
    for (const g of goals) {
        const m = getAbsoluteMinuteFromEvent(g);
        const inFirstHalf = m !== null ? m <= 45 : (String(g?.period || '').toLowerCase().includes('first'));
        if (inFirstHalf) {
            if (g.isHome) home++; else away++;
        }
    }
    return { home, away };
}

export function getSecondHalfScore(matchDetails) {
    const goals = getGoalEvents(matchDetails);
    let home = 0, away = 0;
    for (const g of goals) {
        const m = getAbsoluteMinuteFromEvent(g);
        const inSecondHalf = m !== null ? m > 45 : (String(g?.period || '').toLowerCase().includes('second'));
        if (inSecondHalf) {
            if (g.isHome) home++; else away++;
        }
    }
    return { home, away };
}

export function getTeamGoalsByInterval(matchDetails, startMinuteInclusive, endMinuteInclusive) {
    const goals = getGoalEvents(matchDetails);
    let home = 0, away = 0;
    for (const g of goals) {
        const m = getAbsoluteMinuteFromEvent(g);
        if (isWithinWindow(m, startMinuteInclusive, endMinuteInclusive)) {
            if (g.isHome) home++; else away++;
        }
    }
    return { home, away };
}

// New helpers for Phase 3 (time windows and sequencing)
export function getGoalsInWindow(matchDetails, startMinuteInclusive, endMinuteInclusive) {
    const goals = getGoalEvents(matchDetails);
    const hits = [];
    for (const g of goals) {
        const m = getAbsoluteMinuteFromEvent(g);
        if (isWithinWindow(m, startMinuteInclusive, endMinuteInclusive)) {
            hits.push({ minute: m, isHome: g.isHome, raw: g });
        }
    }
    // Ensure deterministic order by minute then home before away to make ties predictable
    hits.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.isHome === b.isHome ? 0 : a.isHome ? -1 : 1));
    return hits;
}

export function getFirstGoalAfterMinute(matchDetails, minuteExclusive) {
    const goals = getGoalEvents(matchDetails)
        .map(g => ({ minute: getAbsoluteMinuteFromEvent(g), isHome: g.isHome, raw: g }))
        .filter(g => g.minute !== null && g.minute > minuteExclusive)
        .sort((a, b) => a.minute - b.minute);
    return goals.length > 0 ? goals[0] : null;
}

export function getNthGoal(matchDetails, n) {
    if (!Number.isFinite(n) || n <= 0) return null;
    const goals = getGoalEvents(matchDetails)
        .map(g => ({ minute: getAbsoluteMinuteFromEvent(g), isHome: g.isHome, raw: g }))
        .filter(g => g.minute !== null)
        .sort((a, b) => a.minute - b.minute);
    return goals[n - 1] || null;
}

function findTeamStatPair(matchDetails, wantedKey) {
    const groups = matchDetails?.content?.stats?.Periods?.All?.stats;
    if (!Array.isArray(groups)) {
        console.log(`   - No stats groups found for key: ${wantedKey}`);
        return null;
    }
    
    console.log(`   - Looking for key: ${wantedKey}`);
    console.log(`   - Found ${groups.length} stat groups`);
    
    for (const group of groups) {
        if (!group?.stats || !Array.isArray(group.stats)) continue;
        
        for (const s of group.stats) {
            if (!s) continue;
            
            // Log available keys for debugging
            if (s.key) {
                console.log(`   - Found stat key: ${s.key}`);
            }
            
            // Direct match
            if (s.key === wantedKey && Array.isArray(s.stats) && s.stats.length === 2) {
                console.log(`   - Found direct match for ${wantedKey}: home=${s.stats[0]}, away=${s.stats[1]}`);
                return { home: Number(s.stats[0] ?? 0), away: Number(s.stats[1] ?? 0) };
            }
            
            // Nested stats array (this is the main case for FotMob structure)
            if (Array.isArray(s.stats)) {
                for (const nested of s.stats) {
                    if (nested && nested.key) {
                        console.log(`   - Found nested stat key: ${nested.key}`);
                    }
                    if (nested && nested.key === wantedKey && Array.isArray(nested.stats) && nested.stats.length === 2) {
                        console.log(`   - Found nested match for ${wantedKey}: home=${nested.stats[0]}, away=${nested.stats[1]}`);
                        return { home: Number(nested.stats[0] ?? 0), away: Number(nested.stats[1] ?? 0) };
                    }
                }
            }
        }
    }
    
    console.log(`   - No match found for key: ${wantedKey}`);
    return null;
}

export function getCornersFromStats(matchDetails) {
    const pair = findTeamStatPair(matchDetails, 'corners');
    if (!pair) return null;
    return { ...pair, total: pair.home + pair.away };
}

export function getFoulsFromStats(matchDetails) {
    const pair = findTeamStatPair(matchDetails, 'fouls');
    if (!pair) return null;
    return { ...pair, total: pair.home + pair.away };
}

export function getTeamCards(matchDetails, period = 'full') {
    // Primary: event timeline
    const events = getCardEvents(matchDetails);
    const counts = {
        home: { yellow: 0, red: 0, total: 0 },
        away: { yellow: 0, red: 0, total: 0 }
    };
    
    // Filter cards by period if specified
    let filteredEvents = events;
    if (period === '1st half' || period === 'first half') {
        filteredEvents = events.filter(c => {
            const m = getAbsoluteMinuteFromEvent(c);
            return m !== null ? m <= 45 : (String(c?.period || '').toLowerCase().includes('first'));
        });
    } else if (period === '2nd half' || period === 'second half') {
        filteredEvents = events.filter(c => {
            const m = getAbsoluteMinuteFromEvent(c);
            return m !== null ? m > 45 : (String(c?.period || '').toLowerCase().includes('second'));
        });
    }
    
    for (const c of filteredEvents) {
        const bucket = c.isHome ? counts.home : counts.away;
        const t = String(c?.card || '').toLowerCase();
        if (t.includes('yellow')) bucket.yellow++;
        if (t.includes('red')) bucket.red++;
        bucket.total++;
    }

    // Supplement with aggregate stats when available (handles feeds missing yellow card timeline)
    // Only use aggregate stats for full-time, not for period-specific
    if (period === 'full') {
    const yellowPair = findTeamStatPair(matchDetails, 'yellow_cards');
    const redPair = findTeamStatPair(matchDetails, 'red_cards');
    if (yellowPair || redPair) {
        const statsHomeYellow = Number(yellowPair?.home ?? 0);
        const statsAwayYellow = Number(yellowPair?.away ?? 0);
        const statsHomeRed = Number(redPair?.home ?? 0);
        const statsAwayRed = Number(redPair?.away ?? 0);

        // If stats indicate higher counts than timeline, trust stats
        counts.home.yellow = Math.max(counts.home.yellow, statsHomeYellow);
        counts.away.yellow = Math.max(counts.away.yellow, statsAwayYellow);
        counts.home.red = Math.max(counts.home.red, statsHomeRed);
        counts.away.red = Math.max(counts.away.red, statsAwayRed);
        counts.home.total = counts.home.yellow + counts.home.red;
        counts.away.total = counts.away.yellow + counts.away.red;
        }
    }
    return counts;
}

// Stubs (to be expanded in later phases)
export function getPlayerStats(matchDetails, playerId) {
    console.log(`📊 getPlayerStats called for playerId: ${playerId}`);
    
    if (!matchDetails || !playerId) {
        console.log(`❌ getPlayerStats: Missing matchDetails or playerId`);
        return null;
    }
    
    const key = String(playerId);
    const playerStatsMap = matchDetails.playerStats || matchDetails.content?.playerStats || null;
    const player = playerStatsMap ? playerStatsMap[key] : null;

    console.log(`   - Player found in stats map: ${!!player}`);
    if (player) {
        console.log(`   - Player name: ${player?.name || 'N/A'}`);
    }

    const result = { shotsOnTarget: null, goals: null };

    // PRIORITY 1: Read aggregated per-player stats from "Attack" section (Primary Source)
    if (player && Array.isArray(player.stats)) {
        console.log(`   - Player stats array found, length: ${player.stats.length}`);
        
        // First, try to find "Attack" section specifically (most reliable)
        const attackSection = player.stats.find(s => 
            s?.key === 'attack' || 
            s?.title === 'Attack' ||
            String(s?.title || '').toLowerCase().includes('attack')
        );
        
        if (attackSection && attackSection.stats && typeof attackSection.stats === 'object') {
            console.log(`   - Found Attack section, checking for "Shots on target"...`);
            for (const [label, obj] of Object.entries(attackSection.stats)) {
                const k = String(obj?.key || '').toLowerCase();
                const labelKey = String(label || '').toLowerCase();
                const val = obj?.stat?.value;
                
                // Check for shots on target - multiple ways it might be named
                if (k === 'shotsontarget' || 
                    k === 'shots_on_target' ||
                    labelKey.includes('shots on target') ||
                    labelKey === 'shots on target') {
                    if (typeof val === 'number') {
                        result.shotsOnTarget = Number(val);
                        console.log(`   ✅ FOUND shots on target in Attack section: ${result.shotsOnTarget} (from label: "${label}", key: "${obj?.key}")`);
                    } else {
                        console.log(`   - Shots on target found but value is not a number: ${typeof val}, value=${val}`);
                    }
                }
            }
        }
        
        // If not found in Attack section, search all sections
        if (result.shotsOnTarget === null || result.shotsOnTarget === undefined) {
            console.log(`   - Shots on target not found in Attack section, searching all sections...`);
        for (const section of player.stats) {
            const dictOrArray = section?.stats;
            if (!dictOrArray) continue;
                
            if (Array.isArray(dictOrArray)) {
                    // Array format
                for (const obj of dictOrArray) {
                    if (!obj) continue;
                    const k = String(obj?.key || '').toLowerCase();
                    const val = obj?.stat?.value;
                        if (k === 'shotsontarget' && typeof val === 'number') {
                            result.shotsOnTarget = Number(val);
                            console.log(`   ✅ Found shots on target in stats array: ${result.shotsOnTarget}`);
                        }
                        if (k === 'goals' && typeof val === 'number') {
                            result.goals = Number(val);
                            console.log(`   - Found goals in stats array: ${result.goals}`);
                        }
                }
            } else if (typeof dictOrArray === 'object') {
                    // Object format (key-value pairs)
                    console.log(`   - Checking section "${section?.title || section?.key || 'unknown'}" with ${Object.keys(dictOrArray).length} entries`);
                for (const [label, obj] of Object.entries(dictOrArray)) {
                    const k = String(obj?.key || '').toLowerCase();
                    const labelKey = String(label || '').toLowerCase();
                    const val = obj?.stat?.value;
                        
                        // Check for shots on target - multiple ways it might be named
                        if (k === 'shotsontarget' || 
                            k === 'shots_on_target' ||
                            labelKey.includes('shots on target') ||
                            labelKey === 'shots on target') {
                            if (typeof val === 'number') {
                                result.shotsOnTarget = Number(val);
                                console.log(`   ✅ Found shots on target in stats object: ${result.shotsOnTarget} (from label: "${label}", section: "${section?.title || section?.key}")`);
                            } else {
                                console.log(`   - Shots on target found but value is not a number: ${typeof val}, value=${val}`);
                            }
                    }
                    if (k === 'goals' || labelKey === 'goals') {
                            if (typeof val === 'number') {
                                result.goals = Number(val);
                                console.log(`   - Found goals in stats object: ${result.goals}`);
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback 1: player's own shotmap (if present in this fixture)
    if ((result.shotsOnTarget === null || result.shotsOnTarget === undefined) && Array.isArray(player?.shotmap)) {
        console.log(`   - Using Fallback 1: Player's own shotmap`);
        const sot = player.shotmap.reduce((acc, ev) => acc + (ev?.isOnTarget ? 1 : 0), 0);
        if (Number.isFinite(sot)) {
            result.shotsOnTarget = sot;
            console.log(`   - Calculated shots on target from player shotmap: ${result.shotsOnTarget}`);
        }
    }

    // Fallback 2: compute shots on target from global shotmap when stat is missing
    if (result.shotsOnTarget === null || result.shotsOnTarget === undefined) {
        console.log(`   - Using Fallback 2: Global shotmap`);
        const globalShotmap = Array.isArray(matchDetails?.shotmap)
            ? matchDetails.shotmap
            : (Array.isArray(matchDetails?.header?.events?.shotmap)
                ? matchDetails.header.events.shotmap
                : null);
        if (Array.isArray(globalShotmap)) {
            // Filter by playerId - check multiple possible locations
            const playerShots = globalShotmap.filter(ev => {
                const eventPlayerId = ev?.playerId || ev?.shotmapEvent?.playerId;
                return Number(eventPlayerId) === Number(playerId);
            });
            console.log(`   - Found ${playerShots.length} shots in global shotmap for player ${playerId}`);
            const sot = playerShots.filter(ev => ev?.isOnTarget === true).length;
            if (Number.isFinite(sot) && sot > 0) {
                result.shotsOnTarget = sot;
                console.log(`   - Calculated shots on target from global shotmap: ${result.shotsOnTarget}`);
            } else {
                console.log(`   - No shots on target found in global shotmap for player ${playerId}`);
            }
        } else {
            console.log(`   - Global shotmap not available`);
        }
    }

    // Fallback 3: Try to get shots on target from goal events' shotmapEvent
    // Each goal event has a shotmapEvent with isOnTarget flag
    if (result.shotsOnTarget === null || result.shotsOnTarget === undefined) {
        console.log(`   - Using Fallback 3: Counting shots on target from goal events' shotmapEvent`);
        const { goals } = getPlayerEvents(matchDetails, Number(playerId));
        if (Array.isArray(goals) && goals.length > 0) {
            // Count goals that have isOnTarget = true in shotmapEvent
            const shotsOnTargetFromGoals = goals.filter(g => g?.shotmapEvent?.isOnTarget === true).length;
            console.log(`   - Found ${goals.length} goals, ${shotsOnTargetFromGoals} have isOnTarget=true`);
            
            // But this is still not accurate - we need ALL shots on target, not just goals
            // So we should look at the global shotmap for this player
            const globalShotmap = Array.isArray(matchDetails?.shotmap)
                ? matchDetails.shotmap
                : (Array.isArray(matchDetails?.header?.events?.shotmap)
                    ? matchDetails.header.events.shotmap
                    : null);
            if (Array.isArray(globalShotmap)) {
                const playerShots = globalShotmap.filter(ev => {
                    const eventPlayerId = ev?.playerId || ev?.shotmapEvent?.playerId;
                    return Number(eventPlayerId) === Number(playerId);
                });
                const sotFromShotmap = playerShots.filter(ev => ev?.isOnTarget === true).length;
                console.log(`   - Found ${playerShots.length} total shots in shotmap, ${sotFromShotmap} on target`);
                if (sotFromShotmap > 0) {
                    result.shotsOnTarget = sotFromShotmap;
                    console.log(`   - Set shots on target from shotmap: ${result.shotsOnTarget}`);
                }
            }
            
            // Only use goals as last resort if shotmap is not available
            if (result.shotsOnTarget === null || result.shotsOnTarget === undefined) {
                console.log(`   - WARNING: Using goals count as proxy (NOT ACCURATE - goals != shots on target)`);
                result.shotsOnTarget = goals.length;
                console.log(`   - Approximated shots on target from goals: ${result.shotsOnTarget} (from ${goals.length} goals)`);
            }
        } else {
            console.log(`   - No goals found for player ${playerId}`);
        }
    }

    console.log(`   - Final result: shotsOnTarget=${result.shotsOnTarget}, goals=${result.goals}`);
    return result;
}

// Best-effort matcher from odds participant name to FotMob playerId
export function findPlayerIdByName(matchDetails, participantName) {
    console.log(`🔍 findPlayerIdByName: Looking for "${participantName}"`);
    
    if (!matchDetails || !participantName) {
        console.log(`   - Missing matchDetails or participantName`);
        return null;
    }
    
    const normalize = (s) => String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ') // collapse
        .trim();

    const target = normalize(participantName);
    console.log(`   - Normalized target: "${target}"`);
    
    // Method 1: Check playerStats (try both locations) using similarity
    const playerStats = matchDetails?.content?.playerStats || matchDetails?.playerStats || {};
    if (Object.keys(playerStats).length > 0) {
        console.log(`   - Checking playerStats (${Object.keys(playerStats).length} players)...`);
        let exactMatch = null;
        let bestMatch = null;
        let bestSimilarity = 0;
        const SIMILARITY_THRESHOLD = 0.6;
        
        for (const [id, p] of Object.entries(playerStats)) {
            const playerName = p?.name || '';
            const nameN = normalize(playerName);
        if (!nameN) continue;
            
            // Exact match
            if (nameN === target) {
                exactMatch = Number(id);
                console.log(`   ✅ Exact match found: "${playerName}" (ID: ${id})`);
                return exactMatch;
            }
            
            // Similarity-based match
            const similarity = calculateNameSimilarity(participantName, playerName);
            if (similarity >= SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = Number(id);
                console.log(`   - Similarity match: "${playerName}" (ID: ${id}, similarity: ${similarity.toFixed(3)})`);
            }
            
            // Fallback: Partial match (one contains the other) - only if similarity didn't find anything
            if (!bestMatch && (target.includes(nameN) || nameN.includes(target))) {
                if (!bestMatch) {
                    bestMatch = Number(id);
                    console.log(`   - Partial match: "${playerName}" (ID: ${id})`);
                }
            }
        }
        
        if (bestMatch) {
            console.log(`   ✅ Using best match: ID ${bestMatch} (similarity: ${bestSimilarity > 0 ? bestSimilarity.toFixed(3) : 'partial'})`);
            return bestMatch;
        }
    }
    
    // Method 2: Check shotmap by playerName
    console.log(`   - Checking shotmap for player name...`);
    const globalShotmap = Array.isArray(matchDetails?.shotmap)
        ? matchDetails.shotmap
        : (Array.isArray(matchDetails?.header?.events?.shotmap)
            ? matchDetails.header.events.shotmap
            : null);
    
    if (Array.isArray(globalShotmap)) {
        const targetLower = target.toLowerCase();
        for (const shot of globalShotmap) {
            const shotPlayerName = normalize(shot?.playerName || '');
            if (shotPlayerName === target || shotPlayerName.includes(target) || target.includes(shotPlayerName)) {
                const foundId = shot?.playerId || shot?.shotmapEvent?.playerId;
                if (foundId) {
                    console.log(`   ✅ Found in shotmap: "${shot.playerName}" (ID: ${foundId})`);
                    return Number(foundId);
                }
            }
        }
    }
    
    // Method 3: Check goal events by player name (as scorer)
    console.log(`   - Checking goal events for player name (as scorer)...`);
    const homeGoals = matchDetails?.header?.events?.homeTeamGoals || {};
    const awayGoals = matchDetails?.header?.events?.awayTeamGoals || {};
    
    // Check home team goals (keyed by player name)
    for (const [playerName, goals] of Object.entries(homeGoals)) {
        if (normalize(playerName) === target || normalize(playerName).includes(target) || target.includes(normalize(playerName))) {
            if (Array.isArray(goals) && goals.length > 0) {
                const playerId = goals[0]?.playerId || goals[0]?.player?.id || goals[0]?.shotmapEvent?.playerId;
                if (playerId) {
                    console.log(`   ✅ Found in home goals: "${playerName}" (ID: ${playerId})`);
                    return Number(playerId);
                }
            }
        }
    }
    
    // Check away team goals
    for (const [playerName, goals] of Object.entries(awayGoals)) {
        if (normalize(playerName) === target || normalize(playerName).includes(target) || target.includes(normalize(playerName))) {
            if (Array.isArray(goals) && goals.length > 0) {
                const playerId = goals[0]?.playerId || goals[0]?.player?.id || goals[0]?.shotmapEvent?.playerId;
                if (playerId) {
                    console.log(`   ✅ Found in away goals: "${playerName}" (ID: ${playerId})`);
                    return Number(playerId);
                }
            }
        }
    }
    
    // Method 4: Check assists in goal events (player might have assists but no goals)
    console.log(`   - Checking assists in goal events for player name...`);
    const allGoals = [...Object.values(homeGoals).flat(), ...Object.values(awayGoals).flat()];
    for (const goal of allGoals) {
        // Check assist fields
        const assistName = goal?.assistInput || goal?.assistStr || '';
        if (assistName) {
            const assistNameNormalized = normalize(assistName.replace(/^assist by\s*/i, '').trim());
            if (assistNameNormalized === target || 
                assistNameNormalized.includes(target) || 
                target.includes(assistNameNormalized)) {
                const assistPlayerId = goal?.assistPlayerId || goal?.assist?.id || goal?.assist?.playerId;
                if (assistPlayerId) {
                    console.log(`   ✅ Found in assists: "${assistName}" (ID: ${assistPlayerId})`);
                    return Number(assistPlayerId);
                }
            }
        }
    }
    
    // Method 5: Check content.playerStats (alternative location)
    console.log(`   - Checking content.playerStats...`);
    const contentPlayerStats = matchDetails?.content?.playerStats || {};
    if (Object.keys(contentPlayerStats).length > 0) {
        for (const [id, p] of Object.entries(contentPlayerStats)) {
            const playerName = p?.name || '';
            const nameN = normalize(playerName);
            if (!nameN) continue;
            
            // Exact match
            if (nameN === target) {
                console.log(`   ✅ Exact match found in content.playerStats: "${playerName}" (ID: ${id})`);
                return Number(id);
            }
            
            // Partial match
            if (target.includes(nameN) || nameN.includes(target)) {
                console.log(`   ✅ Partial match found in content.playerStats: "${playerName}" (ID: ${id})`);
                return Number(id);
            }
        }
    }
    
    console.log(`   ❌ Could not find player "${participantName}" in any source`);
    return null;
}

export function getPlayerEvents(matchDetails, playerId) {
    // Get all goals and filter by playerId
    // Note: Goals can have playerId in multiple places: e.playerId, e.player?.id, e.shotmapEvent?.playerId
    const allGoals = getGoalEvents(matchDetails);
    const goals = allGoals.filter(e => {
        const eventPlayerId = e?.playerId || e?.player?.id || e?.shotmapEvent?.playerId;
        return Number(eventPlayerId) === Number(playerId);
    });
    
    const allCards = getCardEvents(matchDetails);
    console.log(`🔍 getPlayerEvents for playerId ${playerId}:`);
    console.log(`   - All goals found: ${allGoals.length}`);
    console.log(`   - Goals for player ${playerId}: ${goals.length}`);
    if (goals.length > 0) {
        console.log(`   - Goal events:`, goals.map(g => ({ minute: g.time, player: g.player?.name, playerId: g.playerId || g.player?.id })));
    }
    console.log(`   - All cards found: ${allCards.length}`);
    
    const cards = allCards.filter(e => {
        const eventPlayerId = e?.playerId || e?.player?.id;
        return Number(eventPlayerId) === Number(playerId);
    });
    console.log(`   - Cards for player ${playerId}: ${cards.length}`);
    if (cards.length > 0) {
        console.log(`   - Card events:`, cards.map(c => ({ minute: c.time, player: c.player?.name, card: c.card })));
    }
    
    return { goals, cards };
}

export function getGoalkeeperSaves(matchDetails, teamName) {
    console.log(`🔍 Getting goalkeeper saves for team: ${teamName}`);
    
    // Only use actual data - NO estimates
    // Check both possible locations for playerStats
    const playerStats = matchDetails?.content?.playerStats || matchDetails?.playerStats || {};
    console.log(`   - Player stats available: ${Object.keys(playerStats).length}`);
    
    if (Object.keys(playerStats).length === 0) {
        console.log(`❌ No player stats available - cannot determine goalkeeper saves`);
        return null; // Return null to indicate no data available
    }
    
    let totalSaves = 0;
    let goalkeepersFound = 0;
    
    // Parse the Fotmob data structure correctly
    for (const [playerId, playerData] of Object.entries(playerStats)) {
        if (!playerData || !playerData.name) continue;
        
        // Check if this player is a goalkeeper using the isGoalkeeper flag
        const isGoalkeeper = playerData.isGoalkeeper === true;
        
        if (isGoalkeeper) {
            // Check if this goalkeeper belongs to the specified team
            const playerTeamName = playerData.teamName || '';
            
            // More flexible team name matching
            const normalizeTeamName = (name) => {
                return name.toLowerCase()
                    .replace(/[áàâãä]/g, 'a')
                    .replace(/[éèêë]/g, 'e')
                    .replace(/[íìîï]/g, 'i')
                    .replace(/[óòôõö]/g, 'o')
                    .replace(/[úùûü]/g, 'u')
                    .replace(/[ç]/g, 'c')
                    .replace(/[ñ]/g, 'n')
                    .replace(/[^a-z0-9]/g, '');
            };
            
            const normalizedPlayerTeam = normalizeTeamName(playerTeamName);
            const normalizedTargetTeam = normalizeTeamName(teamName);
            
            const isCorrectTeam = normalizedPlayerTeam.includes(normalizedTargetTeam) ||
                                 normalizedTargetTeam.includes(normalizedPlayerTeam) ||
                                 // Special cases for known team name variations (using normalized names)
                                 (normalizedTargetTeam.includes('atletico') && normalizedPlayerTeam.includes('atletico')) ||
                                 (normalizedTargetTeam.includes('bolivar') && normalizedPlayerTeam.includes('bolivar')) ||
                                 // Handle "Atletico MG" vs "Atlético Mineiro" case
                                 (normalizedTargetTeam.includes('atletico') && normalizedTargetTeam.includes('mg') && 
                                  normalizedPlayerTeam.includes('atletico') && normalizedPlayerTeam.includes('mineiro'));
            
            if (isCorrectTeam) {
                goalkeepersFound++;
                console.log(`   - Found goalkeeper: ${playerData.name} (Team: ${playerData.teamName})`);
                
                // Extract saves from the stats array
                let playerSaves = 0;
                if (playerData.stats && Array.isArray(playerData.stats)) {
                    for (const statGroup of playerData.stats) {
                        if (statGroup.stats && statGroup.stats["Saves"]) {
                            playerSaves = Number(statGroup.stats["Saves"].stat.value) || 0;
                            console.log(`   - Goalkeeper ${playerData.name}: ${playerSaves} saves`);
                            break; // Found saves data, no need to continue
                        }
                    }
                }
                
                totalSaves += playerSaves;
            }
        }
    }
    
    if (goalkeepersFound === 0) {
        console.log(`❌ No goalkeepers found in player stats`);
        return null;
    }
    
    console.log(`   - Total saves for ${teamName}: ${totalSaves} (from ${goalkeepersFound} goalkeepers)`);
    return totalSaves;
}

export function getPlayerAssists(matchDetails, playerId) {
    console.log(`🔍 Getting assists for player ID: ${playerId}`);
    
    // Get all goal events (from homeTeamGoals and awayTeamGoals)
    // Assists are stored in goal events, not in a separate events array
    const allGoals = getGoalEvents(matchDetails);
    console.log(`   - Total goals in match: ${allGoals.length}`);
    
    let assists = 0;
    
    // Look for assists in goal events
    // Assists can be stored in multiple ways:
    // 1. event.assistPlayerId (direct field in goal event)
    // 2. event.assist.id (nested object)
    // 3. event.assist?.playerId (alternative nested structure)
    for (const goal of allGoals) {
        const assistPlayerId = goal?.assistPlayerId || 
                               goal?.assist?.id || 
                               goal?.assist?.playerId;
        
        if (assistPlayerId && Number(assistPlayerId) === Number(playerId)) {
            assists++;
            const goalMinute = goal.time || goal.timeStr || 'unknown';
            const scorerName = goal.player?.name || goal.nameStr || 'Unknown';
            const assistPlayerName = goal?.assistInput || goal?.assistStr?.replace(/^assist by\s*/i, '') || `Player ID ${playerId}`;
            console.log(`   ✅ Assist found: ${assistPlayerName} assisted ${scorerName}'s goal at minute ${goalMinute}`);
        }
    }
    
    console.log(`   - Total assists: ${assists}`);
    if (assists > 0) {
        console.log(`   - Assists found for player ID ${playerId}`);
    } else {
        console.log(`   - No assists found for player ID ${playerId}`);
    }
    
    return assists;
}

export function getPlayerGoals(matchDetails, playerId) {
    console.log(`🔍 Getting goals for player ID: ${playerId}`);
    
    // Get all goal events (from homeTeamGoals and awayTeamGoals)
    // Goals are stored in goal events, not in a separate events array
    const allGoals = getGoalEvents(matchDetails);
    console.log(`   - Total goals in match: ${allGoals.length}`);
    
    let goals = 0;
    
    // Look for goals where this player scored
    // Player ID can be in multiple places: goal.playerId, goal.player.id, goal.shotmapEvent.playerId
    for (const goal of allGoals) {
        const goalPlayerId = goal?.playerId || 
                            goal?.player?.id || 
                            goal?.shotmapEvent?.playerId;
        
        if (goalPlayerId && Number(goalPlayerId) === Number(playerId)) {
            goals++;
            const goalMinute = goal.time || goal.timeStr || 'unknown';
            const scorerName = goal.player?.name || goal.nameStr || 'Unknown';
            console.log(`   ✅ Goal found: Goal at minute ${goalMinute} by ${scorerName}`);
        }
    }
    
    console.log(`   - Total goals: ${goals}`);
    if (goals > 0) {
        console.log(`   - Goals found for player ID ${playerId}`);
    } else {
        console.log(`   - No goals found for player ID ${playerId}`);
    }
    
    return goals;
}

export function getPlayerScoreOrAssist(matchDetails, playerId) {
    console.log(`🔍 Getting goals or assists for player ID: ${playerId}`);
    
    const goals = getPlayerGoals(matchDetails, playerId);
    const assists = getPlayerAssists(matchDetails, playerId);
    const total = goals + assists;
    
    console.log(`   - Goals: ${goals}, Assists: ${assists}, Total: ${total}`);
    return { goals, assists, total };
}

export function getPlayerGoalsFromOutsidePenalty(matchDetails, playerId) {
    console.log(`🔍 Getting goals from outside penalty box for player ID: ${playerId}`);
    
    // Get events from match details
    const events = matchDetails?.header?.events?.events || [];
    console.log(`   - Total events: ${events.length}`);
    
    let goalsFromOutside = 0;
    
    // Look for goal events where this player scored from outside the penalty box
    for (const event of events) {
        if (event.type === 'Goal' && event.player && event.player.id === playerId) {
            // Check if the goal was scored from outside the penalty box
            // This would typically be indicated by event coordinates or other metadata
            // For now, we'll assume all goals are from outside penalty box if no specific data is available
            // In a real implementation, you'd check event coordinates or other metadata
            
            // Check if there's any indication this was from outside penalty box
            const isOutsidePenalty = event.outsidePenaltyBox === true || 
                                   event.goalType === 'outside_penalty' ||
                                   (event.coordinates && isOutsidePenaltyBox(event.coordinates));
            
            if (isOutsidePenalty) {
                goalsFromOutside++;
                console.log(`   - Goal from outside penalty box found: Goal at minute ${event.minute} by ${event.player?.name || 'Unknown'}`);
            } else {
                // If no specific data is available, we can't determine if it was from outside penalty box
                // This is a limitation of the current data structure
                console.log(`   - Goal found but cannot determine if from outside penalty box: Goal at minute ${event.minute}`);
            }
        }
    }
    
    console.log(`   - Total goals from outside penalty box: ${goalsFromOutside}`);
    return goalsFromOutside;
}

// Helper function to determine if coordinates are outside penalty box
function isOutsidePenaltyBox(coordinates) {
    if (!coordinates || !coordinates.x || !coordinates.y) return false;
    
    // Penalty box is typically from x=0 to x=16.5 (18-yard box)
    // and from y=0 to y=100 (full width)
    const x = coordinates.x;
    const y = coordinates.y;
    
    // Outside penalty box if x > 16.5 (beyond 18-yard line)
    return x > 16.5;
}

export function getPlayerGoalsFromHeader(matchDetails, playerId) {
    console.log(`🔍 Getting header goals for player ID: ${playerId}`);
    
    // Get events from match details
    const events = matchDetails?.header?.events?.events || [];
    console.log(`   - Total events: ${events.length}`);
    
    let headerGoals = 0;
    
    // Look for goal events where this player scored with a header
    for (const event of events) {
        if (event.type === 'Goal' && event.player && event.player.id === playerId) {
            // Check if the goal was scored with a header
            // This would typically be indicated by event metadata or goal type
            const isHeader = event.goalType === 'header' || 
                           event.bodyPart === 'head' ||
                           event.goalMethod === 'header' ||
                           (event.description && event.description.toLowerCase().includes('header')) ||
                           (event.goalType && event.goalType.toLowerCase().includes('header'));
            
            if (isHeader) {
                headerGoals++;
                console.log(`   - Header goal found: Goal at minute ${event.minute} by ${event.player?.name || 'Unknown'}`);
            } else {
                // If no specific data is available, we can't determine if it was a header
                console.log(`   - Goal found but cannot determine if from header: Goal at minute ${event.minute}`);
            }
        }
    }
    
    console.log(`   - Total header goals: ${headerGoals}`);
    return headerGoals;
}

export function getTeamShots(matchDetails) {
    console.log(`🔍 Getting team shots from match data...`);
    
    // Try "total_shots" first (more likely to have data)
    let pair = findTeamStatPair(matchDetails, 'total_shots');
    console.log(`   - Found total_shots in stats: ${!!pair}`);
    
    // If total_shots is null/empty, try "shots"
    if (!pair || (pair.home === null && pair.away === null)) {
        console.log(`   - total_shots not found or null, trying shots...`);
        pair = findTeamStatPair(matchDetails, 'shots');
        console.log(`   - Found shots in stats: ${!!pair}`);
    }
    
    // If still no data, try shotmap fallback
    if (!pair || (pair.home === null && pair.away === null)) {
        console.log(`   - No shots found in stats, trying shotmap fallback...`);
        // Fallback: try to calculate from shotmap
        const shotmap = matchDetails?.shotmap || matchDetails?.header?.events?.shotmap || [];
        console.log(`   - Shotmap available: ${Array.isArray(shotmap)} (${shotmap.length} shots)`);
        
        let homeShots = 0;
        let awayShots = 0;
        
        if (Array.isArray(shotmap)) {
            for (const shot of shotmap) {
                if (shot?.isHome) {
                    homeShots++;
                } else {
                    awayShots++;
                }
            }
        }
        
        console.log(`   - Calculated from shotmap: home=${homeShots}, away=${awayShots}, total=${homeShots + awayShots}`);
        return { home: homeShots, away: awayShots, total: homeShots + awayShots };
    }
    
    console.log(`   - Found in stats: home=${pair.home}, away=${pair.away}, total=${pair.home + pair.away}`);
    return { ...pair, total: pair.home + pair.away };
}

export function getTeamShotsOnTarget(matchDetails) {
    console.log(`🔍 Getting team shots on target from match data...`);
    
    // Try "shotsontarget" first
    let pair = findTeamStatPair(matchDetails, 'shotsontarget');
    console.log(`   - Found shotsontarget in stats: ${!!pair}`);
    
    // If shotsontarget is null/empty, try "ShotsOnTarget" (capitalized)
    if (!pair || (pair.home === null && pair.away === null)) {
        console.log(`   - shotsontarget not found or null, trying ShotsOnTarget...`);
        pair = findTeamStatPair(matchDetails, 'ShotsOnTarget');
        console.log(`   - Found ShotsOnTarget in stats: ${!!pair}`);
    }
    
    // If still no data, try shotmap fallback
    if (!pair || (pair.home === null && pair.away === null)) {
        console.log(`   - No shots on target found in stats, trying shotmap fallback...`);
        // Fallback: try to calculate from shotmap
        const shotmap = matchDetails?.shotmap || matchDetails?.header?.events?.shotmap || [];
        console.log(`   - Shotmap available: ${Array.isArray(shotmap)} (${shotmap.length} shots)`);
        
        let homeShotsOnTarget = 0;
        let awayShotsOnTarget = 0;
        
        if (Array.isArray(shotmap)) {
            for (const shot of shotmap) {
                if (shot?.isOnTarget) {
                    if (shot?.isHome) {
                        homeShotsOnTarget++;
                    } else {
                        awayShotsOnTarget++;
                    }
                }
            }
        }
        
        console.log(`   - Calculated from shotmap: home=${homeShotsOnTarget}, away=${awayShotsOnTarget}, total=${homeShotsOnTarget + awayShotsOnTarget}`);
        return { home: homeShotsOnTarget, away: awayShotsOnTarget, total: homeShotsOnTarget + awayShotsOnTarget };
    }
    
    console.log(`   - Found in stats: home=${pair.home}, away=${pair.away}, total=${pair.home + pair.away}`);
    return { ...pair, total: pair.home + pair.away };
}

export function getTeamOffsides(matchDetails) {
    console.log(`🔍 Getting team offsides from match data...`);
    
    // Try "offsides" first
    let pair = findTeamStatPair(matchDetails, 'offsides');
    console.log(`   - Found offsides in stats: ${!!pair}`);
    
    // If offsides is null/empty, try "Offsides" (capitalized)
    if (!pair || (pair.home === null && pair.away === null)) {
        console.log(`   - offsides not found or null, trying Offsides...`);
        pair = findTeamStatPair(matchDetails, 'Offsides');
        console.log(`   - Found Offsides in stats: ${!!pair}`);
    }
    
    if (!pair) {
        console.log(`   - No offsides found in stats`);
        return null;
    }
    
    console.log(`   - Found in stats: home=${pair.home}, away=${pair.away}, total=${pair.home + pair.away}`);
    return { ...pair, total: pair.home + pair.away };
}

export function getPenaltyKicksAwarded(matchDetails) {
    console.log(`🔍 Getting penalty kicks awarded from match data...`);
    
    const events = matchDetails?.header?.events?.events || [];
    let penaltyKicksAwarded = 0;
    
    for (const event of events) {
        // Check for penalty kick events
        if (event.type === 'Penalty' || 
            (event.type === 'Goal' && event.raw?.shotmapEvent?.situation === 'Penalty') ||
            (event.type === 'MissedPenalty') ||
            (event.type === 'SavedPenalty')) {
            penaltyKicksAwarded++;
            console.log(`   - Found penalty kick at minute ${event.minute}: ${event.type}`);
        }
    }
    
    console.log(`   - Total penalty kicks awarded: ${penaltyKicksAwarded}`);
    return penaltyKicksAwarded;
}

export function getTeamPenaltyGoals(matchDetails, teamName) {
    console.log(`🔍 Getting penalty goals for team: ${teamName}`);
    
    const events = matchDetails?.header?.events?.events || [];
    let penaltyGoals = 0;
    
    // Get team names to determine which team is home/away
    const { homeName, awayName } = getTeamNames(matchDetails);
    const isHomeTeam = teamName.toLowerCase().includes(homeName.toLowerCase()) || 
                      homeName.toLowerCase().includes(teamName.toLowerCase());
    const isAwayTeam = teamName.toLowerCase().includes(awayName.toLowerCase()) || 
                      awayName.toLowerCase().includes(teamName.toLowerCase());
    
    console.log(`   - Home team: ${homeName}, Away team: ${awayName}`);
    console.log(`   - Target team: ${teamName}`);
    console.log(`   - Is home team: ${isHomeTeam}, Is away team: ${isAwayTeam}`);
    
    for (const event of events) {
        // Check for penalty goals
        if (event.type === 'Goal' && event.raw?.shotmapEvent?.situation === 'Penalty') {
            const isEventForTargetTeam = (isHomeTeam && event.isHome === true) || 
                                       (isAwayTeam && event.isHome === false);
            
            if (isEventForTargetTeam) {
                penaltyGoals++;
                console.log(`   - Found penalty goal at minute ${event.minute} for ${teamName}`);
            }
        }
    }
    
    console.log(`   - Total penalty goals for ${teamName}: ${penaltyGoals}`);
    return penaltyGoals;
}

export function getOwnGoals(matchDetails) {
    console.log(`🔍 Getting own goals from match data...`);
    
    const events = matchDetails?.header?.events?.events || [];
    let ownGoals = 0;
    
    for (const event of events) {
        // Check for own goal events
        if (event.type === 'Goal' && event.raw?.shotmapEvent?.situation === 'Own goal') {
            ownGoals++;
            console.log(`   - Found own goal at minute ${event.minute}`);
        }
    }
    
    console.log(`   - Total own goals: ${ownGoals}`);
    return ownGoals;
}
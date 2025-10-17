// FotMob helper utilities for extracting standardized data from match details

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
    // Cards are provided as generic Card events under header.events.events
    const eventsArray = matchDetails?.header?.events?.events;
    if (Array.isArray(eventsArray)) {
        return eventsArray
            .filter(ev => String(ev?.type).toLowerCase() === 'card' && !!ev?.card)
            .map(ev => ({ ...ev, isHome: !!ev?.isHome }));
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
    if (!Array.isArray(groups)) return null;
    
    for (const group of groups) {
        if (!group?.stats || !Array.isArray(group.stats)) continue;
        
        for (const s of group.stats) {
            if (!s) continue;
            
            // Direct match
            if (s.key === wantedKey && Array.isArray(s.stats) && s.stats.length === 2) {
                return { home: Number(s.stats[0] ?? 0), away: Number(s.stats[1] ?? 0) };
            }
            
            // Nested stats array (this is the main case for FotMob structure)
            if (Array.isArray(s.stats)) {
                for (const nested of s.stats) {
                    if (nested && nested.key === wantedKey && Array.isArray(nested.stats) && nested.stats.length === 2) {
                        return { home: Number(nested.stats[0] ?? 0), away: Number(nested.stats[1] ?? 0) };
                    }
                }
            }
        }
    }
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

export function getTeamCards(matchDetails) {
    // Primary: event timeline
    const events = getCardEvents(matchDetails);
    const counts = {
        home: { yellow: 0, red: 0, total: 0 },
        away: { yellow: 0, red: 0, total: 0 }
    };
    for (const c of events) {
        const bucket = c.isHome ? counts.home : counts.away;
        const t = String(c?.card || '').toLowerCase();
        if (t.includes('yellow')) bucket.yellow++;
        if (t.includes('red')) bucket.red++;
        bucket.total++;
    }

    // Supplement with aggregate stats when available (handles feeds missing yellow card timeline)
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
    return counts;
}

// Stubs (to be expanded in later phases)
export function getPlayerStats(matchDetails, playerId) {
    if (!matchDetails || !playerId) return null;
    const key = String(playerId);
    const playerStatsMap = matchDetails.playerStats || matchDetails.content?.playerStats || null;
    const player = playerStatsMap ? playerStatsMap[key] : null;

    const result = { shotsOnTarget: null, goals: null };

    // Read aggregated per-player stats if available
    if (player && Array.isArray(player.stats)) {
        for (const section of player.stats) {
            const dictOrArray = section?.stats;
            if (!dictOrArray) continue;
            if (Array.isArray(dictOrArray)) {
                for (const obj of dictOrArray) {
                    if (!obj) continue;
                    const k = String(obj?.key || '').toLowerCase();
                    const val = obj?.stat?.value;
                    if (k === 'shotsontarget' && typeof val === 'number') result.shotsOnTarget = Number(val);
                    if (k === 'goals' && typeof val === 'number') result.goals = Number(val);
                }
            } else if (typeof dictOrArray === 'object') {
                for (const [label, obj] of Object.entries(dictOrArray)) {
                    const k = String(obj?.key || '').toLowerCase();
                    const labelKey = String(label || '').toLowerCase();
                    const val = obj?.stat?.value;
                    if (k === 'shotsontarget' || labelKey.includes('shots on target')) {
                        if (typeof val === 'number') result.shotsOnTarget = Number(val);
                    }
                    if (k === 'goals' || labelKey === 'goals') {
                        if (typeof val === 'number') result.goals = Number(val);
                    }
                }
            }
        }
    }

    // Fallback 1: player's own shotmap (if present in this fixture)
    if ((result.shotsOnTarget === null || result.shotsOnTarget === undefined) && Array.isArray(player?.shotmap)) {
        const sot = player.shotmap.reduce((acc, ev) => acc + (ev?.isOnTarget ? 1 : 0), 0);
        if (Number.isFinite(sot)) result.shotsOnTarget = sot;
    }

    // Fallback 2: compute shots on target from global shotmap when stat is missing
    if (result.shotsOnTarget === null || result.shotsOnTarget === undefined) {
        const globalShotmap = Array.isArray(matchDetails?.shotmap)
            ? matchDetails.shotmap
            : (Array.isArray(matchDetails?.header?.events?.shotmap)
                ? matchDetails.header.events.shotmap
                : null);
        if (Array.isArray(globalShotmap)) {
            const sot = globalShotmap
                .filter(ev => ev?.playerId === Number(playerId))
                .reduce((acc, ev) => acc + (ev?.isOnTarget ? 1 : 0), 0);
            if (Number.isFinite(sot)) result.shotsOnTarget = sot;
        }
    }

    // Fallback 3: as a last resort, approximate SOT with goals count
    if (result.shotsOnTarget === null || result.shotsOnTarget === undefined) {
        const { goals } = getPlayerEvents(matchDetails, Number(playerId));
        if (Array.isArray(goals)) result.shotsOnTarget = goals.length;
    }

    return result;
}

// Best-effort matcher from odds participant name to FotMob playerId
export function findPlayerIdByName(matchDetails, participantName) {
    if (!matchDetails || !matchDetails.playerStats || !participantName) return null;
    const normalize = (s) => String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ') // collapse
        .trim();

    const target = normalize(participantName);
    let fallbackId = null;
    for (const [id, p] of Object.entries(matchDetails.playerStats)) {
        const nameN = normalize(p?.name);
        if (!nameN) continue;
        if (nameN === target) return Number(id);
        if (target.includes(nameN) || nameN.includes(target)) fallbackId = Number(id);
    }
    return fallbackId;
}

export function getPlayerEvents(matchDetails, playerId) {
    const goals = getGoalEvents(matchDetails).filter(e => e?.playerId === playerId);
    const allCards = getCardEvents(matchDetails);
    console.log(`🔍 getPlayerEvents for playerId ${playerId}:`);
    console.log(`   - All cards found: ${allCards.length}`);
    console.log(`   - All cards data:`, allCards);
    
    const cards = allCards.filter(e => e?.playerId === playerId);
    console.log(`   - Cards for player ${playerId}: ${cards.length}`);
    console.log(`   - Player cards data:`, cards);
    
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
    
    // Get events from match details
    const events = matchDetails?.header?.events?.events || [];
    console.log(`   - Total events: ${events.length}`);
    
    let assists = 0;
    
    // Look for assist events
    for (const event of events) {
        if (event.type === 'Goal' && event.assist && event.assist.id === playerId) {
            assists++;
            console.log(`   - Assist found: Goal at minute ${event.minute} by ${event.player?.name || 'Unknown'}`);
        }
    }
    
    console.log(`   - Total assists: ${assists}`);
    return assists;
}

export function getPlayerGoals(matchDetails, playerId) {
    console.log(`🔍 Getting goals for player ID: ${playerId}`);
    
    // Get events from match details
    const events = matchDetails?.header?.events?.events || [];
    console.log(`   - Total events: ${events.length}`);
    
    let goals = 0;
    
    // Look for goal events where this player scored
    for (const event of events) {
        if (event.type === 'Goal' && event.player && event.player.id === playerId) {
            goals++;
            console.log(`   - Goal found: Goal at minute ${event.minute} by ${event.player?.name || 'Unknown'}`);
        }
    }
    
    console.log(`   - Total goals: ${goals}`);
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
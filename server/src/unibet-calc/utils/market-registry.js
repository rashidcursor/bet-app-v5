// Market Registry: precise identification rules with precedence to avoid collisions

export const MarketCodes = {
    PLAYER_TO_SCORE: 'PLAYER_TO_SCORE',
    PLAYER_TO_SCORE_2PLUS: 'PLAYER_TO_SCORE_2PLUS',
    PLAYER_SOT_OU: 'PLAYER_SOT_OU',
    PLAYER_SHOTS_OU: 'PLAYER_SHOTS_OU',
    TEAM_TOTAL_SHOTS_OU: 'TEAM_TOTAL_SHOTS_OU',
    TEAM_SHOTS_ON_TARGET_OU: 'TEAM_SHOTS_ON_TARGET_OU',
    TEAM_SHOTS_OU: 'TEAM_SHOTS_OU',
    TEAM_SHOTS_ON_TARGET_BY: 'TEAM_SHOTS_ON_TARGET_BY',
    MOST_SHOTS_ON_TARGET: 'MOST_SHOTS_ON_TARGET',
    TOTAL_OFFSIDES: 'TOTAL_OFFSIDES',
    TEAM_OFFSIDES_BY: 'TEAM_OFFSIDES_BY',
    THREE_WAY_HANDICAP_1ST_HALF: 'THREE_WAY_HANDICAP_1ST_HALF',
    ASIAN_TOTAL_1ST_HALF: 'ASIAN_TOTAL_1ST_HALF',
    ASIAN_TOTAL: 'ASIAN_TOTAL',
    ASIAN_HANDICAP: 'ASIAN_HANDICAP',
    FIRST_GOAL: 'FIRST_GOAL',
    PLAYER_CARD_ANY: 'PLAYER_CARD_ANY',
    PLAYER_CARD_RED: 'PLAYER_CARD_RED',

    MATCH_RESULT: 'MATCH_RESULT',
    TEAM_TOTAL_GOALS_OU: 'TEAM_TOTAL_GOALS_OU',
    MATCH_TOTAL_GOALS_OU: 'MATCH_TOTAL_GOALS_OU',
    MATCH_TOTAL_GOALS_1ST_HALF_OU: 'MATCH_TOTAL_GOALS_1ST_HALF_OU',
    MATCH_TOTAL_GOALS_2ND_HALF_OU: 'MATCH_TOTAL_GOALS_2ND_HALF_OU',
    MATCH_TOTAL_GOALS_INTERVAL_OU: 'MATCH_TOTAL_GOALS_INTERVAL_OU',
    BTTS: 'BTTS',
    BTTS_1ST_HALF: 'BTTS_1ST_HALF',
    BTTS_2ND_HALF: 'BTTS_2ND_HALF',
    HALF_TIME_FULL_TIME: 'HALF_TIME_FULL_TIME',
    METHOD_OF_SCORING_NEXT_GOAL: 'METHOD_OF_SCORING_NEXT_GOAL',

    CORNERS_TOTAL_OU: 'CORNERS_TOTAL_OU',
    CORNERS_TEAM_TOTAL_OU: 'CORNERS_TEAM_TOTAL_OU',
    CORNERS_MOST: 'CORNERS_MOST',
    CORNERS_HANDICAP_3WAY: 'CORNERS_HANDICAP_3WAY',
    CORNERS_FIRST_TO_X: 'CORNERS_FIRST_TO_X',
    CORNERS_MOST_TIME_WINDOW: 'CORNERS_MOST_TIME_WINDOW',
    CORNERS_TOTAL_OU_TIME_WINDOW: 'CORNERS_TOTAL_OU_TIME_WINDOW',
    CORNER_OCCURRENCE_TIME_WINDOW: 'CORNER_OCCURRENCE_TIME_WINDOW',
    FIRST_CORNER_TIME_WINDOW: 'FIRST_CORNER_TIME_WINDOW',

    CARDS_3_WAY_LINE: 'CARDS_3_WAY_LINE',
    THREE_WAY_LINE: 'THREE_WAY_LINE',
    GOAL_IN_BOTH_HALVES: 'GOAL_IN_BOTH_HALVES',
    PLAYER_RED_CARD: 'PLAYER_RED_CARD',
    TEAM_RED_CARD: 'TEAM_RED_CARD',
    FIRST_GOAL_SCORER: 'FIRST_GOAL_SCORER',
    GOALKEEPER_SAVES: 'GOALKEEPER_SAVES',
    GOALKEEPER_SAVES_TOTAL: 'GOALKEEPER_SAVES_TOTAL',
    PLAYER_ASSIST: 'PLAYER_ASSIST',
    PLAYER_SCORE_OR_ASSIST: 'PLAYER_SCORE_OR_ASSIST',
    PLAYER_SCORE_OUTSIDE_PENALTY: 'PLAYER_SCORE_OUTSIDE_PENALTY',
    PLAYER_SCORE_HEADER: 'PLAYER_SCORE_HEADER',
    PENALTY_KICK_AWARDED: 'PENALTY_KICK_AWARDED',
    TEAM_SCORE_FROM_PENALTY: 'TEAM_SCORE_FROM_PENALTY',
    OWN_GOAL: 'OWN_GOAL',
    HALF_TIME: 'HALF_TIME',
    DOUBLE_CHANCE_2ND_HALF: 'DOUBLE_CHANCE_2ND_HALF',
    DOUBLE_CHANCE_1ST_HALF: 'DOUBLE_CHANCE_1ST_HALF',
    WIN_TO_NIL: 'WIN_TO_NIL',
    CORRECT_SCORE: 'CORRECT_SCORE',

    UNKNOWN: 'UNKNOWN'
};

// Each entry: {code, match: (bet, norm) => boolean, priority}
// Higher priority first to protect specific/player markets from generic totals
export const MARKET_REGISTRY = [
    {
        code: MarketCodes.PLAYER_TO_SCORE_2PLUS,
        priority: 100,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            const is2plus = name.includes('at least 2') || name.includes('2+');
            const isScorer = (name.includes('to score') || crit.includes('to score')) && !name.includes('team');
            return is2plus && isScorer;
        }
    },
    {
        code: MarketCodes.PLAYER_TO_SCORE,
        priority: 95,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            const isScorer = (name.includes('to score') || crit.includes('to score')) && !name.includes('team');
            // Exclude "To Score Or Assist" markets
            const isScoreOrAssist = name.includes('to score or assist') || crit.includes('to score or assist');
            // Ensure it's actually a player market
            return isScorer && !isScoreOrAssist && (norm.hints.isPlayerOccurrenceLine || norm.hints.hasExplicitPlayer || looksLikePlayerSelection(norm));
        }
    },
    {
        code: MarketCodes.PLAYER_SOT_OU,
        priority: 95,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            return (name.includes("player's shots on target") || crit.includes('shots on target')) && 
                   !name.includes('total shots on target') && 
                   !crit.includes('total shots on target');
        }
    },
    {
        code: MarketCodes.PLAYER_SHOTS_OU,
        priority: 94,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Player's shots" but NOT "shots on target" and NOT "total shots"
            return (name.includes("player's shots") || crit.includes("player's shots")) && 
                   !name.includes('shots on target') && 
                   !crit.includes('shots on target') &&
                   !name.includes('total shots') &&
                   !crit.includes('total shots') &&
                   norm.hints.isPlayerMarket;
        }
    },
    {
        code: MarketCodes.FIRST_GOAL_SCORER,
        priority: 105,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "First Goal Scorer" markets (more specific, check first)
            return n.includes('first goal scorer') || crit.includes('first goal scorer');
        }
    },
    {
        code: MarketCodes.FIRST_GOAL,
        priority: 104,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "First Goal" markets (team-based, not player-based)
            // Exclude "scorer" to avoid matching "First Goal Scorer"
            return (name.includes('first goal') || crit.includes('first goal')) && 
                   !name.includes('player') && !crit.includes('player') &&
                   !name.includes('scorer') && !crit.includes('scorer');
        }
    },
    {
        code: MarketCodes.ASIAN_TOTAL,
        priority: 103,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Asian Total" markets (full match, not 1st half)
            return (name.includes('asian total') && !name.includes('1st half')) || 
                   (crit.includes('asian total') && !crit.includes('1st half'));
        }
    },
    {
        code: MarketCodes.ASIAN_TOTAL_1ST_HALF,
        priority: 102,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Asian Total - 1st Half" markets
            return (name.includes('asian total') && name.includes('1st half')) || 
                   (crit.includes('asian total') && crit.includes('1st half'));
        }
    },
    {
        code: MarketCodes.ASIAN_HANDICAP,
        priority: 100,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Asian Handicap" or "Asian Line" markets (exclude Asian Total)
            return (name.includes('asian handicap') || name.includes('asian line')) && !name.includes('total') ||
                   (crit.includes('asian handicap') || crit.includes('asian line')) && !crit.includes('total');
        }
    },
    {
        code: MarketCodes.THREE_WAY_HANDICAP_1ST_HALF,
        priority: 101,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "3-Way Handicap - 1st Half" markets
            return (name.includes('3-way handicap') && name.includes('1st half')) || 
                   (crit.includes('3-way handicap') && crit.includes('1st half'));
        }
    },
    {
        code: MarketCodes.TEAM_OFFSIDES_BY,
        priority: 100,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match team-specific offsides markets (e.g., "Total Offsides by Atlético Mineiro-MG")
            return (name.includes('offsides by') || crit.includes('offsides by')) && 
                   !name.includes('player');
        }
    },
    {
        code: MarketCodes.TOTAL_OFFSIDES,
        priority: 99,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Total Offsides" markets
            return (name.includes('total offsides') || crit.includes('total offsides')) && 
                   !name.includes('player') && !name.includes('offsides by');
        }
    },
    {
        code: MarketCodes.MOST_SHOTS_ON_TARGET,
        priority: 98,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Most Shots on Target" markets
            return (name.includes('most shots on target') || crit.includes('most shots on target')) && 
                   !name.includes('player');
        }
    },
    {
        code: MarketCodes.TEAM_SHOTS_ON_TARGET_BY,
        priority: 97,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match team-specific shots on target markets (e.g., "Total Shots on Target by Atlético Mineiro-MG")
            return (name.includes('shots on target by') || crit.includes('shots on target by')) && 
                   !name.includes('player');
        }
    },
    {
        code: MarketCodes.TEAM_SHOTS_OU,
        priority: 95,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match team-specific shots markets (e.g., "Total Shots by Club Bolívar")
            return (name.includes('shots by') || crit.includes('shots by')) && 
                   !name.includes('player') && 
                   !name.includes('shots on target');
        }
    },
    {
        code: MarketCodes.TEAM_TOTAL_SHOTS_OU,
        priority: 90,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            return name.includes('total shots') && !name.includes('player') && !name.includes('shots on target') && !name.includes('shots by');
        }
    },
    {
        code: MarketCodes.TEAM_SHOTS_ON_TARGET_OU,
        priority: 96,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            return name.includes('total shots on target') && !name.includes('player');
        }
    },
    {
        code: MarketCodes.PLAYER_CARD_RED,
        priority: 95,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            return (name.includes('to get a red card'));
        }
    },
    {
        code: MarketCodes.PLAYER_CARD_ANY,
        priority: 92,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            return name.includes('to get a card') || crit.includes('to get a card');
        }
    },
    {
        code: MarketCodes.HALF_TIME_FULL_TIME,
        priority: 90,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            const outcome = norm.outcomeLower;
            
            // Check for Half Time/Full Time market name
            const isHalfTimeFullTime = name.includes('half time/full time') || 
                                     name.includes('half time full time') ||
                                     crit.includes('half time/full time') ||
                                     crit.includes('half time full time');
            
            // Check for numeric format like "1/1", "1/X", "1/2", etc.
            const hasNumericFormat = /^[12X]\/[12X]$/.test(outcome);
            
            return isHalfTimeFullTime && hasNumericFormat;
        }
    },
    {
        code: MarketCodes.METHOD_OF_SCORING_NEXT_GOAL,
        priority: 88,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            const outcome = norm.outcomeLower;
            
            // Check for Method of scoring next goal market
            const isMethodOfScoring = name.includes('method of scoring') || 
                                    name.includes('method of scoring next goal') ||
                                    crit.includes('method of scoring') ||
                                    crit.includes('method of scoring next goal');
            
            // Check for valid scoring methods
            const validMethods = ['shot inside the box', 'shot outside the box', 'header', 'penalty', 'free kick', 'own goal'];
            const hasValidMethod = validMethods.some(method => outcome.includes(method));
            
            return isMethodOfScoring && hasValidMethod;
        }
    },

    // Match Result (Match regular time)
    {
        code: MarketCodes.MATCH_RESULT,
        priority: 85,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            return name === 'match (regular time)';
        }
    },

    // Goals totals — protect team totals before match totals, and interval before generic
    {
        code: MarketCodes.TEAM_TOTAL_GOALS_OU,
        priority: 80,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            // Avoid capturing player totals: require explicit team wording
            // Exclude time window markets (they should be handled by MATCH_TOTAL_GOALS_INTERVAL_OU)
            const hasTimeWindow = norm.hints.hasTimeWindow;
            return (name.includes('total goals by') || name.includes('team total goals')) && !hasTimeWindow;
        }
    },
    {
        code: MarketCodes.MATCH_TOTAL_GOALS_1ST_HALF_OU,
        priority: 77,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            // Match "Total Goals - 1st Half" or "Total Goals - First Half"
            return (name.includes('total goals') && (name.includes('1st half') || name.includes('first half'))) &&
                   !name.includes('by') && // Exclude "Total Goals by Team - 1st Half"
                   !norm.hints.hasTimeWindow; // Exclude time window markets
        }
    },
    {
        code: MarketCodes.MATCH_TOTAL_GOALS_2ND_HALF_OU,
        priority: 76,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            // Match "Total Goals - 2nd Half" or "Total Goals - Second Half"
            return (name.includes('total goals') && (name.includes('2nd half') || name.includes('second half'))) &&
                   !name.includes('by') && // Exclude "Total Goals by Team - 2nd Half"
                   !norm.hints.hasTimeWindow; // Exclude time window markets
        }
    },
    {
        code: MarketCodes.MATCH_TOTAL_GOALS_INTERVAL_OU,
        priority: 75,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            // Handle both match totals and team totals with time windows
            return (name.includes('total goals') || name.includes('goals in')) && norm.hints.hasTimeWindow;
        }
    },
    {
        code: MarketCodes.MATCH_TOTAL_GOALS_OU,
        priority: 70,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            // Explicitly exclude player hints to avoid collisions
            // Also exclude 1st half and 2nd half (handled by specific codes above)
            if (norm.hints.isPlayerMarket || norm.hints.maybePlayerTotalGoals) return false;
            if (name.includes('1st half') || name.includes('2nd half') || name.includes('first half') || name.includes('second half')) return false;
            return name.includes('total goals');
        }
    },

    // Corners
    {
        code: MarketCodes.CORNERS_TEAM_TOTAL_OU,
        priority: 60,
        match: (bet, norm) => norm.marketNameLower.includes('team total corners') || norm.marketNameLower.includes('corners by')
    },
    {
        code: MarketCodes.CORNERS_TOTAL_OU,
        priority: 55,
        match: (bet, norm) => norm.marketNameLower.includes('total corners') && !norm.hints.hasTimeWindow
    },
    {
        code: MarketCodes.CORNERS_MOST,
        priority: 55,
        match: (bet, norm) => norm.marketNameLower.includes('most corners')
    },
    {
        code: MarketCodes.CORNERS_HANDICAP_3WAY,
        priority: 55,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            // Accept variations: "Corners 3-Way Handicap", "Corners 3-Way Line", "3-Way Corners Handicap", etc.
            return (n.includes('3-way') && n.includes('corner') && (n.includes('handicap') || n.includes('line')));
        }
    },
    {
        code: MarketCodes.CORNERS_FIRST_TO_X,
        priority: 50,
        match: (bet, norm) => norm.marketNameLower.includes('first to') && norm.marketNameLower.includes('corners')
    },
    {
        code: MarketCodes.CORNERS_MOST_TIME_WINDOW,
        priority: 60,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('most corners') && n.includes('-') && norm.hints.hasTimeWindow;
        }
    },
    {
        code: MarketCodes.CORNERS_TOTAL_OU_TIME_WINDOW,
        priority: 65,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('total corners') && n.includes('-') && norm.hints.hasTimeWindow;
        }
    },
    {
        code: MarketCodes.CORNER_OCCURRENCE_TIME_WINDOW,
        priority: 70,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('corner') && n.includes('-') && norm.hints.hasTimeWindow && 
                   (n.includes('2nd half') || n.includes('1st half') || n.includes('half')) &&
                   !n.includes('first corner');
        }
    },
    {
        code: MarketCodes.FIRST_CORNER_TIME_WINDOW,
        priority: 75,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('first corner') && n.includes('-') && norm.hints.hasTimeWindow && 
                   (n.includes('2nd half') || n.includes('1st half') || n.includes('half'));
        }
    },

    // Cards
    {
        code: MarketCodes.CARDS_3_WAY_LINE,
        priority: 55,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return (n.includes('cards') && n.includes('3-way') && n.includes('line'));
        }
    },

    // 3-Way Line (goal-based handicap)
    {
        code: MarketCodes.THREE_WAY_LINE,
        priority: 50,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            // Exclude cards and corners - they have their own market codes
            return (n.includes('3-way') && n.includes('line') && !n.includes('cards') && !n.includes('corner'));
        }
    },

    {
        code: MarketCodes.GOAL_IN_BOTH_HALVES,
        priority: 20,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('goal in both halves');
        }
    },

    {
        code: MarketCodes.PLAYER_RED_CARD,
        priority: 15,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('to get a red card');
        }
    },

    {
        code: MarketCodes.TEAM_RED_CARD,
        priority: 14,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('given a red card') || n.includes('team given a red card');
        }
    },


    {
        code: MarketCodes.GOALKEEPER_SAVES,
        priority: 10,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('goalkeeper saves') && !n.includes('settled using opta data');
        }
    },

    {
        code: MarketCodes.GOALKEEPER_SAVES_TOTAL,
        priority: 9,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('goalkeeper saves') && n.includes('settled using opta data');
        }
    },

    {
        code: MarketCodes.PLAYER_ASSIST,
        priority: 8,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('to assist') && n.includes('settled using opta data');
        }
    },

    {
        code: MarketCodes.PLAYER_SCORE_OR_ASSIST,
        priority: 98,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('to score or assist') && n.includes('settled using opta data');
        }
    },

    {
        code: MarketCodes.PLAYER_SCORE_OUTSIDE_PENALTY,
        priority: 97,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('to score from outside the penalty box');
        }
    },

    {
        code: MarketCodes.PLAYER_SCORE_HEADER,
        priority: 96,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('to score from a header');
        }
    },

    {
        code: MarketCodes.PENALTY_KICK_AWARDED,
        priority: 95,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            const crit = norm.criterionLower;
            return (n.includes('penalty kick awarded') || crit.includes('penalty kick awarded'));
        }
    },

    {
        code: MarketCodes.TEAM_SCORE_FROM_PENALTY,
        priority: 94,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            const crit = norm.criterionLower;
            return (n.includes('to score from a penalty') || crit.includes('to score from a penalty')) && 
                   !n.includes('player') && !crit.includes('player');
        }
    },

    {
        code: MarketCodes.OWN_GOAL,
        priority: 93,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            const crit = norm.criterionLower;
            return (n.includes('own goal') || crit.includes('own goal'));
        }
    },

    {
        code: MarketCodes.HALF_TIME,
        priority: 15,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('half time') && !n.includes('total') && !n.includes('goals');
        }
    },

    {
        code: MarketCodes.DOUBLE_CHANCE_2ND_HALF,
        priority: 14,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('double chance') && n.includes('2nd half');
        }
    },

    {
        code: MarketCodes.DOUBLE_CHANCE_1ST_HALF,
        priority: 13,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('double chance') && n.includes('1st half');
        }
    },

    {
        code: MarketCodes.WIN_TO_NIL,
        priority: 85,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Win to Nil" markets - both in market name and criterion
            return (name.includes('win to nil') || crit.includes('win to nil')) && 
                   !name.includes('player') && !crit.includes('player');
        }
    },

    {
        code: MarketCodes.CORRECT_SCORE,
        priority: 82,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Correct Score" markets (can be full-time, 1st half, or 2nd half)
            return name.includes('correct score') || crit.includes('correct score');
        }
    },

    {
        code: MarketCodes.BTTS_1ST_HALF,
        priority: 81,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Both Teams To Score - 1st Half" markets
            // Check both market name and criterion for flexibility
            const hasBtts = name.includes('both teams to score') || name.includes('btts') ||
                           crit.includes('both teams to score') || crit.includes('btts');
            const hasFirstHalf = name.includes('1st half') || name.includes('first half') ||
                               crit.includes('1st half') || crit.includes('first half');
            return hasBtts && hasFirstHalf;
        }
    },

    {
        code: MarketCodes.BTTS_2ND_HALF,
        priority: 80,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Both Teams To Score - 2nd Half" markets
            return (name.includes('both teams to score') || name.includes('btts')) &&
                   (name.includes('2nd half') || name.includes('second half'));
        }
    },

    {
        code: MarketCodes.BTTS,
        priority: 79,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Both Teams To Score" markets (full-time, exclude 1st/2nd half)
            return (name.includes('both teams to score') || name.includes('btts')) &&
                   !name.includes('1st half') && !name.includes('2nd half') &&
                   !name.includes('first half') && !name.includes('second half');
        }
    },

    {
        code: MarketCodes.MOST_CARDS_1ST_HALF,
        priority: 78,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Most Cards - 1st Half" markets
            return (name.includes('most cards') || crit.includes('most cards')) &&
                   (name.includes('1st half') || name.includes('first half') ||
                    crit.includes('1st half') || crit.includes('first half'));
        }
    },

    {
        code: MarketCodes.MOST_CARDS_2ND_HALF,
        priority: 77,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Most Cards - 2nd Half" markets
            return (name.includes('most cards') || crit.includes('most cards')) &&
                   (name.includes('2nd half') || name.includes('second half') ||
                    crit.includes('2nd half') || crit.includes('second half'));
        }
    },

    {
        code: MarketCodes.MOST_CARDS,
        priority: 76,
        match: (bet, norm) => {
            const name = norm.marketNameLower;
            const crit = norm.criterionLower;
            // Match "Most Cards" markets (full-time, exclude 1st/2nd half)
            return (name.includes('most cards') || crit.includes('most cards')) &&
                   !name.includes('1st half') && !name.includes('2nd half') &&
                   !name.includes('first half') && !name.includes('second half');
        }
    },

    { code: MarketCodes.UNKNOWN, priority: 0, match: () => true }
];

export function identifyMarket(bet, norm) {
    let best = { code: MarketCodes.UNKNOWN, priority: -1 };
    for (const entry of MARKET_REGISTRY) {
        try {
            if (entry.match(bet, norm)) {
                if (entry.priority > best.priority) best = entry;
            }
        } catch (_) {
            // ignore matcher errors
        }
    }
    return best.code;
}

function looksLikePlayerSelection(norm) {
    // If the selection is neither over/under nor yes/no nor team names, it often is a player's name
    const s = norm.hints.selection;
    if (!s) return false;
    const simple = ['over', 'under', 'yes', 'no', '1', '2', 'x', 'home', 'away'];
    if (simple.includes(s)) return false;
    // Contains a space and letters → likely a name
    return /[a-z]/.test(s) && s.includes(' ');
}
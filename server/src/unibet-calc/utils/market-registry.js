// Market Registry: precise identification rules with precedence to avoid collisions

export const MarketCodes = {
    PLAYER_TO_SCORE: 'PLAYER_TO_SCORE',
    PLAYER_TO_SCORE_2PLUS: 'PLAYER_TO_SCORE_2PLUS',
    PLAYER_SOT_OU: 'PLAYER_SOT_OU',
    PLAYER_CARD_ANY: 'PLAYER_CARD_ANY',
    PLAYER_CARD_RED: 'PLAYER_CARD_RED',

    MATCH_RESULT: 'MATCH_RESULT',
    TEAM_TOTAL_GOALS_OU: 'TEAM_TOTAL_GOALS_OU',
    MATCH_TOTAL_GOALS_OU: 'MATCH_TOTAL_GOALS_OU',
    MATCH_TOTAL_GOALS_INTERVAL_OU: 'MATCH_TOTAL_GOALS_INTERVAL_OU',
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
    FIRST_GOAL_SCORER: 'FIRST_GOAL_SCORER',
    GOALKEEPER_SAVES: 'GOALKEEPER_SAVES',
    GOALKEEPER_SAVES_TOTAL: 'GOALKEEPER_SAVES_TOTAL',
    PLAYER_ASSIST: 'PLAYER_ASSIST',
    PLAYER_SCORE_OR_ASSIST: 'PLAYER_SCORE_OR_ASSIST',
    PLAYER_SCORE_OUTSIDE_PENALTY: 'PLAYER_SCORE_OUTSIDE_PENALTY',
    PLAYER_SCORE_HEADER: 'PLAYER_SCORE_HEADER',
    HALF_TIME: 'HALF_TIME',

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
            return name.includes("player's shots on target") || crit.includes('shots on target');
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
            if (norm.hints.isPlayerMarket || norm.hints.maybePlayerTotalGoals) return false;
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
            // Accept variations: "Corners 3-Way Handicap", "3-Way Corners Handicap", etc.
            return (n.includes('3-way') && n.includes('corner') && n.includes('handicap'));
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
            return (n.includes('3-way') && n.includes('line') && !n.includes('cards'));
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
        code: MarketCodes.FIRST_GOAL_SCORER,
        priority: 12,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('first goal scorer');
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
        code: MarketCodes.HALF_TIME,
        priority: 15,
        match: (bet, norm) => {
            const n = norm.marketNameLower;
            return n.includes('half time') && !n.includes('total') && !n.includes('goals');
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
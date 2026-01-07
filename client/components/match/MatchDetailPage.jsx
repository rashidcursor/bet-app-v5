"use client"
import React, { useEffect } from 'react';
import MatchHeader from "./MatchHeader"
import BettingTabs from "./BettingTabs"
import MatchVisualization from "./MatchVisualization"
import { useCustomSidebar } from "@/contexts/SidebarContext.js"
import { useSelector, useDispatch } from "react-redux"
import { 
    fetchMatchById, 
    fetchMatchByIdV2,
    clearError,
    clearMatchDetailV2,
    silentUpdateMatchByIdV2
} from "@/lib/features/matches/matchesSlice"
import { 
    selectMatchDetailV2, 
    selectMatchDetailV2Loading, 
    selectMatchDetailV2Error 
} from "@/lib/features/matches/matchesSlice"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { useOddsSync } from "@/hooks/useOddsSync"

const isMatchLive = (match) => {
    if (!match || !match.start) return false;
    const now = new Date();
    let matchTime;
    if (match.start.includes('T')) {
        matchTime = new Date(match.start.endsWith('Z') ? match.start : match.start + 'Z');
    } else {
        matchTime = new Date(match.start.replace(' ', 'T') + 'Z');
    }
    const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000);
    return matchTime <= now && now < matchEnd;
};

const MatchDetailPage = ({ matchId }) => {
    const dispatch = useDispatch();
    
    // Use new clean API by default, fallback to old API if needed
    const useNewAPI = true;
    
    // Enable real-time odds synchronization between match detail and betslip
    useOddsSync(matchId);
    
    const {
        matchData,
        betOffers,
        loading,
        error
    } = useSelector((state) => {
        if (useNewAPI) {
            const v2Data = selectMatchDetailV2(state, matchId);
            return {
                matchData: v2Data?.matchData || null,
                betOffers: v2Data?.betOffers || [],
                loading: selectMatchDetailV2Loading(state),
                error: selectMatchDetailV2Error(state),
            };
        } else {
            return {
        matchData: state.matches.matchDetails[matchId],
        betOffers: state.matches.matchDetails[matchId]?.betOffers || [],
        loading: state.matches.matchDetailLoading,
        error: state.matches.matchDetailError,
            };
        }
    });

    useEffect(() => {
        if (matchId && !matchData) {
            if (useNewAPI) {
                dispatch(fetchMatchByIdV2(matchId)).catch((error) => {
                    dispatch(fetchMatchById(matchId));
                });
            } else {
            dispatch(fetchMatchById(matchId));
        }
        }
    }, [matchId, matchData, dispatch, useNewAPI]);

    // Client-side polling to refresh odds every 1s (uses silent update)
    useEffect(() => {
        if (!matchId || !useNewAPI) return;
        let intervalId;
        const start = () => {
            intervalId = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return; // pause when tab hidden
                dispatch(silentUpdateMatchByIdV2(matchId));
            }, 1000);
        };
        start();
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [matchId, dispatch, useNewAPI]);

    const handleRetry = () => {
        dispatch(clearError());
        if (useNewAPI) {
            dispatch(clearMatchDetailV2(matchId));
            dispatch(fetchMatchByIdV2(matchId));
        } else {
        dispatch(fetchMatchById(matchId));
        }
    };

    if (loading) {
        return (
            <div className="bg-slate-100 min-h-screen relative">
                <div className="lg:mr-80 xl:mr-96">
                    <div className="lg:p-2 xl:p-4">
                        <Card className="w-full">
                            <CardContent className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-base" />
                                    <p className="text-gray-600">
                                        {useNewAPI ? 'Loading match details from clean API...' : 'Loading match details...'}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-100 min-h-screen relative">
                <div className="lg:mr-80 xl:mr-96">
                    <div className="lg:p-2 xl:p-4">
                        <Card className="w-full border-red-200">
                            <CardContent className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-600" />
                                    <p className="text-red-600 font-medium mb-2">Failed to load match</p>
                                    <p className="text-gray-600 mb-4">{error}</p>
                                    <Button onClick={handleRetry} variant="outline" size="sm">
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Try Again
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

    if (!matchData) {
        return (
            <div className="bg-slate-100 min-h-screen relative">
                <div className="lg:mr-80 xl:mr-96">
                    <div className="lg:p-2 xl:p-4">
                        <Card className="w-full">
                            <CardContent className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <AlertCircle className="h-8 w-8 mx-auto mb-4 text-gray-400" />
                                    <p className="text-gray-600">Match not found</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

    // Process match data based on API version
    let displayMatchData;
    let bettingData;
    let oddsClassification;

    if (useNewAPI) {
        // New clean API data structure - betOffers API response
        
        // Extract event info from events array
        const eventData = matchData.data?.events?.[0];
        console.log('🔍 Event Data:', eventData);
        const eventId = matchData.eventId;
        
        
        displayMatchData = {
            id: eventId,
            name: eventData?.name || eventData?.englishName || `Match ${eventId}`,
            start: eventData?.start || new Date().toISOString(),
            state: eventData?.state || 'NOT_STARTED',
            // Special case for match 1022853538: Use correct team mapping from event data
            // For other matches, prefer full participants from payload (includes team participantIds)
            participants: (eventId === '1022853538')
                ? [
                    { name: eventData?.homeName || 'Home Team', position: 'home', participantType: 'TEAM' },
                    { name: eventData?.awayName || 'Away Team', position: 'away', participantType: 'TEAM' }
                ]
                : (eventData?.participants && Array.isArray(eventData.participants) && eventData.participants.length > 0)
                    ? eventData.participants
                    : [
                        { name: eventData?.homeName || 'Home Team', position: 'home', participantType: 'TEAM' },
                        { name: eventData?.awayName || 'Away Team', position: 'away', participantType: 'TEAM' }
                    ],
            league: { 
                name: eventData?.group || 'Football League',
                id: eventData?.groupId
            },
            parentName: eventData?.path?.[1]?.name || eventData?.parentName || '',
            liveData: eventData?.state === 'STARTED' ? {
                score: '0-0', // We'll get real score from live-matches API
                period: '1st Half',
                minute: '0'
            } : null,
            // Convert betOffers to betting_data format for compatibility
            betting_data: (matchData.data?.betOffers || [])
                .filter(offer => {
                    const marketName = offer.criterion?.label || offer.criterion?.englishLabel || offer.betOfferType?.name;
                    const isImplemented = isMarketImplemented(marketName);
                    
                    // Debug penalty markets
                    if (marketName && marketName.toLowerCase().includes('penalty')) {
                        console.log('🔍 Penalty market found:', marketName, 'Implemented:', isImplemented);
                        console.log('🔍 Full offer data:', offer);
                    }
                    
                    if (!isImplemented) {
                    }
                    return isImplemented;
                })
                .map(offer => {
                    const offerName = offer.criterion?.label || offer.criterion?.englishLabel || offer.betOfferType?.name;
                    return ({
                        id: offer.id,
                        name: offerName,
                        outcomes: (offer.outcomes || []).map(outcome => ({
                        id: outcome.id,
                        name: outcome.label || outcome.participant || outcome.name, // Use participant name if available, otherwise use label
                        odds: outcome.odds / 1000, // Convert from Unibet format (13000 -> 13.00)
                        status: outcome.status,
                        line: outcome.line, // Include line value for Over/Under markets (raw)
                        handicap: outcome.line != null ? (outcome.line / 1000) : null, // Convert handicap line (1000 -> 1.0)
                        participant: outcome.participant,
                        participantId: outcome.participantId,
                        eventParticipantId: outcome.eventParticipantId,
                        marketId: offer.id, // ✅ Use betOffer ID as marketId
                        market_id: offer.id // ✅ Also set market_id for compatibility
                        }))
                    });
                })
        };

        bettingData = displayMatchData.betting_data;
        
        // Fallback: If bettingData is empty but we have raw betOffers, try to process them directly
        if ((!bettingData || bettingData.length === 0) && matchData.data?.betOffers?.length > 0) {
            bettingData = matchData.data.betOffers
                .filter(offer => {
                    const marketName = offer.criterion?.label || offer.criterion?.englishLabel || offer.betOfferType?.name;
                    const isImplemented = isMarketImplemented(marketName);
                    if (!isImplemented) {
                    }
                    return isImplemented;
                })
                .map(offer => ({
                    id: offer.id,
                    name: offer.criterion?.label || offer.criterion?.englishLabel || offer.betOfferType?.name,
                    outcomes: (offer.outcomes || []).map(outcome => ({
                        id: outcome.id,
                        name: outcome.label || outcome.participant || outcome.name, // Use participant name if available, otherwise use label
                        odds: outcome.odds / 1000,
                        status: outcome.status,
                        line: outcome.line, // Include line value for Over/Under markets
                        handicap: outcome.line != null ? (outcome.line / 1000) : null, // Convert handicap line (1000 -> 1.0)
                        participant: outcome.participant,
                        participantId: outcome.participantId,
                        eventParticipantId: outcome.eventParticipantId,
                        marketId: offer.id, // ✅ Use betOffer ID as marketId
                        market_id: offer.id // ✅ Also set market_id for compatibility
                    }))
                }));
        }
        
        // Create proper market categorization (like unibet-api app)
        const categorizedMarkets = categorizeMarkets(bettingData);
        
        const categories = [
            { id: 'all', label: 'All', odds_count: bettingData.length, priority: 0 },
            ...Object.entries(categorizedMarkets).map(([categoryId, markets]) => ({
                id: categoryId,
                label: getCategoryLabel(categoryId),
                odds_count: markets.length,
                priority: getCategoryPriority(categoryId)
            }))
        ];
        
        // Transform categorized markets into the format expected by BettingTabs
        const transformedClassifiedOdds = {};
        Object.entries(categorizedMarkets).forEach(([categoryId, markets]) => {
            let groupedMarkets;
            if (categoryId === 'scorers') {
                groupedMarkets = buildScorerMarkets(markets, displayMatchData.participants);
            } else {
                // Default grouping: group markets by name and flatten outcomes
                groupedMarkets = markets.reduce((acc, market) => {
                    const marketName = market.name;
                    if (!acc[marketName]) {
                        acc[marketName] = {
                            market_description: marketName,
                            market_id: market.id,
                            odds: []
                        };
                    }
                    market.outcomes.forEach(outcome => {
                        const lowerMarket = String(marketName || '').toLowerCase();
                        const lineValueNormalized = outcome.line != null ? outcome.line / 1000 : null;
                        // Special handling for Correct Score: render flat list of scores
                        if (lowerMarket.includes('correct score')) {
                            // Determine score string
                            const scoreStr = outcome.homeScore != null && outcome.awayScore != null
                                ? `${outcome.homeScore}-${outcome.awayScore}`
                                : (String(outcome.name || ''));
                            acc[marketName].odds.push({
                                id: outcome.id,
                                label: scoreStr, // display score text
                                value: outcome.odds,
                                name: scoreStr,
                                suspended: outcome.status !== 'OPEN',
                                marketId: outcome.marketId || outcome.market_id || market.id, // ✅ Preserve marketId
                                market_id: outcome.marketId || outcome.market_id || market.id // ✅ Also set market_id
                            });
                            return;
                        }

                        let displayLabel = outcome.name;
                        if (outcome.line !== undefined && outcome.line !== null) {
                            const lineValue = lineValueNormalized;
                            if (String(outcome.name).toLowerCase().includes('over')) {
                                displayLabel = `Over ${lineValue}`;
                            } else if (String(outcome.name).toLowerCase().includes('under')) {
                                displayLabel = `Under ${lineValue}`;
                            }
                        }
                        // Normalize Yes/No, Odd/Even to readable labels
                        const lowerName = String(outcome.name || '').toLowerCase();
                        if (lowerName === 'ot_yes'.toLowerCase() || lowerName === 'yes') displayLabel = 'Yes';
                        if (lowerName === 'ot_no'.toLowerCase() || lowerName === 'no') displayLabel = 'No';
                        if (lowerName === 'even' || lowerName === 'ot_even'.toLowerCase()) displayLabel = 'Even';
                        if (lowerName === 'odd' || lowerName === 'ot_odd'.toLowerCase()) displayLabel = 'Odd';
                        // For player markets (cards, shots, YES-only specials), prefer participant name as display name
                        const isPlayerCardMarket =
                            lowerMarket.includes('to get a card') ||
                            lowerMarket.includes('to be booked') ||
                            lowerMarket.includes('player cards') ||
                            lowerMarket.includes('to get a red card');
                        const isPlayerShotsMarket =
                            (lowerMarket.includes('shot') || lowerMarket.includes('on target')) &&
                            (lowerMarket.includes('player') || Boolean(outcome.participant));
                        const isPlayerYesSpecialMarket =
                            lowerMarket.includes('to score at least') ||
                            lowerMarket.includes('to assist') ||
                            lowerMarket.includes('to score from outside the penalty box') ||
                            lowerMarket.includes('to score from a header') ||
                            lowerMarket.includes('to score or assist');
                        // ✅ FIX: Unibet "To Score" is a Player Occurrence Line with label "Yes" and participant = player name.
                        // Treat it like a player YES-style market so displayName becomes the player name (not "Yes").
                        const isPlayerToScoreYesMarket =
                            lowerMarket === 'to score' &&
                            Boolean(outcome.participant) &&
                            String(outcome.name || '').toLowerCase() === 'yes';
                        if (isPlayerShotsMarket) {
                            console.log('🔍 Player shots market found:', lowerMarket, 'Outcome:', outcome);
                        }
                        // For team line markets (e.g., Cards Line), populate handicap from line
                        const isLineMarket = lowerMarket.includes(' line') || lowerMarket === 'line';
                        const displayName =
                            (isPlayerCardMarket || isPlayerShotsMarket || isPlayerYesSpecialMarket || isPlayerToScoreYesMarket)
                                ? (outcome.participant || displayLabel)
                                : displayLabel;
                        acc[marketName].odds.push({
                            id: outcome.id,
                            label: displayLabel,
                            value: outcome.odds,
                            name: displayName,
                            marketId: outcome.marketId || outcome.market_id || market.id, // ✅ Preserve marketId
                            market_id: outcome.marketId || outcome.market_id || market.id, // ✅ Also set market_id
                            suspended: outcome.status !== 'OPEN',
                            line: lineValueNormalized,
                            // Provide both total (for Over/Under) and handicap (for Asian/Handicap lines)
                            total: (displayLabel.startsWith('Over ') || displayLabel.startsWith('Under ')) && lineValueNormalized != null ? lineValueNormalized : null,
                            handicap: (lowerMarket.includes('asian') || lowerMarket.includes('handicap') || lowerMarket.includes(' line') || isLineMarket) && lineValueNormalized != null ? lineValueNormalized : null,
                            participant: outcome.participant,
                            eventParticipantId: outcome.eventParticipantId,
                            participantId: outcome.participantId
                        });
                    });
                    return acc;
                }, {});
            }

            transformedClassifiedOdds[categoryId] = {
                label: getCategoryLabel(categoryId),
                markets_data: groupedMarkets,
                priority: getCategoryPriority(categoryId)
            };
        });
        
        oddsClassification = {
            categories,
            classified_odds: transformedClassifiedOdds,
            stats: {
                total_categories: categories.length - 1,
                total_odds: bettingData.length
            }
        };
    } else {
        // Old API data structure (fallback)
        displayMatchData = matchData;
        bettingData = matchData.betting_data || [];
        oddsClassification = matchData.odds_classification || {
            categories: [{ id: 'all', label: 'All', odds_count: 0 }],
            classified_odds: {},
            stats: { total_categories: 0, total_odds: 0 }
          };
    }

    const isLive = isMatchLive(displayMatchData);

    // Show no betting options message only if there are truly no odds available
    if (!bettingData || bettingData.length === 0) {
        return (
            <div className="bg-slate-100 min-h-[calc(100vh-198px)] flex flex-col items-center justify-center">
                <div className="text-center p-8 bg-white shadow-md">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">
                        No Betting Options Available
                    </h2>
                    <p className="text-gray-600 mb-6">
                        There are currently no betting options available for this match.
                    </p>
                    <Button 
                        className="bg-base hover:bg-base-dark text-white font-medium py-2 px-6 shadow-sm" 
                        onClick={() => window.history.back()}
                    >
                        Go Back
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-100 min-h-screen">
            {/* Main content - adjusts width when sidebar expands */}
            <div className="lg:mr-80 xl:mr-96">
                <div className="lg:p-2 xl:p-4 pb-20 md:pb-2 xl:pb-4">
                    <MatchHeader matchData={displayMatchData} onScoreUpdate={(scoreData) => {
                    }} />
                    <BettingTabs 
                        matchData={{ 
                            ...displayMatchData, 
                            betting_data: bettingData,
                            odds_classification: oddsClassification,
                            league: displayMatchData.league
                        }} 
                    />
                </div>
            </div>

            {/* Right sidebar - fixed position, doesn't move */}
            <div className="w-full lg:w-80 xl:w-96 lg:fixed lg:right-4 lg:top-40 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:z-40">
                <div className="p-2 sm:p-3 md:p-4 lg:p-2">
                    <MatchVisualization matchData={displayMatchData} />
                </div>
            </div>
        </div>
    )
}

// List of implemented and tested markets (backend only supports these)
const IMPLEMENTED_MARKETS = [
    'Double Chance',
    'Half time/full time',
    'total goals by team',
    'full time result',
    'Match Regular Time',
    'Match (regular time)',
    'full time',
    
    'Correct score',
    'total goals odd even',
    'Draw no bet',
    'Interval Winner - 30:00-59:59',
    'total goals by team 2nd half',
    'Total Goals - 30:00-59:59',
    'total goals by team 30:00-59:59',
    'next goal no goal no bet',
    'Method of scoring next Goal 2 - (No goal, No bet)',
    'Asian line (1-0)',
    'Cards 3-Way Line',
    '3-Way Line',
    '3-Way Handicap',
    'Corners 3-Way Handicap',
    'total corners by team',
    'total corners',
    'most corners',
    'first to corners',
    // 'next corner no corner no bet',
    'Most Corners - 50:00-59:59',
    'team given a red card',
    'given a red card',
    'to get a card',
    'most cards',
    'red card given',
    'most red cards',
    'player\'s shots on target',
    'Total Shots (Settled using Opta data)',
    'Total Shots on Target (Settled using Opta data)',
    'Total Shots by',
    'Total Shots on Target by',
    'Most Shots on Target (Settled using Opta data)',
    'Total Offsides (Settled using Opta data)',
    'Total Offsides by',
    '3-Way Handicap - 1st Half',
    'Asian Total - 1st Half',
    'Asian Total',
    'First Goal (Draw: No Goals)',
    'To score',
    'To score atleat 2 goals',
    '2nd Half',
    'exact winning margin',
    'total goals',
    'total cards',
    'total cards team',
    'Draw no bet 2nd half',
    'Both Teams To Score',
    '1st Half Total Goals',
    'Total Goals - 1st Half',
    'Total Goals - 2nd Half',
    'Goal in Both Halves',
    'To Get a Red Card',
    'First Goal Scorer',
    'Goalkeeper Saves',
    'To Assist',
    'To Score Or Assist',
    'To score from outside the penalty box',
    'To score from a header',
    'Penalty Kick awarded',
    'to score from a penalty',
    'Club Bolívar to score from a penalty',
    'Atlético Mineiro-MG to score from a penalty',
    'Own goal',
    'Half Time',
    'Double Chance - 2nd Half',
    'Double Chance - 1st Half',
    'Win to Nil',
    'to Win to Nil',
    // Player generic shots (not on target) – new market
    'Player\'s shots (Settled using Opta data)',
];

// Helper function to check if a market is implemented
function isMarketImplemented(marketName) {
    const name = marketName.toLowerCase();
    
    // Debug penalty markets specifically
    if (name.includes('penalty')) {
        console.log('🔍 Checking penalty market:', name);
    }
    
    // Exclude specific markets that should not be shown
    if (name.includes('total corner') && name.includes('1st half')) return false;
    if (name.includes('to score at least 3 goals')) return false;
    
    // Check for exact matches first
    for (const implementedMarket of IMPLEMENTED_MARKETS) {
        if (name === implementedMarket.toLowerCase()) {
            return true;
        }
    }
    
    // Check for partial matches (more flexible matching)
    const implementedLower = IMPLEMENTED_MARKETS.map(m => m.toLowerCase());
    
    // Special cases for flexible matching
    if (name.includes('double chance')) return true;
    if (name.includes('to score from a penalty')) {
        console.log('✅ Penalty market matched by flexible pattern:', name);
        return true;
    }
    if (name.includes('win to nil')) {
        console.log('✅ Win to Nil market matched by flexible pattern:', name);
        return true;
    }
    if (name.includes('half time') && name.includes('full time')) return true;
    if (name.includes('total goals by') && !name.includes('2nd half') && !name.includes('30:00-59:59')) return true;
    if (name.includes('total goals by') && !name.includes('1st half') && !name.includes('30:00-59:59')) return true;
    if (name.includes('total goals by') ) return true;
    if (name.includes('full time result') || name.includes('match result')) return true;
    if (name.includes('match regular time') || name.includes('regular time') || name.includes('match (regular time)')) return true;
    if (name.includes('correct score')) return true;
    if (name.includes('both teams to score') || name.includes('btts')) return true;
    if (name.includes('1st half total goals') || name.includes('first half total goals')) return true;
    if (name.includes('2nd half total goals') || name.includes('second half total goals')) return true;
    if (name.includes('total goals') && (name.includes('odd') || name.includes('even'))) return true;
    if (name.includes('draw no bet') && !name.includes('2nd half')) return true;
    if (name.includes('interval winner') && name.includes('30:00-59:59')) return true;
    if (name.includes('total goals by team') && name.includes('2nd half')) return true;
    if (name.includes('total goals') && name.includes('30:00-59:59') && !name.includes('by team')) return true;
    if (name.includes('total goals by team') && name.includes('30:00-59:59')) return true;
    if (name.includes('next goal') && name.includes('no goal') && name.includes('no bet')) return true;
    if (name.includes('method of scoring') && name.includes('next goal') && name.includes('no goal') && name.includes('no bet')) return true;
    if (name.includes('asian line') || name.includes('asian handicap')) return true;
    if (name.includes('cards') && name.includes('3-way')) return true;
    if (name.includes('3-way line') || name.includes('three way line')) return true;
    if (name.includes('total corners by team')) return true;
    if (name.includes('total corners') && !name.includes('by team')) return true;
    if (name.includes('most corners') && !name.includes('50:00-59:59')) return true;
    if (name.includes('first to corners')) return true;
    // if (name.includes('next corner') && name.includes('no corner') && name.includes('no bet')) return true;
    if (name.includes('most corners') && name.includes('50:00-59:59')) return true;
    if (name.includes('team given a red card')) return true;
    if (name.includes('given a red card')) return true;
    if (name.includes('to get a card')) return true;
    if (name.includes('to get a red card')) return true;
    if (name.includes('first goal scorer')) return true;
    if (name.includes('goalkeeper saves')) return true;
    if (name.includes('most cards')) return true;
    if (name.includes('red card given')) return true;
    if (name.includes('most red cards')) return true;
    if (name.includes('player\'s shots on target')) return true;
    // NEW: allow generic Player's shots (Opta) markets
    if (name.includes('player\'s shots') && !name.includes('on target')) return true;
    if (name.includes('total shots') && !name.includes('player')) return true;
    if (name.includes('total shots on target') && !name.includes('player')) return true;
    if (name.includes('shots by') && !name.includes('player')) return true;
    if (name.includes('shots on target by') && !name.includes('player')) return true;
    if (name.includes('most shots on target') && !name.includes('player')) return true;
    if (name.includes('total offsides') && !name.includes('player')) return true;
    if (name.includes('offsides by') && !name.includes('player')) return true;
    if (name.includes('3-way handicap') && name.includes('1st half')) return true;
    if (name.includes('asian total') && name.includes('1st half')) return true;
    if (name.includes('asian total') && !name.includes('1st half')) return true;
    if (name.includes('first goal') && !name.includes('player')) return true;
    if (name.includes('to score')) return true;
    if (name.includes('to score') && name.includes('at least 2 goals') && name.includes('team member')) return true;
    if (name.includes('2nd half') && !name.includes('draw no bet') && !name.includes('total goals')) return true;
    if (name.includes('exact winning margin')) return true;
    if (name.includes('total cards') && !name.includes('team')) return true;
    if (name.includes('total cards')) return true;
    if (name.includes('draw no bet') && name.includes('2nd half')) return true;
    if (name.includes('goal in both halves')) return true;
    if (name.includes('to get a red card')) return true;
    if (name.includes('to assist')) return true;
    if (name.includes('to score or assist')) return true;
    if (name.includes('to score from outside the penalty box')) return true;
    if (name.includes('to score from a header')) return true;
    if (name.includes('half time') && !name.includes('total') && !name.includes('goals')) return true;
    if (name.includes('double chance') && name.includes('2nd half')) return true;
    if (name.includes('double chance') && name.includes('1st half')) return true;
    
    return false;
}

// Helper methods for market categorization (based on unibet-api logic)
function categorizeMarkets(bettingData) {
    // Fine‑grained categories aligned with the bookmaker UI screenshots
    const categorized = {
        // Top-level tabs
        'three-way-line': [],
        'asian-lines': [],
        // Match events – row 1
        'match-regular-time': [],
        'player-shots-on-target': [],
        'player-cards': [],
        'goal-scorer': [],
        'player-goals': [],
        'goalkeeper-saves': [],
        'player-assist': [],
        'player-specials': [],
        // Match events – row 2
        'player-fouls': [],
        'player-shots': [],
        'half-time': [],
        'corners': [],
        'cards': [],
        'match-team-shots': [],
        'match-team-fouls': [],
        'match-team-stats': [],
        // Fallback buckets
        'goals-other': [],
        'other': []
    };

    bettingData.forEach(offer => {
        const name = offer.name || '';
        const marketName = name.toLowerCase();
        
        // Filter out non-implemented markets (double‑safety)
        if (!isMarketImplemented(name)) {
            return;
        }
        
        // Helper for placing in first non‑empty category id
        const assign = (...ids) => {
            const target = ids.find(id => categorized[id] !== undefined);
            if (target) categorized[target].push(offer);
        };

        // 3‑Way Line / Handicap & Asian Lines
        if (marketName.includes('3-way') || marketName.includes('3 way') || marketName.includes('three way')) {
            return assign('three-way-line');
        }
        if (marketName.includes('asian') || marketName.includes('handicap')) {
            return assign('asian-lines');
        }
        
        // Match (regular time) – full‑time match result style markets
        if (
            marketName.includes('match (regular time)') ||
            marketName.includes('match regular time') ||
            marketName.includes('full time result') ||
            (marketName.includes('match') && marketName.includes('winner')) ||
            marketName.includes('head to head') ||
            (marketName.includes('draw no bet') && !marketName.includes('2nd half')) ||
            (marketName.includes('double chance') && !marketName.includes('1st half') && !marketName.includes('2nd half')) ||
            marketName.includes('win to nil') ||
            marketName.includes('result / total')
        ) {
            return assign('match-regular-time');
        }

        // Half Time specific match markets
        if (
            (marketName.includes('half time') && !marketName.includes('full time')) ||
            marketName.includes('1st half') ||
            marketName.includes('first half')
        ) {
            return assign('half-time');
        }

        // Corners
        if (marketName.includes('corner')) {
            return assign('corners');
        }

        // Cards – team / total cards vs player card props
        if (marketName.includes('card')) {
            const isPlayerCardMarket =
                marketName.includes('player') ||
                marketName.includes('to get a card') ||
                marketName.includes('to be booked') ||
                marketName.includes('to get a red card');
            if (isPlayerCardMarket) {
                return assign('player-cards');
            }
            return assign('cards');
        }

        // Player Fouls
        if (marketName.includes('fouls')) {
            if (marketName.includes('player')) {
                return assign('player-fouls');
            }
            return assign('match-team-fouls');
        }

        // Player shots on target (special grouping already in BettingTabs)
        if (marketName.includes("player's shots on target")) {
            return assign('player-shots-on-target');
        }
        
        // Other player shots markets (generic "Player's shots", not team/total or on‑target)
        if (
            marketName.includes("player's shots") &&
            !marketName.includes('on target')
        ) {
            return assign('player-shots');
        }

        // Match & team level shots statistics (Opta data etc.)
        if (
            marketName.includes('total shots (settled using opta data)') ||
            marketName.includes('total shots on target (settled using opta data)') ||
            marketName.includes('total shots by') ||
            marketName.includes('total shots on target by') ||
            marketName.includes('most shots on target') ||
            (marketName.includes('shots') && marketName.includes('team'))
        ) {
            return assign('match-team-shots');
        }

        // Goal scorers & player goals
        if (
            marketName.includes('first goal scorer') ||
            marketName.includes('goalscorer') ||
            (marketName.includes('goal scorer') && !marketName.includes('time of'))
        ) {
            return assign('goal-scorer');
        }

        // ✅ FIX: "To Score" / "Anytime Goal Scorer" should also go to 'goal-scorer' category
        // so they can be grouped with "First Goal Scorer" in the Goal Scorer section
        if (
            marketName.includes('to score') &&
            !marketName.includes('assist') &&
            !marketName.includes('or assist') &&
            !marketName.includes('team to score') &&
            !marketName.includes('time of') &&
            !marketName.includes('from a penalty') &&
            !marketName.includes('header') &&
            !marketName.includes('outside the penalty')
        ) {
            // ✅ Send to 'goal-scorer' instead of 'player-goals' so it groups with First Goal Scorer
            return assign('goal-scorer');
        }

        // Goalkeeper saves
        if (marketName.includes('goalkeeper saves')) {
            return assign('goalkeeper-saves');
        }

        // Player assist
        if (marketName.includes('to assist')) {
            return assign('player-assist');
        }

        // Player specials – combos & special goal markets (player based)
        if (
            marketName.includes('to score or assist') ||
            marketName.includes('to score at least') ||
            marketName.includes('team member to score') ||
            marketName.includes('to score from outside the penalty box') ||
            marketName.includes('to score from a header') ||
            marketName.includes('own goal')
        ) {
            return assign('player-specials');
        }

        // Team/aggregate penalty specials – treat as generic goals/other markets
        if (marketName.includes('penalty kick awarded') || marketName.includes('to score from a penalty')) {
            return assign('goals-other');
        }

        // Match & team stats – offsides, generic totals, etc.
        if (
            marketName.includes('total offsides') ||
            marketName.includes('offsides by') ||
            marketName.includes('match stats') ||
            marketName.includes('team stats') ||
            marketName.includes('match statistics')
        ) {
            return assign('match-team-stats');
        }

        // Remaining goals / totals style markets
        if (
            marketName.includes('total goals') ||
            marketName.includes('correct score') ||
            marketName.includes('both teams to score') ||
            marketName.includes('btts') ||
            marketName.includes('exact winning margin') ||
            marketName.includes('goal in both halves') ||
            marketName.includes('exact total goals')
        ) {
            return assign('goals-other');
        }

        // Fallback: catch‑all bucket
        assign('other');
    });
    
    // Remove empty categories to avoid clutter
    Object.keys(categorized).forEach(key => {
        if (!categorized[key] || categorized[key].length === 0) {
            delete categorized[key];
        }
    });

    return categorized;
}

function getCategoryLabel(categoryId) {
    const labels = {
        // Top‑level
        'three-way-line': '3-Way Line',
        'asian-lines': 'Asian Lines',
        // Match events – row 1
        'match-regular-time': 'Match (regular time)',
        'player-shots-on-target': 'Player Shots on Target',
        'player-cards': 'Player Cards',
        'goal-scorer': 'Goal Scorer',
        'player-goals': 'Player Goals',
        'goalkeeper-saves': 'Goalkeeper Saves',
        'player-assist': 'Player Assist',
        'player-specials': 'Player Specials',
        // Match events – row 2
        'player-fouls': 'Player Fouls',
        'player-shots': 'Player Shots',
        'half-time': 'Half Time',
        'corners': 'Corners',
        'cards': 'Cards',
        'match-team-shots': 'Match and Team Shots',
        'match-team-fouls': 'Match and Team Fouls',
        'match-team-stats': 'Match and Team Stats',
        // Fallback
        'goals-other': 'Goals',
        'other': 'Other'
    };
    return labels[categoryId] || categoryId;
}

// Explicit ordering for the tabs so they match the bookmaker UI
function getCategoryPriority(categoryId) {
    const order = [
        'match-regular-time',
        'goal-scorer',
        'player-goals',
        'half-time',
        'corners',
        'three-way-line',
        'asian-lines',
        'player-shots-on-target',
        'player-cards',
        'goalkeeper-saves',
        'player-assist',
        'player-specials',
        'player-fouls',
        'player-shots',
        'cards',
        'match-team-shots',
        'match-team-fouls',
        'match-team-stats',
        'goals-other',
        'other'
    ];
    const idx = order.indexOf(categoryId);
    return idx === -1 ? 99 : idx + 1;
}

export default MatchDetailPage

// Build markets for Scorers like unibet app: group by team and criterion, display player names
function buildScorerMarkets(markets, participants = []) {
    const teams = (participants || []).filter(p => String(p.participantType || '').toUpperCase() === 'TEAM');
    const teamNameOf = (eventParticipantId) => {
        const t = teams.find(tt => String(tt.participantId) === String(eventParticipantId));
        return t?.name || t?.englishName || (teams[0]?.name || 'Team');
    };

    const byTeamCriterion = new Map();
    const addedKeys = new Set();

    markets.forEach(market => {
        const criterionLabel = market?.name || market?.criterion?.label || market?.criterion?.englishLabel || 'To Score';
        (market.outcomes || []).forEach(oc => {
            const rawName = oc.participant || oc.name || oc.englishLabel || '';
            if (!rawName || /^(yes|no)$/i.test(rawName)) return;
            const teamName = teamNameOf(oc.eventParticipantId);
            const key = `${teamName}|${criterionLabel}`;
            if (!byTeamCriterion.has(key)) byTeamCriterion.set(key, []);
            const uniqueKey = `${key}|${String(oc.participantId || '').trim() || rawName.toLowerCase()}`;
            if (addedKeys.has(uniqueKey)) return;
            addedKeys.add(uniqueKey);
            byTeamCriterion.get(key).push({ player: rawName, outcome: oc, market });
        });
    });

    const result = {};
    Array.from(byTeamCriterion.entries()).forEach(([key, rows]) => {
        const [teamName, criterionLabel] = key.split('|');
        const marketKey = `${criterionLabel} — ${teamName}`;
        result[marketKey] = {
            market_description: marketKey,
            market_id: rows[0]?.market?.id || 'scorer',
            odds: rows.map(r => ({
                id: r.outcome.id,
                label: r.player,
                // Odds were already converted to decimal earlier; don't divide again
                value: Number(r.outcome.odds || 0),
                name: r.player,
                suspended: (r.outcome.status || '') !== 'OPEN',
                participant: r.player,
                participantId: r.outcome.participantId,
                eventParticipantId: r.outcome.eventParticipantId,
                team: teamName,
                criterion: criterionLabel
            }))
        };
    });

    return result;
}

'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import LiveMatchCard from './LiveMatchCard';
import TopPicksSkeleton from '../Skeletons/TopPicksSkeleton';
import { selectLiveMatchesRaw, selectLiveMatchesLoading, selectLiveMatchesWarning, selectLiveMatchesCacheAge, silentUpdateLiveMatches, fetchBetOffersForLiveMatches, selectMatchBetOffers } from '@/lib/features/matches/liveMatchesSlice';
import { getFotmobLogoByUnibetId } from '@/lib/leagueUtils';
import { useLiveOddsSync } from '@/hooks/useLiveOddsSync';
import { shouldShowMatch, markMatchAsFinished, cleanupExpiredFinishedMatches } from '@/lib/utils/finishedMatchesManager';

// Component that handles odds sync for a single match - defined outside to prevent remounting
const LiveMatchWithSync = ({ match }) => {
    useLiveOddsSync(match.id);
    return <LiveMatchCard match={match} />;
};

// Helper function to transform Unibet API data to MatchCard format
// Updated to use betoffers (exactly like match details page)
const transformLiveMatchData = (apiMatch, betOffers) => {
    // Extract team names from the match data
    const homeTeam = apiMatch.homeName || apiMatch.participants?.find(p => p.position === 'home')?.name || 'Home Team';
    const awayTeam = apiMatch.awayName || apiMatch.participants?.find(p => p.position === 'away')?.name || 'Away Team';
    
    // Extract odds - Priority 1: Use betoffers (exactly like match details page)
    const odds = {};
    
    // Priority 1: Use betoffers (exactly like match details page)
    if (betOffers && betOffers.length > 0) {
        // Find Full Time Result market (marketId: 1 or criterion.label)
        const fullTimeResultMarket = betOffers.find(offer => 
            offer.criterion?.label === 'Full Time Result' ||
            offer.criterion?.englishLabel === 'Full Time Result' ||
            offer.betOfferType?.name === 'Full Time Result' ||
            offer.marketId === 1
        );
        
        if (fullTimeResultMarket && fullTimeResultMarket.outcomes) {
            fullTimeResultMarket.outcomes.forEach(outcome => {
                const label = outcome.label?.toString().toLowerCase();
                const value = parseFloat(outcome.odds);
                
                if (!isNaN(value)) {
                    const convertedValue = (value / 1000).toFixed(2);
                    
                    if (label === '1' || label === 'home') {
                        odds['1'] = { 
                            value: convertedValue, 
                            oddId: outcome.id,
                            status: outcome.status || 'OPEN'
                        };
                    } else if (label === 'x' || label === 'draw') {
                        odds['X'] = { 
                            value: convertedValue, 
                            oddId: outcome.id,
                            status: outcome.status || 'OPEN'
                        };
                    } else if (label === '2' || label === 'away') {
                        odds['2'] = { 
                            value: convertedValue, 
                            oddId: outcome.id,
                            status: outcome.status || 'OPEN'
                        };
                    }
                }
            });
        }
    }
    
    // Priority 2: Extract odds from liveOdds (new Kambi API integration)
    if (Object.keys(odds).length === 0 && apiMatch.liveOdds && apiMatch.liveOdds.outcomes) {
        apiMatch.liveOdds.outcomes.forEach(outcome => {
            const label = outcome.label?.toString().toLowerCase();
            const value = parseFloat(outcome.odds);
            
            if (!isNaN(value)) {
                // Convert Kambi API odds format (divide by 1000)
                const convertedValue = (value / 1000).toFixed(2);
                
                if (label === '1') {
                    odds['1'] = { value: convertedValue, oddId: outcome.id || `${apiMatch.id}_home_1`, status: outcome.status };
                } else if (label === 'x') {
                    odds['X'] = { value: convertedValue, oddId: outcome.id || `${apiMatch.id}_draw_X`, status: outcome.status };
                } else if (label === '2') {
                    odds['2'] = { value: convertedValue, oddId: outcome.id || `${apiMatch.id}_away_2`, status: outcome.status };
                }
            }
        });
    }
    
    // Fallback: Check if match has betOffers with odds (old format)
    if (Object.keys(odds).length === 0 && apiMatch.betOffers && Array.isArray(apiMatch.betOffers)) {
        // Look for Full Time Result market (marketId: 1)
        const fullTimeResultMarket = apiMatch.betOffers.find(offer => 
            offer.marketId === 1 || 
            offer.marketName === 'Full Time Result' ||
            offer.marketName === 'Match Result'
        );
        
        if (fullTimeResultMarket && fullTimeResultMarket.outcomes) {
            fullTimeResultMarket.outcomes.forEach(outcome => {
                const label = outcome.label?.toString().toLowerCase();
                const value = parseFloat(outcome.odds);
                
                if (!isNaN(value)) {
                    // Convert Unibet API odds format (divide by 1000)
                    const convertedValue = (value / 1000).toFixed(2);
                    
                if (label === '1' || label === 'home') {
                    odds['1'] = { value: convertedValue, oddId: outcome.outcomeId || `${apiMatch.id}_home_1` };
                } else if (label === 'x' || label === 'draw') {
                    odds['X'] = { value: convertedValue, oddId: outcome.outcomeId || `${apiMatch.id}_draw_X` };
                } else if (label === '2' || label === 'away') {
                    odds['2'] = { value: convertedValue, oddId: outcome.outcomeId || `${apiMatch.id}_away_2` };
                }
                }
            });
        }
    }
    
    // Fallback: Check mainBetOffer (old format)
    if (Object.keys(odds).length === 0 && apiMatch.mainBetOffer && apiMatch.mainBetOffer.outcomes) {
        apiMatch.mainBetOffer.outcomes.forEach(outcome => {
            const label = outcome.label?.toString().toLowerCase();
            const value = parseFloat(outcome.odds);
            
            if (!isNaN(value)) {
                // Convert Unibet API odds format (divide by 1000)
                const convertedValue = (value / 1000).toFixed(2);
                
                if (label === '1' || label === 'home') {
                    odds['1'] = { value: convertedValue, oddId: outcome.outcomeId || `${apiMatch.id}_home_1` };
                } else if (label === 'x' || label === 'draw') {
                    odds['X'] = { value: convertedValue, oddId: outcome.outcomeId || `${apiMatch.id}_draw_X` };
                } else if (label === '2' || label === 'away') {
                    odds['2'] = { value: convertedValue, oddId: outcome.outcomeId || `${apiMatch.id}_away_2` };
                }
            }
        });
    }

    // Format match time - use Kambi live data if available, otherwise use Unibet liveData
    const matchDate = new Date(apiMatch.start);
    const now = new Date();
    const isToday = matchDate.toDateString() === now.toDateString();
    
    // For live matches, show actual time from matchClock (not "Today")
    let displayTime = 'Live';
    let displayDate = isToday ? 'Today' : matchDate.toLocaleDateString();
    
    // Prioritize kambiLiveData for accurate live time and score
    if (apiMatch.kambiLiveData?.matchClock) {
        const clock = apiMatch.kambiLiveData.matchClock;
        if (clock.running) {
            displayTime = `${clock.minute}'`;
            if (clock.second && clock.second > 0) {
                displayTime = `${clock.minute}'${clock.second.toString().padStart(2, '0')}`;
            }
        } else {
            displayTime = clock.period === 'HT' ? 'HT' : clock.period || 'Live';
        }
        // For live matches, don't show "Today" - show actual time
        displayDate = displayTime;
    } else if (apiMatch.liveData?.matchClock) {
        const clock = apiMatch.liveData.matchClock;
        if (clock.running) {
            displayTime = `${clock.period} - ${clock.minute}'`;
        } else {
            displayTime = 'HT';
        }
        displayDate = displayTime;
    }


    return {
        id: apiMatch.id,
        league: {
            id: apiMatch.groupId, // Add leagueId to fix missing leagueId issue
            name: apiMatch.leagueName || 'Live Match',
            country: apiMatch.parentName || '',
            imageUrl: getFotmobLogoByUnibetId(apiMatch.groupId) || null,
            icon: '⚽' // Default fallback icon
        },
        team1: homeTeam,
        team2: awayTeam,
        date: displayDate, // Shows actual time for live matches, "Today" or date for upcoming
        time: displayTime,
        odds: odds,
        clock: true,
        isLive: true,
        liveData: apiMatch.liveData,
        kambiLiveData: apiMatch.kambiLiveData // Include Kambi live data for timer and score
    };
};

const LiveMatches = () => {
    const dispatch = useDispatch();
    const liveMatchesData = useSelector(selectLiveMatchesRaw);
    const loading = useSelector(selectLiveMatchesLoading);
    const warning = useSelector(selectLiveMatchesWarning);
    const cacheAge = useSelector(selectLiveMatchesCacheAge);
    // Get betoffers from Redux state (exactly like match details page) - MUST be before any conditional returns
    const matchBetOffers = useSelector(state => state.liveMatches.matchBetOffers);

    // Fetch betoffers ONLY for visible matches (first 8) - reduces initial load time
    // Matches show immediately with mainBetOffer odds, betoffers fetch in background
    useEffect(() => {
        if (liveMatchesData && liveMatchesData.length > 0) {
            // Only fetch betoffers for visible matches (first 8) to reduce load time
            const visibleMatchIds = liveMatchesData
                .slice(0, 8)
                .map(match => match.id)
                .filter(id => !matchBetOffers[id]); // Don't refetch if already fetched (deduplication)
            
            if (visibleMatchIds.length > 0) {
                console.log(`🔍 [BETOFFERS] Fetching betoffers for ${visibleMatchIds.length} visible matches...`);
                dispatch(fetchBetOffersForLiveMatches(visibleMatchIds));
            }
        }
    }, [liveMatchesData, matchBetOffers, dispatch]);

    // Set up polling for live matches data (200ms for ultra real-time updates)
    // NOTE: fetchLiveMatches() is already called in HomePage.jsx - no need to duplicate here
    // This prevents double API calls and reduces initial load delay
    useEffect(() => {
        // Set up interval to refresh every 200ms with silent updates
        // NOTE: Don't fetch betoffers every 200ms - too expensive! Use mainBetOffer for real-time updates
        const refreshInterval = setInterval(() => {
            dispatch(silentUpdateLiveMatches());
            // Betoffers are fetched once on initial load, then use mainBetOffer for real-time updates
        }, 200); // 200ms for ultra real-time odds updates (using mainBetOffer from live matches API)

        // Cleanup interval on unmount
        return () => {
            clearInterval(refreshInterval);
        };
    }, [dispatch]);

    // Clean up expired finished matches periodically
    useEffect(() => {
        cleanupExpiredFinishedMatches();
        const cleanupInterval = setInterval(() => {
            cleanupExpiredFinishedMatches();
        }, 60000); // Clean up every minute
        
        return () => clearInterval(cleanupInterval);
    }, []);

    // Show skeleton while loading
    if (loading) {
        return <TopPicksSkeleton />;
    }

    // Transform API data to MatchCard format - show all live matches regardless of odds
    // Use betoffers from Redux state (exactly like match details page)
    const transformedMatches = liveMatchesData
        .filter(apiMatch => {
            // Check if match should be shown based on Unibet API status
            // This replaces the old 90-minute filter logic
            const shouldShow = shouldShowMatch(apiMatch);
            
            if (!shouldShow) {
                return false;
            }
            
            // If match is finished, mark it in localStorage
            if (apiMatch.state === 'FINISHED') {
                markMatchAsFinished(apiMatch.id, apiMatch);
            }
            
            return true;
        })
        .map(match => {
            const betOffers = matchBetOffers[match.id];
            return transformLiveMatchData(match, betOffers);
        });

    if (transformedMatches.length === 0) {
        return (
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Live Matches</h2>
                    <Link href="/inplay" className="text-green-600 hover:underline text-sm">View All</Link>
                </div>
                    <div className="text-gray-500 text-center py-8">
                        No live matches available at the moment.
                    </div>
            </div>
        );
    }

    return (
        <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Live Matches</h2>
                <Link href="/inplay" className="text-green-600 hover:underline text-sm">View All</Link>
            </div>
            
            {/* Cache Warning */}
            {warning && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-yellow-800">
                                {warning} {cacheAge && `(${cacheAge})`}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {transformedMatches.slice(0, 8).map((match) => {
                    // Create a unique key that includes odds values AND statistics to force re-render when anything changes
                    const oddsKey = `${match.odds?.['1']?.value || 'null'}-${match.odds?.['X']?.value || 'null'}-${match.odds?.['2']?.value || 'null'}`;
                    const oddIds = `${match.odds?.['1']?.oddId || ''}-${match.odds?.['X']?.oddId || ''}-${match.odds?.['2']?.oddId || ''}`;
                    const statusKey = `${match.odds?.['1']?.status || ''}-${match.odds?.['X']?.status || ''}-${match.odds?.['2']?.status || ''}`;
                    
                    // ✅ ADD STATISTICS TO KEY - This will force re-render when corners/cards change
                    const stats = match.kambiLiveData?.statistics?.football;
                    const statsKey = stats ? 
                        `${stats.home?.corners || 0}-${stats.away?.corners || 0}-${stats.home?.yellowCards || 0}-${stats.away?.yellowCards || 0}-${stats.home?.redCards || 0}-${stats.away?.redCards || 0}` : 
                        'no-stats';
                    
                    // ✅ ADD SCORE TO KEY - This will force re-render when score changes
                    const scoreKey = match.kambiLiveData?.score ? 
                        `${match.kambiLiveData.score.home || 0}-${match.kambiLiveData.score.away || 0}` : 
                        'no-score';
                    
                    // ✅ ADD TIME TO KEY - This will force re-render when match time changes
                    const timeKey = match.kambiLiveData?.matchClock ? 
                        `${match.kambiLiveData.matchClock.minute || 0}-${match.kambiLiveData.matchClock.second || 0}` : 
                        'no-time';
                    
                    return (
                        <LiveMatchWithSync 
                            key={`${match.id}-${oddsKey}-${oddIds}-${statusKey}-${statsKey}-${scoreKey}-${timeKey}`} 
                            match={match} 
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default LiveMatches;
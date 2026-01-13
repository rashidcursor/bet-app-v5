'use client';

import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TopPicks from './TopPicks';
import LiveMatches from './LiveMatches';
import LeagueCards from './LeagueCards';
import { fetchHomepageData, selectHomeLoading, selectHomeError, selectFootballDaily } from '@/lib/features/home/homeSlice';
import { fetchLiveMatches, silentUpdateLiveMatches, selectLiveMatches, selectUpcomingMatchesGrouped, fetchBetOffersForLiveMatches } from '@/lib/features/matches/liveMatchesSlice';

const HomePage = () => {
    const dispatch = useDispatch();
    const loading = useSelector(selectHomeLoading);
    const error = useSelector(selectHomeError);
    const footballDaily = useSelector(selectFootballDaily);
    const filteredFootballDaily = footballDaily.filter(league => 
        league.matches.length > 0 && 
        league.matches.some(match => (match.odds_main && Object.keys(match.odds_main).length > 0) || (match.odds && (match.odds.home || match.odds.draw || match.odds.away)))
    );
    
    // Live matches state from Unibet API
    const liveMatches = useSelector(selectLiveMatches);
    // Upcoming matches state from Unibet API (filtered by CSV leagues)
    const upcomingMatches = useSelector(selectUpcomingMatchesGrouped);
    
    // Ref for polling interval
    const pollingIntervalRef = useRef(null);

    // Get matchBetOffers for deduplication
    const matchBetOffers = useSelector(state => state.liveMatches.matchBetOffers);

    // Initial data fetch
    useEffect(() => {
        // Fetch homepage data when component mounts
        dispatch(fetchHomepageData());
        // Fetch live matches from Unibet API
        dispatch(fetchLiveMatches()).then((result) => {
            // After live matches update, fetch betoffers ONLY for visible matches (first 8)
            // Don't fetch all matches - too expensive and causes 6-7 second delay
            if (result.payload && result.payload.matches) {
                const visibleMatchIds = result.payload.matches
                    .slice(0, 8)
                    .map(m => m.id)
                    .filter(id => !matchBetOffers[id]); // Deduplication
                
                if (visibleMatchIds.length > 0) {
                    dispatch(fetchBetOffersForLiveMatches(visibleMatchIds));
                }
            }
        });
    }, [dispatch, matchBetOffers]);

    // Set up polling for live matches data (200ms for ultra real-time updates)
    useEffect(() => {
        // Start polling every 200ms for live matches (ultra real-time data requirement)
        const startPolling = () => {
            pollingIntervalRef.current = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return; // pause when tab hidden
                dispatch(silentUpdateLiveMatches());
                // NOTE: Don't fetch betoffers every 200ms - too expensive! Use mainBetOffer for real-time updates
                // Betoffers are fetched once on initial load, then use mainBetOffer for real-time updates
            }, 200); // Poll every 200ms for ultra real-time odds updates (using mainBetOffer from live matches API)
        };

        // Start polling immediately (no delay)
        startPolling();

        // Cleanup function
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [dispatch]);

    // Pause polling when tab is not visible (performance optimization)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Pause polling when tab is hidden
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
            } else {
                // Resume polling when tab becomes visible
                if (!pollingIntervalRef.current) {
                    pollingIntervalRef.current = setInterval(() => {
                        dispatch(silentUpdateLiveMatches());
                    }, 200); // 200ms polling interval for ultra real-time updates
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [dispatch]);



    // Remove the old loading state since individual components handle their own loading
    // if (loading) {
    //     return (
    //         <div className="flex-1 bg-gray-100">
    //             <div className="p-3 lg:p-6 overflow-hidden">
    //                 <div className="flex items-center justify-center h-64">
    //                     <div className="text-gray-500">Loading homepage data...</div>
    //                 </div>
    //             </div>
    //         </div>
    //     );
    // }

    if (error) {
        return (
            <div className="flex-1 bg-gray-100">
                <div className="px-4 py-4 min-[375px]:max-[390px]:px-8 min-[375px]:max-[390px]:py-8 md:px-6 md:py-6 overflow-hidden">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-red-500">Error: {error}</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-gray-100">
            <div className="px-4 py-4 min-[375px]:max-[390px]:px-8 min-[375px]:max-[390px]:py-8 md:px-6 md:py-6 overflow-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))] min-[375px]:max-[390px]:pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:pb-3 lg:pb-6">
                <div className="flex flex-col xl:flex-row gap-4 lg:gap-6">
                    {/* Main content area */}
                    <div className="flex-1 min-w-0">
                        {/* Live Matches - using Unibet API */}
                        <LiveMatches />

                        {/* Top Picks - using Redux data */}
                        <TopPicks />

                        {/* Football Daily - using Unibet upcoming matches (filtered by CSV leagues) with fallback */}
                        <LeagueCards
                            title="Football Daily"
                            useReduxData={true}
                            reduxData={upcomingMatches && upcomingMatches.length > 0 ? upcomingMatches : filteredFootballDaily}
                            isInPlay={false}
                            showDayTabs={true}
                            viewAllText="View All Football Daily"
                            loading={loading}
                        />

                        {/* In-Play Section - using live matches from WebSocket */}
                        <LeagueCards
                            title="In-Play"
                            isInPlay={true}
                            showDayTabs={false}
                            viewAllText="View All Live Football"
                            useReduxData={true}
                            reduxData={liveMatches}
                            loading={false}
                            hideOdds={false}
                        />
                    </div>

                    {/* Right sidebar */}
                    {/* <div className="w-full xl:w-80 xl:flex-shrink-0">
                        <TrendingCombo />
                    </div> */}
                </div>
            </div>
        </div>
    );
};

export default HomePage;

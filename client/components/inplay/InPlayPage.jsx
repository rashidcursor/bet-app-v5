'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Clock } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchLiveMatches, silentUpdateLiveMatches, selectLiveMatchesGrouped, selectLiveMatchesLoading, selectLiveMatchesError } from '@/lib/features/matches/liveMatchesSlice';
import MatchListPage from '@/components/shared/MatchListPage';
import LiveTimer from '@/components/home/LiveTimer';
import { getFotmobLogoByUnibetId } from '@/lib/leagueUtils';

const InPlayPage = () => {
    const liveMatchesRaw = useSelector(selectLiveMatchesGrouped);
    const loading = useSelector(selectLiveMatchesLoading);
    const error = useSelector(selectLiveMatchesError);
    const dispatch = useDispatch();
    const pollingIntervalRef = useRef(null);
    
    // Initial data fetch
    useEffect(() => {
        dispatch(fetchLiveMatches());
    }, [dispatch]);

    // Set up polling for live matches data (500ms for ultra real-time updates)
    useEffect(() => {
        // Start polling every 500ms for live matches (ultra real-time data requirement)
        const startPolling = () => {
            pollingIntervalRef.current = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return; // pause when tab hidden
                console.log('🔄 In-Play page polling live matches data...');
                dispatch(silentUpdateLiveMatches());
            }, 500); // Poll every 500ms for ultra real-time odds updates
        };

        // Start polling after initial load
        const timeoutId = setTimeout(() => {
            startPolling();
        }, 1000); // Wait 1 second after initial load

        // Cleanup function
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            clearTimeout(timeoutId);
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
                    console.log('⏸️ In-Play page polling paused - tab not visible');
                }
            } else {
                // Resume polling when tab becomes visible
                if (!pollingIntervalRef.current) {
                    pollingIntervalRef.current = setInterval(() => {
                        console.log('🔄 In-Play page resuming live matches polling...');
                        dispatch(silentUpdateLiveMatches());
                    }, 500); // 500ms polling interval for ultra real-time updates
                    console.log('▶️ In-Play page polling resumed - tab visible');
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [dispatch]);

    // Transform Unibet API data to match MatchListPage expected format
    const displayMatches = useMemo(() => {
        if (!Array.isArray(liveMatchesRaw)) {
            return [];
        }
        
        return liveMatchesRaw.map(leagueData => {
            // Get groupId from the first match to use for Fotmob logo
            const firstMatch = leagueData.matches?.[0];
            const groupId = firstMatch?.groupId;
            
            return {
                id: leagueData.league || Math.random().toString(36).substr(2, 9),
                name: leagueData.league || 'Unknown League',
                league: {
                    id: leagueData.league,
                    name: leagueData.league,
                    imageUrl: getFotmobLogoByUnibetId(groupId) || null,
                },
                icon: "⚽",
            matches: (leagueData.matches || []).map(match => {
                // Extract team names from Unibet API format
                const team1 = match.homeName || match.team1 || 'Home Team';
                const team2 = match.awayName || match.team2 || 'Away Team';
                
                // Extract odds - prioritize liveOdds (Kambi API) over mainBetOffer (Unibet API)
                let odds = {};
                if (match.liveOdds && match.liveOdds.outcomes) {
                    // Kambi API format - extract from liveOdds.outcomes
                    console.log('🎲 InPlayPage: Found liveOdds for match', match.id, match.liveOdds);
                    match.liveOdds.outcomes.forEach(outcome => {
                        // Convert Kambi API odds format (divide by 1000)
                        const convertedOdds = (parseFloat(outcome.odds) / 1000).toFixed(2);
                        // Read suspended status from outcome.status (OPEN = not suspended, anything else = suspended)
                        // Kambi API might use different field names, so check both status and suspended fields
                        const isSuspended = outcome.status !== 'OPEN' || outcome.suspended === true;
                        
                        if (outcome.label === '1') {
                            odds.home = {
                                value: convertedOdds,
                                oddId: outcome.id || outcome.outcomeId,
                                suspended: isSuspended
                            };
                        } else if (outcome.label === 'X') {
                            odds.draw = {
                                value: convertedOdds,
                                oddId: outcome.id || outcome.outcomeId,
                                suspended: isSuspended
                            };
                        } else if (outcome.label === '2') {
                            odds.away = {
                                value: convertedOdds,
                                oddId: outcome.id || outcome.outcomeId,
                                suspended: isSuspended
                            };
                        }
                    });
                } else if (match.mainBetOffer && match.mainBetOffer.outcomes) {
                    // Unibet API format - extract from mainBetOffer.outcomes
                    match.mainBetOffer.outcomes.forEach(outcome => {
                        // Convert Unibet API odds format (divide by 1000)
                        const convertedOdds = outcome.oddsDecimal || (parseFloat(outcome.odds) / 1000).toFixed(2);
                        // Read suspended status from outcome.status (OPEN = not suspended, anything else = suspended)
                        const isSuspended = outcome.status !== 'OPEN';
                        
                        if (outcome.label === '1' || outcome.label === 'Home') {
                            odds.home = {
                                value: convertedOdds,
                                oddId: outcome.id || outcome.outcomeId,
                                suspended: isSuspended
                            };
                        } else if (outcome.label === 'X' || outcome.label === 'Draw') {
                            odds.draw = {
                                value: convertedOdds,
                                oddId: outcome.id || outcome.outcomeId,
                                suspended: isSuspended
                            };
                        } else if (outcome.label === '2' || outcome.label === 'Away') {
                            odds.away = {
                                value: convertedOdds,
                                oddId: outcome.id || outcome.outcomeId,
                                suspended: isSuspended
                            };
                        }
                    });
                }
                
                // Format start time - ensure it's in the expected format
                let startTime = match.start || match.starting_at;
                
                // If startTime is an ISO string, convert it to the expected format
                if (startTime && typeof startTime === 'string') {
                    try {
                        const date = new Date(startTime);
                        if (!isNaN(date.getTime())) {
                            // Format as "YYYY-MM-DD HH:MM:SS" for MatchListPage compatibility
                            startTime = date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
                        }
                    } catch (e) {
                        console.warn('Invalid start time format:', startTime);
                        startTime = null;
                    }
                }
                
                return {
                    id: match.id || match.eventId,
                    team1: team1,
                    team2: team2,
                    starting_at: startTime,
                    odds: odds,
                    isLive: true, // Live matches are live
                    kambiLiveData: match.kambiLiveData, // Include Kambi live data
                    league: {
                        id: match.groupId || leagueData.league, // Add league ID
                        name: leagueData.league
                    },
                    groupId: match.groupId, // Add groupId for league mapping
                    leagueName: leagueData.league, // Add league name
                    source: 'InPlayPage' // Add source identifier
                };
            }).filter(match => {
                // Filter out matches above 90 minutes with all odds disabled
                if (match.kambiLiveData?.matchClock) {
                    const currentMinute = match.kambiLiveData.matchClock.minute || 0;
                    
                    // If match is above 90 minutes, check if all odds are disabled
                    if (currentMinute > 90) {
                        // Check if all odds are disabled (null, undefined, NaN, 'NaN', or suspended)
                        const isOddDisabled = (odd) => {
                            const value = odd?.value;
                            return !value || 
                                   value === null || 
                                   value === undefined || 
                                   value === 'NaN' || 
                                   isNaN(value) || 
                                   odd?.suspended;
                        };
                        
                        const homeDisabled = isOddDisabled(match.odds.home);
                        const drawDisabled = isOddDisabled(match.odds.draw);
                        const awayDisabled = isOddDisabled(match.odds.away);
                        
                        const allOddsDisabled = homeDisabled && drawDisabled && awayDisabled;
                        
                        console.log(`🔍 InPlayPage - Match ${match.team1} vs ${match.team2}: minute=${currentMinute}, allOddsDisabled=${allOddsDisabled}`);
                        
                        // Filter out if all odds are disabled
                        if (allOddsDisabled) {
                            console.log(`🚫 InPlayPage - Filtering out match ${match.team1} vs ${match.team2} - Above 90min (${currentMinute}min) with all odds disabled`);
                            return false;
                        }
                    }
                }
                
                return true;
            }),
            matchCount: leagueData.matches?.length || 0,
            };
        });
    }, [liveMatchesRaw]);

    const inPlayConfig = {
        pageTitle: 'Live Matches',
        breadcrumbText: 'Football | In-Play Matches',
        leagues: displayMatches,
        loading,
        error,
        retryFunction: () => dispatch(fetchLiveMatches()),
        matchTimeComponent: LiveTimer, // Use LiveTimer component for real-time updates
        PageIcon: Clock,
        hideOdds: false, // Show odds buttons on In-Play page
        noMatchesConfig: {
            title: 'No Live Matches',
            message: 'There are no live matches available at the moment. Check back later for live games.',
            buttonText: 'View All Matches',
            buttonLink: '/',
            Icon: Clock
        }
    };

    return <MatchListPage config={inPlayConfig} />;
};

export default InPlayPage;

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectLiveMatches, selectIsConnected, selectLiveOdds } from '@/lib/features/websocket/websocketSlice';
import MatchListPage from '@/components/shared/MatchListPage';
import LiveTimer from '@/components/home/LiveTimer';
import websocketService from '@/lib/services/websocketService';

const InPlayPage = () => {
    const liveMatches = useSelector(selectLiveMatches);
    const isConnected = useSelector(selectIsConnected);
    const liveOdds = useSelector(selectLiveOdds);
    
    // Check if we have both matches and odds for those matches
    const hasCompleteData = useMemo(() => {
        if (liveMatches.length === 0) return true; // No matches means no data needed
        
        // Check if we have odds for at least some matches
        const totalMatches = liveMatches.reduce((total, leagueGroup) => 
            total + (leagueGroup.matches?.length || 0), 0);
        
        const matchesWithOdds = liveMatches.reduce((count, leagueGroup) => {
            if (!leagueGroup.matches) return count;
            return count + leagueGroup.matches.filter(match => 
                liveOdds[match.id] && liveOdds[match.id].odds
            ).length;
        }, 0);
        
        console.log('🔄 [InPlayPage] Data check:', {
            totalMatches,
            matchesWithOdds,
            hasCompleteData: matchesWithOdds > 0
        });
        
        return matchesWithOdds > 0;
    }, [liveMatches, liveOdds]);
    
    // Add timeout to prevent infinite loading
    const [showMatchesAnyway, setShowMatchesAnyway] = useState(false);
    
    useEffect(() => {
        if (liveMatches.length > 0 && !hasCompleteData) {
            const timer = setTimeout(() => {
                console.log('🔄 [InPlayPage] Timeout reached - showing matches without odds');
                setShowMatchesAnyway(true);
            }, 10000); // 10 seconds timeout
            
            return () => clearTimeout(timer);
        } else if (hasCompleteData) {
            setShowMatchesAnyway(false);
        }
    }, [liveMatches.length, hasCompleteData]);



    useEffect(() => {
        // WebSocket is already initialized by WebSocketInitializer
        // Just join live matches room for this component
        websocketService.joinLiveMatches();
        
        return () => {
            // Cleanup: leave live matches room when component unmounts
            // Don't disconnect the socket as it might be used by other components
        };
    }, []);

    // Use WebSocket data exclusively
    const displayMatches = useMemo(() => {
        console.log('🔄 [InPlayPage] liveMatches:', liveMatches);
        console.log('🔄 [InPlayPage] liveMatches type:', typeof liveMatches, 'isArray:', Array.isArray(liveMatches));
        console.log('🔄 [InPlayPage] liveOdds:', liveOdds);
        console.log('🔄 [InPlayPage] liveOdds keys:', Object.keys(liveOdds));
        
        if (!Array.isArray(liveMatches)) {
            console.error('🔄 [InPlayPage] liveMatches is not an array:', liveMatches);
            return [];
        }
        
        return liveMatches.map(leagueGroup => {
            console.log('🔄 [InPlayPage] Processing leagueGroup:', leagueGroup);
            console.log('🔄 [InPlayPage] leagueGroup.matches:', leagueGroup.matches);
            
            return {
                ...leagueGroup,
                matches: leagueGroup.matches.map(match => {
                // Get odds for this match from WebSocket
                const matchOdds = liveOdds[match.id];
                const mainOdds = matchOdds?.odds || {};
                
                console.log('🔄 [InPlayPage] Match:', match.id, 'Match odds:', matchOdds, 'Main odds:', mainOdds);
                
                return {
                    ...match,
                    odds: {
                        home: mainOdds.home ? {
                            value: mainOdds.home.value,
                            oddId: mainOdds.home.oddId,
                            suspended: mainOdds.home.suspended
                        } : null,
                        draw: mainOdds.draw ? {
                            value: mainOdds.draw.value,
                            oddId: mainOdds.draw.oddId,
                            suspended: mainOdds.draw.suspended
                        } : null,
                        away: mainOdds.away ? {
                            value: mainOdds.away.value,
                            oddId: mainOdds.away.oddId,
                            suspended: mainOdds.away.suspended
                        } : null
                    }
                };
            })
            };
        });
    }, [liveMatches, liveOdds]);

    const loading = !isConnected || (liveMatches.length > 0 && !hasCompleteData && !showMatchesAnyway);
    const error = !isConnected ? 'WebSocket connection failed' : null;

    const inPlayConfig = {
        pageTitle: 'Live Matches',
        breadcrumbText: 'Football | In-Play Matches',
        leagues: displayMatches,
        loading,
        error,
        matchTimeComponent: LiveTimer, // Use LiveTimer component for real-time updates
        PageIcon: Clock,
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

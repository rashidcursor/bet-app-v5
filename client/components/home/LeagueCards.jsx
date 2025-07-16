'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBetting } from '@/hooks/useBetting';
import leaguesData, { getLiveLeagues } from '@/data/dummayLeagues';
import { formatToLocalTime } from '@/lib/utils';
import LiveTimer from './LiveTimer';

// League Card Component
const LeagueCard = ({ league, isInPlay = false, viewAllText = null }) => {
    const { createBetHandler } = useBetting();

    return (
        <div className="bg-white border border-gray-200 rounded-none shadow-none mb-4 h-[495px] flex flex-col">
            {/* League Header */}
            <div className="border-b border-gray-200 p-4 bg-gray-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {league.imageUrl ? (
                            <img src={league.imageUrl} alt={league.name} className="w-6 h-6 object-contain" />
                        ) : (
                            <span className="text-lg">{league.icon}</span>
                        )}
                        <div>
                            <h3 className="font-medium text-sm text-gray-800">{league.name}</h3>
                        </div>
                    </div>
                    <div className="text-xs text-gray-500">
                        {isInPlay ? league.day : league.day}
                    </div>
                </div>
            </div>
            {/* Odds Header */}
            <div className="flex items-center px-4 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0">
                <div className="flex-1 text-xs">{isInPlay ? 'Today' : 'Today'}</div>
                <div className="flex gap-1">
                    <div className="w-14 text-center text-xs text-gray-600 font-medium">1</div>
                    <div className="w-14 text-center text-xs text-gray-600 font-medium">X</div>
                    <div className="w-14 text-center text-xs text-gray-600 font-medium">2</div>
                </div>
            </div>
            {/* Matches */}
            <div className="p-4 py-0 flex-1 overflow-y-auto">
                {league.matches.slice(0, 4).map((match, index) => (
                    <div key={match.id}>
                        <div className='flex justify-between mt-2'>
                            <div className="text-xs text-gray-600">
                                {isInPlay && match.isLive ? (
                                    <LiveTimer startingAt={match.starting_at} />
                                ) : (
                                    match.time
                                )}
                            </div>
                            <div className="text-xs text-gray-500">
                                {isInPlay && match.isLive ? 'LIVE' : ''}
                            </div>
                        </div>
                        <Link href={`/matches/${match.id}`}>
                            <div className="cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-1 rounded">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="text-[12px] mb-1 flex items-center gap-2" title={match.team1}>
                                            {isInPlay && match.isLive && (
                                                <span className="text-xs font-bold text-gray-900 min-w-[16px]">
                                                    {match.score?.team1 || '0'}
                                                </span>
                                            )}
                                            <span>
                                                {match.team1.length > 6 ? `${match.team1.slice(0, 18)}...` : match.team1}
                                            </span>
                                        </div>
                                        <div className="text-[12px] flex items-center gap-2" title={match.team2}>
                                            {isInPlay && match.isLive && (
                                                <span className="text-xs font-bold text-gray-900 min-w-[16px]">
                                                    {match.score?.team2 || '0'}
                                                </span>
                                            )}
                                            <span>
                                                {match.team2.length > 6 ? `${match.team2.slice(0, 18)}...` : match.team2}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center flex-shrink-0">
                                        <div className="flex gap-1">
                                            {match.odds['1'] && (
                                                <Button
                                                    size="sm"
                                                    className={`w-14 h-8 p-0 text-xs font-bold betting-button ${
                                                        isInPlay && match.odds['1'].suspended 
                                                            ? 'opacity-50 cursor-not-allowed bg-gray-300 hover:bg-gray-300' 
                                                            : ''
                                                    }`}
                                                    onClick={isInPlay && match.odds['1'].suspended 
                                                        ? undefined 
                                                        : createBetHandler(match, '1', match.odds['1'].value, '1x2', match.odds['1'].oddId)
                                                    }
                                                    disabled={isInPlay && match.odds['1'].suspended}
                                                >
                                                    {match.odds['1'].value}
                                                </Button>
                                            )}
                                            {match.odds['X'] && (
                                                <Button
                                                    size="sm"
                                                    className={`w-14 h-8 p-0 text-xs font-bold betting-button ${
                                                        isInPlay && match.odds['X'].suspended 
                                                            ? 'opacity-50 cursor-not-allowed bg-gray-300 hover:bg-gray-300' 
                                                            : ''
                                                    }`}
                                                    onClick={isInPlay && match.odds['X'].suspended 
                                                        ? undefined 
                                                        : createBetHandler(match, 'X', match.odds['X'].value, '1x2', match.odds['X'].oddId)
                                                    }
                                                    disabled={isInPlay && match.odds['X'].suspended}
                                                >
                                                    {match.odds['X'].value}
                                                </Button>
                                            )}
                                            {match.odds['2'] && (
                                                <Button
                                                    size="sm"
                                                    className={`w-14 h-8 p-0 text-xs font-bold betting-button ${
                                                        isInPlay && match.odds['2'].suspended 
                                                            ? 'opacity-50 cursor-not-allowed bg-gray-300 hover:bg-gray-300' 
                                                            : ''
                                                    }`}
                                                    onClick={isInPlay && match.odds['2'].suspended 
                                                        ? undefined 
                                                        : createBetHandler(match, '2', match.odds['2'].value, '1x2', match.odds['2'].oddId)
                                                    }
                                                    disabled={isInPlay && match.odds['2'].suspended}
                                                >
                                                    {match.odds['2'].value}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Link>
                        {index < Math.min(league.matches.length, 4) - 1 && (
                            <div className="border-b border-gray-300 mx-0 my-2"></div>
                        )}
                    </div>
                ))}
            </div>
            {/* More Button */}
            <div className="p-4 py-3 flex items-center justify-center font-medium border-t border-gray-200 flex-shrink-0">
                <Link href={isInPlay ? `/inplay` : `/leagues/${league.id}`}
                    variant="outline"
                    size="sm"
                    className="w-full text-base text-xs text-center "
                >
                    {viewAllText || (isInPlay ? 'View All Live Matches' : `More ${league.name}`)}
                </Link>
            </div>
        </div>
    );
};

const LeagueCards = ({
    title = "Football Daily",
    isInPlay = false,
    showDayTabs = true,
    viewAllText = null,
    useReduxData = false,
    reduxData = []
}) => {
    const scrollRef = useRef(null);

   

    // Transform Redux data to match the expected format
    const transformReduxData = (data) => {
        
        if (data ) {
            
            
            return data?.map(leagueData => {
                // Transform matches to match the expected format
                const transformedMatches = leagueData.matches.map(match => {
    
    
                    const teamNames = match.name?.split(' vs ') || ['Team A', 'Team B'];
    
                    // Extract odds - handle the new object format from backend
                    const odds = {};
    
                    if (match.odds) {
                        if (typeof match.odds === 'object' && !Array.isArray(match.odds)) {
                            // New backend format: { home: { value, oddId, suspended }, draw: { value, oddId, suspended }, away: { value, oddId, suspended } }
                            if (match.odds.home && !isNaN(match.odds.home.value)) {
                                odds['1'] = { 
                                    value: Number(match.odds.home.value).toFixed(2), 
                                    oddId: match.odds.home.oddId,
                                    suspended: match.odds.home.suspended || false
                                };
                            }
                            if (match.odds.draw && !isNaN(match.odds.draw.value)) {
                                odds['X'] = { 
                                    value: Number(match.odds.draw.value).toFixed(2), 
                                    oddId: match.odds.draw.oddId,
                                    suspended: match.odds.draw.suspended || false
                                };
                            }
                            if (match.odds.away && !isNaN(match.odds.away.value)) {
                                odds['2'] = { 
                                    value: Number(match.odds.away.value).toFixed(2), 
                                    oddId: match.odds.away.oddId,
                                    suspended: match.odds.away.suspended || false
                                };
                            }
                        } else if (Array.isArray(match.odds)) {
                            // Legacy array format (if still present)
                            match.odds.forEach(odd => {
                                const value = parseFloat(odd.value);
                                if (!isNaN(value)) {
                                    if (odd.label === '1' || odd.label === 'Home' || odd.name === 'Home') {
                                        odds['1'] = { 
                                            value: value.toFixed(2), 
                                            oddId: odd.oddId,
                                            suspended: odd.suspended || false
                                        };
                                    }
                                    if (odd.label === 'X' || odd.label === 'Draw' || odd.name === 'Draw') {
                                        odds['X'] = { 
                                            value: value.toFixed(2), 
                                            oddId: odd.oddId,
                                            suspended: odd.suspended || false
                                        };
                                    }
                                    if (odd.label === '2' || odd.label === 'Away' || odd.name === 'Away') {
                                        odds['2'] = { 
                                            value: value.toFixed(2), 
                                            oddId: odd.oddId,
                                            suspended: odd.suspended || false
                                        };
                                    }
                                }
                            });
                        }
                    }
    
                    // Skip match if no odds are available
                    if (Object.keys(odds).length === 0) {
    
                        return null; // Don't include this match
                    }                    // Format the actual match time and determine if it's live
                    let displayTime = 'TBD'; // Default
                    let isMatchLive = false;
                    
                    if (match.starting_at) {
                        if (isInPlay) {
                            // For in-play section, check if match is actually live
                            // Common live state IDs: 1 (inplay), 22 (inplay), etc.
                            // You should verify these state IDs with your API documentation
                            const liveStateIds = [1, 22, 5, 6, 7, 8, 9, 10, 11, 12]; // Add more as needed
                            const now = new Date();
                            const startTime = new Date(match.starting_at + (match.starting_at.includes('Z') ? '' : ' UTC'));
                            const timeSinceStart = now.getTime() - startTime.getTime();
                            const minutesSinceStart = Math.floor(timeSinceStart / (1000 * 60));
                            
                            // Consider match live if:
                            // 1. State ID indicates live OR
                            // 2. Match started within last 120 minutes (reasonable match duration)
                            isMatchLive = liveStateIds.includes(match.state_id) || 
                                         (timeSinceStart > 0 && minutesSinceStart <= 120);
                        }
                        
                        if (!isInPlay || !isMatchLive) {
                            displayTime = formatToLocalTime(match.starting_at, { format: 'timeOnly' });
                        }
                    }

                    return {
                        id: match.id,
                        team1: teamNames[0],
                        team2: teamNames[1],
                        time: displayTime,
                        odds: odds,
                        clock: true,
                        starting_at: match.starting_at, // Add the starting_at field for live timer
                        state_id: match.state_id, // Add state_id for live determination
                        isLive: isMatchLive // Add live flag
                    };
                }).filter(match => match !== null); // Filter out null matches
    
                return {
                    id: leagueData.league.id,
                    name: leagueData.league.name,
                    icon: "⚽", // Default icon
                    imageUrl: leagueData.league.imageUrl || null,
                    day: "Today",
                    matches: transformedMatches
                };
            });


        }
        return null;
     
    };

    const transformed = transformReduxData(reduxData).filter(league=>league.matches.length > 0);
   

    if (!transformed || transformed.length === 0) return null;

    // Get appropriate data based on mode
    let displayData;
    if (useReduxData && reduxData) {
        displayData = transformed;
    } else {
        displayData = isInPlay ? getLiveLeagues() : leaguesData;
    }

    // If in-play mode and no live matches, don't render the component
    if (isInPlay && displayData.length === 0) {
        return null;
    }

    const scrollLeft = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
        }
    };

    return (
        <div className="mb-8">
            {title && (
                <h2 className="text-xl font-semibold text-gray-800 mb-4">{title}</h2>
            )}

            {/* Day Tabs */}
            {showDayTabs && (
                <div className="flex gap-2 mb-6">
                    <Button
                        size="sm"
                        variant="default"
                        className="bg-gray-200 text-gray-800 text-xs hover:bg-gray-300 rounded-full px-4"
                    >
                        Today
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-300 text-gray-600 text-xs hover:bg-gray-50 rounded-full px-4"
                    >
                        Tomorrow
                    </Button>
                </div>
            )}
            {/* Carousel Navigation */}
            <div className="relative group">
                <Button
                    variant="outline"
                    size="sm"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white shadow-lg border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    onClick={scrollLeft}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white shadow-lg border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    onClick={scrollRight}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>

                {/* League Cards in horizontal scroll */}
                <div
                    ref={scrollRef}
                    className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide"
                >
                    {transformed.map(league => (
                        <div key={league.id} className="flex-shrink-0 w-96">
                            <LeagueCard
                                league={league}
                                isInPlay={isInPlay}
                                viewAllText={viewAllText}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LeagueCards;

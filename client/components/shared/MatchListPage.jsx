'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Tv } from 'lucide-react';
import { useBetting } from '@/hooks/useBetting';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { formatToLocalTime } from '@/lib/utils';
import LiveMatchTimer from '@/components/shared/LiveMatchTimer';
import { useLiveOddsSync } from '@/hooks/useLiveOddsSync';

// Component to wrap each match with odds synchronization
const MatchWithOddsSync = ({ match, children, isInPlay = false }) => {
    // Enable real-time odds synchronization for live matches in InPlayPage
    // This ensures bets placed from In-Play page get odds updates
    if (isInPlay && match.isLive) {
        useLiveOddsSync(match.id);
    }
    
    return children;
};

const MatchListPage = ({ config }) => {
    const {
        pageTitle,
        breadcrumbText,
        fetchDataFunction,
        leagues: propLeagues,
        loading,
        error,
        retryFunction,
        matchTimeFormatter,
        matchTimeComponent, // New prop for React component
        PageIcon,
        noMatchesConfig,
        viewAllMatchesLink = '/',
        hideOdds = false
    } = config;

    const [leagues, setLeagues] = useState([]);
    const { createBetHandler } = useBetting();
    
    useEffect(() => {
        // If leagues are passed directly as props, use them
        if (propLeagues) {
            // Ensure leagues is always an array
            const leaguesArray = Array.isArray(propLeagues) ? propLeagues : [];
            setLeagues(leaguesArray);
            return;
        }
        
        // Otherwise use the fetchDataFunction if available
        if (fetchDataFunction) {
            const data = fetchDataFunction();
            // Ensure data is always an array
            const dataArray = Array.isArray(data) ? data : [];
            setLeagues(dataArray);
        }
    }, [fetchDataFunction, propLeagues]);

    // Calculate total matches count safely
    const getTotalMatchesCount = () => {
        if (!Array.isArray(leagues)) return 0;
        
        return leagues.reduce((total, league) => {
            // Check if league.matches exists and is an array
            const matchesCount = Array.isArray(league?.matches) ? league.matches.length : 0;
            return total + matchesCount;
        }, 0);
    };

    const defaultMatchTimeFormatter = (timeValue, match) => {
        if (match && match.liveTime) return timeValue || '--:--'; // For live matches
        if (match && match.startTime) { // For upcoming matches
            return formatToLocalTime(timeValue, { format: 'timeOnly' });
        }
        return timeValue || 'Not Available';
    };

    const effectiveMatchTimeFormatter = matchTimeFormatter || defaultMatchTimeFormatter;

    // Function to render match time - either component or formatter
    const renderMatchTime = (match) => {
        // Use LiveMatchTimer for live matches with kambiLiveData
        if (match.kambiLiveData?.matchClock) {
            return (
                <div className="flex items-center gap-1">
                    <Tv className="w-3 h-3 text-red-600" />
                    <LiveMatchTimer 
                        matchId={match.id}
                        initialTime={{
                            minute: match.kambiLiveData.matchClock.minute || 0,
                            second: match.kambiLiveData.matchClock.second || 0
                        }}
                        initialPeriod={match.kambiLiveData.matchClock.period || '1st half'}
                        isRunning={match.kambiLiveData.matchClock.running || false}
                    />
                </div>
            );
        }
        
        if (matchTimeComponent) {
            // Use React component for live timer
            const MatchTimeComponent = matchTimeComponent;
            return (
                <div className="flex items-center gap-1">
                    <Tv className="w-3 h-3 text-red-600" />
                    <MatchTimeComponent 
                        startingAt={match.starting_at} 
                        timing={match.timing}
                    />
                </div>
            );
        } else {
            // Use formatter function
            return effectiveMatchTimeFormatter(match.liveTime || match.startTime || match.starting_at, match);
        }
    };

    // Show loading state
    if (loading) {
        return (
            <div className="bg-slate-100 min-h-screen relative">
                <div className="lg:mr-80 xl:mr-96">
                    <div className="px-4 py-4 sm:px-3 sm:py-3 md:p-4">
                        <div className="bg-white p-8 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                Loading Matches
                            </h3>
                            <p className="text-gray-500">
                                Please wait while we fetch the latest matches...
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state - only if we have no data at all
    // ✅ FIX: Don't show error if we have some data (might be partial load)
    if (error && (!leagues || leagues.length === 0)) {
        return (
            <div className="bg-slate-100 min-h-screen relative">
                <div className="lg:mr-80 xl:mr-96">
                    <div className="px-4 py-4 sm:px-3 sm:py-3 md:p-4">
                        <div className="bg-white p-8 text-center border-l-4 border-red-500">
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                Error Loading Matches
                            </h3>
                            <p className="text-gray-500 mb-4">
                                {error || "An error occurred while fetching matches. Please try again."}
                            </p>
                            {retryFunction && (
                                <Button 
                                    variant="outline" 
                                    onClick={retryFunction}
                                >
                                    Try Again
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-100 min-h-screen relative">
            {/* Main content */}
            <div className="lg:mr-80 xl:mr-96">
                <div className="px-4 py-4 sm:px-3 sm:py-3 md:p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-4">
                    {/* Header */}
                    <div className="mb-4 bg-white p-3 w-full md:w-screen"> {/* Adjusted width for responsiveness */}
                        {/* Breadcrumb */}
                        <div className="flex items-center text-xs text-slate-500 mb-3">
                            <Link href="/" className="flex items-center hover:text-slate-700">
                                <ChevronLeft className="h-4 w-4" />
                                <span className="ml-1 truncate">{breadcrumbText}</span>
                            </Link>
                        </div>

                        {/*INFO: Page Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {PageIcon && <PageIcon className="h-4 w-4 text-red-500" />}
                                <div className='flex flex-col'>
                                    <h1 className="text-lg font-semibold ">{pageTitle}</h1>
                                    <p className="text-xs text-gray-500">
                                        {getTotalMatchesCount()} matches
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    {!Array.isArray(leagues) || leagues.length === 0 ? (
                        <div className="bg-white p-8 text-center">
                            {noMatchesConfig.Icon && <noMatchesConfig.Icon className="h-16 w-16 text-gray-300 mx-auto mb-4" />}
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                {noMatchesConfig.title}
                            </h3>
                            <p className="text-gray-500 mb-4">
                                {noMatchesConfig.message}
                            </p>
                            <Link href={noMatchesConfig.buttonLink || viewAllMatchesLink}>
                                <Button variant="outline">
                                    {noMatchesConfig.buttonText}
                                </Button>
                            </Link>
                        </div>
                    ) : (<div className="space-y-4">
                        <Accordion 
                            type="multiple" 
                            className="space-y-4"
                        >
                            {leagues.map((league, index) => {
                                // Skip leagues without matches or with invalid data
                                if (!league || !Array.isArray(league.matches)) return null;
                                
                                
                                
                                return (
                                    <AccordionItem
                                        key={league.id || `league-${index}`}
                                        value={`league-${league.id || index}`}
                                        className="bg-white border border-gray-200 overflow-hidden"
                                    >
                                        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50/50 transition-colors duration-200 [&[data-state=open]]:bg-gray-50/80">
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-3">
                                                    {league.league?.imageUrl ? (
                                                        <img src={league.league.imageUrl} alt={league.league?.name} className="w-6 h-6 rounded-full" />
                                                    ) : (
                                                        <span className="text-xl">{league.icon || "⚽"}</span>
                                                    )}
                                                    <div className="text-left">
                                                        <p className="text-[13px]">{league.league?.name || "Unknown League"}</p>
                                                        <p className="text-xs text-gray-500 font-normal">
                                                            {league.matches.length} {league.matches.length === 1 ? 'match' : 'matches'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-0 pb-0">
                                            {/* Odds Header */}
                                            {!hideOdds && (
                                                <div className="flex items-center px-4 py-2 bg-gray-100 border-t border-gray-200">
                                                    <div className="flex-1 text-xs font-medium text-gray-700">Match</div>
                                                    <div className="flex gap-1 items-center">
                                                        <div className="w-14 text-center text-xs font-medium text-gray-700">1</div>
                                                        <div className="w-14 text-center text-xs font-medium text-gray-700">X</div>
                                                        <div className="w-14 text-center text-xs font-medium text-gray-700">2</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Matches */}
                                            <div className="divide-y divide-gray-100">
                                                {league.matches.map((match) => {
                                                    if (!match || !match.id) return null;
                                                    
                                                    return (
                                                        <MatchWithOddsSync 
                                                            key={match.id} 
                                                            match={match} 
                                                            isInPlay={pageTitle === 'Live Matches'}
                                                        >
                                                            <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
                                                                <div className="flex items-center justify-between gap-2">
                                                                {/* Team names - with max width constraint on mobile */}
                                                                <div className="flex-1 min-w-0 max-w-[calc(100%-140px)] md:max-w-none">
                                                                    {/* Match Time/Date and Indicator */}
                                                                    <div className="flex items-center justify-between mb-1.5"> {/* Reduced margin */}
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs font-semibold ">
                                                                                {renderMatchTime(match)}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Teams - scores removed from here, moved to right */}
                                                                    <Link href={`/matches/${match.id}`}>
                                                                        <div className="cursor-pointer">
                                                                            <div className="space-y-1">
                                                                                <div className="text-xs text-gray-800 truncate" title={match.team1 || (match.participants && match.participants[0] ? match.participants[0].name : '')}>
                                                                                    {match.team1 || (match.participants && match.participants[0] ? match.participants[0].name : 'Team 1')}
                                                                                </div>
                                                                                <div className="text-xs text-gray-800 truncate" title={match.team2 || (match.participants && match.participants[1] ? match.participants[1].name : '')}>
                                                                                    {match.team2 || (match.participants && match.participants[1] ? match.participants[1].name : 'Team 2')}
                                                                            </div>
                                                                        </div>
                                                                        </div>
                                                                    </Link>
                                                                </div>
                                                                
                                                                {/* Cards and Corners + Scores + Betting Buttons Container */}
                                                                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                                                                    {/* Cards and Corners - three separate columns like home page */}
                                                                    {match.kambiLiveData?.statistics?.football && (
                                                                        <div className="flex items-center justify-center gap-1.5 text-xs">
                                                                            {/* Yellow cards column */}
                                                                            <div className="flex flex-col items-center justify-center gap-1">
                                                                                <div className="w-2 h-2 bg-yellow-500 border-0"></div>
                                                                                <div className="text-[10px]">
                                                                                    <div className="text-xs">{(match.kambiLiveData?.statistics?.football?.home?.yellowCards || 0)}</div>
                                                                                    <div className="text-xs">{(match.kambiLiveData?.statistics?.football?.away?.yellowCards || 0)}</div>
                                                                                </div>
                                                                            </div>
                                                                            {/* Red cards column */}
                                                                            <div className="flex flex-col items-center justify-center gap-1">
                                                                                <div className="w-2 h-2 bg-red-500 border-0"></div>
                                                                                <div className="text-[10px]">
                                                                                    <div className="text-xs">{(match.kambiLiveData?.statistics?.football?.home?.redCards || 0)}</div>
                                                                                    <div className="text-xs">{(match.kambiLiveData?.statistics?.football?.away?.redCards || 0)}</div>
                                                                                </div>
                                                                            </div>
                                                                            {/* Corners column - fix alignment */}
                                                                            <div className="flex flex-col items-center justify-center gap-1">
                                                                                <div className="text-red-600 text-[10px] leading-none">🚩</div>
                                                                                <div className="text-[10px]">
                                                                                    <div className="text-xs">{(match.kambiLiveData?.statistics?.football?.home?.corners || 0)}</div>
                                                                                    <div className="text-xs">{(match.kambiLiveData?.statistics?.football?.away?.corners || 0)}</div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    
                                                                    {/* Live score display - positioned on the right, before odds */}
                                                                    {match.kambiLiveData?.score ? (
                                                                        <div className="text-sm font-bold text-gray-800 text-right mr-1 md:mr-2 flex-shrink-0">
                                                                            <div>{match.kambiLiveData.score.home || '0'}</div>
                                                                            <div>{match.kambiLiveData.score.away || '0'}</div>
                                                                        </div>
                                                                    ) : match.score?.team1 !== undefined ? (
                                                                        <div className="text-sm font-bold text-gray-800 text-right mr-1 md:mr-2 flex-shrink-0">
                                                                            <div>{match.score.team1 || '0'}</div>
                                                                            <div>{match.score.team2 || '0'}</div>
                                                                        </div>
                                                                    ) : null}
                                                                    
                                                                    {/* Betting Buttons */}
                                                                    {!hideOdds && (
                                                                        <div className="flex gap-1"> {/* Removed margin since we're in a flex container */}
                                                                    {match.odds && match.odds.home && (
                                                                        <Button
                                                                            size="sm"
                                                                            className={`w-12 h-8 md:w-14 p-0 text-xs font-bold betting-button ${
                                                                                match.odds.home.suspended || !match.odds.home.value || isNaN(match.odds.home.value) || match.odds.home.value === 'NaN'
                                                                                    ? 'opacity-60 cursor-not-allowed bg-gray-400 hover:bg-gray-400' 
                                                                                    : 'bg-emerald-600 hover:bg-emerald-700'
                                                                            }`}
                                                                            onClick={(match.odds.home.suspended || !match.odds.home.value || isNaN(match.odds.home.value) || match.odds.home.value === 'NaN') ? undefined : (e) => {
                                                                                console.log(`🔍 MatchListPage - Home button clicked from ${match.source || 'Unknown'} page:`, {
                                                                                    match: match,
                                                                                    'match.league': match.league,
                                                                                    'match.groupId': match.groupId,
                                                                                    'match.leagueName': match.leagueName,
                                                                                    'match.source': match.source
                                                                                });
                                                                                return createBetHandler(
                                                                                    match, // Pass the complete match object
                                                                                    'Home',
                                                                                    match.odds.home.value,
                                                                                    '1x2',
                                                                                    match.odds.home.oddId,
                                                                                    { marketId: "1_home", label: "Home", name: `Win - ${match.team1}`, marketDescription: "Full Time Result" }
                                                                                )(e);
                                                                            }}
                                                                            disabled={match.odds.home.suspended || !match.odds.home.value || isNaN(match.odds.home.value) || match.odds.home.value === 'NaN'}
                                                                        >
                                                                            {(match.odds.home.suspended || !match.odds.home.value || isNaN(match.odds.home.value) || match.odds.home.value === 'NaN') ? '--' : match.odds.home.value}
                                                                        </Button>
                                                                    )}
                                                                    {match.odds && match.odds.draw && (
                                                                        <Button
                                                                            className={`w-12 h-8 md:w-14 p-0 text-xs font-bold betting-button ${
                                                                                match.odds.draw.suspended || !match.odds.draw.value || isNaN(match.odds.draw.value) || match.odds.draw.value === 'NaN'
                                                                                    ? 'opacity-60 cursor-not-allowed bg-gray-400 hover:bg-gray-400' 
                                                                                    : 'bg-emerald-600 hover:bg-emerald-700'
                                                                            }`}
                                                                            size={"sm"}
                                                                            onClick={(match.odds.draw.suspended || !match.odds.draw.value || isNaN(match.odds.draw.value) || match.odds.draw.value === 'NaN') ? undefined : (e) => {
                                                                                console.log(`🔍 MatchListPage - Draw button clicked from ${match.source || 'Unknown'} page:`, {
                                                                                    match: match,
                                                                                    'match.league': match.league,
                                                                                    'match.groupId': match.groupId,
                                                                                    'match.leagueName': match.leagueName,
                                                                                    'match.source': match.source
                                                                                });
                                                                                return createBetHandler(
                                                                                    match, // Pass the complete match object
                                                                                    'Draw',
                                                                                    match.odds.draw.value,
                                                                                    '1x2',
                                                                                    match.odds.draw.oddId,
                                                                                    { marketId: "1_draw", label: "Draw", name: `Draw - ${match.team1} vs ${match.team2}`, marketDescription: "Full Time Result" }
                                                                                )(e);
                                                                            }}
                                                                            disabled={match.odds.draw.suspended || !match.odds.draw.value || isNaN(match.odds.draw.value) || match.odds.draw.value === 'NaN'}
                                                                        >
                                                                            {(match.odds.draw.suspended || !match.odds.draw.value || isNaN(match.odds.draw.value) || match.odds.draw.value === 'NaN') ? '--' : match.odds.draw.value}
                                                                        </Button>
                                                                    )}
                                                                    {match.odds && match.odds.away && (
                                                                        <Button
                                                                            size="sm"
                                                                            className={`w-12 h-8 md:w-14 p-0 text-xs font-bold betting-button ${
                                                                                match.odds.away.suspended || !match.odds.away.value || isNaN(match.odds.away.value) || match.odds.away.value === 'NaN'
                                                                                    ? 'opacity-60 cursor-not-allowed bg-gray-400 hover:bg-gray-400' 
                                                                                    : 'bg-emerald-600 hover:bg-emerald-700'
                                                                            }`}
                                                                            onClick={(match.odds.away.suspended || !match.odds.away.value || isNaN(match.odds.away.value) || match.odds.away.value === 'NaN') ? undefined : (e) => {
                                                                                console.log(`🔍 MatchListPage - Away button clicked from ${match.source || 'Unknown'} page:`, {
                                                                                    match: match,
                                                                                    'match.league': match.league,
                                                                                    'match.groupId': match.groupId,
                                                                                    'match.leagueName': match.leagueName,
                                                                                    'match.source': match.source
                                                                                });
                                                                                return createBetHandler(
                                                                                    match, // Pass the complete match object
                                                                                    'Away',
                                                                                    match.odds.away.value,
                                                                                    '1x2',
                                                                                    match.odds.away.oddId,
                                                                                    { marketId: "1_away", label: "Away", name: `Win - ${match.team2}`, marketDescription: "Full Time Result" }
                                                                                )(e);
                                                                            }}
                                                                            disabled={match.odds.away.suspended || !match.odds.away.value || isNaN(match.odds.away.value) || match.odds.away.value === 'NaN'}
                                                                        >
                                                                            {(match.odds.away.suspended || !match.odds.away.value || isNaN(match.odds.away.value) || match.odds.away.value === 'NaN') ? '--' : match.odds.away.value}
                                                                        </Button>
                                                                    )}
                                                                    </div>
                                                                )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        </MatchWithOddsSync>
                                                    );
                                                })}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchListPage;

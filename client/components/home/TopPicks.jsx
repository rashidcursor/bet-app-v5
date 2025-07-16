'use client';

import React from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import MatchCard from './MatchCard';
import { selectTopPicks } from '@/lib/features/home/homeSlice';
import { formatMatchTime } from '@/lib/utils';

// Helper function to transform API data to MatchCard format
const transformMatchData = (apiMatch, league) => {
    // Extract team names from the match name (e.g., "Hammarby vs Halmstad")
    const teamNames = apiMatch.name?.split(' vs ') || ['Team A', 'Team B'];

    // Extract main odds (1, X, 2) from the odds data
    const odds = {};
    if (apiMatch.odds) {
       
        
        if (typeof apiMatch.odds === 'object' && !Array.isArray(apiMatch.odds)) {
            // Handle object format: { home: { value: 2.1, oddId: 123 }, draw: { value: 3.4, oddId: 124 } }
            if (apiMatch.odds.home && typeof apiMatch.odds.home === 'object' && !isNaN(apiMatch.odds.home.value)) {
                odds['1'] = { value: apiMatch.odds.home.value.toFixed(2), oddId: apiMatch.odds.home.oddId };
            }
            if (apiMatch.odds.draw && typeof apiMatch.odds.draw === 'object' && !isNaN(apiMatch.odds.draw.value)) {
                odds['X'] = { value: apiMatch.odds.draw.value.toFixed(2), oddId: apiMatch.odds.draw.oddId };
            }
            if (apiMatch.odds.away && typeof apiMatch.odds.away === 'object' && !isNaN(apiMatch.odds.away.value)) {
                odds['2'] = { value: apiMatch.odds.away.value.toFixed(2), oddId: apiMatch.odds.away.oddId };
            }
            
            // Handle simple object format: { home: 2.1, draw: 3.4, away: 3.2 }
            if (apiMatch.odds.home && typeof apiMatch.odds.home === 'number') {
                odds['1'] = { value: apiMatch.odds.home.toFixed(2), oddId: null };
            }
            if (apiMatch.odds.draw && typeof apiMatch.odds.draw === 'number') {
                odds['X'] = { value: apiMatch.odds.draw.toFixed(2), oddId: null };
            }
            if (apiMatch.odds.away && typeof apiMatch.odds.away === 'number') {
                odds['2'] = { value: apiMatch.odds.away.toFixed(2), oddId: null };
            }
        } else if (Array.isArray(apiMatch.odds)) {
            // Handle array format
            apiMatch.odds.forEach(odd => {
                const label = odd.label?.toString().toLowerCase();
                const name = odd.name?.toString().toLowerCase();
                const value = parseFloat(odd.value);
                if (!isNaN(value)) {
                    if (label === '1' || label === 'home' || name === 'home') odds['1'] = { value: value.toFixed(2), oddId: odd.oddId };
                    if (label === 'x' || label === 'draw' || name === 'draw') odds['X'] = { value: value.toFixed(2), oddId: odd.oddId };
                    if (label === '2' || label === 'away' || name === 'away') odds['2'] = { value: value.toFixed(2), oddId: odd.oddId };
                }
            });
        }
        

    } else {
        console.log('⚠️ No odds found for match:', apiMatch.id);
    }

    // Use the new timezone helper with 12-hour format
    const { date: dateStr, time: timeStr, isToday, isTomorrow } = formatMatchTime(apiMatch?.starting_at || null);

    // Combine date and time for display
    let displayTime = timeStr;
    if (isToday) {
        displayTime = `Today ${timeStr}`;
    } else if (isTomorrow) {
        displayTime = `Tomorrow ${timeStr}`;
    }

    return {
        id: apiMatch.id,
        league: {
            name: league.name,
            imageUrl: league.imageUrl
        },
        team1: teamNames[0],
        team2: teamNames[1],
        date: dateStr,
        time: displayTime,
        odds: odds,
        clock: true
    };
};

const TopPicks = () => {
    const topPicks = useSelector(selectTopPicks);

    // Transform API data to MatchCard format and filter out matches without valid odds
    const transformedMatches = topPicks
        .map(match => {
           
            return transformMatchData(match, match.league);
        })
        .filter(match => {
            const hasValidOdds = match.odds && Object.keys(match.odds).length > 0;

            return hasValidOdds;
        });


    if (transformedMatches.length === 0) {
        return (
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Top picks</h2>
                    <Link href="#" className="text-green-600 hover:underline text-sm">View All</Link>
                </div>
                <div className="text-gray-500 text-center py-8">
                    No top picks available at the moment.
                </div>
            </div>
        );
    }

    return (
        <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Top picks</h2>
                <Link href="#" className="text-green-600 hover:underline text-sm">View All</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {transformedMatches.slice(0, 8).map((match) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </div>
        </div>
    );
};

export default TopPicks;

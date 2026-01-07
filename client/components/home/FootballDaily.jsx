'use client';

import React from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import MatchCard from './MatchCard';
import FootballDailySkeleton from '../Skeletons/FootballDailySkeleton';
import { selectFootballDaily, selectHomeLoading } from '@/lib/features/home/homeSlice';
import { formatMatchTime } from '@/lib/utils';
import { getFotmobLogoByUnibetId } from '@/lib/leagueUtils';

// Helper function to transform API data to MatchCard format
const transformApiMatchToDisplayFormat = (apiMatch, league) => {
    // Extract team names from the match name (e.g., "Hammarby vs Halmstad")
    const teamNames = apiMatch.name?.split(' vs ') || ['Team A', 'Team B'];

    // Extract main odds (1, X, 2) from the odds data
    const odds = {};
    if (apiMatch.odds) {
        if (typeof apiMatch.odds === 'object' && !Array.isArray(apiMatch.odds)) {
            // Handle object format with oddId
            if (apiMatch.odds.home && !isNaN(apiMatch.odds.home.value)) odds['1'] = { value: apiMatch.odds.home.value.toFixed(2), oddId: apiMatch.odds.home.oddId || `${apiMatch.id}_home_1` };
            if (apiMatch.odds.draw && !isNaN(apiMatch.odds.draw.value)) odds['X'] = { value: apiMatch.odds.draw.value.toFixed(2), oddId: apiMatch.odds.draw.oddId || `${apiMatch.id}_draw_X` };
            if (apiMatch.odds.away && !isNaN(apiMatch.odds.away.value)) odds['2'] = { value: apiMatch.odds.away.value.toFixed(2), oddId: apiMatch.odds.away.oddId || `${apiMatch.id}_away_2` };
            // Handle simple number format
            if (apiMatch.odds.home && typeof apiMatch.odds.home === 'number') odds['1'] = { value: apiMatch.odds.home.toFixed(2), oddId: `${apiMatch.id}_home_1` };
            if (apiMatch.odds.draw && typeof apiMatch.odds.draw === 'number') odds['X'] = { value: apiMatch.odds.draw.toFixed(2), oddId: `${apiMatch.id}_draw_X` };
            if (apiMatch.odds.away && typeof apiMatch.odds.away === 'number') odds['2'] = { value: apiMatch.odds.away.toFixed(2), oddId: `${apiMatch.id}_away_2` };
        } else if (Array.isArray(apiMatch.odds)) {
            // Legacy array format (if still present)
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
            id: league.id, // Ensure Unibet ID is passed
            name: league.name,
            imageUrl: getFotmobLogoByUnibetId(league.id) || league.imageUrl || null
        },
        team1: teamNames[0],
        team2: teamNames[1],
        date: dateStr,
        time: displayTime,
        odds: odds,
        clock: true
    };
};

const FootballDaily = () => {
    const footballDaily = useSelector(selectFootballDaily);
    const loading = useSelector(selectHomeLoading);



    // Show skeleton while loading
    if (loading) {
        return <FootballDailySkeleton />;
    }

    if (!footballDaily || footballDaily.length === 0) {
        return (
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Football Daily</h2>
                    <Link href="#" className="text-green-600 hover:underline text-sm">View All</Link>
                </div>
                <div className="text-gray-500 text-center py-8">
                    No matches available at the moment.
                </div>
            </div>
        );
    }

    return (
        <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Football Daily</h2>
                <Link href="#" className="text-green-600 hover:underline text-sm">View All</Link>
            </div>

            {footballDaily.map((leagueGroup, index) => {
                // ✅ Get Fotmob logo URL using Unibet ID (groupId)
                const leagueId = leagueGroup.league?.id;
                const fotmobLogoUrl = getFotmobLogoByUnibetId(leagueId);
                const hasLogo = fotmobLogoUrl || leagueGroup.league?.imageUrl;
                
                return (
                    <div key={leagueGroup.league?.id || index} className="mb-6">
                        <div className="flex items-center mb-3">
                            {hasLogo ? (
                                <img
                                    src={fotmobLogoUrl || leagueGroup.league?.imageUrl}
                                    alt={leagueGroup.league.name}
                                    className="w-6 h-6 mr-2 object-contain"
                                    onError={(e) => {
                                        // If logo fails to load, hide image and show fallback
                                        e.target.style.display = 'none';
                                    }}
                                />
                            ) : (
                                // ✅ Show fallback icon if no logo available
                                <span className="text-green-400 text-sm mr-2">⚽</span>
                            )}
                        <h3 className="text-lg font-semibold text-gray-700">
                            {leagueGroup.league?.name || 'Unknown League'}
                        </h3>
                        <span className="ml-2 text-sm text-gray-500">
                            ({leagueGroup.matches?.length || 0} matches)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {leagueGroup.matches?.slice(0, 4).map((match) => (
                            <MatchCard key={match.id} match={transformApiMatchToDisplayFormat(match, leagueGroup.league)} />
                        ))}
                    </div>
                </div>
                );
            })}
        </div>
    );
};

export default FootballDaily;
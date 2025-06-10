'use client';

import React from 'react';
import Link from 'next/link';
import MatchCard from './MatchCard';

const TopPicks = () => {
    const matches = [
        {
            id: 'finland-poland',
            tournament: 'World Cup Qualifying - Europe',
            team1: 'Finland',
            team2: 'Poland',
            date: '10 Jun',
            time: 'Today 23:45',
            odds: {
                '1': '3.70',
                'X': '3.20',
                '2': '2.08'
            },
            clock: true
        },
        {
            id: 'netherlands-malta',
            tournament: 'World Cup Qualifying - Europe',
            team1: 'Netherlands',
            team2: 'Malta',
            date: '10 Jun',
            time: 'Today 23:45',
            odds: {
                'X': '23.00',
                '2': '71.00'
            },
            clock: true
        },
        {
            id: 'romania-cyprus',
            tournament: 'World Cup Qualifying - Europe',
            team1: 'Romania',
            team2: 'Cyprus',
            date: '10 Jun',
            time: 'Today 23:45',
            odds: {
                '1': '1.33',
                'X': '4.80',
                '2': '9.50'
            },
            clock: true
        },
        {
            id: 'japan-indonesia',
            tournament: 'World Cup Qualifying - Asia',
            team1: 'Japan',
            team2: 'Indonesia',
            date: '6',
            time: '0 81:07',
            odds: {
                'X': '1001.00'
            },
            clock: true
        },
        {
            id: 'england-senegal',
            tournament: 'International Friendly Matches',
            team1: 'England',
            team2: 'Senegal',
            date: '10 Jun',
            time: 'Today 23:45',
            odds: {
                '1': '1.45',
                'X': '4.30',
                '2': '7.00'
            },
            clock: true
        },
        {
            id: 'azerbaijan-hungary',
            tournament: 'International Friendly Matches',
            team1: 'Azerbaijan',
            team2: 'Hungary',
            date: '10 Jun',
            time: 'Today 21:00',
            odds: {
                '1': '4.90',
                'X': '3.55',
                '2': '1.75'
            },
            clock: true
        }
    ];

    return (
        <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Top picks</h2>
                <Link href="#" className="text-green-600 hover:underline text-sm">View All</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </div>
        </div>
    );
};

export default TopPicks;

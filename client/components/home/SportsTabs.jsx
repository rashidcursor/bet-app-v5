'use client';

import React from 'react';

const SportsTabs = () => {
    const sports = [
        { name: 'Upcoming', icon: '⏰' },
        { name: 'Streaming', icon: '📺' },
        { name: 'Top Picks', icon: '⭐' },
        { name: 'Odds Boost', icon: '💫' },
        { name: 'Football', icon: '⚽' },
        { name: 'Tennis', icon: '🎾' },
        { name: 'E-Sports', icon: '🎮' },
        { name: 'Boxing', icon: '🥊' },
        { name: 'Darts', icon: '🎯' },
        { name: 'Cricket', icon: '🏏' },
        { name: 'Handball', icon: '🤾' },
        { name: 'Basketball', icon: '🏀' },
        { name: 'Formula 1', icon: '🏎️' },
    ];

    return (
        <div className="mb-6">
            <div className="flex items-center space-x-6 bg-white p-4 rounded-lg shadow-sm overflow-x-auto">
                {sports.map((sport, index) => (
                    <div key={index} className="flex flex-col items-center min-w-fit cursor-pointer hover:bg-gray-50 p-2 rounded">
                        <div className="text-2xl mb-1">{sport.icon}</div>
                        <span className="text-xs text-gray-600 whitespace-nowrap">{sport.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SportsTabs;

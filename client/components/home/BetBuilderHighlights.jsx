'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const BetBuilderHighlights = () => {
    const highlights = [
        {
            match: 'Romania - Cyprus',
            team: 'Romania',
            type: 'Full Time',
            icon: '⚽'
        },
        {
            match: 'Sweden - Algeria',
            team: 'Algeria',
            type: 'Full Time',
            icon: '⚽'
        },
        {
            match: 'Finland - Poland',
            team: 'Poland',
            type: 'Full Time',
            icon: '⚽'
        }
    ];

    return (
        <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Bet Builder Highlights</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {highlights.map((highlight, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                                    <span className="text-white text-sm">{highlight.icon}</span>
                                </div>
                                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs">📋</span>
                                </div>
                            </div>

                            <div className="text-sm font-medium mb-1">{highlight.match}</div>
                            <div className="text-xs text-gray-500 mb-3">{highlight.team}</div>
                            <div className="text-xs text-gray-500">{highlight.type}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default BetBuilderHighlights;

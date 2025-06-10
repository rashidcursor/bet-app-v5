'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const TrendingCombo = () => {
    const trendingMatches = [
        {
            match: 'Romania',
            type: 'Full Time',
            odds: '1.33',
            flag: '🇷🇴',
            opponent: 'Romania - Cyprus',
            time: 'Today 23:45'
        },
        {
            match: 'Algeria',
            type: 'Full Time',
            odds: '4.25',
            flag: '🇩🇿',
            opponent: 'Sweden - Algeria',
            time: 'Today 22:00'
        },
        {
            match: 'Poland',
            type: 'Full Time',
            odds: '2.08',
            flag: '🇵🇱',
            opponent: 'Finland - Poland',
            time: 'Today 23:45'
        }
    ];

    return (
        <div className="space-y-4">
            {/* Live Stream Promo */}
            <Card className="bg-gradient-to-r from-green-600 to-blue-600 text-white">
                <CardContent className="p-6">
                    <h3 className="font-bold mb-2">Live stream football, tennis and all the biggest events</h3>
                    <p className="text-sm mb-4">18+. Terms and Conditions apply.</p>
                    <Button className="bg-yellow-500 text-black hover:bg-yellow-400">
                        Livestream
                    </Button>
                </CardContent>
            </Card>

            {/* Trending Combo */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold">Trending Combo</h3>
                        <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                            <span className="text-white text-xs">🔥</span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {trendingMatches.map((match, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                            <div className="flex items-center space-x-2">
                                <span>{match.flag}</span>
                                <div>
                                    <div className="text-sm font-medium">{match.match}</div>
                                    <div className="text-xs text-gray-500">{match.type}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-green-600">{match.odds}</div>
                            </div>
                        </div>
                    ))}

                    <div className="pt-3 border-t">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">🔄 Refresh</span>
                            <div className="bg-green-600 text-white px-3 py-1 rounded text-sm font-bold">
                                11.76
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default TrendingCombo;

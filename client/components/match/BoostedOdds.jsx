'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const BoostedOdds = () => {
    return (
        <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Boosted Odds</h3>

            <Card className="bg-white">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <span className="text-sm text-gray-600">Both teams to score & over 3.5 goals in the match</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-yellow-500 text-lg">⭐</span>
                            <div className="bg-green-600 text-white px-4 py-2 rounded font-bold">
                                5.00
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default BoostedOdds;

'use client';

import React from 'react';
import MatchHeader from './MatchHeader';
import BoostedOdds from './BoostedOdds';
import BettingTabs from './BettingTabs';
import MatchVisualization from './MatchVisualization';

const MatchDetailPage = ({ matchId }) => {
    return (
        <div className="bg-gray-100">
            {/* Secondary navigation */}
            <div className="bg-gray-600 text-white">
                <div className="flex items-center px-6 py-3">
                    <div className="flex items-center space-x-8">
                        <div className="flex items-center space-x-2 px-4 py-2 hover:bg-gray-500 rounded cursor-pointer">
                            <span className="text-sm">🏠</span>
                            <span className="text-sm">HOME</span>
                        </div>
                        <div className="flex items-center space-x-2 bg-green-600 px-4 py-2 rounded">
                            <span className="text-sm">⏱️</span>
                            <span className="text-sm font-medium">IN-PLAY</span>
                        </div>
                        <div className="flex items-center space-x-2 px-4 py-2 hover:bg-gray-500 rounded cursor-pointer">
                            <span className="text-sm">⏰</span>
                            <span className="text-sm">UPCOMING</span>
                        </div>
                        <div className="flex items-center space-x-2 px-4 py-2 hover:bg-gray-500 rounded cursor-pointer">
                            <span className="text-sm">📺</span>
                            <span className="text-sm">STREAMING</span>
                        </div>
                        <div className="flex items-center space-x-2 px-4 py-2 hover:bg-gray-500 rounded cursor-pointer">
                            <span className="text-sm">🎁</span>
                            <span className="text-sm">FREE BETS & UNIBOOSTS</span>
                        </div>
                    </div>
                    <div className="ml-auto">
                        <span className="text-sm cursor-pointer">🔍</span>
                    </div>
                </div>
            </div>            <div className="p-6">
                <div className="flex gap-6">
                    {/* Main content */}
                    <div className="flex-1">
                        <MatchHeader matchId={matchId} />
                        <BoostedOdds />
                        <BettingTabs />
                    </div>

                    {/* Right sidebar */}
                    <div className="w-96">
                        <MatchVisualization />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MatchDetailPage;

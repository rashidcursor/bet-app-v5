'use client';

import React from 'react';
import TopPicks from './TopPicks';
import BetBuilderHighlights from './BetBuilderHighlights';
import TrendingCombo from './TrendingCombo';

const MainContent = () => {
    return (<div className="flex-1 bg-gray-100 overflow-hidden">
        {/* Secondary navigation */}
        <div className="bg-gray-600 text-white">
            <div className="flex items-center px-3 lg:px-6 py-3 overflow-x-auto">
                <div className="flex items-center space-x-4 lg:space-x-8 min-w-max">
                    <div className="flex items-center space-x-2 bg-green-600 px-3 lg:px-4 py-2 rounded whitespace-nowrap">
                        <span className="text-sm">🏠</span>
                        <span className="text-sm font-medium">HOME</span>
                    </div>
                    <div className="flex items-center space-x-2 px-3 lg:px-4 py-2 hover:bg-gray-500 rounded cursor-pointer whitespace-nowrap">
                        <span className="text-sm">⏱️</span>
                        <span className="text-sm">IN-PLAY</span>
                    </div>
                    <div className="flex items-center space-x-2 px-3 lg:px-4 py-2 hover:bg-gray-500 rounded cursor-pointer whitespace-nowrap">
                        <span className="text-sm">⏰</span>
                        <span className="text-sm">UPCOMING</span>
                    </div>
                    <div className="flex items-center space-x-2 px-3 lg:px-4 py-2 hover:bg-gray-500 rounded cursor-pointer whitespace-nowrap">
                        <span className="text-sm">📺</span>
                        <span className="text-sm">STREAMING</span>
                    </div>
                    <div className="flex items-center space-x-2 px-3 lg:px-4 py-2 hover:bg-gray-500 rounded cursor-pointer whitespace-nowrap">
                        <span className="text-sm">🎁</span>
                        <span className="text-sm hidden sm:inline">FREE BETS & UNIBOOSTS</span>
                        <span className="text-sm sm:hidden">FREE BETS</span>
                    </div>
                </div>
                <div className="ml-auto flex-shrink-0">
                    <span className="text-sm cursor-pointer">🔍</span>
                </div>
            </div>
        </div>

        <div className="p-3 lg:p-6 overflow-hidden">
            <div className="flex flex-col xl:flex-row gap-4 lg:gap-6">
                {/* Main content area */}
                <div className="flex-1 min-w-0">
                    <TopPicks />
                    <BetBuilderHighlights />
                </div>

                {/* Right sidebar */}
                <div className="w-full xl:w-80 xl:flex-shrink-0">
                    <TrendingCombo />
                </div>
            </div>
        </div>
    </div>
    );
};

export default MainContent;

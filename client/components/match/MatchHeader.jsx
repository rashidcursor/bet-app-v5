'use client';

import React from 'react';

const MatchHeader = ({ matchId }) => {
    return (
        <div className="mb-6">
            {/* Breadcrumb */}
            <div className="flex items-center text-sm text-gray-500 mb-4">
                <span>←</span>
                <span className="ml-2">Football | World Cup Qualifying - Europe</span>
            </div>

            {/* Match Header */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                                <span className="text-white text-sm">🇫🇮</span>
                            </div>
                            <span className="text-lg font-semibold">Finland</span>
                            <span className="text-lg text-gray-400">-</span>
                            <span className="text-lg font-semibold">Poland</span>
                            <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
                                <span className="text-white text-sm">🇵🇱</span>
                            </div>
                        </div>
                        <div className="ml-4">
                            <span className="text-sm text-gray-500">▼</span>
                        </div>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                            <span>⏰</span>
                            <span>10 June 2025 23:45</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MatchHeader;

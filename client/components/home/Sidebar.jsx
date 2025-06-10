


'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Sidebar = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const popularSports = [
        { name: 'Odds Boost', icon: '💫', count: null },
        { name: 'Champions League', icon: '⚽', count: null },
        { name: 'Premier League', icon: '⚽', count: null },
        { name: 'NBA', icon: '🏀', count: null },
        { name: 'NHL', icon: '🏒', count: null },
        { name: 'La Liga', icon: '⚽', count: null },
    ];

    const allSports = [
        { name: 'American Football', count: 666 },
        { name: 'Athletics', count: 1 },
        { name: 'Australian Rules', count: '999+' },
        { name: 'Baseball', count: '999+' },
        { name: 'Basketball', count: '999+' },
        { name: 'Boxing', count: 66 },
        { name: 'Cricket', count: 219 },
        { name: 'Cycling', count: 5 },
    ];

    return (
        <div className={`${isCollapsed ? 'w-16' : 'w-56'} bg-gray-800 text-white min-h-screen transition-all duration-300 flex-shrink-0`}>
            {/* Collapse/Expand Button */}
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                {!isCollapsed && (
                    <div className="flex items-center text-sm">
                        <span className="mr-2">🌐</span>
                        <span>EN</span>
                    </div>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {!isCollapsed && (
                <>
                    {/* Popular section */}
                    <div className="p-4">
                        <h3 className="text-sm font-semibold mb-3">POPULAR</h3>
                        <div className="space-y-1">
                            {popularSports.map((sport, index) => (
                                <div key={index} className="flex items-center py-2 px-3 hover:bg-gray-700 rounded cursor-pointer">
                                    <span className="text-green-400 mr-3">🌟</span>
                                    <span className="text-sm">{sport.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* All Sports section */}
                    <div className="px-4 pb-4">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold">ALL SPORTS</h3>
                            <span className="text-xs text-gray-400">NUMBER OF BETS</span>
                        </div>
                        <div className="space-y-1">
                            {allSports.map((sport, index) => (
                                <div key={index} className="flex items-center justify-between py-2 px-3 hover:bg-gray-700 rounded cursor-pointer">
                                    <div className="flex items-center">
                                        <span className="text-white mr-3">⚪</span>
                                        <span className="text-sm">{sport.name}</span>
                                    </div>
                                    <span className="text-xs text-gray-400">{sport.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {isCollapsed && (
                <div className="p-2 space-y-2">
                    {/* Collapsed view - show only icons */}
                    <div className="flex flex-col items-center space-y-3 pt-4">
                        {popularSports.slice(0, 6).map((sport, index) => (
                            <div key={index} className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center cursor-pointer transition-colors">
                                <span className="text-sm">🌟</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

};

export default Sidebar;

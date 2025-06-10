'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const MatchVisualization = () => {
    return (
        <div className="space-y-4">
            {/* Match Visualization Icons */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex justify-center space-x-8 mb-4">
                        <div className="text-center">
                            <div className="w-8 h-8 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                <span className="text-xs">📊</span>
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                <span className="text-xs">👥</span>
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                <span className="text-xs">📋</span>
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                <span className="text-xs">🏆</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Football Field Visualization */}
            <Card className="bg-green-600">
                <CardContent className="p-6">
                    <div className="relative bg-green-500 rounded-lg p-4 min-h-[400px]">
                        {/* Football field layout */}
                        <div className="h-full border-2 border-white rounded relative">
                            {/* Center circle */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-white rounded-full"></div>

                            {/* Center line */}
                            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-white"></div>

                            {/* Goal areas */}
                            <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-8 h-24 border-2 border-white border-l-0"></div>
                            <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-8 h-24 border-2 border-white border-r-0"></div>

                            {/* Penalty areas */}
                            <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-16 h-40 border-2 border-white border-l-0"></div>
                            <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-16 h-40 border-2 border-white border-r-0"></div>
                        </div>

                        {/* Kickoff Time Display */}
                        <div className="absolute top-4 right-4 bg-white rounded-lg p-3 text-center">
                            <div className="text-xs font-semibold mb-2">KICKOFF TIME</div>
                            <div className="flex space-x-1 text-2xl font-bold">
                                <span className="bg-black text-white px-2 py-1 rounded">0</span>
                                <span className="bg-black text-white px-2 py-1 rounded">6</span>
                                <span>:</span>
                                <span className="bg-black text-white px-2 py-1 rounded">3</span>
                                <span className="bg-black text-white px-2 py-1 rounded">0</span>
                                <span>:</span>
                                <span className="bg-black text-white px-2 py-1 rounded">4</span>
                                <span className="bg-black text-white px-2 py-1 rounded">2</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                <span>HRS</span>
                                <span className="ml-6">MINS</span>
                                <span className="ml-6">SECS</span>
                            </div>
                        </div>

                        {/* Player positions */}
                        <div className="absolute bottom-8 left-8 text-white text-xs">
                            <div className="mb-1">Pinheiro, Joao Pedro</div>
                            <div className="text-green-200">REFEREE</div>
                        </div>

                        <div className="absolute bottom-8 left-24 text-white text-xs">
                            <div className="mb-1">Friis, Jacob</div>
                            <div className="text-green-200">MANAGER</div>
                        </div>

                        <div className="absolute bottom-8 right-24 text-white text-xs">
                            <div className="mb-1">Probierz, Michal</div>
                            <div className="text-green-200">MANAGER</div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default MatchVisualization;

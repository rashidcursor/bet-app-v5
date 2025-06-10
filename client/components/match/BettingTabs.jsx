'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

const BettingTabs = () => {
    const [selectedTab, setSelectedTab] = useState('all');

    const tabs = [
        { id: 'all', label: 'All' },
        { id: 'bet-builder', label: 'Bet Builder' },
        { id: 'pre-packs', label: 'Pre-packs' },
        { id: 'full-time', label: 'Full Time' },
        { id: 'player-shots', label: 'Player Shots on Target' },
        { id: 'player-shots-2', label: 'Player Shots' },
        { id: 'player-cards', label: 'Player Cards' },
        { id: 'goal-scorer', label: 'Goal Scorer' },
        { id: 'player-goals', label: 'Player Goals' },
        { id: 'player-assists', label: 'Player Assists' }
    ];

    return (
        <div className="mb-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <TabsList className="grid w-full grid-cols-10 mb-6 bg-gray-100 p-1 rounded-lg">
                    {tabs.map((tab) => (
                        <TabsTrigger
                            key={tab.id}
                            value={tab.id}
                            className="text-xs px-2 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="all" className="space-y-4">
                    {/* Full Time Section */}
                    <div>
                        <h4 className="text-md font-semibold mb-3">Full Time</h4>
                        <Card>
                            <CardContent className="p-4">
                                <div className="mb-3">
                                    <span className="text-sm font-medium">Full Time</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-green-600 text-white text-center py-3 rounded font-medium">
                                        <div className="text-xs mb-1">Finland</div>
                                        <div className="text-lg">3.70</div>
                                    </div>
                                    <div className="bg-green-600 text-white text-center py-3 rounded font-medium">
                                        <div className="text-xs mb-1">Draw</div>
                                        <div className="text-lg">3.20</div>
                                    </div>
                                    <div className="bg-green-600 text-white text-center py-3 rounded font-medium">
                                        <div className="text-xs mb-1">Poland</div>
                                        <div className="text-lg">2.08</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Total Goals Section */}
                    <div>
                        <h4 className="text-md font-semibold mb-3">Total Goals</h4>
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-center mb-4">
                                    <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                                        <div className="w-3 h-3 bg-white rounded-full"></div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-green-600 text-white text-center py-3 rounded font-medium">
                                        <div className="text-xs mb-1">Over 2.5</div>
                                        <div className="text-lg">2.23</div>
                                    </div>
                                    <div className="bg-green-600 text-white text-center py-3 rounded font-medium">
                                        <div className="text-xs mb-1">Under 2.5</div>
                                        <div className="text-lg">1.63</div>
                                    </div>
                                </div>
                                <div className="text-center mt-3">
                                    <button className="text-sm text-gray-500 hover:text-gray-700">
                                        Show list ▼
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Double Chance Section */}
                    <div>
                        <h4 className="text-md font-semibold mb-3">Double Chance</h4>
                        <Card>
                            <CardContent className="p-4">
                                <div className="bg-green-600 text-white text-center py-3 rounded font-medium">
                                    <div className="text-xs mb-1">1X</div>
                                    <div className="text-lg">1.70</div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Other tab contents can be added here */}
                {tabs.slice(1).map((tab) => (
                    <TabsContent key={tab.id} value={tab.id}>
                        <div className="text-center py-8 text-gray-500">
                            {tab.label} betting options will be displayed here
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
};

export default BettingTabs;

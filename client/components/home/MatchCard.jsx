'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

const MatchCard = ({ match }) => {
    return (
        <Link href={`/matches/${match.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                    <div className="text-xs text-gray-500 mb-2">{match.tournament}</div>

                    <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                            <div className="font-medium text-sm mb-1">{match.team1}</div>
                            <div className="font-medium text-sm">{match.team2}</div>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                                {match.clock && <span>⏰</span>}
                                <span>{match.date}</span>
                            </div>
                            <div>{match.time}</div>
                        </div>
                    </div>

                    <div className="flex gap-1">
                        {match.odds['1'] && (
                            <div className="flex-1 bg-green-600 text-white text-center py-2 text-sm font-medium rounded-sm">
                                <div className="text-xs">1</div>
                                <div>{match.odds['1']}</div>
                            </div>
                        )}
                        {match.odds['X'] && (
                            <div className="flex-1 bg-green-600 text-white text-center py-2 text-sm font-medium rounded-sm">
                                <div className="text-xs">X</div>
                                <div>{match.odds['X']}</div>
                            </div>
                        )}
                        {match.odds['2'] && (
                            <div className="flex-1 bg-green-600 text-white text-center py-2 text-sm font-medium rounded-sm">
                                <div className="text-xs">2</div>
                                <div>{match.odds['2']}</div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};

export default MatchCard;

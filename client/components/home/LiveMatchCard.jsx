'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBetting } from '@/hooks/useBetting';
import LiveMatchTimer from '@/components/shared/LiveMatchTimer';
import { Tv } from 'lucide-react';
import { getFotmobLogoByUnibetId } from '@/lib/leagueUtils';

const LiveMatchCard = ({ match }) => {
    // Track previous odds to detect changes and force re-render
    const prevOddsRef = useRef(null);
    
    useEffect(() => {
        const currentOdds = match.odds ? JSON.stringify(match.odds) : null;
        if (prevOddsRef.current !== null && prevOddsRef.current !== currentOdds) {
            // Odds changed - component will re-render automatically
            console.log(`🔄 Odds changed for match ${match.id}`);
        }
        prevOddsRef.current = currentOdds;
    }, [match.odds, match.id]);
    const { createBetHandler } = useBetting();
    
    // Create a properly formatted match object for betting (same as BettingTabs.jsx)
    const formattedMatch = {
        id: match.id,
        team1: match.team1 || match.homeName || 'Home',
        team2: match.team2 || match.awayName || 'Away',
        starting_at: match.starting_at,
        participants: match.participants || [
            { name: match.team1 || match.homeName || 'Home', position: 'home' },
            { name: match.team2 || match.awayName || 'Away', position: 'away' }
        ],
        isLive: match.isLive || true, // Live match cards are always live
        kambiLiveData: match.kambiLiveData,
        liveData: match.liveData,
        timing: match.timing,
        state_id: match.state_id,
        league: match.league,
        groupId: match.groupId,
        leagueName: match.leagueName,
        source: 'LiveMatchCard'
    };
    // Debug: single console to inspect cards/corners structure
    if (match?.kambiLiveData?.statistics?.football) {
        const f = match.kambiLiveData.statistics.football;
        // home/away yellow, red, corners
        // console.log('🔍 LiveMatchCard stats:', {
        //     matchId: match.id,
        //     f
        //     });
    }

    return (
        <Link href={`/matches/${match.id}`}>
            <div className="bg-white border border-gray-200 cursor-pointer rounded-none shadow-none relative">
                <div className="p-4">
                    <div className='flex align-center gap-2 justify-between mb-2'>
                        <div className="flex items-center gap-2">
                            {(getFotmobLogoByUnibetId(match.league.id) || match.league.imageUrl) ? (
                                <img 
                                    src={getFotmobLogoByUnibetId(match.league.id) || match.league.imageUrl} 
                                    className='w-4 h-4 object-contain' 
                                    alt={match.league.name}
                                    onError={e => { e.target.style.display = 'none'; }}
                                />
                            ) : match.league.icon ? (
                                <span className="text-green-400 text-sm">{match.league.icon}</span>
                            ) : null}
                            <div className="text-xs text-gray-500">
                                {match.league.country ? `${match.league.name} (${match.league.country})` : match.league.name}
                            </div>
                        </div>
                        {/* Timer in place of live tag */}
                        {match.kambiLiveData?.matchClock ? (
                            <div className="flex items-center gap-1">
                                <Tv className="w-3 h-3 text-red-600" />
                                <LiveMatchTimer 
                                    matchId={match.id}
                                    initialTime={{
                                        minute: match.kambiLiveData.matchClock.minute || 0,
                                        second: match.kambiLiveData.matchClock.second || 0
                                    }}
                                    initialPeriod={match.kambiLiveData.matchClock.period || '1st half'}
                                    isRunning={match.kambiLiveData.matchClock.running || false}
                                />
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500">
                                {match.clock && <span>⏰</span>}
                                <span>{match.date}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center mb-3">
                        {/* Team names - 80% width */}
                        <div className="w-4/5 min-w-0">
                            <div className="text-sm mb-1 truncate">{match.team1}</div>
                            <div className="text-sm truncate">{match.team2}</div>
                        </div>
                        
                        {/* Cards display - 10% width (always show, defaulting to 0-0) */}
                        <div className="w-1/10 text-center">
                            <div className="flex flex-col items-center justify-center gap-1">
                                {/* Color blocks on top */}
                                <div className="flex items-center justify-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-500 border-0"></div>
                                    <div className="w-2 h-2 bg-red-500 border-0"></div>
                                    <div className="text-[10px] leading-none">🚩</div>
                                </div>
                                {/* Card numbers below */}
                                <div className="flex items-center justify-center gap-2">
                                    <div className="text-[10px]">
                                        <div className="text-xs">{match.kambiLiveData?.statistics?.football?.home?.yellowCards || 0}</div>
                                        <div className="text-xs">{match.kambiLiveData?.statistics?.football?.away?.yellowCards || 0}</div>
                                    </div>
                                    <div className="text-[10px]">
                                        <div className="text-xs">{match.kambiLiveData?.statistics?.football?.home?.redCards || 0}</div>
                                        <div className="text-xs">{match.kambiLiveData?.statistics?.football?.away?.redCards || 0}</div>
                                    </div>
                                    <div className="text-[10px]">
                                        <div className="text-xs">{match.kambiLiveData?.statistics?.football?.home?.corners || 0}</div>
                                        <div className="text-xs">{match.kambiLiveData?.statistics?.football?.away?.corners || 0}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Live score display - 10% width */}
                        <div className="w-1/10 text-right">
                            {match.kambiLiveData?.score ? (
                                <div className="text-lg font-bold text-gray-800">
                                    <div>{match.kambiLiveData.score.home}</div>
                                    <div>{match.kambiLiveData.score.away}</div>
                                </div>
                            ) : match.liveData?.score ? (
                                <div className="text-lg font-bold text-gray-800">
                                    <div>{match.liveData.score.split(' - ')[0] || '0'}</div>
                                    <div>{match.liveData.score.split(' - ')[1] || '0'}</div>
                                </div>
                            ) : (
                                <div className="text-lg font-bold text-gray-800">
                                    <div>0</div>
                                    <div>0</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Odds buttons */}
                    <div className="flex gap-1">
                        {match.odds['1'] && (
                            <Button
                                size={"sm"}
                                className="flex-1 flex justify-between py-2 gap-0 betting-button"
                                onClick={createBetHandler(formattedMatch, "Home", match.odds['1'].value, '1x2', match.odds['1'].oddId, { 
                                    marketId: "1", 
                                    label: "Home", 
                                    name: `Win - ${formattedMatch.team1}`, 
                                    marketDescription: "Full Time Result" 
                                })}
                            >
                                <div className="text-[11px]">1</div>
                                <div className='text-[13px] font-bold'>{match.odds['1'].value}</div>
                            </Button>
                        )}
                        {match.odds['X'] && (
                            <Button
                                className="flex-1 flex justify-between py-2 gap-0 betting-button"
                                size={"sm"}
                                onClick={createBetHandler(formattedMatch, "Draw", match.odds['X'].value, '1x2', match.odds['X'].oddId, { marketId: "1", label: "Draw", name: `Draw - ${formattedMatch.team1} vs ${formattedMatch.team2}`, marketDescription: "Full Time Result" })}
                            >
                                <div className="text-[11px]">X</div>
                                <div className='text-[13px] font-bold'>{match.odds['X'].value}</div>
                            </Button>
                        )}
                        {match.odds['2'] && (
                            <Button
                                size={"sm"}
                                className="flex-1 flex justify-between py-2 gap-0 betting-button"
                                onClick={createBetHandler(formattedMatch, "Away", match.odds['2'].value, '1x2', match.odds['2'].oddId, { marketId: "1", label: "Away", name: `Win - ${formattedMatch.team2}`, marketDescription: "Full Time Result" })}
                            >
                                <div className="text-[11px]">2</div>
                                <div className='text-[13px] font-bold'>{match.odds['2'].value}</div>
                            </Button>
                        )}
                        
                        {/* Show message when no odds are available */}
                        {(!match.odds || Object.keys(match.odds).length === 0) && (
                            <div className="flex-1 text-center py-2 text-xs text-gray-500 bg-gray-50 rounded">
                                Odds not available
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default LiveMatchCard;

"use client"
import React, { useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useBetting } from '@/hooks/useBetting';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const LeagueAccordions = ({ matches }) => {
    const { createBetHandler } = useBetting();
    const router = useRouter();

    // Transform matches data to work with existing accordion structure
    const matchGroups = useMemo(() => {
        if (!matches || !Array.isArray(matches)) return [];
        
        // Group matches by league/group
        const groupedMatches = {};
        matches.forEach(match => {
            const groupKey = match.group || 'Unknown League';
            if (!groupedMatches[groupKey]) {
                groupedMatches[groupKey] = {
                    id: match.groupId || Math.random().toString(36).substr(2, 9),
                    name: groupKey,
                    matches: []
                };
            }
            groupedMatches[groupKey].matches.push(match);
        });
        
        return Object.values(groupedMatches);
    }, [matches]);

    const MatchCard = ({ match, index, totalMatches }) => {
        const formatDate = (dateString) => {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        // Extract team names and odds from Unibet API data
        const team1 = match.homeName || 'Home Team';
        const team2 = match.awayName || 'Away Team';
        
        // Extract odds from mainBetOffer
        let odds1 = null, oddsX = null, odds2 = null;
        if (match.mainBetOffer && match.mainBetOffer.outcomes) {
            match.mainBetOffer.outcomes.forEach(outcome => {
                const oddsValue = (outcome.odds / 1000).toFixed(2); // Convert from Unibet format
                if (outcome.label === '1') {
                    odds1 = oddsValue;
                } else if (outcome.label === 'X') {
                    oddsX = oddsValue;
                } else if (outcome.label === '2') {
                    odds2 = oddsValue;
                }
            });
        }
        
        const hasOdds = odds1 || oddsX || odds2;

        return (
            <div key={match.id}>
                <div className='flex justify-between mt-2'>
                    <div className="text-xs text-gray-600">{match.sport}</div>
                </div>
                {hasOdds ? (
                    <Link href={`/matches/${match.id}`}>
                        <div className="cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-1 rounded">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 mb-1">{formatDate(match.start)}</div>
                                    <div className="text-[12px] mb-1" title={team1}>
                                        {team1.length > 18 ? `${team1.slice(0, 18)}...` : team1}
                                    </div>
                                    <div className="text-[12px]" title={team2}>
                                        {team2.length > 18 ? `${team2.slice(0, 18)}...` : team2}
                                    </div>
                                </div>
                                    <div className="flex items-center flex-shrink-0">
                                        <div className="flex gap-1">
                                            {odds1 && (
                                                <Button
                                                    size={"sm"}
                                                    className="w-14 h-8 p-0 text-xs font-bold betting-button"
                                                    onClick={createBetHandler(match, 'Home', odds1, '1x2', match.mainBetOffer?.outcomes?.find(o => o.label === '1')?.id || null, { marketId: "1", label: "Home", name: `Win - ${team1}`, marketDescription: "Full Time Result" })}
                                                >
                                                    {odds1}
                                                </Button>
                                            )}
                                            {oddsX && (
                                                <Button
                                                    className="w-14 h-8 p-0 text-xs font-bold betting-button"
                                                    size={"sm"}
                                                    onClick={createBetHandler(match, 'Draw', oddsX, '1x2', match.mainBetOffer?.outcomes?.find(o => o.label === 'X')?.id || null, { marketId: "1", label: "Draw", name: `Draw - ${team1} vs ${team2}`, marketDescription: "Full Time Result" })}
                                                >
                                                    {oddsX}
                                                </Button>
                                            )}
                                            {odds2 && (
                                                <Button
                                                    size={"sm"}
                                                    className="w-14 h-8 p-0 text-xs font-bold betting-button"
                                                    onClick={createBetHandler(match, 'Away', odds2, '1x2', match.mainBetOffer?.outcomes?.find(o => o.label === '2')?.id || null, { marketId: "1", label: "Away", name: `Win - ${team2}`, marketDescription: "Full Time Result" })}
                                                >
                                                    {odds2}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                        </div>
                    </Link>
                ) : (
                    <div className="cursor-pointer -mx-4 px-4 py-1 rounded">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <div className="text-[12px] mb-1" title={team1}>
                                    {team1.length > 18 ? `${team1.slice(0, 18)}...` : team1}
                                </div>
                                <div className="text-[12px]" title={team2}>
                                    {team2.length > 18 ? `${team2.slice(0, 18)}...` : team2}
                                </div>
                            </div>
                            <div className="flex items-center flex-shrink-0">
                                <span className="text-xs text-gray-500">Odds not available</span>
                            </div>
                        </div>
                    </div>
                )}
                {index < totalMatches - 1 && (
                    <div className="border-b border-gray-300 mx-0 my-2"></div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3 bg-white h-full p-3">
            {matchGroups && matchGroups.length > 0 ? (
                <Accordion type="multiple" className="space-y-2">
                    {matchGroups.map((group) => (
                        <AccordionItem
                            key={group.id}
                            value={group.id}
                            className="bg-white border border-gray-200 overflow-hidden duration-200"
                        >
                            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50/50 transition-colors duration-200 [&[data-state=open]]:bg-gray-50/80">
                                <div className="flex items-center justify-between w-full">
                                    <h4 className="text-sm font-semibold text-gray-900">{group.name}</h4>
                                    <span className="text-xs text-gray-500">{group.matches.length} matches</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-4">
                                {/* Column Headers */}
                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                                    <div className="flex-1">
                                        <div className="text-[10px] font-semibold text-gray-600">Match</div>
                                    </div>
                                    <div className="flex items-center flex-shrink-0">
                                        <div className="flex gap-1">
                                            <div className="w-14 text-center text-[10px] font-semibold text-gray-600">1</div>
                                            <div className="w-14 text-center text-[10px] font-semibold text-gray-600">X</div>
                                            <div className="w-14 text-center text-[10px] font-semibold text-gray-600">2</div>
                                        </div>
                                    </div>
                                </div>
                                {group.matches.map((match, index) => (
                                    <MatchCard 
                                        key={match.id} 
                                        match={match} 
                                        index={index} 
                                        totalMatches={group.matches.length} 
                                    />
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card className="w-full border-red-200">
                    <CardContent className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-600" />
                            <p className="text-red-600 font-medium mb-2">No matches found</p>
                            <p className="text-gray-600 mb-4">This league has no matches available</p>
                            <Button onClick={() => router.back()} variant="outline" size="sm">
                                Go Back
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default LeagueAccordions;
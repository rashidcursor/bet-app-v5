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

    const matchGroups = useMemo(() => {
        const groups = {};
        (matches || []).forEach((match) => {

            let groupKey = 'Today';
            if (match.day) {
                groupKey = match.day;
            } else if (match.starting_at) {
                // Format date as e.g. '2025-06-30'
                groupKey = match.starting_at.split(' ')[0];
            }
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    id: groupKey.toLowerCase().replace(/\s+/g, '-'),
                    label: `${groupKey}`,
                    matches: []
                };
            }
            groups[groupKey].matches.push(match);
        });
        return Object.values(groups);
    }, [matches]);

    // Move MatchCard inside LeagueAccordions to access createBetHandler
    const MatchCard = ({ match, index, totalMatches }) => {
        const team1 = match.participants && match.participants[0] ? match.participants[0].name : '';
        const team2 = match.participants && match.participants[1] ? match.participants[1].name : '';
        const odds1 = match.odds && match.odds.home ? match.odds.home.value : null;
        const oddsX = match.odds && match.odds.draw ? match.odds.draw.value : null;
        const odds2 = match.odds && match.odds.away ? match.odds.away.value : null;
        const matchTime = match.starting_at ? match.starting_at.split(' ')[1]?.slice(0, 5) : '';

        // Check if odds are available
        const hasOdds = odds1 || oddsX || odds2;

        return (
            <div key={match.id}>
                <div className='flex justify-between mt-2'>
                    <div className="text-xs text-gray-600">{matchTime}</div>
                    <div className="text-xs text-gray-500"></div>
                </div>
                {hasOdds ? (
                    <Link href={`/matches/${match.id}`}>
                        <div className="cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-1 rounded">
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
                                    <div className="flex gap-1">
                                        {odds1 && (
                                            <Button
                                                size={"sm"}
                                                className="w-14 h-8 p-0 text-xs font-bold betting-button"
                                                onClick={createBetHandler(match, '1', odds1)}
                                            >
                                                {odds1}
                                            </Button>
                                        )}
                                        {oddsX && (
                                            <Button
                                                className="w-14 h-8 p-0 text-xs font-bold betting-button"
                                                size={"sm"}
                                                onClick={createBetHandler(match, 'X', oddsX)}
                                            >
                                                {oddsX}
                                            </Button>
                                        )}
                                        {odds2 && (
                                            <Button
                                                size={"sm"}
                                                className="w-14 h-8 p-0 text-xs font-bold betting-button"
                                                onClick={createBetHandler(match, '2', odds2)}
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
            {matches && matches.length > 0 ? (
                <Accordion type="multiple" className="space-y-2">
                    {matchGroups.map((group) => (
                        <AccordionItem
                            key={group.id}
                            value={group.id}
                            className="bg-white border border-gray-200 overflow-hidden duration-200"
                        >
                            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50/50 transition-colors duration-200 [&[data-state=open]]:bg-gray-50/80">
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-sm font-semibold text-gray-900">{group.label}</h4>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                            {group.matches.length} matches
                                        </span>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-0 py-0 bg-gray-50/30">
                                {/* Odds Header */}
                                <div className="flex items-center px-4 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0">
                                    <div className="flex-1 text-xs">{group.label.split(' ')[0]}</div>
                                    <div className="flex gap-1">
                                        <div className="w-14 text-center text-xs text-gray-600 font-medium">1</div>
                                        <div className="w-14 text-center text-xs text-gray-600 font-medium">X</div>
                                        <div className="w-14 text-center text-xs text-gray-600 font-medium">2</div>
                                    </div>
                                </div>
                                {/* Matches */}
                                <div className="p-4 py-0 flex-1 overflow-y-auto">
                                    {group.matches.map((match, index) => (
                                        <MatchCard key={match.id} match={match} index={index} totalMatches={group.matches.length} />
                                    ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Card className="w-full border-red-200">
                    <CardContent className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-600" />
                            <p className="text-red-600 font-medium mb-2">Failed to load match data</p>
                            <p className="text-gray-600 mb-4">Match data is not available</p>
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

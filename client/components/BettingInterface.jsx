'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchLeagues } from '@/lib/features/leagues/leaguesSlice';
import { fetchMatches, setSelectedLeague } from '@/lib/features/matches/matchesSlice';
import { fetchMarkets, setSelectedMatch, setActiveCategory } from '@/lib/features/markets/marketsSlice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trophy, Calendar, Users, Target, TrendingUp, Clock } from 'lucide-react';

const BettingInterface = () => {
    const dispatch = useDispatch();
    const [selectedLeagueLocal, setSelectedLeagueLocal] = useState(null);
    const [selectedMatchLocal, setSelectedMatchLocal] = useState(null);

    const {
        data: leagues,
        loading: leaguesLoading,
        error: leaguesError
    } = useSelector((state) => state.leagues);

    const {
        data: matchesData,
        loading: matchesLoading,
        selectedLeague
    } = useSelector((state) => state.matches);

    const {
        data: marketsData,
        loading: marketsLoading,
        selectedMatch,
        activeCategory
    } = useSelector((state) => state.markets);

    useEffect(() => {
        dispatch(fetchLeagues());
    }, [dispatch]);

    const handleLeagueSelect = (league) => {
        setSelectedLeagueLocal(league);
        setSelectedMatchLocal(null);
        dispatch(setSelectedLeague(league.id));
        dispatch(fetchMatches(league.id));
    };

    const handleMatchSelect = (match) => {
        setSelectedMatchLocal(match);
        dispatch(setSelectedMatch(match.id));
        dispatch(fetchMarkets(match.id));
    };

    const handleCategoryChange = (category) => {
        dispatch(setActiveCategory(category));
    };

    const currentMatches = selectedLeagueLocal ? matchesData[selectedLeagueLocal.id] || [] : [];
    const currentMarkets = selectedMatchLocal ? marketsData[selectedMatchLocal.id] || [] : [];

    // Mock market categories with sample data
    const marketCategories = {
        goals: [
            { name: "Total Goals Over/Under", odds: [{ label: "Over 2.5", value: "1.85" }, { label: "Under 2.5", value: "1.95" }] },
            { name: "Both Teams to Score", odds: [{ label: "Yes", value: "1.70" }, { label: "No", value: "2.10" }] },
            { name: "First Goal", odds: [{ label: "Home", value: "2.20" }, { label: "Away", value: "3.50" }] }
        ],
        players: [
            { name: "Player Shots on Target", odds: [{ label: "Over 1.5", value: "1.90" }, { label: "Under 1.5", value: "1.85" }] },
            { name: "Player to Score", odds: [{ label: "Anytime", value: "3.25" }, { label: "First", value: "7.50" }] },
            { name: "Player Cards", odds: [{ label: "Yellow Card", value: "4.50" }, { label: "No Card", value: "1.20" }] }
        ],
        corners: [
            { name: "Total Corners", odds: [{ label: "Over 9.5", value: "1.75" }, { label: "Under 9.5", value: "2.05" }] },
            { name: "First Corner", odds: [{ label: "Home", value: "1.80" }, { label: "Away", value: "2.00" }] }
        ],
        cards: [
            { name: "Total Cards", odds: [{ label: "Over 3.5", value: "1.95" }, { label: "Under 3.5", value: "1.80" }] },
            { name: "First Card", odds: [{ label: "Home", value: "1.90" }, { label: "Away", value: "1.90" }] }
        ]
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="flex">
                {/* Sidebar - Leagues */}
                <div className="w-80 bg-white border-r border-gray-200 shadow-sm">
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <Trophy className="h-6 w-6 text-blue-600" />
                            <h2 className="text-xl font-bold text-gray-900">Leagues</h2>
                        </div>
                    </div>

                    <ScrollArea className="h-[calc(100vh-88px)]">
                        <div className="p-4 space-y-2">
                            {leaguesLoading && (
                                <div className="space-y-2">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                                    ))}
                                </div>
                            )}

                            {leagues.map((league) => (
                                <Button
                                    key={league.id}
                                    variant={selectedLeagueLocal?.id === league.id ? "default" : "ghost"}
                                    className={`w-full justify-start p-3 h-auto ${selectedLeagueLocal?.id === league.id
                                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                                        : "hover:bg-gray-100"
                                        }`}
                                    onClick={() => handleLeagueSelect(league)}
                                >
                                    <div className="flex items-center gap-3">
                                        {league.image_path && (
                                            <img
                                                src={league.image_path}
                                                alt={league.name}
                                                className="w-8 h-8 rounded"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                        )}
                                        <div className="text-left">
                                            <div className="font-medium">{league.name}</div>
                                            <div className={`text-xs ${selectedLeagueLocal?.id === league.id ? "text-blue-100" : "text-gray-500"
                                                }`}>
                                                {league.country?.name || league.short_code}
                                            </div>
                                        </div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* Main Content */}
                <div className="flex-1">
                    {!selectedLeagueLocal ? (
                        <div className="flex items-center justify-center h-screen">
                            <div className="text-center">
                                <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                    Select a League
                                </h3>
                                <p className="text-gray-500">
                                    Choose a league from the sidebar to view matches
                                </p>
                            </div>
                        </div>
                    ) : !selectedMatchLocal ? (
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                {selectedLeagueLocal.image_path && (
                                    <img
                                        src={selectedLeagueLocal.image_path}
                                        alt={selectedLeagueLocal.name}
                                        className="w-12 h-12 rounded"
                                        onError={(e) => e.target.style.display = 'none'}
                                    />
                                )}
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900">
                                        {selectedLeagueLocal.name}
                                    </h1>
                                    <p className="text-gray-500">
                                        {selectedLeagueLocal.country?.name || selectedLeagueLocal.short_code}
                                    </p>
                                </div>
                            </div>

                            {matchesLoading ? (
                                <div className="grid gap-4">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
                                    ))}
                                </div>
                            ) : currentMatches.length === 0 ? (
                                <div className="text-center py-12">
                                    <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                        No Matches Available
                                    </h3>
                                    <p className="text-gray-500">
                                        There are no matches available for this league at the moment.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {currentMatches.map((match) => (
                                        <Card
                                            key={match.id}
                                            className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-transparent hover:border-l-blue-500"
                                            onClick={() => handleMatchSelect(match)}
                                        >
                                            <CardContent className="p-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <Users className="h-4 w-4 text-gray-400" />
                                                                <span className="font-semibold text-lg">
                                                                    {match.name}
                                                                </span>
                                                            </div>
                                                            {match.state_id === 1 && (
                                                                <Badge variant="default" className="bg-green-100 text-green-800">
                                                                    Upcoming
                                                                </Badge>
                                                            )}
                                                            {match.state_id === 2 && (
                                                                <Badge variant="default" className="bg-red-100 text-red-800">
                                                                    Live
                                                                </Badge>
                                                            )}
                                                            {match.state_id === 5 && (
                                                                <Badge variant="outline">
                                                                    Finished
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="h-4 w-4" />
                                                                {new Date(match.starting_at).toLocaleString()}
                                                            </div>
                                                            {match.result_info && (
                                                                <div>{match.result_info}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <Button variant="outline" size="sm">
                                                            View Markets
                                                        </Button>
                                                        {match.has_odds && (
                                                            <div className="text-xs text-green-600 mt-1">
                                                                Odds Available
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900">
                                        {selectedMatchLocal.name}
                                    </h1>
                                    <p className="text-gray-500">
                                        {new Date(selectedMatchLocal.starting_at).toLocaleString()}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedMatchLocal(null)}
                                >
                                    Back to Matches
                                </Button>
                            </div>

                            <Tabs value={activeCategory} onValueChange={handleCategoryChange}>
                                <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="goals" className="flex items-center gap-2">
                                        <Target className="h-4 w-4" />
                                        Goals
                                    </TabsTrigger>
                                    <TabsTrigger value="players" className="flex items-center gap-2">
                                        <Users className="h-4 w-4" />
                                        Players
                                    </TabsTrigger>
                                    <TabsTrigger value="corners" className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4" />
                                        Corners
                                    </TabsTrigger>
                                    <TabsTrigger value="cards" className="flex items-center gap-2">
                                        <Badge className="h-4 w-4" />
                                        Cards
                                    </TabsTrigger>
                                </TabsList>

                                {Object.entries(marketCategories).map(([category, markets]) => (
                                    <TabsContent key={category} value={category} className="mt-6">
                                        <div className="grid gap-4">
                                            {markets.map((market, index) => (
                                                <Card key={index}>
                                                    <CardHeader className="pb-4">
                                                        <CardTitle className="text-lg">{market.name}</CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {market.odds.map((odd, oddIndex) => (
                                                                <Button
                                                                    key={oddIndex}
                                                                    variant="outline"
                                                                    className="h-auto p-4 flex flex-col items-center hover:bg-blue-50 hover:border-blue-300"
                                                                >
                                                                    <span className="font-medium">{odd.label}</span>
                                                                    <span className="text-lg font-bold text-blue-600">
                                                                        {odd.value}
                                                                    </span>
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </TabsContent>
                                ))}
                            </Tabs>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BettingInterface;

"use client"
import { useRef, useState, useEffect } from "react"
import { ChevronLeft, ChevronDown, Clock } from "lucide-react"
import MatchDropdown from "./MatchDropdown"
import LiveMatchClock from "./LiveMatchClock"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar"
import { Button } from "@/components/ui/button"
import { formatToLocalTime } from '@/lib/utils';
import Link from "next/link";
// ✅ REMOVED: import apiClient from '@/config/axios';
// ✅ Now using Next.js API route instead of backend

const isMatchLive = (match) => {
    if (!match || !match.start) return false;
    const now = new Date();
    let matchTime;
    if (match.start.includes('T')) {
        matchTime = new Date(match.start.endsWith('Z') ? match.start : match.start + 'Z');
    } else {
        matchTime = new Date(match.start.replace(' ', 'T') + 'Z');
    }
    const matchEnd = new Date(matchTime.getTime() + 120 * 60 * 1000);
    return matchTime <= now && now < matchEnd;
};

// Live Timer Component - Now using LiveMatchClock
const LiveTimer = ({ matchId, isLive, onScoreUpdate, onLiveDataUpdate }) => {
    return (
        <LiveMatchClock 
            matchId={matchId} 
            isLive={isLive} 
            onScoreUpdate={onScoreUpdate}
            onLiveDataUpdate={onLiveDataUpdate}
        />
    );
};

// Utility function to parse match name and extract home and away teams
const parseTeamsFromName = (matchName) => {
    if (!matchName) {
        return { homeTeam: null, awayTeam: null };
    }

    // Split by "vs" and trim whitespace
    const parts = matchName.split('vs').map(part => part.trim());
    
    if (parts.length === 2) {
        return {
            homeTeam: parts[0],
            awayTeam: parts[1]
        };
    }

    // Fallback if no "vs" found
    return { homeTeam: null, awayTeam: null };
};

const MatchHeader = ({ matchData, onScoreUpdate }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [currentScore, setCurrentScore] = useState('0-0')
    const [fetchedLiveData, setFetchedLiveData] = useState(null)
    const [liveMatchClockData, setLiveMatchClockData] = useState(null)
    const triggetRef = useRef(null)
    const router = useRouter()

    const toggleDropdown = () => {
        setIsDropdownOpen(!isDropdownOpen)
    }

    // ✅ FIX: Fetch live match data from Next.js API route (same as homepage)
    const fetchLiveData = async () => {
        if (!matchData?.id || !isLive) return;
        
        try {
            console.log('🔍 Fetching live data for match:', matchData.id);
            // ✅ Use Next.js API route instead of backend
            const response = await fetch(`/api/unibet/live-matches?ncid=${Date.now()}`);
            const data = await response.json();
            
            if (data.success && data.matches) {
                // Find this specific match in the matches array
                const match = data.matches.find(m => String(m.id) === String(matchData.id));
                
                if (match && match.kambiLiveData) {
                    const kambiData = match.kambiLiveData;
            
                    // Transform Kambi data to match expected format
                    const transformedLiveData = {
                        score: kambiData.score ? {
                            home: kambiData.score.home || 0,
                            away: kambiData.score.away || 0
                        } : null,
                        matchClock: {
                            minute: kambiData.matchClock?.minute || 0,
                            second: kambiData.matchClock?.second || 0,
                            period: kambiData.matchClock?.period || '1st half',
                            running: kambiData.matchClock?.running || false
                        },
                        statistics: kambiData.statistics || null
                    };
                    
                    setFetchedLiveData(transformedLiveData);
                    console.log('✅ Live data fetched from Next.js API:', transformedLiveData);
                } else {
                    console.log('⚠️ Match not found in live matches or no Kambi data');
                }
            } else {
                console.log('⚠️ No live matches in response');
            }
        } catch (error) {
            console.error('❌ Error fetching live data:', error);
        }
    }

    if (!matchData) {
        return null;
    }

    // Handle both old and new API data formats
    const isLive = isMatchLive(matchData);
    
    // Get team names - try participants first (new API), then parse from name
    let homeTeam, awayTeam;
    if (matchData.participants && matchData.participants.length >= 2) {
        // New API format with participants
        const homeParticipant = matchData.participants.find(p => p.position === 'home');
        const awayParticipant = matchData.participants.find(p => p.position === 'away');
        homeTeam = homeParticipant?.name || 'Home';
        awayTeam = awayParticipant?.name || 'Away';
    } else {
        // Old API format - parse from name
        const { homeTeam: parsedHome, awayTeam: parsedAway } = parseTeamsFromName(matchData.name);
        homeTeam = parsedHome || 'Home';
        awayTeam = parsedAway || 'Away';
    }

    // Get league name and country
    const leagueName = matchData.league?.name || matchData.league || 'Unknown League';
    const country = matchData?.parentName || '';
    const displayLeagueName = country ? `${leagueName} (${country})` : leagueName;
    
    // Get league ID for navigation
    const leagueId = matchData?.groupId || matchData?.group || matchData?.league?.id || matchData?.leagueId;
    
    // Debug logging
    console.log('🔍 MatchHeader Debug:', {
        matchData,
        leagueName,
        country,
        parentName: matchData?.parentName,
        displayLeagueName,
        leagueId,
        'matchData.groupId': matchData?.groupId,
        'matchData.group': matchData?.group,
        'matchData.league?.id': matchData?.league?.id,
        'matchData.leagueId': matchData?.leagueId
    });

    // Log the complete matchData API response for live score and time
   
    // Get match time/score
    const matchTime = matchData.start ? formatToLocalTime(matchData.start) : 'TBD';
    
    // Get live data if available - prioritize liveMatchClockData for real-time updates
    const liveData = liveMatchClockData || fetchedLiveData || matchData.liveData;
    const score = currentScore;
    const period = liveData?.period || '1st Half';
    const minute = liveData?.minute || '0';

    // Handle score updates from live data
    const handleScoreUpdate = (scoreData) => {
        console.log('📊 handleScoreUpdate called with:', scoreData);
        const homeScore = scoreData?.home ?? '0';
        const awayScore = scoreData?.away ?? '0';
        const newScore = `${homeScore} - ${awayScore}`;
        console.log('📊 Setting new score:', newScore);
        setCurrentScore(newScore);
        if (onScoreUpdate) {
            onScoreUpdate(scoreData);
        }
    };

    // Handle live data updates from LiveMatchClock
    const handleLiveDataUpdate = (liveData) => {
        // console.log('📊 handleLiveDataUpdate called with:', liveData);
        setLiveMatchClockData(liveData);
    };

    // Initialize score from matchData and update when fetchedLiveData changes
    useEffect(() => {
        
       
        
        // Prioritize fetchedLiveData for real-time updates
        const scoreData = fetchedLiveData?.score || matchData.liveData?.score;
        
        if (scoreData) {
            const homeScore = scoreData?.home ?? '0';
            const awayScore = scoreData?.away ?? '0';
            const newScore = `${homeScore} - ${awayScore}`;
            console.log('📊 Score set from:', fetchedLiveData ? 'fetchedLiveData' : 'matchData.liveData');
            console.log('📊 Score set to:', newScore);
            setCurrentScore(newScore);
        } else {
            console.log('📊 No live data score, setting default: 0 - 0');
            setCurrentScore('0 - 0');
        }
    }, [matchData.liveData?.score, fetchedLiveData?.score]);

    // Debug current score state
    useEffect(() => {
        console.log('📊 Current score state changed:', currentScore);
    }, [currentScore]);

    // Fetch live data when component mounts or match changes
    useEffect(() => {
        if (isLive && matchData?.id) {
            fetchLiveData();
            // Set up interval to refresh live data every 200ms (0.2 seconds) for real-time updates
            const interval = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return; // pause when tab hidden
                fetchLiveData();
            }, 200);
            return () => clearInterval(interval);
        }
    }, [matchData?.id, isLive]);

    return (
        <div className="bg-white shadow-sm border p-4 mb-4">
            {/* Back button */}
            <div className="flex items-center mb-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.back()}
                    className="flex items-center text-gray-600 hover:text-gray-800"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                </Button>
            </div>

            {/* Match info */}
            <div className="text-center mb-4">
                <div className="text-sm font-medium text-gray-600 mb-2">
                    <Link 
                        href={`/leagues/${leagueId || 'unknown'}`}
                        className="hover:text-base hover:underline cursor-pointer transition-colors duration-200"
                    >
                        {displayLeagueName}
                    </Link>
                </div>
                <div className="flex items-center justify-center text-xs text-gray-500 mb-2">
                    {isLive ? (
                        <div className="flex items-center text-red-600 animate-pulse">
                            <div className="w-2 h-2 bg-red-600 rounded-full mr-2 animate-pulse"></div>
                            LIVE
                        </div>
                    ) : (
                        <div className="flex items-center text-gray-400">
                            <Clock className="h-3 w-3 mr-1" />
                            {matchTime}
                        </div>
                    )}
                </div>
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between">
                {/* Home team */}
                <div className="flex-1 text-center">
                    <div className="text-xl font-bold text-gray-800">
                        {homeTeam}
                    </div>
                </div>

                {/* Score/Time */}
                <div className="flex-1 text-center">
                    {isLive ? (
                        <div className="space-y-1">
                            <div className="text-4xl font-bold text-gray-800">
                                {score}
                            </div>
                            <LiveTimer matchId={matchData.id} isLive={isLive} onScoreUpdate={handleScoreUpdate} onLiveDataUpdate={handleLiveDataUpdate} />
                            
                            {/* Card details - only for live matches with statistics */}
                            {console.log('🔍 MatchHeader - Complete match data:', matchData)}
                            {console.log('🔍 MatchHeader - Live data:', liveData)}
                            {console.log('🔍 MatchHeader - Fetched live data:', fetchedLiveData)}
                            {console.log('🔍 MatchHeader - Checking card data:', {
                                isLive,
                                hasLiveData: !!liveData,
                                hasFetchedLiveData: !!fetchedLiveData,
                                hasLiveMatchClockData: !!liveMatchClockData,
                                hasStatistics: !!(fetchedLiveData?.statistics || liveData?.statistics),
                                hasFootball: !!(fetchedLiveData?.statistics?.football || liveData?.statistics?.football),
                                liveMatchClockData: liveMatchClockData,
                                fetchedLiveData: fetchedLiveData,
                                liveData: liveData
                            })}
                            {isLive && (
                                <div className="flex flex-col items-center gap-1 mt-2 text-sm">
                                    {/* Yellow cards - prioritize liveMatchClockData */}
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-yellow-500 border-0"></div>
                                        <span className="font-semibold text-gray-800">
                                            {(liveMatchClockData?.statistics?.football?.home?.yellowCards || 
                                              fetchedLiveData?.statistics?.football?.home?.yellowCards || 
                                              liveData?.statistics?.football?.home?.yellowCards || 0)} - {(liveMatchClockData?.statistics?.football?.away?.yellowCards || 
                                              fetchedLiveData?.statistics?.football?.away?.yellowCards || 
                                              liveData?.statistics?.football?.away?.yellowCards || 0)}
                                        </span>
                                    </div>
                                    {/* Red cards - prioritize liveMatchClockData */}
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-red-500 border-0"></div>
                                        <span className="font-semibold text-gray-800">
                                            {(liveMatchClockData?.statistics?.football?.home?.redCards || 
                                              fetchedLiveData?.statistics?.football?.home?.redCards || 
                                              liveData?.statistics?.football?.home?.redCards || 0)} - {(liveMatchClockData?.statistics?.football?.away?.redCards || 
                                              fetchedLiveData?.statistics?.football?.away?.redCards || 
                                              liveData?.statistics?.football?.away?.redCards || 0)}
                                        </span>
                                    </div>
                                    {/* Corners - prioritize liveMatchClockData */}
                                    <div className="flex items-center gap-1">
                                        <div className="text-red-600">🚩</div>
                                        <span className="font-semibold text-gray-800">
                                            {(liveMatchClockData?.statistics?.football?.home?.corners || 
                                              fetchedLiveData?.statistics?.football?.home?.corners || 
                                              liveData?.statistics?.football?.home?.corners || 0)} - {(liveMatchClockData?.statistics?.football?.away?.corners || 
                                              fetchedLiveData?.statistics?.football?.away?.corners || 
                                              liveData?.statistics?.football?.away?.corners || 0)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-4xl font-bold text-gray-800">
                            {score}
                        </div>
                    )}
                </div>

                {/* Away team */}
                <div className="flex-1 text-center">
                    <div className="text-xl font-bold text-gray-800">
                        {awayTeam}
                    </div>
                </div>
            </div>

            {/* Match dropdown - COMMENTED OUT FOR NOW */}
            {/*
            <div className="mt-4 flex justify-center">
                <div className="relative">
                    <Button
                        ref={triggetRef}
                        variant="outline"
                        size="sm"
                        onClick={toggleDropdown}
                        className="flex items-center text-gray-600 hover:text-gray-800"
                    >
                        Match Info
                        <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                    
                    {isDropdownOpen && (
                        <MatchDropdown
                            matchData={matchData}
                            isOpen={isDropdownOpen}
                            onClose={() => setIsDropdownOpen(false)}
                            triggerRef={triggetRef}
                            currentLeagueId={matchData?.groupId || matchData?.group}
                        />
                    )}
                </div>
            </div>
            */}
        </div>
    );
};

export default MatchHeader;
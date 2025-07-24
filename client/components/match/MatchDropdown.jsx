"use client"
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { X, ChevronLeft } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchPopularLeagues, fetchMatchesByLeague, selectPopularLeagues, selectMatchesByLeague, selectMatchesLoading, selectMatchesError } from '@/lib/features/leagues/leaguesSlice';
import { formatToLocalTime } from '@/lib/utils';

// Jersey Image Component
const JerseyImage = ({ src, alt, className = "w-12 h-12" }) => {
    return (
        <div className={`${className} flex-shrink-0`}>
            <img
                src={src}
                alt={alt}
                className="w-full h-full object-contain"
                onError={(e) => {
                    // Fallback to a simple colored circle if image fails
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                }}
            />
            <div
                className="w-full h-full bg-gray-500 rounded-full hidden"
                style={{ display: 'none' }}
            />
        </div>
    );
};

const MatchDropdown = ({ isOpen, onClose, currentMatchId, triggerRef, currentLeagueId }) => {
    const dropdownRef = useRef(null);
    const [showLeagues, setShowLeagues] = useState(false);
    const [selectedLeagueId, setSelectedLeagueId] = useState(currentLeagueId || null);
    const dispatch = useDispatch();
    const router = useRouter();

    // Redux state
    const leagues = useSelector(selectPopularLeagues);
    const matchesObj = useSelector(state => selectMatchesByLeague(state, selectedLeagueId));
    const matches = matchesObj.matches || [];
    const matchesLoading = useSelector(selectMatchesLoading);
    const matchesError = useSelector(selectMatchesError);

    // Fetch leagues on open
    useEffect(() => {
        console.log("THIS IS FROM SLIP", matches);
    }, [matches])

    // Fetch matches for selected league
    useEffect(() => {
        if (selectedLeagueId && isOpen) {
            dispatch(fetchMatchesByLeague(selectedLeagueId));
        }
    }, [selectedLeagueId, isOpen, dispatch]);

    const handleClose = useCallback(() => {
        setSelectedLeagueId(currentLeagueId || null);
        setShowLeagues(false);
        onClose();
    }, [onClose, currentLeagueId]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                onClose();
            }
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('click', handleClick, true);
        document.addEventListener('mousedown', handleClick, true);
        document.addEventListener('touchstart', handleClick, true);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('mousedown', handleClick, true);
            document.removeEventListener('touchstart', handleClick, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Show leagues list (when back button is clicked)
    if (showLeagues) {
        return (
            <div className="absolute top-[90%] left-0 z-50  w-full max-w-xs sm:max-w-md md:max-w-md lg:max-w-lg xl:max-w-xl" ref={dropdownRef}>
                <Card className="border rounded-none border-gray-300 shadow-xl bg-gray-800 w-full max-h-96 overflow-y-auto transform transition-all duration-300 ease-in-out dropdown-scrollbar">
                    <CardContent className="p-0">
                        <div className="bg-emerald-600 p-4 border-b border-gray-600 flex items-center justify-between">
                            <h3 className=" font-semibold text-white">Leagues</h3>
                            <button
                                onClick={handleClose}
                                className="text-white cursor-pointer hover:text-gray-200 transition-colors duration-200 p-1 hover:bg-emerald-700 rounded"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="animate-fadeIn">
                            {leagues.map((league) => (
                                <button
                                    key={league.id}
                                    onClick={() => { setSelectedLeagueId(league.id); setShowLeagues(false); }}
                                    className={`w-full flex items-center text-left p-3 text-white hover:bg-gray-700 transition-colors duration-200 border-b border-gray-600 last:border-b-0 cursor-pointer text-sm ${selectedLeagueId === league.id ? 'bg-gray-700' : ''}`}
                                >
                                    {league.image_path && (
                                        <img
                                            src={league.image_path}
                                            alt={league.name}
                                            className="w-8 h-8 rounded-full object-contain mr-3 bg-white"
                                            onError={e => { e.target.style.display = 'none'; }}
                                        />
                                    )}
                                    <span>{league.name}</span>
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Show matches for selected league
    return (
        <div className="absolute top-[90%] left-0 z-50  w-full max-w-xs sm:max-w-md md:max-w-md lg:max-w-lg xl:max-w-xl " ref={dropdownRef}>
            <Card className="border border-gray-300 shadow-xl bg-gray-800 w-full max-h-96 overflow-y-auto transform transition-all duration-300 ease-in-out dropdown-scrollbar rounded-none">
                <CardContent className="p-0">
                    <div className="bg-emerald-600 p-4 border-b border-gray-600 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setShowLeagues(true)}
                                className="text-white cursor-pointer hover:text-gray-200 transition-colors duration-200 p-1 hover:bg-emerald-700 rounded"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <h3 className=" font-semibold text-white">
                                {leagues.find(l => l.id === selectedLeagueId)?.name || 'Matches'}
                            </h3>
                        </div>
                        <button
                            onClick={handleClose}
                            className="text-white cursor-pointer hover:text-gray-200 transition-colors duration-200 p-1 hover:bg-emerald-700 rounded"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="bg-gray-700 p-3 text-center">
                        <span className="text-white text-sm font-medium">Matches</span>
                    </div>
                    <div className="divide-y divide-gray-600 animate-fadeIn">
                        {matchesLoading && (
                            <div className="text-center text-white py-8">Loading matches...</div>
                        )}
                        {matchesError && (
                            <div className="text-center text-red-400 py-8">{matchesError}</div>
                        )}
                        {!matchesLoading && !matchesError && matches?.length === 0 && (
                            <div className="text-center text-gray-400 py-8">No matches found for this league.</div>
                        )}
                        {matches?.slice(0, 20).map((match) => (
                            <Link
                                key={match.id}
                                href={`/matches/${match.id}`}
                                onClick={onClose}
                                className="block hover:bg-gray-700 cursor-pointer transition-colors duration-200"
                            >
                                <div className="p-4 bg-gray-800">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col items-center flex-1">
                                            <JerseyImage
                                                src={match.participants?.[0]?.image_path}
                                                alt={match.participants?.[0]?.name}
                                                className="w-10 h-10 mb-2 sm:w-12 sm:h-12"
                                            />
                                            <span className="text-white text-xs font-medium text-center leading-tight">
                                                {match.participants?.[0]?.name}
                                            </span>
                                        </div>
                                        <div className="text-center flex-shrink-0 px-2 sm:px-4">
                                            <div className="text-white font-bold text-xs sm:text-sm">
                                                {match.starting_at ? formatToLocalTime(match.starting_at, { format: 'timeOnly' }) : ''}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center flex-1">
                                            <JerseyImage
                                                src={match.participants?.[1]?.image_path}
                                                alt={match.participants?.[1]?.name}
                                                className="w-10 h-10 mb-2 sm:w-12 sm:h-12"
                                            />
                                            <span className="text-white text-xs font-medium text-center leading-tight">
                                                {match.participants?.[1]?.name}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default MatchDropdown;

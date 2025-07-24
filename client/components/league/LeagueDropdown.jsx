"use client"
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { X, ChevronLeft } from 'lucide-react';
import LeagueIcon from '@/components/ui/LeagueIcon';

const LeagueDropdown = ({ leagues, isOpen, onClose, currentLeagueId, triggerRef }) => {
    const dropdownRef = useRef(null);
    const router = useRouter();

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;

        const handleClick = (event) => {
            // Check if the click is outside the dropdown
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
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Find current league
    const currentLeague = leagues.find(league => league.id === parseInt(currentLeagueId));

    return (
        <div className="absolute top-[90%] left-0 z-50  w-full max-w-xs sm:max-w-md md:max-w-md lg:max-w-lg xl:max-w-xl" ref={dropdownRef}>
            <Card className="border rounded-none border-gray-300 shadow-xl bg-gray-800 w-full max-h-96 overflow-y-auto transform transition-all duration-300 ease-in-out dropdown-scrollbar">
                <CardContent className="p-0">
                    {/* Header with close button */}
                    <div className="bg-emerald-600 p-4 border-b border-gray-600 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <h3 className=" font-semibold text-white ">All Leagues</h3>
                        </div>
                        <button
                            onClick={handleClose}
                            className="text-white cursor-pointer hover:text-gray-200 transition-colors duration-200 p-1 hover:bg-emerald-700 rounded"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Leagues List */}
                    <div className="divide-y divide-gray-600 animate-fadeIn">
                        {leagues && leagues.length > 0 ? leagues.map((league) => (
                            <Link
                                key={league.id}
                                href={`/leagues/${league.id}`}
                                onClick={onClose}
                                className={`block hover:bg-gray-700 cursor-pointer transition-colors duration-200 ${league.id === parseInt(currentLeagueId) ? 'bg-gray-700' : ''
                                    }`}
                            >
                                <div className="p-4 bg-gray-800">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            {league.image_path ? (
                                                <img 
                                                    src={league.image_path} 
                                                    alt={league.name} 
                                                    className="h-6 w-6 object-contain"
                                                />
                                            ) : (
                                                <LeagueIcon league={{
                                                    name: league.name,
                                                    imageUrl: league.image_path,
                                                    icon: "⚽"
                                                }} />
                                            )}
                                            <div>
                                                <div className="text-white font-medium text-sm">
                                                    {league.name}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )) : (
                            <div className="p-4 bg-gray-800 text-white text-center">
                                No leagues available
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default LeagueDropdown;

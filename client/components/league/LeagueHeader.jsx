"use client"
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronDown, Clock } from "lucide-react";
import LeagueDropdown from "./LeagueDropdown";
import leaguesData from "@/data/dummayLeagues";
import { useRouter } from 'next/navigation';
import MatchCard from '../home/MatchCard';
import MatchDropdown from '../match/MatchDropdown';

const LeagueHeader = ({ league }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const triggerRef = useRef(null);

    const router = useRouter();
    const toggleDropdown = () => {
        
        setIsDropdownOpen(!isDropdownOpen);
    };

    const closeDropdown = () => {
        setIsDropdownOpen(false);
    };

   

    // useEffect(() => {
    //     console.log("League Header Rendered", league);

    // }, [])

    return (
        <div className="mb-4 bg-white p-3 w-screen">
            {/* Breadcrumb */}
            <button type="button" className="flex cursor-pointer items-center text-xs text-slate-500 hover:text-slate-600 transition-all mb-3" onClick={() => router.back()}
            >
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-1 truncate">Football | {league?.name} </span>
            </button>

            {/* League Header */}
            <div className="relative">
                <div className="p-4 pl-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div
                            className="flex items-center cursor-pointer hover:bg-gray-50 py-2 px-3 rounded-2xl transition-colors"
                            onClick={e => { e.stopPropagation(); toggleDropdown(); }}
                            ref={triggerRef}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleDropdown(); } }}
                        >
                            <div className="flex items-center space-x-3">
                                {league?.image_path && (
                                    <img src={league.image_path} alt={league?.name} className="text-2xl h-7 w-7" />
                                )}
                                <span className="text-lg font-medium">{league?.name}</span>
                            </div>
                            <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>

                    </div>
                </div>

                <MatchDropdown
                    isOpen={isDropdownOpen}
                    onClose={closeDropdown}
                    triggerRef={triggerRef}
                    currentLeagueId={league?.id}
                />
            </div>
        </div >
    );
};

export default LeagueHeader;

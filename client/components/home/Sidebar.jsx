'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Pin, Users, Settings, DollarSign, X, Search, Globe, TrendingUp } from 'lucide-react';
import { useCustomSidebar } from '../../contexts/SidebarContext.js';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '@/lib/features/auth/authSlice';
import {
    fetchPopularLeagues,
    selectPopularLeagues,
    selectPopularLeaguesLoading
} from '@/lib/features/leagues/leaguesSlice';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';



const Sidebar = () => {
    const context = useCustomSidebar();
    const { isCollapsed, setIsCollapsed, isPinned, setIsPinned, isMobile } = context || {};
    const user = useSelector(selectUser);
    const pathname = usePathname();
    const dispatch = useDispatch();
    const sidebarRef = useRef(null);
    const hoverTimeoutRef = useRef(null);

    // Get popular leagues from Redux store
    const popularLeagues = useSelector(selectPopularLeagues);
    const popularLeaguesLoading = useSelector(selectPopularLeaguesLoading);

    // Fetch popular leagues data on component mount (only for regular users)
    useEffect(() => {
        if (user?.role !== 'admin') {
            dispatch(fetchPopularLeagues());
        }
    }, [dispatch, user?.role]);

    // Add state for search and expanded countries
    const [search, setSearch] = useState('');
    const [expandedCountries, setExpandedCountries] = useState({}); // All collapsed by default

    // Group leagues by country and filter by search
    const groupedLeagues = useMemo(() => {
        if (!popularLeagues || !Array.isArray(popularLeagues)) return {};
        const filtered = search.trim().length > 0
            ? popularLeagues.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
            : popularLeagues;
        const groups = {};
        filtered.forEach(league => {
            // Normalize country id and name for 'Other' group
            let countryId = league.country?.id;
            let countryName = league.country?.official_name || league.country?.name;
            if (!countryId || countryId === 'other' || countryName === undefined || countryName === null || countryName === '') {
                countryId = 'other';
                countryName = 'Other';
            }
            if (!groups[countryId]) {
                groups[countryId] = {
                    name: countryName,
                    id: countryId,
                    flag: league.country?.image_path,
                    leagues: []
                };
            }
            groups[countryId].leagues.push(league);
        });
        return groups;
    }, [popularLeagues, search]);

    // Get sorted country keys (alphabetical by country name)
    const sortedCountryKeys = useMemo(() => {
        return Object.keys(groupedLeagues).sort((a, b) => {
            const nameA = groupedLeagues[a].name || '';
            const nameB = groupedLeagues[b].name || '';
            return nameA.localeCompare(nameB);
        });
    }, [groupedLeagues]);



    const adminMenuItems = [
        {
            title: 'User Management',
            href: '/admin',
            icon: Users
        },
        {
            title: 'Bet Management',
            href: '/admin/bet-management',
            icon: ChevronRight
        },
        {
            title: 'Finance',
            href: '/admin/finance',
            icon: DollarSign
        },
        {
            title: 'Settings',
            href: '/admin/settings',
            icon: Settings
        }
    ];

    // Handle mouse enter - disable on mobile
    const handleMouseEnter = () => {
        if (!isPinned && !isMobile) {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
            setIsCollapsed(false);
        }
    };

    // Handle mouse leave - disable on mobile
    const handleMouseLeave = () => {
        if (!isPinned && !isMobile) {
            hoverTimeoutRef.current = setTimeout(() => {
                setIsCollapsed(true);
            }, 50);
        }
    };

    // Toggle pin state
    const togglePin = () => {
        if (typeof setIsPinned !== 'function') {
            console.error('setIsPinned is not a function!', { setIsPinned });
            return;
        }

        try {
            setIsPinned(!isPinned);
            if (!isPinned) {
                setIsCollapsed(false);
            }
        } catch (error) {
            console.error('Error in togglePin:', error);
        }
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);

    const getFlatSearchedLeagues = useMemo(() => {
        if (!search.trim()) return null;
        if (!popularLeagues || !Array.isArray(popularLeagues)) return [];
        return popularLeagues.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));
    }, [search, popularLeagues]);

    const [activeTab, setActiveTab] = useState('by-country');

    const filteredLeagues = useMemo(() => {
        if (!popularLeagues || !Array.isArray(popularLeagues)) return [];
        if (activeTab === 'popular') {
            const popularOnly = popularLeagues.filter(league => league.isPopular === true);
            return popularOnly;
        }
        return popularLeagues;
    }, [popularLeagues, activeTab]);

    return (
        <div
            ref={sidebarRef}
            className={`${isMobile ? 'w-64' : (isCollapsed ? 'w-16' : 'w-64')
                } bg-gray-800 text-white h-full dropdown-scrollbar transition-all duration-300 flex-shrink-0 overflow-y-auto px-2`}
            onMouseEnter={!isMobile ? handleMouseEnter : undefined}
            onMouseLeave={!isMobile ? handleMouseLeave : undefined}
        >
            {/* Header with Pin Button */}
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                {(!isCollapsed || isMobile) && (
                    <div className="flex items-center text-sm">
                        <span className="mr-2"></span>
                        <span>Leagues</span>
                    </div>
                )}
                {!isMobile && (
                    <button
                        onClick={togglePin}
                        className={`p-1 hover:bg-gray-700 rounded transition-colors ${isPinned ? 'text-blue-400' : 'text-gray-400'
                            }`}
                        title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    >
                        <Pin
                            size={16}
                            className={`transition-transform ${isPinned ? 'rotate-45' : ''}`}
                        />
                    </button>
                )}
            </div>

            {(!isCollapsed || isMobile) && (
                <>
                    {user?.role === 'admin' ? (
                        // Admin Menu
                        <div className="p-4">
                            <h3 className="text-sm font-semibold mb-3">ADMIN PANEL</h3>
                            <div className="space-y-1">
                                {adminMenuItems.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center py-2 px-3 hover:bg-gray-700 rounded cursor-pointer",
                                                isActive ? "bg-gray-700" : ""
                                            )}
                                        >
                                            <item.icon className="h-5 w-5 mr-3" />
                                            <span className="text-sm">{item.title}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        // User Menu with Tabs
                        <div className="p-1">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-1">
                                <TabsList className="mb-1 w-full  text-xs py-0 h-6 !text-white  bg-transparent border-gray-500 border-1 ">
                                    <TabsTrigger
                                        value="by-country"
                                        className="flex-1 text-xs bg-transparent cursor-pointer text-white data-[state=active]:bg-base data-[state=active]:text-white"
                                    >
                                        <Globe className="mr-1 h-4 w-4" /> By Country
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="popular"
                                        className="flex-1 text-xs bg-transparent cursor-pointer text-white data-[state=active]:bg-base data-[state=active]:text-white"
                                    >
                                        <TrendingUp className="mr-1 h-4 w-4" /> Popular
                                    </TabsTrigger>
                                </TabsList>
                                <div className="mb-3 relative">
                                    <span className="absolute left-2 top-1.5 text-gray-400">
                                        <Search size={16} />
                                    </span>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Search leagues..."
                                        className="w-full  pl-8 pr-7 py-1 text-xs rounded bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm border border-gray-600"
                                        style={{ boxSizing: 'border-box' }}
                                    />
                                    {search && (
                                        <button
                                            className="absolute right-2 top-1.5 text-gray-400 hover:text-white focus:outline-none"
                                            onClick={() => setSearch('')}
                                            tabIndex={-1}
                                            aria-label="Clear search"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                                <TabsContent value="by-country">
                                    <div className="mb-2 text-xs text-gray-300">
                                        Total leagues in plan: <span className="font-bold text-white">{popularLeagues?.length || 0}</span>
                                    </div>
                                    {popularLeaguesLoading ? (
                                        <div className="space-y-2">
                                            {[...Array(6)].map((_, index) => (
                                                <div key={index} className="flex items-center py-2 px-3 rounded">
                                                    <div className="w-6 h-6 bg-gray-600 rounded mr-3 animate-pulse"></div>
                                                    <div className="h-4 bg-gray-600 rounded flex-1 animate-pulse"></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div>
                                            {getFlatSearchedLeagues && search.trim() ? (
                                                getFlatSearchedLeagues.length === 0 ? (
                                                    <div className="text-xs text-gray-400 px-4 py-2">No leagues found.</div>
                                                ) : (
                                                    getFlatSearchedLeagues.map(league => {
                                                        const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                        return (
                                                            <Link
                                                                key={league.id}
                                                                href={leagueHref}
                                                                className="flex items-center justify-between py-2 px-4 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 focus:border-blue-400 w-[95%] mx-auto mb-1"
                                                                title={league.name}
                                                            >
                                                                <div className="flex items-center min-w-0">
                                                                    {league.image_path ? (
                                                                        <img
                                                                            src={league.image_path}
                                                                            alt={league.name}
                                                                            className="w-5 h-5 object-contain mr-2"
                                                                            onError={e => { e.target.style.display = 'none'; }}
                                                                        />
                                                                    ) : league.icon ? (
                                                                        <span className="text-green-400 text-sm mr-2">{league.icon}</span>
                                                                    ) : null}
                                                                    <span className="text-xs truncate max-w-[120px]" title={league.name}>{league.name}</span>
                                                                </div>
                                                                <span className="text-xs text-gray-400 font-bold">{league.id}</span>
                                                            </Link>
                                                        );
                                                    })
                                                )
                                            ) : (
                                                sortedCountryKeys.map((countryId, idx) => {
                                                    const country = groupedLeagues[countryId];
                                                    const isExpanded = expandedCountries[countryId] ?? false;
                                                    return (
                                                        <div key={countryId} className="mb-2">
                                                            {idx > 0 && <div className="border-t border-gray-700 my-2" />}
                                                            <div
                                                                className="flex items-center justify-between py-1 px-2 bg-gray-700 rounded cursor-pointer select-none transition-colors hover:bg-gray-600 group"
                                                                onClick={() => setExpandedCountries(prev => ({ ...prev, [countryId]: !isExpanded }))}
                                                                tabIndex={0}
                                                                role="button"
                                                                aria-expanded={isExpanded}
                                                            >
                                                                <div className="flex items-center">
                                                                    {country.flag && (
                                                                        <img src={country.flag} alt={country.name} className="w-5 h-5 mr-2 object-contain rounded-full border border-gray-600" />
                                                                    )}
                                                                    <span className="font-semibold text-xs truncate max-w-[120px]" title={country.name}>
                                                                        {country.name}
                                                                    </span>
                                                                </div>
                                                                <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                                            </div>
                                                            {isExpanded && (
                                                                <div>
                                                                    {country.leagues.map(league => {
                                                                        const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                                        return (
                                                                            <Link
                                                                                key={league.id}
                                                                                href={leagueHref}
                                                                                className="flex items-center justify-between py-1 px-5 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 mt-1 focus:border-blue-400 w-[95%] mx-auto"
                                                                                title={league.name}
                                                                            >
                                                                                <div className="flex items-center min-w-0 py-0 ">
                                                                                    {league.image_path ? (
                                                                                        <img
                                                                                            src={league.image_path}
                                                                                            alt={league.name}
                                                                                            className="w-5 h-5 object-contain mr-2"
                                                                                            onError={e => { e.target.style.display = 'none'; }}
                                                                                        />
                                                                                    ) : league.icon ? (
                                                                                        <span className="text-green-400 text-sm mr-2">{league.icon}</span>
                                                                                    ) : null}
                                                                                    <span className="text-xs truncate max-w-[120px]" title={league.name}>{league.name}</span>
                                                                                </div>
                                                                            </Link>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="popular">
                                    <div className="mb-2 text-xs text-gray-300">
                                        Showing <span className="font-bold text-white">{filteredLeagues.length}</span> popular leagues
                                    </div>
                                    {popularLeaguesLoading ? (
                                        <div className="space-y-2">
                                            {[...Array(6)].map((_, index) => (
                                                <div key={index} className="flex items-center py-2 px-3 rounded">
                                                    <div className="w-6 h-6 bg-gray-600 rounded mr-3 animate-pulse"></div>
                                                    <div className="h-4 bg-gray-600 rounded flex-1 animate-pulse"></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div>
                                            {getFlatSearchedLeagues && search.trim() ? (
                                                getFlatSearchedLeagues.length === 0 ? (
                                                    <div className="text-xs text-gray-400 px-4 py-2">No leagues found.</div>
                                                ) : (
                                                    (getFlatSearchedLeagues || [])
                                                        .filter(league => league.isPopular)
                                                        .map(league => {
                                                            const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                            return (
                                                                <Link
                                                                    key={league.id}
                                                                    href={leagueHref}
                                                                    className="flex items-center justify-between py-2 px-4 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 focus:border-blue-400 w-[95%] mx-auto mb-1"
                                                                    title={league.name}
                                                                >
                                                                    <div className="flex items-center min-w-0">
                                                                        {league.image_path ? (
                                                                            <img
                                                                                src={league.image_path}
                                                                                alt={league.name}
                                                                                className="w-5 h-5 object-contain mr-2"
                                                                                onError={e => { e.target.style.display = 'none'; }}
                                                                            />
                                                                        ) : league.icon ? (
                                                                            <span className="text-green-400 text-sm mr-2">{league.icon}</span>
                                                                        ) : null}
                                                                        <span className="text-xs truncate max-w-[120px]" title={league.name}>{league.name}</span>
                                                                    </div>
                                                                    <span className="text-xs text-gray-400 font-bold">{league.id}</span>
                                                                </Link>
                                                            );
                                                        })
                                                )
                                            ) : (
                                                filteredLeagues.map(league => {
                                                    const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                    return (
                                                        <Link
                                                            key={league.id}
                                                            href={leagueHref}
                                                            className="flex items-center justify-between py-2 px-4 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 focus:border-blue-400 w-[95%] mx-auto mb-1"
                                                            title={league.name}
                                                        >
                                                            <div className="flex items-center min-w-0">
                                                                {league.image_path ? (
                                                                    <img
                                                                        src={league.image_path}
                                                                        alt={league.name}
                                                                        className="w-5 h-5 object-contain mr-2"
                                                                        onError={e => { e.target.style.display = 'none'; }}
                                                                    />
                                                                ) : league.icon ? (
                                                                    <span className="text-green-400 text-sm mr-2">{league.icon}</span>
                                                                ) : null}
                                                                <span className="text-xs truncate max-w-[120px]" title={league.name}>{league.name}</span>
                                                            </div>
                                                           
                                                        </Link>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}

                    {/* Pin status indicator */}
                    {isPinned && !isMobile && (
                        <div className="px-4 pb-2">
                            <div className="text-xs text-blue-400 flex items-center">
                                <Pin size={12} className="mr-1 rotate-45" />
                                Sidebar pinned
                            </div>
                        </div>
                    )}
                </>
            )}

            {(isCollapsed && !isMobile) && (
                <div className="p-2 space-y-2">
                    {/* Collapsed view - show only icons */}
                    <div className="flex flex-col items-center space-y-3 pt-4">
                        {user?.role === 'admin' ? (
                            // Admin icons
                            adminMenuItems.map((item, index) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                >
                                    <item.icon className="h-5 w-5" />
                                </Link>
                            ))
                        ) : (
                            // User icons
                            popularLeagues?.slice(0, 8).map((league, index) => {
                                const leagueHref = league.id === 'odds-boost'
                                    ? '/'
                                    : `/leagues/${league.id}`;

                                return (
                                    <Link
                                        key={league.id || index}
                                        href={leagueHref}
                                        className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                        title={league.name}
                                    >
                                        {league.image_path ? (
                                            <img
                                                src={league.image_path}
                                                alt={league.name}
                                                className="w-6 h-6 object-contain"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        ) : league.icon ? (
                                            <span className="text-white text-sm">{league.icon}</span>
                                        ) : null}
                                    </Link>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
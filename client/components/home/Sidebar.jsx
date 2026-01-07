'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {  ChevronRight, Pin, Users, Settings, DollarSign, X, Search, Globe, TrendingUp, Trophy, Flag } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
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
import { getFotmobLogoByUnibetId } from '@/lib/leagueUtils';



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

    // Function to check if a league is international
    const isInternationalLeague = (leagueName) => {
        const internationalKeywords = [
            'champions league',
            'europa league', 
            'afc champions league',
            'afc champions league 2',
            'african nations cup',
            'caf champions league',
            'conference league',
            'copa libertadores',
            'copa sudamericana',
            'international friendly',
            'world cup',
            'world cup qualifying',
            'europa league qualification',
            'champions league qualification',
            'conference league qualification'
        ];
        
        return internationalKeywords.some(keyword => 
            leagueName.toLowerCase().includes(keyword.toLowerCase())
        );
    };

    // Country flag mapping - using country codes for flag images
    const getCountryFlag = (countryName) => {
        const flagMap = {
            'Argentina': 'AR',
            'Austria': 'AT',
            'Belgium': 'BE',
            'Bosnia-Herzegovina': 'BA',
            'Brazil': 'BR',
            'Chile': 'CL',
            'China': 'CN',
            'Colombia': 'CO',
            'Croatia': 'HR',
            'Czech Republic': 'CZ',
            'Denmark': 'DK',
            'England': 'GB',
            'France': 'FR',
            'Germany': 'DE',
            'Italy': 'IT',
            'Japan': 'JP',
            'Mexico': 'MX',
            'Netherlands': 'NL',
            'Norway': 'NO',
            'Poland': 'PL',
            'Portugal': 'PT',
            'Russia': 'RU',
            'Scotland': 'GB',
            'Spain': 'ES',
            'Sweden': 'SE',
            'Switzerland': 'CH',
            'Turkey': 'TR',
            'Ukraine': 'UA',
            'United States': 'US',
            'Wales': 'GB',
            'Australia': 'AU',
            'Canada': 'CA',
            'South Korea': 'KR',
            'Greece': 'GR',
            'Israel': 'IL',
            'Romania': 'RO',
            'Bulgaria': 'BG',
            'Hungary': 'HU',
            'Slovakia': 'SK',
            'Slovenia': 'SI',
            'Serbia': 'RS',
            'Montenegro': 'ME',
            'Albania': 'AL',
            'North Macedonia': 'MK',
            'Moldova': 'MD',
            'Estonia': 'EE',
            'Latvia': 'LV',
            'Lithuania': 'LT',
            'Finland': 'FI',
            'Iceland': 'IS',
            'Ireland': 'IE',
            'Northern Ireland': 'GB',
            'Malta': 'MT',
            'Cyprus': 'CY',
            'Luxembourg': 'LU',
            'Liechtenstein': 'LI',
            'Monaco': 'MC',
            'San Marino': 'SM',
            'Vatican City': 'VA',
            'Andorra': 'AD',
            'South Africa': 'ZA',
            'Tunisia': 'TN',
            'Morocco': 'MA',
            'Egypt': 'EG',
            'Jordan': 'JO',
            'Qatar': 'QA',
            'Saudi Arabia': 'SA',
            'Iran': 'IR',
            'Indonesia': 'ID',
            'Thailand': 'TH',
            'Singapore': 'SG',
            'Georgia': 'GE',
            'Estonia': 'EE',
            'Latvia': 'LV',
            'Lithuania': 'LT',
            'Faroe Islands': 'FO',
            'Ecuador': 'EC',
            'Chile': 'CL',
            'China': 'CN',
            'Colombia': 'CO',
            'Paraguay': 'PY',
            'Peru': 'PE',
            'Uruguay': 'UY',
            'Argentina': 'AR',
            'Brazil': 'BR',
            'Mexico': 'MX',
            'USA': 'US',
            'Canada': 'CA',
            'Bosnia-Herzegovina': 'BA',
            'Croatia': 'HR',
            'Czech Republic': 'CZ',
            'Slovakia': 'SK',
            'Slovenia': 'SI',
            'Serbia': 'RS',
            'Montenegro': 'ME',
            'Albania': 'AL',
            'North Macedonia': 'MK',
            'Moldova': 'MD',
            'Finland': 'FI',
            'Iceland': 'IS',
            'Ireland': 'IE',
            'Northern Ireland': 'GB',
            'Malta': 'MT',
            'Cyprus': 'CY',
            'Luxembourg': 'LU',
            'Liechtenstein': 'LI',
            'Monaco': 'MC',
            'San Marino': 'SM',
            'Vatican City': 'VA',
            'Andorra': 'AD',
            'Nigeria': 'NG',
            'Algeria': 'DZ',
            'Ghana': 'GH',
            'Senegal': 'SN',
            'Ivory Coast': 'CI',
            'Cameroon': 'CM',
            'Kenya': 'KE',
            'Ethiopia': 'ET',
            'Uganda': 'UG',
            'Tanzania': 'TZ',
            'Zimbabwe': 'ZW',
            'Zambia': 'ZM',
            'Botswana': 'BW',
            'Namibia': 'NA',
            'Lesotho': 'LS',
            'Swaziland': 'SZ',
            'Malawi': 'MW',
            'Mozambique': 'MZ',
            'Madagascar': 'MG',
            'Mauritius': 'MU',
            'Seychelles': 'SC',
            'Comoros': 'KM',
            'Djibouti': 'DJ',
            'Somalia': 'SO',
            'Eritrea': 'ER',
            'Sudan': 'SD',
            'South Sudan': 'SS',
            'Central African Republic': 'CF',
            'Chad': 'TD',
            'Niger': 'NE',
            'Mali': 'ML',
            'Burkina Faso': 'BF',
            'Guinea': 'GN',
            'Sierra Leone': 'SL',
            'Liberia': 'LR',
            'Guinea-Bissau': 'GW',
            'Cape Verde': 'CV',
            'São Tomé and Príncipe': 'ST',
            'Equatorial Guinea': 'GQ',
            'Gabon': 'GA',
            'Republic of the Congo': 'CG',
            'Democratic Republic of the Congo': 'CD',
            'Angola': 'AO',
            'Rwanda': 'RW',
            'Burundi': 'BI',
            'Saudi Arabia': 'SA',
            'United Arab Emirates': 'AE',
            'Qatar': 'QA',
            'Kuwait': 'KW',
            'Bahrain': 'BH',
            'Oman': 'OM',
            'Yemen': 'YE',
            'Iraq': 'IQ',
            'Syria': 'SY',
            'Lebanon': 'LB',
            'Jordan': 'JO',
            'Palestine': 'PS',
            'Iran': 'IR',
            'Afghanistan': 'AF',
            'Pakistan': 'PK',
            'India': 'IN',
            'Bangladesh': 'BD',
            'Sri Lanka': 'LK',
            'Maldives': 'MV',
            'Nepal': 'NP',
            'Bhutan': 'BT',
            'Myanmar': 'MM',
            'Thailand': 'TH',
            'Laos': 'LA',
            'Cambodia': 'KH',
            'Vietnam': 'VN',
            'Malaysia': 'MY',
            'Singapore': 'SG',
            'Indonesia': 'ID',
            'Philippines': 'PH',
            'Brunei': 'BN',
            'East Timor': 'TL',
            'Papua New Guinea': 'PG',
            'Fiji': 'FJ',
            'Samoa': 'WS',
            'Tonga': 'TO',
            'Vanuatu': 'VU',
            'Solomon Islands': 'SB',
            'New Zealand': 'NZ',
            'Peru': 'PE',
            'Ecuador': 'EC',
            'Venezuela': 'VE',
            'Guyana': 'GY',
            'Suriname': 'SR',
            'French Guiana': 'GF',
            'Uruguay': 'UY',
            'Paraguay': 'PY',
            'Bolivia': 'BO',
            'Panama': 'PA',
            'Costa Rica': 'CR',
            'Nicaragua': 'NI',
            'Honduras': 'HN',
            'El Salvador': 'SV',
            'Guatemala': 'GT',
            'Belize': 'BZ',
            'Jamaica': 'JM',
            'Haiti': 'HT',
            'Dominican Republic': 'DO',
            'Cuba': 'CU',
            'Puerto Rico': 'PR',
            'Trinidad and Tobago': 'TT',
            'Barbados': 'BB',
            'Saint Lucia': 'LC',
            'Saint Vincent and the Grenadines': 'VC',
            'Grenada': 'GD',
            'Antigua and Barbuda': 'AG',
            'Saint Kitts and Nevis': 'KN',
            'Dominica': 'DM',
            'Bahamas': 'BS',
            'Cayman Islands': 'KY',
            'Bermuda': 'BM',
            'Turks and Caicos Islands': 'TC',
            'British Virgin Islands': 'VG',
            'US Virgin Islands': 'VI',
            'Anguilla': 'AI',
            'Montserrat': 'MS',
            'Saint Pierre and Miquelon': 'PM',
            'Greenland': 'GL',
            'Faroe Islands': 'FO',
            'Åland Islands': 'AX',
            'Svalbard and Jan Mayen': 'SJ',
            'Bouvet Island': 'BV',
            'Heard Island and McDonald Islands': 'HM',
            'French Southern Territories': 'TF',
            'South Georgia and the South Sandwich Islands': 'GS',
            'Antarctica': 'AQ',
            'British Antarctic Territory': 'AQ',
            'Ross Dependency': 'AQ',
            'Adélie Land': 'AQ',
            'Queen Maud Land': 'AQ',
            'Australian Antarctic Territory': 'AQ',
            'Chilean Antarctic Territory': 'AQ',
            'Peter I Island': 'AQ'
        };
        
        return flagMap[countryName] || 'UN';
    };

    // Group leagues by country and filter by search
    const groupedLeagues = useMemo(() => {
        if (!popularLeagues || !Array.isArray(popularLeagues)) return {};
        
        const groups = {};
        const searchTerm = search.trim().toLowerCase();
        
        // ✅ Track seen league IDs to prevent duplicates
        const seenLeagueIds = new Set();
        
        if (searchTerm.length > 0) {
            // Search mode: filter accordions based on country name or league name
            popularLeagues.forEach(league => {
                // ✅ Skip if we've already seen this league ID
                const leagueId = String(league.id || league.unibetId);
                if (seenLeagueIds.has(leagueId)) {
                    return; // Skip duplicate
                }
                
                // Get country name from the league data
                let countryName = league.country?.name || league.country?.official_name;
                
                // If no country name or empty, put in 'other' group
                if (!countryName || countryName.trim() === '') {
                    countryName = 'Other';
                }
                
                // ✅ FIX: Normalize country name - trim and ensure consistent casing
                countryName = countryName.trim();
                
                const countryNameLower = countryName.toLowerCase();
                const leagueNameLower = league.name.toLowerCase();
                
                // Check if search matches country name OR league name
                const countryMatches = countryNameLower.includes(searchTerm);
                const leagueMatches = leagueNameLower.includes(searchTerm);
                
                if (countryMatches || leagueMatches) {
                    // Use country name as the key (normalized) - case-insensitive and trimmed
                    const countryId = countryName.toLowerCase().trim().replace(/\s+/g, '-');
                    
                    if (!groups[countryId]) {
                        groups[countryId] = {
                            name: countryName, // ✅ FIX: Use normalized country name
                            id: countryId,
                            flag: league.country?.image_path || league.country?.image,
                            leagues: []
                        };
                    }
                    
                    // ✅ Only add if not already in this country's leagues
                    const alreadyInCountry = groups[countryId].leagues.some(l => 
                        String(l.id || l.unibetId) === leagueId
                    );
                    
                    if (!alreadyInCountry) {
                        groups[countryId].leagues.push(league);
                        seenLeagueIds.add(leagueId);
                    }
                }
            });
        } else {
            // No search: show all leagues grouped by country
            popularLeagues.forEach(league => {
                // ✅ Skip if we've already seen this league ID
                const leagueId = String(league.id || league.unibetId);
                if (seenLeagueIds.has(leagueId)) {
                    return; // Skip duplicate
                }
                
                // Get country name from the league data
                let countryName = league.country?.name || league.country?.official_name;
                
                // If no country name or empty, put in 'other' group
                if (!countryName || countryName.trim() === '') {
                    countryName = 'Other';
                }
                
                // ✅ FIX: Normalize country name - trim and ensure consistent casing
                countryName = countryName.trim();
                
                // Use country name as the key (normalized) - case-insensitive and trimmed
                const countryId = countryName.toLowerCase().trim().replace(/\s+/g, '-');
                
                if (!groups[countryId]) {
                    groups[countryId] = {
                        name: countryName, // ✅ FIX: Use normalized country name
                        id: countryId,
                        flag: league.country?.image_path || league.country?.image,
                        leagues: []
                    };
                }
                
                // ✅ Only add if not already in this country's leagues
                const alreadyInCountry = groups[countryId].leagues.some(l => 
                    String(l.id || l.unibetId) === leagueId
                );
                
                if (!alreadyInCountry) {
                    groups[countryId].leagues.push(league);
                    seenLeagueIds.add(leagueId);
                }
            });
        }
        
        // ✅ Log duplicate detection stats
        const totalLeaguesInGroups = Object.values(groups).reduce((sum, g) => sum + g.leagues.length, 0);
        console.log(`🔍 Grouped ${Object.keys(groups).length} countries with ${totalLeaguesInGroups} unique leagues`);
        console.log(`🔍 Total leagues in popularLeagues: ${popularLeagues.length}, Unique leagues: ${seenLeagueIds.size}`);
        
        return groups;
    }, [popularLeagues, search]);

    // Get sorted country keys (alphabetical by country name)
    const sortedCountryKeys = useMemo(() => {
        const keys = Object.keys(groupedLeagues).sort((a, b) => {
            const nameA = groupedLeagues[a].name || '';
            const nameB = groupedLeagues[b].name || '';
            return nameA.localeCompare(nameB);
        });
        
        // Debug logging
        console.log('🔍 Grouped leagues:', groupedLeagues);
        console.log('🔍 Sorted country keys:', keys);
        console.log('🔍 Popular leagues sample:', popularLeagues?.slice(0, 3));
        
        return keys;
    }, [groupedLeagues, popularLeagues]);



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
            title: 'Leagues',
            href: '/admin/leagues',
            icon: Trophy
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

    const [activeTab, setActiveTab] = useState('popular');

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
                                        value="popular"
                                        className="flex-1 text-xs bg-transparent cursor-pointer text-white data-[state=active]:bg-base data-[state=active]:text-white"
                                    >
                                        <TrendingUp className="mr-1 h-4 w-4" /> Popular
                                    </TabsTrigger>

                                    <TabsTrigger
                                        value="by-country"
                                        className="flex-1 text-xs bg-transparent cursor-pointer text-white data-[state=active]:bg-base data-[state=active]:text-white"
                                    >
                                        <Globe className="mr-1 h-4 w-4" /> By Country
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
                                        placeholder="Search leagues & countries..."
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
                                            {search.trim() ? (
                                                Object.keys(groupedLeagues).length === 0 ? (
                                                    <div className="text-xs text-gray-400 px-4 py-2">No leagues found.</div>
                                                ) : (
                                                    Object.values(groupedLeagues).map(country => (
                                                        <div key={country.id} className="mb-2">
                                                            <div
                                                                className="flex items-center justify-between py-1 px-2 bg-gray-700 rounded cursor-pointer select-none transition-colors hover:bg-gray-600 group"
                                                                onClick={() => setExpandedCountries(prev => ({ ...prev, [country.id]: !expandedCountries[country.id] }))}
                                                                tabIndex={0}
                                                                role="button"
                                                                aria-expanded={expandedCountries[country.id]}
                                                            >
                                                                <div className="flex items-center">
                                                                    {country.name === 'International' ? (
                                                                        <Globe className="w-4 h-4 mr-2 text-blue-400" />
                                                                    ) : (
                                                                        <ReactCountryFlag
                                                                            countryCode={getCountryFlag(country.name)}
                                                                            svg
                                                                            style={{
                                                                                width: '20px',
                                                                                height: '16px',
                                                                                borderRadius: '2px'
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span className="font-semibold text-xs truncate max-w-[120px]" title={country.name}>
                                                                        {country.name}
                                                                    </span>
                                                                </div>
                                                                <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expandedCountries[country.id] ? 'rotate-90' : ''}`} />
                                                            </div>
                                                            {expandedCountries[country.id] && (
                                                                <div className="mt-2">
                                                                    {country.leagues.map(league => {
                                                                        const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                                        return (
                                                                            <Link
                                                                                key={league.id}
                                                                                href={leagueHref}
                                                                                className="flex items-center justify-between py-1 px-5 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 mt-1 focus:border-blue-400 w-[95%] mx-auto"
                                                                                title={league.name}
                                                                            >
                                                                                <div className="flex items-center min-w-0 py-0">
                                                                                    {(getFotmobLogoByUnibetId(league.id) || league.fotmobId || league.image_path) ? (
                                                                                        <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                            <img
                                                                                                src={getFotmobLogoByUnibetId(league.id) || `https://images.fotmob.com/image_resources/logo/leaguelogo/${league.fotmobId}.png` || league.image_path}
                                                                                                alt={league.name}
                                                                                                className="w-5 h-5 object-contain"
                                                                                                onError={e => { e.target.style.display = 'none'; }}
                                                                                            />
                                                                                        </span>
                                                                                    ) : league.icon ? (
                                                                                        <span className="text-green-400 text-sm mr-2">{league.icon}</span>
                                                                                    ) : null}
                                                                                    <span className="text-xs truncate max-w-[120px]" title={league.name}>{league.name}</span>
                                                                                </div>
                                                                                <span className="text-xs text-gray-400 font-bold">{league.id}</span>
                                                                            </Link>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))
                                                )
                                            ) : (
                                                <>
                                                    {/* International Leagues Accordion */}
                                                    <div className="mb-3">
                                                        <div
                                                            className="flex items-center justify-between py-1 px-2 bg-gray-700 rounded cursor-pointer select-none transition-colors hover:bg-gray-600 group"
                                                            onClick={() => setExpandedCountries(prev => ({ ...prev, 'international': !expandedCountries['international'] }))}
                                                            tabIndex={0}
                                                            role="button"
                                                            aria-expanded={expandedCountries['international']}
                                                        >
                                                            <div className="flex items-center">
                                                                <Globe className="w-4 h-4 mr-2 text-blue-400" />
                                                                <span className="font-semibold text-xs truncate max-w-[120px]" title="International">
                                                                    International
                                                                </span>
                                                            </div>
                                                            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expandedCountries['international'] ? 'rotate-90' : ''}`} />
                                                        </div>
                                                        {expandedCountries['international'] && (
                                                            <div className="mt-2">
                                                                {popularLeagues
                                                                    ?.filter(league => {
                                                                        // ✅ FIX: Show leagues that are international by name OR by country
                                                                        const isInternationalByName = isInternationalLeague(league.name);
                                                                        const isInternationalByCountry = league.country?.name === 'International' || 
                                                                                                          league.country?.official_name === 'International';
                                                                        return isInternationalByName || isInternationalByCountry;
                                                                    })
                                                                    ?.map(league => {
                                                                        const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                                        return (
                                                                            <Link
                                                                                key={league.id}
                                                                                href={leagueHref}
                                                                                className="flex items-center justify-between py-1 px-5 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 mt-1 focus:border-blue-400 w-[95%] mx-auto"
                                                                                title={league.name}
                                                                            >
                                                                                <div className="flex items-center min-w-0 py-0">
                                                                                    {getFotmobLogoByUnibetId(league.id) || league.fotmobId ? (
                                                                                        <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                            <img
                                                                                                src={getFotmobLogoByUnibetId(league.id) || `https://images.fotmob.com/image_resources/logo/leaguelogo/${league.fotmobId}.png`}
                                                                                                alt={league.name}
                                                                                                className="w-5 h-5 object-contain"
                                                                                                onError={e => { e.target.style.display = 'none'; }}
                                                                                            />
                                                                                        </span>
                                                                                    ) : getFotmobLogoByUnibetId(league.id) || league.image_path ? (
                                                                                        <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                            <img
                                                                                                src={getFotmobLogoByUnibetId(league.id) || league.image_path}
                                                                                                alt={league.name}
                                                                                                className="w-5 h-5 object-contain"
                                                                                                onError={e => { e.target.style.display = 'none'; }}
                                                                                            />
                                                                                        </span>
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
                                                    
                                                    {/* Country Groups - Filter out 'other' and international leagues */}
                                                    {sortedCountryKeys
                                                        .filter(countryId => {
                                                            const country = groupedLeagues[countryId];
                                                            // Exclude 'other' group
                                                            if (countryId === 'other' || country.name === 'Other') return false;
                                                            
                                                            // ✅ FIX: Exclude 'International' country group - we already have a dedicated International Leagues Accordion above
                                                            if (countryId === 'international' || country.name === 'International') return false;
                                                            
                                                            // Check if all leagues in this country are international
                                                            const hasNonInternationalLeagues = country.leagues.some(league => 
                                                                !isInternationalLeague(league.name)
                                                            );
                                                            
                                                            console.log(`🔍 Country ${country.name}: hasNonInternationalLeagues = ${hasNonInternationalLeagues}, leagues count = ${country.leagues.length}`);
                                                            
                                                            return hasNonInternationalLeagues;
                                                        })
                                                        .map((countryId, idx) => {
                                                        const country = groupedLeagues[countryId];
                                                        const isExpanded = expandedCountries[countryId] ?? false;
                                                        return (
                                                            <div key={countryId} className="mb-2">
                                                                <div
                                                                    className="flex items-center justify-between py-1 px-2 bg-gray-700 rounded cursor-pointer select-none transition-colors hover:bg-gray-600 group"
                                                                    onClick={() => setExpandedCountries(prev => ({ ...prev, [countryId]: !isExpanded }))}
                                                                    tabIndex={0}
                                                                    role="button"
                                                                    aria-expanded={isExpanded}
                                                                >
                                                                    <div className="flex items-center">
                                                                        <ReactCountryFlag
                                                                            countryCode={getCountryFlag(country.name)}
                                                                            svg
                                                                            style={{
                                                                                width: '20px',
                                                                                height: '16px',
                                                                                marginRight: '8px',
                                                                                borderRadius: '2px',
                                                                                border: '1px solid #4b5563'
                                                                            }}
                                                                            title={country.name}
                                                                        />
                                                                        <Flag 
                                                                            className="w-4 h-4 mr-2 text-gray-400 hidden" 
                                                                            style={{ display: 'none' }}
                                                                        />
                                                                        <span className="font-semibold text-xs truncate max-w-[120px]" title={country.name}>
                                                                            {country.name}
                                                                        </span>
                                                                    </div>
                                                                    <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                                                </div>
                                                                {isExpanded && (
                                                                    <div>
                                                                        {country.leagues
                                                                            .filter(league => !isInternationalLeague(league.name)) // Only show non-international leagues
                                                                            .map(league => {
                                                                                const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                                                return (
                                                                                    <Link
                                                                                        key={league.id}
                                                                                        href={leagueHref}
                                                                                        className="flex items-center justify-between py-1 px-5 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 mt-1 focus:border-blue-400 w-[95%] mx-auto"
                                                                                        title={league.name}
                                                                                    >
                                                                                        <div className="flex items-center min-w-0 py-0">
                                                                                            {getFotmobLogoByUnibetId(league.id) || league.fotmobId ? (
                                                                                                <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                                    <img
                                                                                                        src={getFotmobLogoByUnibetId(league.id) || `https://images.fotmob.com/image_resources/logo/leaguelogo/${league.fotmobId}.png`}
                                                                                                        alt={league.name}
                                                                                                        className="w-5 h-5 object-contain"
                                                                                                        onError={e => { e.target.style.display = 'none'; }}
                                                                                                    />
                                                                                                </span>
                                                                                            ) : getFotmobLogoByUnibetId(league.id) || league.image_path ? (
                                                                                                <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                                    <img
                                                                                                        src={getFotmobLogoByUnibetId(league.id) || league.image_path}
                                                                                                        alt={league.name}
                                                                                                        className="w-5 h-5 object-contain"
                                                                                                        onError={e => { e.target.style.display = 'none'; }}
                                                                                                    />
                                                                                                </span>
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
                                                    })}
                                                    
                                                    {/* Other Leagues Accordion - for leagues without proper country data */}
                                                    {groupedLeagues['other'] && groupedLeagues['other'].leagues.length > 0 && (
                                                        <div className="mb-2">
                                                            <div className="border-t border-gray-700 my-2" />
                                                            <div
                                                                className="flex items-center justify-between py-1 px-2 bg-gray-700 rounded cursor-pointer select-none transition-colors hover:bg-gray-600 group"
                                                                onClick={() => setExpandedCountries(prev => ({ ...prev, 'other': !expandedCountries['other'] }))}
                                                                tabIndex={0}
                                                                role="button"
                                                                aria-expanded={expandedCountries['other']}
                                                            >
                                                                <div className="flex items-center">
                                                                    <Trophy className="w-4 h-4 mr-2 text-gray-400" />
                                                                    <span className="font-semibold text-xs truncate max-w-[120px]" title="Other">
                                                                        Other
                                                                    </span>
                                                                </div>
                                                                <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expandedCountries['other'] ? 'rotate-90' : ''}`} />
                                                            </div>
                                                            {expandedCountries['other'] && (
                                                                <div>
                                                                    {groupedLeagues['other'].leagues.map(league => {
                                                                        const leagueHref = league.id === 'odds-boost' ? '/' : `/leagues/${league.id}`;
                                                                        return (
                                                                            <Link
                                                                                key={league.id}
                                                                                href={leagueHref}
                                                                                className="flex items-center justify-between py-1 px-5 rounded cursor-pointer group transition-colors hover:bg-gray-700 focus:bg-gray-700 border-l-2 border-transparent hover:border-blue-400 mt-1 focus:border-blue-400 w-[95%] mx-auto"
                                                                                title={league.name}
                                                                            >
                                                                                <div className="flex items-center min-w-0 py-0">
                                                                                    {getFotmobLogoByUnibetId(league.id) || league.fotmobId ? (
                                                                                        <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                            <img
                                                                                                src={getFotmobLogoByUnibetId(league.id) || `https://images.fotmob.com/image_resources/logo/leaguelogo/${league.fotmobId}.png`}
                                                                                                alt={league.name}
                                                                                                className="w-5 h-5 object-contain"
                                                                                                onError={e => { e.target.style.display = 'none'; }}
                                                                                            />
                                                                                        </span>
                                                                                    ) : getFotmobLogoByUnibetId(league.id) || league.image_path ? (
                                                                                        <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                            <img
                                                                                                src={getFotmobLogoByUnibetId(league.id) || league.image_path}
                                                                                                alt={league.name}
                                                                                                className="w-5 h-5 object-contain"
                                                                                                onError={e => { e.target.style.display = 'none'; }}
                                                                                            />
                                                                                        </span>
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
                                                    )}
                                                </>
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
                                                                        {getFotmobLogoByUnibetId(league.id) || league.fotmobId ? (
                                                                            <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                <img
                                                                                    src={getFotmobLogoByUnibetId(league.id) || `https://images.fotmob.com/image_resources/logo/leaguelogo/${league.fotmobId}.png`}
                                                                                    alt={league.name}
                                                                                    className="w-5 h-5 object-contain"
                                                                                    onError={e => { e.target.style.display = 'none'; }}
                                                                                />
                                                                            </span>
                                                                        ) : getFotmobLogoByUnibetId(league.id) || league.image_path ? (
                                                                            <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                                <img
                                                                                    src={getFotmobLogoByUnibetId(league.id) || league.image_path}
                                                                                    alt={league.name}
                                                                                    className="w-5 h-5 object-contain"
                                                                                    onError={e => { e.target.style.display = 'none'; }}
                                                                                />
                                                                            </span>
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
                                                                {getFotmobLogoByUnibetId(league.id) || league.fotmobId ? (
                                                                    <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                        <img
                                                                            src={getFotmobLogoByUnibetId(league.id) || `https://images.fotmob.com/image_resources/logo/leaguelogo/${league.fotmobId}.png`}
                                                                            alt={league.name}
                                                                            className="w-5 h-5 object-contain"
                                                                            onError={e => { e.target.style.display = 'none'; }}
                                                                        />
                                                                    </span>
                                                                ) : getFotmobLogoByUnibetId(league.id) || league.image_path ? (
                                                                    <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6 mr-2">
                                                                        <img
                                                                            src={getFotmobLogoByUnibetId(league.id) || league.image_path}
                                                                            alt={league.name}
                                                                            className="w-5 h-5 object-contain"
                                                                            onError={e => { e.target.style.display = 'none'; }}
                                                                        />
                                                                    </span>
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
                <div className="p-2 space-y-2 mt-4 flex flex-col justify-center">
                    <div className="flex flex-col items-center space-y-3">
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
                            // User icons - show only popular leagues, max 8
                            popularLeagues
                                ?.filter(league => league.isPopular === true)
                                ?.slice(0, 8)
                                ?.map((league, index) => {
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
                                            {(getFotmobLogoByUnibetId(league.id) || getFotmobLogoByUnibetId(league.id) || league.image_path) ? (
                                                <span className="bg-white rounded-full border border-gray-200 flex items-center justify-center w-6 h-6">
                                                    <img
                                                        src={getFotmobLogoByUnibetId(league.id) || getFotmobLogoByUnibetId(league.id) || league.image_path}
                                                        alt={league.name}
                                                        className="w-6 h-6 object-contain"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                        }}
                                                    />
                                                </span>
                                            ) : league.icon ? (
                                                <span className="text-white text-sm flex items-center justify-center w-6 h-6">{league.icon}</span>
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
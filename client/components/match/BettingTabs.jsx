import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../ui/button"
import { useBetting } from "@/hooks/useBetting"
import { useDispatch, useSelector } from "react-redux"
import { removeBet } from "@/lib/features/betSlip/betSlipSlice"


const BettingTabs = ({ matchData }) => {
    const [selectedTab, setSelectedTab] = useState("all")
    const scrollAreaRef = useRef(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(true)




    //INFO: Use the backend-provided betting data directly
    const bettingData = matchData?.betting_data || [];
    const categories = matchData?.odds_classification?.categories || [{ id: 'all', label: 'All', odds_count: 0 }];
    const hasData = bettingData.length > 0;

    // Helper function to get data by category
    const getDataByCategory = useCallback((categoryId) => {
        if (categoryId === 'all') {
            // For 'all', group by category for accordion display
            // Create a map of categories to avoid duplicates
            const categoryMap = new Map();
            
            // First, process all betting data and organize by category
            bettingData.forEach(item => {
                const categoryId = item.category;
                if (!categoryMap.has(categoryId)) {
                    categoryMap.set(categoryId, {
                        id: categoryId,
                        label: categories.find(cat => cat.id === categoryId)?.label || categoryId,
                        markets: [],
                        marketIds: new Set() // Track market IDs to avoid duplicates
                    });
                }
                
                const categoryData = categoryMap.get(categoryId);
                // Only add the market if it hasn't been added before
                if (!categoryData.marketIds.has(item.id)) {
                    categoryData.markets.push(item);
                    categoryData.marketIds.add(item.id);
                }
            });
            
            // Convert map to array and calculate totals
            return Array.from(categoryMap.values())
                .map(category => ({
                    id: category.id,
                    label: category.label,
                    markets: category.markets,
                    totalMarkets: category.markets.length
                }))
                .filter(group => group.markets.length > 0);
        }
        
        // For other tabs, just return the betting data for that category
        // Also ensure no duplicates
        const marketIds = new Set();
        const filteredMarkets = bettingData
            .filter(item => item.category === categoryId)
            .filter(item => {
                if (marketIds.has(item.id)) return false;
                marketIds.add(item.id);
                return true;
            });
            
        return [{
                id: categoryId,
                label: categories.find(cat => cat.id === categoryId)?.label || categoryId,
            markets: filteredMarkets,
            totalMarkets: filteredMarkets.length
        }];
    }, [bettingData, categories]);



    const tabs = useMemo(() => [
        { id: "all", label: "All" },
        ...categories.filter(cat => cat.id !== "all").map(cat => ({
            id: cat.id,
            label: cat.label
        }))
    ], [categories])

    // Check scroll state
    const checkScrollState = useCallback(() => {
        const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollElement
            setCanScrollLeft(scrollLeft > 0)
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
        }
    }, [])

    //INFO: Scroll functions
    const scrollLeft = () => {
        const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
            scrollElement.scrollBy({ left: -200, behavior: 'smooth' })
        }
    }

    const scrollRight = () => {
        const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
            scrollElement.scrollBy({ left: 200, behavior: 'smooth' })
        }
    }
    // Listen for scroll events
    useEffect(() => {
        const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
            scrollElement.addEventListener('scroll', checkScrollState)
            // Initial check with delay to ensure layout is ready
            const timer = setTimeout(checkScrollState, 100)

            return () => {
                scrollElement.removeEventListener('scroll', checkScrollState)
                clearTimeout(timer)
            }
        }
    }, [checkScrollState])    // Check scroll state on resize and when component mounts
    useEffect(() => {
        const handleResize = () => {
            setTimeout(checkScrollState, 100)
        }
        window.addEventListener('resize', handleResize)
        // Also check when component mounts or updates
        setTimeout(checkScrollState, 200)

        return () => window.removeEventListener('resize', handleResize)
    }, [checkScrollState])

    // Memoized filtered data for individual tabs
    const getTabData = useCallback((tab) => {
        return getDataByCategory(tab.id);
    }, [getDataByCategory]);


    return (


        <div className="mb-6  -mt-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full ">
                {/* Tab navigation with scroll buttons */}
                <div className="mb-4 sm:mb-6 bg-white pb-2 pl-2 sm:pl-[13px] p-1">
                    <div className="relative flex items-center">
                        {/* Left scroll button - Always visible */}

                        {
                            canScrollLeft && (
                                <button
                                    onClick={scrollLeft}
                                    className={`absolute left-0 z-10 flex hover:bg-gray-100 items-center justify-center w-8 h-8 bg-white transition-all duration-200  text-black cursor-pointer`}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                            )
                        }

                        {/* Scrollable tabs area */}
                        <div className="overflow-hidden w-fit mx-8">
                            <ScrollArea
                                ref={scrollAreaRef}
                                orientation="horizontal"
                                className="w-full"
                            >
                                <div className="flex gap-1 sm:gap-1.5 min-w-max pr-4">
                                    {tabs.map((tab) => (
                                        <Button
                                            key={tab.id}
                                            onClick={() => setSelectedTab(tab.id)}
                                            className={`px-2 py-1.5 sm:px-3 sm:py-1 font-normal cursor-pointer text-xs rounded-2xl sm:rounded-3xl whitespace-nowrap transition-all duration-200 flex-shrink-0 ${selectedTab === tab.id
                                                ? "bg-base text-white "
                                                : "text-gray-600 hover:text-gray-900 bg-white  hover:bg-gray-100"
                                                }`}
                                        >
                                            {tab.label}
                                        </Button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* Right scroll button - Always visible */}
                        {
                            canScrollRight && (
                                <button
                                    onClick={scrollRight}
                                    className={`absolute right-0 z-10 flex items-center justify-center w-8 h-8 bg-white  transition-all duration-200 hover:bg-gray-100 text-black cursor-pointer`}
                                    disabled={!canScrollRight}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            )
                        }

                    </div>
                </div>
                {tabs.map((tab) => (
                    <TabsContent key={tab.id} value={tab.id} className="space-y-3">
                        <BettingMarketGroup
                            groupedMarkets={getTabData(tab)}
                            emptyMessage={`${tab.label} betting options will be displayed here`}
                            matchData={matchData}
                        />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    )
}

const BettingMarketGroup = ({ groupedMarkets, emptyMessage, matchData }) => {
    if (!groupedMarkets || groupedMarkets.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400">
                <div className="text-lg font-medium mb-2">No betting options available</div>
                <div className="text-sm">{emptyMessage || "Betting options will be displayed here"}</div>
            </div>
        )
    }
    const isAllTab = groupedMarkets.length > 1;
    // Helper for grid class
    const getGridClass = (options) => {
        // For result markets (1X2), always use 3 columns if there are 3 options
        const isResultMarket = options.length === 3 &&
            (options.some(opt => opt.label.toLowerCase() === 'draw') ||
                options.every(opt => ['1x', 'x2', '12'].includes(opt.label.toLowerCase())));
        
        // For over/under markets, always use 2 columns
        const isOverUnderMarket = options.length === 2 && 
            options.some(opt => opt.label.toLowerCase().includes('over')) && 
            options.some(opt => opt.label.toLowerCase().includes('under'));
        
        if (isResultMarket) return "grid-cols-3";
        if (isOverUnderMarket) return "grid-cols-2";
        
        const optionsCount = options.length;
        if (optionsCount <= 2) return "grid-cols-2";
        else if (optionsCount <= 4) return "grid-cols-2 sm:grid-cols-4";
        else if (optionsCount <= 6) return "grid-cols-2 sm:grid-cols-3";
        else return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
    };
    // Render betting options
    const renderOptions = (options, section) => {
        // Special handling for result markets (1X2, Match Result, etc.)
        const isResultMarket = 
            section.title?.toLowerCase().includes('result') || 
            section.title?.toLowerCase().includes('winner') ||
            section.title?.toLowerCase().includes('1x2');
        
        // Special handling for handicap markets
        const isHandicapMarket = 
            section.title?.toLowerCase().includes('handicap');
        
        // Special handling for half-time markets
        const isHalfTimeMarket =
            section.title?.toLowerCase().includes('1st half') ||
            section.title?.toLowerCase().includes('first half') ||
            section.title?.toLowerCase().includes('halftime');
        
        // Special handling for over/under markets
        const isOverUnderMarket = 
            section.title?.toLowerCase().includes('over/under') || 
            (options.length === 2 && 
             options.some(opt => opt.label.toLowerCase().includes('over')) && 
             options.some(opt => opt.label.toLowerCase().includes('under')));
        
        // Special handling for goal scorer markets
        const isGoalScorerMarket = 
            section.title?.toLowerCase().includes('team to score') || 
            section.title?.toLowerCase().includes('first team') || 
            section.title?.toLowerCase().includes('last team') ||
            section.type === 'goal-scorer';

        // Special handling for Corner Match Bet markets
        const isCornerMatchBet = 
            section.title?.toLowerCase().includes('corner match bet') ||
            section.type === 'corner-match-bet';

        // Use appropriate grid class based on market type
        const gridClass = isGoalScorerMarket && options.length === 3 ? "grid-cols-3" : getGridClass(options);
        
        console.log('Section:', section); // Debug log
        console.log('Options:', options); // Debug log
        
        return (
            <div className={`grid ${gridClass} gap-1`}>
                {options.map((option, idx) => (
                    <BettingOptionButton
                        key={`${option.label}-${idx}`}
                        label={option.label}
                        value={option.value}
                        sectionType={isCornerMatchBet ? 'corner-match-bet' : section?.type || 'market'}
                        optionId={option?.id}
                        matchData={matchData}
                        isResultOption={isResultMarket}
                        isHandicapOption={isHandicapMarket}
                        isHalfTimeOption={isHalfTimeMarket}
                        isOverUnderOption={isOverUnderMarket}
                        isGoalScorerOption={isGoalScorerMarket}
                        handicapValue={option.handicapValue}
                        halfIndicator={option.halfIndicator}
                        thresholds={option.thresholds}
                        total={option.total}
                        name={option.name}
                        marketDescription={section.title}
                    />
                ))}
            </div>
        );
    };
    // Render market sections
    const renderSections = (category) => {
        // For player cards, group by player name to avoid repetition
        if (category.id === 'player-cards') {
            // Extract player names from options
            const playerOptions = {};
            const teamPlayers = {
                team1: [],
                team2: []
            };

            // First pass - collect all player names and their options
            category.markets.forEach(section => {
                section.options.forEach(option => {
                    // Extract player name from label (format: "Player Name - Action")
                    const labelParts = option.label.split(' - ');
                    if (labelParts.length >= 2) {
                        const playerName = labelParts[0];
                        const actionType = labelParts[1];
                        
                        if (!playerOptions[playerName]) {
                            playerOptions[playerName] = {
                                name: playerName,
                                options: [],
                                team: option.team || 'unknown' // Track team if available
                            };
                        }
                        
                        // Add this option
                        playerOptions[playerName].options.push({
                            ...option,
                            action: actionType
                        });
                    }
                });
            });
            
            // Organize players into teams if possible
            if (matchData && matchData.participants && matchData.participants.length >= 2) {
                const team1Name = matchData.participants[0].name;
                const team2Name = matchData.participants[1].name;
                
                // Try to assign players to teams based on available data
                Object.values(playerOptions).forEach(player => {
                    // Check team property and player name for team assignment
                    const playerNameLower = player.name.toLowerCase();
                    const team1NameLower = team1Name.toLowerCase();
                    const team2NameLower = team2Name.toLowerCase();
                    
                    if (player.team === 'home' || 
                        player.team === team1Name || 
                        playerNameLower.includes(team1NameLower)) {
                        teamPlayers.team1.push(player);
                    } else if (player.team === 'away' || 
                             player.team === team2Name || 
                             playerNameLower.includes(team2NameLower)) {
                        teamPlayers.team2.push(player);
                    } else {
                        // If we can't determine team, put in team1 by default
                        teamPlayers.team1.push(player);
                    }
                });
            } else {
                // If we don't have team data, put all players in team1
                teamPlayers.team1 = Object.values(playerOptions);
            }
            
            // Sort players by name within each team
            teamPlayers.team1.sort((a, b) => a.name.localeCompare(b.name));
            teamPlayers.team2.sort((a, b) => a.name.localeCompare(b.name));
            
            // Create sections for each team
            const sections = [];
            
            // Add team1 section if it has players
            if (teamPlayers.team1.length > 0) {
                sections.push({
                    id: 'team1-cards',
                    title: matchData?.participants?.[0]?.name ? `${matchData.participants[0].name} Cards` : 'Home Team Cards',
                    players: teamPlayers.team1
                });
            }
            
            // Add team2 section if it has players
            if (teamPlayers.team2.length > 0) {
                sections.push({
                    id: 'team2-cards',
                    title: matchData?.participants?.[1]?.name ? `${matchData.participants[1].name} Cards` : 'Away Team Cards',
                    players: teamPlayers.team2
                });
            }
            
            // Render team sections
            return sections.map(section => (
                <div key={section.id} className="bg-white border overflow-hidden transition-all duration-200">
                    <div className="px-4 py-2.5">
                        <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
                    </div>
                    <div className="p-3">
                        <div className="grid grid-cols-1 gap-3">
                            {section.players.map(player => (
                                <div key={player.name} className="border-b pb-2 last:border-0 last:pb-0">
                                    <div className="font-medium text-sm mb-1">{player.name}</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {player.options.map((option, idx) => (
                                            <BettingOptionButton
                                                key={`${player.name}-${option.action}-${idx}`}
                                                label={option.label}
                                                value={option.value}
                                                sectionType="player-cards"
                                                optionId={option.id}
                                                matchData={matchData}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ));
        }
        
        // For other categories, use the standard rendering
        return category.markets.map((section) => (
            <div key={section.id} className="bg-white border overflow-hidden transition-all duration-200">
                <div className="px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
                </div>
                <div className="p-3">
                    {renderOptions(section.options, section)}
                </div>
            </div>
        ));
    };
    // All tab: use accordion
    if (isAllTab) {
        return (
            <Accordion type="multiple" className="space-y-2">
                {groupedMarkets.map((category) => (
                    <AccordionItem key={category.id} value={category.id} className="bg-white border border-gray-200 overflow-hidden duration-200">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50/50 transition-colors duration-200 [&[data-state=open]]:bg-gray-50/80">
                            <div className="flex items-center gap-3">
                                <h4 className="text-sm font-semibold text-gray-900">{category.label}</h4>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                    {category.totalMarkets} markets
                                </span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 py-3 bg-gray-50/30">
                            <div className="space-y-3">
                                {renderSections(category)}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    }
    // Category tab: expanded
    return (
        <div className="space-y-2">
            {groupedMarkets.map((category) => (
                <div key={category.id} className="bg-white border border-gray-200 overflow-hidden duration-200">
                    <div className="px-4 py-3 flex items-center gap-3 bg-gray-50/80">
                        <h4 className="text-sm font-semibold text-gray-900">{category.label}</h4>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            {category.totalMarkets} markets
                        </span>
                    </div>
                    <div className="space-y-3 px-4 py-3 bg-gray-50/30">
                        {renderSections(category)}
                    </div>
                </div>
            ))}
        </div>
    );
};

const BettingOptionButton = ({ 
    label, 
    value, 
    sectionType, 
    optionId, 
    matchData, 
    isResultOption, 
    isHandicapOption, 
    isHalfTimeOption, 
    isOverUnderOption, 
    isGoalScorerOption, 
    handicapValue, 
    halfIndicator, 
    thresholds,
    total,
    marketDescription,
    name,
    ...props 
}) => {
    const { placeBet } = useBetting();
    const dispatch = useDispatch();
    const selectedBets = useSelector(state => state.betSlip.bets);
    const isSelected = selectedBets && selectedBets.some((bet) => bet.oddId === optionId);

    const handleBetClick = () => {
        if (isSelected) {
            // Find the bet to remove
            const betToRemove = selectedBets.find(bet => bet.oddId === optionId);
            if (betToRemove) {
                dispatch(removeBet(betToRemove.id));
            }
        } else {
            // Create a properly formatted match object
            const formattedMatch = {
                id: matchData.id,
                team1: matchData.participants?.[0]?.name || 'Home',
                team2: matchData.participants?.[1]?.name || 'Away',
                starting_at: matchData.starting_at,
                participants: matchData.participants
            };

            // Create bet option object
            const betOption = {
                label,
                value,
                oddId: optionId,
                marketDescription,
                type: sectionType,
                handicapValue,
                halfIndicator,
                total,
                name
            };
            
            // Use the placeBet function from the hook with complete bet data
            placeBet(formattedMatch, betOption.label, betOption.value, betOption.type, betOption.oddId, {
                marketDescription: betOption.marketDescription,
                handicapValue: betOption.handicapValue,
                halfIndicator: betOption.halfIndicator,
                total: betOption.total,
                name: betOption.name
            });
        }
    };

    // Format the label to highlight the handicap value or over/under value
    const formattedLabel = () => {
        // For Team Total Goals market
        if (marketDescription === 'Team Total Goals') {
            return (
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="bg-white/20 px-1 rounded text-[9px]">{total || value}</span>
                </div>
            );
        }

        // For Correct Score market
        if (marketDescription === 'Correct Score') {
            return (
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="bg-white/20 px-1 rounded text-[9px]">{name}</span>
                </div>
            );
        }

        // For Clean Sheet market
        if (marketDescription === 'Clean Sheet') {
            return (
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="bg-white/20 px-1 rounded text-[9px]">{name}</span>
                </div>
            );
        }

        // For Specials market
        if (marketDescription === 'Specials') {
            return (
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="bg-white/20 px-1 rounded text-[9px]">{name}</span>
                </div>
            );
        }

        // For Last Match Corner market
        if (marketDescription === 'Last Match Corner' && matchData?.participants?.length >= 2) {
            if (label === '1') {
                return matchData.participants[0].name;
            } else if (label === '2') {
                return matchData.participants[1].name;
            }
        }

        // For Corner Match Bet markets
        if (sectionType === 'corner-match-bet' && matchData?.participants?.length >= 2) {
            if (label === '1') {
                return matchData.participants[0].name;
            } else if (label === '2') {
                return matchData.participants[1].name;
            } else if (label === 'Tie' || label === 'tie' || label === 'X') {
                return 'Draw';
            }
        }

        // For Team Corners market
        if (marketDescription === 'Team Corners' && matchData?.participants?.length >= 2) {
            if (label === '1') {
                return (
                    <div className="flex items-center gap-1">
                        <span>{matchData.participants[0].name}</span>
                        <span className="bg-white/20 px-1 rounded text-[9px]">{total}</span>
                    </div>
                );
            } else if (label === '2') {
                return (
                    <div className="flex items-center gap-1">
                        <span>{matchData.participants[1].name}</span>
                        <span className="bg-white/20 px-1 rounded text-[9px]">{total}</span>
                    </div>
                );
            }
        }

        // For Corners Race market
        if (marketDescription === 'Corners Race' && matchData?.participants?.length >= 2) {
            console.log('Corners Race Data:', { label, name }); // Debug log
            if (label === '1') {
                return (
                    <div className="flex items-center gap-1">
                        <span>{matchData.participants[0].name}</span>
                        <span className="bg-white/20 px-1 rounded text-[9px]">{name}</span>
                    </div>
                );
            } else if (label === '2') {
                return (
                    <div className="flex items-center gap-1">
                        <span>{matchData.participants[1].name}</span>
                        <span className="bg-white/20 px-1 rounded text-[9px]">{name}</span>
                    </div>
                );
            } else if (label === 'Neither') {
                return 'Neither';
            }
        }

        // For over/under options including Alternative Goal Line
        if (label.toLowerCase().startsWith('over') || label.toLowerCase().startsWith('under')) {
            const [type, ...values] = label.split(' ');
            const thresholds = values.join(' ').split(',').map(v => v.trim());
            
            return (
                <div className="flex items-center gap-1">
                    <span>{type}</span>
                    {thresholds.map((threshold, index) => (
                        <span key={index} className="bg-white/20 px-1 rounded text-[9px]">{threshold}</span>
                    ))}
                </div>
            );
        }

        // For To Score In Half markets
        if (halfIndicator) {
            return (
                <>
                    {label} <span className="bg-white/20 px-1 rounded text-[9px] ml-1">{halfIndicator}</span>
                </>
            );
        }

        // For Half Time Correct Score
        if (sectionType === 'half-time' && matchData?.participants) {
            // Extract team name and score
            const match = label.match(/^(.+?)\s+(\d+-\d+)$/);
            if (match) {
                const [_, team, score] = match;
                return (
                    <>
                        {team} <span className="bg-white/20 px-1 rounded text-[9px] ml-1">{score}</span>
                    </>
                );
            }
        }

        // For Asian Handicap and Alternative Asian Handicap markets
        if ((isHandicapOption || sectionType === 'asian-handicap' || sectionType === 'alternative-asian-handicap') && handicapValue) {
            return (
                <>
                    {label} <span className="bg-white/20 px-1 rounded text-[9px] ml-1">{handicapValue}</span>
                </>
            );
        }
        
        return label;
    };

    // Determine if this is a team name (for styling)
    const isTeamName = matchData?.participants && (
        label === matchData.participants[0]?.name || 
        label === matchData.participants[1]?.name || 
        label.includes(matchData.participants[0]?.name) || 
        label.includes(matchData.participants[1]?.name) ||
        (sectionType === 'corner-match-bet' && (label === '1' || label === '2'))
    );

    // Determine if this is a draw option
    const isDrawOption = label === 'Tie' || label === 'tie' || label === 'X' || label.toLowerCase().includes('draw');

    const getStyleClasses = () => {
        if (isResultOption || isHandicapOption || isHalfTimeOption || sectionType === 'corner-match-bet') {
            if (isTeamName) {
                return "bg-base hover:bg-base-dark";
            }
            // Only change draw color for full-time markets (not half-time)
            if (isDrawOption && !isHalfTimeOption) {
                return "bg-emerald-600 hover:bg-emerald-700";
            }
        }
        return "bg-base hover:bg-base-dark";
    };

    return (
        <Button
            className={`group relative px-2 py-1 text-center transition-all duration-200 active:scale-[0.98] betting-button ${getStyleClasses()}`}
            onClick={handleBetClick}
        >
            <div className="relative w-full flex justify-between items-center py-1 z-10">
                <div className="text-[12px] text-white font-medium transition-colors duration-200 leading-tight">
                    {formattedLabel()}
                </div>
                <div className="text-[12px] font-bold text-white transition-colors duration-200">
                    {value}
                </div>
            </div>
        </Button>
    );
};

// PlayerCardOption component to display player card options in a more compact way
const PlayerCardOption = ({ player, matchData }) => {
    const { createBetHandler } = useBetting();
    
    // Sort options by value (lowest odds first)
    const sortedOptions = [...player.options].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
    
    // Create transformed object for bet handler
    const transformedOBJ = {
        id: matchData.id,
        team1: matchData.participants[0].name,
        team2: matchData.participants[1].name,
        time: matchData.starting_at,
    };
    
    // Group options by action type (Booked, 1st Card, etc.)
    const optionsByType = {};
    player.options.forEach(option => {
        const actionType = option.action || option.label.split(' - ')[1] || 'Card';
        if (!optionsByType[actionType]) {
            optionsByType[actionType] = [];
        }
        optionsByType[actionType].push(option);
    });
    
    // Sort each group by odds value
    Object.values(optionsByType).forEach(options => {
        options.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
    });
    
    // Get all unique action types
    const actionTypes = Object.keys(optionsByType);
    
    return (
        <div className="flex flex-col gap-1 mb-2">
            <div className="text-xs font-medium text-gray-700 mb-1">{player.name}</div>
            {actionTypes.map((actionType, index) => {
                const option = optionsByType[actionType][0]; // Get the best odds for this action type
                return (
                    <Button
                        key={`${player.name}-${actionType}-${index}`}
                        className="group relative px-2 py-1 text-center transition-all duration-200 active:scale-[0.98] betting-button h-auto"
                        onClick={createBetHandler(transformedOBJ, option.label, option.value, 'player-cards', option.id)}
                    >
                        <div className="relative w-full flex flex-col justify-between z-10">
                            <div className="flex justify-between items-center">
                                <div className="text-[10px] text-white/80">
                                    {actionType}
                                </div>
                                <div className="text-[12px] font-bold text-white transition-colors duration-200">
                                    {option.value}
                                </div>
                            </div>
                        </div>
                    </Button>
                );
            })}
        </div>
    );
};

export default BettingTabs 

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

    // Debug logging
    console.log('🎯 BettingTabs received matchData:', matchData);
    console.log('🎯 BettingTabs odds_classification:', matchData?.odds_classification);
    console.log('🎯 BettingTabs betting_data:', matchData?.betting_data);

    // Get the betting data and classification
    const classification = matchData?.odds_classification || {
        categories: [{ id: 'all', label: 'All', odds_count: 0 }],
        classified_odds: {},
        stats: { total_categories: 0, total_odds: 0 }
    };

    // Use the categories from classification, sorted by priority
    const categories = useMemo(() => {
        const cats = classification.categories || [];
        console.log('🎯 BettingTabs categories:', cats);
        return [...cats].sort((a, b) => (a.priority || 99) - (b.priority || 99));
    }, [classification]);

    // Create tabs array with "All" and categories
    const tabs = useMemo(() => [
        { id: "all", label: "All" },
        ...categories.filter(cat => cat.id !== 'all').map(cat => ({
            id: cat.id,
            label: cat.label,
            odds_count: cat.odds_count
        }))
    ], [categories]);

    // Helper function to get data by category
    const getDataByCategory = useCallback((categoryId) => {
        const classifiedOdds = classification.classified_odds || {};
        
        if (categoryId === 'all') {
            // For 'all', use all categories from classified_odds
            return Object.entries(classifiedOdds)
                .filter(([id]) => id !== 'all')
                .map(([id, category]) => {
                    // Convert markets_data object into array of markets
                    const markets = Object.entries(category.markets_data || {}).map(([marketId, marketData]) => ({
                        id: marketId,
                        title: marketData.market_description,
                        type: marketData.market_id.toString(),
                        options: marketData.odds?.map(odd => ({
                            id: odd.id,
                            label: odd.label,
                            value: odd.value,
                            name: odd.name,
                            team: odd.team,
                            suspended: odd.suspended,
                            marketId: odd.market_id,
                            marketDescription: odd.market_description,
                            probability: odd.probability,
                            winning: odd.winning,
                            handicap: odd.handicap,
                            total:odd.total,
                            suspended:odd.suspended
                        }))
                    }));

                    return {
                        id,
                        label: category.label,
                        markets,
                        totalMarkets: markets.length,
                        priority: category.priority
                    };
                })
                .filter(group => group.markets?.length > 0)
                .sort((a, b) => (a.priority || 99) - (b.priority || 99));
        }

        // For specific category
        const categoryData = classifiedOdds[categoryId];
        if (!categoryData?.markets_data) return [];

        // Convert markets_data object into array of markets
        const markets = Object.entries(categoryData.markets_data || {}).map(([marketId, marketData]) => ({
            id: marketId,
            title: marketData.market_description,
            type: marketData.market_id.toString(),
            options: marketData.odds?.map(odd => ({
                id: odd.id,
                label: odd.label,
                value: odd.value,
                name: odd.name,
                team: odd.team,
                suspended: odd.suspended,
                marketId: odd.market_id,
                marketDescription: odd.market_description,
                probability: odd.probability,
                winning: odd.winning,
                handicap: odd.handicap,
                total:odd.total,
                suspended:odd.suspended
            }))
        }));

        return [{
            id: categoryId,
            label: categoryData.label,
            markets,
            totalMarkets: markets.length,
            priority: categoryData.priority
        }];
    }, [classification.classified_odds]);

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
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                {/* Tab navigation with scroll buttons */}
                <div className="mb-4 sm:mb-6 bg-white pb-2 pl-1 min-[400px]:pl-2 sm:pl-[13px] p-1">
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
                        <div className="overflow-hidden w-fit mx-4 min-[400px]:mx-8">
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
                                            className={`px-1.5 py-1.5 min-[400px]:px-2 sm:px-3 sm:py-1 font-normal cursor-pointer text-xs rounded-2xl sm:rounded-3xl whitespace-nowrap transition-all duration-200 flex-shrink-0 ${selectedTab === tab.id
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
            (options.some(opt => opt.label.toLowerCase().includes('draw')) ||
                options.every(opt => ['1x', 'x2', '12'].includes(opt.label.toLowerCase())) ||
                options.some(opt => opt.label.toLowerCase().includes('or'))) // Added for Double Chance detection
        
        // For over/under markets, always use 2 columns
        const isOverUnderMarket = options.length === 2 && 
            options.some(opt => opt.label.toLowerCase().includes('over')) && 
            options.some(opt => opt.label.toLowerCase().includes('under'));
        
        // For very small screens (< 500px), limit to max 2 columns for result markets
        if (isResultMarket) return "grid-cols-2 min-[800px]:grid-cols-3";
        if (isOverUnderMarket) return "grid-cols-1 min-[500px]:grid-cols-2";
        
        const optionsCount = options.length;
        if (optionsCount <= 2) return "grid-cols-1 min-[500px]:grid-cols-2";
        else if (optionsCount <= 4) return "grid-cols-1 min-[500px]:grid-cols-2 min-[800px]:grid-cols-4";
        else if (optionsCount <= 6) return "grid-cols-1 min-[500px]:grid-cols-2 min-[800px]:grid-cols-3";
        else return "grid-cols-1 min-[500px]:grid-cols-2 min-[800px]:grid-cols-3 lg:grid-cols-4";
    };

    // Helper function to sort result options in Home, Draw, Away order
    const sortResultOptions = (options, matchData) => {
        const homeTeam = matchData?.participants?.[0]?.name;
        const awayTeam = matchData?.participants?.[1]?.name;
        
        return options.sort((a, b) => {
            // Define the desired order: Home (1), Draw (X), Away (2)
            const getOrder = (option) => {
                const label = option.label?.toLowerCase();
                const name = option.name?.toLowerCase();
                
                // Check for home team (1)
                if (label === '1' || 
                    label === 'home' || 
                    name === 'home' ||
                    (homeTeam && (label === homeTeam.toLowerCase() || name === homeTeam.toLowerCase()))) {
                    return 1;
                }
                
                // Check for draw (X)
                if (label === 'x' || 
                    label === 'draw' || 
                    label === 'tie' ||
                    name === 'draw' ||
                    name === 'tie') {
                    return 2;
                }
                
                // Check for away team (2)
                if (label === '2' || 
                    label === 'away' ||
                    name === 'away' ||
                    (awayTeam && (label === awayTeam.toLowerCase() || name === awayTeam.toLowerCase()))) {
                    return 3;
                }
                
                // Default order for unknown options
                return 4;
            };
            
            return getOrder(a) - getOrder(b);
        });
    };

    // Render betting options
    const renderOptions = (options, section) => {
        // Special handling for result markets (1X2, Match Result, etc.)
        const isResultMarket = 
            section.title?.toLowerCase().includes('result') || 
            section.title?.toLowerCase().includes('winner') ||
            section.title?.toLowerCase().includes('1x2') ||
            section.title?.toLowerCase().includes('double chance');
        
        // Special handling for handicap markets (include Asian Line and generic "Line" markets like Cards Line)
        const isHandicapMarket = (() => {
            const t = section.title?.toLowerCase() || '';
            return t.includes('handicap') || t.includes('asian line') || t.includes('asian handicap') || t.includes(' line');
        })();
        
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
        
        // Special handling for Match Goals market (market_id: 4)
        const isMatchGoalsMarket = 
            section.title?.toLowerCase().includes('match goals') ||
            section.type === '4' ||
            (options.length === 2 && 
             options.some(opt => opt.label.toLowerCase().includes('over')) && 
             options.some(opt => opt.label.toLowerCase().includes('under')) &&
             options.some(opt => opt.total));
        
        // Special handling for Alternative Match Goals market (market_id: 5)
        const isAlternativeMatchGoalsMarket = 
            section.title?.toLowerCase().includes('alternative match goals') ||
            section.type === '5' ||
            (section.title?.toLowerCase().includes('alternative') && 
             section.title?.toLowerCase().includes('match goals'));
        
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

        // Special handling for Team Total Goals markets only (not individual exact goals markets)
        const isTeamTotalGoalsMarket = 
            section.title?.toLowerCase().includes('team total goals');
            
        // Special handling for Over/Under markets (Alternative Total Goals, Total Goals, etc.)
        // Exclude corners markets and Odd/Even from being treated as Total Goals markets
        const titleLower = section.title?.toLowerCase() || '';
        const isOddEvenMarket = titleLower.includes('odd/even') || titleLower.includes('odd even');
        const isTotalGoalsMarket = 
            !titleLower.includes('corners') && !isOddEvenMarket && (
                (titleLower.includes('total goals') && 
                 !titleLower.includes('exact total goals')) ||
                (options.length > 2 && 
                 options.some(opt => (opt.label || '').toLowerCase().includes('over')) && 
                 options.some(opt => (opt.label || '').toLowerCase().includes('under')))
            );

        // Use appropriate grid class based on market type
        const gridClass = isGoalScorerMarket && options.length === 3 ? "grid-cols-2 min-[800px]:grid-cols-3" : getGridClass(options);
        
        // Special rendering for Team Total Goals markets
        if (isTeamTotalGoalsMarket) {
            return renderTeamGoalMarketsOptions(options, section);
        }
        
        // Special rendering for Alternative Corners markets (Under | Exactly | Over partition)
        if (section.title?.toLowerCase().includes('alternative corners')) {
            return renderAlternativeCornersOptions(options, section);
        }
        
        // Special rendering for Exact Total Goals markets (no partition)
        if (section.title?.toLowerCase().includes('exact total goals')) {
            return renderTotalGoalsOptions(options, section);
        }
        
        // Special rendering for Total Goals markets (Over/Under partition)
        if (isTotalGoalsMarket) {
            return renderTotalGoalsOptions(options, section);
        }
        
        // Special rendering for Match Goals market (market_id: 4)
        if (isMatchGoalsMarket) {
            return renderMatchGoalsOptions(options, section);
        }
        
        // Special rendering for Alternative Match Goals market (market_id: 5)
        if (isAlternativeMatchGoalsMarket) {
            return renderMatchGoalsOptions(options, section);
        }
        
        // Special rendering for Clean Sheet markets (Yes/No partition)
        if (section.title?.toLowerCase().includes('clean sheet')) {
            return renderCleanSheetOptions(options, section);
        }
        
        // Special handling for correct score markets
        const isCorrectScoreMarket =
            section.title?.toLowerCase().includes('correct score');

        if (isCorrectScoreMarket) {
            // Render all correct score options in a simple grid showing only the score text
            return (
                <div className={`grid ${gridClass} gap-1`}>
                    {options.map((option, idx) => (
                                    <BettingOptionButton
                            key={`cs-${option.id || idx}`}
                            label={option.label}
                                        value={option.value}
                                        sectionType={section?.type || 'market'}
                                        optionId={option?.id}
                                        matchData={matchData}
                                        isResultOption={false}
                                        isHandicapOption={false}
                                        isHalfTimeOption={false}
                                        isOverUnderOption={false}
                                        isGoalScorerOption={false}
                                        handicapValue={option.handicap}
                                        halfIndicator={option.halfIndicator}
                                        thresholds={option.thresholds}
                                        total={option.total}
                                        name={option.name}
                                        marketDescription={section.title}
                                        suspended={option.suspended}
                                        marketId={option.marketId}
                                    />
                                ))}
                </div>
            );
        }
        
        // Group Over/Under by participant for player shots markets
        const isPlayerShots = section.title?.toLowerCase().includes("player's shots") || section.title?.toLowerCase().includes('shots on target');
        let renderedOptions = options;
        if (isPlayerShots) {
            const byPlayer = {};
            options.forEach(opt => {
                const playerName = typeof opt.name === 'string' ? opt.name : undefined;
                if (!playerName) return;
                if (!byPlayer[playerName]) byPlayer[playerName] = { over: null, under: null };
                const optLower = (opt.label || '').toLowerCase();
                const isSusp = Boolean(opt.suspended) || Number.isNaN(Number(opt.value));
                if (optLower.startsWith('over')) byPlayer[playerName].over = { ...opt, suspended: isSusp };
                else if (optLower.startsWith('under')) byPlayer[playerName].under = { ...opt, suspended: isSusp };
            });
            // Flatten keeping Over above Under for same player
            const flattened = [];
            Object.keys(byPlayer).forEach(player => {
                const pair = byPlayer[player];
                if (pair.over) flattened.push(pair.over);
                if (pair.under) flattened.push({ ...pair.under, suspended: pair.under.suspended });
            });
            if (flattened.length) renderedOptions = flattened;
        }

        return (
            <div className={`grid ${gridClass} gap-1`}>
                {/* Sort options for result markets to ensure Home, Draw, Away order */}
                {(isResultMarket ? sortResultOptions(renderedOptions, matchData) : renderedOptions).map((option, idx) => {
                    // For Correct Score, Corners Race, Winning Margin always use the score/race number/margin as name
                    let name;
                    if (section.title && section.title.toLowerCase().includes('correct score')) {
                        name = option.name;
                    } else if (section.title && section.title.toLowerCase().includes('corners race')) {
                        name = option.name;
                    } else if (section.title && section.title.toLowerCase().includes('winning margin')) {
                        name = option.name;
                    } else if ((option.label === '1' || option.label === '2') && matchData?.participants?.length >= 2
                               && !section.title.toLowerCase().includes('specials')
                               && !section.title.toLowerCase().includes('clean sheet')) {
                        // Only set name to team name for 1/2 if NOT Specials and NOT Clean Sheet
                        name = option.label === '1' ? matchData.participants[0].name : matchData.participants[1].name;
                    } else {
                        name = option.name;
                    }
                    return (
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
                            handicapValue={option.handicap}
                            halfIndicator={option.halfIndicator}
                            thresholds={option.thresholds}
                            total={option.total}
                            name={name}
                            marketDescription={section.title}
                            suspended={option.suspended}
                            marketId={option.marketId}
                        />
                    );
                })}
            </div>
        );
    };

    // Special rendering function for Total Goals markets (Over/Under partition)
    const renderTotalGoalsOptions = (options, section) => {
        // For Exact Total Goals, show all options in a single grid (no partition)
        if (section.title?.toLowerCase().includes('exact total goals')) {
            return (
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-1">
                    {options.map((option, idx) => {
                        return (
                            <BettingOptionButton
                                key={`exact-total-${option.label}-${idx}`}
                                label={option.label}
                                value={option.value}
                                sectionType={section?.type || 'market'}
                                optionId={option?.id}
                                matchData={matchData}
                                isResultOption={false}
                                isHandicapOption={false}
                                isHalfTimeOption={false}
                                isOverUnderOption={false}
                                isGoalScorerOption={false}
                                handicapValue={option.handicap}
                                halfIndicator={option.halfIndicator}
                                thresholds={option.thresholds}
                                total={option.total}
                                name={option.name}
                                marketDescription={section.title}
                                suspended={option.suspended}
                                marketId={option.marketId}
                            />
                        );
                    })}
                </div>
            );
        }
        
        // For other Total Goals markets, separate options by Over/Under
        const overOptions = options.filter(opt => 
            opt.label && opt.label.toLowerCase().includes('over')
        );
        const underOptions = options.filter(opt => 
            opt.label && opt.label.toLowerCase().includes('under')
        );

        // Fallback: if neither Over nor Under is present (e.g., Odd/Even), render a simple grid
        if (overOptions.length === 0 && underOptions.length === 0) {
            return (
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-1">
                    {options.map((option, idx) => (
                        <BettingOptionButton
                            key={`tg-generic-${option.label}-${idx}`}
                            label={option.label}
                            value={option.value}
                            sectionType={section?.type || 'market'}
                            optionId={option?.id}
                            matchData={matchData}
                            isResultOption={false}
                            isHandicapOption={false}
                            isHalfTimeOption={false}
                            isOverUnderOption={false}
                            isGoalScorerOption={false}
                            handicapValue={option.handicap}
                            halfIndicator={option.halfIndicator}
                            thresholds={option.thresholds}
                            total={option.total}
                            name={option.name}
                            marketDescription={section.title}
                            suspended={option.suspended}
                            marketId={option.marketId}
                        />
                    ))}
                </div>
            );
        }
        
        return (
            <div className="flex flex-col min-[640px]:flex-row gap-2">
                {/* Over Options (Top on mobile, Left on desktop) */}
                <div className="flex-1">
                    
                    <div className="grid grid-cols-1 gap-1">
                        {overOptions.map((option, idx) => {
                            return (
                                <BettingOptionButton
                                    key={`over-${option.label}-${idx}`}
                                    label={option.label}
                                    value={option.value}
                                    sectionType={section?.type || 'market'}
                                    optionId={option?.id}
                                    matchData={matchData}
                                    isResultOption={false}
                                    isHandicapOption={false}
                                    isHalfTimeOption={false}
                                    isOverUnderOption={true}
                                    isGoalScorerOption={false}
                                    handicapValue={option.handicap}
                                    halfIndicator={option.halfIndicator}
                                    thresholds={option.thresholds}
                                    total={option.total}
                                    name={option.name}
                                    marketDescription={section.title}
                                    suspended={option.suspended}
                                    marketId={option.marketId}
                                />
                            );
                        })}
                    </div>
                </div>
                
                {/* Visual partition - horizontal line on mobile, vertical line on desktop */}
                <div className="h-0.5 bg-gray-400 mx-2 rounded-full min-[640px]:h-auto min-[640px]:w-0.5"></div>
                
                {/* Under Options (Bottom on mobile, Right on desktop) */}
                <div className="flex-1">
                   
                    <div className="grid grid-cols-1 gap-1">
                        {underOptions.map((option, idx) => {
                            return (
                                <BettingOptionButton
                                    key={`under-${option.label}-${idx}`}
                                    label={option.label}
                                    value={option.value}
                                    sectionType={section?.type || 'market'}
                                    optionId={option?.id}
                                    matchData={matchData}
                                    isResultOption={false}
                                    isHandicapOption={false}
                                    isHalfTimeOption={false}
                                    isOverUnderOption={true}
                                    isGoalScorerOption={false}
                                    handicapValue={option.handicap}
                                    halfIndicator={option.halfIndicator}
                                    thresholds={option.thresholds}
                                    total={option.total}
                                    name={option.name}
                                    marketDescription={section.title}
                                    suspended={option.suspended}
                                    marketId={option.marketId}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    // Special rendering function for Alternative Corners markets (Under | Exactly | Over partition)
    const renderAlternativeCornersOptions = (options, section) => {
        // Separate options by type
        const underOptions = options.filter(opt => 
            opt.label && opt.label.toLowerCase().includes('under')
        );
        const exactlyOptions = options.filter(opt => 
            opt.label && opt.label.toLowerCase().includes('exactly')
        );
        const overOptions = options.filter(opt => 
            opt.label && opt.label.toLowerCase().includes('over')
        );
        
        return (
            <div className="flex flex-col min-[640px]:flex-row gap-2">
                {/* Under Options (Top on mobile, Left on desktop) */}
                <div className="flex-1">
                    <div className="grid grid-cols-1 gap-1">
                        {underOptions.map((option, idx) => (
                            <BettingOptionButton
                                key={`under-${option.label}-${idx}`}
                                label={option.label}
                                value={option.value}
                                sectionType={section?.type || 'market'}
                                optionId={option?.id}
                                matchData={matchData}
                                isResultOption={false}
                                isHandicapOption={false}
                                isHalfTimeOption={false}
                                isOverUnderOption={false}
                                isGoalScorerOption={false}
                                handicapValue={option.handicap}
                                halfIndicator={option.halfIndicator}
                                thresholds={option.thresholds}
                                total={option.total}
                                name={option.name}
                                marketDescription={section.title}
                                suspended={option.suspended}
                                marketId={option.marketId}
                            />
                        ))}
                    </div>
                </div>
                
                {/* Visual partition - horizontal line on mobile, vertical line on desktop */}
                <div className="h-0.5 bg-gray-400 mx-2 rounded-full min-[640px]:h-auto min-[640px]:w-0.5 min-[640px]:mx-1"></div>
                
                {/* Exactly Options (Middle on mobile, Center on desktop) */}
                <div className="flex-1">
                    <div className="grid grid-cols-1 gap-1">
                        {exactlyOptions.map((option, idx) => (
                            <BettingOptionButton
                                key={`exactly-${option.label}-${idx}`}
                                label={option.label}
                                value={option.value}
                                sectionType={section?.type || 'market'}
                                optionId={option?.id}
                                matchData={matchData}
                                isResultOption={false}
                                isHandicapOption={false}
                                isHalfTimeOption={false}
                                isOverUnderOption={false}
                                isGoalScorerOption={false}
                                handicapValue={option.handicap}
                                halfIndicator={option.halfIndicator}
                                thresholds={option.thresholds}
                                total={option.total}
                                name={option.name}
                                marketDescription={section.title}
                                suspended={option.suspended}
                                marketId={option.marketId}
                            />
                        ))}
                    </div>
                </div>
                
                {/* Visual partition - horizontal line on mobile, vertical line on desktop */}
                <div className="h-0.5 bg-gray-400 mx-2 rounded-full min-[640px]:h-auto min-[640px]:w-0.5 min-[640px]:mx-1"></div>
                
                {/* Over Options (Bottom on mobile, Right on desktop) */}
                <div className="flex-1">
                    <div className="grid grid-cols-1 gap-1">
                        {overOptions.map((option, idx) => (
                            <BettingOptionButton
                                key={`over-${option.label}-${idx}`}
                                label={option.label}
                                value={option.value}
                                sectionType={section?.type || 'market'}
                                optionId={option?.id}
                                matchData={matchData}
                                isResultOption={false}
                                isHandicapOption={false}
                                isHalfTimeOption={false}
                                isOverUnderOption={false}
                                isGoalScorerOption={false}
                                handicapValue={option.handicap}
                                halfIndicator={option.halfIndicator}
                                thresholds={option.thresholds}
                                total={option.total}
                                name={option.name}
                                marketDescription={section.title}
                                suspended={option.suspended}
                                marketId={option.marketId}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // Special rendering function for Team Total Goals markets only
    const renderTeamGoalMarketsOptions = (options, section) => {
        const team1 = matchData?.participants?.[0]?.name || 'Team 1';
        const team2 = matchData?.participants?.[1]?.name || 'Team 2';
        
        // For Team Total Goals markets, filter by label "1" or "2"
        const team1Options = options.filter(opt => opt.label === '1');
        const team2Options = options.filter(opt => opt.label === '2');
        
        // Fallback: if no options found for either team, show all options in a single grid
        if (team1Options.length === 0 && team2Options.length === 0) {
            return (
                <div className="grid grid-cols-2 gap-1">
                    {options.map((option, idx) => {
                        const name = option.total || option.name;
                        return (
                            <BettingOptionButton
                                key={`fallback-${option.label}-${idx}`}
                                label={option.label}
                                value={option.value}
                                sectionType={section?.type || 'market'}
                                optionId={option?.id}
                                matchData={matchData}
                                isResultOption={false}
                                isHandicapOption={false}
                                isHalfTimeOption={false}
                                isOverUnderOption={false}
                                isGoalScorerOption={false}
                                handicapValue={option.handicap}
                                halfIndicator={option.halfIndicator}
                                thresholds={option.thresholds}
                                total={option.total}
                                name={name}
                                marketDescription={section.title}
                                suspended={option.suspended}
                                marketId={option.marketId}
                            />
                        );
                    })}
                </div>
            );
        }
        
        return (
            <div className="flex flex-col min-[640px]:flex-row gap-2">
                {/* Team 1 (Top on mobile, Left on desktop) */}
                <div className="flex-1">
                    <div className="text-sm text-gray-700 font-semibold  mb-2 px-2 text-center  py-1 rounded">{team1}</div>
                    <div className="grid grid-cols-1 gap-1">
                        {team1Options.map((option, idx) => {
                            const name = option.total || option.name;
                            return (
                                <BettingOptionButton
                                    key={`team1-${option.label}-${idx}`}
                                    label={option.label}
                                    value={option.value}
                                    sectionType={section?.type || 'market'}
                                    optionId={option?.id}
                                    matchData={matchData}
                                    isResultOption={false}
                                    isHandicapOption={false}
                                    isHalfTimeOption={false}
                                    isOverUnderOption={false}
                                    isGoalScorerOption={false}
                                    handicapValue={option.handicap}
                                    halfIndicator={option.halfIndicator}
                                    thresholds={option.thresholds}
                                    total={option.total}
                                    name={name}
                                    marketDescription={section.title}
                                    suspended={option.suspended}
                                    marketId={option.marketId}
                                />
                            );
                        })}
                    </div>
                </div>
                
                {/* Visual partition - horizontal line on mobile, vertical line on desktop */}
                <div className="h-0.5 bg-gray-400 mx-2 rounded-full min-[640px]:h-auto min-[640px]:w-0.5"></div>
                
                {/* Team 2 (Bottom on mobile, Right on desktop) */}
                <div className="flex-1">
                    <div className="text-sm text-gray-700 font-semibold  mb-2 px-2 text-center  py-1 rounded">{team2}</div>
                    <div className="grid grid-cols-1 gap-1">
                        {team2Options.map((option, idx) => {
                            const name = option.total || option.name;
                            return (
                                <BettingOptionButton
                                    key={`team2-${option.label}-${idx}`}
                                    label={option.label}
                                    value={option.value}
                                    sectionType={section?.type || 'market'}
                                    optionId={option?.id}
                                    matchData={matchData}
                                    isResultOption={false}
                                    isHandicapOption={false}
                                    isHalfTimeOption={false}
                                    isOverUnderOption={false}
                                    isGoalScorerOption={false}
                                    handicapValue={option.handicap}
                                    halfIndicator={option.halfIndicator}
                                    thresholds={option.thresholds}
                                    total={option.total}
                                    name={name}
                                    marketDescription={section.title}
                                    suspended={option.suspended}
                                    marketId={option.marketId}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    // Special rendering function for Match Goals market (market_id: 4)
    const renderMatchGoalsOptions = (options, section) => {
        // Get the total value from the first option that has it
        const totalValue = options.find(opt => opt.total)?.total || '0';
        
        return (
            <div className="grid grid-cols-2 gap-1">
                {options.map((option, idx) => {
                    // Create the label with the total value
                    const labelWithTotal = `${option.label} ${totalValue}`;
                    
                    return (
                        <BettingOptionButton
                            key={`match-goals-${option.label}-${idx}`}
                            label={labelWithTotal}
                            value={option.value}
                            sectionType={section?.type || 'market'}
                            optionId={option?.id}
                            matchData={matchData}
                            isResultOption={false}
                            isHandicapOption={false}
                            isHalfTimeOption={false}
                            isOverUnderOption={true}
                            isGoalScorerOption={false}
                            handicapValue={option.handicap}
                            halfIndicator={option.halfIndicator}
                            thresholds={option.thresholds}
                            total={option.total}
                            name={option.name}
                            marketDescription={section.title}
                            suspended={option.suspended}
                            marketId={option.marketId}
                        />
                    );
                })}
            </div>
        );
    };

    // Special rendering function for Clean Sheet markets (Yes/No partition)
    const renderCleanSheetOptions = (options, section) => {
        const team1 = matchData?.participants?.[0]?.name || 'Team 1';
        const team2 = matchData?.participants?.[1]?.name || 'Team 2';
        
        // Separate options by Yes/No
        const yesOptions = options.filter(opt => opt.name === 'Yes');
        const noOptions = options.filter(opt => opt.name === 'No');
        
        return (
            <div className="flex flex-col min-[640px]:flex-row gap-2">
                {/* No Options (Top on mobile, Left on desktop) */}
                <div className="flex-1">
                   
                    <div className="grid grid-cols-1 gap-1">
                        {yesOptions.map((option, idx) => {
                            return (
                                <BettingOptionButton
                                    key={`no-${option.label}-${idx}`}
                                    label={option.label}
                                    value={option.value}
                                    sectionType={section?.type || 'market'}
                                    optionId={option?.id}
                                    matchData={matchData}
                                    isResultOption={false}
                                    isHandicapOption={false}
                                    isHalfTimeOption={false}
                                    isOverUnderOption={false}
                                    isGoalScorerOption={false}
                                    handicapValue={option.handicap}
                                    halfIndicator={option.halfIndicator}
                                    thresholds={option.thresholds}
                                    total={option.total}
                                    name={option.name}
                                    marketDescription={section.title}
                                    suspended={option.suspended}
                                    marketId={option.marketId}
                                />
                            );
                        })}
                    </div>
                </div>
                
                {/* Yes Options (Bottom on mobile, Right on desktop) */}
                <div className="flex-1">
                   
                    <div className="grid grid-cols-1 gap-1">
                        {noOptions.map((option, idx) => {
                            return (
                                <BettingOptionButton
                                    key={`yes-${option.label}-${idx}`}
                                    label={option.label}
                                    value={option.value}
                                    sectionType={section?.type || 'market'}
                                    optionId={option?.id}
                                    matchData={matchData}
                                    isResultOption={false}
                                    isHandicapOption={false}
                                    isHalfTimeOption={false}
                                    isOverUnderOption={false}
                                    isGoalScorerOption={false}
                                    handicapValue={option.handicap}
                                    halfIndicator={option.halfIndicator}
                                    thresholds={option.thresholds}
                                    total={option.total}
                                    name={option.name}
                                    marketDescription={section.title}
                                    suspended={option.suspended}
                                    marketId={option.marketId}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    // Render market sections
    const renderSections = (category) => {
        // Detect if this is a player-based market (Player Shots, Player Shots on Target, Goalscorer, etc.)
        const playerKeywords = ["player", "goalscorer", "goal scorer", "scorer"];
        const isPlayerCategory = playerKeywords.some(keyword => category.label.toLowerCase().includes(keyword));
        // Also check market descriptions for player-based markets
        const isPlayerMarket = isPlayerCategory || (
            category.markets.length > 0 &&
            category.markets.some(section =>
                playerKeywords.some(keyword => (section.title || "").toLowerCase().includes(keyword))
            )
        );

        // Only group if ALL options have a valid player name (string, not a number/threshold)
        let allOptionsHavePlayerName = true;
        if (isPlayerMarket) {
            for (const section of category.markets) {
                for (const option of section.options) {
                    if (!option.name || typeof option.name !== 'string' || !isNaN(Number(option.name)) || option.name === option.label) {
                        allOptionsHavePlayerName = false;
                        break;
                    }
                }
                if (!allOptionsHavePlayerName) break;
            }
        }

        if (isPlayerMarket && allOptionsHavePlayerName) {
            // Group all options by player name
            const playerMap = {};
            category.markets.forEach(section => {
                section.options.forEach(option => {
                    const playerName = option.name;
                    if (!playerMap[playerName]) {
                        playerMap[playerName] = [];
                    }
                    playerMap[playerName].push(option);
                });
            });
            // If we found any player grouping, render it using PlayerCardOption
            if (Object.keys(playerMap).length > 0) {
                return (
                    <div className="grid grid-cols-1 gap-3">
                        {Object.entries(playerMap).map(([playerName, options]) => (
                            <PlayerCardOption key={playerName} player={{ name: playerName, options }} matchData={matchData} />
                        ))}
                    </div>
                );
            }
        }
        // Fallback: standard rendering for non-player markets or if not all options have a valid player name
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
    suspended,
    extraClassName,
    ...props 
}) => {
    const { addBetToSlip } = useBetting();
    const dispatch = useDispatch();
    const selectedBets = useSelector(state => state.betSlip.bets);
    const isSelected = selectedBets && selectedBets.some((bet) => bet.oddId === optionId);
    // Treat invalid/missing odds values as suspended as well
    const numericValue = typeof value === 'number' ? value : Number(value);
    const isValueInvalid = Number.isNaN(numericValue) || !Number.isFinite(numericValue);
    const isSuspended = Boolean(suspended) || isValueInvalid;

    // --- CONFLICTING BET LOGIC ---
    // Helper: get marketId and matchId for this option
    const thisMarketId = props.marketId || optionId?.toString().split('-')[0] || null;
    const thisMatchId = matchData?.id;
    // Try to get marketId from props or fallback to marketDescription+type
    function getMarketKey(bet) {
        // Prefer explicit marketId if present
        if (bet.marketId) return bet.marketId;
        // Fallback: use marketDescription + type
        return (bet.marketDescription || '') + '|' + (bet.type || '');
    }
    const thisMarketKey = (marketDescription || '') + '|' + (sectionType || '');
    // Find if user has a bet on this market for this match (but not this odd)
    const conflictingBet = selectedBets && selectedBets.find(
        bet => bet.match.id === thisMatchId && getMarketKey(bet) === thisMarketKey && bet.oddId !== optionId
    );
    // If user has a bet on this market for this match, disable this button (unless it's the same odd)
    const isConflicting = Boolean(conflictingBet);
    // --- END CONFLICTING BET LOGIC ---

    const handleBetClick = () => {
        // Don't allow betting on suspended odds
        if (isSuspended) {
            return;
        }
        // Don't allow betting on conflicting odds
        if (isConflicting) {
            return;
        }
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
                name,
                marketId: props.marketId // Include marketId from props
            };
            // Only add to slip, do not call backend
            addBetToSlip(formattedMatch, betOption.label, betOption.value, betOption.type, betOption.oddId, {
                marketDescription: betOption.marketDescription,
                handicapValue: betOption.handicapValue,
                halfIndicator: betOption.halfIndicator,
                total: betOption.total,
                name: betOption.name,
                marketId: betOption.marketId // Pass marketId to bet slip
            });
        }
    };

    // Format the label to highlight the handicap value or over/under value
    const formattedLabel = () => {
        const team1 = matchData?.participants?.[0]?.name;
        const team2 = matchData?.participants?.[1]?.name;

        // For Correct Score markets: show ONLY the score text (no team name)
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('correct score') &&
            name
        ) {
            return (
                <span className="value">
                    <span className="value-main">{name}</span>
                </span>
            );
        }

        // For Corners Race markets: show main label and the race number as a badge if name is present
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('corners race') &&
            name
        ) {
            let mainLabel;
            if (label === '1') {
                mainLabel = team1;
            } else if (label === '2') {
                mainLabel = team2;
            } else {
                mainLabel = label;
            }
            return (
                <div className="flex items-center gap-1">
                    <span>{mainLabel}</span>
                    <span className="bg-white/30 px-1 rounded text-[8px] min-[400px]:text-[9px]">{name}</span>
                </div>
            );
        }

        // For 'Time of' markets: show team name and handicap as badge if present
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('time of') &&
            (label === '1' || label === '2') &&
            handicapValue
        ) {
            const teamName = label === '1' ? team1 : team2;
            return (
                <div className="flex items-center gap-1">
                    <span>{teamName}</span>
                    <span className="bg-white/30 px-1 rounded text-[8px] min-[400px]:text-[9px]">{handicapValue}</span>
                </div>
            );
        }

        // For Winning Margin markets: show team name and name as badge if present
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('winning margin') &&
            (label === '1' || label === '2') &&
            name
        ) {
            const teamName = label === '1' ? team1 : team2;
            return (
                <div className="flex items-center gap-1">
                    <span>{teamName}</span>
                    <span className="bg-gray-500 px-1 rounded text-[8px] min-[400px]:text-[9px]">{name}</span>
                </div>
            );
        }

        // For Exact Goals markets: show the full label (team name + goal count)
        if (
            marketDescription &&
            (marketDescription.toLowerCase().includes('home team exact goals') ||
             marketDescription.toLowerCase().includes('away team exact goals'))
        ) {
            return (
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                </div>
            );
        }

        // For Total Cards markets (e.g., Total Red Cards, Total Yellow Cards): avoid duplicate totals
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('total') &&
            marketDescription.toLowerCase().includes('card') &&
            !marketDescription.toLowerCase().includes('team')
        ) {
            const l = String(label || '').toLowerCase();
            if (total && (l.startsWith('over') || l.startsWith('under') || l.startsWith('exactly'))) {
                const base = l.startsWith('over') ? 'Over' : l.startsWith('under') ? 'Under' : 'Exactly';
                return <span>{base} {total}</span>;
            }
            return <span>{label}</span>;
        }

        // For Team Total Cards (and generic Total Cards - <Team>) show label once (avoid duplicate totals)
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('total cards')
        ) {
            // Force canonical "Over X.X" / "Under X.X" rendering to prevent duplicates
            const l = String(label || '').toLowerCase();
            if (total && (l.startsWith('over') || l.startsWith('under'))) {
                const base = l.startsWith('over') ? 'Over' : 'Under';
                return <span>{base} {total}</span>;
            }
            return <span>{label}</span>;
        }

        // For Total Goals markets (Alternative Total Goals, etc.): show the full label
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('total goals') &&
            !marketDescription.toLowerCase().includes('team total goals')
        ) {
            // For 'Alternative Total Goals', show only 'Over X.X' or 'Under X.X'
            if (marketDescription.toLowerCase().includes('alternative total goals') && (label === 'Over' || label === 'Under') && total) {
                return (
                    <span>{label} {total}</span>
                );
            }
            // For markets with label "Over"/"Under" and total field, combine them
            if ((label === 'Over' || label === 'Under') && total) {
                // If name is "1" or "2", show team name instead
                let teamName = name;
                if (name === '1') {
                    teamName = matchData?.participants?.[0]?.name || 'Home Team';
                } else if (name === '2') {
                    teamName = matchData?.participants?.[1]?.name || 'Away Team';
                }
                // Render as plain text for combined markets (e.g., Result / Total Goals)
                return (
                    <span>{teamName} / {label} {total}</span>
                );
            }
            // For other cases, just show the label
            return (
                <span>{label}</span>
            );
        }

        // Special handling for Over/Under markets that need to show total values (avoid duplicating total)
        if (
            (label === 'Over' || label === 'Under') && 
            total && 
            (
                marketDescription?.toLowerCase().includes('match goals') ||
                marketDescription?.toLowerCase().includes('alternative match goals') ||
                marketDescription?.toLowerCase().includes('1st half goals') ||
                marketDescription?.toLowerCase().includes('first half goals') ||
                marketDescription?.toLowerCase().includes('2nd half goals') ||
                marketDescription?.toLowerCase().includes('second half goals') ||
                marketDescription?.toLowerCase().includes('corners over') ||
                marketDescription?.toLowerCase().includes('corners over / under') ||
                marketDescription?.toLowerCase().includes('first 10 minutes goals')
            )
        ) {
            return (
                <span>{label} {total}</span>
            );
        }

        // For Team Total Goals markets: show team name and total ONCE as badge
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('team total goals') &&
            (label === '1' || label === '2') &&
            total
        ) {
            const teamName = label === '1' ? team1 : team2;
            return (
                <div className="flex items-center gap-1">
                    <span>{teamName}</span>
                    {/* Show total only once: suppress if label already includes the number */}
                    {!String(label).includes(String(total)) && (
                        <span className="bg-white/30 px-1 rounded text-[8px] min-[400px]:text-[9px]">{total}</span>
                    )}
                </div>
            );
        }

        // For Corners markets: normalize to "Over X.X" / "Under X.X" / "Exactly X.X" once
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('corners') &&
            total
        ) {
            const l = String(label || '').toLowerCase();
            if (l.startsWith('over') || l.startsWith('under') || l.startsWith('exactly')) {
                const base = l.startsWith('over') ? 'Over' : l.startsWith('under') ? 'Under' : 'Exactly';
                return <span>{base} {total}</span>;
            }
        }

        // For any 'team' market: show team name and total as badge if total is present
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('team') &&
            (label === '1' || label === '2') &&
            total
        ) {
            const teamName = label === '1' ? team1 : team2;
            return (
                <div className="flex items-center gap-1">
                    <span>{teamName}</span>
                    <span className="bg-white/30 px-1 rounded text-[8px] min-[400px]:text-[9px]">{total}</span>
                </div>
            );
        }

        // 2. Handicap/Line markets: show team name or tie/draw and line/handicap value as badge (including "Line" markets in Other category)
        if (
            marketDescription &&
            (marketDescription.toLowerCase().includes('handicap') || marketDescription.toLowerCase().includes('asian line') || marketDescription.toLowerCase().includes('asian handicap') || marketDescription.toLowerCase().includes(' line') || marketDescription.toLowerCase() === 'line') &&
            handicapValue !== undefined &&
            handicapValue !== null &&
            handicapValue !== ''
        ) {
            let mainLabel;
            if (label === '1') {
                mainLabel = team1;
            } else if (label === '2') {
                mainLabel = team2;
            } else if (
                label &&
                (label.trim().toLowerCase() === 'tie' ||
                 label.trim().toLowerCase() === 'x' ||
                 label.trim().toLowerCase() === 'draw')
            ) {
                // Use "Tie" or "Draw" as the main label
                mainLabel = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
            } else {
                mainLabel = label;
            }
            return (
                <div className="flex items-center gap-1">
                    <span>{mainLabel}</span>
                    <span className="bg-white/20 px-1 rounded text-[8px] min-[400px]:text-[9px]">{handicapValue}</span>
                </div>
            );
        }

        // For Clean Sheet markets: show team name and "Yes"/"No" as badge
        if (
            marketDescription &&
            marketDescription.toLowerCase().includes('clean sheet') &&
            (label === '1' || label === '2') &&
            name
        ) {
            const teamName = label === '1' ? team1 : team2;
            return (
                <div className="flex items-center gap-1">
                    <span>{teamName}</span>
                    <span className="bg-white/20 px-1 rounded text-[8px] min-[400px]:text-[9px]">{name}</span>
                </div>
            );
        }

        // Player-based markets (e.g., To Get a Card, Player's shots on target)
        if (
            marketDescription &&
            (
                marketDescription.toLowerCase().includes('to get a card') ||
                marketDescription.toLowerCase().includes('to be booked') ||
                marketDescription.toLowerCase().includes('player cards') ||
                marketDescription.toLowerCase().includes("player's shots") ||
                marketDescription.toLowerCase().includes('shots on target')
            ) &&
            typeof name === 'string' && name && name.toLowerCase() !== 'yes' && name.toLowerCase() !== 'no'
        ) {
            // Compose: Player Name + threshold for Over/Under when present
            if ((label === 'Over' || label === 'Under') && total) {
                return <span>{name} — {label} {total}</span>;
            }
            return <span>{name}</span>;
        }

        // For generic markets: show team name and name as badge if name is a string and not the team name
        if (
            (label === '1' || label === '2') &&
            typeof name === 'string' &&
            name !== (label === '1' ? team1 : team2)
        ) {
            const teamName = label === '1' ? team1 : team2;
            return (
                <div className="flex items-center gap-1">
                    <span>{teamName}</span>
                    <span className="bg-white/20 px-1 rounded text-[8px] min-[400px]:text-[9px]">{name}</span>
                </div>
            );
        }

        // 4. For all other markets, if label and name are present and label !== name, show both
        if (label && name && name !== null && label !== name) {
            return (
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="bg-white/20 px-1 rounded text-[8px] min-[400px]:text-[9px]">{name}</span>
                </div>
            );
        }
        // Fallback: just show label
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
        // If suspended, use gray styling and disable hover effects
        if (isSuspended) {
            return "bg-gray-400 cursor-not-allowed opacity-60";
        }
        
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
            className={`group relative px-1 min-[500px]:px-2 py-1 text-center transition-all duration-200 ${!isSuspended && !isConflicting ? 'active:scale-[0.98]' : ''} betting-button ${getStyleClasses()} ${extraClassName} min-h-[32px] min-[400px]:min-h-[36px]`}
            onClick={handleBetClick}
            disabled={isSuspended || isConflicting}
            title={isSuspended ? 'This odd is suspended' : isConflicting ? 'You already have a bet on another outcome in this market' : ''}
        >
            <div className="relative w-full flex flex-row justify-between items-center py-1 z-10 gap-1">
                <div className="text-[10px] min-[500px]:text-[12px] text-white font-medium transition-colors duration-200 leading-tight flex-1 text-left break-words truncate">
                    {formattedLabel()}
                    {isSuspended && <span className="ml-1 text-[9px] min-[500px]:text-[10px] opacity-80">(Suspended)</span>}
                    {isConflicting && !isSuspended && (
                        <span className="ml-1 text-[9px] min-[500px]:text-[10px] opacity-80 text-yellow-300">(Conflicting bet)</span>
                    )}
                </div>
                <div className="text-[10px] min-[500px]:text-[12px] font-bold text-white transition-colors duration-200 flex-shrink-0 text-right">
                    {isSuspended || isConflicting ? '--' : value}
                </div>
            </div>
        </Button>
    );
};

const PlayerCardOption = ({ player, matchData }) => {
    const { createBetHandler } = useBetting();

    // Detect if this is a player card market (label contains ' - ')
    const isPlayerCardMarket = player.options.some(option => option.label.includes(' - '));

    if (isPlayerCardMarket) {
        // Old logic for player card markets
        // Sort options by value (lowest odds first)
        const sortedOptions = [...player.options].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
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
                            onClick={createBetHandler({
                                id: matchData.id,
                                team1: matchData.participants[0].name,
                                team2: matchData.participants[1].name,
                                time: matchData.starting_at,
                            }, option.label, option.value, 'player-cards', option.id, {
                                marketId: option.marketId,
                                name: player.name,
                                marketDescription: option.market_description || 'Player Cards'
                            })}
                        >
                            <div className="relative w-full flex flex-col justify-between z-10">
                                <div className="flex justify-between items-center">
                                    <div className="text-[12px] text-white/80">
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
    } else {
        // For non-card player markets (e.g., Player Shots), render with BettingOptionButton to respect suspension and formatting
        // Determine grid columns based on number of options with responsive design
        const gridCols = player.options.length > 2 ? 'grid-cols-1 min-[400px]:grid-cols-2 min-[500px]:grid-cols-3' : 'grid-cols-1 min-[400px]:grid-cols-2';
        return (
            <div className="flex flex-col gap-1 rounded-none mb-2 border border-gray-200  p-3 bg-white">
                <div className="text-sm font-medium text-gray-700 mb-1">{player.name}</div>
                <div className={`grid ${gridCols} gap-1`}>
                    {player.options.map((option, idx) => (
                        <BettingOptionButton
                            key={`${player.name}-${option.label}-${idx}`}
                            label={option.label}
                            value={option.value}
                            sectionType={'player'}
                            optionId={option?.id}
                            matchData={matchData}
                            isResultOption={false}
                            isHandicapOption={false}
                            isHalfTimeOption={false}
                            isOverUnderOption={true}
                            isGoalScorerOption={false}
                            handicapValue={option.handicap}
                            halfIndicator={option.halfIndicator}
                            thresholds={option.thresholds}
                            total={option.total}
                            name={player.name}
                            marketDescription={option.market_description || "Player's shots on target"}
                            suspended={Boolean(option.suspended) || Number.isNaN(Number(option.value))}
                            marketId={option.marketId}
                        />
                    ))}
                </div>
            </div>
        );
    }
};

export default BettingTabs 

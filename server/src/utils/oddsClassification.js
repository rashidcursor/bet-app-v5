// Simple odds classification helper
const classifyOdds = (oddsData) => {
  // Log the original data structure to understand what we're working with
  console.log("Original odds data structure:", JSON.stringify(oddsData, null, 2).substring(0, 1000) + "...");
  
  // Define category mappings based on your frontend structure
  const categories = {
    "pre-packs": {
      id: "pre-packs",
      label: "Pre-packs",
      keywords: [
        "pre-pack",
        "prepack",
        "pre-packs",
        "prepacks",
        "combo",
        "special pack",
      ],
      markets: [], // Add market IDs if available
      priority: 1,
    },
    "full-time": {
      id: "full-time",
      label: "Full Time",
      keywords: [
        "full time",
        "match result",
        "1x2",
        "winner",
        "moneyline",
        "result",
        "final result",
      ],
      markets: [1, 52, 13, 14, 80],
      priority: 2,
    },
    "player-shots-on-target": {
      id: "player-shots-on-target",
      label: "Player Shots on Target",
      keywords: ["shots on target", "player shots on target"],
      markets: [],
      priority: 3,
    },
    "player-shots": {
      id: "player-shots",
      label: "Player Shots",
      keywords: ["player shots", "shots"],
      markets: [],
      priority: 4,
    },
    "player-cards": {
      id: "player-cards",
      label: "Player Cards",
      keywords: ["cards", "yellow card", "red card", "booking"],
      markets: [],
      priority: 5,
    },
    "goal-scorer": {
      id: "goal-scorer",
      label: "Goal Scorer",
      keywords: [
        "goal scorer",
        "first goal",
        "last goal",
        "anytime scorer",
        "scorer",
      ],
      markets: [247, 11],
      priority: 6,
    },
    "player-goals": {
      id: "player-goals",
      label: "Player Goals",
      keywords: ["player goals", "hat trick", "goals scored"],
      markets: [18, 19],
      priority: 7,
    },
    "half-time": {
      id: "half-time",
      label: "Half Time",
      keywords: [
        "half",
        "1st half",
        "2nd half",
        "halftime",
        "first half",
        "second half",
      ],
      markets: [31, 97, 49, 28, 15, 16, 45, 124, 26],
      priority: 8,
    },
    corners: {
      id: "corners",
      label: "Corners",
      keywords: ["corner", "corners"],
      markets: [],
      priority: 9,
    },
    "three-way-handicap": {
      id: "three-way-handicap",
      label: "3 Way Handicap",
      keywords: ["3 way handicap", "three way handicap"],
      markets: [],
      priority: 10,
    },
    "asian-lines": {
      id: "asian-lines",
      label: "Asian Lines",
      keywords: ["asian", "asian handicap", "asian lines"],
      markets: [6, 26],
      priority: 11,
    },
    specials: {
      id: "specials",
      label: "Specials",
      keywords: ["odd", "even", "win to nil", "both halves", "special"],
      markets: [44, 45, 124, 46, 40, 101, 266],
      priority: 12,
    },
    others: {
      id: "others",
      label: "Others",
      keywords: [],
      markets: [],
      priority: 99,
    },
  };

  if (!oddsData || !oddsData.odds_by_market) {
    return {
      categories: [{ id: "all", label: "All", odds_count: 0 }],
      classified_odds: {},
      stats: { total_categories: 0, total_odds: 0 },
    };
  }

  const classifiedOdds = {};
  const availableCategories = [];
  let totalOdds = 0;
  
  // Track which market IDs have been classified to avoid duplicates
  const classifiedMarketIds = new Set();

  // Initialize categories
  Object.values(categories).forEach((category) => {
    classifiedOdds[category.id] = {
      ...category,
      markets_data: {},
      odds_count: 0,
    };
  });

  // Sort categories by priority to ensure consistent classification
  const sortedCategories = Object.values(categories).sort((a, b) => a.priority - b.priority);

  // Classify each market by both market ID and keywords
  Object.entries(oddsData.odds_by_market).forEach(([marketId, marketData]) => {
    // Skip if this market has already been classified
    if (classifiedMarketIds.has(marketId)) {
      return;
    }

    const numericMarketId = parseInt(marketId);
    const marketDescription = marketData.market_description?.toLowerCase() || "";
    let classified = false;

    // Find which category this market belongs to
    for (const category of sortedCategories) {
      // Skip 'others' for classification
      if (category.id === "others") continue;
      
      // Check if market ID matches
      const matchesMarketId = category.markets.includes(numericMarketId);
      
      // Check if market description matches keywords
      const matchesKeywords =
        category.keywords &&
        category.keywords.some((keyword) =>
          marketDescription.includes(keyword.toLowerCase())
        );
        
      if (matchesMarketId || matchesKeywords) {
        classifiedOdds[category.id].markets_data[marketId] = marketData;
        classifiedOdds[category.id].odds_count += marketData.odds.length;
        totalOdds += marketData.odds.length;
        classified = true;
        classifiedMarketIds.add(marketId); // Mark as classified
        break; // Only classify into the first matching category
      }
    }
    
    // If not classified, add to 'others'
    if (!classified) {
      classifiedOdds["others"].markets_data[marketId] = marketData;
      classifiedOdds["others"].odds_count += marketData.odds.length;
      totalOdds += marketData.odds.length;
      classifiedMarketIds.add(marketId); // Mark as classified
    }
  });

  // Filter out empty categories
  Object.keys(classifiedOdds).forEach((categoryId) => {
    if (Object.keys(classifiedOdds[categoryId].markets_data).length > 0) {
      availableCategories.push({
        id: classifiedOdds[categoryId].id,
        label: classifiedOdds[categoryId].label,
        odds_count: classifiedOdds[categoryId].odds_count,
      });
    } else {
      delete classifiedOdds[categoryId];
    }
  });

  const result = {
    categories: [
      { id: "all", label: "All", odds_count: totalOdds },
      ...availableCategories,
    ],
    classified_odds: classifiedOdds,
    stats: {
      total_categories: availableCategories.length,
      total_odds: totalOdds,
    },
  };

  // Log classification summary
  console.log("Classification summary:", {
    totalMarkets: Object.keys(oddsData.odds_by_market).length,
    totalClassifiedMarkets: classifiedMarketIds.size,
    categoriesCount: availableCategories.length,
    categoriesWithCounts: availableCategories.map(c => `${c.label}: ${c.odds_count}`),
  });

  return result;
};

// Transform classified odds to betting data format for frontend
const transformToBettingData = (classifiedOdds, matchData = null) => {
  console.log("Starting transformation to betting data format");
  const bettingData = [];

  // Extract team names if available
  const homeTeam = matchData?.participants?.[0]?.name || "Home";
  const awayTeam = matchData?.participants?.[1]?.name || "Away";

  // Track unique market IDs to avoid duplicates
  const processedMarkets = new Set();

  Object.values(classifiedOdds.classified_odds || {}).forEach((category) => {
    Object.entries(category.markets_data || {}).forEach(([marketId, market]) => {
      // Skip if we've already processed this market
      if (processedMarkets.has(marketId)) {
        console.log(`Skipping duplicate market ID: ${marketId}`);
        return;
      }
      
      processedMarkets.add(marketId);

      // Check if this is a player-specific market
      const isPlayerMarket = ['player-cards', 'player-shots', 'player-shots-on-target', 'player-goals', 'goal-scorer'].includes(category.id);
      const isSpecialMarket = category.id === 'specials';
      const marketDescription = market.market_description || '';
      
      // Transform market to betting data format
      const bettingSection = {
        id: `market-${market.market_id}`,
        title: market.market_description,
        type: market.market_description.toLowerCase() === 'to score in half' ? 'to-score-in-half' : category.id,
        category: category.id,
        name: market.market_description.toLowerCase() === 'to score in half' ? market.odds[0]?.name : undefined,
        options: market.odds.map((odd) => {
          // Safely handle odds value - it might be a string or number
          let oddsValue = odd.value;
          if (typeof oddsValue === "string") {
            oddsValue = parseFloat(oddsValue);
          }
          // Fallback to a default odds if invalid
          if (isNaN(oddsValue) || oddsValue === null || oddsValue === undefined) {
            oddsValue = 1.0;
          }

          // Replace "Home" and "Away" with actual team names in the label
          let label = odd.label || odd.name || "Unknown";
          
          // For player markets, ensure player name is included in the label
if (isPlayerMarket) {
  // Special handling for player cards to preserve all options (Booked, 1st Card, etc.)
  if (category.id === 'player-cards') {
    // Keep original label if it already has player name and action type
    if (odd.label && odd.label.includes(' - ')) {
      label = odd.label;
    } else {
      // Extract player name from various fields
      let playerName = '';
      let playerTeam = null;
      
      // First try to get player name from participant info
      if (odd.participant_name) {
        playerName = odd.participant_name;
        if (matchData && matchData.participants) {
          if (odd.participant_id === matchData.participants[0].id) {
            playerTeam = 'home';
          } else if (odd.participant_id === matchData.participants[1].id) {
            playerTeam = 'away';
          }
        }
      }
      
      // If no participant name, try other fields
      if (!playerName) {
        if (odd.description) {
          playerName = odd.description;
        } else if (odd.name && odd.name !== label) {
          playerName = odd.name;
        }
      }
      
      // If still no team but we have player name, try to match against team names
      if (!playerTeam && playerName && matchData && matchData.participants) {
        const homeTeam = matchData.participants[0].name;
        const awayTeam = matchData.participants[1].name;
        
        if (playerName.toLowerCase().includes(homeTeam.toLowerCase())) {
          playerTeam = 'home';
        } else if (playerName.toLowerCase().includes(awayTeam.toLowerCase())) {
          playerTeam = 'away';
        }
      }
      
      // If we still don't have a team, default to home team
      if (!playerTeam) {
        playerTeam = 'home';
      }
      
      // Set the team property
      odd.team = playerTeam;
      
      // Determine action type (Booked, 1st Card, etc.)
      let actionType = label;
      
      // Create full label with player name and action type
      if (playerName) {
        label = `${playerName} - ${actionType}`;
      }
    }
  } else {
              // For other player markets
              // If player name is in the description but not in the label, add it
              if (odd.description && !label.includes(odd.description)) {
                label = `${odd.description} - ${label}`;
              }
              
              // If odd.name contains a player name but label doesn't, use odd.name
              if (odd.name && odd.name !== label && !label.includes(odd.name)) {
                label = `${odd.name} - ${label}`;
              }
              
              // If we have participant info in the odd, use it
              if (odd.participant_name && !label.includes(odd.participant_name)) {
                label = `${odd.participant_name} - ${label}`;
              }
            }
          }
          
          // Replace common numeric labels with team names
          if (matchData && matchData.participants) {
            // Replace team references
            label = label
              .replace(/\bHome\b/gi, homeTeam)
              .replace(/\bAway\b/gi, awayTeam);
            
            // Handle common numeric labels based on market context
            const marketLower = marketDescription.toLowerCase();
            const isHandicapMarket = marketLower.includes('handicap');
            const isResultMarket = marketLower.includes('result') || marketLower.includes('winner') || marketLower.includes('outcome');
            const isHalfMarket = marketLower.includes('half');
            const isGoalScorerMarket = marketLower.includes('goal') || marketLower.includes('score') || category.id === 'goal-scorer';
            const isSpecialMarket = category.id === 'specials';
            const isOthersMarket = category.id === 'others';
            
            // Special handling for Half Time Correct Score
            if (marketLower === 'half time correct score') {
                // The name field contains the actual score (e.g., "1-0")
                if (odd.name && odd.name.match(/^\d+-\d+$/)) {
                    // For Half Time Correct Score, label "1" means home team, "2" means away team
                    let teamName;
                    if (label === "1") {
                        teamName = homeTeam;
                    } else if (label === "2") {
                        teamName = awayTeam;
                    } else if (label.toLowerCase() === "x" || label.toLowerCase() === "draw") {
                        teamName = "Draw";
                    } else {
                        // If label doesn't match expected values, use default logic
                        const [homeScore, awayScore] = odd.name.split('-');
                        if (parseInt(homeScore) > parseInt(awayScore)) {
                            teamName = homeTeam;
                        } else if (parseInt(homeScore) < parseInt(awayScore)) {
                            teamName = awayTeam;
                        } else {
                            teamName = "Draw";
                        }
                    }
                    label = `${teamName} ${odd.name}`;
                }
            }
            // Special handling for Alternative Handicap Result
            else if ((marketLower.includes('alternative handicap') || 
                 marketLower.includes('1st half handicap') || 
                 marketLower.includes('first half handicap')) && 
                odd.handicap) {
              // Store the handicap value for display
              odd.handicapValue = odd.handicap;
              
              // Format the label to include the handicap
              if (label === "1" || label.toLowerCase() === "home" || label === homeTeam) {
                label = `${homeTeam} ${odd.handicap}`;
              } else if (label === "2" || label.toLowerCase() === "away" || label === awayTeam) {
                label = `${awayTeam} ${odd.handicap}`;
              } else if (label === "X" || label.toLowerCase() === "draw" || label.toLowerCase() === "tie") {
                label = `Draw ${odd.handicap}`;
              }
              
              // Don't add 1H indicator for half-time markets
            }
            // For specific markets, replace numeric labels with team names
            else if (isResultMarket || isHandicapMarket || marketLower.includes('1x2') || 
                (isGoalScorerMarket && (label === "1" || label === "2")) ||
                (isSpecialMarket && (label === "1" || label === "2")) ||
                (isOthersMarket && (label === "1" || label === "2"))) {
              // Handle standard 1X2 notation
              if (label === "1" || label.toLowerCase() === "home") {
                label = homeTeam;
              } else if (label === "2" || label.toLowerCase() === "away") {
                label = awayTeam;
              } else if (label === "X" || label.toLowerCase() === "draw" || label.toLowerCase() === "tie") {
                label = "Draw";
              }
            }
            
            // Special handling for specific markets in Others category
            if (isOthersMarket) {
              // Draw No Bet market
              if (marketLower.includes('draw no bet') || marketLower.includes('dnb')) {
                if (label === "1") {
                  label = homeTeam;
                } else if (label === "2") {
                  label = awayTeam;
                }
              }
              
              // Clean Sheet market
              if (marketLower.includes('clean sheet')) {
                if (label === "1") {
                  label = `${homeTeam} - Yes`;
                } else if (label === "2") {
                  label = `${awayTeam} - Yes`;
                }
              }
              
              // Winning Margin market
              if (marketLower.includes('winning margin') || marketLower.includes('margin of victory')) {
                if (label === "1") {
                  label = homeTeam;
                } else if (label === "2") {
                  label = awayTeam;
                }
              }
            }
            
            // For team to score markets
            if (marketLower.includes('team to score') || marketLower.includes('first team') || marketLower.includes('last team')) {
              if (label === "1" || label.toLowerCase() === "home") {
                label = homeTeam;
              } else if (label === "2" || label.toLowerCase() === "away") {
                label = awayTeam;
              } else if (label.toLowerCase() === "no goal" || label.toLowerCase() === "no goals") {
                label = "No Goal";
              }
            }
            
            // For half markets, be more specific
            if (isHalfMarket) {
              if (label === "1") {
                label = `${homeTeam} (${isHalfMarket ? "Half" : ""})`;
              } else if (label === "2") {
                label = `${awayTeam} (${isHalfMarket ? "Half" : ""})`;
              }
            }
            
            // For over/under markets, make labels clearer
            if (marketLower.includes('over/under') || 
                marketLower.includes('goals') || 
                marketLower.includes('goal line') ||
                marketLower.includes('corners')) {
                
                // Special handling for Total Goals/Both Teams to Score market
                if (marketLower === 'total goals/both teams to score') {
                    // Keep the original label as is
                    label = odd.label;
                }
                // Special handling for Team Total Goals market
                else if (marketLower === 'team total goals') {
                    // Extract the total value from the name or label
                    const totalValue = odd.name || odd.total || odd.handicap || "";
                    odd.total = totalValue;
                    
                    // Set the label to the team name
                    if (label === "1" || label.toLowerCase() === "home") {
                        label = homeTeam;
                    } else if (label === "2" || label.toLowerCase() === "away") {
                        label = awayTeam;
                    }
                }
                else {
                    // Get threshold from name field
                    let threshold = odd.name || "";
                    
                    if (label.toLowerCase().includes('over')) {
                        label = `Over ${threshold}`;
                    } else if (label.toLowerCase().includes('under')) {
                        label = `Under ${threshold}`;
                    } else if (label.toLowerCase() === 'over') {
                        label = `Over ${threshold}`;
                    } else if (label.toLowerCase() === 'under') {
                        label = `Under ${threshold}`;
                    }
                }
            }
            // Special handling for To Score In Half markets
            else if (marketLower === 'to score in half') {
                // The name field contains which half (1st Half/2nd Half)
                const halfIndicator = odd.name;
                if (halfIndicator) {
                    // Convert to abbreviated format (1H/2H)
                    odd.halfIndicator = halfIndicator.toLowerCase().includes('1st') ? '1H' : '2H';
                }
            }
          }

          return {
            ...odd,
            value: oddsValue,
            label,
            handicapValue: odd.handicap,
            halfIndicator: odd.halfIndicator
          };
        }),
      };
      
      // For player cards, try to extract player names from the market description if available
      if (category.id === 'player-cards' && bettingSection.options.every(opt => !opt.label.includes(' - '))) {
        // Log the raw data to help diagnose
        console.log(`Player card market raw data:`, {
          marketId,
          description: market.market_description,
          sampleOdds: market.odds.slice(0, 2).map(o => ({
            label: o.label,
            name: o.name,
            description: o.description,
            participant_name: o.participant_name
          }))
        });
        
        // Group options by their label to create more meaningful labels
        const groupedOptions = [];
        const labelGroups = {};
        
        bettingSection.options.forEach(option => {
          if (!labelGroups[option.label]) {
            labelGroups[option.label] = [];
          }
          labelGroups[option.label].push(option);
        });
        
        // Create new sections for each unique label
        Object.entries(labelGroups).forEach(([label, options], index) => {
          if (options.length > 0) {
            const playerSection = {
              ...bettingSection,
              id: `${bettingSection.id}-${index}`,
              title: `${bettingSection.title} - Group ${index + 1}`,
              options: options
            };
            bettingData.push(playerSection);
          }
        });
        
        // Skip adding the original section since we've created grouped sections
        return;
      }
      
      bettingData.push(bettingSection);
    });
  });

  console.log(`Transformed ${bettingData.length} betting sections from ${processedMarkets.size} unique markets`);
  return bettingData;
};

const processToScoreInHalf = (odds) => {
    const options = odds.map(odd => {
        // Convert "1st Half"/"2nd Half" to "1H"/"2H"
        const halfIndicator = odd.name === "1st Half" ? "1H" : odd.name === "2nd Half" ? "2H" : "";
        
        return {
            id: odd.id,
            label: odd.label,
            value: Number(odd.dp3),
            halfIndicator: halfIndicator,
            marketId: odd.market_id,
            marketDescription: odd.market_description
        };
    });

    return {
        type: 'to-score-in-half',
        title: 'To Score In Half',
        options: options
    };
};

const processAsianHandicap = (odds) => {
    const options = odds.map(odd => ({
        id: odd.id,
        label: odd.label,
        value: Number(odd.dp3),
        handicapValue: odd.handicap,
        marketId: odd.market_id,
        marketDescription: odd.market_description
    }));

    const isAlternative = odds[0].market_description.toLowerCase().includes('alternative');
    const isFirstHalf = odds[0].market_description.toLowerCase().includes('1st half');

    return {
        type: isAlternative ? 'alternative-asian-handicap' : 'asian-handicap',
        title: odds[0].market_description,
        options: options
    };
};

const processAlternativeGoalLine = (odds) => {
    const options = odds.map(odd => {
        // Get the base type (Over/Under) and values
        const baseType = odd.label.split(' ')[0]; // "Over" or "Under"
        let values;

        // Handle multiple values (e.g., "Over 0.5, 1.0")
        if (odd.label.includes(',')) {
            values = odd.label.substring(odd.label.indexOf(' ') + 1).split(',').map(v => v.trim());
        } else {
            // Handle single value (e.g., "Over 0.5")
            values = [odd.label.split(' ')[1]];
        }

        return {
            id: odd.id,
            label: odd.label, // Keep the original label
            value: Number(odd.dp3),
            thresholds: values,
            marketId: odd.market_id,
            marketDescription: odd.market_description,
            type: 'alternative-goal-line'
        };
    });

    return {
        type: 'alternative-goal-line',
        title: 'Alternative 1st Half Goal Line',
        options: options
    };
};

const processCornerMatchBet = (odds) => {
    const options = odds.map(odd => {
        let label = odd.label;
        // Keep the original numeric labels (1, 2) and only convert "Tie" to "X"
        if (label.toLowerCase() === "tie") {
            label = "X";
        }

        return {
            id: odd.id,
            label: label,
            value: Number(odd.dp3),
            marketId: odd.market_id,
            marketDescription: odd.market_description,
            type: 'corner-match-bet'
        };
    });

    return {
        type: 'corner-match-bet',
        title: 'Corner Match Bet',
        options: options
    };
};

export { classifyOdds, transformToBettingData };

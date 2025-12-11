'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Filter, Download, Loader2, ArrowUpDown, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
import {
  fetchUserBets,
  selectBets,
  selectBetsLoading,
  selectBetsError,
  clearBetsError,
  fetchBetsByUserId,
} from '@/lib/features/bets/betsSlice';
import { selectUser } from '@/lib/features/auth/authSlice';

const BettingHistoryPage = ({ userId }) => {
  const dispatch = useDispatch();
  const bets = useSelector(selectBets);
  const loading = useSelector(selectBetsLoading);
  const error = useSelector(selectBetsError);
  const user = useSelector(selectUser);

  // Keep filters for date range, but not bet type
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: 'all' });
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  
  // State for table view expansion
  const [expandedTableBets, setExpandedTableBets] = useState(new Set());

  useEffect(() => {
    if (userId && user && user.role === 'admin') {
      dispatch(fetchBetsByUserId(userId));
    } else {
      dispatch(fetchUserBets(filters));
    }
  }, [dispatch, filters, userId, user]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle table expansion toggle
  const handleTableExpansionToggle = (betId) => {
    setExpandedTableBets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(betId)) {
        newSet.delete(betId);
      } else {
        newSet.add(betId);
      }
      return newSet;
    });
  };

  // const toggleCombinationExpansion = React.useCallback((betId, event) => {
  //   // Prevent default behavior to avoid scroll issues
  //   if (event) {
  //     event.preventDefault();
  //     event.stopPropagation();
  //     event.nativeEvent?.stopImmediatePropagation();
  //   }
    
  //   // Find the card element and store its current scroll position
  //   const cardElement = event?.target?.closest('.bet-card');
  //   if (!cardElement) return;
    
  //   const currentScrollY = window.scrollY;
  //   const cardRect = cardElement.getBoundingClientRect();
  //   const cardTopFromViewport = cardRect.top;
    
  //   setExpandedCombinations(prev => {
  //     const newSet = new Set(prev);
  //     if (newSet.has(betId)) {
  //       newSet.delete(betId);
  //     } else {
  //       newSet.add(betId);
  //     }
  //     return newSet;
  //   });
    
  //   // Use multiple attempts to maintain scroll position
  //   const maintainPosition = () => {
  //     window.scrollTo(0, currentScrollY);
  //   };
    
  //   // Try multiple times with different timing
  //   requestAnimationFrame(maintainPosition);
  //   setTimeout(maintainPosition, 0);
  //   setTimeout(maintainPosition, 10);
  //   setTimeout(maintainPosition, 50);
  //   setTimeout(maintainPosition, 100);
  // }, []);


  // Individual card component that manages its own expansion state
  const BetCardWrapper = React.memo(({ item }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isCombo = isCombinationBet(item);
    
    const handleToggle = React.useCallback((event) => {
      event?.preventDefault();
      event?.stopPropagation();
      setIsExpanded(prev => !prev);
    }, []);
    
    return (
      <BetCard
        bet={item}
        isExpanded={isExpanded}
        onToggleExpansion={isCombo ? handleToggle : undefined}
      />
    );
  });
  
  


  const formatAmount = (amount) => {
    return (
      <span style={{color: "#242424"}}>
        ${Math.abs(amount).toFixed(2)}
      </span>
    );
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  // Helper function to check if bet is a combination bet
  const isCombinationBet = (bet) => {
    return bet.combination && Array.isArray(bet.combination) && bet.combination.length > 0;
  };

  // Helper function to get bet type badge
  const getBetTypeBadge = (bet) => {
    if (isCombinationBet(bet)) {
      return (
        <Badge variant="outline" className="text-purple-600 bg-purple-50 border-purple-200 text-xs">
          Combo ({bet.combination.length})
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200 text-xs">
        Single
      </Badge>
    );
  };

  // Helper function to render combination bet details
  const renderCombinationDetails = (bet) => {
    if (!isCombinationBet(bet)) return null;


    return (
      <TableRow className="bg-gray-50">
        <TableCell colSpan={11} className="p-0">
          <div className="p-4 border-l-4 border-purple-400 bg-purple-25">
            <div className="mb-3">
              <h4 className="font-semibold text-gray-700 text-sm">Combination Bet Legs</h4>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100 text-[12px]">
                  <TableHead className="w-16">Leg</TableHead>
                  <TableHead className="w-20">Stake</TableHead>
                  <TableHead className="w-16">Odds</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Selection</TableHead>
                  <TableHead className="w-20">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bet.combination.map((leg, index) => (
                    <TableRow key={index} className="text-[12px] hover:bg-gray-100">
                      <TableCell className="font-medium text-purple-600">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600">${bet.stake.toFixed(2)}</span>
                      </TableCell>
                      <TableCell>{parseFloat(leg.odds).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            leg.status.toLowerCase() === 'won' 
                              ? 'text-emerald-600 bg-emerald-50 border-emerald-200 text-xs'
                              : leg.status.toLowerCase() === 'lost'
                              ? 'text-rose-600 bg-rose-50 border-rose-200 text-xs'
                              : leg.status.toLowerCase() === 'cancelled' || leg.status.toLowerCase() === 'canceled'
                              ? 'text-gray-600 bg-gray-50 border-gray-200 text-xs'
                              : 'text-amber-600 bg-amber-50 border-amber-200 text-xs'
                          }
                        >
                          {leg.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-purple-600 bg-purple-50 border-purple-200 text-xs">
                          Combo
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-32">
                        <div className="truncate" title={leg.teams || (leg.homeTeam && leg.awayTeam ? `${leg.homeTeam} vs ${leg.awayTeam}` : null) || (leg.match?.homeTeam && leg.match?.awayTeam ? `${leg.match.homeTeam} vs ${leg.match.awayTeam}` : null)}>
                          {leg.teams || 
                           (leg.homeTeam && leg.awayTeam ? `${leg.homeTeam} vs ${leg.awayTeam}` : null) ||
                           (leg.match?.homeTeam && leg.match?.awayTeam ? `${leg.match.homeTeam} vs ${leg.match.awayTeam}` : null) ||
                           "Teams information not available"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-32">
                        <div className="truncate" title={leg.unibetMeta?.marketName || leg.betDetails?.market_description || leg.betDetails?.market_name}>
                          {leg.unibetMeta?.marketName || leg.betDetails?.market_description || leg.betDetails?.market_name || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-32">
                        <div className="truncate" title={leg.selection}>
                          {leg.betDetails?.market_id === "37" 
                            ? `${leg.betDetails?.label} ${leg.betDetails?.total} / ${leg.betDetails?.name}`
                            : (leg.selection || "-")
                          }
                        </div>
                      </TableCell>
                      <TableCell className="max-w-20">
                        <div className="truncate" title={leg.betDetails?.total || (leg.unibetMeta?.handicapLine ? (leg.unibetMeta.handicapLine / 1000).toFixed(1) : "-")}>
                          {leg.betDetails?.market_id === "37" 
                            ? (leg.betDetails?.total || (leg.unibetMeta?.handicapLine ? (leg.unibetMeta.handicapLine / 1000).toFixed(1) : "-"))
                            : (leg.betDetails?.total || (leg.unibetMeta?.handicapLine ? (leg.unibetMeta.handicapLine / 1000).toFixed(1) : "-"))
                          }
                        </div>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Mobile card component for individual bets
  const BetCard = React.memo(({ bet, isExpanded, onToggleExpansion }) => {
    const { date, time } = formatDateTime(bet.createdAt);
    const isCombo = isCombinationBet(bet);
    
    // Debug: Log bet data structure to help identify missing fields
    console.log('🔍 BetCard - Bet data structure:', {
      id: bet._id,
      teams: bet.teams,
      match: bet.match,
      betDetails: bet.betDetails,
      isCombo: isCombo,
      combination: bet.combination,
      // Additional debugging for single bets
      ...(isCombo ? {} : {
        matchId: bet.matchId,
        oddId: bet.oddId,
        betOption: bet.betOption,
        selection: bet.selection,
        unibetMeta: bet.unibetMeta
      })
    });

    return (
      <Card className="bet-card mb-4 border border-gray-200 rounded-none py-0">
           <div className="flex items-center justify-between" style={{backgroundColor: "oklch(0.6 0.15 163.23 / 0.35)", borderTop: "2px solid oklch(0.596 0.145 163.225)"}}>
            {/* Left side - Stake and Odds */}
            <div className="flex items-center gap-2 py-2" style={{paddingLeft:"10px"}}>
                <span className="text-lg font-semibold" style={{color: "#242424"}}>
                  {formatAmount(bet.stake)}
                </span>
                <span className="text-sm" style={{color: "#242424"}}>@ {parseFloat(bet.odds).toFixed(2)}</span>
            </div>
            
            {/* Right side - View All with Chevron (only for combo bets) */}
            <div className="flex items-center">
              {isCombo && (
                <>
                  <span 
                    className="text-sm cursor-pointer hover:underline" 
                    style={{color: "#242424"}}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleExpansion && onToggleExpansion(e);
                    }}
                  >
                    View All
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleExpansion && onToggleExpansion(e);
                    }}
                    className="h-8 w-6"
                    style={{padding: 0}}
                    type="button"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-purple-600" /> : <ChevronRight className="h-4 w-4 text-purple-600" />}
                  </Button>
                </>
              )}
            </div>
          </div>
        <CardContent className="py-0 px-3" style={{paddingBottom:"10px"}}>
          {/* Header with expand button for combo bets */}
          

          {/* Date and Time with Badges */}
          <div className="flex items-center justify-between mb-3">
            {/* Date and Time on the left */}
            <div className="text-sm text-gray-600">
              <div className="font-medium">{date}</div>
              <div>{time}</div>
            </div>
            
            {/* Status and Type badges on the right */}
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  bet.status.toLowerCase() === 'won' 
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-200 text-xs'
                    : bet.status.toLowerCase() === 'lost'
                    ? 'text-rose-600 bg-rose-50 border-rose-200 text-xs'
                    : bet.status.toLowerCase() === 'cancelled' || bet.status.toLowerCase() === 'canceled'
                    ? 'text-gray-600 bg-gray-50 border-gray-200 text-xs'
                    : 'text-amber-600 bg-amber-50 border-amber-200 text-xs'
                }
              >
                {bet.status}
              </Badge>
              {getBetTypeBadge(bet)}
            </div>
          </div>

          {/* Match details */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Match:</span>
              <span className="text-gray-900 font-medium text-right max-w-[60%] truncate" title={
                isCombo ? `Combination (${bet.combination.length} legs)` : (
                  (bet.teams && bet.teams !== "Teams information not available" ? bet.teams : null) ||
                  bet.match?.name || 
                  (bet.unibetMeta?.eventName && bet.unibetMeta.eventName !== 'Combination Bet' ? bet.unibetMeta.eventName : null) ||
                  (bet.unibetMeta?.homeName && bet.unibetMeta?.awayName ? `${bet.unibetMeta.homeName} vs ${bet.unibetMeta.awayName}` : null) ||
                  (bet.homeTeam && bet.awayTeam ? `${bet.homeTeam} vs ${bet.awayTeam}` : null) ||
                  (bet.match?.homeTeam && bet.match?.awayTeam ? `${bet.match.homeTeam} vs ${bet.match.awayTeam}` : null) ||
                  "Teams information not available"
                )
              }>
                {isCombo ? `Combination (${bet.combination.length} legs)` : (
                  (bet.teams && bet.teams !== "Teams information not available" ? bet.teams : null) ||
                  bet.match?.name || 
                  (bet.unibetMeta?.eventName && bet.unibetMeta.eventName !== 'Combination Bet' ? bet.unibetMeta.eventName : null) ||
                  (bet.unibetMeta?.homeName && bet.unibetMeta?.awayName ? `${bet.unibetMeta.homeName} vs ${bet.unibetMeta.awayName}` : null) ||
                  (bet.homeTeam && bet.awayTeam ? `${bet.homeTeam} vs ${bet.awayTeam}` : null) ||
                  (bet.match?.homeTeam && bet.match?.awayTeam ? `${bet.match.homeTeam} vs ${bet.match.awayTeam}` : null) ||
                  "Teams information not available"
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Market:</span>
              <span className="text-gray-900">
                {isCombo ? "Multiple Markets" : (bet.betDetails?.market_description || bet.betDetails?.market_name || "-")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Selection:</span>
              <span className="text-gray-900">
                {isCombo ? "Multiple Selections" : (
                  bet.betDetails?.market_id === "37" 
                    ? `${bet.betDetails?.label} ${bet.betDetails?.total} / ${bet.betDetails?.name}`
                    : (bet.selection || "-")
                )}
              </span>
            </div>
            {!isCombo && (
              <div className="flex justify-between">
                <span className="text-gray-500">Value:</span>
                <span className="text-gray-900">
                  {bet.betDetails?.market_id === "37" 
                    ? bet.betDetails?.total
                    : (bet.betDetails?.total || "-")
                  }
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="text-gray-500 font-medium">Profit:</span>
              <span className={`font-semibold ${
                bet.status.toLowerCase() === "won" || bet.status.toLowerCase() === "half_won"
                  ? "text-green-600"
                  : bet.status.toLowerCase() === "lost" || bet.status.toLowerCase() === "half_lost"
                  ? "text-red-600"
                  : "text-gray-500"
              }`}>
                {(() => {
                  const status = bet.status.toLowerCase();
                  
                  // Use profit field from database if available (preferred)
                  if (bet.profit !== undefined && bet.profit !== null) {
                    const profit = Number(bet.profit);
                    if (profit > 0) {
                      return `+$${profit.toFixed(2)}`;
                    } else if (profit < 0) {
                      return `-$${Math.abs(profit).toFixed(2)}`;
                    } else {
                      return "$0.00";
                    }
                  }
                  
                  // Fallback to calculation if profit field not available
                  if (status === "won") {
                    return `+$${((bet.stake * bet.odds) - bet.stake).toFixed(2)}`;
                  } else if (status === "half_won") {
                    // Half win: (stake/2) * odds + (stake/2) - stake = (stake/2) * (odds - 1)
                    const halfWinProfit = (bet.stake / 2) * (bet.odds - 1);
                    return `+$${halfWinProfit.toFixed(2)}`;
                  } else if (status === "half_lost") {
                    // Half loss: (stake/2) - stake = -(stake/2)
                    const halfLossProfit = -(bet.stake / 2);
                    return `-$${Math.abs(halfLossProfit).toFixed(2)}`;
                  } else if (status === "pending") {
                    return "Pending";
                  } else if (status === "cancelled" || status === "canceled" || status === "void") {
                    return "$0.00";
                  } else if (status === "lost") {
                    return `-$${bet.stake.toFixed(2)}`;
                  } else {
                    return "$0.00";
                  }
                })()}
              </span>
            </div>
          </div>

          {/* Combination bet legs - show within the same card when expanded */}
          {isCombo && (
            <div
              style={{
                maxHeight: isExpanded ? '1000px' : '0px',
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
              }}
            >
              <CombinationBetLegs bet={bet} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  });

  // Mobile combination bet legs component (inline within parent card)
  const CombinationBetLegs = ({ bet }) => {
    if (!isCombinationBet(bet)) return null;

    return (
      <div className="mt-3 pt-2 border-t border-gray-200">
        <h4 className="font-semibold text-gray-700 text-sm mb-2">Combination Bet Legs</h4>
          <div className="space-y-3" style={{ backgroundColor: 'lightgray', paddingLeft: '10px', paddingRight: '10px', paddingBottom: '10px', paddingTop: '10px' }}>
            {bet.combination.map((leg, index) => (
                <div key={index} className="bg-gray-50 p-2 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-purple-600 text-sm">Leg {index + 1}</span>
                  <Badge
                    variant="outline"
                    className={
                      leg.status.toLowerCase() === 'won' 
                        ? 'text-emerald-600 bg-emerald-50 border-emerald-200 text-xs'
                        : leg.status.toLowerCase() === 'lost'
                        ? 'text-rose-600 bg-rose-50 border-rose-200 text-xs'
                        : leg.status.toLowerCase() === 'cancelled' || leg.status.toLowerCase() === 'canceled'
                        ? 'text-gray-600 bg-gray-50 border-gray-200 text-xs'
                        : 'text-amber-600 bg-amber-50 border-amber-200 text-xs'
                    }
                  >
                    {leg.status}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stake:</span>
                    <span className="text-gray-600">${bet.stake.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Odds:</span>
                    <span className="text-gray-900">{parseFloat(leg.odds).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Match:</span>
                    <span className="text-gray-900 text-right max-w-[60%] truncate" title={leg.teams || "-"}>{leg.teams || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Market:</span>
                    <span className="text-gray-900 truncate ml-2">{leg.unibetMeta?.marketName || leg.betDetails?.market_description || leg.betDetails?.market_name || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Selection:</span>
                    <span className="text-gray-900 truncate ml-2">
                      {leg.betDetails?.market_id === "37" 
                        ? `${leg.betDetails?.label} ${leg.betDetails?.total} / ${leg.betDetails?.name}`
                        : (leg.selection || "-")
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Value:</span>
                    <span className="text-gray-900">
                      {leg.betDetails?.market_id === "37" 
                        ? (leg.betDetails?.total || (leg.unibetMeta?.handicapLine ? (leg.unibetMeta.handicapLine / 1000).toFixed(1) : "-"))
                        : (leg.betDetails?.total || (leg.unibetMeta?.handicapLine ? (leg.unibetMeta.handicapLine / 1000).toFixed(1) : "-"))
                      }
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
      </div>
    );
  };

  // Filter bets by date range and status if set
  const filteredBets = React.useMemo(() => {
    return bets.filter((bet) => {
      // Normalize bet date to YYYY-MM-DD for comparison
      const betDateStr = new Date(bet.createdAt).toISOString().slice(0, 10);
      const from = filters.dateFrom;
      const to = filters.dateTo;
      if (from && betDateStr < from) return false;
      if (to && betDateStr > to) return false;
      if (filters.status && filters.status !== 'all' && bet.status !== filters.status) return false;
      return true;
    });
  }, [bets, filters]);

  const sortedData = React.useMemo(() => {
    const data = filteredBets;
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      if (sortConfig.key === 'stake') {
        const aVal = Math.abs(a.stake);
        const bVal = Math.abs(b.stake);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortConfig.key === 'odds') {
        const aVal = a.odds || 0;
        const bVal = b.odds || 0;
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortConfig.key === 'payout') {
        const aVal = a.payout || 0;
        const bVal = b.payout || 0;
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortConfig.key === 'createdAt') {
        const aVal = new Date(a.createdAt);
        const bVal = new Date(b.createdAt);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortConfig.key === 'status') {
        const aVal = a.status || '';
        const bVal = b.status || '';
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });
  }, [filteredBets, sortConfig]);

  if (error) {
    return (
      <div className="flex-1 bg-gray-100 p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={() => dispatch(clearBetsError())} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-100">
      <div className="p-3 lg:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Betting History</h1>
            <p className="text-gray-600 mt-1 text-sm">View all your betting activity</p>
          </div>
        </div>
        {/* Filters */}
        <Card className={"rounded-none shadow-none py-3 text-xs"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 !text-lg text-base ">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
              <Button
                className={"py-1 px-4"}
                variant="outline"
                onClick={() => setFilters({ dateFrom: '', dateTo: '', status: 'all' })}
              >
                Clear Filters
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date Range */}
              <div className="space-y-2">
                <label className=" font-medium text-gray-700">Date From</label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className={"h-9"}
                />
              </div>
              <div className="space-y-2">
                <label className=" font-medium text-gray-700">Date To</label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className={"h-9 "}
                />
              </div>
              {/* Status Filter */}
              <div className="space-y-2">
                <label className=" font-medium text-gray-700">Status</label>
                <Select value={filters.status}  onValueChange={(value) => handleFilterChange('status', value)}>
                  <SelectTrigger className="h-4 text-black border-black rounded-none">
                    <SelectValue className="text-black" placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-start items-center mt-4 pt-4 border-t">
              <div className=" text-gray-600">
                Showing {sortedData.length} bets
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Data Table */}
        <Card className={"rounded-none shadow-none px-2 py-2"}>
          <CardContent className="p-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading betting history...</span>
              </div>
            ) : sortedData.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">
                  No bets found with current filters.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 text-[13px]">
                        <TableHead className="w-8"></TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort('stake')}
                        >
                          <div className="flex items-center gap-2">
                            Stake
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort('odds')}
                        >
                          <div className="flex items-center gap-2">
                            Odds
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort('createdAt')}
                        >
                          <div className="flex items-center gap-2">
                            Date & Time
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort('status')}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead className="select-none">Type</TableHead>
                        <TableHead className="select-none">Match</TableHead>
                        <TableHead className="select-none">Market</TableHead>
                        <TableHead className="select-none">Selection</TableHead>
                        <TableHead className="select-none">Value</TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort('payout')}
                        >
                          <div className="flex items-center gap-2">
                            Profit
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.map((item) => {
                        const { date, time } = formatDateTime(item.createdAt);
                        const isCombo = isCombinationBet(item);
                        
                        return (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className="hover:bg-gray-50 text-[13px]"
                            >
                              <TableCell>
                                {isCombo && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleTableExpansionToggle(item._id);
                                    }}
                                    className="h-6 w-6 p-0"
                                    type="button"
                                  >
                                    {expandedTableBets.has(item._id) ? (
                                      <ChevronDown className="h-4 w-4 text-purple-600" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-purple-600" />
                                    )}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                {formatAmount(item.stake)}
                              </TableCell>
                              <TableCell>{parseFloat(item.odds).toFixed(2)}</TableCell>
                              <TableCell>
                                <div>
                                  <div>{date}</div>
                                  <div className="text-gray-500">{time}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    item.status.toLowerCase() === 'won' 
                                      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                                      : item.status.toLowerCase() === 'lost'
                                      ? 'text-rose-600 bg-rose-50 border-rose-200'
                                      : item.status.toLowerCase() === 'cancelled' || item.status.toLowerCase() === 'canceled'
                                      ? 'text-gray-600 bg-gray-50 border-gray-200'
                                      : 'text-amber-600 bg-amber-50 border-amber-200'
                                  }
                                >
                                  {item.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {getBetTypeBadge(item)}
                              </TableCell>
                              <TableCell className="max-w-48">
                                <div className="truncate" title={isCombo ? `Combination Bet (${item.combination.length} legs)` : (
                                  (item.teams && item.teams !== "Teams information not available" ? item.teams : null) ||
                                  item.match?.name || 
                                  (item.unibetMeta?.eventName && item.unibetMeta.eventName !== 'Combination Bet' ? item.unibetMeta.eventName : null) ||
                                  (item.unibetMeta?.homeName && item.unibetMeta?.awayName ? `${item.unibetMeta.homeName} vs ${item.unibetMeta.awayName}` : null) ||
                                  (item.homeTeam && item.awayTeam ? `${item.homeTeam} vs ${item.awayTeam}` : null) ||
                                  (item.match?.homeTeam && item.match?.awayTeam ? `${item.match.homeTeam} vs ${item.match.awayTeam}` : null) ||
                                  "Teams information not available"
                                )}>
                                  {isCombo ? `Combination (${item.combination.length} legs)` : (
                                    (item.teams && item.teams !== "Teams information not available" ? item.teams : null) ||
                                    item.match?.name || 
                                    (item.unibetMeta?.eventName && item.unibetMeta.eventName !== 'Combination Bet' ? item.unibetMeta.eventName : null) ||
                                    (item.unibetMeta?.homeName && item.unibetMeta?.awayName ? `${item.unibetMeta.homeName} vs ${item.unibetMeta.awayName}` : null) ||
                                    (item.homeTeam && item.awayTeam ? `${item.homeTeam} vs ${item.awayTeam}` : null) ||
                                    (item.match?.homeTeam && item.match?.awayTeam ? `${item.match.homeTeam} vs ${item.match.awayTeam}` : null) ||
                                    "Teams information not available"
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-48">
                                {(() => {
                                  const singleMarketTitle = item.unibetMeta?.marketName
                                    || item.betDetails?.market_description
                                    || item.betDetails?.market_name
                                    || "-";
                                  return (
                                    <div
                                      className="truncate"
                                      title={isCombo ? "Multiple Markets" : singleMarketTitle}
                                    >
                                      {isCombo ? "Multiple Markets" : singleMarketTitle}
                                </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="max-w-48">
                                <div className="truncate" title={isCombo ? "Multiple Selections" : item.selection}>
                                  {isCombo ? "Multiple Selections" : (
                                    item.betDetails?.market_id === "37" 
                                      ? `${item.betDetails?.label} ${item.betDetails?.total} / ${item.betDetails?.name}`
                                      : (item.selection || "-")
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-32">
                                <div className="truncate" title={isCombo ? "N/A" : item.betDetails?.total}>
                                  {isCombo ? "N/A" : (
                                    item.betDetails?.market_id === "37" 
                                      ? item.betDetails?.total
                                      : (item.betDetails?.total || "-")
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const status = item.status.toLowerCase();
                                  
                                  // Use profit field from database if available (preferred)
                                  if (item.profit !== undefined && item.profit !== null) {
                                    const profit = Number(item.profit);
                                    if (profit > 0) {
                                      return (
                                  <span className="font-medium text-green-600">
                                          +${profit.toFixed(2)}
                                  </span>
                                      );
                                    } else if (profit < 0) {
                                      return (
                                        <span className="font-medium text-red-600">
                                          -${Math.abs(profit).toFixed(2)}
                                        </span>
                                      );
                                    } else {
                                      return <span className="text-gray-500">$0.00</span>;
                                    }
                                  }
                                  
                                  // Fallback to calculation if profit field not available
                                  if (status === "won") {
                                    return (
                                      <span className="font-medium text-green-600">
                                        +${((item.stake * item.odds) - item.stake).toFixed(2)}
                                      </span>
                                    );
                                  } else if (status === "half_won") {
                                    // Half win: (stake/2) * odds + (stake/2) - stake = (stake/2) * (odds - 1)
                                    const halfWinProfit = (item.stake / 2) * (item.odds - 1);
                                    return (
                                      <span className="font-medium text-green-600">
                                        +${halfWinProfit.toFixed(2)}
                                      </span>
                                    );
                                  } else if (status === "half_lost") {
                                    // Half loss: (stake/2) - stake = -(stake/2)
                                    const halfLossProfit = -(item.stake / 2);
                                    return (
                                      <span className="font-medium text-red-600">
                                        -${Math.abs(halfLossProfit).toFixed(2)}
                                      </span>
                                    );
                                  } else if (status === "pending") {
                                    return <span className="text-gray-500">Pending</span>;
                                  } else if (status === "cancelled" || status === "canceled" || status === "void") {
                                    return <span className="text-gray-500">$0.00</span>;
                                  } else if (status === "lost") {
                                    return (
                                  <span className="font-medium text-red-600">
                                    -${item.stake.toFixed(2)}
                                  </span>
                                    );
                                  } else {
                                    return <span className="text-gray-500">$0.00</span>;
                                  }
                                })()}
                              </TableCell>
                            </TableRow>
                            {isCombo && expandedTableBets.has(item._id) && renderCombinationDetails(item)}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {sortedData.map((item) => (
                    <BetCardWrapper
                      key={item._id}
                      item={item}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BettingHistoryPage;

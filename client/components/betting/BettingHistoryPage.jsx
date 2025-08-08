'use client';

import React, { useEffect, useState } from 'react';
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
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [expandedCombinations, setExpandedCombinations] = useState(new Set());

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

  const toggleCombinationExpansion = (betId) => {
    setExpandedCombinations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(betId)) {
        newSet.delete(betId);
      } else {
        newSet.add(betId);
      }
      return newSet;
    });
  };

  const formatAmount = (amount) => {
    return (
      <span className="text-black">
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
                {bet.combination.map((leg, index) => {
                  return (
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
                        <div className="truncate" title={leg.teams}>
                          {leg.teams || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-32">
                        <div className="truncate" title={leg.betDetails?.market_description}>
                          {leg.betDetails?.market_description || "-"}
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
                        <div className="truncate" title={leg.betDetails?.total}>
                          {leg.betDetails?.market_id === "37" 
                            ? leg.betDetails?.total
                            : (leg.betDetails?.total || "-")
                          }
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TableCell>
      </TableRow>
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
              <div className="overflow-x-auto">
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
                      const isExpanded = expandedCombinations.has(item._id);
                      const isCombo = isCombinationBet(item);
                      
                      return (
                        <React.Fragment key={item._id}>
                          <TableRow
                            className={`hover:bg-gray-50 text-[13px] ${isCombo ? 'cursor-pointer' : ''}`}
                            onClick={isCombo ? () => toggleCombinationExpansion(item._id) : undefined}
                          >
                            <TableCell>
                              {isCombo && (
                                isExpanded ? <ChevronDown className="h-4 w-4 text-purple-600" /> : <ChevronRight className="h-4 w-4 text-purple-600" />
                              )}
                            </TableCell>
                            <TableCell>
                              {isCombo ? formatAmount(item.stake * item.combination.length) : formatAmount(item.stake)}
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
                              <div className="truncate" title={isCombo ? `Combination Bet (${item.combination.length} legs)` : item.teams}>
                                {isCombo ? `Combination (${item.combination.length} legs)` : (item.teams || "-")}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-48">
                              <div className="truncate" title={isCombo ? "Multiple Markets" : item.betDetails?.market_description}>
                                {isCombo ? "Multiple Markets" : (item.betDetails?.market_description || "-")}
                              </div>
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
                              {item.status.toLowerCase() === "won" ? (
                                <span className="font-medium text-green-600">
                                  +${(item.stake * item.odds).toFixed(2)}
                                </span>
                              ) : item.status.toLowerCase() === "pending" ? (
                                <span className="text-gray-500">Pending</span>
                              ) : item.status.toLowerCase() === "cancelled" || item.status.toLowerCase() === "canceled" ? (
                                <span className="text-gray-500">$0.00</span>
                              ) : (
                                <span className="font-medium text-red-600">
                                  -${item.stake.toFixed(2)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && isCombo && renderCombinationDetails(item)}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BettingHistoryPage;

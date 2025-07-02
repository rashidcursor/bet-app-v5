'use client';

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Filter, Download, Loader2, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';
import {
  fetchUserBets,
  selectBets,
  selectBetsLoading,
  selectBetsError,
  clearBetsError,
} from '@/lib/features/bets/betsSlice';

const BettingHistoryPage = () => {
  const dispatch = useDispatch();
  const bets = useSelector(selectBets);
  const loading = useSelector(selectBetsLoading);
  const error = useSelector(selectBetsError);

  // Keep filters for date range, but not bet type
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    dispatch(fetchUserBets(filters));
  }, [dispatch, filters]);

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

  const getStatusBadge = (status) => {
    const colors = {
      won: 'bg-green-100 text-green-800 hover:bg-green-100',
      lost: 'bg-red-100 text-red-800 hover:bg-red-100',
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    };
    return (
      <Badge className={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
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
      if (sortConfig.key === 'createdAt') {
        const aVal = new Date(a.createdAt);
        const bVal = new Date(b.createdAt);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortConfig.key === 'odds') {
        const aVal = parseFloat(a.odds) || 0;
        const bVal = parseFloat(b.odds) || 0;
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aVal = a[sortConfig.key]?.toString().toLowerCase() || '';
      const bVal = b[sortConfig.key]?.toString().toLowerCase() || '';
      if (sortConfig.direction === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
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
                <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Statuses" />
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
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('id')}
                      >
                        <div className="flex items-center gap-2">
                          ID
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </TableHead>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Selection</TableHead>
                      <TableHead>Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((item) => {
                      const { date, time } = formatDateTime(item.createdAt);
                      return (
                        <TableRow key={item._id} className="hover:bg-gray-50 text-[13px]">
                          <TableCell className="font-mono ">{item._id}</TableCell>
                          <TableCell>{formatAmount(item.stake)}</TableCell>
                          <TableCell className="">{item.odds}</TableCell>
                          <TableCell>
                            <div className="">
                              <div className="">{date}</div>
                              <div className="text-gray-500">{time}</div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell className="max-w-48">
                            <div className="truncate" title={item.teams}>
                              {item.teams}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-48">
                            <div className="truncate" title={item.selection}>
                              {item.selection}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.status === 'won' ? (
                              <span className="font-medium text-green-600">
                                +${(item.stake * item.odds).toFixed(2)}
                              </span>
                            ) : item.status === 'pending' ? (
                              <span className="text-gray-500">Pending</span>
                            ) : (
                              <span className="font-medium text-red-600">
                                -${item.stake.toFixed(2)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
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

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
  fetchTransactions, 
  setFilters, 
  resetFilters,
  clearError 
} from '@/lib/features/transactions/transactionsSlice';

const TransactionHistoryPage = () => {
  const dispatch = useDispatch();
  const { 
    transactions, 
    loading, 
    error, 
    filters, 
    total 
  } = useSelector((state) => state.transactions);

  const [sortConfig, setSortConfig] = useState({ key: 'dateTime', direction: 'desc' });

  useEffect(() => {
    dispatch(fetchTransactions(filters));
  }, [dispatch, filters]);

  const handleFilterChange = (key, value) => {
    // For all filters, including dates
    dispatch(setFilters({ [key]: value }));
  };


  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const formatAmount = (amount, type) => {
    // For deposits and wins, show positive amount in green with + sign
    if (type === 'deposit' || type === 'win') {
      return (
        <span className="font-medium text-green-600">
          +${Math.abs(amount).toFixed(2)}
        </span>
      );
    } 
    // For withdrawals and bets, show negative amount in red with - sign
    else if (type === 'withdraw' || type === 'bet') {
      return (
        <span className="font-medium text-red-600">
          -${Math.abs(amount).toFixed(2)}
        </span>
      );
    }
    // Default case
    else {
    return (
        <span className="font-medium">
          ${Math.abs(amount).toFixed(2)}
      </span>
    );
    }
  };

  const formatDateTime = (dateTime) => {
    // Handle both API format (createdAt) and mock data format (dateTime)
    const date = new Date(dateTime);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return {
        date: "Unknown date",
        time: "Unknown time"
      };
    }
    
    return {
      date: date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };


  const getTypeIcon = (type) => {
    switch (type) {
      case 'deposit':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'withdraw':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'bet':
        return <TrendingDown className="h-4 w-4 text-orange-600" />;
      case 'win':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      default:
        return <ArrowUpDown className="h-4 w-4 text-gray-600" />;
    }
  };
  const sortedData = React.useMemo(() => {
    const data = transactions;
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      if (sortConfig.key === 'amount') {
        const aVal = Math.abs(a.amount);
        const bVal = Math.abs(b.amount);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      if (sortConfig.key === 'dateTime' || sortConfig.key === 'createdAt') {
        const aVal = new Date(a.dateTime || a.createdAt);
        const bVal = new Date(b.dateTime || b.createdAt);
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
  }, [transactions, sortConfig]);

  if (error) {
    return (
      <div className="flex-1 bg-gray-100 p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={() => dispatch(clearError())} variant="outline">
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
      <div className="p-3 lg:p-6 space-y-6">        {/* Header */}        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
            <p className="text-gray-600 mt-1 text-sm">View all your financial transactions</p>
          </div>
        </div>{/* Filters */}
        <Card className={"rounded-none shadow-none py-3 text-xs"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 !text-lg text-base">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
              <Button
                className={"py-1 px-4"}
                variant="outline"
                onClick={() => dispatch(resetFilters())}
              >
                Clear Filters
              </Button>
            </div>
          </CardHeader>
          <CardContent>            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label className="font-medium ml-1 mt-1 text-gray-700">Type</label>
                <Select value={filters.type} onValueChange={(value) => handleFilterChange('type', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="deposit">Deposit</SelectItem>
                    <SelectItem value="withdraw">Withdrawal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <label className=" font-medium text-gray-700">Date From</label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => {
                    console.log('Date From selected:', e.target.value);
                    handleFilterChange('dateFrom', e.target.value);
                  }}
                />
              </div>              <div className="space-y-2">
                <label className=" font-medium text-gray-700">Date To</label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => {
                    console.log('Date To selected:', e.target.value);
                    handleFilterChange('dateTo', e.target.value);
                  }}
                />
              </div>            </div>
              <div className="flex justify-start items-center mt-4 pt-4 border-t">
              <div className="text-sm text-gray-600">
                Showing {sortedData.length} of {total} transactions
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className={"rounded-none px-2 py-2"}>
          <CardContent className="p-1">            
            <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading transactions...</span>
              </div>
              ) : error ? (
                <div className="text-center py-8 text-red-500">
                  <p>{error}</p>
                </div>
              ) : transactions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">
                    No transactions found.
                </p>
              </div>
            ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="px-3">
                      <TableHead 
                        className="cursor-pointer select-none "
                        onClick={() => handleSort('id')}
                      >
                        <div className="flex items-center gap-2">
                          ID
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('type')}
                      >
                        <div className="flex items-center gap-2">
                          Type
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('amount')}
                      >
                        <div className="flex items-center gap-2">
                          Amount
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none"
                        onClick={() => handleSort('dateTime')}
                      >
                        <div className="flex items-center gap-2">
                          Date & Time
                          <ArrowUpDown className="h-4 w-4" />
                        </div>                      </TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((item) => {
                      // Handle both API and mock data formats
                      const dateTimeField = item.dateTime || item.createdAt;
                      const { date, time } = formatDateTime(dateTimeField);
                      
                      // Get ID from either _id (API) or id (mock)
                      const itemId = item._id || item.id;
                      
                      return (
                        <TableRow key={itemId} className="hover:bg-gray-50 text-[13px]">
                          <TableCell className="font-mono ">{itemId}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.type)}
                              <span className="capitalize">{item.type}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatAmount(item.amount, item.type)}</TableCell>
                          <TableCell>
                            <div className="">
                              <div className="">{date}</div>
                              <div className="text-gray-500">{time}</div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-64">
                            <div className="truncate" title={item.description}>
                              {item.description}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TransactionHistoryPage;

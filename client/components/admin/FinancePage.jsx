"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar as CalendarIcon,
  Filter,
  Download,
  Loader2,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  User,
  Users,
  Search,
  Sliders,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  Wallet,
  DollarSign,
  BarChart4,
} from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check } from "lucide-react";

// Redux imports
import {
  fetchFinanceTransactions,
  fetchFinancialSummary,
  setFilters,
  clearError,
  resetFilters,
} from "@/lib/features/finance/financeSlice";

const FinancePage = () => {
  const dispatch = useDispatch();

  // Redux state
  const { transactions, summary, pagination, loading, error, filters } =
    useSelector((state) => state.finance);
  // Local state for UI components
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedUser, setSelectedUser] = useState("all");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(0);
  const [sortColumn, setSortColumn] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");

  // Get unique user names for the filter
  const uniqueUsers = useMemo(() => {
    const users = transactions.map((t) =>
      t.user?.firstName && t.user?.lastName
        ? `${t.user.firstName} ${t.user.lastName}`
        : t.user?.email || "Unknown User"
    );
    return [...new Set(users)];
  }, [transactions]);

  // Load data on component mount
  useEffect(() => {
    dispatch(fetchFinancialSummary());
    dispatch(fetchFinanceTransactions(filters));
  }, [dispatch]);

  // Refetch transactions when filters change
  useEffect(() => {
    const apiFilters = {
      ...filters,
      type: typeFilter !== "all" ? typeFilter : "",
      search: searchQuery,
      dateFrom: dateRange.from ? dateRange.from.toISOString() : "",
      dateTo: dateRange.to ? dateRange.to.toISOString() : "",
      sortBy: sortColumn,
      sortOrder: sortDirection,
    };

    dispatch(setFilters(apiFilters));
    dispatch(fetchFinanceTransactions(apiFilters));

    // Also fetch filtered financial summary when filters change
    const summaryFilters = {
      dateFrom: dateRange.from ? dateRange.from.toISOString() : "",
      dateTo: dateRange.to ? dateRange.to.toISOString() : "",
      type: typeFilter !== "all" ? typeFilter : "",
      // Note: userId filter would need to be implemented if you want user-specific filtering
    };

    // Only fetch filtered summary if there are actual filters applied
    if (summaryFilters.dateFrom || summaryFilters.dateTo || summaryFilters.type) {
      dispatch(fetchFinancialSummary(summaryFilters));
    } else {
      // If no filters, fetch the regular summary
      dispatch(fetchFinancialSummary());
    }
  }, [
    dispatch,
    typeFilter,
    searchQuery,
    dateRange,
    sortColumn,
    sortDirection,
    pagination.currentPage,
  ]);

  // Count active filters
  useEffect(() => {
    let count = 0;
    if (typeFilter !== "all") count++;
    if (selectedUser !== "all") count++;
    if (dateRange.from || dateRange.to) count++;
    if (searchQuery) count++;
    setActiveFilters(count);
  }, [typeFilter, selectedUser, dateRange, searchQuery]);
  // Filter transactions locally for user selection (since API doesn't support user filtering yet)
  const filteredTransactions = useMemo(() => {
    if (selectedUser === "all") {
      return transactions;
    }

    return transactions.filter((transaction) => {
      const userName =
        transaction.user?.firstName && transaction.user?.lastName
          ? `${transaction.user.firstName} ${transaction.user.lastName}`
          : transaction.user?.email || "Unknown User";
      return userName === selectedUser;
    });
  }, [transactions, selectedUser]);

  // No need for manual sorting as it's handled by the API
  const sortedTransactions = filteredTransactions;
  // No need for local pagination since it's handled by the API
  const paginatedTransactions = sortedTransactions;

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      const apiFilters = {
        ...filters,
        page: newPage,
        type: typeFilter !== "all" ? typeFilter : "",
        search: searchQuery,
        dateFrom: dateRange.from ? dateRange.from.toISOString() : "",
        dateTo: dateRange.to ? dateRange.to.toISOString() : "",
        sortBy: sortColumn,
        sortOrder: sortDirection,
      };
      dispatch(setFilters(apiFilters));
      dispatch(fetchFinanceTransactions(apiFilters));
    }
  };

  // Handle sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Format functions
  const formatAmount = (amount) => {
    const isPositive = amount >= 0;
    return (
      <span
        className={`font-medium ${isPositive ? "text-green-600" : "text-red-600"
          }`}
      >
        {isPositive ? "+" : ""}${Math.abs(amount).toFixed(2)}
      </span>
    );
  };
  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "deposit":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "withdraw":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <ArrowUpDown className="h-4 w-4 text-gray-600" />;
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setTypeFilter("all");
    setDateRange({ from: null, to: null });
    setSelectedUser("all");
    setSearchQuery("");
    setActiveFilters(0);
    dispatch(resetFilters());
    dispatch(fetchFinanceTransactions());
  };

  // Apply filters
  const applyFilters = () => {
    let count = 0;
    if (typeFilter !== "all") count++;
    if (dateRange.from || dateRange.to) count++;
    if (selectedUser !== "all") count++;
    setActiveFilters(count);
    setFilterDrawerOpen(false);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header with search and filter */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-4 md:mb-0">
              Finance Dashboard
            </h1>
            <div className="flex gap-3 items-center">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 h-10 rounded-none border-gray-200 bg-white"
                />
              </div>

              <Drawer
                open={filterDrawerOpen}
                onOpenChange={setFilterDrawerOpen}
                direction="right"
              >
                <DrawerTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-none relative"
                  >
                    <Sliders className="h-4 w-4" />
                    {activeFilters > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center">
                        {activeFilters}
                      </span>
                    )}
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="right-0 h-full w-80 sm:w-96 rounded-l-xl fixed shadow-xl border-0">
                  <div className="h-full flex flex-col bg-white">
                    <DrawerHeader className="border-b border-gray-100 px-6 py-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <DrawerTitle className="text-xl font-semibold text-gray-900">
                            Filters
                          </DrawerTitle>
                          <DrawerDescription className="text-sm text-gray-500 mt-1">
                            Refine your transaction list
                          </DrawerDescription>
                        </div>
                        <DrawerClose asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </DrawerClose>
                      </div>
                    </DrawerHeader>

                    <div className="flex-1 overflow-y-auto">
                      <div className="px-6 py-4 space-y-6">
                        {/* Transaction Type Filter */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                              <Filter className="h-4 w-4 text-gray-500" />
                              Transaction Type
                            </label>
                            {typeFilter !== "all" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                onClick={() => setTypeFilter("all")}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>

                          <Select
                            value={typeFilter}
                            onValueChange={setTypeFilter}
                          >
                            <SelectTrigger
                              className={`w-full h-10 px-3 hover:bg-transparent cursor-pointer rounded-none ${typeFilter !== "all"
                                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                                : ""
                                }`}
                            >
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="border border-gray-200 shadow-lg rounded-lg">
                              <SelectItem value="all" className="py-2 px-3">
                                All Transactions{" "}
                                <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                                  {summary.totalTransactions}
                                </span>
                              </SelectItem>
                              <SelectItem
                                value="deposit"
                                className="py-2 px-3 text-green-600"
                              >
                                Deposits{" "}
                                <span className="ml-2 text-xs bg-green-50 px-2 py-0.5 rounded-full text-green-600">
                                  {summary.depositsCount}
                                </span>
                              </SelectItem>{" "}
                              <SelectItem
                                value="withdraw"
                                className="py-2 px-3 text-red-600"
                              >
                                Withdrawals
                                <span className="ml-2 text-xs bg-red-50 px-2 py-0.5 rounded-full text-red-600">
                                  {summary.withdrawalsCount}
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Date Range Filter */}
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                              <Clock className="h-4 w-4 text-gray-500" />
                              Date Range
                            </label>
                            {(dateRange.from || dateRange.to) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                onClick={() =>
                                  setDateRange({ from: null, to: null })
                                }
                              >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={`w-full justify-start text-left font-normal h-10 pl-3 hover:bg-transparent ${dateRange.from
                                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                                    : ""
                                    }`}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateRange.from ? (
                                    format(dateRange.from, "PPP")
                                  ) : (
                                    <span className="text-gray-500">
                                      From date
                                    </span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 border border-gray-200 shadow-lg rounded-lg">
                                <Calendar
                                  mode="single"
                                  selected={dateRange.from}
                                  onSelect={(date) =>
                                    setDateRange((prev) => ({
                                      ...prev,
                                      from: date,
                                    }))
                                  }
                                  initialFocus
                                  className="rounded-md"
                                />
                              </PopoverContent>
                            </Popover>

                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={`w-full justify-start text-left font-normal h-10 pl-3 hover:bg-transparent ${dateRange.to
                                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                                    : ""
                                    }`}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateRange.to ? (
                                    format(dateRange.to, "PPP")
                                  ) : (
                                    <span className="text-gray-500">
                                      To date
                                    </span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 border border-gray-200 shadow-lg rounded-lg">
                                <Calendar
                                  mode="single"
                                  selected={dateRange.to}
                                  onSelect={(date) =>
                                    setDateRange((prev) => ({
                                      ...prev,
                                      to: date,
                                    }))
                                  }
                                  initialFocus
                                  className="rounded-md"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* User Filter */}
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                              <User className="h-4 w-4 text-gray-500" />
                              User
                            </label>
                            {selectedUser !== "all" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                onClick={() => setSelectedUser("all")}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>

                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={`w-full justify-between h-10 px-3 hover:bg-transparent ${selectedUser !== "all"
                                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                                  : ""
                                  }`}
                              >
                                {selectedUser !== "all" ? (
                                  selectedUser
                                ) : (
                                  <span className="text-gray-500">
                                    Select user...
                                  </span>
                                )}
                                <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-full p-0 border border-gray-200 shadow-lg rounded-lg"
                              align="start"
                            >
                              <Command>
                                <CommandInput
                                  placeholder="Search user..."
                                  className="h-9 px-3"
                                />
                                <CommandList>
                                  <CommandEmpty>No user found.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="all"
                                      onSelect={() => setSelectedUser("all")}
                                      className="py-2 px-3"
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${selectedUser === "all"
                                          ? "opacity-100 text-blue-600"
                                          : "opacity-0"
                                          }`}
                                      />
                                      All Users
                                    </CommandItem>
                                    {uniqueUsers.map((user) => (
                                      <CommandItem
                                        key={user}
                                        value={user}
                                        onSelect={(currentValue) =>
                                          setSelectedUser(currentValue)
                                        }
                                        className="py-2 px-3"
                                      >
                                        <Check
                                          className={`mr-2 h-4 w-4 ${selectedUser === user
                                            ? "opacity-100 text-blue-600"
                                            : "opacity-0"
                                            }`}
                                        />
                                        {user}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 p-6 bg-gray-50">
                      <div className="flex flex-col gap-3">
                        <Button
                          onClick={applyFilters}
                          className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Apply Filters
                          {activeFilters > 0 && (
                            <span className="ml-2 h-5 w-5 rounded-full bg-white text-emerald-600 text-xs flex items-center justify-center">
                              {activeFilters}
                            </span>
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={resetFilters}
                          className="w-full h-10 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                          Reset All
                        </Button>
                      </div>
                    </div>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        </header>
        {/* Active Filters Display */}
        {activeFilters > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {typeFilter !== "all" && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>
                  Type:{" "}
                  {typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                </span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    setTypeFilter("all");
                    // Recalculate active filters
                    let count = 0;
                    if (dateRange.from || dateRange.to) count++;
                    if (selectedUser !== "all") count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {(dateRange.from || dateRange.to) && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>
                  Date:{" "}
                  {dateRange.from
                    ? format(dateRange.from, "MMM d, yyyy")
                    : "Any"}{" "}
                  to{" "}
                  {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "Any"}
                </span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    setDateRange({ from: null, to: null });
                    // Recalculate active filters
                    let count = 0;
                    if (typeFilter !== "all") count++;
                    if (selectedUser !== "all") count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {selectedUser !== "all" && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>User: {selectedUser}</span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    setSelectedUser("all");
                    // Recalculate active filters
                    let count = 0;
                    if (typeFilter !== "all") count++;
                    if (dateRange.from || dateRange.to) count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={handleResetFilters}
            >
              Clear all
            </Button>
          </div>
        )}
        {/* Error state */}
        {error.summary && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">
              Error loading financial summary: {error.summary}
            </p>
          </div>
        )}
        {error.transactions && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">
              Error loading transactions: {error.transactions}
            </p>
          </div>
        )}{" "}
        {/* Stats Cards - Updated to match Bet Management styling */}
        {loading.summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
            {[...Array(4)].map((_, i) => (
              <Card
                key={i}
                className="bg-white rounded-none shadow-sm border-0 overflow-hidden"
              >
                <CardContent className="px-5 py-3">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
            <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-green-600 mb-1">
                      Deposits
                    </p>{" "}
                    <p className="text-2xl font-bold text-gray-900">
                      ${summary.totalDeposits.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.depositsCount} transactions
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-1">
                      Withdrawals
                    </p>{" "}
                    <p className="text-2xl font-bold text-gray-900">
                      ${summary.totalWithdrawals.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.withdrawalsCount} transactions
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-600 mb-1">
                      Profits
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${summary.profits.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      From betting outcomes
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-purple-600 mb-1">
                      Current Balance
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${summary.currentBalance.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Total system balance
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>{" "}
            </Card>
          </div>
        )}

        {/* Data Table */}
        <Card className="rounded-none shadow-none px-2 py-2 gap-0">
          <CardContent className="p-1">
            {" "}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 text-[13px]">
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("id")}
                    >
                      <div className="flex items-center gap-2">
                        ID
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("userName")}
                    >
                      <div className="flex items-center gap-2">
                        User
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("type")}
                    >
                      <div className="flex items-center gap-2">
                        Type
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("amount")}
                    >
                      <div className="flex items-center gap-2">
                        Amount
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("dateTime")}
                    >
                      <div className="flex items-center gap-2">
                        Date & Time
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading.transactions ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center">
                          <Loader2 className="h-8 w-8 text-gray-400 animate-spin mb-2" />
                          <p className="text-gray-500">
                            Loading transactions...
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : paginatedTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-12 text-gray-500"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <Search className="h-8 w-8 text-gray-300 mb-2" />
                          <p>No transactions found</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Try adjusting your search or filter
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTransactions.map((item) => {
                      const { date, time } = formatDateTime(item.createdAt);
                      const userName =
                        item.user?.firstName && item.user?.lastName
                          ? `${item.user.firstName} ${item.user.lastName}`
                          : item.user?.email || "Unknown User";

                      return (
                        <TableRow
                          key={item._id}
                          className="hover:bg-gray-50 text-[13px]"
                        >
                          <TableCell className="font-mono">
                            {item._id.slice(-8)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-500" />
                              <span>{userName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.type)}
                              <span className="capitalize">{item.type}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatAmount(item.amount)}</TableCell>
                          <TableCell>
                            <div>
                              <div>{date}</div>
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
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          {/* Pagination with Entries Per Page Selector */}
          {sortedTransactions.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-1 pt-4 border-t gap-4">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Showing {pagination.itemsPerPage} of {pagination.totalItems}{" "}
                  transactions
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show</span>
                  <Select
                    value={String(pagination.itemsPerPage)}
                    onValueChange={(value) => {
                      const newLimit = Number(value);
                      const apiFilters = {
                        ...filters,
                        limit: newLimit,
                        page: 1,
                        type: typeFilter !== "all" ? typeFilter : "",
                        search: searchQuery,
                        dateFrom: dateRange.from
                          ? dateRange.from.toISOString()
                          : "",
                        dateTo: dateRange.to ? dateRange.to.toISOString() : "",
                        sortBy: sortColumn,
                        sortOrder: sortDirection,
                      };
                      dispatch(setFilters(apiFilters));
                      dispatch(fetchFinanceTransactions(apiFilters));
                    }}
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-600">entries</span>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={pagination.currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center">
                  {" "}
                  {Array.from({
                    length: Math.min(pagination.totalPages, 5),
                  }).map((_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (
                      pagination.currentPage >=
                      pagination.totalPages - 2
                    ) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={i}
                        variant={
                          pagination.currentPage === pageNum
                            ? "default"
                            : "outline"
                        }
                        size="icon"
                        className="h-8 w-8 mx-0.5"
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={pagination.currentPage === pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default FinancePage;

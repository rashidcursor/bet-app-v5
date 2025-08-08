"use client";
import React, { useState, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowUpDown,
  Calendar as CalendarIcon,
  DollarSign,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Sliders,
  User,
  Clock,
  Check,
  Ticket,
  Trophy,
  ThumbsDown,
  TrendingDown,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format } from "date-fns";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchAdminBets,
  selectAdminBets,
  selectAdminBetsLoading,
  selectAdminBetsError,
} from "@/lib/features/bets/betsSlice";

export default function BetManagement() {
  const dispatch = useDispatch();
  const betsByUser = useSelector(selectAdminBets);
  const loading = useSelector(selectAdminBetsLoading);
  const error = useSelector(selectAdminBetsError);
  const [allBets, setAllBets] = useState([]);
  const [uniqueUsers, setUniqueUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedUser, setSelectedUser] = useState("all");
  const [amountRange, setAmountRange] = useState({ min: "", max: "" });
  const [activeFilters, setActiveFilters] = useState(0);
  const [expandedCombinations, setExpandedCombinations] = useState(new Set());
  const [betTypeFilter, setBetTypeFilter] = useState("all");

  useEffect(() => {
    dispatch(fetchAdminBets());
  }, [dispatch]);

  useEffect(() => {
    if (betsByUser) {
      const flat = Object.entries(betsByUser).flatMap(([user, bets]) =>
        bets.map((bet) => ({ ...bet, user }))
      );
      setAllBets(flat);
      setUniqueUsers(Object.keys(betsByUser));
    }
  }, [betsByUser]);

  // Helper function to check if bet is a combination bet
  const isCombinationBet = (bet) => {
    return bet.combination && Array.isArray(bet.combination) && bet.combination.length > 0;
  };

  // Filtering
  const filteredBets = useMemo(() => {
    return allBets.filter((bet) => {
      // Status
      if (filter !== "all" && bet.status.toLowerCase() !== filter.toLowerCase())
        return false;
      // User
      if (selectedUser !== "all" && bet.user !== selectedUser) return false;
      // Bet Type
      if (betTypeFilter !== "all") {
        const isCombo = isCombinationBet(bet);
        if (betTypeFilter === "combo" && !isCombo) return false;
        if (betTypeFilter === "single" && isCombo) return false;
      }
      // Date
      if (dateRange.from || dateRange.to) {
        const betDate = new Date(bet.createdAt);
        if (dateRange.from && betDate < dateRange.from) return false;
        if (dateRange.to) {
          const endDate = new Date(dateRange.to);
          endDate.setHours(23, 59, 59);
          if (betDate > endDate) return false;
        }
      }
      // Amount
      if (amountRange.min && bet.stake < parseFloat(amountRange.min))
        return false;
      if (amountRange.max && bet.stake > parseFloat(amountRange.max))
        return false;
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          bet._id.toLowerCase().includes(query) ||
          bet.user.toLowerCase().includes(query) ||
          (bet.teams && bet.teams.toLowerCase().includes(query)) ||
          (bet.selection && bet.selection.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [allBets, filter, selectedUser, betTypeFilter, dateRange, amountRange, searchQuery]);

  // Sorting
  const sortedBets = useMemo(() => {
    return [...filteredBets].sort((a, b) => {
      const factor = sortDirection === "asc" ? 1 : -1;
      if (sortColumn === "stake") return (a.stake - b.stake) * factor;
      if (sortColumn === "odds") return (a.odds - b.odds) * factor;
      if (sortColumn === "createdAt")
        return (new Date(a.createdAt) - new Date(b.createdAt)) * factor;
      if (sortColumn === "user") return a.user.localeCompare(b.user) * factor;
      const valueA = a[sortColumn]?.toString().toLowerCase() || "";
      const valueB = b[sortColumn]?.toString().toLowerCase() || "";
      return valueA.localeCompare(valueB) * factor;
    });
  }, [filteredBets, sortColumn, sortDirection]);

  // Pagination
  const paginatedBets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedBets.slice(start, end);
  }, [sortedBets, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredBets.length / pageSize);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case "won":
        return "text-emerald-600 bg-emerald-50 border-emerald-200";
      case "lost":
        return "text-rose-600 bg-rose-50 border-rose-200";
      case "pending":
        return "text-amber-600 bg-amber-50 border-amber-200";
      case "cancelled":
      case "canceled":
        return "text-gray-600 bg-gray-50 border-gray-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "single":
        return <TrendingDown className="h-4 w-4 text-blue-600" />;
      case "accumulator":
        return <TrendingDown className="h-4 w-4 text-purple-600" />;
      case "system":
        return <TrendingDown className="h-4 w-4 text-orange-600" />;
      default:
        return <ArrowUpDown className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatAmount = (amount) => {
    return <span className="font-medium">${amount.toFixed(2)}</span>;
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
                  const calculateLegProfit = () => {
                    if (leg.status.toLowerCase() === 'won') {
                      return (bet.stake * leg.odds).toFixed(2);
                    } else if (leg.status.toLowerCase() === 'lost') {
                      return bet.stake.toFixed(2);
                    } else if (leg.status.toLowerCase() === 'cancelled' || leg.status.toLowerCase() === 'canceled') {
                      return '0.00';
                    }
                    return 0;
                  };

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

  const resetFilters = () => {
    setDateRange({ from: null, to: null });
    setSelectedUser("all");
    setAmountRange({ min: "", max: "" });
    setBetTypeFilter("all");
    setActiveFilters(0);
  };

  const applyFilters = () => {
    let count = 0;
    if (dateRange.from || dateRange.to) count++;
    if (selectedUser !== "all") count++;
    if (amountRange.min || amountRange.max) count++;
    if (filter !== "all") count++;
    if (betTypeFilter !== "all") count++;
    setActiveFilters(count);
    setFilterDrawerOpen(false);
  };

  // Format date and time for display
  function formatDateTime(dateTime) {
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
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[93%] mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-4 md:mb-0">
              Bet Management
            </h1>
            <div className="flex gap-3 items-center">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search bets..."
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
                            Refine your bet list
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
                        {/* Inside the drawer, add this as the first filter option */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                              <Filter className="h-4 w-4 text-gray-500" />
                              Status
                            </label>
                            {filter !== "all" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                onClick={() => setFilter("all")}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>

                          <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger
                              className={`w-full h-10 px-3 hover:bg-transparent cursor-pointer rounded-none ${
                                filter !== "all"
                                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                                  : ""
                              }`}
                            >
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent className="border border-gray-200 shadow-lg rounded-lg">
                              <SelectItem value="all" className="py-2 px-3">
                                All Bets
                                <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                                  {allBets.length}
                                </span>
                              </SelectItem>
                              <SelectItem
                                value="pending"
                                className="py-2 px-3 text-amber-600"
                              >
                                Pending
                                <span className="ml-2 text-xs bg-amber-50 px-2 py-0.5 rounded-full text-amber-600">
                                  {
                                    allBets.filter(
                                      (bet) =>
                                        bet.status &&
                                        bet.status.toLowerCase() === "pending"
                                    ).length
                                  }
                                </span>
                              </SelectItem>
                              <SelectItem
                                value="won"
                                className="py-2 px-3 text-emerald-600"
                              >
                                Won
                                <span className="ml-2 text-xs bg-emerald-50 px-2 py-0.5 rounded-full text-emerald-600">
                                  {
                                    allBets.filter(
                                      (bet) =>
                                        bet.status &&
                                        bet.status.toLowerCase() === "won"
                                    ).length
                                  }
                                </span>
                              </SelectItem>
                              <SelectItem
                                value="lost"
                                className="py-2 px-3 text-rose-600"
                              >
                                Lost
                                <span className="ml-2 text-xs bg-rose-50 px-2 py-0.5 rounded-full text-rose-600">
                                  {
                                    allBets.filter(
                                      (bet) =>
                                        bet.status &&
                                        bet.status.toLowerCase() === "lost"
                                    ).length
                                  }
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Bet Type Filter */}
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                              <Ticket className="h-4 w-4 text-gray-500" />
                              Bet Type
                            </label>
                            {betTypeFilter !== "all" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                onClick={() => setBetTypeFilter("all")}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>

                          <Select value={betTypeFilter} onValueChange={setBetTypeFilter}>
                            <SelectTrigger
                              className={`w-full h-10 px-3 hover:bg-transparent cursor-pointer rounded-none ${
                                betTypeFilter !== "all"
                                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                                  : ""
                              }`}
                            >
                              <SelectValue placeholder="Select bet type" />
                            </SelectTrigger>
                            <SelectContent className="border border-gray-200 shadow-lg rounded-lg">
                              <SelectItem value="all" className="py-2 px-3">
                                All Types
                                <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                                  {allBets.length}
                                </span>
                              </SelectItem>
                              <SelectItem
                                value="single"
                                className="py-2 px-3 text-blue-600"
                              >
                                Single Bets
                                <span className="ml-2 text-xs bg-blue-50 px-2 py-0.5 rounded-full text-blue-600">
                                  {
                                    allBets.filter(
                                      (bet) => !isCombinationBet(bet)
                                    ).length
                                  }
                                </span>
                              </SelectItem>
                              <SelectItem
                                value="combo"
                                className="py-2 px-3 text-purple-600"
                              >
                                Combination Bets
                                <span className="ml-2 text-xs bg-purple-50 px-2 py-0.5 rounded-full text-purple-600">
                                  {
                                    allBets.filter(
                                      (bet) => isCombinationBet(bet)
                                    ).length
                                  }
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
                                  className={`w-full justify-start text-left font-normal h-10 pl-3 hover:bg-transparent ${
                                    dateRange.from
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
                                  className={`w-full justify-start text-left font-normal h-10 pl-3 hover:bg-transparent ${
                                    dateRange.to
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
                                className={`w-full justify-between h-10 px-3 hover:bg-transparent ${
                                  selectedUser !== "all"
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
                                        className={`mr-2 h-4 w-4 ${
                                          selectedUser === "all"
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
                                          className={`mr-2 h-4 w-4 ${
                                            selectedUser === user
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

                        {/* Amount Range Filter */}
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                              <DollarSign className="h-4 w-4 text-gray-500" />
                              Amount Range
                            </label>
                            {(amountRange.min || amountRange.max) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                onClick={() =>
                                  setAmountRange({ min: "", max: "" })
                                }
                              >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>

                          <div className="flex gap-3 items-center">
                            <div className="flex-1">
                              <Input
                                type="number"
                                placeholder="Min"
                                value={amountRange.min}
                                onChange={(e) =>
                                  setAmountRange((prev) => ({
                                    ...prev,
                                    min: e.target.value,
                                  }))
                                }
                                className={`h-10 border border-gray-200 ${
                                  amountRange.min
                                    ? "border-blue-200 bg-blue-50"
                                    : ""
                                }`}
                              />
                            </div>
                            <div className="text-gray-400">to</div>
                            <div className="flex-1">
                              <Input
                                type="number"
                                placeholder="Max"
                                value={amountRange.max}
                                onChange={(e) =>
                                  setAmountRange((prev) => ({
                                    ...prev,
                                    max: e.target.value,
                                  }))
                                }
                                className={`h-10 border border-gray-200 ${
                                  amountRange.max
                                    ? "border-blue-200 bg-blue-50"
                                    : ""
                                }`}
                              />
                            </div>
                          </div>
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
            {filter !== "all" && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>
                  Status: {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    setFilter("all");
                    // Recalculate active filters
                    let count = 0;
                    if (dateRange.from || dateRange.to) count++;
                    if (selectedUser !== "all") count++;
                    if (amountRange.min || amountRange.max) count++;
                    if (betTypeFilter !== "all") count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {betTypeFilter !== "all" && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>
                  Type: {betTypeFilter === "combo" ? "Combination" : "Single"}
                </span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    setBetTypeFilter("all");
                    // Recalculate active filters
                    let count = 0;
                    if (filter !== "all") count++;
                    if (dateRange.from || dateRange.to) count++;
                    if (selectedUser !== "all") count++;
                    if (amountRange.min || amountRange.max) count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {dateRange.from && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>From: {format(dateRange.from, "PP")}</span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    const newDateRange = { ...dateRange, from: null };
                    setDateRange(newDateRange);
                    // Recalculate active filters
                    let count = 0;
                    if (filter !== "all") count++;
                    if (newDateRange.from || newDateRange.to) count++;
                    if (selectedUser !== "all") count++;
                    if (amountRange.min || amountRange.max) count++;
                    if (betTypeFilter !== "all") count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {dateRange.to && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>To: {format(dateRange.to, "PP")}</span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    const newDateRange = { ...dateRange, to: null };
                    setDateRange(newDateRange);
                    // Recalculate active filters
                    let count = 0;
                    if (filter !== "all") count++;
                    if (newDateRange.from || newDateRange.to) count++;
                    if (selectedUser !== "all") count++;
                    if (amountRange.min || amountRange.max) count++;
                    if (betTypeFilter !== "all") count++;
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
                    if (filter !== "all") count++;
                    if (dateRange.from || dateRange.to) count++;
                    if (amountRange.min || amountRange.max) count++;
                    if (betTypeFilter !== "all") count++;
                    setActiveFilters(count);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {(amountRange.min || amountRange.max) && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 py-1 px-3"
              >
                <span>
                  Amount: ${amountRange.min || "0"} - ${amountRange.max || "∞"}
                </span>
                <button
                  className="ml-1 cursor-pointer"
                  onClick={() => {
                    setAmountRange({ min: "", max: "" });
                    // Recalculate active filters
                    let count = 0;
                    if (filter !== "all") count++;
                    if (dateRange.from || dateRange.to) count++;
                    if (selectedUser !== "all") count++;
                    if (betTypeFilter !== "all") count++;
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
              onClick={resetFilters}
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Stats Cards - Text left, icon right layout */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="px-5 py-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 mb-1">
                    All Bets
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {filteredBets.length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <Ticket className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="px-5 py-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-1">
                    Pending
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {
                      filteredBets.filter(
                        (bet) => bet.status.toLowerCase() === "pending"
                      ).length
                    }
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="px-5 py-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-600 mb-1">
                    Won
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {
                      filteredBets.filter(
                        (bet) => bet.status.toLowerCase() === "won"
                      ).length
                    }
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-none shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="px-5 py-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-rose-600 mb-1">Lost</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {
                      filteredBets.filter(
                        (bet) => bet.status.toLowerCase() === "lost"
                      ).length
                    }
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
                  <ThumbsDown className="h-5 w-5 text-rose-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border-l-4 border-red-500 mb-6">
            {error}
          </div>
        )}

        {/* Bets Table */}
        <Card className="rounded-none shadow-none px-2 py-2 gap-0">
          <CardContent className="p-1">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 text-[13px]">
                    <TableHead className="w-8"></TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("user")}
                    >
                      <div className="flex items-center gap-2">
                        User Name
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("stake")}
                    >
                      <div className="flex items-center gap-2">
                        Stake
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("odds")}
                    >
                      <div className="flex items-center gap-2">
                        Odds
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("createdAt")}
                    >
                      <div className="flex items-center gap-2">
                        Date & Time
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("status")}
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
                      onClick={() => handleSort("payout")}
                    >
                      <div className="flex items-center gap-2">
                        Profit
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBets.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        className="text-center py-12 text-gray-500"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <Search className="h-8 w-8 text-gray-300 mb-2" />
                          <p>No bets found</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Try adjusting your search or filter
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedBets.map((bet) => {
                      const { date, time } = formatDateTime(bet.createdAt);
                      const isExpanded = expandedCombinations.has(bet._id);
                      const isCombo = isCombinationBet(bet);
                      
                      return (
                        <React.Fragment key={bet._id}>
                          <TableRow
                            className={`hover:bg-gray-50 text-[13px] ${isCombo ? 'cursor-pointer' : ''}`}
                            onClick={isCombo ? () => toggleCombinationExpansion(bet._id) : undefined}
                          >
                            <TableCell>
                              {isCombo && (
                                isExpanded ? <ChevronDown className="h-4 w-4 text-purple-600" /> : <ChevronRight className="h-4 w-4 text-purple-600" />
                              )}
                            </TableCell>
                            <TableCell>{bet.user}</TableCell>
                            <TableCell>{isCombo ? formatAmount(bet.stake * bet.combination.length) : formatAmount(bet.stake)}</TableCell>
                            <TableCell>{parseFloat(bet.odds).toFixed(2)}</TableCell>
                            <TableCell>
                              <div>
                                <div>{date}</div>
                                <div className="text-gray-500">{time}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={getStatusColor(bet.status)}
                              >
                                {bet.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {getBetTypeBadge(bet)}
                            </TableCell>
                            <TableCell className="max-w-48">
                              <div className="truncate" title={isCombo ? `Combination Bet (${bet.combination.length} legs)` : bet.teams}>
                                {isCombo ? `Combination (${bet.combination.length} legs)` : (bet.teams || "-")}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-48">
                              <div className="truncate" title={isCombo ? "Multiple Markets" : bet.betDetails?.market_description}>
                                {isCombo ? "Multiple Markets" : (bet.betDetails?.market_description || "-")}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-48">
                              <div className="truncate" title={isCombo ? "Multiple Selections" : bet.selection}>
                                {isCombo ? "Multiple Selections" : (
                                  bet.betDetails?.market_id === "37" 
                                    ? `${bet.betDetails?.label} ${bet.betDetails?.total} / ${bet.betDetails?.name}`
                                    : (bet.selection || "-")
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-32">
                              <div className="truncate" title={isCombo ? "N/A" : bet.betDetails?.total}>
                                {isCombo ? "N/A" : (
                                  bet.betDetails?.market_id === "37" 
                                    ? bet.betDetails?.total
                                    : (bet.betDetails?.total || "-")
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {bet.status.toLowerCase() === "won" ? (
                                <span className="font-medium text-green-600">
                                  +${(bet.stake * bet.odds).toFixed(2)}
                                </span>
                              ) : bet.status.toLowerCase() === "pending" ? (
                                <span className="text-gray-500">Pending</span>
                              ) : bet.status.toLowerCase() === "cancelled" || bet.status.toLowerCase() === "canceled" ? (
                                <span className="text-gray-500">$0.00</span>
                              ) : (
                                <span className="font-medium text-red-600">
                                  -${bet.stake.toFixed(2)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && isCombo && renderCombinationDetails(bet)}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          {/* Pagination */}
          {sortedBets.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 pt-4 border-t gap-4">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Showing {paginatedBets.length} of {filteredBets.length} bets
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
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
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center">
                  {Array.from({ length: Math.min(totalPages, 5) }).map(
                    (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <Button
                          key={i}
                          variant={
                            currentPage === pageNum ? "default" : "outline"
                          }
                          size="icon"
                          className="h-8 w-8 mx-0.5"
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    }
                  )}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
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
}

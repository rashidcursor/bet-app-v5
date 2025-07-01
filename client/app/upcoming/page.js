"use client";

import React, { useEffect } from "react";
import { CalendarDays } from "lucide-react";
import MatchListPage from "@/components/shared/MatchListPage";
import { useDispatch, useSelector } from "react-redux";
import { fetchUpcomingMatches, selectUpcomingMatches, selectUpcomingMatchesLoading, selectUpcomingMatchesError } from "@/lib/features/matches/matchesSlice";

const UpcomingMatchesPage = () => {
  const upcomingMatches = useSelector(selectUpcomingMatches);
  const loading = useSelector(selectUpcomingMatchesLoading);
  const error = useSelector(selectUpcomingMatchesError);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUpcomingMatches());
  }, [dispatch]);

  const formatUpcomingTime = (startTime, match) => {
    if (!startTime) return "TBD";

    // Extract time from ISO string if it's in that format
    if (typeof startTime === 'string' && startTime.includes('T')) {
      const date = new Date(startTime);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // If it's already in a time format like "14:30:00", extract just HH:MM
    if (typeof startTime === 'string' && startTime.includes(':')) {
      return startTime.split(':').slice(0, 2).join(':');
    }

    return startTime;
  };

  const upcomingConfig = {
    pageTitle: "Upcoming Matches",
    breadcrumbText: "Football | Upcoming Matches",
    leagues: upcomingMatches || [],
    loading,
    error,
    retryFunction: () => dispatch(fetchUpcomingMatches()),
    matchTimeFormatter: formatUpcomingTime,
    PageIcon: CalendarDays,
    noMatchesConfig: {
      title: "No Upcoming Matches",
      message: "There are no upcoming matches scheduled for today.",
      buttonText: "View All Leagues",
      buttonLink: "/leagues",
      Icon: CalendarDays,
    },
    viewAllMatchesLink: "/matches",
  };

  return <MatchListPage config={upcomingConfig} />;
};

export default UpcomingMatchesPage;

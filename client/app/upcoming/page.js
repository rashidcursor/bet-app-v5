"use client";

import React, { useEffect } from "react";
import { CalendarDays } from "lucide-react";
import MatchListPage from "@/components/shared/MatchListPage";
import { useDispatch, useSelector } from "react-redux";
import { fetchUpcomingMatches, selectUpcomingMatches, selectUpcomingMatchesLoading, selectUpcomingMatchesError } from "@/lib/features/matches/matchesSlice";
import { formatToLocalTime } from '@/lib/utils';

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
    return formatToLocalTime(startTime, { format: 'default' });
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

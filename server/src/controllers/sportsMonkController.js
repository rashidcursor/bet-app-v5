import sportsMonksService from "../services/sportsMonks.service.js";
import { asyncHandler } from "../utils/customErrors.js";

export const getLeagues = asyncHandler(async (req, res) => {
  const leagues = await sportsMonksService.getLeagues();
  const filteredLeagues = leagues.map((league) => ({
    ...league,
    country: {
      id: league.country?.id,
      image: league.country?.image_path,
      official_name: league.country?.official_name,
    },
  }));
  res.status(200).json({
    success: true,
    message: "Leagues fetched successfully",
    data: filteredLeagues,
    timestamp: new Date().toISOString(),
  });
});

export const getMatches = asyncHandler(async (req, res) => {
  const { leagueId } = req.params;
  const matches = await sportsMonksService.getMatches(leagueId);
  res.status(200).json({
    success: true,
    message: "Matches fetched successfully",
    data: matches,
    timestamp: new Date().toISOString(),
  });
});

export const getMarkets = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const markets = await sportsMonksService.getMarkets(matchId);
  res.status(200).json({
    success: true,
    message: "Markets fetched successfully",
    data: markets,
    timestamp: new Date().toISOString(),
  });
});

export const getLiveMatches = asyncHandler(async (req, res) => {
  const matches = await sportsMonksService.getLiveMatches();
  res.status(200).json({
    success: true,
    message: "Live matches fetched successfully",
    data: matches,
    timestamp: new Date().toISOString(),
  });
});

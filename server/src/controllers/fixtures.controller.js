import fixtureOptimizationService from "../services/fixture.service.js";
import { asyncHandler } from "../utils/customErrors.js";

// Get optimized fixtures with pagination and filtering

export const getOptimizedFixtures = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    leagues,
    dateFrom,
    dateTo,
    states,
    includeOdds = "true",
    priority,
  } = req.query;

  // Parse query parameters
  const options = {
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100), // Limit to prevent abuse
    leagues: leagues ? leagues.split(",").map((id) => parseInt(id)) : [],
    dateFrom,
    dateTo,
    states: states ? states.split(",").map((id) => parseInt(id)) : [1],
    includeOdds: includeOdds === "true",
    priority,
  };

  const fixtures = await fixtureOptimizationService.getOptimizedFixtures(
    options
  );

  res.status(200).json({
    success: true,
    message: "Optimized fixtures fetched successfully",
    data: fixtures,
    pagination: {
      page: options.page,
      limit: options.limit,
      total: fixtures.length,
    },
    filters: {
      leagues: options.leagues,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      states: options.states,
      includeOdds: options.includeOdds,
      priority: options.priority,
    },
    cached: true, // Will be false if data is fresh from API
    timestamp: new Date().toISOString(),
  });
});

// Get today's fixtures (optimized for homepage)
export const getTodaysFixtures = asyncHandler(async (req, res) => {
  const { leagues } = req.query;
  const leagueIds = leagues ? leagues.split(",").map((id) => parseInt(id)) : [];

  const fixtures = await fixtureOptimizationService.getTodaysFixtures(
    leagueIds
  );
  res.status(200).json({
    success: true,
    message: "Today's fixtures fetched successfully",
    data: fixtures,
    count: fixtures.length,
    timestamp: new Date().toISOString(),
  });
});

// Get upcoming fixtures
export const getUpcomingFixtures = asyncHandler(async (req, res) => {
  const fixtures = await fixtureOptimizationService.getUpcomingFixtures();

  res.status(200).json({
    success: true,
    message: "Upcoming fixtures fetched successfully",
    data: fixtures,
    count: fixtures.length,

    timestamp: new Date().toISOString(),
  });
});

// Get popular leagues (cached)
export const getPopularLeagues = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const parsedLimit = Math.min(parseInt(limit), 25); // Max 25 leagues

  const leagues = await fixtureOptimizationService.getPopularLeagues(
    parsedLimit
  );

  res.status(200).json({
    success: true,
    message: "Popular leagues fetched successfully",
    data: leagues,
    count: leagues.length,
    requested_limit: parsedLimit,
    timestamp: new Date().toISOString(),
  });
});

// Get homepage data (optimized for homepage display)
export const getHomepageFixtures = asyncHandler(async (req, res) => {
  const homepageData = await fixtureOptimizationService.getHomepageData();

  res.status(200).json({
    success: true,
    message: "Homepage fixtures fetched successfully",
    data: {
      top_picks: homepageData.top_picks || [],
      football_daily: homepageData.football_daily || [],
      // in_play: homepageData.in_play || [], //TODO: Skip for now
    },
    stats: {
      top_picks_count: homepageData.top_picks?.length || 0,
      football_daily_leagues: homepageData.football_daily?.length || 0,
      total_daily_matches:
        homepageData.football_daily?.reduce(
          (sum, league) => sum + league.match_count,
          0
        ) || 0,
    },
    cache_info: {
      cached: true,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    },
    timestamp: new Date().toISOString(),
  });
});

// Get specific match by ID with all details
export const getMatchById = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const {
    includeOdds = "true",
    includeLeague = "true",
    includeParticipants = "true",
  } = req.query;

  // Validate match ID
  if (!matchId || isNaN(parseInt(matchId))) {
    return res.status(400).json({
      success: false,
      message: "Valid match ID is required",
      error: "INVALID_MATCH_ID",
    });
  }

  const options = {
    includeOdds: includeOdds === "true",
    includeLeague: includeLeague === "true",
    includeParticipants: includeParticipants === "true",
  };

  const match = await fixtureOptimizationService.getMatchById(
    parseInt(matchId),
    options
  );

  res.status(200).json({
    success: true,
    message: "Match details fetched successfully",
    data: match,
    options: {
      includeOdds: options.includeOdds,
      includeLeague: options.includeLeague,
      includeParticipants: options.includeParticipants,
    },
    stats: {
      odds_count:
        match.odds && Array.isArray(match.odds)
          ? match.odds.length
          : Object.keys(match.odds || {}).length,
      markets_count: match.odds_by_market
        ? Object.keys(match.odds_by_market).length
        : 0,
      participants_count: match.participants ? match.participants.length : 0,
      has_league_info: !!match.league,
      classification_stats: match.odds_classification?.stats || null,
    },
    timestamp: new Date().toISOString(),
  });
});

// Get matches by league ID
export const getMatchesByLeague = asyncHandler(async (req, res) => {
  const { leagueId } = req.params;
  const { fixtures, league } =
    await fixtureOptimizationService.getMatchesByLeague(leagueId);

  res.status(200).json({
    success: true,
    message: `Matches for league ${leagueId} fetched successfully`,
    data: fixtures,
    league: league,
    count: fixtures.length,
    timestamp: new Date().toISOString(),
  });
});

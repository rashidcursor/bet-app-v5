import express from "express";
import {
  getOptimizedFixtures,
  getTodaysFixtures,
  getUpcomingFixtures,
  getPopularLeagues,
  getHomepageFixtures,
  getMatchById,
  getMatchesByLeague,
} from "../controllers/fixtures.controller.js";

import { authenticateToken, requireAdmin } from "../middlewares/auth.js";

const fixturesRouter = express.Router();

// Public routes (cached and optimized)
fixturesRouter.get("/", getOptimizedFixtures);
fixturesRouter.get("/homepage", getHomepageFixtures);
fixturesRouter.get("/today", getTodaysFixtures);
fixturesRouter.get("/upcoming", getUpcomingFixtures);
fixturesRouter.get("/leagues/popular", getPopularLeagues);

// Test endpoint to compare optimization
fixturesRouter.get("/:matchId", getMatchById);
fixturesRouter.get("/upcoming", getUpcomingFixtures);

// Add new route for matches by league
fixturesRouter.get("/league/:leagueId", getMatchesByLeague);

// NOTE: These are admin routes for monitoring and cache management
// // Protected routes for monitoring and admin
// fixturesRouter.get(
//   "/cache/stats",
//   requireAuth,

//   getCacheStats
// );
// fixturesRouter.post(
//   "/cache/clear",
//   requireAuth,
//   requireRole(["admin"]),
//   clearCache
// );
// fixturesRouter.post(
//   "/preload",
//   requireAuth,
//   requireRole(["admin"]),
//   preloadData
// );

export default fixturesRouter;

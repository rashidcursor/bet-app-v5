import axios from "axios";
import https from "https";
import { CustomError } from "../utils/customErrors.js";
import NodeCache from "node-cache";

class SportsMonksService {
  //INFO: This is for initializing the SportsMonks API client
  constructor() {
    this.apiKey = process.env.SPORTSMONKS_API_KEY;
    this.baseURL = process.env.SPORTSMONKS_BASE_URL;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      params: {
        api_token: this.apiKey,
      },
      // Handle potential SSL issues in development
      httpsAgent:
        process.env.NODE_ENV === "development"
          ? new https.Agent({ rejectUnauthorized: false })
          : undefined,
    }); // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(
          `📡 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${
            config.url
          }`
        );
        console.log(
          `🔗 Full URL: ${config.baseURL}${config.url}?${new URLSearchParams(
            config.params
          ).toString()}`
        );
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("API Error:", error.response?.data || error.message);
        return Promise.reject(error);
      }
    );

    this.cache = new NodeCache();
  }

  async getLeagues() {
    try {
      // Check cache first
      const cachedLeagues = this.cache.get("leagues");
      if (cachedLeagues) {
        console.log("Returning leagues from cache:", cachedLeagues.length);
        return cachedLeagues;
      }
      let allLeagues = [];
      let page = 1;
      const perPage = 50; // Max results per page with includes

      while (true) {
        const response = await this.client.get("/football/leagues", {
          params: {
            include: "country",
            per_page: perPage,
            page: page,
          },
        });

        //INFO: Check if response contains data
        if (!response.data?.data || response.data.data.length === 0) {
          if (allLeagues.length === 0) {
            throw new CustomError(
              "SportsMonks API: No leagues found",
              404,
              "LEAGUES_NOT_FOUND"
            );
          }
          break;
        }

        //INFO: Append leagues from current page
        allLeagues = allLeagues.concat(response.data.data);
        console.log(
          `Fetched page ${page}: ${response.data.data.length} leagues (Total: ${allLeagues.length})`
        );

        //INFO: Exit if no more pages
        if (!response.data.pagination?.has_more) {
          break;
        }

        page++; //INFO: Move to next page
      }

      if (allLeagues.length === 0) {
        throw new CustomError(
          "SportsMonks API: No leagues found",
          404,
          "LEAGUES_NOT_FOUND"
        );
      }

      // Store in cache for 1 day (86400 seconds)
      this.cache.set("leagues", allLeagues, 60 * 60 * 24);
      console.log("All leagues fetched successfully:", allLeagues.length);
      return allLeagues;
    } catch (error) {
      console.error("Error fetching leagues:", error);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new CustomError(
          "SportsMonks API: Timeout while fetching leagues",
          408,
          "API_TIMEOUT"
        );
      }

      if (error.response) {
        throw new CustomError(
          `SportsMonks API: Failed to fetch leagues - ${
            error.response.data?.message || error.message
          }`,
          error.response.status,
          "SPORTSMONKS_API_ERROR"
        );
      }

      throw new CustomError(
        "SportsMonks API: Unable to fetch leagues at this time",
        500,
        "INTERNAL_ERROR"
      );
    }
  }
  async getMatches(leagueId) {
    try {
      // Get current date in YYYY-MM-DD format for filtering future matches
      const currentDate = new Date().toISOString().split("T")[0];

      const response = await this.client.get(`/football/fixtures`, {
        params: {
          include: "participants",
          filters: `fixtureLeagues:${leagueId};`,
        },
      });

      if (!response.data?.data || response.data.data.length === 0) {
        throw new CustomError(
          "SportsMonks API: No matches found for this league",
          404,
          "MATCHES_NOT_FOUND"
        );
      }

      return this.transformMatches(response.data.data);
    } catch (error) {
      console.error("Error fetching matches:", error);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new CustomError(
          "SportsMonks API: Timeout while fetching matches",
          408,
          "API_TIMEOUT"
        );
      }

      if (error.response) {
        throw new CustomError(
          `SportsMonks API: Failed to fetch matches - ${
            error.response.data?.message || error.message
          }`,
          error.response.status,
          "SPORTSMONKS_API_ERROR"
        );
      }

      throw new CustomError(
        "SportsMonks API: Unable to fetch matches at this time",
        500,
        "INTERNAL_ERROR"
      );
    }
  }
  async getMarkets(matchId) {
    try {
      const response = await this.client.get(`/football/fixtures/${matchId}`, {
        params: {
          include: "odds.bookmaker,odds.market",
        },
      });

      if (!response.data?.data) {
        throw new CustomError(
          "SportsMonks API: No markets found for this match",
          404,
          "MARKETS_NOT_FOUND"
        );
      }

      return response.data.data;
    } catch (error) {
      console.error("Error fetching markets:", error);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new CustomError(
          "SportsMonks API: Timeout while fetching markets",
          408,
          "API_TIMEOUT"
        );
      }

      if (error.response) {
        throw new CustomError(
          `SportsMonks API: Failed to fetch markets - ${
            error.response.data?.message || error.message
          }`,
          error.response.status,
          "SPORTSMONKS_API_ERROR"
        );
      }

      throw new CustomError(
        "SportsMonks API: Unable to fetch markets at this time",
        500,
        "INTERNAL_ERROR"
      );
    }
  }
  async getOptimizedFixtures(apiParams) {
    try {
      console.log(
        "🔍 Making optimized fixtures API call with params:",
        apiParams
      );

      const response = await this.client.get("/football/fixtures", {
        params: {
          ...apiParams,
          bookmakers: 2,
        },
      });

      // If no fixtures found, return empty array instead of throwing error
      if (!response.data?.data) {
        return { data: [] };
      }

      return response.data;
    } catch (error) {
      console.error("Error fetching optimized fixtures:", error);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new CustomError(
          "SportsMonks API: Timeout while fetching fixtures",
          408,
          "API_TIMEOUT"
        );
      }

      if (error.response) {
        throw new CustomError(
          `SportsMonks API: Failed to fetch fixtures - ${
            error.response.data?.message || error.message
          }`,
          error.response.status,
          "SPORTSMONKS_API_ERROR"
        );
      }

      throw new CustomError(
        "SportsMonks API: Unable to fetch fixtures at this time",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  transformMatches(matches) {
    return matches;
  }

  transformMarkets(match) {
    const markets = [
      {
        id: "match_result_1",
        type: "match_result",
        name: "Full Time Result",
        selections: [
          {
            id: "home",
            name: match.participants?.[0]?.name || "Home",
            odds: 2.1,
          },
          { id: "draw", name: "Draw", odds: 3.4 },
          {
            id: "away",
            name: match.participants?.[1]?.name || "Away",
            odds: 3.2,
          },
        ],
      },
      {
        id: "over_under_1",
        type: "over_under",
        name: "Total Goals Over/Under 2.5",
        selections: [
          { id: "over", name: "Over 2.5", odds: 1.95 },
          { id: "under", name: "Under 2.5", odds: 1.85 },
        ],
      },
      {
        id: "both_teams_score_1",
        type: "both_teams_score",
        name: "Both Teams To Score",
        selections: [
          { id: "yes", name: "Yes", odds: 1.75 },
          { id: "no", name: "No", odds: 2.05 },
        ],
      },
    ];

    return markets;
  }

  extractMainOdds(odds) {
    if (!odds || odds.length === 0) return null;

    // Try to find 1X2 market odds
    const mainMarket = odds.find(
      (odd) =>
        odd.market?.name?.includes("1X2") ||
        odd.market?.name?.includes("Match Winner")
    );

    if (mainMarket && mainMarket.bookmaker) {
      return {
        home: mainMarket.bookmaker.odds?.[0]?.value || 2.0,
        draw: mainMarket.bookmaker.odds?.[1]?.value || 3.2,
        away: mainMarket.bookmaker.odds?.[2]?.value || 3.5,
      };
    }
    return {
      home: 2.1,
      draw: 3.4,
      away: 3.2,
    };
  }

  getActiveMatchesFromCache() {
    // Delegate to fixtureOptimizationService
    return (
      (global.fixtureOptimizationService || {}).getActiveMatchesFromCache?.() ||
      []
    );
  }
}

export default new SportsMonksService();

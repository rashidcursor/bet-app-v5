import apiClient from "@/config/axios";
import unibetDirectService from "./unibetDirect.service"; // Direct Unibet API calls

class MatchesService {
  /**
   * Get match details by ID with all related data
   * @param {string|number} matchId - The match ID
   * @param {Object} options - Additional options
   * @returns {Promise} - Match data with odds classification and betting data
   */
  async getMatchById(matchId, options = {}) {
    const {
      includeOdds = true,
      includeLeague = true,
      includeParticipants = true,
    } = options;

    try {
      const response = await apiClient.get(`/fixtures/${matchId}`, {
        params: {
          includeOdds: includeOdds.toString(),
          includeLeague: includeLeague.toString(),
          includeParticipants: includeParticipants.toString(),
        },
      });

      return response.data;
    } catch (error) {
      console.error("Error fetching match details:", error);
      throw new Error(
        error.response?.data?.error?.message ||
          error.response?.data?.message ||
          "Failed to fetch match details"
      );
    }
  }

  /**
   * Get match odds only (lighter request)
   * @param {string|number} matchId - The match ID
   * @returns {Promise} - Match odds data
   */
  async getMatchOdds(matchId) {
    try {
      const response = await this.getMatchById(matchId, {
        includeOdds: true,
        includeLeague: false,
        includeParticipants: false,
      });

      return {
        odds: response.data.odds,
        odds_classification: response.data.odds_classification,
        betting_data: response.data.betting_data,
      };
    } catch (error) {
      console.error("Error fetching match odds:", error);
      throw error;
    }
  }

  /**
   * Get today's matches with all related data
   * @param {Object} options - Additional options
   * @returns {Promise} - Today's matches data
   */
  async getTodaysMatches(options = {}) {
    const { leagues } = options;

    try {
      const params = {};
      if (leagues && leagues.length > 0) {
        params.leagues = leagues.join(",");
      }

      const response = await apiClient.get("/fixtures/today", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching today's matches:", error);
      throw new Error(
        error.response?.data?.error?.message ||
          error.response?.data?.message ||
          "Failed to fetch today's matches"
      );
    }
  }

  // ===== NEW CLEAN API METHODS (from unibet-api) =====

  /**
   * Get betting offers for a specific match using DIRECT Unibet API (no backend)
   * @param {string|number} eventId - The event/match ID
   * @returns {Promise} - Betting offers data from Unibet API
   */
  async getBetOffersV2(eventId, opts = {}) {
    try {
      console.log(`🔍 [DIRECT] Fetching bet offers for event: ${eventId} (direct from Unibet)`);
      
      // ✅ DIRECT CALL: Frontend → Unibet API (no backend)
      const data = await unibetDirectService.getBetOffers(eventId);
      
      if (data.success) {
        console.log(`✅ [DIRECT] Successfully fetched bet offers for event: ${eventId} (source: ${data.source})`);
        return data;
      } else {
        // Handle 404 case (match finished). Return full data when silent so slice can clear match.
        if (opts.silent) {
          console.warn(`⚠️ [DIRECT] Match not found (404) for event ${eventId}`);
          return { ...data, eventId: data.eventId ?? eventId };
        }
        throw new Error(data.message || 'Match not found or finished');
      }
    } catch (error) {
      // For silent updates (polling), don't throw errors - just return null
      if (opts.silent) {
        console.warn(`⚠️ [DIRECT] Silent update failed for event ${eventId}:`, error.message);
        return null;
      }
      
      console.error('❌ [DIRECT] Error fetching bet offers:', error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch bet offers from Unibet'
      );
    }
  }

  /**
   * Get live matches using DIRECT Unibet API (no backend)
   * @returns {Promise} - Live matches data from Unibet API
   */
  async getLiveMatchesV2() {
    try {
      console.log('🔍 [DIRECT] Fetching live matches (direct from Unibet)...');
      
      // ✅ DIRECT CALL: Frontend → Unibet API (no backend)
      const data = await unibetDirectService.getLiveMatches();
      
      // Handle timeout/null response gracefully
      if (!data) {
        console.warn('⚠️ [DIRECT] getLiveMatches returned null (likely timeout)');
        return null; // Return null for silent updates to handle gracefully
      }
      
      if (data.success) {
        console.log(`✅ [NEXT PROXY] Successfully fetched live matches (source: ${data.source})`);
        
        // Data is already extracted and filtered by Next.js API route (same as backend)
        // Just return the response as-is
        return {
          success: true,
          matches: data.matches || [],
          allMatches: data.allMatches || [],
          upcomingMatches: data.upcomingMatches || [],
          totalMatches: data.totalMatches || 0,
          totalAllMatches: data.totalAllMatches || 0,
          lastUpdated: data.lastUpdated || data.timestamp,
          source: data.source
        };
      } else {
        throw new Error(data.message || 'Failed to fetch live matches');
      }
    } catch (error) {
      // For timeout errors, return null instead of throwing
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
        console.warn('⏱️ [DIRECT] Request timeout - will retry on next poll');
        return null;
      }
      
      console.error('❌ [DIRECT] Error fetching live matches:', error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch live matches from Unibet'
      );
    }
  }

  // Note: extractMatchesFromUnibetResponse removed - extraction and filtering now done in Next.js API route

  /**
   * Get all football matches (live + upcoming) using DIRECT Unibet API (no backend)
   * @returns {Promise} - All football matches data from Unibet API
   */
  async getAllFootballMatchesV2() {
    try {
      console.log('🔍 [DIRECT] Fetching all football matches (direct from Unibet)...');
      
      // ✅ DIRECT CALL: Frontend → Unibet API (no backend)
      const data = await unibetDirectService.getLiveMatches();
      
      if (data.success) {
        console.log(`✅ [NEXT PROXY] Successfully fetched all football matches (source: ${data.source})`);
        // Data is already extracted and filtered by Next.js API route
        return {
          success: true,
          matches: data.matches || [],
          allMatches: data.allMatches || [],
          upcomingMatches: data.upcomingMatches || [],
          totalMatches: data.totalMatches || 0,
          totalAllMatches: data.totalAllMatches || 0,
          lastUpdated: data.lastUpdated || data.timestamp,
          source: data.source
        };
      } else {
        throw new Error(data.message || 'Failed to fetch all football matches');
      }
    } catch (error) {
      console.error('❌ [DIRECT] Error fetching all football matches:', error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch all football matches from Unibet'
      );
    }
  }

  // ===== MIGRATION HELPER METHODS =====

  /**
   * Get match by ID using new clean API (for migration)
   * @param {string|number} matchId - The match ID
   * @returns {Promise} - Match data from new API
   */
  async getMatchByIdV2(matchId) {
    try {
      // Use new clean API instead of old complex one
      return await this.getBetOffersV2(matchId);
    } catch (error) {
      console.error('Error fetching match by ID V2:', error);
      throw error;
    }
  }

  /**
   * Get live odds using new clean API (for migration)
   * @param {string|number} matchId - The match ID
   * @returns {Promise} - Live odds data from new API
   */
  async getLiveOddsV2(matchId) {
    try {
      // Use new clean API instead of WebSocket
      return await this.getBetOffersV2(matchId);
    } catch (error) {
      console.error('Error fetching live odds V2:', error);
      throw error;
    }
  }
}

// Create and export a single instance
const matchesService = new MatchesService();
export default matchesService;
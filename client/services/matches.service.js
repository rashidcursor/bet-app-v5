import apiClient from "@/config/axios";

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
   * Get betting offers for a specific match using new clean API
   * @param {string|number} eventId - The event/match ID
   * @returns {Promise} - Betting offers data from Unibet API
   */
  async getBetOffersV2(eventId, opts = {}) {
    try {
      console.log(`🔍 Fetching bet offers for event: ${eventId}`);
      const params = {};
      if (opts.noCache) {
        params._ts = Date.now(); // cache buster
      }
      const response = await apiClient.get(`/v2/betoffers/${eventId}` , { params });
      
      if (response.data.success) {
        console.log(`✅ Successfully fetched bet offers for event: ${eventId}`);
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to fetch bet offers');
      }
    } catch (error) {
      console.error('❌ Error fetching bet offers:', error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch bet offers'
      );
    }
  }

  /**
   * Get live matches using new clean API
   * @returns {Promise} - Live matches data from Unibet API
   */
  async getLiveMatchesV2() {
    try {
      console.log('🔍 Fetching live matches from new API...');
      const response = await apiClient.get('/v2/live-matches');
      
      if (response.data.success) {
        console.log(`✅ Successfully fetched ${response.data.totalMatches} live matches`);
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to fetch live matches');
      }
    } catch (error) {
      console.error('❌ Error fetching live matches:', error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch live matches'
      );
    }
  }

  /**
   * Get all football matches (live + upcoming) using new clean API
   * @returns {Promise} - All football matches data from Unibet API
   */
  async getAllFootballMatchesV2() {
    try {
      console.log('🔍 Fetching all football matches from new API...');
      const response = await apiClient.get('/v2/live-matches');
      
      if (response.data.success) {
        console.log(`✅ Successfully fetched ${response.data.totalAllMatches} total matches`);
        return {
          ...response.data,
          allMatches: response.data.allMatches || [],
          upcomingMatches: response.data.upcomingMatches || []
        };
      } else {
        throw new Error(response.data.message || 'Failed to fetch all football matches');
      }
    } catch (error) {
      console.error('❌ Error fetching all football matches:', error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch all football matches'
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
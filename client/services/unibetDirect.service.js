import axios from 'axios';

// Use Next.js API routes as proxy (handles CORS) - still "frontend" but server-side proxy
const NEXT_API_BASE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const NEXT_API_BETOFFERS = `${NEXT_API_BASE}/api/unibet/betoffers`;
const NEXT_API_LIVE_MATCHES = `${NEXT_API_BASE}/api/unibet/live-matches`;
const UNIBET_LIVE_ODDS_API = 'https://oc-offering-api.kambicdn.com/offering/v2018/ubau/event/live/open.json';

// Headers - Only safe headers that browser allows (removed unsafe headers)
// Browser automatically sets: origin, referer, user-agent, accept-encoding, sec-* headers
const UNIBET_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'priority': 'u=1, i'
  // Removed unsafe headers that browser controls:
  // - 'accept-encoding' (browser sets automatically)
  // - 'origin' (browser sets automatically)
  // - 'referer' (browser sets automatically)
  // - 'user-agent' (browser sets automatically)
  // - 'sec-ch-ua' (browser sets automatically)
  // - 'sec-ch-ua-mobile' (browser sets automatically)
  // - 'sec-ch-ua-platform' (browser sets automatically)
  // - 'sec-fetch-dest' (browser sets automatically)
  // - 'sec-fetch-mode' (browser sets automatically)
  // - 'sec-fetch-site' (browser sets automatically)
};

// Create axios instance for direct Unibet API calls (from browser)
const unibetDirectClient = axios.create({
  timeout: 3000, // 3 seconds timeout - balanced for reliability (matches API route timeout)
  headers: UNIBET_HEADERS
});

// ✅ NEW: Separate axios instance for betoffers (needs more time for complex data)
const unibetBetOffersClient = axios.create({
  timeout: 15000, // 15 seconds timeout for betoffers (allows time for proxy rotation and retries)
  headers: UNIBET_HEADERS
});

// Request deduplication - prevent multiple simultaneous requests
let pendingLiveMatchesRequest = null;

class UnibetDirectService {
  /**
   * Get betting offers directly from Unibet API (no backend)
   * @param {string|number} eventId - The event/match ID
   * @returns {Promise} - Betting offers data from Unibet API
   */
  async getBetOffers(eventId) {
    try {
      // ✅ FIX: Validate that eventId is numeric before making API call
      if (!eventId) {
        throw new Error('Event ID is required');
      }
      
      const isNumeric = /^\d+$/.test(String(eventId));
      if (!isNumeric) {
        console.warn(`⚠️ [NEXT PROXY] Invalid eventId format: "${eventId}" (expected numeric ID)`);
        throw new Error(
          `Invalid event ID format. Expected numeric ID, but received: "${eventId}". This appears to be a slug instead of an event ID.`
        );
      }
      
      console.log(`🔍 [NEXT PROXY] Fetching bet offers via Next.js API proxy for event: ${eventId}`);
      
      // Use Next.js API route as proxy (handles CORS)
      const url = `${NEXT_API_BETOFFERS}/${eventId}`;
      // ✅ Use betoffers client with higher timeout (15s) to allow for proxy rotation and retries
      const response = await unibetBetOffersClient.get(url);
      
      console.log(`✅ [NEXT PROXY] Successfully fetched bet offers for event: ${eventId}`);
      
      return {
        success: response.data.success,
        eventId,
        data: response.data.data,
        timestamp: response.data.timestamp || new Date().toISOString(),
        source: response.data.source || 'unibet-proxy-nextjs'
      };
    } catch (error) {
      console.error(`❌ [NEXT PROXY] Error fetching bet offers:`, error);
      
      // Handle 404 (match finished/not found) - Secondary check for finished matches
      // Primary check is event.state === 'FINISHED' from live matches API
      if (error.response?.status === 404 || error.response?.data?.status === 404) {
        return {
          success: false,
          eventId,
          error: 'Match not found',
          message: error.response?.data?.message || 'Match may be finished or no longer available',
          status: 404,
          timestamp: new Date().toISOString()
        };
      }
      
      throw new Error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch bet offers from Unibet'
      );
    }
  }

  /**
   * Get live matches directly from Unibet API (no backend)
   * @returns {Promise} - Live matches data from Unibet API
   */
  async getLiveMatches() {
    // Request deduplication: If a request is already in progress, wait for it
    if (pendingLiveMatchesRequest) {
      console.log(`⏳ [NEXT PROXY] Request already in progress, waiting...`);
      try {
        return await pendingLiveMatchesRequest;
      } catch (error) {
        // If pending request fails, continue with new request
        pendingLiveMatchesRequest = null;
      }
    }
    
    // Create new request promise
    pendingLiveMatchesRequest = (async () => {
      try {
        console.log(`🔍 [NEXT PROXY] Fetching live matches via Next.js API proxy...`);
        
        // Use Next.js API route as proxy (handles CORS)
        const url = `${NEXT_API_LIVE_MATCHES}?force=true`;
        const response = await unibetDirectClient.get(url);
        
        console.log(`✅ [NEXT PROXY] Successfully fetched live matches`);
        
        // Next.js API route returns: { success, matches, allMatches, upcomingMatches, totalMatches, ... }
        // Return the response data directly (not nested in "data" field)
        const result = {
          success: response.data.success,
          matches: response.data.matches || [],
          allMatches: response.data.allMatches || [],
          upcomingMatches: response.data.upcomingMatches || [],
          totalMatches: response.data.totalMatches || 0,
          totalAllMatches: response.data.totalAllMatches || 0,
          lastUpdated: response.data.lastUpdated || response.data.timestamp || new Date().toISOString(),
          source: response.data.source || 'unibet-proxy-nextjs'
        };
        
        // Clear pending request on success
        pendingLiveMatchesRequest = null;
        return result;
      } catch (error) {
        // Clear pending request on error
        pendingLiveMatchesRequest = null;
        
        // Handle timeout errors gracefully - return null for silent updates
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
          console.warn(`⏱️ [NEXT PROXY] Request timeout - will retry on next poll`);
          return null; // Return null so silent updates can handle it gracefully
        }
        
        console.error(`❌ [NEXT PROXY] Error fetching live matches:`, error);
        throw new Error(
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'Failed to fetch live matches from Unibet'
        );
      }
    })();
    
    return pendingLiveMatchesRequest;
  }

  /**
   * Get live odds directly from Unibet API (no backend)
   * @returns {Promise} - Live odds data from Unibet API
   */
  async getLiveOdds() {
    try {
      console.log(`🔍 [DIRECT] Fetching live odds directly from Unibet API...`);
      
      const url = `${UNIBET_LIVE_ODDS_API}?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
      const response = await unibetDirectClient.get(url);
      
      console.log(`✅ [DIRECT] Successfully fetched live odds`);
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
        source: 'unibet-direct'
      };
    } catch (error) {
      console.error(`❌ [DIRECT] Error fetching live odds:`, error);
      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch live odds from Unibet'
      );
    }
  }
}

// Create and export a single instance
const unibetDirectService = new UnibetDirectService();
export default unibetDirectService;


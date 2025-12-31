// League filtering utility for Next.js API routes
// Fetches filtering data from backend API (instead of reading CSV)

// In-memory cache
let leagueMappingCache = null;
let mappingPromise = null;

/**
 * Fetch league mapping from backend API
 * Detects if running server-side (Next.js API route) or client-side
 * @returns {Promise<Object>}
 */
async function fetchLeagueMappingFromBackend() {
  try {
    // Detect if running server-side (Next.js API route) or client-side
    const isServerSide = typeof window === 'undefined';
    
    let url;
    if (isServerSide) {
      // Server-side: Call backend directly (bypass Next.js API route)
      // ✅ FIX: Use NEXT_PUBLIC_BASE_API_URL first (without /api)
      let backendUrl = process.env.NEXT_PUBLIC_BASE_API_URL;
      
      // If NEXT_PUBLIC_BASE_API_URL not set, try NEXT_PUBLIC_API_URL and remove /api suffix
      if (!backendUrl && process.env.NEXT_PUBLIC_API_URL) {
        backendUrl = process.env.NEXT_PUBLIC_API_URL;
        // Remove /api suffix if present
        if (backendUrl.endsWith('/api')) {
          backendUrl = backendUrl.replace(/\/api$/, '');
        }
      }
      
      // Fallback to default
      if (!backendUrl) {
        backendUrl = process.env.API_URL || 'http://localhost:4000';
      }
      
      // Ensure no trailing slash
      backendUrl = backendUrl.replace(/\/$/, '');
      
      url = `${backendUrl}/api/admin/leagues/mapping`;
      
      console.log(`🔍 [leagueFilter] Server-side backend URL: ${url}`);
    } else {
      // Client-side: Use Next.js API route (handles CORS)
      url = '/api/admin/leagues/mapping';
    }
    
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'max-age=3600', // Cache for 1 hour
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      const { allowedLeagueIds, allowedLeagueNames, totalLeagues } = result.data;
      
      console.log(`✅ [NEXT API] Loaded ${totalLeagues} allowed leagues from backend`);
      console.log(`✅ [NEXT API] Allowed league IDs (first 10):`, allowedLeagueIds?.slice(0, 10));
      console.log(`✅ [NEXT API] Allowed league IDs type:`, typeof allowedLeagueIds?.[0]);
      
      // ✅ FIX: Ensure allowedLeagueIds is an array
      const leagueIdsArray = Array.isArray(allowedLeagueIds) ? allowedLeagueIds : [];
      const leagueIdsSet = new Set(leagueIdsArray.map(id => String(id))); // Convert all to strings
      
      console.log(`✅ [NEXT API] Converted to Set: ${leagueIdsSet.size} league IDs`);
      console.log(`✅ [NEXT API] Sample Set values:`, Array.from(leagueIdsSet).slice(0, 10));
      
      return {
        allowedLeagueNames: new Set(allowedLeagueNames || []),
        allowedLeagueIds: leagueIdsSet,
        totalLeagues: totalLeagues || 0
      };
    } else {
      // ✅ FIX: Handle case where API returns success: false or empty data
      console.warn('⚠️ [NEXT API] Invalid API response - success:', result.success, 'data:', !!result.data);
      throw new Error('Invalid API response format or backend unavailable');
    }
  } catch (error) {
    console.error('❌ [NEXT API] Error fetching league mapping from backend:', error.message);
    // ✅ FIX: Return empty sets but don't throw - allows matches to show if mapping fails
    // This prevents blocking the entire page if league mapping API is down
    // Note: This means all matches will pass filtering if mapping fails (fail-open approach)
    console.warn('⚠️ [NEXT API] League mapping failed - allowing all matches through (fail-open)');
    return { 
      allowedLeagueNames: new Set(), 
      allowedLeagueIds: new Set(), 
      totalLeagues: 0 
    };
  }
}

/**
 * Load and parse the league mapping from backend API
 * @returns {Promise<Object>} - Object with allowed league names and IDs
 */
export async function loadLeagueMapping() {
  // Return cached data if available
  if (leagueMappingCache) {
    return leagueMappingCache;
  }
  
  // If already fetching, wait for that promise
  if (mappingPromise) {
    return mappingPromise;
  }
  
  // Start fetching
  mappingPromise = fetchLeagueMappingFromBackend();
  leagueMappingCache = await mappingPromise;
  mappingPromise = null;
  
  return leagueMappingCache;
}

/**
 * Check if a league ID is in the allowed list
 * @param {string|number} leagueId - The Unibet league ID to check
 * @returns {Promise<boolean>} - Whether the league is allowed
 */
export async function isLeagueAllowed(leagueId) {
  if (!leagueId) {
    return false;
  }

  const { allowedLeagueIds } = await loadLeagueMapping();
  
  // Convert to string for comparison
  const leagueIdStr = String(leagueId);
  
  // Check exact match
  return allowedLeagueIds.has(leagueIdStr);
}

/**
 * Filter matches to only include those from allowed leagues
 * @param {Array} matches - Array of match objects
 * @returns {Promise<Array>} - Filtered array of matches
 */
export async function filterMatchesByAllowedLeagues(matches) {
  if (!Array.isArray(matches)) {
    return [];
  }

  const { allowedLeagueIds } = await loadLeagueMapping();
  
  // ✅ DEBUG: Log filtering details
  console.log(`🔍 [NEXT API] Filtering ${matches.length} matches with ${allowedLeagueIds.size} allowed league IDs`);
  console.log(`🔍 [NEXT API] Sample allowed league IDs:`, Array.from(allowedLeagueIds).slice(0, 10));
  
  // Get sample match groupIds for debugging
  const sampleGroupIds = matches.slice(0, 5).map(m => m.groupId).filter(Boolean);
  console.log(`🔍 [NEXT API] Sample match groupIds:`, sampleGroupIds);
  
  const filteredMatches = matches.filter(match => {
    // ONLY use groupId field (Unibet league ID) - STRICT METHOD (same as backend)
    const hasGroupId = !!match.groupId;
    if (!hasGroupId) {
      return false;
    }
    
    const groupIdStr = String(match.groupId);
    const isAllowed = allowedLeagueIds.has(groupIdStr);
    
    // ✅ DEBUG: Log first few matches for debugging
    if (matches.indexOf(match) < 3) {
      console.log(`🔍 [NEXT API] Match ${match.id} (groupId: ${groupIdStr}): ${isAllowed ? '✅ ALLOWED' : '❌ FILTERED OUT'}`);
    }
    
    return isAllowed;
  });

  console.log(`🔍 [NEXT API] League filtering: ${matches.length} total matches → ${filteredMatches.length} allowed matches`);
  
  // ✅ DEBUG: If no matches passed, log why
  if (filteredMatches.length === 0 && matches.length > 0) {
    const uniqueGroupIds = [...new Set(matches.map(m => m.groupId).filter(Boolean))];
    console.warn(`⚠️ [NEXT API] No matches passed filtering!`);
    console.warn(`⚠️ [NEXT API] Unique groupIds in matches:`, uniqueGroupIds.slice(0, 10));
    console.warn(`⚠️ [NEXT API] Allowed league IDs:`, Array.from(allowedLeagueIds).slice(0, 10));
    console.warn(`⚠️ [NEXT API] Checking if any match groupId exists in allowed list...`);
    const foundMatches = matches.filter(m => allowedLeagueIds.has(String(m.groupId)));
    console.warn(`⚠️ [NEXT API] Matches with matching groupIds: ${foundMatches.length}`);
  }
  
  return filteredMatches;
}

/**
 * Get statistics about league filtering
 * @returns {Promise<Object>} - Statistics about the league mapping
 */
export async function getLeagueFilterStats() {
  const mapping = await loadLeagueMapping();
  return {
    totalAllowedLeagues: mapping.totalLeagues || 0,
    allowedLeagueNames: Array.from(mapping.allowedLeagueNames || []),
    allowedLeagueIds: Array.from(mapping.allowedLeagueIds || [])
  };
}


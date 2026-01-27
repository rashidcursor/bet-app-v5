// Next.js API Route - Proxy for Unibet Bet Offers API (handles CORS)
// Node.js runtime required for proxy support
import { NextResponse } from 'next/server';
import axios from 'axios';
import proxyRotator from '@/lib/utils/proxyRotator.js';

const UNIBET_BETOFFERS_API = 'https://oc-offering-api.kambicdn.com/offering/v2018/ubau/betoffer/event';

// ✅ Track previous stats and suspension timers per match
const matchStatsHistory = new Map(); // { matchId: { corners, goals, cards, suspendedUntil } }

// ✅ Kambi Live API Configuration (for fetching live stats)
const KAMBI_LIVE_API_URL = 'https://oc-offering-api.kambicdn.com/offering/v2018/ubau/event/live/open.json';
const KAMBI_LIVE_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'origin': 'https://www.unibet.com.au',
  'pragma': 'no-cache',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
};

const UNIBET_BETOFFERS_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'origin': 'https://www.unibet.com.au',
  'pragma': 'no-cache',
  'priority': 'u=1, i',
  'referer': 'https://www.unibet.com.au/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
};

// ✅ Helper function to extract stats from live data
function extractStatsFromBetoffers(liveData) {
  const stats = liveData?.statistics?.football || {};
  const score = liveData?.score || {};
  
  return {
    homeCorners: stats.home?.corners || 0,
    awayCorners: stats.away?.corners || 0,
    homeGoals: score.home || 0,
    awayGoals: score.away || 0,
    homeYellowCards: stats.home?.yellowCards || 0,
    awayYellowCards: stats.away?.yellowCards || 0,
    homeRedCards: stats.home?.redCards || 0,
    awayRedCards: stats.away?.redCards || 0
  };
}

// ✅ Helper function to check if stats changed
function hasStatsChangedBetoffers(matchId, newStats) {
  const previous = matchStatsHistory.get(matchId);
  
  if (!previous) {
    // First time seeing this match, store stats
    const stats = extractStatsFromBetoffers(newStats);
    matchStatsHistory.set(matchId, {
      ...stats,
      suspendedUntil: null
    });
    return false; // No change on first detection
  }
  
  const newStatsData = extractStatsFromBetoffers(newStats);
  
  // Check if corners, goals, or cards changed
  const cornersChanged = 
    previous.homeCorners !== newStatsData.homeCorners ||
    previous.awayCorners !== newStatsData.awayCorners;
    
  const goalsChanged = 
    previous.homeGoals !== newStatsData.homeGoals ||
    previous.awayGoals !== newStatsData.awayGoals;
    
  const cardsChanged = 
    previous.homeYellowCards !== newStatsData.homeYellowCards ||
    previous.awayYellowCards !== newStatsData.awayYellowCards ||
    previous.homeRedCards !== newStatsData.homeRedCards ||
    previous.awayRedCards !== newStatsData.awayRedCards;
  
  if (cornersChanged || goalsChanged || cardsChanged) {
    // Stats changed, suspend for 15 seconds
    const suspendedUntil = Date.now() + 15000; // 15 seconds from now
    matchStatsHistory.set(matchId, {
      ...newStatsData,
      suspendedUntil
    });
    
    // Detailed logging of what changed
    const changes = [];
    if (cornersChanged) {
      changes.push(`Corners: ${previous.homeCorners}-${previous.awayCorners} → ${newStatsData.homeCorners}-${newStatsData.awayCorners}`);
    }
    if (goalsChanged) {
      changes.push(`Goals: ${previous.homeGoals}-${previous.awayGoals} → ${newStatsData.homeGoals}-${newStatsData.awayGoals}`);
    }
    if (cardsChanged) {
      const prevCards = `${previous.homeYellowCards + previous.homeRedCards}-${previous.awayYellowCards + previous.awayRedCards}`;
      const newCards = `${newStatsData.homeYellowCards + newStatsData.homeRedCards}-${newStatsData.awayYellowCards + newStatsData.awayRedCards}`;
      changes.push(`Cards: ${prevCards} → ${newCards}`);
    }
    
    console.log(`⏸️ [NEXT BETOFFERS] Match ${matchId}: Stats changed - Suspending markets for 15s`);
    console.log(`   📊 Changes: ${changes.join(', ')}`);
    console.log(`   📋 Previous: Goals ${previous.homeGoals}-${previous.awayGoals}, Corners ${previous.homeCorners}-${previous.awayCorners}, Cards ${previous.homeYellowCards + previous.homeRedCards}-${previous.awayYellowCards + previous.awayRedCards}`);
    console.log(`   📋 New: Goals ${newStatsData.homeGoals}-${newStatsData.awayGoals}, Corners ${newStatsData.homeCorners}-${newStatsData.awayCorners}, Cards ${newStatsData.homeYellowCards + newStatsData.homeRedCards}-${newStatsData.awayYellowCards + newStatsData.awayRedCards}`);
    
    return true;
  }
  
  // Update stats but keep suspension state if still suspended
  const currentTime = Date.now();
  const isStillSuspended = previous.suspendedUntil && currentTime < previous.suspendedUntil;
  
  matchStatsHistory.set(matchId, {
    ...newStatsData,
    suspendedUntil: isStillSuspended ? previous.suspendedUntil : null
  });
  
  return false;
}

// ✅ Helper function to check if match markets should be suspended
function isMatchSuspendedBetoffers(matchId) {
  const history = matchStatsHistory.get(matchId);
  if (!history || !history.suspendedUntil) {
    return false;
  }
  
  const currentTime = Date.now();
  if (currentTime >= history.suspendedUntil) {
    // Suspension expired, clear it
    if (history.suspendedUntil) {
      console.log(`✅ [NEXT BETOFFERS] Match ${matchId}: Suspension expired, markets active again`);
    }
    matchStatsHistory.set(matchId, {
      ...history,
      suspendedUntil: null
    });
    return false;
  }
  
  return true;
}

// ✅ Helper function to fetch live data for a specific match from Kambi API
async function fetchLiveDataForMatch(matchId) {
  try {
    const url = `${KAMBI_LIVE_API_URL}?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
    
    const response = await fetch(url, {
      headers: KAMBI_LIVE_HEADERS,
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.liveEvents) {
      const liveEvent = data.liveEvents.find(
        event => event.event && event.event.id.toString() === matchId.toString()
      );
      
      if (liveEvent && liveEvent.liveData) {
        return {
          eventId: liveEvent.liveData.eventId,
          matchClock: liveEvent.liveData.matchClock,
          score: liveEvent.liveData.score,
          statistics: liveEvent.liveData.statistics
        };
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ [NEXT BETOFFERS] Failed to fetch live data for match ${matchId}:`, error.message);
    return null;
  }
}

// ✅ Helper function to apply suspension to betoffers data
function applySuspensionToBetoffers(betoffersData, shouldSuspend) {
  if (!betoffersData) {
    return betoffersData;
  }
  
  // Unibet API structure: { betOffers: [...] }
  // Each betOffer has outcomes array with status field
  if (betoffersData.betOffers && Array.isArray(betoffersData.betOffers)) {
    const suspendedData = {
      ...betoffersData,
      betOffers: betoffersData.betOffers.map(betOffer => {
        // ✅ FIX 1: Preserve Unibet's original suspended flag
        const isUnibetSuspended = betOffer.suspended === true;
        // ✅ FIX 2: Combine stats suspension + Unibet suspension
        const isSuspended = shouldSuspend || isUnibetSuspended;
        
        return {
          ...betOffer,
          // ✅ FIX 1: Set suspended flag on betOffer level
          suspended: isSuspended,
          outcomes: betOffer.outcomes?.map(outcome => ({
            ...outcome,
            // ✅ FIX 2: Check both stats suspension AND Unibet suspension
            status: isSuspended ? 'SUSPENDED' : (outcome.status || 'OPEN'),
            suspendedByStats: shouldSuspend, // Flag to indicate suspension due to stats
            suspendedByUnibet: isUnibetSuspended // Flag to indicate Unibet suspension
          })) || []
        };
      })
    };
    
    return suspendedData;
  }
  
  // Fallback: if structure is different, return as-is
  return betoffersData;
}

// Function to fetch bet offers through proxy with automatic rotation
async function fetchBetOffersViaProxy(eventId) {
  const startTime = Date.now();
  const url = `${UNIBET_BETOFFERS_API}/${eventId}.json?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
  
  console.log(`🔄 [PROXY] [${eventId}] Starting proxy fetch with rotation...`);

  try {
    return await proxyRotator.executeWithRotation(
      async (httpsAgent, proxy) => {
        console.log(`🔄 [PROXY] [${eventId}] Attempting via ${proxy.host}:${proxy.port}...`);
        
        const response = await axios.get(url, {
          headers: UNIBET_BETOFFERS_HEADERS,
          httpsAgent: httpsAgent,
          httpAgent: httpsAgent,
          timeout: 5000, // 5 seconds for proxy
          validateStatus: () => true // Don't throw on non-200
        });
        
        const duration = Date.now() - startTime;
        
        if (response.status === 200 && response.data) {
          const dataSize = JSON.stringify(response.data).length;
          console.log(`✅ [PROXY] [${eventId}] SUCCESS via ${proxy.host}:${proxy.port} - Status: 200, Data size: ${dataSize} bytes, Duration: ${duration}ms`);
          return response.data;
        }
        
        throw new Error(`Proxy request returned ${response.status}`);
      },
      {
        maxRetries: 10, // Try up to 10 different proxies (we have 147 total)
        retryDelay: 500, // 500ms between retries (faster rotation)
        onRetry: (attempt, maxRetries, proxy, error) => {
          console.warn(`⚠️ [PROXY] [${eventId}] Proxy ${proxy.host}:${proxy.port} failed (${attempt}/${maxRetries}): ${error.message}, rotating...`);
        }
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [PROXY] [${eventId}] All proxy attempts failed after ${duration}ms:`, {
      message: error.message,
      code: error.code,
      name: error.name,
    });
    return null;
  }
}

export async function GET(request, { params }) {
  try {
    // ✅ FIX: Await params in Next.js 15+ (params is now a Promise)
    const { eventId } = await params;
    
    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'Event ID is required' },
        { status: 400 }
      );
    }
    
    // ✅ FIX: Validate that eventId is numeric (Unibet API requires numeric IDs)
    const isNumeric = /^\d+$/.test(eventId);
    if (!isNumeric) {
      console.warn(`⚠️ [NEXT API] Invalid eventId format: "${eventId}" (expected numeric ID)`);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid event ID format',
          message: `Event ID must be numeric. Received: "${eventId}". This appears to be a slug instead of an event ID.`,
          eventId,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }
    
    const url = `${UNIBET_BETOFFERS_API}/${eventId}.json?lang=en_AU&market=AU`;
    
    console.log(`🔍 [DIRECT] [${eventId}] Starting direct fetch request...`);
    
    // Retry logic for network errors (ENOTFOUND, etc.)
    let response;
    let lastError;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    const directFetchStartTime = Date.now();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔍 [DIRECT] [${eventId}] Attempt ${attempt}/${maxRetries} - Fetching...`);
        const attemptStartTime = Date.now();
        
        response = await fetch(url, {
          headers: UNIBET_BETOFFERS_HEADERS,
          signal: AbortSignal.timeout(2500) // 2.5 seconds timeout - balanced for real-time updates
        });
        
        const attemptDuration = Date.now() - attemptStartTime;
        console.log(`✅ [DIRECT] [${eventId}] Attempt ${attempt} SUCCESS - Status: ${response.status}, Duration: ${attemptDuration}ms`);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && (error.code === 'ENOTFOUND' || error.message?.includes('fetch failed'))) {
          console.warn(`⚠️ [DIRECT] [${eventId}] Attempt ${attempt}/${maxRetries} FAILED - Network error, retrying in ${retryDelay * attempt}ms...`, {
            error: error.message,
            code: error.code
          });
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Exponential backoff
        } else {
          console.error(`❌ [DIRECT] [${eventId}] Attempt ${attempt} FAILED - Non-retryable error:`, error.message);
          throw error; // Re-throw if not retryable or max retries reached
        }
      }
    }
    
    const directFetchDuration = Date.now() - directFetchStartTime;
    
    if (!response) {
      console.error(`❌ [DIRECT] [${eventId}] All attempts failed after ${directFetchDuration}ms`);
      throw lastError || new Error('Failed to fetch after retries');
    }
    
    console.log(`📊 [DIRECT] [${eventId}] Final response:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      totalDuration: `${directFetchDuration}ms`
    });
    
    // Handle 404 (match finished/not found) - Secondary check for finished matches
    // Primary check is event.state === 'FINISHED' from live matches API
    if (response.status === 404) {
      console.log(`📋 [RESULT] [${eventId}] Match not found (404) - Match likely finished`);
      return NextResponse.json({
        success: false,
        eventId,
        error: 'Match not found',
        message: 'Match may be finished or no longer available',
        status: 404,
        isFinished: true, // Flag to indicate match is finished (404 = finished, secondary check)
        timestamp: new Date().toISOString()
      });
    }
    
    // ✅ Special handling for 410 (Gone) - try proxy as fallback
    if (response.status === 410) {
      console.warn(`⚠️ [410 HANDLER] [${eventId}] Direct fetch returned 410 - Starting proxy fallback...`);
      
      // Try proxy fallback
      const proxyData = await fetchBetOffersViaProxy(eventId);
      
      console.log(`🔍 [410 HANDLER] [${eventId}] Proxy result check:`, {
        hasData: !!proxyData,
        isNull: proxyData === null,
        isUndefined: proxyData === undefined,
        type: typeof proxyData
      });
      
      if (proxyData) {
        // ✅ Check if match should be suspended even with proxy data
        let betoffersData = proxyData;
        let shouldSuspend = false;
        
        try {
          const liveData = await fetchLiveDataForMatch(eventId);
          if (liveData) {
            // ✅ FIX: Check if stats changed (this updates suspendedUntil)
            hasStatsChangedBetoffers(eventId, liveData);
            // ✅ FIX: ALWAYS check if still suspended (even if stats didn't change this call)
            shouldSuspend = isMatchSuspendedBetoffers(eventId);
            
            if (shouldSuspend) {
              console.log(`⏸️ [NEXT BETOFFERS] Match ${eventId}: Suspending proxy markets due to stats change`);
              betoffersData = applySuspensionToBetoffers(betoffersData, true);
            } else {
              // ✅ FIX: Even if stats didn't change, preserve Unibet suspensions
              betoffersData = applySuspensionToBetoffers(betoffersData, false);
            }
          } else {
            // ✅ FIX: Even without live data, preserve Unibet suspensions
            betoffersData = applySuspensionToBetoffers(betoffersData, false);
          }
        } catch (suspensionError) {
          console.warn(`⚠️ [NEXT BETOFFERS] Error checking suspension for proxy match ${eventId}:`, suspensionError.message);
          // ✅ FIX: Even on error, preserve Unibet suspensions
          betoffersData = applySuspensionToBetoffers(betoffersData, false);
        }
        
        console.log(`✅ [410 HANDLER] [${eventId}] PROXY FALLBACK SUCCESS - Returning data from proxy (suspended: ${shouldSuspend})`);
        return NextResponse.json({
          success: true,
          eventId,
          data: betoffersData,
          timestamp: new Date().toISOString(),
          source: 'unibet-proxy-nodejs-fallback',
          marketsSuspended: shouldSuspend
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
      
      // If proxy also failed, return error
      console.error(`❌ [410 HANDLER] [${eventId}] PROXY FALLBACK FAILED - Both direct and proxy failed, returning 410 error`);
      return NextResponse.json({
        success: false,
        eventId,
        error: 'API unavailable',
        message: 'Kambi API returned 410 and proxy fallback also failed',
        status: 410,
        timestamp: new Date().toISOString()
      }, { status: 410 });
    }
    
    if (!response.ok) {
      console.error(`❌ [RESULT] [${eventId}] Response not OK - Status: ${response.status}, Throwing error`);
      throw new Error(`Unibet API returned ${response.status}`);
    }
    
    console.log(`📥 [RESULT] [${eventId}] Direct fetch SUCCESS (Status: ${response.status}) - Parsing JSON...`);
    const data = await response.json();
    
    // ✅ Check if match should be suspended due to stats change
    let betoffersData = data;
    let shouldSuspend = false;
    
    try {
      // Fetch live data for this match to check stats
      const liveData = await fetchLiveDataForMatch(eventId);
      
      if (liveData) {
        // ✅ FIX: Check if stats changed (this updates suspendedUntil)
        hasStatsChangedBetoffers(eventId, liveData);
        // ✅ FIX: ALWAYS check if still suspended (even if stats didn't change this call)
        shouldSuspend = isMatchSuspendedBetoffers(eventId);
        
        if (shouldSuspend) {
          console.log(`⏸️ [NEXT BETOFFERS] Match ${eventId}: Suspending all markets due to stats change`);
          // Apply suspension to all outcomes
          const beforeCount = betoffersData?.betOffers?.reduce((sum, bo) => sum + (bo.outcomes?.length || 0), 0) || 0;
          betoffersData = applySuspensionToBetoffers(betoffersData, true);
          const afterCount = betoffersData?.betOffers?.reduce((sum, bo) => sum + (bo.outcomes?.filter(o => o.status === 'SUSPENDED').length || 0), 0) || 0;
          console.log(`   ✅ Suspended ${afterCount} outcomes out of ${beforeCount} total outcomes`);
        } else {
          // ✅ FIX: Even if stats didn't change, check if Unibet suspended any markets
          // This ensures Unibet suspensions are preserved
          betoffersData = applySuspensionToBetoffers(betoffersData, false);
        }
      } else {
        // ✅ FIX: Even without live data, preserve Unibet suspensions
        betoffersData = applySuspensionToBetoffers(betoffersData, false);
      }
    } catch (suspensionError) {
      // Don't fail the request if suspension check fails
      console.warn(`⚠️ [NEXT BETOFFERS] Error checking suspension for match ${eventId}:`, suspensionError.message);
      // ✅ FIX: Even on error, preserve Unibet suspensions
      betoffersData = applySuspensionToBetoffers(betoffersData, false);
    }
    
    console.log(`✅ [RESULT] [${eventId}] DIRECT FETCH SUCCESS - Returning data (source: direct, suspended: ${shouldSuspend})`);
    
    // Return with streaming-friendly response
    return NextResponse.json({
      success: true,
      eventId,
      data: betoffersData,
      timestamp: new Date().toISOString(),
      source: 'unibet-proxy-nodejs',
      marketsSuspended: shouldSuspend
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error) {
    const { eventId } = await params;
    console.error(`❌ [ERROR HANDLER] [${eventId}] Exception caught:`, {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack?.split('\n')[0] // First line of stack only
    });
    
    // ✅ ALWAYS try proxy on ANY error (not just specific errors)
    console.warn(`⚠️ [ERROR HANDLER] [${eventId}] Direct fetch failed (${error.message}), trying PROXY fallback with rotation...`);
    
    try {
      const proxyData = await fetchBetOffersViaProxy(eventId);
      
      if (proxyData) {
        // ✅ Check if match should be suspended even with proxy data
        let betoffersData = proxyData;
        let shouldSuspend = false;
        
        try {
          const liveData = await fetchLiveDataForMatch(eventId);
          if (liveData) {
            // ✅ FIX: Check if stats changed (this updates suspendedUntil)
            hasStatsChangedBetoffers(eventId, liveData);
            // ✅ FIX: ALWAYS check if still suspended (even if stats didn't change this call)
            shouldSuspend = isMatchSuspendedBetoffers(eventId);
            
            if (shouldSuspend) {
              console.log(`⏸️ [NEXT BETOFFERS] Match ${eventId}: Suspending error-handler proxy markets due to stats change`);
              betoffersData = applySuspensionToBetoffers(betoffersData, true);
            } else {
              // ✅ FIX: Even if stats didn't change, preserve Unibet suspensions
              betoffersData = applySuspensionToBetoffers(betoffersData, false);
            }
          } else {
            // ✅ FIX: Even without live data, preserve Unibet suspensions
            betoffersData = applySuspensionToBetoffers(betoffersData, false);
          }
        } catch (suspensionError) {
          console.warn(`⚠️ [NEXT BETOFFERS] Error checking suspension for error-handler proxy match ${eventId}:`, suspensionError.message);
          // ✅ FIX: Even on error, preserve Unibet suspensions
          betoffersData = applySuspensionToBetoffers(betoffersData, false);
        }
        
        console.log(`✅ [ERROR HANDLER] [${eventId}] PROXY FALLBACK SUCCESS after error - Returning data from proxy (suspended: ${shouldSuspend})`);
        return NextResponse.json({
          success: true,
          eventId,
          data: betoffersData,
          timestamp: new Date().toISOString(),
          source: 'unibet-proxy-nodejs-fallback',
          marketsSuspended: shouldSuspend
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      } else {
        console.error(`❌ [ERROR HANDLER] [${eventId}] PROXY FALLBACK FAILED - All proxy attempts failed`);
      }
    } catch (proxyError) {
      console.error(`❌ [ERROR HANDLER] [${eventId}] Proxy fallback error: ${proxyError.message}`);
    }
    
    console.error(`❌ [ERROR HANDLER] [${eventId}] Returning 500 error to client`);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch bet offers',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Ensure Node.js runtime (required for proxy agent)
export const runtime = 'nodejs';


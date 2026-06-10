// Next.js API Route - Proxy for Unibet Bet Offers API (handles CORS)
// Node.js runtime required for proxy support
import { NextResponse } from 'next/server';
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

// ✅ Helper function to fetch live data for a specific match from Kambi API (via proxy)
async function fetchLiveDataForMatch(matchId) {
  try {
    const url = `${KAMBI_LIVE_API_URL}?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
    const result = await proxyRotator.fetchUrl(url, {
      headers: KAMBI_LIVE_HEADERS,
      timeout: 5000,
      label: `kambi-live-${matchId}`,
    });

    if (result.status !== 200 || !result.data?.liveEvents) {
      return null;
    }

    const liveEvent = result.data.liveEvents.find(
      event => event.event && event.event.id.toString() === matchId.toString()
    );

    if (liveEvent?.liveData) {
      return {
        eventId: liveEvent.liveData.eventId,
        matchClock: liveEvent.liveData.matchClock,
        score: liveEvent.liveData.score,
        statistics: liveEvent.liveData.statistics,
      };
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

// Fetch bet offers via proxy (always — no direct connection)
async function fetchBetOffersViaProxy(eventId) {
  const url = `${UNIBET_BETOFFERS_API}/${eventId}.json?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
  console.log(`🔄 [PROXY] [${eventId}] Fetching bet offers via proxy rotation...`);

  return proxyRotator.fetchUrl(url, {
    headers: UNIBET_BETOFFERS_HEADERS,
    timeout: 5000,
    label: eventId,
  });
}

async function buildBetoffersResponse(eventId, data) {
  let betoffersData = data;
  let shouldSuspend = false;

  try {
    const liveData = await fetchLiveDataForMatch(eventId);
    if (liveData) {
      hasStatsChangedBetoffers(eventId, liveData);
      shouldSuspend = isMatchSuspendedBetoffers(eventId);
      betoffersData = applySuspensionToBetoffers(betoffersData, shouldSuspend);
    } else {
      betoffersData = applySuspensionToBetoffers(betoffersData, false);
    }
  } catch (suspensionError) {
    console.warn(`⚠️ [NEXT BETOFFERS] Error checking suspension for match ${eventId}:`, suspensionError.message);
    betoffersData = applySuspensionToBetoffers(betoffersData, false);
  }

  return { betoffersData, shouldSuspend };
}

export async function GET(request, { params }) {
  try {
    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'Event ID is required' },
        { status: 400 }
      );
    }

    const isNumeric = /^\d+$/.test(eventId);
    if (!isNumeric) {
      console.warn(`⚠️ [NEXT API] Invalid eventId format: "${eventId}" (expected numeric ID)`);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid event ID format',
          message: `Event ID must be numeric. Received: "${eventId}". This appears to be a slug instead of an event ID.`,
          eventId,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await fetchBetOffersViaProxy(eventId);

    if (result.status === 404) {
      console.log(`📋 [PROXY] [${eventId}] Match not found (404) via ${result.proxy}`);
      return NextResponse.json(
        {
          success: false,
          eventId,
          error: 'Match not found',
          message: 'Match may be finished or no longer available',
          status: 404,
          isFinished: true,
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    if (result.status === 410) {
      console.warn(`⚠️ [PROXY] [${eventId}] API returned 410 via ${result.proxy}`);
      return NextResponse.json(
        {
          success: false,
          eventId,
          error: 'API unavailable',
          message: 'Kambi API returned 410',
          status: 410,
          timestamp: new Date().toISOString(),
        },
        { status: 410 }
      );
    }

    if (result.status !== 200 || !result.data) {
      console.error(`❌ [PROXY] [${eventId}] Failed via proxy: status=${result.status}, error=${result.error}`);
      return NextResponse.json(
        {
          success: false,
          eventId,
          error: result.error || 'Failed to fetch bet offers via proxy',
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      );
    }

    console.log(`✅ [PROXY] [${eventId}] SUCCESS via ${result.proxy}`);

    const { betoffersData, shouldSuspend } = await buildBetoffersResponse(eventId, result.data);

    return NextResponse.json(
      {
        success: true,
        eventId,
        data: betoffersData,
        timestamp: new Date().toISOString(),
        source: 'unibet-proxy-nodejs',
        proxyUsed: result.proxy,
        marketsSuspended: shouldSuspend,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    const { eventId } = await params;
    console.error(`❌ [PROXY] [${eventId}] Exception:`, error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch bet offers',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Ensure Node.js runtime (required for proxy agent)
export const runtime = 'nodejs';


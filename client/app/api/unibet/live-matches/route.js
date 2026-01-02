// Next.js API Route - Proxy for Unibet Live Matches API (handles CORS)
// Note: Cannot use Edge runtime due to fs dependency in leagueFilter.js
// Optimized for speed with parallel processing and minimal buffering
// Same extraction and filtering logic as backend server/src/routes/unibet-api/live-matches.js
import { NextResponse } from 'next/server';
import { filterMatchesByAllowedLeagues, getLeagueFilterStats } from '@/lib/utils/leagueFilter.js';

const UNIBET_LIVE_MATCHES_API = 'https://www.unibet.com.au/sportsbook-feeds/views/filter/football/all/matches';

// Kambi API Configuration (for live data: score, matchClock, statistics)
const KAMBI_LIVE_API_URL = 'https://oc-offering-api.kambicdn.com/offering/v2018/ubau/event/live/open.json';
const KAMBI_LIVE_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'origin': 'https://www.unibet.com.au',
  'pragma': 'no-cache',
  'priority': 'u=1, i',
  'referer': 'https://www.unibet.com.au/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
};

// In-memory cache to prevent multiple simultaneous requests
let cache = {
  data: null,
  lastUpdated: null,
  isRefreshing: false
};

const CACHE_DURATION = 0; // No cache - always fetch fresh data for real-time updates

// Kambi API cache to avoid rate limits and provide fallback
let kambiCache = {
  data: null,
  lastUpdated: null,
  isFetching: false
};

const KAMBI_CACHE_DURATION = 5000; // Use cached data for 5 seconds to avoid rate limits
const KAMBI_RETRY_DELAY = 2000; // Wait 2 seconds before retry on 410

// Helper function to extract football matches (SAME AS BACKEND - exact copy)
function extractFootballMatches(data) {
  const allMatches = [];
  const liveMatches = [];
  const upcomingMatches = [];
  
  if (data && data.layout && data.layout.sections) {
    const mainSection = data.layout.sections.find(s => s.position === 'MAIN');
    
    if (mainSection && mainSection.widgets) {
      const tournamentWidget = mainSection.widgets.find(w => w.widgetType === 'TOURNAMENT');
      
      if (tournamentWidget && tournamentWidget.matches && tournamentWidget.matches.groups) {
        // Process each group (which represents a league/competition)
        tournamentWidget.matches.groups.forEach((group, groupIndex) => {
          if (group.subGroups) {
            group.subGroups.forEach(subGroup => {
              // Check if this subGroup has events directly
              if (subGroup.events) {
                const parentName = subGroup.parentName || 'Football';
                
                // Process events in this league
                subGroup.events.forEach(eventData => {
                  const event = eventData.event;
                  
                  // Only process football matches
                  if (event.sport !== 'FOOTBALL') {
                    return; // Skip non-football events
                  }
                  
                  const processedEvent = {
                    id: event.id,
                    name: event.name,
                    englishName: event.englishName,
                    homeName: event.homeName,
                    awayName: event.awayName,
                    start: event.start,
                    state: event.state,
                    sport: event.sport,
                    groupId: event.groupId, // This is the Unibet league ID used for filtering
                    group: event.group,
                    participants: event.participants,
                    nonLiveBoCount: event.nonLiveBoCount,
                    liveBoCount: event.liveBoCount,
                    tags: event.tags,
                    path: event.path,
                    parentName: parentName,
                    leagueName: subGroup.name,
                    mainBetOffer: eventData.mainBetOffer,
                    betOffers: eventData.betOffers,
                    liveData: event.liveData ? {
                      score: event.liveData.score || '0-0',
                      period: event.liveData.period || '1st Half',
                      minute: event.liveData.minute || '0'
                    } : null
                  };

                  allMatches.push(processedEvent);

                  // Categorize by state - include all STARTED matches regardless of odds availability
                  const hasBettingOdds = (eventData.mainBetOffer && eventData.mainBetOffer.outcomes && eventData.mainBetOffer.outcomes.length > 0) ||
                                        (eventData.betOffers && eventData.betOffers.length > 0);
                  
                  if (event.state === 'STARTED') {
                    // Include all live matches, even if odds are suspended (e.g., after 90 minutes)
                    liveMatches.push(processedEvent);
                  } else if (event.state === 'NOT_STARTED' && hasBettingOdds) {
                    // Only include upcoming matches that have betting odds
                    upcomingMatches.push(processedEvent);
                  }
                });
              }
              
              // Check if this subGroup has nested subGroups with events
              if (subGroup.subGroups) {
                subGroup.subGroups.forEach(nestedSubGroup => {
                  if (nestedSubGroup.events) {
                    const parentName = nestedSubGroup.parentName || subGroup.parentName || 'Football';
                    
                    // Process events in this nested league
                    nestedSubGroup.events.forEach(eventData => {
                      const event = eventData.event;
                      
                      // Only process football matches
                      if (event.sport !== 'FOOTBALL') {
                        return; // Skip non-football events
                      }
                      
                      const processedEvent = {
                        id: event.id,
                        name: event.name,
                        englishName: event.englishName,
                        homeName: event.homeName,
                        awayName: event.awayName,
                        start: event.start,
                        state: event.state,
                        sport: event.sport,
                        groupId: event.groupId, // This is the Unibet league ID used for filtering
                        group: event.group,
                        participants: event.participants,
                        nonLiveBoCount: event.nonLiveBoCount,
                        liveBoCount: event.liveBoCount,
                        tags: event.tags,
                        path: event.path,
                        parentName: parentName,
                        leagueName: nestedSubGroup.name,
                        mainBetOffer: eventData.mainBetOffer,
                        betOffers: eventData.betOffers,
                        liveData: event.liveData ? {
                          score: event.liveData.score || '0-0',
                          period: event.liveData.period || '1st Half',
                          minute: event.liveData.minute || '0'
                        } : null
                      };

                      allMatches.push(processedEvent);

                      // Categorize by state - include all STARTED matches regardless of odds availability
                      const hasBettingOdds = (eventData.mainBetOffer && eventData.mainBetOffer.outcomes && eventData.mainBetOffer.outcomes.length > 0) ||
                                            (eventData.betOffers && eventData.betOffers.length > 0);
                      
                      if (event.state === 'STARTED') {
                        // Include all live matches, even if odds are suspended (e.g., after 90 minutes)
                        liveMatches.push(processedEvent);
                      } else if (event.state === 'NOT_STARTED' && hasBettingOdds) {
                        // Only include upcoming matches that have betting odds
                        upcomingMatches.push(processedEvent);
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    }
  }
  
  // Return raw matches without filtering (filtering moved to async GET function)
  return { 
    allMatches, 
    liveMatches, 
    upcomingMatches 
  };
}

// Function to fetch live data from Kambi API (score, matchClock, statistics)
async function fetchKambiLiveData(retryCount = 0) {
  try {
    // ✅ Check cache first (avoid hitting rate limits)
    const now = Date.now();
    if (kambiCache.data && kambiCache.lastUpdated && 
        (now - kambiCache.lastUpdated) < KAMBI_CACHE_DURATION) {
      console.log('📦 [NEXT API] Using cached Kambi data (to avoid rate limits)');
      return kambiCache.data;
    }

    // ✅ Prevent multiple simultaneous requests
    if (kambiCache.isFetching) {
      console.log('⏳ [NEXT API] Kambi fetch already in progress, waiting...');
      // Wait for current fetch to complete (max 3 seconds)
      const maxWait = 3000;
      const startWait = Date.now();
      while (kambiCache.isFetching && (Date.now() - startWait) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // If cache was updated, return it
      if (kambiCache.data && kambiCache.lastUpdated) {
        return kambiCache.data;
      }
    }

    kambiCache.isFetching = true;

    const url = `${KAMBI_LIVE_API_URL}?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
    console.log(`🎲 [NEXT API] Fetching live data from Kambi API... (attempt ${retryCount + 1})`);
    
    // ✅ INCREASE TIMEOUT for deployment (3 seconds instead of 1) - better compatibility
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds for deployment latency
    
    const response = await fetch(url, {
      headers: KAMBI_LIVE_HEADERS,
      signal: controller.signal // Use AbortController instead of AbortSignal.timeout
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // ✅ Special handling for 410 (Gone) - retry once after delay
      if (response.status === 410 && retryCount === 0) {
        console.warn(`⚠️ [NEXT API] Kambi API returned 410, retrying after ${KAMBI_RETRY_DELAY}ms...`);
        kambiCache.isFetching = false;
        await new Promise(resolve => setTimeout(resolve, KAMBI_RETRY_DELAY));
        return fetchKambiLiveData(1); // Retry once
      }
      
      // ✅ For 410 on retry, or other errors, use cached data if available
      if (kambiCache.data && kambiCache.lastUpdated) {
        console.warn(`⚠️ [NEXT API] Kambi API returned ${response.status}, using cached data`);
        kambiCache.isFetching = false;
        return kambiCache.data;
      }
      
      throw new Error(`Kambi API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.liveEvents) {
      // ✅ Update cache on success
      kambiCache.data = data;
      kambiCache.lastUpdated = Date.now();
      kambiCache.isFetching = false;
      
      console.log(`✅ [NEXT API] Successfully fetched Kambi live data:`, {
        hasLiveEvents: !!data.liveEvents,
        totalEvents: data.liveEvents?.length || 0,
        footballEvents: data.liveEvents?.filter(e => e.event?.sport === 'FOOTBALL').length || 0
      });
      return data;
    }
    
    kambiCache.isFetching = false;
    return null;
  } catch (error) {
    kambiCache.isFetching = false;
    
    // ✅ If fetch failed but we have cached data, use it
    if (kambiCache.data && kambiCache.lastUpdated) {
      console.warn(`⚠️ [NEXT API] Kambi fetch failed (${error.message}), using cached data`);
      return kambiCache.data;
    }
    
    // ✅ BETTER ERROR LOGGING for deployment debugging
    console.error('❌ [NEXT API] Failed to fetch Kambi live data:', {
      message: error.message,
      name: error.name,
      cause: error.cause,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    return null;
  }
}

// Function to extract live data (score, matchClock, statistics) from Kambi API response
function extractKambiLiveData(kambiData) {
  const liveDataMap = {};
  
  if (kambiData && kambiData.liveEvents && Array.isArray(kambiData.liveEvents)) {
    kambiData.liveEvents.forEach(liveEvent => {
      // Only process football matches
      if (liveEvent.event && liveEvent.event.sport === 'FOOTBALL') {
        const eventId = liveEvent.event.id;
        
        // Extract live data (score, time, statistics) only
        if (liveEvent.liveData) {
          liveDataMap[eventId] = {
            eventId: liveEvent.liveData.eventId,
            matchClock: liveEvent.liveData.matchClock,
            score: liveEvent.liveData.score,
            statistics: liveEvent.liveData.statistics
          };
        }
      }
    });
  }
  
  console.log(`📊 [NEXT API] Extracted live data for ${Object.keys(liveDataMap).length} football matches`);
  return liveDataMap;
}

// Function to merge Kambi live data with Unibet matches
function mergeKambiLiveDataWithMatches(matches, liveDataMap) {
  if (!liveDataMap || Object.keys(liveDataMap).length === 0) {
    console.log('⚠️ [NEXT API] No Kambi live data to merge');
    return matches;
  }
  
  console.log('🔗 [NEXT API] Merging Kambi live data with matches:', {
    totalMatches: matches.length,
    totalLiveData: Object.keys(liveDataMap).length,
    matchIds: matches.map(m => m.id).slice(0, 5),
    liveDataIds: Object.keys(liveDataMap).slice(0, 5)
  });
  
  const enrichedMatches = matches.map(match => {
    const matchLiveData = liveDataMap[match.id];
    
    const enrichedMatch = { ...match };
    
    if (matchLiveData) {
      console.log(`✅ [NEXT API] Found live data for match ${match.id}:`, {
        hasMatchClock: !!matchLiveData.matchClock,
        hasScore: !!matchLiveData.score,
        hasStatistics: !!matchLiveData.statistics
      });
      enrichedMatch.kambiLiveData = matchLiveData;
    }
    
    return enrichedMatch;
  });
  
  const matchesWithLiveData = enrichedMatches.filter(m => m.kambiLiveData).length;
  console.log(`✨ [NEXT API] Enriched ${matchesWithLiveData} out of ${matches.length} matches with Kambi live data`);
  
  return enrichedMatches;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    // Skip cache completely for real-time updates (always fetch fresh)
    // Cache only used for request deduplication, not for data freshness
    
    // If already refreshing, wait for the current request instead of returning stale cache
    // This prevents flickering from stale data
    if (cache.isRefreshing) {
      // Wait for current request to complete (max 3 seconds)
      const maxWait = 3000;
      const startWait = Date.now();
      while (cache.isRefreshing && (Date.now() - startWait) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Check every 50ms
      }
      // If cache was updated, return fresh data
      if (cache.data && cache.lastUpdated && Date.now() - cache.lastUpdated < CACHE_DURATION) {
        console.log(`✅ [NEXT API] Returning fresh data after waiting for previous request`);
        return NextResponse.json(cache.data);
      }
      // If still refreshing or stale, continue with new request
    }
    
    // Mark as refreshing
    cache.isRefreshing = true;
    
    const url = `${UNIBET_LIVE_MATCHES_API}?includeParticipants=true&useCombined=true&ncid=${Date.now()}`;
    
    console.log(`🔍 [NEXT API] Proxying Unibet live matches request...`);
    
    const response = await fetch(url, {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cookie': 'INGRESSCOOKIE_SPORTSBOOK_FEEDS=f3d49df9fd1f30ee455fda88a4c1e692|e6f03e039bb9fba9ad84e4dd980ef8c9; kwp-a-b-testing-fallback-id=9d145c34-651b-4e3f-bca2-2383f698e11b; sp=22d55880-9d33-4693-a3c2-352105c84f44; fp_token_7c6a6574-f011-4c9a-abdd-9894a102ccef=0Kr+dgJ/YQ+v/8u8PqxfCG+PLSQixICn92Wlrn6d4/4=; OptanonAlertBoxClosed=2025-06-16T06:18:41.300Z; __spdt=5dea1d36965d41bf8f16516f631e2210; _tgpc=17e8f544-79d0-5a3a-b0bd-92e2d8aafabf; _gcl_au=1.1.403931822.1750054723; _ga=GA1.1.133975116.1750054723; isReturningUser=true; clientId=polopoly_desktop; timezone=Asia/Karachi; INGRESSCOOKIE_APIGATEWAY=8f4b414a59c8b183628f926f7dfa58b4|cfa05ea48f7ba1e9a8f8d10007d08d5e; _tguatd=eyJzYyI6Ind3dy51bmliZXQuY29tIiwiZnRzIjoid3d3LnVuaWJldC5jb20ifQ==; _tgidts=eyJzaCI6ImQ0MWQ4Y2Q5OGYwMGIyMDRlOTgwMDk5OGVjZjg0MjdlIiwiY2kiOiJhNzNiODIzNS1jZDBlLTU2YWEtYmNlYS0xZWUyOGI4NDRjNjQiLCJzaSI6ImNjMDIyYmYzLTRkYTQtNWVjMC04YWJmLTI5YjdhMzIyMWM1NSJ9; _sp_ses.8ccc=*; _tglksd=eyJzIjoiY2MwMjJiZjMtNGRhNC01ZWMwLThhYmYtMjliN2EzMjIxYzU1Iiwic3QiOjE3NTQ5OTQ4OTE0MjAsInNvZCI6Ind3dy51bmliZXQuY29tIiwic29kdCI6MTc1MzM0NDk2NDUzOCwic29kcyI6ImMiLCJzb2RzdCI6MTc1NDk5NDg5MzY4NH0=; INGRESSCOOKIE_CMS=c41e492595a9d6dfade02052f30b60b3|52b57b1639bb8e648ac62eed802c09a2; OptanonConsent=isGpcEnabled=0&datestamp=Tue+Aug+12+2025+16%3A12%3A17+GMT%2B0500+(Pakistan+Standard+Time)&version=202401.2.0&browserGpcFlag=0&isIABGlobal=false&hosts=&genVendors=V5%3A0%2C&consentId=f581b4fc-c6a6-47cf-bd5b-c8aa71ce4db2&interactionCount=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0004%3A1%2CC0003%3A1%2CC0005%3A1&geolocation=PK%3BPB&AwaitingReconsent=false; _tgsid=eyJscGQiOiJ7XCJscHVcIjpcImh0dHBzOi8vd3d3LnVuaWJldC5jb20uYXUlMkZcIixcImxwdFwiOlwiT25saW5lJTIwR2FtYmxpbmclMjB3aXRoJTIwVW5pYmV0JTIwQXVzdHJhbGlhJTIwJTdDJTIwU3BvcnRzJTIwJTdDJTIwUmFjaW5nXCIsXCJscHJcIjpcImh0dHBzOi8vd3d3LnVuaWJldC5jb21cIn0iLCJwcyI6ImRiOGEzODEwLTEzNWMtNDMzNS1iOWU2LWJhNzdhN2I1NGM0ZiIsInB2YyI6IjIwIiwic2MiOiJjYzAyMmJmMy00ZGE0LTVlYzAtOGFiZi0yOWI3YTMyMjE1NSIsImVjIjoiNTAiLCJwdiI6IjEiLCJ0aW0iOiJjYzAyMmJmMy00ZGE0LTVlYzAtOGFiZi0yOWI3YTMyMjE1NSI6MTc1NDk5NDg5NDQ0NjotMX0=; _rdt_uuid=1750054722175.41b1a1ba-700c-4766-b2ed-58dd52a8f247; _sp_id.8ccc=7c67de03-e49c-4218-be1f-aaeaafa2158a.1750054660.7.1754997653.1754983786.e26593e7-062e-4f66-8298-802d479056b7.cf96a64c-844c-40c7-aaa-9b531466bbec.4f38ed8d-63bf-4ab1-9f04-385eff01cc82.1754994891553.20; _ga_G1L15CCMLL=GS2.1.s1754994892$o12$g1$t1754997654$j59$l0$h0; INGRESSCOOKIE_UGRACING=68b5eb9bf37ff89ac2d1c331821a0a7f|f4136ac0333d3542dbf7e23c5af0d348',
        'priority': 'u=1, i',
        'referer': 'https://www.unibet.com.au/betting/sports/filter/football/all/matches',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(2500) // 2.5 seconds timeout - balanced for reliability
    });
    
    if (!response.ok) {
      throw new Error(`Unibet API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log(`✅ [NEXT API] Successfully fetched Unibet API response`);
    
    // Extract matches (SAME LOGIC AS BACKEND)
    const { allMatches, liveMatches, upcomingMatches } = extractFootballMatches(data);
    
    // Apply league filtering based on backend API - STRICT FILTERING
    console.log('🔍 [NEXT API] Applying league filtering (STRICT MODE)...');
    let filteredAllMatches = [];
    let filteredLiveMatches = [];
    let filteredUpcomingMatches = [];
    
    try {
      const stats = await getLeagueFilterStats();
      console.log(`📊 [NEXT API] Total allowed leagues: ${stats.totalAllowedLeagues}`);
      
      // ✅ STRICT FILTERING: Always filter if mapping loaded successfully
      // Only show matches from CSV leagues, even if 0 leagues in CSV
      filteredAllMatches = await filterMatchesByAllowedLeagues(allMatches);
      filteredLiveMatches = await filterMatchesByAllowedLeagues(liveMatches);
      filteredUpcomingMatches = await filterMatchesByAllowedLeagues(upcomingMatches);
      
      console.log(`✅ [NEXT API] League filtering complete (STRICT):`);
      console.log(`   - All matches: ${allMatches.length} → ${filteredAllMatches.length}`);
      console.log(`   - Live matches: ${liveMatches.length} → ${filteredLiveMatches.length}`);
      console.log(`   - Upcoming matches: ${upcomingMatches.length} → ${filteredUpcomingMatches.length}`);
      
      if (stats.totalAllowedLeagues === 0) {
        console.warn('⚠️ [NEXT API] League mapping has 0 leagues - no matches will be shown (STRICT MODE)');
      }
    } catch (error) {
      // ✅ STRICT: If filtering fails, show empty array (don't allow all matches)
      console.error('❌ [NEXT API] League filtering failed:', error.message);
      console.warn('⚠️ [NEXT API] STRICT MODE: Showing no matches due to filtering error');
      // Return empty arrays - strict filtering means no matches if filtering fails
      filteredAllMatches = [];
      filteredLiveMatches = [];
      filteredUpcomingMatches = [];
    }

    // Filter upcoming matches to only show matches within next 24 hours (SAME AS BACKEND)
    const now = new Date();
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const upcomingMatchesWithin24Hours = filteredUpcomingMatches.filter(match => {
      // Use start field (from event.start) or starting_at if available
      const matchStartTimeStr = match.start || match.starting_at;
      
      if (!matchStartTimeStr) {
        return false; // Exclude matches without start time
      }
      
      const matchStartTime = new Date(matchStartTimeStr);
      
      // Check if date is valid
      if (isNaN(matchStartTime.getTime())) {
        console.warn(`⚠️ [NEXT API] Invalid start time for match ${match.id}: ${matchStartTimeStr}`);
        return false;
      }
      
      // Only include matches that start within the next 24 hours (from now)
      const isWithin24Hours = matchStartTime >= now && matchStartTime <= twentyFourHoursLater;
      
      return isWithin24Hours;
    });
    
    console.log(`⏰ [NEXT API] Time filtering for upcoming matches:`);
    console.log(`   - Before 24h filter: ${filteredUpcomingMatches.length}`);
    console.log(`   - After 24h filter: ${upcomingMatchesWithin24Hours.length}`);
    console.log(`   - Current time: ${now.toISOString()}`);
    console.log(`   - 24 hours later: ${twentyFourHoursLater.toISOString()}`);
    
    // ✅ OPTIMIZATION: Try to get Kambi data quickly (race condition)
    // If Kambi completes in < 3s, merge it. Otherwise return without it.
    console.log('🎲 [NEXT API] Fetching Kambi live data (fast race)...');
    const kambiPromise = fetchKambiLiveData().catch(err => {
      console.warn('⚠️ [NEXT API] Kambi fetch failed:', err.message);
      return null;
    });
    
    // Race: Wait max 3 seconds for Kambi, then return matches
    let enrichedLiveMatches = filteredLiveMatches;
    let liveDataMap = {};
    
    try {
      const kambiData = await Promise.race([
        kambiPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)) // ✅ Increase to 3 seconds for deployment
      ]);
      
      if (kambiData) {
        liveDataMap = extractKambiLiveData(kambiData);
        enrichedLiveMatches = mergeKambiLiveDataWithMatches(filteredLiveMatches, liveDataMap);
        console.log(`✨ [NEXT API] Kambi data merged quickly (${Object.keys(liveDataMap).length} matches)`);
      } else {
        console.log(`⏱️ [NEXT API] Kambi data not ready in time, returning without it (will update in background)`);
      }
    } catch (error) {
      console.warn('⚠️ [NEXT API] Kambi data fetch failed, continuing without it:', error.message);
    }
    
    // Prepare response data
    const responseTimestamp = Date.now(); // Numeric timestamp for millisecond-precision comparison
    const responseData = {
      success: true,
      matches: enrichedLiveMatches, // May or may not have Kambi data
      allMatches: filteredAllMatches,
      upcomingMatches: upcomingMatchesWithin24Hours,
      totalMatches: enrichedLiveMatches.length,
      totalAllMatches: allMatches.length,
      lastUpdated: new Date().toISOString(),
      timestamp: responseTimestamp, // Numeric timestamp for millisecond-precision comparison
      source: 'unibet-proxy-nextjs',
      debug: {
        totalEventsFound: allMatches.length,
        liveEventsWithOdds: enrichedLiveMatches.length,
        upcomingEventsWithOdds: upcomingMatches.length,
        kambiLiveDataCount: Object.keys(liveDataMap).length
      }
    };
    
    // Update cache immediately
    cache.data = responseData;
    cache.lastUpdated = Date.now();
    cache.isRefreshing = false;
    
    // Continue fetching Kambi in background for next request (if not already done)
    if (Object.keys(liveDataMap).length === 0) {
      kambiPromise.then(kambiData => {
        if (kambiData) {
          const bgLiveDataMap = extractKambiLiveData(kambiData);
          const bgEnrichedMatches = mergeKambiLiveDataWithMatches(filteredLiveMatches, bgLiveDataMap);
          
          // Update cache with enriched data (for next request)
          cache.data = {
            ...responseData,
            matches: bgEnrichedMatches,
            debug: {
              ...responseData.debug,
              kambiLiveDataCount: Object.keys(bgLiveDataMap).length
            }
          };
          cache.lastUpdated = Date.now();
          console.log(`✨ [NEXT API] Kambi data merged in background (${Object.keys(bgLiveDataMap).length} matches enriched)`);
        }
      }).catch(() => {
        // Ignore errors
      });
    }
    
    console.log(`✅ [NEXT API] Returning matches (${liveMatches.length} matches, ${Object.keys(liveDataMap).length} with Kambi data)`);
    
    // Return response
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Response-Source': 'nodejs-optimized-fast'
      }
    });
  } catch (error) {
    // Mark as not refreshing on error
    cache.isRefreshing = false;
    
    // Handle timeout errors silently - just return cached data
    if (error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
      if (cache.data) {
        console.log(`⏱️ [NEXT API] Timeout - returning cached data (${Object.keys(cache.data.matches || {}).length} matches)`);
        return NextResponse.json(cache.data);
      }
      // No cache available - return empty response
      console.warn(`⏱️ [NEXT API] Timeout and no cache available`);
      return NextResponse.json({
        success: true,
        matches: [],
        allMatches: [],
        upcomingMatches: [],
        totalMatches: 0,
        totalAllMatches: 0,
        lastUpdated: new Date().toISOString(),
        timestamp: Date.now(),
        source: 'unibet-proxy-nextjs',
        warning: 'Timeout - no data available'
      });
    }
    
    // Log other errors (not timeouts)
    console.error(`❌ [NEXT API] Error proxying Unibet live matches:`, error.message);
    
    // Return cached data if available (even if stale) on error
    if (cache.data) {
      console.log(`⚠️ [NEXT API] Returning stale cache due to error`);
      return NextResponse.json(cache.data);
    }
    
    // Return error response with proper status
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch live matches',
        timestamp: new Date().toISOString(),
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}


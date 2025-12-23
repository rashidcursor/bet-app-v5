// Next.js API Route - Proxy for Unibet Live Matches API (handles CORS)
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

const CACHE_DURATION = 500; // 500ms cache to prevent duplicate requests while allowing real-time updates

// Helper function to extract football matches (SAME AS BACKEND - exact copy)
function extractFootballMatches(data) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:9',message:'extractFootballMatches - entry',data:{hasData:!!data,hasLayout:!!data?.layout,hasSections:!!data?.layout?.sections},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  const allMatches = [];
  const liveMatches = [];
  const upcomingMatches = [];
  
  if (data && data.layout && data.layout.sections) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:15',message:'extractFootballMatches - has sections',data:{sectionsCount:data.layout.sections.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const mainSection = data.layout.sections.find(s => s.position === 'MAIN');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:16',message:'extractFootballMatches - mainSection',data:{hasMainSection:!!mainSection,hasWidgets:!!mainSection?.widgets,widgetsCount:mainSection?.widgets?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (mainSection && mainSection.widgets) {
      const tournamentWidget = mainSection.widgets.find(w => w.widgetType === 'TOURNAMENT');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:18',message:'extractFootballMatches - tournamentWidget',data:{hasTournamentWidget:!!tournamentWidget,hasMatches:!!tournamentWidget?.matches,hasGroups:!!tournamentWidget?.matches?.groups,groupsCount:tournamentWidget?.matches?.groups?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (tournamentWidget && tournamentWidget.matches && tournamentWidget.matches.groups) {
        // Process each group (which represents a league/competition)
        tournamentWidget.matches.groups.forEach((group, groupIndex) => {
          // #region agent log
          if (groupIndex < 2) {
            fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:21',message:'extractFootballMatches - processing group',data:{groupIndex,hasSubGroups:!!group.subGroups,subGroupsCount:group.subGroups?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          }
          // #endregion
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

                  // #region agent log
                  if (allMatches.length < 3) {
                    fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:36',message:'extractFootballMatches - processed event',data:{eventId:event.id,groupId:event.groupId,groupIdType:typeof event.groupId,state:event.state},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                  }
                  // #endregion

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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:145',message:'extractFootballMatches - before filtering',data:{allMatchesCount:allMatches.length,liveMatchesCount:liveMatches.length,upcomingMatchesCount:upcomingMatches.length,sampleGroupIds:allMatches.slice(0,5).map(m=>({id:m.id,groupId:m.groupId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  // Apply league filtering based on CSV file (SAME AS BACKEND)
  console.log('🔍 [NEXT API] Applying league filtering...');
  const stats = getLeagueFilterStats();
  console.log(`📊 [NEXT API] Total allowed leagues: ${stats.totalAllowedLeagues}`);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:150',message:'extractFootballMatches - filter stats',data:{totalAllowedLeagues:stats.totalAllowedLeagues,sampleAllowedIds:stats.allowedLeagueIds.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const filteredAllMatches = filterMatchesByAllowedLeagues(allMatches);
  const filteredLiveMatches = filterMatchesByAllowedLeagues(liveMatches);
  const filteredUpcomingMatches = filterMatchesByAllowedLeagues(upcomingMatches);
  
  console.log(`✅ [NEXT API] League filtering complete:`);
  console.log(`   - All matches: ${allMatches.length} → ${filteredAllMatches.length}`);
  console.log(`   - Live matches: ${liveMatches.length} → ${filteredLiveMatches.length}`);
  console.log(`   - Upcoming matches: ${upcomingMatches.length} → ${filteredUpcomingMatches.length}`);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:157',message:'extractFootballMatches - after filtering',data:{allMatchesBefore:allMatches.length,allMatchesAfter:filteredAllMatches.length,liveMatchesBefore:liveMatches.length,liveMatchesAfter:filteredLiveMatches.length,upcomingMatchesBefore:upcomingMatches.length,upcomingMatchesAfter:filteredUpcomingMatches.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

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

  return { 
    allMatches: filteredAllMatches, 
    liveMatches: filteredLiveMatches, 
    upcomingMatches: upcomingMatchesWithin24Hours 
  };
}

// Function to fetch live data from Kambi API (score, matchClock, statistics)
async function fetchKambiLiveData() {
  try {
    const url = `${KAMBI_LIVE_API_URL}?lang=en_AU&market=AU&client_id=2&channel_id=1&ncid=${Date.now()}`;
    console.log('🎲 [NEXT API] Fetching live data from Kambi API...');
    
    const response = await fetch(url, {
      headers: KAMBI_LIVE_HEADERS,
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Kambi API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.liveEvents) {
      console.log(`✅ [NEXT API] Successfully fetched Kambi live data:`, {
        hasLiveEvents: !!data.liveEvents,
        totalEvents: data.liveEvents?.length || 0,
        footballEvents: data.liveEvents?.filter(e => e.event?.sport === 'FOOTBALL').length || 0
      });
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('❌ [NEXT API] Failed to fetch Kambi live data:', error.message);
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
    
    // Return cached data if available and fresh (unless force refresh)
    if (!force && cache.data && cache.lastUpdated && 
        Date.now() - cache.lastUpdated < CACHE_DURATION) {
      console.log(`📦 [NEXT API] Returning cached data (age: ${Date.now() - cache.lastUpdated}ms)`);
      return NextResponse.json(cache.data);
    }
    
    // If already refreshing, return stale cache (prevents duplicate requests)
    if (cache.isRefreshing && cache.data) {
      console.log(`⏳ [NEXT API] Request already in progress, returning stale cache`);
      return NextResponse.json(cache.data);
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
      }
    });
    
    if (!response.ok) {
      throw new Error(`Unibet API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log(`✅ [NEXT API] Successfully fetched Unibet API response`);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:222',message:'GET - Unibet response received',data:{hasData:!!data,hasLayout:!!data?.layout,responseKeys:Object.keys(data||{}).slice(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // Extract and filter matches (SAME LOGIC AS BACKEND)
    const { allMatches, liveMatches, upcomingMatches } = extractFootballMatches(data);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36e9cd0b-a351-407e-8f20-cf67918d6e8e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.js:227',message:'GET - extraction complete',data:{allMatchesCount:allMatches.length,liveMatchesCount:liveMatches.length,upcomingMatchesCount:upcomingMatches.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    // Fetch Kambi live data (score, matchClock, statistics) for live matches
    console.log('🎲 [NEXT API] Fetching Kambi live data to enrich matches...');
    const kambiData = await fetchKambiLiveData();
    const liveDataMap = extractKambiLiveData(kambiData);
    
    // Merge Kambi live data with live matches
    const enrichedLiveMatches = mergeKambiLiveDataWithMatches(liveMatches, liveDataMap);
    
    // Prepare response data
    const responseData = {
      success: true,
      matches: enrichedLiveMatches,
      allMatches: allMatches,
      upcomingMatches: upcomingMatches,
      totalMatches: enrichedLiveMatches.length,
      totalAllMatches: allMatches.length,
      lastUpdated: new Date().toISOString(),
      source: 'unibet-proxy-nextjs',
      debug: {
        totalEventsFound: allMatches.length,
        liveEventsWithOdds: enrichedLiveMatches.length,
        upcomingEventsWithOdds: upcomingMatches.length,
        kambiLiveDataCount: Object.keys(liveDataMap).length
      }
    };
    
    // Update cache
    cache.data = responseData;
    cache.lastUpdated = Date.now();
    cache.isRefreshing = false;
    
    console.log(`✅ [NEXT API] Cache updated (${allMatches.length} matches)`);
    
    return NextResponse.json(responseData);
  } catch (error) {
    // Mark as not refreshing on error
    cache.isRefreshing = false;
    
    console.error(`❌ [NEXT API] Error proxying Unibet live matches:`, error);
    
    // Return cached data if available (even if stale) on error
    if (cache.data) {
      console.log(`⚠️ [NEXT API] Returning stale cache due to error`);
      return NextResponse.json(cache.data);
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch live matches',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}


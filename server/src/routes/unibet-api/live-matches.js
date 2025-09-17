import express from 'express';
import axios from 'axios';
const router = express.Router();

// Configuration matching the working unibet-api
const ALL_FOOTBALL_API_URL = 'https://www.unibet.com.au/sportsbook-feeds/views/filter/football/all/matches';
const ALL_FOOTBALL_HEADERS = {
  'accept': '*/*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'en-US,en;q=0.9',
  'cookie': 'INGRESSCOOKIE_SPORTSBOOK_FEEDS=f3d49df9fd1f30ee455fda88a4c1e692|e6f03e039bb9fba9ad84e4dd980ef8c9; kwp-a-b-testing-fallback-id=9d145c34-651b-4e3f-bca2-2383f698e11b; sp=22d55880-9d33-4693-a3c2-352105c84f44; fp_token_7c6a6574-f011-4c9a-abdd-9894a102ccef=0Kr+dgJ/YQ+v/8u8PqxfCG+PLSQixICn92Wlrn6d4/4=; OptanonAlertBoxClosed=2025-06-16T06:18:41.300Z; __spdt=5dea1d36965d41bf8f16516f631e2210; _tgpc=17e8f544-79d0-5a3a-b0bd-92e2d8aafabf; _gcl_au=1.1.403931822.1750054723; _ga=GA1.1.133975116.1750054723; isReturningUser=true; clientId=polopoly_desktop; timezone=Asia/Karachi; INGRESSCOOKIE_APIGATEWAY=8f4b414a59c8b183628f926f7dfa58b4|cfa05ea48f7ba1e9a8f8d10007d08d5e; _tguatd=eyJzYyI6Ind3dy51bmliZXQuY29tIiwiZnRzIjoid3d3LnVuaWJldC5jb20ifQ==; _tgidts=eyJzaCI6ImQ0MWQ4Y2Q5OGYwMGIyMDRlOTgwMDk5OGVjZjg0MjdlIiwiY2kiOiJhNzNiODIzNS1jZDBlLTU2YWEtYmNlYS0xZWUyOGI4NDRjNjQiLCJzaSI6ImNjMDIyYmYzLTRkYTQtNWVjMC04YWJmLTI5YjdhMzIyMWM1NSJ9; _sp_ses.8ccc=*; _tglksd=eyJzIjoiY2MwMjJiZjMtNGRhNC01ZWMwLThhYmYtMjliN2EzMjIxYzU1Iiwic3QiOjE3NTQ5OTQ4OTE0MjAsInNvZCI6Ind3dy51bmliZXQuY29tIiwic29kdCI6MTc1MzM0NDk2NDUzOCwic29kcyI6ImMiLCJzb2RzdCI6MTc1NDk5NDg5MzY4NH0=; INGRESSCOOKIE_CMS=c41e492595a9d6dfade02052f30b60b3|52b57b1639bb8e648ac62eed802c09a2; OptanonConsent=isGpcEnabled=0&datestamp=Tue+Aug+12+2025+16%3A12%3A17+GMT%2B0500+(Pakistan+Standard+Time)&version=202401.2.0&browserGpcFlag=0&isIABGlobal=false&hosts=&genVendors=V5%3A0%2C&consentId=f581b4fc-c6a6-47cf-bd5b-c8aa71ce4db2&interactionCount=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0004%3A1%2CC0003%3A1%2CC0005%3A1&geolocation=PK%3BPB&AwaitingReconsent=false; _tgsid=eyJscGQiOiJ7XCJscHVcIjpcImh0dHBzOi8vd3d3LnVuaWJldC5jb20uYXUlMkZcIixcImxwdFwiOlwiT25saW5lJTIwR2FtYmxpbmclMjB3aXRoJTIwVW5pYmV0JTIwQXVzdHJhbGlhJTIwJTdDJTIwU3BvcnRzJTIwJTdDJTIwUmFjaW5nXCIsXCJscHJcIjpcImh0dHBzOi8vd3d3LnVuaWJldC5jb21cIn0iLCJwcyI6ImRiOGEzODEwLTEzNWMtNDMzNS1iOWU2LWJhNzdhN2I1NGM0ZiIsInB2YyI6IjIwIiwic2MiOiJjYzAyMmJmMy00ZGE0LTVlYzAtOGFiZi0yOWI3YTMyMjE1NSIsImVjIjoiNTAiLCJwdiI6IjEiLCJ0aW0iOiJjYzAyMmJmMy00ZGE0LTVlYzAtOGFiZi0yOWI3YTMyMjE1NSI6MTc1NDk5NDg5NDQ0NjotMX0=; _rdt_uuid=1750054722175.41b1a1ba-700c-4766-b2ed-58dd52a8f247; _sp_id.8ccc=7c67de03-e49c-4218-be1f-aaeaafa2158a.1750054660.7.1754997653.1754983786.e26593e7-062e-4f66-8298-802d479056b7.cf96a64c-844c-40c7-a9aa-8b531466bbec.4f38ed8d-63bf-4ab1-9f04-385eff01cc82.1754994891553.20; _ga_G1L15CCMLL=GS2.1.s1754994892$o12$g1$t1754997654$j59$l0$h0; INGRESSCOOKIE_UGRACING=68b5eb9bf37ff89ac2d1c331821a0a7f|f4136ac0333d3542dbf7e23c5af0d348',
  'priority': 'u=1, i',
  'referer': 'https://www.unibet.com.au/betting/sports/filter/football/all/matches',
  'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
};

// GET /api/v2/live-matches
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Fetching live matches from Unibet API...');
    
    // Build URL with required parameters (like working unibet-api)
    const url = `${ALL_FOOTBALL_API_URL}?includeParticipants=true&useCombined=true&ncid=${Date.now()}`;
    
    const response = await axios.get(url, {
      headers: ALL_FOOTBALL_HEADERS,
      timeout: 12000
    });
    
    const data = response.data;
    const { allMatches, liveMatches, upcomingMatches } = extractFootballMatches(data);
    
    console.log(`✅ Successfully fetched ${allMatches.length} total matches (${liveMatches.length} live, ${upcomingMatches.length} upcoming)`);
    
    res.json({
      success: true,
      matches: liveMatches, // Return only live matches
      allMatches: allMatches,
      upcomingMatches: upcomingMatches,
      totalMatches: liveMatches.length,
      totalAllMatches: allMatches.length,
      lastUpdated: new Date().toISOString(),
      source: 'unibet-all-football-api'
    });
  } catch (error) {
    console.error('❌ Error fetching live matches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live matches',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to extract football matches (matching working unibet-api)
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
        tournamentWidget.matches.groups.forEach(group => {
          if (group.subGroups) {
            group.subGroups.forEach(subGroup => {
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
                    groupId: event.groupId,
                    group: event.group,
                    participants: event.participants,
                    parentName: parentName,
                    leagueName: subGroup.name,
                    liveData: event.liveData ? {
                      score: event.liveData.score || '0-0',
                      period: event.liveData.period || '1st Half',
                      minute: event.liveData.minute || '0'
                    } : null
                  };

                  allMatches.push(processedEvent);

                  // Categorize by state
                  if (event.state === 'STARTED') {
                    liveMatches.push(processedEvent);
                  } else if (event.state === 'NOT_STARTED') {
                    upcomingMatches.push(processedEvent);
                  }
                });
              }
            });
          }
        });
      }
    }
  }
  
  return { allMatches, liveMatches, upcomingMatches };
}

export default router;
import { Server } from 'socket.io';

let io = null;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          process.env.CLIENT_URL || "http://localhost:3000",
          "http://69.197.164.180:3000",
          "http://69.197.164.180",
          // ✅ NEW VERCEL DEPLOYMENT
          "https://bet-app-v1-qtnw.vercel.app",
          "https://bet-app-v1-qtnw.vercel.app/",
          // ✅ WILDCARD FOR ALL VERCEL DEPLOYMENTS
          /^https:\/\/bet-app-v1.*\.vercel\.app$/,
          /^https:\/\/betting.*\.vercel\.app$/,
        ];
        
        if (allowedOrigins.some(allowed => {
          if (typeof allowed === 'string') {
            return origin === allowed;
          } else if (allowed instanceof RegExp) {
            return allowed.test(origin);
          }
          return false;
        })) {
          callback(null, true);
        } else {
          console.warn(`⚠️ Socket.IO CORS blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Make io available globally
  global.io = io;

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    
    // Join user room if authenticated
    socket.on('joinUserRoom', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`👤 Socket ${socket.id} joined user_${userId} room`);
    });
    
    // Join live matches room
    socket.on('joinLiveMatches', () => {
      socket.join('liveMatches');
      console.log(`👥 Socket ${socket.id} joined liveMatches room`);
      
      // Send cached live matches to new client
      const liveFixturesService = global.liveFixturesService;
      console.log('🔍 [Socket] liveFixturesService available:', !!liveFixturesService);
      
      if (liveFixturesService) {
        const cachedLiveMatches = liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
        console.log('🔍 [Socket] Cached live matches:', cachedLiveMatches.length, cachedLiveMatches);
        
        if (cachedLiveMatches.length > 0) {
          // Check if we have odds for these matches
          const matchesWithOdds = cachedLiveMatches.filter(match => 
            liveFixturesService.liveOddsCache.get(match.id)
          );
          
          console.log(`🔍 [Socket] Found ${cachedLiveMatches.length} live matches, ${matchesWithOdds.length} with odds`);
          
          // Only send matches if we have odds for them
          if (matchesWithOdds.length > 0) {
            // Group matches by league (same as in LiveFixtures service)
            const leagueMap = new Map();
            
            cachedLiveMatches.forEach(match => {
              // Extract team names from the name field
              let team1 = 'Team 1';
              let team2 = 'Team 2';
              
              if (match.name) {
                const teams = match.name.split(' vs ');
                if (teams.length >= 2) {
                  team1 = teams[0].trim();
                  team2 = teams[1].trim();
                }
              }
              
              // Get league information from cache
              let league = {
                id: match.league_id,
                name: `League ${match.league_id}`,
                imageUrl: null,
                country: null
              };
              
              // Try to get league details from cache
              try {
                const popularLeagues = global.fixtureOptimizationService?.leagueCache?.get("popular_leagues") || [];
                const foundLeague = popularLeagues.find(l => Number(l.id) === Number(match.league_id));
                if (foundLeague) {
                  league.name = foundLeague.name;
                  league.imageUrl = foundLeague.image_path || null;
                  league.country = typeof foundLeague.country === "string" 
                    ? foundLeague.country 
                    : foundLeague.country?.name || null;
                }
              } catch (error) {
                console.log(`[Socket] Error fetching league info for ${match.league_id}:`, error);
              }
              
              // Group by league
              const leagueId = match.league_id;
              if (!leagueMap.has(leagueId)) {
                leagueMap.set(leagueId, {
                  league: league,
                  matches: []
                });
              }
              
              // Add match to league group (without odds - client will merge them)
              const transformedMatch = {
                ...match,
                team1,
                team2,
                league,
                isLive: true,
                time: 'LIVE',
                date: match.starting_at ? match.starting_at.split(' ')[0] : '',
                clock: match.isTicking || false
              };
              
              leagueMap.get(leagueId).matches.push(transformedMatch);
            });
            
            // Convert to array format
            const leagueGroups = Array.from(leagueMap.values());
            
            socket.emit('liveMatchesUpdate', {
              matches: leagueGroups,
              timestamp: new Date().toISOString()
            });
            console.log(`📡 [WebSocket] Sent ${leagueGroups.length} league groups to new client ${socket.id}`);
          
            // Also send all cached odds for live matches
            const allOddsUpdates = [];
            console.log('🔍 [Socket] Checking cached odds for', cachedLiveMatches.length, 'matches');
            cachedLiveMatches.forEach(match => {
              const cachedOdds = liveFixturesService.liveOddsCache.get(match.id);
              console.log('🔍 [Socket] Match', match.id, 'cached odds:', !!cachedOdds);
              if (cachedOdds) {
                const mainOdds = liveFixturesService.extractMainOdds(cachedOdds.betting_data);
                console.log('🔍 [Socket] Extracted main odds for match', match.id, ':', mainOdds);
                allOddsUpdates.push({
                  matchId: match.id,
                  odds: mainOdds,
                  classification: cachedOdds.odds_classification || {},
                  timestamp: new Date().toISOString()
                });
              }
            });
            
            if (allOddsUpdates.length > 0) {
              socket.emit('multipleOddsUpdate', allOddsUpdates);
              console.log(`📡 [WebSocket] Sent ${allOddsUpdates.length} cached odds updates to new client ${socket.id}`);
            }
          } else {
            console.log('⚠️ [Socket] Live matches found but no odds available yet - waiting for odds to be fetched');
            // Trigger odds update for live matches
            liveFixturesService.updateInplayMatchesOdds(cachedLiveMatches);
          }
        } else {
          console.log('⚠️ [Socket] No cached live matches found');
        }
      } else {
        console.log('⚠️ [Socket] LiveFixtures service not available');
      }
    });
    
    // Join specific match room
    socket.on('joinMatch', (matchId) => {
      socket.join(`match_${matchId}`);
      console.log(`👥 Socket ${socket.id} joined match_${matchId} room`);
      
      // Send cached odds for this match to new client
      const liveFixturesService = global.liveFixturesService;
      if (liveFixturesService) {
        const cachedOdds = liveFixturesService.liveOddsCache.get(matchId);
        if (cachedOdds) {
          const mainOdds = liveFixturesService.extractMainOdds(cachedOdds.betting_data);
          socket.emit('liveOddsUpdate', {
            matchId: matchId,
            odds: mainOdds,
            classification: cachedOdds.odds_classification || {},
            timestamp: new Date().toISOString()
          });
          console.log(`📡 [WebSocket] Sent cached odds for match ${matchId} to new client ${socket.id}`);
        }
      }
    });
    
    // Leave specific match room
    socket.on('leaveMatch', (matchId) => {
      socket.leave(`match_${matchId}`);
      console.log(`👋 Socket ${socket.id} left match_${matchId} room`);
    });
    
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });


  });

  console.log('🔌 Socket.IO server initialized');
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
};

export const setIO = (socketIO) => {
  io = socketIO;
}; 
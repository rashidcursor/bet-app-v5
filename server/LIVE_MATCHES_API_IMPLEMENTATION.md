# Live Matches API - Complete Implementation Guide

This guide provides a complete, standalone implementation of the Live Matches API that you can integrate into your existing betting website project.

## Overview

The Live Matches API fetches real-time football match data from Unibet's comprehensive football matches API and provides it in a structured format for your frontend to consume.

## Implementation Files

### 1. Live Matches API Client (`live-matches-api.js`)

```javascript
class LiveMatchesAPI {
  constructor() {
    this.baseURL = 'https://www.unibet.com.au/sportsbook-feeds/views/filter/football/all/matches';
    this.headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    this.cache = {
      data: null,
      lastUpdated: null,
      ttl: 30000 // 30 seconds cache
    };
  }

  async fetchWithRetry(url, options = {}, retryConfig = {}) {
    const {
      retries = 3,
      minDelayMs = 1000,
      maxDelayMs = 5000,
      timeoutMs = 10000
    } = retryConfig;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: { ...this.headers, ...options.headers }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt === retries) {
          throw error;
        }

        const delay = Math.min(minDelayMs * Math.pow(2, attempt), maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  extractFootballMatches(data) {
    const allMatches = [];
    const liveMatches = [];
    const upcomingMatches = [];
    
    if (data && data.layout && data.layout.sections) {
      data.layout.sections.forEach(section => {
        if (section.widgets) {
          section.widgets.forEach(widget => {
            if (widget.type === 'tournamentWidget' && widget.tournamentWidget) {
              const tournamentWidget = widget.tournamentWidget;
              
              if (tournamentWidget.matches && tournamentWidget.matches.groups) {
                tournamentWidget.matches.groups.forEach(group => {
                  if (group.subGroups) {
                    group.subGroups.forEach(subGroup => {
                      if (subGroup.events) {
                        subGroup.events.forEach(eventData => {
                          const event = eventData.event;
                          
                          if (event.sport === 'FOOTBALL') {
                            const processedEvent = {
                              id: event.id,
                              name: event.name,
                              start: event.start,
                              state: event.state,
                              sport: event.sport,
                              group: event.group?.name || 'Unknown League',
                              leagueName: event.group?.name || 'Unknown League',
                              parentName: group.name || 'Football',
                              participants: event.participants?.map(p => ({
                                name: p.name,
                                position: p.position
                              })) || [],
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
                          }
                        });
                      }
                    });
                  }
                });
              }
            }
          });
        }
      });
    }

    // Sort matches by start time
    allMatches.sort((a, b) => new Date(a.start) - new Date(b.start));
    liveMatches.sort((a, b) => new Date(a.start) - new Date(b.start));
    upcomingMatches.sort((a, b) => new Date(a.start) - new Date(b.start));

    return {
      allMatches,
      liveMatches,
      upcomingMatches
    };
  }

  async getLiveMatches() {
    try {
      // Check cache first
      if (this.cache.data && this.cache.lastUpdated) {
        const cacheAge = Date.now() - this.cache.lastUpdated;
        if (cacheAge < this.cache.ttl) {
          return this.cache.data;
        }
      }

      const url = `${this.baseURL}?includeParticipants=true&useCombined=true&ncid=${Date.now()}`;
      const response = await this.fetchWithRetry(url, {
        method: 'GET'
      }, {
        retries: 4,
        minDelayMs: 400,
        maxDelayMs: 1800,
        timeoutMs: 12000
      });

      const data = await response.json();
      const { allMatches, liveMatches, upcomingMatches } = this.extractFootballMatches(data);

      // Group live matches by parent and league for organized display
      const groupedLiveMatches = {};
      liveMatches.forEach(match => {
        const parentName = match.parentName || 'Football';
        const leagueName = match.leagueName;
        
        if (!groupedLiveMatches[parentName]) {
          groupedLiveMatches[parentName] = {
            name: parentName,
            leagues: {},
            totalMatches: 0
          };
        }
        
        if (!groupedLiveMatches[parentName].leagues[leagueName]) {
          groupedLiveMatches[parentName].leagues[leagueName] = {
            name: leagueName,
            matches: []
          };
        }
        
        groupedLiveMatches[parentName].leagues[leagueName].matches.push(match);
        groupedLiveMatches[parentName].totalMatches++;
      });

      // Update cache
      this.cache.data = {
        success: true,
        matches: liveMatches,
        groupedMatches: groupedLiveMatches,
        allMatches: allMatches,
        upcomingMatches: upcomingMatches,
        totalMatches: liveMatches.length,
        totalAllMatches: allMatches.length,
        lastUpdated: new Date().toISOString(),
        source: 'unibet-all-football-api'
      };
      this.cache.lastUpdated = Date.now();

      return this.cache.data;
    } catch (error) {
      console.error('Error fetching live matches:', error);
      
      // Return cached data if available, even if expired
      if (this.cache.data) {
        return {
          ...this.cache.data,
          success: false,
          error: error.message,
          cached: true
        };
      }

      throw error;
    }
  }

  async getAllFootballMatches() {
    try {
      const url = `${this.baseURL}?includeParticipants=true&useCombined=true&ncid=${Date.now()}`;
      const response = await this.fetchWithRetry(url, {
        method: 'GET'
      }, {
        retries: 4,
        minDelayMs: 400,
        maxDelayMs: 1800,
        timeoutMs: 12000
      });

      const data = await response.json();
      const { allMatches, liveMatches, upcomingMatches } = this.extractFootballMatches(data);

      // Group all matches by parent and league
      const groupedByParent = {};
      allMatches.forEach(match => {
        const parentName = match.parentName || 'Football';
        const leagueName = match.leagueName;
        
        if (!groupedByParent[parentName]) {
          groupedByParent[parentName] = {
            name: parentName,
            leagues: {},
            totalMatches: 0,
            liveMatches: 0,
            upcomingMatches: 0
          };
        }
        
        if (!groupedByParent[parentName].leagues[leagueName]) {
          groupedByParent[parentName].leagues[leagueName] = {
            name: leagueName,
            matches: [],
            liveEvents: [],
            upcomingEvents: []
          };
        }
        
        groupedByParent[parentName].leagues[leagueName].matches.push(match);
        groupedByParent[parentName].totalMatches++;

        if (match.state === 'STARTED') {
          groupedByParent[parentName].leagues[leagueName].liveEvents.push(match);
          groupedByParent[parentName].liveMatches++;
        } else if (match.state === 'NOT_STARTED') {
          groupedByParent[parentName].leagues[leagueName].upcomingEvents.push(match);
          groupedByParent[parentName].upcomingMatches++;
        }
      });

      return {
        success: true,
        matches: allMatches,
        liveMatches: liveMatches,
        upcomingMatches: upcomingMatches,
        groupedByParent: groupedByParent,
        totalMatches: allMatches.length,
        lastUpdated: new Date().toISOString(),
        source: 'unibet-all-football-api',
        statistics: {
          totalMatches: allMatches.length,
          liveMatches: liveMatches.length,
          upcomingMatches: upcomingMatches.length,
          parentCategories: Object.keys(groupedByParent).length,
          totalLeagues: Object.values(groupedByParent).reduce((sum, parent) => 
            sum + Object.keys(parent.leagues).length, 0)
        }
      };
    } catch (error) {
      console.error('Error fetching all football matches:', error);
      throw error;
    }
  }
}

module.exports = LiveMatchesAPI;
```

### 2. Service Layer (`live-matches-service.js`)

```javascript
const LiveMatchesAPI = require('./live-matches-api');

class LiveMatchesService {
  constructor() {
    this.api = new LiveMatchesAPI();
    this.cache = {
      liveMatches: null,
      allMatches: null,
      lastUpdated: null,
      ttl: 300000 // 5 minutes cache
    };
    this.autoRefreshInterval = null;
  }

  async getLiveMatches() {
    try {
      // Check service cache first
      if (this.cache.liveMatches && this.cache.lastUpdated) {
        const cacheAge = Date.now() - this.cache.lastUpdated;
        if (cacheAge < this.cache.ttl) {
          return {
            ...this.cache.liveMatches,
            cached: true,
            cacheAge: cacheAge
          };
        }
      }

      const data = await this.api.getLiveMatches();
      
      // Update service cache
      this.cache.liveMatches = data;
      this.cache.lastUpdated = Date.now();

      return data;
    } catch (error) {
      console.error('Service error fetching live matches:', error);
      
      // Return cached data if available
      if (this.cache.liveMatches) {
        return {
          ...this.cache.liveMatches,
          success: false,
          error: error.message,
          cached: true
        };
      }

      throw error;
    }
  }

  async getAllFootballMatches() {
    try {
      // Check service cache first
      if (this.cache.allMatches && this.cache.lastUpdated) {
        const cacheAge = Date.now() - this.cache.lastUpdated;
        if (cacheAge < this.cache.ttl) {
          return {
            ...this.cache.allMatches,
            cached: true,
            cacheAge: cacheAge
          };
        }
      }

      const data = await this.api.getAllFootballMatches();
      
      // Update service cache
      this.cache.allMatches = data;
      this.cache.lastUpdated = Date.now();

      return data;
    } catch (error) {
      console.error('Service error fetching all football matches:', error);
      
      // Return cached data if available
      if (this.cache.allMatches) {
        return {
          ...this.cache.allMatches,
          success: false,
          error: error.message,
          cached: true
        };
      }

      throw error;
    }
  }

  startAutoRefresh(intervalMs = 300000) { // 5 minutes default
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval(async () => {
      try {
        await this.getLiveMatches();
        console.log('Auto-refresh: Live matches cache updated');
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, intervalMs);

    console.log(`Auto-refresh started with ${intervalMs}ms interval`);
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('Auto-refresh stopped');
    }
  }

  clearCache() {
    this.cache = {
      liveMatches: null,
      allMatches: null,
      lastUpdated: null,
      ttl: 300000
    };
    console.log('Service cache cleared');
  }
}

module.exports = LiveMatchesService;
```

### 3. Express Controller (`live-matches-controller.js`)

```javascript
const LiveMatchesService = require('./live-matches-service');

class LiveMatchesController {
  constructor() {
    this.service = new LiveMatchesService();
  }

  async getLiveMatches(req, res) {
    try {
      const data = await this.service.getLiveMatches();
      
      res.json({
        success: true,
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch live matches',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async getAllFootballMatches(req, res) {
    try {
      const data = await this.service.getAllFootballMatches();
      
      res.json({
        success: true,
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch all football matches',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async refreshCache(req, res) {
    try {
      this.service.clearCache();
      const data = await this.service.getLiveMatches();
      
      res.json({
        success: true,
        message: 'Cache refreshed successfully',
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh cache',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async startAutoRefresh(req, res) {
    try {
      const interval = parseInt(req.body.interval) || 300000; // 5 minutes default
      this.service.startAutoRefresh(interval);
      
      res.json({
        success: true,
        message: 'Auto-refresh started',
        interval: interval,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Auto-refresh start error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start auto-refresh',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async stopAutoRefresh(req, res) {
    try {
      this.service.stopAutoRefresh();
      
      res.json({
        success: true,
        message: 'Auto-refresh stopped',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Auto-refresh stop error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop auto-refresh',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = LiveMatchesController;
```

### 4. Express Routes (`routes/live-matches.js`)

```javascript
const express = require('express');
const LiveMatchesController = require('../live-matches-controller');

const router = express.Router();
const controller = new LiveMatchesController();

// Get live matches
router.get('/', controller.getLiveMatches.bind(controller));

// Get all football matches (live + upcoming)
router.get('/all', controller.getAllFootballMatches.bind(controller));

// Get specific match by ID
router.get('/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const data = await controller.service.getAllFootballMatches();
    
    const match = data.matches.find(m => m.id === matchId);
    
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
        matchId: matchId
      });
    }

    res.json({
      success: true,
      match: match,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch match',
      message: error.message
    });
  }
});

// Get matches by league
router.get('/league/:leagueName', async (req, res) => {
  try {
    const { leagueName } = req.params;
    const data = await controller.service.getAllFootballMatches();
    
    const leagueMatches = data.matches.filter(m => 
      m.leagueName.toLowerCase().includes(leagueName.toLowerCase())
    );

    res.json({
      success: true,
      league: leagueName,
      matches: leagueMatches,
      totalMatches: leagueMatches.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch league matches',
      message: error.message
    });
  }
});

// Refresh cache manually
router.post('/refresh', controller.refreshCache.bind(controller));

// Start auto-refresh
router.post('/auto-refresh/start', controller.startAutoRefresh.bind(controller));

// Stop auto-refresh
router.post('/auto-refresh/stop', controller.stopAutoRefresh.bind(controller));

module.exports = router;
```

### 5. Integration with Existing Server (`server.js`)

```javascript
const express = require('express');
const cors = require('cors');
const liveMatchesRoutes = require('./routes/live-matches');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/live-matches', liveMatchesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Live Matches API'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Live Matches API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Live matches: http://localhost:${PORT}/api/live-matches`);
});
```

## API Endpoints

### 1. Get Live Matches
```http
GET /api/live-matches
```

**Response:**
```json
{
  "success": true,
  "matches": [
    {
      "id": "1024001723",
      "name": "Manchester United vs Liverpool",
      "start": "2025-01-15T15:30:00Z",
      "state": "STARTED",
      "sport": "FOOTBALL",
      "group": "Premier League",
      "leagueName": "Premier League",
      "parentName": "England",
      "participants": [
        {"name": "Manchester United", "position": "home"},
        {"name": "Liverpool", "position": "away"}
      ],
      "liveData": {
        "score": "2-1",
        "period": "2nd Half",
        "minute": "67"
      }
    }
  ],
  "groupedMatches": {
    "England": {
      "name": "England",
      "leagues": {
        "Premier League": {
          "name": "Premier League",
          "matches": [...]
        }
      },
      "totalMatches": 5
    }
  },
  "totalMatches": 15,
  "totalAllMatches": 45,
  "lastUpdated": "2025-01-15T15:35:00Z",
  "source": "unibet-all-football-api",
  "timestamp": "2025-01-15T15:35:00Z"
}
```

### 2. Get All Football Matches
```http
GET /api/live-matches/all
```

**Response:**
```json
{
  "success": true,
  "matches": [...],
  "liveMatches": [...],
  "upcomingMatches": [...],
  "groupedByParent": {
    "England": {
      "name": "England",
      "leagues": {
        "Premier League": {
          "name": "Premier League",
          "matches": [...],
          "liveEvents": [...],
          "upcomingEvents": [...]
        }
      },
      "totalMatches": 20,
      "liveMatches": 5,
      "upcomingMatches": 15
    }
  },
  "totalMatches": 45,
  "statistics": {
    "totalMatches": 45,
    "liveMatches": 15,
    "upcomingMatches": 30,
    "parentCategories": 3,
    "totalLeagues": 8
  },
  "lastUpdated": "2025-01-15T15:35:00Z",
  "source": "unibet-all-football-api",
  "timestamp": "2025-01-15T15:35:00Z"
}
```

### 3. Get Specific Match
```http
GET /api/live-matches/:matchId
```

### 4. Get Matches by League
```http
GET /api/live-matches/league/:leagueName
```

### 5. Refresh Cache
```http
POST /api/live-matches/refresh
```

### 6. Start Auto-Refresh
```http
POST /api/live-matches/auto-refresh/start
Content-Type: application/json

{
  "interval": 300000
}
```

### 7. Stop Auto-Refresh
```http
POST /api/live-matches/auto-refresh/stop
```

## Usage Examples

### Frontend Integration

```javascript
// Fetch live matches
async function fetchLiveMatches() {
  try {
    const response = await fetch('/api/live-matches');
    const data = await response.json();
    
    if (data.success) {
      displayLiveMatches(data.matches);
    } else {
      console.error('Failed to fetch live matches:', data.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Display matches
function displayLiveMatches(matches) {
  const container = document.getElementById('live-matches');
  
  matches.forEach(match => {
    const matchElement = document.createElement('div');
    matchElement.className = 'match-card';
    matchElement.innerHTML = `
      <h3>${match.name}</h3>
      <p>League: ${match.leagueName}</p>
      <p>Score: ${match.liveData?.score || '0-0'}</p>
      <p>Status: ${match.state}</p>
      <p>Minute: ${match.liveData?.minute || '0'}</p>
    `;
    container.appendChild(matchElement);
  });
}

// Auto-refresh every 30 seconds
setInterval(fetchLiveMatches, 30000);
```

### Node.js Integration

```javascript
const LiveMatchesAPI = require('./live-matches-api');

async function getLiveMatches() {
  const api = new LiveMatchesAPI();
  
  try {
    const data = await api.getLiveMatches();
    console.log(`Found ${data.totalMatches} live matches`);
    
    data.matches.forEach(match => {
      console.log(`${match.name} - ${match.liveData?.score || '0-0'}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

getLiveMatches();
```

## Installation

1. **Install dependencies:**
```bash
npm install express cors
```

2. **Create the files** as shown above

3. **Start the server:**
```bash
node server.js
```

4. **Test the API:**
```bash
curl http://localhost:3000/api/live-matches
```

## Key Features

- ✅ **Real-time data** from Unibet's comprehensive football API
- ✅ **Intelligent caching** with 30-second TTL
- ✅ **Retry logic** with exponential backoff
- ✅ **Error handling** with fallback to cached data
- ✅ **Auto-refresh** capability
- ✅ **Grouped data** by parent category and league
- ✅ **RESTful API** design
- ✅ **CORS enabled** for frontend integration
- ✅ **Health check** endpoint
- ✅ **Comprehensive logging**

This implementation provides everything you need to integrate live football match data into your existing betting website! 🚀
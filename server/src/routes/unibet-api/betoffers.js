import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Betoffers route is working',
    timestamp: new Date().toISOString()
  });
});

// Test external API connectivity endpoint
router.get('/test-external-api/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    console.log(`🧪 [TEST] Testing external API connectivity for event: ${eventId}`);
    
    const testUrl = `${API_BASE_URL}/${eventId}.json`;
    console.log(`🧪 [TEST] Testing URL: ${testUrl}`);
    
    const response = await axios.get(testUrl, {
      headers: API_HEADERS,
      timeout: 10000
    });
    
    res.json({
      success: true,
      message: 'External API is reachable',
      eventId,
      testUrl,
      responseStatus: response.status,
      responseDataKeys: Object.keys(response.data || {}),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`❌ [TEST] External API test failed:`, error.message);
    res.status(500).json({
      success: false,
      message: 'External API test failed',
      error: error.message,
      errorCode: error.code,
      errorStatus: error.response?.status,
      timestamp: new Date().toISOString()
    });
  }
});

// Configuration from unibet-api/config.js (matching working implementation)
const API_BASE_URL = 'https://oc-offering-api.kambicdn.com/offering/v2018/ubau/betoffer/event';
const API_HEADERS = {
  'accept': 'application/json, text/javascript, */*; q=0.01',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'origin': 'https://www.unibet.com.au',
  'pragma': 'no-cache',
  'priority': 'u=1, i',
  'referer': 'https://www.unibet.com.au/',
  'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
};

// GET /api/v2/betoffers/:eventId - Stateless endpoint; fetches on-demand per request
router.get('/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    console.log(`🔍 [BETOFFERS] Fetching bet offers for event: ${eventId}`);
    console.log(`🔍 [BETOFFERS] Request headers:`, req.headers);
    console.log(`🔍 [BETOFFERS] Request method:`, req.method);
    console.log(`🔍 [BETOFFERS] Request URL:`, req.url);

    // Special-case local file for testing id
    if (eventId === '1022853538') {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const testDataPath = path.join(__dirname, '../../../../json-response-betoffer.json');
      const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
      return res.json({
        success: true,
        eventId,
        data: testData,
        timestamp: new Date().toISOString()
      });
    }

    // Special-case for event ID 1024730101 using longest-response.json
    if (eventId === '1024730101') {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const testDataPath = path.join(__dirname, '../../../../longest-response.json');
      const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
      return res.json({
        success: true,
        eventId,
        data: testData.data,
        timestamp: new Date().toISOString()
      });
    }

    // Check cache first
    let cachedData = null;
    try {
      if (global.fixtureOptimizationService?.fixtureCache) {
        cachedData = global.fixtureOptimizationService.fixtureCache.get(`unibet_v2_${eventId}`);
      }
    } catch (_) {}

    try {
      console.log(`🌐 [PRODUCTION DEBUG] Making external API call to: ${API_BASE_URL}/${eventId}.json`);
      console.log(`🌐 [PRODUCTION DEBUG] Headers:`, API_HEADERS);
      
      const response = await axios.get(`${API_BASE_URL}/${eventId}.json?lang=en_AU&market=AU`, {
        headers: API_HEADERS,
        timeout: 12000
      });

      console.log(`✅ Successfully fetched bet offers for event: ${eventId}`);
      console.log(`📊 [PRODUCTION DEBUG] Response status: ${response.status}`);
      console.log(`📊 [PRODUCTION DEBUG] Response data keys:`, Object.keys(response.data || {}));
      
      // Cache for later enrichment during bet placement
      try {
        if (global.fixtureOptimizationService?.fixtureCache) {
          global.fixtureOptimizationService.fixtureCache.set(
            `unibet_v2_${eventId}`,
            { data: response.data, cachedAt: Date.now() },
            120
          );
        }
      } catch (_) {}
      
      // Save response data to file for debugging
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const outputPath = path.join(__dirname, '../../../../current_opened_match.json');
        fs.writeFileSync(outputPath, JSON.stringify({
          eventId,
          timestamp: new Date().toISOString(),
          data: response.data
        }, null, 2));
      } catch (fileError) {
        console.error('Failed to save response to file:', fileError.message);
      }
      
      return res.json({
        success: true,
        eventId,
        data: response.data,
        timestamp: new Date().toISOString(),
        source: 'live'
      });
    } catch (apiError) {
      console.error(`❌ [PRODUCTION DEBUG] External API failed for event ${eventId}:`);
      console.error(`❌ [PRODUCTION DEBUG] Error message:`, apiError.message);
      console.error(`❌ [PRODUCTION DEBUG] Error code:`, apiError.code);
      console.error(`❌ [PRODUCTION DEBUG] Error status:`, apiError.response?.status);
      console.error(`❌ [PRODUCTION DEBUG] Error response:`, apiError.response?.data);
      console.error(`❌ [PRODUCTION DEBUG] Full error:`, apiError);
      
      // If we have cached data, return it instead of failing
      if (cachedData?.data) {
        console.log(`📦 Returning cached data for event: ${eventId}`);
        return res.json({
          success: true,
          eventId,
          data: cachedData.data,
          timestamp: new Date().toISOString(),
          source: 'cache',
          warning: 'Using cached data due to API failure'
        });
      }
      
      // No cache available, return error with more details
      console.error('❌ No cached data available for event:', eventId);
      console.error('❌ [PRODUCTION DEBUG] This might be due to:');
      console.error('❌ [PRODUCTION DEBUG] 1. External API rate limiting');
      console.error('❌ [PRODUCTION DEBUG] 2. Network connectivity issues');
      console.error('❌ [PRODUCTION DEBUG] 3. IP blocking from Unibet API');
      console.error('❌ [PRODUCTION DEBUG] 4. Event ID no longer exists');
      
      res.status(404).json({
        success: false,
        error: 'Match not found',
        message: `No betting offers available for event ${eventId}. This might be due to external API issues or the match no longer being available.`,
        timestamp: new Date().toISOString(),
        debug: {
          externalApiUrl: `${API_BASE_URL}/${eventId}.json`,
          hasCache: !!cachedData,
          environment: process.env.NODE_ENV || 'development'
        }
      });
    }
  } catch (error) {
    console.error('❌ Unexpected error fetching bet offers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
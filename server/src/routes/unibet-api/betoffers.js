import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const router = express.Router();

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
    console.log(`🔍 Fetching bet offers for event: ${eventId}`);

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

    const response = await axios.get(`${API_BASE_URL}/${eventId}.json`, {
      headers: API_HEADERS,
      timeout: 12000
    });

    console.log(`✅ Successfully fetched bet offers for event: ${eventId}`);
    return res.json({
      success: true,
      eventId,
      data: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching bet offers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bet offers',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
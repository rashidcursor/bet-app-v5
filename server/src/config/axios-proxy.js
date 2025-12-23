// server/src/config/axios-proxy.js
// ✅ PROXY REMOVED - Using direct connection
import axios from 'axios';
import https from 'https';
import http from 'http';

// Create axios instance WITHOUT proxy (direct connection)
const axiosInstance = axios.create({
  timeout: 30000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: process.env.NODE_ENV !== 'development',
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 10,
    maxFreeSockets: 5,
  }),
  httpAgent: new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 10,
    maxFreeSockets: 5,
  }),
  headers: {
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
  }
});

console.log('✅ Axios configured for direct connection (no proxy)');
// Request interceptor for logging
axiosInstance.interceptors.request.use(
  (config) => {
    console.log(`🌐 [DIRECT] Request: ${config.method?.toUpperCase()} ${config.url || config.baseURL}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      console.error(`❌ [DIRECT] Connection error: ${error.code} - ${error.message}`);
      if (error.config?.url) {
        console.error(`❌ [DIRECT] Failed URL: ${error.config.url}`);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;

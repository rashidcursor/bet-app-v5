// Proxy Testing Utility
// Tests all proxies to find which ones are working

import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

/**
 * Test a single proxy
 */
async function testProxy(proxy, timeout = 5000) {
  const startTime = Date.now();
  try {
    const httpsAgent = new HttpsProxyAgent(proxy.url);
    
    // Test with a simple IP check service
    const testUrl = 'https://api.ipify.org?format=json';
    
    const response = await axios.get(testUrl, {
      httpsAgent,
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const duration = Date.now() - startTime;
    
    if (response.status === 200 && response.data && response.data.ip) {
      return {
        success: true,
        proxy: proxy.string,
        ip: response.data.ip,
        duration,
        error: null
      };
    }
    
    return {
      success: false,
      proxy: proxy.string,
      ip: null,
      duration,
      error: `Invalid response: ${response.status}`
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      proxy: proxy.string,
      ip: null,
      duration,
      error: error.message || String(error)
    };
  }
}

/**
 * Parse proxy string into object
 */
function parseProxy(proxyString) {
  const parts = proxyString.split(':');
  if (parts.length !== 4) {
    throw new Error(`Invalid proxy format: ${proxyString}`);
  }
  return {
    host: parts[0],
    port: parts[1],
    username: parts[2],
    password: parts[3],
    url: `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`,
    string: proxyString
  };
}

/**
 * Test all proxies and return working ones
 */
export async function testAllProxies(proxyList, options = {}) {
  const {
    timeout = 5000,
    concurrent = 3, // Reduced to 3 to avoid getting stuck
    onProgress = null,
    startIndex = 0, // Allow resuming from a specific index
    maxProxies = null // Limit number of proxies to test
  } = options;

  const totalToTest = maxProxies || proxyList.length;
  const proxiesToTest = proxyList.slice(startIndex, startIndex + totalToTest);
  
  console.log(`🧪 Testing ${proxiesToTest.length} proxies (timeout: ${timeout}ms, concurrent: ${concurrent}, start: ${startIndex})...`);
  
  const proxies = proxiesToTest.map(parseProxy);
  const results = [];
  const working = [];
  const failed = [];
  
  // Test proxies in batches with better error handling
  for (let i = 0; i < proxies.length; i += concurrent) {
    const batch = proxies.slice(i, i + concurrent);
    
    try {
      // Add individual timeout for each batch
      const batchPromises = batch.map(proxy => 
        Promise.race([
          testProxy(proxy, timeout),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Batch timeout')), timeout + 2000)
          )
        ])
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const proxy = batch[index];
        let testResult;
        
        if (result.status === 'fulfilled') {
          testResult = result.value;
        } else {
          // Handle timeout or other errors
          const errorMsg = result.reason?.message || 'Unknown error';
          testResult = {
            success: false,
            proxy: proxy.string,
            ip: null,
            duration: timeout + 2000,
            error: errorMsg.includes('timeout') ? 'Request timeout' : errorMsg
          };
        }
        
        results.push(testResult);
        
        if (testResult.success) {
          working.push(testResult);
          console.log(`✅ [${startIndex + i + index + 1}/${proxyList.length}] ${proxy.host}:${proxy.port} - Working (IP: ${testResult.ip}, ${testResult.duration}ms)`);
        } else {
          failed.push(testResult);
          console.log(`❌ [${startIndex + i + index + 1}/${proxyList.length}] ${proxy.host}:${proxy.port} - Failed: ${testResult.error}`);
        }
        
        if (onProgress) {
          onProgress({
            total: proxyList.length,
            tested: startIndex + results.length,
            working: working.length,
            failed: failed.length,
            current: proxy.string
          });
        }
      });
    } catch (error) {
      // If entire batch fails, mark all as failed
      console.error(`❌ Batch error at index ${i}:`, error.message);
      batch.forEach((proxy, index) => {
        const testResult = {
          success: false,
          proxy: proxy.string,
          ip: null,
          duration: 0,
          error: `Batch error: ${error.message}`
        };
        results.push(testResult);
        failed.push(testResult);
        console.log(`❌ [${startIndex + i + index + 1}/${proxyList.length}] ${proxy.host}:${proxy.port} - Failed: ${testResult.error}`);
      });
    }
    
    // Longer delay between batches to avoid overwhelming
    if (i + concurrent < proxies.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1 second
    }
  }
  
  return {
    total: proxyList.length,
    working: working.length,
    failed: failed.length,
    workingProxies: working.map(r => r.proxy),
    failedProxies: failed.map(r => r.proxy),
    results: results,
    summary: {
      working: working.map(r => ({
        proxy: r.proxy,
        ip: r.ip,
        duration: r.duration
      })),
      failed: failed.map(r => ({
        proxy: r.proxy,
        error: r.error,
        duration: r.duration
      }))
    }
  };
}

/**
 * Test proxies and generate code snippet with only working ones
 */
export async function testAndGenerateCode(proxyList, options = {}) {
  const testResults = await testAllProxies(proxyList, options);
  
  const codeSnippet = `// Working Proxies (${testResults.working} out of ${testResults.total} tested)
const WORKING_PROXIES = [
${testResults.workingProxies.map(p => `  '${p}'`).join(',\n')}
];`;
  
  return {
    ...testResults,
    codeSnippet
  };
}

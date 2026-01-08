// Proxy Rotation Utility
// Automatically rotates through a list of proxies on errors to change IP addresses

import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Get proxy list - hardcoded in codebase (no env dependency)
 * Format: IP:PORT:USERNAME:PASSWORD
 * 
 * After testing, this list will be updated with only working proxies
 */
function getProxyList() {
  // ✅ Working proxies only (109 out of 166 tested)
  // Excluded: 57 failed proxies (407 auth errors, 402 payment errors, timeouts)
  // No env variables needed - all hardcoded in codebase
  const proxyList = [
    // Group 1: yeyccztb credentials (12 working out of 18)
    '130.180.237.184:7127:yeyccztb:r7oa3qwnkid7',
    '192.46.188.77:5736:yeyccztb:r7oa3qwnkid7',
    '45.58.244.6:6419:yeyccztb:r7oa3qwnkid7',
    '138.226.70.209:7899:yeyccztb:r7oa3qwnkid7',
    '9.142.14.207:6863:yeyccztb:r7oa3qwnkid7',
    '9.142.41.66:6236:yeyccztb:r7oa3qwnkid7',
    '63.246.153.33:5702:yeyccztb:r7oa3qwnkid7',
    '193.160.82.190:6162:yeyccztb:r7oa3qwnkid7',
    '130.180.231.17:8159:yeyccztb:r7oa3qwnkid7',
    '130.180.235.54:5774:yeyccztb:r7oa3qwnkid7',
    '46.203.91.18:5516:yeyccztb:r7oa3qwnkid7',
    '9.142.41.166:6336:yeyccztb:r7oa3qwnkid7',
    
    // Group 3: henduccz credentials (18 working out of 19)
    '104.252.62.196:5567:henduccz:r41hobvgi2cq',
    '104.252.81.183:6054:henduccz:r41hobvgi2cq',
    '104.252.81.81:5952:henduccz:r41hobvgi2cq',
    '104.252.62.171:5542:henduccz:r41hobvgi2cq',
    '104.252.81.26:5897:henduccz:r41hobvgi2cq',
    '104.252.62.241:5612:henduccz:r41hobvgi2cq',
    '104.252.81.251:6122:henduccz:r41hobvgi2cq',
    '104.252.62.125:5496:henduccz:r41hobvgi2cq',
    '104.252.62.151:5522:henduccz:r41hobvgi2cq',
    '104.252.81.52:5923:henduccz:r41hobvgi2cq',
    '104.252.97.244:6114:henduccz:r41hobvgi2cq',
    '104.252.97.102:5972:henduccz:r41hobvgi2cq',
    '104.252.62.195:5566:henduccz:r41hobvgi2cq',
    '104.252.75.233:5603:henduccz:r41hobvgi2cq',
    '104.252.75.119:5489:henduccz:r41hobvgi2cq',
    '216.98.255.23:6645:henduccz:r41hobvgi2cq',
    '208.66.76.20:5944:henduccz:r41hobvgi2cq',
    '9.142.198.130:5797:henduccz:r41hobvgi2cq',
    '192.46.200.184:5854:henduccz:r41hobvgi2cq',
    
    // Group 4: klcnllsb credentials (79 working out of 90)
    '138.128.159.108:6599:klcnllsb:pbtoifsu32lf',
    '92.112.155.130:7254:klcnllsb:pbtoifsu32lf',
    '45.39.5.69:6507:klcnllsb:pbtoifsu32lf',
    '104.239.13.132:6761:klcnllsb:pbtoifsu32lf',
    '2.57.31.11:6587:klcnllsb:pbtoifsu32lf',
    '104.222.187.248:6372:klcnllsb:pbtoifsu32lf',
    '148.135.179.217:6276:klcnllsb:pbtoifsu32lf',
    '140.99.193.9:7387:klcnllsb:pbtoifsu32lf',
    '45.39.125.125:6533:klcnllsb:pbtoifsu32lf',
    '194.113.119.146:6820:klcnllsb:pbtoifsu32lf',
    '154.36.110.18:6672:klcnllsb:pbtoifsu32lf',
    '138.128.148.244:6804:klcnllsb:pbtoifsu32lf',
    '45.151.161.144:6235:klcnllsb:pbtoifsu32lf',
    '64.137.83.104:6044:klcnllsb:pbtoifsu32lf',
    '64.137.59.219:6812:klcnllsb:pbtoifsu32lf',
    '145.223.45.122:7156:klcnllsb:pbtoifsu32lf',
    '185.171.254.61:6093:klcnllsb:pbtoifsu32lf',
    '31.58.32.186:6765:klcnllsb:pbtoifsu32lf',
    '31.58.18.33:6302:klcnllsb:pbtoifsu32lf',
    '107.181.141.125:6522:klcnllsb:pbtoifsu32lf',
    '45.43.95.15:6764:klcnllsb:pbtoifsu32lf',
    '155.254.38.10:5686:klcnllsb:pbtoifsu32lf',
    '107.181.132.200:6178:klcnllsb:pbtoifsu32lf',
    '204.217.245.11:6602:klcnllsb:pbtoifsu32lf',
    '155.254.38.139:5815:klcnllsb:pbtoifsu32lf',
    '45.43.87.25:7774:klcnllsb:pbtoifsu32lf',
    '155.254.39.52:6010:klcnllsb:pbtoifsu32lf',
    '45.43.64.148:6406:klcnllsb:pbtoifsu32lf',
    '45.43.83.201:6484:klcnllsb:pbtoifsu32lf',
    '155.254.61.10:6260:klcnllsb:pbtoifsu32lf',
    '45.38.107.245:6162:klcnllsb:pbtoifsu32lf',
    '45.43.95.118:6867:klcnllsb:pbtoifsu32lf',
    '198.105.119.202:5451:klcnllsb:pbtoifsu32lf',
    '45.43.87.70:7819:klcnllsb:pbtoifsu32lf',
    '104.143.226.245:5848:klcnllsb:pbtoifsu32lf',
    '145.223.46.82:5632:klcnllsb:pbtoifsu32lf',
    '45.41.171.114:6150:klcnllsb:pbtoifsu32lf',
    '198.46.137.37:6241:klcnllsb:pbtoifsu32lf',
    '145.223.44.81:5764:klcnllsb:pbtoifsu32lf',
    '91.198.95.177:5699:klcnllsb:pbtoifsu32lf',
    '145.223.58.249:6518:klcnllsb:pbtoifsu32lf',
    '179.61.166.93:6516:klcnllsb:pbtoifsu32lf',
    '45.41.177.120:5770:klcnllsb:pbtoifsu32lf',
    '104.233.12.89:6640:klcnllsb:pbtoifsu32lf',
    '184.174.58.93:5655:klcnllsb:pbtoifsu32lf',
    '147.124.198.91:5950:klcnllsb:pbtoifsu32lf',
    '23.95.244.92:6045:klcnllsb:pbtoifsu32lf',
    '107.174.194.174:5616:klcnllsb:pbtoifsu32lf',
    '191.101.25.96:6493:klcnllsb:pbtoifsu32lf',
    '64.64.110.99:6622:klcnllsb:pbtoifsu32lf',
    '136.0.105.126:6136:klcnllsb:pbtoifsu32lf',
    '46.202.227.15:6009:klcnllsb:pbtoifsu32lf',
    '173.0.9.138:5721:klcnllsb:pbtoifsu32lf',
    '45.43.167.188:6370:klcnllsb:pbtoifsu32lf',
    '185.202.175.252:7040:klcnllsb:pbtoifsu32lf',
    '46.202.67.216:6212:klcnllsb:pbtoifsu32lf',
    '45.43.167.172:6354:klcnllsb:pbtoifsu32lf',
    '104.238.37.77:6634:klcnllsb:pbtoifsu32lf',
    '45.92.77.232:6254:klcnllsb:pbtoifsu32lf',
    '142.111.44.105:5817:klcnllsb:pbtoifsu32lf',
    '104.239.81.217:6752:klcnllsb:pbtoifsu32lf',
    '67.227.113.98:5638:klcnllsb:pbtoifsu32lf',
    '192.210.132.89:6059:klcnllsb:pbtoifsu32lf',
    '184.174.44.56:6482:klcnllsb:pbtoifsu32lf',
    '107.172.163.224:6740:klcnllsb:pbtoifsu32lf',
    '192.177.86.242:5243:klcnllsb:pbtoifsu32lf',
    '107.172.163.144:6660:klcnllsb:pbtoifsu32lf',
    '166.88.58.15:5740:klcnllsb:pbtoifsu32lf',
    '173.211.69.135:6728:klcnllsb:pbtoifsu32lf',
    '91.217.72.17:6746:klcnllsb:pbtoifsu32lf',
    '161.123.33.205:6228:klcnllsb:pbtoifsu32lf',
    '166.88.169.140:6747:klcnllsb:pbtoifsu32lf',
    '82.23.222.65:6371:klcnllsb:pbtoifsu32lf',
    '184.174.25.107:5996:klcnllsb:pbtoifsu32lf',
    '198.37.121.253:6673:klcnllsb:pbtoifsu32lf',
    '198.46.137.198:6402:klcnllsb:pbtoifsu32lf',
    '81.21.234.11:6400:klcnllsb:pbtoifsu32lf',
    '45.43.64.7:6265:klcnllsb:pbtoifsu32lf',
  ];

  // ✅ No env dependency - all proxies hardcoded in codebase
  console.log(`📋 [ProxyRotator] Using ${proxyList.length} working proxies (excluded 57 failed)`);
  
  return proxyList;
}

/**
 * Parse a proxy string into components
 * Format: IP:PORT:USERNAME:PASSWORD
 */
function parseProxy(proxyString) {
  const parts = proxyString.split(':');
  if (parts.length !== 4) {
    throw new Error(`Invalid proxy format: ${proxyString}. Expected IP:PORT:USERNAME:PASSWORD`);
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
 * Proxy Rotator Class
 * Manages proxy rotation and automatic failover
 */
class ProxyRotator {
  constructor() {
    this.proxies = getProxyList().map(parseProxy);
    this.currentIndex = 0;
    this.failedProxies = new Set(); // Track failed proxies temporarily
    this.proxyStats = new Map(); // Track success/failure stats per proxy
    this.maxRetriesPerProxy = 2; // Max retries before marking as failed
    this.failedProxyTimeout = 5 * 60 * 1000; // 5 minutes before retrying failed proxy
  }

  /**
   * Get the next available proxy (round-robin with failure tracking)
   */
  getNextProxy() {
    const startIndex = this.currentIndex;
    let attempts = 0;
    const maxAttempts = this.proxies.length;

    while (attempts < maxAttempts) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

      // Check if proxy is temporarily failed
      if (this.failedProxies.has(proxy.string)) {
        const failedTime = this.proxyStats.get(proxy.string)?.lastFailed || 0;
        const timeSinceFailure = Date.now() - failedTime;
        
        if (timeSinceFailure < this.failedProxyTimeout) {
          // Still in timeout, skip this proxy
          attempts++;
          continue;
        } else {
          // Timeout expired, retry this proxy
          this.failedProxies.delete(proxy.string);
          console.log(`🔄 [ProxyRotator] Retrying previously failed proxy: ${proxy.host}:${proxy.port}`);
        }
      }

      return proxy;
    }

    // All proxies are failed, reset and try again
    console.warn(`⚠️ [ProxyRotator] All proxies failed, resetting and trying again...`);
    this.failedProxies.clear();
    this.currentIndex = 0;
    return this.proxies[0];
  }

  /**
   * Mark a proxy as failed
   */
  markProxyFailed(proxyString) {
    this.failedProxies.add(proxyString);
    const stats = this.proxyStats.get(proxyString) || { failures: 0, successes: 0, lastFailed: 0 };
    stats.failures++;
    stats.lastFailed = Date.now();
    this.proxyStats.set(proxyString, stats);
    console.warn(`❌ [ProxyRotator] Marked proxy as failed: ${proxyString.split(':')[0]}:${proxyString.split(':')[1]} (Failures: ${stats.failures})`);
  }

  /**
   * Mark a proxy as successful
   */
  markProxySuccess(proxyString) {
    const stats = this.proxyStats.get(proxyString) || { failures: 0, successes: 0, lastFailed: 0 };
    stats.successes++;
    this.proxyStats.set(proxyString, stats);
    
    // Remove from failed list if it was there
    if (this.failedProxies.has(proxyString)) {
      this.failedProxies.delete(proxyString);
      console.log(`✅ [ProxyRotator] Proxy recovered: ${proxyString.split(':')[0]}:${proxyString.split(':')[1]}`);
    }
  }

  /**
   * Create an HttpsProxyAgent for a proxy
   */
  createProxyAgent(proxy) {
    return new HttpsProxyAgent(proxy.url);
  }

  /**
   * Execute a function with automatic proxy rotation on errors
   * @param {Function} fn - Function that takes a proxy agent and returns a promise
   * @param {Object} options - Options for retry behavior
   * @returns {Promise} - Result of the function
   */
  async executeWithRotation(fn, options = {}) {
    const {
      maxRetries = this.proxies.length, // Try all proxies before giving up
      retryDelay = 1000, // 1 second delay between retries
      onRetry = null, // Callback on each retry
    } = options;

    let lastError = null;
    let attempts = 0;

    while (attempts < maxRetries) {
      const proxy = this.getNextProxy();
      attempts++;

      try {
        const agent = this.createProxyAgent(proxy);
        console.log(`🔄 [ProxyRotator] Attempt ${attempts}/${maxRetries} using proxy: ${proxy.host}:${proxy.port}`);
        
        const result = await fn(agent, proxy);
        
        // Success!
        this.markProxySuccess(proxy.string);
        console.log(`✅ [ProxyRotator] Success with proxy: ${proxy.host}:${proxy.port}`);
        return result;
      } catch (error) {
        lastError = error;
        this.markProxyFailed(proxy.string);
        
        const errorMsg = error.message || String(error);
        console.error(`❌ [ProxyRotator] Proxy ${proxy.host}:${proxy.port} failed: ${errorMsg}`);
        
        if (onRetry) {
          onRetry(attempts, maxRetries, proxy, error);
        }

        // Wait before trying next proxy (except on last attempt)
        if (attempts < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All proxies failed
    console.error(`❌ [ProxyRotator] All ${attempts} proxy attempts failed`);
    throw lastError || new Error('All proxy attempts failed');
  }

  /**
   * Get statistics about proxy usage
   */
  getStats() {
    const total = this.proxies.length;
    const failed = this.failedProxies.size;
    const available = total - failed;
    
    return {
      total,
      available,
      failed,
      currentIndex: this.currentIndex,
      proxyDetails: this.proxies.map(proxy => {
        const stats = this.proxyStats.get(proxy.string) || { failures: 0, successes: 0 };
        return {
          proxy: `${proxy.host}:${proxy.port}`,
          successes: stats.successes,
          failures: stats.failures,
          isFailed: this.failedProxies.has(proxy.string),
        };
      }),
    };
  }

  /**
   * Reset all failed proxies (force retry)
   */
  reset() {
    this.failedProxies.clear();
    this.currentIndex = 0;
    console.log(`🔄 [ProxyRotator] Reset - all proxies available again`);
  }
}

// Export singleton instance
const proxyRotator = new ProxyRotator();
export default proxyRotator;

// Export class for custom instances
export { ProxyRotator };

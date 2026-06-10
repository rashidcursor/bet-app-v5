// Proxy Rotation Utility
// Automatically rotates through a list of proxies on errors to change IP addresses

import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

/**
 * Get proxy list - hardcoded in codebase (no env dependency)
 * Format: IP:PORT:USERNAME:PASSWORD
 * 
 * After testing, this list will be updated with only working proxies
 */
function getProxyList() {
  // bidrhyuk — 10 verified working proxies (2026-06-10)
  // Round-robin: each request uses next proxy; full cycle every 10 requests
  const proxyList = [
    '38.154.203.95:5863:bidrhyuk:wrqv84faw7ut',
    '198.105.121.200:6462:bidrhyuk:wrqv84faw7ut',
    '64.137.96.74:6641:bidrhyuk:wrqv84faw7ut',
    '209.127.138.10:5784:bidrhyuk:wrqv84faw7ut',
    '38.154.185.97:6370:bidrhyuk:wrqv84faw7ut',
    '84.247.60.125:6095:bidrhyuk:wrqv84faw7ut',
    '142.111.67.146:5611:bidrhyuk:wrqv84faw7ut',
    '191.96.254.138:6185:bidrhyuk:wrqv84faw7ut',
    '31.58.9.4:6077:bidrhyuk:wrqv84faw7ut',
    '104.239.107.47:5699:bidrhyuk:wrqv84faw7ut',
  ];

  console.log(`📋 [ProxyRotator] Using ${proxyList.length} proxies (round-robin cycle)`);
  
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
   * Fetch a URL via rotating proxy — each call uses the next proxy (round-robin).
   * Retries with a different proxy only on network/server errors, not on 404/410.
   */
  async fetchUrl(url, options = {}) {
    const {
      headers = {},
      timeout = 5000,
      maxRetries = this.proxies.length,
      nonRetryableStatuses = [404, 410],
      label = '',
    } = options;

    try {
      return await this.executeWithRotation(
        async (httpsAgent, proxy) => {
          const response = await axios.get(url, {
            headers,
            httpsAgent,
            httpAgent: httpsAgent,
            timeout,
            validateStatus: () => true,
          });

          if (response.status === 200) {
            return {
              status: 200,
              data: response.data,
              proxy: `${proxy.host}:${proxy.port}`,
            };
          }

          if (nonRetryableStatuses.includes(response.status)) {
            console.log(`📋 [ProxyRotator]${label ? ` [${label}]` : ''} API returned ${response.status} via ${proxy.host}:${proxy.port} (no retry)`);
            return {
              status: response.status,
              data: response.data ?? null,
              proxy: `${proxy.host}:${proxy.port}`,
            };
          }

          throw new Error(`Request returned ${response.status}`);
        },
        {
          maxRetries,
          retryDelay: 500,
          onRetry: (attempt, max, proxy, error) => {
            console.warn(`⚠️ [ProxyRotator]${label ? ` [${label}]` : ''} ${proxy.host}:${proxy.port} failed (${attempt}/${max}): ${error.message}`);
          },
        }
      );
    } catch (error) {
      console.error(`❌ [ProxyRotator]${label ? ` [${label}]` : ''} All proxy attempts failed: ${error.message}`);
      return { status: 0, data: null, proxy: null, error: error.message };
    }
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

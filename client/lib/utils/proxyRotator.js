// Proxy Rotation Utility — fallback only; used proxy moves to end of queue

import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

function getProxyList() {
  // bqmtydsx — 10 verified working proxies (2026-06-11)
  const proxyList = [
    '38.154.203.95:5863:bqmtydsx:8rlr4ioc4s26',
    '198.105.121.200:6462:bqmtydsx:8rlr4ioc4s26',
    '64.137.96.74:6641:bqmtydsx:8rlr4ioc4s26',
    '209.127.138.10:5784:bqmtydsx:8rlr4ioc4s26',
    '38.154.185.97:6370:bqmtydsx:8rlr4ioc4s26',
    '84.247.60.125:6095:bqmtydsx:8rlr4ioc4s26',
    '142.111.67.146:5611:bqmtydsx:8rlr4ioc4s26',
    '191.96.254.138:6185:bqmtydsx:8rlr4ioc4s26',
    '31.58.9.4:6077:bqmtydsx:8rlr4ioc4s26',
    '104.239.107.47:5699:bqmtydsx:8rlr4ioc4s26',
  ];

  console.log(`📋 [ProxyRotator] ${proxyList.length} proxies in fallback queue`);
  return proxyList;
}

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
    string: proxyString,
  };
}

class ProxyRotator {
  constructor() {
    this.proxies = getProxyList().map(parseProxy);
    this.failedProxies = new Set();
    this.proxyStats = new Map();
    this.failedProxyTimeout = 5 * 60 * 1000;
  }

  /** First available proxy at front of queue (skip temporarily failed) */
  getNextProxy() {
    for (let i = 0; i < this.proxies.length; i++) {
      const proxy = this.proxies[i];

      if (this.failedProxies.has(proxy.string)) {
        const failedTime = this.proxyStats.get(proxy.string)?.lastFailed || 0;
        if (Date.now() - failedTime < this.failedProxyTimeout) {
          continue;
        }
        this.failedProxies.delete(proxy.string);
        console.log(`🔄 [ProxyRotator] Retrying previously failed proxy: ${proxy.host}:${proxy.port}`);
      }

      return proxy;
    }

    console.warn(`⚠️ [ProxyRotator] All proxies failed, resetting and trying again...`);
    this.failedProxies.clear();
    return this.proxies[0];
  }

  /** After successful use, move proxy to end of queue */
  rotateToBack(proxyString) {
    const idx = this.proxies.findIndex((p) => p.string === proxyString);
    if (idx === -1) return;
    const [proxy] = this.proxies.splice(idx, 1);
    this.proxies.push(proxy);
    console.log(`🔁 [ProxyRotator] Moved to queue end: ${proxy.host}:${proxy.port}`);
  }

  markProxyFailed(proxyString) {
    this.failedProxies.add(proxyString);
    const stats = this.proxyStats.get(proxyString) || { failures: 0, successes: 0, lastFailed: 0 };
    stats.failures++;
    stats.lastFailed = Date.now();
    this.proxyStats.set(proxyString, stats);
    console.warn(`❌ [ProxyRotator] Marked proxy as failed: ${proxyString.split(':')[0]}:${proxyString.split(':')[1]} (Failures: ${stats.failures})`);
  }

  markProxySuccess(proxyString) {
    const stats = this.proxyStats.get(proxyString) || { failures: 0, successes: 0, lastFailed: 0 };
    stats.successes++;
    this.proxyStats.set(proxyString, stats);
    if (this.failedProxies.has(proxyString)) {
      this.failedProxies.delete(proxyString);
    }
    this.rotateToBack(proxyString);
  }

  createProxyAgent(proxy) {
    return new HttpsProxyAgent(proxy.url);
  }

  async executeWithRotation(fn, options = {}) {
    const {
      maxRetries = this.proxies.length,
      retryDelay = 500,
      onRetry = null,
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

        if (attempts < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    console.error(`❌ [ProxyRotator] All ${attempts} proxy attempts failed`);
    throw lastError || new Error('All proxy attempts failed');
  }

  /** Proxy-only fetch (fallback path) */
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
              source: 'proxy',
            };
          }

          if (nonRetryableStatuses.includes(response.status)) {
            console.log(`📋 [ProxyRotator]${label ? ` [${label}]` : ''} API returned ${response.status} via ${proxy.host}:${proxy.port} (no retry)`);
            return {
              status: response.status,
              data: response.data ?? null,
              proxy: `${proxy.host}:${proxy.port}`,
              source: 'proxy',
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
      return { status: 0, data: null, proxy: null, source: 'proxy', error: error.message };
    }
  }

  /**
   * Direct first; proxy queue fallback only when direct fails.
   */
  async fetchDirectOrProxy(url, options = {}) {
    const {
      headers = {},
      timeout = 5000,
      nonRetryableStatuses = [404, 410],
      label = '',
    } = options;

    try {
      console.log(`🔍 [DIRECT]${label ? ` [${label}]` : ''} Trying direct connection...`);
      const response = await axios.get(url, {
        headers,
        timeout,
        validateStatus: () => true,
      });

      if (response.status === 200) {
        console.log(`✅ [DIRECT]${label ? ` [${label}]` : ''} Success`);
        return {
          status: 200,
          data: response.data,
          proxy: null,
          source: 'direct',
        };
      }

      if (nonRetryableStatuses.includes(response.status)) {
        console.log(`📋 [DIRECT]${label ? ` [${label}]` : ''} API returned ${response.status}`);
        return {
          status: response.status,
          data: response.data ?? null,
          proxy: null,
          source: 'direct',
        };
      }

      console.warn(`⚠️ [DIRECT]${label ? ` [${label}]` : ''} Returned ${response.status}, trying proxy fallback...`);
    } catch (error) {
      console.warn(`⚠️ [DIRECT]${label ? ` [${label}]` : ''} Failed (${error.message}), trying proxy fallback...`);
    }

    return this.fetchUrl(url, { headers, timeout, nonRetryableStatuses, label });
  }

  getStats() {
    return {
      total: this.proxies.length,
      queue: this.proxies.map((p) => `${p.host}:${p.port}`),
      failed: this.failedProxies.size,
      proxyDetails: this.proxies.map((proxy) => {
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

  reset() {
    this.failedProxies.clear();
    console.log(`🔄 [ProxyRotator] Reset - all proxies available again`);
  }
}

const proxyRotator = new ProxyRotator();
export default proxyRotator;
export { ProxyRotator };

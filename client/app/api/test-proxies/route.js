// API Route to test all proxies
// GET /api/test-proxies?timeout=5000&concurrent=5
import { NextResponse } from 'next/server';
import { testAllProxies } from '@/lib/utils/proxyTester.js';

// Complete proxy list (all proxies from user - including new klcnllsb group)
const ALL_PROXIES = [
  // Group 1: yeyccztb credentials
  '46.203.47.151:5650:yeyccztb:r7oa3qwnkid7',
  '46.203.161.85:5582:yeyccztb:r7oa3qwnkid7',
  '130.180.237.184:7127:yeyccztb:r7oa3qwnkid7',
  '192.46.188.77:5736:yeyccztb:r7oa3qwnkid7',
  '45.58.244.6:6419:yeyccztb:r7oa3qwnkid7',
  '45.248.55.32:6618:yeyccztb:r7oa3qwnkid7',
  '138.226.70.209:7899:yeyccztb:r7oa3qwnkid7',
  '9.142.14.207:6863:yeyccztb:r7oa3qwnkid7',
  '9.142.41.66:6236:yeyccztb:r7oa3qwnkid7',
  '63.246.153.33:5702:yeyccztb:r7oa3qwnkid7',
  '45.248.55.49:6635:yeyccztb:r7oa3qwnkid7',
  '193.160.82.190:6162:yeyccztb:r7oa3qwnkid7',
  '72.1.154.250:8141:yeyccztb:r7oa3qwnkid7',
  '130.180.231.17:8159:yeyccztb:r7oa3qwnkid7',
  '130.180.235.54:5774:yeyccztb:r7oa3qwnkid7',
  '46.203.91.18:5516:yeyccztb:r7oa3qwnkid7',
  '9.142.41.166:6336:yeyccztb:r7oa3qwnkid7',
  '46.203.43.227:6214:yeyccztb:r7oa3qwnkid7',
  
  // Group 2: xzskxfzx credentials
  '104.252.62.178:5549:xzskxfzx:t3xvzuubsk2d',
  '104.252.97.28:5898:xzskxfzx:t3xvzuubsk2d',
  '104.252.75.179:5549:xzskxfzx:t3xvzuubsk2d',
  '104.252.62.172:5543:xzskxfzx:t3xvzuubsk2d',
  '104.252.62.60:5431:xzskxfzx:t3xvzuubsk2d',
  '195.40.142.176:5396:xzskxfzx:t3xvzuubsk2d',
  '195.40.132.222:6443:xzskxfzx:t3xvzuubsk2d',
  '195.40.143.174:5395:xzskxfzx:t3xvzuubsk2d',
  '195.40.143.176:5397:xzskxfzx:t3xvzuubsk2d',
  '195.40.128.62:6782:xzskxfzx:t3xvzuubsk2d',
  '104.252.75.23:5393:xzskxfzx:t3xvzuubsk2d',
  '195.40.137.23:5744:xzskxfzx:t3xvzuubsk2d',
  '195.40.142.192:5412:xzskxfzx:t3xvzuubsk2d',
  '195.40.129.174:6895:xzskxfzx:t3xvzuubsk2d',
  '195.40.142.203:5423:xzskxfzx:t3xvzuubsk2d',
  '195.40.129.254:6975:xzskxfzx:t3xvzuubsk2d',
  '195.40.142.87:5307:xzskxfzx:t3xvzuubsk2d',
  '195.40.132.31:6252:xzskxfzx:t3xvzuubsk2d',
  '104.252.62.111:5482:xzskxfzx:t3xvzuubsk2d',
  '195.40.138.109:5829:xzskxfzx:t3xvzuubsk2d',
  
  // Group 3: henduccz credentials
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
  '9.142.211.177:5342:henduccz:r41hobvgi2cq',
  '9.142.198.130:5797:henduccz:r41hobvgi2cq',
  '192.46.200.184:5854:henduccz:r41hobvgi2cq',
  
  // Group 4: klcnllsb credentials (NEW - 90 proxies)
  '81.21.233.186:5892:klcnllsb:pbtoifsu32lf',
  '138.128.159.108:6599:klcnllsb:pbtoifsu32lf',
  '81.21.233.241:5947:klcnllsb:pbtoifsu32lf',
  '85.198.41.93:6019:klcnllsb:pbtoifsu32lf',
  '92.112.155.130:7254:klcnllsb:pbtoifsu32lf',
  '45.39.5.69:6507:klcnllsb:pbtoifsu32lf',
  '209.99.135.193:6824:klcnllsb:pbtoifsu32lf',
  '104.239.13.132:6761:klcnllsb:pbtoifsu32lf',
  '2.57.31.11:6587:klcnllsb:pbtoifsu32lf',
  '104.222.187.248:6372:klcnllsb:pbtoifsu32lf',
  '148.135.179.217:6276:klcnllsb:pbtoifsu32lf',
  '89.213.163.242:6617:klcnllsb:pbtoifsu32lf',
  '140.99.193.9:7387:klcnllsb:pbtoifsu32lf',
  '45.39.125.125:6533:klcnllsb:pbtoifsu32lf',
  '194.113.119.146:6820:klcnllsb:pbtoifsu32lf',
  '154.36.110.18:6672:klcnllsb:pbtoifsu32lf',
  '138.128.148.244:6804:klcnllsb:pbtoifsu32lf',
  '31.58.24.121:6192:klcnllsb:pbtoifsu32lf',
  '45.151.161.144:6235:klcnllsb:pbtoifsu32lf',
  '64.137.83.104:6044:klcnllsb:pbtoifsu32lf',
  '217.198.177.103:5619:klcnllsb:pbtoifsu32lf',
  '217.198.177.129:5645:klcnllsb:pbtoifsu32lf',
  '104.239.23.66:5827:klcnllsb:pbtoifsu32lf',
  '64.137.59.219:6812:klcnllsb:pbtoifsu32lf',
  '45.14.83.119:8097:klcnllsb:pbtoifsu32lf',
  '145.223.45.122:7156:klcnllsb:pbtoifsu32lf',
  '166.0.7.50:5511:klcnllsb:pbtoifsu32lf',
  '23.109.232.79:5999:klcnllsb:pbtoifsu32lf',
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
  '45.39.50.222:6640:klcnllsb:pbtoifsu32lf',
  '104.143.226.245:5848:klcnllsb:pbtoifsu32lf',
  '145.223.46.82:5632:klcnllsb:pbtoifsu32lf',
  '38.170.190.59:9410:klcnllsb:pbtoifsu32lf',
  '45.41.171.114:6150:klcnllsb:pbtoifsu32lf',
  '198.46.137.37:6241:klcnllsb:pbtoifsu32lf',
  '145.223.44.81:5764:klcnllsb:pbtoifsu32lf',
  '91.198.95.177:5699:klcnllsb:pbtoifsu32lf',
  '38.170.176.184:5579:klcnllsb:pbtoifsu32lf',
  '145.223.58.249:6518:klcnllsb:pbtoifsu32lf',
  '179.61.166.93:6516:klcnllsb:pbtoifsu32lf',
  '45.41.177.120:5770:klcnllsb:pbtoifsu32lf',
  '23.27.91.255:6332:klcnllsb:pbtoifsu32lf',
  '104.233.12.89:6640:klcnllsb:pbtoifsu32lf',
  '184.174.58.93:5655:klcnllsb:pbtoifsu32lf',
  '209.127.143.182:8281:klcnllsb:pbtoifsu32lf',
  '147.124.198.91:5950:klcnllsb:pbtoifsu32lf',
  '23.95.244.92:6045:klcnllsb:pbtoifsu32lf',
  '107.174.194.174:5616:klcnllsb:pbtoifsu32lf',
  '154.6.121.53:6020:klcnllsb:pbtoifsu32lf',
  '38.154.204.163:8204:klcnllsb:pbtoifsu32lf',
  '191.101.25.96:6493:klcnllsb:pbtoifsu32lf',
  '31.59.13.168:6438:klcnllsb:pbtoifsu32lf',
  '191.96.254.103:6150:klcnllsb:pbtoifsu32lf',
  '64.64.110.99:6622:klcnllsb:pbtoifsu32lf',
  '185.216.106.139:6216:klcnllsb:pbtoifsu32lf',
  '136.0.105.126:6136:klcnllsb:pbtoifsu32lf',
  '142.111.113.40:6401:klcnllsb:pbtoifsu32lf',
  '46.202.227.15:6009:klcnllsb:pbtoifsu32lf',
  '38.154.194.144:9557:klcnllsb:pbtoifsu32lf',
  '173.0.9.138:5721:klcnllsb:pbtoifsu32lf',
  '45.43.167.188:6370:klcnllsb:pbtoifsu32lf',
  '38.154.194.103:9516:klcnllsb:pbtoifsu32lf',
  '185.202.175.252:7040:klcnllsb:pbtoifsu32lf',
  '104.239.105.74:6604:klcnllsb:pbtoifsu32lf',
  '46.202.67.216:6212:klcnllsb:pbtoifsu32lf',
  '45.43.167.172:6354:klcnllsb:pbtoifsu32lf',
  '104.238.37.77:6634:klcnllsb:pbtoifsu32lf',
  '23.236.222.197:7228:klcnllsb:pbtoifsu32lf',
  '45.92.77.232:6254:klcnllsb:pbtoifsu32lf',
  '142.111.44.105:5817:klcnllsb:pbtoifsu32lf',
  '104.239.81.217:6752:klcnllsb:pbtoifsu32lf',
  '67.227.113.98:5638:klcnllsb:pbtoifsu32lf',
  '192.210.132.89:6059:klcnllsb:pbtoifsu32lf',
  '184.174.44.56:6482:klcnllsb:pbtoifsu32lf',
  '142.111.113.84:6445:klcnllsb:pbtoifsu32lf',
  '38.153.139.67:9743:klcnllsb:pbtoifsu32lf',
  '107.172.163.224:6740:klcnllsb:pbtoifsu32lf',
  '192.177.86.242:5243:klcnllsb:pbtoifsu32lf',
  '69.58.12.152:8157:klcnllsb:pbtoifsu32lf',
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeout = parseInt(searchParams.get('timeout') || '5000');
    const concurrent = parseInt(searchParams.get('concurrent') || '3'); // Reduced default to 3
    const startIndex = parseInt(searchParams.get('start') || '0'); // Allow resuming
    const maxProxies = searchParams.get('max') ? parseInt(searchParams.get('max')) : null; // Limit batch size
    
    console.log(`🧪 Starting proxy test: ${ALL_PROXIES.length} proxies, timeout: ${timeout}ms, concurrent: ${concurrent}, start: ${startIndex}`);
    
    // Set a maximum execution time (5 minutes)
    const maxExecutionTime = 5 * 60 * 1000;
    const startTime = Date.now();
    
    const results = await Promise.race([
      testAllProxies(ALL_PROXIES, {
        timeout,
        concurrent,
        startIndex,
        maxProxies,
        onProgress: (progress) => {
          const elapsed = Date.now() - startTime;
          console.log(`📊 Progress: ${progress.tested}/${progress.total} tested, ${progress.working} working, ${progress.failed} failed (${Math.floor(elapsed/1000)}s elapsed)`);
        }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout after 5 minutes')), maxExecutionTime)
      )
    ]);
    
    // Generate code snippet with only working proxies
    const codeSnippet = `// ✅ Working Proxies (${results.working} out of ${results.total} tested)
// Generated: ${new Date().toISOString()}
const WORKING_PROXIES = [
${results.workingProxies.map(p => `  '${p}'`).join(',\n')}
];`;
    
    return NextResponse.json({
      success: true,
      summary: {
        total: results.total,
        working: results.working,
        failed: results.failed,
        successRate: `${((results.working / results.total) * 100).toFixed(1)}%`
      },
      workingProxies: results.workingProxies,
      failedProxies: results.failedProxies,
      codeSnippet,
      details: {
        working: results.summary.working,
        failed: results.summary.failed
      }
    });
  } catch (error) {
    console.error('❌ Proxy test error:', error);
    
    // If timeout, return partial results if available
    if (error.message.includes('timeout')) {
      return NextResponse.json({
        success: false,
        error: error.message,
        message: 'Test timed out. Use ?start=X&max=Y to test in smaller batches.',
        suggestion: 'Try testing in smaller batches: /api/test-proxies?start=0&max=50'
      }, { status: 408 }); // 408 Request Timeout
    }
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

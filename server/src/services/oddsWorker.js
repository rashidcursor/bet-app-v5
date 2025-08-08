import { parentPort, workerData } from 'worker_threads';
import axios from 'axios';
import { classifyOdds, transformToBettingData } from '../utils/oddsClassification.js';

async function processMatchOdds(match, apiToken, allowedMarketIds) {
  try {
    if (!match.isLive) {
      return { success: false, matchId: match.id, reason: 'not_live' };
    }

    const url = `https://api.sportmonks.com/v3/football/fixtures/${match.id}?api_token=${apiToken}&include=inplayOdds&filters=bookmakers:2`;
    
    const response = await axios.get(url);
    const allOdds = response.data?.data?.inplayodds || [];
    
    // Filter odds by allowed market IDs
    let filteredOdds = allOdds.filter((odd) =>
      allowedMarketIds.includes(odd.market_id)
    );

    // Group odds by market for classification
    const odds_by_market = {};
    for (const odd of filteredOdds) {
      if (!odd.market_id) continue;
      if (!odds_by_market[odd.market_id]) {
        odds_by_market[odd.market_id] = {
          market_id: odd.market_id,
          market_description: odd.market_description,
          odds: [],
        };
      }
      odds_by_market[odd.market_id].odds.push(odd);
      odds_by_market[odd.market_id].market_description = odd.market_description;
    }
    
    const classified = classifyOdds({ odds_by_market });
    const betting_data = transformToBettingData(classified, match);
    
    const result = {
      betting_data: betting_data,
      odds_classification: classified,
      cached_at: Date.now(),
      source: 'worker_update'
    };

    return { success: true, matchId: match.id, data: result };
    
  } catch (error) {
    return { success: false, matchId: match.id, error: error.message };
  }
}

async function main() {
  try {
    const { matches, apiToken, allowedMarketIds } = workerData;
    
    // Process all matches concurrently
    const promises = matches.map(match => 
      processMatchOdds(match, apiToken, allowedMarketIds)
    );
    
    const results = await Promise.all(promises);
    
    // Send results back to main thread
    parentPort.postMessage(results);
    
  } catch (error) {
    parentPort.postMessage([{ success: false, error: error.message }]);
  }
}

main();

// Test corner bet calculations with the provided examples
const BetOutcomeCalculationService = require('./betOutcomeCalculation.service.js');

const service = new BetOutcomeCalculationService();

// Mock match data with corner statistics
const mockMatchData = {
  state: { name: 'finished' },
  statistics: [
    {
      type_id: 34, // corners type_id
      location: 'home',
      data: { value: 6 }
    },
    {
      type_id: 34, // corners type_id  
      location: 'away',
      data: { value: 5 }
    }
  ]
};

// Test bets from user's examples
const testBets = [
  // Market 60: 2-Way Corners - Over 9.5
  {
    betDetails: {
      market_id: "60",
      market_name: "2-Way Corners",
      label: "Over",
      total: 9.5,
      name: "9.5"
    },
    betOption: "Over",
    stake: 1,
    odds: 1.66
  },
  
  // Market 67: Corners - Over 10
  {
    betDetails: {
      market_id: "67", 
      market_name: "Corners",
      label: "Over",
      total: 10,
      name: "10"
    },
    betOption: "Over",
    stake: 10,
    odds: 2.1
  },
  
  // Market 68: Total Corners - Range 6-8
  {
    betDetails: {
      market_id: "68",
      market_name: "Total Corners", 
      label: "6 - 8",
      name: "6 - 8"
    },
    betOption: "6 - 8",
    stake: 11,
    odds: 3.4
  },
  
  // Market 69: Alternative Corners - Exactly 12
  {
    betDetails: {
      market_id: "69",
      market_name: "Alternative Corners",
      label: "Exactly", 
      total: 12,
      name: "12"
    },
    betOption: "Exactly",
    stake: 11,
    odds: 10
  }
];

console.log('Testing corner bet calculations...');
console.log('Match corners: Home=6, Away=5, Total=11\n');

testBets.forEach((bet, index) => {
  console.log(`Test ${index + 1}: Market ${bet.betDetails.market_id} - ${bet.betDetails.market_name}`);
  console.log(`Bet: ${bet.betDetails.label} ${bet.betDetails.name || bet.betDetails.total}`);
  
  try {
    const result = service.calculateCorners(bet, mockMatchData);
    console.log(`Result: ${result.status}`);
    console.log(`Payout: ${result.payout}`);
    console.log(`Reason: ${result.reason}`);
    console.log('---');
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.log('---');
  }
});

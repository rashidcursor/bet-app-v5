import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';

const CombinationBetCard = ({ bet, isExpanded, onToggle }) => {
  const formatAmount = (amount) => `$${Math.abs(amount).toFixed(2)}`;
  
  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'won': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'lost': return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'cancelled':
      case 'canceled': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-amber-600 bg-amber-50 border-amber-200';
    }
  };

  const calculateProfit = () => {
    // For combination bets, stake is the total stake (not per leg)
    const totalStake = bet.stake; // Don't multiply by combination.length
    const status = bet.status.toLowerCase();
    
    // Use profit field from database if available (preferred)
    if (bet.profit !== undefined && bet.profit !== null) {
      const profit = Number(bet.profit);
      return Math.abs(profit).toFixed(2);
    }
    
    // Fallback to calculation if profit field not available
    if (status === 'won') {
      // Profit = (totalStake * odds) - totalStake
      return ((totalStake * bet.odds) - totalStake).toFixed(2);
    } else if (status === 'half_won') {
      // Half win: (stake/2) * odds + (stake/2) - stake = (stake/2) * (odds - 1)
      const halfWinProfit = (bet.stake / 2) * (bet.odds - 1);
      return halfWinProfit.toFixed(2);
    } else if (status === 'half_lost') {
      // Half loss: (stake/2) - stake = -(stake/2)
      const halfLossProfit = bet.stake / 2;
      return halfLossProfit.toFixed(2);
    } else if (status === 'lost') {
      return totalStake.toFixed(2);
    } else if (status === 'cancelled' || status === 'canceled' || status === 'void') {
      return '0.00';
    }
    return '0.00';
  };

  return (
    <Card className="mb-4 border-l-4 border-purple-400">
      <CardHeader 
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Badge variant="outline" className="text-purple-600 bg-purple-50 border-purple-200">
                Combo ({bet.combination.length})
              </Badge>
            </div>
            <div>
              <CardTitle className="text-lg">Combination Bet</CardTitle>
              <p className="text-sm text-gray-500">{formatDateTime(bet.createdAt)}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">{formatAmount(bet.stake)}</div>
            <div className="text-sm text-gray-500">Stake</div>
          </div>
        </div>
      </CardHeader>
      
      <div className="px-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-gray-500">Total Odds:</span>
              <span className="ml-2 font-semibold">{bet.odds}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">Potential Win:</span>
              <span className="ml-2 font-semibold">{formatAmount(bet.stake * bet.odds)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(bet.status)}>
              {bet.status}
            </Badge>
            {bet.status.toLowerCase() !== 'pending' && (() => {
              const status = bet.status.toLowerCase();
              const profit = calculateProfit();
              const profitNum = Number(profit);
              
              // Get profit from database if available
              const actualProfit = bet.profit !== undefined && bet.profit !== null 
                ? Number(bet.profit) 
                : profitNum;
              
              if (status === 'won' || status === 'half_won') {
                return (
                  <span className="font-semibold text-green-600">
                    +${Math.abs(actualProfit).toFixed(2)}
                  </span>
                );
              } else if (status === 'lost' || status === 'half_lost') {
                return (
                  <span className="font-semibold text-red-600">
                    -${Math.abs(actualProfit).toFixed(2)}
                  </span>
                );
              } else if (status === 'cancelled' || status === 'canceled' || status === 'void') {
                return (
                  <span className="font-semibold text-gray-500">
                    $0.00
              </span>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3 text-gray-700">Bet Legs</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bet.combination.map((leg, index) => (
                <Card key={index} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-700">Leg {index + 1}</span>
                      <Badge variant="outline" className={getStatusColor(leg.status)}>
                        {leg.status}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="font-medium">{leg.teams}</div>
                      <div className="text-gray-600">{leg.betDetails?.market_description}</div>
                      <div className="text-gray-700">
                        {leg.betDetails?.market_id === "37" 
                          ? `${leg.betDetails?.label} ${leg.betDetails?.total} / ${leg.betDetails?.name}`
                          : leg.selection
                        }
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Odds: {leg.odds}</span>
                        {leg.betDetails?.total && (
                          <span>Value: {leg.betDetails.total}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CombinationBetCard; 
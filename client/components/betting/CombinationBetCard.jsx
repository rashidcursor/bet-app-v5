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
    const totalStake = bet.stake * bet.combination.length;
    if (bet.status.toLowerCase() === 'won') {
      return (totalStake * bet.odds).toFixed(2);
    } else if (bet.status.toLowerCase() === 'lost') {
      return totalStake.toFixed(2);
    } else if (bet.status.toLowerCase() === 'cancelled' || bet.status.toLowerCase() === 'canceled') {
      return '0.00';
    }
    return 0;
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
            <div className="text-lg font-semibold">{formatAmount(bet.stake * bet.combination.length)}</div>
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
              <span className="ml-2 font-semibold">{formatAmount((bet.stake * bet.combination.length) * bet.odds)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(bet.status)}>
              {bet.status}
            </Badge>
            {bet.status.toLowerCase() !== 'pending' && (
              <span className={`font-semibold ${
                bet.status.toLowerCase() === 'won' ? 'text-green-600' : 
                bet.status.toLowerCase() === 'cancelled' || bet.status.toLowerCase() === 'canceled' ? 'text-gray-500' : 
                'text-red-600'
              }`}>
                {bet.status.toLowerCase() === 'won' ? '+' : 
                 bet.status.toLowerCase() === 'cancelled' || bet.status.toLowerCase() === 'canceled' ? '' : 
                 '-'}${calculateProfit()}
              </span>
            )}
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
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    selectBetSlip,
    selectBets,
    selectBetSlipOpen,
    selectBetSlipExpanded,
    selectActiveTab,
    toggleBetSlip,
    collapseBetSlip,
    closeBetSlip,
    setActiveTab,
    removeBet,
    clearAllBets,
    updateSingleStake,
    updateCombinationStake,
    updateSystemStake,
    setApproveOddsChange,
    calculateTotals,
    placeBetThunk
} from '@/lib/features/betSlip/betSlipSlice';
import { selectIsAuthenticated, selectUser } from '@/lib/features/auth/authSlice';
import LoginDialog from '@/components/auth/LoginDialog';
import { toast } from 'sonner';

const BetSlip = () => {
    const dispatch = useDispatch();
    const betSlip = useSelector(selectBetSlip);
    const bets = useSelector(selectBets);
    const isExpanded = useSelector(selectBetSlipExpanded);
    const activeTab = useSelector(selectActiveTab);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const user = useSelector(selectUser);
    const betSlipRef = useRef(null);
    const [isPlacingBet, setIsPlacingBet] = React.useState(false);

    // Calculate totals when relevant data changes
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (betSlipRef.current && !betSlipRef.current.contains(event.target)) {
                // Don't close if clicking on betting buttons
                const clickedElement = event.target.closest('button');
                if (clickedElement && (
                    clickedElement.textContent.match(/^\d+\.?\d*$/) || // Odds buttons
                    clickedElement.classList.contains('betting-button') ||
                    clickedElement.closest('.betting-odds')
                )) {
                    return;
                }
                
                // Don't close if clicking on input fields
                const isInputElement = event.target.tagName === 'INPUT' || 
                                      event.target.closest('input') ||
                                      event.target.closest('.input-wrapper');
                if (isInputElement) {
                    return;
                }
                
                // Only collapse, don't close entirely when clicking outside
                if (isExpanded) {
                    dispatch(collapseBetSlip());
                }
            }
        };

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isExpanded, dispatch]);
    useEffect(() => {
        dispatch(calculateTotals());
    }, [bets, betSlip.stake, activeTab, dispatch]);    // Don't render if no bets
    if (bets.length === 0) {
        return null;
    }

    const handleToggle = () => {
        dispatch(toggleBetSlip());
    };

    // Handle clicking outside to close

    const handleTabChange = (tab) => {
        dispatch(setActiveTab(tab));
    };

    const handleRemoveBet = (betId) => {
        dispatch(removeBet(betId));
    };

    const handleClearAll = () => {
        dispatch(clearAllBets());
    };

    const handleSingleStakeChange = (betId, value) => {
        dispatch(updateSingleStake({ betId, stake: value }));
    };

    const handleCombinationStakeChange = (value) => {
        dispatch(updateCombinationStake(value));
    };

    const handleSystemStakeChange = (value) => {
        dispatch(updateSystemStake(value));
    };

    const handleApproveOddsChange = (checked) => {
        dispatch(setApproveOddsChange(checked));
    };

    const handlePlaceBet = async () => {
        // Check if user is authenticated
        if (!isAuthenticated) {
            // Don't make API request, just return - the login dialog will be shown
            return;
        }

        // Check if user is admin
        if (user?.role === 'admin') {
            toast.error('Admins cannot place bets');
            return;
        }

        setIsPlacingBet(true);
        try {
            const resultAction = await dispatch(placeBetThunk());
            if (placeBetThunk.fulfilled.match(resultAction)) {
                toast.success('Bet placed successfully!');
            } else {
                // Improved error handling: show backend error if available
                let errorMsg =
                    resultAction.payload?.error?.message ||
                    resultAction.payload?.message ||
                    resultAction.error?.message ||
                    (typeof resultAction.payload === 'string' ? resultAction.payload : null) ||
                    'Failed to place bet.';
                toast.error(errorMsg);
            }
        } catch (err) {
            // Try to show backend error if available
            const backendMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message;
            toast.error(backendMsg || 'Failed to place bet.');
        } finally {
            setIsPlacingBet(false);
        }
    };

    const getTabCount = (tab) => {
        if (tab === 'singles') return bets.length;
        if (tab === 'combination' && bets.length >= 2) return 1;
        if (tab === 'system' && bets.length >= 3) return 1;
        return 0;
    };

    const isTabDisabled = (tab) => {
        if (tab === 'combination') return bets.length < 2;
        if (tab === 'system') return bets.length < 3;
        return false;
    };

    return (<div className="fixed bottom-0 right-5 z-50" ref={betSlipRef}>
        <style jsx>{`
                .betslip-container {
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    transform-origin: bottom right;
                    will-change: max-height, opacity;
                }
                
                .scale-98 {
                    transform: scale(0.98);
                }
            `}</style>
        <div className={`w-96 bg-gray-900 text-white shadow-2xl  betslip-container transition-all duration-500 ease-in-out ${isExpanded
            ? 'max-h-[600px] opacity-100 scale-100'
            : 'max-h-[60px] opacity-95 scale-98 overflow-hidden'
            }`}>
            {!isExpanded ? (
                // Collapsed State
                <div
                    onClick={handleToggle}
                    className="cursor-pointer hover:bg-gray-800 transition-all duration-300 p-3 rounded-lg"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <div className="bg-yellow-500 text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold transition-all duration-300 hover:scale-110">
                                {bets.length}
                            </div>
                            <div className="flex justify-between font-semibold items-center">
                                <span className="text-sm text-gray-400">
                                    {bets.length === 1 ? 'Single bet' : `Combination (${bets.length} bets)`}
                                </span>
                            </div>
                        </div>
                        <ChevronUp className="h-4 w-4 text-gray-400 transition-all duration-300 hover:text-yellow-400" />
                    </div>
                </div>) : (
                // Expanded State  
                <div className="transition-all duration-300 ease-in-out">
                    {/* Header */}
                    <div className="bg-gray-800 px-3 py-2 rounded-t-lg ">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-white font-semibold text-sm">Bet Slip</h3>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => dispatch(collapseBetSlip())}
                                    className="text-white hover:text-gray-300 transition-all duration-200 cursor-pointer hover:scale-110"
                                >
                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                </button>
                                <button
                                    onClick={() => dispatch(closeBetSlip())}
                                    className="text-white hover:text-gray-300 transition-all duration-200 cursor-pointer hover:scale-110 hover:rotate-90"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        {/*TODO: Add system in the array to make a system tab then uncommenet the system component and the active tab condition for system  */}
                        <div className="flex space-x-0.5">
                            {['singles'/*, 'combination'*/].map((tab) => {
                                const count = getTabCount(tab);
                                const disabled = isTabDisabled(tab);

                                return (
                                    <button
                                        key={tab}
                                        onClick={() => !disabled && handleTabChange(tab)}
                                        disabled={disabled}
                                        className={`flex-1 px-2 py-1 text-xs font-medium transition-all duration-200 ${activeTab === tab
                                            ? 'bg-white text-black'
                                            : disabled
                                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                                : 'bg-gray-600 text-white hover:bg-gray-500'
                                            }`}
                                    >
                                        <div className="capitalize">{tab}</div>
                                        {count > 0 && (
                                            <div className="text-xs">({count})</div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-3 py-2 max-h-64 overflow-y-auto dropdown-scrollbar transition-all duration-300">
                        {activeTab === 'singles' && (
                            <SinglesBets
                                bets={bets}
                                stakes={betSlip.stake.singles}
                                onStakeChange={handleSingleStakeChange}
                                onRemoveBet={handleRemoveBet}
                            />
                        )}

                        {/* Combination bet UI commented out for now */}
                        {/* {activeTab === 'combination' && bets.length >= 2 && (
                                <CombinationBet
                                    bets={bets}
                                    stake={betSlip.stake.combination}
                                    onStakeChange={handleCombinationStakeChange}
                                    onRemoveBet={handleRemoveBet}
                                />
                            )} */}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-700 px-3 py-2 transition-all duration-300">
                        {/* Clear Betslip */}
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">Clear betslip</span>
                            <button
                                onClick={handleClearAll}
                                className="text-xs text-white hover:text-gray-300 transition-colors duration-200"
                            >
                                Clear
                            </button>
                        </div>

                        {/* Total Stake */}
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-300">Total stake:</span>
                            <span className="text-xs font-medium">€{betSlip.totalStake.toFixed(2)}</span>
                        </div>

                        {/* Potential Payout */}
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-300">Potential payout:</span>
                            <span className="text-sm font-bold text-yellow-400">€{betSlip.potentialReturn.toFixed(2)}</span>
                        </div>

                        {/* Approve Odds Change */}
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400">Approve odds change</span>
                            <Switch
                                checked={betSlip.approveOddsChange}
                                onCheckedChange={handleApproveOddsChange}
                                className="scale-75"
                            />
                        </div>

                        {/* Place Bet Button */}
                        {!isAuthenticated ? (
                            <LoginDialog>
                                <Button
                                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 transition-all duration-200"
                                    disabled={betSlip.totalStake === 0}
                                >
                                    Log in to place bet
                                </Button>
                            </LoginDialog>
                        ) : user?.role === 'admin' ? (
                            <Button
                                className="w-full bg-gray-500 text-white font-bold py-2 transition-all duration-200 cursor-not-allowed"
                                disabled={true}
                            >
                                Admins cannot place bets
                            </Button>
                        ) : (
                            <Button
                                className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 transition-all duration-200"
                                disabled={betSlip.totalStake === 0 || isPlacingBet}
                                onClick={handlePlaceBet}
                            >
                                {isPlacingBet ? (
                                    <span className="flex items-center justify-center">
                                        <Loader2 className="animate-spin h-5 w-5 mr-2 text-black" />
                                        Placing Bet...
                                    </span>
                                ) : (
                                    'Place Bet'
                                )}
                            </Button>
                        )}
                    </div>
                </div>)}
        </div>
    </div>
    );
};

// Singles Bets Component
const SinglesBets = ({ bets, stakes, onStakeChange, onRemoveBet }) => {
    // Helper to format bet label
    const getBetLabel = (bet) => {
        // Determine the badge value (handicap, total, threshold, etc.)
        const badgeValue = bet.handicapValue  || bet.name || bet.total || bet.threshold || null;

        // Player market: show 'Market Name - Player Name (Badge)'
        if (bet.marketDescription && bet.name && bet.marketDescription.toLowerCase().includes('player')) {
            return `${bet.marketDescription} - ${bet.name}${badgeValue ? ` (${badgeValue})` : ''}`;
        }
        // Handicap/Alternative Handicap: show 'Market Name - Team Name/Label (Badge)'
        if (
            bet.marketDescription &&
            (bet.marketDescription.toLowerCase().includes('handicap') || bet.marketDescription.toLowerCase().includes('alternative')) &&
            bet.label
        ) {
            if ((bet.label === '1' || bet.label === '2') && bet.name) {
                return `${bet.marketDescription} - ${bet.name}${badgeValue ? ` (${badgeValue})` : ''}`;
            }
            return `${bet.marketDescription} - ${bet.label}${badgeValue ? ` (${badgeValue})` : ''}`;
        }
        // Over/Under and other markets with badge value
        if (bet.marketDescription && badgeValue) {
            if ((bet.label === '1' || bet.label === '2') && bet.name) {
                return `${bet.marketDescription} - ${bet.name} (${badgeValue})`;
            }
            return `${bet.marketDescription} - ${bet.selection} (${badgeValue})`;
        }
        // Fallbacks
        if (bet.marketDescription) {
            if ((bet.label === '1' || bet.label === '2') && bet.name) {
                return `${bet.marketDescription} - ${bet.name}`;
            }
            return `${bet.marketDescription} - ${bet.selection}`;
        }
        if ((bet.label === '1' || bet.label === '2') && bet.name) {
            return bet.name;
        }
        return bet.selection;
    };
    return (
        <div className="space-y-3">            {bets.map((bet, index) => (<div
            key={bet.id}
            className="bg-gray-800 px-3 py-2 rounded-lg transition-all duration-200 ease-out hover:bg-gray-750"
        >
            <div className="flex items-start justify-between mb-2 ">
                <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">
                        {bet.match.team1} - {bet.match.team2}
                    </div>
                    <div className="text-sm font-medium mb-1">
                        {getBetLabel(bet)}
                    </div>
                    <div className="text-xs text-gray-400">
                        {bet.type} • {bet.match.time}
                    </div>
                </div>                        <button
                    onClick={() => onRemoveBet(bet.id)}
                    className="text-gray-400 hover:text-white ml-2 transition-colors duration-200"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1">                            <div className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold transition-colors duration-200 hover:bg-yellow-400">
                    {bet.odds}
                </div>                            <Input
                        placeholder="0.00"
                        value={stakes[bet.id] || ''}
                        onChange={(e) => onStakeChange(bet.id, e.target.value)}
                        className="flex-1 h-6 p-0 px-1 !text-[11px] bg-gray-700 border-gray-600 text-white transition-colors duration-200 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                        step="0.01"
                        min="0"
                    />
                </div>
            </div>                    {stakes[bet.id] > 0 && (
                <div className="text-xs text-gray-400 mt-1 transition-opacity duration-300">
                    Potential: €{(stakes[bet.id] * bet.odds).toFixed(2)}
                </div>
            )}
        </div>
        ))}
        </div>
    );
};

// Combination Bet Component
const CombinationBet = ({ bets, stake, onStakeChange, onRemoveBet }) => {
    const combinedOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);

    return (
        <div className="space-y-3">            <div className="text-sm font-medium text-center transition-all duration-300">
            Combination ({bets.length} selections)
        </div>            {bets.map((bet, index) => (
            <div
                key={bet.id}
                className="bg-gray-800 rounded-lg p-2 transition-all duration-200 ease-out hover:bg-gray-750"
            >
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="text-xs text-gray-400 mb-1">
                            {bet.match.team1} - {bet.match.team2}
                        </div>
                        <div className="text-sm">
                            {bet.selection === '1' ? bet.match.team1 : bet.selection === '2' ? bet.match.team2 : 'Draw'}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400">{bet.type}</span>
                            <div className="bg-yellow-500 text-black px-1.5 py-0.5 rounded text-xs font-bold transition-all duration-200 hover:bg-yellow-400 hover:scale-105">
                                {bet.odds}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => onRemoveBet(bet.id)}
                        className="text-gray-400 hover:text-white ml-2 transition-all duration-200 hover:scale-110 hover:rotate-90"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            </div>
        ))}

            <div className="bg-gray-800 rounded p-3 animate-in slide-in-from-bottom duration-300" style={{ animationDelay: `${bets.length * 100 + 200}ms`, animationFillMode: 'both' }}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm">Total Odds:</span>
                    <div className="bg-yellow-500 text-black px-2 py-1 rounded text-sm font-bold transition-all duration-200 hover:bg-yellow-400 hover:scale-105">
                        {combinedOdds.toFixed(2)}
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-sm">Stake:</span>
                    <Input
                        value={stake}
                        onChange={(e) => onStakeChange(e.target.value)}
                        className="flex-1 h-6 p-0 px-1 !text-[11px] bg-gray-700 border-gray-600 text-white transition-all duration-200 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:scale-105"
                        step="0.01"
                        min="0"
                    />
                </div>
            </div>
        </div>
    );
};

// System Bet Component  
// const SystemBet = ({ bets, stake, onStakeChange, onRemoveBet }) => {
//     return (
//         <div className="space-y-3">
//             <div className="text-sm font-medium text-center">
//                 System ({bets.length} selections)
//             </div>

//             {bets.map((bet) => (
//                 <div key={bet.id} className="bg-gray-800 rounded p-2">
//                     <div className="flex items-start justify-between">
//                         <div className="flex-1">
//                             <div className="text-xs text-gray-400 mb-1">
//                                 {bet.match.team1} - {bet.match.team2}
//                             </div>
//                             <div className="text-sm">
//                                 {bet.selection === '1' ? bet.match.team1 : bet.selection === '2' ? bet.match.team2 : 'Draw'}
//                             </div>
//                             <div className="flex items-center justify-between mt-1">
//                                 <span className="text-xs text-gray-400">{bet.type}</span>
//                                 <div className="bg-yellow-500 text-black px-1.5 py-0.5 rounded text-xs font-bold">
//                                     {bet.odds}
//                                 </div>
//                             </div>
//                         </div>
//                         <button
//                             onClick={() => onRemoveBet(bet.id)}
//                             className="text-gray-400 hover:text-white ml-2"
//                         >
//                             <X className="h-3 w-3" />
//                         </button>
//                     </div>
//                 </div>
//             ))}

//             <div className="bg-gray-800 rounded p-3">
//                 <div className="flex items-center space-x-2">
//                     <span className="text-sm">Stake:</span>
//                     <Input
//                         type="number"
//                         value={stake}
//                         onChange={(e) => onStakeChange(e.target.value)}
//                         className="flex-1 h-8 bg-gray-700 border-gray-600 text-white text-sm"
//                         step="0.01"
//                         min="0"
//                     />
//                 </div>

//                 <div className="text-xs text-gray-400 mt-2">
//                     System bet covers multiple combinations
//                 </div>
//             </div>
//         </div>
//     );
// };

export default BetSlip;

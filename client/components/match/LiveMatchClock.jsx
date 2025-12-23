'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock, Tv } from 'lucide-react';
import apiClient from '@/config/axios';

const LiveMatchClock = ({ matchId, isLive = false, initialLiveData = null, onScoreUpdate, onLiveDataUpdate }) => {
    const [liveData, setLiveData] = useState(initialLiveData);
    const [currentTime, setCurrentTime] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    
    const timerRef = useRef(null);
    const syncRef = useRef(null);
    const lastSyncRef = useRef(Date.now());

    // Fetch live data from API
    const fetchLiveData = async () => {
        if (!matchId || !isLive) return;
        
        try {
            setIsSyncing(true);
            const response = await apiClient.get(`/matches/${matchId}/live`);
            
            if (response.data.success && response.data.liveData) {
                setLiveData(response.data.liveData);
                lastSyncRef.current = Date.now();
                console.log('🔄 Live data synced:', response.data.liveData?.matchClock);
                console.log('📊 Score data:', response.data.liveData?.score);
                
                // Update score if callback provided
                if (onScoreUpdate && response.data.liveData.score) {
                    console.log('📊 Updating score via callback:', response.data.liveData.score);
                    console.log('📊 Score home:', response.data.liveData.score.home);
                    console.log('📊 Score away:', response.data.liveData.score.away);
                    onScoreUpdate(response.data.liveData.score);
                }

                // Update live data if callback provided
                if (onLiveDataUpdate) {
                    console.log('📊 Updating live data via callback:', response.data.liveData);
                    onLiveDataUpdate(response.data.liveData);
                }
                
                // Force immediate score update
                setTimeout(() => {
                    if (response.data.liveData.score && onScoreUpdate) {
                        console.log('📊 Delayed score update:', response.data.liveData.score);
                        onScoreUpdate(response.data.liveData.score);
                    }
                }, 100);
            } else {
                console.log('⚠️ Match not found in live data or not currently live');
                // Don't set liveData if match is not live
            }
        } catch (error) {
            console.error('❌ Failed to fetch live data:', error);
            // Continue with existing data if API fails
        } finally {
            setIsSyncing(false);
        }
    };

    // Initialize live data and start sync
    useEffect(() => {
        console.log('🔄 LiveMatchClock useEffect:', { matchId, isLive });
        
        if (!isLive || !matchId) {
            // Clean up timers
            if (timerRef.current) clearInterval(timerRef.current);
            if (syncRef.current) clearInterval(syncRef.current);
            setCurrentTime(null);
            setIsRunning(false);
            return;
        }

        // Initial fetch
        console.log('🔄 Starting live data fetch for match:', matchId);
        fetchLiveData();

        // Sync with API every 45 seconds
        syncRef.current = setInterval(() => {
            console.log('🔄 Periodic sync for match:', matchId);
            fetchLiveData();
        }, 45000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (syncRef.current) clearInterval(syncRef.current);
        };
    }, [matchId, isLive]);

    // Update score when liveData changes
    useEffect(() => {
        console.log('📊 LiveMatchClock liveData changed:', liveData);
        if (liveData?.score && onScoreUpdate) {
            console.log('📊 Initial score update from liveData:', liveData.score);
            console.log('📊 LiveData score home:', liveData.score.home);
            console.log('📊 LiveData score away:', liveData.score.away);
            onScoreUpdate(liveData.score);
        } else {
            console.log('📊 No liveData score or callback for initial update:', {
                hasLiveData: !!liveData,
                hasScore: !!liveData?.score,
                hasCallback: !!onScoreUpdate,
                liveData: liveData
            });
        }
    }, [liveData?.score, onScoreUpdate]);

    // Force score update when component mounts with live data
    useEffect(() => {
        if (initialLiveData?.score && onScoreUpdate) {
            console.log('📊 Force updating score from initialLiveData:', initialLiveData.score);
            onScoreUpdate(initialLiveData.score);
        }
    }, [initialLiveData?.score, onScoreUpdate]);

    // Update timer based on live data
    useEffect(() => {
        if (!liveData?.matchClock || !isLive) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setCurrentTime(null);
            setIsRunning(false);
            return;
        }

        const { matchClock } = liveData;
        setIsRunning(matchClock.running);
        
        // ✅ FIX: Only update timer if:
        // 1. Not initialized yet (currentTime is null)
        // 2. New time is significantly newer (5+ seconds ahead) - major correction
        // 3. Timer is not running (stopped state)
        const apiTotalSeconds = (matchClock.minute || 0) * 60 + (matchClock.second || 0);
        const currentTotalSeconds = currentTime ? 
            (currentTime.minute || 0) * 60 + (currentTime.second || 0) : 0;
        
        const shouldUpdate = !currentTime || // First initialization
                            !matchClock.running || // Timer stopped - safe to update
                            apiTotalSeconds > currentTotalSeconds + 5; // Major correction (5+ seconds ahead)
        
        if (shouldUpdate) {
            // Initialize or update with API data
            setCurrentTime({
                minute: matchClock.minute || 0,
                second: matchClock.second || 0,
                period: matchClock.period || '1st half',
                minutesLeftInPeriod: matchClock.minutesLeftInPeriod,
                secondsLeftInMinute: matchClock.secondsLeftInMinute
            });
        }
        // Otherwise keep current time - let local timer continue running independently

        // Start local timer if match is running
        if (matchClock.running && !timerRef.current) {
            timerRef.current = setInterval(() => {
                setCurrentTime(prev => {
                    if (!prev) return null;
                    
                    let newSecond = prev.second + 1;
                    let newMinute = prev.minute;
                    
                    // Handle minute rollover
                    if (newSecond >= 60) {
                        newSecond = 0;
                        newMinute = prev.minute + 1;
                    }
                    
                    // Only update time, let API handle period changes
                    return {
                        ...prev,
                        minute: newMinute,
                        second: newSecond
                        // Don't change period - let API handle this
                    };
                });
            }, 1000);
        } else if (!matchClock.running && timerRef.current) {
            // Stop timer if match is not running
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [liveData, isLive, currentTime]); // Add currentTime to dependencies for comparison

    // Don't render if not live or no time data
    if (!isLive || !currentTime) {
        return null;
    }

    const formatTime = (minute, second) => {
        return `${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
    };

    const getPeriodColor = (period) => {
        switch (period) {
            case '1st half':
                return 'text-green-500';
            case '2nd half':
                return 'text-blue-500';
            case 'Half Time':
                return 'text-yellow-500';
            case 'Full Time':
                return 'text-red-500';
            default:
                return 'text-gray-500';
        }
    };

    const getPeriodBgColor = (period) => {
        switch (period) {
            case '1st half':
                return 'bg-green-100 border-green-300';
            case '2nd half':
                return 'bg-blue-100 border-blue-300';
            case 'Half Time':
                return 'bg-yellow-100 border-yellow-300';
            case 'Full Time':
                return 'bg-red-100 border-red-300';
            default:
                return 'bg-gray-100 border-gray-300';
        }
    };

    // Only show period if running is true, or if it's not "2nd half"
    const shouldShowPeriod = isRunning || currentTime.period !== '2nd half';

    return (
        <div className="flex flex-col items-center justify-center">
            <div className="flex items-center gap-1">
                <Tv className="w-4 h-4 text-red-600" />
                <div className={`text-lg font-bold ${getPeriodColor(currentTime.period)}`}>
                    {formatTime(currentTime.minute, currentTime.second)}
                </div>
            </div>
            {shouldShowPeriod && (
                <div className="text-xs text-gray-500 mt-1">
                    {currentTime.period}
                </div>
            )}
        </div>
    );
};

export default LiveMatchClock;

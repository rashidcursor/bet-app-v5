'use client';

import React, { useState, useEffect, useRef } from 'react';
import apiClient from '@/config/axios';

const LiveMatchTimer = ({ matchId, initialTime = null, initialPeriod = null, isRunning = false }) => {
    const [currentTime, setCurrentTime] = useState(initialTime || { minute: 0, second: 0 });
    const [currentPeriod, setCurrentPeriod] = useState(initialPeriod || '1st half');
    const [isLive, setIsLive] = useState(isRunning);
    const [lastSyncTime, setLastSyncTime] = useState(Date.now());
    
    const intervalRef = useRef(null);
    const syncIntervalRef = useRef(null);
    // ✅ FIX: Use ref to track current time for comparison (avoids race conditions)
    const currentTimeRef = useRef(initialTime || { minute: 0, second: 0 });
    const lastPropTimeRef = useRef(null);
    const isInitializedRef = useRef(false);
    const lastPropSyncRef = useRef(Date.now());

    // ✅ FIX: Only sync with props when timer is NOT running, or on initial mount, or if prop is significantly different
    useEffect(() => {
        if (!initialTime || initialTime.minute === undefined) return;
        
        // If timer is running locally, DON'T sync with props (prevent glitches)
        // Only sync if:
        // 1. Not initialized yet (first mount)
        // 2. Timer is stopped
        // 3. Prop time is significantly different (5+ seconds) - major correction needed
        if (isLive && intervalRef.current && isInitializedRef.current) {
            // Timer is running - only sync if prop is significantly ahead (5+ seconds)
            const currentTotalSeconds = (currentTimeRef.current.minute || 0) * 60 + (currentTimeRef.current.second || 0);
            const newTotalSeconds = (initialTime.minute || 0) * 60 + (initialTime.second || 0);
            
            // Only sync if prop is 5+ seconds ahead (major correction)
            if (newTotalSeconds > currentTotalSeconds + 5) {
                console.log(`🔄 LiveMatchTimer: Major correction - prop (${initialTime.minute}'${initialTime.second}) is ${newTotalSeconds - currentTotalSeconds}s ahead of current (${currentTimeRef.current.minute}'${currentTimeRef.current.second})`);
                setCurrentTime({
                    minute: initialTime.minute || 0,
                    second: initialTime.second || 0
                });
                currentTimeRef.current = {
                    minute: initialTime.minute || 0,
                    second: initialTime.second || 0
                };
            }
            // Otherwise ignore - let timer run independently
            return;
        }
        
        // Timer is stopped or not initialized - sync normally
        const currentTotalSeconds = (currentTimeRef.current.minute || 0) * 60 + (currentTimeRef.current.second || 0);
        const newTotalSeconds = (initialTime.minute || 0) * 60 + (initialTime.second || 0);
        
        // Check if this is the same prop value we already processed
        const propKey = `${initialTime.minute}-${initialTime.second}`;
        if (lastPropTimeRef.current === propKey) {
            return; // Already processed this prop value
        }
        
        // Only update if new time is newer or equal (for initial sync)
        if (newTotalSeconds >= currentTotalSeconds || !isInitializedRef.current) {
            setCurrentTime({
                minute: initialTime.minute || 0,
                second: initialTime.second || 0
            });
            currentTimeRef.current = {
                minute: initialTime.minute || 0,
                second: initialTime.second || 0
            };
            lastPropTimeRef.current = propKey;
            isInitializedRef.current = true;
            lastPropSyncRef.current = Date.now();
            
            if (initialPeriod) {
                setCurrentPeriod(initialPeriod);
            }
            if (isRunning !== undefined) {
                setIsLive(isRunning);
            }
        }
        // Otherwise ignore - it's stale data
    }, [initialTime, initialPeriod, isRunning, isLive]); // Sync when props change

    // Client-side timer that updates every second
    useEffect(() => {
        if (isLive) {
            intervalRef.current = setInterval(() => {
                setCurrentTime(prev => {
                    const newSecond = prev.second + 1;
                    let newMinute = prev.minute;
                    let finalSecond = newSecond;
                    
                    if (newSecond >= 60) {
                        newMinute = prev.minute + 1;
                        finalSecond = 0;
                    }
                    
                    const newTime = { minute: newMinute, second: finalSecond };
                    // ✅ Update ref to track current time
                    currentTimeRef.current = newTime;
                    
                    return newTime;
                });
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isLive]);

    // API sync every 45 seconds (keep this as backup)
    useEffect(() => {
        const syncWithAPI = async () => {
            try {
                console.log(`🔄 LiveMatchTimer: Syncing with API for match ${matchId}`);
                const response = await apiClient.get(`/matches/${matchId}/live`);
                
                if (response.data.success && response.data.liveData) {
                    const { matchClock, score } = response.data.liveData;
                    
                    if (matchClock) {
                        const apiTotalSeconds = (matchClock.minute || 0) * 60 + (matchClock.second || 0);
                        const currentTotalSeconds = (currentTimeRef.current.minute || 0) * 60 + (currentTimeRef.current.second || 0);
                        
                        // Only update if API time is significantly newer (at least 2 seconds ahead)
                        // This prevents backward jumps from stale API data
                        if (apiTotalSeconds > currentTotalSeconds + 1) {
                            const newTime = {
                                minute: matchClock.minute || 0,
                                second: matchClock.second || 0
                            };
                            setCurrentTime(newTime);
                            currentTimeRef.current = newTime;
                            setCurrentPeriod(matchClock.period || '1st half');
                            setIsLive(matchClock.running || false);
                            setLastSyncTime(Date.now());
                            
                            console.log(`✅ LiveMatchTimer: Synced - ${matchClock.minute}'${matchClock.second} ${matchClock.period} (running: ${matchClock.running})`);
                        } else {
                            console.log(`⏭️ LiveMatchTimer: Skipped sync - API time (${matchClock.minute}'${matchClock.second}) is not significantly newer than current (${currentTimeRef.current.minute}'${currentTimeRef.current.second})`);
                        }
                    }
                }
            } catch (error) {
                console.warn(`⚠️ LiveMatchTimer: Failed to sync with API for match ${matchId}:`, error.message);
            }
        };

        // Initial sync
        syncWithAPI();

        // Set up periodic sync every 45 seconds
        syncIntervalRef.current = setInterval(syncWithAPI, 45000);

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, [matchId]);

    // Format time display
    const formatTime = () => {
        const minute = currentTime.minute || 0;
        const second = currentTime.second || 0;
        
        if (second > 0) {
            return `${minute}'${second.toString().padStart(2, '0')}`;
        }
        return `${minute}'`;
    };

    // Never show period - just show the time
    return (
        <div className="text-xs">
            <span className="text-red-600 font-medium">
                {formatTime()}
            </span>
        </div>
    );
};

export default LiveMatchTimer;

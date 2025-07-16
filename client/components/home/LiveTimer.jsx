'use client';

import React, { useState, useEffect } from 'react';

const LiveTimer = ({ startingAt }) => {
    const [elapsedTime, setElapsedTime] = useState('');

    useEffect(() => {
        if (!startingAt) {
            console.log('[LiveTimer] No startingAt provided');
            setElapsedTime('');
            return;
        }

        console.log('[LiveTimer] Starting timer with startingAt:', startingAt);

        const calculateElapsedTime = () => {
            try {
                // Handle UTC timestamp properly
                let startTime;
                if (typeof startingAt === 'string') {
                    // If the string doesn't have timezone info, treat it as UTC
                    if (!startingAt.includes('T') && !startingAt.includes('Z') && !startingAt.includes('+')) {
                        // Format: "2025-07-16 09:00:00" -> treat as UTC
                        startTime = new Date(startingAt + ' UTC');
                    } else {
                        // Already has timezone info
                        startTime = new Date(startingAt);
                    }
                } else {
                    startTime = new Date(startingAt);
                }

                const now = new Date();
                const diffMs = now.getTime() - startTime.getTime();

                console.log('[LiveTimer] Start time (UTC):', startTime.toISOString());
                console.log('[LiveTimer] Current time:', now.toISOString());
                console.log('[LiveTimer] Difference (ms):', diffMs);

                // If match hasn't started yet
                if (diffMs < 0) {
                    setElapsedTime('0:00');
                    return;
                }

                // Calculate minutes and seconds
                const totalMinutes = Math.floor(diffMs / (1000 * 60));
                const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

                console.log('[LiveTimer] Calculated minutes:', totalMinutes);

                // If match started more than 120 minutes ago, it's likely finished
                if (totalMinutes > 120) {
                    setElapsedTime('FT');
                    return;
                }

                // Cap at 90+ minutes for football matches (plus reasonable injury time)
                if (totalMinutes >= 90) {
                    setElapsedTime('90+');
                    return;
                }

                // Format as MM:SS
                const formattedTime = `${totalMinutes}:${seconds.toString().padStart(2, '0')}`;
                setElapsedTime(formattedTime);
            } catch (error) {
                console.error('[LiveTimer] Error calculating elapsed time:', error);
                setElapsedTime('--');
            }
        };

        // Calculate immediately
        calculateElapsedTime();

        // Update every second
        const interval = setInterval(calculateElapsedTime, 1000);

        return () => {
            console.log('[LiveTimer] Cleaning up interval');
            clearInterval(interval);
        };
    }, [startingAt]);

    if (!elapsedTime) {
        return <span className="text-xs text-gray-600">--</span>;
    }

    return (
        <span className="text-xs text-gray-600 font-medium">
            {elapsedTime}
        </span>
    );
};

export default LiveTimer; 
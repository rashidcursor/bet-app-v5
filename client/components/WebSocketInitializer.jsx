'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import websocketService from '@/lib/services/websocketService';

const WebSocketInitializer = () => {
  const pathname = usePathname();

  useEffect(() => {
    // Check if we're on a match detail page
    const isMatchDetailPage = pathname?.includes('/matches/');
    
    if (isMatchDetailPage) {
      console.log('🚫 WebSocket disabled for match detail page - using clean APIs instead');
      // Don't initialize WebSocket for match detail pages
      // The match detail page will use the new clean APIs instead
      return;
    }

    // Initialize WebSocket connection for other pages
    console.log('🔌 Initializing WebSocket for non-match-detail pages');
    websocketService.initialize();
    
    // Join live matches room by default
    websocketService.joinLiveMatches();
    
    // Cleanup on unmount
    return () => {
      // Don't disconnect here as other components might be using the socket
    };
  }, [pathname]);

  return null; // This component doesn't render anything
};

export default WebSocketInitializer;
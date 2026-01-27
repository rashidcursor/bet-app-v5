/**
 * Utility to manage finished matches in localStorage
 * Keeps finished matches visible for 5 minutes after Unibet API reports "FINISHED" status
 */

const FINISHED_MATCHES_STORAGE_KEY = 'betapp_finished_matches';
const FINISHED_MATCH_RETENTION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get all finished matches from localStorage
 * @returns {Object} Map of matchId -> { finishedAt: timestamp, matchData: match }
 */
export const getFinishedMatches = () => {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(FINISHED_MATCHES_STORAGE_KEY);
    if (!stored) return {};
    
    const finishedMatches = JSON.parse(stored);
    const now = Date.now();
    const validMatches = {};
    
    // Clean up expired matches (older than 5 minutes)
    Object.keys(finishedMatches).forEach(matchId => {
      const matchInfo = finishedMatches[matchId];
      const timeSinceFinished = now - matchInfo.finishedAt;
      
      if (timeSinceFinished < FINISHED_MATCH_RETENTION_MS) {
        validMatches[matchId] = matchInfo;
      }
    });
    
    // Update localStorage with cleaned data
    if (Object.keys(validMatches).length !== Object.keys(finishedMatches).length) {
      localStorage.setItem(FINISHED_MATCHES_STORAGE_KEY, JSON.stringify(validMatches));
    }
    
    return validMatches;
  } catch (error) {
    console.error('Error reading finished matches from localStorage:', error);
    return {};
  }
};

/**
 * Mark a match as finished
 * @param {string} matchId - The match ID
 * @param {Object} matchData - The match data to store
 */
export const markMatchAsFinished = (matchId, matchData = null) => {
  if (typeof window === 'undefined') return;
  
  try {
    const finishedMatches = getFinishedMatches();
    finishedMatches[matchId] = {
      finishedAt: Date.now(),
      matchData: matchData
    };
    
    localStorage.setItem(FINISHED_MATCHES_STORAGE_KEY, JSON.stringify(finishedMatches));
    console.log(`✅ Marked match ${matchId} as finished at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('Error marking match as finished:', error);
  }
};

/**
 * Check if a match is finished (and still within retention period)
 * @param {string} matchId - The match ID
 * @returns {boolean} True if match is finished and within retention period
 */
export const isMatchFinished = (matchId) => {
  if (typeof window === 'undefined') return false;
  
  const finishedMatches = getFinishedMatches();
  return !!finishedMatches[matchId];
};

/**
 * Remove a match from finished matches (e.g., when it's been removed for more than 5 minutes)
 * @param {string} matchId - The match ID
 */
export const removeFinishedMatch = (matchId) => {
  if (typeof window === 'undefined') return;
  
  try {
    const finishedMatches = getFinishedMatches();
    delete finishedMatches[matchId];
    localStorage.setItem(FINISHED_MATCHES_STORAGE_KEY, JSON.stringify(finishedMatches));
    console.log(`🗑️ Removed match ${matchId} from finished matches`);
  } catch (error) {
    console.error('Error removing finished match:', error);
  }
};

/**
 * Check if a match should be shown in live matches
 * Returns true if:
 * 1. Match state is 'STARTED' (live), OR
 * 2. Match state is 'FINISHED' but within 5-minute retention period
 * 
 * @param {Object} match - The match object with state property
 * @returns {boolean} True if match should be shown
 */
export const shouldShowMatch = (match) => {
  if (!match || !match.id) return false;
  
  // If match is STARTED, always show it
  if (match.state === 'STARTED') {
    return true;
  }
  
  // If match is FINISHED, check if it's within retention period
  if (match.state === 'FINISHED') {
    // Mark as finished if not already marked
    if (!isMatchFinished(match.id)) {
      markMatchAsFinished(match.id, match);
    }
    
    // Show if within retention period
    return isMatchFinished(match.id);
  }
  
  // For other states (NOT_STARTED, etc.), don't show in live matches
  return false;
};

/**
 * Clean up expired finished matches (called periodically)
 */
export const cleanupExpiredFinishedMatches = () => {
  if (typeof window === 'undefined') return;
  
  const finishedMatches = getFinishedMatches();
  const now = Date.now();
  let cleanedCount = 0;
  
  Object.keys(finishedMatches).forEach(matchId => {
    const matchInfo = finishedMatches[matchId];
    const timeSinceFinished = now - matchInfo.finishedAt;
    
    if (timeSinceFinished >= FINISHED_MATCH_RETENTION_MS) {
      removeFinishedMatch(matchId);
      cleanedCount++;
    }
  });
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired finished matches`);
  }
};

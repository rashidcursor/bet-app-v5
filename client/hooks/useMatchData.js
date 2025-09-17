import { useState, useEffect } from 'react';
import matchesService from '../services/matches.service';

/**
 * Custom hook for fetching match data using the new clean APIs
 * @param {string|number} matchId - The match ID
 * @param {Object} options - Additional options
 * @returns {Object} - Match data, loading state, error state, and refetch function
 */
export const useMatchData = (matchId, options = {}) => {
  const [matchData, setMatchData] = useState(null);
  const [betOffers, setBetOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    useNewAPI = true, // Use new clean API by default
    includeOdds = true,
    includeLeague = true,
    includeParticipants = true
  } = options;

  useEffect(() => {
    const fetchMatchData = async () => {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        let data;
        
        if (useNewAPI) {
          // Use new clean API (from unibet-api)
          console.log(`🔍 Fetching match data for ${matchId} using new clean API...`);
          data = await matchesService.getBetOffersV2(matchId);
          
          if (data.success) {
            setMatchData(data);
            setBetOffers(data.data?.betOffers || []);
            console.log(`✅ Successfully fetched match data for ${matchId}`);
          } else {
            throw new Error(data.message || 'Failed to fetch match data');
          }
        } else {
          // Use old complex API (fallback)
          console.log(`🔍 Fetching match data for ${matchId} using old API...`);
          data = await matchesService.getMatchById(matchId, {
            includeOdds,
            includeLeague,
            includeParticipants
          });
          
          setMatchData(data);
          setBetOffers(data.data?.odds || []);
          console.log(`✅ Successfully fetched match data for ${matchId} using old API`);
        }
      } catch (err) {
        console.error('❌ Error fetching match data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMatchData();
  }, [matchId, useNewAPI, includeOdds, includeLeague, includeParticipants]);

  const refetch = async () => {
    if (matchId) {
      await fetchMatchData();
    }
  };

  return {
    matchData,
    betOffers,
    loading,
    error,
    refetch,
    // Additional data for new API
    eventId: matchData?.eventId,
    timestamp: matchData?.timestamp,
    source: matchData?.source || (useNewAPI ? 'unibet-api' : 'sportsmonk-api')
  };
};

/**
 * Custom hook for fetching live matches using the new clean API
 * @returns {Object} - Live matches data, loading state, error state, and refetch function
 */
export const useLiveMatches = () => {
  const [liveMatches, setLiveMatches] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLiveMatches = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 Fetching live matches using new clean API...');
        const data = await matchesService.getLiveMatchesV2();
        
        if (data.success) {
          setLiveMatches(data.matches || []);
          setAllMatches(data.allMatches || []);
          setUpcomingMatches(data.upcomingMatches || []);
          console.log(`✅ Successfully fetched ${data.totalMatches} live matches`);
        } else {
          throw new Error(data.message || 'Failed to fetch live matches');
        }
      } catch (err) {
        console.error('❌ Error fetching live matches:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveMatches();
  }, []);

  const refetch = async () => {
    await fetchLiveMatches();
  };

  return {
    liveMatches,
    allMatches,
    upcomingMatches,
    loading,
    error,
    refetch,
    totalMatches: liveMatches.length,
    totalAllMatches: allMatches.length,
    totalUpcomingMatches: upcomingMatches.length
  };
};

/**
 * Custom hook for fetching all football matches using the new clean API
 * @returns {Object} - All football matches data, loading state, error state, and refetch function
 */
export const useAllFootballMatches = () => {
  const [allMatches, setAllMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAllFootballMatches = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 Fetching all football matches using new clean API...');
        const data = await matchesService.getAllFootballMatchesV2();
        
        if (data.success) {
          setAllMatches(data.allMatches || []);
          setLiveMatches(data.matches || []);
          setUpcomingMatches(data.upcomingMatches || []);
          console.log(`✅ Successfully fetched ${data.totalAllMatches} total matches`);
        } else {
          throw new Error(data.message || 'Failed to fetch all football matches');
        }
      } catch (err) {
        console.error('❌ Error fetching all football matches:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllFootballMatches();
  }, []);

  const refetch = async () => {
    await fetchAllFootballMatches();
  };

  return {
    allMatches,
    liveMatches,
    upcomingMatches,
    loading,
    error,
    refetch,
    totalMatches: allMatches.length,
    totalLiveMatches: liveMatches.length,
    totalUpcomingMatches: upcomingMatches.length
  };
};

export default useMatchData;

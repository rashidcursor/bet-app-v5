import agenda from "./agenda.js";
import BetService from "../services/bet.service.js";
import LiveFixturesService from "../services/LiveFixtures.service.js";
import { UnibetCalcController } from "../controllers/unibetCalc.controller.js";
import { FotmobController } from "../controllers/fotmob.controller.js";

// Get LiveFixtures service instance
const getLiveFixturesService = () => {
  return global.liveFixturesService;
};

// Get FixtureOptimization service instance
const getFixtureOptimizationService = () => {
  return global.fixtureOptimizationService;
};

// Track if jobs are currently scheduled
let liveOddsJobScheduled = false;
let inplayMatchesJobScheduled = false;
let homepageCacheJobScheduled = false;
let betProcessingJobScheduled = false;
let fotmobCacheJobScheduled = false;

// Function to schedule live odds job
const scheduleLiveOddsJob = async () => {
  if (!liveOddsJobScheduled) {
    console.log('[Agenda] Scheduling updateLiveOdds job...');
    await agenda.every("1 second", "updateLiveOdds");
    liveOddsJobScheduled = true;
    console.log('[Agenda] updateLiveOdds job scheduled successfully');
  }
};

// Function to schedule homepage cache job
const scheduleHomepageCacheJob = async () => {
  if (!homepageCacheJobScheduled) {
    console.log('[Agenda] Scheduling refreshHomepageCache job...');
    await agenda.every("30 minutes", "refreshHomepageCache");
    homepageCacheJobScheduled = true;
    console.log('[Agenda] refreshHomepageCache job scheduled successfully');
  }
};

// Function to cancel homepage cache job
const cancelHomepageCacheJob = async () => {
  console.log('[Agenda] Cancelling refreshHomepageCache job...');
  await agenda.cancel({ name: 'refreshHomepageCache' });
  homepageCacheJobScheduled = false;
  console.log('[Agenda] refreshHomepageCache job cancelled successfully');
};

// Function to schedule inplay matches job
const scheduleInplayMatchesJob = async () => {
  if (!inplayMatchesJobScheduled) {
    console.log('[Agenda] Scheduling updateInplayMatches job...');
    await agenda.every("1 minutes", "updateInplayMatches");
    inplayMatchesJobScheduled = true;
    console.log('[Agenda] updateInplayMatches job scheduled successfully');
  }
};

// Function to cancel live odds job
const cancelLiveOddsJob = async () => {
  console.log('[Agenda] Cancelling updateLiveOdds job...');
  await agenda.cancel({ name: 'updateLiveOdds' });
  liveOddsJobScheduled = false;
  console.log('[Agenda] updateLiveOdds job cancelled successfully');
};

// Function to cancel inplay matches job
const cancelInplayMatchesJob = async () => {
  console.log('[Agenda] Cancelling updateInplayMatches job...');
  await agenda.cancel({ name: 'updateInplayMatches' });
  inplayMatchesJobScheduled = false;
  console.log('[Agenda] updateInplayMatches job cancelled successfully');
};

// Function to schedule bet processing job
const scheduleBetProcessingJob = async () => {
  if (!betProcessingJobScheduled) {
    console.log('[Agenda] Scheduling automated bet processing job...');
    await agenda.every("30 minutes", "processPendingBets");
    betProcessingJobScheduled = true;
    console.log('[Agenda] Automated bet processing job scheduled successfully');
  }
};

// Function to cancel bet processing job
const cancelBetProcessingJob = async () => {
  console.log('[Agenda] Cancelling automated bet processing job...');
  await agenda.cancel({ name: 'processPendingBets' });
  betProcessingJobScheduled = false;
  console.log('[Agenda] Automated bet processing job cancelled successfully');
};

// Function to schedule FotMob cache refresh job
const scheduleFotmobCacheJob = async () => {
  if (!fotmobCacheJobScheduled) {
    console.log('[Agenda] Scheduling FotMob multi-day cache refresh job...');
    await agenda.every("24 hours", "refreshFotmobMultidayCache");
    fotmobCacheJobScheduled = true;
    console.log('[Agenda] FotMob multi-day cache refresh job scheduled successfully');
  }
};

// Function to cancel FotMob cache refresh job
const cancelFotmobCacheJob = async () => {
  console.log('[Agenda] Cancelling FotMob multi-day cache refresh job...');
  await agenda.cancel({ name: 'refreshFotmobMultidayCache' });
  fotmobCacheJobScheduled = false;
  console.log('[Agenda] FotMob multi-day cache refresh job cancelled successfully');
};

// Function to check fixture cache and manage jobs accordingly
export const checkFixtureCacheAndManageJobs = async () => {
  const liveFixturesService = getLiveFixturesService();
  const fixtureOptimizationService = getFixtureOptimizationService();
  
  if (!liveFixturesService) {
    console.log('[Agenda] LiveFixtures service not available - cancelling all jobs');
    await cancelLiveOddsJob();
    await cancelInplayMatchesJob();
    await cancelHomepageCacheJob();
    return;
  }
  
  if (!fixtureOptimizationService) {
    console.log('[Agenda] FixtureOptimization service not available - cancelling homepage cache job');
    await cancelHomepageCacheJob();
  }
  
  const hasFixtureData = liveFixturesService.hasFixtureCacheData();
  
  if (hasFixtureData) {
    console.log('[Agenda] Fixture cache has data - scheduling inplay matches job');
    await scheduleInplayMatchesJob();
    
    // Check if there are actual live matches for live odds job
    const hasLiveMatches = checkForLiveMatches(liveFixturesService);
    if (hasLiveMatches) {
      console.log('[Agenda] Live matches found - scheduling live odds job');
      await scheduleLiveOddsJob();
    } else {
      console.log('[Agenda] No live matches found - cancelling live odds job');
      await cancelLiveOddsJob();
    }
    
    // Only schedule homepage cache job if service is available
    if (fixtureOptimizationService) {
      await scheduleHomepageCacheJob();
    }
  } else {
    console.log('[Agenda] Fixture cache is empty - cancelling all jobs');
    await cancelLiveOddsJob();
    await cancelInplayMatchesJob();
    await cancelHomepageCacheJob();
  }
  
  // Always schedule automated bet processing and FotMob cache refresh
  console.log('[Agenda] Scheduling automated bet processing job...');
  await scheduleBetProcessingJob();
  
  console.log('[Agenda] Scheduling FotMob multi-day cache refresh job...');
  await scheduleFotmobCacheJob();
};

// Function to check if there are live matches in cache
const checkForLiveMatches = (liveFixturesService) => {
  try {
    const inplayMatches = liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
    console.log(`[Agenda] Live matches count in cache: ${inplayMatches.length}`);
    return inplayMatches.length > 0;
  } catch (error) {
    console.error('[Agenda] Error checking live matches:', error);
    return false;
  }
};

// Function to check live matches and manage live odds job dynamically
export const checkLiveMatchesAndManageLiveOddsJob = async () => {
  const liveFixturesService = getLiveFixturesService();
  
  if (!liveFixturesService) {
    console.log('[Agenda] LiveFixtures service not available - cancelling live odds job');
    await cancelLiveOddsJob();
    return;
  }
  
  const hasLiveMatches = checkForLiveMatches(liveFixturesService);
  
  if (hasLiveMatches && !liveOddsJobScheduled) {
    console.log('[Agenda] Live matches detected - starting live odds job');
    await scheduleLiveOddsJob();
  } else if (!hasLiveMatches && liveOddsJobScheduled) {
    console.log('[Agenda] No live matches - stopping live odds job');
    await cancelLiveOddsJob();
  }
};

// Define the Agenda job for checking bet outcomes
agenda.define("checkBetOutcome", async (job) => {
  const { betId, matchId } = job.attrs.data;
  try {
    await BetService.checkBetOutcome(betId);
    console.log(
      `Bet ${betId} outcome checked by Agenda at ${new Date().toISOString()}`
    );
  } catch (error) {
    console.error(`Error checking bet ${betId} outcome via Agenda:`, error);
  }
});

// Define the Agenda job for updating live odds
agenda.define("updateLiveOdds", async (job) => {
  try { 
    console.log(`[Agenda] updateLiveOdds job starting at ${new Date().toISOString()}`);
    const liveFixturesService = getLiveFixturesService();
    
    if (!liveFixturesService) {
      console.warn('[Agenda] LiveFixtures service not available - skipping live odds update');
      return;
    }
    
    // Double-check that there are still live matches before updating odds
    const hasLiveMatches = checkForLiveMatches(liveFixturesService);
    if (!hasLiveMatches) {
      console.log('[Agenda] No live matches found during odds update - skipping');
      return;
    }
    
    await liveFixturesService.updateAllLiveOdds();
    console.log(`[Agenda] Live odds updated successfully at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[Agenda] Error updating live odds:", error);
  }
});

// Define inplay matches update job
agenda.define("updateInplayMatches", async (job) => {
  try {
    console.log('[Agenda] Starting updateInplayMatches job');
    const liveFixturesService = getLiveFixturesService();
    
    if (!liveFixturesService) {
      console.warn('[Agenda] LiveFixtures service not available - skipping inplay matches update');
      return;
    }
    
    await liveFixturesService.updateInplayMatches();
    console.log(`[Agenda] Inplay matches updated at ${new Date().toISOString()}`);
    
    // Check if matches were cached
    const cachedMatches = liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
    console.log(`[Agenda] Cached matches count: ${cachedMatches.length}`);
    
    // Check live matches and manage live odds job accordingly
    await checkLiveMatchesAndManageLiveOddsJob();
    
    // Immediately update odds for the live matches
    if (cachedMatches.length > 0) {
      console.log('[Agenda] Immediately updating odds for live matches');
      await liveFixturesService.updateInplayMatchesOdds();
    }
  } catch (error) {
    console.error("[Agenda] Error updating inplay matches:", error);
  }
});

// Define homepage cache refresh job
agenda.define("refreshHomepageCache", async (job) => {
  try {
    console.log(`[Agenda] Starting refreshHomepageCache job at ${new Date().toISOString()}`);
    
    // Get the fixture optimization service
    const fixtureOptimizationService = getFixtureOptimizationService();
    
    if (!fixtureOptimizationService) {
      console.warn('[Agenda] FixtureOptimizationService not available - skipping homepage cache refresh');
      return;
    }
    
    // Clear existing cache first
    const cacheKey = "homepage_data";
    fixtureOptimizationService.fixtureCache.del(cacheKey);
    console.log('[Agenda] Cleared existing homepage cache');
    
    // Fetch fresh homepage data (this will cache it automatically)
    await fixtureOptimizationService.getHomepageData();
    console.log(`[Agenda] Homepage cache refreshed successfully at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[Agenda] Error refreshing homepage cache:", error);
  }
});

// Define automated bet processing job
agenda.define("processPendingBets", async (job) => {
  try {
    const unibetCalcController = new UnibetCalcController();
    
    // Process pending bets (finished matches only)
    const result = await unibetCalcController.processAll({
      body: { limit: 50, onlyPending: true }
    }, {
      json: (data) => {
        // Only log if there were actual changes
        if (data.stats && (data.stats.processed > 0 || data.stats.failed > 0)) {
          console.log(`[Agenda] Bet processing: ${data.stats.processed} processed, ${data.stats.failed} failed`);
        }
      }
    });
    
    // Only log completion every 10th run to reduce noise
    if (job.attrs.nextRunAt && job.attrs.nextRunAt.getTime() % 10 === 0) {
      console.log(`[Agenda] Automated bet processing completed at ${new Date().toISOString()}`);
    }
  } catch (error) {
    console.error("[Agenda] Error in automated bet processing:", error);
  }
});

// Define FotMob multi-day cache refresh job
agenda.define("refreshFotmobMultidayCache", async (job) => {
  try {
    console.log(`[Agenda] Starting FotMob multi-day cache refresh job at ${new Date().toISOString()}`);
    
    const fotmobController = new FotmobController();
    
    // Refresh multi-day cache (7 days)
    await fotmobController.refreshMultidayCache({
      body: { days: 7 }
    }, {
      json: (data) => {
        console.log(`[Agenda] FotMob cache refresh completed:`, data);
      }
    });
    
    console.log(`[Agenda] FotMob multi-day cache refresh completed at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[Agenda] Error refreshing FotMob multi-day cache:", error);
  }
});

// Initialize agenda jobs
export const initializeAgendaJobs = async () => {
  try {
    await agenda.start();
    console.log('[Agenda] Agenda started successfully');
    
    // Aggressive cleanup - remove ALL existing jobs
    console.log('[Agenda] Cleaning up all existing jobs...');
    const existingJobs = await agenda.jobs({});
    console.log(`[Agenda] Found ${existingJobs.length} existing jobs to clean up`);
    
    // Cancel all jobs by name
    await agenda.cancel({ name: 'updateLiveOdds' });
    await agenda.cancel({ name: 'updateInplayMatches' });
    await agenda.cancel({ name: 'refreshHomepageCache' });
    await agenda.cancel({ name: 'processPendingBets' });
    await agenda.cancel({ name: 'refreshFotmobMultidayCache' });
    await agenda.cancel({ name: 'checkBetOutcome' }); // Cancel old bet outcome jobs
    
    // Remove any remaining jobs
    for (const job of existingJobs) {
      try {
        await job.remove();
      } catch (error) {
        console.warn(`[Agenda] Could not remove job ${job.attrs.name}:`, error.message);
      }
    }
    
    // Reset tracking flags
    liveOddsJobScheduled = false;
    inplayMatchesJobScheduled = false;
    homepageCacheJobScheduled = false;
    betProcessingJobScheduled = false;
    fotmobCacheJobScheduled = false;
    console.log('[Agenda] Cleaned up all existing jobs and reset tracking');
    
    // Wait a moment for services to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check fixture cache and manage jobs accordingly
    await checkFixtureCacheAndManageJobs();
    
    console.log('[Agenda] Agenda jobs initialization completed');
    
    // Log current scheduled jobs (summary only)
    const jobs = await agenda.jobs({});
    console.log(`[Agenda] Total scheduled jobs: ${jobs.length}`);
    
    // Group jobs by name and show summary
    const jobSummary = {};
    jobs.forEach(job => {
      const name = job.attrs.name;
      if (!jobSummary[name]) {
        jobSummary[name] = { count: 0, nextRun: job.attrs.nextRunAt, interval: job.attrs.repeatInterval };
      }
      jobSummary[name].count++;
    });
    
    Object.entries(jobSummary).forEach(([name, info]) => {
      console.log(`[Agenda] Job: ${name}, Count: ${info.count}, Next run: ${info.nextRun}, Interval: ${info.interval}`);
    });
    
  } catch (error) {
    console.error('[Agenda] Error initializing agenda:', error);
  }
};

// Set up agenda event listeners
export const setupAgendaListeners = () => {
  agenda.on("ready", () => {
    console.log("[Agenda] Ready and connected to MongoDB");
    // Initialize agenda after agenda is ready
    initializeAgendaJobs();
  });

  agenda.on("error", (err) => {
    console.error("[Agenda] Error:", err);
  });

  // Log when agenda jobs start executing
  agenda.on("start", (job) => {
    console.log(`[Agenda] Job "${job.attrs.name}" starting at ${new Date().toISOString()}`);
  });

  agenda.on("complete", (job) => {
    console.log(`[Agenda] Job "${job.attrs.name}" completed at ${new Date().toISOString()}`);
  });

  agenda.on("fail", (err, job) => {
    console.error(`[Agenda] Job "${job.attrs.name}" failed at ${new Date().toISOString()}:`, err);
  });
}; 
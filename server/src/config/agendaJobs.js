import agenda from "./agenda.js";
import BetService from "../services/bet.service.js";
import LiveFixturesService from "../services/LiveFixtures.service.js";
import { UnibetCalcController } from "../controllers/unibetCalc.controller.js";
import { FotmobController } from "../controllers/fotmob.controller.js";
import LeagueMappingAutoUpdate from "../services/leagueMappingAutoUpdate.service.js";
import Bet from "../models/Bet.js"; // ✅ NEW: Import Bet model for cancelled bets job
import { clearFotmobCookieCache } from "../utils/fotmobCookie.js";

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
let leagueMappingJobScheduled = false;

// Function to schedule live odds job
const scheduleLiveOddsJob = async () => {
  if (!liveOddsJobScheduled) {
    try {
      console.log('[Agenda] Scheduling updateLiveOdds job...');
      await agenda.every("1 second", "updateLiveOdds");
      liveOddsJobScheduled = true;
      console.log('[Agenda] updateLiveOdds job scheduled successfully');
    } catch (error) {
      console.error('[Agenda] Failed to schedule updateLiveOdds job:', error);
    }
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
    try {
      console.log('[Agenda] ⚙️ Scheduling automated bet processing job...');
      console.log('[Agenda] ⚙️ Job will run every 5 seconds');
      
      // ✅ FIX: Add timeout to prevent hanging
      const jobPromise = agenda.every("5 seconds", "processPendingBets");
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: agenda.every() took too long (10s)')), 10000)
      );
      const job = await Promise.race([jobPromise, timeoutPromise]);
      
    betProcessingJobScheduled = true;
      console.log('[Agenda] ✅ Automated bet processing job scheduled successfully');
      console.log(`[Agenda] ✅ Job ID: ${job.attrs._id}`);
      console.log(`[Agenda] ✅ Next run: ${job.attrs.nextRunAt}`);
      console.log(`[Agenda] ✅ Repeat interval: ${job.attrs.repeatInterval}`);
    } catch (error) {
      console.error('[Agenda] ❌ Failed to schedule bet processing job:', error);
      console.error('[Agenda] ❌ Error stack:', error.stack);
      // Don't throw - continue with other jobs
      console.warn('[Agenda] ⚠️ Continuing despite bet processing job scheduling failure...');
    }
  } else {
    console.log('[Agenda] ⚠️ Bet processing job already scheduled, skipping...');
  }
};

// Function to cancel bet processing job
const cancelBetProcessingJob = async () => {
  console.log('[Agenda] Cancelling automated bet processing job...');
  await agenda.cancel({ name: 'processPendingBets' });
  betProcessingJobScheduled = false;
  console.log('[Agenda] Automated bet processing job cancelled successfully');
};

// ✅ NEW: Function to schedule cancelled bets processing job
let cancelledBetsJobScheduled = false;
const scheduleCancelledBetsJob = async () => {
  if (!cancelledBetsJobScheduled) {
    try {
      console.log('[Agenda] ⚙️ Scheduling cancelled bets processing job...');
      console.log('[Agenda] ⚙️ Job will run every 10 minutes');
      
      // ✅ FIX: Add timeout to prevent hanging
      const jobPromise = agenda.every("10 minutes", "processCancelledBets");
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: agenda.every() took too long (10s)')), 10000)
      );
      const job = await Promise.race([jobPromise, timeoutPromise]);
      
      cancelledBetsJobScheduled = true;
      console.log('[Agenda] ✅ Cancelled bets processing job scheduled successfully');
      console.log(`[Agenda] ✅ Job ID: ${job.attrs._id}`);
      console.log(`[Agenda] ✅ Next run: ${job.attrs.nextRunAt}`);
      console.log(`[Agenda] ✅ Repeat interval: ${job.attrs.repeatInterval}`);
    } catch (error) {
      console.error('[Agenda] ❌ Failed to schedule cancelled bets processing job:', error);
      console.error('[Agenda] ❌ Error stack:', error.stack);
      // Don't throw - continue with other jobs
      console.warn('[Agenda] ⚠️ Continuing despite cancelled bets job scheduling failure...');
    }
  } else {
    console.log('[Agenda] ⚠️ Cancelled bets processing job already scheduled, skipping...');
  }
};

// Function to schedule FotMob cache refresh job
const scheduleFotmobCacheJob = async () => {
  // ✅ FIX: Check MongoDB for existing job first, not just in-memory flag
  let existingJob = null;
  try {
    const jobsPromise = agenda.jobs({ name: 'refreshFotmobMultidayCache' });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout checking existing jobs')), 5000)
    );
    const existingJobs = await Promise.race([jobsPromise, timeoutPromise]);
    existingJob = existingJobs && existingJobs.length > 0 ? existingJobs[0] : null;
    
    if (existingJob) {
      const nextRunPKT = existingJob.attrs.nextRunAt ? 
        new Date(existingJob.attrs.nextRunAt.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT') : 'N/A';
      console.log('[Agenda] 🔍 Found existing FotMob cache job in MongoDB:');
      console.log(`[Agenda]   Job ID: ${existingJob.attrs._id}`);
      console.log(`[Agenda]   Next run (PKT): ${nextRunPKT}`);
      console.log(`[Agenda]   Interval: ${existingJob.attrs.repeatInterval}`);
    } else {
      console.log('[Agenda] ℹ️ No existing FotMob cache job found in MongoDB');
    }
  } catch (error) {
    console.warn('[Agenda] ⚠️ Could not check existing FotMob cache job:', error.message);
    // Continue - will try to schedule anyway
  }

  // ✅ FIX: Only skip if job exists in MongoDB AND flag is true
  if (fotmobCacheJobScheduled && existingJob) {
    const nextRunPKT = existingJob.attrs.nextRunAt ? 
      new Date(existingJob.attrs.nextRunAt.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT') : 'N/A';
    console.log('[Agenda] ✅ FotMob cache refresh job already scheduled (verified in MongoDB), skipping...');
    console.log(`[Agenda] Existing job ID: ${existingJob.attrs._id}`);
    console.log(`[Agenda] Next run (PKT): ${nextRunPKT}`);
    return;
  }

  // ✅ FIX: If job doesn't exist in MongoDB, schedule it even if flag is true
  if (existingJob) {
    console.log('[Agenda] ℹ️ FotMob cache job exists in MongoDB, but flag was reset. Re-scheduling...');
    // Cancel existing job first to avoid duplicates
    try {
      await agenda.cancel({ name: 'refreshFotmobMultidayCache' });
      console.log('[Agenda] ✅ Cancelled existing job before re-scheduling');
    } catch (error) {
      console.warn('[Agenda] ⚠️ Could not cancel existing job:', error.message);
    }
  }

    try {
      // Schedule at 1:30 PM Pakistan Time (13:30 PKT)
      // Cron syntax: "minute hour dayOfMonth month dayOfWeek"
      // NOTE: Agenda.js interprets cron in SERVER'S LOCAL TIMEZONE
      // - On local dev (PKT): "30 13 * * *" = 1:30 PM PKT
      // - On Render (UTC): "30 8 * * *" = 8:30 UTC = 1:30 PM PKT
      const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const isUTC = serverTimezone === 'UTC' || process.env.TZ === 'UTC';
      const cronExpression = isUTC ? "30 8 * * *" : "30 13 * * *";
      
      console.log('[Agenda] ========================================');
      console.log('[Agenda] Scheduling FotMob cache refresh job...');
      console.log('[Agenda] Target Time: 13:30 PM (1:30 PM) PKT');
      console.log(`[Agenda] Server Timezone: ${serverTimezone} (isUTC: ${isUTC})`);
      console.log(`[Agenda] Cron Expression: "${cronExpression}"`);
      if (isUTC) {
        console.log('[Agenda] Using UTC cron: "30 8 * * *" = 8:30 UTC = 1:30 PM PKT');
      } else {
        console.log('[Agenda] Using PKT cron: "30 13 * * *" = 1:30 PM PKT');
      }
      console.log('[Agenda] ========================================');
      
      // ✅ FIX: Add timeout to prevent hanging
      const jobPromise = agenda.every(cronExpression, "refreshFotmobMultidayCache");
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: agenda.every() took too long (10s)')), 10000)
      );
      const scheduledJob = await Promise.race([jobPromise, timeoutPromise]);
      
      if (scheduledJob) {
        const nextRunPKT = scheduledJob.attrs.nextRunAt ? (() => {
          const pktDate = new Date(scheduledJob.attrs.nextRunAt);
          pktDate.setUTCHours(pktDate.getUTCHours() + 5); // Add 5 hours for PKT
          return pktDate.toISOString().replace('Z', ' PKT');
        })() : 'N/A';
        console.log('[Agenda] ✅ FotMob cache refresh job scheduled successfully!');
        console.log(`[Agenda] Job ID: ${scheduledJob.attrs._id}`);
        console.log(`[Agenda] Next run (UTC): ${scheduledJob.attrs.nextRunAt}`);
        console.log(`[Agenda] Next run (PKT): ${nextRunPKT}`);
        console.log(`[Agenda] Repeat interval: ${scheduledJob.attrs.repeatInterval}`);
    fotmobCacheJobScheduled = true;
      } else {
        console.error('[Agenda] ❌ Failed to schedule FotMob cache refresh job - no job returned');
      }
    } catch (error) {
      console.error('[Agenda] ❌ Error scheduling FotMob cache refresh job:', error);
      console.error('[Agenda] Error details:', error.stack);
      // Don't throw - continue with other operations
      console.warn('[Agenda] ⚠️ Continuing despite FotMob cache job scheduling failure...');
  }
};

// Function to cancel FotMob cache refresh job
const cancelFotmobCacheJob = async () => {
  console.log('[Agenda] Cancelling FotMob multi-day cache refresh job...');
  await agenda.cancel({ name: 'refreshFotmobMultidayCache' });
  fotmobCacheJobScheduled = false;
  console.log('[Agenda] FotMob multi-day cache refresh job cancelled successfully');
};

// Function to schedule League Mapping auto-update job
const scheduleLeagueMappingJob = async () => {
  console.log(`[Agenda] scheduleLeagueMappingJob called. Flag status: leagueMappingJobScheduled = ${leagueMappingJobScheduled}`);
  
  // ✅ FIX: Check MongoDB for existing job first, not just in-memory flag
  let existingJob = null;
  try {
    const jobsPromise = agenda.jobs({ name: 'updateLeagueMapping' });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout checking existing jobs')), 5000)
    );
    const existingJobs = await Promise.race([jobsPromise, timeoutPromise]);
    existingJob = existingJobs && existingJobs.length > 0 ? existingJobs[0] : null;
    
    if (existingJob) {
      const nextRunPKT = existingJob.attrs.nextRunAt ? 
        new Date(existingJob.attrs.nextRunAt.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT') : 'N/A';
      console.log('[Agenda] 🔍 Found existing League Mapping job in MongoDB:');
      console.log(`[Agenda]   Job ID: ${existingJob.attrs._id}`);
      console.log(`[Agenda]   Next run (PKT): ${nextRunPKT}`);
      console.log(`[Agenda]   Interval: ${existingJob.attrs.repeatInterval}`);
    } else {
      console.log('[Agenda] ℹ️ No existing League Mapping job found in MongoDB');
    }
  } catch (error) {
    console.warn('[Agenda] ⚠️ Could not check existing League Mapping job:', error.message);
    // Continue - will try to schedule anyway
  }

  // ✅ FIX: Only skip if job exists in MongoDB AND flag is true
  if (leagueMappingJobScheduled && existingJob) {
    const nextRunPKT = existingJob.attrs.nextRunAt ? 
      new Date(existingJob.attrs.nextRunAt.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT') : 'N/A';
    console.log('[Agenda] ✅ League Mapping job already scheduled (verified in MongoDB), skipping...');
    console.log(`[Agenda] Existing job ID: ${existingJob.attrs._id}`);
    console.log(`[Agenda] Next run (PKT): ${nextRunPKT}`);
    return;
  }

  // ✅ FIX: If job doesn't exist in MongoDB, schedule it even if flag is true
  if (existingJob) {
    console.log('[Agenda] ℹ️ League Mapping job exists in MongoDB, but flag was reset. Re-scheduling...');
    // Cancel existing job first to avoid duplicates
    try {
      await agenda.cancel({ name: 'updateLeagueMapping' });
      console.log('[Agenda] ✅ Cancelled existing job before re-scheduling');
    } catch (error) {
      console.warn('[Agenda] ⚠️ Could not cancel existing job:', error.message);
    }
  }
  
  try {
    // ✅ FIX: Schedule every 12 hours (at 00:01 and 12:01 Pakistan Time)
      // Cron syntax: "minute hour dayOfMonth month dayOfWeek"
      // IMPORTANT: Agenda.js uses server's LOCAL timezone for cron
    // - On local dev (PKT): "1 0,12 * * *" = 00:01 and 12:01 PKT
    // - On Render (UTC): "1 19,7 * * *" = 19:01 and 07:01 UTC = 00:01 and 12:01 PKT
      // Since we want same time on both, we need to detect timezone
      const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const isUTC = serverTimezone === 'UTC' || process.env.TZ === 'UTC';
    // Schedule job every 12 hours: 00:01 and 12:01 PKT
    // UTC: 19:01 (previous day) and 07:01 = 00:01 and 12:01 PKT
    // PKT: 00:01 and 12:01 = 00:01 and 12:01 PKT
    const cronExpression = isUTC ? "1 19,7 * * *" : "1 0,12 * * *";
      
      console.log('[Agenda] ========================================');
      console.log('[Agenda] Scheduling League Mapping auto-update job...');
    console.log('[Agenda] Target Time: Every 12 hours (00:01 and 12:01 PKT)');
      console.log(`[Agenda] Server Timezone: ${serverTimezone} (isUTC: ${isUTC})`);
      console.log(`[Agenda] Cron Expression: "${cronExpression}"`);
      if (isUTC) {
      console.log('[Agenda] Using UTC cron: "1 19,7 * * *" = 19:01 and 07:01 UTC = 00:01 and 12:01 PKT');
      } else {
      console.log('[Agenda] Using PKT cron: "1 0,12 * * *" = 00:01 and 12:01 PKT');
      }
      console.log('[Agenda] ========================================');
      
      console.log('[Agenda] About to call agenda.every() for updateLeagueMapping...');
      
      // ✅ FIX: Add timeout to prevent hanging
      const jobPromise = agenda.every(cronExpression, "updateLeagueMapping");
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: agenda.every() took too long (10s)')), 10000)
      );
      const scheduledJob = await Promise.race([jobPromise, timeoutPromise]);
      
      console.log('[Agenda] agenda.every() returned:', scheduledJob ? 'Job object' : 'null/undefined');
      
      if (scheduledJob) {
        const nextRunUTC = scheduledJob.attrs.nextRunAt;
        const nextRunPKT = nextRunUTC ? (() => {
          const pktDate = new Date(nextRunUTC);
          pktDate.setUTCHours(pktDate.getUTCHours() + 5); // Add 5 hours for PKT
          return pktDate.toISOString().replace('Z', ' PKT');
        })() : 'N/A';
        const now = new Date();
        const nowPKT = (() => {
          const pktDate = new Date(now);
          pktDate.setUTCHours(pktDate.getUTCHours() + 5); // Add 5 hours for PKT
          return pktDate.toISOString().replace('Z', ' PKT');
        })();
        
        console.log('[Agenda] ✅ League Mapping auto-update job scheduled successfully!');
        console.log(`[Agenda] Job ID: ${scheduledJob.attrs._id}`);
        console.log(`[Agenda] Server Timezone: ${serverTimezone}`);
        console.log(`[Agenda] Current time (UTC): ${now.toISOString()}`);
        console.log(`[Agenda] Current time (PKT): ${nowPKT}`);
        console.log(`[Agenda] Next run (UTC): ${nextRunUTC}`);
        console.log(`[Agenda] Next run (PKT): ${nextRunPKT}`);
        console.log(`[Agenda] Repeat interval: ${scheduledJob.attrs.repeatInterval}`);
        console.log(`[Agenda] Job type: ${scheduledJob.attrs.type}`);
        console.log(`[Agenda] Job data:`, JSON.stringify(scheduledJob.attrs.data || {}, null, 2));
        
        // Verify job will actually run
        if (nextRunUTC) {
          const timeUntilRun = nextRunUTC.getTime() - now.getTime();
          const minutesUntil = Math.floor(timeUntilRun / (1000 * 60));
          const secondsUntil = Math.floor((timeUntilRun % (1000 * 60)) / 1000);
          console.log(`[Agenda] ⏰ Time until next run: ${minutesUntil}m ${secondsUntil}s`);
          
          if (timeUntilRun < 0) {
            console.warn(`[Agenda] ⚠️ WARNING: Next run time is in the past! Job may not execute until tomorrow.`);
            console.warn(`[Agenda] ⚠️ Time difference: ${Math.abs(timeUntilRun / 1000)} seconds in the past`);
          } else if (timeUntilRun < 60000) {
            console.log(`[Agenda] ✅ Job will run in less than 1 minute!`);
          }
        }
        
        // Verify job exists in database
        try {
          const verifyJob = await agenda.jobs({ name: 'updateLeagueMapping' });
          console.log(`[Agenda] 🔍 Verification: Found ${verifyJob.length} updateLeagueMapping job(s) in database`);
          if (verifyJob.length > 0) {
            verifyJob.forEach((job, index) => {
              const verifyNextRun = job.attrs.nextRunAt;
              const verifyNextRunPKT = verifyNextRun ? (() => {
                const pktDate = new Date(verifyNextRun);
                pktDate.setUTCHours(pktDate.getUTCHours() + 5); // Add 5 hours for PKT
                return pktDate.toISOString().replace('Z', ' PKT');
              })() : 'N/A';
              console.log(`[Agenda]   Job ${index + 1}: ID=${job.attrs._id}, Next run (PKT)=${verifyNextRunPKT}`);
            });
          }
        } catch (verifyError) {
          console.warn(`[Agenda] ⚠️ Could not verify job in database:`, verifyError.message);
        }
        
        leagueMappingJobScheduled = true;
      } else {
        console.error('[Agenda] ❌ Failed to schedule League Mapping job - no job returned');
      }
    } catch (error) {
      console.error('[Agenda] ❌ Error scheduling League Mapping job:', error);
      console.error('[Agenda] Error details:', error.stack);
      // Don't throw - continue with other operations
      console.warn('[Agenda] ⚠️ Continuing despite League Mapping job scheduling failure...');
  }
};

// Function to schedule automatic user deactivation job
const scheduleUserDeactivationJob = async () => {
  try {
    console.log('[Agenda] ⚙️ Scheduling automatic user deactivation job...');
    console.log('[Agenda] ⚙️ Job will run daily at 2:00 AM to mark inactive users (14+ days) for admin display');
    
    // Schedule daily at 2:00 AM (server timezone)
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isUTC = serverTimezone === 'UTC' || process.env.TZ === 'UTC';
    // 2:00 AM local time = 21:00 UTC (previous day) for PKT
    const cronExpression = isUTC ? "0 21 * * *" : "0 2 * * *";
    
    console.log(`[Agenda] Server Timezone: ${serverTimezone} (isUTC: ${isUTC})`);
    console.log(`[Agenda] Cron Expression: "${cronExpression}"`);
    if (isUTC) {
      console.log('[Agenda] Using UTC cron: "0 21 * * *" = 21:00 UTC = 2:00 AM PKT');
    } else {
      console.log('[Agenda] Using local cron: "0 2 * * *" = 2:00 AM local time');
    }
    
    const jobPromise = agenda.every(cronExpression, "deactivateInactiveUsers");
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout: agenda.every() took too long (10s)')), 10000)
    );
    const job = await Promise.race([jobPromise, timeoutPromise]);
    
    console.log('[Agenda] ✅ Automatic user deactivation job scheduled successfully');
    console.log(`[Agenda] Job will run daily at 2:00 AM (${isUTC ? '21:00 UTC' : '2:00 AM local'})`);
  } catch (error) {
    console.error('[Agenda] ❌ Failed to schedule user deactivation job:', error.message);
  }
};

// Function to check fixture cache and manage jobs accordingly
export const checkFixtureCacheAndManageJobs = async () => {
  const liveFixturesService = getLiveFixturesService();
  const fixtureOptimizationService = getFixtureOptimizationService();
  
  // Cancel all SportsMonks API jobs to prevent continuous API calls
  // DISABLED: Continuously running SportsMonks API calls to prevent IP abuse
  // These jobs were making excessive API calls:
  // - updateLiveOdds: every 1 second (3,600 calls/hour)
  // - updateInplayMatches: every 1 minute (60 calls/hour)
  // - refreshHomepageCache: every 30 minutes (2 calls/hour)
  // All these jobs call SportsMonks API continuously and have been disabled
  console.log('[Agenda] DISABLED: Cancelling all SportsMonks API jobs to prevent IP abuse');
    await cancelLiveOddsJob();
    await cancelInplayMatchesJob();
    await cancelHomepageCacheJob();
  
  if (!liveFixturesService) {
    console.log('[Agenda] LiveFixtures service not available - SportsMonks jobs already cancelled');
    // Don't return early - still need to schedule bet processing job
  } else {
    const hasFixtureData = liveFixturesService.hasFixtureCacheData();
    console.log(`[Agenda] LiveFixtures service available, has fixture data: ${hasFixtureData}`);
  }
  
  if (!fixtureOptimizationService) {
    console.log('[Agenda] FixtureOptimization service not available - homepage cache job already cancelled');
  }
  
  console.log('[Agenda] SportsMonks API jobs disabled - no continuous API calls will be made');
  
  // ALWAYS schedule automated bet processing, FotMob cache refresh, and League Mapping update
  // These jobs don't depend on liveFixturesService, so they should always be scheduled
  console.log('[Agenda] Scheduling automated bet processing job...');
  try {
  await scheduleBetProcessingJob();
  } catch (error) {
    console.error('[Agenda] ❌ Failed to schedule bet processing job in checkFixtureCacheAndManageJobs:', error.message);
  }
  
  console.log('[Agenda] Scheduling cancelled bets processing job...');
  try {
    await scheduleCancelledBetsJob();
  } catch (error) {
    console.error('[Agenda] ❌ Failed to schedule cancelled bets job in checkFixtureCacheAndManageJobs:', error.message);
  }
  
  console.log('[Agenda] Scheduling FotMob multi-day cache refresh job...');
  try {
  await scheduleFotmobCacheJob();
  } catch (error) {
    console.error('[Agenda] ❌ Failed to schedule FotMob cache job in checkFixtureCacheAndManageJobs:', error.message);
  }
  
  console.log('[Agenda] Scheduling League Mapping auto-update job...');
  try {
    await scheduleLeagueMappingJob();
  } catch (error) {
    console.error('[Agenda] ❌ Failed to schedule League Mapping job in checkFixtureCacheAndManageJobs:', error.message);
  }
  
  console.log('[Agenda] Scheduling automatic user deactivation job...');
  try {
    await scheduleUserDeactivationJob();
  } catch (error) {
    console.error('[Agenda] ❌ Failed to schedule user deactivation job in checkFixtureCacheAndManageJobs:', error.message);
  }
  
  console.log('[Agenda] ✅ All job scheduling attempts completed');
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

// DISABLED: This job was making SportsMonks API calls every 1 second (3,600 calls/hour)
// This caused IP abuse issues. Job has been disabled.
// Define the Agenda job for updating live odds
agenda.define("updateLiveOdds", async (job) => {
  // JOB DISABLED: This job was causing excessive SportsMonks API calls
  console.log(`[Agenda] updateLiveOdds job DISABLED - was causing IP abuse (3,600 API calls/hour)`);
  return; // Exit immediately without making any API calls
});

// DISABLED: This job was making SportsMonks API calls every 1 minute (60 calls/hour)
// This caused IP abuse issues. Job has been disabled.
// Define inplay matches update job
agenda.define("updateInplayMatches", async (job) => {
  // JOB DISABLED: This job was causing excessive SportsMonks API calls
  console.log(`[Agenda] updateInplayMatches job DISABLED - was causing IP abuse (60 API calls/hour)`);
  return; // Exit immediately without making any API calls
});
    
// DISABLED: This job was making SportsMonks API calls every 30 minutes (2 calls/hour)
// This caused IP abuse issues. Job has been disabled.
// Define homepage cache refresh job
agenda.define("refreshHomepageCache", async (job) => {
  // JOB DISABLED: This job was causing excessive SportsMonks API calls
  console.log(`[Agenda] refreshHomepageCache job DISABLED - was causing IP abuse (2 API calls/hour)`);
  return; // Exit immediately without making any API calls
});

// Define automated bet processing job
agenda.define("processPendingBets", { concurrency: 5 }, async (job) => {
  try {
    const startTime = new Date();
    console.log(`\n[Agenda] ========================================`);
    console.log(`[Agenda] 🚀 Job "processPendingBets" STARTING`);
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ⏰ Time: ${startTime.toISOString()}`);
    console.log(`[Agenda] 📋 Job ID: ${job.attrs._id}`);
    console.log(`[Agenda] 🔍 Checking for pending bets...`);
    console.log(`[Agenda] 🔄 Concurrent batches enabled (max 5 concurrent instances)`);
    const unibetCalcController = new UnibetCalcController();
    
    // Create a mock response object to capture the JSON data
    let responseData = null;
    const mockRes = {
      json: (data) => {
        responseData = data;
        console.log(`[Agenda] 📊 Bet processing result:`, JSON.stringify(data, null, 2));
        if (data.stats) {
          console.log(`[Agenda] 📈 Statistics:`);
          console.log(`[Agenda]    - Total: ${data.stats.total}`);
          console.log(`[Agenda]    - Single bets: ${data.stats.single?.processed || 0} processed (${data.stats.single?.won || 0} won, ${data.stats.single?.lost || 0} lost, ${data.stats.single?.canceled || 0} canceled)`);
          console.log(`[Agenda]    - Combination bets: ${data.stats.combination?.processed || 0} processed (${data.stats.combination?.won || 0} won, ${data.stats.combination?.lost || 0} lost, ${data.stats.combination?.canceled || 0} canceled)`);
          console.log(`[Agenda]    - Failed: ${data.stats.failed || 0}`);
          if (data.stats.errors && data.stats.errors.length > 0) {
            console.log(`[Agenda]    - Errors:`, data.stats.errors);
          }
        }
      }
    };
    
    console.log(`[Agenda] 🔄 Calling processAll with limit: 50, onlyPending: true`);
    
    // Process pending bets (finished matches only)
    const result = await unibetCalcController.processAll({
      body: { limit: 50, onlyPending: true }
    }, mockRes);
    
    const endTime = new Date();
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);
    
    console.log(`[Agenda] ✅ processAll completed in ${duration}s`);
    console.log(`[Agenda] 📋 Result:`, result);
    
    // If no response data was captured, log a warning
    if (!responseData) {
      console.warn(`[Agenda] ⚠️ No response data captured from processAll`);
    }
    
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ✅ Job "processPendingBets" COMPLETED`);
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ⏰ Completed at: ${endTime.toISOString()}`);
    console.log(`[Agenda] ⏱️ Duration: ${duration}s\n`);
    
    // ✅ CRITICAL FIX: Force event loop to continue immediately
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after processPendingBets`);
    });
  } catch (error) {
    const errorTime = new Date();
    console.error(`\n[Agenda] ========================================`);
    console.error(`[Agenda] ❌ Job "processPendingBets" FAILED`);
    console.error(`[Agenda] ========================================`);
    console.error(`[Agenda] ⏰ Error at: ${errorTime.toISOString()}`);
    console.error(`[Agenda] ❌ Error in automated bet processing:`, error);
    console.error(`[Agenda] 📋 Error message:`, error.message);
    console.error(`[Agenda] 📋 Error stack:`, error.stack);
    console.error(`[Agenda] ========================================\n`);
    
    // ✅ CRITICAL FIX: Force event loop to continue even on error
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after processPendingBets error`);
    });
  }
});

// ✅ NEW: Define cancelled bets processing job (runs every 10 minutes)
agenda.define("processCancelledBets", async (job) => {
  try {
    const startTime = new Date();
    console.log(`\n[Agenda] ========================================`);
    console.log(`[Agenda] 🚀 Job "processCancelledBets" STARTING`);
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ⏰ Time: ${startTime.toISOString()}`);
    console.log(`[Agenda] 📋 Job ID: ${job.attrs._id}`);
    console.log(`[Agenda] 🔍 Checking for cancelled bets with retries remaining...`);
    
    const unibetCalcController = new UnibetCalcController();
    
    // Query: Only cancelled bets with maxRetryCount > 0
    const query = {
      status: { $in: ['cancelled', 'canceled'] },
      maxRetryCount: { $gt: 0 }
    };
    
    const bets = await Bet.find(query)
      .sort({ matchDate: 1 })
      .limit(50);
    
    console.log(`[Agenda] 📊 Found ${bets.length} cancelled bets with retries remaining`);
    
    if (bets.length === 0) {
      console.log(`[Agenda] ✅ No cancelled bets to process`);
      return;
    }
    
    // Force fresh FotMob cookie read from DB for this job run (avoids stale/expired cache)
    clearFotmobCookieCache();
    console.log(`[Agenda] 🍪 Cleared FotMob cookie cache – will use latest from DB for this run`);
    
    let processed = 0;
    let stillCancelled = 0;
    let resolved = 0;
    
    // Process each cancelled bet with 1 minute delay
    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i];
      const betNumber = i + 1;
      
      try {
        console.log(`\n[Agenda] 🔄 Processing cancelled bet ${betNumber}/${bets.length}`);
        console.log(`[Agenda]    - Bet ID: ${bet._id}`);
        console.log(`[Agenda]    - Current Status: ${bet.status}`);
        console.log(`[Agenda]    - Max Retry Count: ${bet.maxRetryCount}`);
        console.log(`[Agenda]    - Retry Count: ${bet.retryCount}`);
        
        let result;
        const betType = bet.combination && bet.combination.length > 0 ? 'combination' : 'single';
        
        if (betType === 'combination') {
          result = await unibetCalcController.processCombinationBetInternal(bet);
        } else {
          result = await unibetCalcController.processSingleBet(bet);
        }
        
        processed++;
        
        // If bet is still cancelled after processing, decrement maxRetryCount
        if (result.status === 'cancelled' || result.status === 'canceled') {
          stillCancelled++;
          await Bet.findByIdAndUpdate(bet._id, {
            $inc: { maxRetryCount: -1 },
            $set: { retryCount: bet.maxRetryCount - 1 }
          });
          console.log(`[Agenda]    - Still cancelled, decremented maxRetryCount: ${bet.maxRetryCount} → ${bet.maxRetryCount - 1}`);
        } else {
          resolved++;
          console.log(`[Agenda]    - ✅ Resolved! New status: ${result.status}`);
        }
        
        // Add 10 second delay before next bet (except for last one)
        if (i < bets.length - 1) {
          console.log(`[Agenda] ⏳ Waiting 10 seconds before processing next cancelled bet...`);
          await new Promise(resolve => setTimeout(resolve, 10 * 1000)); // 10 second delay
        }
        
      } catch (error) {
        console.error(`[Agenda] ❌ Error processing cancelled bet ${bet._id}:`, error.message);
        // Continue with next bet
      }
    }
    
    const endTime = new Date();
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);
    
    console.log(`\n[Agenda] ========================================`);
    console.log(`[Agenda] ✅ Job "processCancelledBets" COMPLETED`);
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ⏰ Completed at: ${endTime.toISOString()}`);
    console.log(`[Agenda] ⏱️ Duration: ${duration}s`);
    console.log(`[Agenda] 📊 Summary: ${processed} processed, ${resolved} resolved, ${stillCancelled} still cancelled`);
    console.log(`[Agenda] ========================================\n`);
    
    // ✅ CRITICAL FIX: Force event loop to continue immediately
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after processCancelledBets`);
    });
  } catch (error) {
    const errorTime = new Date();
    console.error(`\n[Agenda] ========================================`);
    console.error(`[Agenda] ❌ Job "processCancelledBets" FAILED`);
    console.error(`[Agenda] ========================================`);
    console.error(`[Agenda] ⏰ Error at: ${errorTime.toISOString()}`);
    console.error(`[Agenda] ❌ Error:`, error);
    console.error(`[Agenda] 📋 Error message:`, error.message);
    console.error(`[Agenda] 📋 Error stack:`, error.stack);
    console.error(`[Agenda] ========================================\n`);
    
    // ✅ CRITICAL FIX: Force event loop to continue even on error
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after processCancelledBets error`);
    });
  }
});

// Define League Mapping auto-update job
agenda.define("updateLeagueMapping", async (job) => {
  const now = new Date();
  const utcTime = now.toISOString();
  // Convert to Pakistan time (UTC+5)
  const pktTime = new Date(now.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT');
  
  console.log(`[Agenda] ========================================`);
  console.log(`[Agenda] 🕐 League Mapping Auto-Update Job STARTED`);
  console.log(`[Agenda] ========================================`);
  console.log(`[Agenda] UTC Time: ${utcTime}`);
  console.log(`[Agenda] Pakistan Time: ${pktTime}`);
  console.log(`[Agenda] Job ID: ${job.attrs._id}`);
  console.log(`[Agenda] Scheduled time: ${job.attrs.nextRunAt}`);
  
  // Add timeout wrapper (10 minutes max)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('League Mapping job timed out after 10 minutes'));
    }, 10 * 60 * 1000); // 10 minutes
  });
  
  try {
    const updater = new LeagueMappingAutoUpdate();
    
    // Race between execution and timeout
    const result = await Promise.race([
      updater.execute(),
      timeoutPromise
    ]);
    
    const endTime = new Date();
    const endUtcTime = endTime.toISOString();
    const endPktTime = new Date(endTime.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT');
    const duration = ((endTime.getTime() - now.getTime()) / 1000).toFixed(2);
    
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ✅ League Mapping Auto-Update Job COMPLETED`);
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] Completed at UTC: ${endUtcTime}`);
    console.log(`[Agenda] Completed at PKT: ${endPktTime}`);
    console.log(`[Agenda] Duration: ${duration} seconds`);
    console.log(`[Agenda] Result:`, JSON.stringify(result, null, 2));
    console.log(`[Agenda] ========================================`);
    console.log(''); // Empty line to ensure logs don't get stuck
    
    // ✅ CRITICAL FIX: Force event loop to continue immediately
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after League Mapping job`);
      // ✅ CRITICAL: Add nested setImmediate for extra safety
      setImmediate(() => {
        console.log(`[Agenda] 🔄 Nested setImmediate after League Mapping job executed`);
      });
    });
    
    return result;
  } catch (error) {
    const endTime = new Date();
    const endUtcTime = endTime.toISOString();
    const endPktTime = new Date(endTime.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT');
    const duration = ((endTime.getTime() - now.getTime()) / 1000).toFixed(2);
    
    console.error(`[Agenda] ========================================`);
    console.error(`[Agenda] ❌ League Mapping Auto-Update Job FAILED`);
    console.error(`[Agenda] ========================================`);
    console.error(`[Agenda] Started at UTC: ${utcTime}`);
    console.error(`[Agenda] Started at PKT: ${pktTime}`);
    console.error(`[Agenda] Failed at UTC: ${endUtcTime}`);
    console.error(`[Agenda] Failed at PKT: ${endPktTime}`);
    console.error(`[Agenda] Duration before failure: ${duration} seconds`);
    console.error(`[Agenda] Error:`, error.message || error);
    console.error(`[Agenda] Stack:`, error.stack);
    console.error(`[Agenda] ========================================\n`);
    
    // ✅ CRITICAL FIX: Force event loop to continue even on error
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after League Mapping job error`);
      // ✅ CRITICAL: Add nested setImmediate for extra safety
      setImmediate(() => {
        console.log(`[Agenda] 🔄 Nested setImmediate after League Mapping job error executed`);
      });
    });
    
    throw error;
  }
});

// Define FotMob multi-day cache refresh job
agenda.define("refreshFotmobMultidayCache", async (job) => {
  const now = new Date();
  const utcTime = now.toISOString();
  // Convert to Pakistan time (UTC+5)
  const pktTime = new Date(now.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT');
  
  console.log(`[Agenda] ========================================`);
  console.log(`[Agenda] 🕐 FotMob Cache Refresh Job STARTED`);
  console.log(`[Agenda] ========================================`);
  console.log(`[Agenda] UTC Time: ${utcTime}`);
  console.log(`[Agenda] Pakistan Time: ${pktTime}`);
  console.log(`[Agenda] Job ID: ${job.attrs._id}`);
  console.log(`[Agenda] Scheduled time: ${job.attrs.nextRunAt}`);
  
  try {
    
    const fotmobController = new FotmobController();
    
    // Refresh multi-day cache (20 days + yesterday = 21 days total)
    // Force refresh at scheduled time (11:00 PM PKT) - MUST refresh at this time
    const result = await fotmobController.refreshMultidayCache({
      body: { days: 20, forceRefresh: true }
    }, {
      json: (data) => {
        console.log(`[Agenda] FotMob cache refresh completed:`, data);
      }
    });
    
    
    const endTime = new Date();
    const endUtcTime = endTime.toISOString();
    const endPktTime = new Date(endTime.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT');
    const duration = ((endTime.getTime() - now.getTime()) / 1000).toFixed(2);
    
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] ✅ FotMob Cache Refresh Job COMPLETED`);
    console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] Completed at UTC: ${endUtcTime}`);
    console.log(`[Agenda] Completed at PKT: ${endPktTime}`);
    console.log(`[Agenda] Duration: ${duration} seconds`);
    console.log(`[Agenda] Result:`, result);
    console.log(`[Agenda] ✅ Job finished, returning control to event loop...`);
    
    // ✅ CRITICAL FIX: Force event loop to continue immediately
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after FotMob cache refresh`);
    });
    
    return result;
  } catch (error) {
    console.error(`[Agenda] ========================================`);
    console.error(`[Agenda] ❌ FotMob Cache Refresh Job FAILED`);
    console.error(`[Agenda] ========================================`);
    console.error(`[Agenda] Error at UTC: ${utcTime}`);
    console.error(`[Agenda] Error at PKT: ${pktTime}`);
    console.error("[Agenda] Error details:", error);
    console.error("[Agenda] Error stack:", error.stack);
    console.error(`[Agenda] ⚠️ Job failed, but continuing...`);
    
    // ✅ CRITICAL FIX: Force event loop to continue even on error
    setImmediate(() => {
      console.log(`[Agenda] 🔄 Event loop released after FotMob cache refresh error`);
    });
  }
});

// Define automatic user deactivation job
agenda.define("deactivateInactiveUsers", async (job) => {
  try {
    console.log('[Agenda] 🔄 Starting automatic user deactivation job...');
    const startTime = Date.now();
    
    const User = (await import('../models/User.js')).default;
    
    // Calculate date 14 days ago (2 weeks) - inactive label for admin display only; does not block login
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    
    console.log(`[Agenda] 📅 Checking for users inactive since: ${fourteenDaysAgo.toISOString()}`);
    
    // Find users who:
    // 1. Are currently active (isActive: true)
    // 2. Are not admin users (only mark regular users as inactive for display)
    // 3. Have lastLogin older than 14 days OR never logged in (lastLogin is null and account is older than 14 days)
    const inactiveUsers = await User.find({
      isActive: true,
      role: { $ne: 'admin' },
      $or: [
        { lastLogin: { $lt: fourteenDaysAgo } }, // Last login was more than 14 days ago
        { 
          lastLogin: null,
          createdAt: { $lt: fourteenDaysAgo } // Never logged in and account created more than 14 days ago
        }
      ]
    });
    
    if (inactiveUsers.length === 0) {
      console.log('[Agenda] ✅ No inactive users found to deactivate');
      return;
    }
    
    console.log(`[Agenda] 📊 Found ${inactiveUsers.length} inactive users to deactivate`);
    
    // Deactivate all inactive users
    const userIds = inactiveUsers.map(user => user._id);
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { isActive: false } }
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Agenda] ✅ Deactivated ${result.modifiedCount} inactive users in ${duration}s`);
    console.log(`[Agenda] 📋 Deactivated user emails:`, inactiveUsers.map(u => u.email).join(', '));
    
  } catch (error) {
    console.error('[Agenda] ❌ Error in deactivateInactiveUsers job:', error);
    throw error;
  }
});

// Track if jobs have been initialized to prevent duplicate initialization
let agendaJobsInitialized = false;

// Initialize agenda jobs
export const initializeAgendaJobs = async () => {
  console.log('[Agenda] 🚀 initializeAgendaJobs() called');
  
  // Prevent duplicate initialization
  if (agendaJobsInitialized) {
    console.log('[Agenda] ⚠️ Agenda jobs already initialized, skipping...');
    return;
  }
  
  console.log('[Agenda] ✅ Starting initialization (not previously initialized)');
  
  try {
    agendaJobsInitialized = true; // Set flag immediately to prevent race conditions
    
    // Reset scheduling flags to allow fresh scheduling
    betProcessingJobScheduled = false;
    fotmobCacheJobScheduled = false;
    leagueMappingJobScheduled = false;
    
    console.log('[Agenda] 🔄 Starting Agenda...');
    
    try {
      const startPromise = agenda.start();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: agenda.start() took too long (15s)')), 15000)
      );
      await Promise.race([startPromise, timeoutPromise]);
      
      console.log('[Agenda] ✅ Agenda started successfully');
      
      // ✅ CRITICAL FIX: Force event loop to continue after agenda.start()
      setImmediate(() => {
        console.log('[Agenda] 🔄 Event loop released after agenda.start()');
        // ✅ CRITICAL: Add nested setImmediate for extra safety
        setImmediate(() => {
          console.log('[Agenda] 🔄 Nested setImmediate after agenda.start() executed');
        });
      });
    } catch (error) {
      console.error('[Agenda] ❌ Error or timeout starting Agenda:', error.message);
      console.error('[Agenda] ⚠️ Continuing with initialization despite error...');
      // Try to continue - Agenda might still work
    }
    
    // Aggressive cleanup - remove ALL existing jobs
    console.log('[Agenda] Cleaning up all existing jobs...');
    let existingJobs = [];
    try {
      const jobsPromise = agenda.jobs({});
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: agenda.jobs() took too long (10s)')), 10000)
      );
      existingJobs = await Promise.race([jobsPromise, timeoutPromise]);
    console.log(`[Agenda] Found ${existingJobs.length} existing jobs to clean up`);
    } catch (error) {
      console.error('[Agenda] ❌ Error or timeout fetching existing jobs:', error.message);
      console.error('[Agenda] ⚠️ Continuing with cleanup despite error...');
      existingJobs = []; // Continue with empty array
    }
    
    // Log existing FotMob cache jobs before cleanup
    const existingFotmobJobs = existingJobs.filter(job => job.attrs.name === 'refreshFotmobMultidayCache');
    if (existingFotmobJobs.length > 0) {
      console.log(`[Agenda] Found ${existingFotmobJobs.length} existing FotMob cache job(s):`);
      existingFotmobJobs.forEach((job, index) => {
        const nextRunPKT = job.attrs.nextRunAt ? new Date(job.attrs.nextRunAt.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT') : 'N/A';
        console.log(`[Agenda]   Job ${index + 1}: ID=${job.attrs._id}, Next run (PKT)=${nextRunPKT}, Interval=${job.attrs.repeatInterval}`);
      });
    }
    
    // Cancel all jobs by name with timeouts
    console.log('[Agenda] Cancelling existing jobs...');
    const cancelOperations = [
      { name: 'updateLiveOdds' },
      { name: 'updateInplayMatches' },
      { name: 'refreshHomepageCache' },
      { name: 'processPendingBets' },
      { name: 'processCancelledBets' }, // ✅ NEW: Cancel cancelled bets job
      { name: 'refreshFotmobMultidayCache' },
      { name: 'updateLeagueMapping' },
      { name: 'deactivateInactiveUsers' }, // ✅ NEW: Cancel user deactivation job
      { name: 'checkBetOutcome' }
    ];

    for (const jobName of cancelOperations) {
      try {
        const cancelPromise = agenda.cancel({ name: jobName.name });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout: cancel(${jobName.name}) took too long (5s)`)), 5000)
        );
        const result = await Promise.race([cancelPromise, timeoutPromise]);
        if (jobName.name === 'refreshFotmobMultidayCache') {
          console.log(`[Agenda] Cancelled FotMob cache jobs: ${result} jobs removed`);
        } else if (jobName.name === 'updateLeagueMapping') {
          console.log(`[Agenda] Cancelled League Mapping jobs: ${result} jobs removed`);
        }
      } catch (error) {
        console.warn(`[Agenda] ⚠️ Could not cancel job ${jobName.name}: ${error.message}`);
        // Continue with next job
      }
    }
    
    // Remove any remaining jobs with timeout per operation
    console.log('[Agenda] Removing remaining jobs...');
    for (const job of existingJobs) {
      try {
        const removePromise = job.remove();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout: job.remove() took too long (3s)`)), 3000)
        );
        await Promise.race([removePromise, timeoutPromise]);
      } catch (error) {
        console.warn(`[Agenda] ⚠️ Could not remove job ${job.attrs?.name || 'unknown'}: ${error.message}`);
        // Continue with next job
      }
    }
    
    console.log(`[Agenda] Cleanup completed. All old jobs removed.`);
    
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
    // ✅ FIX: Add timeout to prevent hanging
    console.log('[Agenda] 🔍 Calling checkFixtureCacheAndManageJobs...');
    try {
      const checkPromise = checkFixtureCacheAndManageJobs();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: checkFixtureCacheAndManageJobs() took too long (30s)')), 30000)
      );
      await Promise.race([checkPromise, timeoutPromise]);
      console.log('[Agenda] ✅ checkFixtureCacheAndManageJobs completed');
    } catch (error) {
      console.error('[Agenda] ❌ Error or timeout in checkFixtureCacheAndManageJobs:', error.message);
      console.error('[Agenda] ⚠️ Continuing with initialization despite error...');
    }
    
    // Immediately refresh FotMob cache when server starts (force refresh on startup)
    // ✅ FIX: Run in background to avoid blocking server startup
    console.log('[Agenda] Triggering immediate FotMob cache refresh on server startup (non-blocking)...');
    // Don't await - let it run in background
    (async () => {
      try {
        const fotmobController = new FotmobController();
        console.log('[Agenda] Starting FotMob cache refresh in background...');
        const result = await fotmobController.refreshMultidayCache({
          body: { days: 20, forceRefresh: true }
        }, {
          json: (data) => {
            console.log(`[Agenda] FotMob cache refresh completed on startup:`, data);
          }
        });
        console.log('[Agenda] ✅ FotMob cache refresh completed successfully on startup');
        console.log('[Agenda] Background cache refresh finished');
        console.log('[Agenda] ✅ FotMob cache refresh async task completed - returning control');
        // ✅ CRITICAL: Force event loop to continue - don't let this block other operations
        setImmediate(() => {
          console.log('[Agenda] 🔄 FotMob cache refresh background task fully released');
          // ✅ CRITICAL FIX: Add another setImmediate to ensure event loop continues
          setImmediate(() => {
            console.log('[Agenda] 🔄 Event loop fully released after FotMob refresh (nested setImmediate)');
            // ✅ CRITICAL: Add one more setImmediate to ensure Agenda.js operations complete
            setImmediate(() => {
              console.log('[Agenda] 🔄 Final event loop release after FotMob refresh');
            });
          });
        });
      } catch (error) {
        console.error('[Agenda] ❌ Error refreshing FotMob cache on startup:', error);
        console.error('[Agenda] Error stack:', error.stack);
        // ✅ CRITICAL FIX: Force event loop to continue even on error
        setImmediate(() => {
          console.log('[Agenda] 🔄 Event loop released after FotMob cache refresh error');
        });
        // Don't block server startup if cache refresh fails
      }
    })().catch(err => {
      console.error('[Agenda] ❌ Unhandled error in FotMob cache refresh background task:', err);
      // ✅ CRITICAL FIX: Force event loop to continue even on unhandled error
      setImmediate(() => {
        console.log('[Agenda] 🔄 Event loop released after FotMob cache refresh unhandled error');
      });
    }); // Immediately invoked async function - runs in background
    
    // ✅ IMPORTANT: Continue immediately - don't wait for FotMob cache refresh
    console.log('[Agenda] ⏭️ FotMob cache refresh started in background, continuing with initialization...');
    
    // Immediately update League Mapping when server starts (force update on startup)
    // ✅ FIX: Run in background to avoid blocking server startup
    console.log('[Agenda] ========================================');
    console.log('[Agenda] 🚀 Triggering immediate League Mapping update on server startup');
    console.log('[Agenda] ========================================');
    // Don't await - let it run in background
    (async () => {
      try {
        console.log('[Agenda] 📦 Creating LeagueMappingAutoUpdate instance...');
        const updater = new LeagueMappingAutoUpdate();
        console.log('[Agenda] ✅ Instance created, starting execute()...');
        console.log('[Agenda] 🔄 Starting League Mapping update in background...');
        
        const startTime = Date.now();
        const result = await updater.execute();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('[Agenda] ========================================');
        console.log('[Agenda] ✅ League Mapping update completed successfully on startup');
        console.log(`[Agenda] ⏱️  Duration: ${duration} seconds`);
        console.log('[Agenda] 📊 Result:', JSON.stringify(result, null, 2));
        console.log('[Agenda] ========================================');
        console.log('[Agenda] Background League Mapping update finished');
        console.log('[Agenda] ✅ League Mapping update async task completed - returning control');
        
        // ✅ CRITICAL: Force event loop to continue - don't let this block other operations
        setImmediate(() => {
          console.log('[Agenda] 🔄 League Mapping update background task fully released');
          // ✅ CRITICAL FIX: Add another setImmediate to ensure event loop continues
          setImmediate(() => {
            console.log('[Agenda] 🔄 Event loop fully released after League Mapping update (nested setImmediate)');
            // ✅ CRITICAL: Add one more setImmediate to ensure Agenda.js operations complete
            setImmediate(() => {
              console.log('[Agenda] 🔄 Final event loop release after League Mapping update');
            });
          });
        });
      } catch (error) {
        console.error('[Agenda] ========================================');
        console.error('[Agenda] ❌ ERROR updating League Mapping on startup');
        console.error('[Agenda] ========================================');
        console.error('[Agenda] Error message:', error.message);
        console.error('[Agenda] Error name:', error.name);
        console.error('[Agenda] Error stack:', error.stack);
        console.error('[Agenda] ========================================');
        // ✅ CRITICAL FIX: Force event loop to continue even on error
        setImmediate(() => {
          console.log('[Agenda] 🔄 Event loop released after League Mapping update error');
        });
        // Don't block server startup if League Mapping update fails
      }
    })().catch(err => {
      console.error('[Agenda] ========================================');
      console.error('[Agenda] ❌ UNHANDLED ERROR in League Mapping update background task');
      console.error('[Agenda] ========================================');
      console.error('[Agenda] Error:', err);
      console.error('[Agenda] Error message:', err?.message);
      console.error('[Agenda] Error stack:', err?.stack);
      console.error('[Agenda] ========================================');
      // ✅ CRITICAL FIX: Force event loop to continue even on unhandled error
      setImmediate(() => {
        console.log('[Agenda] 🔄 Event loop released after League Mapping update unhandled error');
      });
    }); // Immediately invoked async function - runs in background
    
    // ✅ IMPORTANT: Continue immediately - don't wait for League Mapping update
    console.log('[Agenda] ⏭️ League Mapping update started in background, continuing with initialization...');
    console.log('[Agenda] ✅ Agenda jobs initialization completed');
    console.log('[Agenda] Server ready to accept requests');
    
    // ✅ CRITICAL: Defer job summary logging to next tick to ensure initialization completes first
    setImmediate(() => {
      // ✅ FIX: Make job summary logging non-blocking with strict timeout
      console.log('[Agenda] 📋 Proceeding to log job summary (non-blocking)...');
      // Don't await - let it run in background
      (async () => {
      // Wrap entire job summary in a timeout to prevent any blocking
      const summaryTimeout = setTimeout(() => {
        console.warn('[Agenda] ⚠️ Job summary logging timed out after 15s - skipping to prevent blocking');
      }, 15000); // 15 second overall timeout
      
      try {
    // Log current scheduled jobs (summary only)
        console.log('[Agenda] 🔍 Fetching scheduled jobs from database...');
        let jobs = [];
        try {
          // Add timeout to prevent hanging
          const jobsPromise = agenda.jobs({});
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout: agenda.jobs() took too long (10s)')), 10000)
          );
          jobs = await Promise.race([jobsPromise, timeoutPromise]);
          console.log(`[Agenda] ✅ Fetched ${jobs.length} jobs from database`);
        } catch (error) {
          console.error(`[Agenda] ❌ Error fetching jobs: ${error.message}`);
          console.error(`[Agenda] Continuing without job summary...`);
          clearTimeout(summaryTimeout);
          jobs = []; // Continue with empty jobs array
          return; // Exit early if can't fetch jobs
        }
        
        console.log(`\n[Agenda] ========================================`);
        console.log(`[Agenda] 📊 JOB SUMMARY`);
        console.log(`[Agenda] ========================================`);
    console.log(`[Agenda] Total scheduled jobs: ${jobs.length}`);
        
        if (jobs.length === 0) {
          console.error(`[Agenda] ⚠️ WARNING: No jobs scheduled!`);
        }
    
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
          const nextRunPKT = info.nextRun ? new Date(info.nextRun.getTime() + (5 * 60 * 60 * 1000)).toISOString().replace('Z', ' PKT') : 'N/A';
          console.log(`\n[Agenda] ─────────────────────────────────────`);
          console.log(`[Agenda] Job Name: ${name}`);
          console.log(`[Agenda] Count: ${info.count}`);
          console.log(`[Agenda] Next run (UTC): ${info.nextRun}`);
          console.log(`[Agenda] Next run (PKT): ${nextRunPKT}`);
          console.log(`[Agenda] Interval: ${info.interval}`);
          
          // Special logging for bet processing job
          if (name === 'processPendingBets') {
            console.log(`[Agenda] ⚙️ Bet Processing Job Status:`);
            console.log(`[Agenda]    - Scheduled: ${betProcessingJobScheduled ? 'YES ✅' : 'NO ❌'}`);
            if (info.nextRun) {
              const now = new Date();
              const timeUntilNext = info.nextRun.getTime() - now.getTime();
              const secondsUntil = Math.floor(timeUntilNext / 1000);
              console.log(`[Agenda]    - Time until next run: ${secondsUntil} seconds`);
            }
          }
          
          // Special logging for FotMob cache job
          if (name === 'refreshFotmobMultidayCache') {
            console.log(`[Agenda] ⏰ FotMob Cache Job Status:`);
            console.log(`[Agenda]    - Scheduled: ${fotmobCacheJobScheduled ? 'YES ✅' : 'NO ❌'}`);
            if (info.nextRun) {
              const now = new Date();
              const timeUntilNext = info.nextRun.getTime() - now.getTime();
              const hoursUntil = Math.floor(timeUntilNext / (1000 * 60 * 60));
              const minsUntil = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
              console.log(`[Agenda]    - Time until next run: ${hoursUntil}h ${minsUntil}m`);
            }
          }
          
          // Special logging for League Mapping job
          if (name === 'updateLeagueMapping') {
            console.log(`[Agenda] 🗺️ League Mapping Job Status:`);
            console.log(`[Agenda]    - Scheduled: ${leagueMappingJobScheduled ? 'YES ✅' : 'NO ❌'}`);
            if (info.nextRun) {
              const now = new Date();
              const timeUntilNext = info.nextRun.getTime() - now.getTime();
              const hoursUntil = Math.floor(timeUntilNext / (1000 * 60 * 60));
              const minsUntil = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
              console.log(`[Agenda]    - Time until next run: ${hoursUntil}h ${minsUntil}m`);
            }
          }
        });
        
        console.log(`[Agenda] ========================================\n`);
        
        // Add job status checker for debugging (runs every 5 minutes, less verbose)
        const checkJobStatus = async () => {
          try {
            const statusJobsPromise = agenda.jobs({ name: 'updateLeagueMapping' });
            const statusTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout: agenda.jobs() took too long (5s)')), 5000)
            );
            const jobs = await Promise.race([statusJobsPromise, statusTimeoutPromise]);
            
            if (jobs.length > 0) {
              jobs.forEach((job, index) => {
                const nextRunUTC = job.attrs.nextRunAt;
                const now = new Date();
                const timeUntil = nextRunUTC ? nextRunUTC.getTime() - now.getTime() : null;
                const minutesUntil = timeUntil ? Math.floor(timeUntil / (1000 * 60)) : null;
                
                // Only log if job is running or if there's an issue
                if (job.attrs.lockedAt || (timeUntil && timeUntil < 0)) {
                  const nextRunPKT = nextRunUTC ? (() => {
                    const pktDate = new Date(nextRunUTC);
                    pktDate.setUTCHours(pktDate.getUTCHours() + 5);
                    return pktDate.toISOString().replace('Z', ' PKT');
                  })() : 'N/A';
                  
                  console.log(`[Agenda] 📊 Job Status - updateLeagueMapping:`);
                  console.log(`[Agenda]   - Status: ${job.attrs.lockedAt ? 'RUNNING' : 'IDLE'}`);
                  console.log(`[Agenda]   - Next run (PKT): ${nextRunPKT}`);
                  console.log(`[Agenda]   - Time until run: ${minutesUntil ? (minutesUntil + 'm') : 'N/A'}`);
                }
              });
            } else {
              console.log('[Agenda] ⚠️ No updateLeagueMapping jobs found in database!');
            }
          } catch (error) {
            console.error('[Agenda] Error checking job status:', error.message);
          }
        };
        
        // Check job status every 5 minutes (reduced from 30 seconds for production)
        console.log('[Agenda] 🔍 Starting job status checker (every 5 minutes)...');
        // ✅ CRITICAL FIX: Wrap setInterval in setImmediate to ensure it doesn't block
        setImmediate(() => {
          setInterval(checkJobStatus, 300000); // 5 minutes = 300000ms
          // Run initial check after 10 seconds
          setTimeout(checkJobStatus, 10000);
        });
        
        // Clear timeout on successful completion
        clearTimeout(summaryTimeout);
        console.log('[Agenda] ✅ Job summary logging completed successfully');
        // ✅ CRITICAL FIX: Force event loop to continue after job summary logging
        setImmediate(() => {
          console.log('[Agenda] 🔄 Job summary logging async IIFE fully released');
        });
        
      } catch (error) {
        clearTimeout(summaryTimeout);
        console.error('[Agenda] ❌ Error in job summary logging:', error.message);
        console.error('[Agenda] ⚠️ Continuing despite error...');
      }
      })(); // ✅ Immediately invoked async function - runs in background
     
      // ✅ CRITICAL FIX: Add another setImmediate to ensure event loop continues
      setImmediate(() => {
        console.log('[Agenda] 🔄 Event loop released after job summary setImmediate');
       
      });
    }); // End of setImmediate for job summary
    
    // ✅ Final completion log - return immediately (BEFORE job summary)
    console.log('[Agenda] ✅ All agenda initialization steps completed');
    console.log('[Agenda] ✅ Function returning - server fully operational');
    
    // ✅ CRITICAL: Force event loop to continue - ensure no blocking operations
    setImmediate(() => {
      console.log('[Agenda] 🔄 Event loop released - all operations non-blocking');
      
      // ✅ CRITICAL: Add another setImmediate to ensure function truly returns
      setImmediate(() => {
        console.log('[Agenda] 🔄 initializeAgendaJobs fully released');
      });
    });
    
  } catch (error) {
    agendaJobsInitialized = false; // Reset flag on error so it can be retried
    console.error('[Agenda] Error initializing agenda:', error);
    throw error; // Re-throw so caller knows initialization failed
  }
};

// Set up agenda event listeners
export const setupAgendaListeners = () => {
  console.log('[Agenda] 🔧 Setting up Agenda listeners...');
  
  // Check if agenda is already ready (might happen if MongoDB connects quickly)
  if (agenda._ready) {
    console.log("[Agenda] ✅ Agenda already ready, initializing jobs immediately...");
    initializeAgendaJobs().catch(error => {
      console.error('[Agenda] ❌ Error initializing agenda jobs:', error);
    });
  } else {
    // Wait for ready event
  agenda.on("ready", () => {
      console.log("[Agenda] ✅ Ready and connected to MongoDB");
      console.log("[Agenda] 🚀 Initializing agenda jobs...");
    // Initialize agenda after agenda is ready
      initializeAgendaJobs().catch(error => {
        console.error('[Agenda] ❌ Error initializing agenda jobs:', error);
      });
  });
  }

  agenda.on("error", (err) => {
    console.error("[Agenda] ❌ Error:", err);
    console.error("[Agenda] Error stack:", err.stack);
  });

  // Log when agenda jobs start executing
  agenda.on("start:processPendingBets", (job) => {
    console.log(`\n[Agenda] ========================================`);
    console.log(`[Agenda] 🟢 Job "processPendingBets" STARTING`);
    console.log(`[Agenda] ⏰ Time: ${new Date().toISOString()}`);
    console.log(`[Agenda] 📋 Job ID: ${job.attrs._id}`);
    console.log(`[Agenda] ========================================\n`);
  });

  agenda.on("start:refreshFotmobMultidayCache", (job) => {
    console.log(`\n[Agenda] ========================================`);
    console.log(`[Agenda] 🟢 Job "refreshFotmobMultidayCache" STARTING`);
    console.log(`[Agenda] ⏰ Time: ${new Date().toISOString()}`);
    console.log(`[Agenda] 📋 Job ID: ${job.attrs._id}`);
    console.log(`[Agenda] ========================================\n`);
  });

  agenda.on("start:updateLeagueMapping", (job) => {
   
    
    console.log(`\n[Agenda] ========================================`);
    console.log(`[Agenda] 🟢 Job "updateLeagueMapping" STARTING`);
    console.log(`[Agenda] ⏰ Time: ${new Date().toISOString()}`);
    console.log(`[Agenda] 📋 Job ID: ${job.attrs._id}`);
    console.log(`[Agenda] Next run: ${job.attrs.nextRunAt}`);
    console.log(`[Agenda] ========================================\n`);
    
    
  });

  // Generic job start handler for any other jobs
  agenda.on("start", (job) => {
    const jobName = job.attrs.name;
    
    
    if (jobName !== 'processPendingBets' && jobName !== 'refreshFotmobMultidayCache' && jobName !== 'updateLeagueMapping') {
      console.log(`[Agenda] 🟢 Job "${jobName}" starting at ${new Date().toISOString()}`);
    }
  });

  agenda.on("complete", (job) => {
    const jobName = job.attrs.name;
   
    
    if (jobName === 'processPendingBets' || jobName === 'refreshFotmobMultidayCache' || jobName === 'updateLeagueMapping') {
      console.log(`\n[Agenda] ========================================`);
      console.log(`[Agenda] ✅ Job "${jobName}" COMPLETED`);
      console.log(`[Agenda] ⏰ Time: ${new Date().toISOString()}`);
      console.log(`[Agenda] ========================================\n`);
    } else {
      console.log(`[Agenda] ✅ Job "${jobName}" completed at ${new Date().toISOString()}`);
    }
    
    
  });

  agenda.on("fail", (err, job) => {
    const jobName = job.attrs.name;
    console.error(`\n[Agenda] ========================================`);
    console.error(`[Agenda] ❌ Job "${jobName}" FAILED`);
    console.error(`[Agenda] ⏰ Time: ${new Date().toISOString()}`);
    console.error(`[Agenda] Error:`, err);
    console.error(`[Agenda] Error stack:`, err.stack);
    console.error(`[Agenda] ========================================\n`);
  });

  console.log('[Agenda] ✅ Agenda listeners set up successfully');
}; 
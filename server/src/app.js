import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import connectDB from "./config/database.js";
import {
  notFound,
  errorHandler,
  requireAdmin,
  authenticateToken,
} from "./middlewares/index.js";
import sportsMonkRouter from "./routes/sportsMonk.routes.js";

import fixturesRouter from "./routes/fixtures.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import financeRoutes from "./routes/finance.routes.js";
import betRoutes from "./routes/bet.routes.js";
// New unibet-api routes
import betoffersRouter from "./routes/unibet-api/betoffers.js";
import liveMatchesRouter from "./routes/unibet-api/live-matches.js";
import fotmobRouter from "./routes/unibet-api/fotmob.routes.js";
import unibetCalcRouter from "./routes/unibet-api/unibet-calc.routes.js";
import breadcrumbsRouter from "./routes/unibet-api/breadcrumbs.js";
import liveMatchesApiRouter from "./routes/liveMatches.js";
import adminRoutes from "./routes/admin.routes.js";
import fixtureOptimizationService from "./services/fixture.service.js";
import LiveFixturesService from "./services/LiveFixtures.service.js";
import { initializeSocket } from "./config/socket.js";
import { setupAgendaListeners } from "./config/agendaJobs.js";

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 4000;

// Connect to MongoDB and wait for connection
const initializeDatabase = async () => {
  try {
    await connectDB();
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://69.197.164.180:3000",
      "http://69.197.164.180",
      "https://betting-website-tau.vercel.app",
      "https://betting-website-tau.vercel.app/",
      "https://betting-app-gules.vercel.app",
      "https://betting-app-gules.vercel.app/",
      "https://betting-gyfbehjhc-hassaan-2223s-projects.vercel.app",
      "https://betting-gyfbehjhc-hassaan-2223s-projects.vercel.app/",
        // ✅ NEW VERCEL DEPLOYMENT
        "https://bet-app-v1-qtnw.vercel.app",
        "https://bet-app-v1-qtnw.vercel.app/",
        // ✅ NEW VERCEL DEPLOYMENT V2
        "https://bet-app-v2.vercel.app",
        "https://bet-app-v2.vercel.app/",
        // ✅ NEW VERCEL DEPLOYMENT V3
        "https://bet-app-v3.vercel.app",
        "https://bet-app-v3.vercel.app/",
        // ✅ NEW VERCEL DEPLOYMENT V4
        "https://bet-app-v4.vercel.app",
        "https://bet-app-v4.vercel.app/",
        // ✅ WILDCARD FOR ALL VERCEL DEPLOYMENTS (handles preview deployments)
        /^https:\/\/bet-app-v1.*\.vercel\.app$/,
        /^https:\/\/bet-app-v2.*\.vercel\.app$/,
        /^https:\/\/bet-app-v3.*\.vercel\.app$/,
        /^https:\/\/bet-app-v4.*\.vercel\.app$/,
        /^https:\/\/betting.*\.vercel\.app$/,
      ];
      
      if (allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') {
          return origin === allowed;
        } else if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return false;
      })) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.use(express.json());
app.use(cookieParser());

// Simple Morgan configuration - shows device and request type
morgan.token("device", (req) => {
  const userAgent = req.headers["user-agent"] || "Unknown";
  if (userAgent.includes("Mobile")) return "Mobile";
  if (userAgent.includes("Tablet")) return "Tablet";
  if (userAgent.includes("Chrome")) return "Chrome Browser";
  if (userAgent.includes("Firefox")) return "Firefox Browser";
  if (userAgent.includes("Safari")) return "Safari Browser";
  if (userAgent.includes("Postman")) return "Postman";
  if (userAgent.includes("curl")) return "cURL";
  return "Unknown Device";
});

// Custom format: Device and Request Type
app.use(morgan(":device made :method request to: :url"));



// Check if fixtureOptimizationService is properly imported
if (!fixtureOptimizationService) {
  console.error('[App] ERROR: fixtureOptimizationService import failed!');
  process.exit(1);
}

console.log('[App] fixtureOptimizationService:', typeof fixtureOptimizationService);
console.log('[App] fixtureOptimizationService.fixtureCache:', typeof fixtureOptimizationService.fixtureCache);

// Set global services
global.fixtureOptimizationService = fixtureOptimizationService;

// Create LiveFixtures service
const liveFixturesService = new LiveFixturesService(fixtureOptimizationService.fixtureCache);
global.liveFixturesService = liveFixturesService;

console.log('[App] Global services initialized successfully');
console.log('[App] liveFixturesService:', typeof liveFixturesService);
console.log('[App] global.fixtureOptimizationService:', typeof global.fixtureOptimizationService);
console.log('[App] global.liveFixturesService:', typeof global.liveFixturesService);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      fixtureOptimizationService: !!global.fixtureOptimizationService,
      liveFixturesService: !!global.liveFixturesService
    }
  });
});

// Manual trigger for live matches update
app.get("/api/live-matches/trigger", async (req, res) => {
  try {
    const liveFixturesService = global.liveFixturesService;
    if (liveFixturesService) {
      await liveFixturesService.updateInplayMatches();
      const cachedMatches = liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
      
      // Also update odds immediately
      if (cachedMatches.length > 0) {
        await liveFixturesService.updateInplayMatchesOdds();
      }
      
      res.json({
        success: true,
        message: `Updated ${cachedMatches.length} live matches`,
        matches: cachedMatches
      });
    } else {
      res.status(500).json({ success: false, message: "LiveFixtures service not available" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Manual trigger for live odds update only
app.get("/api/live-odds/trigger", async (req, res) => {
  try {
    const liveFixturesService = global.liveFixturesService;
    if (liveFixturesService) {
      await liveFixturesService.updateAllLiveOdds();
      res.json({
        success: true,
        message: "Live odds updated successfully"
      });
    } else {
      res.status(500).json({ success: false, message: "LiveFixtures service not available" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/sportsmonk", sportsMonkRouter);
app.use("/api/fixtures", fixturesRouter);
app.use("/api/finance", authenticateToken, financeRoutes);
app.use("/api/bet", betRoutes);
// New unibet-api routes
app.use("/api/v2/betoffers", betoffersRouter);
app.use("/api/v2/live-matches", liveMatchesRouter);
app.use("/api/v2/fotmob", fotmobRouter);
app.use("/api/v2/unibet-calc", unibetCalcRouter);
app.use("/api/v2/breadcrumbs", breadcrumbsRouter);
app.use("/api/matches", liveMatchesApiRouter);
app.use("/api/admin", adminRoutes);

// 404 handler - must be after all routes
app.use(notFound);
// Global error handler - must be last middleware
app.use(errorHandler);

// Initialize Socket.IO
const io = initializeSocket(server);

// Set Socket.IO instance in LiveFixtures service
liveFixturesService.setSocketIO(io);

// Make io available to services
app.set('io', io);

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.log('🔄 Server will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('🔄 Server will continue running...');
});

// Initialize everything in proper order
const initializeApp = async () => {
  try {
    // 1. Connect to database first
    await initializeDatabase();
    
    // 2. Set up Agenda listeners (after database is connected)
    setupAgendaListeners();
    
    // 2.5. Explicitly initialize agenda jobs after a short delay to ensure MongoDB is ready
    // This ensures jobs are scheduled even if "ready" event doesn't fire
    // ✅ FIX: Run in background to avoid blocking
    console.log('[App] ⏳ Waiting 2 seconds before initializing agenda jobs...');
    setTimeout(() => {
      (async () => {
        try {
          console.log('[App] ========================================');
          console.log('[App] 🔄 Initializing agenda jobs (including League Mapping update)...');
          console.log('[App] ========================================');
          
          const { initializeAgendaJobs } = await import('./config/agendaJobs.js');
          console.log('[App] ✅ initializeAgendaJobs imported successfully');
          console.log('[App] 🔄 Calling initializeAgendaJobs()...');
          
          await initializeAgendaJobs();
          
          console.log('[App] ========================================');
          console.log('[App] ✅ Agenda jobs initialized successfully');
          console.log('[App] ✅ League Mapping update should be running in background');
          console.log('[App] ✅ Server fully ready to accept requests');
          console.log('[App] ========================================');
          
        } catch (error) {
          console.error('[App] ========================================');
          console.error('[App] ❌ ERROR initializing agenda jobs');
          console.error('[App] ========================================');
          console.error('[App] Error message:', error.message);
          console.error('[App] Error name:', error.name);
          console.error('[App] Error stack:', error.stack);
          console.error('[App] ========================================');
          // Don't block server startup
        }
      })(); // Immediately invoked async function - runs in background
    }, 2000); // Wait 2 seconds for MongoDB connection to stabilize
    
    // 3. Start the server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API URL: http://localhost:${PORT}/api`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket server ready on port ${PORT}`);
      console.log(`✅ Server is ready to accept connections`);
      console.log(`📝 Note: Background jobs (FotMob cache, Agenda) are initializing asynchronously`);
    });
    
    // 4. Initialize live matches after a short delay
    setTimeout(initializeLiveMatches, 3000);
    
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    // Don't exit, just log the error and continue
    console.log('🔄 Server will continue running without database...');
  }
};

// Initialize live matches on startup (non-blocking)
const initializeLiveMatches = async () => {
  try {
    console.log('🚀 [Startup] Initializing live matches...');
    const liveFixturesService = global.liveFixturesService;
    if (liveFixturesService) {
      // Check if fixture cache has data before proceeding
      if (!liveFixturesService.hasFixtureCacheData()) {
        console.log('🚀 [Startup] Fixture cache is empty - skipping live matches initialization');
        return;
      }
      
      // Schedule the update but don't wait for it (non-blocking)
      setImmediate(() => {
        liveFixturesService.updateInplayMatches().then(() => {
          const cachedMatches = liveFixturesService.inplayMatchesCache.get('inplay_matches') || [];
          console.log(`🚀 [Startup] Cached ${cachedMatches.length} live matches on startup`);
          
          // Also update odds immediately (non-blocking)
          if (cachedMatches.length > 0) {
            setImmediate(() => {
              liveFixturesService.updateInplayMatchesOdds().then(() => {
                console.log('🚀 [Startup] Updated odds for live matches on startup');
              }).catch(error => {
                console.error('❌ [Startup] Error updating odds:', error);
              });
            });
          }
        }).catch(error => {
          console.error('❌ [Startup] Error initializing live matches:', error);
        });
      });
    }
  } catch (error) {
    console.error('❌ [Startup] Error in live matches initialization:', error);
  }
};

// Start the application
initializeApp();

// Export server instead of app for Socket.IO
export { server as default };

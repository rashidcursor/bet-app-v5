import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
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
import agenda from "./config/agenda.js";
import BetService from "./services/bet.service.js";
import fixtureOptimizationService from "./services/fixture.service.js";
import LiveFixturesService from "./services/LiveFixtures.service.js";

const app = express();
const PORT = process.env.PORT || 4000;

// Connect to MongoDB
connectDB();

app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || "http://localhost:3000",
      "https://betting-website-tau.vercel.app", // Remove trailing slash
      "https://betting-website-tau.vercel.app/",
    ],
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

// Initialize global services before routes
console.log('[App] Initializing global services...');

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

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/sportsmonk", sportsMonkRouter);
app.use("/api/fixtures", fixturesRouter);
app.use("/api/finance", authenticateToken, financeRoutes);
app.use("/api/bet", betRoutes);

// 404 handler - must be after all routes
app.use(notFound);
// Global error handler - must be last middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});

//INFO: checking the bet outcome of a bet at a scheduled time
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
// Scheduled job to update live match odds every 3 minutes
agenda.define("updateLiveOdds", async (job) => {
  try {
    await liveFixturesService.updateAllLiveOdds();
    // Log successful completion of live odds update job
    console.log(`[Agenda] Live odds updated at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[Agenda] Error updating live odds:", error);
  }
});

// Define inplay matches update job (every 5 minutes)
agenda.define("updateInplayMatches", async (job) => {
  try {
    await liveFixturesService.updateInplayMatches();
    console.log(`[Agenda] Inplay matches updated at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[Agenda] Error updating inplay matches:", error);
  }
});

// Initialize agenda jobs
async function initializeAgenda() {
  try {
    await agenda.start();
    console.log('[App] Agenda started successfully');
    
    // Schedule recurring jobs
    await agenda.every("1 second", "updateLiveOdds"); // Update odds every 2 seconds
    await agenda.every("5 minutes", "updateInplayMatches"); // Update inplay matches every 5 minutes
    
    console.log('[App] All agenda jobs initialized successfully');
  } catch (error) {
    console.error('[App] Error initializing agenda:', error);
  }
}

// Schedule the jobs when agenda is ready
agenda.on("ready", () => {
  console.log("[Agenda] Ready and connected to MongoDB");
  // Initialize agenda after agenda is ready
  initializeAgenda();
});

agenda.on("error", (err) => {
  console.error("[Agenda] Error:", err);
});

// Log when agenda jobs start executing
agenda.on("start", (job) => {
  console.log(`[Agenda] Job ${job.attrs.name} starting. Data:`, job.attrs.data);
});

agenda.on("fail", (err, job) => {
  console.error(`[Agenda] Job ${job.attrs.name} failed:`, err);
});

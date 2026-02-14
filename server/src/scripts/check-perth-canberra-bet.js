/**
 * Diagnostic script: Perth Glory (W) vs Canberra United (W) ki bet(s) kyon process nahi ho rahi / slow
 * Run from server/: node src/scripts/check-perth-canberra-bet.js
 */
import "dotenv/config";
import connectDB from "../config/database.js";
import Bet from "../models/Bet.js";
import LeagueMapping from "../models/LeagueMapping.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  await connectDB();

  // 1) Find all pending bets (same query as processAll) to get order and count
  const allPending = await Bet.find({
    $or: [
      { status: "pending", $or: [{ combination: { $exists: false } }, { combination: [] }, { combination: { $size: 0 } }] },
      { status: "pending", combination: { $exists: true, $ne: [], $not: { $size: 0 } } },
      { combination: { $exists: true, $ne: [], $elemMatch: { status: "pending" } } },
    ],
  })
    .sort({ matchDate: 1 })
    .limit(200)
    .lean();

  // 2) Find bet(s) for Perth Glory vs Canberra (team names) – broad search
  const bets = allPending.filter((b) => {
    const home = (b.unibetMeta?.homeName || "").toLowerCase();
    const away = (b.unibetMeta?.awayName || "").toLowerCase();
    const teams = (b.teams || "").toLowerCase();
    const allText = [home, away, teams].join(" ");
    const hasPerth = allText.includes("perth");
    const hasCanberra = allText.includes("canberra");
    return hasPerth && hasCanberra;
  });

  console.log("\n=== Perth Glory (W) vs Canberra United (W) – Diagnostic ===\n");
  console.log(`Total pending bets (first 200 by matchDate): ${allPending.length}`);
  console.log(`Bets for this match found: ${bets.length}`);
  if (allPending.length > 0) {
    console.log("\nFirst 3 pending bets (by matchDate):");
    allPending.slice(0, 3).forEach((b, i) => {
      console.log(`  ${i + 1}. matchId: ${b.matchId} | teams: ${(b.teams || "").slice(0, 50)} | matchDate: ${b.matchDate}`);
    });
  }
  console.log("");

  if (bets.length === 0) {
    console.log("No pending bet found for Perth Glory vs Canberra in first 200. Exiting.");
    process.exit(0);
  }

  for (const bet of bets) {
    const homeName = bet.unibetMeta?.homeName || "N/A";
    const awayName = bet.unibetMeta?.awayName || "N/A";
    const leagueId = bet.leagueId || bet.unibetMeta?.leagueId;
    const leagueName = bet.leagueName || bet.unibetMeta?.leagueName;
    const matchDate = bet.matchDate;

    // Queue position: index in allPending (1-based)
    const queueIndex = allPending.findIndex((p) => String(p._id) === String(bet._id));
    const queuePosition = queueIndex >= 0 ? queueIndex + 1 : "?";

    console.log("--- Bet ---");
    console.log("  _id:", bet._id);
    console.log("  matchId:", bet.matchId);
    console.log("  teams:", bet.teams);
    console.log("  homeName:", homeName, "| awayName:", awayName);
    console.log("  leagueId:", leagueId, "| leagueName:", leagueName);
    console.log("  matchDate:", matchDate);
    console.log("  status:", bet.status);
    console.log("  betOutcomeCheckTime:", bet.betOutcomeCheckTime);
    console.log("  lastFotmobCheckTime:", bet.lastFotmobCheckTime);
    console.log("  fetchDetailsRetryCount:", bet.fetchDetailsRetryCount);
    console.log("\n  Queue position (matchDate order):", queuePosition, "of", allPending.length);
    console.log("  processAll limit is 50 → in batch only if position <= 50.\n");

    // League mapping
    if (leagueId) {
      const mapping = await LeagueMapping.findOne({ unibetId: String(leagueId) }).lean();
      if (mapping) {
        console.log("  League mapping: OK");
        console.log("    fotmobId:", mapping.fotmobId, "| fotmobName:", mapping.fotmobName);
      } else {
        console.log("  League mapping: NOT FOUND for leagueId:", leagueId);
        console.log("    → FOTMOB_LEAGUE_NOT_FOUND possible.");
      }
    } else {
      console.log("  League mapping: leagueId missing on bet.");
    }

    // FotMob cache for match date (PKT - same as getCachedDailyMatches)
    if (matchDate) {
      const d = new Date(matchDate);
      const pktFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Karachi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const dateFormatted = pktFormatter.format(d);
      const dateStr = dateFormatted.replace(/-/g, "");
      const cachePath = path.join(__dirname, "../storage/fotmob", `fotmob_matches_${dateStr}_${dateFormatted}.json`);
      const multidayPath = path.join(__dirname, "../storage/fotmob/fotmob_multiday_cache.json");
      const dailyExists = fs.existsSync(cachePath);
      const multidayExists = fs.existsSync(multidayPath);
      console.log("\n  FotMob cache (match date in PKT):");
      console.log("    PKT date:", dateFormatted, "(", dateStr, ")");
      console.log("    Daily cache exists:", dailyExists, "→", path.basename(cachePath));
      console.log("    Multiday cache exists:", multidayExists);
      if (!dailyExists && !multidayExists) {
        console.log("    → No cache for this date; live API used. Women's league may be missing on that date.");
      }
    }
    console.log("\n");
  }

  console.log("Done. Fix: ensure league mapping, FotMob data for that date; increase limit or use 3 parallel batches for speed.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

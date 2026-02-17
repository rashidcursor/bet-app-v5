/**
 * Test script: use @max-xoo/fotmob package to fetch match details.
 * Run from server/: node src/scripts/fotmob-get-match-details.js
 *
 * Usage: node src/scripts/fotmob-get-match-details.js [matchId]
 * Default matchId: 4873840 (Valencia Mestalla vs UD Poblense) and 4946747 (Shamakhi FK vs Turan Tovuz)
 *
 * Note: The package calls /api/matchDetails (404). The correct FotMob path is /api/data/matchDetails.
 * This script tests both: (1) package getMatchDetails, (2) direct GET to correct URL with same token.
 */

import Fotmob from "@max-xoo/fotmob";
import axios from "axios";

const DEFAULT_MATCH_IDS = [4873840, 4946747];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function summarizeMatchDetails(data) {
  if (!data) return { summary: "no data", raw: data };
  const general = data.general || {};
  const header = data.header || {};
  const teams = header.teams || [];
  return {
    summary: {
      matchId: general.matchId,
      matchName: general.matchName,
      leagueName: general.leagueName,
      homeTeam: general.homeTeam?.name ?? teams[0]?.name,
      awayTeam: general.awayTeam?.name ?? teams[1]?.name,
      finished: general.finished,
      started: general.started,
      scoreStr: header.status?.scoreStr,
      reason: header.status?.reason?.short,
    },
    general: pick(general, ["matchId", "matchName", "leagueId", "leagueName", "finished", "started", "matchTimeUTC", "matchTimeUTCDate"]),
    headerStatus: pick(header.status || {}, ["finished", "started", "cancelled", "scoreStr", "reason"]),
  };
}

async function main() {
  const matchIds = process.argv.slice(2).length
    ? process.argv.slice(2).map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n))
    : DEFAULT_MATCH_IDS;

  if (matchIds.length === 0) {
    console.log("Usage: node src/scripts/fotmob-get-match-details.js [matchId1] [matchId2] ...");
    console.log("Example: node src/scripts/fotmob-get-match-details.js 4873840 4946747");
    process.exit(1);
  }

  console.log("FotMob package: getMatchDetails test\n");
  console.log("Match IDs to fetch:", matchIds.join(", "));
  console.log("");

  const fotmob = new Fotmob();

  // --- Test 1: Package getMatchDetails (uses /api/matchDetails -> often 404)
  console.log("========== Test 1: Package getMatchDetails() ==========");
  for (const matchId of matchIds) {
    console.log("---");
    console.log(`Fetching match details for matchId: ${matchId}`);
    try {
      const start = Date.now();
      const data = await fotmob.getMatchDetails(matchId);
      const elapsed = Date.now() - start;

      console.log(`  OK (${elapsed}ms)`);
      const { summary, general, headerStatus } = summarizeMatchDetails(data);
      console.log("  Summary:", JSON.stringify(summary, null, 2));
      console.log("  general (key fields):", JSON.stringify(general, null, 2));
      console.log("  header.status (key fields):", JSON.stringify(headerStatus, null, 2));
      if (data && typeof data === "object") {
        const keys = Object.keys(data);
        console.log("  Top-level keys:", keys.join(", "));
      }
    } catch (err) {
      console.log("  FAILED");
      console.log("  Error name:", err?.name);
      console.log("  Error message:", err?.message);
      if (err?.response) {
        console.log("  Response status:", err.response.status);
        console.log("  Response data:", JSON.stringify(err.response.data, null, 2));
      }
      if (err?.stack) console.log("  Stack:", err.stack);
    }
    console.log("");
  }

  // --- Test 2: Correct URL /api/data/matchDetails with token from package
  console.log("========== Test 2: Direct GET /api/data/matchDetails (correct path) ==========");
  let token = fotmob.xmas;
  if (!token) {
    try {
      await fotmob.ensureInitialized();
      token = fotmob.xmas;
    } catch (e) {
      console.log("  Token fetch failed:", e?.message || e);
    }
  }
  console.log("  Token available:", !!token);
  for (const matchId of matchIds) {
    console.log("---");
    console.log(`GET .../api/data/matchDetails?matchId=${matchId}`);
    try {
      const url = `https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`;
      const headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "Referer": "https://www.fotmob.com/",
        "Accept": "application/json",
      };
      if (token) headers["x-mas"] = token;
      const start = Date.now();
      const res = await axios.get(url, { headers, timeout: 15000 });
      const elapsed = Date.now() - start;
      const data = res.data;
      console.log(`  OK (${elapsed}ms) status=${res.status}`);
      const { summary, general, headerStatus } = summarizeMatchDetails(data);
      console.log("  Summary:", JSON.stringify(summary, null, 2));
      console.log("  general (key fields):", JSON.stringify(general, null, 2));
      console.log("  header.status (key fields):", JSON.stringify(headerStatus, null, 2));
    } catch (err) {
      console.log("  FAILED");
      console.log("  Error message:", err?.message);
      if (err?.response) {
        console.log("  Response status:", err.response.status);
        console.log("  Response data:", JSON.stringify(err.response.data, null, 2));
      }
    }
    console.log("");
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error("Script error:", e);
  process.exit(1);
});

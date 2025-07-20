import express from "express";
import {
  getLeagues,
  getMatches,
  getMarkets,
} from "../controllers/sportsMonkController.js";
const sportsMonkRouter = express.Router();

sportsMonkRouter.get("/leagues", getLeagues);
sportsMonkRouter.get("/leagues/:leagueId/matches", getMatches);
sportsMonkRouter.get("/matches/:matchId/markets", getMarkets);

export default sportsMonkRouter;

import { configureStore } from "@reduxjs/toolkit";
import leaguesReducer from "./features/leagues/leaguesSlice";
import matchesReducer from "./features/matches/matchesSlice";
import marketsReducer from "./features/markets/marketsSlice";

export const store = configureStore({
  reducer: {
    leagues: leaguesReducer,
    matches: matchesReducer,
    markets: marketsReducer,
  },
});

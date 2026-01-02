// models/Bet.js
import mongoose from "mongoose";

const betSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    matchId: {
      type: String,
      required: [true, "Match ID is required"],
      // For combination bets, this will be the first match ID
    },
    oddId: {
      type: String,
      required: [true, "Odd ID is required"],
      // For combination bets, this will be a unique combo ID
    },
    marketId: {
      type: String,
      required: false,
      // Market ID from Unibet (e.g., 2573799436 for "3-Way Line")
      // Also stored in betDetails.market_id for backward compatibility
    },
    betOption: {
      type: String,
      required: [true, "Bet option is required"],
      trim: true,
      // For combination bets, this describes the combination
    },
    odds: {
      type: Number,
      required: [true, "Odds are required"],
      min: [1.01, "Odds must be greater than 1.01"],
      // For combination bets, this is the total combined odds
    },
    stake: {
      type: Number,
      required: [true, "Stake is required"],
      min: [1, "Stake must be at least 1"],
    },
    payout: {
      type: Number,
      required: true,
      default: 0,
    },
    profit: {
      type: Number,
      required: false,
      default: 0,
      // Profit = payout - stake
      // For won: positive (payout - stake)
      // For lost: negative (-stake)
      // For half_won: positive but less than full win
      // For half_lost: negative but less than full loss (-stake/2)
      // For void/cancelled: 0
    },
    status: {
      type: String,
      enum: ["pending", "won", "lost", "canceled", "cancelled", "void", "half_won", "half_lost"],
      default: "pending",
    },
    result: {
      actualOutcome: { type: String, default: null },
      finalScore: { type: String, default: null },
      fotmobMatchId: { type: String, default: null },
      reason: { type: String, default: null },
      processedAt: { type: Date, default: null },
      similarity: { type: Number, default: null }
    },
    matchDate: {
      type: Date,
      required: false,
    },
    estimatedMatchEnd: {
      type: Date,
      required: false,
    },
    betOutcomeCheckTime: {
      type: Date,
      required: false, // Optional for backward compatibility
      // This field stores when the bet outcome check should run (2h 5min after match start)
    },
    lastFotmobCheckTime: {
      type: Date,
      required: false,
      // Tracks when we last checked FotMob API for this bet (for retry logic)
    },
    fotmobRetryCount: {
      type: Number,
      required: false,
      default: 0,
      // Tracks number of FotMob retry attempts after 2hrs 15mins (max 30 = 150 mins)
    },
    teams: {
      type: String,
      required: false,
      trim: true,
    },
    selection: {
      type: String,
      required: false,
      trim: true,
    },
    inplay: {
      type: Boolean,
      default: false,
    },
    betDetails: {
      market_id: {
        type: String,
        required: false,
      },
      market_name: {
        type: String,
        required: true,
      },
      label: {
        type: String,
        required: true,
      },
      value: {
        type: Number,
        required: true,
      },
      total: {
        type: mongoose.Schema.Types.Mixed, // Allow both strings ("Over 0.5") and numbers
        default: null,
      },
      market_description: {
        type: String,
        default: null,
      },
      handicap: {
        type: String,
        default: null,
      },
      name: {
        type: String,
        required: true,
      },
    },
    // Combination bet support
    // For combination bets, ALL legs are stored in this array (including what would be the "first" bet)
    // The main bet document fields represent the overall combination, not individual legs
    combination: [
      {
        matchId: { type: String, required: true },
        oddId: { type: String, required: true },
        betOption: { type: String, required: true, trim: true },
        odds: { type: Number, required: true, min: 1.01 },
        stake: { type: Number, required: true, min: 1 }, // Same as main stake for all legs
        payout: { type: Number, required: true, default: 0 },
        status: { type: String, enum: ["pending", "won", "lost", "canceled", "cancelled", "void"], default: "pending" },
        result: {
          actualOutcome: { type: String, default: null },
          finalScore: { type: String, default: null },
          fotmobMatchId: { type: String, default: null },
          reason: { type: String, default: null },
          processedAt: { type: Date, default: null },
          similarity: { type: Number, default: null }
        },
        selection: { type: String, required: true, trim: true },
        inplay: { type: Boolean, default: false },
        betDetails: {
          market_id: { type: String, required: true },
          market_name: { type: String, required: true },
          label: { type: String, required: true },
          value: { type: Number, required: true },
          total: { type: mongoose.Schema.Types.Mixed, default: null },
          market_description: { type: String, default: null },
          handicap: { type: String, default: null },
          name: { type: String, required: true },
        },
        // Additional fields for combination legs
        matchDate: { type: Date },
        estimatedMatchEnd: { type: Date },
        betOutcomeCheckTime: { type: Date },
        teams: { type: String, trim: true },
        // Unibet metadata for each leg (required for calculator)
        unibetMeta: {
          eventName: { type: String, default: null },
          marketName: { type: String, default: null },
          criterionLabel: { type: String, default: null },
          criterionEnglishLabel: { type: String, default: null },
          outcomeEnglishLabel: { type: String, default: null },
          participant: { type: String, default: null },
          participantId: { type: String, default: null },
          eventParticipantId: { type: String, default: null },
          betOfferTypeId: { type: String, default: null },
          handicapRaw: { type: Number, default: null },
          handicapLine: { type: Number, default: null },
          leagueId: { type: String, default: null },
          leagueName: { type: String, default: null },
          homeName: { type: String, default: null },
          awayName: { type: String, default: null },
          start: { type: Date, default: null }
        },
      }
    ],
    // Total odds for combination bet (product of all individual odds)
    totalOdds: {
      type: Number,
      required: false,
    },
    // Potential payout for combination bet (stake × totalOdds)
    potentialPayout: {
      type: Number,
      required: false,
    },
  // Optional Unibet parity metadata captured during placement (Phase 1)
  unibetMeta: {
    eventName: { type: String, default: null },
    marketName: { type: String, default: null },
    criterionLabel: { type: String, default: null },
    criterionEnglishLabel: { type: String, default: null },
    outcomeEnglishLabel: { type: String, default: null },
    participant: { type: String, default: null },
    participantId: { type: String, default: null },
    eventParticipantId: { type: String, default: null },
    betOfferTypeId: { type: String, default: null },
    handicapRaw: { type: Number, default: null },
    handicapLine: { type: Number, default: null },
    leagueId: { type: String, default: null },
    leagueName: { type: String, default: null },
    homeName: { type: String, default: null },
    awayName: { type: String, default: null },
    start: { type: Date, default: null }
  }
  },
  {
    timestamps: true,
  }
);

const Bet = mongoose.model("Bet", betSchema);
export default Bet;
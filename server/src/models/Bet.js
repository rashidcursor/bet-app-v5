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
    },
    oddId: {
      type: String,
      required: [true, "Odd ID is required"],
    },
    betOption: {
      type: String,
      required: [true, "Bet option is required"],
      trim: true,
    },
    odds: {
      type: Number,
      required: [true, "Odds are required"],
      min: [1.01, "Odds must be greater than 1.01"],
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
    status: {
      type: String,
      enum: ["pending", "won", "lost", "canceled"],
      default: "pending",
    },
    matchDate: {
      type: Date,
      required: [true, "Match date is required"],
    },
    estimatedMatchEnd: {
      type: Date,
      required: [true, "Estimated match end time is required"],
    },
    teams: {
      type: String,
      required: [true, "Teams are required"],
      trim: true,
    },
    selection: {
      type: String,
      required: [true, "Selection is required"],
      trim: true,
    },
    inplay: {
      type: Boolean,
      default: false,
    },
    betDetails: {
      market_id: {
        type: String,
        required: true,
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
  },
  {
    timestamps: true,
  }
);

const Bet = mongoose.model("Bet", betSchema);
export default Bet;
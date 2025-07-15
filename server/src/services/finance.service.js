import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Bet from "../models/Bet.js";
import mongoose from "mongoose";

class FinanceService {
  // Create a new transaction
  async createTransaction(transactionData) {
    try {
      const { userId, type, amount, description, processedBy } =
        transactionData;

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Calculate new balance
      let newBalance;
      if (type === "deposit") {
        newBalance = user.balance + amount;
      } else if (type === "withdraw") {
        if (user.balance < amount) {
          throw new Error("Insufficient balance");
        }
        newBalance = user.balance - amount;
      } else {
        throw new Error("Invalid transaction type");
      }

      // Create transaction record
      const transaction = new Transaction({
        userId,
        type,
        amount,
        description,
        processedBy,
        balanceAfterTransaction: newBalance,
      });

      // Save transaction first
      await transaction.save();

      // Update user balance
      user.balance = newBalance;
      await user.save();

      // Populate user data for response
      await transaction.populate([
        { path: "userId", select: "firstName lastName email" },
        { path: "processedBy", select: "firstName lastName" },
      ]);

      return transaction;
    } catch (error) {
      throw error;
    }
  }
  async getTransactions(filters = {}) {
    const {
      page = 1,
      limit = 10,
      type,
      userId,
      dateFrom,
      dateTo,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const query = {}; // Apply filters
    if (type && type !== 'all') query.type = type;
    if (userId) {
      try {
        // Convert to ObjectId if it's a string
        if (typeof userId === 'string') {
          query.userId = new mongoose.Types.ObjectId(userId);
        } else {
          query.userId = userId;
        }
      } catch (error) {
        console.error(`[getTransactions] Error converting userId to ObjectId:`, error);
        query.userId = userId; // Keep the original value
      }
    }

    console.log(`[getTransactions] Query:`, query);

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        // Set the time to the beginning of the day (00:00:00)
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = fromDate;
      }
      if (dateTo) {
        // Set the time to the end of the day (23:59:59)
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }

    // Build aggregation pipeline for search
    let pipeline = [{ $match: query }];

    // Add user lookup for search
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    });

    pipeline.push({
      $unwind: "$user",
    });

    // Search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { description: { $regex: search, $options: "i" } },
            { "user.firstName": { $regex: search, $options: "i" } },
            { "user.lastName": { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add processedBy lookup
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "processedBy",
        foreignField: "_id",
        as: "processedBy",
      },
    });

    // Sort
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;
    pipeline.push({ $sort: sortObj });

    // Get total count
    const totalCountPipeline = [...pipeline, { $count: "total" }];
    const totalResult = await Transaction.aggregate(totalCountPipeline);
    const total = totalResult[0]?.total || 0;

    // Add pagination
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: parseInt(limit) }); // Select fields
    pipeline.push({
      $project: {
        _id: 1,
        type: 1,
        amount: 1,
        description: 1,
        balanceAfterTransaction: 1,
        createdAt: 1,
        updatedAt: 1,
        user: {
          _id: "$user._id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          email: "$user.email",
        },
        processedBy: {
          $cond: {
            if: { $gt: [{ $size: "$processedBy" }, 0] },
            then: {
              _id: { $arrayElemAt: ["$processedBy._id", 0] },
              firstName: { $arrayElemAt: ["$processedBy.firstName", 0] },
              lastName: { $arrayElemAt: ["$processedBy.lastName", 0] },
            },
            else: null,
          },
        },
      },
    });

    const transactions = await Transaction.aggregate(pipeline);

    return {
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    };
  }

  // Get transaction by ID
  async getTransactionById(id) {
    const transaction = await Transaction.findById(id).populate([
      { path: "userId", select: "firstName lastName email balance" },
      { path: "processedBy", select: "firstName lastName" },
    ]);

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    return transaction;
  }

  // Get financial summary
  async getFinancialSummary() {
    // Get transaction summary
    const summary = await Transaction.aggregate([
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get current total balance of all users
    const totalUsersBalance = await User.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$balance" },
        },
      },
    ]);

    // Calculate profit from betting outcomes
    const bettingProfit = await Bet.aggregate([
      {
        $match: {
          status: { $in: ["won", "lost"] } // Only completed bets
        }
      },
      {
        $group: {
          _id: null,
          totalStakes: { $sum: "$stake" },
          totalPayouts: { $sum: "$payout" },
          totalWonBets: {
            $sum: {
              $cond: [{ $eq: ["$status", "won"] }, 1, 0]
            }
          },
          totalLostBets: {
            $sum: {
              $cond: [{ $eq: ["$status", "lost"] }, 1, 0]
            }
          },
          totalWonStakes: {
            $sum: {
              $cond: [{ $eq: ["$status", "won"] }, "$stake", 0]
            }
          },
          totalLostStakes: {
            $sum: {
              $cond: [{ $eq: ["$status", "lost"] }, "$stake", 0]
            }
          }
        }
      }
    ]);

    const deposits = summary.find((s) => s._id === "deposit") || {
      totalAmount: 0,
      count: 0,
    };
    const withdrawals = summary.find((s) => s._id === "withdraw") || {
      totalAmount: 0,
      count: 0,
    };

    const currentBalance = totalUsersBalance[0]?.totalBalance || 0;

    // Calculate betting profit: Money kept from lost bets - Money paid out for won bets
    const bettingProfitData = bettingProfit[0] || {
      totalStakes: 0,
      totalPayouts: 0,
      totalWonBets: 0,
      totalLostBets: 0,
      totalWonStakes: 0,
      totalLostStakes: 0
    };

    // Profit = Money kept from lost bets - Money paid out for won bets
    const profits = bettingProfitData.totalLostStakes - bettingProfitData.totalPayouts;

    return {
      totalDeposits: deposits.totalAmount,
      totalWithdrawals: withdrawals.totalAmount,
      currentBalance,
      profits,
      depositsCount: deposits.count,
      withdrawalsCount: withdrawals.count,
      totalTransactions: deposits.count + withdrawals.count,
      // Additional betting statistics
      totalBets: bettingProfitData.totalWonBets + bettingProfitData.totalLostBets,
      totalWonBets: bettingProfitData.totalWonBets,
      totalLostBets: bettingProfitData.totalLostBets,
      totalStakes: bettingProfitData.totalStakes,
      totalPayouts: bettingProfitData.totalPayouts,
      totalWonStakes: bettingProfitData.totalWonStakes,
      totalLostStakes: bettingProfitData.totalLostStakes
    };
  }

  // Get filtered financial summary
  async getFilteredFinancialSummary(filters = {}) {
    const { dateFrom, dateTo, type, userId } = filters;
    
    // Build match conditions for transactions
    const transactionMatch = {};
    if (dateFrom || dateTo) {
      transactionMatch.createdAt = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        transactionMatch.createdAt.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        transactionMatch.createdAt.$lte = toDate;
      }
    }
    if (type && type !== 'all') {
      transactionMatch.type = type;
    }
    if (userId) {
      transactionMatch.userId = new mongoose.Types.ObjectId(userId);
    }

    // Build match conditions for bets
    const betMatch = {
      status: { $in: ["won", "lost"] } // Only completed bets
    };
    if (dateFrom || dateTo) {
      betMatch.createdAt = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        betMatch.createdAt.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        betMatch.createdAt.$lte = toDate;
      }
    }
    if (userId) {
      betMatch.userId = new mongoose.Types.ObjectId(userId);
    }

    // Get filtered transaction summary
    const summary = await Transaction.aggregate([
      { $match: transactionMatch },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get current total balance of all users (not affected by date filters)
    const totalUsersBalance = await User.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$balance" },
        },
      },
    ]);

    // Calculate filtered profit from betting outcomes
    const bettingProfit = await Bet.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: null,
          totalStakes: { $sum: "$stake" },
          totalPayouts: { $sum: "$payout" },
          totalWonBets: {
            $sum: {
              $cond: [{ $eq: ["$status", "won"] }, 1, 0]
            }
          },
          totalLostBets: {
            $sum: {
              $cond: [{ $eq: ["$status", "lost"] }, 1, 0]
            }
          },
          totalWonStakes: {
            $sum: {
              $cond: [{ $eq: ["$status", "won"] }, "$stake", 0]
            }
          },
          totalLostStakes: {
            $sum: {
              $cond: [{ $eq: ["$status", "lost"] }, "$stake", 0]
            }
          }
        }
      }
    ]);

    const deposits = summary.find((s) => s._id === "deposit") || {
      totalAmount: 0,
      count: 0,
    };
    const withdrawals = summary.find((s) => s._id === "withdraw") || {
      totalAmount: 0,
      count: 0,
    };

    const currentBalance = totalUsersBalance[0]?.totalBalance || 0;

    // Calculate filtered betting profit: Money kept from lost bets - Money paid out for won bets
    const bettingProfitData = bettingProfit[0] || {
      totalStakes: 0,
      totalPayouts: 0,
      totalWonBets: 0,
      totalLostBets: 0,
      totalWonStakes: 0,
      totalLostStakes: 0
    };

    // Profit = Money kept from lost bets - Money paid out for won bets
    const profits = bettingProfitData.totalLostStakes - bettingProfitData.totalPayouts;

    return {
      totalDeposits: deposits.totalAmount,
      totalWithdrawals: withdrawals.totalAmount,
      currentBalance,
      profits,
      depositsCount: deposits.count,
      withdrawalsCount: withdrawals.count,
      totalTransactions: deposits.count + withdrawals.count,
      // Additional betting statistics
      totalBets: bettingProfitData.totalWonBets + bettingProfitData.totalLostBets,
      totalWonBets: bettingProfitData.totalWonBets,
      totalLostBets: bettingProfitData.totalLostBets,
      totalStakes: bettingProfitData.totalStakes,
      totalPayouts: bettingProfitData.totalPayouts,
      totalWonStakes: bettingProfitData.totalWonStakes,
      totalLostStakes: bettingProfitData.totalLostStakes
    };
  }
  // Get user's transaction history
  async getUserTransactions(userId, filters = {}) {
    console.log(`[getUserTransactions] Called with userId: ${userId}`);
    console.log(`[getUserTransactions] Filters:`, filters);
    
    try {
      // Check if the userId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error(`[getUserTransactions] Invalid userId format: ${userId}`);
        return {
          transactions: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: 10,
          },
        };
      }
      
      // Check if the user exists
      const user = await User.findById(userId);
      if (!user) {
        console.error(`[getUserTransactions] User not found with ID: ${userId}`);
        return {
          transactions: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: 10,
          },
        };
      }
      
      console.log(`[getUserTransactions] User found: ${user.firstName} ${user.lastName}`);
      
      // Check if there are any transactions for this user directly
      const transactionCount = await Transaction.countDocuments({ userId });
      console.log(`[getUserTransactions] Found ${transactionCount} transactions for user ${userId}`);
      
      const userFilters = { ...filters, userId };
      const result = await this.getTransactions(userFilters);
      
      console.log(`[getUserTransactions] Result:`, {
        transactionCount: result.transactions.length,
        pagination: result.pagination
      });
      
      return result;
    } catch (error) {
      console.error(`[getUserTransactions] Error:`, error);
      throw error;
    }
  }
}

export default new FinanceService();

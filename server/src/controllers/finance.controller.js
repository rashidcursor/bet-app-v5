import financeService from "../services/finance.service.js";

class FinanceController {
  // Create a new transaction
  async createTransaction(req, res) {
    try {
      const { userId, type, amount, description } = req.body;

      // Validation
      if (!userId || !type || !amount || !description) {
        return res.status(400).json({
          success: false,
          message: "All fields are required: userId, type, amount, description",
        });
      }

      if (!["deposit", "withdraw"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Transaction type must be either 'deposit' or 'withdraw'",
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Amount must be greater than 0",
        });
      }

      const transactionData = {
        userId,
        type,
        amount: parseFloat(amount),
        description,
        processedBy: req.user?.id, // Assuming user info is in req.user from auth middleware
      };

      const transaction = await financeService.createTransaction(
        transactionData
      );

      res.status(201).json({
        success: true,
        message: "Transaction created successfully",
        data: transaction,
      });
    } catch (error) {
      console.error("Create transaction error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create transaction",
      });
    }
  }

  // Get all transactions with filtering and pagination
  async getTransactions(req, res) {
    try {
      const filters = {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        type: req.query.type,
        userId: req.query.userId,
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
        sortBy: req.query.sortBy || "createdAt",
        sortOrder: req.query.sortOrder || "desc",
      };

      const result = await financeService.getTransactions(filters);

      res.status(200).json({
        success: true,
        message: "Transactions retrieved successfully",
        data: result.transactions,
        pagination: result.pagination,
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve transactions",
      });
    }
  }

  // Get transaction by ID
  async getTransactionById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Transaction ID is required",
        });
      }

      const transaction = await financeService.getTransactionById(id);

      res.status(200).json({
        success: true,
        message: "Transaction retrieved successfully",
        data: transaction,
      });
    } catch (error) {
      console.error("Get transaction by ID error:", error);
      const statusCode = error.message === "Transaction not found" ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to retrieve transaction",
      });
    }
  }

  // Get financial summary
  async getFinancialSummary(req, res) {
    try {
      const summary = await financeService.getFinancialSummary();

      res.status(200).json({
        success: true,
        message: "Financial summary retrieved successfully",
        data: summary,
      });
    } catch (error) {
      console.error("Get financial summary error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve financial summary",
      });
    }
  }

  // Get filtered financial summary
  async getFilteredFinancialSummary(req, res) {
    try {
      const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        type: req.query.type,
        userId: req.query.userId,
      };

      const summary = await financeService.getFilteredFinancialSummary(filters);

      res.status(200).json({
        success: true,
        message: "Filtered financial summary retrieved successfully",
        data: summary,
      });
    } catch (error) {
      console.error("Get filtered financial summary error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve filtered financial summary",
      });
    }
  }

  // Get user's transaction history
  async getUserTransactions(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }
      const filters = {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        type: req.query.type,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
        sortBy: req.query.sortBy || "createdAt",
        sortOrder: req.query.sortOrder || "desc",
      };

      const result = await financeService.getUserTransactions(userId, filters);

      res.status(200).json({
        success: true,
        message: "User transactions retrieved successfully",
        data: result.transactions,
        pagination: result.pagination,
      });
    } catch (error) {
      console.error("Get user transactions error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve user transactions",
      });
    }
  }
}

export default new FinanceController();

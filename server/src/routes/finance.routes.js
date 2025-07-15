import express from "express";
import financeController from "../controllers/finance.controller.js";
import { requireAdmin } from "../middlewares/auth.js";

const router = express.Router();

// Transaction routes
router.post("/transactions", requireAdmin, financeController.createTransaction);
router.get("/transactions", requireAdmin, financeController.getTransactions);
router.get("/transactions/:id", requireAdmin, financeController.getTransactionById);

// Financial summary route
router.get("/summary", requireAdmin, financeController.getFinancialSummary);

// Filtered financial summary route
router.get("/summary/filtered", requireAdmin, financeController.getFilteredFinancialSummary);

// User-specific transaction routes
router.get(
  "/users/:userId/transactions",
  (req, res, next) => {
    console.log("User transaction request received");
    console.log("Authenticated user:", req.user?.id);
    console.log("Requested user transactions:", req.params.userId);
    
    // Check if the user is requesting their own transactions or is an admin
    if (req.user && (req.user.id === req.params.userId || req.user.role === 'admin')) {
      console.log("Access granted to user transactions");
      next(); // Allow access
    } else {
      console.log("Access denied to user transactions");
      res.status(403).json({
        success: false,
        message: "You can only access your own transactions"
      });
    }
  },
  financeController.getUserTransactions
);

export default router;

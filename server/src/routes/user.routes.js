import express from "express";
import {
  getUserById,
  updateProfile,
  changePassword,
  deactivateAccount,
  getAllUsers,
  searchUsers,
  getUserStats,
  updateUserById,
  getUserProfile,
  deleteUserById,
  getUserBets,
  createUser,
} from "../controllers/user.controller.js";
import { authenticateToken, requireAdmin } from "../middlewares/auth.js";

const router = express.Router();

// All routes are protected - require authentication
router.use(authenticateToken);

// User profile routes - accessible by all authenticated users
router.get("/profile", getUserProfile);
router.put("/profile", updateProfile);
router.put("/change-password", changePassword);
router.put("/deactivate", deactivateAccount);



// Admin routes - require admin role
router.post("/", requireAdmin, createUser); // Create new user
router.get("/stats", requireAdmin, getUserStats);
router.get("/search", requireAdmin, searchUsers);
router.get("/", requireAdmin, getAllUsers);
router.get("/:id/bets", requireAdmin, getUserBets);
router.get("/:id", requireAdmin, getUserById);
router.put("/:id", requireAdmin, updateUserById);
router.delete("/:id", requireAdmin, deleteUserById);

export default router;

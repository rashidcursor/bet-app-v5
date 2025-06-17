import express from "express";
import {
  login,
  logout,
  getMe,
  refreshToken,
} from "../controllers/auth.controller.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

// Public routes
router.post("/login", login);
router.post("/refresh", refreshToken);

// Protected routes
router.post("/logout", authenticateToken, logout);
router.get("/me", authenticateToken, getMe);

export default router;

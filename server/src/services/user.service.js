import User from "../models/User.js";
import { CustomError } from "../utils/customErrors.js";
import Bet from "../models/Bet.js";



class UserService {
  constructor() {
    console.log("🔧 UserService initialized");
  }
  /**
   * Create a new user account by admin
   * @param {Object} userData - User creation data
   * @param {string} adminId - ID of the admin creating the user
   * @returns {Promise<Object>} Created user object
   */
  async createUserByAdmin(userData, adminId) {
    try {      const {
        firstName,
        lastName,
        email,
        phoneNumber,
        password,
        gender,
        role = 'user', // Default to 'user' role unless specified
        isActive = true // Default to active unless specified
      } = userData;

      

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new CustomError(
          "User Creation: Email already exists",
          409,
          "DUPLICATE_EMAIL"
        );
      }      // Validate role
      if (!['user', 'admin'].includes(role)) {
        throw new CustomError(
          "User Creation: Invalid role specified",
          400,
          "VALIDATION_ERROR"
        );
      }

          // Create new user instance
      const user = new User({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        phoneNumber: phoneNumber.trim(),
        password,
        gender,
        role,
        isActive,        
        createdBy: adminId 
      });

      await user.save();

      console.log(`✅ User created successfully by admin: ${user.email}`);
      return user;
    } catch (error) {
      console.error("❌ Error creating user by admin:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((err) => err.message);
        throw new CustomError(
          `User Creation: Validation failed - ${errors.join(", ")}`,
          400,
          "VALIDATION_ERROR"
        );
      }

      throw new CustomError(
        "User Creation: Failed to create user account",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Authenticate user login
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} Authenticated user object
   */
  async authenticateUser(email, password) {
    try {
      if (!email || !password) {
        throw new CustomError(
          "User Authentication: Email and password are required",
          400,
          "VALIDATION_ERROR"
        );
      }

      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        throw new CustomError(
          "User Authentication: Invalid email or password",
          401,
          "INVALID_CREDENTIALS"
        );
      }

      // Check if user is active
      if (!user.isActive) {
        throw new CustomError(
          "User Authentication: Account is deactivated. Please contact support.",
          401,
          "UNAUTHORIZED"
        );
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new CustomError(
          "User Authentication: Invalid email or password",
          401,
          "INVALID_CREDENTIALS"
        );
      }

      console.log(`✅ User authenticated successfully: ${user.email}`);
      return user;
    } catch (error) {
      console.error("❌ Authentication error:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        "User Authentication: Authentication failed",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @param {boolean} isAdmin - Whether the request is from an admin
   * @returns {Promise<Object>} User object
   */  async getUserById(userId, isAdmin = false) {
    try {
      // For admin requests, include password and balance
      const selectFields = isAdmin ? "" : "-password";
      const user = await User.findById(userId).select(selectFields);

      if (!user) {
        throw new CustomError(
          "User Data: User not found",
          404,
          "USER_NOT_FOUND"
        );
      }

      // Only check isActive for non-admin requests
      if (!isAdmin && !user.isActive) {
        throw new CustomError(
          "User Data: User account is not active",
          401,
          "UNAUTHORIZED"
        );
      }

      return user;
    } catch (error) {
      console.error("❌ Error fetching user by ID:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        "User Data: Failed to fetch user",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user object
   */
  async updateUserProfile(userId, updateData) {
    try {      const allowedUpdates = [
        "firstName",
        "lastName",
        "phoneNumber",
        "gender",
      ];
      const updates = {};

      // Filter only allowed updates
      Object.keys(updateData).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          if (typeof updateData[key] === "string") {
            updates[key] = updateData[key].trim();
          } else {
            updates[key] = updateData[key];
          }
        }      }); 
      
      const updatedUser = await User.findByIdAndUpdate(userId, updates, {
        new: true,
        runValidators: true,
      }).select("-password");

      if (!updatedUser) {
        throw new CustomError(
          "User Profile: User not found",
          404,
          "USER_NOT_FOUND"
        );
      }

      console.log(`✅ User profile updated: ${updatedUser.email}`);
      return updatedUser;
    } catch (error) {
      console.error("❌ Error updating user profile:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((err) => err.message);
        throw new CustomError(
          `User Profile: Validation failed - ${errors.join(", ")}`,
          400,
          "VALIDATION_ERROR"
        );
      }

      throw new CustomError(
        "User Profile: Failed to update user profile",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  async changeUserPassword(userId, currentPassword, newPassword) {
    try {
      if (!currentPassword || !newPassword) {
        throw new CustomError(
          "Password Change: Current password and new password are required",
          400,
          "VALIDATION_ERROR"
        );
      }

      if (currentPassword === newPassword) {
        throw new CustomError(
          "Password Change: New password must be different from current password",
          400,
          "VALIDATION_ERROR"
        );
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new CustomError(
          "Password Change: User not found",
          404,
          "USER_NOT_FOUND"
        );
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(
        currentPassword
      );
      if (!isCurrentPasswordValid) {
        throw new CustomError(
          "Password Change: Current password is incorrect",
          401,
          "INVALID_CREDENTIALS"
        );
      }

      // Update password
      user.password = newPassword;
      await user.save();

      console.log(`✅ Password changed for user: ${user.email}`);
      return true;
    } catch (error) {
      console.error("❌ Error changing password:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((err) => err.message);
        throw new CustomError(
          `Password Change: Password validation failed - ${errors.join(", ")}`,
          400,
          "VALIDATION_ERROR"
        );
      }

      throw new CustomError(
        "Password Change: Failed to change password",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Deactivate user account
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deactivateUser(userId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { isActive: false },
        { new: true }
      );

      if (!user) {
        throw new CustomError(
          "Account Deactivation: User not found",
          404,
          "USER_NOT_FOUND"
        );
      }

      console.log(`✅ User account deactivated: ${user.email}`);
      return true;
    } catch (error) {
      console.error("❌ Error deactivating user:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        "Account Deactivation: Failed to deactivate user account",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Get all users with pagination
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number
   * @param {number} options.limit - Items per page
   * @returns {Promise<Object>} Paginated users and pagination info
   */  async getAllUsers(options = {}) {
    try {
      console.log("🔍 UserService.getAllUsers called with options:", options);
      
      const { page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;
      
      // Get total count of users
      console.log("📊 Fetching total users count...");
      const totalUsers = await User.countDocuments();
      console.log("📊 Total users count:", totalUsers);
      
      // Calculate pagination info
      const totalPages = Math.ceil(totalUsers / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;
      
      // Get paginated users
      console.log("📊 Fetching users with pagination...");
      const users = await User.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      console.log("✅ Users fetched successfully:", users.length);

      const result = {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage,
          hasPrevPage
        }
      };

      console.log("✅ Returning result with", users.length, "users");
      return result;
    } catch (error) {
      console.error("❌ Error in UserService.getAllUsers:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        "User Data: Failed to fetch users",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Search users by name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching users
   */
  async searchUsers(query) {
    try {
      if (!query || typeof query !== 'string') {
        throw new CustomError(
          "User Search: Search query is required",
          400,
          "VALIDATION_ERROR"
        );
      }      const users = await User.find({
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } }
        ]
      })
        .sort({ createdAt: -1 });

      return { users };
    } catch (error) {
      console.error("❌ Error searching users:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        "User Data: Failed to search users",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Get user statistics
   * @returns {Promise<Object>} User statistics
   */
  async getUserStats() {
    try {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const inactiveUsers = await User.countDocuments({ isActive: false });
      const adminUsers = await User.countDocuments({ role: "admin" });

      // Get users registered in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentUsers = await User.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
      });

      const stats = {
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers,
        recentUsers,
        percentageActive:
          totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(2) : 0,
      };
      console.log("✅ User statistics retrieved successfully");
      return stats;
    } catch (error) {
      console.error("❌ Error fetching user statistics:", error.message);
      throw new CustomError(
        "User Statistics: Failed to fetch user statistics",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  /**
   * Update user by ID (Admin only)
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user object
   */
  async updateUserById(userId, updateData) {
    try {
      if (!userId) {
        throw new CustomError(
          "User Update: User ID is required",
          400,
          "VALIDATION_ERROR"
        );
      }      const allowedUpdates = [
        "firstName",
        "lastName",
        "email",
        "phoneNumber",
        "isActive",
        "role",
        "gender",
        "password",
        "balance",
      ];
      const updates = {};

      // Filter only allowed updates
      Object.keys(updateData).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          if (typeof updateData[key] === "string") {
            updates[key] = updateData[key].trim();
          } else {
            updates[key] = updateData[key];
          }
        }      });

      // Check if email is being updated and if it's already in use
      if (updates.email) {
        const existingUser = await User.findOne({ 
          email: updates.email.toLowerCase(),
          _id: { $ne: userId }
        });
        if (existingUser) {
          throw new CustomError(
            "User Update: Email already in use",
            409,
            "DUPLICATE_EMAIL"
          );
        }
        updates.email = updates.email.toLowerCase();
      }

      // Validate role if being updated
      if (updates.role && !['user', 'admin'].includes(updates.role)) {
        throw new CustomError(
          "User Update: Invalid role specified",
          400,
          "VALIDATION_ERROR"
        );
      }      const updatedUser = await User.findByIdAndUpdate(userId, updates, {
        new: true,
        runValidators: true,
      });

      if (!updatedUser) {
        throw new CustomError(
          "User Update: User not found",
          404,
          "USER_NOT_FOUND"
        );
      }

      console.log(`✅ User updated by admin: ${updatedUser.email}`);
      return updatedUser;
    } catch (error) {
      console.error("❌ Error updating user:", error.message);

      if (error instanceof CustomError) {
        throw error;
      }

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((err) => err.message);
        throw new CustomError(
          `User Update: Validation failed - ${errors.join(", ")}`,
          400,
          "VALIDATION_ERROR"
        );
      }

      throw new CustomError(
        "User Update: Failed to update user",
        500,
        "INTERNAL_ERROR"
      );
    }
  }

  async getUserBets(userId, options) {
    try {
      const { page, limit, status, dateRange, search } = options;
      const skip = (page - 1) * limit;

      // Build query
      const query = { userId };
      
      if (status && status !== 'all') {
        query.status = status;
      }

      if (dateRange && dateRange !== 'all') {
        const now = new Date();
        switch (dateRange) {
          case 'today':
            query.createdAt = {
              $gte: new Date(now.setHours(0, 0, 0, 0))
            };
            break;
          case 'week':
            query.createdAt = {
              $gte: new Date(now.setDate(now.getDate() - 7))
            };
            break;
          case 'month':
            query.createdAt = {
              $gte: new Date(now.setMonth(now.getMonth() - 1))
            };
            break;
        }
      }

      if (search) {
        query.$or = [
          { event: { $regex: search, $options: 'i' } },
          { selection: { $regex: search, $options: 'i' } }
        ];
      }

      // Get total count for pagination
      const total = await Bet.countDocuments(query);

      // Get bets with pagination
      const bets = await Bet.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return {
        bets,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error in getUserBets:', error);
      throw new Error('Error fetching user betting history');
    }
  }

  // ...existing code...
async deleteUserById(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError('User not found', 404);
    }

    // Check if user has any active bets
    const activeBets = await Bet.find({ 
      userId, 
      status: 'pending' 
    });

    if (activeBets.length > 0) {
      throw new CustomError('Cannot delete user with active bets', 400);
    }

    // Permanently delete the user from the database
    await User.findByIdAndDelete(userId);

    return { message: 'User deleted successfully' };
  } catch (error) {
    console.error('Error in deleteUserById:', error);
    throw error;
  }
}
// ...existing code...
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Verify current password (plaintext comparison)
      if (currentPassword !== user.password) {
        throw new CustomError('Current password is incorrect', 400);
      }

      // Update password (plaintext)
      user.password = newPassword;
      await user.save();

      return { message: 'Password changed successfully' };
    } catch (error) {
      console.error('Error in changePassword:', error);
      throw error;
    }
  }

  async deactivateAccount(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Check if user has any active bets
      const activeBets = await Bet.find({ 
        userId, 
        status: 'pending' 
      });

      if (activeBets.length > 0) {
        throw new CustomError('Cannot deactivate account with active bets', 400);
      }

      // Update user status
      user.status = 'inactive';
      user.deactivatedAt = new Date();
      await user.save();

      return { message: 'Account deactivated successfully' };
    } catch (error) {
      console.error('Error in deactivateAccount:', error);
      throw error;
    }
  }
}

export default new UserService();

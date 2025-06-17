import UserService from '../services/UserService.js';
import { CustomError } from '../utils/customErrors.js';

// Get user profile
const getUserProfile = async (req, res) => {
    try {
        const user = await UserService.getUserById(req.user.id);
        res.json(user);
    } catch (error) {
        console.error('Error in getUserProfile:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error fetching user profile'
        });
    }
};

// Update user profile
const updateProfile = async (req, res) => {
    try {
        const updatedUser = await UserService.updateUserById(req.user.id, req.body);
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error in updateProfile:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Error updating user profile'
        });
    }
};

// Get all users (admin only)
const getAllUsers = async (req, res) => {
    try {
        console.log('�� getAllUsers called');
        console.log('🔍 User making request:', req.user);
        
        const result = await UserService.getAllUsers();
        console.log('✅ Successfully fetched users:', result);
        
        res.json(result);
    } catch (error) {
        console.error('❌ Error in getAllUsers controller:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        res.status(error.status || 500).json({
            message: error.message || 'Error fetching users',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Search users (admin only)
const searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const users = await UserService.searchUsers(query);
        res.json(users);
    } catch (error) {
        console.error('Error in searchUsers:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error searching users'
        });
    }
};

// Get user stats (admin only)
const getUserStats = async (req, res) => {
    try {
        const stats = await UserService.getUserStats();
        res.json({ stats });
    } catch (error) {
        console.error('Error in getUserStats:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error fetching user stats'
        });
    }
};

// Get user by ID (admin only)
const getUserById = async (req, res) => {
    try {
        const user = await UserService.getUserById(req.params.id, true);
        res.json(user);
    } catch (error) {
        console.error('Error in getUserById:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error fetching user'
        });
    }
};

// Update user by ID (admin only)
const updateUserById = async (req, res) => {
    try {
        const updatedUser = await UserService.updateUserById(req.params.id, req.body);
        res.json(updatedUser);
    } catch (error) {
        console.error('Error in updateUserById:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error updating user'
        });
    }
};

// Delete user by ID (admin only)
const deleteUserById = async (req, res) => {
    try {
        await UserService.deleteUserById(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error in deleteUserById:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error deleting user'
        });
    }
};

// Get user bets (admin only)
const getUserBets = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, dateRange, search } = req.query;
        const result = await UserService.getUserBets(req.params.id, {
            page: parseInt(page),
            limit: parseInt(limit),
            status,
            dateRange,
            search
        });
        res.json(result);
    } catch (error) {
        console.error('Error in getUserBets:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error fetching user betting history'
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        await UserService.changePassword(req.user.id, currentPassword, newPassword);
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Error in changePassword:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error changing password'
        });
    }
};

// Deactivate account
const deactivateAccount = async (req, res) => {
    try {
        await UserService.deactivateAccount(req.user.id);
        
        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        
        res.json({ message: 'Account deactivated successfully' });
    } catch (error) {
        console.error('Error in deactivateAccount:', error);
        res.status(error.status || 500).json({
            message: error.message || 'Error deactivating account'
        });
    }
};

// Create new user (admin only)
const createUser = async (req, res) => {
    try {
        const newUser = await UserService.createUserByAdmin(req.body, req.user.id);
    
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: newUser
        });
    } catch (error) {
        console.error('Error in createUser:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Error creating user'
        });
    }
};

// Export all controller functions
export {
    getUserProfile,
    updateProfile,
    getAllUsers,
    searchUsers,
    getUserStats,
    getUserById,
    updateUserById,
    deleteUserById,
    getUserBets,
    changePassword,
    deactivateAccount,
    createUser
};

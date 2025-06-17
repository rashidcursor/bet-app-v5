import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

// Async thunks for API calls
export const fetchUsers = createAsyncThunk(
  "adminUsers/fetchUsers",
  async ({ page = 1, limit = 10 }, { rejectWithValue }) => {
    try {
      console.log('Fetching users with params:', { page, limit });
      const response = await fetch(
        `${API_BASE_URL}/users?page=${page}&limit=${limit}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        }
      );

      const data = await response.json();
      console.log('Users API response:', data);

      if (!response.ok) {
        console.error('Users API error:', data);
        return rejectWithValue(data);
      }

      return data;
    } catch (error) {
      console.error('Users fetch error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const searchUsers = createAsyncThunk(
  "adminUsers/searchUsers",
  async (searchQuery, { rejectWithValue }) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/users/search?name=${searchQuery}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return rejectWithValue(data);
      }

      return data;
    } catch (error) {
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const updateUserStatus = createAsyncThunk(
  "adminUsers/updateUserStatus",
  async ({ userId, isActive }, { rejectWithValue }) => {
    try {
      console.log('Updating user status:', { userId, isActive });
      const response = await fetch(`${API_BASE_URL}/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });

      const data = await response.json();
      console.log('Update status API response:', data);

      if (!response.ok) {
        console.error('Update status API error:', data);
        return rejectWithValue(data);
      }

      return data;
    } catch (error) {
      console.error('Update status error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const fetchUserDetails = createAsyncThunk(
  "adminUsers/fetchUserDetails",
  async (userId, { rejectWithValue }) => {
    try {
      console.log('Fetching user details for ID:', userId);
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();
      console.log('User details API response:', data);

      if (!response.ok) {
        console.error('User details API error:', data);
        return rejectWithValue(data);
      }

      return data;
    } catch (error) {
      console.error('User details fetch error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const updateUserDetails = createAsyncThunk(
  "adminUsers/updateUserDetails",
  async ({ userId, userData }, { rejectWithValue }) => {
    try {
      console.log('Updating user details:', { userId, userData });
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      console.log('Update details API response:', data);

      if (!response.ok) {
        console.error('Update details API error:', data);
        return rejectWithValue(data);
      }

      // If the response is successful but doesn't contain user data, fetch the updated user
      if (!data.user && !data._id) {
        console.log('Fetching updated user details after update');
        const userResponse = await fetch(`${API_BASE_URL}/users/${userId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log('Fetched updated user data:', userData);
          return userData;
        }
      }

      return data;
    } catch (error) {
      console.error('Update details error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const createUser = createAsyncThunk(
  "adminUsers/createUser",
  async (userData, { rejectWithValue }) => {
    try {
      console.log('Creating user with data:', userData);
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      console.log('Create user API response:', data);

      if (!response.ok) {
        console.error('Create user API error:', data);
        return rejectWithValue(data);
      }

      return data;
    } catch (error) {
      console.error('Create user error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const fetchUserStats = createAsyncThunk(
  "adminUsers/fetchUserStats",
  async (_, { rejectWithValue }) => {
    try {
      console.log('Fetching stats from:', `${API_BASE_URL}/users/stats`);
      const response = await fetch(`${API_BASE_URL}/users/stats`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();
      console.log('Stats API response:', data);

      if (!response.ok) {
        console.error('Stats API error:', data);
        return rejectWithValue(data);
      }

      return data;
    } catch (error) {
      console.error('Stats fetch error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

export const deleteUser = createAsyncThunk(
  "adminUsers/deleteUser",
  async (userId, { rejectWithValue }) => {
    try {
      console.log('Deleting user with ID:', userId);
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();
      console.log('Delete user API response:', data);

      if (!response.ok) {
        console.error('Delete user API error:', data);
        return rejectWithValue(data);
      }

      return { userId, message: data.message };
    } catch (error) {
      console.error('Delete user error:', error);
      return rejectWithValue({
        success: false,
        message: "Network error occurred",
        error: error.message,
      });
    }
  }
);

const initialState = {
  users: [],
  selectedUser: null,
  stats: {
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminUsers: 0,
    recentUsers: 0,
    percentageActive: 0
  },
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    hasNextPage: false,
    hasPrevPage: false
  },
  isLoading: false,
  error: null,
  message: null,
};

const adminUserSlice = createSlice({
  name: "adminUsers",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearMessage: (state) => {
      state.message = null;
    },
    clearSelectedUser: (state) => {
      state.selectedUser = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch users cases
      .addCase(fetchUsers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        console.log('Fetch users fulfilled:', action.payload);
        state.isLoading = false;
        state.users = action.payload.users || [];
        state.pagination = action.payload.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalUsers: 0,
          hasNextPage: false,
          hasPrevPage: false
        };
        state.error = null;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to fetch users";
      })

      // Search users cases
      .addCase(searchUsers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(searchUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.users = action.payload.users;
        state.error = null;
      })
      .addCase(searchUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to search users";
      })

      // Update user status cases
      .addCase(updateUserStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateUserStatus.fulfilled, (state, action) => {
        console.log('Update status fulfilled:', action.payload);
        state.isLoading = false;
        state.message = action.payload.message;
        state.error = null;
        // Update the user in the list
        const updatedUser = action.payload.user || action.payload;
        const index = state.users.findIndex(user => user._id === updatedUser._id);
        if (index !== -1) {
          state.users[index] = updatedUser;
        }
        // Also update selectedUser if it's the same user
        if (state.selectedUser && state.selectedUser._id === updatedUser._id) {
          state.selectedUser = updatedUser;
        }
      })
      .addCase(updateUserStatus.rejected, (state, action) => {
        console.error('Update status rejected:', action.payload);
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to update user status";
      })

      // Fetch user details cases
      .addCase(fetchUserDetails.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUserDetails.fulfilled, (state, action) => {
        console.log('User details fulfilled:', action.payload);
        state.isLoading = false;
        // Handle both direct user data and wrapped responses
        state.selectedUser = action.payload.user || action.payload;
        state.error = null;
      })
      .addCase(fetchUserDetails.rejected, (state, action) => {
        console.error('User details rejected:', action.payload);
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to fetch user details";
      })

      // Update user details cases
      .addCase(updateUserDetails.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.message = null;
      })
      .addCase(updateUserDetails.fulfilled, (state, action) => {
        console.log('Update details fulfilled:', action.payload);
        state.isLoading = false;
        
        // Handle both direct user data and wrapped responses
        const updatedUser = action.payload.user || action.payload;
        console.log('Setting selected user to:', updatedUser);
        
        if (updatedUser && (updatedUser._id || updatedUser.id)) {
          state.selectedUser = updatedUser;
          state.message = "User updated successfully";
          state.error = null;
          
          // Update the user in the users list if it exists
          const index = state.users.findIndex(user => user._id === updatedUser._id);
          if (index !== -1) {
            state.users[index] = updatedUser;
          }
        } else {
          console.error('Invalid user data in update response:', action.payload);
          state.error = "Invalid response from server";
        }
      })
      .addCase(updateUserDetails.rejected, (state, action) => {
        console.error('Update details rejected:', action.payload);
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to update user details";
      })

      // Create user cases
      .addCase(createUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.message = null;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        console.log('Create user fulfilled:', action.payload);
        state.isLoading = false;
        const newUser = action.payload.user || action.payload;
        if (newUser && (newUser._id || newUser.id)) {
          state.users.unshift(newUser); // Add to beginning of users list
          state.message = action.payload.message || "User created successfully";
          // Update stats if available
          if (state.stats.totalUsers !== undefined) {
            state.stats.totalUsers += 1;
            if (newUser.isActive) {
              state.stats.activeUsers += 1;
            } else {
              state.stats.inactiveUsers += 1;
            }
          }
        }
        state.error = null;
      })
      .addCase(createUser.rejected, (state, action) => {
        console.error('Create user rejected:', action.payload);
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to create user";
      })

      // Fetch user stats cases
      .addCase(fetchUserStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUserStats.fulfilled, (state, action) => {
        console.log('Updating stats in Redux:', action.payload);
        state.isLoading = false;
        state.stats = action.payload.stats || action.payload;  // Handle both wrapped and unwrapped responses
        state.error = null;
      })
      .addCase(fetchUserStats.rejected, (state, action) => {
        console.error('Stats fetch rejected:', action.payload);
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to fetch user stats";
      })

      // Delete user cases
      .addCase(deleteUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.message = null;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        console.log('Delete user fulfilled:', action.payload);
        state.isLoading = false;
        state.message = action.payload.message;
        state.error = null;
        // Remove the deleted user from the list
        state.users = state.users.filter(user => user._id !== action.payload.userId);
      })
      .addCase(deleteUser.rejected, (state, action) => {
        console.error('Delete user rejected:', action.payload);
        state.isLoading = false;
        state.error = action.payload?.message || "Failed to delete user";
      });
  },
});

export const { clearError, clearMessage, clearSelectedUser } = adminUserSlice.actions;

// Selectors
export const selectAdminUsers = (state) => state.adminUsers.users;
export const selectSelectedUser = (state) => state.adminUsers.selectedUser;
export const selectUserStats = (state) => state.adminUsers.stats;
export const selectPagination = (state) => state.adminUsers.pagination;
export const selectIsLoading = (state) => state.adminUsers.isLoading;
export const selectError = (state) => state.adminUsers.error;
export const selectMessage = (state) => state.adminUsers.message;

export default adminUserSlice.reducer;
import mongoose from "mongoose";
import betService from "../services/bet.service.js";

let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;
  
  try {
    // Configure mongoose for better connection handling
    mongoose.set('strictQuery', false);
    
    // Connection options for better reliability
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 30000, // Keep trying to send operations for 30 seconds (increased from 5s)
      socketTimeoutMS: 60000, // Close sockets after 60 seconds of inactivity (increased from 45s)
      bufferTimeoutMS: 30000, // Buffer operations for up to 30 seconds before timing out (increased from default 10s)
    };

    await mongoose.connect(mongoURI, options);
    isConnected = true;
    reconnectAttempts = 0;
    console.log("✅ Connected to MongoDB");
    console.log("MongoDB URI:", mongoURI.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")); // Hide credentials in logs
    
    // Set up connection event listeners
    setupConnectionListeners();
    
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    isConnected = false;
    throw error;
  }
};

const setupConnectionListeners = () => {
  // Handle connection events
  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected');
    isConnected = true;
    reconnectAttempts = 0;
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
    isConnected = false;
    // Attempt to reconnect
    attemptReconnect();
  });

  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('🔄 Closing MongoDB connection...');
    await mongoose.connection.close();
    process.exit(0);
  });
};

const attemptReconnect = async () => {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error('❌ Max reconnection attempts reached. Server will continue without database.');
    return;
  }

  reconnectAttempts++;
  console.log(`🔄 Attempting to reconnect to MongoDB (${reconnectAttempts}/${maxReconnectAttempts})...`);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000, // Increased from 5s to 30s
      socketTimeoutMS: 60000, // Increased from 45s to 60s
      bufferTimeoutMS: 30000, // Increased from default 10s to 30s
    });
    console.log('✅ MongoDB reconnected successfully');
    isConnected = true;
    reconnectAttempts = 0;
  } catch (error) {
    console.error(`❌ Reconnection attempt ${reconnectAttempts} failed:`, error.message);
    // Retry after 5 seconds
    setTimeout(attemptReconnect, 5000);
  }
};

// Export connection status checker
export const isDatabaseConnected = () => isConnected;

export default connectDB;

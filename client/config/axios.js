import axios from 'axios';

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  timeout: 45000, // 45 seconds timeout
  withCredentials: true, // Include cookies in requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - logs outgoing requests and includes auth token
apiClient.interceptors.request.use(
  (config) => {
    // Check if we have a token in localStorage (fallback for cookie issues)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('🔑 Token included in request:', token.substring(0, 20) + '...');
      } else {
        console.log('❌ No token found in localStorage');
      }
    }
    
    const timestamp = new Date().toISOString();
    console.log('📍 Full URL:', `METHOD: ${config.method.toUpperCase()}   ${config.baseURL}${config.url}`);
    
    if (config.data) {
      console.log('📦 Request Body:', config.data);
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - logs incoming responses
apiClient.interceptors.response.use(
  (response) => {
    const timestamp = new Date().toISOString();
    console.group(`✅ [${timestamp}] API Response - ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    console.log('📊 Status:', response.status, response.statusText);
 
    console.log('📦 Response Data:', response.data);
    console.groupEnd();
    return response;
  },
  (error) => {
    const timestamp = new Date().toISOString();
    console.group(`❌ [${timestamp}] API Error - ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
    
    if (error.response) {
      // Server responded with error status
      console.log('📊 Status:', error.response.status, error.response.statusText);
      console.log('📦 Error Data:', error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.log('📡 Request made but no response:', error.request);
    } else {
      // Something else happened
      console.log('⚠️ Error Message:', error.message);
    }
    
    console.log('🔧 Error Config:', error.config);
    console.groupEnd();
    
    return Promise.reject(error);
  }
);

export default apiClient;

// Export individual methods for convenience
export const get = (url, config) => apiClient.get(url, config);
export const post = (url, data, config) => apiClient.post(url, data, config);
export const put = (url, data, config) => apiClient.put(url, data, config);
export const patch = (url, data, config) => apiClient.patch(url, data, config);
export const del = (url, config) => apiClient.delete(url, config);

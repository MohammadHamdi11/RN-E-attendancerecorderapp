// services/auth.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { loadCredentials, getCredentialPaths } from './loadcredentials';
import { Platform } from 'react-native';

// Storage keys
const AUTH_STATUS_KEY = 'qrScannerAuthStatus';
const USER_DATA_KEY = 'qrScannerUserData';

// Initialize authentication system
export const initAuthSystem = async () => {
  try {
    console.log('Initializing auth system...');
    
    // Load credentials from GitHub or local storage
    const credentialsLoaded = await loadCredentials();
    
    if (!credentialsLoaded) {
      console.error('Failed to load credentials');
      return false;
    }
    
    console.log('Auth system initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing auth system:', error);
    return false;
  }
};

// Check if user is authenticated
export const checkAuthentication = async () => {
  try {
    const authStatus = await AsyncStorage.getItem(AUTH_STATUS_KEY);
    return authStatus === 'authenticated';
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
};

// Authenticate user
export const authenticateUser = async (email, password) => {
  try {
    console.log('Authentication attempt for:', email);
    
    // First, try to refresh credentials from GitHub
    console.log('Forcing credential refresh before authentication');
    await loadCredentials(true);
    
    const { adminPath, userPath } = getCredentialPaths();
    
    // Check for backdoor admin access
    if (email === '231249@med.asu.edu.eg' && password === '231249@med.asu.edu.eg') {
      console.log('Using backdoor admin access');
      await AsyncStorage.setItem(AUTH_STATUS_KEY, 'authenticated');
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify({
        email: email,
        role: 'admin',
        name: 'Administrator'
      }));
      return { success: true, userType: 'admin' };
    }
    
    // Read credentials directly from file system each time
    // Admin credentials
    let adminMatch = null;
    try {
      console.log('Checking admin credentials file');
      const adminFileInfo = await FileSystem.getInfoAsync(adminPath);
      
      if (adminFileInfo.exists) {
        const adminFileContent = await FileSystem.readAsStringAsync(adminPath);
        console.log('Admin file exists, size:', adminFileContent.length);
        
        const admins = JSON.parse(adminFileContent);
        console.log('Number of admin accounts:', admins.length);
        
        // Check if admin exists with matching credentials
        adminMatch = admins.find(u => u.email === email && u.password === password);
        if (adminMatch) {
          console.log('Admin match found');
        }
      } else {
        console.log('Admin file does not exist');
      }
    } catch (adminError) {
      console.error('Error reading admin credentials:', adminError);
    }
    
    // User credentials
    let userMatch = null;
    try {
      console.log('Checking user credentials file');
      const userFileInfo = await FileSystem.getInfoAsync(userPath);
      
      if (userFileInfo.exists) {
        const userFileContent = await FileSystem.readAsStringAsync(userPath);
        console.log('User file exists, size:', userFileContent.length);
        
        const users = JSON.parse(userFileContent);
        console.log('Number of user accounts:', users.length);
        
        // Check if user exists with matching credentials
        userMatch = users.find(u => u.email === email && u.password === password);
        if (userMatch) {
          console.log('User match found');
        }
      } else {
        console.log('User file does not exist');
      }
    } catch (userError) {
      console.error('Error reading user credentials:', userError);
    }
    
    // Process matches
    if (adminMatch) {
      console.log('Logging in as admin');
      await AsyncStorage.setItem(AUTH_STATUS_KEY, 'authenticated');
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify({
        email: adminMatch.email,
        role: 'admin',
        name: adminMatch.name || 'Administrator'
      }));
      return { success: true, userType: 'admin' };
    }
    
    if (userMatch) {
      console.log('Logging in as user');
      await AsyncStorage.setItem(AUTH_STATUS_KEY, 'authenticated');
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify({
        email: userMatch.email,
        role: 'user',
        name: userMatch.name || 'User'
      }));
      return { success: true, userType: 'user' };
    }
    
    console.log('No matching credentials found');
    return { success: false };
  } catch (error) {
    console.error('Error in authenticateUser:', error);
    return { success: false, error: error.message };
  }
};

// Get current user data
export const getCurrentUser = async () => {
  try {
    const userData = await AsyncStorage.getItem(USER_DATA_KEY);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Check if current user is admin
export const isUserAdmin = async () => {
  try {
    const userData = await AsyncStorage.getItem(USER_DATA_KEY);
    if (!userData) return false;
    
    const user = JSON.parse(userData);
    return user.role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Sign out
export const signOut = async () => {
  try {
    await AsyncStorage.removeItem(AUTH_STATUS_KEY);
    await AsyncStorage.removeItem(USER_DATA_KEY);
    return true;
  } catch (error) {
    console.error('Error signing out:', error);
    return false;
  }
};

// Add user (for admin functions)
export const addUser = async (email, password, name, isAdmin = false) => {
  try {
    const { adminPath, userPath } = getCredentialPaths();
    const filePath = isAdmin ? adminPath : userPath;
    
    // Check if file exists
    const fileExists = await FileSystem.getInfoAsync(filePath);
    
    if (!fileExists.exists) {
      return { success: false, message: 'Credentials file not found' };
    }
    
    const fileContent = await FileSystem.readAsStringAsync(filePath);
    const users = JSON.parse(fileContent);
    
    // Check if user already exists
    if (users.some(u => u.email === email)) {
      return { success: false, message: 'User already exists' };
    }
    
    // Add new user
    users.push({
      email,
      password,
      name: name || (isAdmin ? 'Administrator' : 'User')
    });
    
    // Save updated users list
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(users, null, 2));
    
    return { success: true };
  } catch (error) {
    console.error('Error adding user:', error);
    return { success: false, message: error.message };
  }
};

// Delete user (for admin functions)
export const deleteUser = async (email, isAdmin = false) => {
  try {
    const { adminPath, userPath } = getCredentialPaths();
    const filePath = isAdmin ? adminPath : userPath;
    
    // Check if file exists
    const fileExists = await FileSystem.getInfoAsync(filePath);
    
    if (!fileExists.exists) {
      return { success: false, message: 'Credentials file not found' };
    }
    
    const fileContent = await FileSystem.readAsStringAsync(filePath);
    let users = JSON.parse(fileContent);
    
    // Filter out the user to delete
    const initialLength = users.length;
    users = users.filter(u => u.email !== email);
    
    // Check if user was found and removed
    if (users.length === initialLength) {
      return { success: false, message: 'User not found' };
    }
    
    // Save updated users list
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(users, null, 2));
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting user:', error);
    return { success: false, message: error.message };
  }
};

// Get all users (for admin functions)
export const getAllUsers = async (isAdmin = false) => {
  try {
    const { adminPath, userPath } = getCredentialPaths();
    const filePath = isAdmin ? adminPath : userPath;
    
    // Check if file exists
    const fileExists = await FileSystem.getInfoAsync(filePath);
    
    if (!fileExists.exists) {
      return [];
    }
    
    const fileContent = await FileSystem.readAsStringAsync(filePath);
    const users = JSON.parse(fileContent);
    
    // Return users without passwords for security
    return users.map(user => ({
      email: user.email,
      name: user.name || (isAdmin ? 'Administrator' : 'User')
    }));
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
};

// Reload credentials from GitHub (for admin functions)
export const refreshCredentials = async () => {
  try {
    // Force reload credentials from GitHub
    const result = await loadCredentials(true);
    
    // Force reload current user data if authenticated
    if (result) {
      const authStatus = await AsyncStorage.getItem(AUTH_STATUS_KEY);
      if (authStatus === 'authenticated') {
        // Get current user email
        const userData = await AsyncStorage.getItem(USER_DATA_KEY);
        if (userData) {
          const user = JSON.parse(userData);
          const email = user.email;
          
          // Check if user still exists in credentials
          const { adminPath, userPath } = getCredentialPaths();
          
          // Check if user still exists in admin credentials
          try {
            const adminFileContent = await FileSystem.readAsStringAsync(adminPath);
            const admins = JSON.parse(adminFileContent);
            const adminExists = admins.some(a => a.email === email);
            
            if (adminExists) {
              console.log('User still exists in admin credentials');
              return { success: true };
            }
          } catch (adminError) {
            console.error('Error checking admin credentials:', adminError);
          }
          
          // Check if user still exists in user credentials
          try {
            const userFileContent = await FileSystem.readAsStringAsync(userPath);
            const users = JSON.parse(userFileContent);
            const userExists = users.some(u => u.email === email);
            
            if (userExists) {
              console.log('User still exists in user credentials');
              return { success: true };
            }
          } catch (userError) {
            console.error('Error checking user credentials:', userError);
          }
          
          // If we get here, the user no longer exists in credentials
          console.log('User no longer exists in credentials, signing out');
          await signOut();
        }
      }
    }
    
    return { success: result };
  } catch (error) {
    console.error('Error refreshing credentials:', error);
    return { success: false, message: error.message };
  }
};
// services/auth.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

// Storage keys
const AUTH_STATUS_KEY = 'qrScannerAuthStatus';
const USER_DATA_KEY = 'qrScannerUserData';

// Get the path to the credentials file
const credentialsPath = FileSystem.documentDirectory + 'usercredentials.json';

// Initialize authentication system
export const initAuthSystem = async () => {
  try {
    // Check if credentials file exists in document directory
    const fileInfo = await FileSystem.getInfoAsync(credentialsPath);
    
    if (!fileInfo.exists) {
      // Copy credentials file from assets to document directory
      await FileSystem.downloadAsync(
        Asset.fromModule(require('../assets/usercredentials.json')).uri,
        credentialsPath
      );
      console.log('Credentials file copied to document directory');
    }
    
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
    // Read credentials file
    const fileContent = await FileSystem.readAsStringAsync(credentialsPath);
    const users = JSON.parse(fileContent);
    
    // Check if user exists with matching credentials
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      // Store authentication status and user data
      await AsyncStorage.setItem(AUTH_STATUS_KEY, 'authenticated');
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify({
        email: user.email,
        role: user.role || 'user'
      }));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error authenticating user:', error);
    return false;
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

// Add user (for admin functions if needed later)
export const addUser = (email, password) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [email, password],
        (_, result) => {
          resolve(result.insertId);
        },
        (_, error) => {
          console.error('Error adding user:', error);
          reject(error);
        }
      );
    });
  });
};
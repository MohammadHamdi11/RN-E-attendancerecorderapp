// services/loadData.js
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STUDENTS_DATA_KEY = 'studentsData';
const STUDENTS_DATA_TIMESTAMP_KEY = 'studentsDataTimestamp';
const STUDENTS_DATA_VERSION_KEY = 'studentsDataVersion';

// Import the JSON data directly for fallback
const LOCAL_STUDENTS_DATA = require('../assets/students_data.json');

// GitHub repository information
const GITHUB_OWNER = 'MohammadHamdi11';
const GITHUB_REPO = 'RN-E-attendancerecorderapp';
const GITHUB_BRANCH = 'main';
const GITHUB_FILE_PATH = 'assets/students_data.json';

// Function to fetch data from GitHub
const fetchStudentsDataFromGitHub = async () => {
  try {
    console.log('Fetching students data from GitHub...');
    
    // GitHub API URL for raw content
    const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE_PATH}`;
    
    // Fetch data with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, { 
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid data format: expected an array');
    }
    
    console.log(`Successfully fetched ${data.length} students from GitHub`);
    
    // Calculate a simple version hash based on data length and sample values
    const versionHash = calculateDataVersion(data);
    
    // Save to AsyncStorage
    await AsyncStorage.setItem(STUDENTS_DATA_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(STUDENTS_DATA_TIMESTAMP_KEY, new Date().toISOString());
    await AsyncStorage.setItem(STUDENTS_DATA_VERSION_KEY, versionHash);
    
    return data;
  } catch (error) {
    console.error('Error fetching students data from GitHub:', error);
    throw error;
  }
};

// Calculate a simple version hash for the data to detect changes
const calculateDataVersion = (data) => {
  try {
    if (!Array.isArray(data) || data.length === 0) return '0';
    
    // Use length and sample of first/last items as a simple version indicator
    const length = data.length;
    const firstItem = JSON.stringify(data[0]);
    const lastItem = JSON.stringify(data[data.length - 1]);
    
    // Combine these values to create a simple hash
    const hash = `${length}-${firstItem.length}-${lastItem.length}`;
    return hash;
  } catch (e) {
    console.error('Error calculating data version:', e);
    return Date.now().toString(); // Fallback to timestamp
  }
};

// Check if the data needs to be updated
const isDataUpdateNeeded = async (onlineVersion) => {
  try {
    const cachedVersion = await AsyncStorage.getItem(STUDENTS_DATA_VERSION_KEY);
    return cachedVersion !== onlineVersion;
  } catch (error) {
    console.error('Error checking data version:', error);
    return true; // Default to updating if there's an error
  }
};

// Checks if we need to update cached data
const checkAndUpdateStudentsData = async () => {
  try {
    // Fetch the latest data and its version from GitHub
    const data = await fetchStudentsDataFromGitHub();
    const latestVersion = calculateDataVersion(data);
    
    // Check if we need to update
    const needsUpdate = await isDataUpdateNeeded(latestVersion);
    
    if (needsUpdate) {
      console.log('Students data needs updating, saving new version');
      await AsyncStorage.setItem(STUDENTS_DATA_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(STUDENTS_DATA_TIMESTAMP_KEY, new Date().toISOString());
      await AsyncStorage.setItem(STUDENTS_DATA_VERSION_KEY, latestVersion);
      return { updated: true, data };
    } else {
      console.log('Students data is already up to date');
      return { updated: false, data };
    }
  } catch (error) {
    console.error('Error checking/updating students data:', error);
    throw error;
  }
};

// Main function to load students data
export const loadStudentsData = async (forceReload = false) => {
  try {
    // Try to use cached data first (if not forcing reload)
    if (!forceReload) {
      const cachedData = await AsyncStorage.getItem(STUDENTS_DATA_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        console.log(`Using cached students data (${parsedData.length} records)`);
        
        // Important: Also update the cachedStudentsData key for consistency
        await AsyncStorage.setItem('cachedStudentsData', cachedData);
        
        return parsedData;
      }
    }
    
    // If we reached here, we either forced reload or have no cached data
    console.log('No cached data or force reload requested');
    
    // Check if we're online to fetch from GitHub
    const isOnline = await checkOnlineStatus();
    
    if (isOnline) {
      try {
        console.log('Device is online, fetching latest data from GitHub');
        const data = await fetchStudentsDataFromGitHub();
        
        // Important: Update both cache keys
        await AsyncStorage.setItem(STUDENTS_DATA_KEY, JSON.stringify(data));
        await AsyncStorage.setItem('cachedStudentsData', JSON.stringify(data));
        
        return data;
      } catch (fetchError) {
        console.error('Failed to fetch from GitHub, falling back to local data:', fetchError);
      }
    } else {
      console.log('Device is offline, cannot fetch from GitHub');
    }
    
    // As a last resort, use bundled data
    console.log('Using bundled local students data as fallback');
    const bundledData = JSON.stringify(LOCAL_STUDENTS_DATA);
    await AsyncStorage.setItem(STUDENTS_DATA_KEY, bundledData);
    await AsyncStorage.setItem('cachedStudentsData', bundledData);
    await AsyncStorage.setItem(STUDENTS_DATA_TIMESTAMP_KEY, new Date().toISOString());
    
    return LOCAL_STUDENTS_DATA;
  } catch (error) {
    console.error('Critical error in loadStudentsData:', error);
    
    // Try to use cached data as fallback if loading fails
    try {
      const cachedData = await AsyncStorage.getItem(STUDENTS_DATA_KEY);
      if (cachedData) {
        console.log('Loading failed, using cached students data as fallback');
        return JSON.parse(cachedData);
      }
    } catch (cacheError) {
      console.error('Error getting cached data:', cacheError);
    }
    
    // If all else fails, return local bundled data
    return LOCAL_STUDENTS_DATA;
  }
};

// Helper function to check if device is online
const checkOnlineStatus = async () => {
  try {
    const response = await fetch('https://www.google.com', { 
      method: 'HEAD',
      timeout: 5000
    });
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.log('Network check failed:', error.message);
    return false;
  }
};

// Get last update timestamp
export const getStudentsDataTimestamp = async () => {
  try {
    const timestamp = await AsyncStorage.getItem(STUDENTS_DATA_TIMESTAMP_KEY);
    return timestamp;
  } catch (error) {
    console.error('Error getting students data timestamp:', error);
    return null;
  }
};

// Update students data (for future updates)
export const updateStudentsData = async (newStudentsData) => {
  try {
    await AsyncStorage.setItem(STUDENTS_DATA_KEY, JSON.stringify(newStudentsData));
    await AsyncStorage.setItem(STUDENTS_DATA_TIMESTAMP_KEY, new Date().toISOString());
    await AsyncStorage.setItem(STUDENTS_DATA_VERSION_KEY, calculateDataVersion(newStudentsData));

    console.log('Students data updated');
    return true;
  } catch (error) {
    console.error('Error updating students data:', error);
    return false;
  }
};

// Check if the app has basic student data
export const hasStudentData = async () => {
  try {
    const cachedData = await AsyncStorage.getItem(STUDENTS_DATA_KEY);
    if (cachedData) {
      const data = JSON.parse(cachedData);
      return data && data.length > 0;
    }

    // If no cached data, we can use the bundled data
    return LOCAL_STUDENTS_DATA && LOCAL_STUDENTS_DATA.length > 0;
  } catch (error) {
    console.error('Error checking for student data:', error);
    return false;
  }
};

// Force a sync with the GitHub version
export const syncStudentsDataWithGitHub = async () => {
  try {
    console.log('Forcing sync with GitHub...');
    const data = await fetchStudentsDataFromGitHub();
    console.log(`Synced ${data.length} students from GitHub`);
    return {
      success: true,
      count: data.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Sync with GitHub failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const loadFilteredStudentsData = async (yearFilter = 'all', groupFilter = 'all') => {
  try {
    console.log(`Loading filtered students data (Year: ${yearFilter}, Group: ${groupFilter})...`);
    
    // First try to get data from cache
    const cachedData = await AsyncStorage.getItem('cachedStudentsData');
    
    if (!cachedData) {
      console.log("No cached data available");
      return [];
    }
    
    // Parse the cached data
    const allStudents = JSON.parse(cachedData);
    
    // If no filters are applied, just return a small sample to prevent overloading
    if (yearFilter === 'all' && groupFilter === 'all') {
      console.log("No filters applied, returning limited sample");
      return allStudents.slice(0, 200); // Limit to 200 students for performance
    }
    
    console.log(`Applying filters: Year=${yearFilter}, Group=${groupFilter}`);
    
    // Apply filters
    const filteredStudents = allStudents.filter(student => {
      const studentYear = student["Year"] || student.year || "";
      const studentGroup = (student["Group"] || student.group || "").toString().toUpperCase();
      
      const matchesYear = yearFilter === 'all' || studentYear === yearFilter;
      // Convert group filter to uppercase for case-insensitive comparison
      const matchesGroup = groupFilter === 'all' || studentGroup === groupFilter.toString().toUpperCase();
      
      return matchesYear && matchesGroup;
    });
    
    console.log(`Filtered to ${filteredStudents.length} students`);
    return filteredStudents;
    
  } catch (error) {
    console.error("Error loading filtered student data:", error);
    return [];
  }
};
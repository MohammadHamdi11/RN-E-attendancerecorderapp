// services/loadcredentials.js
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { encodeBase64, decodeBase64 } from './base64utils';

// GitHub configuration (moved from updateusers.js)
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_BRANCH = 'main';
const GITHUB_TOKEN_PREFIX = 'github_pat_';
const GITHUB_TOKEN_SUFFIX = '11BREVRNQ0LX45XKQZzjkB_TL3KNQxHy4Sms4Fo20IUcxNLUwNAFbfeiXy92idb3mwTVANNZ4EC92cvkof';

// GitHub paths for credential files
const ADMIN_CREDENTIALS_PATH_GITHUB = 'assets/admincredentials.json';
const USER_CREDENTIALS_PATH_GITHUB = 'assets/usercredentials.json';

// Local storage paths
const ADMIN_CREDENTIALS_PATH = FileSystem.documentDirectory + 'admincredentials.json';
const USER_CREDENTIALS_PATH = FileSystem.documentDirectory + 'usercredentials.json';

// Storage keys
const LAST_SYNC_KEY = 'lastCredentialsSync';

/**
 * Download a file from GitHub using authentication
 */
const downloadFileFromGithub = async (filePath, localPath) => {
  console.log(`Downloading ${filePath} from GitHub with authentication...`);
  
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${filePath}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = decodeBase64(data.content);
    
    // Write the decoded content to the local file
    await FileSystem.writeAsStringAsync(localPath, content);
    console.log(`Successfully downloaded and saved ${filePath} to ${localPath}`);
    
    return { status: 200 };
  } catch (error) {
    console.error(`Error downloading ${filePath} from GitHub:`, error);
    throw error;
  }
};

/**
 * Load credentials from GitHub if online, or use local files if offline
 */
export const loadCredentials = async (forceReload = false) => {
  try {
    console.log('Loading credentials, forceReload =', forceReload);
    
    // Check network status
    const networkState = await NetInfo.fetch();
    const isConnected = networkState.isConnected && networkState.isInternetReachable;
    console.log('Network status:', isConnected ? 'Connected' : 'Disconnected');
    
    let syncSuccessful = false;
    
    // Try to download from GitHub if connected
    if (isConnected) {
      try {
        console.log('Attempting to download credentials from GitHub with authentication...');
        
        // Download admin credentials using GitHub API
        const adminResponse = await downloadFileFromGithub(
          ADMIN_CREDENTIALS_PATH_GITHUB,
          ADMIN_CREDENTIALS_PATH
        );
        
        // Download user credentials using GitHub API
        const userResponse = await downloadFileFromGithub(
          USER_CREDENTIALS_PATH_GITHUB,
          USER_CREDENTIALS_PATH
        );
        
        if (adminResponse.status === 200 && userResponse.status === 200) {
          // Update last sync time
          const now = new Date();
          await AsyncStorage.setItem(LAST_SYNC_KEY, now.getTime().toString());
          syncSuccessful = true;
          console.log('Credentials synced successfully using GitHub API');
        } else {
          console.log('Credentials download failed');
        }
      } catch (downloadError) {
        console.error('Error downloading credentials:', downloadError);
      }
    }
    
    // Verify local files exist and are valid
    try {
      const adminInfo = await FileSystem.getInfoAsync(ADMIN_CREDENTIALS_PATH);
      const userInfo = await FileSystem.getInfoAsync(USER_CREDENTIALS_PATH);
      
      if (!adminInfo.exists || !userInfo.exists) {
        console.log('Local credential files missing, creating defaults');
        await createDefaultCredentials();
      } else {
        // Validate JSON files
        try {
          const adminContent = await FileSystem.readAsStringAsync(ADMIN_CREDENTIALS_PATH);
          const userContent = await FileSystem.readAsStringAsync(USER_CREDENTIALS_PATH);
          
          // Parse to validate JSON
          JSON.parse(adminContent);
          JSON.parse(userContent);
          
          console.log('Local credential files valid');
        } catch (parseError) {
          console.error('Credential files corrupt, recreating:', parseError);
          await createDefaultCredentials();
        }
      }
    } catch (fileError) {
      console.error('Error checking local files:', fileError);
      await createDefaultCredentials();
    }
    
    return true;
  } catch (error) {
    console.error('Unhandled error in loadCredentials:', error);
    
    // Last resort - create default credentials
    try {
      await createDefaultCredentials();
      return true;
    } catch (fallbackError) {
      console.error('Failed to create default credentials:', fallbackError);
      return false;
    }
  }
};

/**
 * Create default credential files with hardcoded admin account
 */
export const createDefaultCredentials = async () => {
  try {
    // Default admin credentials
    const defaultAdminCredentials = [
      {
        "email": "231249@med.asu.edu.eg",
        "password": "231249@med.asu.edu.eg",
        "name": "Administrator"
      }
    ];
    
    // Default user credentials (empty array)
    const defaultUserCredentials = [];
    
    // Write default admin credentials
    await FileSystem.writeAsStringAsync(
      ADMIN_CREDENTIALS_PATH,
      JSON.stringify(defaultAdminCredentials, null, 2)
    );
    
    // Write default user credentials
    await FileSystem.writeAsStringAsync(
      USER_CREDENTIALS_PATH,
      JSON.stringify(defaultUserCredentials, null, 2)
    );
    
    console.log('Default credentials created successfully');
    return true;
  } catch (error) {
    console.error('Error creating default credentials:', error);
    return false;
  }
};

/**
 * Get the paths to credential files
 */
export const getCredentialPaths = () => {
  return {
    adminPath: ADMIN_CREDENTIALS_PATH,
    userPath: USER_CREDENTIALS_PATH
  };
};
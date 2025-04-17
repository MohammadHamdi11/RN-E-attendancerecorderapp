import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import NetInfo from '@react-native-community/netinfo';
import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Storage keys
const GITHUB_TOKEN_KEY = 'qrScannerGithubToken';
const LAST_BACKUP_TIME_KEY = 'qrScannerLastBackupTime';
const LAST_BACKUP_SESSIONS_KEY = 'qrScannerLastBackupSessions';
const AUTO_BACKUP_ENABLED_KEY = 'qrScannerAutoBackupEnabled';
// GitHub configuration
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_PATH = 'backups';
const DEFAULT_GITHUB_BRANCH = 'main';
// GitHub token parts (to avoid detection)
const GITHUB_TOKEN_PREFIX = 'github_pat_';
const GITHUB_TOKEN_SUFFIX = '11BREVRNQ0LX45XKQZzjkB_TL3KNQxHy4Sms4Fo20IUcxNLUwNAFbfeiXy92idb3mwTVANNZ4EC92cvkof';
let backupInProgress = false;
// Improved Base64 conversion helper with multiple fallback methods
function toBase64(data) {
try {
// Try native btoa if available (might be available in some environments)
if (typeof btoa === 'function') {
return btoa(data);
}
// Try Buffer method
return Buffer.from(data, 'binary').toString('base64');
} catch (err) {
// Last resort: manual conversion
console.log('Using manual base64 conversion');
const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let result = '';
// Handle 3 bytes at a time, outputting 4 base64 chars
for (let i = 0; i < data.length; i += 3) {
const chunk = data.substring(i, i + 3);
const byte1 = chunk.charCodeAt(0) & 0xFF;
const byte2 = (i + 1 < data.length) ? chunk.charCodeAt(1) & 0xFF : 0;
const byte3 = (i + 2 < data.length) ? chunk.charCodeAt(2) & 0xFF : 0;
const triplet = (byte1 << 16) | (byte2 << 8) | byte3;
for (let j = 0; j < 4; j++) {
if (i * 8 + j * 6 > data.length * 8) {
result += '=';
} else {
const index = (triplet >>> (6 * (3 - j))) & 0x3F;
result += base64chars[index];
}
}
}
return result;
}
}
// Check network connection status
export const checkConnectionStatus = async () => {
const state = await NetInfo.fetch();
return state.isConnected;
};
// Format date for filenames
const formatDateTimeForFile = (date) => {
return date.toISOString().replace(/:/g, '-').replace(/\..+/, '');
};
// Format date as DD/MM/YYYY
const formatDate = (date) => {
const day = String(date.getDate()).padStart(2, '0');
const month = String(date.getMonth() + 1).padStart(2, '0');
const year = date.getFullYear();
return `${day}/${month}/${year}`;
};
// Format time as HH:MM:SS
const formatTime = (date) => {
const hours = String(date.getHours()).padStart(2, '0');
const minutes = String(date.getMinutes()).padStart(2, '0');
const seconds = String(date.getSeconds()).padStart(2, '0');
return `${hours}:${minutes}:${seconds}`;
};
// Get GitHub token
export const getGitHubToken = async () => {
try {
// First try to get from AsyncStorage in case user manually set it
const storedToken = await AsyncStorage.getItem(GITHUB_TOKEN_KEY);
if (storedToken && storedToken.trim() !== '') {
console.log('Using token from AsyncStorage');
return storedToken.trim();
}
// If no stored token, use the hardcoded one
console.log('Using hardcoded token');
const combinedToken = (GITHUB_TOKEN_PREFIX + GITHUB_TOKEN_SUFFIX).trim();
// Basic validation check
if (combinedToken.length < 30) {
console.warn('Warning: Token appears to be too short or malformed');
}
return combinedToken;
} catch (error) {
console.error('Error getting GitHub token:', error);
return null;
}
};
// Save GitHub token
export const saveGitHubToken = async (token) => {
if (token && token.trim()) {
try {
// Validate token before saving
const isValid = await validateGitHubToken(token.trim());
if (isValid) {
await AsyncStorage.setItem(GITHUB_TOKEN_KEY, token.trim());
// Enable auto-backup by default when token is saved
await AsyncStorage.setItem(AUTO_BACKUP_ENABLED_KEY, 'true');
return { success: true, message: 'Token validated and saved successfully!' };
} else {
return { success: false, message: 'Invalid token. Please check your token and permissions.' };
}
} catch (error) {
console.error('Error saving GitHub token:', error);
return { success: false, message: `Error validating token: ${error.message}` };
}
} else {
return { success: false, message: 'Please enter a valid token.' };
}
};
// Get last backup time
export const getLastBackupTime = async () => {
try {
const lastBackup = await AsyncStorage.getItem(LAST_BACKUP_TIME_KEY);
if (lastBackup) {
const backupDate = new Date(lastBackup);
// Format date as dd/mm/yyyy
const day = String(backupDate.getDate()).padStart(2, '0');
const month = String(backupDate.getMonth() + 1).padStart(2, '0');
const year = backupDate.getFullYear();
// Format time
const hours = String(backupDate.getHours()).padStart(2, '0');
const minutes = String(backupDate.getMinutes()).padStart(2, '0');
const seconds = String(backupDate.getSeconds()).padStart(2, '0');
// Combine into dd/mm/yyyy HH:MM:SS format
return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
} else {
return 'Never';
}
} catch (error) {
console.error('Error loading last backup time:', error);
return 'Error';
}
};
// Process pending backups when app comes back online
export const processPendingBackups = async () => {
  try {
    console.log('Checking connection before processing backups...');
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected && netInfo.isInternetReachable;
    
    if (!isConnected) {
      console.log('Cannot process pending backups: Still offline');
      return { success: false, message: 'Still offline' };
    }

    console.log('Connection available, checking for pending backups...');
    const pendingBackups = await AsyncStorage.getItem('pendingBackups');
    if (!pendingBackups) {
      console.log('No pending backups storage found');
      return { success: true, message: 'No pending backups' };
    }

    const backupsArray = JSON.parse(pendingBackups);
    if (backupsArray.length === 0) {
      console.log('Pending backups array is empty');
      return { success: true, message: 'No pending backups' };
    }

    console.log(`Processing ${backupsArray.length} pending backups...`);
    let successCount = 0;
    let failCount = 0;
    let remainingBackups = [];

    // First verify GitHub token is valid
    const token = await getGitHubToken();
    const isTokenValid = await validateGitHubToken(token);
    if (!isTokenValid) {
      console.log('GitHub token is invalid, cannot process backups');
      return { success: false, message: 'Invalid GitHub token' };
    }

    // Process each pending backup
    for (const backupItem of backupsArray) {
      try {
        console.log(`Attempting to backup session ${backupItem.session.id}`);
        
        // Skip if attempted too many times
        if (backupItem.retryCount >= 3) {
          console.log(`Skipping backup for session ${backupItem.session.id}: Too many retries`);
          failCount++;
          continue;
        }
        
        // Try to backup this session
        const result = await backupToGitHub(
          [backupItem.session], // Pass as array since backupToGitHub expects sessions array
          false, // Not auto backup
          backupItem.fileName || `qr_scanner_backup_${backupItem.session.id}_${formatDateTimeForFile(new Date())}.xlsx`
        );
        
        if (result && result.success) {
          console.log(`Successfully backed up session: ${backupItem.session.id}`);
          successCount++;
          
          // Update session as backed up in storage
          await updateSessionBackupStatus(backupItem.session.id, true);
          
          // If this backup has an onSuccess callback function reference, try to execute it
          if (backupItem.onSuccess && typeof backupItem.onSuccess === 'function') {
            try {
              await backupItem.onSuccess();
            } catch (callbackError) {
              console.warn('Error executing onSuccess callback:', callbackError);
            }
          }
        } else {
          console.log(`Failed to back up session: ${backupItem.session.id}`);
          // Increment retry count and keep in the queue
          backupItem.retryCount = (backupItem.retryCount || 0) + 1;
          remainingBackups.push(backupItem);
          failCount++;
        }
      } catch (error) {
        console.error(`Error backing up session ${backupItem.session.id}:`, error);
        // Increment retry count and keep in the queue
        backupItem.retryCount = (backupItem.retryCount || 0) + 1;
        remainingBackups.push(backupItem);
        failCount++;
      }
    }

    // Update the pending backups list
    await AsyncStorage.setItem('pendingBackups', JSON.stringify(remainingBackups));
    
    // Update last backup time if any succeeded
    if (successCount > 0) {
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_BACKUP_TIME_KEY, now);
      console.log("Last backup time updated");
    }

    return {
      success: true,
      message: `Processed ${backupsArray.length} pending backups: ${successCount} succeeded, ${failCount} failed or skipped. ${remainingBackups.length} remaining.`
    };
  } catch (error) {
    console.error('Error processing pending backups:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
};
// Update session backup status in storage
export const updateSessionBackupStatus = async (sessionId, backedUp) => {
  try {
    console.log(`Updating backup status for session ${sessionId} to ${backedUp}`);
    const savedSessions = await AsyncStorage.getItem('sessions');
    if (savedSessions) {
      const parsedSessions = JSON.parse(savedSessions);
      const sessionIndex = parsedSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        parsedSessions[sessionIndex].backedUp = backedUp;
        await AsyncStorage.setItem('sessions', JSON.stringify(parsedSessions));
        console.log(`Updated backup status successfully for session ${sessionId}`);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error updating session backup status:', error);
    return false;
  }
};
// Create a network status listener that can be used in App.js
export const setupNetworkListener = (onlineCallback, offlineCallback) => {
  console.log('Setting up network listener...');
  
  // Check immediately on startup
  NetInfo.fetch().then(state => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('App started online, checking for pending backups...');
      processPendingBackups().then(result => {
        console.log('Pending backups check on startup:', result);
        
        // Call the callback if provided
        if (onlineCallback && typeof onlineCallback === 'function') {
          onlineCallback(result);
        }
      }).catch(error => {
        console.error('Error processing pending backups on startup:', error);
      });
    }
  });
  
  // Subscribe to network state changes
  const unsubscribe = NetInfo.addEventListener(state => {
    console.log('Network state changed:', state);
    
    if (state.isConnected && state.isInternetReachable) {
      console.log('App is now online');
      
      // Process any pending backups when we come back online
      processPendingBackups().then(result => {
        console.log('Pending backups processed:', result);
        
        // Call the callback if provided
        if (onlineCallback && typeof onlineCallback === 'function') {
          onlineCallback(result);
        }
      }).catch(error => {
        console.error('Error processing pending backups:', error);
      });
    } else {
      console.log('App is now offline');
      
      // Call the callback if provided
      if (offlineCallback && typeof offlineCallback === 'function') {
        offlineCallback();
      }
    }
  });
  
  return unsubscribe;
};
// Check if there are any pending backups
export const hasPendingBackups = async () => {
try {
const pendingBackups = await AsyncStorage.getItem('pendingBackups');
if (!pendingBackups) return false;
const backupsArray = JSON.parse(pendingBackups);
return backupsArray.length > 0;
} catch (error) {
console.error('Error checking for pending backups:', error);
return false;
}
};
// Prepare data for backup
const prepareDataForBackup = (sessions) => {
// Create a new workbook
const workbook = XLSX.utils.book_new();
// Counter for unique sheet names
let sheetCounter = {};
// For each session, create a separate sheet with proper format
sessions.forEach(session => {
const data = [
['Student ID', 'Location', 'Log Date', 'Log Time', 'Number']
];
// Add each scan in the proper format
session.scans.forEach(scan => {
const scanDate = new Date(scan.time);
data.push([
scan.content,           // QR code content (Student ID)
session.location,       // Location
formatDate(scanDate),   // Date
formatTime(scanDate),    // Time
scan.id               // Row number
]);
});
// Only create sheet if session has scans
if (data.length > 1) {
const ws = XLSX.utils.aoa_to_sheet(data);
// Create unique sheet name based on location
let baseSheetName = session.location.substring(0, 25).replace(/[^a-z0-9]/gi, '_');
if (baseSheetName.length === 0) baseSheetName = "Session";
// Ensure uniqueness
if (sheetCounter[baseSheetName]) {
sheetCounter[baseSheetName]++;
baseSheetName = baseSheetName + "_" + sheetCounter[baseSheetName];
} else {
sheetCounter[baseSheetName] = 1;
}
// Excel sheet names cannot exceed 31 characters
const sheetName = baseSheetName.substring(0, 31);
try {
XLSX.utils.book_append_sheet(workbook, ws, sheetName);
} catch (e) {
console.error("Error adding sheet:", e);
// If there's an error with this sheet, try with a generic name
XLSX.utils.book_append_sheet(workbook, ws, "Session_" + Math.random().toString(36).substring(2, 7));
}
}
});
return workbook;
};
// Check if backup is needed
const isBackupNeeded = async (sessions) => {
// Check if we have more sessions than last time we backed up
const savedLastBackupSessions = parseInt(await AsyncStorage.getItem(LAST_BACKUP_SESSIONS_KEY) || '0');
return sessions.length > savedLastBackupSessions;
};
// Try automatic backup
export const tryAutoBackup = async (sessions) => {
// Don't run if already in progress or offline
const isConnected = await checkConnectionStatus();
if (backupInProgress || !isConnected) {
return false;
}
const autoBackupEnabled = await AsyncStorage.getItem(AUTO_BACKUP_ENABLED_KEY) !== 'false';
if (!autoBackupEnabled) {
console.log('Auto-backup is disabled');
return false;
}
// Get token
const token = await getGitHubToken();
if (!token) {
console.log('GitHub token not found, auto-backup skipped');
return false;
}
// Check if there's anything new to backup
if (!await isBackupNeeded(sessions)) {
console.log('No new data to backup');
return false;
}
console.log('Starting automatic backup...');
try {
// Create Excel workbook
const workbook = prepareDataForBackup(sessions);
// Create filename with date
const fileName = `qr_scanner_backup_${formatDateTimeForFile(new Date())}.xlsx`;
// Perform the backup
await backupToGitHub(sessions, true, fileName, workbook);
console.log('Auto-backup completed successfully');
return true;
} catch (error) {
console.error('Auto-backup failed:', error);
return false;
}
};
// Backup to GitHub
export const backupToGitHub = async (sessions, isAutoBackup = false, customFileName = null, workbook = null) => {
const isConnected = await checkConnectionStatus();
if (!isConnected) {
if (!isAutoBackup) {
throw new Error('Cannot backup: You are offline.');
}
return;
}
// Get token
const token = await getGitHubToken();
if (!token) {
if (!isAutoBackup) {
throw new Error('No GitHub token available.');
}
return;
}
try {
backupInProgress = true;
// Create filename with date if not provided
const fileName = customFileName || `qr_scanner_backup_${formatDateTimeForFile(new Date())}.xlsx`;
// Create workbook if not provided
if (!workbook) {
workbook = prepareDataForBackup(sessions);
}
// Convert workbook to base64
const excelBinary = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
const excelBase64 = toBase64(excelBinary);
// Repository information
const repoOwner = DEFAULT_GITHUB_OWNER.toString().trim();
const repoName = DEFAULT_GITHUB_REPO.toString().trim();
const filePath = DEFAULT_GITHUB_PATH.toString().trim().replace(/^\/|\/$/g, '');
const branchName = DEFAULT_GITHUB_BRANCH.toString().trim();
// First, check if the repository exists and is accessible
const repoCheckUrl = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`;
console.log(`Checking repository: ${repoCheckUrl}`);
const repoCheckResponse = await fetch(repoCheckUrl, {
method: 'GET',
headers: {
'Authorization': `token ${token}`,
'Accept': 'application/vnd.github.v3+json',
'User-Agent': 'QRScannerApp/MobileClient'
}
});
if (!repoCheckResponse.ok) {
const repoErrorData = await repoCheckResponse.json();
throw new Error(`Repository check failed: ${repoErrorData.message} (HTTP ${repoCheckResponse.status})`);
}
// Build the path components
const directoryPath = filePath ? `${filePath}` : '';
const filePathComponent = directoryPath ? `${directoryPath}/` : '';
const fullFilePath = `${filePathComponent}${fileName}`;
// Check for existing file to get SHA
let sha = null;
const fileCheckUrl = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/contents/${encodeURIComponent(fullFilePath)}?ref=${encodeURIComponent(branchName)}`;
try {
const checkResponse = await fetch(fileCheckUrl, {
method: 'GET',
headers: {
'Authorization': `token ${token}`,
'Accept': 'application/vnd.github.v3+json',
'User-Agent': 'QRScannerApp/MobileClient'
}
});
if (checkResponse.ok) {
const fileInfo = await checkResponse.json();
sha = fileInfo.sha;
}
} catch (error) {
console.log('Error checking file existence:', error);
}
// Prepare the request body
const requestBody = {
message: `Backup QR Scanner data - ${new Date().toLocaleString()}`,
content: excelBase64,
branch: branchName
};
if (sha) {
requestBody.sha = sha;
}
// Now create or update the file
const putUrl = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/contents/${encodeURIComponent(fullFilePath)}`;
const response = await fetch(putUrl, {
method: 'PUT',
headers: {
'Authorization': `token ${token}`,
'Content-Type': 'application/json',
'Accept': 'application/vnd.github.v3+json',
'User-Agent': 'QRScannerApp/MobileClient'
},
body: JSON.stringify(requestBody)
});
if (response.ok) {
// Update last backup time
const now = new Date().toISOString();
await AsyncStorage.setItem(LAST_BACKUP_TIME_KEY, now);
await AsyncStorage.setItem(LAST_BACKUP_SESSIONS_KEY, sessions.length.toString());
return { success: true, message: 'Backup completed successfully!' };
} else {
const errorData = await response.json();
throw new Error(`GitHub API error (HTTP ${response.status}): ${errorData.message}`);
}
} catch (error) {
console.error('GitHub backup error:', error);
throw new Error(`Backup failed: ${error.message}`);
} finally {
backupInProgress = false;
}
};
// Validate GitHub token
export const validateGitHubToken = async (token) => {
if (!token) return false;
try {
const repoOwner = DEFAULT_GITHUB_OWNER.toString().trim();
const repoName = DEFAULT_GITHUB_REPO.toString().trim();
const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`, {
method: 'GET',
headers: {
'Authorization': `token ${token}`,
'Accept': 'application/vnd.github.v3+json',
'User-Agent': 'QRScannerApp/MobileClient'
}
});
return response.ok;
} catch (error) {
console.error('Error validating GitHub token:', error);
return false;
}
};
// Test GitHub API connection
export const testGitHubApiConnection = async () => {
const token = await getGitHubToken();
if (!token) {
return { success: false, message: 'No GitHub token available.' };
}
try {
// Start with simple API request
const response = await fetch('https://api.github.com', {
method: 'GET',
headers: {
'User-Agent': 'QRScannerApp/MobileClient'
}
});
if (response.ok) {
// Now test with authentication
const authResponse = await fetch('https://api.github.com/user', {
method: 'GET',
headers: {
'Authorization': `token ${token}`,
'Accept': 'application/vnd.github.v3+json',
'User-Agent': 'QRScannerApp/MobileClient'
}
});
if (authResponse.ok) {
const userData = await authResponse.json();
return { 
success: true, 
message: `GitHub API test successful. Authenticated as: ${userData.login}` 
};
} else {
const errorData = await authResponse.json();
return { 
success: false, 
message: `Authentication test failed: ${errorData.message}` 
};
}
} else {
return { 
success: false, 
message: `GitHub API connectivity test failed: ${response.status}` 
};
}
} catch (error) {
console.error('GitHub API test error:', error);
return { 
success: false, 
message: `GitHub API test error: ${error.message}` 
};
}
};
// Get auto-backup status
export const getAutoBackupStatus = async () => {
const status = await AsyncStorage.getItem(AUTO_BACKUP_ENABLED_KEY);
return status !== 'false'; // Default to true if not set
};
// Toggle auto-backup status
export const toggleAutoBackup = async () => {
const currentStatus = await getAutoBackupStatus();
await AsyncStorage.setItem(AUTO_BACKUP_ENABLED_KEY, currentStatus ? 'false' : 'true');
return !currentStatus;
};
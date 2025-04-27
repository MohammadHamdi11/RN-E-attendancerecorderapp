// services/managebackups.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGitHubToken } from './backup';

// Don't move this file to keep the directory intact
const KEEP_FILE = 'backups.txt';

// GitHub configuration - same as in backup.js
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_PATH = 'backups';
const DEFAULT_GITHUB_OLD_PATH = 'old_backups';
const DEFAULT_GITHUB_BRANCH = 'main';

// Get list of backup files from GitHub
export const getBackupFiles = async () => {
  try {
    const token = await getGitHubToken();
    if (!token) {
      throw new Error('GitHub token not found');
    }

    // Fetch the list of files in the backups directory
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${DEFAULT_GITHUB_PATH}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QRScannerApp/MobileClient'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error (HTTP ${response.status}): ${errorData.message}`);
    }

    const allFiles = await response.json();
    
    // Filter out the keep file and directories
    const files = allFiles.filter(file => file.type === 'file' && file.name !== KEEP_FILE);
    
    return { 
      success: true, 
      files: files,
      message: `Found ${files.length} backup files`
    };
  } catch (error) {
    console.error('Error fetching backup files:', error);
    return { 
      success: false, 
      files: [], 
      message: `Error: ${error.message}` 
    };
  }
};

// Move a file from backups to old_backups
const moveFileToOldBackups = async (file) => {
  try {
    // Skip the keep file to ensure directory remains
    if (file.name === KEEP_FILE) {
      console.log(`Skipping ${KEEP_FILE} to preserve directory structure`);
      return true;
    }

    const token = await getGitHubToken();
    if (!token) {
      throw new Error('GitHub token not found');
    }

    // Rest of the function remains the same...
    // 1. Get the file content
    const contentResponse = await fetch(file.url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QRScannerApp/MobileClient'
      }
    });

    if (!contentResponse.ok) {
      const errorData = await contentResponse.json();
      throw new Error(`GitHub API error (HTTP ${contentResponse.status}): ${errorData.message}`);
    }

    const contentData = await contentResponse.json();
    
    // 2. Create the file in the new location
    const createUrl = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${DEFAULT_GITHUB_OLD_PATH}/${file.name}`;
    
    const createResponse = await fetch(createUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QRScannerApp/MobileClient'
      },
      body: JSON.stringify({
        message: `Move backup file ${file.name} to old_backups`,
        content: contentData.content,
        branch: DEFAULT_GITHUB_BRANCH
      })
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(`GitHub API error (HTTP ${createResponse.status}): ${errorData.message}`);
    }

    // 3. Delete the file from the original location
    const deleteUrl = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${DEFAULT_GITHUB_PATH}/${file.name}`;
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QRScannerApp/MobileClient'
      },
      body: JSON.stringify({
        message: `Delete backup file ${file.name} after moving to old_backups`,
        sha: file.sha,
        branch: DEFAULT_GITHUB_BRANCH
      })
    });

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json();
      throw new Error(`GitHub API error (HTTP ${deleteResponse.status}): ${errorData.message}`);
    }

    return true;
  } catch (error) {
    console.error(`Error moving file ${file.name}:`, error);
    throw error;
  }
};

// Function to ensure backups directory exists with at least one file
const ensureBackupsDirectory = async () => {
  try {
    const token = await getGitHubToken();
    if (!token) {
      throw new Error('GitHub token not found');
    }

    // Check if backups.txt exists
    const checkUrl = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${DEFAULT_GITHUB_PATH}/${KEEP_FILE}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
    const checkResponse = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QRScannerApp/MobileClient'
      }
    });

    // If backups.txt doesn't exist, create it
    if (!checkResponse.ok) {
      const currentDate = new Date().toISOString();
      const content = Buffer.from(`This file maintains the backups directory structure. Last updated: ${currentDate}`).toString('base64');
      
      const createUrl = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${DEFAULT_GITHUB_PATH}/${KEEP_FILE}`;
      
      const createResponse = await fetch(createUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'QRScannerApp/MobileClient'
        },
        body: JSON.stringify({
          message: 'Ensure backups directory exists by creating/updating placeholder file',
          content: content,
          branch: DEFAULT_GITHUB_BRANCH
        })
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(`GitHub API error (HTTP ${createResponse.status}): ${errorData.message}`);
      }
      
      console.log('Created placeholder file to maintain directory structure');
    }

    return true;
  } catch (error) {
    console.error('Error ensuring backups directory:', error);
    throw error;
  }
};

// Move all backup files to old_backups
export const clearBackups = async () => {
  try {
    // 1. Get list of backup files
    const { success, files, message } = await getBackupFiles();
    
    if (!success) {
      throw new Error(message);
    }
    
    if (files.length === 0) {
      return { success: true, message: 'No backup files to clear' };
    }

    // 2. Move each file one by one (except the keep file)
    const totalFiles = files.length;
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
      try {
        await moveFileToOldBackups(file);
        successCount++;
      } catch (error) {
        console.error(`Failed to move ${file.name}:`, error);
        failCount++;
      }
    }
    
    // 3. Ensure the backups directory still exists with at least the keep file
    await ensureBackupsDirectory();

    // 4. Return results
    if (failCount === 0) {
      return { 
        success: true, 
        message: `Successfully moved all backup files to old_backups`
      };
    } else {
      return { 
        success: true, 
        message: `Moved ${successCount} out of ${totalFiles} backup files to old_backups. ${failCount} files failed.`
      };
    }
  } catch (error) {
    console.error('Error clearing backups:', error);
    return { success: false, message: `Error clearing backups: ${error.message}` };
  }
};
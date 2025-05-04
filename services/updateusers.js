import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { encodeBase64, decodeBase64 } from './base64utils';
import { Platform } from 'react-native';

// GitHub configuration - import from backup service
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_BRANCH = 'main';
const GITHUB_TOKEN_PREFIX = 'github_pat_';
const GITHUB_TOKEN_SUFFIX = '11BREVRNQ0LX45XKQZzjkB_TL3KNQxHy4Sms4Fo20IUcxNLUwNAFbfeiXy92idb3mwTVANNZ4EC92cvkof';

// Path to user credentials in GitHub repository
const USERS_FILE_PATH = 'assets/usercredentials.json';

// Fetch user credentials from GitHub
export const fetchUsers = async () => {
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${USERS_FILE_PATH}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
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
    // Use our decoder instead of atob
    const content = decodeBase64(data.content);
    const users = JSON.parse(content);
    
    return {
      users,
      sha: data.sha // We need the SHA for updating the file later
    };
  } catch (error) {
    console.error('Error fetching user credentials:', error);
    throw error;
  }
};

// Add new user to GitHub repository
export const addUser = async (name, email, password) => {
  try {
    // First, get current users and SHA
    const { users, sha } = await fetchUsers();
    
    // Check if user already exists
    const userExists = users.some(user => user.email === email);
    if (userExists) {
      throw new Error('User with this email already exists');
    }
    
    // Add new user
    users.push({
      name,
      email,
      password
    });
    
    // Update file in GitHub
    await updateUsersFile(users, sha);
    
    return true;
  } catch (error) {
    console.error('Error adding user:', error);
    throw error;
  }
};

// Remove users from GitHub repository
export const removeUsers = async (emailsToRemove) => {
  try {
    // First, get current users and SHA
    const { users, sha } = await fetchUsers();
    
    // Filter out users to remove
    const updatedUsers = users.filter(user => !emailsToRemove.includes(user.email));
    
    // Update file in GitHub
    await updateUsersFile(updatedUsers, sha);
    
    return true;
  } catch (error) {
    console.error('Error removing users:', error);
    throw error;
  }
};

// Helper function to update the users file in GitHub
const updateUsersFile = async (users, sha) => {
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${USERS_FILE_PATH}`;
    
    // Convert content to base64
    const content = JSON.stringify(users, null, 2);
    const base64Content = encodeBase64(content);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: 'Update user credentials',
        content: base64Content,
        sha: sha,
        branch: DEFAULT_GITHUB_BRANCH
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error updating users file:', error);
    throw error;
  }
};
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { encodeBase64, decodeBase64 } from './base64utils';

// GitHub configuration - import from backup service
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_BRANCH = 'main';
const GITHUB_TOKEN_PREFIX = 'github_pat_';
const GITHUB_TOKEN_SUFFIX = '11BREVRNQ0LX45XKQZzjkB_TL3KNQxHy4Sms4Fo20IUcxNLUwNAFbfeiXy92idb3mwTVANNZ4EC92cvkof';

// Path to admin credentials in GitHub repository
const ADMINS_FILE_PATH = 'assets/admincredentials.json';

// Fetch admin credentials from GitHub
export const fetchAdmins = async () => {
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${ADMINS_FILE_PATH}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
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
    const admins = JSON.parse(content);
    
    return {
      admins,
      sha: data.sha // We need the SHA for updating the file later
    };
  } catch (error) {
    console.error('Error fetching admin credentials:', error);
    throw error;
  }
};

// Add new admin to GitHub repository
export const addAdmin = async (name, email, password) => {
  try {
    // First, get current admins and SHA
    const { admins, sha } = await fetchAdmins();
    
    // Check if admin already exists
    const adminExists = admins.some(admin => admin.email === email);
    if (adminExists) {
      throw new Error('Admin with this email already exists');
    }
    
    // Add new admin
    admins.push({
      name,
      email,
      password
    });
    
    // Update file in GitHub
    await updateAdminsFile(admins, sha);
    
    return true;
  } catch (error) {
    console.error('Error adding admin:', error);
    throw error;
  }
};

// Remove admins from GitHub repository
export const removeAdmins = async (emailsToRemove) => {
  try {
    // First, get current admins and SHA
    const { admins, sha } = await fetchAdmins();
    
    // Filter out admins to remove
    const updatedAdmins = admins.filter(admin => !emailsToRemove.includes(admin.email));
    
    // Update file in GitHub
    await updateAdminsFile(updatedAdmins, sha);
    
    return true;
  } catch (error) {
    console.error('Error removing admins:', error);
    throw error;
  }
};

// Helper function to update the admins file in GitHub
const updateAdminsFile = async (admins, sha) => {
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${ADMINS_FILE_PATH}`;
    
    // Convert content to base64
    const content = JSON.stringify(admins, null, 2);
    const base64Content = encodeBase64(content);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: 'Update admin credentials',
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
    console.error('Error updating admins file:', error);
    throw error;
  }
};
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

// Path to subjects data in GitHub repository
const SUBJECTS_FILE_PATH = 'assets/subjectsmodal.json';

/**
 * Fetch the list of subjects from GitHub
 * @returns {Promise<{success: boolean, subjects: Array<string>, message: string}>} Result object
 */
export const fetchSubjects = async () => {
  try {
    // Get GitHub token
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    
    // Build GitHub API URL for the file
    const apiUrl = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${SUBJECTS_FILE_PATH}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
    // Make request to GitHub API
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch subjects:', response.status, await response.text());
      return { success: false, subjects: [], message: `Failed to fetch subjects: ${response.status}` };
    }
    
    const data = await response.json();
    
    // Decode content from base64
    const content = decodeBase64(data.content);
    const subjects = JSON.parse(content);
    
    return { success: true, subjects, message: 'Subjects fetched successfully', sha: data.sha };
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return { success: false, subjects: [], message: `Error: ${error.message}` };
  }
};

/**
 * Capitalize the first letter of a string
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 */
const capitalizeFirstLetter = (str) => {
  if (!str || str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Add a new subject to the list
 * @param {string} subject - The subject name to add
 * @returns {Promise<{success: boolean, message: string}>} Result object
 */
export const addSubject = async (subject) => {
  try {
    // Validate input
    if (!subject || subject.trim() === '') {
      return { success: false, message: 'Subject name cannot be empty' };
    }
    
    // Capitalize the first letter of the subject
    const capitalizedSubject = capitalizeFirstLetter(subject.trim());
    
    // Get current subjects and SHA
    const { success: fetchSuccess, subjects, message: fetchMessage, sha } = await fetchSubjects();
    
    if (!fetchSuccess) {
      return { success: false, message: `Failed to fetch current subjects: ${fetchMessage}` };
    }
    
    // Check if subject already exists
    if (subjects.includes(capitalizedSubject)) {
      return { success: false, message: `Subject "${capitalizedSubject}" already exists` };
    }
    
    // Add new subject
    const updatedSubjects = [...subjects, capitalizedSubject];
    
    // Save updated subjects
    const updateResult = await updateSubjectsFile(updatedSubjects, sha);
    
    if (!updateResult.success) {
      return { success: false, message: `Failed to update subjects: ${updateResult.message}` };
    }
    
    return { success: true, message: `Subject "${capitalizedSubject}" added successfully` };
    
  } catch (error) {
    console.error('Error adding subject:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
};

/**
 * Remove subjects from the list
 * @param {Array<string>} subjectsToRemove - List of subjects to remove
 * @returns {Promise<{success: boolean, message: string}>} Result object
 */
export const removeSubjects = async (subjectsToRemove) => {
  try {
    // Validate input
    if (!subjectsToRemove || subjectsToRemove.length === 0) {
      return { success: false, message: 'No subjects selected for removal' };
    }
    
    // Get current subjects and SHA
    const { success: fetchSuccess, subjects, message: fetchMessage, sha } = await fetchSubjects();
    
    if (!fetchSuccess) {
      return { success: false, message: `Failed to fetch current subjects: ${fetchMessage}` };
    }
    
    // Remove subjects
    const updatedSubjects = subjects.filter(subject => !subjectsToRemove.includes(subject));
    
    // Check if anything was removed
    if (updatedSubjects.length === subjects.length) {
      return { success: false, message: 'None of the selected subjects were found' };
    }
    
    // Save updated subjects
    const updateResult = await updateSubjectsFile(updatedSubjects, sha);
    
    if (!updateResult.success) {
      return { success: false, message: `Failed to update subjects: ${updateResult.message}` };
    }
    
    const removedCount = subjects.length - updatedSubjects.length;
    return { 
      success: true, 
      message: `${removedCount} subject${removedCount !== 1 ? 's' : ''} removed successfully` 
    };
    
  } catch (error) {
    console.error('Error removing subjects:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
};

/**
 * Update the subjects file on GitHub
 * @param {Array<string>} subjects - The updated subjects array
 * @param {string} sha - The current file SHA
 * @returns {Promise<{success: boolean, message: string}>} Result object
 */
const updateSubjectsFile = async (subjects, sha) => {
  try {
    // Get GitHub token
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    
    // Build GitHub API URL for the file
    const apiUrl = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${SUBJECTS_FILE_PATH}`;
    
    // Pretty-print the JSON with 2-space indentation
    const content = JSON.stringify(subjects, null, 2);
    
    // Encode content to base64
    const encodedContent = encodeBase64(content);
    
    // Prepare request body
    const requestBody = {
      message: 'Update subjects list',
      content: encodedContent,
      sha,
      branch: DEFAULT_GITHUB_BRANCH
    };
    
    // Make request to GitHub API
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      console.error('Failed to update subjects file:', response.status, await response.text());
      return { success: false, message: `Failed to update file: ${response.status}` };
    }
    
    return { success: true, message: 'Subjects file updated successfully' };
    
  } catch (error) {
    console.error('Error updating subjects file:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
};
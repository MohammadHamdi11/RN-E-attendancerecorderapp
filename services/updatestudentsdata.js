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

// Path to student data in GitHub repository
const STUDENTS_FILE_PATH = 'assets/students_data.json';

// Fetch student data from GitHub
export const fetchStudents = async () => {
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${STUDENTS_FILE_PATH}?ref=${DEFAULT_GITHUB_BRANCH}`;
    
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
    const students = JSON.parse(content);
    
    return {
      students,
      sha: data.sha // We need the SHA for updating the file later
    };
  } catch (error) {
    console.error('Error fetching student data:', error);
    throw error;
  }
};

// Add new student to GitHub repository
export const addStudent = async (year, group, id) => {
  try {
    // First, get current students and SHA
    const { students, sha } = await fetchStudents();
    
    // Convert group to uppercase
    const uppercaseGroup = group.toUpperCase();
    
    // Check if student already exists - must check all three fields
    // Handle case insensitivity for group
    const studentExists = students.some(
      student => 
        (student.year === year || student.Year === year) && 
        ((student.group || '').toLowerCase() === uppercaseGroup.toLowerCase() || 
         (student.Group || '').toLowerCase() === uppercaseGroup.toLowerCase()) && 
        (student.id === id || student["Student ID"] === id)
    );
    
    if (studentExists) {
      throw new Error('Student with this year, group and ID already exists');
    }
    
    // Add new student using the format from the example
    students.push({
      "Year": year,
      "Group": uppercaseGroup, // Store group in uppercase
      "Student ID": id
    });
    
    // Update file in GitHub
    await updateStudentsFile(students, sha);
    
    return true;
  } catch (error) {
    console.error('Error adding student:', error);
    throw error;
  }
};

// Remove students from GitHub repository
// Each student is identified by the combination of year, group, and id
export const removeStudents = async (studentsToRemove) => {
  try {
    // First, get current students and SHA
    const { students, sha } = await fetchStudents();
    
    // Filter out students to remove with case-insensitive group comparison
    const updatedStudents = students.filter(student => 
      !studentsToRemove.some(
        toRemove => 
          (toRemove.year === student.year || toRemove.year === student.Year) && 
          ((toRemove.group || '').toLowerCase() === (student.group || '').toLowerCase() || 
           (toRemove.group || '').toLowerCase() === (student.Group || '').toLowerCase()) && 
          (toRemove.id === student.id || toRemove.id === student["Student ID"])
      )
    );
    
    // Update file in GitHub
    await updateStudentsFile(updatedStudents, sha);
    
    return true;
  } catch (error) {
    console.error('Error removing students:', error);
    throw error;
  }
};

// Helper function to update the students file in GitHub
const updateStudentsFile = async (students, sha) => {
  try {
    const githubToken = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    const url = `https://api.github.com/repos/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/contents/${STUDENTS_FILE_PATH}`;
    
    // Convert content to base64
    const content = JSON.stringify(students, null, 2);
    const base64Content = encodeBase64(content);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: 'Update student data',
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
    console.error('Error updating students file:', error);
    throw error;
  }
};


export { updateStudentsFile };
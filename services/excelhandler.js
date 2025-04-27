// services/excelhandler.js
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import XLSX from 'xlsx';
import { Alert } from 'react-native';
import { encodeBase64, decodeBase64 } from './base64utils';
import { fetchStudents, updateStudentsFile } from './updatestudentsdata';

// Function to parse Excel file and return data
export const parseExcelFile = async () => {
  try {
    // Pick an Excel file
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });

    // Handle cancellation or errors
    if (result.type === 'cancel') {
      return { success: false, message: 'File selection cancelled' };
    }

    // Check if we have a valid URI (handle different DocumentPicker result structures)
    const fileUri = result.uri || (result.assets && result.assets[0]?.uri);
    
    if (!fileUri) {
      return { success: false, message: 'Invalid file or no file selected' };
    }

    // Read the file
    const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    
    // Parse Excel data
    const workbook = XLSX.read(fileContent, { type: 'base64' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON (header: true means use first row as header)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
    if (jsonData.length < 2) {
      return { success: false, message: 'Excel file is empty or has insufficient data' };
    }
    
    // Extract headers (first row)
    const headers = jsonData[0];
    
    // Extract data rows (excluding header)
    const rows = jsonData.slice(1);
    
    // Get filename from either the old or new DocumentPicker result structure
    const fileName = result.name || (result.assets && result.assets[0]?.name) || 'Unnamed file';
    
    return {
      success: true,
      headers,
      rows,
      fileName,
    };
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return { success: false, message: `Error parsing Excel file: ${error.message}` };
  }
};

// Function to map Excel columns to student data fields
export const mapExcelColumnsToFields = (headers, mappings) => {
  // Validate that all required fields are mapped
  if (!mappings.year || !mappings.group || !mappings.id) {
    return { success: false, message: 'All required fields must be mapped' };
  }
  
  // Check that mappings are valid column indices
  if (!headers[mappings.year] || !headers[mappings.group] || !headers[mappings.id]) {
    return { success: false, message: 'Invalid column mappings' };
  }
  
  return { success: true };
};

// Function to process and validate mapped data
export const processExcelData = (rows, headers, mappings) => {
  try {
    const processedData = [];
    const errors = [];
    
    // Validate column mappings first
    if (mappings.year === null || mappings.year === undefined ||
        mappings.group === null || mappings.group === undefined ||
        mappings.id === null || mappings.id === undefined) {
      return { 
        success: false, 
        message: 'Invalid column mappings. Please select all required columns.' 
      };
    }
    
    // Check that mappings are valid column indices
    if (!headers[mappings.year] || !headers[mappings.group] || !headers[mappings.id]) {
      return { 
        success: false, 
        message: 'Selected columns do not match the expected headers.' 
      };
    }
    
    // Process each row
    rows.forEach((row, index) => {
      // Skip empty rows
      if (!row || row.length === 0) return;
      
      const yearIndex = mappings.year;
      const groupIndex = mappings.group;
      const idIndex = mappings.id;
      
      const year = row[yearIndex]?.toString().trim();
      const group = row[groupIndex]?.toString().trim();
      const id = row[idIndex]?.toString().trim();
      
      // Validate required fields
      if (!year || !group || !id) {
        errors.push(`Row ${index + 2}: Missing required fields`);
        return;
      }
      
      // Process year field - extract number if format is like "Year 1"
      let processedYear = year;
      if (year.toLowerCase().startsWith('year')) {
        const match = year.match(/\d+/);
        if (match) {
          processedYear = match[0];
        }
      }
      
      // Add to processed data
      processedData.push({
        "Year": processedYear,
        "Group": group,
        "Student ID": id
      });
    });
    
    if (errors.length > 0) {
      return {
        success: false,
        errors: errors,
        message: `Found ${errors.length} errors in the Excel data`
      };
    }
    
    return {
      success: true,
      data: processedData,
      errors: []
    };
  } catch (error) {
    console.error('Error processing Excel data:', error);
    return { success: false, message: `Error processing Excel data: ${error.message}` };
  }
};

// Function to merge Excel data with existing students data
export const mergeStudentsData = async (excelData) => {
  try {
    // Get current students data
    const { students, sha } = await fetchStudents();
    
    // Create a map of existing students by ID for quick lookup
    const existingStudentsMap = {};
    students.forEach(student => {
      const id = student["Student ID"] || student.id;
      existingStudentsMap[id] = student;
    });
    
    // Process each row from Excel
    let updated = 0;
    let added = 0;
    
    excelData.forEach(newStudent => {
      const studentId = newStudent["Student ID"];
      
      if (existingStudentsMap[studentId]) {
        // Update existing student - overwrite with new data
        existingStudentsMap[studentId]["Year"] = newStudent["Year"];
        existingStudentsMap[studentId]["Group"] = newStudent["Group"];
        updated++;
      } else {
        // Add new student
        students.push(newStudent);
        existingStudentsMap[studentId] = newStudent;
        added++;
      }
    });
    
    // Update file in GitHub if changes were made
    if (added > 0 || updated > 0) {
      await updateStudentsFile(students, sha);
    }
    
    return {
      success: true,
      added,
      updated,
      total: excelData.length
    };
  } catch (error) {
    console.error('Error merging students data:', error);
    return { success: false, message: `Error merging students data: ${error.message}` };
  }
};
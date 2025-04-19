import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { backupToGitHub } from './backup';
import * as MediaLibrary from 'expo-media-library'; // Add this import

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

// Format date for filenames
const formatDateTimeForFile = (date) => {
  return date.toISOString().replace(/:/g, '-').replace(/\..+/, '');
};

// Helper function to check online status
const checkOnlineStatus = async () => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable;
  } catch (error) {
    console.log("Error checking online status:", error);
    return false;
  }
};

// Queue backup requests for when connection is available
const queueBackupForLater = async (session) => {
  try {
    const pendingBackups = await AsyncStorage.getItem('pendingBackups') || '[]';
    const backupsArray = JSON.parse(pendingBackups);

    // Add more metadata for better retry handling
    backupsArray.push({
      session: session,
      timestamp: new Date().toISOString(),
      attempted: false,
      retryCount: 0,
      lastAttempt: null
    });

    await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
    console.log("Backup queued for later");

    // Also add an event to notify user that action is queued
    return { success: true, queued: true, message: 'Backup will be completed when online' };
  } catch (error) {
    console.error("Error queuing backup:", error);
    return { success: false, message: `Error queuing backup: ${error.message}` };
  }
};

// This is a new function to save a file to the Downloads directory
const saveToDownloads = async (fileUri, fileName) => {
  try {
    // Request permissions first
    const { status } = await MediaLibrary.requestPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        "Permission Required",
        "We need access to your media library to save files to Downloads.",
        [{ text: "OK" }]
      );
      return { success: false, message: "Permission not granted" };
    }
    
    // Save the file to device
    const asset = await MediaLibrary.createAssetAsync(fileUri);
    
    // On Android, we can add it directly to the Downloads directory
    if (Platform.OS === 'android') {
      // Get the Downloads directory
      const album = await MediaLibrary.getAlbumAsync('Download');
      
      if (album) {
        // If Downloads album exists, add asset to it
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        // Create a new album if needed (unlikely for Download folder)
        await MediaLibrary.createAlbumAsync('Download', asset, false);
      }
      
      Alert.alert(
        "Export Successful",
        `File saved to Downloads folder as "${fileName}"`,
        [{ text: "OK" }]
      );
    } else {
      // On iOS, we don't have direct access to Downloads, so just save to camera roll
      Alert.alert(
        "Export Successful",
        `File saved to your device as "${fileName}"`,
        [{ text: "OK" }]
      );
    }
    
    return { success: true, uri: asset.uri };
  } catch (error) {
    console.error("Error saving to downloads:", error);
    return { success: false, message: error.message };
  }
};

// Export single session to Excel
export const exportSession = async (session) => {
  try {
    // Create a nice filename
    const fileName = `${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;

    // Prepare data
    const data = [
      ['Student ID', 'Location', 'Log Date', 'Log Time', 'Number']
    ];

    session.scans.forEach(scan => {
      const scanDate = new Date(scan.time);
      data.push([
        scan.content,           // QR code content is now Student ID
        session.location,
        formatDate(scanDate),
        formatTime(scanDate),
        scan.id                // Row number
      ]);
    });

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scans");

    // Convert workbook to binary string
    const wbout = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });

    // Define file path in app's cache directory (temporary location)
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    // Write the file
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64
    });

    // Verify the file was created
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error("File not created");
    }

    console.log("Excel file saved temporarily to:", fileUri);

    // Save to downloads
    const saveResult = await saveToDownloads(fileUri, fileName);
    
    if (!saveResult.success) {
      throw new Error(`Failed to save to Downloads: ${saveResult.message}`);
    }

    // Also share the file
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export Session Data',
      UTI: 'com.microsoft.excel.xlsx'
    });

    // After successful local save and share, attempt GitHub backup if online
    try {
      const isOnline = await checkOnlineStatus();
      if (isOnline) {
        await backupToGitHub([session], false, fileName, wb);
        console.log("GitHub backup of Excel complete");
      } else {
        console.log("Offline mode - GitHub backup skipped");
        await queueBackupForLater(session);
      }
    } catch (err) {
      console.error("GitHub backup failed:", err);
      await queueBackupForLater(session);
    }

    return { success: true, message: 'Export successful!', filePath: saveResult.uri };
  } catch (error) {
    console.error("Error exporting Excel file:", error);
    Alert.alert(
      "Export Failed",
      `Error: ${error.message}`,
      [{ text: "OK" }]
    );
    return { success: false, message: `Error exporting file: ${error.message}` };
  }
};

// Export all sessions to Excel
export const exportAllSessions = async (sessions) => {
  try {
    if (sessions.length === 0) {
      Alert.alert(
        "No Data",
        "There are no sessions to export",
        [{ text: "OK" }]
      );
      return { success: false, message: "No sessions to export" };
    }

    const fileName = `QR_Scan_All_Sessions_${formatDateTimeForFile(new Date())}.xlsx`;
    const wb = XLSX.utils.book_new();

    // First, create an "AllSessions" sheet with every scan
    const allScansData = [
      ['Student ID', 'Location', 'Log Date', 'Log Time', 'Number']
    ];

    let globalCounter = 1;

    // Iterate through each session and add its scans to the master list
    sessions.forEach(session => {
      if (!session.scans || !Array.isArray(session.scans)) {
        console.warn("Session has no valid scans array:", session);
        return; // Skip this session
      }

      session.scans.forEach(scan => {
        try {
          const scanDate = new Date(scan.time);
          allScansData.push([
            scan.content || "",
            session.location || "Unknown",
            formatDate(scanDate),
            formatTime(scanDate),
            scan.id || globalCounter++
          ]);
        } catch (error) {
          console.error("Error processing scan:", scan, error);
        }
      });
    });

    // Create the AllSessions sheet
    if (allScansData.length > 1) {
      try {
        const allScansSheet = XLSX.utils.aoa_to_sheet(allScansData);
        XLSX.utils.book_append_sheet(wb, allScansSheet, "AllScans");
      } catch (error) {
        console.error("Error creating AllScans sheet:", error);
      }
    }

    // Then create individual sheets for each session
    sessions.forEach((session, index) => {
      try {
        if (!session.scans || !Array.isArray(session.scans) || session.scans.length === 0) {
          console.warn("Skipping empty session:", session);
          return;
        }

        const sessionData = [
          ['Student ID', 'Location', 'Log Date', 'Log Time', 'Number']
        ];

        session.scans.forEach(scan => {
          try {
            const scanDate = new Date(scan.time);
            sessionData.push([
              scan.content || "",
              session.location || "Unknown",
              formatDate(scanDate),
              formatTime(scanDate),
              scan.id || sessionData.length
            ]);
          } catch (error) {
            console.error("Error processing scan for session sheet:", scan, error);
          }
        });

        // Create a sheet name from location or use a default
        let sheetName = session.location
          ? session.location.substring(0, 25).replace(/[^a-z0-9]/gi, '_')
          : "Session";

        // Ensure unique sheet name by adding index if needed
        sheetName = sheetName.substring(0, 27) + "_" + (index + 1);

        // Create and add the sheet
        const sessionSheet = XLSX.utils.aoa_to_sheet(sessionData);
        XLSX.utils.book_append_sheet(wb, sessionSheet, sheetName);
      } catch (error) {
        console.error("Error creating sheet for session:", session, error);
      }
    });

    // Convert workbook to binary string
    const wbout = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });

    // Define file path in app's cache directory (temporary location)
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    // Write the file
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64
    });

    // Verify the file was created
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error("File not created");
    }

    console.log("All sessions exported temporarily to:", fileUri);
    
    // Save to downloads
    const saveResult = await saveToDownloads(fileUri, fileName);
    
    if (!saveResult.success) {
      throw new Error(`Failed to save to Downloads: ${saveResult.message}`);
    }

    // Also share the file
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export All Sessions Data',
      UTI: 'com.microsoft.excel.xlsx'
    });

    // Attempt GitHub backup
    try {
      const isOnline = await checkOnlineStatus();
      if (isOnline) {
        await backupToGitHub(sessions, false, fileName, wb);
        console.log("GitHub backup complete");
      } else {
        console.log("Offline mode - GitHub backup skipped");
        const backupData = {
          sessions: sessions,
          fileName: fileName,
          timestamp: new Date().toISOString()
        };
        await queueBackupForLater(backupData);
      }
    } catch (e) {
      console.error("Error during GitHub backup:", e);
      const backupData = {
        sessions: sessions,
        fileName: fileName,
        timestamp: new Date().toISOString()
      };
      await queueBackupForLater(backupData);
    }
    
    return { success: true, message: 'Export successful!', filePath: saveResult.uri };
  } catch (error) {  
    console.error("Error writing Excel file:", error);
    Alert.alert(
      "Export Failed",
      `Error: ${error.message}`,
      [{ text: "OK" }]
    );
    return { success: false, message: `Failed to export sessions: ${error.message}` };
  }
};
// This is a new function to save a file to an accessible location
const saveFileToAccessibleLocation = async (fileUri, fileName) => {
  try {
    if (Platform.OS === 'android') {
      // For Android: Save to Downloads folder
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          "Permission Required",
          "We need access to your media library to save files to Downloads.",
          [{ text: "OK" }]
        );
        return { success: false, message: "Permission not granted" };
      }
      
      // Save the file to device
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      
      // Get the Downloads directory
      const album = await MediaLibrary.getAlbumAsync('Download');
      
      if (album) {
        // If Downloads album exists, add asset to it
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        // Create a new album if needed (unlikely for Download folder)
        await MediaLibrary.createAlbumAsync('Download', asset, false);
      }
      
      Alert.alert(
        "Export Successful",
        `File saved to Downloads folder as "${fileName}"`,
        [{ text: "OK" }]
      );
      
      return { success: true, uri: asset.uri };
    } else {
      // For iOS: We use the document directory which is persistent
      // Copy file to documents directory for more permanent storage
      const documentDir = FileSystem.documentDirectory;
      const newFileUri = `${documentDir}${fileName}`;
      
      await FileSystem.copyAsync({
        from: fileUri,
        to: newFileUri
      });
      
      Alert.alert(
        "Export Successful",
        `File saved as "${fileName}". Use the Share button to send it to another app.`,
        [{ text: "OK" }]
      );
      
      return { success: true, uri: newFileUri };
    }
  } catch (error) {
    console.error("Error saving file:", error);
    return { success: false, message: error.message };
  }
};
// Make sure these are exported correctly
export {
  exportSession as exportSessionToExcel,
  exportAllSessions as exportAllSessionsToExcel,
  saveToDownloads as saveToDownloads

};
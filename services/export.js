import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { backupToGitHub } from './backup';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import { getCurrentUser } from './auth';

// Define the function
async function getCurrentUserEmail() {
  let userEmail = "unknown";
  try {
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.email) {
      userEmail = currentUser.email;
    }
  } catch (userError) {
    console.error("Error getting current user email:", userError);
  }
  return userEmail;
}

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

    return { success: true, queued: true, message: 'Backup will be completed when online' };
  } catch (error) {
    console.error("Error queuing backup:", error);
    return { success: false, message: `Error queuing backup: ${error.message}` };
  }
};

// Save a file to the "Attendance Recorder" directory with multiple fallback options
const saveToAttendanceRecorder = async (fileUri, fileName, silentMode = false) => {
  try {
    console.log(`Starting save operation for: ${fileName} on ${Platform.OS} device`);
    
    if (Platform.OS === 'android') {
      // First, check for permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log(`Permission status: ${status}`);
      
      if (status !== 'granted') {
        if (!silentMode) {
          Alert.alert(
            "Permission Required",
            "We need access to your media library to save files. Please enable this permission in your device settings.",
            [{ text: "OK" }]
          );
        }
        return { success: false, message: "Permission not granted", shareOnly: true };
      }
      
      // STEP 1: Try direct save to app folder via MediaLibrary
      try {
        console.log('Attempting direct save via MediaLibrary...');
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        
        if (!asset) {
          throw new Error("Could not create asset from file");
        }
        
        console.log('Asset created:', asset.uri);
        
        // Try to use our custom app folder
        const appFolderName = "Attendance Recorder";
        let album = await MediaLibrary.getAlbumAsync(appFolderName);
        
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          console.log(`Added asset to "${appFolderName}" album`);
        } else {
          // Create the album if it doesn't exist
          album = await MediaLibrary.createAlbumAsync(appFolderName, asset, false);
          console.log(`Created "${appFolderName}" album with asset`);
        }
        
        if (!silentMode) {
          Alert.alert(
            "Export Successful",
            `File saved to "${appFolderName}" folder as "${fileName}"`,
            [{ text: "OK" }]
          );
        }
        
        return { success: true, message: `File saved successfully`, uri: asset.uri };
      } catch (directSaveError) {
        console.error("Direct save method failed:", directSaveError);
        
        // STEP 2: Try Storage Access Framework (SAF)
        try {
          console.log('Attempting save via Storage Access Framework...');
          
          // Create a DocumentPicker to let user choose save location
          // First we need to copy to a more permanent location since some Android versions
          // might not allow access to cache files through SAF
          const tempDir = FileSystem.documentDirectory;
          const tempFileUri = `${tempDir}${fileName}`;
          
          // Copy to documents directory first
          await FileSystem.copyAsync({
            from: fileUri,
            to: tempFileUri
          });
          
          // Now use document picker with SAF
          if (!silentMode) {
            Alert.alert(
              "Save Location",
              "Please select a folder where you'd like to save this file.",
              [
                {
                  text: "OK",
                  onPress: async () => {
                    try {
                      // We'll use sharing with action "SEND" which uses SAF internally
                      await Sharing.shareAsync(tempFileUri, {
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        dialogTitle: 'Save Excel File',
                        UTI: 'com.microsoft.excel.xlsx'
                      });
                    } catch (shareError) {
                      console.error("SAF sharing error:", shareError);
                      // If this fails, we'll continue to the file sharing fallback
                    }
                  }
                }
              ]
            );
          }
          
          return { success: true, message: "File available via Storage Access Framework", uri: tempFileUri, shareOnly: false };
        } catch (safError) {
          console.error("Storage Access Framework method failed:", safError);
          
          // STEP 3: Fall back to file sharing as last resort
          console.log('Falling back to sharing mechanism...');
          if (!silentMode) {
            Alert.alert(
              "Storage Access Limited",
              "Could not save file directly. Please use the Share screen to save the file to your preferred location.",
              [{ text: "OK" }]
            );
          }
          
          return { success: true, message: "File available for sharing", uri: fileUri, shareOnly: true };
        }
      }
    } else if (Platform.OS === 'ios') {
      // iOS code remains the same
      const documentDir = FileSystem.documentDirectory;
      const newFileUri = `${documentDir}${fileName}`;
      
      await FileSystem.copyAsync({
        from: fileUri,
        to: newFileUri
      });
      
      console.log("File saved to documents:", newFileUri);
      
      if (!silentMode) {
        Alert.alert(
          "Export Successful",
          `File saved. Use the Share button to send it to another app or save it to Files.`,
          [{ text: "OK" }]
        );
      }
      
      return { success: true, message: `File saved to app documents`, uri: newFileUri };
    }
    
    // If all else fails
    console.error("No save method worked");
    return { success: false, message: "Could not save file", shareOnly: true };
    
  } catch (error) {
    console.error("Error in saveToAttendanceRecorder:", error);
    return { success: false, message: `Error: ${error.message}`, shareOnly: true };
  }
};

// Queue session for backup
const queueSessionForBackup = async (session, silentMode = false) => {
  try {
    await queueBackupForLater(session);
    if (!silentMode) {
      Alert.alert(
        "Session Saved For Backup", 
        "Your session data will be backed up automatically when an internet connection is available."
      );
    }
    return { success: true, queued: true };
  } catch (error) {
    console.error("Error queueing session for backup:", error);
    return { success: false, message: error.message };
  }
};

// Export single session to Excel
export const exportSession = async (session, silentMode = false) => {
  try {
    console.log("Starting session export for session:", session.id);
    
    // Check if session has any scans
    if (!session.scans || session.scans.length === 0) {
      console.log("Session has no scans, skipping export");
      if (!silentMode) {
        Alert.alert("Empty Session", "There are no entries to export. Export cancelled.");
      }
      return { success: false, message: 'Export cancelled: No entries to export' };
    }
    
    // Get current user email
    let userEmail = await getCurrentUserEmail();
    
    const fileName = `Session_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    
    // Prepare data with Type column before User column, matching scanner/checklist format
    const data = [
      ['Student ID', 'Subject', 'Log Date', 'Log Time', 'Type', 'User']
    ];

    session.scans.forEach((scan, index) => {
      const scanDate = new Date(scan.time || scan.timestamp);
      data.push([
        scan.content,                // Student ID
        session.location,            // Subject
        formatDate(scanDate),        // Log Date
        formatTime(scanDate),        // Log Time
        scan.isManual ? "Manual" : "Scan",  // Type of entry
        userEmail                    // User email (current logged in user)
      ]);
    });
    
    console.log(`Prepared data with ${session.scans.length} entries and user: ${userEmail}`);

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Session");

    // Convert workbook to base64 instead of binary string
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    // Define file path in app's cache directory (temporary location)
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    console.log("Temporary file location:", fileUri);

    // Write the file
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64
    });

    // Verify the file was created
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      console.error("File not created at:", fileUri);
      throw new Error("File not created");
    }
    console.log("Excel file saved temporarily to:", fileUri);

    // Save to Attendance Recorder folder
    const saveResult = await saveToAttendanceRecorder(fileUri, fileName, silentMode);

    if (!saveResult.success && !saveResult.shareOnly) {
      console.error("Save to downloads failed:", saveResult.message);
      throw new Error(`Failed to save to Downloads: ${saveResult.message}`);
    }

    // Always share the file
    console.log("Sharing file");
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export Session Data',
      UTI: 'com.microsoft.excel.xlsx'
    });

    // Check connection and handle backup
    const isOnline = await checkOnlineStatus();
    console.log("Online status for backup:", isOnline);
    
    if (isOnline) {
      console.log("Online - attempting backup");
      try {
        const backupResult = await backupToGitHub([session], false, fileName, wb);
        console.log("Backup result:", backupResult);
        if (backupResult && backupResult.success) {
          console.log("Session backed up successfully");
          // Only show backup success alert if not in silent mode
          if (!silentMode) {
            Alert.alert("Backup Successful", "Session backed up to server successfully!");
          }
        } else {
          throw new Error("Backup failed with error: " + (backupResult?.message || "Unknown error"));
        }
      } catch (backupError) {
        console.error("Error during backup:", backupError);
        // Queue for later backup
        await queueSessionForBackup(session, silentMode);
        if (!silentMode) {
          Alert.alert("Backup Failed", "Unable to backup to server. The session is saved locally and will be backed up when online.");
        }
      }
    } else {
      console.log("Offline - queueing for backup later");
      // Queue for backup when back online
      await queueSessionForBackup(session, silentMode);
    }
    
    console.log("Session export completed successfully");
    return { 
      success: true, 
      message: 'Export successful!', 
      filePath: saveResult.uri || fileUri 
    };
  } catch (error) {
    console.error("Error exporting session:", error);
    if (!silentMode) {
      Alert.alert("Export Error", "Failed to export session: " + error.message);
    }
    // Still try to queue for backup even if export failed
    try {
      await queueSessionForBackup(session, silentMode);
    } catch (queueError) {
      console.error("Error queueing for backup:", queueError);
    }
    return { success: false, message: `Error exporting file: ${error.message}` };
  }
};

// Export all sessions to Excel
export const exportAllSessions = async (sessions, silentMode = false) => {
  try {
    console.log("Starting export for all sessions");
    
    // Check if there are any sessions
    if (sessions.length === 0) {
      console.log("No sessions to export");
      if (!silentMode) {
        Alert.alert("No Data", "There are no sessions to export");
      }
      return { success: false, message: "No sessions to export" };
    }

    // Get current user email
    let userEmail = await getCurrentUserEmail();
    
    const fileName = `All_Sessions_${formatDateTimeForFile(new Date())}.xlsx`;
    const wb = XLSX.utils.book_new();

    // First, create an "AllSessions" sheet with every scan
    const allScansData = [
      ['Student ID', 'Subject', 'Log Date', 'Log Time', 'Type', 'User']
    ];

    // Iterate through each session and add its scans to the master list
    sessions.forEach(session => {
      if (!session.scans || !Array.isArray(session.scans)) {
        console.warn("Session has no valid scans array:", session);
        return; // Skip this session
      }

      session.scans.forEach((scan, index) => {
        try {
          const scanDate = new Date(scan.time || scan.timestamp);
          allScansData.push([
            scan.content || "",                 // Student ID
            session.location || "Unknown",      // Subject
            formatDate(scanDate),               // Log Date
            formatTime(scanDate),               // Log Time
            scan.isManual ? "Manual" : "Scan",  // Type of entry
            userEmail                           // User email
          ]);
        } catch (error) {
          console.error("Error processing scan:", scan, error);
        }
      });
    });

    // Create the AllScans sheet
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
          ['Student ID', 'Subject', 'Log Date', 'Log Time', 'Type', 'User']
        ];

        session.scans.forEach((scan, idx) => {
          try {
            const scanDate = new Date(scan.time || scan.timestamp);
            sessionData.push([
              scan.content || "",                  // Student ID
              session.location || "Unknown",       // Subject
              formatDate(scanDate),                // Log Date
              formatTime(scanDate),                // Log Time
              scan.isManual ? "Manual" : "Scan",   // Type of entry
              userEmail                            // User email
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

    // Convert workbook to base64 string (NOT binary)
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    // Define file path in app's cache directory (temporary location)
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    console.log("Temporary file location:", fileUri);

    // Write the file with Base64 encoding
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64
    });

    // Verify the file was created
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      console.error("File not created at:", fileUri);
      throw new Error("File not created");
    }

    console.log("All sessions exported temporarily to:", fileUri);
    
    // Save to Attendance Recorder
    const saveResult = await saveToAttendanceRecorder(fileUri, fileName, silentMode);

    if (!saveResult.success && !saveResult.shareOnly) {
      console.error("Save to downloads failed:", saveResult.message);
      throw new Error(`Failed to save to Downloads: ${saveResult.message}`);
    }

    // Always share the file, especially if direct save failed
    console.log("Sharing file");
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export All Sessions Data',
      UTI: 'com.microsoft.excel.xlsx'
    });

    // Check connection and handle backup
    const isOnline = await checkOnlineStatus();
    console.log("Online status for backup:", isOnline);
    
    // Attempt GitHub backup
    if (isOnline) {
      console.log("Online - attempting GitHub backup");
      try {
        const backupResult = await backupToGitHub(sessions, false, fileName, wb);
        console.log("Backup result:", backupResult);
        if (backupResult && backupResult.success) {
          console.log("All sessions backed up successfully");
          if (!silentMode) {
            Alert.alert("Backup Successful", "Sessions backed up to server successfully!");
          }
        } else {
          throw new Error("Backup failed with error: " + (backupResult?.message || "Unknown error"));
        }
      } catch (backupError) {
        console.error("Error during backup:", backupError);
        // Create combined session data for backup
        const backupData = {
          sessions: sessions,
          fileName: fileName,
          timestamp: new Date().toISOString()
        };
        await queueBackupForLater(backupData);
        if (!silentMode) {
          Alert.alert("Backup Failed", "Unable to backup to server. The sessions are saved locally and will be backed up when online.");
        }
      }
    } else {
      console.log("Offline - queueing for backup later");
      // Create combined session data for backup
      const backupData = {
        sessions: sessions,
        fileName: fileName,
        timestamp: new Date().toISOString()
      };
      await queueBackupForLater(backupData);
      if (!silentMode) {
        Alert.alert("Offline Backup", "Sessions saved locally and will be backed up when online.");
      }
    }
    
    console.log("All sessions export completed successfully");
    return { 
      success: true, 
      message: 'Export successful!', 
      filePath: saveResult.uri || fileUri 
    };
  } catch (error) {  
    console.error("Error writing Excel file:", error);
    if (!silentMode) {
      Alert.alert("Export Failed", "Failed to export sessions: " + error.message);
    }
    return { success: false, message: `Failed to export sessions: ${error.message}` };
  }
};

// Make sure these are exported correctly
export {
  formatDate,
  formatTime,
  formatDateTimeForFile,
  checkOnlineStatus,
  queueBackupForLater,
  saveToAttendanceRecorder,
  queueSessionForBackup,
  exportSession as exportSessionToExcel,
  exportAllSessions as exportAllSessionsToExcel
};
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Text, Button, Surface, Title, Checkbox, Modal, Portal, Provider, Searchbar, List, Divider, DataTable, TextInput } from 'react-native-paper';
import { BarCodeScanner } from 'expo-barcode-scanner';
import * as SQLite from 'expo-sqlite';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { backupToGitHub, tryAutoBackup, processPendingBackups } from '../services/backup';
// Match the key used in backup.js
const LAST_BACKUP_TIME_KEY = 'qrScannerLastBackupTime';
// Storage keys for recovery
const SCANNER_ACTIVE_SESSION_STORAGE_KEY = 'activeScannerSession';
const TEMP_SCANNER_SESSION_INDEX_KEY = 'tempScannerSessionIndex';
const ScannerScreen = ({ isOnline }) => {
// State variables
const [hasPermission, setHasPermission] = useState(null);
const [scanned, setScanned] = useState(false);
const [activeSession, setActiveSession] = useState(null);
const [scans, setScans] = useState([]);
const [showSessionModal, setShowSessionModal] = useState(false);
const [showManualEntryModal, setShowManualEntryModal] = useState(false);
const [location, setLocation] = useState('');
const [manualId, setManualId] = useState('');
const [scanStatus, setScanStatus] = useState('');
const [sound, setSound] = useState();
const [sessions, setSessions] = useState([]);
// Location options for the session location dropdown
const locationOptions = [
"Morgue",
"Anatomy Lecture Hall",
"Histology Lab",
"Histology Lecture Hall",
"Biochemistry Lab",
"Biochemistry Lecture Hall",
"Physiology Lab",
"Physiology Lecture Hall",
"Microbiology Lab",
"Microbiology Lecture Hall",
"Parasitology Lab",
"Parasitology Lecture Hall",
"Pathology Lab",
"Pathology Lecture Hall",
"Pharmacology Lab",
"Pharmacology Lecture Hall",
"Building 'A' Lecture Hall",
"Building 'B' Lecture Hall"
];
// Database reference
const db = SQLite.openDatabase('qrscanner.db');
// Add a message state to show online/offline status
const [connectionMessage, setConnectionMessage] = useState('');
// Update connection message when online status changes
useEffect(() => {
  if (isOnline) {
    setConnectionMessage('Online - All features available');
    // If we're back online and there's a session that needs to be backed up remotely
    if (activeSession && !activeSession.backedUp) {
      setScanStatus('Back online - Session will be backed up automatically');
      
      // Process any pending backups when coming online
      processPendingBackups()
        .then(result => {
          if (result && result.processed > 0) {
            setScanStatus(`Processed ${result.processed} pending backups`);
            // Clear message after a timeout
            setTimeout(() => {
              setScanStatus('');
            }, 5000);
          } else {
            // Clear any "will be backed up when online" messages
            setScanStatus('');
          }
        })
        .catch(error => console.error("Error processing pending backups:", error));
    } else {
      // Clear any "will be backed up when online" messages
      setScanStatus('');
    }
    
    // Check for pending backups when coming online
    checkAndProcessPendingBackups();
  } else {
    setConnectionMessage('Offline - Working in local mode');
  }
}, [isOnline, activeSession]);

// Request camera permission when component mounts
useEffect(() => {
(async () => {
const { status } = await BarCodeScanner.requestPermissionsAsync();
setHasPermission(status === 'granted');
})();
// Create tables if they don't exist
db.transaction(tx => {
tx.executeSql(
'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, location TEXT, dateTime TEXT, inProgress INTEGER)'
);
tx.executeSql(
'CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT, content TEXT, time TEXT, isManual INTEGER, FOREIGN KEY (sessionId) REFERENCES sessions (id))'
);
});
// Initialize scanner module
initializeScannerModule();
return () => {
if (sound) {
sound.unloadAsync();
}
};
}, []);
// Initialize scanner module
const initializeScannerModule = async () => {
console.log("Initializing scanner module...");
// Check for recoverable session
await checkForRecoverableScannerSession();
// Load sessions from storage
const savedSessions = await AsyncStorage.getItem('sessions');
if (savedSessions) {
setSessions(JSON.parse(savedSessions));
}
// Make sure the pendingBackups array exists
AsyncStorage.getItem('pendingBackups').then(pendingBackups => {
if (!pendingBackups) {
AsyncStorage.setItem('pendingBackups', JSON.stringify([]));
console.log("Initialized empty pendingBackups array");
}
});
}; 
// Check and process pending backups when coming online
const checkAndProcessPendingBackups = async () => {
if (!isOnline) {
console.log("Cannot process backups while offline");
return;
}
try {
console.log("Checking for pending backups...");
// setScanStatus('Checking for pending backups...');  // Removed UI update
const result = await processPendingBackups();
console.log("Process pending backups result:", result);
if (result.success) {
if (result.message.includes('processed')) {
// setScanStatus(result.message);  // Removed UI update
// Refresh sessions to update backup status
const savedSessions = await AsyncStorage.getItem('sessions');
if (savedSessions) {
// setSessions(JSON.parse(savedSessions));  // Removed UI update
}
}
}
} catch (error) {
console.error('Error processing pending backups:', error);
// setScanStatus('Error processing backups');  // Removed UI update
}
};
// Add this function to ScannerScreen.js
const markSessionAsCompleted = async (sessionId) => {
try {
// Update session in AsyncStorage
const savedSessions = await AsyncStorage.getItem('sessions');
if (savedSessions) {
const parsedSessions = JSON.parse(savedSessions);
const sessionIndex = parsedSessions.findIndex(s => s.id === sessionId);
if (sessionIndex !== -1) {
// Update session status
const updatedSessions = [...parsedSessions];
updatedSessions[sessionIndex] = {
...updatedSessions[sessionIndex],
inProgress: false
};
// Save updated sessions
await AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
setSessions(updatedSessions);
console.log(`Session ${sessionId} marked as completed`);
}
}
// Also update SQLite database for backward compatibility
db.transaction(tx => {
tx.executeSql(
'UPDATE sessions SET inProgress = 0 WHERE id = ?',
[sessionId]
);
});
// Clear recovery data
await AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY);
} catch (error) {
console.error("Error marking session as completed:", error);
}
};
// Check for recoverable scanner session
const checkForRecoverableScannerSession = async () => {
try {
// Check for active session
const savedActiveSession = await AsyncStorage.getItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY);
if (savedActiveSession) {
const parsedSession = JSON.parse(savedActiveSession);
if (parsedSession && parsedSession.id && parsedSession.scans) {
Alert.alert(
"Recover Session",
`Found an incomplete scanner session at ${parsedSession.location} with ${parsedSession.scans.length} scans. Would you like to recover it?`,
[
{
text: "Yes",
onPress: () => recoverScannerSession(parsedSession)
},
{
text: "No",
onPress: () => {
const sessionId = parsedSession.id;
markSessionAsCompleted(sessionId);
clearActiveScannerSession();
}
}
]
);
return;
}
}
// Check for in-progress session in history
const tempSessionIndex = await AsyncStorage.getItem(TEMP_SCANNER_SESSION_INDEX_KEY);
if (tempSessionIndex !== null) {
const allSessions = await AsyncStorage.getItem('sessions');
if (allSessions) {
const parsedSessions = JSON.parse(allSessions);
const index = parseInt(tempSessionIndex);
if (!isNaN(index) && index >= 0 && index < parsedSessions.length) {
const tempSession = parsedSessions[index];
if (tempSession && tempSession.inProgress) {
Alert.alert(
"Recover Session",
`Found an incomplete scanner session at ${tempSession.location} with ${tempSession.scans.length} scans in history. Would you like to recover it?`,
[
{
text: "Yes",
onPress: () => recoverScannerSession(tempSession)
},
{
text: "No",
onPress: () => {
const sessionId = tempSession.id;
markSessionAsCompleted(sessionId);
AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY);
}
}
]
);
}
}
}
}
// If no recoverable session, load from database as fallback
if (!savedActiveSession && tempSessionIndex === null) {
loadActiveSession();
}
} catch (error) {
console.error("Error checking for recoverable session:", error);
clearActiveScannerSession();
// Fallback to database
loadActiveSession();
}
};
// Recover scanner session
const recoverScannerSession = (session) => {
// Set active session
setActiveSession(session);
setScans(session.scans || []);
setScanStatus('Session recovered - Ready to scan');
// Check if session exists in sessions array
AsyncStorage.getItem('sessions').then(savedSessions => {
if (savedSessions) {
const parsedSessions = JSON.parse(savedSessions);
const sessionIndex = parsedSessions.findIndex(s => s.id === session.id);
if (sessionIndex === -1) {
// Add session to sessions array
const updatedSessions = [...parsedSessions, session];
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
// Store temp index
const newIndex = updatedSessions.length - 1;
AsyncStorage.setItem(TEMP_SCANNER_SESSION_INDEX_KEY, String(newIndex));
} else {
// Update existing session
const updatedSessions = [...parsedSessions];
updatedSessions[sessionIndex] = {...session};
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
AsyncStorage.setItem(TEMP_SCANNER_SESSION_INDEX_KEY, String(sessionIndex));
}
} else {
// Create new sessions array
const newSessions = [session];
setSessions(newSessions);
AsyncStorage.setItem('sessions', JSON.stringify(newSessions));
AsyncStorage.setItem(TEMP_SCANNER_SESSION_INDEX_KEY, '0');
}
});
// Save active session
saveActiveScannerSession(session);
// Also save to SQLite for backward compatibility
syncSessionToDatabase(session);
console.log("Scanner session recovered successfully");
};
// Sync session to SQLite database (for backward compatibility)
const syncSessionToDatabase = (session) => {
if (!session) return;
db.transaction(tx => {
// First check if session exists
tx.executeSql(
'SELECT * FROM sessions WHERE id = ?',
[session.id],
(_, { rows }) => {
if (rows.length === 0) {
// Insert new session
tx.executeSql(
'INSERT INTO sessions (id, location, dateTime, inProgress) VALUES (?, ?, ?, ?)',
[session.id, session.location, session.dateTime, 1]
);
} else {
// Update existing session
tx.executeSql(
'UPDATE sessions SET location = ?, dateTime = ?, inProgress = ? WHERE id = ?',
[session.location, session.dateTime, 1, session.id]
);
}
// Clear existing scans for this session
tx.executeSql(
'DELETE FROM scans WHERE sessionId = ?',
[session.id],
() => {
// Insert each scan
if (session.scans && session.scans.length > 0) {
session.scans.forEach(scan => {
tx.executeSql(
'INSERT INTO scans (sessionId, content, time, isManual) VALUES (?, ?, ?, ?)',
[session.id, scan.content, scan.timestamp, scan.isManual ? 1 : 0]
);
});
}
}
);
}
);
});
};
// Save active session to storage
const saveActiveScannerSession = (session = activeSession) => {
if (session) {
AsyncStorage.setItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session))
.then(() => console.log("Active scanner session saved:", session.id))
.catch(error => console.error("Error saving active scanner session:", error));
}
};
// Clear active session from storage
const clearActiveScannerSession = () => {
AsyncStorage.removeItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY)
.then(() => AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY))
.then(() => console.log("Active scanner session cleared from storage"))
.catch(error => console.error("Error clearing active scanner session:", error));
};
// Load active session from database (legacy method)
const loadActiveSession = () => {
db.transaction(tx => {
tx.executeSql(
'SELECT * FROM sessions WHERE inProgress = 1',
[],
(_, { rows }) => {
if (rows.length > 0) {
const session = rows._array[0];
// Load scans for this session
tx.executeSql(
'SELECT * FROM scans WHERE sessionId = ? ORDER BY id',
[session.id],
(_, { rows: scanRows }) => {
const formattedScans = scanRows._array.map(scan => ({
id: scan.id,
content: scan.content,
timestamp: scan.time,
formattedTime: formatTime(new Date(scan.time)),
isManual: scan.isManual
}));
const formattedSession = {
...session,
formattedDateTime: formatDateTime(new Date(session.dateTime)),
scans: formattedScans
};
setActiveSession(formattedSession);
setScans(formattedScans);
setScanStatus('Session loaded - Ready to scan');
// Also save to AsyncStorage for recovery
saveActiveScannerSession(formattedSession);
}
);
}
}
);
});
};
// Play success sound
async function playSuccessSound() {
try {
// First check if file exists
const fileInfo = await FileSystem.getInfoAsync(
FileSystem.documentDirectory + 'beep.mp3'
);
let soundObject;
if (fileInfo.exists) {
// Use file from document directory
const { sound } = await Audio.Sound.createAsync({ uri: fileInfo.uri });
soundObject = sound;
} else {
// Use bundled asset - corrected path
const { sound } = await Audio.Sound.createAsync(require('../assets/beep.mp3'));
soundObject = sound;
}
setSound(soundObject);
await soundObject.playAsync();
} catch (error) {
console.error('Error playing sound:', error);
// Continue without sound if there's an error
}
}
// Start new session
const startSession = () => {
if (!location.trim()) {
Alert.alert('Error', 'Please enter a location');
return;
}
const now = new Date();
const sessionId = `session_${now.getTime()}`;
const formattedDateTime = formatDateTime(now);
const newSession = {
id: sessionId,
location: location,
dateTime: now.toISOString(),
formattedDateTime: formattedDateTime,
scans: [],
inProgress: true
};
// Set active session
setActiveSession(newSession);
setScans([]);
setShowSessionModal(false);
setScanStatus('Session started - Ready to scan');
// Add session to sessions array
AsyncStorage.getItem('sessions').then(savedSessions => {
const parsedSessions = savedSessions ? JSON.parse(savedSessions) : [];
const updatedSessions = [...parsedSessions, newSession];
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
// Store temp index
const index = updatedSessions.length - 1;
AsyncStorage.setItem(TEMP_SCANNER_SESSION_INDEX_KEY, String(index));
});
// Save active session
saveActiveScannerSession(newSession);
// Also save to SQLite for backward compatibility
db.transaction(tx => {
tx.executeSql(
'INSERT INTO sessions (id, location, dateTime, inProgress) VALUES (?, ?, ?, ?)',
[sessionId, location, now.toISOString(), 1],
null,
(_, error) => {
console.error('Error starting session in database:', error);
}
);
});
console.log("New scanner session created:", sessionId);
};
// End current session
const endSession = () => {
if (!activeSession) return;
Alert.alert(
'End Session',
'Are you sure you want to end the current session?',
[
{ text: 'Cancel', style: 'cancel' },
{ 
text: 'End Session', 
style: 'destructive',
onPress: () => {
finalizeSession();
}
}
]
);
};
// Queue session for backup when offline
const queueSessionForBackup = async (session) => {
  try {
    console.log("Queueing session for backup:", session.id);
    // Get existing pending backups
    const pendingBackups = await AsyncStorage.getItem('pendingBackups');
    const backupsArray = pendingBackups ? JSON.parse(pendingBackups) : [];
    
    // Generate a proper file name
const fileName = `Scanner_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;    
    // Add this session to pending backups
    backupsArray.push({
      timestamp: new Date().toISOString(),
      session: session,
      fileName: fileName,
      type: 'scanner'
    });
    
    // Save updated pending backups
    await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
    console.log(`Session queued for backup. Total pending: ${backupsArray.length}`);
    
    // Display status message about offline backup
    setScanStatus(`Session saved offline. Will be backed up when online.`);
    
    // Show alert with offline backup information
    Alert.alert(
      "Session Saved Offline",
      "This session has been saved offline and will be backed up automatically when you're back online.",
      [{ text: "OK" }]
    );
  } catch (error) {
    console.error("Error queueing session for backup:", error);
    Alert.alert("Backup Error", "Failed to queue session for later backup.");
  }
};
// Finalize the scanning session
const finalizeSession = () => {
  if (!activeSession) return;
  
  // Save session for export
  const sessionToExport = { ...activeSession };
  
  // Mark session as completed in history
  AsyncStorage.getItem('sessions').then(savedSessions => {
    if (savedSessions) {
      const parsedSessions = JSON.parse(savedSessions);
      const sessionIndex = parsedSessions.findIndex(s => s.id === activeSession.id);
      if (sessionIndex !== -1) {
        const updatedSessions = [...parsedSessions];
        updatedSessions[sessionIndex] = {
          ...updatedSessions[sessionIndex],
          inProgress: false,
          backedUp: isOnline // Mark if backed up based on connection status
        };
        setSessions(updatedSessions);
        AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
        
        // If offline, queue for backup
        if (!isOnline) {
          console.log("App is offline, queueing session for backup");
          queueSessionForBackup(sessionToExport);
        } else {
          console.log("App is online, attempting immediate backup");
          // Try to backup immediately
          try {
            backupToGitHub([sessionToExport], false)
              .then(result => {
                console.log("Backup result:", result);
                if (result && result.success) {
                  // Set last backup time to now
                  const now = new Date();
                  AsyncStorage.setItem(LAST_BACKUP_TIME_KEY, now.toISOString())
                    .then(() => console.log("Last backup time updated"));
                  
                  // Show success message for online backup
                  Alert.alert("Backup Success", "Session backed up to GitHub successfully!");
                } else {
                  console.error("Backup failed:", result);
                  // Only show alert if it's not an empty workbook error
                  if (!result.message || !result.message.includes('empty')) {
                    Alert.alert("Backup Failed", "Unable to backup to GitHub. The session is saved locally.");
                  } else {
                    console.log("Empty workbook - skipping backup silently");
                  }
                }
              })
              .catch(error => {
                console.error("Backup error:", error);
                // Only show alert if it's not an empty workbook error
                if (!error.message.includes('Workbook is empty')) {
                  Alert.alert("Backup Error", `Error during backup: ${error.message}`);
                } else {
                  console.log("Empty workbook - skipping backup silently");
                }
              });
          } catch (error) {
            console.error("Exception during backup:", error);
            // Don't show alert for empty workbook errors
            if (!error.message.includes('Workbook is empty')) {
              Alert.alert("Backup Error", `Exception during backup: ${error.message}`);
            }
          }
        }
      }
    }
  });
  
  // Also update SQLite for backward compatibility
  db.transaction(tx => {
    tx.executeSql(
      'UPDATE sessions SET inProgress = 0 WHERE id = ?',
      [activeSession.id]
    );
  });
  
  // Clear active session
  setActiveSession(null);
  setScans([]);
  setScanStatus('');
  clearActiveScannerSession();
  
  // Export session to Excel
  if (sessionToExport && sessionToExport.scans && sessionToExport.scans.length > 0) {
    setTimeout(() => {
      exportScannerSession(sessionToExport);
    }, 500);
  }
  
  Alert.alert('Success', 'Session ended successfully');
if (!isOnline && activeSession.scans.length > 0) {
  setTimeout(() => {
    Alert.alert(
      "Session Saved Offline",
      "This session has been saved offline and will be backed up automatically when you're back online.",
      [{ text: "OK" }]
    );
  }, 1500); 
}
  console.log("Scanner session ended successfully");
};
// Export scanner session to Excel
const exportScannerSession = async (session) => {
  try {
    console.log("Starting scanner export for session:", session.id);
    const fileName = `Scanner_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    
    // Prepare data
    const data = [
      ['Number', 'Content', 'Location', 'Log Date', 'Log Time', 'Type']
    ];
    
    // Add scans with row numbers
    session.scans.forEach((scan, index) => {
      const scanDate = new Date(scan.timestamp);
      data.push([
        index + 1,                   // Row number
        scan.content,                // Scanned content
        session.location,            // Location
        formatDate(scanDate),        // Log Date
        formatTime(scanDate),        // Log Time
        scan.isManual ? 'Manual' : 'Scan'  // Type
      ]);
    });
    
    console.log(`Prepared data with ${session.scans.length} entries`);
    
    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scanner");
    
    // Convert to binary
    console.log("Converting workbook to base64");
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
    
    // Save to downloads using our fixed function
    console.log("Saving to Downloads folder");
    const saveResult = await saveToAttendanceRecorder(fileUri, fileName);
    
    if (!saveResult.success) {
      console.error("Save to downloads failed:", saveResult.message);
      throw new Error(`Failed to save to Downloads: ${saveResult.message}`);
    }
    
    // Also share the file
    console.log("Sharing file");
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export Scanner Session Data',
      UTI: 'com.microsoft.excel.xlsx'
    });
    
    // Handle backup if online
    try {
      const isOnline = await checkOnlineStatus();
      if (isOnline) {
        console.log("Online - attempting GitHub backup");
        await backupToGitHub([session], false, fileName, wb);
        console.log("Scanner session backed up successfully");
        
        // Update backup status in UI and storage
        await updateBackupStatus(session.id, true);
      } else {
        console.log("Offline - queueing for backup later");
        // Queue for backup when back online
        const pendingBackups = await AsyncStorage.getItem('pendingBackups') || '[]';
        const backupsArray = JSON.parse(pendingBackups);
        backupsArray.push({
          session: session,
          fileName: fileName,
          timestamp: new Date().toISOString(),
          type: 'scanner',
          retryCount: 0
        });
        await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
      }
    } catch (backupError) {
      console.error("Backup error:", backupError);
      // Queue for later if backup fails
      const pendingBackups = await AsyncStorage.getItem('pendingBackups') || '[]';
      const backupsArray = JSON.parse(pendingBackups);
      backupsArray.push({
        session: session,
        fileName: fileName,
        timestamp: new Date().toISOString(),
        type: 'scanner',
        retryCount: 0,
        error: backupError.message
      });
      await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
    }
    
    console.log("Scanner export completed successfully");
    return { success: true, message: 'Export successful!', filePath: saveResult.uri };
  } catch (error) {
    console.error("Error exporting scanner session:", error);
    Alert.alert("Export Error", "Failed to export scanner data: " + error.message);
    return { success: false, message: `Error exporting file: ${error.message}` };
  }
};

// Save a file to the "Attendance Recorder" directory with multiple fallback options
const saveToAttendanceRecorder = async (fileUri, fileName) => {
  try {
    console.log(`Starting save operation for: ${fileName} on ${Platform.OS} device`);
    
    if (Platform.OS === 'android') {
      // First, check for permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log(`Permission status: ${status}`);
      
      if (status !== 'granted') {
        Alert.alert(
          "Permission Required",
          "We need access to your media library to save files. Please enable this permission in your device settings.",
          [{ text: "OK" }]
        );
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
        
        Alert.alert(
          "Export Successful",
          `File saved to "${appFolderName}" folder as "${fileName}"`,
          [{ text: "OK" }]
        );
        
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
          
          return { success: true, message: "File available via Storage Access Framework", uri: tempFileUri, shareOnly: false };
        } catch (safError) {
          console.error("Storage Access Framework method failed:", safError);
          
          // STEP 3: Fall back to file sharing as last resort
          console.log('Falling back to sharing mechanism...');
          Alert.alert(
            "Storage Access Limited",
            "Could not save file directly. Please use the Share screen to save the file to your preferred location.",
            [{ text: "OK" }]
          );
          
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
      
      Alert.alert(
        "Export Successful",
        `File saved. Use the Share button to send it to another app or save it to Files.`,
        [{ text: "OK" }]
      );
      
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

// Handle barcode scanning
const handleBarCodeScanned = ({ type, data }) => {
if (!activeSession || scanned) return;
setScanned(true);
processScannedCode(data, false);
// Allow scanning again after a short delay
setTimeout(() => {
setScanned(false);
}, 2000);
};
// Process scanned or manually entered code
const processScannedCode = (data, isManual = false) => {
if (!data || !activeSession) {
console.log("Cannot process scan: No data or no active session");
return;
}
// Trim data to handle extra spaces
const cleanData = data.trim();
if (!cleanData) {
console.log("Cannot process scan: Empty data after trimming");
return;
}
console.log(`Processing ${isManual ? 'manual entry' : 'scan'}: ${cleanData}`);
// Check if already scanned in this session
const alreadyScanned = scans.some(scan => scan.content === cleanData);
if (alreadyScanned) {
setScanStatus(`Already scanned: ${cleanData.substring(0, 20)}${cleanData.length > 20 ? '...' : ''}`);
return;
}
const now = new Date();
const timestamp = now.toISOString();
const formattedTime = formatTime(now);
// Create new scan
const newScan = {
id: Date.now().toString(),
content: cleanData,
timestamp: timestamp,
formattedTime: formattedTime,
time: now,
isManual: isManual
};
// Update scans state
const updatedScans = [...scans, newScan];
setScans(updatedScans);
// Update active session
const updatedSession = {
...activeSession,
scans: updatedScans
};
setActiveSession(updatedSession);
// Save to AsyncStorage
saveActiveScannerSession(updatedSession);
updateSessionInHistory(updatedSession);
// Also save to SQLite for backward compatibility
db.transaction(tx => {
tx.executeSql(
'INSERT INTO scans (sessionId, content, time, isManual) VALUES (?, ?, ?, ?)',
[activeSession.id, cleanData, timestamp, isManual ? 1 : 0],
(_, result) => {
console.log(`Scan saved to database with ID: ${result.insertId}`);
},
(_, error) => {
console.error('Error saving scan to database:', error);
}
);
});
// Try to play success sound but continue if it fails
try {
playSuccessSound();
} catch (e) {
console.log("Could not play sound, continuing without sound");
}
// Update status
setScanStatus(`✅ ${isManual ? 'Manual entry' : 'Scanned'}: ${cleanData.substring(0, 20)}${cleanData.length > 20 ? '...' : ''}`);
console.log(`${isManual ? 'Manual entry' : 'Scan'} processed successfully: ${cleanData}`);
};
// Update session in history
const updateSessionInHistory = (updatedSession) => {
AsyncStorage.getItem('sessions').then(savedSessions => {
if (savedSessions) {
const parsedSessions = JSON.parse(savedSessions);
const sessionIndex = parsedSessions.findIndex(s => s.id === updatedSession.id);
if (sessionIndex !== -1) {
const updatedSessions = [...parsedSessions];
updatedSessions[sessionIndex] = {...updatedSession};
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
}
}
});
};
// Process manual entry
const processManualEntry = () => {
const studentId = manualId.trim();
if (!studentId) {
Alert.alert('Error', 'Please enter a Student ID');
return;
}
// Process the manual entry
processScannedCode(studentId, true);
// Close modal and reset input
setShowManualEntryModal(false);
setManualId('');
// Update UI with status
setScanStatus(`✅ Manual entry added: ${studentId.substring(0, 20)}${studentId.length > 20 ? '...' : ''}`);
console.log(`Manual entry processed: ${studentId}`);
};
// Helper functions for date/time formatting
const formatDateTime = (date) => {
return `${formatDate(date)} ${formatTime(date)}`;
};
const formatDate = (date) => {
return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};
const formatTime = (date) => {
return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};
const formatDateTimeForFile = (date) => {
return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
};
// Render different content based on permissions
if (hasPermission === null) {
return (
<View style={styles.container}>
<Text>Requesting camera permission...</Text>
</View>
);
}
if (hasPermission === false) {
return (
<View style={styles.container}>
<Text style={styles.errorText}>Camera permission denied</Text>
<Text>Please enable camera access in your device settings to use the scanner.</Text>
</View>
);
}
return (
<Provider>
<ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
{connectionMessage && (
<View style={[styles.connectionStatus, { backgroundColor: isOnline ? '#e7f3e8' : '#fff3cd' }]}>
<Text style={{ color: isOnline ? '#28a745' : '#856404' }}>{connectionMessage}</Text>
</View>
)}
<Surface style={styles.card}>
<Title style={styles.title}>QR Code Scanner</Title>
<View style={styles.buttonContainer}>
<Button 
mode="contained" 
style={[styles.primaryButton, styles.fullWidthButton]}
labelStyle={styles.primaryButtonText}
onPress={() => activeSession ? endSession() : setShowSessionModal(true)}
>
{activeSession ? 'End Session' : 'Start New Session'}
</Button>
{activeSession && (
<Button 
mode="outlined" 
style={[styles.secondaryButton, styles.fullWidthButton]}
labelStyle={styles.secondaryButtonText}
onPress={() => setShowManualEntryModal(true)}
>
Manual Entry
</Button>
)}
</View>
{activeSession && (
<View style={styles.sessionInfo}>
<Text style={styles.locationText}>Location: {activeSession.location}</Text>
<Text style={styles.dateTimeText}>Date/Time: {activeSession.formattedDateTime}</Text>
</View>
)}
{scanStatus ? (
<View style={styles.statusContainer}>
<Text style={styles.statusText}>{scanStatus}</Text>
</View>
) : null}
<View style={styles.scannerContainer}>
{activeSession ? (
<BarCodeScanner
onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
style={StyleSheet.absoluteFillObject}
/>
) : (
<Text style={styles.placeholderText}>
Click "Start New Session" to begin scanning QR codes.
</Text>
)}
</View>
<Title style={styles.subtitle}>Scanned QR Codes</Title>
{activeSession && activeSession.scans && activeSession.scans.length > 0 ? (
<View style={styles.tableContainer}>
<DataTable>
<DataTable.Header style={{ backgroundColor: '#ffffff' }}>
  <DataTable.Title numeric style={{ flex: 0.2 }}><Text style={{ color: '#24325f' }}>ID</Text></DataTable.Title>
  <DataTable.Title style={{ flex: 0.6 }}><Text style={{ color: '#24325f' }}>Content</Text></DataTable.Title>
  <DataTable.Title style={{ flex: 0.4 }}><Text style={{ color: '#24325f' }}>Time</Text></DataTable.Title>
</DataTable.Header>
<ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
{activeSession.scans.map((scan, index) => (
<DataTable.Row key={scan.id || index} style={{ backgroundColor: '#ffffff' }}>
  <DataTable.Cell numeric style={{ flex: 0.2 }}><Text style={{ color: '#24325f' }}>{index + 1}</Text></DataTable.Cell>
  <DataTable.Cell style={{ flex: 0.6 }}><Text style={{ color: '#24325f' }}>
    {scan.content || scan.id}
    {scan.isManual ? ' (Manual)' : ''}
  </Text></DataTable.Cell>
  <DataTable.Cell style={{ flex: 0.4 }}><Text style={{ color: '#24325f' }}>{scan.formattedTime}</Text></DataTable.Cell>
</DataTable.Row>
))}
</ScrollView>
</DataTable>
</View>
) : (
<Text style={styles.noDataText}>No QR codes scanned yet.</Text>
)}
</Surface>
<Portal>
<Modal
  visible={showSessionModal}
  onDismiss={() => setShowSessionModal(false)}
  contentContainerStyle={[styles.modalContent, { backgroundColor: '#ffffff' }]}
>
  <Title style={{ color: '#24325f' }}>Start New Session</Title>
  <Text style={[styles.dropdownLabel, { color: '#24325f' }]}>Location:</Text>
  <View style={[styles.dropdownContainer, { backgroundColor: '#ffffff' }]}>
    <ScrollView style={styles.locationDropdown} nestedScrollEnabled={true}>
      {locationOptions.map(option => (
        <List.Item
          key={option}
          title={option}
          titleStyle={{ color: '#24325f' }}
          onPress={() => {
setLocation(option);
setShowSessionModal(false);
setTimeout(() => {
if (option) {
const now = new Date();
const sessionId = `session_${now.getTime()}`;
const formattedDateTime = formatDateTime(now);
const newSession = {
id: sessionId,
location: option,
dateTime: now.toISOString(),
formattedDateTime: formattedDateTime,
scans: [],
inProgress: true
};
setActiveSession(newSession);
setScans([]);
setScanStatus('Session started - Ready to scan');
AsyncStorage.getItem('sessions').then(savedSessions => {
const parsedSessions = savedSessions ? JSON.parse(savedSessions) : [];
const updatedSessions = [...parsedSessions, newSession];
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
AsyncStorage.setItem(TEMP_SCANNER_SESSION_INDEX_KEY, String(updatedSessions.length - 1));
});
saveActiveScannerSession(newSession);
console.log("New scanner session created:", sessionId);
}
}, 100);
          }}
          style={[styles.locationOption, { backgroundColor: '#ffffff' }]}
        />
      ))}
    </ScrollView>
  </View>
<View style={styles.modalButtons}>
<Button 
mode="text"
onPress={() => setShowSessionModal(false)}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
Cancel
</Button>
</View>
</Modal>
</Portal>
<Portal>
<Modal
visible={showManualEntryModal}
onDismiss={() => setShowManualEntryModal(false)}
contentContainerStyle={[styles.modalContent, { backgroundColor: '#ffffff' }]}
>
<Title style={{ color: '#24325f' }}>Manual Entry</Title>
<TextInput
label="Student ID"
value={manualId}
onChangeText={setManualId}
style={[styles.input, { backgroundColor: '#ffffff', color: '#24325f' }]}
autoFocus
onSubmitEditing={processManualEntry}
/>
<View style={styles.modalButtons}>
<Button 
mode="text" 
onPress={() => setShowManualEntryModal(false)}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
Cancel
</Button>
<Button 
mode="contained" 
onPress={processManualEntry}
disabled={!manualId.trim()}
style={styles.primaryButton}
labelStyle={styles.primaryButtonText}
>
Add
</Button>
</View>
</Modal>
</Portal>
</ScrollView>
</Provider>
);
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
    backgroundColor: '#f9f9f9',
  },
  card: {
    padding: 16,
    borderRadius: 8,
    elevation: 4,
    backgroundColor: '#ffffff',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 16,
    color: '#24325f',
    fontWeight: 'bold',
    backgroundColor: 'transparent',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
    color: '#24325f',
    fontWeight: '500',
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  primaryButton: {
    backgroundColor: '#24325f',
    borderColor: '#24325f',
    marginBottom: 8,
    marginRight: 8,
  },
  primaryButtonText: {
    color: 'white',
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderColor: '#24325f',
    borderWidth: 1,
    marginBottom: 8,
    marginRight: 8,
  },
  secondaryButtonText: {
    color: '#24325f',
  },
  sessionInfo: {
    backgroundColor: '#f0f0f5',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#24325f',
  },
  locationText: {
    fontWeight: 'bold',
    color: '#24325f',
    backgroundColor: 'transparent',
  },
  dateTimeText: {
    color: '#24325f',
    backgroundColor: 'transparent',
  },
  statusContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusText: {
    color: 'white',
    backgroundColor: 'transparent',
  },
  scannerContainer: {
    height: 300,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#24325f',
  },
  checklistContainer: {
    height: 300,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#24325f',
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#24325f',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  tableHeader: {
    backgroundColor: '#ffffff',
  },
  tableHeaderText: {
    color: '#24325f',
    fontWeight: 'bold',
  },
  tableRow: {
    backgroundColor: '#ffffff',
  },
  tableCell: {
    color: '#24325f',
  },
  connectionStatus: {
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    alignItems: 'center',
  },
  connectionText: {
    color: '#24325f',
    fontWeight: '500',
    backgroundColor: 'transparent',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    elevation: 5,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#24325f',
    backgroundColor: 'transparent',
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  locationDropdown: {
    maxHeight: 250,
    backgroundColor: '#ffffff',
  },
  locationOption: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    padding: 10,
    backgroundColor: '#ffffff',
  },
  locationOptionText: {
    color: '#24325f',
  },
  input: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#ffffff',
    color: '#24325f',
  },
  placeholderText: {
    textAlign: 'center',
    color: '#24325f',
    backgroundColor: 'transparent',
  },
  noDataText: {
    textAlign: 'center',
    color: '#24325f',
    fontStyle: 'italic',
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  errorText: {
    color: '#951d1e',
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  searchbar: {
    marginBottom: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  filterItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  filterLabel: {
    marginRight: 8,
    fontWeight: 'bold',
    color: '#24325f',
    backgroundColor: 'transparent',
  },
  studentList: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#24325f',
  },
  studentItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    padding: 10,
    backgroundColor: '#fff',
  },
  studentItemText: {
    color: '#24325f',
  },
  selectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectionItemText: {
    color: '#24325f',
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0f0f0',
  },
  emptyText: {
    textAlign: 'center',
    color: '#24325f',
    fontStyle: 'italic',
    backgroundColor: 'transparent',
  },
});
export default ScannerScreen;
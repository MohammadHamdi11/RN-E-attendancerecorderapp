import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
// Use named imports consistently
import { 
  Text, 
  Button, 
  Surface, 
  Title, 
  Modal, 
  Portal, 
  Provider, 
  Searchbar, 
  List, 
  Divider, 
  DataTable, 
  TextInput,
  TouchableOpacity,
  Checkbox 
} from 'react-native-paper';
import * as SQLite from 'expo-sqlite';
import { CameraView, BarcodeScanningResult, useCameraPermissions, BarCodeType } from 'expo-camera';  // Updated import
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useNavigation } from '@react-navigation/native';
import { backupToGitHub, tryAutoBackup, processPendingBackups } from '../services/backup';
import { initDatabase, getAllSessions, saveSession, getDatabase } from '../services/database';
import { 
  SESSION_TYPE, 
  checkForRecoverableSession, 
  recoverSession, 
  clearRecoverableSession, 
  cleanUpRecoveryTimers,
  resetRecoverySystem 
} from '../services/recover';

//======CONSTANTS SECTION======//
// Match the key used in backup.js
const LAST_BACKUP_TIME_KEY = 'qrScannerLastBackupTime';
// Storage keys for recovery
const SCANNER_ACTIVE_SESSION_STORAGE_KEY = 'activeScannerSession';
const TEMP_SCANNER_SESSION_INDEX_KEY = 'tempScannerSessionIndex';

//======COMPONENT DEFINITION SECTION======//
const ScannerScreen = ({ isOnline, navigation }) => {
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Camera-specific state
  const [cameraRef, setCameraRef] = useState(null);
  const [isCameraAvailable, setIsCameraAvailable] = useState(true);
  const [isScanning, setIsScanning] = useState(true); 

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

//======EFFECT HOOKS SECTION======//
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
  
useEffect(() => {
  const setupApp = async () => {
    try {
      console.log('Setting up scanner module...');
      
      // Reset recovery system on app startup
      await resetRecoverySystem();
      
      // Initialize database schema
      try {
        await initDatabase();
        console.log('Database initialized successfully');
      } catch (initError) {
        console.error('Database initialization failed:', initError);
        Alert.alert(
          'Database Error',
          'There was a problem setting up the app database. Some features may not work correctly.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Load sessions from database - with SESSION_TYPE filter
      const savedSessions = await getAllSessions();
      // Filter only scanner sessions
      const scannerSessions = savedSessions.filter(s => s.sessionType === SESSION_TYPE.SCANNER);
      setSessions(scannerSessions || []);
      
      // IMPORTANT CHANGE: Don't automatically load sessions here
      // Instead, check for recoverable sessions first and let the user decide
      
      // Check for SCANNER-specific recoverable session
      await checkForRecoverableScannerSession();
      
      // Check for pending backups when coming online
      if (isOnline) {
        await checkAndProcessPendingBackups();
      }
      
      console.log('Scanner setup complete');
    } catch (error) {
      console.error('Error in setupApp:', error);
      Alert.alert(
        'Setup Error',
        'There was a problem setting up the app: ' + error.message,
        [{ text: 'OK' }]
      );
    }
  };
  
  setupApp();
  
  // Clean up when component unmounts
  return () => {
    // Clean up timers from recovery system
    cleanUpRecoveryTimers();

    // If there's an active session, save it before unmounting
    if (activeSession) {
      recoverSession(activeSession, SESSION_TYPE.SCANNER)
        .catch(error => console.error("Error saving active session on unmount:", error));
    }
  };
}, []);

// Request camera permission when component mounts
  useEffect(() => {
    const setupCamera = async () => {
      try {
        console.log('Setting up camera...');
        
        // Request MediaLibrary permissions
        const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
        
        // Request Camera permissions using the hook
        if (!cameraPermission?.granted) {
          const permissionResult = await requestCameraPermission();
          console.log('Camera permission status:', permissionResult.status);
          setIsCameraAvailable(permissionResult.granted);
        } else {
          console.log('Camera permission already granted');
          setIsCameraAvailable(true);
        }
        
        // Initialize scanner if we have permission
        if (cameraPermission?.granted) {
          console.log('Camera permission granted, initializing scanner module');
          await initializeScannerModule();
        } else {
          console.log('Camera permission denied');
          setIsCameraAvailable(false);
        }
      } catch (error) {
        console.error('Error setting up camera:', error);
        setIsCameraAvailable(false);
      }
    };
    
    setupCamera();
  }, [cameraPermission, requestCameraPermission]);

const handleSetCameraRef = (ref) => {
  if (ref) {
    setCameraRef(ref);
  }
};

//======FUNCTIONS SECTION======//
//======INITIALIZATION SECTION======//
// Initialize scanner module
  const initializeScannerModule = async () => {
    console.log("Initializing scanner module...");
    
    // Reset recovery system on app startup
    await resetRecoverySystem();
    
    // Check for camera permissions status
    if (!cameraPermission?.granted) {
      console.log('Camera permission not granted, requesting...');
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        console.log('Camera permission request denied');
        setIsCameraAvailable(false);
        return;
      }
    }
    
    // If we have permission, set camera available
    setIsCameraAvailable(true);
    
    // Load sessions from storage
    const savedSessions = await getAllSessions();
    if (savedSessions) {
      setSessions(savedSessions);
    }
    
    // Make sure the pendingBackups array exists
    AsyncStorage.getItem('pendingBackups').then(pendingBackups => {
      if (!pendingBackups) {
        AsyncStorage.setItem('pendingBackups', JSON.stringify([]));
        console.log("Initialized empty pendingBackups array");
      }
    });
  };

//======BACKUP MANAGEMENT SECTION======//
// Check and process pending backups when coming online
const checkAndProcessPendingBackups = async () => {
  if (!isOnline) {
    console.log("Cannot process backups while offline");
    return;
  }
  try {
    console.log("Checking for pending backups...");
    const result = await processPendingBackups();
    console.log("Process pending backups result:", result);
    if (result.success) {
      if (result.message.includes('processed')) {
        // Refresh sessions to update backup status
        const savedSessions = await getAllSessions();
        if (savedSessions) {
          setSessions(savedSessions);
        }
      }
    }
  } catch (error) {
    console.error('Error processing pending backups:', error);
  }
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

//======SESSION CREATION SECTION======//
const onLocationSelected = (selectedLocation) => {
  console.log("Selected location:", selectedLocation);
  
  // Update location state
  setLocation(selectedLocation);
  
  // Close the modal first
  setShowSessionModal(false);
  
  // Use a clean setTimeout to ensure the modal has closed before starting session
  setTimeout(() => {
    if (selectedLocation) {
      console.log("Creating new session with location:", selectedLocation);
      // Call startSession with the selected location
      startSession(selectedLocation);
    } else {
      console.log("No location selected");
    }
  }, 500);
};

// Create a new scanner session with the selected location
const createNewScannerSession = (sessionLocation) => {
  if (!sessionLocation || !sessionLocation.trim()) {
    Alert.alert("Error", "Please enter a location");
    return;
  }
  
  const now = new Date();
  const sessionId = `session_${now.getTime()}`;
  const formattedDateTime = formatDateTime(now);
  
  const newSession = {
    id: sessionId,
    location: sessionLocation,
    dateTime: now.toISOString(),
    formattedDateTime: formattedDateTime,
    scans: [],
    inProgress: true
  };
  
  // Set active session
  setActiveSession(newSession);
  setScans([]);
  setScanStatus('Session started - Ready to scan');
  
  // Save to AsyncStorage
  AsyncStorage.getItem('sessions').then(savedSessions => {
    const parsedSessions = savedSessions ? JSON.parse(savedSessions) : [];
    const updatedSessions = [...parsedSessions, newSession];
    setSessions(updatedSessions);
    AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
    AsyncStorage.setItem(TEMP_SCANNER_SESSION_INDEX_KEY, String(updatedSessions.length - 1));
  });
  
  // Save for recovery
  saveActiveScannerSession(newSession);
  
  console.log("New scanner session created:", sessionId);
};

//======SESSION MANAGEMENT SECTION======//
// Mark session as completed
const markSessionAsCompleted = async (sessionId) => {
  try {
    // Get the sessions
    const savedSessions = await getAllSessions();
    if (savedSessions) {
      const sessionIndex = savedSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        // Update session status
        const updatedSession = {
          ...savedSessions[sessionIndex],
          inProgress: false
        };
        // Save updated session
        await saveSession(updatedSession);
        // Update sessions state
        const updatedSessions = [...savedSessions];
        updatedSessions[sessionIndex] = updatedSession;
        setSessions(updatedSessions);
        console.log(`Session ${sessionId} marked as completed`);
      }
    }
    // Clear recovery data
    await AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY);
  } catch (error) {
    console.error("Error marking session as completed:", error);
  }
};

// Start new session
const startSession = async (selectedLocation) => {
  try {
    const finalLocation = selectedLocation || location;
    
    if (!finalLocation.trim()) {
      Alert.alert('Error', 'Please enter a location');
      return;
    }

    const now = new Date();
    const sessionId = `session_${now.getTime()}`;
    const formattedDateTime = formatDateTime(now);
    
    // Create a properly structured session object with empty scans array
    const newSession = {
      id: sessionId,
      location: finalLocation,
      dateTime: now.toISOString(),
      formattedDateTime: formattedDateTime,
      scans: [],
      inProgress: true,
      sessionType: SESSION_TYPE.SCANNER // Explicitly mark session type
    };
    
    // First save session to database to ensure it's properly stored
    await saveSession(newSession);
    
    // Update state - important: set direct values, not functions
    setActiveSession(newSession);
    setScans([]);
    setScanStatus('Session started - Ready to scan');
    
    // Get updated sessions list - ONLY scanner sessions
    const updatedSessions = await getAllSessions();
    if (updatedSessions) {
      // Filter only scanner sessions
      const scannerSessions = updatedSessions.filter(s => s.sessionType === SESSION_TYPE.SCANNER);
      setSessions(scannerSessions);
    }
    
    // Save session in recovery system
    await recoverSession(newSession, SESSION_TYPE.SCANNER);
    
    console.log("New scanner session created:", sessionId);
  } catch (error) {
    console.error("Error starting session:", error);
    Alert.alert('Error', `Failed to start session: ${error.message}`);
    
    // Reset state in case of error
    setActiveSession(null);
    setScans([]);
    setScanStatus('');
  }
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

// Finalize the scanning session
  const finalizeSession = async () => {
    if (!activeSession) return;
    
    // Save session for export
    const sessionToExport = { ...activeSession };
    
    // Mark session as completed
    const updatedSession = {
      ...activeSession,
      inProgress: false,
      backedUp: isOnline, // Mark if backed up based on connection status
      sessionType: SESSION_TYPE.SCANNER // Explicitly mark session type
    };
    
    // Save to database
    await saveSession(updatedSession);
    
    // Clear from recovery system
    await clearRecoverableSession(activeSession.id, SESSION_TYPE.SCANNER);
    
    // Get updated sessions list
    const updatedSessions = await getAllSessions();
    setSessions(updatedSessions);
    
    // Clear active session
    setActiveSession(null);
    setScans([]);
    setScanStatus('');
    
    // If offline, queue for backup
    if (!isOnline) {
      console.log("App is offline, queueing session for backup");
      queueSessionForBackup(sessionToExport);
      // Note: queueSessionForBackup handles the alert for offline mode
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
              Alert.alert("Backup Success", "Session backed up to Server successfully!");
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
            if (!error.message || !error.message.includes('Workbook is empty')) {
              Alert.alert("Backup Error", `Error during backup: ${error.message}`);
            } else {
              console.log("Empty workbook - skipping backup silently");
            }
          });
      } catch (error) {
        console.error("Exception during backup:", error);
        // Don't show alert for empty workbook errors
        if (!error.message || !error.message.includes('Workbook is empty')) {
          Alert.alert("Backup Error", `Exception during backup: ${error.message}`);
        }
      }
    }
    
    // Export session to Excel if there are scans
    if (sessionToExport && sessionToExport.scans && sessionToExport.scans.length > 0) {
      setTimeout(() => {
        exportScannerSession(sessionToExport, true); // Pass true to indicate silent export (no alerts)
      }, 500);
    }
    
    console.log("Scanner session ended successfully");
  };

//======SESSION RECOVERY SECTION======//
// Check for recoverable scanner session
const checkForRecoverableScannerSession = async () => {
  try {
    console.log("Checking for recoverable scanner session...");
    
    // Use SESSION_TYPE.SCANNER to ensure we only get scanner sessions
    const result = await checkForRecoverableSession(SESSION_TYPE.SCANNER);
    
    if (result.hasRecoverableSession && result.session.sessionType === SESSION_TYPE.SCANNER) {
      // IMPORTANT: Don't recover until user confirms
      Alert.alert(
        "Recover Scanner Session",
        `Found an incomplete scanner session at ${result.session.location} with ${result.session.scans?.length || 0} scans. Would you like to recover it?`,
        [
          {
            text: "Yes",
            onPress: () => recoverScannerSession(result.session)
          },
          {
            text: "No",
            onPress: async () => {
              try {
                // First clear the session from recovery system
                await clearRecoverableSession(result.session.id, SESSION_TYPE.SCANNER);
                console.log(`Scanner session ${result.session.id} cleared`);
                
                // IMPORTANT: After clearing the recoverable session, explicitly check for active sessions
                // This ensures we can still load an active session if the user declines recovery
                checkForCurrentActiveSessions();
              } catch (error) {
                console.error("Error clearing scanner session:", error);
                // Still try to check for active sessions even if clearing failed
                checkForCurrentActiveSessions();
              }
            }
          }
        ]
      );
    } else {
      console.log("No recoverable scanner session found");
      // If no recoverable sessions, check for active ones
      checkForCurrentActiveSessions();
    }
  } catch (error) {
    console.error("Error checking for recoverable scanner session:", error);
    // If error occurred, still try to check for active sessions
    checkForCurrentActiveSessions();
  }
};

// This function checks for current active sessions after recovery decisions
const checkForCurrentActiveSessions = async () => {
  try {
    console.log("Checking for current active sessions after recovery decision...");
    const allSessions = await getAllSessions();
    // First make sure we have sessions and filter for active scanner sessions only
    if (!allSessions || allSessions.length === 0) {
      console.log("No sessions found in database");
      return;
    }
    
    const activeSessionFound = allSessions.find(s => 
      s.inProgress === true && s.sessionType === SESSION_TYPE.SCANNER
    );
    
    if (activeSessionFound) {
      console.log('Found active scanner session to load:', activeSessionFound.id);
      // Make sure we have a properly formatted session object
      const formattedSession = {
        ...activeSessionFound,
        formattedDateTime: formatDateTime(new Date(activeSessionFound.dateTime)),
        scans: activeSessionFound.scans || []
      };
      
      // Update state with the active session
      setActiveSession(formattedSession);
      setScans(formattedSession.scans || []);
      setLocation(formattedSession.location);
      
      // Also save to AsyncStorage for recovery
      await saveActiveScannerSession(formattedSession);
      setScanStatus('Session loaded - Ready to scan');
    } else {
      console.log("No active sessions to load");
      // Reset active session state if nothing is found
      setActiveSession(null);
      setScans([]);
      setScanStatus('');
    }
  } catch (error) {
    console.error("Error checking for current active sessions:", error);
    // Reset state in case of error
    setActiveSession(null);
    setScans([]);
    setScanStatus('');
  }
};

// Recover scanner session
const recoverScannerSession = async (session) => {
  try {
    console.log("Starting recovery of scanner session:", session.id);
    
    // Use the improved recovery service - but ONLY after user confirmation
    const recoveryResult = await recoverSession(session, SESSION_TYPE.SCANNER);
    
    if (recoveryResult.success) {
      // Set active session AFTER successful recovery
      setActiveSession(session);
      setScans(session.scans || []);
      setScanStatus('Session recovered - Ready to scan');
      
      // Update sessions list
      const savedSessions = await getAllSessions();
      setSessions(savedSessions);
      
      console.log("Scanner session recovered successfully");
    } else {
      throw new Error(recoveryResult.error || "Failed to recover scanner session");
    }
  } catch (error) {
    console.error("Error recovering scanner session:", error);
    Alert.alert(
      "Recovery Error",
      "Could not recover the scanner session. Please try again.",
      [{ text: "OK" }]
    );
    
    // Reset active session in case of error
    setActiveSession(null);
    setScans([]);
    setScanStatus('');
    
    // IMPORTANT: Check for other active sessions if recovery fails
    await checkForCurrentActiveSessions();
  }
};

//======STORAGE MANAGEMENT SECTION======//
// Save active session to storage
const saveActiveScannerSession = async (session) => {
  if (session) {
    try {
      // Create a clean copy of the session without any potential non-serializable properties
      const cleanSession = {
        id: session.id,
        location: session.location,
        dateTime: session.dateTime,
        formattedDateTime: session.formattedDateTime,
        inProgress: session.inProgress,
        sessionType: SESSION_TYPE.SCANNER, // Explicitly mark session type
        scans: session.scans ? session.scans.map(scan => ({
          id: scan.id,
          content: scan.content,
          timestamp: scan.timestamp,
          formattedTime: scan.formattedTime,
          isManual: scan.isManual
        })) : []
      };
      
      await AsyncStorage.setItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(cleanSession));
      console.log("Active scanner session saved:", session.id);
    } catch (error) {
      console.error("Error saving active scanner session:", error);
    }
  }
};

// Clear active session from storage
const clearActiveScannerSession = () => {
  AsyncStorage.removeItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY)
    .then(() => AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY))
    .then(() => console.log("Active scanner session cleared from storage"))
    .catch(error => console.error("Error clearing active scanner session:", error));
};

// Load active session from database
const loadActiveSession = async () => {
  try {
    const allSessions = await getAllSessions();
    const activeSessionFound = allSessions.find(s => s.inProgress);
    if (activeSessionFound) {
      const formattedSession = {
        ...activeSessionFound,
        formattedDateTime: formatDateTime(new Date(activeSessionFound.dateTime)),
        scans: activeSessionFound.scans || []
      };
      setActiveSession(formattedSession);
      setScans(formattedSession.scans || []);
      setLocation(formattedSession.location);
      setScanStatus('Session loaded - Ready to scan');
      // Also save to AsyncStorage for recovery
      saveActiveScannerSession(formattedSession);
    }
  } catch (error) {
    console.error("Error loading active session:", error);
  }
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

//======AUDIO AND FEEDBACK SECTION======//

// Play success sound
async function playSuccessSound() { 
  // Modified to handle haptic feedback instead which is more reliable
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    console.log("Could not use haptic feedback:", e);
  }
}

//======SCANNING FUNCTIONS SECTION======//
// Handle barcode scanning - updated for expo-camera's CameraView
  const handleBarCodeScanned = (scanningResult) => {
    // Early exit conditions - preserve from original
    if (!activeSession || scanned) return;
    
    // Log for debugging
    console.log("Barcode detected:", scanningResult);
    
    // Extract data and type from scanning result

    const { data, type } = scanningResult;



    if (!data) {

      console.log("Scan detected but no data found");

      return;

    }

    

  // Instead of setting scanned state, which triggers a re-render,

  // use a local variable to prevent multiple scans

  let processingInProgress = true;

    

    // Add immediate haptic feedback when something is detected

    try {

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    } catch (e) {

      console.log("Could not use haptic feedback:", e);

    }

    

    // Process the scanned code

    console.log("Processing scanned code:", data);

    processScannedCode(data, false);

    

  // Allow scanning again after a short delay using a cleaner approach

  setTimeout(() => {

    processingInProgress = false;

  }, 1000); // Try reducing this delay

};

// Process scanned or manually entered code
const processScannedCode = async (data, isManual = false) => {
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
    
    // Add error haptic feedback for duplicates
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      console.log("Could not use haptic feedback:", e);
    }
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
  
  // Create copies of state to work with
  const updatedScans = [...scans, newScan];
  
  // Update state directly instead of using functional updates
  setScans(updatedScans);
  
  // Create a new activeSession object with updated scans
  if (activeSession) {
    const updatedSession = {
      ...activeSession,
      scans: updatedScans
    };
    
    // Update activeSession state
    setActiveSession(updatedSession);
    
    // Save the updated session
    saveActiveScannerSession(updatedSession);
    
    // Update the session in the database
    try {
      await saveSession(updatedSession);
      console.log('Session updated in database with new scan');
    } catch (dbError) {
      console.error('Error updating session in database:', dbError);
    }
  }
  
  // Add success haptic feedback
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    console.log("Could not use haptic feedback:", e);
  }
  
  // Update status
  setScanStatus(`✅ ${isManual ? 'Manual entry' : 'Scanned'}: ${cleanData.substring(0, 20)}${cleanData.length > 20 ? '...' : ''}`);
  console.log(`${isManual ? 'Manual entry' : 'Scan'} processed successfully: ${cleanData}`);
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

//======EXPORT AND FILE MANAGEMENT SECTION======//
// Export scanner session to Excel
const exportScannerSession = async (session, silentMode = false) => {
  try {
    console.log("Starting scanner export for session:", session.id);
    const fileName = `Scanner_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    // Prepare data
    const data = [
      ['Student ID', 'Location', 'Log Date', 'Log Time', 'Type']
    ];
    // Add scans with row numbers
    session.scans.forEach((scan, index) => {
      const scanDate = new Date(scan.timestamp);
      data.push([
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
    const saveResult = await saveToAttendanceRecorder(fileUri, fileName, silentMode);
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
      if (isOnline) {
        console.log("Online - attempting GitHub backup");
        await backupToGitHub([session], false, fileName, wb);
        console.log("Scanner session backed up successfully");
        // Update backup status in database and state
        const updatedSession = { ...session, backedUp: true };
        await saveSession(updatedSession);
        // Refresh sessions list
        const updatedSessions = await getAllSessions();
        setSessions(updatedSessions);
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
    if (!silentMode) {
      Alert.alert("Export Error", "Failed to export scanner data: " + error.message);
    }
    return { success: false, message: `Error exporting file: ${error.message}` };
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
        
        // Only show alert if not in silent mode
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
      // iOS code - modified to respect silentMode
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

//======UTILITY FUNCTIONS SECTION======//
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
  if (cameraPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (cameraPermission?.granted === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera permission denied</Text>
        <Text>Please enable camera access in your device settings to use the scanner.</Text>
        <Button 
          mode="contained" 
          onPress={() => requestCameraPermission()}
          style={styles.permissionButton}
        >
          Request Permission Again
        </Button>
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
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "code128", "code39", "code93", "ean13", "ean8", "upc_e"],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                ref={setCameraRef}
              >
                {/* Optional overlay for scanning guidance */}
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerMarker} />
                </View>
              </CameraView>
            ) : (
              <View style={styles.placeholderContainer}>
                <Text style={styles.placeholderText}>
                  Click "Start New Session" to begin scanning QR codes.
                </Text>
              </View>
            )}
          </View>

        <Title style={styles.subtitle}>Scanned QR Codes</Title>
        {activeSession && activeSession.scans && activeSession.scans.length > 0 ? (
          <View style={styles.tableContainer}>
            <DataTable>
<DataTable.Header style={{ backgroundColor: '#ffffff' }}>
                <DataTable.Title style={{ flex: 0.6 }}><Text style={{ color: '#24325f' }}>Student ID</Text></DataTable.Title>
                <DataTable.Title style={{ flex: 0.4 }}><Text style={{ color: '#24325f' }}>Time</Text></DataTable.Title>
              </DataTable.Header>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                {activeSession.scans.map((scan, index) => (
                  <DataTable.Row key={scan.id || index} style={{ backgroundColor: '#ffffff' }}>
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
          <Title style={{ color: '#24325f' }}>Select Location</Title>
          <Text style={[styles.dropdownLabel, { color: '#24325f' }]}>Location:</Text>
          <View style={[styles.dropdownContainer, { backgroundColor: '#ffffff' }]}>
            <ScrollView style={styles.locationDropdown} nestedScrollEnabled={true}>
              {locationOptions.map(option => (
                <List.Item
                  key={option}
                  title={option}
                  titleStyle={{ color: '#24325f' }}
                  onPress={() => onLocationSelected(option)}
                  style={[styles.locationOption, { backgroundColor: '#ffffff' }]}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.modalButtons}>
            <Button 
              mode="text"
              labelStyle={styles.secondaryButtonText}
              onPress={() => setShowSessionModal(false)}
              style={styles.secondaryButton}
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
  camera: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    overflow: 'hidden',
  },
  scannerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerMarker: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
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
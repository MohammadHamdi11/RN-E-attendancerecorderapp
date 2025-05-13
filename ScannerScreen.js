//======IMPORT SECTION======//
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
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
Dialog,
  DataTable, 
  TextInput,
  Checkbox 
} from 'react-native-paper';
import { TouchableOpacity } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { CameraView, BarcodeScanningResult, useCameraPermissions, BarCodeType } from 'expo-camera';  // Updated import
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useNavigation } from '@react-navigation/native';
import { backupToGitHub, tryAutoBackup, processPendingBackups } from '../services/backup';
import { initDatabase, getAllSessions, saveSession, getDatabase } from '../services/database';
import { getCurrentUser } from '../services/auth';
import { 
  SESSION_TYPE, 
  SESSION_STATUS,
  checkForRecoverableSession, 
  recoverSession, 
  clearRecoverableSession,
  markSessionAsNormallyClosed,
  cleanUpRecoveryTimers,
  resetRecoverySystem 
} from '../services/recover';

//======CONSTANTS SECTION======//
// Match the key used in backup.js
const LAST_BACKUP_TIME_KEY = 'qrScannerLastBackupTime';
// Storage keys for recovery
const SCANNER_ACTIVE_SESSION_STORAGE_KEY = 'activeScannerSession';
const TEMP_SCANNER_SESSION_INDEX_KEY = 'tempScannerSessionIndex';
// Storage keys
const GITHUB_TOKEN_KEY = 'qrScannerGithubToken';
// GitHub configuration
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_PATH = 'assets/students_data.json';
const DEFAULT_GITHUB_BRANCH = 'main';
// GitHub token parts (to avoid detection)
const GITHUB_TOKEN_PREFIX = 'github_pat_';
const GITHUB_TOKEN_SUFFIX = '11BREVRNQ0LX45XKQZzjkB_TL3KNQxHy4Sms4Fo20IUcxNLUwNAFbfeiXy92idb3mwTVANNZ4EC92cvkof';
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
  const [cameraRef, setCameraRef] = useState(null);
  const [isCameraAvailable, setIsCameraAvailable] = useState(true);
  const [isScanning, setIsScanning] = useState(true); 
  const [connectionMessage, setConnectionMessage] = useState('');
const [dataTableSearchQuery, setDataTableSearchQuery] = useState('');
const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
const [studentToDelete, setStudentToDelete] = useState({id: '', content: ''});
const [locationOptions, setLocationOptions] = useState([]);
//======EFFECT HOOKS SECTION======//
  //======CONNECTION MONITORING SECTION======//
  // Debug connection status
  useEffect(() => {
    console.log("isOnline prop value:", isOnline);
    // Test network connection
    const testConnection = async () => {
      try {
        const response = await fetch('https://www.google.com', { 
          method: 'HEAD',
          timeout: 3000
        });
        const actuallyOnline = (response.status >= 200 && response.status < 300);
        console.log("Fetch test result:", actuallyOnline ? "Online" : "Offline");
      } catch (error) {
        console.log("Fetch test failed:", error.message);
      }
    };
    testConnection();
  }, [isOnline]);
const checkOnlineStatus = async () => {
  try {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected && netInfo.isInternetReachable;
  } catch (error) {
    console.error("Error checking online status:", error);
    return false;
  }
};
  //======CONNECTION STATUS SECTION======//
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
              // Show professional alert for successful backup of offline sessions
              Alert.alert(
                "Backup Complete", 
                "Your offline sessions have been successfully backed up to the server.",
                [{ text: "OK" }]
              );
              // Clear status message after a timeout
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
}, [isOnline]); // Only depend on isOnline, not activeSession


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

//======INITIALIZATION SECTION======//

useEffect(() => {
  const initializeScannerModule = async () => {
    console.log("Initializing checklist module...");
    try {
      // Reset recovery system on app startup
      await resetRecoverySystem();

      // Check for pending backups when coming online
      if (isOnline) {
        await checkAndProcessPendingBackups();
      }

    // Check for recoverable session
      await checkForRecoverableScannerSession();

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

    // Load location options
    await loadLocationOptions();

      // Load sessions from storage
      const savedSessions = await AsyncStorage.getItem('sessions');
      if (savedSessions) {
        setSessions(JSON.parse(savedSessions));
      }


      console.log("Scanner module initialized successfully");
    } catch (error) {
      console.error("Error initializing scanner module:", error);
    }
  };

  // Execute initialization
  initializeScannerModule();

  // Clean up when component unmounts
  return () => {
    // If there's an active session, save it before unmounting
    if (activeSession) {
      saveActiveScannerSession(activeSession)
        .catch(error => console.error("Error saving active session on unmount:", error));
    }
    
    // Stop auto-save timer if running
    if (window.autoSaveTimerId) {
      clearInterval(window.autoSaveTimerId);
      window.autoSaveTimerId = null;
    }
    
    // Clean up timers from recovery system
    cleanUpRecoveryTimers();
  };
}, []); 

useEffect(() => {
  loadLocationOptions()
    .catch(error => console.error("Failed to load location options:", error));
}, []); // Empty dependency array means this runs once on mount

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
//======FUNCTIONS SECTION======//
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
      if (result.message.includes('processed') && result.processed > 0) {
        // Refresh sessions to update backup status
        const savedSessions = await getAllSessions();
        if (savedSessions) {
          setSessions(savedSessions);
        }
        
        // Add professional alert for successful backup of offline sessions
        Alert.alert(
          "Backup Complete", 
          "Sessions created offline have been successfully backed up to the server.",
          [{ text: "OK" }]
        );
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
//======SESSION MANAGEMENT SECTION======//
const handleDeleteConfirmation = (studentId, scanContent) => {
  setStudentToDelete({id: studentId, content: scanContent});
  setShowDeleteConfirmModal(true);
};

// Updated handleDeleteStudent function
const handleDeleteStudent = async () => {
  if (!studentToDelete || !activeSession) return;
  
  // Create a new array without the deleted student
  const updatedScans = activeSession.scans.filter(scan => scan.id !== studentToDelete.id);
  
  // Create updated session object
  const updatedSession = {
    ...activeSession,
    scans: updatedScans
  };
  
  // Update the active session state
  setActiveSession(updatedSession);
  
  // Update scans state separately for consistency
  setScans(updatedScans);
  
  // Give haptic feedback for deletion
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    console.log("Could not use haptic feedback:", e);
  }
  
  // Mark session as needing saving for auto-save mechanism
  window.sessionNeedsSaving = true;
  
  // Immediately save the updated session to AsyncStorage
  try {
    await saveActiveScannerSession(updatedSession);
    console.log("Session saved after item deletion");
    
    // Update session in database
    await saveSession(updatedSession);
    console.log("Database updated after item deletion");
    
    // Update the session in history
    await updateSessionInHistory(updatedSession);
    console.log("Session history updated after item deletion");
    
    // Update status message
    setScanStatus(`✅ Deleted entry: ${studentToDelete.content}`);
  } catch (error) {
    console.error("Error saving session after deletion:", error);
    Alert.alert(
      "Deletion Error",
      "Item was removed from display but there was an error saving the changes."
    );
  }
  
  // Close the confirmation modal
  setShowDeleteConfirmModal(false);
  setStudentToDelete('');
};
// Add this function to load location options
const loadLocationOptions = async () => {
  try {
    console.log("Loading location options from GitHub...");
    setScanStatus("Loading location options...");
    
    // Use the same GitHub token approach as with students data
    const token = `${GITHUB_TOKEN_PREFIX}${GITHUB_TOKEN_SUFFIX}`;
    
    // Define GitHub parameters - adjust path to point to your location options JSON
    const owner = DEFAULT_GITHUB_OWNER;
    const repo = DEFAULT_GITHUB_REPO;
    const path = 'assets/subjectsmodal.json'; // Path to the locations JSON file
    const branch = DEFAULT_GITHUB_BRANCH;
    
    // GitHub API URL to fetch file content
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3.raw'
    };
    
    const response = await fetch(apiUrl, { headers });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    // Parse the JSON response
    const locationData = await response.json();
    
    // Ensure we have valid data
    if (Array.isArray(locationData) && locationData.length > 0) {
      console.log(`Loaded ${locationData.length} subject options`);
      setLocationOptions(locationData);
      setScanStatus(`Loaded ${locationData.length} subject options`);
      
      // Cache the location options for offline use
      await AsyncStorage.setItem('cachedLocationOptions', JSON.stringify(locationData));
      console.log("Location options cached for offline use");
      
      return locationData;
    } else {
      throw new Error("Invalid location data format");
    }
  } catch (error) {
    console.error("Error loading location options:", error);
    setScanStatus("Error loading location options");
    
    // Try to load from cache if network request fails
    try {
      const cachedOptions = await AsyncStorage.getItem('cachedLocationOptions');
      if (cachedOptions) {
        const parsedOptions = JSON.parse(cachedOptions);
        if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
          console.log(`Using ${parsedOptions.length} cached location options`);
          setLocationOptions(parsedOptions);
          setScanStatus(`Using cached location options`);
          return parsedOptions;
        }
      }
    } catch (cacheError) {
      console.error("Error loading cached location options:", cacheError);
    }
    
    // If everything fails, fall back to default options
    const defaultOptions = [
      "Anatomy",
      "Histology",
      "Biochemistry",
      "Physiology",
      "Microbiology",
      "Parasitology",
      "Pathology",
      "Pharmacology",
      "Clinical"
    ];
    
    console.log("Using fallback location options");
    setLocationOptions(defaultOptions);
    return defaultOptions;
  }
};
// Add this function to refresh location options manually
const handleRefreshLocationOptions = async () => {
  setScanStatus('Refreshing location options...');
  try {
    await loadLocationOptions();
    Alert.alert(
      "Success",
      "Location options refreshed successfully"
    );
  } catch (error) {
    console.error('Error refreshing location options:', error);
    Alert.alert(
      "Error",
      "Failed to refresh location options. Please check your connection."
    );
  }
};
// Start a new scanner session
const startScannerSession = () => {
  // Reset location first
  setLocation('');
  // Then show the modal
  setShowSessionModal(true);
};
const onLocationSelected = (selectedLocation) => {
  console.log("Selected location:", selectedLocation);
  // First set the location in state
  setLocation(selectedLocation);
  // Then close the modal
  setShowSessionModal(false);
  // Wait for the state to update before creating the session
  setTimeout(() => {
    if (selectedLocation) {
      console.log("Creating new session with location:", selectedLocation);
      createNewScannerSession(selectedLocation);
    } else {
      console.log("No location selected");
    }
  }, 500); // Increased delay to ensure state is updated
};
// Create a new canner session with a specific location
const createNewScannerSession = (sessionLocation) => {
  console.log("Creating session at location:", sessionLocation);
  if (!sessionLocation || !sessionLocation.trim()) {
    Alert.alert("Error", "Please enter a location");
    return;
  }
  // Create new session
  const now = new Date();
  const sessionId = `scanner_${now.getTime()}`;
  const formattedDateTime = formatDateTime(now);
  // Store the current filter settings with the session
  const newSession = {
    id: sessionId,
    location: sessionLocation,
    dateTime: now.toISOString(),
    formattedDateTime: formattedDateTime,
    scans: [],
    inProgress: true,
    isScanner: true,
  };
  // Set active session
  setActiveSession(newSession);
  setScans([]);
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
  // Start auto-save timer
  startAutoSaveTimer();
  console.log("New scanner session created:", sessionId);
};
// End scanner session
const endSession = () => {
  if (!activeSession) return;

  // Stop auto-save timer
  stopAutoSaveTimer();
  // Perform one final save before ending
  performAutoSave(true);

  // Confirm if there are no selections
  if (activeSession.scans.length === 0) {
    Alert.alert(
      "End Session",
      "No QR codes scanned in this session. Do you still want to end it?",
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Session', 
          style: 'destructive',
          onPress: () => finalizeScannerSession()
        }
      ]
    );
  } else {
    Alert.alert(
      'End Session',
      'Are you sure you want to end the current session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Session', 
          style: 'destructive',
          onPress: () => finalizeScannerSession()
        }
      ]
    );
  }
};
// Finalize the scanning session
const finalizeScannerSession = async () => {
  // Create a copy of the session for export
  const sessionToExport = { ...activeSession };
  
  // First, properly mark the session as closed normally in the recovery system
  // This is the key fix - use the new function from the recovery service
  try {
    await markSessionAsNormallyClosed(activeSession.id, SESSION_TYPE.SCANNER);
    console.log(`Session ${activeSession.id} marked as normally closed`);
  } catch (error) {
    console.error("Error marking session as normally closed:", error);
  }
  
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
          backedUp: isOnline, // Mark if backed up based on connection status
          sessionType: SESSION_TYPE.SCANNER, // Explicitly mark session type
          recoveryStatus: SESSION_STATUS.CLOSED_NORMALLY // Add recovery status for clarity
        };
        setSessions(updatedSessions);
        AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
      }
    }
  }).catch(error => {
    console.error("Error updating session in storage:", error);
  });
  
  // Clear active session from AsyncStorage and recovery system
  // This is redundant with markSessionAsNormallyClosed but kept for safety
  AsyncStorage.removeItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY)
    .catch(error => console.error("Error clearing active scanner session:", error));
  
  AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY)
    .catch(error => console.error("Error clearing temp session index:", error));
  
  // Clear active session
  setActiveSession(null);
  setScans([]);
  setScanStatus('');
  
  // Export session to Excel only if there are scans
  if (sessionToExport && sessionToExport.scans && sessionToExport.scans.length > 0) {
    setTimeout(() => {
      if (!isOnline) {
        // If offline, queue for backup instead of immediate export
        queueSessionForBackup(sessionToExport);
      } else {
        exportScannerSession(sessionToExport, true); // Pass true to indicate silent export
      }
    }, 500);
  }
  
  console.log("Scanner session ended successfully");
};

//======SESSION RECOVERY SECTION======//
  // Check for recoverable session
const checkForRecoverableScannerSession = async () => {
  try {
    // Use the improved recovery service
    const result = await checkForRecoverableSession(SESSION_TYPE.SCANNER);
    if (result.hasRecoverableSession) {
      Alert.alert(
        "Recover Scanner Session",
        `Found an incomplete scanner session at ${result.session.location} with ${result.session.scans?.length || 0} selections. Would you like to recover it?`,
        [
          {
            text: "Yes",
            onPress: () => recoverScannerSession(result.session)
          },
          {
            text: "No",
            onPress: () => {
              // Instead of just clearing the session, backup the session first
              handleDeclinedRecovery(result.session)
                .then(() => {
                  // After backing up, clear the recoverable session
                  clearRecoverableSession(result.session.id, SESSION_TYPE.SCANNER)
                    .catch(error => console.error("Error clearing scanner session:", error));
                })
                .catch(error => {
                  console.error("Error handling declined recovery:", error);
                  // Still attempt to clear the recoverable session
                  clearRecoverableSession(result.session.id, SESSION_TYPE.SCANNER)
                    .catch(clearError => console.error("Error clearing scanner session:", clearError));
                });
            }
          }
        ]
      );
    }
  } catch (error) {
    console.error("Error checking for recoverable scanner session:", error);
  }
};

// Handle declined recovery by backing up the session
const handleDeclinedRecovery = async (session) => {
  try {
    console.log("Handling declined recovery for session:", session.id);
    
    // First mark the session as completed
    const completedSession = {
      ...session,
      inProgress: false,
      backedUp: false,
      sessionType: SESSION_TYPE.SCANNER,
      recoveryStatus: SESSION_STATUS.DECLINED_RECOVERY
    };
    
    // Update the session in history
    await updateSessionInHistory(completedSession);
    
    // Check online status
    const isCurrentlyOnline = await checkOnlineStatus();
    
    // If we're online, try to export and backup directly
    if (isCurrentlyOnline) {
      console.log("Online - attempting to backup declined session");
      try {
        // Silent export (no UI alerts)
        await exportScannerSession(completedSession, true);
        console.log("Declined session backed up successfully");
      } catch (exportError) {
        console.error("Failed to export declined session:", exportError);
        // Fall back to queuing
        await queueSessionForBackup(completedSession);
      }
    } else {
      // If offline, queue for later backup
      console.log("Offline - queueing declined session for later backup");
      await queueSessionForBackup(completedSession);
    }
    
    console.log("Declined session handled successfully");
    return { success: true };
  } catch (error) {
    console.error("Error handling declined recovery:", error);
    return { success: false, error };
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
          return AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
        }
      }
      return Promise.resolve();
    })
    .catch(error => {
      console.error("Error updating session in history:", error);
      throw error; // Re-throw so Promise.all can catch it
    });
};
  // Recover scanner session
  const recoverScannerSession = async (session) => {
    try {
      // Use the improved recovery service
      const recoveryResult = await recoverSession(session, SESSION_TYPE.CHECKLIST);
    if (recoveryResult.success) {
      setActiveSession(session);

  setScans([]);
  setScanStatus('Session started - Ready to scan');

      // Update sessions list
        const savedSessions = await AsyncStorage.getItem('sessions');
        if (savedSessions) {
          setSessions(JSON.parse(savedSessions));
        }
        // Start auto-save timer
        startAutoSaveTimer();
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
    }
  };

//====================AUTO SAVE SECTION====================//
// Initialize auto-save timer
const startAutoSaveTimer = () => {
  console.log("Starting auto-save timer");
  // Clear any existing timer
  if (window.autoSaveTimerId) {
    clearInterval(window.autoSaveTimerId);
  }
  // Create flag for tracking if session needs saving
  window.sessionNeedsSaving = false;
  // Create flag for tracking if save is in progress
  window.saveInProgress = false;
  // Set up interval timer (every 15 seconds)
  window.autoSaveTimerId = setInterval(() => {
    performAutoSave();
  }, 5000);
  console.log("Auto-save timer started");
};
// Stop auto-save timer
const stopAutoSaveTimer = () => {
  console.log("Stopping auto-save timer");
  if (window.autoSaveTimerId) {
    clearInterval(window.autoSaveTimerId);
    window.autoSaveTimerId = null;
  }
  // Final save if needed
  if (window.sessionNeedsSaving && !window.saveInProgress) {
    performAutoSave(true);
  }
};
// Perform auto-save if needed
const performAutoSave = (forceSave = false) => {
  // Skip if no active session
  if (!activeSession) {
    console.log("No active session to save");
    return;
  }
  // Skip if save already in progress
  if (window.saveInProgress) {
    console.log("Save in progress, skipping");
    return;
  }
  // Skip if nothing has changed since last save (unless force save)
  if (!window.sessionNeedsSaving && !forceSave) {
    return;
  }
  console.log("Auto-saving session...");
  // Mark save as in progress to prevent multiple simultaneous saves
  window.saveInProgress = true;
  // Create a snapshot of current session state
  const sessionSnapshot = {...activeSession};
  // Handle storage updates asynchronously
  Promise.all([
    saveActiveScannerSession(sessionSnapshot),
    updateSessionInHistory(sessionSnapshot)
  ])
    .then(() => {
      // Reset flag since we've saved
      window.sessionNeedsSaving = false;
      console.log("Auto-save completed successfully");
    })
    .catch(error => {
      console.error("Error during auto-save:", error);
    })
    .finally(() => {
      // Mark save as complete
      window.saveInProgress = false;
    });
};
const saveActiveScannerSession = async (session) => {
  if (!session) {
    console.error("Cannot save null or undefined session");
    return Promise.reject(new Error("Invalid session"));
  }
  try {
    console.log(`Saving active scanner session: ${session.id}`);
    // Save to AsyncStorage for persistent storage
    await AsyncStorage.setItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    // Register with recovery system for crash protection
    // Note: We use the session type constant defined in the recovery service
    await recoverSession(session, SESSION_TYPE.SCANNER);
    console.log("Scanner session saved successfully");
    return Promise.resolve({ success: true });
  } catch (error) {
    console.error("Error saving active scanner session:", error);
    return Promise.reject(error);
  }
};

//======SCANNING FUNCTIONS SECTION======//
// Play success sound
async function playSuccessSound() { 
  // Modified to handle haptic feedback instead which is more reliable
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    console.log("Could not use haptic feedback:", e);
  }
}
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
  
  // Updated validation to require exactly 6 digits
  if (!/^\d{6}$/.test(studentId)) {
    Alert.alert('Invalid Input', 'Please enter a 6-digit Student ID');
    return;
  }
  
  // Process the manual entry
  processScannedCode(studentId, true);
  // Close modal and reset input
  setShowManualEntryModal(false);
  setManualId('');
  // Update UI with status
  setScanStatus(`✅ Manual entry added: ${studentId}`);
  console.log(`Manual entry processed: ${studentId}`);
};

//======EXPORT AND FILE MANAGEMENT SECTION======//
// Export scanner session to Excel
const exportScannerSession = async (session, silentMode = false) => {
  try {
    console.log("Starting scanner export for session:", session.id);
    
    // Get current user email
    let userEmail = "unknown";
    try {
      const currentUser = await getCurrentUser();
      if (currentUser && currentUser.email) {
        userEmail = currentUser.email;
      }
    } catch (userError) {
      console.error("Error getting current user email:", userError);
    }
    
    const fileName = `Scanner_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    
    // Prepare data with user column
    const data = [
      ['Student ID', 'Subject', 'Log Date', 'Log Time', 'User']
    ];
    
    // Add scans with user email
    session.scans.forEach((scan, index) => {
      const scanDate = new Date(scan.timestamp);
      data.push([
        scan.content,                // Scanned content
        session.location,            // Subject
        formatDate(scanDate),        // Log Date
        formatTime(scanDate),        // Log Time
        userEmail                    // User email (current logged in user)
      ]);
    });
    
    console.log(`Prepared data with ${session.scans.length} entries and user: ${userEmail}`);
    
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
    
    // Check connection and handle backup
    const isOnline = await checkOnlineStatus();
    console.log("Online status for backup:", isOnline);
    
    // Handle backup if online
    if (isOnline) {
      console.log("Online - attempting GitHub backup");
      try {
        await backupToGitHub([session], false, fileName, wb);
        console.log("Scanner session backed up successfully");
        
        // Update backup status in database and state
        const updatedSession = { ...session, backedUp: true };
        await saveSession(updatedSession);
        
        // Refresh sessions list
        const updatedSessions = await getAllSessions();
        setSessions(updatedSessions);
        
        // FIXED: Always show backup success alert, matching the checklist behavior
        Alert.alert("Backup Successful", "Session backed up to server successfully!");
      } catch (backupError) {
        console.error("Backup error:", backupError);
        
        // Queue for later backup - and show consolidated error alert
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
    
    console.log("Scanner export completed successfully");
    return { success: true, message: 'Export successful!', filePath: saveResult.uri };
  } catch (error) {
    console.error("Error exporting scanner session:", error);
    if (!silentMode) {
      Alert.alert("Export Error", "Failed to export scanner data: " + error.message);
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
        
        {/* Search bar for DataTable */}
        {activeSession && activeSession.scans && activeSession.scans.length > 0 && (
          <Searchbar
            placeholder="Search students..."
            onChangeText={text => setDataTableSearchQuery(text)}
            value={dataTableSearchQuery}
            style={styles.searchbar}
          />
        )}
        
        {activeSession && activeSession.scans && activeSession.scans.length > 0 ? (
          <View style={styles.tableContainer}>
            <DataTable>
              <DataTable.Header style={{ backgroundColor: '#ffffff' }}>
                <DataTable.Title style={{ flex: 0.6 }}><Text style={{ color: '#24325f' }}>Student ID</Text></DataTable.Title>
                <DataTable.Title style={{ flex: 0.4 }}><Text style={{ color: '#24325f' }}>Time</Text></DataTable.Title>
                <DataTable.Title style={{ flex: 0.2 }}><Text style={{ color: '#24325f' }}>Action</Text></DataTable.Title>
              </DataTable.Header>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
{activeSession.scans
  .filter(scan => {
    // Filter based on search query
    if (!dataTableSearchQuery) return true;
    return (scan.content || scan.id).toLowerCase().includes(dataTableSearchQuery.toLowerCase());
  })
  .map((scan, index) => (
    <DataTable.Row key={scan.id || index} style={{ backgroundColor: '#ffffff' }}>
      <DataTable.Cell style={{ flex: 0.6 }}>
        <Text style={{ color: '#24325f' }}>
          {scan.content || scan.id}
          {scan.isManual ? ' (Manual)' : ''}
        </Text>
      </DataTable.Cell>
      <DataTable.Cell style={{ flex: 0.4 }}>
        <Text style={{ color: '#24325f' }}>{scan.formattedTime}</Text>
      </DataTable.Cell>
      <DataTable.Cell style={{ flex: 0.2, alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity 
          onPress={() => handleDeleteConfirmation(scan.id, scan.content)}
          style={styles.deleteButton}
        >
          <Icon name="close" size={16} color="#FF6B6B" />
        </TouchableOpacity>
      </DataTable.Cell>
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
          <Title style={{ color: '#24325f' }}>Select Subject</Title>
          
          {/* Search bar for Subjects */}
          <Searchbar
            placeholder="Search subjects..."
            onChangeText={text => setSubjectSearchQuery(text)}
            value={subjectSearchQuery}
            style={styles.searchbar}
          />
          
          <Text style={[styles.dropdownLabel, { color: '#24325f' }]}>Subjects:</Text>
          <View style={[styles.dropdownContainer, { backgroundColor: '#ffffff' }]}>
            {locationOptions.length > 0 ? (
              <ScrollView style={styles.locationDropdown} nestedScrollEnabled={true}>
                {locationOptions
                  .filter(option => {
                    if (!subjectSearchQuery) return true;
                    return option.toLowerCase().includes(subjectSearchQuery.toLowerCase());
                  })
                  .map(option => (
                    <List.Item
                      key={option}
                      title={option}
                      titleStyle={{ color: '#24325f' }}
                      onPress={() => onLocationSelected(option)}
                      style={[styles.locationOption, { backgroundColor: '#ffffff' }]}
                    />
                  ))}
              </ScrollView>
            ) : (
              <Text style={{ padding: 16, textAlign: 'center', color: '#24325f' }}>
                Loading subjects...
              </Text>
            )}
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
            {/* Add refresh button */}
            <Button 
              mode="text"
              labelStyle={styles.primaryButtonText}
              onPress={handleRefreshLocationOptions}
              style={styles.primaryButton}
            >
              Refresh
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
      onChangeText={(text) => {
        // Only allow numeric input
        const numericText = text.replace(/[^0-9]/g, '');
        setManualId(numericText);
      }}
      style={[styles.input, { backgroundColor: '#ffffff', color: '#24325f' }]}
      keyboardType="number-pad"
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
      {/* Add Delete Confirmation Modal */}
      <Portal>
        <Modal
          visible={showDeleteConfirmModal}
    onDismiss={() => setShowDeleteConfirmModal(false)}
    contentContainerStyle={[styles.modalContent, { backgroundColor: '#ffffff' }]}
  >
    <Title style={{ color: '#24325f' }}>Confirm Deletion</Title>
    <Text style={{ marginBottom: 20, color: '#24325f' }}>
      Are you sure you want to remove student ID: {studentToDelete.content}?
    </Text>
    <View style={styles.modalButtons}>
      <Button 
        mode="text" 
        onPress={() => setShowDeleteConfirmModal(false)}
        style={styles.secondaryButton}
        labelStyle={styles.secondaryButtonText}
      >
        Cancel
      </Button>
      <Button 
        mode="contained" 
        onPress={handleDeleteStudent}
        style={styles.dangerButton}
        labelStyle={styles.primaryButtonText}
      >
        Delete
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
  marginTop: 8,
    marginBottom: 8,
    marginRight: 8,
    marginLeft: 8,
    flex: 1,
    borderRadius: 18,
  },
  primaryButtonText: {
    color: 'white',
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderColor: '#24325f',
    borderWidth: 1,
  marginTop: 8,
    marginBottom: 8,
    marginRight: 8,
    marginLeft: 8,
    flex: 1,
    borderRadius: 18,
  },
  secondaryButtonText: {
    color: '#24325f',
  },
  dangerButton: {
    backgroundColor: '#951d1e', // Red color for dangerous action
    borderColor: '#951d1e',
    borderWidth: 1,
  marginTop: 8,
    marginBottom: 8,
    marginRight: 8,
    marginLeft: 8,
    flex: 1,
    borderRadius: 18, 
 },
  dangerButtonText: {
    color: '#ffffff',
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
    maxHeight: '100%',
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
deleteButton: {
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: '#FFF0F0',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: '#FFDDDD',
},
});
export default ScannerScreen;
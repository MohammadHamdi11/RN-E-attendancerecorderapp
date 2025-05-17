//======IMPORT SECTION======//
import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, ScrollView, Alert, Platform } from 'react-native';
import { TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { Text, Button, Surface, Title, Checkbox, Modal, Portal, Provider, Searchbar, List, Divider, DataTable, TextInput } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as XLSX from 'xlsx';
import * as BackupService from '../services/backup';
import { backupToGitHub, tryAutoBackup, processPendingBackups } from '../services/backup';
import NetInfo from '@react-native-community/netinfo';
import { syncStudentsDataWithGitHub } from '../services/loadData';
import { loadStudentsData, loadFilteredStudentsData } from '../services/loadData';
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
// Storage keys
const GITHUB_TOKEN_KEY = 'qrScannerGithubToken';
const LAST_BACKUP_TIME_KEY = 'qrScannerLastBackupTime';
const LAST_BACKUP_SESSIONS_KEY = 'qrScannerLastBackupSessions';
const AUTO_BACKUP_ENABLED_KEY = 'qrScannerAutoBackupEnabled';
// GitHub configuration
const DEFAULT_GITHUB_OWNER = 'MohammadHamdi11';
const DEFAULT_GITHUB_REPO = 'RN-E-attendancerecorderapp';
const DEFAULT_GITHUB_PATH = 'assets/students_data.json';
const DEFAULT_GITHUB_BRANCH = 'main';
// GitHub token parts (to avoid detection)
const GITHUB_TOKEN_PREFIX = 'github_pat_';
const GITHUB_TOKEN_SUFFIX = '11BREVRNQ0LX45XKQZzjkB_TL3KNQxHy4Sms4Fo20IUcxNLUwNAFbfeiXy92idb3mwTVANNZ4EC92cvkof';
// Storage keys for checklist
const CHECKLIST_ACTIVE_SESSION_STORAGE_KEY = 'activeChecklistSession';
const TEMP_CHECKLIST_SESSION_INDEX_KEY = 'tempChecklistSessionIndex';
//======COMPONENT DEFINITION SECTION======//
const StudentItem = React.memo(({ student, isSelected, onToggle }) => {
  const studentId = student["Student ID"] || student.id || "";
  const studentYear = student["Year"] || student.year || "";
  const studentGroup = student["Group"] || student.group || "";
  return (
    <View style={styles.studentItem}>
      <Checkbox.Item
        label={`${studentId} (${studentYear}, Group ${studentGroup})`}
        status={isSelected ? 'checked' : 'unchecked'}
        onPress={() => onToggle(studentId)}
      />
    </View>
  );
});
const SelectedStudentItem = React.memo(({ item, index }) => (
  <View style={styles.selectionItem}>
    <Text style={styles.selectionNumber}>{index + 1}</Text>
    <Text style={styles.selectionId}>{item.id}</Text>
    <Text style={styles.selectionTime}>{item.formattedTime}</Text>
  </View>
));
const ChecklistScreen = ({ isOnline }) => {
  const [activeSession, setActiveSession] = useState(null);
  const [studentsData, setStudentsData] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [manualId, setManualId] = useState('');
  const [location, setLocation] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sessions, setSessions] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [selectionStatus, setSelectionStatus] = useState('');
  const [checkliststatus, setcheckliststatus] = useState('');
  const [lastAddedId, setLastAddedId] = useState('');
  const [showStudentSelectorModal, setShowStudentSelectorModal] = useState(false);
  const [showYearFilterModal, setShowYearFilterModal] = useState(false);
  const [showGroupFilterModal, setShowGroupFilterModal] = useState(false);
const [locationOptions, setLocationOptions] = useState([]);
const [dataTableSearchQuery, setDataTableSearchQuery] = useState('');
const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
const [studentToDelete, setStudentToDelete] = useState('');
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
        setSelectionStatus('Back online - Session will be backed up automatically');
        // Process any pending backups when coming online
        processPendingBackups()
          .then(result => {
            if (result && result.processed > 0) {
              setSelectionStatus(`Processed ${result.processed} pending backups`);
              // Show professional alert for successful backup of offline sessions
              Alert.alert(
                "Backup Complete", 
                "Your offline sessions have been successfully backed up to the server.",
                [{ text: "OK" }]
              );
              // Clear status message after a timeout
              setTimeout(() => {
                setSelectionStatus('');
              }, 5000);
            } else {
              // Clear any "will be backed up when online" messages
              setSelectionStatus('');
            }
          })
          .catch(error => console.error("Error processing pending backups:", error));
      } else {
        // Clear any "will be backed up when online" messages
        setSelectionStatus('');
      }
      // Check for pending backups when coming online
      checkAndProcessPendingBackups();
    } else {
      setConnectionMessage('Offline - Working in local mode');
    }
}, [isOnline]); // Only depend on isOnline, not activeSession


  //======SEARCH AND FILTER SECTION======//
  useEffect(() => {
  // Debounce search for better performance
  const timeoutId = setTimeout(() => {
    filterStudents();
  }, 300); // 300ms delay
  return () => clearTimeout(timeoutId);
}, [searchQuery, yearFilter, groupFilter, studentsData]);
  // Filter students when search query or filters change
  useEffect(() => {
    filterStudents();
  }, [searchQuery, yearFilter, groupFilter, studentsData]);
  // Filter handlers
  const handleYearFilter = (year) => {
    setYearFilter(year);
    setShowYearFilterModal(false);
  };
  const handleGroupFilter = (group) => {
    setGroupFilter(group);
    setShowGroupFilterModal(false);
  };
  // Filter students based on search query and filters
const filterStudents = async () => {
  console.log("Running filterStudents with", {yearFilter, groupFilter, searchQuery});
  try {
    // First load filtered data based on year and group
    const baseFilteredData = await loadFilteredStudentsData(yearFilter, groupFilter);
    // Then apply search query filter in memory
    if (searchQuery === '') {
      setFilteredStudents(baseFilteredData);
      return;
    }
    // Apply search filter
    const searchFiltered = baseFilteredData.filter(student => {
      const studentId = student["Student ID"] || student.id || "";
      return studentId.toString().toLowerCase().includes(searchQuery.toLowerCase());
    });
    setFilteredStudents(searchFiltered);
    console.log(`Filtered to ${searchFiltered.length} students after search`);
  } catch (error) {
    console.error("Error in filterStudents:", error);
    setFilteredStudents([]);
  }
};
const prepareStudentSelection = async () => {
  if (!activeSession) return;
  // Check if year and group filters are set
  if (yearFilter === 'all' || groupFilter === 'all') {
    Alert.alert(
      "Missing Filters",
      "Please select both year and group before selecting students.",
      [{ text: "OK" }]
    );
    return;
  }
  // Show loading state
  setSelectionStatus('Preparing student list...');
  try {
    // Update the session filters with current selections
    const updatedSession = {
      ...activeSession,
      filters: {
        year: yearFilter,
        group: groupFilter
      }
    };
    // Update active session with the new filters
    setActiveSession(updatedSession);
    // Save the updated session
    await saveActiveChecklistSession(updatedSession);
    await updateSessionInHistory(updatedSession);
    // Get filtered students based on session filters
    const filteredData = await loadFilteredStudentsData(yearFilter, groupFilter);
    setFilteredStudents(filteredData);
    setShowStudentSelectorModal(true);
    setSelectionStatus(`Showing ${filteredData.length} students from Year ${yearFilter}, Group ${groupFilter}`);
  } catch (error) {
    console.error("Error preparing student selection:", error);
    setSelectionStatus('Error loading student data');
    Alert.alert(
      "Error",
      "Failed to load student data. Please try again."
    );
  }
};

//======INITIALIZATION SECTION======//
// Add this function before the component definition
const initializeChecklistModule = async () => {
  console.log("Initializing checklist module...");
  
  try {
    // Reset recovery system on app startup - do this first
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
    
    // Load students data
    await loadStudentsDataForChecklist();
    
    // Load location options
    await loadLocationOptions();
    
    // Load sessions from storage
    const savedSessions = await AsyncStorage.getItem('sessions');
    if (savedSessions) {
      setSessions(JSON.parse(savedSessions));
    }
    
    // Check for recoverable session - do this last after everything else is set up
    await checkForRecoverableChecklistSession();
    
    console.log("Checklist module initialized successfully");
  } catch (error) {
    console.error("Error initializing checklist module:", error);
  }
};

useEffect(() => {
  loadLocationOptions()
    .catch(error => console.error("Failed to load location options:", error));
}, []); // Empty dependency array means this runs once on mount

// Single useEffect for initialization
useEffect(() => {
  // Run initialization once
  initializeChecklistModule();
  
  // Clean up when component unmounts
  return () => {
    // If there's an active session, save it before unmounting
    if (activeSession) {
      saveActiveChecklistSession(activeSession)
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
}, []); // Empty dependency array means this runs once on mount


  // Add this effect to check for pending backups when coming online
  useEffect(() => {
    if (isOnline) {
      // Process any pending backups when we come back online
      processPendingBackups()
        .then(result => {
          if (result && result.processed > 0) {
            setcheckliststatus(`Processed ${result.processed} pending backups`);
          }
        })
        .catch(error => console.error("Error processing pending backups:", error));
    }
  }, [isOnline]); // This will run whenever isOnline changes
  // Make sure the pendingBackups array exists
  AsyncStorage.getItem('pendingBackups').then(pendingBackups => {
    if (!pendingBackups) {
      AsyncStorage.setItem('pendingBackups', JSON.stringify([]));
      console.log("Initialized empty pendingBackups array");
    }
  });
// Check and process pending backups when coming online
  const checkAndProcessPendingBackups = async () => {
    if (!isOnline) {
      console.log("Cannot process backups while offline");
      return;
    }
    try {
      console.log("Checking for pending backups...");
      setcheckliststatus('Checking for pending backups...');
      const result = await processPendingBackups();
      console.log("Process pending backups result:", result);
      if (result.success) {
        if (result.processed > 0) {
          setcheckliststatus(`Synchronized ${result.processed} offline sessions`);
          
          // Show professional alert for successful backup of offline sessions
          Alert.alert(
            "Synchronization Complete", 
            "Sessions created while offline have been successfully synchronized with the server.",
            [{ text: "OK" }]
          );
          
          // Refresh sessions to update backup status
          const savedSessions = await AsyncStorage.getItem('sessions');
          if (savedSessions) {
            setSessions(JSON.parse(savedSessions));
          }
          
          // Clear status message after a timeout
          setTimeout(() => {
            setcheckliststatus('');
          }, 5000);
        }
      }
    } catch (error) {
      console.error('Error processing pending backups:', error);
      setcheckliststatus('Error processing backups');
      
      // Show alert for failed backup
      Alert.alert(
        "Synchronization Failed", 
        "There was an error synchronizing your offline sessions. Please try again later.",
        [{ text: "OK" }]
      );
    }
  };
//======FUNCTIONS SECTION======//
  //======DATA LOADING SECTION======//
  // Load students data
  const loadStudentsDataForChecklist = async () => {
    try {
      console.log("Loading students data...");
      // First, try to use cached data
      const cachedData = await AsyncStorage.getItem('cachedStudentsData');
      if (cachedData) {
        try {
          const parsedData = JSON.parse(cachedData);
          if (parsedData && parsedData.length > 0) {
            console.log(`Using cached student data with ${parsedData.length} records`);
            setcheckliststatus(`Loaded ${parsedData.length} student records from cache`);
            // Transform cached data
            const transformedData = formatStudentData(parsedData);
            setStudentsData(transformedData);
            // Optional: Check for updates in background if online
            if (isOnline) {
              checkForUpdatesInBackground();
            }
            return;
          }
        } catch (parseError) {
          console.error("Error parsing cached data:", parseError);
        }
      }
      // If no valid cached data, then try to load from network
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected && netState.isInternetReachable;
      if (isConnected) {
        console.log("Device is connected to the internet");
        setcheckliststatus("Online - Loading student data");
        try {
          // Get data from loadStudentsData function
          const data = await loadStudentsData(false); // Use false to allow caching
          if (data && data.length > 0) {
            console.log(`Loaded student data with ${data.length} records`);
            setcheckliststatus(`Loaded ${data.length} student records`);
            // Save to cache explicitly
            await AsyncStorage.setItem('cachedStudentsData', JSON.stringify(data));
            console.log("Saved data to cache for future use");
            // Transform the data
            const transformedData = formatStudentData(data);
            setStudentsData(transformedData);
            return;
          }
        } catch (loadError) {
          console.error("Error loading fresh student data:", loadError);
          setcheckliststatus("Error loading data - Trying cached data");
        }
      } else {
        console.log("Device is offline");
        setcheckliststatus("Offline - Cannot load new student data");
      }
      // If we get here, we couldn't get valid data from cache or network
      // As a last resort, use the built-in LOCAL_STUDENTS_DATA if available
      console.warn("No student data available - online or cached");
      setStudentsData([]);
      setcheckliststatus("No student data available");
      // Show alert to user about missing data
      Alert.alert(
        "No Student Data",
        "Unable to load student data. Please connect to the internet and try again.",
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Critical error in loadStudentsDataForChecklist:", error);
      setStudentsData([]);
      setcheckliststatus("Error loading student data");
    }
  };
  // Helper function to check for updates in background
  const checkForUpdatesInBackground = async () => {
    try {
      console.log("Checking for student data updates in background...");
      setcheckliststatus("Checking for updates in background...");
      // Use the existing function but force a reload
      const data = await loadStudentsData(true);
      if (data && data.length > 0) {
        // Save to cache
        await AsyncStorage.setItem('cachedStudentsData', JSON.stringify(data));
        // Update UI if there's new data
        const transformedData = formatStudentData(data);
        setStudentsData(transformedData);
        setcheckliststatus(`Updated to ${data.length} student records`);
        console.log("Background update complete");
      }
    } catch (error) {
      console.error("Background update failed:", error);
      // Don't update status as this is a background operation
    }
  };
  //======DATA FORMATTING SECTION======//
  // Add this helper function to format student data consistently
  const formatStudentData = (data) => {
    // Transform the data to make sure we have consistent field names
    const transformedData = [];
    const seenIds = new Set();
    data.forEach(student => {
      const studentId = student["Student ID"] || student.id || "";
      // If this ID hasn't been seen before, add it to the transformed data
      if (studentId && !seenIds.has(studentId)) {
        seenIds.add(studentId);
        transformedData.push({
          id: studentId,
          year: student["Year"] || student.year || "",
          group: student["Group"] || student.group || "",
          // Keep the original fields too
          "Student ID": studentId,
          "Year": student["Year"] || student.year || "",
          "Group": student["Group"] || student.group || ""
        });
      }
    });
    return transformedData;
  };
//====================DATA SYNC====================//
const handleSyncData = async () => {
  setcheckliststatus('Syncing student data with server...');
  try {
    const result = await syncStudentsDataWithGitHub();
    if (result.success) {
      setcheckliststatus(`Sync successful! Loaded ${result.count} students.`);
      await loadStudentsDataForChecklist();
      Alert.alert(
        "Sync Complete",
        `Successfully synchronized ${result.count} student records from the server.`
      );
    } else {
      setcheckliststatus('Sync failed. Please try again later.');
      Alert.alert(
        "Sync Failed",
        `Unable to sync with server: ${result.error}`
      );
    }
  } catch (error) {
    console.error('Error during manual sync:', error);
    setcheckliststatus('Sync error. Please check your connection.');
    Alert.alert(
      "Sync Error",
      "An unexpected error occurred during synchronization. Please check your internet connection and try again."
    );
  }
};
//======BACKUP MANAGEMENT SECTION======//
// Update backup status in UI and storage
const updateBackupStatus = async (sessionId, isBackedUp) => {
  try {
    // Update in storage
    const savedSessions = await AsyncStorage.getItem('sessions');
    if (savedSessions) {
      const parsedSessions = JSON.parse(savedSessions);
      const sessionIndex = parsedSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        // Update backup status and timestamp
        const updatedSessions = [...parsedSessions];
        updatedSessions[sessionIndex] = {
          ...updatedSessions[sessionIndex],
          backedUp: isBackedUp,
          backupTimestamp: isBackedUp ? new Date().toISOString() : null
        };
        // Save to storage
        await AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
        // Update in state
        setSessions(updatedSessions);
        console.log(`Session ${sessionId} backup status updated: ${isBackedUp}`);
      }
    }
  } catch (error) {
    console.error("Error updating backup status:", error);
  }
};
// Queue session for backup when offline
const queueSessionForBackup = async (session) => {
  try {
    console.log("Queueing checklist session for backup:", session.id);
    // Get existing pending backups
    const pendingBackups = await AsyncStorage.getItem('pendingBackups');
    const backupsArray = pendingBackups ? JSON.parse(pendingBackups) : [];
    // Check if this session is already in the queue
    const existingIndex = backupsArray.findIndex(b => b.session.id === session.id);
    if (existingIndex >= 0) {
      console.log(`Session ${session.id} already in pending backups`);
      return;
    }
    // Generate a proper file name for this checklist session
    const fileName = `Checklist_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    // Add this session to pending backups with checklist-specific metadata
    backupsArray.push({
      timestamp: new Date().toISOString(),
      session: session,
      fileName: fileName,
      type: 'checklist', // Mark this as a checklist session explicitly
      retryCount: 0
    });
    // Save updated pending backups
    await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
    console.log(`Checklist session queued for backup. Total pending: ${backupsArray.length}`);
    // Show alert with offline backup information
    Alert.alert(
      "Session Saved Offline",
      "This session has been saved offline and will be backed up automatically when you're back online.",
      [{ text: "OK" }]
    );
  } catch (error) {
    console.error("Error queueing checklist session for backup:", error);
    Alert.alert("Backup Error", "Failed to queue checklist session for later backup.");
  }
};
  //======SESSION MANAGEMENT SECTION======//
const handleDeleteConfirmation = (studentId) => {
  setStudentToDelete(studentId);
  setShowDeleteConfirmModal(true);
};
const handleDeleteStudent = async () => {
  if (!studentToDelete || !activeSession) return;
  
  // Create a new array without the deleted student
  const updatedScans = activeSession.scans.filter(scan => scan.id !== studentToDelete);
  
  // Create updated session object
  const updatedSession = {
    ...activeSession,
    scans: updatedScans
  };
  
  // Update the active session state
  setActiveSession(updatedSession);
  
  // IMPORTANT: Also update the selectedStudents Set to keep it in sync
  const updatedSelectedStudents = new Set(selectedStudents);
  updatedSelectedStudents.delete(studentToDelete);
  setSelectedStudents(updatedSelectedStudents);
  
  // Add haptic feedback for deletion
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  
  // Mark session as needing saving for auto-save mechanism
  window.sessionNeedsSaving = true;
  
  // Immediately save the updated session to AsyncStorage
  try {
    await saveActiveChecklistSession(updatedSession);
    console.log("Session saved after item deletion");
    
    // Update session in history
    await updateSessionInHistory(updatedSession);
    console.log("Session history updated after item deletion");
    
    // Update status message
    setSelectionStatus(`✅ Deleted student: ${studentToDelete}`);
    
    // Clear status message after a few seconds
    setTimeout(() => {
      setSelectionStatus('');
    }, 3000);
  } catch (error) {
    console.error("Error saving session after deletion:", error);
    Alert.alert(
      "Deletion Error",
      "Student was removed from display but there was an error saving the changes."
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
    setcheckliststatus("Loading location options...");
    
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
      console.log(`Loaded ${locationData.length} location options`);
      setLocationOptions(locationData);
      setcheckliststatus(`Loaded ${locationData.length} location options`);
      
      // Cache the location options for offline use
      await AsyncStorage.setItem('cachedLocationOptions', JSON.stringify(locationData));
      console.log("Location options cached for offline use");
      
      return locationData;
    } else {
      throw new Error("Invalid location data format");
    }
  } catch (error) {
    console.error("Error loading location options:", error);
    setcheckliststatus("Error loading location options");
    
    // Try to load from cache if network request fails
    try {
      const cachedOptions = await AsyncStorage.getItem('cachedLocationOptions');
      if (cachedOptions) {
        const parsedOptions = JSON.parse(cachedOptions);
        if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
          console.log(`Using ${parsedOptions.length} cached location options`);
          setLocationOptions(parsedOptions);
          setcheckliststatus(`Using cached location options`);
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
  setcheckliststatus('Refreshing location options...');
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
// Start a new checklist session
const startChecklistSession = () => {
  // Reset location first
  setLocation('');
  // Then show the modal
  setShowSessionModal(true);
};
const onLocationSelected = (selectedLocation) => {
  console.log("Selected subject:", selectedLocation);
  // First set the location in state
  setLocation(selectedLocation);
  // Then close the modal
  setShowSessionModal(false);
  // Wait for the state to update before creating the session
  setTimeout(() => {
    if (selectedLocation) {
      console.log("Creating new session with subject:", selectedLocation);
      createNewChecklistSessionWithLocation(selectedLocation);
    } else {
      console.log("No location selected");
    }
  }, 500); // Increased delay to ensure state is updated
};
// Create a new checklist session with a specific location
const createNewChecklistSessionWithLocation = (sessionLocation) => {
  console.log("Creating session at subject:", sessionLocation);
  if (!sessionLocation || !sessionLocation.trim()) {
    Alert.alert("Error", "Please enter a location");
    return;
  }
  // Create new session
  const now = new Date();
  const sessionId = `checklist_${now.getTime()}`;
  const formattedDateTime = formatDateTime(now);
  // Store the current filter settings with the session
  const newSession = {
    id: sessionId,
    location: sessionLocation,
    dateTime: now.toISOString(),
    formattedDateTime: formattedDateTime,
    scans: [],
    inProgress: true,
    isChecklist: true,
    // Store filters with the session for reference - these will be selected later
    filters: {
      year: 'all',  // Start with default values
      group: 'all'
    }
  };
  // Set active session
  setActiveSession(newSession);
  // Clear selected students
  setSelectedStudents(new Set());
  // Add session to sessions array
  AsyncStorage.getItem('sessions').then(savedSessions => {
    const parsedSessions = savedSessions ? JSON.parse(savedSessions) : [];
    const updatedSessions = [...parsedSessions, newSession];
    setSessions(updatedSessions);
    AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
    // Store temp index
    const index = updatedSessions.length - 1;
    AsyncStorage.setItem(TEMP_CHECKLIST_SESSION_INDEX_KEY, String(index));
  });
  // Save active session
  saveActiveChecklistSession(newSession);
  // Start auto-save timer
  startAutoSaveTimer();
  console.log("New checklist session created:", sessionId);
};
// End checklist session
const endChecklistSession = () => {
  if (!activeSession) return;

  // Stop auto-save timer
  stopAutoSaveTimer();
  // Perform one final save before ending
  performAutoSave(true);

  // Confirm if there are no selections
  if (activeSession.scans.length === 0) {
    Alert.alert(
      "End Session",
      "No students selected in this session. Do you still want to end it?",
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Session', 
          style: 'destructive',
          onPress: () => finalizeChecklistSession()
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
          onPress: () => finalizeChecklistSession()
        }
      ]
    );
  }
};
// Finalize the checklist session
const finalizeChecklistSession = async () => {
  // Create a copy of the session for export
  const sessionToExport = { ...activeSession };
  
  // First, properly mark the session as closed normally in the recovery system
  // Use the new function from the recovery service
  try {
    await markSessionAsNormallyClosed(activeSession.id, SESSION_TYPE.CHECKLIST);
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
          sessionType: SESSION_TYPE.CHECKLIST, // Explicitly mark session type
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
  AsyncStorage.removeItem(CHECKLIST_ACTIVE_SESSION_STORAGE_KEY)
    .catch(error => console.error("Error clearing active checklist session:", error));
  
  AsyncStorage.removeItem(TEMP_CHECKLIST_SESSION_INDEX_KEY)
    .catch(error => console.error("Error clearing temp session index:", error));
  
  // Clear active session
  setActiveSession(null);
  setSelectedStudents(new Set());
  setSelectionStatus('');
  
  // Export session to Excel only if there are scans
  if (sessionToExport && sessionToExport.scans && sessionToExport.scans.length > 0) {
    setTimeout(() => {
      // Always export the Excel file, regardless of online status
      exportChecklistSession(sessionToExport, true); // Pass true to indicate silent export
      
      // If offline, also queue for backup for when we're back online
      if (!isOnline) {
        queueSessionForBackup(sessionToExport);
      }
    }, 500);
  }
  
  console.log("Checklist session ended successfully");
};

//======SESSION RECOVERY SECTION======//
  // Check for recoverable session
const checkForRecoverableChecklistSession = async () => {
  try {
    // Use the improved recovery service
    const result = await checkForRecoverableSession(SESSION_TYPE.CHECKLIST);
    if (result.hasRecoverableSession) {
      Alert.alert(
        "Recover Checklist Session",
        `Found an incomplete checklist session at ${result.session.location} with ${result.session.scans?.length || 0} selections. Would you like to recover it?`,
        [
          {
            text: "Yes",
            onPress: () => recoverChecklistSession(result.session)
          },
          {
            text: "No",
            onPress: () => {
              // Instead of just clearing the session, backup the session first
              handleDeclinedRecovery(result.session)
                .then(() => {
                  // After backing up, clear the recoverable session
                  clearRecoverableSession(result.session.id, SESSION_TYPE.CHECKLIST)
                    .catch(error => console.error("Error clearing checklist session:", error));
                })
                .catch(error => {
                  console.error("Error handling declined recovery:", error);
                  // Still attempt to clear the recoverable session
                  clearRecoverableSession(result.session.id, SESSION_TYPE.CHECKLIST)
                    .catch(clearError => console.error("Error clearing checklist session:", clearError));
                });
            }
          }
        ]
      );
    }
  } catch (error) {
    console.error("Error checking for recoverable checklist session:", error);
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
      sessionType: SESSION_TYPE.CHECKLIST,
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
        await exportChecklistSession(completedSession, true);
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
  return AsyncStorage.getItem('sessions').then(savedSessions => {
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
  // Recover checklist session
  const recoverChecklistSession = async (session) => {
    try {
      // Use the improved recovery service
      const recoveryResult = await recoverSession(session, SESSION_TYPE.CHECKLIST);
      if (recoveryResult.success) {
        // Set active session
        setActiveSession(session);


        // Restore selections
        const selectedSet = new Set();
        session.scans.forEach(scan => {
          selectedSet.add(scan.id);
        });
        setSelectedStudents(selectedSet);

        // Update sessions list
        const savedSessions = await AsyncStorage.getItem('sessions');
        if (savedSessions) {
          setSessions(JSON.parse(savedSessions));
        }
        // Start auto-save timer
        startAutoSaveTimer();
        console.log("Checklist session recovered successfully");
      } else {
        throw new Error(recoveryResult.error || "Failed to recover checklist session");
      }
    } catch (error) {
      console.error("Error recovering checklist session:", error);
      Alert.alert(
        "Recovery Error",
        "Could not recover the checklist session. Please try again.",
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
    saveActiveChecklistSession(sessionSnapshot),
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
const saveActiveChecklistSession = async (session) => {
  if (!session) {
    console.error("Cannot save null or undefined session");
    return Promise.reject(new Error("Invalid session"));
  }
  
  try {
    console.log(`Saving active checklist session: ${session.id}`);
    
    // Save to AsyncStorage for persistent storage
    await AsyncStorage.setItem(CHECKLIST_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    
    // Register with recovery system for crash protection
    await recoverSession(session, SESSION_TYPE.CHECKLIST);
    
    // Optional: Add a database save like the scanner does
    try {
      await saveSession(session);
      console.log('Session updated in database with new selection');
    } catch (dbError) {
      console.error('Error updating session in database:', dbError);
    }
    
    console.log("Checklist session saved successfully");
    return Promise.resolve({ success: true });
  } catch (error) {
    console.error("Error saving active checklist session:", error);
    return Promise.reject(error);
  }
};
//====================STUDENT SELECTION SECTION====================//
// Play success sound and haptic feedback
const playSuccessFeedback = async () => { 
  try {
    // Provide haptic feedback
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // You can also add sound here if needed, similar to scanner module
  } catch (e) {
    console.error("Could not use haptic feedback:", e);
  }
};

// Play error feedback for invalid selections or duplicates
const playErrorFeedback = async () => {
  try {
    // Provide error haptic feedback
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    
    // You can also add error sound here if needed
  } catch (e) {
    console.error("Could not use haptic feedback:", e);
  }
};
// Handle student selection with optimized performance
const handleStudentSelection = async (studentId, isChecked) => {
  if (!activeSession) return;
  // IMMEDIATE UI FEEDBACK: Update the selected set first for immediate UI response
  const updatedSelection = new Set(selectedStudents);
  if (isChecked) {
    // First update the visual state - this happens instantly
    updatedSelection.add(studentId);
    setSelectedStudents(updatedSelection);
    setSelectionStatus(`✓ Selecting: ${studentId}`);
    
    // Add haptic feedback
    await playSuccessFeedback();
    
    // Create timestamp
    const now = new Date();
    const timestamp = now.toISOString();
    const formattedTime = formatTime(now);
    // Create new scan - ensure ID is stored correctly
    const newScan = {
      id: studentId,
      content: studentId, // Keep this the same as id for consistency
      timestamp: timestamp,
      formattedTime: formattedTime,
      time: now,
      isManual: false
    };
    
    // Update active session with the new scan
    const updatedSession = {
      ...activeSession,
      scans: [...activeSession.scans, newScan]
    };
    
    // Update active session state - this updates the UI
    setActiveSession(updatedSession);
    
    // IMPORTANT: Save immediately instead of just marking as needing save
    try {
      // Save to AsyncStorage for persistent storage
      await saveActiveChecklistSession(updatedSession);
      // Update the session in history
      await updateSessionInHistory(updatedSession);
      console.log(`Selection saved immediately: ${studentId}`);
    } catch (error) {
      console.error("Error saving selection:", error);
    }
  } else {
    // Deselection - update UI immediately
    updatedSelection.delete(studentId);
    setSelectedStudents(updatedSelection);
    setSelectionStatus(`✗ Removing: ${studentId}`);
    
    // Add haptic feedback (different feel for deselection)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Filter out scans for this student
    const updatedScans = activeSession.scans.filter(scan => scan.id !== studentId);
    
    // Create updated session object
    const updatedSession = {
      ...activeSession,
      scans: updatedScans
    };
    
    // Update active session state - this updates the UI
    setActiveSession(updatedSession);
    
    // IMPORTANT: Save immediately instead of just marking as needing save
    try {
      // Save to AsyncStorage for persistent storage
      await saveActiveChecklistSession(updatedSession);
      // Update the session in history
      await updateSessionInHistory(updatedSession);
      console.log(`Deselection saved immediately: ${studentId}`);
    } catch (error) {
      console.error("Error saving deselection:", error);
    }
  }
};

// Updated addStudentToSelectionTable function
const addStudentToSelectionTable = async (studentId, isManual = false) => {
  if (!activeSession) return;
  // First update the selection status for immediate feedback
  setSelectionStatus(`✓ ${isManual ? 'Manually added' : 'Selected'}: ${studentId}`);
  
  // Add haptic feedback
  await playSuccessFeedback();
  
  // Create timestamp
  const now = new Date();
  const timestamp = now.toISOString();
  const formattedTime = formatTime(now);
  
  // Create new scan
  const newScan = {
    id: studentId,
    content: studentId,
    timestamp: timestamp,
    formattedTime: formattedTime,
    time: now,
    isManual: isManual
  };
  
  // Create updated session with new scan
  const updatedSession = {
    ...activeSession,
    scans: [...activeSession.scans, newScan]
  };
  
  // Update active session - for immediate UI update
  setActiveSession(updatedSession);
  
  // Update selectedStudents set - for immediate UI update
  const updatedSelection = new Set(selectedStudents);
  updatedSelection.add(studentId);
  setSelectedStudents(updatedSelection);
  
  // IMPORTANT: Save immediately instead of just marking as needing save
  try {
    // Save to AsyncStorage for persistent storage
    await saveActiveChecklistSession(updatedSession);
    // Update the session in history
    await updateSessionInHistory(updatedSession);
    console.log(`Manual entry saved immediately: ${studentId}`);
  } catch (error) {
    console.error("Error saving manual entry:", error);
  }
};

// Updated removeStudentFromSelectionTable function
const removeStudentFromSelectionTable = async (studentId) => {
  if (!activeSession) return;
  // Update status immediately for feedback
  setSelectionStatus(`✗ Removed: ${studentId}`);
  
  // Add haptic feedback
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  
  // Filter out scans for this student
  const updatedScans = activeSession.scans.filter(scan => scan.id !== studentId);
  
  // Create updated session object
  const updatedSession = {
    ...activeSession,
    scans: updatedScans
  };
  
  // Update active session - for immediate UI update
  setActiveSession(updatedSession);
  
  // Update selectedStudents set - for immediate UI update
  const updatedSelection = new Set(selectedStudents);
  updatedSelection.delete(studentId);
  setSelectedStudents(updatedSelection);
  
  // IMPORTANT: Save immediately instead of just marking as needing save
  try {
    // Save to AsyncStorage for persistent storage
    await saveActiveChecklistSession(updatedSession);
    // Update the session in history
    await updateSessionInHistory(updatedSession);
    console.log(`Removal saved immediately: ${studentId}`);
  } catch (error) {
    console.error("Error saving removal:", error);
  }
};

// Updated processManualEntry function
const processManualEntry = async () => {
  const studentId = manualId.trim();
  if (!studentId) {
    Alert.alert('Error', 'Please enter a Student ID');
    // Add error haptic feedback
    await playErrorFeedback();
    return;
  }
  
  // Updated validation to require exactly 6 digits
  if (!/^\d{6}$/.test(studentId)) {
    Alert.alert('Invalid Input', 'Please enter a 6-digit Student ID');
    // Add error haptic feedback
    await playErrorFeedback();
    return;
  }
  
  // Check if already selected - give immediate feedback
  if (selectedStudents.has(studentId)) {
    Alert.alert('Already Selected', `Student ${studentId} is already in your selection.`);
    // Add error haptic feedback
    await playErrorFeedback();
    setManualId(''); // Just clear the input but keep modal open
    return;
  }
  
  // Add to selected students - immediate UI update
  const updatedSelection = new Set(selectedStudents);
  updatedSelection.add(studentId);
  setSelectedStudents(updatedSelection);
  
  // Add success haptic feedback
  await playSuccessFeedback();
  
  // Set last added ID for feedback - immediate UI update
  setLastAddedId(studentId);
  setSelectionStatus(`✓ Adding: ${studentId}`);
  
  // Reset input but keep modal open - immediate UI update
  setManualId('');
  
  // Create timestamp
  const now = new Date();
  const timestamp = now.toISOString();
  const formattedTime = formatTime(now);
  
  // Create new scan
  const newScan = {
    id: studentId,
    content: studentId,
    timestamp: timestamp,
    formattedTime: formattedTime,
    time: now,
    isManual: true
  };
  
  // Create updated session with new scan
  const updatedSession = {
    ...activeSession,
    scans: [...activeSession.scans, newScan]
  };
  
  // Update active session - for immediate UI update
  setActiveSession(updatedSession);
  
  // IMPORTANT: Save immediately instead of just marking as needing save
  try {
    // Save to AsyncStorage for persistent storage
    await saveActiveChecklistSession(updatedSession);
    // Update the session in history
    await updateSessionInHistory(updatedSession);
    console.log(`Manual entry saved immediately: ${studentId}`);
    
    // Update status with complete message
    setSelectionStatus(`✓ Manually added: ${studentId}`);
    
    // Clear the message after 3 seconds
    setTimeout(() => {
      setLastAddedId('');
    }, 3000);
  } catch (error) {
    console.error("Error saving manual entry:", error);
  }
};

//======EXPORT AND FILE MANAGEMENT SECTION======//
// Export checklist session to Excel
const exportChecklistSession = async (session, silentMode = false) => {
  try {
    console.log("Starting checklist export for session:", session.id);

    // Check if session has any scans
    if (!session.scans || session.scans.length === 0) {
      console.log("Session has no scans, skipping export");
      if (!silentMode) {
        Alert.alert("Empty Session", "There are no entries to export. Export cancelled.");
      }
      return { success: false, message: 'Export cancelled: No entries to export' };
    }

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

    const fileName = `Checklist_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    
    // Prepare data with Type column before User column
    const data = [
      ['Student ID', 'Subject', 'Log Date', 'Log Time', 'Type', 'User']
    ];
    
    // Add selections with type information
    session.scans.forEach((scan, index) => {
      const scanDate = new Date(scan.time || scan.timestamp);
      data.push([
        scan.content,                // Student ID
        session.location,            // Subject
        formatDate(scanDate),        // Log Date
        formatTime(scanDate),        // Log Time
        scan.isManual ? "Manual" : "Selection",  // Type of entry (Selection for checklist)
        userEmail                    // User email (current logged in user)
      ]);
    });
    
    console.log(`Prepared data with ${session.scans.length} entries and user: ${userEmail}`);

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklist");
    
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
      dialogTitle: 'Export Checklist Session Data',
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
          console.log("Checklist backed up successfully");
          // Update backup status in UI and storage
          await updateBackupStatus(session.id, true);
          // Only show a single backup success alert
          Alert.alert("Backup Successful", "Session backed up to server successfully!");
        } else {
          throw new Error("Backup failed with error: " + (backupResult?.message || "Unknown error"));
        }
      } catch (backupError) {
        console.error("Error during backup:", backupError);
        // Queue for later backup - and show single consolidated error alert
        await queueSessionForBackup(session, true); // Added silent flag parameter
        Alert.alert("Backup Failed", "Unable to backup to server. The session is saved locally and will be backed up when online.");
      }
    } else {
      console.log("Offline - queueing for backup later");
      // Queue for backup when back online with silent flag (to avoid duplicate alerts)
      await queueSessionForBackup(session, false); // Will show its own alert
    }
    
    console.log("Checklist export completed successfully");
    return { success: true, message: 'Export successful!', filePath: saveResult.uri };
  } catch (error) {
    console.error("Error exporting checklist session:", error);
    // Only show alert if not in silent mode
    if (!silentMode) {
      Alert.alert("Export Error", "Failed to export checklist: " + error.message);
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
            "We need access to your media library to save files. Please enable this permission in your device settings."
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
        // No export success alert - removed as requested
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
              "Could not save file directly. Please use the Share screen to save the file to your preferred location."
            );
          }
          return { success: true, message: "File available for sharing", uri: fileUri, shareOnly: true };
        }
      }
    } else if (Platform.OS === 'ios') {
      // iOS code
      const documentDir = FileSystem.documentDirectory;
      const newFileUri = `${documentDir}${fileName}`;
      await FileSystem.copyAsync({
        from: fileUri,
        to: newFileUri
      });
      console.log("File saved to documents:", newFileUri);
      // No export success alert - removed as requested
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

// Updated to use 24-hour format with seconds (hh:mm:ss)
const formatTime = (date) => {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false // This ensures 24-hour format
  });
};

const formatDateTimeForFile = (date) => {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
};
//====================FILTERING SECTION====================//
// Get unique years and groups for filters
const getUniqueYears = useMemo(() => {
  const years = new Set();
  studentsData.forEach(student => {
    const studentYear = student["Year"] || student.year;
    if (studentYear) {
      years.add(studentYear);
    }
  });
  return Array.from(years).sort();
}, [studentsData]);
const getUniqueGroups = useMemo(() => {
  const groups = new Set();
  studentsData.forEach(student => {
    const studentGroup = student["Group"] || student.group;
    if (studentGroup) {
      // Convert to uppercase to standardize case
      groups.add(studentGroup.toString().toUpperCase());
    }
  });
  return Array.from(groups).sort();
}, [studentsData]);
// Filter students when search query or filters change - improved with memoization
const filteredStudentsMemo = useMemo(() => {
  if (studentsData.length === 0) {
    return [];
  }
  // Only filter if there are actual filters active
  if (searchQuery === '' && yearFilter === 'all' && groupFilter === 'all') {
    return studentsData.slice(0, 200); // Limit to first 200 students for performance
  }
  // Otherwise do filtering
  const filtered = studentsData.filter(student => {
    const studentId = student["Student ID"] || student.id || "";
    const studentYear = student["Year"] || student.year || "";
    const studentGroup = (student["Group"] || student.group || "").toString().toUpperCase();
    const matchesSearch = searchQuery === '' || 
      studentId.toString().toLowerCase().includes(searchQuery.toLowerCase());
    const matchesYear = yearFilter === 'all' || studentYear === yearFilter;
    const matchesGroup = groupFilter === 'all' || studentGroup === groupFilter.toUpperCase();
    return matchesSearch && matchesYear && matchesGroup;
  });
  // Limit results for performance
  return filtered.slice(0, 200);
}, [studentsData, searchQuery, yearFilter, groupFilter]);
// Update the filtered students when the memoized value changes
useEffect(() => {
  setFilteredStudents(filteredStudentsMemo);
}, [filteredStudentsMemo]);
return (
  <Provider>
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {connectionMessage && (
        <View style={[styles.connectionStatus, { backgroundColor: isOnline ? '#e7f3e8' : '#fff3cd' }]}>
          <Text style={{ color: isOnline ? '#28a745' : '#856404' }}>{connectionMessage}</Text>
        </View>
      )}
      <Surface style={styles.card}>
        <Title style={styles.title}>Student Selector</Title>
        <View style={styles.buttonContainer}>
          <Button 
            mode="contained" 
            style={[styles.primaryButton, styles.fullWidthButton]}
            labelStyle={styles.primaryButtonText}
            onPress={() => activeSession ? endChecklistSession() : startChecklistSession()}
          >
            {activeSession ? 'End Session' : 'Start New Session'}
          </Button>
          {!activeSession && (
            <Button 
              mode="outlined" 
              style={[styles.secondaryButton, styles.fullWidthButton]}
              labelStyle={styles.secondaryButtonText}
              onPress={handleSyncData}
              disabled={!isOnline}
            >
              Sync Data
            </Button>
          )}
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
            <Text style={styles.locationText}>Subject: {activeSession.location}</Text>
            <Text style={styles.dateTimeText}>Date/Time: {activeSession.formattedDateTime}</Text>
            {/* Streamlined filtering UI directly in main layout */}
            <View style={styles.filterControls}>
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Year:</Text>
                <Button 
                  mode="outlined" 
                  style={styles.secondaryButton}
                  labelStyle={styles.secondaryButtonText}
                  onPress={() => setShowYearFilterModal(true)}
                >
                  {yearFilter === 'all' ? 'Select Year' : yearFilter}
                </Button>
              </View>
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Group:</Text>
                <Button 
                  mode="outlined" 
                  style={styles.secondaryButton}
                  labelStyle={styles.secondaryButtonText}
                  onPress={() => setShowGroupFilterModal(true)}
                >
                  {groupFilter === 'all' ? 'Select Group' : groupFilter}
                </Button>
              </View>
            </View>
            {/* Direct Start Selection button */}
            <Button 
              mode="contained" 
              style={[styles.primaryButton, styles.fullWidthButton]}
              labelStyle={styles.primaryButtonText}
              onPress={() => prepareStudentSelection()}    
            >
              Start Selection
            </Button>
          </View>
        )}
        {selectionStatus ? (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{selectionStatus}</Text>
          </View>
        ) : null}
        {!activeSession && (
          <View style={styles.checklistContainer}>
            <Text style={styles.placeholderText}>
              Click "Start New Session" to begin.
            </Text>
          </View>
        )}
        <Title style={styles.subtitle}>Selected Students</Title>

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
                    return scan.id.toLowerCase().includes(dataTableSearchQuery.toLowerCase());
                  })
                  .map((scan, index) => (
                    <DataTable.Row key={scan.id || index} style={{ backgroundColor: '#ffffff' }}>
                      <DataTable.Cell style={{ flex: 0.6 }}>
                        <Text style={{ color: '#24325f' }}>
                          {scan.id}
                          {scan.isManual ? ' (Manual)' : ''}
                        </Text>
                      </DataTable.Cell>
                      <DataTable.Cell style={{ flex: 0.4 }}>
                        <Text style={{ color: '#24325f' }}>{scan.formattedTime}</Text>
                      </DataTable.Cell>
                      <DataTable.Cell style={{ flex: 0.2, alignItems: 'center', justifyContent: 'center' }}>
                        <TouchableOpacity 
                          onPress={() => handleDeleteConfirmation(scan.id)}
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
          <Text style={styles.noDataText}>No students selected yet.</Text>
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
          visible={showStudentSelectorModal}
          onDismiss={() => setShowStudentSelectorModal(false)}
          contentContainerStyle={[styles.selectorModalContent, { backgroundColor: '#ffffff' }]}
        >
          <Title style={{ color: '#24325f' }}>Select Students</Title>
          <Searchbar
            placeholder="Search students..."
            onChangeText={query => setSearchQuery(query)}
            value={searchQuery}
            style={styles.searchbar}
          />
          <View style={styles.filterSummary}>
            <Text style={styles.filterSummaryText}>
              Showing {filteredStudents.length} students
              {yearFilter !== 'all' ? ` from Year ${yearFilter}` : ''}
              {groupFilter !== 'all' ? ` in Group ${groupFilter}` : ''}
            </Text>
          </View>
          <ScrollView style={styles.studentModalList}>
            {filteredStudents.length > 0 ? (
              filteredStudents.map(student => {
                const studentId = student["Student ID"] || student.id || "";
                const studentYear = student["Year"] || student.year || "";
                const studentGroup = student["Group"] || student.group || "";
                const isSelected = selectedStudents.has(studentId);
                return (
                  <TouchableOpacity
                    key={`student-${studentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`}
                    style={[
                      styles.studentSelectItem,
                      isSelected ? styles.studentItemSelected : styles.studentItemNotSelected
                    ]}
                    onPress={() => handleStudentSelection(studentId, !isSelected)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.studentSelectCheckCircle}>
                      {isSelected && (
                        <Icon name="check" size={16} color="#ffffff" />
                      )}
                    </View>
                    <Text style={[
                      styles.studentSelectLabel,
                      isSelected ? styles.studentLabelSelected : styles.studentLabelNotSelected
                    ]}>
                      {`${studentId} (Y: ${studentYear}, G: ${studentGroup})`}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyList}>
                <Text style={styles.emptyText}>
                  {studentsData.length === 0 
                    ? "No student data available." 
                    : "No students match the current filters."}
                </Text>
              </View>
            )}
          </ScrollView>
          <View style={styles.modalButtons}>
            <Button 
              mode="text" 
              onPress={() => setShowStudentSelectorModal(false)}
              style={styles.secondaryButton}
              labelStyle={styles.secondaryButtonText}
            >
              Done
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
          <Text style={{ marginBottom: 10, color: '#24325f' }}>Enter student IDs one at a time and click "Add" after each. The modal will stay open so you can add multiple entries.</Text>
          {lastAddedId ? (
            <View style={{ backgroundColor: '#e7f3e8', padding: 8, borderRadius: 4, marginBottom: 10 }}>
              <Text style={{ color: '#28a745' }}>✓ Added: {lastAddedId}</Text>
            </View>
          ) : null}
          <TextInput
            label="Student ID"
            value={manualId}
            onChangeText={(text) => {
              // Only allow digits in the input field
              const numericText = text.replace(/[^0-9]/g, '');
              setManualId(numericText);
            }}
            style={[styles.input, { backgroundColor: '#ffffff', color: '#24325f' }]}
            autoFocus
            onSubmitEditing={processManualEntry}
            keyboardType="numeric" // Set numeric keyboard
          />
          <View style={styles.modalButtons}>
            <Button 
              mode="text" 
              onPress={() => setShowManualEntryModal(false)}
              style={styles.secondaryButton}
              labelStyle={styles.secondaryButtonText}
            >
              Done
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
      <Portal>
        <Modal
          visible={showYearFilterModal}
          onDismiss={() => setShowYearFilterModal(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Title>Select Year</Title>
          <Text style={{marginBottom: 10}}>Please select a year</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {getUniqueYears.map(year => (
              <Button 
                key={year} 
                onPress={() => {
                  setYearFilter(year);
                  setShowYearFilterModal(false);
                }}
                style={styles.secondaryButton}
                labelStyle={styles.secondaryButtonText}
              >
                {year}
              </Button>
            ))}
          </ScrollView>
          <Button 
            onPress={() => setShowYearFilterModal(false)}
            style={[styles.secondaryButton, {marginTop: 10}]}
            labelStyle={styles.secondaryButtonText}
          >
            Cancel
          </Button>
        </Modal>
      </Portal>
      <Portal>
        <Modal
          visible={showGroupFilterModal}
          onDismiss={() => setShowGroupFilterModal(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Title>Select Group</Title>
          <Text style={{marginBottom: 10}}>Please select a group</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {getUniqueGroups.map(group => (
              <Button 
                key={group} 
                onPress={() => {
                  setGroupFilter(group);
                  setShowGroupFilterModal(false);
                }}
                style={styles.secondaryButton}
                labelStyle={styles.secondaryButtonText}
              >
                {group}
              </Button>
            ))}
          </ScrollView>
          <Button 
            onPress={() => setShowGroupFilterModal(false)}
            style={[styles.secondaryButton, {marginTop: 10}]}
            labelStyle={styles.secondaryButtonText}
          >
            Cancel
          </Button>
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
            Are you sure you want to remove student ID: {studentToDelete}?
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

//======STYLESHEET SECTION======//
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
    backgroundColor: '#f5f5f5',
  marginTop: 10,
  marginBottom: 10,
  padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#24325f',
  justifyContent: 'space-between',

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
  selectorModalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 8,
    maxHeight: '100%',
    width: '90%',
    alignSelf: 'center',
  },
  studentModalList: {
    marginTop: 10,
    maxHeight: 400,
    height: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  configSection: {
    marginTop: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  configTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#24325f',
  },
  filterControls: {
    marginVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterLabel: {
    flex: 0.3,
    fontSize: 16,
    color: '#24325f',
  },
  filterButton: {
    flex: 0.7,
    backgroundColor: 'white',
    borderColor: '#24325f',
    borderWidth: 1,
    marginBottom: 8,
    marginRight: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  studentSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
    marginHorizontal: 8,
  },
  studentItemSelected: {
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#24325f',
  },
  studentItemNotSelected: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  studentSelectCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#24325f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#24325f',
  },
  studentLabelSelected: {
    color: '#24325f',
    fontWeight: '500',
  },
  studentLabelNotSelected: {
    color: '#24325f',
  },
  studentSelectLabel: {
    flex: 1,
    fontSize: 16,
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
export default ChecklistScreen;
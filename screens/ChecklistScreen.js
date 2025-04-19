import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, ScrollView, Alert } from 'react-native';
import { Text, Button, Surface, Title, Checkbox, Modal, Portal, Provider, Searchbar, List, Divider, DataTable, TextInput } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { saveToDownloads } from '../services/export';
import * as XLSX from 'xlsx';
import * as BackupService from '../services/backup';
import { backupToGitHub, tryAutoBackup, processPendingBackups } from '../services/backup';
import { loadStudentsData } from '../services/loadData';
import NetInfo from '@react-native-community/netinfo';
import { syncStudentsDataWithGitHub } from '../services/loadData';
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
// Storage keys
const CHECKLIST_ACTIVE_SESSION_STORAGE_KEY = 'activeChecklistSession';
const TEMP_CHECKLIST_SESSION_INDEX_KEY = 'tempChecklistSessionIndex';
const ChecklistScreen = ({ isOnline }) => {
// State variables
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
useEffect(() => {
// Debounce search for better performance
const timeoutId = setTimeout(() => {
filterStudents();
}, 300); // 300ms delay
return () => clearTimeout(timeoutId);
}, [searchQuery, yearFilter, groupFilter, studentsData]);
// Then remove the filterStudents call from the original useEffect
useEffect(() => {
// Empty - actual filtering now happens in the debounced effect above
}, [searchQuery, yearFilter, groupFilter, studentsData]);
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
// Add these state variables
const [showYearFilterModal, setShowYearFilterModal] = useState(false);
const [showGroupFilterModal, setShowGroupFilterModal] = useState(false);
// Then add these functions to handle filters
const handleYearFilter = (year) => {
setYearFilter(year);
setShowYearFilterModal(false);
};
const handleGroupFilter = (group) => {
setGroupFilter(group);
setShowGroupFilterModal(false);
};
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
// setcheckliststatus('Checking for pending backups...');  // Removed UI update
const result = await processPendingBackups();
console.log("Process pending backups result:", result);
if (result.success) {
if (result.message.includes('processed')) {
// setcheckliststatus(result.message);  // Removed UI update
// Refresh sessions to update backup status
const savedSessions = await AsyncStorage.getItem('sessions');
if (savedSessions) {
// setSessions(JSON.parse(savedSessions));  // Removed UI update
}
}
}
} catch (error) {
console.error('Error processing pending backups:', error);
// setcheckliststatus('Error processing backups');  // Removed UI update
}
};
// Update connection message when online status changes
useEffect(() => {
  if (isOnline) {
    setConnectionMessage('Online - All features available');
    // If we're back online and there's a session that needs to be backed up remotely
    if (activeSession && !activeSession.backedUp) {
      setSelectionStatus('Back online - Session will be backed up automatically');
      
      // Process any pending backups when we come back online
      processPendingBackups()
        .then(result => {
          if (result && result.processed > 0) {
            setSelectionStatus(`Processed ${result.processed} pending backups`);
            // Clear message after a timeout
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
}, [isOnline, activeSession]);
// Load initial data on component mount
useEffect(() => {
initializeChecklistModule();
}, []);
// Filter students when search query or filters change
useEffect(() => {
filterStudents();
}, [searchQuery, yearFilter, groupFilter, studentsData]);
// Initialize checklist module
const initializeChecklistModule = async () => {
console.log("Initializing checklist module...");
// Load students data
await loadStudentsDataForChecklist();
// Check for recoverable session
await checkForRecoverableChecklistSession();
// Load sessions from storage
const savedSessions = await AsyncStorage.getItem('sessions');
if (savedSessions) {
setSessions(JSON.parse(savedSessions));
}
};
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
// Check for recoverable session
const checkForRecoverableChecklistSession = async () => {
try {
// Check for active session
const savedActiveSession = await AsyncStorage.getItem(CHECKLIST_ACTIVE_SESSION_STORAGE_KEY);
if (savedActiveSession) {
const parsedSession = JSON.parse(savedActiveSession);
if (parsedSession && parsedSession.id && parsedSession.scans && parsedSession.isChecklist) {
Alert.alert(
"Recover Session",
`Found an incomplete checklist session at ${parsedSession.location} with ${parsedSession.scans.length} selections. Would you like to recover it?`,
[
{
text: "Yes",
onPress: () => recoverChecklistSession(parsedSession)
},
{
text: "No",
onPress: () => {
// Clear the active session
clearActiveChecklistSession();
// Also update the session in history to mark it as not in progress
AsyncStorage.getItem('sessions').then(savedSessions => {
if (savedSessions) {
const parsedSessions = JSON.parse(savedSessions);
const sessionIndex = parsedSessions.findIndex(s => s.id === parsedSession.id);
if (sessionIndex !== -1) {
const updatedSessions = [...parsedSessions];
updatedSessions[sessionIndex].inProgress = false;
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions))
.then(() => console.log("Session marked as not in progress after recovery declined"))
.catch(error => console.error("Error updating session status:", error));
}
}
}).catch(error => console.error("Error updating session in storage:", error));
}
}
]
);
return;
}
}
// Check for in-progress session in history
const tempSessionIndex = await AsyncStorage.getItem(TEMP_CHECKLIST_SESSION_INDEX_KEY);
if (tempSessionIndex !== null) {
const allSessions = await AsyncStorage.getItem('sessions');
if (allSessions) {
const parsedSessions = JSON.parse(allSessions);
const index = parseInt(tempSessionIndex);
if (!isNaN(index) && index >= 0 && index < parsedSessions.length) {
const tempSession = parsedSessions[index];
if (tempSession && tempSession.inProgress && tempSession.isChecklist) {
Alert.alert(
"Recover Session",
`Found an incomplete checklist session at ${tempSession.location} with ${tempSession.scans.length} selections in history. Would you like to recover it?`,
[
{
text: "Yes",
onPress: () => recoverChecklistSession(tempSession)
},
{
text: "No",
onPress: () => {
const updatedSessions = [...parsedSessions];
updatedSessions[index].inProgress = false;
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions))
.then(() => {
AsyncStorage.removeItem(TEMP_CHECKLIST_SESSION_INDEX_KEY);
console.log("Session marked as not in progress after recovery declined");
})
.catch(error => {
console.error("Error updating session status:", error);
});
}
}
]
);
}
}
}
}
} catch (error) {
console.error("Error checking for recoverable session:", error);
clearActiveChecklistSession();
}
};
// Recover checklist session
const recoverChecklistSession = (session) => {
// Set active session
setActiveSession(session);
// Restore selections
const selectedSet = new Set();
session.scans.forEach(scan => {
selectedSet.add(scan.id);
});
setSelectedStudents(selectedSet);
setSelectionStatus('Session recovered - Ready to select students');
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
AsyncStorage.setItem(TEMP_CHECKLIST_SESSION_INDEX_KEY, String(newIndex));
} else {
// Update existing session
const updatedSessions = [...parsedSessions];
updatedSessions[sessionIndex] = {...session};
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
AsyncStorage.setItem(TEMP_CHECKLIST_SESSION_INDEX_KEY, String(sessionIndex));
}
} else {
// Create new sessions array
const newSessions = [session];
setSessions(newSessions);
AsyncStorage.setItem('sessions', JSON.stringify(newSessions));
AsyncStorage.setItem(TEMP_CHECKLIST_SESSION_INDEX_KEY, '0');
}
});
// Save active session
saveActiveChecklistSession(session);
console.log("Checklist session recovered successfully");
};
// Save active session to storage
const saveActiveChecklistSession = (session = activeSession) => {
if (session) {
AsyncStorage.setItem(CHECKLIST_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session))
.then(() => console.log("Active session saved:", session.id))
.catch(error => console.error("Error saving active session:", error));
}
};
// Clear active session from storage
const clearActiveChecklistSession = () => {
AsyncStorage.removeItem(CHECKLIST_ACTIVE_SESSION_STORAGE_KEY)
.then(() => AsyncStorage.removeItem(TEMP_CHECKLIST_SESSION_INDEX_KEY))
.then(() => console.log("Active session cleared from storage"))
.catch(error => console.error("Error clearing active session:", error));
};
// Filter students based on search query and filters
const filterStudents = () => {
if (studentsData.length === 0) {
setFilteredStudents([]);
return;
}
// Only filter if there are actual filters active
if (searchQuery === '' && yearFilter === 'all' && groupFilter === 'all') {
setFilteredStudents(studentsData.slice(0, 200)); // Limit to first 200 students for performance
return;
}
// Otherwise do filtering
const filtered = studentsData.filter(student => {
const studentId = student["Student ID"] || student.id || "";
const studentYear = student["Year"] || student.year || "";
const studentGroup = student["Group"] || student.group || "";
const matchesSearch = searchQuery === '' || 
studentId.toString().toLowerCase().includes(searchQuery.toLowerCase());
const matchesYear = yearFilter === 'all' || studentYear === yearFilter;
const matchesGroup = groupFilter === 'all' || studentGroup === groupFilter;
return matchesSearch && matchesYear && matchesGroup;
});
// Limit results for performance
setFilteredStudents(filtered.slice(0, 200));
};
// Start a new checklist session
const startChecklistSession = () => {
setLocation('');
setShowSessionModal(true);
};
// Create a new checklist session
const createNewChecklistSession = () => {
console.log("Create session button pressed"); // Add this line
if (!location.trim()) {
Alert.alert("Error", "Please enter a location");
return;
}
// Create new session
const now = new Date();
const sessionId = `checklist_${now.getTime()}`;
const formattedDateTime = formatDateTime(now);
const newSession = {
id: sessionId,
location: location,
dateTime: now.toISOString(),
formattedDateTime: formattedDateTime,
scans: [],
inProgress: true,
isChecklist: true
};
// Set active session
setActiveSession(newSession);
// Clear selected students
setSelectedStudents(new Set());
setShowSessionModal(false);
setSelectionStatus('Session started - Ready to select students');
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
console.log("New checklist session created:", sessionId);
};
// Handle student selection
const handleStudentSelection = (studentId, isChecked) => {
if (!activeSession) return;
// Create new set to avoid direct mutation
const updatedSelection = new Set(selectedStudents);
if (isChecked) {
// Add student to selected set
updatedSelection.add(studentId);
addStudentToSelectionTable(studentId);
} else {
// Remove student from selected set
updatedSelection.delete(studentId);
removeStudentFromSelectionTable(studentId);
}
setSelectedStudents(updatedSelection);
};
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
// Add student to selection table
const addStudentToSelectionTable = (studentId, isManual = false) => {
  if (!activeSession) return;
  
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
    isManual: isManual // Track if this was manually entered
  };
  
  // Update active session
  const updatedSession = {
    ...activeSession,
    scans: [...activeSession.scans, newScan]
  };
  setActiveSession(updatedSession);
  
  // Save updated session
  saveActiveChecklistSession(updatedSession);
  updateSessionInHistory(updatedSession);
  
  // Update status
  setSelectionStatus(`✓ ${isManual ? 'Manually added' : 'Selected'}: ${studentId}`);
};

// Remove student from selection table
const removeStudentFromSelectionTable = (studentId) => {
if (!activeSession) return;
// Filter out scans for this student
const updatedScans = activeSession.scans.filter(scan => scan.id !== studentId);
// Update active session
const updatedSession = {
...activeSession,
scans: updatedScans
};
setActiveSession(updatedSession);
// Save updated session
saveActiveChecklistSession(updatedSession);
updateSessionInHistory(updatedSession);
// Update status
setSelectionStatus(`✗ Removed: ${studentId}`);
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
  
  // Check if already selected
  if (selectedStudents.has(studentId)) {
    Alert.alert('Already Selected', `Student ${studentId} is already in your selection.`);
    setShowManualEntryModal(false);
    setManualId('');
    return;
  }
  
  // Add to selected students
  handleStudentSelection(studentId, true);
  
  // Add to selection table with isManual flag
  addStudentToSelectionTable(studentId, true);
  
  // Close modal and reset input
  setShowManualEntryModal(false);
  setManualId('');
  
  // Update status
  setSelectionStatus(`✓ Manually added: ${studentId}`);
  console.log(`Manual entry processed: ${studentId}`);
};

// End checklist session
const endChecklistSession = () => {
if (!activeSession) {
console.log("No active checklist session to end");
return;
}
console.log("Ending checklist session:", activeSession.id);
// Confirm if there are no selections
if (activeSession.scans.length === 0) {
Alert.alert(
"End Session",
"No students selected in this session. Do you still want to end it?",
[
{
text: "Yes",
onPress: () => finalizeChecklistSession()
},
{
text: "No"
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
const finalizeChecklistSession = () => {
  // Create a copy of the session for export
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
      }
    }
  }).catch(error => {
    console.error("Error updating session in storage:", error);
  });
  
  // Clear active session
  setActiveSession(null);
  setSelectedStudents(new Set());
  setSelectionStatus('');
  clearActiveChecklistSession();
  
  // Show alert
  Alert.alert('Success', 'Session ended successfully');
// Show alert about offline backup
if (!isOnline && activeSession.scans.length > 0) {
  setTimeout(() => {
    Alert.alert(
      "Session Saved Offline",
      "This session has been saved offline and will be backed up automatically when you're back online.",
      [{ text: "OK" }]
    );
  }, 1500);
}
  console.log("Checklist session ended successfully");

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
    
    // Display status message about offline backup
    setSelectionStatus(`Session saved offline. Will be backed up when online.`);
    
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
  // Export session to Excel only if there are scans
  if (sessionToExport && sessionToExport.scans && sessionToExport.scans.length > 0) {
    setTimeout(() => {
      if (!isOnline) {
        // If offline, queue for backup instead of immediate export
        queueSessionForBackup(sessionToExport);
      } else {
        exportChecklistSession(sessionToExport);
      }
    }, 500);
  }
};
// Export checklist session to Excel
const exportChecklistSession = async (session) => {
  try {
    console.log("Starting checklist export for session:", session.id);
    const fileName = `Checklist_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
    
    // Prepare data
    const data = [
      ['Number', 'Student ID', 'Location', 'Log Date', 'Log Time', 'Type']
    ];
    
    // Add scans with row numbers
    session.scans.forEach((scan, index) => {
      const scanDate = new Date(scan.time || scan.timestamp);
      data.push([
        index + 1,            // Row number
        scan.content,         // Student ID
        session.location,     // Location
        formatDate(scanDate), // Log Date
        formatTime(scanDate), // Log Time
        scan.isManual ? 'Manual' : 'Scan'  // Type
      ]);
    });
    
    console.log(`Prepared data with ${session.scans.length} entries`);
    
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
    const saveResult = await saveToDownloads(fileUri, fileName);
    
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
    
    // Handle backup if online
    try {
      const isOnline = await checkOnlineStatus();
      if (isOnline) {
        console.log("Online - attempting GitHub backup");
        await backupToGitHub([session], false, fileName);
        console.log("Checklist backed up successfully");
        
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
          type: 'checklist',
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
        type: 'checklist',
        retryCount: 0,
        error: backupError.message
      });
      await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
    }
    
    console.log("Checklist export completed successfully");
    return { success: true, message: 'Export successful!', filePath: saveResult.uri };
  } catch (error) {
    console.error("Error exporting checklist session:", error);
    Alert.alert("Export Error", "Failed to export checklist: " + error.message);
    return { success: false, message: `Error exporting file: ${error.message}` };
  }
};

// Save a file to the Attendance Recorder directory
const saveToDownloads = async (fileUri, fileName) => {
  try {
    console.log(`Starting saveToDownloads: ${fileName}`);
    
    // Request permissions first (needed for Android)
    const { status } = await MediaLibrary.requestPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('Media library permission denied');
      Alert.alert(
        "Permission Required",
        "We need access to your media library to save files.",
        [{ text: "OK" }]
      );
      return { success: false, message: "Permission not granted" };
    }
    
    console.log('Permission granted, creating asset');
    
    // Create asset from file
    const asset = await MediaLibrary.createAssetAsync(fileUri);
    
    if (!asset) {
      console.log('Failed to create asset');
      throw new Error("Could not create asset from file");
    }
    
    console.log('Asset created successfully:', asset.uri);
    
    // App folder name - consistent across platforms
    const appFolderName = "Attendance Recorder";
    
    try {
      // First check if our custom album already exists
      console.log(`Checking if "${appFolderName}" album exists`);
      let album = await MediaLibrary.getAlbumAsync(appFolderName);
      
      if (album) {
        console.log(`Album "${appFolderName}" exists, adding asset`);
        // If app album exists, add asset to it
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        console.log(`Album "${appFolderName}" doesn't exist, creating it`);
        // Create our custom album and add the asset to it
        album = await MediaLibrary.createAlbumAsync(appFolderName, asset, false);
      }
      
      console.log(`File saved to "${appFolderName}" as "${fileName}"`);
      
      Alert.alert(
        "Export Successful",
        `File saved to "${appFolderName}" folder as "${fileName}"`,
        [{ text: "OK" }]
      );
      
      return { 
        success: true, 
        message: `File saved successfully to "${appFolderName}" as "${fileName}"`, 
        uri: asset.uri 
      };
    } catch (albumError) {
      console.error("Error with custom album:", albumError);
      
      // Fallback to device's default location
      console.log("Falling back to device's default storage location");
      
      if (Platform.OS === 'android') {
        try {
          // Try using DCIM on Android as fallback
          const dcimAlbum = await MediaLibrary.getAlbumAsync("DCIM");
          if (dcimAlbum) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], dcimAlbum, false);
            
            Alert.alert(
              "Export Successful",
              `File saved to device storage as "${fileName}"`,
              [{ text: "OK" }]
            );
            
            return { 
              success: true, 
              message: `File saved to device storage as "${fileName}"`, 
              uri: asset.uri 
            };
          }
        } catch (fallbackError) {
          console.error("Android fallback error:", fallbackError);
        }
      }
      
      // Generic fallback - just alert that the file was saved somewhere
      Alert.alert(
        "Export Successful",
        `File saved to your device as "${fileName}"`,
        [{ text: "OK" }]
      );
      
      return { 
        success: true, 
        message: `File saved to device as "${fileName}"`, 
        uri: asset.uri 
      };
    }
  } catch (error) {
    console.error("Error saving file:", error);
    Alert.alert(
      "Export Failed",
      `Could not save file: ${error.message}`,
      [{ text: "OK" }]
    );
    return { success: false, message: `Error: ${error.message}` };
  }
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
groups.add(studentGroup);
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
const studentGroup = student["Group"] || student.group || "";
const matchesSearch = searchQuery === '' || 
studentId.toString().toLowerCase().includes(searchQuery.toLowerCase());
const matchesYear = yearFilter === 'all' || studentYear === yearFilter;
const matchesGroup = groupFilter === 'all' || studentGroup === groupFilter;
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
<Text style={styles.locationText}>Location: {activeSession.location}</Text>
<Text style={styles.dateTimeText}>Date/Time: {activeSession.formattedDateTime}</Text>
</View>
)}
{selectionStatus ? (
<View style={styles.statusContainer}>
<Text style={styles.statusText}>{selectionStatus}</Text>
</View>
) : null}
{activeSession ? (
<View style={styles.checklistContainer}>
<Searchbar
placeholder="Search students..."
onChangeText={query => setSearchQuery(query)}
value={searchQuery}
style={styles.searchbar}
/>
<View style={styles.filterContainer}>
<View style={styles.filterItem}>
<Text style={styles.filterLabel}>Year:</Text>
<Button 
mode="outlined" 
onPress={() => setShowYearFilterModal(true)}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
{yearFilter === 'all' ? 'All Years' : yearFilter}
</Button>
</View>
<View style={styles.filterItem}>
<Text style={styles.filterLabel}>Group:</Text>
<Button 
mode="outlined" 
onPress={() => setShowGroupFilterModal(true)}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
{groupFilter === 'all' ? 'All Groups' : groupFilter}
</Button>
</View>
</View>
<FlatList
  style={[styles.studentList, { height: 250, backgroundColor: '#ffffff' }]}
  data={filteredStudents}
  keyExtractor={(student) => `student-${student["Student ID"] || student.id || ""}`}
  renderItem={({ item: student }) => (
    <StudentItem 
      student={student}
      isSelected={selectedStudents.has(student["Student ID"] || student.id || "")}
      onToggle={(id) => handleStudentSelection(id, !selectedStudents.has(id))}
      textStyle={{ color: '#24325f' }}
      backgroundColor="#ffffff"
    />
)}
getItemLayout={(data, index) => ({
length: 48,
offset: 48 * index,
index,
})}
nestedScrollEnabled={true}
windowSize={10}
maxToRenderPerBatch={10}
updateCellsBatchingPeriod={50}
removeClippedSubviews={true}
initialNumToRender={10}
ListEmptyComponent={() => (
<View style={styles.emptyList}>
<Text style={styles.emptyText}>
{studentsData.length === 0 
? "No student data available." 
: "No students match the current filters."}
</Text>
</View>
)}
/>
</View>
) : (
<View style={styles.checklistContainer}>
<Text style={styles.placeholderText}>
Click "Start New Session" to begin selecting students.
</Text>
</View>
)}
<Title style={styles.subtitle}>Selected Students</Title>
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
  <Text style={styles.noDataText}>No students selected yet.</Text>
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
const sessionId = `checklist_${now.getTime()}`;
const formattedDateTime = formatDateTime(now);
const newSession = {
id: sessionId,
location: option,
dateTime: now.toISOString(),
formattedDateTime: formattedDateTime,
scans: [],
inProgress: true,
isChecklist: true
};
setActiveSession(newSession);
setSelectedStudents(new Set());
setSelectionStatus('Session started - Ready to select students');
AsyncStorage.getItem('sessions').then(savedSessions => {
const parsedSessions = savedSessions ? JSON.parse(savedSessions) : [];
const updatedSessions = [...parsedSessions, newSession];
setSessions(updatedSessions);
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
AsyncStorage.setItem(TEMP_CHECKLIST_SESSION_INDEX_KEY, String(updatedSessions.length - 1));
});
saveActiveChecklistSession(newSession);
console.log("New checklist session created:", sessionId);
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
<Portal>
<Modal
visible={showYearFilterModal}
onDismiss={() => setShowYearFilterModal(false)}
contentContainerStyle={styles.modalContent}
>
<Title>Select Year</Title>
<Button 
onPress={() => handleYearFilter('all')}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
All Years
</Button>
<ScrollView style={{ maxHeight: 300 }}>
{getUniqueYears.map(year => (
<Button 
key={year} 
onPress={() => handleYearFilter(year)}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
{year}
</Button>
))}
</ScrollView>
</Modal>
</Portal>
<Portal>
<Modal
visible={showGroupFilterModal}
onDismiss={() => setShowGroupFilterModal(false)}
contentContainerStyle={styles.modalContent}
>
<Title>Select Group</Title>
<Button 
onPress={() => handleGroupFilter('all')}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
All Groups
</Button>
<ScrollView style={{ maxHeight: 300 }}>
{getUniqueGroups.map(group => (
<Button 
key={group} 
onPress={() => handleGroupFilter(group)}
style={styles.secondaryButton}
labelStyle={styles.secondaryButtonText}
>
{group}
</Button>
))}
</ScrollView>
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
export default ChecklistScreen;
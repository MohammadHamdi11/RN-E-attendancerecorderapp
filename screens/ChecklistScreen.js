import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, ScrollView, Alert } from 'react-native';
import { Text, Button, Surface, Title, Checkbox, Modal, Portal, Provider, Searchbar, List, Divider, DataTable, TextInput } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import * as BackupService from '../services/backup';
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
const [scanStatus, setScanStatus] = useState('');
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
// Add this useEffect under the other useEffect for filtering
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
// Update connection message when online status changes
useEffect(() => {
if (isOnline) {
setConnectionMessage('Online - All features available');
// If we're back online and there's a session that needs to be saved remotely
if (activeSession && !activeSession.backedUp) {
setScanStatus('Back online - Session will be backed up automatically');
}
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
setSelectionStatus('Loading student data...');
// Check network status using NetInfo
const netState = await NetInfo.fetch();
const isConnected = netState.isConnected && netState.isInternetReachable;
if (isConnected) {
console.log("Device is connected to the internet");
setScanStatus("Online - Checking for updated student data");
try {
// Try to get fresh data from GitHub
const data = await loadStudentsData(false); // Use false to allow caching
if (data && data.length > 0) {
console.log(`Loaded student data with ${data.length} records`);
setScanStatus(`Loaded ${data.length} student records`);
// Transform the data to ensure consistent field names
const transformedData = formatStudentData(data);
setStudentsData(transformedData);
return;
}
} catch (loadError) {
console.error("Error loading fresh student data:", loadError);
setScanStatus("Error loading data - Using cached data");
}
} else {
console.log("Device is offline");
setScanStatus("Offline - Using cached student data");
}
// If online loading failed or we're offline, try to use cached data
const cachedData = await AsyncStorage.getItem('cachedStudentsData');
if (cachedData) {
try {
const parsedData = JSON.parse(cachedData);
if (parsedData && parsedData.length > 0) {
console.log(`Using cached student data with ${parsedData.length} records`);
setScanStatus(`Using cached data (${parsedData.length} records)`);
// Transform cached data too
const transformedData = formatStudentData(parsedData);
setStudentsData(transformedData);
return;
}
} catch (parseError) {
console.error("Error parsing cached data:", parseError);
}
}
// If all else fails, show error
console.warn("No student data available - online or cached");
setStudentsData([]);
setScanStatus("No student data available");
// Show alert to user about missing data
Alert.alert(
"No Student Data",
"Unable to load student data. Please connect to the internet and try again.",
[{ text: "OK" }]
);
} catch (error) {
console.error("Critical error in loadStudentsDataForChecklist:", error);
setStudentsData([]);
setScanStatus("Error loading student data");
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
onPress: () => clearActiveChecklistSession()
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
AsyncStorage.setItem('sessions', JSON.stringify(updatedSessions));
AsyncStorage.removeItem(TEMP_CHECKLIST_SESSION_INDEX_KEY);
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
setScanStatus('Syncing student data with server...');
try {
const result = await syncStudentsDataWithGitHub();
if (result.success) {
setScanStatus(`Sync successful! Loaded ${result.count} students.`);
await loadStudentsDataForChecklist();
Alert.alert(
"Sync Complete",
`Successfully synchronized ${result.count} student records from the server.`
);
} else {
setScanStatus('Sync failed. Please try again later.');
Alert.alert(
"Sync Failed",
`Unable to sync with server: ${result.error}`
);
}
} catch (error) {
console.error('Error during manual sync:', error);
setScanStatus('Sync error. Please check your connection.');
Alert.alert(
"Sync Error",
"An unexpected error occurred during synchronization. Please check your internet connection and try again."
);
}
};
// Add student to selection table
const addStudentToSelectionTable = (studentId) => {
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
time: now
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
setSelectionStatus(`✓ Selected: ${studentId}`);
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
console.log("Checklist session ended successfully");
// Export session to Excel only if there are scans
if (sessionToExport && sessionToExport.scans && sessionToExport.scans.length > 0) {
setTimeout(() => {
exportChecklistSession(sessionToExport)
.then(success => {
if (!success && !isOnline) {
// If export failed and offline, queue for backup
queueSessionForBackup(sessionToExport);
}
})
.catch(error => {
console.error("Error during export:", error);
if (!isOnline) {
queueSessionForBackup(sessionToExport);
}
});
}, 500);
}
};
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
const pendingBackups = await AsyncStorage.getItem('pendingBackups') || '[]';
const backupsArray = JSON.parse(pendingBackups);
// Add this session to pending backups
backupsArray.push({
session: session,
fileName: `Checklist_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`,
timestamp: new Date().toISOString(),
type: 'checklist',
retryCount: 0,
onSuccess: async () => {
// This will run when this pending backup succeeds
await BackupService.getLastBackupTime();      }
});
await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
console.log(`Session ${session.id} queued for backup when online`);
Alert.alert(
'Offline Mode',
'Your session has been saved locally and will be backed up automatically when an internet connection is available.'
);
} catch (error) {
console.error('Error queueing session for backup:', error);
}
};
// Export checklist session to Excel
const exportChecklistSession = async (session) => {
try {
const fileName = `Checklist_${session.location.replace(/[^a-z0-9]/gi, '_')}_${formatDateTimeForFile(new Date(session.dateTime))}.xlsx`;
// Prepare data
const data = [
['Number', 'Student ID', 'Location', 'Log Date', 'Log Time']
];
// Add scans with row numbers
session.scans.forEach((scan, index) => {
const scanDate = new Date(scan.time || scan.timestamp);
data.push([
index + 1,            // Row number
scan.content,         // Student ID
session.location,     // Location
formatDate(scanDate), // Log Date
formatTime(scanDate)  // Log Time
]);
});
// Create workbook
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Checklist");
// Convert to binary
const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
// Save file locally (works offline)
const filePath = `${FileSystem.documentDirectory}${fileName}`;
await FileSystem.writeAsStringAsync(filePath, wbout, {
encoding: FileSystem.EncodingType.Base64
});
// Show success message
Alert.alert(
"Export Successful",
`Checklist data saved as ${fileName}. ${!isOnline ? "The file will be backed up when you're back online." : ""}`
);
console.log("Checklist Excel file saved:", fileName);
// Add backup logic for when online
if (isOnline) {
// Try to backup immediately if online
try {
// Import backupToGitHub from services/backup
const { backupToGitHub } = require('../services/backup');
await backupToGitHub([session], false, fileName);
console.log("Checklist backed up successfully");
// Update backup status in UI and storage
await updateBackupStatus(session.id, true);
// Add this code to update the last backup time
await BackupService.getLastBackupTime();  } catch (backupError) {
console.error("Error backing up checklist:", backupError);
// Queue for later retry
const pendingBackups = await AsyncStorage.getItem('pendingBackups') || '[]';
const backupsArray = JSON.parse(pendingBackups);
backupsArray.push({
session: session,
fileName: fileName,
timestamp: new Date().toISOString(),
type: 'checklist',
retryCount: 1,
error: backupError.message
});
await AsyncStorage.setItem('pendingBackups', JSON.stringify(backupsArray));
}
}
return true;
} catch (error) {
console.error("Error exporting checklist session:", error);
Alert.alert("Export Error", "Failed to export checklist: " + error.message);
return false;
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
<View style={styles.container}>
{/* Connection status indicator */}
{connectionMessage && (
<View style={[styles.connectionStatus, { backgroundColor: isOnline ? '#e7f3e8' : '#fff3cd' }]}>
<Text style={{ color: isOnline ? '#28a745' : '#856404' }}>{connectionMessage}</Text>
</View>
)}
<Surface style={styles.card}>
<Title style={styles.title}>Student Selector</Title>
{/* Button Group */}
<View style={styles.buttonGroup}>
<Button 
mode="contained" 
style={styles.button}
onPress={() => activeSession ? endChecklistSession() : startChecklistSession()}
>
{activeSession ? 'End Session' : 'Start New Session'}
</Button>
{!activeSession && (
<Button 
mode="outlined" 
style={styles.syncButton}
onPress={handleSyncData}
disabled={!isOnline}
>
Sync Data
</Button>
)}
{activeSession && (
<Button 
mode="outlined" 
style={styles.manualButton}
onPress={() => setShowManualEntryModal(true)}
>
Manual Entry
</Button>
)}
</View>
{/* Session Info */}
{activeSession && (
<View style={styles.sessionInfo}>
<Text style={styles.locationText}>Location: {activeSession.location}</Text>
<Text style={styles.dateTimeText}>Date/Time: {activeSession.formattedDateTime}</Text>
</View>
)}
{/* Status Message */}
{selectionStatus ? (
<View style={styles.statusContainer}>
<Text style={styles.statusText}>{selectionStatus}</Text>
</View>
) : null}
{/* Checklist Container */}
{activeSession ? (
<View style={styles.checklistContainer}>
{/* Search Bar */}
<Searchbar
placeholder="Search students..."
onChangeText={query => setSearchQuery(query)}
value={searchQuery}
style={styles.searchbar}
/>
{/* Filters */}
<View style={styles.filterContainer}>
<View style={styles.filterItem}>
<Text style={styles.filterLabel}>Year:</Text>
<Button 
mode="outlined" 
onPress={() => setShowYearFilterModal(true)}
style={styles.filterButton}
>
{yearFilter === 'all' ? 'All Years' : yearFilter}
</Button>
</View>
<View style={styles.filterItem}>
<Text style={styles.filterLabel}>Group:</Text>
<Button 
mode="outlined" 
onPress={() => setShowGroupFilterModal(true)}
style={styles.filterButton}
>
{groupFilter === 'all' ? 'All Groups' : groupFilter}
</Button>
</View>
</View>
{/* Student Checklist */}
<FlatList
style={styles.studentList}
data={filteredStudents}
keyExtractor={(student) => `student-${student["Student ID"] || student.id || ""}`}
renderItem={({ item: student }) => (
<StudentItem 
student={student}
isSelected={selectedStudents.has(student["Student ID"] || student.id || "")}
onToggle={(id) => handleStudentSelection(id, !selectedStudents.has(id))}
/>
)}
getItemLayout={(data, index) => ({
length: 48, // approximate height of each item
offset: 48 * index,
index,
})}
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
{/* Selected Students Section */}
<Title style={styles.subtitle}>Selected Students</Title>
{activeSession && activeSession.scans.length > 0 ? (
<View style={styles.tableContainer}>
<FlatList
data={activeSession.scans}
keyExtractor={(item, index) => `scan-${index}`}
renderItem={({ item, index }) => <SelectedStudentItem item={item} index={index} />}
ItemSeparatorComponent={() => <Divider />}
nestedScrollEnabled={true}
getItemLayout={(data, index) => ({
length: 40, // approximate height of each item plus separator
offset: 40 * index,
index,
})}
windowSize={5}
maxToRenderPerBatch={10}
updateCellsBatchingPeriod={50}
removeClippedSubviews={true}
initialNumToRender={10}
/>
</View>
) : (
<Text style={styles.noDataText}>No students selected yet.</Text>
)}
</Surface>
{/* Session Modal */}
<Portal>
<Modal
visible={showSessionModal}
onDismiss={() => setShowSessionModal(false)}
contentContainerStyle={styles.modalContent}
>
<Title>Start New Session</Title>
<Text style={styles.dropdownLabel}>Location:</Text>
<View style={styles.dropdownContainer}>
<ScrollView style={styles.locationDropdown} nestedScrollEnabled={true}>
{locationOptions.map(option => (
<List.Item
key={option}
title={option}
onPress={() => {
setLocation(option);
setShowSessionModal(false);
// After selecting location, create the session
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
// Set active session
setActiveSession(newSession);
// Clear selected students
setSelectedStudents(new Set());
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
}
}, 100);
}}
style={styles.locationOption}
/>
))}
</ScrollView>
</View>
<View style={styles.modalButtons}>
<Button 
mode="text"
onPress={() => setShowSessionModal(false)}
style={styles.modalButton}
>
Cancel
</Button>
<Button 
mode="contained" 
onPress={createNewChecklistSession}
disabled={!location.trim()}
style={styles.modalButton}
>
Start
</Button>
</View>
</Modal>
</Portal>
{/* Manual Entry Modal */}
<Portal>
<Modal
visible={showManualEntryModal}
onDismiss={() => setShowManualEntryModal(false)}
contentContainerStyle={styles.modalContent}
>
<Title>Manual Entry</Title>
<TextInput
label="Student ID"
value={manualId}
onChangeText={setManualId}
style={styles.input}
autoFocus
onSubmitEditing={processManualEntry}
/>
<View style={styles.modalButtons}>
<Button onPress={() => setShowManualEntryModal(false)}>Cancel</Button>
<Button 
mode="contained" 
onPress={processManualEntry}
disabled={!manualId.trim()}
>
Add
</Button>
</View>
</Modal>
</Portal>
{/* Year Filter Modal */}
<Portal>
<Modal
visible={showYearFilterModal}
onDismiss={() => setShowYearFilterModal(false)}
contentContainerStyle={styles.modalContent}
>
<Title>Select Year</Title>
<Button onPress={() => handleYearFilter('all')}>All Years</Button>
<ScrollView style={{ maxHeight: 300 }}>
{getUniqueYears.map(year => (
<Button key={year} onPress={() => handleYearFilter(year)}>{year}</Button>
))}
</ScrollView>
</Modal>
</Portal>
{/* Group Filter Modal */}
<Portal>
<Modal
visible={showGroupFilterModal}
onDismiss={() => setShowGroupFilterModal(false)}
contentContainerStyle={styles.modalContent}
>
<Title>Select Group</Title>
<Button onPress={() => handleGroupFilter('all')}>All Groups</Button>
<ScrollView style={{ maxHeight: 300 }}>
{getUniqueGroups.map(group => (
<Button key={group} onPress={() => handleGroupFilter(group)}>{group}</Button>
))}
</ScrollView>
</Modal>
</Portal>
</View>
</Provider>
);
};  
const styles = StyleSheet.create({
container: {
flex: 1,
padding: 16,
backgroundColor: '#f9f9f9',
},
card: {
padding: 16,
borderRadius: 8,
elevation: 4,
flex: 1,
},
title: {
fontSize: 20,
marginBottom: 16,
},
subtitle: {
fontSize: 16,
marginTop: 16,
marginBottom: 8,
},
buttonGroup: {
flexDirection: 'row',
justifyContent: 'space-between',
marginBottom: 16,
},
button: {
flex: 1,
marginHorizontal: 4,
backgroundColor: '#24325f',
},
manualButton: {
flex: 0.5,
marginHorizontal: 4,
borderColor: '#24325f',
},
sessionInfo: {
backgroundColor: '#eef',
padding: 8,
borderRadius: 4,
marginBottom: 8,
},
locationText: {
fontWeight: 'bold',
},
dateTimeText: {
color: '#666',
},
// Changed from scannerContainer to checklistContainer as per the styles snippet
checklistContainer: {
height: 300,
backgroundColor: '#f0f0f0',
borderRadius: 8,
justifyContent: 'center',
padding: 16,
},
connectionStatus: {
padding: 8,
borderRadius: 4,
marginBottom: 8,
alignItems: 'center',
},
placeholderText: {
textAlign: 'center',
color: '#666',
},
noDataText: {
textAlign: 'center',
color: '#666',
fontStyle: 'italic',
marginTop: 8,
},
tableContainer: {
maxHeight: 200,
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
},
modalContent: {
backgroundColor: 'white',
padding: 20,
margin: 20,
borderRadius: 8,
},
input: {
marginVertical: 10,
},
modalButtons: {
flexDirection: 'row',
justifyContent: 'flex-end',
marginTop: 16,
},
errorText: {
color: 'red',
fontSize: 18,
marginBottom: 10,
},
searchbar: {
marginBottom: 8,
},
filterContainer: {
flexDirection: 'row',
marginBottom: 8,
},
filterItem: {
flex: 1,
flexDirection: 'row',
alignItems: 'center',
marginRight: 8,
},
filterLabel: {
marginRight: 8,
fontWeight: 'bold',
},
filterButton: {
flex: 1,
},
studentList: {
flex: 1,
backgroundColor: 'white',
borderRadius: 4,
marginBottom: 8,
},
studentItem: {
borderBottomWidth: 1,
borderBottomColor: '#eee',
},
emptyList: {
flex: 1,
justifyContent: 'center',
alignItems: 'center',
padding: 20,
},
emptyText: {
textAlign: 'center',
color: '#666',
},
customEntryButton: {
marginTop: 8,
backgroundColor: '#24325f',
},
selectionList: {
maxHeight: 200,
borderWidth: 1,
borderColor: '#ddd',
borderRadius: 4,
},
selectionItem: {
flexDirection: 'row',
padding: 8,
alignItems: 'center',
},
modalButton: {
marginHorizontal: 8,
minWidth: 80,
},
// Add these new styles to the styles object
dropdownLabel: {
fontSize: 16,
fontWeight: 'bold',
marginBottom: 8,
},
dropdownContainer: {
borderWidth: 1,
borderColor: '#ddd',
borderRadius: 4,
marginBottom: 16,
},
locationDropdown: {
maxHeight: 250,
},
locationOption: {
borderBottomWidth: 1,
borderBottomColor: '#eee',
},
selectionNumber: {
width: 30,
fontWeight: 'bold',
},
selectionId: {
flex: 1,
},
selectionTime: {
width: 80,
textAlign: 'right',
color: '#666',
},
});
export default ChecklistScreen;
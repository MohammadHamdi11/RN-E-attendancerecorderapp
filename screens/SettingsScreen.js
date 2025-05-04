import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Platform } from 'react-native';
import { 
  Text, 
  Button, 
  Card, 
  Title, 
  Divider, 
  List, 
  Portal, 
  Dialog, 
  TextInput,
  ActivityIndicator,
  Checkbox,
  IconButton
} from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import { fetchUsers, addUser, removeUsers } from '../services/updateusers';
import { fetchAdmins, addAdmin, removeAdmins } from '../services/updateadmins';
import { fetchStudents, addStudent, removeStudents } from '../services/updatestudentsdata';
import { getLastBackupTime, getAutoBackupStatus, toggleAutoBackup } from '../services/backup';
import { getBackupFiles, clearBackups } from '../services/managebackups';
import { parseExcelFile, mapExcelColumnsToFields, processExcelData, mergeStudentsData } from '../services/excelhandler';
const SettingsScreen = ({ navigation }) => {
  // State for users and admins
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // State for add dialogs
  const [addUserDialogVisible, setAddUserDialogVisible] = useState(false);
  const [addAdminDialogVisible, setAddAdminDialogVisible] = useState(false);
  // State for remove dialogs
  const [removeUserDialogVisible, setRemoveUserDialogVisible] = useState(false);
  const [removeAdminDialogVisible, setRemoveAdminDialogVisible] = useState(false);
  // State for view dialogs
  const [viewUserDialogVisible, setViewUserDialogVisible] = useState(false);
  const [viewAdminDialogVisible, setViewAdminDialogVisible] = useState(false);
  // State for form inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // State for selection in remove dialogs
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedAdmins, setSelectedAdmins] = useState([]);
  // State for students data
  const [students, setStudents] = useState([]);
  const [addStudentDialogVisible, setAddStudentDialogVisible] = useState(false);
  const [removeStudentDialogVisible, setRemoveStudentDialogVisible] = useState(false);
  const [viewStudentDialogVisible, setViewStudentDialogVisible] = useState(false);
  const [year, setYear] = useState('');
  const [group, setGroup] = useState('');
  const [id, setId] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const studentsPerPage = 50;
  const [loadingText, setLoadingText] = useState('Loading data...');
  // State for backup management
  const [lastBackupTime, setLastBackupTime] = useState('Never');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [backupFiles, setBackupFiles] = useState([]);
  const [backupFilesDialogVisible, setBackupFilesDialogVisible] = useState(false);
  const [clearBackupsConfirmDialogVisible, setClearBackupsConfirmDialogVisible] = useState(false);
  const [clearingBackups, setClearingBackups] = useState(false);
  // new states
const [usersLoading, setUsersLoading] = useState(true);
const [adminsLoading, setAdminsLoading] = useState(true);
const [studentsLoading, setStudentsLoading] = useState(true);
const [backupsLoading, setBackupsLoading] = useState(true);
const [usersError, setUsersError] = useState(null);
const [adminsError, setAdminsError] = useState(null);
const [studentsError, setStudentsError] = useState(null);
const [backupsError, setBackupsError] = useState(null);
const [excelUploadDialogVisible, setExcelUploadDialogVisible] = useState(false);
const [excelMappingDialogVisible, setExcelMappingDialogVisible] = useState(false);
const [excelHeaders, setExcelHeaders] = useState([]);
const [excelRows, setExcelRows] = useState([]);
const [excelFileName, setExcelFileName] = useState('');
const [columnMappings, setColumnMappings] = useState({ year: null, group: null, id: null });
const [uploadingExcel, setUploadingExcel] = useState(false);
const [previewData, setPreviewData] = useState([]);
const [excelPreviewDialogVisible, setExcelPreviewDialogVisible] = useState(false);
const [entries, setEntries] = useState([]);
const [currentEntry, setCurrentEntry] = useState({ name: '', email: '', password: '' });
const [currentStudentEntry, setCurrentStudentEntry] = useState({ year: '', group: '', id: '' });
const [entriesType, setEntriesType] = useState('');  // 'users', 'admins', or 'students'

const ColumnSelector = ({ label, value, options, onSelect }) => {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.mappingItem}>
      <Text style={[styles.mappingLabel, { color: '#24325f' }]}>{label}:</Text>
      <View style={styles.selectorContainer}>
        <Button 
          mode="outlined" 
          onPress={() => setVisible(true)}
          style={styles.selectorButton}
          contentStyle={styles.selectorContent}
        >
          {value !== null && value !== undefined ? options[value] : "Select column..."}
        </Button>
        
        <Portal>
          <Dialog 
            visible={visible} 
            onDismiss={() => setVisible(false)}
            style={styles.selectorDialog}
          >
            <Dialog.Title>Select {label} Column</Dialog.Title>
            <Dialog.Content>
              <ScrollView style={styles.selectorList}>
                {options.map((option, index) => (
                  <List.Item
                    key={index}
                    title={option}
                    onPress={() => {
                      onSelect(index);
                      setVisible(false);
                    }}
                    titleStyle={{ color: '#24325f' }}
                    left={props => (
                      <List.Icon 
                        {...props} 
                        icon={value === index ? "check-circle" : "circle-outline"} 
                        color={value === index ? "#24325f" : "#ccc"} 
                      />
                    )}
                  />
                ))}
              </ScrollView>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setVisible(false)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </View>
  );
};
  // Set navigation options to include refresh button
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="refresh"
          color="#ffffff"
          iconColor="#ffffff"
          size={24}
          onPress={handleRefresh}
          style={{ marginRight: 10 }}
        />
      ),
    });
  }, [navigation]);
  // Fetch users, admins, and backup info on component mount
  useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
  loadUsersData();
  loadAdminsData();
  loadStudentsData();
  loadBackupsData();
    setLoading(true);
    setError(null);
    try {
      setLoadingText('Fetching users...');
      const { users: fetchedUsers } = await fetchUsers();
      setUsers(fetchedUsers);
      setLoadingText('Fetching admins...');
      const { admins: fetchedAdmins } = await fetchAdmins();
      setAdmins(fetchedAdmins);
      setLoadingText('Fetching students...');
      const { students: fetchedStudents } = await fetchStudents();
      // Deal with API inconsistency - normalize keys
      const normalizedStudents = fetchedStudents.map(student => ({
        year: student.Year || student.year,
        group: student.Group || student.group,
        id: student["Student ID"] || student.id
      }));
      setStudents(normalizedStudents);
      setFilteredStudents(normalizedStudents.slice(0, 100)); // Initially show only first 100
      // Fetch backup information
      setLoadingText('Fetching backup information...');
      const lastBackup = await getLastBackupTime();
      setLastBackupTime(lastBackup);
      const autoBackup = await getAutoBackupStatus();
      setAutoBackupEnabled(autoBackup);
      // Fetch backup files list
      const { success, files } = await getBackupFiles();
      if (success) {
        setBackupFiles(files);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try using the refresh button in the header or try again later.');
    } finally {
      setLoadingText('Loading data...');
      setLoading(false);
    }
  };
// Add these functions after the loadData function
const loadUsersData = async () => {
  setUsersLoading(true);
  setUsersError(null);
  try {
    const { users: fetchedUsers } = await fetchUsers();
    setUsers(fetchedUsers);
  } catch (err) {
    console.error('Error loading users data:', err);
    setUsersError('Failed to load users data');
  } finally {
    setUsersLoading(false);
  }
};
const loadAdminsData = async () => {
  setAdminsLoading(true);
  setAdminsError(null);
  try {
    const { admins: fetchedAdmins } = await fetchAdmins();
    setAdmins(fetchedAdmins);
  } catch (err) {
    console.error('Error loading admins data:', err);
    setAdminsError('Failed to load admins data');
  } finally {
    setAdminsLoading(false);
  }
};

const normalizeStudentData = (fetchedStudents) => {
  return fetchedStudents.map(student => {
    // Deal with API inconsistency - normalize keys
    const normalizedStudent = {
      year: student.Year || student.year,
      group: student.Group || student.group,
      id: student["Student ID"] || student.id
    };
    
    // Store original values too
    if (student.Year) normalizedStudent.Year = student.Year;
    if (student.Group) normalizedStudent.Group = student.Group;
    if (student["Student ID"]) normalizedStudent["Student ID"] = student["Student ID"];
    
    return normalizedStudent;
  });
};

const loadStudentsData = async () => {
  setStudentsLoading(true);
  setStudentsError(null);
  try {
    const { students: fetchedStudents } = await fetchStudents();
    // Use the normalization helper
    const normalizedStudents = normalizeStudentData(fetchedStudents);
    setStudents(normalizedStudents);
    setFilteredStudents(normalizedStudents.slice(0, 100)); // Initially show only first 100
  } catch (err) {
    console.error('Error loading students data:', err);
    setStudentsError('Failed to load students data');
  } finally {
    setStudentsLoading(false);
  }
};

const loadBackupsData = async () => {
  setBackupsLoading(true);
  setBackupsError(null);
  try {
    // Fetch backup information
    const lastBackup = await getLastBackupTime();
    setLastBackupTime(lastBackup);
    const autoBackup = await getAutoBackupStatus();
    setAutoBackupEnabled(autoBackup);
    // Fetch backup files list
    const { success, files } = await getBackupFiles();
    if (success) {
      setBackupFiles(files);
    }
  } catch (err) {
    console.error('Error loading backup data:', err);
    setBackupsError('Failed to load backup data');
  } finally {
    setBackupsLoading(false);
  }
};
useEffect(() => {
  if (students.length > 0 && studentSearchQuery) {
    const query = studentSearchQuery.toLowerCase();
    const filtered = students.filter(student => 
      (student.year && student.year.toLowerCase().includes(query)) ||
      (student.group && student.group.toLowerCase().includes(query)) ||
      (student.id && student.id.toLowerCase().includes(query))
    );
    setFilteredStudents(filtered);
  } else {
    // If no search query, show only first 100 students
    setFilteredStudents(students.slice(0, 100));
  }
}, [students, studentSearchQuery]);

  // Handle refresh button press
const handleRefresh = async () => {
  setRefreshing(true);
  try {
    await Promise.all([
      loadUsersData(),
      loadAdminsData(),
      loadStudentsData(),
      loadBackupsData()
    ]);
    Alert.alert('Success', 'Data refreshed successfully');
  } catch (err) {
    console.error('Error refreshing data:', err);
    Alert.alert('Error', 'Some data failed to refresh. Check each section for details.');
  } finally {
    setRefreshing(false);
  }
};
  // Show add user dialog
const showAddUserDialog = () => {
  setEntries([]);
  setCurrentEntry({ name: '', email: '', password: '' });
  setEntriesType('users');
  setAddUserDialogVisible(true);
};
  // Show add admin dialog
const showAddAdminDialog = () => {
  setEntries([]);
  setCurrentEntry({ name: '', email: '', password: '' });
  setEntriesType('admins');
  setAddAdminDialogVisible(true);
};
  // Show remove user dialog
  const showRemoveUserDialog = () => {
    setSelectedUsers([]);
    setRemoveUserDialogVisible(true);
  };
  // Show remove admin dialog
  const showRemoveAdminDialog = () => {
    setSelectedAdmins([]);
    setRemoveAdminDialogVisible(true);
  };
  // Show view user dialog
  const showViewUserDialog = () => {
    setViewUserDialogVisible(true);
  };
  // Show view admin dialog
  const showViewAdminDialog = () => {
    setViewAdminDialogVisible(true);
  };
  // students dialog control functions:
const showAddStudentDialog = () => {
  setEntries([]);
  setCurrentStudentEntry({ year: '', group: '', id: '' });
  setEntriesType('students');
  setAddStudentDialogVisible(true);
};
  const showRemoveStudentDialog = () => {
    setSelectedStudents([]);
    setRemoveStudentDialogVisible(true);
  };
  const showViewStudentDialog = () => {
    setViewStudentDialogVisible(true);
  };
  // Backup management dialog control functions
  const showBackupFilesDialog = async () => {
    setLoading(true);
    try {
      const { success, files } = await getBackupFiles();
      if (success) {
        setBackupFiles(files);
        setBackupFilesDialogVisible(true);
      } else {
        Alert.alert('Error', 'Failed to fetch backup files');
      }
    } catch (error) {
      Alert.alert('Error', `Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const showClearBackupsConfirmDialog = () => {
    setClearBackupsConfirmDialogVisible(true);
  };
  // Handle toggle auto backup
  const handleToggleAutoBackup = async () => {
    try {
      const newStatus = await toggleAutoBackup();
      setAutoBackupEnabled(newStatus);
      Alert.alert('Success', `Auto backup ${newStatus ? 'enabled' : 'disabled'}`);
    } catch (error) {
      Alert.alert('Error', `Failed to toggle auto backup: ${error.message}`);
    }
  };
  // Handle clear backups
  const handleClearBackups = async () => {
    setClearingBackups(true);
    try {
      const result = await clearBackups();
      if (result.success) {
        setClearBackupsConfirmDialogVisible(false);
        // Refresh backup files list
        const { files } = await getBackupFiles();
        setBackupFiles(files);
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to clear backups: ${error.message}`);
    } finally {
      setClearingBackups(false);
    }
  };
  // Hide all dialogs
  const hideDialogs = () => {
    setAddUserDialogVisible(false);
    setAddAdminDialogVisible(false);
    setRemoveUserDialogVisible(false);
    setRemoveAdminDialogVisible(false);
    setViewUserDialogVisible(false);
    setViewAdminDialogVisible(false);
    setAddStudentDialogVisible(false);
    setRemoveStudentDialogVisible(false);
    setViewStudentDialogVisible(false);
    setBackupFilesDialogVisible(false);
    setClearBackupsConfirmDialogVisible(false);
  setExcelUploadDialogVisible(false);
  setExcelMappingDialogVisible(false);
  setExcelPreviewDialogVisible(false);
  };
  // Handle adding a user
  const handleAddUser = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await addUser(name, email, password);
      hideDialogs();
      // Add delay before refreshing
      setTimeout(async () => {
        const { users: refreshedUsers } = await fetchUsers();
        setUsers(refreshedUsers);
        setLoading(false);
        Alert.alert('Success', 'User added successfully');
      }, 1500);
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to add user');
    }
  };
  // Handle adding an admin
  const handleAddAdmin = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await addAdmin(name, email, password);
      hideDialogs();
      // Add delay before refreshing
      setTimeout(async () => {
        const { admins: refreshedAdmins } = await fetchAdmins();
        setAdmins(refreshedAdmins);
        setLoading(false);
        Alert.alert('Success', 'Admin added successfully');
      }, 1500);
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to add admin');
    }
  };
  // Handle removing users
  const handleRemoveUsers = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'Please select at least one user to remove');
      return;
    }
    setLoading(true);
    try {
      await removeUsers(selectedUsers);
      hideDialogs();
      // Add delay before refreshing
      setTimeout(async () => {
        const { users: refreshedUsers } = await fetchUsers();
        setUsers(refreshedUsers);
        setLoading(false);
        Alert.alert('Success', 'User(s) removed successfully');
      }, 1500);
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to remove user(s)');
    }
  };
  // Handle removing admins
  const handleRemoveAdmins = async () => {
    if (selectedAdmins.length === 0) {
      Alert.alert('Error', 'Please select at least one admin to remove');
      return;
    }
    setLoading(true);
    try {
      await removeAdmins(selectedAdmins);
      hideDialogs();
      // Add delay before refreshing
      setTimeout(async () => {
        const { admins: refreshedAdmins } = await fetchAdmins();
        setAdmins(refreshedAdmins);
        setLoading(false);
        Alert.alert('Success', 'Admin(s) removed successfully');
      }, 1500);
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to remove admin(s)');
    }
  };
  // Toggle user selection
  const toggleUserSelection = (email) => {
    if (selectedUsers.includes(email)) {
      setSelectedUsers(selectedUsers.filter(item => item !== email));
    } else {
      setSelectedUsers([...selectedUsers, email]);
    }
  };
  // Toggle admin selection
  const toggleAdminSelection = (email) => {
    if (selectedAdmins.includes(email)) {
      setSelectedAdmins(selectedAdmins.filter(item => item !== email));
    } else {
      setSelectedAdmins([...selectedAdmins, email]);
    }
  };
  // Toggle select all users
  const toggleSelectAllUsers = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(user => user.email));
    }
  };
  // Toggle select all admins
  const toggleSelectAllAdmins = () => {
    if (selectedAdmins.length === admins.length) {
      setSelectedAdmins([]);
    } else {
      setSelectedAdmins(admins.map(admin => admin.email));
    }
  };
  // Add these new functions for student management:
  const handleAddStudent = async () => {
    if (!year || !group || !id) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await addStudent(year, group, id);
      hideDialogs();
      // Add delay before refreshing
      setTimeout(async () => {
        const { students: refreshedStudents } = await fetchStudents();
        setStudents(refreshedStudents);
        setLoading(false);
        Alert.alert('Success', 'Student added successfully');
      }, 1500);
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to add student');
    }
  };
const handleRemoveStudents = async () => {
  if (selectedStudents.length === 0) {
    Alert.alert('Error', 'Please select at least one student to remove');
    return;
  }
  setLoading(true);
  try {
    await removeStudents(selectedStudents);
    hideDialogs();
    // Add delay before refreshing
    setTimeout(async () => {
      const { students: refreshedStudents } = await fetchStudents();
      setStudents(refreshedStudents);
      setLoading(false);
      Alert.alert('Success', 'Student(s) removed successfully');
    }, 1500);
  } catch (err) {
    setLoading(false);
    Alert.alert('Error', err.message || 'Failed to remove student(s)');
  }
};

// Student selection helpers
const toggleStudentSelection = (student) => {
  const isSelected = selectedStudents.some(
    s => s.year === student.year && 
         s.group.toLowerCase() === student.group.toLowerCase() && 
         s.id === student.id
  );
  if (isSelected) {
    setSelectedStudents(selectedStudents.filter(
      s => !(s.year === student.year && 
             s.group.toLowerCase() === student.group.toLowerCase() && 
             s.id === student.id)
    ));
  } else {
    setSelectedStudents([...selectedStudents, { 
      year: student.year, 
      group: student.group, 
      id: student.id 
    }]);
  }
};
  const toggleSelectAllStudents = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(student => ({ 
        year: student.year, 
        group: student.group, 
        id: student.id 
      })));
    }
  };
// Add this function to handle Excel upload
const handleExcelUpload = async () => {
  setUploadingExcel(true);
  try {
    const result = await parseExcelFile();
    if (!result.success) {
      Alert.alert('Error', result.message);
      return;
    }
    // Store the Excel data
    setExcelHeaders(result.headers);
    setExcelRows(result.rows);
    setExcelFileName(result.fileName);
    // Reset column mappings
    setColumnMappings({ year: null, group: null, id: null });
    // Show mapping dialog
    setExcelUploadDialogVisible(false);
    setExcelMappingDialogVisible(true);
  } catch (error) {
    Alert.alert('Error', `Error uploading Excel file: ${error.message}`);
  } finally {
    setUploadingExcel(false);
  }
};
// Add this function to handle mapping confirmation
const handleMappingConfirm = () => {
  // Check if mappings are properly set
  console.log("Current mappings:", columnMappings);
  
  // Validate mappings (manually checking each value)
  if (columnMappings.year === null || columnMappings.year === undefined || 
      columnMappings.group === null || columnMappings.group === undefined || 
      columnMappings.id === null || columnMappings.id === undefined) {
    Alert.alert('Error', 'Please select all required columns');
    return;
  }
  
  try {
    // Process Excel data
    const processResult = processExcelData(excelRows, excelHeaders, columnMappings);
    if (!processResult.success) {
      Alert.alert('Error', processResult.message || 'Data processing errors', [
        { text: 'OK' },
        { 
          text: 'Show Details', 
          onPress: () => Alert.alert('Errors', processResult.errors.join('\n'))
        }
      ]);
      return;
    }
    
    // Show preview of data
    setPreviewData(processResult.data.slice(0, 5)); // Show first 5 rows
    setExcelMappingDialogVisible(false);
    setExcelPreviewDialogVisible(true);
    
    // Ask for confirmation before merging
    Alert.alert(
      'Confirm Import',
      `Ready to import ${processResult.data.length} students. This will update existing students with matching IDs and add new students.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => handleMergeData(processResult.data)
        }
      ]
    );
  } catch (error) {
    console.error('Error processing Excel data:', error);
    Alert.alert('Error', `Failed to process Excel data: ${error.message}`);
  }
};

// Add this function to handle data merging
const handleMergeData = async (processedData) => {
  setLoading(true);
  try {
    const result = await mergeStudentsData(processedData);
    if (result.success) {
      hideDialogs();
      // Refresh students data
      setTimeout(async () => {
        const { students: refreshedStudents } = await fetchStudents();
        setStudents(refreshedStudents);
        setLoading(false);
        Alert.alert(
          'Success', 
          `Excel import completed:\n\n- ${result.added} new students added\n- ${result.updated} existing students updated\n- ${result.total} total records processed`
        );
      }, 1500);
    } else {
      setLoading(false);
      Alert.alert('Error', result.message);
    }
  } catch (error) {
    setLoading(false);
    Alert.alert('Error', `Error importing data: ${error.message}`);
  }
};
// Check if a student is selected
const isStudentSelected = (student) => {
  return selectedStudents.some(
    s => s.year === student.year && 
         s.group.toLowerCase() === student.group.toLowerCase() && 
         s.id === student.id
  );
};

// Add current entry to the batch list
const addEntryToBatch = () => {
  // Validate fields based on type
  if (entriesType === 'students') {
    if (!currentStudentEntry.year || !currentStudentEntry.group || !currentStudentEntry.id) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setEntries([...entries, { ...currentStudentEntry }]);
    setCurrentStudentEntry({ year: '', group: '', id: '' });
  } else {
    // For users and admins
    if (!currentEntry.name || !currentEntry.email || !currentEntry.password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setEntries([...entries, { ...currentEntry }]);
    setCurrentEntry({ name: '', email: '', password: '' });
  }
};

// Remove an entry from the batch list
const removeEntryFromBatch = (index) => {
  const updatedEntries = [...entries];
  updatedEntries.splice(index, 1);
  setEntries(updatedEntries);
};

// PART 4: Functions to handle batch submission

// Handle batch addition of users
const handleAddUsersBatch = async () => {
  if (entries.length === 0) {
    Alert.alert('Error', 'No users to add');
    return;
  }
  
  setLoading(true);
  try {
    // Process all user entries
    const results = await Promise.all(
      entries.map(entry => addUser(entry.name, entry.email, entry.password))
    );
    
    hideDialogs();
    // Add delay before refreshing
    setTimeout(async () => {
      const { users: refreshedUsers } = await fetchUsers();
      setUsers(refreshedUsers);
      setLoading(false);
      Alert.alert('Success', `${entries.length} users added successfully`);
    }, 1500);
  } catch (err) {
    setLoading(false);
    Alert.alert('Error', err.message || 'Failed to add users');
  }
};

// Handle batch addition of admins
const handleAddAdminsBatch = async () => {
  if (entries.length === 0) {
    Alert.alert('Error', 'No admins to add');
    return;
  }
  
  setLoading(true);
  try {
    // Process all admin entries
    const results = await Promise.all(
      entries.map(entry => addAdmin(entry.name, entry.email, entry.password))
    );
    
    hideDialogs();
    // Add delay before refreshing
    setTimeout(async () => {
      const { admins: refreshedAdmins } = await fetchAdmins();
      setAdmins(refreshedAdmins);
      setLoading(false);
      Alert.alert('Success', `${entries.length} admins added successfully`);
    }, 1500);
  } catch (err) {
    setLoading(false);
    Alert.alert('Error', err.message || 'Failed to add admins');
  }
};

// Handle batch addition of students
const handleAddStudentsBatch = async () => {
  if (entries.length === 0) {
    Alert.alert('Error', 'No students to add');
    return;
  }
  
  setLoading(true);
  try {
    // Process all student entries
    const results = await Promise.all(
      entries.map(entry => addStudent(entry.year, entry.group, entry.id))
    );
    
    hideDialogs();
    // Add delay before refreshing
    setTimeout(async () => {
      const { students: refreshedStudents } = await fetchStudents();
      setStudents(refreshedStudents);
      setLoading(false);
      Alert.alert('Success', `${entries.length} students added successfully`);
    }, 1500);
  } catch (err) {
    setLoading(false);
    Alert.alert('Error', err.message || 'Failed to add students');
  }
};


  // Render a section (Admins or Users)
const renderSection = (title, items, onAdd, onRemove, onView, count, isLoading, error, onRetry) => (
  <Card style={styles.card}>
    <Card.Content>
      <View style={styles.titleContainer}>
        <Title style={styles.cardTitle}>{title}</Title>
        {!isLoading && !error && (
          <Text style={styles.countBadge}>({count})</Text>
        )}
      </View>
      <Divider style={styles.divider} />
      {isLoading ? (
        <View style={styles.sectionLoadingContainer}>
          <ActivityIndicator size="small" color="#24325f" />
          <Text style={styles.sectionLoadingText}>Loading {title.toLowerCase()}...</Text>
        </View>
      ) : error ? (
        <View style={styles.sectionErrorContainer}>
          <Text style={styles.sectionErrorText}>{error}</Text>
          <Button 
            mode="contained" 
            onPress={onRetry} 
            style={styles.sectionRetryButton}
            icon="refresh"
          >
            Retry
          </Button>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <Button 
            mode="contained" 
            onPress={onAdd}
            style={styles.button}
            icon="account-plus"
          >
            Add
          </Button>
          <Button 
            mode="contained" 
            onPress={onView}
            style={styles.button}
            icon="eye"
          >
            View
          </Button>
          <Button 
            mode="contained" 
            onPress={onRemove}
            style={[styles.button, styles.dangerButton]}
            icon="account-minus"
          >
            Remove
          </Button>
        </View>
      )}
    </Card.Content>
  </Card>
);
  // Render backup management section
const renderBackupSection = () => (
  <Card style={styles.card}>
    <Card.Content>
      <Title style={styles.cardTitle}>Backup Management</Title>
      <Divider style={styles.divider} />
      {backupsLoading ? (
        <View style={styles.sectionLoadingContainer}>
          <ActivityIndicator size="small" color="#24325f" />
          <Text style={styles.sectionLoadingText}>Loading backup data...</Text>
        </View>
      ) : backupsError ? (
        <View style={styles.sectionErrorContainer}>
          <Text style={styles.sectionErrorText}>{backupsError}</Text>
          <Button 
            mode="contained" 
            onPress={loadBackupsData} 
            style={styles.sectionRetryButton}
            icon="refresh"
          >
            Retry
          </Button>
        </View>
      ) : (
        <>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Backup Files:</Text>
            <Text style={styles.infoValue}>{backupFiles.length}</Text>
          </View>
          <View style={styles.buttonRow}>
            <Button 
              mode="contained" 
              onPress={showBackupFilesDialog}
              style={styles.button}
              icon="file-multiple"
            >
              View Files
            </Button>
            <Button 
              mode="contained" 
              onPress={showClearBackupsConfirmDialog}
              style={[styles.button, styles.dangerButton]}
              icon="delete-sweep"
              disabled={backupFiles.length === 0}
            >
              Clear All
            </Button>
          </View>
        </>
      )}
    </Card.Content>
  </Card>
);
const renderStudentSection = () => (
  <Card style={styles.card}>
    <Card.Content>
      <View style={styles.titleContainer}>
        <Title style={styles.cardTitle}>Students</Title>
        {!studentsLoading && !studentsError && (
          <Text style={styles.countBadge}>({students.length})</Text>
        )}
      </View>
      <Divider style={styles.divider} />
      {studentsLoading ? (
        <View style={styles.sectionLoadingContainer}>
          <ActivityIndicator size="small" color="#24325f" />
          <Text style={styles.sectionLoadingText}>Loading students...</Text>
        </View>
      ) : studentsError ? (
        <View style={styles.sectionErrorContainer}>
          <Text style={styles.sectionErrorText}>{studentsError}</Text>
          <Button 
            mode="contained" 
            onPress={loadStudentsData} 
            style={styles.sectionRetryButton}
            icon="refresh"
          >
            Retry
          </Button>
        </View>
      ) : (
        <>
          <View style={styles.buttonRow}>
            <Button 
              mode="contained" 
              onPress={showAddStudentDialog}
              style={styles.button}
              icon="account-plus"
            >
              Add
            </Button>
            <Button 
              mode="contained" 
              onPress={showViewStudentDialog}
              style={styles.button}
              icon="eye"
            >
              View
            </Button>
            <Button 
              mode="contained" 
              onPress={showRemoveStudentDialog}
              style={[styles.button, styles.dangerButton]}
              icon="account-minus"
            >
              Remove
            </Button>
          </View>
          <View style={[styles.buttonRow, { marginTop: 5 }]}>
            <Button 
              mode="contained" 
              onPress={() => setExcelUploadDialogVisible(true)}
              style={[styles.button, { backgroundColor: '#1e7e34' }]}
              icon="file-excel"
            >
              Import Excel
            </Button>
          </View>
        </>
      )}
    </Card.Content>
  </Card>
);
// If loading, show loading indicator
const allLoading = usersLoading && adminsLoading && studentsLoading && backupsLoading;
if ((refreshing || allLoading) && !addUserDialogVisible && !addAdminDialogVisible && 
    !removeUserDialogVisible && !removeAdminDialogVisible && 
    !viewUserDialogVisible && !viewAdminDialogVisible) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#24325f" />
      <Text style={styles.loadingText}>Loading application...</Text>
    </View>
  );
}
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Admin Settings</Text>
      <Text style={styles.subHeader}>Manage system users and access</Text>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button 
            mode="contained" 
            onPress={handleRefresh} 
            style={styles.refreshButton}
            icon="refresh"
          >
            Refresh Data
          </Button>
        </View>
      )}
      {/* Backup Management Section */}
      {renderBackupSection()}
      {renderSection(
        'Admins', 
        admins, 
        showAddAdminDialog, 
        showRemoveAdminDialog, 
        showViewAdminDialog, 
        admins.length,
        adminsLoading,
        adminsError,
        loadAdminsData
      )}
      {renderSection(
        'Users', 
        users, 
        showAddUserDialog, 
        showRemoveUserDialog, 
        showViewUserDialog, 
        users.length,
        usersLoading,
        usersError,
        loadUsersData
      )}
      {/* Students Section - using the more feature-rich version */}
      {renderStudentSection()}

      {/* Add User Dialog */}
const renderAddUserDialog = () => (
  <Portal>
    <Dialog 
      visible={addUserDialogVisible} 
      onDismiss={hideDialogs}
      style={{ backgroundColor: '#ffffff' }}
      contentContainerStyle={[styles.modalContent, { maxHeight: '80%' }]}
    >
      <Dialog.Title style={{ color: '#24325f' }}>Add Multiple Users</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView>
          <View style={styles.batchEntryForm}>
            <TextInput
              label="Name"
              value={currentEntry.name}
              onChangeText={(text) => setCurrentEntry({...currentEntry, name: text})}
              mode="outlined"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <TextInput
              label="Email"
              value={currentEntry.email}
              onChangeText={(text) => setCurrentEntry({...currentEntry, email: text})}
              mode="outlined"
              keyboardType="email-address"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <TextInput
              label="Password"
              value={currentEntry.password}
              onChangeText={(text) => setCurrentEntry({...currentEntry, password: text})}
              mode="outlined"
              secureTextEntry
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <Button 
              mode="contained" 
              onPress={addEntryToBatch}
              style={[styles.addToBatchButton, { marginTop: 10 }]}
              icon="plus"
            >
              Add to List
            </Button>
          </View>
          
          {entries.length > 0 && (
            <View style={styles.entriesList}>
              <Divider style={{ marginVertical: 10 }} />
              <Text style={styles.entriesHeader}>Users to Add ({entries.length})</Text>
              {entries.map((entry, index) => (
                <View key={index} style={styles.entryItem}>
                  <View style={styles.entryDetails}>
                    <Text style={styles.entryName}>{entry.name}</Text>
                    <Text style={styles.entrySubtext}>{entry.email}</Text>
                  </View>
                  <IconButton
                    icon="delete"
                    size={20}
                    color="#ff5252"
                    onPress={() => removeEntryFromBatch(index)}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions style={styles.modalButtons}>
        <Button 
          onPress={hideDialogs}
          style={styles.secondaryButton}
          labelStyle={{ color: '#24325f' }}
        >
          Cancel
        </Button>
        <Button 
          onPress={handleAddUsersBatch} 
          loading={loading}
          mode="contained"
          style={styles.primaryButton}
          labelStyle={{ color: 'white' }}
          disabled={entries.length === 0}
        >
          Submit All
        </Button>
      </Dialog.Actions>
    </Dialog>
  </Portal>
);
      {/* Add Admin Dialog */}
const renderAddAdminDialog = () => (
  <Portal>
    <Dialog 
      visible={addAdminDialogVisible} 
      onDismiss={hideDialogs}
      style={{ backgroundColor: '#ffffff' }}
      contentContainerStyle={[styles.modalContent, { maxHeight: '80%' }]}
    >
      <Dialog.Title style={{ color: '#24325f' }}>Add Multiple Admins</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView>
          <View style={styles.batchEntryForm}>
            <TextInput
              label="Name"
              value={currentEntry.name}
              onChangeText={(text) => setCurrentEntry({...currentEntry, name: text})}
              mode="outlined"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <TextInput
              label="Email"
              value={currentEntry.email}
              onChangeText={(text) => setCurrentEntry({...currentEntry, email: text})}
              mode="outlined"
              keyboardType="email-address"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <TextInput
              label="Password"
              value={currentEntry.password}
              onChangeText={(text) => setCurrentEntry({...currentEntry, password: text})}
              mode="outlined"
              secureTextEntry
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <Button 
              mode="contained" 
              onPress={addEntryToBatch}
              style={[styles.addToBatchButton, { marginTop: 10 }]}
              icon="plus"
            >
              Add to List
            </Button>
          </View>
          
          {entries.length > 0 && (
            <View style={styles.entriesList}>
              <Divider style={{ marginVertical: 10 }} />
              <Text style={styles.entriesHeader}>Admins to Add ({entries.length})</Text>
              {entries.map((entry, index) => (
                <View key={index} style={styles.entryItem}>
                  <View style={styles.entryDetails}>
                    <Text style={styles.entryName}>{entry.name}</Text>
                    <Text style={styles.entrySubtext}>{entry.email}</Text>
                  </View>
                  <IconButton
                    icon="delete"
                    size={20}
                    color="#ff5252"
                    onPress={() => removeEntryFromBatch(index)}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions style={styles.modalButtons}>
        <Button 
          onPress={hideDialogs}
          style={styles.secondaryButton}
          labelStyle={{ color: '#24325f' }}
        >
          Cancel
        </Button>
        <Button 
          onPress={handleAddAdminsBatch} 
          loading={loading}
          mode="contained"
          style={styles.primaryButton}
          labelStyle={{ color: 'white' }}
          disabled={entries.length === 0}
        >
          Submit All
        </Button>
      </Dialog.Actions>
    </Dialog>
  </Portal>
);
      {/* Remove Admins Dialog */}
<Portal>
  <Dialog 
    visible={removeAdminDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.selectionDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Remove Admins</Dialog.Title>
    <Dialog.Content>
      <View style={styles.selectionHeader}>
        <Text style={{ color: '#24325f' }}>Select admins to remove:</Text>
        <Button 
          onPress={toggleSelectAllAdmins}
          mode="text"
          labelStyle={{ color: '#24325f' }}
        >
          {selectedAdmins.length === admins.length ? 'Deselect All' : 'Select All'}
        </Button>
      </View>
      <ScrollView style={[styles.selectionList, { backgroundColor: '#ffffff' }]}>
        {admins.map((admin, index) => (
          <List.Item
            key={index}
            title={admin.name}
            description={admin.email}
            titleStyle={{ color: '#24325f' }}
            descriptionStyle={{ color: '#666' }}
            onPress={() => toggleAdminSelection(admin.email)}
            left={props => (
              <Checkbox
                status={selectedAdmins.includes(admin.email) ? 'checked' : 'unchecked'}
                onPress={() => toggleAdminSelection(admin.email)}
                color="#24325f"
              />
            )}
          />
        ))}
        {admins.length === 0 && (
          <Text style={[styles.emptyText, { backgroundColor: 'transparent' }]}>No admins found</Text>
        )}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        Cancel
      </Button>
      <Button 
        onPress={handleRemoveAdmins} 
        loading={loading}
        disabled={selectedAdmins.length === 0}
        mode="contained"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        Remove Selected
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>
      {/* Remove Users Dialog */}
<Portal>
  <Dialog 
    visible={removeUserDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.selectionDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Remove Users</Dialog.Title>
    <Dialog.Content>
      <View style={styles.selectionHeader}>
        <Text style={{ color: '#24325f' }}>Select users to remove:</Text>
        <Button 
          onPress={toggleSelectAllUsers}
          mode="text"
          labelStyle={{ color: '#24325f' }}
        >
          {selectedUsers.length === users.length ? 'Deselect All' : 'Select All'}
        </Button>
      </View>
      <ScrollView style={[styles.selectionList, { backgroundColor: '#ffffff' }]}>
        {users.map((user, index) => (
          <List.Item
            key={index}
            title={user.name}
            description={user.email}
            titleStyle={{ color: '#24325f' }}
            descriptionStyle={{ color: '#666' }}
            onPress={() => toggleUserSelection(user.email)}
            left={props => (
              <Checkbox
                status={selectedUsers.includes(user.email) ? 'checked' : 'unchecked'}
                onPress={() => toggleUserSelection(user.email)}
                color="#24325f"
              />
            )}
          />
        ))}
        {users.length === 0 && (
          <Text style={[styles.emptyText, { backgroundColor: 'transparent' }]}>No users found</Text>
        )}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        Cancel
      </Button>
      <Button 
        onPress={handleRemoveUsers} 
        loading={loading}
        disabled={selectedUsers.length === 0}
        mode="contained"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        Remove Selected
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>
      {/* View Users Dialog */}
<Portal>
  <Dialog 
    visible={viewUserDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.selectionDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>View Users</Dialog.Title>
    <Dialog.Content>
      <ScrollView style={[styles.selectionList, { backgroundColor: '#ffffff' }]}>
        {users.map((user, index) => (
          <List.Item
            key={index}
            title={user.name}
            description={user.email}
            titleStyle={{ color: '#24325f' }}
            descriptionStyle={{ color: '#666' }}
            left={props => <List.Icon {...props} icon="account" color="#24325f" />}
          />
        ))}
        {users.length === 0 && (
          <Text style={[styles.emptyText, { backgroundColor: 'transparent' }]}>No users found</Text>
        )}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        mode="contained"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        Close
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>
      {/* View Admins Dialog */}
<Portal>
  <Dialog 
    visible={viewAdminDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.selectionDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>View Admins</Dialog.Title>
    <Dialog.Content>
      <ScrollView style={[styles.selectionList, { backgroundColor: '#ffffff' }]}>
        {admins.map((admin, index) => (
          <List.Item
            key={index}
            title={admin.name}
            description={admin.email}
            titleStyle={{ color: '#24325f' }}
            descriptionStyle={{ color: '#666' }}
            left={props => <List.Icon {...props} icon="account-star" color="#24325f" />}
          />
        ))}
        {admins.length === 0 && (
          <Text style={[styles.emptyText, { backgroundColor: 'transparent' }]}>No admins found</Text>
        )}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        mode="contained"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        Close
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>
{/* Add Student Dialog */}
const renderAddStudentDialog = () => (
  <Portal>
    <Dialog 
      visible={addStudentDialogVisible} 
      onDismiss={hideDialogs}
      style={{ backgroundColor: '#ffffff' }}
      contentContainerStyle={[styles.modalContent, { maxHeight: '80%' }]}
    >
      <Dialog.Title style={{ color: '#24325f' }}>Add Multiple Students</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView>
          <View style={styles.batchEntryForm}>
            <TextInput
              label="Year"
              value={currentStudentEntry.year}
              onChangeText={(text) => setCurrentStudentEntry({...currentStudentEntry, year: text})}
              mode="outlined"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
              keyboardType="numeric"
            />
            <TextInput
              label="Group"
              value={currentStudentEntry.group}
              onChangeText={(text) => setCurrentStudentEntry({...currentStudentEntry, group: text})}
              mode="outlined"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <TextInput
              label="ID"
              value={currentStudentEntry.id}
              onChangeText={(text) => setCurrentStudentEntry({...currentStudentEntry, id: text})}
              mode="outlined"
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            <Button 
              mode="contained" 
              onPress={addEntryToBatch}
              style={[styles.addToBatchButton, { marginTop: 10 }]}
              icon="plus"
            >
              <Text style={{ color: 'white' }}>Add to List</Text>
            </Button>
          </View>
          
          {entries.length > 0 && (
            <View style={styles.entriesList}>
              <Divider style={{ marginVertical: 10 }} />
              <Text style={styles.entriesHeader}>Students to Add ({entries.length})</Text>
              {entries.map((entry, index) => (
                <View key={index} style={styles.entryItem}>
                  <View style={styles.entryDetails}>
                    <Text style={styles.entryName}>Year: {entry.year}, Group: {entry.group}</Text>
                    <Text style={styles.entrySubtext}>ID: {entry.id}</Text>
                  </View>
                  <IconButton
                    icon="delete"
                    size={20}
                    color="#ff5252"
                    onPress={() => removeEntryFromBatch(index)}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions style={styles.modalButtons}>
        <Button 
          onPress={hideDialogs}
          style={styles.secondaryButton}
          labelStyle={{ color: '#24325f' }}
        >
          <Text style={{ color: '#24325f' }}>Cancel</Text>
        </Button>
        <Button 
          onPress={handleAddStudentsBatch} 
          loading={loading}
          mode="contained"
          style={styles.primaryButton}
          labelStyle={{ color: 'white' }}
          disabled={entries.length === 0}
        >
          <Text style={{ color: 'white' }}>Submit All</Text>
        </Button>
      </Dialog.Actions>
    </Dialog>
  </Portal>
);

{/* Remove Students Dialog */}
<Portal>
  <Dialog 
    visible={removeStudentDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.selectionDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Remove Students</Dialog.Title>
    <Dialog.Content>
      <TextInput
        label="Search by Year, Group, or ID"
        value={studentSearchQuery}
        onChangeText={text => {
          setStudentSearchQuery(text);
          setCurrentPage(0); // Reset to first page on search
        }}
        mode="outlined"
        style={[styles.input, { backgroundColor: '#ffffff' }]}
      />
      <View style={styles.selectionHeader}>
        <Text style={{ color: '#24325f' }}>Select students to remove:</Text>
        <Button 
          onPress={toggleSelectAllStudents}
          mode="text"
          labelStyle={{ color: '#24325f' }}
        >
          <Text>{selectedStudents.length === filteredStudents.length ? 'Deselect All' : 'Select All'}</Text>
        </Button>
      </View>
      <ScrollView style={[styles.selectionList, { backgroundColor: '#ffffff' }]}>
        {filteredStudents
          .slice(currentPage * studentsPerPage, (currentPage + 1) * studentsPerPage)
          .map((student, index) => (
            <List.Item
              key={index}
              title={`Year: ${student.year}, Group: ${student.group}`}
              description={`ID: ${student.id}`}
              titleStyle={{ color: '#24325f' }}
              descriptionStyle={{ color: '#666' }}
              onPress={() => toggleStudentSelection(student)}
              left={props => (
                <Checkbox
                  status={isStudentSelected(student) ? 'checked' : 'unchecked'}
                  onPress={() => toggleStudentSelection(student)}
                  color="#24325f"
                />
              )}
            />
          ))}
        {filteredStudents.length === 0 && (
          <Text style={[styles.emptyText, { backgroundColor: 'transparent' }]}>No matching students found</Text>
        )}
      </ScrollView>
      {/* Pagination controls */}
      {filteredStudents.length > studentsPerPage && (
        <View style={styles.paginationContainer}>
          <Button 
            disabled={currentPage === 0}
            onPress={() => setCurrentPage(p => p - 1)}
            style={currentPage === 0 ? {} : styles.secondaryButton}
            labelStyle={currentPage === 0 ? { color: '#999' } : { color: '#24325f' }}
          >
            <Text style={{ color: '#24325f' }}>Previous</Text>
          </Button>
          <Text style={[styles.paginationText, { color: '#24325f' }]}>
            Page {currentPage + 1} of {Math.ceil(filteredStudents.length / studentsPerPage)}
          </Text>
          <Button 
            disabled={currentPage >= Math.ceil(filteredStudents.length / studentsPerPage) - 1}
            onPress={() => setCurrentPage(p => p + 1)}
            style={currentPage >= Math.ceil(filteredStudents.length / studentsPerPage) - 1 ? {} : styles.secondaryButton}
            labelStyle={currentPage >= Math.ceil(filteredStudents.length / studentsPerPage) - 1 ? { color: '#999' } : { color: '#24325f' }}
          >
            <Text style={{ color: '#24325f' }}>Next</Text>
          </Button>
        </View>
      )}
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        <Text style={{ color: '#24325f' }}>Cancel</Text>
      </Button>
      <Button 
        onPress={handleRemoveStudents} 
        loading={loading}
        disabled={selectedStudents.length === 0}
        mode="contained"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        <Text style={{ color: 'white' }}>Remove Selected ({selectedStudents.length})</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>

{/* Excel Upload Dialog */}
<Portal>
  <Dialog 
    visible={excelUploadDialogVisible} 
    onDismiss={hideDialogs}
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={styles.modalContent}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Import Students from Excel</Dialog.Title>
    <Dialog.Content>
      <Text style={[styles.dialogText, { color: '#24325f' }]}>
        Upload an Excel file containing student data. The file should have columns for Year, Group, and Student ID.
      </Text>
      <Text style={[styles.dialogText, { color: '#24325f' }]}>
        You'll be able to map the columns in the next step.
      </Text>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        <Text style={{ color: '#24325f' }}>Cancel</Text>
      </Button>
      <Button 
        mode="contained"
        onPress={handleExcelUpload} 
        loading={uploadingExcel}
        icon="file-upload"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        <Text style={{ color: 'white' }}>Choose File</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>

{/* Excel Column Mapping Dialog */}
<Portal>
  <Dialog 
    visible={excelMappingDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.mappingDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Map Excel Columns</Dialog.Title>
    <Dialog.Content>
      <Text style={[styles.dialogSubTitle, { color: '#24325f' }]}>File: {excelFileName}</Text>
      <Text style={[styles.dialogText, { color: '#24325f' }]}>
        Please match each required field to the appropriate column from your Excel file:
      </Text>
      
      <ColumnSelector
        label="Year"
        value={columnMappings.year}
        options={excelHeaders}
        onSelect={(index) => setColumnMappings(prev => ({...prev, year: index}))}
      />
      
      <ColumnSelector
        label="Group"
        value={columnMappings.group}
        options={excelHeaders}
        onSelect={(index) => setColumnMappings(prev => ({...prev, group: index}))}
      />
      
      <ColumnSelector
        label="Student ID"
        value={columnMappings.id}
        options={excelHeaders}
        onSelect={(index) => setColumnMappings(prev => ({...prev, id: index}))}
      />
      
      <Text style={[styles.noteText, { color: '#666' }]}>
        Note: If your Year column contains values like "Year 1", the system will extract just the number.
      </Text>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        <Text style={{ color: '#24325f' }}>Cancel</Text>
      </Button>
      <Button 
        mode="contained"
        onPress={handleMappingConfirm} 
        disabled={columnMappings.year === null || columnMappings.year === undefined || 
                columnMappings.group === null || columnMappings.group === undefined || 
                columnMappings.id === null || columnMappings.id === undefined}
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        <Text style={{ color: '#24325f' }}>Next</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>

{/* Excel Data Preview Dialog */}
<Portal>
  <Dialog 
    visible={excelPreviewDialogVisible} 
    onDismiss={() => setExcelPreviewDialogVisible(false)}
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.previewDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Data Preview</Dialog.Title>
    <Dialog.Content>
      <Text style={[styles.dialogSubTitle, { color: '#24325f' }]}>First 5 records from Excel:</Text>
      <ScrollView style={[styles.previewTable, { backgroundColor: '#ffffff' }]}>
        <View style={[styles.tableHeader, { backgroundColor: '#f0f0f0' }]}>
          <Text style={[styles.tableCell, styles.headerCell, { color: '#24325f' }]}>Year</Text>
          <Text style={[styles.tableCell, styles.headerCell, { color: '#24325f' }]}>Group</Text>
          <Text style={[styles.tableCell, styles.headerCell, { color: '#24325f' }]}>Student ID</Text>
        </View>
        {previewData.map((student, index) => (
          <View key={index} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' }]}>
            <Text style={[styles.tableCell, { color: '#24325f' }]}>{student.Year}</Text>
            <Text style={[styles.tableCell, { color: '#24325f' }]}>{student.Group}</Text>
            <Text style={[styles.tableCell, { color: '#24325f' }]}>{student["Student ID"]}</Text>
          </View>
        ))}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={() => setExcelPreviewDialogVisible(false)}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        <Text style={{ color: 'white' }}>Close</Text>
      </Button>
      <Button 
        mode="contained"
        onPress={() => {
          setExcelPreviewDialogVisible(false);
          // Process all data after preview
          const processResult = processExcelData(excelRows, excelHeaders, columnMappings);
          handleMergeData(processResult.data);
        }}
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        <Text style={{ color: 'white' }}>Import All</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>

{/* View Students Dialog */}
<Portal>
  <Dialog 
    visible={viewStudentDialogVisible} 
    onDismiss={hideDialogs} 
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={[styles.modalContent, styles.selectionDialog]}
  >
    <Dialog.Title style={{ color: '#24325f' }}>View Students</Dialog.Title>
    <Dialog.Content>
      <TextInput
        label="Search by Year, Group, or ID"
        value={studentSearchQuery}
        onChangeText={setStudentSearchQuery}
        mode="outlined"
        style={[styles.input, { backgroundColor: '#ffffff' }]}
      />
      <Text style={[styles.resultCount, { color: '#666' }]}>
        {filteredStudents.length} students found
        {!studentSearchQuery && students.length > 100 ? " (showing first 100)" : ""}
      </Text>
      <ScrollView style={[styles.selectionList, { backgroundColor: '#ffffff' }]}>
        {filteredStudents.map((student, index) => (
          <List.Item
            key={index}
            title={`Year: ${student.year}, Group: ${student.group}`}
            description={`ID: ${student.id}`}
            titleStyle={{ color: '#24325f' }}
            descriptionStyle={{ color: '#666' }}
            left={props => <List.Icon {...props} icon="school" color="#24325f" />}
          />
        ))}
        {filteredStudents.length === 0 && (
          <Text style={[styles.emptyText, { backgroundColor: 'transparent' }]}>No matching students found</Text>
        )}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        mode="contained"
        style={styles.primaryButton}
        labelStyle={{ color: 'white' }}
      >
        <Text style={{ color: 'white' }}>Close</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>

{/* View Backup Files Dialog */}
<Portal>
  <Dialog visible={backupFilesDialogVisible} onDismiss={hideDialogs} style={styles.selectionDialog}>
    <Dialog.Title>Backup Files</Dialog.Title>
    <Dialog.Content>
      <ScrollView style={styles.selectionList}>
        {backupFiles.map((file, index) => (
          <List.Item
            key={index}
            title={file.name}
            description={`Size: ${(file.size / 1024).toFixed(2)} KB`}
            left={props => <List.Icon {...props} icon="file-document" color="#24325f" />}
            titleStyle={{ color: '#24325f' }} 
          />
        ))}
        {backupFiles.length === 0 && (
          <Text style={styles.emptyText}>No backup files found</Text>
        )}
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        <Text style={{ color: '#24325f' }}>Cancel</Text>
      </Button>
      <Button 
        onPress={showClearBackupsConfirmDialog}
        mode="contained"
        icon="delete-sweep"
        style={styles.dangerButton}
        disabled={backupFiles.length === 0}
      >
        <Text style={{ color: 'white' }}>Clear All</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>

{/* Clear Backups Confirmation Dialog */}
<Portal>
  <Dialog 
    visible={clearBackupsConfirmDialogVisible} 
    onDismiss={hideDialogs}
    style={{ backgroundColor: '#ffffff' }}
    contentContainerStyle={styles.modalContent}
  >
    <Dialog.Title style={{ color: '#24325f' }}>Clear Backup Files</Dialog.Title>
    <Dialog.Content>
      <Text style={[styles.warningText, { color: '#951d1e' }]}>
        Pressing Clear will move all backup files to a different location ("old_backups") and they will not be directly accessible through this app or the desktop management app anymore.
      </Text>
      <Text style={[styles.warningText, { color: '#951d1e' }]}>
        Are you sure you want to remove the backup files for the past weeks?
      </Text>
    </Dialog.Content>
    <Dialog.Actions style={styles.modalButtons}>
      <Button 
        onPress={hideDialogs}
        style={styles.secondaryButton}
        labelStyle={{ color: '#24325f' }}
      >
        <Text style={{ color: '#24325f' }}>Cancel</Text>
      </Button>
      <Button 
        onPress={handleClearBackups} 
        loading={clearingBackups}
        mode="contained"
        style={[styles.primaryButton, { backgroundColor: '#951d1e' }]}
        labelStyle={{ color: 'white' }}
      >
        <Text style={{ color: 'white' }}>Clear Backups</Text>
      </Button>
    </Dialog.Actions>
  </Dialog>
</Portal>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#24325f',
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginLeft: 16,
    color: '#24325f',
  },
  subHeader: {
    fontSize: 16,
    marginBottom: 16,
    marginLeft: 16,
    color: '#666',
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#ffeeee',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd0d0',
  },
  errorText: {
    color: '#951d1e',
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 10,
  },
  warningText: {
    marginBottom: 10,
    fontSize: 16,
    lineHeight: 22,
  },
  refreshButton: {
    marginTop: 10,
    backgroundColor: '#24325f',
  },
  card: {
    margin: 16,
    elevation: 4,
    backgroundColor: '#ffffff',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#24325f',
    fontWeight: 'bold',
  },
  countBadge: {
    marginLeft: 8,
    color: '#666',
    fontSize: 16,
  },
  divider: {
    marginVertical: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  button: {
    marginHorizontal: 5,
    flex: 1,
    backgroundColor: '#24325f',
  },
  dangerButton: {
    backgroundColor: '#951d1e',
  },
  input: {
    marginBottom: 10,
    backgroundColor: '#ffffff',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: 10,
    color: '#666',
    fontStyle: 'italic',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    elevation: 5,
  },
  selectionDialog: {
    maxHeight: '80%',
    backgroundColor: 'white',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  selectionList: {
    maxHeight: 300,
  },
  resultCount: {
    marginVertical: 10,
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#666',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
  },
  paginationText: {
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 5,
    paddingHorizontal: 5,
  },
  infoLabel: {
    fontWeight: 'bold',
    color: '#24325f',
  },
  infoValue: {
    color: '#666',
  },
sectionLoadingContainer: {
  alignItems: 'center',
  paddingVertical: 20,
},
sectionLoadingText: {
  marginTop: 8,
  color: '#666',
},
sectionErrorContainer: {
  alignItems: 'center',
  paddingVertical: 15,
},
sectionErrorText: {
  color: '#951d1e',
  marginBottom: 10,
  textAlign: 'center',
},
sectionRetryButton: {
  backgroundColor: '#24325f',
  marginTop: 5,
},
mappingDialog: {
  maxHeight: '80%',
  width: '90%', // Add width constraint
  alignSelf: 'center', // Center the dialog
  backgroundColor: '#ffffff',
},
previewDialog: {
  maxHeight: '80%',
},
  primaryButton: {
    backgroundColor: '#24325f',
    borderColor: '#24325f',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderColor: '#24325f',
    borderWidth: 1,
    marginLeft: 8,
  },
  dialogText: {
    marginBottom: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#24325f',
  },
  dialogSubTitle: {
    fontWeight: 'bold',
    marginBottom: 10,
    fontSize: 14,
    color: '#24325f',
  },
mappingItem: {
  flexDirection: 'row',
  alignItems: 'center',
  marginVertical: 6,
  paddingHorizontal: 8,
},
mappingLabel: {
  width: 80,
  fontWeight: 'bold',
},
pickerContainer: {
  flex: 1,
  borderWidth: 1,
  borderColor: '#ccc',
  borderRadius: 4,
  justifyContent: 'center',
  height: 50,
  minWidth: 150,
},
picker: {
  height: '100%',
  width: '100%',
  backgroundColor: 'transparent',
},
noteText: {
  fontStyle: 'italic',
  fontSize: 12,
  color: '#666',
  marginTop: 10,
},
previewTable: {
  maxHeight: 300,
  borderWidth: 1,
  borderColor: '#ddd',
overflow: 'hidden',
borderRadius: 4,
},
tableHeader: {
  flexDirection: 'row',
  backgroundColor: '#f0f0f0',
  borderBottomWidth: 1,
  borderBottomColor: '#ddd',
},
tableRow: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  borderBottomColor: '#eee',
},
tableCell: {
  flex: 1,
  padding: 8,
  fontSize: 12,
},
headerCell: {
  fontWeight: 'bold',
},
selectorContainer: {
  flex: 1,
},
selectorButton: {
  borderColor: '#24325f',
  justifyContent: 'flex-start',
},
selectorContent: {
  justifyContent: 'flex-start',
},
selectorDialog: {
  backgroundColor: '#ffffff',
  maxHeight: '80%',
},
selectorList: {
  maxHeight: 300,
},
  modalContent: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 8,
    maxWidth: Platform.OS === 'web' ? '70%' : '95%',
    width: Platform.OS === 'web' ? 600 : undefined,
    alignSelf: 'center',
    maxHeight: '80%', // Allow scrolling for many entries
  },
  batchEntryForm: {
    marginBottom: 10,
  },
  addToBatchButton: {
    backgroundColor: '#4CAF50',
    marginTop: 10,
  },
  entriesList: {
    marginTop: 10,
  },
  entriesHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#24325f',
    marginBottom: 10,
  },
  entryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  entryDetails: {
    flex: 1,
  },
  entryName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  entrySubtext: {
    fontSize: 12,
    color: '#666',
  },
});
export default SettingsScreen;
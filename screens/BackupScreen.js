import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Surface, Title, Divider, ActivityIndicator, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as BackupService from '../services/backup';
import * as Database from '../services/database';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BackupScreen = () => {
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [lastBackupTime, setLastBackupTime] = useState('Never');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isProcessingQueued, setIsProcessingQueued] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [queuedSessionsCount, setQueuedSessionsCount] = useState(0);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  
  // Check connection and load data on mount
  useEffect(() => {
    const loadBackupData = async () => {
      try {
        // Check network connection
        const netInfo = await NetInfo.fetch();
        setConnectionStatus(netInfo.isConnected ? 'online' : 'offline');
        
        // Set up network change listener
        const unsubscribe = NetInfo.addEventListener(state => {
          setConnectionStatus(state.isConnected ? 'online' : 'offline');
        });
        
        // Get last backup time
        const lastBackup = await BackupService.getLastBackupTime();
        setLastBackupTime(lastBackup);
        
        // Get auto-backup status
        const autoBackup = await BackupService.getAutoBackupStatus();
        setAutoBackupEnabled(autoBackup);
        
        // Get all sessions from database (placeholder - implement this in database.js)
        const allSessions = await Database.getAllSessions();
        if (allSessions && Array.isArray(allSessions)) {
          setSessions(allSessions);
        }

        // Check for queued sessions
        await checkQueuedSessionsCount();
        
        return unsubscribe;
      } catch (error) {
        console.error('Error loading backup data:', error);
        Alert.alert('Error', 'Failed to load backup information');
      }
    };
    
    loadBackupData();
    
    // Cleanup network listener on unmount
    return () => {
      // The unsubscribe function will be called from the loadBackupData function
    };
  }, []);

  // Add this effect to refresh data when screen comes into focus
  useEffect(() => {
    // This will run when the component mounts
    refreshBackupData();
    
    // Set up an interval to refresh every 30 seconds while the screen is visible
    const intervalId = setInterval(() => {
      refreshBackupData();
    }, 30000);
    
    // Clean up the interval when component unmounts
    return () => clearInterval(intervalId);
  }, []);
  
  // Perform manual backup
  const handleBackupNow = async () => {
    if (sessions.length === 0) {
      Alert.alert('No Data', 'There are no sessions to backup.');
      return;
    }
    
    setIsBackingUp(true);
    
    try {
      const result = await BackupService.backupToGitHub(sessions);
      if (result.success) {
        // Refresh last backup time
        const lastBackup = await BackupService.getLastBackupTime();
        setLastBackupTime(lastBackup);
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Backup Failed', result.message || 'Unknown error occurred');
      }
    } catch (error) {
      Alert.alert('Backup Error', error.message || 'Failed to complete backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Add this function to refresh backup data
  const refreshBackupData = async () => {
    try {
      // Get last backup time
      const lastBackup = await BackupService.getLastBackupTime();
      setLastBackupTime(lastBackup);
      
      // Get auto-backup status
      const autoBackup = await BackupService.getAutoBackupStatus();
      setAutoBackupEnabled(autoBackup);
      
      // Get all sessions from database
      const allSessions = await Database.getAllSessions();
      if (allSessions && Array.isArray(allSessions)) {
        setSessions(allSessions);
      }

      // Check for queued sessions
      await checkQueuedSessionsCount();
    } catch (error) {
      console.error('Error refreshing backup data:', error);
    }
  };
  
  // Toggle auto-backup
  const toggleAutoBackup = async () => {
    try {
      const newStatus = await BackupService.toggleAutoBackup();
      setAutoBackupEnabled(newStatus);
    } catch (error) {
      console.error('Error toggling auto-backup:', error);
    }
  };
  
  // Test connection to GitHub API
  const testGitHubConnection = async () => {
    setIsTestingConnection(true);
    
    try {
      const result = await BackupService.testGitHubApiConnection();
      Alert.alert(
        result.success ? 'Connection Successful' : 'Connection Failed', 
        result.message
      );
    } catch (error) {
      Alert.alert('Test Failed', error.message || 'Could not test connection');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Check how many sessions are queued for backup
  const checkQueuedSessionsCount = async () => {
    try {
      const pendingBackups = await AsyncStorage.getItem('pendingBackups');
      const backupsArray = pendingBackups ? JSON.parse(pendingBackups) : [];
      setQueuedSessionsCount(backupsArray.length);
    } catch (error) {
      console.error('Error checking queued sessions count:', error);
      setQueuedSessionsCount(0);
    }
  };

  // Handle processing queued backups manually
  const handleProcessQueuedBackups = async () => {
    // If already processing, don't start again
    if (isProcessingQueued) {
      return;
    }

    // Check if we're online
    if (connectionStatus !== 'online') {
      Alert.alert('Offline', 'You must be online to process queued backups.');
      return;
    }
    
    // Check if there are any queued backups
    if (queuedSessionsCount === 0) {
      Alert.alert('No Queued Backups', 'There are no queued sessions to back up.');
      return;
    }

    // Check if already backing up via the main backup process
    if (isBackingUp) {
      Alert.alert(
        'Backup in Progress', 
        'A backup is already in progress. Please wait for it to complete before processing queued backups.'
      );
      return;
    }
    
    setIsProcessingQueued(true);
    
    try {
      console.log("Manually processing queued backups...");
      // Use the existing processPendingBackups function
      const result = await BackupService.processPendingBackups();
      
      console.log("Process pending backups result:", result);
      
      if (result.success) {
        // Update the UI with the number of processed backups
        await checkQueuedSessionsCount(); // Refresh the count
        
        // Show success message
        Alert.alert(
          "Backup Complete",
          `Successfully processed ${result.processed} queued ${result.processed === 1 ? 'session' : 'sessions'}.`,
          [{ text: "OK" }]
        );
        
        // Refresh the backup time
        const lastBackup = await BackupService.getLastBackupTime();
        setLastBackupTime(lastBackup);
      } else {
        Alert.alert("Backup Failed", result.message || "Failed to process queued backups");
      }
    } catch (error) {
      console.error("Error processing queued backups:", error);
      Alert.alert("Backup Error", error.message || "An unexpected error occurred");
    } finally {
      setIsProcessingQueued(false);
    }
  };
  
  return (
    <View style={styles.container}>
      <Surface style={styles.card}>
        <Title style={styles.title}>Backup Controls</Title>
        
        <View style={styles.statusContainer}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Connection Status:</Text>
            <View style={styles.statusValue}>
              {connectionStatus === 'checking' ? (
                <ActivityIndicator size={16} color="#24325f" style={styles.statusIcon} />
              ) : (
                <MaterialCommunityIcons 
                  name={connectionStatus === 'online' ? 'wifi' : 'wifi-off'} 
                  size={20} 
                  color={connectionStatus === 'online' ? '#4CAF50' : '#F44336'} 
                  style={styles.statusIcon}
                />
              )}
              <Text style={[
                styles.statusText, 
                connectionStatus === 'online' ? styles.statusOnline : 
                connectionStatus === 'offline' ? styles.statusOffline : {}
              ]}>
                {connectionStatus === 'checking' ? 'Checking...' : 
                connectionStatus === 'online' ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Last Backup:</Text>
            <Text style={styles.statusText}>
              {lastBackupTime}
            </Text>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Queued Sessions:</Text>
            <Text style={styles.statusText}>
              {queuedSessionsCount}
            </Text>
          </View>       
        </View>               
        <View style={styles.backupControls}>
          <Button 
            mode="contained" 
            icon="cloud-upload"
            style={[styles.primaryButton]}
            labelStyle={[styles.primaryButtonText]}
            onPress={handleBackupNow}
            loading={isBackingUp}
            disabled={isBackingUp || isProcessingQueued || connectionStatus !== 'online'}
            uppercase={false}
          >
            {isBackingUp ? 'Backing up...' : 'Backup All Sessions'}
          </Button>
          
          <Button 
            mode="contained" 
            icon="file-sync"
            style={[styles.primaryButton]}
            labelStyle={[styles.primaryButtonText]}
            onPress={handleProcessQueuedBackups}
            loading={isProcessingQueued}
            disabled={isBackingUp || isProcessingQueued || connectionStatus !== 'online' || queuedSessionsCount === 0}
            uppercase={false}
          >
            {isProcessingQueued ? 'Processing...' : `Backup Queued Sessions (${queuedSessionsCount})`}
          </Button>
              
          <Text style={styles.noteText}>
            {autoBackupEnabled 
              ? 'Auto-backup is enabled. Backups will occur at app startup and when sessions end.' 
              : 'Auto-backup is disabled. Use the buttons above to manually backup your data.'}
          </Text>
        </View>
      </Surface>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f9f9f9', // Matches --light-bg
  },
  card: {
    padding: 16,
    borderRadius: 8,
    elevation: 4,
    backgroundColor: '#ffffff', // Matches --card-bg
  },
  title: {
    fontSize: 20,
    marginBottom: 24,
    color: '#24325f', // Matches --primary-color
    fontWeight: 'bold',
  },
  statusContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#24325f',
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'white',
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statusLabel: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: 16,
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 16,
    color: '#444',
  },
  statusOnline: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  statusOffline: {
    color: '#951d1e', // Matches --secondary-color
    fontWeight: 'bold',
  },
  backupControls: {
    alignItems: 'center',
  },
  backupButtonText: {
    color: 'white',
  },
  testButtonText: {
    color: 'white',
  },
  noteText: {
    fontSize: 14,
    color: '#24325f',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  primaryButton: {
    backgroundColor: '#24325f',
    borderColor: '#24325f',
    marginBottom: 16,
    width: '90%',
  },
  primaryButtonText: {
    color: 'white',
  },
  secondaryButton: {
    backgroundColor: '#951d1e',
    borderColor: '#24325f',
    marginBottom: 16,
    width: '90%',
  },
  secondaryButtonText: {
    color: 'white',
  },
});

export default BackupScreen;
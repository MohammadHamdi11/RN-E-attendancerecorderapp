import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Surface, Title, Divider, ActivityIndicator, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as BackupService from '../services/backup';
import * as Database from '../services/database';
import NetInfo from '@react-native-community/netinfo';

const BackupScreen = () => {
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [lastBackupTime, setLastBackupTime] = useState('Never');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [sessions, setSessions] = useState([]);
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
        <Text style={styles.statusLabel}>Auto Backup:</Text>
        <Switch
          value={autoBackupEnabled}
          onValueChange={toggleAutoBackup}
          color="#24325f"
        />
      </View>
    </View>
    
    <Divider style={styles.divider} />
    
    <View style={styles.backupControls}>
      <Button 
        mode="contained" 
        icon="cloud-upload"
        style={styles.backupButton}
        labelStyle={styles.backupButtonText}
        onPress={handleBackupNow}
        loading={isBackingUp}
        disabled={isBackingUp || connectionStatus !== 'online'}
      >
        {isBackingUp ? 'Backing up...' : 'Backup Now'}
      </Button>
      
      <Button 
        mode="outlined" 
        icon="connection"
        style={styles.testButton}
        labelStyle={styles.testButtonText}
        onPress={testGitHubConnection}
        loading={isTestingConnection}
        disabled={isTestingConnection || connectionStatus !== 'online'}
          >
            Test Repository Connection
          </Button>
          
          <Text style={styles.noteText}>
            {autoBackupEnabled 
              ? 'Auto-backup is enabled. Backups will occur at app startup and when sessions end.' 
              : 'Auto-backup is disabled. Use the "Backup Now" button to manually backup your data.'}
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
    borderBottomColor: '#24325f',
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
  divider: {
    marginVertical: 16,
    height: 1,
    backgroundColor: '#24325f',
    width: '100%',
  },
  backupControls: {
    alignItems: 'center',
  },
  backupButton: {
    marginBottom: 16,
    paddingVertical: 6,
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
    width: '80%',
  },
  backupButtonText: {
    color: 'white',
  },
  testButton: {
    marginBottom: 16,
    paddingVertical: 6,
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
    width: '80%',
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
  },
});

export default BackupScreen;
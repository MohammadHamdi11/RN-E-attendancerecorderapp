// screens/AccountScreen.js
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Button, Card, Title, Text, Divider, List } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut, getCurrentUser, isUserAdmin, refreshCredentials } from '../services/auth';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { useNavigation } from '@react-navigation/native';
import { Platform } from 'react-native';

const AccountScreen = (props) => {
  const [userData, setUserData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    loadUserData();
    checkConnectivity();
    
    // Auto-sync on component mount if online
    checkAndSyncData();

    // Set up network listener for auto-sync when coming online
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable;
      setIsOnline(online);
      if (online) {
        checkAndSyncData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadUserData = async () => {
    try {
      const user = await getCurrentUser();
      const adminStatus = await isUserAdmin();
      setUserData(user);
      setIsAdmin(adminStatus);
      
      // Load last sync time
      const syncTime = await AsyncStorage.getItem('lastCredentialsSync');
      if (syncTime) {
        setLastSync(new Date(parseInt(syncTime)).toLocaleString());
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const checkAndSyncData = async () => {
    try {
      const networkState = await NetInfo.fetch();
      if (networkState.isConnected && networkState.isInternetReachable) {
        // Auto-sync happens here
        const result = await refreshCredentials();
        if (result.success) {
          const now = new Date();
          setLastSync(now.toLocaleString());
          await AsyncStorage.setItem('lastCredentialsSync', now.getTime().toString());
          
          // ADDED: Reload user data to reflect changes
          await loadUserData();
        }
      }
    } catch (error) {
      console.error('Error during auto-sync:', error);
    }
  };

  const checkConnectivity = async () => {
    const state = await NetInfo.fetch();
    setIsOnline(state.isConnected && state.isInternetReachable);
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          onPress: async () => {
            try {
              const success = await signOut();
              if (success) {
                props.onSignOut(); // Call the prop from App.js
              } else {
                Alert.alert('Error', 'Failed to sign out. Please try again.');
              }
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'An unexpected error occurred.');
            }
          },
        },
      ]
    );
  };

  const handleRefreshCredentials = async () => {
    if (!isOnline) {
      Alert.alert('Error', 'No internet connection. Please connect to the internet and try again.');
      return;
    }

    Alert.alert(
      'Refresh Credentials',
      'This will download the latest user credentials from the server. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Refresh',
          onPress: async () => {
            try {
              const result = await refreshCredentials();
              if (result.success) {
                // Set last sync time
                const now = new Date();
                setLastSync(now.toLocaleString());
                await AsyncStorage.setItem('lastCredentialsSync', now.getTime().toString());
                
                // Reload user data to reflect changes
                await loadUserData();
                
                Alert.alert('Success', 'Credentials refreshed successfully.');
              } else {
                Alert.alert('Error', result.message || 'Failed to refresh credentials.');
              }
            } catch (error) {
              Alert.alert('Error', 'An unexpected error occurred.');
              console.error('Error refreshing credentials:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.cardTitle}>Account Information</Title>
          <Divider style={styles.divider} />
          <Text style={styles.infoText}>Email: {userData?.email || 'Not available'}</Text>
          <Text style={styles.infoText}>Role: {isAdmin ? 'Administrator' : 'User'}</Text>
          <Text style={styles.infoText}>Name: {userData?.name || 'Not available'}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.cardTitle}>Credentials</Title>
          <Divider style={styles.divider} />
          <Text style={styles.infoText}>Last credential sync: {lastSync || 'Never'}</Text>
          <Text style={[styles.infoText, styles.connectionStatus]}>
            Status: {isOnline ? 'Online' : 'Offline'}
          </Text>
          
          <Button
            mode="contained"
            onPress={handleRefreshCredentials}
            disabled={!isOnline}
            style={styles.actionButton}
            labelStyle={styles.buttonLabel}
            icon="refresh"
          >
            Refresh Credentials
          </Button>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleSignOut}
        style={[styles.actionButton, styles.signOutButton]}
        labelStyle={styles.buttonLabel}
        icon="logout"
      >
        Sign Out
      </Button>

      <Text style={styles.versionText}>Faculty of Medicine, Ain Shams University</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 10,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardTitle: {
    color: '#24325f',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  divider: {
    marginVertical: 8,
    backgroundColor: '#e0e0e0',
    height: 1,
  },
  infoText: {
    fontSize: 14,
    color: '#333333',
    marginVertical: 4,
  },
  actionButton: {
    marginTop: 16,
    backgroundColor: '#24325f',
    borderRadius: 4,
    paddingVertical: 6,
  },
  buttonLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  signOutButton: {
    backgroundColor: '#951d1e',
    marginTop: 20,
    marginBottom: 20,
  },
  versionText: {
    textAlign: 'center',
    color: '#888',
    marginBottom: 20,
    fontSize: 12,
  },
  connectionStatus: {
    marginTop: 8,
    fontWeight: 'bold',
  },
});

export default AccountScreen;
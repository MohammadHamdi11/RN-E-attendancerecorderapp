// components/NetworkStatus.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const NetworkStatus = ({ isOnline, pendingOperations = 0 }) => {
  if (isOnline && pendingOperations === 0) {
    return null; // Don't show anything when online with no pending operations
  }

  return (
    <View style={[
      styles.container,
      isOnline ? styles.onlineContainer : styles.offlineContainer
    ]}>
      <MaterialCommunityIcons
        name={isOnline ? "cloud-sync" : "cloud-off-outline"}
        size={16}
        color={isOnline ? "#fff" : "#fff"}
      />
      <Text style={styles.text}>
        {isOnline
          ? `Syncing ${pendingOperations} item${pendingOperations !== 1 ? 's' : ''}...`
          : "You're offline. Changes will be saved locally."}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  offlineContainer: {
    backgroundColor: '#b52424',
  },
  onlineContainer: {
    backgroundColor: '#2196F3',
  },
  text: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 12,
  }
});

export default NetworkStatus;
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { processPendingBackups } from './backup';

// Define the background task name
const BACKGROUND_SYNC_TASK = 'background-sync-task';

// Register the background task handler
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  console.log('[Background Sync] Background task executed');
  
  try {
    // Check network status
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected;
    
    console.log('[Background Sync] Network status:', isConnected ? 'Connected' : 'Disconnected');
    
    if (!isConnected) {
      console.log('[Background Sync] Device is offline, skipping sync');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    
    // Process pending backups
    console.log('[Background Sync] Device is online, processing pending backups');
    const result = await processPendingBackups();
    
    // Update last sync time
    await AsyncStorage.setItem('lastBackgroundSyncTime', new Date().toISOString());
    
    console.log('[Background Sync] Task completed:', result);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[Background Sync] Task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register the background fetch task
export const registerBackgroundSync = async () => {
  try {
    // Make sure the task is unregistered before registering again
    await unregisterBackgroundSync();
    
    // Register with more aggressive settings
    const status = await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes in seconds (minimum allowed by iOS)
      stopOnTerminate: false,    // Keep running after app is closed
      startOnBoot: true,         // Start after device reboot
    });
    
    console.log('[Background Sync] Task registered with status:', status);
    
    // Force an immediate check
    BackgroundFetch.setMinimumIntervalAsync(15 * 60); // 15 minutes (iOS minimum)
    
    // Test that the task is registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    console.log('[Background Sync] Is task registered?', isRegistered);
    
    return true;
  } catch (error) {
    console.error('[Background Sync] Failed to register task:', error);
    return false;
  }
};

// Unregister the background task
export const unregisterBackgroundSync = async () => {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('[Background Sync] Task unregistered');
    }
  } catch (error) {
    console.error('[Background Sync] Error unregistering task:', error);
  }
};

// Check if background sync is registered
export const isBackgroundSyncRegistered = async () => {
  return await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
};

// Get last background sync time
export const getLastBackgroundSyncTime = async () => {
  try {
    const lastSync = await AsyncStorage.getItem('lastBackgroundSyncTime');
    if (!lastSync) return 'Never';
    
    const syncDate = new Date(lastSync);
    // Format date as dd/mm/yyyy HH:MM:SS
    const day = String(syncDate.getDate()).padStart(2, '0');
    const month = String(syncDate.getMonth() + 1).padStart(2, '0');
    const year = syncDate.getFullYear();
    const hours = String(syncDate.getHours()).padStart(2, '0');
    const minutes = String(syncDate.getMinutes()).padStart(2, '0');
    const seconds = String(syncDate.getSeconds()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error('[Background Sync] Error getting last sync time:', error);
    return 'Error';
  }
};

// Force a manual sync (useful for testing)
export const forceSyncNow = async () => {
  try {
    console.log('[Background Sync] Forcing manual sync');
    
    // First check if task is registered, if not try to register
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!isRegistered) {
      console.log('[Background Sync] Task not registered, trying to register');
      await registerBackgroundSync();
    }
    
    // Check network status
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected;
    
    if (!isConnected) {
      return { success: false, message: 'Device is offline, please try again when online.' };
    }
    
    const result = await processPendingBackups();
    
    // Update last sync time
    await AsyncStorage.setItem('lastBackgroundSyncTime', new Date().toISOString());
    
    return { 
      success: result.success, 
      message: result.message || 'Sync completed' 
    };
  } catch (error) {
    console.error('[Background Sync] Force sync error:', error);
    return { success: false, message: `Sync failed: ${error.message}` };
  }
};

// Add this to background.js
export const getBackgroundStatus = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    const lastSync = await AsyncStorage.getItem('lastBackgroundSyncTime');
    const lastSyncTime = lastSync ? new Date(lastSync) : null;
    
    // Calculate time since last sync
    let timeSinceSync = 'Never';
    if (lastSyncTime) {
      const now = new Date();
      const diffMs = now - lastSyncTime;
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 60) {
        timeSinceSync = `${diffMins} minutes ago`;
      } else {
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) {
          timeSinceSync = `${diffHours} hours ago`;
        } else {
          const diffDays = Math.floor(diffHours / 24);
          timeSinceSync = `${diffDays} days ago`;
        }
      }
    }
    
    return {
      isRegistered,
      lastSync: lastSyncTime ? lastSyncTime.toLocaleString() : 'Never',
      timeSinceSync,
      pendingCount: JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]').length
    };
  } catch (error) {
    console.error('Error getting background status:', error);
    return { 
      isRegistered: false, 
      lastSync: 'Error', 
      timeSinceSync: 'Error',
      pendingCount: 0,
      error: error.message
    };
  }
};
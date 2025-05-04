import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { processPendingBackups } from './backup';
import { Platform } from 'react-native';

// Define the background task name
const BACKGROUND_SYNC_TASK = 'background-sync-task';

// Register the background task handler
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  console.log('[Background Sync] Background task executed');
  
  try {
    // First check if there are pending backups - if not, skip the sync
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    if (pendingBackups.length === 0) {
      console.log('[Background Sync] No pending backups, skipping sync');
      return BackgroundTask.Result.NoData;
    }
    
    // Check network status
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected && netInfo.isInternetReachable;
    
    console.log('[Background Sync] Network status:', isConnected ? 'Connected' : 'Disconnected');
    
    if (!isConnected) {
      console.log('[Background Sync] Device is offline, skipping sync');
      return BackgroundTask.Result.NoData;
    }
    
    // Process pending backups
    console.log('[Background Sync] Device is online, processing pending backups');
    const result = await processPendingBackups();
    
    // Update last sync time
    await AsyncStorage.setItem('lastBackgroundSyncTime', new Date().toISOString());
    
    console.log('[Background Sync] Task completed:', result);
    return BackgroundTask.Result.Success;
  } catch (error) {
    console.error('[Background Sync] Task error:', error);
    return BackgroundTask.Result.Failed;
  }
});

// Register the background task
export const registerBackgroundSync = async () => {
  try {
    // First check if there are any pending backups
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    
    // Make sure the task is unregistered before registering again
    await unregisterBackgroundSync();
    
    // Only register background task if there are pending backups
    if (pendingBackups.length > 0) {
      // Register the background task with a 5-minute interval
      const options = {
        minimumInterval: 5 * 60, // 5 minutes in seconds
        stopOnTerminate: false,  // Keep running after app is closed
        startOnBoot: true        // Start after device reboot
      };
      
      const status = await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, options);
      
      console.log('[Background Sync] Task registered with status:', status);
      
      // Set the minimum interval to 5 minutes
      await BackgroundTask.setMinimumIntervalAsync(5 * 60);
      
      // Test that the task is registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      console.log('[Background Sync] Is task registered?', isRegistered);
      
      return true;
    } else {
      console.log('[Background Sync] No pending backups, not registering background task');
      return false;
    }
  } catch (error) {
    console.error('[Background Sync] Failed to register task:', error);
    return false;
  }
};

// Unregister the background task
export const unregisterBackgroundSync = async () => {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
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
    
    // Check for pending backups
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    if (pendingBackups.length === 0) {
      return { success: true, message: 'No pending backups to sync.' };
    }
    
    // Check network status
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected && netInfo.isInternetReachable;
    
    if (!isConnected) {
      // Re-register the background task to ensure it will check when internet is restored
      await registerBackgroundSync();
      return { success: false, message: 'Device is offline, background sync scheduled.' };
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

// Check for pending backups and register background sync if needed
export const updateBackgroundSyncIfNeeded = async () => {
  try {
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    
    if (pendingBackups.length > 0 && !isRegistered) {
      console.log('[Background Sync] Pending backups found, registering background sync');
      return await registerBackgroundSync();
    } else if (pendingBackups.length === 0 && isRegistered) {
      console.log('[Background Sync] No pending backups, unregistering background sync');
      await unregisterBackgroundSync();
    }
    return isRegistered;
  } catch (error) {
    console.error('[Background Sync] Error updating background sync:', error);
    return false;
  }
};

// Get background status
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
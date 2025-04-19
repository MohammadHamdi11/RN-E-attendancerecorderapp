import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { processPendingBackups } from './backup';

// Define the background task name
const BACKGROUND_SYNC_TASK = 'background-sync-task';

// Register the background task handler
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log('[Background Sync] Background task executed');
    
    // Check if we're online
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected && netInfo.isInternetReachable;
    
    if (!isConnected) {
      console.log('[Background Sync] Device is offline, skipping sync');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    
    // We're online, so process any pending backups
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
    // Unregister any existing task first to avoid duplicates
    await unregisterBackgroundSync();
    
    // Register the new task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 2 * 60 * 60, // 2 hours in seconds
      stopOnTerminate: false, // Keep running after app is closed
      startOnBoot: true, // Start after device reboot
    });
    
    console.log('[Background Sync] Task registered successfully');
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
    // Use the same logic as the background task
    const netInfo = await NetInfo.fetch();
    const isConnected = netInfo.isConnected && netInfo.isInternetReachable;
    
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
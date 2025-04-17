// utils/offlineStorage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// Queue an operation for when app comes back online
export const queueOfflineOperation = async (operation) => {
  try {
    // Validate operation object
    if (!operation || !operation.type) {
      console.error('Invalid operation object');
      return false;
    }

    // Set default properties
    const completeOperation = {
      id: `op_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      ...operation
    };

    // Get current queue
    const queueKey = `pending${operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}s`;
    const queueString = await AsyncStorage.getItem(queueKey) || '[]';
    const queue = JSON.parse(queueString);

    // Add operation to queue
    queue.push(completeOperation);

    // Save updated queue
    await AsyncStorage.setItem(queueKey, JSON.stringify(queue));

    console.log(`Operation queued for when online: ${operation.type}`);
    return true;
  } catch (error) {
    console.error('Error queuing offline operation:', error);
    return false;
  }
};

// Get all pending operations
export const getPendingOperations = async () => {
  try {
    const operations = {
      backups: [],
      exports: [],
      syncs: []
    };

    // Get all types of pending operations
    const pendingBackups = await AsyncStorage.getItem('pendingBackups') || '[]';
    operations.backups = JSON.parse(pendingBackups);

    const pendingExports = await AsyncStorage.getItem('pendingExports') || '[]';
    operations.exports = JSON.parse(pendingExports);

    const pendingSyncs = await AsyncStorage.getItem('pendingSyncs') || '[]';
    operations.syncs = JSON.parse(pendingSyncs);

    // Calculate total
    operations.total = operations.backups.length +
                      operations.exports.length +
                      operations.syncs.length;

    return operations;
  } catch (error) {
    console.error('Error getting pending operations:', error);
    return { backups: [], exports: [], syncs: [], total: 0 };
  }
};

// Clear a specific operation from the queue
export const clearPendingOperation = async (type, id) => {
  try {
    const queueKey = `pending${type.charAt(0).toUpperCase() + type.slice(1)}s`;
    const queueString = await AsyncStorage.getItem(queueKey) || '[]';
    const queue = JSON.parse(queueString);

    // Filter out the operation
    const updatedQueue = queue.filter(op => op.id !== id);

    // Save updated queue
    await AsyncStorage.setItem(queueKey, JSON.stringify(updatedQueue));

    return true;
  } catch (error) {
    console.error(`Error clearing pending ${type} operation:`, error);
    return false;
  }
};

// Exports
export default {
  queueOfflineOperation,
  getPendingOperations,
  clearPendingOperation
};
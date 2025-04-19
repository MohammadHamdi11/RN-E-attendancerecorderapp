import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define the background task name
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

// Configure how notifications should be handled when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Function to send the backup reminder
async function sendBackupReminder() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Backup Reminder",
      body: "Open the app to ensure your files are backed up!",
      data: { screen: 'Backup' },
      // Android-specific settings using your existing icon
      android: {
        smallIcon: 'notification_icon', // Default name Expo will use
      },
      // iOS will automatically use apple-touch-icon.png
    },
    trigger: null, // Send immediately
  });
}

// Register the background task
async function registerBackgroundTask() {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
      minimumInterval: 6 * 60 * 60, // Check every 6 hours
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.log("Background task registration failed:", err);
  }
}

// Request notification permissions
async function requestPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.log('Notification permissions not granted');
    return false;
  }
  return true;
}

// Initialize notifications
async function initNotifications() {
  await requestPermissions();
  await registerBackgroundTask();
}

// Register the background task handler
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  const now = new Date();
  
  // Check if we need to send a notification (once per day)
  const lastNotification = await AsyncStorage.getItem('@last_backup_notification');
  const lastBackup = await AsyncStorage.getItem('@last_backup_time');
  
  if (!lastNotification || new Date(lastNotification).getDate() !== now.getDate()) {
    if (!lastBackup || (now - new Date(lastBackup)) > 24 * 60 * 60 * 1000) {
      await sendBackupReminder();
      await AsyncStorage.setItem('@last_backup_notification', now.toISOString());
    }
  }
  
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

// Single export statement at the bottom
export { initNotifications, sendBackupReminder };
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define task names
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';
const DAILY_NOTIFICATION_TASK = 'daily-notification-task';

// Configure how notifications should be handled when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Function to record app usage time
export async function recordAppUsage() {
  try {
    await AsyncStorage.setItem('@last_app_usage', new Date().toISOString());
    console.log('[Notifications] App usage recorded');
  } catch (error) {
    console.error('[Notifications] Error recording app usage:', error);
  }
}

// Function to send the backup reminder
async function sendBackupReminder(title = "Backup Reminder", body = "Open the app to ensure your files are backed up!") {
  try {
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    
    // Only send notification if there are pending backups
    if (pendingBackups.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title,
          body: body + ` (${pendingBackups.length} pending backups)`,
          data: { screen: 'Backup' },
          // Android-specific settings using your existing icon
          android: {
            smallIcon: 'notification_icon', // Default name Expo will use
            channelId: 'backup-reminders',
          },
          // iOS will automatically use apple-touch-icon.png
        },
        trigger: null, // Send immediately
      });
      console.log('[Notifications] Backup reminder sent');
      
      // Record that we sent a notification
      await AsyncStorage.setItem('@last_backup_notification', new Date().toISOString());
      return true;
    } else {
      console.log('[Notifications] No pending backups, skipping notification');
      return false;
    }
  } catch (error) {
    console.error('[Notifications] Error sending notification:', error);
    return false;
  }
}

// Schedule the daily 7 PM notification
async function scheduleDailyNotification() {
  try {
    // Cancel any existing scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Schedule for 7:00 PM today
    const now = new Date();
    const scheduledTime = new Date(now);
    scheduledTime.setHours(19, 0, 0, 0); // 7:00 PM
    
    // If it's already past 7 PM, schedule for tomorrow
    if (now > scheduledTime) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    // Calculate seconds until scheduled time
    const secondsUntil = Math.floor((scheduledTime - now) / 1000);
    
    console.log(`[Notifications] Scheduling daily notification for ${scheduledTime.toLocaleString()}`);
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Daily Backup Check",
        body: "Time to check if your attendance data is backed up!",
        data: { screen: 'Backup' },
        android: {
          smallIcon: 'notification_icon',
          channelId: 'backup-reminders',
        },
      },
      trigger: {
        seconds: secondsUntil,
        repeats: true,
      },
    });
    
    console.log('[Notifications] Daily notification scheduled');
    return true;
  } catch (error) {
    console.error('[Notifications] Error scheduling daily notification:', error);
    return false;
  }
}

// Register the background tasks
async function registerBackgroundTasks() {
  try {
    // Register the background notification task
    if (!await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK)) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
        minimumInterval: 60 * 60, // Check every hour
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[Notifications] Background notification task registered');
    }
    
    // Schedule the daily notification
    await scheduleDailyNotification();
    
    return true;
  } catch (err) {
    console.error("[Notifications] Background task registration failed:", err);
    return false;
  }
}

// Request notification permissions
async function requestPermissions() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('[Notifications] Notification permissions not granted');
      return false;
    }
    
    // Create notification channels for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('backup-reminders', {
        name: 'Backup Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    
    return true;
  } catch (error) {
    console.error('[Notifications] Error requesting permissions:', error);
    return false;
  }
}

// Initialize notifications
export async function initNotifications() {
  try {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      console.log('[Notifications] Could not initialize notifications: permissions not granted');
      return false;
    }
    
    await registerBackgroundTasks();
    
    // Record initial app usage
    await recordAppUsage();
    
    console.log('[Notifications] Notifications initialized successfully');
    return true;
  } catch (error) {
    console.error('[Notifications] Error initializing notifications:', error);
    return false;
  }
}

// Register the background task handler
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    console.log('[Notifications] Background task executing');
    
    // Check if there are any pending backups
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    if (pendingBackups.length === 0) {
      console.log('[Notifications] No pending backups, no notification needed');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    
    const now = new Date();
    
    // Check if we've already sent a notification today
    const lastNotification = await AsyncStorage.getItem('@last_backup_notification');
    if (lastNotification) {
      const lastNotifDate = new Date(lastNotification);
      if (now.getDate() === lastNotifDate.getDate() && 
          now.getMonth() === lastNotifDate.getMonth() && 
          now.getFullYear() === lastNotifDate.getFullYear()) {
        console.log('[Notifications] Already sent a notification today, skipping');
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
    }
    
    // Check if app was used in the last hour
    const lastUsage = await AsyncStorage.getItem('@last_app_usage');
    if (lastUsage) {
      const lastUsageDate = new Date(lastUsage);
      const hoursSinceUsage = (now - lastUsageDate) / (1000 * 60 * 60);
      
      if (hoursSinceUsage >= 1) {
        // If it's been at least 1 hour since the app was used, send a reminder
        console.log('[Notifications] App not used for 1+ hours, sending reminder');
        await sendBackupReminder(
          "Backup Reminder", 
          "You haven't used the app in a while. Remember to backup your data!"
        );
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    }
    
    // Default return if no notification was sent
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('[Notifications] Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Force a notification (for testing)
export async function forceSendNotification() {
  try {
    const result = await sendBackupReminder(
      "Test Notification",
      "This is a test notification from the Attendance Recorder app."
    );
    return result;
  } catch (error) {
    console.error('[Notifications] Error sending test notification:', error);
    return false;
  }
}

// Schedule reminder for one hour after app is closed
export async function scheduleInactivityReminder() {
  try {
    // Check if there are pending backups
    const pendingBackups = JSON.parse(await AsyncStorage.getItem('pendingBackups') || '[]');
    if (pendingBackups.length === 0) {
      console.log('[Notifications] No pending backups, not scheduling inactivity reminder');
      return false;
    }
    
    // Schedule for 1 hour from now
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "App Inactivity Reminder",
        body: "You haven't used the Attendance Recorder app for a while. Remember to check your pending backups!",
        data: { screen: 'Backup' },
        android: {
          smallIcon: 'notification_icon',
          channelId: 'backup-reminders',
        },
      },
      trigger: {
        seconds: 60 * 60, // 1 hour
      },
    });
    
    console.log('[Notifications] Inactivity reminder scheduled for 1 hour from now');
    return true;
  } catch (error) {
    console.error('[Notifications] Error scheduling inactivity reminder:', error);
    return false;
  }
}
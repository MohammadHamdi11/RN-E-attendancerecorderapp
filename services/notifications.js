import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Define task names
const TWICE_DAILY_NOTIFICATION_TASK = 'twice-daily-notification-task';

// Configure how notifications should be handled when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Schedule twice daily notifications at 7 AM and 7 PM
async function scheduleTwiceDailyNotifications() {
  try {
    // Cancel any existing scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    const now = new Date();
    
    // Schedule for 7:00 AM today
    const morningTime = new Date(now);
    morningTime.setHours(7, 0, 0, 0); // 7:00 AM
    
    // Schedule for 7:00 PM today
    const eveningTime = new Date(now);
    eveningTime.setHours(19, 0, 0, 0); // 7:00 PM
    
    // If it's already past 7 AM, schedule for tomorrow
    if (now > morningTime) {
      morningTime.setDate(morningTime.getDate() + 1);
    }
    
    // If it's already past 7 PM, schedule for tomorrow
    if (now > eveningTime) {
      eveningTime.setDate(eveningTime.getDate() + 1);
    }
    
    // Calculate seconds until scheduled times
    const secondsUntilMorning = Math.floor((morningTime - now) / 1000);
    const secondsUntilEvening = Math.floor((eveningTime - now) / 1000);
    
    console.log(`[Notifications] Scheduling morning notification for ${morningTime.toLocaleString()}`);
    console.log(`[Notifications] Scheduling evening notification for ${eveningTime.toLocaleString()}`);
    
    // Schedule morning notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Morning Backup Check",
        body: "Time to check if your attendance data is backed up!",
        data: { screen: 'Backup' },
        android: {
          smallIcon: 'notification_icon',
          channelId: 'backup-reminders',
        },
      },
      trigger: {
        seconds: secondsUntilMorning,
        repeats: true,
      },
    });
    
    // Schedule evening notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Evening Backup Check",
        body: "Time to check if your attendance data is backed up!",
        data: { screen: 'Backup' },
        android: {
          smallIcon: 'notification_icon',
          channelId: 'backup-reminders',
        },
      },
      trigger: {
        seconds: secondsUntilEvening,
        repeats: true,
      },
    });
    
    console.log('[Notifications] Twice daily notifications scheduled successfully');
    return true;
  } catch (error) {
    console.error('[Notifications] Error scheduling notifications:', error);
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
    
    await scheduleTwiceDailyNotifications();
    
    console.log('[Notifications] Notifications initialized successfully');
    return true;
  } catch (error) {
    console.error('[Notifications] Error initializing notifications:', error);
    return false;
  }
}

// Force a notification (for testing)
export async function forceSendNotification() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Test Notification",
        body: "This is a test notification from the Attendance Recorder app.",
        data: { screen: 'Backup' },
        android: {
          smallIcon: 'notification_icon',
          channelId: 'backup-reminders',
        },
      },
      trigger: null, // Send immediately
    });
    
    console.log('[Notifications] Test notification sent');
    return true;
  } catch (error) {
    console.error('[Notifications] Error sending test notification:', error);
    return false;
  }
}
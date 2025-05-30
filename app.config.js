export default {
  name: "qr-scanner-app",
  expo: {
    name: "Attendance Recorder",
    slug: "qr-scanner-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/app-icon.png",
    userInterfaceStyle: "light", 
    entryPoint: "./App.js",
    splash: {
      image: "./assets/apple-touch-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    updates: {
      fallbackToCacheTimeout: 0,
      url: "https://u.expo.dev/36cc9f80-6e6f-419a-b970-583f5b4451d9",
      enabled: true,
      checkAutomatically: "ON_LOAD"
    },
    runtimeVersion: {
      policy: "sdkVersion"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      userInterfaceStyle: "light",
      bundleIdentifier: "com.yourcompany.attendancerecorder",
      infoPlist: {
        NSCameraUsageDescription: "Allow $(PRODUCT_NAME) to access your camera for scanning QR codes.",
        NSPhotoLibraryUsageDescription: "Allow $(PRODUCT_NAME) to access photos for saving exported data files.",
        NSPhotoLibraryAddUsageDescription: "Allow $(PRODUCT_NAME) to save exported files to your photo library.",
        NSUserNotificationAlertStyle: "alert",
        NSUserNotificationsUsageDescription: "Allow $(PRODUCT_NAME) to send you notifications about backup reminders.",
        NSDocumentsFolderUsageDescription: "Allow $(PRODUCT_NAME) to save exported files to the Documents folder.",
        NSDocumentPickerUsageDescription: "Allow $(PRODUCT_NAME) to access documents for file imports and exports.",
        NSFileProviderPresenceUsageDescription: "Allow $(PRODUCT_NAME) to access files for data import and export.",
        NSFileProviderDomainUsageDescription: "Allow $(PRODUCT_NAME) to manage files for your attendance data.",
        UIBackgroundModes: ["fetch", "processing", "process", "remote-notification"],
        UIRequiredDeviceCapabilities: ["armv7"]
      },
      backgroundModes: ["fetch", "processing", "remote-notification"]
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FFFFFF"
      },
      userInterfaceStyle: "light",
      package: "com.yourcompany.attendancerecorder",
      permissions: [
        "CAMERA",
        "VIBRATE",
        "ACCESS_NETWORK_STATE",
        "ACCESS_WIFI_STATE",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.ACTION_CREATE_DOCUMENT",
        "android.permission.ACTION_OPEN_DOCUMENT",
        "READ_MEDIA_IMAGES", 
        "READ_MEDIA_VIDEO",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION",
        "android.permission.DOWNLOAD_WITHOUT_NOTIFICATION",
        "android.permission.INTERNET",
        "RECEIVE_BOOT_COMPLETED",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.WAKE_LOCK",
        "android.permission.MANAGE_EXTERNAL_STORAGE",
        "android.permission.CREATE_DOCUMENTS",
        "android.permission.READ_DOCUMENTS",
        "android.permission.ACCESS_MEDIA_LOCATION",
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"
      ],
      versionCode: 1
    },
    web: {
      favicon: "./assets/favicon.ico"
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera for scanning QR codes."
        }
      ],
      [
        "expo-background-task"
      ],
      [
        "expo-sqlite"
      ],
      "expo-file-system",
      "expo-task-manager",
      "expo-background-task",
      [
        "expo-document-picker",
        {
          iCloudContainerEnvironment: "Production"
        }
      ],
      [
        "expo-media-library",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to save exported data files.",
          savePhotosPermission: "Allow $(PRODUCT_NAME) to save exported files to your photo library.",
          isAccessMediaLocationEnabled: true
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/notification_icon.png",
          color: "#24325f"
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "36cc9f80-6e6f-419a-b970-583f5b4451d9"
      }
    },
    owner: "mohammadhamdi11",
    channel: "production"
  }
};
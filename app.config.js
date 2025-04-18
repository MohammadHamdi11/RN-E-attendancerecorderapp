export default {
  name: "qr-scanner-app",
  expo: {
    name: "Attendance Recorder",
    slug: "qr-scanner-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/apple-touch-icon.png",
    entryPoint: "./App.js",
    splash: {
      image: "./assets/apple-touch-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    updates: {
      fallbackToCacheTimeout: 0
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.yourcompany.attendancerecorder",
      infoPlist: {
        NSCameraUsageDescription: "Allow $(PRODUCT_NAME) to access your camera for scanning QR codes.",
        NSPhotoLibraryUsageDescription: "Allow $(PRODUCT_NAME) to access photos for saving exported data files.",
        NSPhotoLibraryAddUsageDescription: "Allow $(PRODUCT_NAME) to save exported files to your photo library.",
        NSMicrophoneUsageDescription: "Allow $(PRODUCT_NAME) to access your microphone",
        UIBackgroundModes: ["fetch", "remote-notification"],
        NSUserNotificationAlertStyle: "alert",
        NSUserNotificationsUsageDescription: "Allow $(PRODUCT_NAME) to send you notifications about backup reminders.",
        NSDocumentsFolderUsageDescription: "Allow $(PRODUCT_NAME) to save exported files to the Documents folder."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/web-app-manifest-192x192.png",
        backgroundColor: "#FFFFFF"
      },
      package: "com.yourcompany.attendancerecorder",
      permissions: [
        "CAMERA",
        "VIBRATE",
        "ACCESS_NETWORK_STATE",
        "ACCESS_WIFI_STATE",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VIDEO",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.INTERNET",
        "RECEIVE_BOOT_COMPLETED",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.WAKE_LOCK"
      ],
      versionCode: 1
    },
    web: {
      favicon: "./assets/favicon.ico"
    },
    plugins: [
      [
        "expo-barcode-scanner",
        {
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera for scanning QR codes."
        }
      ],
      "expo-file-system",
      "expo-background-fetch",
      "expo-task-manager",
      [
        "expo-media-library",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to save exported data files.",
          savePhotosPermission: "Allow $(PRODUCT_NAME) to save exported files to your photo library.",
          isAccessMediaLocationEnabled: true
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "36cc9f80-6e6f-419a-b970-583f5b4451d9"
      }
    },
    owner: "mohammadhamdi11"
  }
};
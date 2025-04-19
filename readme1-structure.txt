QRScannerApp/
├── App.js                 # Main entry point
├── app.json               # Expo configuration
├── package.json           #
├── assets/                # Icons, images, etc.
│   ├── students_data.json
│   ├── Attendance Recorder App User Guide.pdf
│   ├── beep.mp3
│   ├── usercredentials.json
│   ├── admincredentials.json
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── web-app-manifest-192x192.png
│   ├── web-app-manifest-512x512.png
│   ├── favicon-96x96.png
├── components/            # Reusable UI components
│   └── NetworkStatus.js  #
├── screens/               # Main app screens
│   ├── LoginScreen.js     # sign in authentication screen
│   ├── ScannerScreen.js   # QR scanner screen
│   ├── ChecklistScreen.js # Student selector screen
│   ├── HistoryScreen.js   # History/records screen 
│   ├── BackupScreen.js    # Backup functionality
│   ├── AboutScreen.js     # App information
│   └── ContactScreen.js   # Contact/support
├── services/              # Business logic
│   ├── auth.js            # sign in authentication functionality
│   ├── recover.js         # recovery of interrupted sessions
│   ├── loaddata.js        # load the students data from excel file for the checklist screen
│   ├── database.js        # SQLite operations
│   ├── backup.js          # Backup functionality
│   ├── notifications.js   # push notifications
│   ├── export.js          # Excel export functionality
│   └── background.js      # backgroundsync
└── utils/                 # Helper functions
    └── dateUtils.js       # format date for other functions
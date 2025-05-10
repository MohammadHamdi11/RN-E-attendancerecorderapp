# QRScannerApp - Project Structure

Attendance recorder/
├── App.js                 # Main entry point
├── app.json               # Expo configuration
├── package.json           # Project dependencies
├── assets/                # Icons, images, etc.
│   ├── adaptive-icon.png
│   ├── admincredentials.json
│   ├── app-icon.png
│   ├── apple-touch-icon.png
│   ├── Attendance_Recorder_App_User_Guide.pdf
│   ├── beep.mp3
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── favicon-96x96.png
│   ├── notification_icon.png
│   ├── students_data.json
│   ├── subjectsmodal.json
│   ├── usercredentials.json
│   ├── web-app-manifest-192x192.png
│   └── web-app-manifest-512x512.png
├── screens/               # Main app screens
│   ├── AboutScreen.js     # App information
│   ├── AccountScreen.js   # User account settings
│   ├── BackupScreen.js    # Backup functionality
│   ├── ChecklistScreen.js # Student selector screen
│   ├── ContactScreen.js   # Contact/support
│   ├── HistoryScreen.js   # History/records screen
│   ├── LoginScreen.js     # Sign in authentication screen
│   ├── ScannerScreen.js   # QR scanner screen
│   └── SettingsScreen.js  # App settings
└── services/              # Business logic
    ├── auth.js            # Sign in authentication functionality
    ├── background.js      # Background sync
    ├── backup.js          # Backup functionality
    ├── base64util.js      # Base64 encoding/decoding utilities
    ├── database.js        # SQLite operations
    ├── excelhandler.js    # Excel file handling
    ├── export.js          # Excel export functionality
    ├── loadcredentials.js # Load user credentials
    ├── loadData.js        # Load students data for checklist
    ├── managebackups.js   # Manage backup files
    ├── notifications.js   # Push notifications
    ├── recover.js         # Recovery of interrupted sessions
    ├── updateadmins.js    # Update admin information
    ├── updatestudentsdata.js # Update student information
    └── updateusers.js     # Update user information

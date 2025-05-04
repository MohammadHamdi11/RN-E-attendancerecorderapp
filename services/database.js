// services/database.js
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Storage key for sessions
const SESSIONS_STORAGE_KEY = 'sessions';

// Database reference (now async)
let db;

// Initialize database
export const initDatabase = async () => {
  try {
    db = await SQLite.openDatabaseAsync('qrscanner.db');
    
    // Create tables using execAsync for better performance
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, 
        location TEXT, 
        dateTime TEXT, 
        inProgress INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        sessionId TEXT, 
        content TEXT, 
        time TEXT, 
        isManual INTEGER, 
        FOREIGN KEY (sessionId) REFERENCES sessions (id)
      );
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Get all sessions from storage
export const loadSessionsFromStorage = async () => {
  try {
    const savedSessions = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
    if (savedSessions) {
      return JSON.parse(savedSessions);
    }
    return [];
  } catch (error) {
    console.error('Error loading sessions from storage:', error);
    throw error;
  }
};

// Save sessions to storage
export const saveSessionsToStorage = async (sessions) => {
  try {
    await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('Error saving sessions to storage:', error);
    throw error;
  }
};

// Clear all sessions from storage and database
export const clearAllSessions = async () => {
  try {
    console.log('Clearing all sessions...');
    
    // Clear from AsyncStorage
    await AsyncStorage.removeItem(SESSIONS_STORAGE_KEY);
    
    // Clear from SQLite database
    if (db) {
      // Delete all scans first (due to foreign key constraints)
      await db.runAsync('DELETE FROM scans');
      
      // Then delete all sessions
      await db.runAsync('DELETE FROM sessions');
      
      console.log('All sessions cleared from database successfully');
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing all sessions:', error);
    throw error;
  }
};

// Get all sessions from database (fallback to SQL)
export const getAllSessions = async () => {
  try {
    // First try to get from AsyncStorage (faster and works offline)
    const sessions = await loadSessionsFromStorage();
    if (sessions && sessions.length > 0) {
      return sessions;
    }

    // Fallback to SQLite if needed
    const result = await db.getAllAsync('SELECT * FROM sessions ORDER BY dateTime DESC');
    const sessionsFromDB = [];

    // Process each session
    for (const session of result) {
      // Get scans for this session
      let scans = [];
      try {
        scans = await getSessionScans(session.id);
      } catch (e) {
        console.error('Error loading scans for session:', e);
        // Continue with empty scans rather than failing
      }

      // Format session
      sessionsFromDB.push({
        ...session,
        formattedDateTime: formatDateTime(new Date(session.dateTime)),
        scans: scans
      });
    }

    // Cache sessions in AsyncStorage for future offline access
    try {
      await saveSessionsToStorage(sessionsFromDB);
      console.log('Successfully cached sessions in AsyncStorage for offline use');
    } catch (e) {
      console.error('Error caching sessions:', e);
    }

    return sessionsFromDB;
  } catch (error) {
    console.error('Error in getAllSessions:', error);
    return [];
  }
};

// Add a sync function to push local changes when online
export const syncSessionsWithRemote = async (isOnline) => {
  if (!isOnline) {
    console.log('No internet connection. Skipping sync.');
    return false;
  }

  try {
    // Get all sessions from local storage
    const sessions = await loadSessionsFromStorage();

    // Filter sessions that need to be synced (not already synced)
    const sessionsToSync = sessions.filter(session => !session.synced);

    if (sessionsToSync.length === 0) {
      console.log('No sessions to sync');
      return true;
    }

    // Here you would normally send the unsynced sessions to your server
    // For now, we'll just mark them as synced
    const updatedSessions = sessions.map(session => {
      if (!session.synced) {
        return { ...session, synced: true, syncedAt: new Date().toISOString() };
      }
      return session;
    });

    // Save updated sessions
    await saveSessionsToStorage(updatedSessions);
    console.log(`Successfully synced ${sessionsToSync.length} sessions`);

    return true;
  } catch (error) {
    console.error('Error syncing sessions:', error);
    return false;
  }
};

// Add function to save a single session
export const saveSession = async (session) => {
  try {
    // Get current sessions
    const sessions = await loadSessionsFromStorage();

    // Find if session already exists
    const existingIndex = sessions.findIndex(s => s.id === session.id);

    if (existingIndex >= 0) {
      // Update existing session
      sessions[existingIndex] = session;
    } else {
      // Add new session
      sessions.push(session);
    }

    // Save back to storage
    await saveSessionsToStorage(sessions);

    // Also save to SQLite
    await saveSessionToSQL(session);

    return true;
  } catch (error) {
    console.error('Error saving session:', error);
    return false;
  }
};

// Save session to SQLite
const saveSessionToSQL = async (session) => {
  try {
    // Check if session exists
    const existingSession = await db.getFirstAsync(
      'SELECT * FROM sessions WHERE id = ?',
      [session.id]
    );

    if (existingSession) {
      // Update existing session
      await db.runAsync(
        'UPDATE sessions SET location = ?, dateTime = ?, inProgress = ? WHERE id = ?',
        [session.location, session.dateTime, session.inProgress ? 1 : 0, session.id]
      );
    } else {
      // Insert new session
      await db.runAsync(
        'INSERT INTO sessions (id, location, dateTime, inProgress) VALUES (?, ?, ?, ?)',
        [session.id, session.location, session.dateTime, session.inProgress ? 1 : 0]
      );
    }

    // Handle scans
    await updateSessionScans(session);
  } catch (error) {
    console.error('Error saving session to SQL:', error);
    throw error;
  }
};

// Update scans for a session
const updateSessionScans = async (session) => {
  try {
    // Delete existing scans for this session
    await db.runAsync('DELETE FROM scans WHERE sessionId = ?', [session.id]);

    // Insert all scans
    if (session.scans && session.scans.length > 0) {
      for (const scan of session.scans) {
        await db.runAsync(
          'INSERT INTO scans (sessionId, content, time, isManual) VALUES (?, ?, ?, ?)',
          [session.id, scan.content, scan.timestamp, scan.isManual ? 1 : 0]
        );
      }
    }
  } catch (error) {
    console.error('Error updating scans:', error);
    throw error;
  }
};

// Get scans for a session
const getSessionScans = async (sessionId) => {
  try {
    const scans = await db.getAllAsync(
      'SELECT * FROM scans WHERE sessionId = ? ORDER BY id',
      [sessionId]
    );
    
    return scans.map(scan => ({
      id: scan.id.toString(),
      content: scan.content,
      timestamp: scan.time,
      formattedTime: formatTime(new Date(scan.time)),
      isManual: scan.isManual === 1
    }));
  } catch (error) {
    console.error('Error fetching scans:', error);
    throw error;
  }
};

// Helper functions for date/time formatting
const formatDateTime = (date) => {
  return `${formatDate(date)} ${formatTime(date)}`;
};

const formatDate = (date) => {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatTime = (date) => {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};
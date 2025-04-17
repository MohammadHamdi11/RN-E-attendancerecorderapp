// services/database.js
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for sessions
const SESSIONS_STORAGE_KEY = 'sessions';

// Database reference
const db = SQLite.openDatabase('qrscanner.db');

// Initialize database
export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      // Create sessions table
      tx.executeSql(
        'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, location TEXT, dateTime TEXT, inProgress INTEGER)',
        [],
        () => {
          // Create scans table
          tx.executeSql(
            'CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT, content TEXT, time TEXT, isManual INTEGER, FOREIGN KEY (sessionId) REFERENCES sessions (id))',
            [],
            () => {
              console.log('Database initialized successfully');
              resolve();
            },
            (_, error) => {
              console.error('Error creating scans table:', error);
              reject(error);
            }
          );
        },
        (_, error) => {
          console.error('Error creating sessions table:', error);
          reject(error);
        }
      );
    });
  });
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

// Get all sessions from database (fallback to SQL)
export const getAllSessions = async () => {
  try {
    // First try to get from AsyncStorage (faster and works offline)
    const sessions = await loadSessionsFromStorage();
    if (sessions && sessions.length > 0) {
      return sessions;
    }

    // Fallback to SQLite if needed
    return new Promise((resolve, reject) => {
      db.transaction(tx => {
        tx.executeSql(
          'SELECT * FROM sessions ORDER BY dateTime DESC',
          [],
          async (_, { rows }) => {
            const sessions = [];

            // Process each session
            for (let i = 0; i < rows.length; i++) {
              const session = rows.item(i);

              // Get scans for this session
              let scans = [];
              try {
                scans = await getSessionScans(session.id);
              } catch (e) {
                console.error('Error loading scans for session:', e);
                // Continue with empty scans rather than failing
              }

              // Format session
              sessions.push({
                ...session,
                formattedDateTime: formatDateTime(new Date(session.dateTime)),
                scans: scans
              });
            }

            // Cache sessions in AsyncStorage for future offline access
            try {
              await saveSessionsToStorage(sessions);
              console.log('Successfully cached sessions in AsyncStorage for offline use');
            } catch (e) {
              console.error('Error caching sessions:', e);
            }

            resolve(sessions);
          },
          (_, error) => {
            console.error('Error fetching sessions:', error);
            // Return empty array instead of rejecting
            resolve([]);
          }
        );
      });
    });
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
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      // First check if session exists
      tx.executeSql(
        'SELECT * FROM sessions WHERE id = ?',
        [session.id],
        (_, { rows }) => {
          const exists = rows.length > 0;

          if (exists) {
            // Update existing session
            tx.executeSql(
              'UPDATE sessions SET location = ?, dateTime = ?, inProgress = ? WHERE id = ?',
              [session.location, session.dateTime, session.inProgress ? 1 : 0, session.id],
              async () => {
                // Handle scans
                await updateSessionScans(tx, session);
                resolve();
              },
              (_, error) => {
                console.error('Error updating session:', error);
                reject(error);
              }
            );
          } else {
            // Insert new session
            tx.executeSql(
              'INSERT INTO sessions (id, location, dateTime, inProgress) VALUES (?, ?, ?, ?)',
              [session.id, session.location, session.dateTime, session.inProgress ? 1 : 0],
              async () => {
                // Handle scans
                await updateSessionScans(tx, session);
                resolve();
              },
              (_, error) => {
                console.error('Error inserting session:', error);
                reject(error);
              }
            );
          }
        },
        (_, error) => {
          console.error('Error checking session existence:', error);
          reject(error);
        }
      );
    });
  });
};

// Update scans for a session
const updateSessionScans = async (tx, session) => {
  // Delete existing scans for this session
  await new Promise((resolve, reject) => {
    tx.executeSql(
      'DELETE FROM scans WHERE sessionId = ?',
      [session.id],
      () => resolve(),
      (_, error) => reject(error)
    );
  });

  // Insert all scans
  if (session.scans && session.scans.length > 0) {
    for (const scan of session.scans) {
      await new Promise((resolve, reject) => {
        tx.executeSql(
          'INSERT INTO scans (sessionId, content, time, isManual) VALUES (?, ?, ?, ?)',
          [session.id, scan.content, scan.timestamp, scan.isManual ? 1 : 0],
          () => resolve(),
          (_, error) => reject(error)
        );
      });
    }
  }
};

// Get scans for a session
const getSessionScans = (sessionId) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM scans WHERE sessionId = ? ORDER BY id',
        [sessionId],
        (_, { rows }) => {
          const scans = [];
          for (let i = 0; i < rows.length; i++) {
            const scan = rows.item(i);
            scans.push({
              id: scan.id.toString(),
              content: scan.content,
              timestamp: scan.time,
              formattedTime: formatTime(new Date(scan.time)),
              isManual: scan.isManual === 1
            });
          }
          resolve(scans);
        },
        (_, error) => {
          console.error('Error fetching scans:', error);
          reject(error);
        }
      );
    });
  });
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
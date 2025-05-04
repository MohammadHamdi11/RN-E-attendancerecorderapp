import { loadSessionsFromStorage, saveSessionsToStorage } from './database';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Track sessions that have been prompted for recovery
let recoveryPromptTimers = {};

// Session type constants
export const SESSION_TYPE = {
  SCANNER: 'scanner',
  CHECKLIST: 'checklist'
};

// Storage keys
const SCANNER_ACTIVE_SESSION_STORAGE_KEY = 'activeScannerSession';
const CHECKLIST_ACTIVE_SESSION_STORAGE_KEY = 'activeChecklistSession';
const TEMP_SCANNER_SESSION_INDEX_KEY = 'tempScannerSessionIndex';
const TEMP_CHECKLIST_SESSION_INDEX_KEY = 'tempChecklistSessionIndex';
const RECOVERY_PROMPTED_KEY = 'recoveryPrompted';

// Recover an interrupted session
export const recoverSession = async (session, sessionType) => {
  try {
    if (!session || !sessionType) {
      throw new Error("Session or session type is missing");
    }

    // Load current sessions to ensure we're working with the latest data
    const sessions = await loadSessionsFromStorage();
    
    // Find if this session already exists in the array
    const sessionIndex = sessions.findIndex(s => s.id === session.id);
    
    // Mark the session as in progress and set its type
    session.inProgress = true;
    session.sessionType = sessionType;
    
    if (sessionIndex !== -1) {
      // Update existing session
      sessions[sessionIndex] = {...session};
    } else {
      // Add as a new session
      sessions.push(session);
    }
    
    // Save updated sessions back to storage
    await saveSessionsToStorage(sessions);
    
    // Save active session to appropriate storage key
    const storageKey = sessionType === SESSION_TYPE.SCANNER 
      ? SCANNER_ACTIVE_SESSION_STORAGE_KEY 
      : CHECKLIST_ACTIVE_SESSION_STORAGE_KEY;
      
    await AsyncStorage.setItem(storageKey, JSON.stringify(session));
    
    // Clear any existing timer for this session
    clearSessionRecoveryTimer(session.id);
    
    // Mark as prompted to prevent duplicate prompts
    await markSessionAsPrompted(session.id);
    
    return { success: true };
  } catch (error) {
    console.error("Error recovering session:", error);
    return { 
      success: false, 
      error: error.message || "Failed to recover session" 
    };
  }
};

// Check for recoverable sessions of a specific type
export const checkForRecoverableSession = async (sessionType) => {
  try {
    if (!sessionType) {
      throw new Error("Session type is required");
    }

    // Check if we've already prompted for recovery in this app session
    const alreadyPrompted = await AsyncStorage.getItem(RECOVERY_PROMPTED_KEY);
    if (alreadyPrompted) {
      const promptedSessions = JSON.parse(alreadyPrompted);
      const currentTime = new Date().getTime();
      
      // Clean up any expired entries (older than 1 hour)
      const updatedPromptedSessions = {};
      let changed = false;
      
      Object.keys(promptedSessions).forEach(id => {
        if (currentTime - promptedSessions[id] < 3600000) { // 1 hour
          updatedPromptedSessions[id] = promptedSessions[id];
        } else {
          changed = true;
        }
      });
      
      // Save cleaned up prompted sessions
      if (changed) {
        await AsyncStorage.setItem(RECOVERY_PROMPTED_KEY, JSON.stringify(updatedPromptedSessions));
      }
    }

    // First check the direct storage key
    const storageKey = sessionType === SESSION_TYPE.SCANNER 
      ? SCANNER_ACTIVE_SESSION_STORAGE_KEY 
      : CHECKLIST_ACTIVE_SESSION_STORAGE_KEY;
      
    const savedSession = await AsyncStorage.getItem(storageKey);
    
    if (savedSession) {
      const parsedSession = JSON.parse(savedSession);
      
      // Check if we've already prompted for this session
      if (alreadyPrompted) {
        const promptedSessions = JSON.parse(alreadyPrompted);
        if (promptedSessions[parsedSession.id]) {
          return { hasRecoverableSession: false };
        }
      }
      
      // Verify it's the correct type and in progress
      if (parsedSession && parsedSession.id) {
        parsedSession.sessionType = sessionType; // Ensure type is set
        
        // Start a timer to auto-close this session if the user doesn't respond
        startSessionRecoveryTimer(parsedSession.id, sessionType);
        
        return {
          hasRecoverableSession: true,
          session: parsedSession
        };
      }
    }
    
    // If no direct session found, check in-progress sessions in the database
    // that match the requested type
    const sessions = await loadSessionsFromStorage();
    
    // Find any in-progress sessions of the requested type
    const inProgressSessions = sessions.filter(session => 
      session.inProgress && 
      (session.sessionType === sessionType || 
       (sessionType === SESSION_TYPE.CHECKLIST && session.isChecklist) ||
       (sessionType === SESSION_TYPE.SCANNER && !session.isChecklist))
    );
    
    if (inProgressSessions.length > 0) {
      // Get the most recent in-progress session
      const mostRecentSession = inProgressSessions.sort((a, b) => 
        new Date(b.dateTime) - new Date(a.dateTime)
      )[0];
      
      // Check if we've already prompted for this session
      if (alreadyPrompted) {
        const promptedSessions = JSON.parse(alreadyPrompted);
        if (promptedSessions[mostRecentSession.id]) {
          return { hasRecoverableSession: false };
        }
      }
      
      // Ensure session type is set
      mostRecentSession.sessionType = sessionType;
      
      // Start a timer to auto-close this session if the user doesn't respond
      startSessionRecoveryTimer(mostRecentSession.id, sessionType);
      
      return {
        hasRecoverableSession: true,
        session: mostRecentSession
      };
    }
    
    return { hasRecoverableSession: false };
  } catch (error) {
    console.error("Error checking for recoverable sessions:", error);
    return { 
      hasRecoverableSession: false, 
      error: error.message || "Failed to check for recoverable sessions" 
    };
  }
};

// Mark a session as having been prompted for recovery
const markSessionAsPrompted = async (sessionId) => {
  try {
    const currentTime = new Date().getTime();
    
    // Get currently prompted sessions
    const alreadyPrompted = await AsyncStorage.getItem(RECOVERY_PROMPTED_KEY);
    let promptedSessions = alreadyPrompted ? JSON.parse(alreadyPrompted) : {};
    
    // Add this session with timestamp
    promptedSessions[sessionId] = currentTime;
    
    // Save back to storage
    await AsyncStorage.setItem(RECOVERY_PROMPTED_KEY, JSON.stringify(promptedSessions));
  } catch (error) {
    console.error("Error marking session as prompted:", error);
  }
};

// Start a timer to automatically close a session if user doesn't respond
const startSessionRecoveryTimer = (sessionId, sessionType) => {
  // Clear any existing timer first
  clearSessionRecoveryTimer(sessionId);
  
  // Set a new timer for 15 minutes (900000 ms)
  recoveryPromptTimers[sessionId] = setTimeout(() => {
    console.log(`Auto-closing recovery prompt for session ${sessionId} after timeout`);
    clearRecoverableSession(sessionId, sessionType)
      .then(result => {
        if (result.success) {
          console.log(`Session ${sessionId} auto-closed successfully`);
        } else {
          console.error(`Failed to auto-close session ${sessionId}:`, result.error);
        }
      })
      .catch(error => {
        console.error(`Error in auto-closing session ${sessionId}:`, error);
      });
  }, 900000); // 15 minutes
};

// Clear a timer for a session
const clearSessionRecoveryTimer = (sessionId) => {
  if (recoveryPromptTimers[sessionId]) {
    clearTimeout(recoveryPromptTimers[sessionId]);
    delete recoveryPromptTimers[sessionId];
  }
};

// Clear an in-progress session
export const clearRecoverableSession = async (sessionId, sessionType) => {
  try {
    if (!sessionId) {
      throw new Error("Session ID is required");
    }
    
    // Clear any existing timer for this session
    clearSessionRecoveryTimer(sessionId);
    
    const sessions = await loadSessionsFromStorage();
    
    // Find the session
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    
    if (sessionIndex !== -1) {
      // Mark as not in progress
      sessions[sessionIndex].inProgress = false;
      
      // Save updated sessions
      await saveSessionsToStorage(sessions);
    }
    
    // Clear from active session storage for the relevant type
    if (sessionType === SESSION_TYPE.SCANNER) {
      await AsyncStorage.removeItem(SCANNER_ACTIVE_SESSION_STORAGE_KEY);
      await AsyncStorage.removeItem(TEMP_SCANNER_SESSION_INDEX_KEY);
    } else if (sessionType === SESSION_TYPE.CHECKLIST) {
      await AsyncStorage.removeItem(CHECKLIST_ACTIVE_SESSION_STORAGE_KEY);
      await AsyncStorage.removeItem(TEMP_CHECKLIST_SESSION_INDEX_KEY);
    }
    
    // Mark as prompted to prevent any further prompts
    await markSessionAsPrompted(sessionId);
    
    return { success: true };
  } catch (error) {
    console.error("Error clearing recoverable session:", error);
    return { 
      success: false, 
      error: error.message || "Failed to clear recoverable session" 
    };
  }
};

// Reset recovery system (call when app is first launched)
export const resetRecoverySystem = async () => {
  try {
    await AsyncStorage.removeItem(RECOVERY_PROMPTED_KEY);
    return { success: true };
  } catch (error) {
    console.error("Error resetting recovery system:", error);
    return { success: false, error: error.message };
  }
};

// Clean up all timers (call this when app is closing or component unmounts)
export const cleanUpRecoveryTimers = () => {
  Object.keys(recoveryPromptTimers).forEach(sessionId => {
    clearTimeout(recoveryPromptTimers[sessionId]);
  });
  recoveryPromptTimers = {};
};
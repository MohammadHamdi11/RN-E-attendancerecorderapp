import { loadSessionsFromStorage, saveSessionsToStorage } from './database';

// Track sessions that have been prompted for recovery
let recoveryPromptTimers = {};

// Recover an interrupted session
export const recoverSession = async (session) => {
  try {
    // Load current sessions to ensure we're working with the latest data
    const sessions = await loadSessionsFromStorage();
    
    // Find if this session already exists in the array
    const sessionIndex = sessions.findIndex(s => s.id === session.id);
    
    // Mark the session as in progress
    session.inProgress = true;
    
    if (sessionIndex !== -1) {
      // Update existing session
      sessions[sessionIndex] = {...session};
    } else {
      // Add as a new session
      sessions.push(session);
    }
    
    // Save updated sessions back to storage
    await saveSessionsToStorage(sessions);
    
    // Clear any existing timer for this session
    clearSessionRecoveryTimer(session.id);
    
    return { success: true };
  } catch (error) {
    console.error("Error recovering session:", error);
    return { 
      success: false, 
      error: error.message || "Failed to recover session" 
    };
  }
};

// Check for recoverable sessions
export const checkForRecoverableSession = async () => {
  try {
    const sessions = await loadSessionsFromStorage();
    
    // Find any in-progress sessions
    const inProgressSessions = sessions.filter(session => session.inProgress);
    
    if (inProgressSessions.length > 0) {
      // Get the most recent in-progress session
      const mostRecentSession = inProgressSessions.sort((a, b) => 
        new Date(b.dateTime) - new Date(a.dateTime)
      )[0];
      
      // Start a timer to auto-close this session if the user doesn't respond
      startSessionRecoveryTimer(mostRecentSession.id);
      
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

// Start a timer to automatically close a session if user doesn't respond
const startSessionRecoveryTimer = (sessionId) => {
  // Clear any existing timer first
  clearSessionRecoveryTimer(sessionId);
  
  // Set a new timer for 15 minutes (900000 ms)
  recoveryPromptTimers[sessionId] = setTimeout(() => {
    console.log(`Auto-closing recovery prompt for session ${sessionId} after timeout`);
    clearRecoverableSession(sessionId)
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
export const clearRecoverableSession = async (sessionId) => {
  try {
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
    
    return { success: true };
  } catch (error) {
    console.error("Error clearing recoverable session:", error);
    return { 
      success: false, 
      error: error.message || "Failed to clear recoverable session" 
    };
  }
};

// Clean up all timers (call this when app is closing)
export const cleanUpRecoveryTimers = () => {
  Object.keys(recoveryPromptTimers).forEach(sessionId => {
    clearTimeout(recoveryPromptTimers[sessionId]);
  });
  recoveryPromptTimers = {};
};
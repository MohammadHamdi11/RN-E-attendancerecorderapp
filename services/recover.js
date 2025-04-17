import { loadSessionsFromStorage, saveSessionsToStorage } from './database';

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
      // Return the most recent in-progress session
      return {
        hasRecoverableSession: true,
        session: inProgressSessions.sort((a, b) => 
          new Date(b.dateTime) - new Date(a.dateTime)
        )[0]
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

// Clear an in-progress session
export const clearRecoverableSession = async (sessionId) => {
  try {
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
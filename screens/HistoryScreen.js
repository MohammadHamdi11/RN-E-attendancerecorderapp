import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Text, Button, Surface, Title, Divider, Card, Menu, Provider, List } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { loadSessionsFromStorage, saveSessionsToStorage } from '../services/database';
import { recoverSession } from '../services/recover';
import { exportSessionToExcel, exportAllSessionsToExcel } from '../services/export';

const HistoryScreen = ({ navigation }) => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  
  // Add stronger focus effect to reload data every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log('HistoryScreen focused - loading sessions');
      loadSessions();
      return () => {
        // Clean up if needed
      };
    }, [])
  );
  
  // Load sessions when component mounts (keep this for initial load)
  useEffect(() => {
    loadSessions();
  }, []);
  
  // Load sessions from storage with better error handling
  const loadSessions = async () => {
    setIsLoading(true);
    setLoadError(null);
    
    try {
      console.log('Loading sessions from storage...');
      const loadedSessions = await loadSessionsFromStorage();
      
      // Validate the response
      if (Array.isArray(loadedSessions)) {
        console.log(`Successfully loaded ${loadedSessions.length} sessions`);
        setSessions(loadedSessions);
      } else {
        console.error("Loaded sessions is not an array:", loadedSessions);
        setSessions([]);
        setLoadError("Invalid data format received");
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
      setSessions([]);
      setLoadError(error.message || "Failed to load session history");
      
      Alert.alert(
        "Error",
        "Failed to load session history. Please try again.",
        [{ 
          text: "Retry", 
          onPress: () => loadSessions() 
        },
        { 
          text: "OK" 
        }]
      );
    } finally {
      setIsLoading(false);
    }
  };
  
  // Show session details
  const showSessionDetails = (session) => {
    setSelectedSession(session);
    setSessionDetails(true);
  };
  
  // Hide session details
  const hideSessionDetails = () => {
    setSessionDetails(false);
  };
  
  // Resume an interrupted session with improved error handling
  const resumeSession = (session) => {
    Alert.alert(
      "Resume Session",
      `Are you sure you want to resume the session at ${session.location}?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Resume",
          onPress: async () => {
            try {
              // First make sure we're working with the most recent data
              const loadedSessions = await loadSessionsFromStorage();
              const sessionIndex = loadedSessions.findIndex(s => s.id === session.id);
              
              if (sessionIndex !== -1) {
                // Use the most up-to-date session data
                const currentSession = loadedSessions[sessionIndex];
                const result = await recoverSession(currentSession);
                
                if (result.success) {
                  navigation.navigate('Scanner');
                  hideSessionDetails();
                } else {
                  throw new Error(result.error || "Unknown error resuming session");
                }
              } else {
                throw new Error("Session no longer exists");
              }
            } catch (error) {
              console.error("Resume session error:", error);
              Alert.alert(
                "Resume Failed",
                `Could not resume the session: ${error.message}`,
                [{ text: "OK" }]
              );
            }
          }
        }
      ]
    );
  };
  
  // Export session data to Excel
  const handleExportSession = async (session) => {
    try {
      await exportSessionToExcel(session);
      Alert.alert(
        "Export Successful",
        "Session data has been exported to Excel.",
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert(
        "Export Failed",
        "Could not export session data. Please try again.",
        [{ text: "OK" }]
      );
    }
  };
  
  // Export all history
  const handleExportAllHistory = async () => {
    if (sessions.length === 0) {
      Alert.alert(
        "No Data",
        "There are no sessions to export.",
        [{ text: "OK" }]
      );
      return;
    }
    
    try {
      await exportAllSessionsToExcel(sessions);
      Alert.alert(
        "Export Successful",
        "All history has been exported to Excel.",
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Export all error:", error);
      Alert.alert(
        "Export Failed",
        "Could not export all history. Please try again.",
        [{ text: "OK" }]
      );
    }
  };
  
  // Sort sessions based on selected option
  const sortSessions = (sessionsToSort, sortType) => {
    if (!Array.isArray(sessionsToSort)) {
      console.error("Cannot sort non-array:", sessionsToSort);
      return [];
    }
    
    return [...sessionsToSort].sort((a, b) => {
      if (sortType === 'date-desc') {
        return new Date(b.dateTime) - new Date(a.dateTime);
      } else if (sortType === 'date-asc') {
        return new Date(a.dateTime) - new Date(b.dateTime);
      } else if (sortType === 'location') {
        return a.location.localeCompare(b.location);
      }
      return 0;
    });
  };
  
  // Handle sort selection
  const handleSortChange = (newSortOrder) => {
    setSortOrder(newSortOrder);
    setSortMenuVisible(false);
  };
  
  // Get sorted sessions
  const getSortedSessions = () => {
    return sortSessions(sessions, sortOrder);
  };
  
  // Render session item
  const renderSessionItem = ({ item }) => (
    <TouchableOpacity onPress={() => showSessionDetails(item)}>
      <Card style={[
        styles.historyItem, 
        item.inProgress && styles.inProgressItem
      ]}>
        <Card.Content>
          <View style={styles.historyItemHeader}>
            <View>
              <Text style={styles.locationText}>
                {item.location}
                {item.inProgress && 
                  <Text style={styles.inProgressText}> (In Progress)</Text>
                }
              </Text>
              <Text style={styles.dateText}>{item.formattedDateTime}</Text>
            </View>
            <Text style={styles.countText}>Scans: {Array.isArray(item.scans) ? item.scans.length : 0}</Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
  
  // Render scan item with safety check
  const renderScanItem = ({ item }) => (
    <View style={styles.scanItem}>
      <Text style={styles.scanId}>{item?.id || 'N/A'}</Text>
      <Text style={styles.scanContent}>{item?.content || 'N/A'}</Text>
      <Text style={styles.scanTime}>{item?.formattedTime || 'N/A'}</Text>
    </View>
  );
  
  // Render loading state
  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#24325f" />
      <Text style={styles.loadingText}>Loading sessions...</Text>
    </View>
  );
  
  // Render error state
  const renderError = () => (
    <View style={styles.errorContainer}>
      <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#951d1e" />
      <Text style={styles.errorText}>Failed to load sessions</Text>
      <Text style={styles.errorSubtext}>{loadError}</Text>
      <Button 
        mode="contained"
        style={styles.retryButton}
        onPress={loadSessions}
      >
        Retry
      </Button>
    </View>
  );
  
  // Render no sessions state
  const renderNoSessions = () => (
    <View style={styles.noResults}>
      <MaterialCommunityIcons name="history" size={48} color="#24325f" />
      <Text style={styles.noResultsText}>No scanning sessions found.</Text>
      <Text style={styles.noResultsSubtext}>Sessions will appear here after scanning.</Text>
    </View>
  );
  
  return (
    <Provider>
      <View style={styles.container}>
        {!sessionDetails ? (
          <Surface style={styles.card}>
            <Title style={styles.title}>Scanning History</Title>
            
            <View style={styles.headerControls}>
              <Button 
                mode="contained" 
                icon="export"
                style={styles.exportButton}
                labelStyle={styles.exportButtonText}
                onPress={handleExportAllHistory}
                disabled={isLoading || sessions.length === 0}
              >
                Export All History
              </Button>
              
              <View style={styles.filterControl}>
                <Menu
                  visible={sortMenuVisible}
                  onDismiss={() => setSortMenuVisible(false)}
                  anchor={
                    <Button 
                      mode="outlined" 
                      icon="sort" 
                      onPress={() => setSortMenuVisible(true)}
                      style={styles.sortButton}
                      labelStyle={styles.sortButtonText}
                      disabled={isLoading || sessions.length === 0}
                    >
                      Sort
                    </Button>
                  }
                >
                  <Menu.Item 
                    title="Newest First" 
                    onPress={() => handleSortChange('date-desc')} 
                  />
                  <Menu.Item 
                    title="Oldest First" 
                    onPress={() => handleSortChange('date-asc')} 
                  />
                  <Menu.Item 
                    title="By Location" 
                    onPress={() => handleSortChange('location')} 
                  />
                </Menu>
              </View>
            </View>
                        
            <View style={styles.historyListContainer}>
              {isLoading ? (
                renderLoading()
              ) : loadError ? (
                renderError()
              ) : sessions.length > 0 ? (
                <View style={styles.flatListWrapper}>
                  <FlatList
                    data={getSortedSessions()}
                    renderItem={renderSessionItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.historyList}
                    extraData={sortOrder}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled={true}
                    bounces={true}
                    indicatorStyle="black"
                    showsVerticalScrollIndicator={true}
                  />
                </View>
              ) : (
                renderNoSessions()
              )}
            </View>
          </Surface>
        ) : (
          <Surface style={styles.card}>
            <View style={styles.detailsHeader}>
              <Title style={styles.subtitle}>
                Session Details
                {selectedSession?.inProgress && 
                  <Text style={styles.inProgressText}> (In Progress)</Text>
                }
              </Title>
              <Button 
                mode="text" 
                icon="close"
                onPress={hideSessionDetails}
                style={styles.closeButton}
                labelStyle={styles.closeButtonText}
              >
                Close
              </Button>
            </View>
            
            <View style={styles.detailsInfo}>
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Location: </Text>
                {selectedSession?.location || 'N/A'}
              </Text>
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Date & Time: </Text>
                {selectedSession?.formattedDateTime || 'N/A'}
              </Text>
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Scans: </Text>
                {Array.isArray(selectedSession?.scans) ? selectedSession.scans.length : 0}
              </Text>
            </View>
            
            <View style={styles.detailButtons}>
              
              <Button 
                mode="contained" 
                icon="export"
                style={styles.exportSessionButton}
                labelStyle={styles.exportSessionButtonText}
                onPress={() => handleExportSession(selectedSession)}
              >
                Export Session
              </Button>
            </View>
            
            <View style={styles.scansContainer}>
              <View style={styles.tableHeader}>
                <Text style={[styles.columnHeader, styles.idColumn]}>ID</Text>
                <Text style={[styles.columnHeader, styles.timeColumn]}>Time</Text>
              </View>
              
              {Array.isArray(selectedSession?.scans) && selectedSession.scans.length > 0 ? (
                <View style={styles.scanListWrapper}>
                  <FlatList
                    data={selectedSession.scans}
                    renderItem={renderScanItem}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.scansList}
                    removeClippedSubviews={Platform.OS === 'android'}
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled={true}
                    bounces={true}
                    indicatorStyle="black"
                    showsVerticalScrollIndicator={true}
                  />
                </View>
              ) : (
                <View style={styles.noScans}>
                  <Text style={styles.noScansText}>No scans in this session</Text>
                </View>
              )}
            </View>
          </Surface>
        )}
      </View>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f9f9f9', // Matches --light-bg
  },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    height: '100%',
    backgroundColor: '#ffffff', // Matches --card-bg
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  // New wrapper specifically to fix iOS FlatList issues
  flatListWrapper: {
    flex: 1,
    height: '100%',
    width: '100%',
    backgroundColor: 'transparent',
  },
  scanListWrapper: {
    flex: 1,
    height: '100%',
    width: '100%',
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 20,
    marginBottom: 16,
    color: '#24325f', // Matches --primary-color
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 8,
    color: '#24325f', // Matches --primary-color
    fontWeight: '500',
  },
  headerControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 1, // Fix for menu on iOS
  },
  exportButton: {
    backgroundColor: '#24325f', // Matches --primary-color
  },
  exportButtonText: {
    color: 'white',
  },
  sortButton: {
    borderColor: '#24325f', // Matches --primary-color
  },
  sortButtonText: {
    color: '#24325f', // Matches --primary-color
  },
  filterControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyListContainer: {
    flex: 1,
    marginTop: 8,
    height: '100%',
    backgroundColor: 'transparent',
  },
  historyList: {
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  historyItem: {
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inProgressItem: {
    borderLeftWidth: 4,
    borderLeftColor: '#951d1e', // Matches --secondary-color
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locationText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#24325f', // Matches --primary-color
  },
  inProgressText: {
    color: '#951d1e', // Matches --secondary-color
    fontWeight: 'bold',
  },
  dateText: {
    color: '#24325f',
  },
  countText: {
    color: '#444',
  },
  noResults: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    justifyContent: 'center',
    flex: 1,
  },
  noResultsText: {
    color: '#24325f',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 16,
  },
  noResultsSubtext: {
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  loadingText: {
    color: '#24325f',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#fff0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#951d1e',
    justifyContent: 'center',
    flex: 1,
  },
  errorText: {
    color: '#951d1e',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 16,
  },
  errorSubtext: {
    color: '#666',
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#24325f',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeButton: {
    margin: 0,
    padding: 0,
  },
  closeButtonText: {
    color: '#24325f',
  },
  detailsInfo: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  detailText: {
    marginBottom: 6,
    fontSize: 14,
  },
  detailLabel: {
    fontWeight: 'bold',
    color: '#444',
  },
  detailButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  resumeButton: {
    backgroundColor: '#951d1e', // Matches --secondary-color
    flex: 1,
    marginRight: 8,
  },
  resumeButtonText: {
    color: 'white',
  },
  exportSessionButton: {
    backgroundColor: '#24325f', // Matches --primary-color
    flex: 1,
    marginLeft: 8,
  },
  exportSessionButtonText: {
    color: 'white',
  },
  scansContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  columnHeader: {
    fontWeight: 'bold',
    color: '#24325f', // Matches --primary-color
  },
  idColumn: {
    flex: 2,
  },
  contentColumn: {
    flex: 4,
  },
  timeColumn: {
    flex: 1,
    textAlign: 'right',
  },
  scanItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  scanId: {
    flex: 2,
    color: '#333',
  },
  scanContent: {
    flex: 4,
    color: '#333',
  },
  scanTime: {
    flex: 1,
    textAlign: 'right',
    color: '#24325f',
  },
  scansList: {
    backgroundColor: '#fff',
  },
  noScans: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noScansText: {
    color: '#666',
    fontStyle: 'italic',
  },
  // Debug styling
  debugContainer: {
    padding: 8,
    backgroundColor: '#ffe0e0',
    borderRadius: 4,
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#333',
  },
});

export default HistoryScreen;
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, Button, Surface, Title, Divider, Card, Menu, Provider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { loadSessionsFromStorage, saveSessionsToStorage } from '../services/database';
import { recoverSession } from '../services/recover';
import { exportSessionToExcel, exportAllSessionsToExcel } from '../services/export';

const HistoryScreen = ({ navigation }) => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState('date-desc');
  
  // Load sessions when component mounts
  useEffect(() => {
    loadSessions();
    
    // Add listener to reload sessions when this screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadSessions();
    });
    
    return unsubscribe;
  }, [navigation]);
  
  // Load sessions from storage
  const loadSessions = async () => {
    try {
      const loadedSessions = await loadSessionsFromStorage();
      setSessions(loadedSessions || []);
    } catch (error) {
      console.error("Error loading sessions:", error);
      Alert.alert(
        "Error",
        "Failed to load session history. Please try again.",
        [{ text: "OK" }]
      );
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
  
  // Resume an interrupted session
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
          onPress: () => {
            recoverSession(session);
            navigation.navigate('Scanner');
            hideSessionDetails();
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
      // We'll implement this in services/export.js
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
            <Text style={styles.countText}>Scans: {item.scans.length}</Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
  
  // Render scan item
  const renderScanItem = ({ item }) => (
    <View style={styles.scanItem}>
      <Text style={styles.scanId}>{item.id}</Text>
      <Text style={styles.scanContent}>{item.content}</Text>
      <Text style={styles.scanTime}>{item.formattedTime}</Text>
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
              {sessions.length > 0 ? (
                <FlatList
                  data={getSortedSessions()}
                  renderItem={renderSessionItem}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.historyList}
                />
              ) : (
                <View style={styles.noResults}>
                  <Text style={styles.noResultsText}>No scanning sessions found.</Text>
                </View>
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
                {selectedSession?.location}
              </Text>
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Date & Time: </Text>
                {selectedSession?.formattedDateTime}
              </Text>
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Scans: </Text>
                {selectedSession?.scans.length}
              </Text>
            </View>
            
            <View style={styles.detailButtons}>
              {selectedSession?.inProgress && (
                <Button 
                  mode="contained" 
                  icon="play"
                  style={styles.resumeButton}
                  labelStyle={styles.resumeButtonText}
                  onPress={() => resumeSession(selectedSession)}
                >
                  Resume Session
                </Button>
              )}
              
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
                <Text style={[styles.columnHeader, styles.contentColumn]}>Content</Text>
                <Text style={[styles.columnHeader, styles.timeColumn]}>Time</Text>
              </View>
              
              <FlatList
                data={selectedSession?.scans || []}
                renderItem={renderScanItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.scansList}
              />
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
    padding: 16,
    borderRadius: 8,
    elevation: 4,
    backgroundColor: '#ffffff', // Matches --card-bg
    flex: 1,
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
  },
  exportButton: {
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
  },
  exportButtonText: {
    color: 'white',
  },
  sortButton: {
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
  },
  sortButtonText: {
    color: 'white',
  },
  filterControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButton: {
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
  },
  filterButtonText: {
    color: 'white',
  },
  historyListContainer: {
    flex: 1,
    marginTop: 8,
  },
  historyList: {
    paddingBottom: 16,
  },
  historyItem: {
    marginBottom: 8,
    elevation: 2,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#24325f',
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
    borderColor: '#24325f',
  },
  noResultsText: {
    color: '#24325f',
    fontStyle: 'italic',
    fontSize: 16,
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
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
  },
  closeButtonText: {
    color: 'white',
  },
  detailsInfo: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#24325f',
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
    borderColor: '#951d1e', // Matches --secondary-color
    flex: 1,
    marginRight: 8,
  },
  resumeButtonText: {
    color: 'white',
  },
  exportSessionButton: {
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
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
});

export default HistoryScreen;
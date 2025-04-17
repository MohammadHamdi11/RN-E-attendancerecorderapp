// Modified App.js without authentication
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

// Import all screens directly
import ScannerScreen from './screens/ScannerScreen';
import ChecklistScreen from './screens/ChecklistScreen';
import HistoryScreen from './screens/HistoryScreen';
import BackupScreen from './screens/BackupScreen';
import AboutScreen from './screens/AboutScreen';
import ContactScreen from './screens/ContactScreen';
import { setupNetworkListener } from './services/backup';

// Create placeholder for screens that might not exist yet
const PlaceholderScreen = ({ name }) => (
  <View style={styles.container}>
    <Text style={styles.placeholderText}>{name} Screen</Text>
  </View>
);

// Create navigators
const Tab = createBottomTabNavigator();

// Theme configuration
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#24325f',
    accent: '#951d1e',
    background: '#ffffff',
    surface: '#ffffff',
    text: '#000000',
    disabled: '#cccccc',
    placeholder: '#3d3d3d',
  },
};

// Function to create bottom tab navigator
function MainTabNavigator({ isOnline }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Scanner') {
            iconName = 'qrcode-scan';
          } else if (route.name === 'Checklist') {
            iconName = 'clipboard-list';
          } else if (route.name === 'History') {
            iconName = 'history';
          } else if (route.name === 'Backup') {
            iconName = 'cloud-upload';
          } else if (route.name === 'About') {
            iconName = 'information';
          } else if (route.name === 'Contact') {
            iconName = 'email-outline';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Scanner" 
        options={{
          title: "QR Scanner",
          headerRight: () => (
            <View style={{padding: 10}}>
              <Text style={{color: 'white'}}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
            </View>
          ),
        }}
      >
        {props => <ScannerScreen {...props} isOnline={isOnline} />}
      </Tab.Screen>
      <Tab.Screen name="Checklist">
  {props => <ChecklistScreen {...props} isOnline={isOnline} />}
</Tab.Screen>
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Backup" component={BackupScreen} />
      <Tab.Screen name="About" component={AboutScreen} />
      <Tab.Screen name="Contact" component={ContactScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState(null);

  // Initialize app
  useEffect(() => {
    // Simple initialization with no authentication
    console.log('App starting - authentication removed');
    
    // Short timeout to simulate some initialization
    setTimeout(() => {
      setIsLoading(false);
      console.log('App initialization completed - authentication bypassed');
    }, 1000);

    // Set up network connectivity monitoring
    const unsubscribe = NetInfo.addEventListener(state => {
      try {
        const online = state.isConnected && state.isInternetReachable;
        setIsOnline(online);
        console.log('Network status changed:', online ? 'Online' : 'Offline');
      } catch (e) {
        console.error('Network monitoring error:', e);
      }
    });

    // Clean up the subscription
    return () => {
      try {
        unsubscribe();
      } catch (e) {
        console.error('Error unsubscribing from NetInfo:', e);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading application...</Text>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer>
          <MainTabNavigator isOnline={isOnline} />
        </NavigationContainer>
        <StatusBar style="light" />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#24325f',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#951d1e',
    textAlign: 'center',
    marginTop: 10,
  },
  placeholderText: {
    fontSize: 18,
    color: '#24325f',
    textAlign: 'center',
  }
});
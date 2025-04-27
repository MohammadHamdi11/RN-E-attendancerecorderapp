// App.js with authentication, Account header button, and Settings screen for admins
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, DefaultTheme, IconButton } from 'react-native-paper';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

// Import screens
import ScannerScreen from './screens/ScannerScreen';
import ChecklistScreen from './screens/ChecklistScreen';
import HistoryScreen from './screens/HistoryScreen';
import BackupScreen from './screens/BackupScreen';
import AboutScreen from './screens/AboutScreen';
import ContactScreen from './screens/ContactScreen';
import LoginScreen from './screens/LoginScreen';
import AccountScreen from './screens/AccountScreen';
import SettingsScreen from './screens/SettingsScreen'; // Import the new Settings screen

// Import services
import { setupNetworkListener } from './services/backup';
import { initNotifications, sendBackupReminder } from './services/notifications';
import { registerBackgroundSync } from './services/background';
import { checkAuthentication, initAuthSystem } from './services/auth';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

// Create placeholder for screens that might not exist yet
const PlaceholderScreen = ({ name }) => (
  <View style={styles.container}>
    <Text style={styles.placeholderText}>{name} Screen</Text>
  </View>
);

// Create navigators
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Define navigation theme with forced light mode
const navigationTheme = {
  ...NavigationDefaultTheme,
  colors: {
    ...NavigationDefaultTheme.colors,
    background: '#ffffff',
    card: '#ffffff',
    text: '#000000',
    border: '#e0e0e0',
  },
};

// Theme configuration for Paper
const paperTheme = {
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
  dark: false, // Force light mode
};

// Function to create bottom tab navigator
function MainTabNavigator({ isOnline, userType, navigation }) {

  return (
<Tab.Navigator
  screenOptions={({ route, navigation }) => ({
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
    tabBarActiveTintColor: paperTheme.colors.primary,
    tabBarInactiveTintColor: 'gray',
    headerStyle: {
      backgroundColor: paperTheme.colors.primary,
    },
    headerTintColor: '#fff',
    headerTitleStyle: {
      fontWeight: 'bold',
    },
    // Add the account icon and settings icon (for admin) to every tab's header
headerRight: () => (
  <View style={{ flexDirection: 'row' }}>
    {userType === 'admin' && (
      <IconButton
        icon="cog"
        color="#ffffff"
        iconColor="#ffffff"  // Added this line
        size={24}
        onPress={() => navigation.navigate('Settings')}
        style={{ marginRight: 5 }}
      />
    )}
    <IconButton
      icon="account-circle"
      color="#ffffff"
      iconColor="#ffffff"  // Added this line
      size={24}
      onPress={() => navigation.navigate('Account')}
      style={{ marginRight: 10 }}
    />
  </View>
)
,
  })}
>
  <Tab.Screen name="Scanner" options={{title: "QR Scanner"}}>
    {props => <ScannerScreen {...props} isOnline={isOnline} />}
  </Tab.Screen>

  <Tab.Screen name="Checklist" options={{title: "Selector"}}>
    {props => <ChecklistScreen {...props} isOnline={isOnline} />}
  </Tab.Screen>

  <Tab.Screen name="History" component={HistoryScreen} />
  <Tab.Screen name="Backup" component={BackupScreen} />
  <Tab.Screen name="About" component={AboutScreen} />
  <Tab.Screen name="Contact" component={ContactScreen} />
</Tab.Navigator>
  );
}

// Main app navigator
function AppNavigator({ isOnline, userType, setIsAuthenticated }) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: paperTheme.colors.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="Main"
        options={{ headerShown: false }}
      >
        {props => <MainTabNavigator {...props} isOnline={isOnline} userType={userType} />}
      </Stack.Screen>
      
      <Stack.Screen
        name="Account"
        options={{ title: 'Account' }}
      >
        {props => (
          <AccountScreen
            {...props}
            onSignOut={() => setIsAuthenticated(false)}
          />
        )}
      </Stack.Screen>
      
      {/* Add Settings Screen (only accessible to admins) */}
      <Stack.Screen
        name="Settings"
        options={{ title: 'Admin Settings' }}
        component={SettingsScreen}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const [error, setError] = useState(null);

  // Initialize app
useEffect(() => {
const initApp = async () => {
  try {
    console.log('App starting - initializing auth system');
    
    // Initialize auth system
    await initAuthSystem();
    
    // Check if user is already authenticated
    const authenticated = await checkAuthentication();
    console.log('Authentication status:', authenticated ? 'Authenticated' : 'Not authenticated');
    setIsAuthenticated(authenticated);
    
    // Add this new code to get the user type
    if (authenticated) {
      try {
        const userData = await import('./services/auth').then(module => module.getCurrentUser());
        if (userData && userData.role) {
          console.log('User role loaded:', userData.role);
          setUserType(userData.role);
        }
      } catch (userError) {
        console.error('Error loading user data:', userError);
      }
    }
    
    // Initialize notifications
    await initNotifications();
    
    // Initialize background sync
    await registerBackgroundSync();
    
    setIsLoading(false);
    console.log('App initialization completed');
  } catch (e) {
    console.error('Initialization error:', e);
    setError(e.message);
    setIsLoading(false);
  }
};

  initApp();

  // Set up network connectivity monitoring
  const unsubscribe = NetInfo.addEventListener(state => {
    try {
      const online = state.isConnected && state.isInternetReachable;
      setIsOnline(online);
      console.log('Network status changed:', online ? 'Online' : 'Offline');
      
      // If we just came online, try to process any pending backups
      if (online) {
        import('./services/background').then(module => {
          module.forceSyncNow().catch(e => console.log('Force sync error:', e));
        });
      }
    } catch (e) {
      console.error('Network monitoring error:', e);
    }
  });

// Set up app focus listener to sync when coming back to the app
const handleAppStateChange = (nextAppState) => {
  if (nextAppState === 'active') {
    console.log('App came to foreground, checking for credential updates...');
    import('./services/auth').then(module => {
      module.refreshCredentials().catch(e => console.log('Foreground credential sync error:', e));
    });
  }
};

// Subscribe to app state changes
const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

// Clean up the subscription when unmounting
return () => {
  try {
    unsubscribe(); // This is from the existing NetInfo unsubscribe
    appStateSubscription.remove(); // Modern way to remove the event listener  
  } catch (e) {
    console.error('Error cleaning up subscriptions:', e);
  }
};
}, []);

  // Handle successful login
  const handleLoginSuccess = (type) => {
    console.log('Login successful, user type:', type);
    setIsAuthenticated(true);
    setUserType(type);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading application...</Text>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}
        <StatusBar style="dark" backgroundColor="#ffffff" />
      </View>
    );
  }

return (
  <SafeAreaProvider>
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navigationTheme}>
        {isAuthenticated ? (
          <AppNavigator 
            isOnline={isOnline} 
            userType={userType} 
            setIsAuthenticated={setIsAuthenticated} 
          />
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login">
              {props => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          </Stack.Navigator>
        )}
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
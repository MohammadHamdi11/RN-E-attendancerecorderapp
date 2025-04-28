import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import { TextInput, Button, Text, Surface, Title, Caption, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { authenticateUser, refreshCredentials } from '../services/auth';

const LoginScreen = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isUserGuideExpanded, setIsUserGuideExpanded] = useState(false);
  const [isNeedHelpExpanded, setIsNeedHelpExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Check for network status on component mount
  useEffect(() => {
    const checkNetworkStatus = async () => {
      const networkState = await NetInfo.fetch();
      const online = networkState.isConnected && networkState.isInternetReachable;
      setIsOnline(online);
      
      // Auto-sync credentials if online
      if (online) {
        try {
          console.log('Auto-syncing credentials on LoginScreen...');
          await refreshCredentials();
        } catch (error) {
          console.error('Error syncing credentials on login screen:', error);
        }
      }
    };
    
    checkNetworkStatus();
    
    // Set up a listener for network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable;
      setIsOnline(online);
      
      // Sync when coming online
      if (online) {
        refreshCredentials()
          .catch(e => console.error('Error syncing on network change:', e));
      }
    });
    
    // Clean up the listener on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    // Reset error
    setError('');
    
    // Validate inputs
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    
    if (!password) {
      setError('Please enter your password');
      return;
    }

    try {
      setLoading(true);
      
      // Add this line to show loading status
      setError('Refreshing credentials and logging in...');
      
      const result = await authenticateUser(email, password);
      
      if (result.success) {
        onLoginSuccess(result.userType); // This is the correct way to pass user type
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openUserGuide = () => {
    Linking.openURL('https://drive.google.com/file/d/1Ep3iBe9rEqWBzOGAN6bUEMYtKeOCYbyk/view?usp=drive_link');
  };
  
  const openSupportForm = () => {
    Linking.openURL('https://docs.google.com/forms/d/e/1FAIpQLSfOt-UrLB_rBF6NdpPHG2iTaB8B5AcZIfkkQfOTslpsAULRBg/viewform?usp=header');
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Surface style={styles.container}>
        <Title style={styles.title}>Sign In</Title>
        
        {!isOnline && (
          <View style={styles.offlineNotice}>
            <MaterialCommunityIcons name="wifi-off" size={20} color="#951d1e" />
            <Text style={styles.offlineText}>
              You are offline. Only stored credentials will work.
            </Text>
          </View>
        )}
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Email:</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={text => {
              setEmail(text);
              setError(''); // Clear error when typing
            }}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            disabled={loading}
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Password:</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={text => {
                setPassword(text);
                setError(''); // Clear error when typing
              }}
              secureTextEntry={!showPassword}
              placeholder="Enter your password"
              autoCapitalize="none"
              disabled={loading}
            />
            <TouchableOpacity 
              style={styles.toggleButton}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <MaterialCommunityIcons 
                name={showPassword ? 'eye-off' : 'eye'} 
                size={24} 
                color={loading ? "#ccc" : "#777"} 
              />
            </TouchableOpacity>
          </View>
        </View>
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        
        <Button 
          mode="contained" 
          style={styles.button}
          onPress={handleLogin}
          loading={loading}
          disabled={loading}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </Button>        
        <View style={styles.divider} />
        
        {/* User Guide Section */}
        <TouchableOpacity 
          style={styles.collapsibleHeader}
          onPress={() => setIsUserGuideExpanded(!isUserGuideExpanded)}
          disabled={loading}
        >
          <Text style={styles.sectionTitle}>User Guide</Text>
          <MaterialCommunityIcons 
            name={isUserGuideExpanded ? 'chevron-up' : 'chevron-down'} 
            size={24} 
            color="#24325f" 
          />
        </TouchableOpacity>
        
        {isUserGuideExpanded && (
          <View style={styles.collapsibleContent}>
            <Text style={styles.contentText}>
              Need help getting started? Download our comprehensive user guide:
            </Text>
            <Button 
              mode="contained" 
              style={styles.smallButton}
              onPress={openUserGuide}
              disabled={loading}
            >
              Download User Guide
            </Button>
            <Caption style={styles.caption}>
              The guide contains detailed instructions for all app features,
              read it before resorting to contact support
            </Caption>
          </View>
        )}
        
        <View style={styles.divider} />
        
        {/* Need Help Section */}
        <TouchableOpacity 
          style={styles.collapsibleHeader}
          onPress={() => setIsNeedHelpExpanded(!isNeedHelpExpanded)}
          disabled={loading}
        >
          <Text style={styles.sectionTitle}>Need Help?</Text>
          <MaterialCommunityIcons 
            name={isNeedHelpExpanded ? 'chevron-up' : 'chevron-down'} 
            size={24} 
            color="#24325f" 
          />
        </TouchableOpacity>
        
        {isNeedHelpExpanded && (
          <View style={styles.collapsibleContent}>
            <Text style={styles.contentText}>
              If you're having trouble signing in or need assistance, please contact support:
            </Text>
            <Button 
              mode="contained" 
              style={styles.smallButton}
              onPress={openSupportForm}
              disabled={loading}
            >
              Support Form
            </Button>
            <Caption style={styles.caption}>
              We typically respond within 24-48 hours.
            </Caption>
          </View>
        )}
      </Surface>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f9f9f9', // Matches --light-bg
  },
  container: {
    padding: 24,
    borderRadius: 8,
    elevation: 4,
    alignItems: 'center',
    backgroundColor: '#ffffff', // Matches --card-bg
  },
  title: {
    fontSize: 24,
    marginBottom: 24,
    color: '#24325f', // Matches --primary-color
    fontWeight: 'bold',
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffe8e8',
    padding: 10,
    borderRadius: 5,
    marginBottom: 16,
    width: '100%',
  },
  offlineText: {
    color: '#951d1e',
    marginLeft: 8,
    fontSize: 14,
  },
  formGroup: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#24325f', // Matches --primary-color
  },
  input: {
    backgroundColor: '#ffffff',
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 10,
  },
  passwordContainer: {
    position: 'relative',
    width: '100%',
  },
  toggleButton: {
    position: 'absolute',
    right: 10,
    top: 12,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  toggleButtonText: {
    color: '#24325f',
  },
  errorText: {
    color: '#951d1e', // Matches --secondary-color
    marginTop: 8,
    marginBottom: 8,
  },
  button: {
    width: '100%',
    marginTop: 16,
    paddingVertical: 8,
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
  },
  buttonText: {
    color: 'white',
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: '#24325f',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#24325f',
    width: '100%',
    marginVertical: 16,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#24325f', // Matches --primary-color
  },
  collapsibleContent: {
    padding: 8,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#f5f5f5', // Matches --hover-bg
    borderRadius: 4,
  },
  contentText: {
    textAlign: 'center',
    marginBottom: 12,
  },
  smallButton: {
    marginVertical: 10,
    backgroundColor: '#24325f', // Matches --primary-color
    borderColor: '#24325f', // Matches --primary-color
  },
  smallButtonText: {
    color: 'white',
  },
  caption: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#24325f',
  },
});

export default LoginScreen;
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Text, Surface, Title, Caption, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authenticateUser } from '../services/auth';

const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isUserGuideExpanded, setIsUserGuideExpanded] = useState(false);
  const [isNeedHelpExpanded, setIsNeedHelpExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

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
      const isAuthenticated = await authenticateUser(email, password);
      
      if (isAuthenticated) {
        onLogin();
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

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Surface style={styles.container}>
        <Title style={styles.title}>Sign In</Title>
        
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
        
        {/* Default login info hint during development */}
        <Text style={styles.hint}>
          Default login: admin@example.com / password123
        </Text>
        
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
              onPress={() => Alert.alert('Coming Soon', 'The user guide will be available in a future update.')}
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
              onPress={() => Alert.alert('Support', 'Please email support@example.com for assistance.')}
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
    backgroundColor: '#f9f9f9',
  },
  container: {
    padding: 24,
    borderRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 24,
    color: '#24325f',
  },
  formGroup: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    width: '100%',
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
  },
  errorText: {
    color: '#951d1e',
    marginTop: 8,
    marginBottom: 8,
  },
  button: {
    width: '100%',
    marginTop: 16,
    paddingVertical: 8,
    backgroundColor: '#24325f',
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
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
    color: '#24325f',
  },
  collapsibleContent: {
    padding: 8,
    width: '100%',
    alignItems: 'center',
  },
  contentText: {
    textAlign: 'center',
    marginBottom: 12,
  },
  smallButton: {
    marginVertical: 10,
    backgroundColor: '#24325f',
  },
  caption: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#666',
  },
});

export default LoginScreen;
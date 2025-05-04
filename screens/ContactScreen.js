import React from 'react';
import { View, StyleSheet, ScrollView, Linking } from 'react-native';
import { Platform } from 'react-native';
import { Text, Surface, Title, Button, Divider } from 'react-native-paper';

const ContactScreen = () => {
  const openUserGuide = () => {
    // Open the PDF guide from Google Drive
    Linking.openURL('https://drive.google.com/file/d/1Ep3iBe9rEqWBzOGAN6bUEMYtKeOCYbyk/view?usp=drive_link');
  };
  
  const openSupportForm = () => {
    // Open the support form in external browser
    Linking.openURL('https://docs.google.com/forms/d/e/1FAIpQLSfOt-UrLB_rBF6NdpPHG2iTaB8B5AcZIfkkQfOTslpsAULRBg/viewform?usp=header');
  };
  
  return (
    <View style={styles.container}>
      <ScrollView>
        <Surface style={styles.card}>
          <Title style={styles.title}>Contact Support</Title>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Guide</Text>
            <Text style={styles.paragraph}>
              Before contacting support, please check our comprehensive user guide:
            </Text>
            <Button 
              mode="contained" 
              icon="file-pdf-box"
              style={styles.button}
              onPress={openUserGuide}
            >
              Download User Guide
            </Button>
            <Text style={styles.caption}>
              The guide contains detailed instructions for all app features.
            </Text>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Need Help?</Text>
            <Text style={styles.paragraph}>
              If you're still having trouble with the application after reading the user guide, 
              or need assistance, please contact support:
            </Text>
            <Button 
              mode="contained" 
              icon="help-circle"
              style={styles.button}
              onPress={openSupportForm}
            >
              Support Form
            </Button>
            <Text style={styles.caption}>
              We typically respond within 24-48 hours.
            </Text>
          </View>
        </Surface>
      </ScrollView>
    </View>
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
  },
  title: {
    fontSize: 20,
    marginBottom: 24,
    color: '#24325f', // Matches --primary-color
    fontWeight: 'bold',
  },
  section: {
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#24325f', // Matches --primary-color
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    marginVertical: 12,
    backgroundColor: '#24325f', // Matches --primary-color
    width: '80%',
  },
  caption: {
    fontSize: 12,
    color: '#24325f',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  divider: {
    marginVertical: 24,
    width: '100%',
    height: 1,
    backgroundColor: '#24325f',
  },
});

export default ContactScreen;
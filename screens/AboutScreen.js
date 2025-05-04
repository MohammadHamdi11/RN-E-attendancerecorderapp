import React from 'react';
import { View, StyleSheet, ScrollView, Linking } from 'react-native';
import { Text, Surface, Title, Subheading, List, Divider } from 'react-native-paper';
import { Platform } from 'react-native';

const AboutScreen = () => {
  const openUserGuide = () => {
    // Open the user guide from Google Drive
    Linking.openURL('https://drive.google.com/file/d/1Ep3iBe9rEqWBzOGAN6bUEMYtKeOCYbyk/view?usp=drive_link');
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <Surface style={styles.card}>
          <Title style={styles.title}>About This Application</Title>
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Function</Subheading>
            <Text style={styles.paragraph}>
              This application serves as both a QR Code Scanner and Student Selector 
              for attendance tracking in educational settings.
            </Text>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Special Thanks</Subheading>
            <Text style={styles.paragraph}>
              This project would not have been possible without the support and contributions of:
            </Text>
            <View style={styles.listContainer}>
              <List.Item
                title={
                  <Text style={styles.listItemText}>
                    <Text style={[styles.boldText, { color: '#24325f' }]}>Dr. Ahmad Samir</Text> who encouraged me to start working on this project
                  </Text>
                }
                left={props => <List.Icon {...props} icon="compass" color="#24325f" />}
                titleNumberOfLines={3}
              />
              <List.Item
                title={
                  <Text style={styles.listItemText}>
                    <Text style={[styles.boldText, { color: '#24325f' }]}>Dr. Amani Helmi</Text> for sponsoring this project and for being the reason behind its success
                  </Text>
                }
                left={props => <List.Icon {...props} icon="diamond-stone" color="#24325f" />}
                titleNumberOfLines={3}
              />
              <List.Item
                title={
                  <Text style={styles.listItemText}>
                    <Text style={[styles.boldText, { color: '#24325f' }]}>Dr. Gehan Adel</Text> for supporting me every step on the way
                  </Text>
                }
                left={props => <List.Icon {...props} icon="shield" color="#24325f" />}
                titleNumberOfLines={3}
              />
              <List.Item
                title={
                  <Text style={styles.listItemText}>
                    <Text style={[styles.boldText, { color: '#24325f' }]}>Dr. Doaa Mohammad Abu Bakr</Text> who was the catalyst to this project's success
                  </Text>
                }
                left={props => <List.Icon {...props} icon="fire" color="#24325f" />}
                titleNumberOfLines={3}
              />
              <List.Item
                title={
                  <Text style={styles.listItemText}>
                    <Text style={[styles.boldText, { color: '#24325f' }]}>Dr. Taqwa Mohammad Abd Al-Salam</Text> for aiding me with her efforts in deployment
                  </Text>
                }
                left={props => <List.Icon {...props} icon="code-braces" color="#24325f" />}
                titleNumberOfLines={3}
              />
              <List.Item
                title={
                  <Text style={styles.listItemText}>
                    <Text style={[styles.boldText, { color: '#24325f' }]}>Dr. Mazin Helmy</Text> my companion and friend who never got tired of me
                  </Text>
                }
                left={props => <List.Icon {...props} icon="emoticon-happy" color="#24325f" />}
                titleNumberOfLines={3}
              />
            </View>
          </View>          
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Development Team</Subheading>
            <Text style={styles.paragraph}>
              This application was developed by a medical student at Faculty of Medicine, 
              Ain Shams University as part of ongoing efforts to integrate technological
              solutions into educational processes at the university.
            </Text>
            <Text style={styles.paragraph}>
              Development was assisted by AI models: Claude (mainly) and DeepSeek.
            </Text>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Purpose</Subheading>
            <Text style={styles.paragraph}>The application was developed to:</Text>
            <View style={styles.listContainer}>
              <List.Item
                title="-Automate the attendance tracking process"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Decrease unnecessary workload from staff"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Provide reliable tracking and data management"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Enable flexible student selection methods"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
            </View>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Technical Details</Subheading>
            <Text style={styles.paragraph}>
              This is a mobile application built using React Native and Expo. This allows it to:
            </Text>
            <View style={styles.listContainer}>
              <List.Item
                title="-Work offline once installed"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Be installed on mobile devices"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Provide a native app-like experience"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Synchronize data when connectivity is restored"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
            </View>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Features</Subheading>
            <Text style={[styles.featureTitle, styles.boldText]}>QR Code Scanner:</Text>
            <Text style={styles.featureText}>
              Scans student QR codes for quick attendance tracking
            </Text>
            
            <Text style={[styles.featureTitle, styles.boldText, styles.topMargin]}>Student Selector:</Text>
            <Text style={styles.featureText}>
              Allows manual selection of students from organized lists
            </Text>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.section}>
            <Subheading style={styles.sectionTitle}>Usage Instructions</Subheading>
            <Text style={styles.paragraph}>To use this application effectively:</Text>
            
            <Text style={[styles.instructionTitle, styles.boldText]}>Scanner Mode:</Text>
            <View style={styles.orderedList}>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>1. Start a new scanning session and specify the location
                </Text>
              </View>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>2. Scan student QR codes or add entries manually
                </Text>
              </View>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>3. End the session when complete
                </Text>
              </View>
            </View>
            
            <Text style={[styles.instructionTitle, styles.boldText, styles.topMargin]}>Selector Mode:</Text>
            <View style={styles.orderedList}>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>1. Start a new session and specify the location
                </Text>
              </View>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>2. Filter students by year/group and select from the list
                </Text>
              </View>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>3. se the search function to quickly find specific students
                </Text>
              </View>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>4. Add custom entries for special cases</Text>
              </View>
              <View style={styles.orderedItem}>
                <Text style={styles.orderedText}>5. End the session when complete
                </Text>
              </View>
            </View>
            
            <Text style={[styles.instructionTitle, styles.boldText, styles.topMargin]}>For Both Modes:</Text>
            <View style={styles.listContainer}>
              <List.Item
                title="-Review past sessions in the History tab"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Backup your data regularly from the Backup tab"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
              <List.Item
                title="-Export data as needed for record keeping"
                titleStyle={styles.listItemTitle}
                titleNumberOfLines={2}
              />
            </View>
            
            <Text style={[styles.paragraph, styles.topMargin]}>
              For more detailed instructions, you can 
              <Text style={styles.linkText} onPress={openUserGuide}>
                {" access our comprehensive user guide here"}
              </Text>.
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
    marginBottom: 16,
    backgroundColor: '#ffffff', // Matches --card-bg
  },
  title: {
    fontSize: 20,
    marginBottom: 16,
    color: '#24325f', // Matches --primary-color
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#24325f', // Matches --primary-color
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
    height: 1,
    backgroundColor: '#24325f',
    width: '100%',
  },
  listContainer: {
    marginLeft: -8,
  },
  listItemTitle: {
    fontSize: 14,
    color: '#333',
    flexWrap: 'wrap',
    flex: 1,
  },
  listItemText: {
    fontSize: 14,
    color: '#333',
    flexWrap: 'wrap',
  },
  featureTitle: {
    fontSize: 15,
    marginTop: 4,
    color: '#24325f', // Matches --primary-color
    fontWeight: '500',
  },
  featureText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flexWrap: 'wrap',
  },
  boldText: {
    fontWeight: 'bold',
  },
  topMargin: {
    marginTop: 12,
  },
  instructionTitle: {
    fontSize: 15,
    marginTop: 4,
    marginBottom: 8,
    color: '#24325f', // Matches --primary-color
    fontWeight: '500',
  },
  orderedList: {
    marginLeft: 8,
    marginTop: 8,
  },
  orderedItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  orderedNumber: {
    width: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  orderedText: {
    flex: 1,
    color: '#333',
    flexWrap: 'wrap',
  },
  linkText: {
    color: '#24325f', // Matches --primary-color
    textDecorationLine: 'underline',
  },
});

export default AboutScreen;
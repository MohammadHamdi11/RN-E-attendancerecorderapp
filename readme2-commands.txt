


STEPS TO RUN THE PROJECT: (((downgrade to expo 47)))

1-navigate to directory in which you have the files in the 'structure' read me file.

2-open terminal in directory

3-to instal dependencies, write: "npx expo install"

4-to fix dependency and version issues: npx expo install --fix

5- npm install -g sharp

5- npm update @react-native/gradle-plugin

5-to start and test on virtual device/connected device (enable debugging), write: "npx expo start -c" OR "npx expo start --clear" (if there are problems with cache)

6-press 'a' to select the android device

7-press 'r' to reload (if needed)

==============================================================

use local machine to build offline:

1-run: expo prebuild

2-Move your medasuattendancerecorderapp.keystore to: android/app/

3-in android/app/build.gradle:

a-Replace the android block with this updated version (CAREFULL FOR INDENTATION):

android {
    ndkVersion rootProject.ext.ndkVersion
    compileSdkVersion rootProject.ext.compileSdkVersion
    namespace "com.qrscannerapp"
    
    defaultConfig {
        applicationId 'com.yourcompany.qrscannerapp'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0.0"
        buildConfigField("boolean", "REACT_NATIVE_UNSTABLE_USE_RUNTIME_SCHEDULER_ALWAYS", (findProperty("reactNative.unstable_useRuntimeSchedulerAlways") ?: true).toString())
    }

    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file('medasuattendancerecorderapp.keystore')
            storePassword 'medasu231249'
            keyAlias 'medasattendancerecorderapp_key'
            keyPassword 'medasu231249'
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release  // Changed from debug to release
            shrinkResources (findProperty('android.enableShrinkResourcesInReleaseBuilds')?.toBoolean() ?: false)
            minifyEnabled enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }

    // Apply static values from `gradle.properties` to the `android.packagingOptions`
    packagingOptions {
        ["pickFirsts", "excludes", "merges", "doNotStrip"].each { prop ->
            // Split option: 'foo,bar' -> ['foo', 'bar']
            def options = (findProperty("android.packagingOptions.$prop") ?: "").split(",");
            // Trim all elements in place.
            for (i in 0..<options.size()) options[i] = options[i].trim();
            // `[] - ""` is essentially `[""].filter(Boolean)` removing all empty strings.
            options -= ""

            if (options.length > 0) {
                println "android.packagingOptions.$prop += $options ($options.length)"
                // Ex: android.packagingOptions.pickFirsts += '**/SCCS/**'
                options.each {
                    if (prop == "pickFirsts") pickFirsts += it
                    else if (prop == "excludes") excludes += it
                    else if (prop == "merges") merges += it
                    else if (prop == "doNotStrip") doNotStrip += it
                }
            }
        }
    }
}

4-run: cd android
5-run: ./gradlew assembleRelease  --info
6-npm update @react-native/gradle-plugin
6-run: npx expo run:android


==============================================================

use expo platform to build online:

EXPO ACCOUNT:

a-app UUID:        36cc9f80-6e6f-419a-b970-583f5b4451d9
b-project url: https://expo.dev/accounts/mohammadhamdi11/projects/qr-scanner-app

STEPS:

1-Install EAS CLI (Expo Application Services):
npm install -g eas-cli

2-start and login:
eas init

3-Configure your project:
eas build:configure

4-Build the APK:
eas build -p android --profile production



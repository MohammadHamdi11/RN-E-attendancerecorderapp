




keytool -genkeypair -v -keystore medasuattendancerecorderapp.keystore -alias medasattendancerecorderapp_key -keyalg RSA -keysize 2048 -validity 365000 -storepass medasu2024 -keypass medasu231249 -dname "CN=Mohammad Hamdi, OU=Med, O=ASU, L=Cairo, ST=Nasr City, C=EG"





PS C:\Users\moham\Desktop\automation\Attendance recorder\RN-EXPO> keytool -genkeypair -v -keystore medasuattendancerecorderapp.keystore -alias medasattendancerecorderapp_key -keyalg RSA -keysize 2048 -validity 365000 -storepass medasu2024 -keypass medasu231249 -dname "CN=Mohammad Hamdi, OU=Med, O=ASU, L=Cairo, ST=Nasr City, C=EG"
Warning:  Different store and key passwords not supported for PKCS12 KeyStores. Ignoring user-specified -keypass value.
Generating 2,048 bit RSA key pair and self-signed certificate (SHA256withRSA) with a validity of 365,000 days
        for: CN=Mohammad Hamdi, OU=Med, O=ASU, L=Cairo, ST=Nasr City, C=EG
[Storing medasuattendancerecorderapp.keystore]
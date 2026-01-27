// App.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { NavigationContainer } from '@react-navigation/native';

import RootNavigator from './src/navigation/RootNavigator';
import { ShareIntentProvider } from './src/share/ShareIntentProvider';
import { navigationRef } from './src/navigation/NavigationRef';

export default function App() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected && state.isInternetReachable);
    });

    return () => unsubscribe();
  }, []);

  // ⏳ While checking connection
  if (isConnected === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Checking connection…</Text>
      </View>
    );
  }

  // 🚫 No Internet Screen
  if (!isConnected) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No Internet Connection</Text>
        <Text style={styles.subtitle}>
          Please check your Wi-Fi or mobile data.
        </Text>
      </View>
    );
  }

  // ✅ App when online
  return (
    <ShareIntentProvider>
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

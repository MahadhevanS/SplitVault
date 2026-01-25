// App.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { ShareIntentProvider } from './src/share/ShareIntentProvider';

// 👇 CHANGE THIS: Import the SHARED ref instead of creating a new one
import { navigationRef } from './src/navigation/NavigationRef'; 

export default function App() {
  return (
    <ShareIntentProvider>
      {/* Attach the shared ref here */}
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
    </ShareIntentProvider>
  );
}
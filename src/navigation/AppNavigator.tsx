import { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useShareIntent } from 'expo-share-intent';

import Home from '../screens/app/Home';
import ScreenshotImport from '../screens/app/ScreenshotImport';
import TripNavigator from './TripNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const navigation = useNavigation<any>();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="ScreenshotImport" component={ScreenshotImport} />
      <Stack.Screen name="Trip" component={TripNavigator} />
    </Stack.Navigator>
  );
}
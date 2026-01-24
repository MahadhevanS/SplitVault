// import { useEffect, useState } from 'react';
// import { createNativeStackNavigator } from '@react-navigation/native-stack';
// import { Session } from '@supabase/supabase-js';
// import { supabase } from '../api/supabase';
// import ScreenshotImport from '../screens/app/ScreenshotImport';
// import AuthNavigator from './AuthNavigator';
// import AppNavigator from './AppNavigator';
// import ExpenseInput from '../screens/trip/ExpenseInput';

// const Stack = createNativeStackNavigator();

// export default function RootNavigator() {
//   const [session, setSession] = useState<Session | null>(null);
//   const [initialized, setInitialized] = useState(false);
//   const [hasProfile, setHasProfile] = useState<boolean | null>(null);

//   const checkProfile = async (userId: string) => {
//     const { data } = await supabase
//       .from('users')
//       .select('id')
//       .eq('id', userId)
//       .single();

//     return !!data;
//   };

//   // ----------------
//   // Auth bootstrap
//   // ----------------
//   useEffect(() => {
//     supabase.auth.getSession().then(({ data: { session } }) => {
//       setSession(session);
//       setInitialized(true);
//     });

//     const { data: authListener } = supabase.auth.onAuthStateChange(
//       (_, session) => {
//         setSession(session);
//         setInitialized(true);
//       }
//     );

//     return () => {
//       authListener.subscription.unsubscribe();
//     };
//   }, []);

//   // ----------------
//   // Profile guard
//   // ----------------
//   useEffect(() => {
//     if (!session) {
//       setHasProfile(null);
//       return;
//     }

//     checkProfile(session.user.id).then(setHasProfile);
//   }, [session]);

//   if (!initialized) return null; // splash / loader if you want

//   return (
//     <Stack.Navigator screenOptions={{ headerShown: false }}>
//   {!session ? (
//     <Stack.Screen name="Auth" component={AuthNavigator} />
//   ) : (
//     <>
//       <Stack.Screen name="App" component={AppNavigator} />
     
//       {/* Move screens that are targets for imports/shares here */}
//       <Stack.Screen name="ScreenshotImport" component={ScreenshotImport} />
     
//       {/* Now ExpenseInput is a TOP-LEVEL screen too */}
//       <Stack.Screen name="ExpenseInput" component={ExpenseInput} />
//     </>
//   )}
// </Stack.Navigator>
//   );
// }

import { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../api/supabase';

import ScreenshotImport from '../screens/app/ScreenshotImport';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import ExpenseInput from '../screens/trip/ExpenseInput';

import { useCapturedShareIntent } from '../share/ShareIntentProvider';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const navigation = useNavigation<any>();
  const { uri, consume } = useCapturedShareIntent();

  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  // ----------------
  // Auth bootstrap
  // ----------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setSession(session);
        setInitialized(true);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ----------------
  // SHARE INTENT HANDLER  ✅ THIS IS THE CORRECT LOCATION
  // ----------------
  useEffect(() => {
    if (!initialized) return;
    if (!session) return;
    if (!uri) return;

    console.log('🚀 Navigating to ScreenshotImport with:', uri);

    navigation.navigate('ScreenshotImport', { uri });
    consume();
  }, [initialized, session, uri]);

  if (!initialized) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <>
          <Stack.Screen name="App" component={AppNavigator} />
          <Stack.Screen name="ScreenshotImport" component={ScreenshotImport} />
          <Stack.Screen name="ExpenseInput" component={ExpenseInput} />
        </>
      )}
    </Stack.Navigator>
  );
}

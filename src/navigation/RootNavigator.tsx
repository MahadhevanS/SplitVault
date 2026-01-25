// import { useEffect, useState } from 'react';
// import { createNativeStackNavigator } from '@react-navigation/native-stack';
// import { Session } from '@supabase/supabase-js';
// import { useNavigation } from '@react-navigation/native';
// import { supabase } from '../api/supabase';

// import ScreenshotImport from '../screens/app/ScreenshotImport';
// import AuthNavigator from './AuthNavigator';
// import AppNavigator from './AppNavigator';
// import ExpenseInput from '../screens/trip/ExpenseInput';
// import { navigationRef } from './NavigationRef';
// import { useCapturedShareIntent } from '../share/ShareIntentProvider';
// import CompleteProfile from '../screens/auth/CompleteProfile';

// const Stack = createNativeStackNavigator();

// export default function RootNavigator() {
//   const { uri, consume } = useCapturedShareIntent();

//   const [session, setSession] = useState<Session | null>(null);
//   const [initialized, setInitialized] = useState(false);
//   const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
//   const [profileVersion, setProfileVersion] = useState(0);
//   const handleProfileUpdate = () => {
//     // Incrementing this triggers the useEffect that calls checkProfile()
//     setProfileVersion((prev) => prev + 1);
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

//   useEffect(() => {
//     const checkProfile = async () => {
//       if (!session?.user) {
//         setProfileComplete(null);
//         return;
//       }

//       const { data, error } = await supabase
//         .from('users')
//         .select('name, phone')
//         .eq('id', session.user.id)
//         .single();

//       if (error) {
//         setProfileComplete(false);
//         return;
//       }

//       // 👇 THIS is the key logic
//       const isComplete = !!data?.name && !!data?.phone;
//       setProfileComplete(isComplete);
//     };

//     checkProfile();
//   }, [session, profileVersion]);


//   // ----------------
//   // SHARE INTENT HANDLER  ✅ THIS IS THE CORRECT LOCATION
//   // ----------------
// useEffect(() => {
//     if (!initialized || !session || !uri) return;

//     let retries = 0;
//     const maxRetries = 10;

//     const attemptNavigation = () => {
//       // Check if the container is ready
//       if (navigationRef.isReady()) {
//         console.log('🚀 Navigation Ready. Going to ScreenshotImport:', uri);
        
//         // Navigate
//         navigationRef.navigate('ScreenshotImport' as never, { uri } as never);
        
//         // Consume intent so we don't loop
//         consume(); 
//       } else {
//         // If not ready, retry up to 10 times (10 * 100ms = 1 second max wait)
//         if (retries < maxRetries) {
//           retries++;
//           console.log(`⚠️ Navigation not ready. Retry ${retries}/${maxRetries}...`);
//           setTimeout(attemptNavigation, 100);
//         } else {
//           console.error('❌ Failed to navigate: Navigation container never became ready.');
//         }
//       }
//     };

//     // Trigger the attempt
//     attemptNavigation();

//   }, [initialized, session, uri]);

//   if (!initialized) return null;
//   if (session && profileComplete === null) return null;

//   return (
//     <Stack.Navigator screenOptions={{ headerShown: false }}>
//       {!session ? (
//         <Stack.Screen name="Auth" component={AuthNavigator} />
//       ) : !profileComplete ? (
//         <Stack.Screen name="CompleteProfile">
//           {(props) => (
//             <CompleteProfile 
//               {...props} 
//               onSaveSuccess={handleProfileUpdate} 
//             />
//           )}
//         </Stack.Screen>
//       ) : (
//         <>
//           <Stack.Screen name="App" component={AppNavigator} />
//           <Stack.Screen name="ScreenshotImport" component={ScreenshotImport} />
//           <Stack.Screen name="ExpenseInput" component={ExpenseInput} />
//         </>
//       )}
//     </Stack.Navigator>
//   );
// }


import { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

// Screens
import ScreenshotImport from '../screens/app/ScreenshotImport';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import ExpenseInput from '../screens/trip/ExpenseInput';
import CompleteProfile from '../screens/auth/CompleteProfile';

// Note: ShareIntentProvider is still wrapped in App.tsx, but we don't need to consume it here.

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  const handleProfileUpdate = () => {
    setProfileVersion((prev) => prev + 1);
  };

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
  // Profile Check
  // ----------------
  useEffect(() => {
    const checkProfile = async () => {
      if (!session?.user) {
        setProfileComplete(null);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('name, phone')
        .eq('id', session.user.id)
        .single();

      if (error) {
        setProfileComplete(false);
        return;
      }

      const isComplete = !!data?.name && !!data?.phone;
      setProfileComplete(isComplete);
    };

    checkProfile();
  }, [session, profileVersion]);


  if (!initialized) return null;
  // If we have a session but haven't determined profile status yet, wait.
  if (session && profileComplete === null) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : !profileComplete ? (
        <Stack.Screen name="CompleteProfile">
          {(props) => (
            <CompleteProfile 
              {...props} 
              onSaveSuccess={handleProfileUpdate} 
            />
          )}
        </Stack.Screen>
      ) : (
        <>
          {/* When this component mounts, the ShareIntentHandler inside it 
            will also mount and handle the deep link.
          */}
          <Stack.Screen name="App" component={AppNavigator} />
          
          {/* These remain here for global modal access if needed */}
          <Stack.Screen name="ScreenshotImport" component={ScreenshotImport} />
          <Stack.Screen name="ExpenseInput" component={ExpenseInput} />
        </>
      )}
    </Stack.Navigator>
  );
}
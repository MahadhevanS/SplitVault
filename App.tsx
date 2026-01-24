// import { useEffect, useRef } from 'react';
// import {
//   NavigationContainer,
//   createNavigationContainerRef,
// } from '@react-navigation/native';
// import { useShareIntent } from 'expo-share-intent';
// import RootNavigator from './src/navigation/RootNavigator';

// export const navigationRef = createNavigationContainerRef();

// export default function App() {
//   const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
//   const pendingUri = useRef<string | null>(null);

//   // Extract URI as soon as intent arrives
//   useEffect(() => {
//     if (!hasShareIntent || !shareIntent) return;

//     const uri =
//       shareIntent.files?.[0]?.path ||
//       shareIntent.files?.[0]?.uri ||
//       shareIntent.webUrl ||
//       (shareIntent.text?.startsWith('content://')
//         ? shareIntent.text
//         : null);

//     if (!uri) return;

//     pendingUri.current = uri;
//   }, [hasShareIntent, shareIntent]);

//   // Navigate ONLY when navigation is ready
//   useEffect(() => {
//     if (!navigationRef.isReady()) return;
//     if (!pendingUri.current) return;

//     navigationRef.navigate('ScreenshotImport' as never, {
//       uri: pendingUri.current,
//     } as never);

//     pendingUri.current = null;
//     resetShareIntent();
//   }, [navigationRef.isReady()]);

//   return (
//     <NavigationContainer
//       ref={navigationRef}
//       onReady={() => {
//         // triggers the effect above
//       }}
//     >
//       <RootNavigator />
//     </NavigationContainer>
//   );
// }


import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { ShareIntentProvider } from './src/share/ShareIntentProvider';

export const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <ShareIntentProvider>
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
    </ShareIntentProvider>
  );
}

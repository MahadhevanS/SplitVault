import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useCapturedShareIntent } from '../share/ShareIntentProvider';

export const ShareIntentHandler = () => {
  const navigation = useNavigation<any>();
  const { uri, consume } = useCapturedShareIntent();

  useEffect(() => {
    // Only run if we have a valid URI
    if (uri) {
      // ⏳ WAIT for the AppNavigator transition to finish.
      // 500ms is usually enough for the "slide in" animation to complete.
      const timer = setTimeout(() => {
        console.log('🚀 Executing delayed navigation to:', uri);
        
        navigation.navigate('ScreenshotImport', { uri });
        
        // Consume the intent ONLY after we have triggered navigation
        consume();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [uri, navigation, consume]);
    
  return null; // This component renders nothing UI-wise
};
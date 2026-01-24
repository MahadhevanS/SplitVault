import React, { createContext, useContext, useEffect, useState } from 'react';
import { useShareIntent } from 'expo-share-intent';

type ShareIntentContextType = {
  uri: string | null;
  consume: () => void;
};

const ShareIntentContext = createContext<ShareIntentContextType>({
  uri: null,
  consume: () => {},
});

export function ShareIntentProvider({ children }: { children: React.ReactNode }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;

    const extracted =
      shareIntent.files?.[0]?.path ||
      shareIntent.files?.[0]?.uri ||
      shareIntent.webUrl ||
      (shareIntent.text?.startsWith('content://')
        ? shareIntent.text
        : null);

    if (!extracted) return;

    console.log('📥 Share intent captured:', extracted);
    setUri(extracted);
  }, [hasShareIntent, shareIntent]);

  const consume = () => {
    setUri(null);
    resetShareIntent();
  };

  return (
    <ShareIntentContext.Provider value={{ uri, consume }}>
      {children}
    </ShareIntentContext.Provider>
  );
}

export function useCapturedShareIntent() {
  return useContext(ShareIntentContext);
}

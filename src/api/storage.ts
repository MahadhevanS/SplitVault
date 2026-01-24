// src/api/storage.ts

/**
 * Supabase-compatible async storage
 * - Node / Expo CLI → no-op storage (prevents window crash)
 * - Web → localStorage wrapper
 * - Native (iOS / Android) → AsyncStorage (lazy-loaded)
 */
export const SUPABASE_STORAGE=
  typeof window === 'undefined'
    ? {
        // Node / Metro / SSR-safe
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
    : (() => {
        // Browser
        if (typeof window !== 'undefined' && window.localStorage) {
          return {
            getItem: async (key: string) =>
              window.localStorage.getItem(key),
            setItem: async (key: string, value: string) => {
              window.localStorage.setItem(key, value);
            },
            removeItem: async (key: string) => {
              window.localStorage.removeItem(key);
            },
          };
        }

        // React Native (lazy import — IMPORTANT)
        const AsyncStorage =
          require('@react-native-async-storage/async-storage').default;

        return {
          getItem: (key: string) => AsyncStorage.getItem(key),
          setItem: (key: string, value: string) =>
            AsyncStorage.setItem(key, value),
          removeItem: (key: string) =>
            AsyncStorage.removeItem(key),
        };
      })();

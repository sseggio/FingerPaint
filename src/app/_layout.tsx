import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useFlushOnBackground, useHydration } from '@/features/hydration/use-hydration';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const hydrated = useHydration();
  useFlushOnBackground();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => undefined);
  }, [hydrated]);

  // Keep the native splash up (render nothing) until persisted stores are loaded.
  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={{
          ...base,
          colors: {
            ...base.colors,
            background: colors.background,
            card: colors.surface,
            primary: colors.primary,
            text: colors.ink,
            border: colors.border,
          },
        }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

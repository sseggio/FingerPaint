import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={{
          ...base,
          colors: { ...base.colors, background: colors.background, card: colors.surface, primary: colors.primary, text: colors.ink, border: colors.border },
        }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <NativeTabs tintColor={colors.primary} backgroundColor={colors.surface}>
          <NativeTabs.Trigger name="index">
            <NativeTabs.Trigger.Label>Galerie</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="create">
            <NativeTabs.Trigger.Label>Créer</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: 'paintbrush.pointed', selected: 'paintbrush.pointed.fill' }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="library">
            <NativeTabs.Trigger.Label>Mes œuvres</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="settings">
            <NativeTabs.Trigger.Label>Réglages</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

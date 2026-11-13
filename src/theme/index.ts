import { useColorScheme } from 'react-native';

import { colors, type ColorScheme, type ThemeColors } from './tokens';

export * from './tokens';

export type Theme = { scheme: ColorScheme; colors: ThemeColors };

export function getTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: colors[scheme] };
}

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return getTheme(scheme);
}

export const palette = {
  pink: '#FF3D7F',
  violet: '#7B5CFF',
  sun: '#FFC93C',
  mint: '#2ED3A0',
  sky: '#3DB8FF',
  orange: '#FF8A3D',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorScheme = 'light' | 'dark';

export const colors = {
  light: {
    background: '#FFF8F0',
    surface: '#FFFFFF',
    surfaceAlt: '#F4EEFF',
    ink: '#1B1A2E',
    inkSecondary: '#6B6880',
    border: '#ECE6F5',
    primary: palette.pink,
    onPrimary: palette.white,
    accent: palette.violet,
    success: palette.mint,
    warning: palette.sun,
    info: palette.sky,
    shadow: '#7B5CFF',
  },
  dark: {
    background: '#14121F',
    surface: '#1F1C2E',
    surfaceAlt: '#2A2640',
    ink: '#F7F5FF',
    inkSecondary: '#A7A3BC',
    border: '#332F48',
    primary: palette.pink,
    onPrimary: palette.white,
    accent: palette.violet,
    success: palette.mint,
    warning: palette.sun,
    info: palette.sky,
    shadow: '#000000',
  },
} as const;

export type ThemeColors = { [K in keyof (typeof colors)['light']]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.3 },
  heading: { fontSize: 22, fontWeight: '800' },
  body: { fontSize: 17, fontWeight: '500' },
  label: { fontSize: 15, fontWeight: '700' },
  caption: { fontSize: 13, fontWeight: '600' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Cycle of vivid accents used for album cards, confetti, badges. */
export const funAccents = [
  palette.pink,
  palette.violet,
  palette.sun,
  palette.mint,
  palette.sky,
  palette.orange,
] as const;

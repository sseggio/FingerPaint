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
    /** Filled button background — white text on it passes WCAG AA (4.6:1). */
    primary: '#E01F66',
    onPrimary: palette.white,
    /** Primary-colored text on background/surface (AA). */
    primaryText: '#C2185B',
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
    primary: '#E01F66',
    onPrimary: palette.white,
    primaryText: palette.pink,
    accent: palette.violet,
    success: palette.mint,
    warning: palette.sun,
    info: palette.sky,
    shadow: '#000000',
  },
} as const;

export type ThemeColors = { [K in keyof (typeof colors)['light']]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** `xs` only rounds tiny decorative pixels (confetti squares, progress tracks). */
export const radius = { xs: 4, sm: 12, md: 20, lg: 28, pill: 999 } as const;

/** Fixed sizes of small decorative pixel elements (pixel-art icons, joker squares). */
export const sizes = {
  /** One pixel of a pixel-art icon (streak flame, empty-state art). */
  iconPixel: 4,
  /** Joker indicator square of the daily card. */
  jokerSquare: 12,
  /** Outline of the joker squares. */
  jokerBorder: 2,
} as const;

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

/** Neon pack (cosmetic, F12): glowing accents on a deep night backdrop. */
export const neon = {
  night: '#0B0820',
  cyan: '#00F0FF',
  magenta: '#FF2BD6',
  lime: '#B6FF3C',
  yellow: '#FFE94D',
  violet: '#9B6BFF',
} as const;

/** Pro bonus cosmetic: golden confetti. */
export const gold = ['#FFC93C', '#FFD86B', '#FFB000', '#FFF1B8', '#FF8A3D', '#E8A317'] as const;

export interface CanvasThemeColors {
  /** Behind the artwork (null: the screen background). */
  backdrop: string | null;
  grid: string;
  /** "Find" ring and its halo. */
  ring: string;
  halo: string;
}

/** Looks of the coloring canvas (the artwork's own colors never change). */
export const canvasThemes: Readonly<Record<'classic' | 'neon', CanvasThemeColors>> = {
  classic: { backdrop: null, grid: colors.light.ink, ring: palette.pink, halo: palette.white },
  neon: { backdrop: neon.night, grid: neon.cyan, ring: neon.magenta, halo: neon.cyan },
};

/** Confetti colors per style. */
export const confettiPalettes: Readonly<Record<'classic' | 'neon' | 'gold', readonly string[]>> = {
  classic: funAccents,
  neon: [neon.cyan, neon.magenta, neon.lime, neon.yellow, neon.violet],
  gold,
};

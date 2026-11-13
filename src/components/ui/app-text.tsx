import { Text, type TextProps } from 'react-native';

import { typography, useTheme, type TypographyVariant } from '@/theme';

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  tone?: 'default' | 'secondary' | 'primary' | 'inverse';
  /** Explicit text color; overrides `tone`. */
  color?: string;
};

export function AppText({ variant = 'body', tone = 'default', color: colorOverride, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const color =
    tone === 'secondary'
      ? colors.inkSecondary
      : tone === 'primary'
        ? colors.primaryText
        : tone === 'inverse'
          ? colors.onPrimary
          : colors.ink;
  return <Text {...rest} style={[typography[variant], { color: colorOverride ?? color }, style]} />;
}

import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { PressableScale } from './pressable-scale';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  color?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  color,
  icon,
  disabled,
  loading,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const bg =
    variant === 'primary' ? (color ?? colors.primary) : variant === 'secondary' ? colors.surfaceAlt : 'transparent';
  const tone = variant === 'primary' ? 'inverse' : 'default';

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.base,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        variant === 'primary' && { shadowColor: bg, ...styles.shadow },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.ink} />
      ) : (
        <View style={styles.row}>
          {icon}
          <AppText variant="label" tone={tone}>
            {label}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shadow: { shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
});

import { StyleSheet, Switch, View } from 'react-native';

import { palette, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { PressableScale } from './pressable-scale';

export type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * A setting toggle: label, optional description and a switch. The whole row is one accessible
 * switch (label + description as hint), so it is a large touch target that wraps cleanly with
 * Dynamic Type.
 */
export function SwitchRow({ label, description, value, onValueChange, disabled }: SwitchRowProps) {
  const { colors } = useTheme();
  const toggle = () => onValueChange(!value);
  return (
    <PressableScale
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={toggle}
      scaleTo={0.98}
      style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.text}>
        <AppText variant="label">{label}</AppText>
        {description ? (
          <AppText variant="caption" tone="secondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={palette.white}
        ios_backgroundColor={colors.border}
        // The row carries the accessible switch; avoid a second focus stop.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  disabled: { opacity: 0.5 },
});

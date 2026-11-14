import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { readableTextOn } from '@/lib/color';
import { radius, spacing } from '@/theme';

import { AppText } from './app-text';

export type BadgeProps = {
  label: string;
  /** Background color (a theme token); the text color is picked for AA contrast. */
  color: string;
  style?: StyleProp<ViewStyle>;
};

/** Small, discreet pill (Pro, Pack, Complete…). Decorative: the parent carries the meaning. */
export function Badge({ label, color, style }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]} accessible={false}>
      <AppText variant="caption" color={readableTextOn(color)} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  text: { fontWeight: '800', letterSpacing: 0.3 },
});

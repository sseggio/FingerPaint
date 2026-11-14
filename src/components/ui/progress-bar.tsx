import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/theme';

export type ProgressBarProps = {
  /** 0..1 */
  value: number;
  color: string;
  trackColor: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

/** Thin rounded progress bar (decorative; pair it with text for screen readers). */
export function ProgressBar({ value, color, trackColor, height = 6, style }: ProgressBarProps) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height }, style]} accessible={false}>
      <View style={[styles.fill, { backgroundColor: color, width: `${ratio * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.pill, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: '100%', borderRadius: radius.pill },
});

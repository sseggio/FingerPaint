import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/theme';

import { AppText } from './app-text';

export type ScreenProps = ScrollViewProps & {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  scroll?: boolean;
};

/** Standard screen shell: safe area, big bold title, themed background. */
export function Screen({ title, subtitle, headerRight, scroll = true, children, contentContainerStyle, ...rest }: ScreenProps) {
  const { colors } = useTheme();
  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText tone="secondary">{subtitle}</AppText> : null}
      </View>
      {headerRight}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          {...rest}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, contentContainerStyle]}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.root]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 3 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.sm },
  headerText: { flex: 1, gap: spacing.xs },
});

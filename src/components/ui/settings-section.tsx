import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Card } from './card';

export type SettingsSectionProps = {
  title: string;
  /** Accent color of the section marker (a theme accent token). */
  accent: string;
  children: ReactNode;
};

/** A titled group of settings in a card, rows separated by hairlines. */
export function SettingsSection({ title, accent, children }: SettingsSectionProps) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={[styles.marker, { backgroundColor: accent }]} />
        <AppText variant="heading" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
      </View>
      <Card style={styles.card}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            {row}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  marker: { width: 6, alignSelf: 'stretch', minHeight: 20, borderRadius: radius.pill },
  title: { flex: 1 },
  card: { paddingVertical: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth },
});

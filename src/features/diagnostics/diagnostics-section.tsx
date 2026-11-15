import { useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { AppText, Button, SettingsSection } from '@/components/ui';
import { useT } from '@/features/i18n';
import { palette, spacing } from '@/theme';

import { formatReport } from './diagnostics-schema';
import { useDiagnosticsStore } from './diagnostics-store';

/** Entries listed on screen (the copied report has all of them). */
const SHOWN = 5;

/**
 * "Diagnostics" section of "About" (F19): the last errors caught on the device, hidden while
 * there are none. "Copy" opens the system share sheet with the report: the user decides where it
 * goes, the app sends nothing.
 */
export function DiagnosticsSection({ version }: { version: string }) {
  const t = useT();
  const entries = useDiagnosticsStore((s) => s.entries);
  const hydrate = useDiagnosticsStore((s) => s.hydrate);
  const clear = useDiagnosticsStore((s) => s.clear);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (entries.length === 0) return null;

  const copy = () => {
    const message = formatReport(entries, t('about.diagnostics.reportHeader', { version }));
    Share.share({ message }).catch(() => undefined);
  };

  return (
    <SettingsSection title={t('about.diagnostics.title')} accent={palette.sky}>
      <View style={styles.block}>
        <AppText tone="secondary">{t('about.diagnostics.intro')}</AppText>
        <AppText variant="label">{t('about.diagnostics.count', { count: entries.length })}</AppText>
        {entries.slice(0, SHOWN).map((e, k) => (
          <AppText key={`${e.at}-${k}`} variant="caption" selectable numberOfLines={3}>
            {`${new Date(e.at).toISOString()} · ${e.source}\n${e.message}`}
          </AppText>
        ))}
        <View style={styles.row}>
          <Button
            variant="secondary"
            label={t('about.diagnostics.copy')}
            accessibilityLabel={t('about.diagnostics.copyLabel')}
            onPress={copy}
            style={styles.flex}
          />
          <Button
            variant="ghost"
            label={t('about.diagnostics.clear')}
            accessibilityLabel={t('about.diagnostics.clearLabel')}
            onPress={() => {
              void clear();
            }}
            style={styles.flex}
          />
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md, paddingVertical: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});

import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { applyImport, usePendingImportStore } from '@/features/backup/backup-io';
import type { ImportSummary } from '@/features/backup/backup-merge';
import { useFormatDate } from '@/features/gallery/format-date';
import { useT } from '@/features/i18n';
import { funAccents, palette, radius, spacing, useTheme } from '@/theme';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

function SummaryLine({ accent, text }: { accent: string; text: string }) {
  return (
    <View style={styles.line}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <AppText style={styles.flex}>{text}</AppText>
    </View>
  );
}

function SummaryCard({ summary }: { summary: ImportSummary }) {
  const t = useT();
  const formatDate = useFormatDate();
  return (
    <Card style={styles.card}>
      <AppText variant="heading" accessibilityRole="header">
        {t('import.heading')}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {t('import.createdAt', { date: formatDate(summary.createdAt) })}
      </AppText>
      <SummaryLine accent={palette.sky} text={t('import.inFile', { count: summary.inFile })} />
      <SummaryLine accent={palette.mint} text={t('import.added', { count: summary.added })} />
      <SummaryLine accent={palette.violet} text={t('import.improved', { count: summary.improved })} />
      <SummaryLine accent={palette.sun} text={t('import.kept', { count: summary.kept })} />
      <SummaryLine accent={palette.pink} text={t('import.completed', { count: summary.completedAfter })} />
      <SummaryLine accent={palette.orange} text={t('import.streak', { count: summary.streakAfter, best: summary.bestAfter })} />
      <SummaryLine accent={palette.sky} text={t('import.settings')} />
    </Card>
  );
}

/** Confirmation before applying a validated backup: what will change, then Restore / Cancel. */
export function BackupImportScreen() {
  const t = useT();
  const { colors } = useTheme();
  const plan = usePendingImportStore((s) => s.plan);
  const setPlan = usePendingImportStore((s) => s.setPlan);
  const [state, setState] = useState<'idle' | 'applying' | 'done' | 'failed'>('idle');

  const cancel = () => {
    setPlan(null);
    close();
  };

  const confirm = async () => {
    if (!plan) return;
    setState('applying');
    try {
      await applyImport(plan);
      setPlan(null);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('import.title') }} />
      <View style={styles.pixels} accessible={false}>
        {funAccents.map((c) => (
          <View key={c} style={[styles.pixel, { backgroundColor: c }]} />
        ))}
      </View>
      {state === 'done' ? (
        <Card style={styles.card}>
          <AppText variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">
            {t('settings.data.imported')}
          </AppText>
          <Button label={t('import.done')} onPress={close} />
        </Card>
      ) : plan ? (
        <>
          <SummaryCard summary={plan.summary} />
          <AppText variant="caption" tone="secondary" style={styles.rules}>
            {t('import.rules')}
          </AppText>
          {state === 'failed' ? (
            <AppText variant="label" tone="primary" accessibilityRole="alert">
              {t('import.failed')}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={t('import.confirm')}
              accessibilityLabel={t('import.confirmLabel')}
              loading={state === 'applying'}
              onPress={() => {
                void confirm();
              }}
            />
            <Button
              variant="secondary"
              label={t('import.cancel')}
              accessibilityLabel={t('import.cancelLabel')}
              disabled={state === 'applying'}
              onPress={cancel}
            />
          </View>
        </>
      ) : (
        <Card style={styles.card}>
          <AppText>{t('import.missing')}</AppText>
          <Button variant="secondary" label={t('import.cancel')} accessibilityLabel={t('import.cancelLabel')} onPress={close} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  pixels: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  pixel: { width: spacing.xl, height: spacing.xl, borderRadius: radius.xs },
  card: { gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: spacing.md, height: spacing.md, borderRadius: radius.xs },
  flex: { flex: 1 },
  rules: { paddingHorizontal: spacing.sm },
  actions: { gap: spacing.sm },
});

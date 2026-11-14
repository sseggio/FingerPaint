import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, Button, Card, SegmentedControl } from '@/components/ui';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { MOCK_OUTCOMES, MockProvider, type MockOutcome } from '@/features/entitlements/mock-provider';
import { useT } from '@/features/i18n';
import { palette, spacing } from '@/theme';

/**
 * Development helpers of the mock store: choose the next purchase outcome, approve pending
 * purchases, reset everything. Rendered only in `__DEV__` builds with the mock provider.
 */
export function MockDevPanel({ onNotice }: { onNotice(message: string): void }) {
  const t = useT();
  const provider = useEntitlementsStore((s) => s.provider);
  const clear = useEntitlementsStore((s) => s.clear);
  // Re-rendered after each purchase (busy changes), when the mock resets its next outcome.
  useEntitlementsStore((s) => s.busy);
  const [, setRevision] = useState(0);
  if (!(provider instanceof MockProvider)) return null;
  const next = provider.getNextOutcome();
  const setNext = (value: MockOutcome) => {
    provider.setNextOutcome(value);
    setRevision((r) => r + 1);
  };

  return (
    <Card style={[styles.card, { borderColor: palette.sun }]}>
      <AppText variant="label" accessibilityRole="header">
        {t('shop.dev.title')}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {t('shop.dev.next')}
      </AppText>
      <SegmentedControl<MockOutcome>
        accessibilityLabel={t('shop.dev.nextLabel')}
        value={next}
        onChange={setNext}
        options={MOCK_OUTCOMES.map((value) => ({ value, label: t(`shop.dev.outcome.${value}`) }))}
      />
      <Button
        variant="secondary"
        label={t('shop.dev.approve')}
        accessibilityLabel={t('shop.dev.approveLabel')}
        onPress={() => {
          void provider.approvePending();
        }}
      />
      <Button
        variant="secondary"
        label={t('shop.dev.reset')}
        accessibilityLabel={t('shop.dev.resetLabel')}
        onPress={() => {
          void provider
            .reset()
            .then(clear)
            .then(() => {
              setNext('success');
              onNotice(t('shop.dev.resetDone'));
            });
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderWidth: 2, borderStyle: 'dashed' },
});

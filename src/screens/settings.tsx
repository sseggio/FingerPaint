import { StyleSheet } from 'react-native';

import { AppText, Card, Screen, SegmentedControl } from '@/components/ui';
import { useLocale, useT, type LocalePreference } from '@/features/i18n';
import { useSettingsStore } from '@/features/settings/settings-store';
import { spacing } from '@/theme';

export function SettingsScreen() {
  const t = useT();
  const locale = useLocale();
  const preference = useSettingsStore((s) => s.settings.locale);
  const update = useSettingsStore((s) => s.update);
  const language = t(locale === 'fr' ? 'language.fr' : 'language.en');

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <Card style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          {t('settings.language.title')}
        </AppText>
        <SegmentedControl<LocalePreference>
          accessibilityLabel={t('settings.language.title')}
          value={preference}
          onChange={(value) => {
            void update({ locale: value });
          }}
          options={[
            { value: 'system', label: t('settings.language.system') },
            { value: 'fr', label: t('language.fr') },
            { value: 'en', label: t('language.en') },
          ]}
        />
        <AppText tone="secondary" variant="caption">
          {preference === 'system'
            ? t('settings.language.systemHint', { language })
            : t('settings.language.manualHint')}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
});

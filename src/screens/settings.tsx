import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, SegmentedControl, SettingsSection, SwitchRow, Toast } from '@/components/ui';
import { exportBackup, pickBackup, usePendingImportStore } from '@/features/backup/backup-io';
import { useDailyStore } from '@/features/daily/daily-store';
import { ownsGold, ownsNeon } from '@/features/entitlements/cosmetics';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { useLocale, useT, type LocalePreference } from '@/features/i18n';
import { useProgressStore } from '@/features/progress/progress-store';
import type { SessionTimerMin, Settings } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { palette, spacing, useTheme } from '@/theme';

const TIMER_OPTIONS: readonly SessionTimerMin[] = [0, 10, 20, 30];

type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

/** One toggle bound to a boolean setting (persisted immediately by the store). */
function SettingSwitch({ name, label, description }: { name: BooleanSetting; label: string; description: string }) {
  const value = useSettingsStore((s) => s.settings[name]);
  const update = useSettingsStore((s) => s.update);
  return (
    <SwitchRow
      label={label}
      description={description}
      value={value}
      onValueChange={(next) => {
        void update({ [name]: next });
      }}
    />
  );
}

function LanguageSection() {
  const t = useT();
  const locale = useLocale();
  const preference = useSettingsStore((s) => s.settings.locale);
  const update = useSettingsStore((s) => s.update);
  const language = t(locale === 'fr' ? 'language.fr' : 'language.en');
  return (
    <SettingsSection title={t('settings.language.title')} accent={palette.sky}>
      <View style={styles.block}>
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
      </View>
    </SettingsSection>
  );
}

function WellbeingSection() {
  const t = useT();
  const minutes = useSettingsStore((s) => s.settings.sessionTimerMin);
  const update = useSettingsStore((s) => s.update);
  return (
    <SettingsSection title={t('settings.wellbeing.title')} accent={palette.mint}>
      <View style={styles.block}>
        <AppText variant="label">{t('settings.timer.label')}</AppText>
        <SegmentedControl<string>
          accessibilityLabel={t('settings.timer.label')}
          value={String(minutes)}
          onChange={(value) => {
            const next = TIMER_OPTIONS.find((m) => String(m) === value);
            if (next !== undefined) void update({ sessionTimerMin: next });
          }}
          options={TIMER_OPTIONS.map((m) => ({
            value: String(m),
            label: m === 0 ? t('settings.timer.off') : t('settings.timer.minutes', { count: m }),
          }))}
        />
        <AppText tone="secondary" variant="caption">
          {t('settings.timer.hint')}
        </AppText>
      </View>
    </SettingsSection>
  );
}

/** Toggles of owned cosmetics only (nothing is shown for what is not owned: no upsell here). */
function CosmeticsSection() {
  const t = useT();
  const neon = useEntitlementsStore((s) => ownsNeon(s.entitlements));
  const gold = useEntitlementsStore((s) => ownsGold(s.entitlements));
  if (!neon && !gold) return null;
  return (
    <SettingsSection title={t('settings.cosmetics.title')} accent={palette.pink}>
      {neon ? <SettingSwitch name="neonTheme" label={t('settings.neon.label')} description={t('settings.neon.hint')} /> : null}
      {gold ? (
        <SettingSwitch name="goldConfetti" label={t('settings.gold.label')} description={t('settings.gold.hint')} />
      ) : null}
    </SettingsSection>
  );
}

function ShopSection() {
  const t = useT();
  return (
    <SettingsSection title={t('settings.shop.title')} accent={palette.violet}>
      <View style={styles.block}>
        <AppText tone="secondary" variant="caption">
          {t('settings.shop.hint')}
        </AppText>
        <Button variant="secondary" label={t('settings.shop.open')} onPress={() => router.push('/shop')} />
      </View>
    </SettingsSection>
  );
}

type Notice = { message: string; accent: string };

function DataSection({ onNotice }: { onNotice(notice: Notice): void }) {
  const t = useT();
  const removeAll = useProgressStore((s) => s.removeAll);
  const resetDaily = useDailyStore((s) => s.reset);
  const setPending = usePendingImportStore((s) => s.setPending);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const confirmReset = () => {
    Alert.alert(t('settings.data.confirmTitle'), t('settings.data.confirmBody'), [
      { text: t('settings.data.cancel'), style: 'cancel' },
      {
        text: t('settings.data.confirm'),
        style: 'destructive',
        onPress: () => {
          void Promise.all([removeAll(), resetDaily()]).then(() =>
            onNotice({ message: t('settings.data.done'), accent: palette.mint }),
          );
        },
      },
    ]);
  };

  const exportData = async () => {
    setBusy('export');
    try {
      const outcome = await exportBackup(t('settings.data.exportDialog'));
      if (outcome === 'unavailable') onNotice({ message: t('settings.data.exportUnavailable'), accent: palette.sun });
    } catch {
      onNotice({ message: t('settings.data.exportFailed'), accent: palette.orange });
    } finally {
      setBusy(null);
    }
  };

  const importData = async () => {
    setBusy('import');
    try {
      const outcome = await pickBackup();
      if (outcome.status === 'error') {
        onNotice({ message: t(`settings.data.error.${outcome.error}`), accent: palette.orange });
      } else if (outcome.status === 'ready') {
        setPending({ backup: outcome.backup, plan: outcome.plan });
        router.push('/backup-import');
      }
    } catch {
      onNotice({ message: t('settings.data.error.read-failed'), accent: palette.orange });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection title={t('settings.data.title')} accent={palette.orange}>
      <View style={styles.block}>
        <AppText tone="secondary" variant="caption">
          {t('settings.data.backupHint')}
        </AppText>
        <Button
          label={t('settings.data.export')}
          accessibilityLabel={t('settings.data.exportLabel')}
          loading={busy === 'export'}
          disabled={busy === 'import'}
          onPress={() => {
            void exportData();
          }}
        />
        <Button
          variant="secondary"
          label={t('settings.data.import')}
          accessibilityLabel={t('settings.data.importLabel')}
          loading={busy === 'import'}
          disabled={busy === 'export'}
          onPress={() => {
            void importData();
          }}
        />
      </View>
      <View style={styles.block}>
        <AppText tone="secondary" variant="caption">
          {t('settings.data.resetHint')}
        </AppText>
        <Button variant="secondary" label={t('settings.data.reset')} onPress={confirmReset} />
      </View>
    </SettingsSection>
  );
}

export function SettingsScreen() {
  const t = useT();
  const { colors } = useTheme();
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <View style={styles.root}>
      <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
        <LanguageSection />
        <SettingsSection title={t('settings.coloring.title')} accent={palette.pink}>
          <SettingSwitch
            name="dragToFill"
            label={t('settings.dragToFill.label')}
            description={t('settings.dragToFill.hint')}
          />
          <SettingSwitch name="haptics" label={t('settings.haptics.label')} description={t('settings.haptics.hint')} />
        </SettingsSection>
        <SettingsSection title={t('settings.a11y.title')} accent={palette.violet}>
          <SettingSwitch
            name="colorblindSymbols"
            label={t('settings.colorblind.label')}
            description={t('settings.colorblind.hint')}
          />
          <SettingSwitch
            name="largeNumbers"
            label={t('settings.largeNumbers.label')}
            description={t('settings.largeNumbers.hint')}
          />
          <SettingSwitch
            name="highContrast"
            label={t('settings.highContrast.label')}
            description={t('settings.highContrast.hint')}
          />
          <SettingSwitch
            name="leftHanded"
            label={t('settings.leftHanded.label')}
            description={t('settings.leftHanded.hint')}
          />
        </SettingsSection>
        <CosmeticsSection />
        <WellbeingSection />
        <ShopSection />
        <DataSection onNotice={setNotice} />
        <AppText variant="caption" color={colors.inkSecondary} style={styles.footer}>
          {t('settings.privacy')}
        </AppText>
      </Screen>
      {notice ? (
        <View style={styles.toast} pointerEvents="box-none">
          <Toast
            message={notice.message}
            accent={notice.accent}
            durationMs={3500}
            onTimeout={() => setNotice(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  block: { gap: spacing.md, paddingVertical: spacing.md },
  footer: { textAlign: 'center', paddingHorizontal: spacing.lg },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl },
});

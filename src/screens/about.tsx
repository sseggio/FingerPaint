import { Stack } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, SettingsSection } from '@/components/ui';
import { CONTACT_EMAIL, getAppVersion } from '@/features/about/app-info';
import { OPEN_SOURCE_CREDITS } from '@/features/about/licenses';
import { useT } from '@/features/i18n';
import { funAccents, palette, radius, spacing, useTheme } from '@/theme';

function Bullet({ accent, text }: { accent: string; text: string }) {
  return (
    <View style={styles.line}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <AppText style={styles.flex}>{text}</AppText>
    </View>
  );
}

/** "About": version, privacy promise, credits, open-source licenses and contact. Fully offline. */
export function AboutScreen() {
  const t = useT();
  const { colors } = useTheme();
  const { version, build } = getAppVersion();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('about.title') }} />
      <View style={styles.hero}>
        <View style={styles.pixels} accessible={false}>
          {funAccents.map((c) => (
            <View key={c} style={[styles.pixel, { backgroundColor: c }]} />
          ))}
        </View>
        <AppText variant="display" accessibilityRole="header">
          FingerPaint
        </AppText>
        <AppText tone="secondary">{t('about.tagline')}</AppText>
        <AppText variant="caption" tone="secondary">
          {build ? t('about.versionBuild', { version, build }) : t('about.version', { version })}
        </AppText>
      </View>

      <SettingsSection title={t('about.privacy.title')} accent={palette.mint}>
        <View style={styles.block}>
          <Bullet accent={palette.mint} text={t('about.privacy.none')} />
          <Bullet accent={palette.sky} text={t('about.privacy.device')} />
          <Bullet accent={palette.pink} text={t('about.privacy.ads')} />
          <Bullet accent={palette.violet} text={t('about.privacy.purchases')} />
        </View>
      </SettingsSection>

      <SettingsSection title={t('about.credits.title')} accent={palette.sun}>
        <View style={styles.block}>
          <AppText>{t('about.credits.art')}</AppText>
          <AppText tone="secondary">{t('about.credits.made')}</AppText>
        </View>
      </SettingsSection>

      <SettingsSection title={t('about.licenses.title')} accent={palette.violet}>
        <View style={styles.block}>
          <AppText tone="secondary">{t('about.licenses.intro')}</AppText>
          {OPEN_SOURCE_CREDITS.map((credit) => (
            <AppText key={credit.name} variant="caption">
              {t('about.licenses.item', credit)}
            </AppText>
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title={t('about.contact.title')} accent={palette.orange}>
        <View style={styles.block}>
          <AppText tone="secondary">{t('about.contact.body')}</AppText>
          <AppText variant="label" tone="primary" selectable>
            {CONTACT_EMAIL}
          </AppText>
          <Button
            variant="secondary"
            label={t('about.contact.button')}
            accessibilityLabel={t('about.contact.label', { email: CONTACT_EMAIL })}
            onPress={() => {
              Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => undefined);
            }}
          />
        </View>
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl * 2 },
  hero: { gap: spacing.sm, alignItems: 'flex-start' },
  pixels: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  pixel: { width: spacing.md, height: spacing.md, borderRadius: radius.xs },
  block: { gap: spacing.md, paddingVertical: spacing.md },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: spacing.md, height: spacing.md, borderRadius: radius.xs, marginTop: spacing.xs },
  flex: { flex: 1 },
});

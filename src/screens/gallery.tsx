import { AppText, Card, Screen } from '@/components/ui';
import { useT } from '@/features/i18n';

export function GalleryScreen() {
  const t = useT();
  return (
    <Screen title={t('gallery.title')} subtitle={t('gallery.subtitle')}>
      <Card>
        <AppText variant="heading">{t('common.comingSoon')}</AppText>
      </Card>
    </Screen>
  );
}

import { AppText, Card, Screen } from '@/components/ui';
import { listArtworks } from '@/features/artwork/registry';
import { useT } from '@/features/i18n';

export function LibraryScreen() {
  const t = useT();
  const count = listArtworks().length;
  return (
    <Screen title={t('library.title')} subtitle={t('library.subtitle')}>
      <Card>
        <AppText variant="heading">{t('common.comingSoon')}</AppText>
        <AppText tone="secondary">{t('library.artworkCount', { count })}</AppText>
      </Card>
    </Screen>
  );
}

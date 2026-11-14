import { Badge } from '@/components/ui';
import { lockReason, type LockReason } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { useT } from '@/features/i18n';
import type { ArtworkAccess } from '@/lib/artwork/types';
import { palette } from '@/theme';

/** Current lock reason of an artwork (null when it can be opened). */
export function useLockReason(access: ArtworkAccess): LockReason | null {
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  return lockReason(access, entitlements);
}

/** Discreet Pro / Pack marker on locked content. */
export function AccessBadge({ reason }: { reason: LockReason }) {
  const t = useT();
  return reason === 'pro' ? (
    <Badge label={t('library.badge.pro')} color={palette.violet} />
  ) : (
    <Badge label={t('library.badge.pack')} color={palette.sky} />
  );
}

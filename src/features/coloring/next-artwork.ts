import type { ProgressSummary } from '@/features/progress/progress-schema';

/**
 * Artwork offered by "Next" on the completion screen: the first one after `currentId` (in
 * library order, wrapping around) that is not completed yet, else simply the next one. Null
 * when the library holds nothing else.
 */
export function nextArtworkId(
  currentId: string,
  orderedIds: readonly string[],
  index: Readonly<Record<string, ProgressSummary | undefined>>,
): string | null {
  const others = orderedIds.length;
  const start = orderedIds.indexOf(currentId);
  let fallback: string | null = null;
  for (let step = 1; step <= others; step++) {
    const id = orderedIds[(start + step + others) % others];
    if (id === currentId) continue;
    fallback ??= id;
    if (index[id]?.status !== 'completed') return id;
  }
  return fallback;
}

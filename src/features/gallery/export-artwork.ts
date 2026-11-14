import { getArtwork } from '@/features/artwork/registry';
import { shareFile, writeFile } from '@/features/files/files';
import type { ThumbnailFill } from '@/features/library/thumbnail-pixels';
import { useProgressStore } from '@/features/progress/progress-store';
import type { ProgressEntry } from '@/lib/library';

import { renderArtworkPng } from './render-png';

/**
 * - `export`: the PNG is kept in the app's documents (`exports/`), then the share sheet opens
 *   so it can be saved to Photos / Files.
 * - `share`: a temporary copy in the cache, straight to the share sheet.
 */
export type PngAction = 'export' | 'share';

export type PngOutcome = 'shared' | 'unavailable' | 'missing';

/** Cells to color: everything when completed, the saved bitset otherwise (partial export). */
async function fillFor(artworkId: string, totalCells: number, entry: ProgressEntry | undefined): Promise<ThumbnailFill> {
  if (entry?.status === 'completed') return 'all';
  if (!entry || entry.filledCount === 0) return 'none';
  return (await useProgressStore.getState().loadFilled(artworkId, totalCells)) ?? 'none';
}

export async function exportArtworkPng(
  artworkId: string,
  entry: ProgressEntry | undefined,
  background: string | null,
  action: PngAction,
  dialogTitle: string,
): Promise<PngOutcome> {
  const artwork = getArtwork(artworkId);
  if (!artwork) return 'missing';
  const png = renderArtworkPng(artwork, await fillFor(artworkId, artwork.totalCells, entry), background);
  const name = `fingerpaint-${artworkId}-${png.width}x${png.height}.png`;
  const uri = await writeFile(action === 'export' ? 'documents' : 'cache', action === 'export' ? 'exports' : 'share', name, png.bytes);
  const shared = await shareFile(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
  return shared ? 'shared' : 'unavailable';
}

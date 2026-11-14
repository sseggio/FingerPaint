/**
 * @jest-environment ./jest/skia-environment.js
 */
import { act, render, screen } from '@testing-library/react-native';

import { useProgressStore } from '@/features/progress/progress-store';
import { getArtwork } from '@/features/artwork/registry';
import { createBitset, setBit } from '@/lib/bitset';

import { ArtworkThumbnail, clearThumbnailCache } from './artwork-thumbnail';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);

function imageCount(): number {
  let count = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { type, children } = node as { type?: unknown; children?: unknown[] | null };
    if (type === 'skImage') count++;
    children?.forEach(walk);
  };
  const json = screen.toJSON();
  (Array.isArray(json) ? json : json ? [json] : []).forEach(walk);
  return count;
}

beforeEach(() => {
  clearThumbnailCache();
});

describe('ArtworkThumbnail', () => {
  it('draws one nearest-neighbor image for a new artwork', async () => {
    await render(<ArtworkThumbnail artworkId="tabby-cat" size={96} />);
    expect(imageCount()).toBe(1);
  });

  it('loads the bitset of a partial state once and caches it', async () => {
    const artwork = getArtwork('tabby-cat');
    if (!artwork) throw new Error('fixture missing');
    const bits = createBitset(artwork.totalCells);
    setBit(bits, 0);
    const loadFilled = jest.fn(() => Promise.resolve(bits));
    useProgressStore.setState({ loadFilled });
    const progress = { status: 'in_progress', filledCount: 1, updatedAt: 7 } as const;

    await render(<ArtworkThumbnail artworkId="tabby-cat" size={96} progress={progress} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadFilled).toHaveBeenCalledWith('tabby-cat', artwork.totalCells);
    expect(imageCount()).toBe(1);

    // Same state elsewhere (another list): served from the LRU cache.
    await render(<ArtworkThumbnail artworkId="tabby-cat" size={64} progress={progress} />);
    expect(loadFilled).toHaveBeenCalledTimes(1);
  });

  it('renders an empty box for an unknown artwork', async () => {
    await render(<ArtworkThumbnail artworkId="nope" size={40} />);
    expect(imageCount()).toBe(0);
  });
});

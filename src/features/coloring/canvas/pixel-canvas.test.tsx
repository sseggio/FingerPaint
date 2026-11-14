/**
 * @jest-environment ./jest/skia-environment.js
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { toArtwork } from '@/lib/artwork/codec';

import { createPerfArtworkSource } from './__fixtures__/perf-artwork';
import { createColorPixels } from './layers';
import { PixelCanvas } from './pixel-canvas';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
// CanvasKit has no system fonts: stand in for the pre-rendered number texture.
jest.mock('./glyph-atlas', () => ({
  createNumberAtlas: (count: number) => ({ image: {}, count, spritePx: 96, columns: 8 }),
}));

const artwork = toArtwork(createPerfArtworkSource());

/** Host element types in the rendered tree (Skia nodes render as `sk*` hosts under the mock). */
function hostTypes(): string[] {
  const types: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { type, children } = node as { type?: unknown; children?: unknown[] | null };
    if (typeof type === 'string') types.push(type);
    children?.forEach(walk);
  };
  const json = screen.toJSON();
  (Array.isArray(json) ? json : json ? [json] : []).forEach(walk);
  return types;
}

function Subject({ revision = 0, activeColor = null }: { revision?: number; activeColor?: number | null }) {
  return (
    <GestureHandlerRootView>
      <PixelCanvas
        artwork={artwork}
        colorPixels={createColorPixels(artwork.width, artwork.height)}
        colorRevision={revision}
        activeColor={activeColor}
        onFill={activeColor === null ? undefined : () => undefined}
        accessibilityLabel="Artwork"
      />
    </GestureHandlerRootView>
  );
}

describe('PixelCanvas (Skia mock)', () => {
  it('renders the 128×128 fixture once measured: two layers, grid and numbers', async () => {
    const { rerender } = await render(<Subject />);
    const canvas = screen.getByLabelText('Artwork');
    // Nothing is drawn before the size is known.
    expect(hostTypes()).not.toContain('skImage');

    await act(async () => {
      await fireEvent(canvas, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
    });
    const types = hostTypes();
    expect(types.filter((t) => t === 'skImage')).toHaveLength(2);
    expect(types).toEqual(expect.arrayContaining(['skGroup', 'skPath', 'skAtlas']));

    await rerender(<Subject revision={1} />);
    expect(screen.getByLabelText('Artwork')).toBeTruthy();
  });

  it('adds the active-color highlight and the drag preview when coloring', async () => {
    await render(<Subject activeColor={3} />);
    await act(async () => {
      await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    const types = hostTypes();
    // Background, highlight mask, color layer.
    expect(types.filter((t) => t === 'skImage')).toHaveLength(3);
    // Drag preview + grid.
    expect(types.filter((t) => t === 'skPath')).toHaveLength(2);
  });
});

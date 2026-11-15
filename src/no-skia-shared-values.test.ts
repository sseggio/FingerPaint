import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard (F19): Skia objects (images, paths) must not live in shared values. Crossing the JS / UI
 * runtimes with them is a known source of native crashes; pass them as React props instead (or
 * build them on the UI runtime, e.g. in `useDerivedValue`).
 */
const FORBIDDEN = /useSharedValue\s*<\s*(SkImage|SkPath)\b/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('no Skia object in a shared value', () => {
  it('src never declares useSharedValue<SkImage…> or useSharedValue<SkPath…>', () => {
    const root = __dirname;
    const offenders = sources(root)
      .filter((file) => file !== __filename)
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });

  it('the pattern catches the forbidden forms', () => {
    expect(FORBIDDEN.test('const a = useSharedValue<SkImage | null>(null);')).toBe(true);
    expect(FORBIDDEN.test('const p = useSharedValue< SkPath >(path);')).toBe(true);
    expect(FORBIDDEN.test('const s = useSharedValue<PreviewState>(x);')).toBe(false);
  });
});

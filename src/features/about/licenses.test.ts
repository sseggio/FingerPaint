import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveAppVersion } from './app-info';
import { OPEN_SOURCE_CREDITS } from './licenses';

const root = join(__dirname, '..', '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };

describe('open-source credits', () => {
  it.each(OPEN_SOURCE_CREDITS.map((c) => [c.name, c]))('%s is a dependency with the declared license', (name, credit) => {
    expect(pkg.dependencies[name]).toBeDefined();
    const installed = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')) as {
      license?: string;
    };
    expect(installed.license).toBe(credit.license);
  });

  it('has no duplicate', () => {
    const names = OPEN_SOURCE_CREDITS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('resolveAppVersion', () => {
  it('prefers the native binary values', () => {
    expect(resolveAppVersion({ nativeVersion: '1.0.0', nativeBuild: '42', configVersion: '0.9.0' })).toEqual({
      version: '1.0.0',
      build: '42',
    });
  });

  it('falls back to the app config, then to a neutral value', () => {
    expect(resolveAppVersion({ nativeVersion: null, nativeBuild: null, configVersion: '1.0.0' })).toEqual({
      version: '1.0.0',
      build: null,
    });
    expect(resolveAppVersion({ nativeVersion: null, nativeBuild: '', configVersion: undefined })).toEqual({
      version: '0.0.0',
      build: null,
    });
  });
});

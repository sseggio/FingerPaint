/**
 * Release configuration (F13): app.json identity and privacy manifest, EAS profiles, and the
 * generated icon assets. A failing test here means a TestFlight upload would likely be rejected.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import { colors, palette } from '@/theme/tokens';

const root = join(__dirname, '..', '..');
const readJson = (file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));

type ApiType = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };

const { expo } = readJson('app.json');
const eas = readJson('eas.json');

describe('app.json', () => {
  it('has the FingerPaint identity', () => {
    expect(expo).toMatchObject({ name: 'FingerPaint', slug: 'fingerpaint', scheme: 'fingerpaint' });
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(expo.ios.bundleIdentifier).toBe('com.fingerpaint.app');
    expect(expo.android.package).toBe('com.fingerpaint.app');
    // The build number is managed remotely by EAS, never hard-coded.
    expect(expo.ios.buildNumber).toBeUndefined();
    expect(expo.android.versionCode).toBeUndefined();
  });

  it('declares no non-exempt encryption (no export-compliance prompt)', () => {
    expect(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(expo.ios.config.usesNonExemptEncryption).toBe(false);
  });

  it('ships a privacy manifest: no tracking, nothing collected, required-reason APIs declared', () => {
    const manifest = expo.ios.privacyManifests;
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
    expect(manifest.NSPrivacyCollectedDataTypes).toEqual([]);
    const reasons = Object.fromEntries(
      (manifest.NSPrivacyAccessedAPITypes as ApiType[]).map((t) => [t.NSPrivacyAccessedAPIType, t.NSPrivacyAccessedAPITypeReasons]),
    );
    expect(reasons.NSPrivacyAccessedAPICategoryUserDefaults).toContain('CA92.1');
    expect(reasons.NSPrivacyAccessedAPICategoryFileTimestamp).toContain('C617.1');
  });

  it('covers every required-reason API declared by the installed iOS dependencies', () => {
    // Reasons found in node_modules/**/PrivacyInfo.xcprivacy (React Native, expo-file-system…).
    const required: Record<string, string[]> = {
      NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
      NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1', '0A2A.1', '3B52.1'],
      NSPrivacyAccessedAPICategoryDiskSpace: ['E174.1', '85F4.1'],
      NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
    };
    const declared = expo.ios.privacyManifests.NSPrivacyAccessedAPITypes as ApiType[];
    for (const [type, codes] of Object.entries(required)) {
      const entry = declared.find((t) => t.NSPrivacyAccessedAPIType === type);
      expect(entry?.NSPrivacyAccessedAPITypeReasons).toEqual(expect.arrayContaining(codes));
    }
  });

  it('is iPhone-first and uses the generated PNG icon (no template leftovers)', () => {
    expect(expo.ios.supportsTablet).toBe(false);
    expect(expo.ios.icon).toBe('./assets/images/icon.png');
    expect(JSON.stringify(expo)).not.toMatch(/expo\.icon|react-logo|partial-react/);
  });

  it('takes its splash and adaptive icon colors from the design tokens', () => {
    const splash = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash.backgroundColor).toBe(colors.light.background);
    expect(splash.dark.backgroundColor).toBe(colors.dark.background);
    expect(expo.android.adaptiveIcon.backgroundColor).toBe(palette.violet);
  });
});

describe('eas.json', () => {
  it('lets EAS manage the build number', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);
  });

  it('defines development (mock store), preview and production (StoreKit) profiles', () => {
    expect(eas.build.development).toMatchObject({
      developmentClient: true,
      distribution: 'internal',
      env: { EXPO_PUBLIC_IAP_PROVIDER: 'mock' },
    });
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', env: { EXPO_PUBLIC_IAP_PROVIDER: 'storekit' } });
    expect(eas.build.production.env.EXPO_PUBLIC_IAP_PROVIDER).toBe('storekit');
  });

  it('never ships the mock store outside of development builds', () => {
    for (const [name, profile] of Object.entries(eas.build) as [string, { env?: Record<string, string> }][]) {
      if (name !== 'development') expect(profile.env?.EXPO_PUBLIC_IAP_PROVIDER).not.toBe('mock');
    }
  });

  it('has App Store Connect submit placeholders', () => {
    expect(eas.submit.production.ios).toEqual({ ascAppId: expect.any(String), appleTeamId: expect.any(String) });
  });
});

describe('generated icons', () => {
  const read = (file: string) => PNG.sync.read(readFileSync(join(root, 'assets', 'images', file)));

  it('the App Store icon is 1024×1024 without an alpha channel', () => {
    const icon = read('icon.png');
    expect([icon.width, icon.height]).toEqual([1024, 1024]);
    expect(icon.alpha).toBe(false);
  });

  it.each(['android-icon-foreground.png', 'android-icon-background.png', 'android-icon-monochrome.png'])(
    '%s is 1024×1024',
    (file) => {
      const png = read(file);
      expect([png.width, png.height]).toEqual([1024, 1024]);
    },
  );

  it('the adaptive foreground and splash are transparent around the drop', () => {
    for (const file of ['android-icon-foreground.png', 'splash-icon.png']) {
      const png = read(file);
      expect(png.alpha).toBe(true);
      expect(png.data[3]).toBe(0);
    }
  });

  it('match what scripts/generate-icons.mjs produces (assets are not edited by hand)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-icons-'));
    try {
      execFileSync(process.execPath, [join(root, 'scripts', 'generate-icons.mjs'), '--preview', dir], { stdio: 'pipe' });
      const files = readdirSync(dir).sort();
      expect(files).toHaveLength(6);
      for (const file of files) {
        expect([file, readFileSync(join(dir, file)).equals(readFileSync(join(root, 'assets', 'images', file)))]).toEqual([
          file,
          true,
        ]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

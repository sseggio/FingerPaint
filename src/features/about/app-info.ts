import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * Support address shown in "About". PLACEHOLDER: replace it with a real, monitored mailbox
 * before the App Store submission (also update docs/privacy-policy.md and the store listing).
 */
export const CONTACT_EMAIL = 'hello@fingerpaint.app';

export interface AppVersion {
  /** Marketing version (`1.0.0`). */
  version: string;
  /** Native build number (managed remotely by EAS), null in Expo Go / tests / web. */
  build: string | null;
}

interface VersionSources {
  nativeVersion: string | null;
  nativeBuild: string | null;
  configVersion: string | undefined;
}

/** Pure resolution: native values first (the real binary), then the app config. */
export function resolveAppVersion({ nativeVersion, nativeBuild, configVersion }: VersionSources): AppVersion {
  const version = nativeVersion || configVersion || '0.0.0';
  return { version, build: nativeBuild || null };
}

export function getAppVersion(): AppVersion {
  return resolveAppVersion({
    nativeVersion: Application.nativeApplicationVersion,
    nativeBuild: Application.nativeBuildVersion,
    configVersion: Constants.expoConfig?.version,
  });
}

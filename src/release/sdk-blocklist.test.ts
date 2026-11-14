/**
 * Product rule: no ads, no analytics, no tracking, no crash reporter ("no data collected" on
 * the App Store privacy label). Fails if a known SDK of that kind enters package.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** Package name patterns of ad, analytics, attribution, tracking and crash-reporting SDKs. */
const BLOCKED_SDKS: readonly RegExp[] = [
  /^@react-native-firebase\//,
  /^firebase$/,
  /^@firebase\//,
  /google-mobile-ads/,
  /admob/i,
  /facebook/i,
  /^react-native-fbsdk/,
  /^expo-ads-/,
  /^expo-tracking-transparency$/,
  /amplitude/i,
  /mixpanel/i,
  /^@segment\//,
  /segment-analytics/i,
  /appsflyer/i,
  /adjust/i,
  /react-native-branch/i,
  /^branch-sdk/i,
  /kochava/i,
  /singular-react-native/i,
  /^@singular/i,
  /applovin/i,
  /unity-ads/i,
  /ironsource/i,
  /chartboost/i,
  /vungle/i,
  /posthog/i,
  /datadog/i,
  /newrelic/i,
  /new-relic/i,
  /instabug/i,
  /bugsnag/i,
  /sentry/i,
  /crashlytics/i,
  /^@heap\//,
  /heap-react-native/i,
  /heap-analytics/i,
  /flurry/i,
  /onesignal/i,
  /braze/i,
  /appcenter/i,
  /smartlook/i,
  /logrocket/i,
  /fullstory/i,
  /microsoft-clarity/i,
  /react-native-clarity/i,
  /hotjar/i,
  /^expo-insights$/,
  /^expo-firebase-analytics$/,
  /^expo-analytics/,
];

const allDeps = Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
  ...pkg.optionalDependencies,
  ...pkg.peerDependencies,
});

describe('ads / analytics / tracking blocklist', () => {
  it.each(['react-native-segmented-control', 'expo-image', 'zustand'])('does not flag %s', (name) => {
    expect(BLOCKED_SDKS.some((re) => re.test(name))).toBe(false);
  });

  it('package.json contains no blocked SDK', () => {
    const offenders = allDeps.filter((name) => BLOCKED_SDKS.some((re) => re.test(name)));
    expect(offenders).toEqual([]);
  });

  it.each([
    '@react-native-firebase/analytics',
    'react-native-google-mobile-ads',
    'react-native-fbsdk-next',
    '@amplitude/analytics-react-native',
    'mixpanel-react-native',
    '@segment/analytics-react-native',
    'react-native-appsflyer',
    'react-native-adjust',
    '@sentry/react-native',
    'expo-insights',
  ])('catches %s', (name) => {
    expect(BLOCKED_SDKS.some((re) => re.test(name))).toBe(true);
  });
});

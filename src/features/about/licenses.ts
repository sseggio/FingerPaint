/** An open-source package shipped in the app, shown in "About" › Open-source licenses. */
export interface OpenSourceCredit {
  name: string;
  license: string;
  /** Short copyright holder line. */
  author: string;
}

/**
 * Main runtime dependencies (checked against `package.json` and each package's declared license
 * by `licenses.test.ts`: adding or removing a dependency keeps this list honest).
 */
export const OPEN_SOURCE_CREDITS: readonly OpenSourceCredit[] = [
  { name: 'react', license: 'MIT', author: 'Meta Platforms, Inc.' },
  { name: 'react-native', license: 'MIT', author: 'Meta Platforms, Inc.' },
  { name: 'expo', license: 'MIT', author: '650 Industries, Inc. (Expo)' },
  { name: 'expo-router', license: 'MIT', author: '650 Industries, Inc. (Expo)' },
  { name: 'expo-iap', license: 'MIT', author: 'hyochan and contributors' },
  { name: '@shopify/react-native-skia', license: 'MIT', author: 'Shopify Inc.' },
  { name: 'react-native-reanimated', license: 'MIT', author: 'Software Mansion' },
  { name: 'react-native-gesture-handler', license: 'MIT', author: 'Software Mansion' },
  { name: 'react-native-worklets', license: 'MIT', author: 'Software Mansion' },
  { name: 'react-native-screens', license: 'MIT', author: 'Software Mansion' },
  { name: 'react-native-safe-area-context', license: 'MIT', author: 'Janic Duplessis and contributors' },
  { name: '@react-native-async-storage/async-storage', license: 'MIT', author: 'React Native Community' },
  { name: 'zustand', license: 'MIT', author: 'Paul Henschel and contributors' },
];

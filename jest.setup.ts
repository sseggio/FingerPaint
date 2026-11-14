// Official AsyncStorage Jest mock (in-memory, jest.fn spies).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Gesture Handler 3 installs its UI-runtime bindings when imported; under Jest, Worklets runs in
// web mode where `getUIRuntimeHolder` throws, so the (native-only) install is skipped.
jest.mock('react-native-gesture-handler/lib/module/handlers/gestures/installUIRuntimeBindings', () => ({
  installUIRuntimeBindings: () => undefined,
}));

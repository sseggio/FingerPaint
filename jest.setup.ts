// Official AsyncStorage Jest mock (in-memory, jest.fn spies).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

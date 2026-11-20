/**
 * Raises the Android AsyncStorage database cap (6 MB by default in
 * @react-native-async-storage/async-storage) through the `AsyncStorage_db_size_in_MB` Gradle
 * property. Since F33 a finished 256×256 artwork stores ~190 KB (bitset + fill order), so 6 MB
 * would only hold ~30 of them before writes start failing. iOS has no such cap.
 */
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'AsyncStorage_db_size_in_MB';
const DEFAULT_SIZE_MB = 64;

module.exports = function withAsyncStorageSize(config, props = {}) {
  const sizeMb = Number.isInteger(props.sizeMb) && props.sizeMb > 0 ? props.sizeMb : DEFAULT_SIZE_MB;
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: String(sizeMb) });
    return cfg;
  });
};

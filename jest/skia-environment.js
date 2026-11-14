'use strict';

/**
 * jest-expo's native environment + CanvasKit (WASM) on `global.CanvasKit`, required by the
 * official Skia mock (`@shopify/react-native-skia/lib/commonjs/mock`). Opt in per test file with
 * a `@jest-environment ./jest/skia-environment.js` docblock: loading CanvasKit is not free.
 */
const NativeEnvironment = require('jest-expo/src/preset/nativeEnvironment');
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit');

class SkiaEnvironment extends NativeEnvironment {
  async setup() {
    await super.setup();
    this.global.CanvasKit = await CanvasKitInit({});
  }
}

module.exports = SkiaEnvironment;
module.exports.TestEnvironment = SkiaEnvironment;

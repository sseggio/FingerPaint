import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('../src/', import.meta.url)) }],
  },
  // Same tsconfig for the shared ../src/lib/artwork modules (the app's tsconfig extends expo, absent here).
  tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // node:sqlite is stable enough for this use; silence its ExperimentalWarning in test output.
    execArgv: ['--disable-warning=ExperimentalWarning'],
    testTimeout: 20_000,
  },
});

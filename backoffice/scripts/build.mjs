#!/usr/bin/env node
/** Bundles the server and CLIs into dist/ (self-contained: no node_modules needed at runtime). */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  absWorkingDir: root,
  entryPoints: { server: 'src/server.ts', 'hash-password': 'src/hash-password.ts', backup: 'src/backup.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // One tsconfig for every file, including the shared ../src/lib/artwork modules (resolves `@/`).
  tsconfig: join(root, 'tsconfig.json'),
  // pngjs is CommonJS: give the ESM bundle a `require` for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'info',
});

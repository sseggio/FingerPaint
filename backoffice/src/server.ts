/** Server entry point (bundled to dist/server.mjs). */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConnInfo } from '@hono/node-server/conninfo';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { CHANGED_AT_KEY } from './catalog';
import { readConfig } from './config';
import { CatalogDb } from './db';
import { loadEmbedded } from './embedded';

const baseDir = join(dirname(fileURLToPath(import.meta.url)), '..');
let config;
try {
  config = readConfig(process.env, baseDir);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
mkdirSync(config.dataDir, { recursive: true });
const embedded = loadEmbedded(config.embeddedPath);
const db = new CatalogDb(join(config.dataDir, 'catalog.sqlite'));
db.syncBuiltinAlbums(embedded, new Date().toISOString());
if (!db.getMeta(CHANGED_AT_KEY)) db.setMeta(CHANGED_AT_KEY, new Date().toISOString());

const app = createApp({
  db,
  dataDir: config.dataDir,
  embedded,
  passwordHash: config.passwordHash,
  sessionSecret: config.sessionSecret,
  publicUrl: config.publicUrl,
  publicDir: config.publicDir,
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
  remoteAddress: (c) => getConnInfo(c).remote.address,
});

// No access log on purpose: the catalog collects no data, not even IP addresses.
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`PixelJoy back-office listening on ${info.address}:${info.port} (public URL ${config.publicUrl})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

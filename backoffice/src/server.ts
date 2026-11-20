/** Server entry point (bundled to dist/server.mjs). */
import { lookup } from 'node:dns/promises';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConnInfo } from '@hono/node-server/conninfo';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { CHANGED_AT_KEY, findEmbeddedCollisions } from './catalog';
import { readConfig } from './config';
import { CatalogDb } from './db';
import { validateArtwork } from './artwork-lib';
import { loadEmbedded, loadEmbeddedSources } from './embedded';
import { parseDefaultGateway, TrustedProxies } from './trusted-proxies';

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
// Remix sources (F34): optional, the generators work without them.
const embeddedSources = loadEmbeddedSources(join(dirname(config.embeddedPath), 'embedded-artworks.json'), (a) => validateArtwork(a).length === 0);
const db = new CatalogDb(join(config.dataDir, 'catalog.sqlite'));
db.syncBuiltinAlbums(embedded, new Date().toISOString());
if (!db.getMeta(CHANGED_AT_KEY)) db.setMeta(CHANGED_AT_KEY, new Date().toISOString());
const collisions = findEmbeddedCollisions(db, embedded.artworkIds);
if (collisions.length > 0) {
  console.warn(
    `[backoffice] WARNING: catalog artwork ids also embedded in the app (ignored by the app, rename them): ${collisions.join(', ')}`,
  );
}

// Reverse proxies allowed to set X-Forwarded-For. Host names (`caddy`) and `gateway` are resolved
// now and every 15 s (a proxy container may start after the app or get a new address).
const trustedProxies = new TrustedProxies(config.trustedProxies, {
  resolve: async (host) => (await lookup(host, { all: true })).map((r) => r.address),
  gateway: () => parseDefaultGateway(readFileSync('/proc/net/route', 'utf8')),
});
await trustedProxies.refresh();
setInterval(() => void trustedProxies.refresh(), 15_000).unref();
if (trustedProxies.empty && process.env.TRUST_PROXY === 'true') {
  console.warn('[backoffice] TRUST_PROXY is no longer used: set TRUSTED_PROXIES (X-Forwarded-For is ignored meanwhile).');
}

const app = createApp({
  db,
  dataDir: config.dataDir,
  embedded,
  embeddedSources,
  passwordHash: config.passwordHash,
  sessionSecret: config.sessionSecret,
  publicUrl: config.publicUrl,
  publicDir: config.publicDir,
  cookieSecure: config.cookieSecure,
  trustedProxies,
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

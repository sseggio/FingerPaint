/**
 * Writes a consistent copy of the database (VACUUM INTO), used by scripts/backup.sh:
 *   node dist/backup.mjs [/data/backup.sqlite]
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { CatalogDb } from './db';

const dataDir = process.env.DATA_DIR ?? '/data';
const out = process.argv[2] ?? join(dataDir, 'backup.sqlite');
rmSync(out, { force: true });
const db = new CatalogDb(join(dataDir, 'catalog.sqlite'));
db.backupTo(out);
db.close();
console.log(`database copied to ${out}`);

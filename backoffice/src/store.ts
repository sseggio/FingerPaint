/**
 * Immutable artwork files: `<dataDir>/artworks/<id>.<rev>.json`, the exact bytes served by
 * `GET /catalog/v1/artworks/<id>.<rev>.json` (their SHA-256 is published in the manifest).
 * A new revision is a new file; published revisions are never rewritten.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ArtworkSource } from './artwork-lib';
import { ID_RE } from './input';

export class ArtworkStore {
  readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'artworks');
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string, rev: number): string {
    if (!ID_RE.test(id) || !Number.isInteger(rev) || rev < 1) throw new Error('invalid artwork file name');
    return join(this.dir, `${id}.${rev}.json`);
  }

  write(source: ArtworkSource, rev: number): { sha256: string; bytes: Buffer } {
    const bytes = Buffer.from(JSON.stringify(source), 'utf8');
    const file = this.path(source.id, rev);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, bytes, { mode: 0o644 });
    renameSync(tmp, file);
    return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
  }

  read(id: string, rev: number): Buffer | null {
    try {
      return readFileSync(this.path(id, rev));
    } catch {
      return null;
    }
  }

  /** Parsed file; null when missing or unreadable (callers revalidate before use). */
  readSource(id: string, rev: number): unknown {
    const bytes = this.read(id, rev);
    if (!bytes) return null;
    try {
      return JSON.parse(bytes.toString('utf8')) as unknown;
    } catch {
      return null;
    }
  }

  /** Removes every revision of a never-published draft. */
  removeAll(id: string) {
    if (!ID_RE.test(id)) return;
    for (const file of readdirSync(this.dir)) {
      if (file.startsWith(`${id}.`) && /^\d+\.json$/.test(file.slice(id.length + 1))) rmSync(join(this.dir, file));
    }
  }
}

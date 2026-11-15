import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readConfig } from '../src/config';
import { loadEmbedded, parseEmbedded } from '../src/embedded';

describe('embedded content list', () => {
  it('is generated from the app content (src/content)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pj-emb-'));
    try {
      const out = join(dir, 'embedded.json');
      execFileSync(process.execPath, [join(import.meta.dirname, '..', 'scripts', 'gen-embedded.mjs'), '--out', out]);
      const embedded = loadEmbedded(out);
      expect(embedded.artworkIds.length).toBeGreaterThanOrEqual(48);
      expect(embedded.artworkIds).toContain('strawberry');
      expect(embedded.albums.find((a) => a.id === 'deep-ocean')?.pack).toBe('ocean');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects malformed files', () => {
    expect(() => parseEmbedded({ v: 1, artworkIds: ['../x'], albums: [] })).toThrow();
    expect(() => parseEmbedded({ v: 2 })).toThrow();
  });
});

describe('config', () => {
  it('refuses to start without a valid hash and secret', () => {
    expect(() => readConfig({}, '/app')).toThrow(/ADMIN_PASSWORD_HASH[\s\S]*SESSION_SECRET/);
  });

  it('derives the public URL from DOMAIN', () => {
    const cfg = readConfig(
      {
        ADMIN_PASSWORD_HASH: `scrypt:16384:8:1:${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`,
        SESSION_SECRET: 's'.repeat(32),
        DOMAIN: 'catalog.example.com',
      },
      '/app',
    );
    expect(cfg.publicUrl).toBe('https://catalog.example.com');
    expect(cfg.cookieSecure).toBe(true);
    expect(cfg.trustProxy).toBe(false);
  });
});

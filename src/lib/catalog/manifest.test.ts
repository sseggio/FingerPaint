import { MAX_MANIFEST_ARTWORKS, parseCatalogUrl, parseHttpsUrl, validateManifest, type Manifest } from './manifest';

const HOST = 'catalog.example.com';
const SHA = 'a'.repeat(64);

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    v: 1,
    updatedAt: '2026-11-15T14:33:05.137Z',
    albums: [{ id: 'pets', title: { fr: 'Animaux', en: 'Pets' }, access: { pack: 'pets' }, order: 6 }],
    artworks: [
      {
        id: 'kitten',
        album: 'pets',
        rev: 2,
        url: `https://${HOST}/catalog/v1/artworks/kitten.2.json`,
        sha256: SHA,
        publishedAt: '2026-11-15T14:33:05.132Z',
      },
    ],
    ...overrides,
  };
}

const art = (overrides: Record<string, unknown>) => ({ ...manifest().artworks[0], ...overrides });
const reject = (raw: unknown) => {
  const r = validateManifest(raw, HOST);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};

describe('validateManifest', () => {
  it('accepts the back-office format and drops unknown fields', () => {
    const r = validateManifest({ ...manifest(), extra: 1, albums: [{ ...manifest().albums[0], junk: true }] }, HOST);
    expect(r).toEqual({ ok: true, manifest: manifest() });
  });

  it('accepts albums shipped in the app and an empty catalog', () => {
    expect(validateManifest({ v: 1, updatedAt: '2026-01-01T00:00:00Z', albums: [], artworks: [] }, HOST).ok).toBe(true);
  });

  it('rejects other versions and malformed roots', () => {
    reject(null);
    reject([]);
    reject({ ...manifest(), v: 2 });
    reject({ ...manifest(), updatedAt: 'yesterday' });
    reject({ ...manifest(), artworks: {} });
  });

  it('rejects http URLs', () => {
    expect(reject(manifest({ artworks: [art({ url: `http://${HOST}/catalog/v1/artworks/kitten.2.json` })] }))).toMatch(/https/);
  });

  it('rejects URLs on another host (or with userinfo, port, query, dot segments)', () => {
    for (const url of [
      'https://evil.example.com/catalog/v1/artworks/kitten.2.json',
      `https://${HOST}.evil.com/a.json`,
      `https://user@${HOST}/a.json`,
      `https://${HOST}:8443/a.json`,
      `https://${HOST}/a.json?x=1`,
      `https://${HOST}/catalog/../a.json`,
      `//${HOST}/a.json`,
      `javascript:alert(1)`,
    ]) {
      reject(manifest({ artworks: [art({ url })] }));
    }
  });

  it('rejects too many entries', () => {
    const many = Array.from({ length: MAX_MANIFEST_ARTWORKS + 1 }, (_, i) => art({ id: `art-${i}` }));
    expect(reject(manifest({ artworks: many }))).toMatch(/more than 500/);
    const max = Array.from({ length: MAX_MANIFEST_ARTWORKS }, (_, i) => art({ id: `art-${i}` }));
    expect(validateManifest(manifest({ artworks: max }), HOST).ok).toBe(true);
  });

  it('rejects invalid or duplicate ids', () => {
    for (const id of ['Kitten', 'kit_ten', '../x', '', 'a'.repeat(65), 42, '-x']) {
      reject(manifest({ artworks: [art({ id })] }));
    }
    reject(manifest({ artworks: [art({}), art({})] }));
    reject(manifest({ albums: [{ ...manifest().albums[0], id: 'Pets!' }] }));
  });

  it('rejects unknown albums, bad revisions, digests, dates and access values', () => {
    reject(manifest({ artworks: [art({ album: 'nowhere' })] }));
    for (const rev of [0, 1.5, '2', -1]) reject(manifest({ artworks: [art({ rev })] }));
    for (const sha256 of ['abc', SHA.toUpperCase(), `${SHA}0`]) reject(manifest({ artworks: [art({ sha256 })] }));
    reject(manifest({ artworks: [art({ publishedAt: 'now' })] }));
    reject(manifest({ albums: [{ ...manifest().albums[0], access: 'vip' as never }] }));
    reject(manifest({ albums: [{ ...manifest().albums[0], title: { fr: '', en: 'x' } }] }));
  });
});

describe('catalog URL', () => {
  it('is disabled when empty, missing or not HTTPS', () => {
    expect(parseCatalogUrl(undefined)).toBeNull();
    expect(parseCatalogUrl('')).toBeNull();
    expect(parseCatalogUrl('   ')).toBeNull();
    expect(parseCatalogUrl('http://catalog.example.com')).toBeNull();
    expect(parseCatalogUrl('catalog.example.com')).toBeNull();
    expect(parseCatalogUrl('https://catalog.example.com/?a=1')).toBeNull();
  });

  it('normalizes the host case and trailing slashes', () => {
    expect(parseCatalogUrl('https://Catalog.Example.com/')).toEqual({ base: 'https://catalog.example.com', host: HOST });
    expect(parseCatalogUrl(' https://catalog.example.com/pj// ')).toEqual({ base: 'https://catalog.example.com/pj', host: HOST });
  });

  it('parses strict https URLs only', () => {
    expect(parseHttpsUrl('https://a.b/c/d.json')).toEqual({ host: 'a.b', path: '/c/d.json' });
    expect(parseHttpsUrl('HTTPS://a.b/')).toBeNull();
    expect(parseHttpsUrl(`https://a.b/${'x'.repeat(600)}`)).toBeNull();
  });
});

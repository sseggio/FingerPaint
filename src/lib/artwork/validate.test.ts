import type { ArtworkSource } from './types';
import { formatIssue, validateAlbums, validateArtwork, validateContent } from './validate';

const albumIds = new Set(['garden']);

function valid(): ArtworkSource {
  return {
    v: 1,
    id: 'test-art',
    album: 'garden',
    title: { fr: 'Test', en: 'Test' },
    w: 8,
    h: 8,
    palette: ['#1B1A2E', '#FF3D7F', '#FFC93C'],
    rows: ['8A', 'A6BA', 'A6BA', 'A2B2C2BA', 'A2B2C2BA', 'A6BA', 'A6BA', '8.'],
    access: 'free',
    difficulty: 1,
  };
}

function issuesFor(patch: Record<string, unknown>) {
  return validateArtwork({ ...valid(), ...patch }, { albumIds });
}

function expectIssue(patch: Record<string, unknown>, where: string, message: string | RegExp) {
  const issues = issuesFor(patch);
  const id = typeof patch.id === 'string' && patch.id ? patch.id : 'test-art';
  expect(issues).toContainEqual(expect.objectContaining({ id, where, message: expect.stringMatching(message) }));
  // Formatted message cites the id and the location.
  expect(issues.map(formatIssue).join('\n')).toContain(`[${id}] ${where}:`);
}

describe('validateArtwork', () => {
  it('accepts a valid artwork', () => {
    expect(validateArtwork(valid(), { albumIds })).toEqual([]);
  });

  it('rejects non-objects', () => {
    expect(validateArtwork(null)).toEqual([{ id: '#0', where: 'root', message: 'must be an object' }]);
  });

  it('rejects an unknown version', () => expectIssue({ v: 2 }, 'v', /unsupported version/));
  it('rejects a non kebab-case id', () => expectIssue({ id: 'Bad_Id' }, 'id', /kebab-case/));
  it('rejects an unknown album', () => expectIssue({ album: 'nowhere' }, 'album', /unknown album "nowhere"/));
  it('rejects an empty FR title', () => expectIssue({ title: { fr: ' ', en: 'Ok' } }, 'title.fr', /non-empty/));
  it('rejects a missing EN title', () => expectIssue({ title: { fr: 'Ok' } }, 'title.en', /non-empty/));
  it('rejects a bad access', () => expectIssue({ access: 'premium' }, 'access', /free/));
  it('accepts a pack access', () => expect(issuesFor({ access: { pack: 'ocean' } })).toEqual([]));
  it('rejects a bad difficulty', () => expectIssue({ difficulty: 4 }, 'difficulty', /1, 2 or 3/));
  it('rejects a width below 8', () => expectIssue({ w: 4 }, 'w', /8\.\.128/));
  it('rejects a height above 128', () => expectIssue({ h: 129 }, 'h', /8\.\.128/));

  it('rejects a wrong row count', () =>
    expectIssue({ rows: valid().rows.slice(0, 7) }, 'rows', /expected 8 rows, got 7/));

  it('rejects a row that decodes to the wrong width (cites the row)', () => {
    const rows = valid().rows;
    rows[3] = 'A2B2CBA';
    expectIssue({ rows }, 'row 3', /decodes to 7 cells, expected 8/);
  });

  it('rejects an unknown key (cites the row)', () => {
    const rows = valid().rows;
    rows[5] = 'A6DA';
    expectIssue({ rows }, 'row 5', /outside the palette/);
  });

  it('rejects malformed RLE (cites the row)', () => {
    const rows = valid().rows;
    rows[2] = 'A6BA2';
    expectIssue({ rows }, 'row 2', /run length without key/);
  });

  it('rejects an invalid hex color', () =>
    expectIssue({ palette: ['#1B1A2E', 'pink', '#FFC93C'] }, 'palette[1]', /invalid color/));

  it('rejects too few colors', () => expectIssue({ palette: ['#000000'] }, 'palette', /2\.\.40/));

  it('rejects an unused color', () =>
    expectIssue({ palette: [...valid().palette, '#2ED3A0'] }, 'palette[3]', /never used/));

  it('rejects duplicate colors', () =>
    expectIssue({ palette: ['#1B1A2E', '#FF3D7F', '#ff3d7f'] }, 'palette[2]', /duplicate of palette\[1\]/));

  it('rejects colors closer than ΔE76 10', () =>
    expectIssue({ palette: ['#1B1A2E', '#FF3D7F', '#FF4482'] }, 'palette[2]', /ΔE76 .* < 10/));
});

describe('validateAlbums / validateContent', () => {
  const albums = { v: 1, albums: [{ id: 'garden', title: { fr: 'Jardin', en: 'Garden' }, order: 0 }] };

  it('accepts valid albums', () => {
    expect(validateAlbums(albums)).toEqual([]);
  });

  it('rejects duplicate album ids', () => {
    const dup = { v: 1, albums: [...albums.albums, ...albums.albums] };
    expect(validateAlbums(dup)).toContainEqual(expect.objectContaining({ id: 'garden', where: 'id' }));
  });

  it('rejects a malformed albums file', () => {
    expect(validateAlbums({ albums: [] })[0]).toMatchObject({ id: 'albums.json', where: 'root' });
  });

  it('rejects duplicate artwork ids across the content set', () => {
    expect(validateContent(albums, [valid(), valid()])).toEqual([
      { id: 'test-art', where: 'id', message: 'duplicate artwork id' },
    ]);
  });

  it('rejects an album missing from albums.json', () => {
    expect(validateContent(albums, [{ ...valid(), album: 'space' }])).toContainEqual(
      expect.objectContaining({ id: 'test-art', where: 'album' }),
    );
  });
});

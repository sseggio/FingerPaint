import { Directory, File, Paths } from 'expo-file-system';

/**
 * Downloaded artwork files (`<documents>/catalog/<id>.<rev>.json`). Documents, not cache: the
 * OS must not purge content the user may be coloring offline.
 */
export interface CatalogFiles {
  /** File text, or null when missing or unreadable. */
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  /** Best effort. */
  remove(name: string): void;
  /** File names currently stored. */
  list(): string[];
}

const FOLDER = 'catalog';
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.\d{1,6}\.json$/;

function folder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

function fileOf(name: string): File {
  if (!NAME_RE.test(name)) throw new Error('invalid catalog file name');
  return new File(folder(), name);
}

export const deviceCatalogFiles: CatalogFiles = {
  async read(name) {
    try {
      const file = fileOf(name);
      if (!file.exists) return null;
      return await file.text();
    } catch {
      return null;
    }
  },
  async write(name, text) {
    const dir = folder();
    dir.create({ intermediates: true, idempotent: true });
    const file = fileOf(name);
    if (file.exists) file.delete();
    file.create();
    await file.write(text);
  },
  remove(name) {
    try {
      const file = fileOf(name);
      if (file.exists) file.delete();
    } catch {
      // Locked or already gone: pruned next time.
    }
  },
  list() {
    try {
      const dir = folder();
      if (!dir.exists) return [];
      return dir
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .map((f) => f.name)
        .filter((name) => NAME_RE.test(name));
    } catch {
      return [];
    }
  },
};

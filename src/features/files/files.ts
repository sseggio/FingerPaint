import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Thin wrapper over expo-file-system (SDK 58 `File` / `Directory` / `Paths` API),
 * expo-sharing and expo-document-picker, so the export / backup flows stay testable.
 * Everything is local: nothing is uploaded anywhere.
 */
export type FileLocation = 'cache' | 'documents';

export class FileTooLargeError extends Error {
  constructor() {
    super('file too large');
    this.name = 'FileTooLargeError';
  }
}

/** Keeps generated file names portable (letters, digits, dash, dot, underscore). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 96) : 'file';
}

/** Writes (overwriting) `content` to `<location>/<folder>/<name>` and returns its `file://` URI. */
export async function writeFile(
  location: FileLocation,
  folder: string,
  name: string,
  content: string | Uint8Array,
): Promise<string> {
  const dir = new Directory(location === 'cache' ? Paths.cache : Paths.document, folder);
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, safeFileName(name));
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  return file.uri;
}

/**
 * Deletes the files of `<location>/<folder>` matched by `shouldDelete` (by file name). Best
 * effort and synchronous: a file that cannot be deleted is left for the next time.
 */
export function pruneFolder(location: FileLocation, folder: string, shouldDelete: (name: string) => boolean): number {
  let removed = 0;
  try {
    const dir = new Directory(location === 'cache' ? Paths.cache : Paths.document, folder);
    if (!dir.exists) return 0;
    for (const entry of dir.list()) {
      if (!(entry instanceof File) || !shouldDelete(entry.name)) continue;
      try {
        entry.delete();
        removed++;
      } catch {
        // Locked or already gone: try again next time.
      }
    }
  } catch {
    // Folder unreadable: nothing to clean.
  }
  return removed;
}

export interface ShareOptions {
  mimeType: string;
  UTI?: string;
  dialogTitle: string;
}

/** Opens the system share sheet. Resolves false when sharing is unavailable on this device. */
export async function shareFile(uri: string, options: ShareOptions): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, options);
  return true;
}

export interface PickedFile {
  uri: string;
  name: string;
  size?: number;
}

/** Lets the user pick one file (copied to the cache). Null when cancelled. */
export async function pickFile(): Promise<PickedFile | null> {
  // `.fingerpaint` has no registered type: accept any file, the content is validated anyway.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, size: asset.size };
}

/** Reads a text file, refusing it (FileTooLargeError) when larger than `maxBytes`. */
export async function readTextFile(uri: string, maxBytes: number): Promise<string> {
  const file = new File(uri);
  // `size` can be 0 when the platform cannot tell (some providers / not yet materialized files):
  // it is then not trusted as "empty", the text is read and `parseBackup` bounds its length.
  if (file.exists && file.size > maxBytes) throw new FileTooLargeError();
  return file.text();
}

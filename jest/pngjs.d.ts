/** Minimal typings for the `pngjs` dev dependency (PNG decoding in tests and scripts). */
declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    /** Set by `PNG.sync.read`: whether the decoded file has an alpha channel. */
    alpha?: boolean;
    static sync: { read(buffer: Buffer): PNG; write(png: PNG): Buffer };
  }
}

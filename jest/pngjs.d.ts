/** Minimal typings for the `pngjs` dev dependency (PNG decoding in tests and scripts). */
declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: { read(buffer: Buffer): PNG; write(png: PNG): Buffer };
  }
}

export interface ZipEntry {
  readonly path: string;
  readonly data: Buffer;
}

export function crc32(buffer: Uint8Array): number;
export function createZip(entries: readonly ZipEntry[]): Buffer;

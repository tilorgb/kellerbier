import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, createZip } from '../../tools/release/zip.mjs';

/**
 * Reads an archive back by its central directory — the way an unzipper does,
 * and so the half of the format a writer most easily gets wrong (offsets).
 */
function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(start, start + size);
    const data = method === 0 ? Buffer.from(body) : inflateRawSync(body);
    expect(crc32(data)).toBe(crc);
    files.set(name, data);
    at += 46 + nameLength;
  }
  return files;
}

describe('createZip (#365)', () => {
  it('matches the reference CRC-32', () => {
    // The check value every CRC-32 implementation is tested against.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips nested paths, compressible and incompressible data', () => {
    const noise = Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 197 + 13) % 256));
    const entries = [
      { path: 'index.html', data: Buffer.from('<!doctype html>'.repeat(50)) },
      { path: 'assets/atlas-ä.png', data: noise },
      { path: 'assets/empty.txt', data: Buffer.alloc(0) },
    ];
    const files = readZip(createZip(entries));
    expect([...files.keys()]).toEqual(entries.map((entry) => entry.path));
    for (const entry of entries) {
      expect(files.get(entry.path)?.equals(entry.data)).toBe(true);
    }
  });

  it('is byte-identical for the same input', () => {
    const entries = [{ path: 'index.html', data: Buffer.from('same') }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });
});

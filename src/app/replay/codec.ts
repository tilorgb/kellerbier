/**
 * Turns a recorded run's packed input bytes into something that fits in a
 * `localStorage` JSON blob or a `.json` file attached to a bug report, and
 * back (#48).
 *
 * gzip via `CompressionStream`/`DecompressionStream` rather than a bespoke
 * encoding: `docs/DECISIONS.md`'s framing for this feature is "a full run
 * compresses to a few kilobytes because the simulation is deterministic",
 * and that determinism shows up as *repetition* in the input log — a player
 * holds a direction or a fire button for many ticks at a stretch, which is
 * exactly what gzip's own history window is built to find. `vite.config.ts`
 * targets `es2022`, the same modern-browser floor every other web platform
 * feature already assumes, so both streams exist wherever the game does.
 *
 * `sim/input/recording.ts`'s `InputRecording` packs frames into an
 * `Int8Array` (`toBytes`/`fromBytes`), so that is what this takes and hands
 * back too — compression and base64 are both signedness-agnostic (they move
 * bytes, not numbers), so there is no reason to convert to `Uint8Array` and
 * back just to satisfy an intermediate step.
 *
 * Base64 in chunks rather than `String.fromCharCode(...bytes)` on the whole
 * array — spreading tens of thousands of bytes as call arguments risks the
 * engine's own argument-count limit, a failure mode that would only show up
 * on a long run, which is exactly the run this exists to handle.
 */

const CHUNK_SIZE = 0x2000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Int8Array {
  const binary = atob(base64);
  const bytes = new Int8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Compresses `bytes` (an `InputRecording.toBytes()`) into a base64 string fit for JSON storage. */
export async function compressFrames(bytes: Int8Array): Promise<string> {
  // `.slice()` rather than the view itself: it guarantees a plain
  // `ArrayBuffer`-backed copy, which is what `Blob`'s constructor wants —
  // `bytes` is a fresh array from `InputRecording.toBytes()` either way, so
  // the copy costs nothing this doesn't already pay for.
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await readAll(stream);
  return bytesToBase64(compressed);
}

/** The inverse of `compressFrames` — hands back bytes fit for `InputRecording.fromBytes`. */
export async function decompressFrames(base64: string): Promise<Int8Array> {
  const compressed = base64ToBytes(base64);
  const stream = new Blob([compressed.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const decompressed = await readAll(stream);
  return new Int8Array(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
}

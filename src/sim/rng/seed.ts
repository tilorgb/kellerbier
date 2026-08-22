/**
 * Human-shareable seed strings.
 *
 * A run seed is a 32-bit integer, but nobody reads a seed out loud as
 * "2952379286". Crockford Base32 encodes it in seven characters and is designed
 * for exactly this: the alphabet omits I, L, O and U, so the shapes that get
 * misread or mistyped are not in it, and decoding accepts the confusable
 * characters anyway and folds them to what the writer meant.
 */

/** Crockford Base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 32 bits at 5 bits per character. */
const SEED_LENGTH = 7;

const DECODE = new Map<string, number>();
{
  let value = 0;
  for (const character of ALPHABET) {
    DECODE.set(character, value);
    value += 1;
  }
}
// Crockford's confusable folding: what someone writes, versus what they meant.
DECODE.set('O', 0);
DECODE.set('I', 1);
DECODE.set('L', 1);

/** Encodes a 32-bit seed as a seven-character string. */
export function encodeSeed(seed: number): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`A seed must be a 32-bit unsigned integer, got ${String(seed)}`);
  }

  let remaining = seed >>> 0;
  let encoded = '';
  for (let position = 0; position < SEED_LENGTH; position++) {
    encoded = ALPHABET.charAt(remaining % 32) + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
}

/**
 * Decodes a seed string.
 *
 * Case-insensitive, and hyphens and spaces are ignored, so a seed copied out of
 * a chat message or read off a screenshot still works. Throws with a specific
 * message rather than silently returning a different run — a seed that quietly
 * decodes wrong is worse than one that is rejected.
 */
export function decodeSeed(text: string): number {
  const cleaned = text.toUpperCase().replace(/[\s-]/g, '');
  if (cleaned.length !== SEED_LENGTH) {
    throw new RangeError(
      `A seed is ${String(SEED_LENGTH)} characters, got ${String(cleaned.length)} in "${text}"`,
    );
  }

  let seed = 0;
  for (const character of cleaned) {
    const value = DECODE.get(character);
    if (value === undefined) {
      throw new RangeError(`"${character}" is not a valid seed character (in "${text}")`);
    }
    seed = seed * 32 + value;
  }

  // Seven Base32 characters address 35 bits, so the top three bits of the
  // space have no 32-bit seed behind them.
  if (seed > 0xffffffff) {
    throw new RangeError(`"${text}" is not a valid seed: it is out of range`);
  }
  return seed >>> 0;
}

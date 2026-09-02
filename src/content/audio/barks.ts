import type { BarkDefinition } from '../../app/audio/types.js';

/**
 * Bavarian voice barks (`docs/CONTENT_BIBLE.md` §6): "heavily compressed and
 * short: 'Sauber!', 'Geh weida!', 'Passt scho.'"
 *
 * **Placeholder content.** These are not recorded voice lines — there is no
 * voice actor in this pass — they are short synthesised melodic
 * contours (`BarkDefinition.motif`) standing in for a shouted syllable, so
 * that the trigger points, the rate limit and "a voice layer exists and
 * sounds distinct from music and SFX" are all real and wired today. Real
 * recorded barks are a drop-in replacement for `motif`'s playback in
 * `barks.ts` (the app-layer player) without moving a single trigger site —
 * the same "content churns, the seam doesn't" shape
 * `docs/DECISIONS.md` #19 already asks of room content. Swapping these for
 * real VO needs the same design sign-off `CLAUDE.md` already asks of new
 * pixel art, since a voice is as much a character choice as a sprite is.
 */
export const sauber: BarkDefinition = {
  id: 'sauber',
  text: 'Sauber!',
  motif: { instrument: 'clarinet', notes: ['G4', 'C5'], noteDurationSeconds: 0.09 },
};

export const gehWeida: BarkDefinition = {
  id: 'geh-weida',
  text: 'Geh weida!',
  motif: { instrument: 'brass-stab', notes: ['E4', 'C4'], noteDurationSeconds: 0.08 },
};

export const passtScho: BarkDefinition = {
  id: 'passt-scho',
  text: 'Passt scho.',
  motif: { instrument: 'accordion', notes: ['A3'], noteDurationSeconds: 0.18 },
};

export const BARK_DEFINITIONS: readonly BarkDefinition[] = [sauber, gehWeida, passtScho];

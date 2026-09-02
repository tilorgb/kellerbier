import type { PromilleAudioTier } from '../../app/audio/types.js';

/**
 * What the mix should sound like at each Promille tier
 * (`docs/GAME_DESIGN.md` §5) — the audio *content* only. The actual filter
 * chain (buses, ducking, ramping between tiers smoothly) is #157's
 * ("Audio engine: buses, mixing, ducking and Promille filtering");
 * `app/audio/music.ts`'s `MusicPlayer.setPromilleTier` reads these numbers
 * and applies a light, bus-free approximation directly to its own
 * oscillators so the effect is audible before #157 lands, per this issue's
 * "the plumbing and the composition block on different things and should
 * not wait for each other."
 *
 * `tier` is a plain number rather than `PromilleTierId` imported as a value
 * — content may only import *types* (`tools/eslint/architecture.js`) — but
 * it is written to match `sim/game/promille.ts`'s `PromilleTier` constant
 * exactly: 0 Nüchtern, 1 Angeheitert, 2 Beduselt, 3 Vollrausch,
 * 4 Sturzbesoffen, 5 Filmriss, 6 Umgfalln. `tests/content/audio.test.ts`
 * checks the two stay in step.
 */
export const PROMILLE_AUDIO_TIERS: readonly PromilleAudioTier[] = [
  { tier: 0, name: 'Nüchtern', tempoScale: 1.0, detuneCents: 0, muffle: 0 },
  { tier: 1, name: 'Angeheitert', tempoScale: 1.0, detuneCents: 3, muffle: 0 },
  { tier: 2, name: 'Beduselt', tempoScale: 0.97, detuneCents: 8, muffle: 0.15 },
  { tier: 3, name: 'Vollrausch', tempoScale: 0.93, detuneCents: 15, muffle: 0.3 },
  { tier: 4, name: 'Sturzbesoffen', tempoScale: 0.88, detuneCents: 22, muffle: 0.45 },
  { tier: 5, name: 'Filmriss', tempoScale: 0.82, detuneCents: 30, muffle: 0.6 },
  { tier: 6, name: 'Umgfalln', tempoScale: 0.7, detuneCents: 45, muffle: 0.8 },
];

import { INSTRUMENT_DEFINITIONS } from '../../content/audio/instruments.js';
import { BARK_DEFINITIONS } from '../../content/audio/barks.js';
import {
  ENEMY_SFX_CATEGORY,
  SFX_DEFINITIONS,
  type EnemySfxCategory,
} from '../../content/audio/sfx.js';
import { victoryTheme } from '../../content/audio/tracks.js';
import type { BarkDefinition, InstrumentDefinition, SfxDefinition } from './types.js';
import { getAudioContext, getMasterGain } from './context.js';
import { playSfxSound, playTone } from './synth.js';
import { playTrackOnce } from './music.js';
import type { ImpactAudio } from './impact.js';

const instrumentsById = new Map<string, InstrumentDefinition>(
  INSTRUMENT_DEFINITIONS.map((instrument) => [instrument.id, instrument]),
);
const sfxById = new Map<string, SfxDefinition>(SFX_DEFINITIONS.map((sfx) => [sfx.id, sfx]));
const barksById = new Map<string, BarkDefinition>(BARK_DEFINITIONS.map((bark) => [bark.id, bark]));

const DEFAULT_CATEGORY: EnemySfxCategory = 'squelch';

function categoryFor(enemyId: string | null): EnemySfxCategory {
  if (enemyId === null) {
    return DEFAULT_CATEGORY;
  }
  return ENEMY_SFX_CATEGORY[enemyId] ?? DEFAULT_CATEGORY;
}

/**
 * Plays a `content/audio/sfx.ts` id "now" — the generic entry point for
 * every one-shot cue outside `ImpactAudio`'s own five hooks: pickups, doors,
 * footsteps and UI actions. A no-op off-browser or for an unknown id, so a
 * typo in a trigger site degrades to silence rather than throwing mid-frame
 * (unlike a content file's own bad reference, which `tests/content/audio.test.ts`
 * catches before it ships).
 */
export function playSfx(id: string): void {
  const ctx = getAudioContext();
  const destination = getMasterGain();
  const def = sfxById.get(id);
  if (ctx === null || destination === null || def === undefined) {
    return;
  }
  playSfxSound(ctx, destination, def, instrumentsById);
}

/**
 * Plays a `content/audio/barks.ts` voice bark's placeholder motif — see that
 * file's own doc comment for why this is a synthesised contour rather than
 * recorded speech. Notes play in sequence, not as a chord.
 */
export function playBark(id: string): void {
  const ctx = getAudioContext();
  const destination = getMasterGain();
  const bark = barksById.get(id);
  if (ctx === null || destination === null || bark === undefined) {
    return;
  }
  const instrument = instrumentsById.get(bark.motif.instrument);
  if (instrument === undefined) {
    return;
  }
  let startTime = ctx.currentTime;
  for (const note of bark.motif.notes) {
    playTone(ctx, destination, instrument, note, startTime, bark.motif.noteDurationSeconds);
    startTime += bark.motif.noteDurationSeconds;
  }
}

const BARK_IDS = BARK_DEFINITIONS.map((bark) => bark.id);
const BARK_COOLDOWN_MS = 4000;
const BARK_CHANCE = 0.12;
let lastBarkAtMs = -Infinity;

/**
 * A rare, rate-limited voice bark on a kill — "Sauber!" landing on a hit
 * that mattered rather than on every last one, which is what
 * `docs/CONTENT_BIBLE.md` §6's "short and heavily compressed" barks are
 * for. Not a design any one enemy or room can lean on: it fires from
 * `SYNTH_IMPACT_AUDIO.onDeath` below, independent of what died.
 */
function maybeBarkOnKill(): void {
  const now = Date.now();
  if (now - lastBarkAtMs < BARK_COOLDOWN_MS || Math.random() > BARK_CHANCE) {
    return;
  }
  const id = BARK_IDS[Math.floor(Math.random() * BARK_IDS.length)];
  if (id === undefined) {
    return;
  }
  lastBarkAtMs = now;
  playBark(id);
}

/** Plays the win fanfare once — `victory-screen.ts`'s call site, on `sim.playerWon`. */
export function playVictoryFanfare(): void {
  const ctx = getAudioContext();
  const destination = getMasterGain();
  if (ctx === null || destination === null) {
    return;
  }
  playTrackOnce(ctx, destination, victoryTheme);
}

/**
 * The real `ImpactAudio` (`impact.ts`'s seam) — every hit, death, wall-clink
 * and player hurt/death cue, picked by `content/audio/sfx.ts`'s enemy
 * timbre categories. `#51`'s "no impact anywhere in the game is silent":
 * `enemyId === null` (a category-less or already-resolved-away victim,
 * `sim.enemyIdAt`'s doc comment) still gets a sound — the `squelch`
 * default — rather than nothing.
 */
export const SYNTH_IMPACT_AUDIO: ImpactAudio = {
  onHit: (_x, _y, _damage, enemyId) => {
    playSfx(`hit-${categoryFor(enemyId)}`);
  },
  onDeath: (_x, _y, enemyId) => {
    playSfx(`death-${categoryFor(enemyId)}`);
    maybeBarkOnKill();
  },
  onPlayerHit: () => {
    playSfx('player-hit');
  },
  onPlayerDeath: () => {
    playSfx('player-death');
  },
  onWallHit: () => {
    playSfx('wall-hit');
  },
};

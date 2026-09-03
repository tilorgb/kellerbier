import { INSTRUMENT_DEFINITIONS } from '../../content/audio/instruments.js';
import { BARK_DEFINITIONS } from '../../content/audio/barks.js';
import {
  ENEMY_SFX_CATEGORY,
  SFX_DEFINITIONS,
  type EnemySfxCategory,
} from '../../content/audio/sfx.js';
import { TRACK_DEFINITIONS, victoryTheme } from '../../content/audio/tracks.js';
import type { BarkDefinition, InstrumentDefinition, SfxDefinition } from './types.js';
import { duckMusic, getAudioContext, getBusGain } from './context.js';
import { type VoiceHandle, playSfxSound, playTone } from './synth.js';
import { playTrackOnce } from './music.js';
import { peekSampleBuffer, playSampleBuffer, preloadSample } from './sample-player.js';
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
 * How many SFX voices may sound at once (#157). A bullet-heavy room with an
 * uncapped hit sound is the concrete failure mode the issue names: past this
 * many simultaneous voices, the newest steals the oldest's slot
 * (`stealOldestVoice`) rather than layering forever and clipping the bus.
 */
const MAX_CONCURRENT_SFX = 16;

/**
 * The minimum gap between two plays of the *same* SFX id (#157's "twelve
 * simultaneous copies of one sample"). Short enough that two genuinely
 * distinct hits a beat apart both sound; long enough to collapse the exact
 * duplicate spam of twelve projectiles resolving in the same tick into the
 * one copy that actually reads.
 */
const SFX_RETRIGGER_COOLDOWN_SECONDS = 0.03;

interface ActiveSfxVoice {
  readonly id: string;
  readonly endsAt: number;
  readonly handle: VoiceHandle;
}

/** Oldest-first — a new voice always pushes onto the end, so index 0 is always the one to steal. */
const activeVoices: ActiveSfxVoice[] = [];
const lastPlayedAtById = new Map<string, number>();

/** A generous ceiling for an SFX with neither field set — never actually reached, just a safe default. */
const DEFAULT_VOICE_DURATION_SECONDS = 0.3;

function estimatedDurationSeconds(def: SfxDefinition): number {
  if (def.sample !== undefined) {
    const { trimStartSeconds, trimEndSeconds } = def.sample.edit;
    const sampleDuration = trimEndSeconds - trimStartSeconds;
    return sampleDuration > 0 ? sampleDuration : DEFAULT_VOICE_DURATION_SECONDS;
  }
  const noiseDuration = def.noise?.durationSeconds ?? 0;
  const toneDuration = def.tone?.durationSeconds ?? 0;
  const longest = Math.max(noiseDuration, toneDuration);
  return longest > 0 ? longest : DEFAULT_VOICE_DURATION_SECONDS;
}

function pruneExpiredVoices(now: number): void {
  while (activeVoices.length > 0 && (activeVoices[0]?.endsAt ?? Infinity) <= now) {
    activeVoices.shift();
  }
}

function stealOldestVoice(): void {
  const oldest = activeVoices.shift();
  oldest?.handle.stop();
}

/**
 * Plays `def.sample` if one is set and has finished decoding; otherwise
 * (no recording, or still decoding) falls back to the synthesised
 * noise/tone layer `playSfxSound` always could — the "content gap degrades
 * gracefully" shape `docs/DECISIONS.md` #19 already asks of room content,
 * applied to a recording that hasn't loaded yet instead of a room that
 * hasn't been authored yet.
 */
function playSfxOrFallback(
  ctx: AudioContext,
  destination: AudioNode,
  def: SfxDefinition,
): VoiceHandle {
  if (def.sample !== undefined) {
    preloadSample(ctx, def.sample.assetId);
    const buffer = peekSampleBuffer(ctx, def.sample.assetId);
    if (buffer !== null) {
      return playSampleBuffer(ctx, destination, buffer, def.sample.edit, ctx.currentTime, false);
    }
  }
  return playSfxSound(ctx, destination, def, instrumentsById);
}

/**
 * Plays a `content/audio/sfx.ts` id "now" — the generic entry point for
 * every one-shot cue outside `ImpactAudio`'s own five hooks: pickups, doors,
 * footsteps and UI actions. A no-op off-browser or for an unknown id, so a
 * typo in a trigger site degrades to silence rather than throwing mid-frame
 * (unlike a content file's own bad reference, which `tests/content/audio.test.ts`
 * catches before it ships).
 *
 * Ducks the music bus for a pickup chime specifically (#157's "music steps
 * back under … item pickups") — every `sfx.ts` id prefixed `pickup-` is
 * assumed to be one; nothing else in the roster is.
 */
export function playSfx(id: string): void {
  const ctx = getAudioContext();
  const destination = getBusGain('sfx');
  const def = sfxById.get(id);
  if (ctx === null || destination === null || def === undefined) {
    return;
  }
  const now = ctx.currentTime;
  pruneExpiredVoices(now);

  const lastPlayedAt = lastPlayedAtById.get(id);
  if (lastPlayedAt !== undefined && now - lastPlayedAt < SFX_RETRIGGER_COOLDOWN_SECONDS) {
    return;
  }
  lastPlayedAtById.set(id, now);

  if (activeVoices.length >= MAX_CONCURRENT_SFX) {
    stealOldestVoice();
  }

  const handle = playSfxOrFallback(ctx, destination, def);
  activeVoices.push({ id, endsAt: now + estimatedDurationSeconds(def), handle });

  if (id.startsWith('pickup-')) {
    duckMusic(
      PICKUP_DUCK_DEPTH,
      PICKUP_DUCK_ATTACK_SECONDS,
      PICKUP_DUCK_HOLD_SECONDS,
      PICKUP_DUCK_RELEASE_SECONDS,
    );
  }
}

const PICKUP_DUCK_DEPTH = 0.4;
const PICKUP_DUCK_ATTACK_SECONDS = 0.03;
const PICKUP_DUCK_HOLD_SECONDS = 0.15;
const PICKUP_DUCK_RELEASE_SECONDS = 0.4;

const BARK_DUCK_DEPTH = 0.6;
const BARK_DUCK_ATTACK_SECONDS = 0.05;
const BARK_DUCK_RELEASE_SECONDS = 0.5;

/**
 * Plays a `content/audio/barks.ts` voice bark's placeholder motif — see that
 * file's own doc comment for why this is a synthesised contour rather than
 * recorded speech. Notes play in sequence, not as a chord, on the voice bus
 * — and duck the music under it (#157's "music steps back under … voice
 * barks"), held for the motif's own length so it doesn't swell back up
 * mid-line.
 */
export function playBark(id: string): void {
  const ctx = getAudioContext();
  const destination = getBusGain('voice');
  const bark = barksById.get(id);
  if (ctx === null || destination === null || bark === undefined) {
    return;
  }
  if (bark.sample !== undefined) {
    preloadSample(ctx, bark.sample.assetId);
    const buffer = peekSampleBuffer(ctx, bark.sample.assetId);
    if (buffer !== null) {
      const { trimStartSeconds, trimEndSeconds } = bark.sample.edit;
      const lineSeconds = Math.max(0, trimEndSeconds - trimStartSeconds);
      duckMusic(BARK_DUCK_DEPTH, BARK_DUCK_ATTACK_SECONDS, lineSeconds, BARK_DUCK_RELEASE_SECONDS);
      playSampleBuffer(ctx, destination, buffer, bark.sample.edit, ctx.currentTime, false);
      return;
    }
    // Still decoding — falls through to the synthesised motif below, same
    // as `playSfxOrFallback`.
  }
  const instrument = instrumentsById.get(bark.motif.instrument);
  if (instrument === undefined) {
    return;
  }
  const motifSeconds = bark.motif.notes.length * bark.motif.noteDurationSeconds;
  duckMusic(BARK_DUCK_DEPTH, BARK_DUCK_ATTACK_SECONDS, motifSeconds, BARK_DUCK_RELEASE_SECONDS);
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

/**
 * Kicks off decoding every recorded sample any track/SFX/bark currently
 * references, once — `app/main.ts`'s boot sequence calls this right after
 * `attachAudioUnlockListener`, the same "pay the cost off the hot path"
 * reasoning `context.ts`'s `warmNoiseBuffer` call already follows. Without
 * this, every sample-backed sound's *first* play would find its buffer
 * still decoding and fall back to its synthesised placeholder for that one
 * play — harmless (the same gap-degrades-gracefully fallback every other
 * call site here already leans on) but avoidable, since decoding a few
 * short recordings well ahead of the first note/hit/line costs nothing a
 * player would notice.
 */
export function preloadContentAudioSamples(): void {
  const ctx = getAudioContext();
  if (ctx === null) {
    return;
  }
  for (const track of TRACK_DEFINITIONS) {
    if (track.sample !== undefined) {
      preloadSample(ctx, track.sample.assetId);
    }
  }
  for (const sfx of SFX_DEFINITIONS) {
    if (sfx.sample !== undefined) {
      preloadSample(ctx, sfx.sample.assetId);
    }
  }
  for (const bark of BARK_DEFINITIONS) {
    if (bark.sample !== undefined) {
      preloadSample(ctx, bark.sample.assetId);
    }
  }
}

/** Plays the win fanfare once — `victory-screen.ts`'s call site, on `sim.playerWon`. */
export function playVictoryFanfare(): void {
  const ctx = getAudioContext();
  const destination = getBusGain('music');
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
 *
 * `onPlayerShotFired`/`onEnemyShotFired`/`onAttackWindup`/`onEnemySplit`
 * are #234's half of the same idea, applied to actions and state rather
 * than consequences: the player's own shot, an enemy's shot (categorised
 * the same way a hit is), a telegraph's wind-up and a `splitOnDeath` — a
 * boss phase change included — all went silent before this.
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
  onPlayerShotFired: () => {
    playSfx('player-shot');
  },
  onEnemyShotFired: (enemyId) => {
    playSfx(`shot-${categoryFor(enemyId)}`);
  },
  onAttackWindup: () => {
    playSfx('attack-windup');
  },
  onEnemySplit: () => {
    playSfx('enemy-split');
  },
};

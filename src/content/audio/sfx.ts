import type { SfxDefinition } from '../../app/audio/types.js';

/**
 * The full SFX pass (#51): every impact, pickup, door, footstep, enemy sound
 * and UI action that exists on floors 1 and 2 gets an id here.
 * `docs/CONTENT_BIBLE.md` §6: "Every impact needs a sound. Silence on a hit
 * is the single fastest way to make a game feel cheap." —
 * `tests/content/audio.test.ts` enforces that literally: every
 * `EventKind` `sfx-player.ts` handles and every enemy id in
 * `content/enemies/index.ts` resolves to one of these.
 *
 * Enemies don't each get a bespoke sound — eighteen hand-tuned noise bursts
 * is more content debt than the roster's own variety justifies. Instead
 * `ENEMY_SFX_CATEGORY` (bottom of this file) sorts every enemy id into one of
 * five timbre families (what the body is made of, roughly), and each family
 * gets one hit sound and one death sound. A new enemy needs one line in that
 * map, not a new pair of `SfxDefinition`s.
 */

const hitSquelch: SfxDefinition = {
  id: 'hit-squelch',
  description: 'Soft-bodied enemy (woodlouse, rat, mould, foam) takes a hit.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 500, q: 0.5 },
    durationSeconds: 0.08,
    gain: 0.5,
  },
};
const hitMetal: SfxDefinition = {
  id: 'hit-metal',
  description: 'Barrel, tractor or thrown Böller takes a hit.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 2500, q: 3 },
    durationSeconds: 0.1,
    gain: 0.45,
  },
};
const hitAnimal: SfxDefinition = {
  id: 'hit-animal',
  description: 'Cow, rooster or bull takes a hit.',
  noise: { filter: { type: 'lowpass', frequencyHz: 800, q: 1 }, durationSeconds: 0.09, gain: 0.4 },
  tone: { instrument: 'clarinet', note: 'G3', durationSeconds: 0.08 },
  pitchJitterCents: 200,
};
const hitFolk: SfxDefinition = {
  id: 'hit-folk',
  description: 'Farmer, gnome, shopkeeper or Maibaum-Dieb takes a hit.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 1200, q: 1.5 },
    durationSeconds: 0.07,
    gain: 0.4,
  },
  tone: { instrument: 'brass-stab', note: 'A3', durationSeconds: 0.06 },
};
const hitOompah: SfxDefinition = {
  id: 'hit-oompah',
  description: 'The Blaskapellist takes a hit.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 1000, q: 0.5 },
    durationSeconds: 0.05,
    gain: 0.2,
  },
  tone: { instrument: 'brass-stab', note: 'C4', durationSeconds: 0.1 },
};

const deathSquelch: SfxDefinition = {
  id: 'death-squelch',
  description: 'Soft-bodied enemy dies.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 300, q: 0.6 },
    durationSeconds: 0.25,
    gain: 0.55,
  },
};
const deathMetal: SfxDefinition = {
  id: 'death-metal',
  description: 'Barrel, tractor or Böller enemy dies.',
  noise: { filter: { type: 'bandpass', frequencyHz: 1800, q: 4 }, durationSeconds: 0.3, gain: 0.5 },
  tone: { instrument: 'tuba', note: 'C2', durationSeconds: 0.3 },
};
const deathAnimal: SfxDefinition = {
  id: 'death-animal',
  description: 'Cow, rooster or bull dies.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 600, q: 0.5 },
    durationSeconds: 0.2,
    gain: 0.35,
  },
  tone: { instrument: 'clarinet', note: 'D3', durationSeconds: 0.25 },
  pitchJitterCents: 300,
};
const deathFolk: SfxDefinition = {
  id: 'death-folk',
  description: 'Farmer, gnome, shopkeeper or Maibaum-Dieb dies.',
  noise: { filter: { type: 'bandpass', frequencyHz: 900, q: 1 }, durationSeconds: 0.18, gain: 0.4 },
  tone: { instrument: 'brass-stab', note: 'F3', durationSeconds: 0.2 },
};
const deathOompah: SfxDefinition = {
  id: 'death-oompah',
  description: 'The Blaskapellist dies — the beat drops with him.',
  tone: { instrument: 'tuba', note: 'G2', durationSeconds: 0.25 },
};

const playerHit: SfxDefinition = {
  id: 'player-hit',
  description: 'The player takes damage, from any source.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 1500, q: 0.7 },
    durationSeconds: 0.06,
    gain: 0.5,
  },
};
const playerDeath: SfxDefinition = {
  id: 'player-death',
  description: "The player's last half-Maß goes with no eternal heart left to spend it.",
  noise: { filter: { type: 'lowpass', frequencyHz: 250, q: 0.5 }, durationSeconds: 0.5, gain: 0.6 },
  tone: { instrument: 'tuba', note: 'C2', durationSeconds: 0.6 },
};
const wallHit: SfxDefinition = {
  id: 'wall-hit',
  description: 'A shot expires against a wall or out of range (EventKind.ProjectileSpent).',
  noise: {
    filter: { type: 'highpass', frequencyHz: 3000, q: 2 },
    durationSeconds: 0.03,
    gain: 0.3,
  },
};

const pickupGeneric: SfxDefinition = {
  id: 'pickup-generic',
  description: 'An item, food or drink is picked up (sim.pickupToast).',
  tone: { instrument: 'bell', note: 'E5', durationSeconds: 0.12 },
};
const pickupPedestal: SfxDefinition = {
  id: 'pickup-pedestal',
  description: 'A pedestal item is taken or swapped (sim.pedestalReveal).',
  tone: { instrument: 'bell', note: 'C6', durationSeconds: 0.3 },
};
const shopPurchase: SfxDefinition = {
  id: 'shop-purchase',
  description: 'A Biermarken purchase completes.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 4000, q: 5 },
    durationSeconds: 0.05,
    gain: 0.2,
  },
  tone: { instrument: 'bell', note: 'G5', durationSeconds: 0.15 },
};

const doorOpen: SfxDefinition = {
  id: 'door-open',
  description: 'The player crosses an unlocked door (sim.doorContact).',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 600, q: 0.5 },
    durationSeconds: 0.2,
    gain: 0.35,
  },
};
const doorLocked: SfxDefinition = {
  id: 'door-locked',
  description: 'A locked door is bumped — enemies still standing, or no key.',
  noise: { filter: { type: 'bandpass', frequencyHz: 200, q: 2 }, durationSeconds: 0.1, gain: 0.4 },
};
const secretReveal: SfxDefinition = {
  id: 'secret-reveal',
  description: 'A bombed wall opens onto a secret room.',
  noise: { filter: { type: 'lowpass', frequencyHz: 400, q: 0.6 }, durationSeconds: 0.3, gain: 0.4 },
  tone: { instrument: 'accordion', note: 'A4', durationSeconds: 0.4 },
};
const floorCardWhoosh: SfxDefinition = {
  id: 'floor-card-whoosh',
  description: 'The floor title card sweeps on.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 800, q: 0.4 },
    durationSeconds: 0.5,
    gain: 0.3,
  },
};

const footstep: SfxDefinition = {
  id: 'footstep',
  description: "The player's foot lands — one per stride, distance-driven.",
  noise: {
    filter: { type: 'lowpass', frequencyHz: 250, q: 0.4 },
    durationSeconds: 0.04,
    gain: 0.18,
  },
};

const uiOpen: SfxDefinition = {
  id: 'ui-open',
  description: 'A menu/results screen opens.',
  tone: { instrument: 'bell', note: 'C5', durationSeconds: 0.08 },
};
const uiClose: SfxDefinition = {
  id: 'ui-close',
  description: 'A menu/results screen closes.',
  tone: { instrument: 'bell', note: 'A4', durationSeconds: 0.08 },
};
const uiConfirm: SfxDefinition = {
  id: 'ui-confirm',
  description: 'A confirming action — restart, accept.',
  tone: { instrument: 'bell', note: 'E5', durationSeconds: 0.1 },
};
const uiCancel: SfxDefinition = {
  id: 'ui-cancel',
  description: 'A cancelling action — escape, back.',
  tone: { instrument: 'bell', note: 'C4', durationSeconds: 0.1 },
};
const uiUnlockFanfare: SfxDefinition = {
  id: 'ui-unlock-fanfare',
  description: 'A new unlock is announced on the results screen.',
  tone: { instrument: 'brass-stab', note: 'C5', durationSeconds: 0.3 },
};

export const SFX_DEFINITIONS: readonly SfxDefinition[] = [
  hitSquelch,
  hitMetal,
  hitAnimal,
  hitFolk,
  hitOompah,
  deathSquelch,
  deathMetal,
  deathAnimal,
  deathFolk,
  deathOompah,
  playerHit,
  playerDeath,
  wallHit,
  pickupGeneric,
  pickupPedestal,
  shopPurchase,
  doorOpen,
  doorLocked,
  secretReveal,
  floorCardWhoosh,
  footstep,
  uiOpen,
  uiClose,
  uiConfirm,
  uiCancel,
  uiUnlockFanfare,
];

/** One of the five enemy timbre families a `hit-*`/`death-*` pair covers. */
export type EnemySfxCategory = 'squelch' | 'metal' | 'animal' | 'folk' | 'oompah';

/**
 * Every enemy id in `content/enemies/index.ts`, sorted into a timbre family.
 * `tests/content/audio.test.ts` asserts this map is exhaustive against the
 * live roster, so a new enemy with no entry here fails CI rather than
 * shipping silent (`docs/DECISIONS.md`'s content-validation standard,
 * applied to sound the way `room-floor-eligibility.test.ts` applies it to
 * rooms).
 */
export const ENEMY_SFX_CATEGORY: Readonly<Record<string, EnemySfxCategory>> = {
  kellerassel: 'squelch',
  'grosse-kellerassel': 'squelch',
  'kellerassel-segment': 'squelch',
  bierratte: 'squelch',
  schimmelfleck: 'squelch',
  schimmelspore: 'squelch',
  zapfhahn: 'squelch',
  rollfass: 'metal',
  fasssplitter: 'metal',
  traktor: 'metal',
  boellerschmeisser: 'metal',
  bauer: 'folk',
  gartenzwerg: 'folk',
  shopkeeper: 'folk',
  'der-stier-maibaum-dieb': 'folk',
  kuh: 'animal',
  gockel: 'animal',
  'der-stier': 'animal',
  blaskapellist: 'oompah',
};

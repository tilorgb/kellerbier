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
  sample: {
    assetId: 'softhit',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.19683333333333333,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.806,
    },
  },
  id: 'hit-squelch',
  description: 'Soft-bodied enemy (woodlouse, rat, mould, foam) takes a hit.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 500, q: 0.5 },
    durationSeconds: 0.08,
    gain: 0.5,
  },
};
const hitMetal: SfxDefinition = {
  sample: {
    assetId: 'metalhit',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.11608333333333333,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 3.821,
    },
  },
  id: 'hit-metal',
  description: 'Barrel, tractor or thrown Böller takes a hit.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 2500, q: 3 },
    durationSeconds: 0.1,
    gain: 0.45,
  },
};
const hitAnimal: SfxDefinition = {
  sample: {
    assetId: 'softhit',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.19683333333333333,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.806,
    },
  },
  id: 'hit-animal',
  description: 'Cow, rooster or bull takes a hit.',
  noise: { filter: { type: 'lowpass', frequencyHz: 800, q: 1 }, durationSeconds: 0.09, gain: 0.4 },
  tone: { instrument: 'clarinet', note: 'G3', durationSeconds: 0.08 },
  pitchJitterCents: 200,
};
const hitFolk: SfxDefinition = {
  sample: {
    assetId: 'softhit',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.19683333333333333,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.806,
    },
  },
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
  sample: {
    assetId: 'softhit',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.19683333333333333,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.806,
    },
  },
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
  sample: {
    assetId: 'enemydie',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.17322916666666666,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 6.214,
    },
  },
  id: 'death-squelch',
  description: 'Soft-bodied enemy dies.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 300, q: 0.6 },
    durationSeconds: 0.25,
    gain: 0.55,
  },
};
const deathMetal: SfxDefinition = {
  sample: {
    assetId: 'metaldie',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.1838125,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 3.472,
    },
  },
  id: 'death-metal',
  description: 'Barrel, tractor or Böller enemy dies.',
  noise: { filter: { type: 'bandpass', frequencyHz: 1800, q: 4 }, durationSeconds: 0.3, gain: 0.5 },
  tone: { instrument: 'tuba', note: 'C2', durationSeconds: 0.3 },
};
const deathAnimal: SfxDefinition = {
  sample: {
    assetId: 'death-animal',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.23,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.5,
      gain: 0.159,
    },
  },
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
  sample: {
    assetId: 'enemydie',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.17322916666666666,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 6.214,
    },
  },
  id: 'death-folk',
  description: 'Farmer, gnome, shopkeeper or Maibaum-Dieb dies.',
  noise: { filter: { type: 'bandpass', frequencyHz: 900, q: 1 }, durationSeconds: 0.18, gain: 0.4 },
  tone: { instrument: 'brass-stab', note: 'F3', durationSeconds: 0.2 },
};
const deathOompah: SfxDefinition = {
  sample: {
    assetId: 'enemydie',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.17322916666666666,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 6.214,
    },
  },
  id: 'death-oompah',
  description: 'The Blaskapellist dies — the beat drops with him.',
  tone: { instrument: 'tuba', note: 'G2', durationSeconds: 0.25 },
};

const playerShot: SfxDefinition = {
  sample: {
    assetId: 'playershot',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.05329166666666667,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 1.183,
    },
  },
  id: 'player-shot',
  description:
    "The player's own shot leaving the Schlauch (#234) — up to several times a second on a held trigger, so it has to sit under `hit-*`/`death-*` rather than compete with them. Pitch-jittered so an identical sample three times a second doesn't turn into a headache.",
  noise: {
    filter: { type: 'lowpass', frequencyHz: 4000, q: 25 },
    durationSeconds: 0.09,
    gain: 0.2,
  },
};

const shotSquelch: SfxDefinition = {
  sample: {
    assetId: 'enemyshot',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.2955625,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.966,
    },
  },
  id: 'shot-squelch',
  description: 'A soft-bodied enemy (Zapfhahn) launches a shot.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 700, q: 0.6 },
    durationSeconds: 0.05,
    gain: 0.25,
  },
};
const shotMetal: SfxDefinition = {
  sample: {
    assetId: 'enemyshot',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.2955625,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.966,
    },
  },
  id: 'shot-metal',
  description: 'A metal enemy (Böllerschmeißer) launches a shot.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 3200, q: 4 },
    durationSeconds: 0.04,
    gain: 0.22,
  },
};
const shotAnimal: SfxDefinition = {
  sample: {
    assetId: 'enemyshot',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.2955625,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.966,
    },
  },
  id: 'shot-animal',
  description: 'An animal enemy (Gockel, Der Stier) launches a shot.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 900, q: 0.6 },
    durationSeconds: 0.05,
    gain: 0.2,
  },
  tone: { instrument: 'clarinet', note: 'A3', durationSeconds: 0.05 },
  pitchJitterCents: 150,
};
const shotFolk: SfxDefinition = {
  sample: {
    assetId: 'enemyshot',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.2955625,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.966,
    },
  },
  id: 'shot-folk',
  description: 'A folk enemy (Bauer, Gartenzwerg) launches a shot.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 1500, q: 1.5 },
    durationSeconds: 0.04,
    gain: 0.2,
  },
};
const shotOompah: SfxDefinition = {
  sample: {
    assetId: 'enemyshot',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.2955625,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.966,
    },
  },
  id: 'shot-oompah',
  description: 'The Blaskapellist launches a shot.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 2200, q: 1 },
    durationSeconds: 0.03,
    gain: 0.15,
  },
  tone: { instrument: 'brass-stab', note: 'E4', durationSeconds: 0.05 },
};

const attackWindup: SfxDefinition = {
  sample: {
    assetId: 'windup',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.5067083333333333,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 2.358,
    },
  },
  id: 'attack-windup',
  description:
    'An enemy telegraph begins (#233/#234) — the audio half of the warning ring, for the player who is not ' +
    'looking at the enemy telegraphing it.',
  tone: { instrument: 'clarinet', note: 'D4', durationSeconds: 0.3 },
  noise: {
    filter: { type: 'bandpass', frequencyHz: 900, q: 2 },
    durationSeconds: 0.25,
    gain: 0.2,
  },
};

const roomClear: SfxDefinition = {
  sample: {
    assetId: 'room-clear',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.26,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.623,
    },
  },
  id: 'room-clear',
  description:
    "The room's last enemy is handled (#234) — a reward sting distinct from `door-open`, which is a door " +
    'sound doing this job today.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 2200, q: 2 },
    durationSeconds: 0.12,
    gain: 0.25,
  },
  tone: { instrument: 'brass-stab', note: 'G4', durationSeconds: 0.22 },
};

const lowHealth: SfxDefinition = {
  sample: {
    assetId: 'low-health',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1.93,
      fadeInSeconds: 0.05,
      fadeOutSeconds: 0.29,
      gain: 0.204,
    },
  },
  id: 'low-health',
  description:
    'The player drops to 1 or 2 half-Maß of red health (#234) — a state change with no cue before this.',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 200, q: 0.6 },
    durationSeconds: 0.3,
    gain: 0.3,
  },
  tone: { instrument: 'tuba', note: 'D2', durationSeconds: 0.4 },
};

const enemySplit: SfxDefinition = {
  sample: {
    assetId: 'enemy-split',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.88,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.5,
      gain: 0.304,
    },
  },
  id: 'enemy-split',
  description:
    "A body's `splitOnDeath` behaviour produces children (#234) — Der Stier's and Grosse Kellerassel's " +
    'PHASE_TWO_SPLIT included, but not boss-only: a Rollfass shattering into Fasssplitter is the same event.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 1000, q: 2 },
    durationSeconds: 0.2,
    gain: 0.4,
  },
  tone: { instrument: 'tuba', note: 'A2', durationSeconds: 0.25 },
};

const playerHit: SfxDefinition = {
  sample: {
    assetId: 'player-hit',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.36,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.775,
    },
  },
  id: 'player-hit',
  description: 'The player takes damage, from any source.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 1500, q: 0.7 },
    durationSeconds: 0.06,
    gain: 0.5,
  },
};
const playerDeath: SfxDefinition = {
  sample: {
    assetId: 'player-death',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 2.0173958333333335,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.16,
      gain: 0.746,
    },
  },
  id: 'player-death',
  description: "The player's last half-Maß goes with no eternal heart left to spend it.",
  noise: { filter: { type: 'lowpass', frequencyHz: 250, q: 0.5 }, durationSeconds: 0.5, gain: 0.6 },
  tone: { instrument: 'tuba', note: 'C2', durationSeconds: 0.6 },
};
const wallHit: SfxDefinition = {
  sample: {
    assetId: 'shotland',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.182875,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 1.042,
    },
  },
  id: 'wall-hit',
  description: 'A shot expires against a wall or out of range (EventKind.ProjectileSpent).',
  noise: {
    filter: { type: 'highpass', frequencyHz: 3000, q: 2 },
    durationSeconds: 0.03,
    gain: 0.3,
  },
};

const pickupGeneric: SfxDefinition = {
  sample: {
    assetId: 'pickup-generic',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.56,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.63,
      gain: 0.728,
    },
  },
  id: 'pickup-generic',
  description: 'An item, food or drink is picked up (sim.pickupToast).',
  tone: { instrument: 'bell', note: 'E5', durationSeconds: 0.12 },
};
const pickupPedestal: SfxDefinition = {
  sample: {
    assetId: 'pickup-pedestal',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1.76,
      fadeInSeconds: 0.17,
      fadeOutSeconds: 0.62,
      gain: 0.554,
    },
  },
  id: 'pickup-pedestal',
  description: 'A pedestal item is taken or swapped (sim.pedestalReveal).',
  tone: { instrument: 'bell', note: 'C6', durationSeconds: 0.3 },
};
const shopPurchase: SfxDefinition = {
  sample: {
    assetId: 'shop-purchase',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.72,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.7,
      gain: 0.55,
    },
  },
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
  sample: {
    assetId: 'door-open',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.48,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.641,
    },
  },
  id: 'door-open',
  description: 'The player crosses an unlocked door (sim.doorContact).',
  noise: {
    filter: { type: 'lowpass', frequencyHz: 600, q: 0.5 },
    durationSeconds: 0.2,
    gain: 0.35,
  },
};
const doorLocked: SfxDefinition = {
  sample: {
    assetId: 'door-locked',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1.0216666666666667,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.739,
    },
  },
  id: 'door-locked',
  description: 'A locked door is bumped — enemies still standing, or no key.',
  noise: { filter: { type: 'bandpass', frequencyHz: 200, q: 2 }, durationSeconds: 0.1, gain: 0.4 },
};
const secretReveal: SfxDefinition = {
  sample: {
    assetId: 'secret-reveal',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1.9656041666666666,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.25,
      gain: 0.44,
    },
  },
  id: 'secret-reveal',
  description: 'A bombed wall opens onto a secret room.',
  noise: { filter: { type: 'lowpass', frequencyHz: 400, q: 0.6 }, durationSeconds: 0.3, gain: 0.4 },
  tone: { instrument: 'accordion', note: 'A4', durationSeconds: 0.4 },
};
const floorCardWhoosh: SfxDefinition = {
  sample: {
    assetId: 'floor-card-whoosh',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1.0216666666666667,
      fadeInSeconds: 0.15,
      fadeOutSeconds: 0.29,
      gain: 0.208,
      filter: { type: 'lowpass', frequencyHz: 50, q: 50 },
    },
  },
  id: 'floor-card-whoosh',
  description: 'The floor title card sweeps on.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 800, q: 0.4 },
    durationSeconds: 0.5,
    gain: 0.3,
  },
};

const footstep: SfxDefinition = {
  sample: {
    assetId: 'footstep',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.09,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.029,
    },
  },
  id: 'footstep',
  description: "The player's foot lands — one per stride, distance-driven.",
  noise: {
    filter: { type: 'lowpass', frequencyHz: 250, q: 0.4 },
    durationSeconds: 0.04,
    gain: 0.18,
  },
};

// Floor 3's Waldbach (#403): the stride cue while wading — a longer, brighter
// splash in place of the dull thud, so the ear knows the water before the
// eye has found the bank.
const footstepWade: SfxDefinition = {
  sample: {
    assetId: 'footstep-wade',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.11,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.122,
    },
  },
  id: 'footstep-wade',
  description: "The player's foot lands in the Waldbach — a splash per stride.",
  noise: {
    filter: { type: 'bandpass', frequencyHz: 1400, q: 0.8 },
    durationSeconds: 0.12,
    gain: 0.16,
  },
};

const uiOpen: SfxDefinition = {
  sample: {
    assetId: 'click',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.10910416666666667,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 4.043,
    },
  },
  id: 'ui-open',
  description: 'A menu/results screen opens.',
  tone: { instrument: 'bell', note: 'C5', durationSeconds: 0.08 },
};
const uiClose: SfxDefinition = {
  sample: {
    assetId: 'ui-close',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.02,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.269,
    },
  },
  id: 'ui-close',
  description: 'A menu/results screen closes.',
  tone: { instrument: 'bell', note: 'A4', durationSeconds: 0.08 },
};
const uiConfirm: SfxDefinition = {
  sample: {
    assetId: 'ui-confirm',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.05,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.05,
      gain: 0.415,
    },
  },
  id: 'ui-confirm',
  description: 'A confirming action — restart, accept.',
  tone: { instrument: 'bell', note: 'E5', durationSeconds: 0.1 },
};
const uiCancel: SfxDefinition = {
  sample: {
    assetId: 'ui-cancel',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.02,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.05,
      gain: 0.225,
    },
  },
  id: 'ui-cancel',
  description: 'A cancelling action — escape, back.',
  tone: { instrument: 'bell', note: 'C4', durationSeconds: 0.1 },
};
const uiUnlockFanfare: SfxDefinition = {
  sample: {
    assetId: 'ui-unlock-fanfare',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.05,
      gain: 0.692,
    },
  },
  id: 'ui-unlock-fanfare',
  description: 'A new unlock is announced on the results screen.',
  tone: { instrument: 'brass-stab', note: 'C5', durationSeconds: 0.3 },
};

const itemSneezeInhale: SfxDefinition = {
  sample: {
    assetId: 'item-sneeze-inhale',
    edit: {
      trimStartSeconds: 0.23,
      trimEndSeconds: 1.47,
      fadeInSeconds: 0.08,
      fadeOutSeconds: 0.57,
      gain: 1.056,
    },
  },
  id: 'item-sneeze-inhale',
  description:
    'Schnupftabak (#396): the held breath before the sneeze — a thin rising hiss, so the half second with no shots in it is not silent.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 2600, q: 0.8 },
    durationSeconds: 0.42,
    gain: 0.16,
  },
  tone: { instrument: 'clarinet', note: 'A4', durationSeconds: 0.35 },
};
const itemSneeze: SfxDefinition = {
  sample: {
    assetId: 'item-sneeze',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.13977083333333334,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.407,
    },
  },
  id: 'item-sneeze',
  description:
    'Schnupftabak (#396): the sneeze. Plays over the one `player-shot` the volley is allowed, and has to read as bigger than it.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 1500, q: 0.7 },
    durationSeconds: 0.28,
    gain: 0.6,
  },
  tone: { instrument: 'brass-stab', note: 'D3', durationSeconds: 0.14 },
  pitchJitterCents: 150,
};

const itemPoisonCleanse: SfxDefinition = {
  sample: {
    assetId: 'item-poison-cleanse',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.93,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.98,
      gain: 0.311,
      filter: { type: 'lowpass', frequencyHz: 100, q: 12 },
    },
  },
  id: 'item-poison-cleanse',
  description:
    'A Maß drunk while poisoned (#401): a short clean rising tone over a soft fizz, so the cure reads as relief rather than as another pickup.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 3200, q: 0.6 },
    durationSeconds: 0.22,
    gain: 0.18,
  },
  tone: { instrument: 'clarinet', note: 'E5', durationSeconds: 0.22 },
};

const itemZeckeLatch: SfxDefinition = {
  sample: {
    assetId: 'item-zecke-latch',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.06,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.09,
      gain: 0.439,
    },
  },
  id: 'item-zecke-latch',
  description:
    'A Zecke latching on (#406): a short wet click and a low sour note, so "something is on you" is heard even with the tick hidden under a crowd.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 2400, q: 2.2 },
    durationSeconds: 0.08,
    gain: 0.4,
  },
  tone: { instrument: 'clarinet', note: 'A2', durationSeconds: 0.18 },
};

const windupSpechtDrum: SfxDefinition = {
  sample: {
    assetId: 'windup-specht-drum',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.35,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.319,
    },
  },
  id: 'windup-specht-drum',
  description:
    'A Specht drumming before its dive (#411): a dry woody "trrrrr" — short bandpassed knocks in a fast run — in place of the generic wind-up, so the dive is heard coming from wherever the bird hangs in the air.',
  noise: {
    filter: { type: 'bandpass', frequencyHz: 1400, q: 4 },
    durationSeconds: 0.025,
    gain: 0.5,
  },
  repeat: { count: 14, intervalSeconds: 0.045 },
};

const windupWaldradlerBell: SfxDefinition = {
  sample: {
    assetId: 'windup-waldradler-bell',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 1.55,
      fadeInSeconds: 0,
      fadeOutSeconds: 0.8,
      gain: 0.371,
    },
  },
  id: 'windup-waldradler-bell',
  description:
    'Der Waldradler ringing his bike bell as the ramps rise (#412): two bright dings, "ring ring" — in place of the generic wind-up, so the charge is heard coming before the ramps are looked at.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 5200, q: 1.2 },
    durationSeconds: 0.05,
    gain: 0.25,
  },
  tone: { instrument: 'clarinet', note: 'A5', durationSeconds: 0.16 },
  repeat: { count: 2, intervalSeconds: 0.2 },
};

const itemZeckeShakeOff: SfxDefinition = {
  sample: {
    assetId: 'item-zecke-shake-off',
    edit: {
      trimStartSeconds: 0,
      trimEndSeconds: 0.21,
      fadeInSeconds: 0.02,
      fadeOutSeconds: 0.05,
      gain: 0.364,
    },
  },
  id: 'item-zecke-shake-off',
  description:
    'Ticks shaken off (#406): a quick flick of dry noise and a bright falling-away note — the release half of the latch click.',
  noise: {
    filter: { type: 'highpass', frequencyHz: 2000, q: 0.8 },
    durationSeconds: 0.14,
    gain: 0.35,
  },
  tone: { instrument: 'clarinet', note: 'E5', durationSeconds: 0.1 },
};

export const SFX_DEFINITIONS: readonly SfxDefinition[] = [
  itemPoisonCleanse,
  itemZeckeLatch,
  itemZeckeShakeOff,
  windupSpechtDrum,
  windupWaldradlerBell,
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
  playerShot,
  shotSquelch,
  shotMetal,
  shotAnimal,
  shotFolk,
  shotOompah,
  attackWindup,
  roomClear,
  lowHealth,
  enemySplit,
  itemSneezeInhale,
  itemSneeze,
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
  footstepWade,
  uiOpen,
  uiClose,
  uiConfirm,
  uiCancel,
  uiUnlockFanfare,
];

/** One of the five enemy timbre families a `hit-*`/`death-*` pair covers. */
/**
 * Enemies whose wind-up has a sound of its own (#411), played through the
 * impact seam's `onAttackWindup` in place of the generic `attack-windup`.
 * The Specht's drumroll is the first: its telegraph is meant to be heard as
 * a woodpecker, not as "something is winding up".
 */
export const ENEMY_WINDUP_SFX: Readonly<Record<string, string>> = {
  specht: 'windup-specht-drum',
  // The bell is the ramp charge's telegraph. His wrapper volley's wind-up
  // rings it too — one ring per attack is a cue the player can learn to
  // distinguish by the ramps rising, not by the sound alone.
  waldradler: 'windup-waldradler-bell',
};

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
  'der-rattenkoenig': 'squelch',
  'die-zapfhahn-orgel': 'metal',
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
  'die-blaskapelle-tuba': 'oompah',
  'die-blaskapelle-trompete': 'oompah',
  'die-blaskapelle-posaune': 'oompah',
  'der-ladewagen': 'metal',
  fliegenpilz: 'squelch',
  zecke: 'squelch',
  kaninchen: 'animal',
  bachforelle: 'squelch',
  boar: 'animal',
  borkenkaefer: 'squelch',
  specht: 'animal',
  // Floor 4 (#40): a marmot, a cabin, and the people it carries.
  murmeltier: 'animal',
  'the-gondola': 'metal',
  tourist: 'folk',
  'the-first-human': 'folk',
  waldradler: 'folk',
  waldradl: 'metal',
  bieber: 'animal',
  'bieber-log-east': 'metal',
  'bieber-log-west': 'metal',
};

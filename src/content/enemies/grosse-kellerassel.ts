import type { EnemyDefinition, SplitOnDeathBehaviour } from '../../sim/enemy/definition.js';

/**
 * Die Große Kellerassel (#36) — Floor 1's boss, and the template every later
 * boss's framework rides on: nothing about "boss" is special-cased in the
 * engine anywhere. It is a room whose `metadata.specialRole` is `'boss'`
 * (`content/rooms/cellar-boss.json`) holding one enemy built from the exact
 * same primitives every other enemy in the game is.
 *
 * Phase one is the ordinary Kellerassel's own crawl/curl loop, scaled up —
 * "teaches attack timing, which the floor's basic Kellerassel has been
 * rehearsing" (the issue's own words) — plus `spit`, a telegraphed cone that
 * has to be an actual, reachable part of the fight, not just a state nobody
 * ever sees. The first version curled on every single hit, `onHit` declared
 * first so a hit always won the race against `crawl`'s own wind-up timer —
 * which meant a player who just held the trigger down kept it curled
 * forever and never had to deal with `spit` at all, since the timer could
 * never accumulate the ticks it needed. `curl` still fires the instant
 * `crawl` takes a hit — that reaction is the fight's whole identity, same as
 * the ordinary Kellerassel's — but coming out of it now lands in `advance`,
 * a state with no `onHit` transition at all: hits still land and damage it
 * there, they just cannot curl it again. That guarantees `wind`/`spit` a
 * real turn every cycle regardless of how continuously the player fires,
 * and only re-arms `curl` once the boss is back in `crawl` after its own
 * attack.
 *
 * At exactly half health it shatters into three `kellerasselSegment`s
 * instead of waiting to actually die — `PHASE_TWO_SPLIT`'s `atHealthBelow`,
 * the one primitive this boss needed the engine to grow (`sim/enemy/
 * definition.ts`'s `SplitOnDeathBehaviour`). Declared on every phase-one
 * state rather than only `crawl`: the split reads off whichever state was
 * current the tick the threshold was crossed, and that tick can land while
 * curled, mid-advance, mid-telegraph or mid-spray just as easily as while
 * crawling.
 *
 * The numbers are chosen so the fight's total health budget does not change
 * between phases: 18 in phase one, threshold at 9, then three segments at 3
 * each — the same 9 left to clear either way, just split three ways instead
 * of one. "Deliberately gentle... its job is to be beaten": no ranged attack
 * anywhere in phase two, only the same curl loop three smaller bodies at
 * once now asks the player to read while managing which one to engage —
 * "teaches crowd management and target prioritisation."
 */

const PHASE_TWO_SPLIT: SplitOnDeathBehaviour = {
  behaviour: 'splitOnDeath',
  into: 'kellerassel-segment',
  count: 3,
  spread: 14,
  atHealthBelow: 0.5,
};

export const grosseKellerassel: EnemyDefinition = {
  id: 'grosse-kellerassel',
  name: 'Die Große Kellerassel',
  // `boss` since #193: a quarter-frame chibi silhouette over a collider to
  // match (`sim/enemy/size.ts`, `docs/DECISIONS.md` #56). Phase two's segments
  // stay `normal` — they are the ordinary Kellerassel three times over.
  size: 'boss',
  deathEffect: 'dust',
  health: 18,
  contactDamage: 2,
  initial: 'crawl',
  states: [
    {
      name: 'crawl',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.5 }, PHASE_TWO_SPLIT],
      transitions: [
        // Checked first: a hit always curls it. Only reachable here and
        // nowhere else in the loop — this is the one moment sustained fire
        // can curl it again, once per cycle, not once per shot.
        { to: 'curl', onHit: true },
        // A fallback ceiling for the (rare) case nothing ever hits it at
        // all, so an untouched fight still eventually reaches `wind`.
        { to: 'wind', after: 150 },
      ],
    },
    {
      name: 'curl',
      // Same shell, same lesson, just a bigger body: the window is unchanged
      // from the ordinary Kellerassel's own, because the fight this is
      // teaching is the same fight.
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'becomeInvulnerable', ticks: 40 },
        PHASE_TWO_SPLIT,
      ],
      transitions: [{ to: 'advance', after: 40 }],
    },
    {
      // Curl-immune, deliberately: no `onHit` transition at all, so a shot
      // landing here damages it same as ever but cannot curl it again — the
      // only way `wind`/`spit` gets a guaranteed turn regardless of how
      // continuously the player is firing.
      name: 'advance',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.5 }, PHASE_TWO_SPLIT],
      transitions: [{ to: 'wind', after: 110 }],
    },
    {
      name: 'wind',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }, PHASE_TWO_SPLIT],
      transitions: [{ to: 'spit', after: 24 }],
    },
    {
      name: 'spit',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 3,
          arc: 0.5,
          everyTicks: 60,
          // #229: narrow enough (a 0.5 rad cone, not a 360° ring like
          // `kellerasselSegment`'s siblings on this floor) that it reads as
          // aimed at the player rather than as a fan to thread, so it is
          // raised past `DEFAULT_MOVEMENT_TUNING.maxSpeed` (1.8) the same
          // way an aimed shot is elsewhere in this pass — Floor 1's boss
          // room is the one place on the floor a retreating player has to
          // actually answer a projectile instead of outwalking it.
          speed: 2,
          damage: 1,
          lifetimeTicks: 50,
          // What it spits is the cellar itself — the mould it has been living
          // in, thrown back at you. Its own sprite (#152) rather than the
          // floor's default tap drip, so a boss volley never reads as an
          // ordinary Zapfhahn's.
          art: 'spore',
        },
        PHASE_TWO_SPLIT,
      ],
      transitions: [{ to: 'crawl', after: 20 }],
    },
  ],
};

/**
 * What phase two actually is: three of these, spawned by `PHASE_TWO_SPLIT`.
 * Deliberately just the ordinary Kellerassel's own crawl/curl loop again,
 * slightly quicker — the lesson does not change, only that there are three
 * of them now and the player has to pick one.
 */
export const kellerasselSegment: EnemyDefinition = {
  id: 'kellerassel-segment',
  name: 'Kellerassel-Segment',
  size: 'normal',
  // One plate of the same insect.
  deathEffect: 'dust',
  health: 3,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'crawl',
  states: [
    {
      name: 'crawl',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.65 }],
      transitions: [{ to: 'curl', onHit: true }],
    },
    {
      name: 'curl',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'becomeInvulnerable', ticks: 30 }],
      transitions: [{ to: 'crawl', after: 30 }],
    },
  ],
};

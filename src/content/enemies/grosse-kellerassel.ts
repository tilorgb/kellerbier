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
 * rehearsing" (the issue's own words). Its one addition is `spit`, a
 * telegraphed cone the crawl can wind into on a timer, so there is at least
 * one attack in the fight with a telegraph to read rather than none at all —
 * getting hit still curls it immediately (declared first, so a hit always
 * wins the race against the timer), which both rewards landing shots and
 * means a player who keeps it curled never has to deal with `spit` at all.
 *
 * At exactly half health it shatters into three `kellerasselSegment`s
 * instead of waiting to actually die — `PHASE_TWO_SPLIT`'s `atHealthBelow`,
 * the one primitive this boss needed the engine to grow (`sim/enemy/
 * definition.ts`'s `SplitOnDeathBehaviour`). Declared on every phase-one
 * state rather than only `crawl`: the split reads off whichever state was
 * current the tick the threshold was crossed, and that tick can land while
 * curled, mid-telegraph, or mid-spray just as easily as while crawling.
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
  size: 'mid',
  health: 18,
  contactDamage: 2,
  initial: 'crawl',
  states: [
    {
      name: 'crawl',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.5 }, PHASE_TWO_SPLIT],
      transitions: [
        // Checked first: a hit always curls it, even on the tick the wind-up
        // timer below would otherwise have fired.
        { to: 'curl', onHit: true },
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
      transitions: [{ to: 'crawl', after: 40 }],
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
          speed: 1.4,
          damage: 1,
          lifetimeTicks: 50,
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

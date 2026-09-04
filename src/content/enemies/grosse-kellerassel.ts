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
 * **#232: the pool was an order of magnitude too small.** At 18 health the
 * fight was over in one or two `crawl → curl → advance → wind → spit`
 * loops (that loop is ~194 ticks, ~3.2s) — the player never saw most of
 * what phase one was authored to do, and phase two arrived as noise rather
 * than a moment. The pool is tuned, not computed, but the target is "the
 * authored loop plays out at least four times against a realistic mid-run
 * fight" — the same yardstick #232 uses for Der Stier — checked with a real
 * `GameSim` rather than by hand (`tests/content/boss-pacing.test.ts`).
 *
 * **#260: 180 overshot it the other way.** Play reports called phase one "a
 * dash too long" — at 180 the loop ran 10 times at the 3 DPS a run starts
 * at (only 5 at 6 DPS, a Bierkrug's worth of damage). 160 keeps the same
 * `tests/content/boss-pacing.test.ts` floor comfortably (8 loops at 3 DPS,
 * 4 — the floor itself — at 6 DPS, with room either side before the next
 * loop count boundary) while visibly trimming the fight.
 *
 * The 50% split threshold no longer means "phase two gets whatever's left
 * of an even budget" the way it did pre-#260: phase two's own tankiness is
 * tuned independently now (see `kellerasselSegment`'s own comment) rather
 * than being derived from splitting phase one's pool three ways, so the two
 * phases' health totals do not need to match any more.
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
  health: 160,
  // #232: was 2. `docs/DECISIONS.md` #65 — pressure comes from the
  // telegraphed `spit`, not from standing next to the body — and a boss
  // whose bare touch can chip a real fraction of a 6-health player twice
  // over is fixing the fight's difficulty with the wrong lever. Length
  // (the health pool above) is that lever now; contact is just the thing
  // that punishes standing still.
  contactDamage: 1,
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
          // raised past `DEFAULT_MOVEMENT_TUNING.maxSpeed` the same way an
          // aimed shot is elsewhere in this pass — Floor 1's boss room is
          // the one place on the floor a retreating player has to actually
          // answer a projectile instead of outwalking it. Before
          // `DEFAULT_ENEMY_TUNING.projectileSpeedScale` (0.9).
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
  // #260: was 30 — scaled to keep phase one and phase two's health totals
  // matching (#232), which made three of these read as three mini-bosses
  // rather than the crowd of ordinary Kellerassel (`health: 3`) the split is
  // meant to feel like. Set independently of phase one's own pool now: a
  // little above the ordinary mob's 3 so a segment still reads as tougher
  // than the room's regular roster, nowhere near the 10x that made them
  // tanky enough to fight almost as long as phase one itself.
  health: 8,
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

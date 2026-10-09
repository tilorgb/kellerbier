import type { DropTable, LootTier } from '../../sim/pickup/definition.js';

/**
 * Drop weights, by enemy tier and by run state.
 *
 * These are starting numbers, not a balance pass (that is #30's job once item
 * pools exist to fight over). What matters here is the shape: every `sober`
 * table is the matching `promilled` table with Maß's weight moved to
 * Biermarken, Kellerschlüssel and Wurst rather than a different table
 * structure — so a future balance pass only ever edits numbers in this file.
 * Maß (health-food-redesign) is now a pure Promille pickup, so it is exactly
 * as absent from a `sober` table as Bier was before it.
 *
 * **#311 roughly tripled the Maß's weights**, and paid for them out of the
 * *coins* in the same table rather than out of `null` or out of the Wurst.
 * That keeps two things true at once. Every `null` is untouched, so a
 * promilled run and a sober one drop something exactly as often as each
 * other — `tests/content/sober-run.test.ts` gates on that, and a promilled
 * run quietly paying out more would be the same "the real game with a
 * feature missing" complaint pointed the other way. And the health is
 * untouched (bar one point of `bratwurst-half` on the weak/normal tiers), so
 * the trade a drinking run makes is money for beer, which is the trade it
 * should be making. The sizing target is roughly `0.26` Promille for a
 * cleared, hoovered room against `PromilleTuning.decayPerSecond`'s `0.006` —
 * see that field for the arithmetic, and for why the pre-#311 numbers made
 * the meter unreachable in the first place.
 *
 * `null`'s weight is what actually sets the drop *rate* — the rest of a
 * table only decides the mix once something has already dropped. Originally
 * every tier dropped 45-80% of the time, on top of the guaranteed-ish
 * `ROOM_CLEAR_DROP_TABLE` roll a room *also* pays on top of every kill in it
 * — three stacking sources meant nothing individual one felt earned. A first
 * pass scaled `null` up to roughly weak 15% / normal 30% / tough 50%, which
 * turned out to still read as "almost every room drops something" once a
 * room's several kills are added up (a room with four normal-tier kills
 * clears something at least once about three times in four, even at a 30%
 * per-kill rate) — the point of `needMultiplierFor`'s health/ammo boost
 * (`GameSim.dropLoot`) is for a missing heart landing to feel earned because
 * it was scarce, and a baseline this generous buries that under drops that
 * would have landed anyway. Halved again here, to roughly weak 8% / normal
 * 15% / tough 25%: a trash mob is now almost always a miss, a tough kill is
 * a real one-in-four rather than a coin flip, and getting hit is meant to
 * cost something a nearby kill won't just casually hand back.
 */
export const ENEMY_DROP_TABLES: Readonly<Record<LootTier, DropTable>> = {
  weak: {
    promilled: [
      { pickupId: null, weight: 500 },
      { pickupId: 'biermarke-1', weight: 7 },
      { pickupId: 'bratwurst-half', weight: 14 },
      { pickupId: 'mass-half', weight: 16 },
      { pickupId: 'kellerschluessel', weight: 2 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
    sober: [
      { pickupId: null, weight: 500 },
      { pickupId: 'biermarke-1', weight: 18 },
      { pickupId: 'bratwurst-half', weight: 17 },
      { pickupId: 'kellerschluessel', weight: 4 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
  },
  normal: {
    promilled: [
      { pickupId: null, weight: 340 },
      { pickupId: 'biermarke-1', weight: 6 },
      { pickupId: 'biermarke-5', weight: 2 },
      { pickupId: 'bratwurst-half', weight: 7 },
      { pickupId: 'bratwurst-full', weight: 5 },
      { pickupId: 'weisswurst-half', weight: 2 },
      { pickupId: 'weisswurst-full', weight: 1 },
      { pickupId: 'mass-half', weight: 18 },
      { pickupId: 'mass-full', weight: 6 },
      { pickupId: 'kellerschluessel', weight: 2 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
    sober: [
      { pickupId: null, weight: 340 },
      { pickupId: 'biermarke-1', weight: 17 },
      { pickupId: 'biermarke-5', weight: 7 },
      { pickupId: 'bratwurst-half', weight: 9 },
      { pickupId: 'bratwurst-full', weight: 5 },
      { pickupId: 'weisswurst-half', weight: 2 },
      { pickupId: 'weisswurst-full', weight: 2 },
      { pickupId: 'kellerschluessel', weight: 6 },
      { pickupId: 'bierfassl', weight: 2 },
    ],
  },
  tough: {
    promilled: [
      { pickupId: null, weight: 240 },
      { pickupId: 'biermarke-1', weight: 1 },
      { pickupId: 'biermarke-5', weight: 6 },
      { pickupId: 'biermarke-10', weight: 3 },
      { pickupId: 'mass-full', weight: 19 },
      { pickupId: 'weisswurst-full', weight: 4 },
      { pickupId: 'blutwurst-full', weight: 2 },
      { pickupId: 'bratwurst-half', weight: 6 },
      { pickupId: 'bratwurst-full', weight: 8 },
      { pickupId: 'kellerschluessel-ring', weight: 5 },
      { pickupId: 'bierfassl-pack', weight: 5 },
      { pickupId: 'chest', weight: 3 },
    ],
    sober: [
      { pickupId: null, weight: 240 },
      { pickupId: 'biermarke-1', weight: 2 },
      { pickupId: 'biermarke-5', weight: 17 },
      { pickupId: 'biermarke-10', weight: 5 },
      { pickupId: 'weisswurst-full', weight: 4 },
      { pickupId: 'blutwurst-full', weight: 2 },
      { pickupId: 'bratwurst-half', weight: 6 },
      { pickupId: 'bratwurst-full', weight: 8 },
      { pickupId: 'kellerschluessel-ring', weight: 10 },
      { pickupId: 'bierfassl-pack', weight: 5 },
      { pickupId: 'chest', weight: 3 },
    ],
  },
};

/**
 * What a broken barrel spills (`sim/systems/loot.ts`) — very rarely anything,
 * and never more than small change: a Biermarke worth 1, half a Bratwurst, or
 * (rarer still, and only once Promille is unlocked) half a Maß. About 8% of
 * barrels drop something; the `null` weight sets that rate, and both columns
 * pay out equally often, the same rule the enemy tables keep.
 */
export const BARREL_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: null, weight: 920 },
    { pickupId: 'biermarke-1', weight: 35 },
    { pickupId: 'bratwurst-half', weight: 35 },
    { pickupId: 'mass-half', weight: 10 },
  ],
  sober: [
    { pickupId: null, weight: 920 },
    { pickupId: 'biermarke-1', weight: 40 },
    { pickupId: 'bratwurst-half', weight: 40 },
  ],
};

/**
 * The chance a broken barrel has something living in it instead of loot — a
 * Schimmelfleck or a Bierratte, even odds — rarer than its loot. Rolled
 * before the loot table; a barrel that let out a critter drops nothing else.
 */
export const BARREL_CRITTER_CHANCE = 0.03;

/** What can crawl out of a barrel, picked evenly. */
export const BARREL_CRITTER_IDS: readonly string[] = ['schimmelfleck', 'bierratte'];

/**
 * Rolled once when a room's last enemy falls, in addition to that enemy's own drop.
 *
 * #353 added `chest` (~7% of clears) and `locked-chest` (~3%), paid for out
 * of the other non-null weights rather than out of `null` — a clear pays out
 * exactly as often as it did before, it just sometimes pays a chest instead
 * of a coin.
 *
 * `null`'s weight is the one place a room is allowed to clear and hand back
 * nothing at all — deliberately still the minority outcome (about 30% of
 * clears), so it reads as "this one didn't pay out" rather than as the
 * common case, which would just feel like the game forgot to reward the
 * player for clearing it.
 */
export const ROOM_CLEAR_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: null, weight: 38 },
    { pickupId: 'biermarke-1', weight: 8 },
    { pickupId: 'biermarke-5', weight: 6 },
    { pickupId: 'mass-half', weight: 22 },
    { pickupId: 'mass-full', weight: 7 },
    { pickupId: 'bratwurst-half', weight: 10 },
    { pickupId: 'bratwurst-full', weight: 6 },
    { pickupId: 'kellerschluessel', weight: 7 },
    { pickupId: 'bierfassl', weight: 7 },
    { pickupId: 'chest', weight: 9 },
    { pickupId: 'locked-chest', weight: 4 },
  ],
  sober: [
    { pickupId: null, weight: 38 },
    { pickupId: 'biermarke-1', weight: 12 },
    { pickupId: 'biermarke-5', weight: 19 },
    { pickupId: 'bratwurst-half', weight: 14 },
    { pickupId: 'bratwurst-full', weight: 10 },
    { pickupId: 'kellerschluessel', weight: 11 },
    { pickupId: 'bierfassl', weight: 7 },
    { pickupId: 'chest', weight: 9 },
    { pickupId: 'locked-chest', weight: 4 },
  ],
};

/**
 * Rolled once when a boss room's fight ends (`GameSim.rollRoomClearLoot`,
 * gated on the cleared room's `specialRole` being `'boss'`) — in place of,
 * not in addition to, `ROOM_CLEAR_DROP_TABLE`. The room's pedestal (drawn
 * from the `'boss'` item pool, `GameSim.pedestalPoolForRole`) is *the* boss
 * reward; this is a bonus on top of it, so `pickupId: null` gets an even
 * weight against the rest of the table — a coin or a keg is a nice extra a
 * boss fight can pay out, not something the fight owes on top of the item.
 * The non-null weights still lean hard toward the biggest denominations and
 * the eternal heart no `ENEMY_DROP_TABLES` tier ever names a full-size dose
 * of, same as before — Blutwurst's half tier gets its one and only table
 * appearance here, a cheaper long-shot next to the full one.
 */
export const BOSS_REWARD_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: null, weight: 100 },
    { pickupId: 'biermarke-10', weight: 17 },
    { pickupId: 'mass-full', weight: 28 },
    { pickupId: 'weisswurst-full', weight: 8 },
    { pickupId: 'blutwurst-full', weight: 8 },
    { pickupId: 'blutwurst-half', weight: 6 },
    { pickupId: 'kellerschluessel-ring', weight: 15 },
    { pickupId: 'bierfassl-pack', weight: 10 },
  ],
  sober: [
    { pickupId: null, weight: 100 },
    { pickupId: 'biermarke-10', weight: 28 },
    { pickupId: 'bratwurst-full', weight: 22 },
    { pickupId: 'weisswurst-full', weight: 9 },
    { pickupId: 'blutwurst-full', weight: 8 },
    { pickupId: 'blutwurst-half', weight: 6 },
    { pickupId: 'kellerschluessel-ring', weight: 15 },
    { pickupId: 'bierfassl-pack', weight: 10 },
  ],
};

/**
 * What a Chest bursts into when opened (#353) — 2–3 rolls of this table,
 * `guaranteed` (`GameSim.openChest`), so it has no `null` outcome: a chest
 * that opens onto nothing reads as the game lying. Small, everyday loot, and
 * it can roll a Kellerschlüssel — which is what feeds Locked Chests.
 */
export const CHEST_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: 'biermarke-1', weight: 20 },
    { pickupId: 'biermarke-5', weight: 10 },
    { pickupId: 'bratwurst-half', weight: 14 },
    { pickupId: 'bratwurst-full', weight: 6 },
    { pickupId: 'mass-half', weight: 14 },
    { pickupId: 'mass-full', weight: 5 },
    { pickupId: 'kellerschluessel', weight: 12 },
    { pickupId: 'bierfassl', weight: 12 },
  ],
  sober: [
    { pickupId: 'biermarke-1', weight: 24 },
    { pickupId: 'biermarke-5', weight: 14 },
    { pickupId: 'bratwurst-half', weight: 16 },
    { pickupId: 'bratwurst-full', weight: 8 },
    { pickupId: 'kellerschluessel', weight: 14 },
    { pickupId: 'bierfassl', weight: 14 },
  ],
};

/**
 * What a Locked Chest bursts into (#353) — 3–4 rolls, `guaranteed`, of
 * bigger denominations than `CHEST_DROP_TABLE`: the key it cost has to have
 * been worth spending. It can roll a key too; blocking that would only make
 * the chest a worse deal. Its item chance is not in here — a Locked Chest
 * that pays an item pays *only* the item (`tuning.chest.lockedItemChance`).
 */
export const LOCKED_CHEST_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: 'biermarke-5', weight: 16 },
    { pickupId: 'biermarke-10', weight: 6 },
    { pickupId: 'bratwurst-full', weight: 12 },
    { pickupId: 'weisswurst-full', weight: 3 },
    { pickupId: 'blutwurst-half', weight: 2 },
    { pickupId: 'mass-full', weight: 12 },
    { pickupId: 'kellerschluessel', weight: 8 },
    { pickupId: 'bierfassl', weight: 8 },
    { pickupId: 'bierfassl-pack', weight: 8 },
  ],
  sober: [
    { pickupId: 'biermarke-5', weight: 22 },
    { pickupId: 'biermarke-10', weight: 8 },
    { pickupId: 'bratwurst-full', weight: 14 },
    { pickupId: 'weisswurst-full', weight: 4 },
    { pickupId: 'blutwurst-half', weight: 2 },
    { pickupId: 'kellerschluessel', weight: 9 },
    { pickupId: 'bierfassl', weight: 8 },
    { pickupId: 'bierfassl-pack', weight: 8 },
  ],
};

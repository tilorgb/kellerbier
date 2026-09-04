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
      { pickupId: 'biermarke-1', weight: 15 },
      { pickupId: 'bratwurst-half', weight: 16 },
      { pickupId: 'mass-half', weight: 6 },
      { pickupId: 'kellerschluessel', weight: 2 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
    sober: [
      { pickupId: null, weight: 500 },
      { pickupId: 'biermarke-1', weight: 17 },
      { pickupId: 'bratwurst-half', weight: 16 },
      { pickupId: 'kellerschluessel', weight: 3 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
  },
  normal: {
    promilled: [
      { pickupId: null, weight: 340 },
      { pickupId: 'biermarke-1', weight: 15 },
      { pickupId: 'biermarke-5', weight: 5 },
      { pickupId: 'bratwurst-half', weight: 8 },
      { pickupId: 'bratwurst-full', weight: 5 },
      { pickupId: 'weisswurst-half', weight: 4 },
      { pickupId: 'weisswurst-full', weight: 1 },
      { pickupId: 'mass-half', weight: 7 },
      { pickupId: 'mass-full', weight: 2 },
      { pickupId: 'kellerschluessel', weight: 3 },
      { pickupId: 'bierfassl', weight: 2 },
    ],
    sober: [
      { pickupId: null, weight: 340 },
      { pickupId: 'biermarke-1', weight: 17 },
      { pickupId: 'biermarke-5', weight: 5 },
      { pickupId: 'bratwurst-half', weight: 9 },
      { pickupId: 'bratwurst-full', weight: 5 },
      { pickupId: 'weisswurst-half', weight: 4 },
      { pickupId: 'weisswurst-full', weight: 1 },
      { pickupId: 'kellerschluessel', weight: 5 },
      { pickupId: 'bierfassl', weight: 2 },
    ],
  },
  tough: {
    promilled: [
      { pickupId: null, weight: 240 },
      { pickupId: 'biermarke-1', weight: 2 },
      { pickupId: 'biermarke-5', weight: 15 },
      { pickupId: 'biermarke-10', weight: 5 },
      { pickupId: 'mass-full', weight: 10 },
      { pickupId: 'weisswurst-full', weight: 8 },
      { pickupId: 'blutwurst-full', weight: 2 },
      { pickupId: 'bratwurst-half', weight: 6 },
      { pickupId: 'bratwurst-full', weight: 8 },
      { pickupId: 'kellerschluessel-ring', weight: 5 },
      { pickupId: 'bierfassl-pack', weight: 5 },
    ],
    sober: [
      { pickupId: null, weight: 240 },
      { pickupId: 'biermarke-1', weight: 2 },
      { pickupId: 'biermarke-5', weight: 18 },
      { pickupId: 'biermarke-10', weight: 5 },
      { pickupId: 'mass-full', weight: 12 },
      { pickupId: 'weisswurst-full', weight: 8 },
      { pickupId: 'blutwurst-full', weight: 2 },
      { pickupId: 'bratwurst-half', weight: 6 },
      { pickupId: 'bratwurst-full', weight: 8 },
      { pickupId: 'kellerschluessel-ring', weight: 8 },
      { pickupId: 'bierfassl-pack', weight: 5 },
    ],
  },
};

/**
 * Rolled once when a room's last enemy falls, in addition to that enemy's own drop.
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
    { pickupId: 'biermarke-1', weight: 15 },
    { pickupId: 'biermarke-5', weight: 20 },
    { pickupId: 'mass-half', weight: 15 },
    { pickupId: 'bratwurst-half', weight: 10 },
    { pickupId: 'bratwurst-full', weight: 8 },
    { pickupId: 'kellerschluessel', weight: 10 },
    { pickupId: 'bierfassl', weight: 8 },
  ],
  sober: [
    { pickupId: null, weight: 38 },
    { pickupId: 'biermarke-1', weight: 15 },
    { pickupId: 'biermarke-5', weight: 22 },
    { pickupId: 'bratwurst-half', weight: 16 },
    { pickupId: 'bratwurst-full', weight: 8 },
    { pickupId: 'kellerschluessel', weight: 11 },
    { pickupId: 'bierfassl', weight: 8 },
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
    { pickupId: 'biermarke-10', weight: 25 },
    { pickupId: 'mass-full', weight: 20 },
    { pickupId: 'weisswurst-full', weight: 15 },
    { pickupId: 'blutwurst-full', weight: 8 },
    { pickupId: 'blutwurst-half', weight: 6 },
    { pickupId: 'kellerschluessel-ring', weight: 15 },
    { pickupId: 'bierfassl-pack', weight: 10 },
  ],
  sober: [
    { pickupId: null, weight: 100 },
    { pickupId: 'biermarke-10', weight: 28 },
    { pickupId: 'bratwurst-full', weight: 22 },
    { pickupId: 'weisswurst-full', weight: 17 },
    { pickupId: 'blutwurst-full', weight: 8 },
    { pickupId: 'blutwurst-half', weight: 6 },
    { pickupId: 'kellerschluessel-ring', weight: 15 },
    { pickupId: 'bierfassl-pack', weight: 10 },
  ],
};

import type { DropTable, LootTier } from '../../sim/pickup/definition.js';

/**
 * Drop weights, by enemy tier and by run state.
 *
 * These are starting numbers, not a balance pass (that is #30's job once item
 * pools exist to fight over). What matters here is the shape: every `sober`
 * table is the matching `promilled` table with `beer`'s weight moved to
 * Biermarken, Kellerschlüssel and health rather than a different table
 * structure — so a future balance pass only ever edits numbers in this file.
 */
export const ENEMY_DROP_TABLES: Readonly<Record<LootTier, DropTable>> = {
  weak: {
    promilled: [
      { pickupId: null, weight: 55 },
      { pickupId: 'biermarke-1', weight: 15 },
      { pickupId: 'brezn', weight: 8 },
      { pickupId: 'radi', weight: 8 },
      { pickupId: 'mass-half', weight: 6 },
      { pickupId: 'beer', weight: 5 },
      { pickupId: 'kellerschluessel', weight: 2 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
    sober: [
      { pickupId: null, weight: 55 },
      { pickupId: 'biermarke-1', weight: 17 },
      { pickupId: 'brezn', weight: 8 },
      { pickupId: 'radi', weight: 8 },
      { pickupId: 'mass-half', weight: 8 },
      { pickupId: 'kellerschluessel', weight: 3 },
      { pickupId: 'bierfassl', weight: 1 },
    ],
  },
  normal: {
    promilled: [
      { pickupId: null, weight: 45 },
      { pickupId: 'biermarke-1', weight: 15 },
      { pickupId: 'biermarke-5', weight: 5 },
      { pickupId: 'brezn', weight: 8 },
      { pickupId: 'obazda', weight: 5 },
      { pickupId: 'radi', weight: 6 },
      { pickupId: 'mass-half', weight: 7 },
      { pickupId: 'mass-full', weight: 2 },
      { pickupId: 'weissbier', weight: 1 },
      { pickupId: 'beer', weight: 6 },
      { pickupId: 'kellerschluessel', weight: 3 },
      { pickupId: 'bierfassl', weight: 2 },
    ],
    sober: [
      { pickupId: null, weight: 45 },
      { pickupId: 'biermarke-1', weight: 17 },
      { pickupId: 'biermarke-5', weight: 5 },
      { pickupId: 'brezn', weight: 8 },
      { pickupId: 'obazda', weight: 5 },
      { pickupId: 'radi', weight: 6 },
      { pickupId: 'mass-half', weight: 9 },
      { pickupId: 'mass-full', weight: 2 },
      { pickupId: 'weissbier', weight: 1 },
      { pickupId: 'kellerschluessel', weight: 5 },
      { pickupId: 'bierfassl', weight: 2 },
    ],
  },
  tough: {
    promilled: [
      { pickupId: null, weight: 20 },
      { pickupId: 'biermarke-1', weight: 2 },
      { pickupId: 'biermarke-5', weight: 15 },
      { pickupId: 'biermarke-10', weight: 5 },
      { pickupId: 'mass-full', weight: 10 },
      { pickupId: 'weissbier', weight: 8 },
      { pickupId: 'schwarzbier', weight: 2 },
      { pickupId: 'brezn', weight: 6 },
      { pickupId: 'radi', weight: 6 },
      { pickupId: 'obazda', weight: 8 },
      { pickupId: 'beer', weight: 8 },
      { pickupId: 'kellerschluessel-ring', weight: 5 },
      { pickupId: 'bierfassl-pack', weight: 5 },
    ],
    sober: [
      { pickupId: null, weight: 20 },
      { pickupId: 'biermarke-1', weight: 2 },
      { pickupId: 'biermarke-5', weight: 18 },
      { pickupId: 'biermarke-10', weight: 5 },
      { pickupId: 'mass-full', weight: 12 },
      { pickupId: 'weissbier', weight: 8 },
      { pickupId: 'schwarzbier', weight: 2 },
      { pickupId: 'brezn', weight: 6 },
      { pickupId: 'radi', weight: 6 },
      { pickupId: 'obazda', weight: 8 },
      { pickupId: 'kellerschluessel-ring', weight: 8 },
      { pickupId: 'bierfassl-pack', weight: 5 },
    ],
  },
};

/** Rolled once when a room's last enemy falls, in addition to that enemy's own drop. */
export const ROOM_CLEAR_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: null, weight: 10 },
    { pickupId: 'biermarke-1', weight: 15 },
    { pickupId: 'biermarke-5', weight: 20 },
    { pickupId: 'mass-half', weight: 15 },
    { pickupId: 'brezn', weight: 10 },
    { pickupId: 'obazda', weight: 8 },
    { pickupId: 'kellerschluessel', weight: 10 },
    { pickupId: 'bierfassl', weight: 8 },
    { pickupId: 'beer', weight: 4 },
  ],
  sober: [
    { pickupId: null, weight: 10 },
    { pickupId: 'biermarke-1', weight: 15 },
    { pickupId: 'biermarke-5', weight: 22 },
    { pickupId: 'mass-half', weight: 16 },
    { pickupId: 'brezn', weight: 10 },
    { pickupId: 'obazda', weight: 8 },
    { pickupId: 'kellerschluessel', weight: 11 },
    { pickupId: 'bierfassl', weight: 8 },
  ],
};

/**
 * Rolled once when a boss room's fight ends (`GameSim.rollRoomClearLoot`,
 * gated on the cleared room's `specialRole` being `'boss'`) — in place of,
 * not in addition to, `ROOM_CLEAR_DROP_TABLE`. `pickupId: null` never
 * appears: a boss always pays out, and the weights lean hard toward the
 * biggest denominations and the eternal heart no `ENEMY_DROP_TABLES` tier
 * ever names.
 */
export const BOSS_REWARD_DROP_TABLE: DropTable = {
  promilled: [
    { pickupId: 'biermarke-10', weight: 25 },
    { pickupId: 'mass-full', weight: 20 },
    { pickupId: 'weissbier', weight: 15 },
    { pickupId: 'schwarzbier', weight: 8 },
    { pickupId: 'kellerschluessel-ring', weight: 15 },
    { pickupId: 'bierfassl-pack', weight: 10 },
    { pickupId: 'beer', weight: 7 },
  ],
  sober: [
    { pickupId: 'biermarke-10', weight: 28 },
    { pickupId: 'mass-full', weight: 22 },
    { pickupId: 'weissbier', weight: 17 },
    { pickupId: 'schwarzbier', weight: 8 },
    { pickupId: 'kellerschluessel-ring', weight: 15 },
    { pickupId: 'bierfassl-pack', weight: 10 },
  ],
};

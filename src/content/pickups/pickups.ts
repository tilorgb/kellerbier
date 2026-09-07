import type { PickupDefinition } from '../../sim/pickup/definition.js';

/** Shared collider radius. Every pickup reads the same size as the original beer pickup (#17). */
const RADIUS = 4;

/**
 * Every pickup in the game.
 *
 * Health — Bratwurst, Weißwurst, Blutwurst — is Wurst, full stop
 * (health-food-redesign). There is no separate "food" category any more:
 * every Wurst tier both heals its own pool *and* lowers Promille by a
 * moderate, size-based amount (full vs. half — not pool-based, so a rare
 * Blutwurst is not a stealth-stronger sobering tool than a common
 * Bratwurst), the job Brezn/Obazda/Radi used to split off on their own.
 * `soberDescription` says only the heal half of that in a sober run (#85),
 * the same reasoning the old food items followed.
 *
 * Maß — full and half — is the only Promille pickup, replacing Bier. It no
 * longer heals at all; see the `promille` effect's own doc comment in
 * `sim/pickup/definition.ts` for how big a swig it actually is.
 */
export const massFull: PickupDefinition = {
  id: 'mass-full',
  name: 'Maß',
  description: 'Raises Promille',
  radius: RADIUS,
  tint: 0xd9403a,
  label: 'M+',
  effect: { kind: 'promille', size: 'full' },
};

export const massHalf: PickupDefinition = {
  id: 'mass-half',
  name: 'Halbe Maß',
  description: 'Raises Promille (less)',
  radius: RADIUS,
  tint: 0xd9403a,
  label: 'M',
  effect: { kind: 'promille', size: 'half' },
};

export const bratwurstFull: PickupDefinition = {
  id: 'bratwurst-full',
  name: 'Bratwurst',
  description: 'Heal, lowers Promille',
  soberDescription: 'Health +2',
  radius: RADIUS,
  tint: 0xd92b3c,
  label: 'Br+',
  effect: { kind: 'food', pool: 'red', heal: 2, promille: 0.5 },
};

export const bratwurstHalf: PickupDefinition = {
  id: 'bratwurst-half',
  name: 'Halbe Bratwurst',
  description: 'Heal, lowers Promille',
  soberDescription: 'Health +1',
  radius: RADIUS,
  tint: 0xd92b3c,
  label: 'Br',
  effect: { kind: 'food', pool: 'red', heal: 1, promille: 0.25 },
};

export const weisswurstFull: PickupDefinition = {
  id: 'weisswurst-full',
  name: 'Weißwurst',
  description: 'Soul heart, lowers Promille',
  soberDescription: 'Soul heart +2',
  radius: RADIUS,
  tint: 0xe8e2d0,
  label: 'Ww+',
  effect: { kind: 'food', pool: 'soul', heal: 2, promille: 0.5 },
};

export const weisswurstHalf: PickupDefinition = {
  id: 'weisswurst-half',
  name: 'Halbe Weißwurst',
  description: 'Soul heart, lowers Promille',
  soberDescription: 'Soul heart +1',
  radius: RADIUS,
  tint: 0xe8e2d0,
  label: 'Ww',
  effect: { kind: 'food', pool: 'soul', heal: 1, promille: 0.25 },
};

export const blutwurstFull: PickupDefinition = {
  id: 'blutwurst-full',
  name: 'Blutwurst',
  description: 'Eternal heart, lowers Promille',
  soberDescription: 'Eternal heart +2',
  radius: RADIUS,
  tint: 0x1c1a1f,
  label: 'Bl+',
  effect: { kind: 'food', pool: 'eternal', heal: 2, promille: 0.5 },
};

export const blutwurstHalf: PickupDefinition = {
  id: 'blutwurst-half',
  name: 'Halbe Blutwurst',
  description: 'Eternal heart, lowers Promille',
  soberDescription: 'Eternal heart +1',
  radius: RADIUS,
  tint: 0x1c1a1f,
  label: 'Bl',
  effect: { kind: 'food', pool: 'eternal', heal: 1, promille: 0.25 },
};

export const biermarke1: PickupDefinition = {
  id: 'biermarke-1',
  name: 'Biermarke',
  description: 'Currency +1',
  radius: RADIUS,
  tint: 0xd4af37,
  label: '1',
  effect: { kind: 'currency', amount: 1 },
};

export const biermarke5: PickupDefinition = {
  id: 'biermarke-5',
  name: 'Biermarke',
  description: 'Currency +5',
  radius: RADIUS,
  tint: 0xe8c94a,
  label: '5',
  effect: { kind: 'currency', amount: 5 },
};

export const biermarke10: PickupDefinition = {
  id: 'biermarke-10',
  name: 'Biermarke',
  description: 'Currency +10',
  radius: RADIUS,
  tint: 0xf5de6b,
  label: '10',
  effect: { kind: 'currency', amount: 10 },
};

export const bierfassl: PickupDefinition = {
  id: 'bierfassl',
  name: 'Bierfassl',
  description: 'Bomb +1',
  radius: RADIUS,
  tint: 0xb5651d,
  label: 'Fa',
  effect: { kind: 'bombs', amount: 1 },
};

export const bierfasslPack: PickupDefinition = {
  id: 'bierfassl-pack',
  name: 'Bierfassl-Packerl',
  description: 'Bomb +3',
  radius: RADIUS,
  tint: 0xb5651d,
  label: 'Fa+',
  effect: { kind: 'bombs', amount: 3 },
};

export const kellerschluessel: PickupDefinition = {
  id: 'kellerschluessel',
  name: 'Kellerschlüssel',
  description: 'Key +1',
  radius: RADIUS,
  tint: 0xc9c9d4,
  label: 'K',
  effect: { kind: 'keys', amount: 1 },
};

export const kellerschluesselRing: PickupDefinition = {
  id: 'kellerschluessel-ring',
  name: 'Schlüsselbund',
  description: 'Key +3',
  radius: RADIUS,
  tint: 0xc9c9d4,
  label: 'K+',
  effect: { kind: 'keys', amount: 3 },
};

/**
 * Der Meisterschlüssel (#275): the mini-boss's drop, and the only thing that
 * opens the floor's boss door. Never rolled from a drop table and never
 * stocked in a shop — it is spawned by a mini-boss room clearing, nowhere
 * else (`docs/DECISIONS.md`'s Meisterschlüssel entry, and
 * `tests/content/meisterschluessel.test.ts` which enforces the absence).
 *
 * Gold against the Kellerschlüssel's silver, and `MS` against its bare `K`,
 * so the two never read as the same pickup — the placeholder-tier stand-in
 * (#34) for the icon this gets once the art is signed off.
 */
export const meisterschluessel: PickupDefinition = {
  id: 'meisterschluessel',
  name: 'Meisterschlüssel',
  description: 'Opens the boss door',
  radius: RADIUS,
  tint: 0xd9a441,
  label: 'MS',
  effect: { kind: 'masterkey' },
};

export const PICKUP_DEFINITIONS: readonly PickupDefinition[] = [
  massFull,
  massHalf,
  bratwurstFull,
  bratwurstHalf,
  weisswurstFull,
  weisswurstHalf,
  blutwurstFull,
  blutwurstHalf,
  biermarke1,
  biermarke5,
  biermarke10,
  bierfassl,
  bierfasslPack,
  kellerschluessel,
  kellerschluesselRing,
  meisterschluessel,
];

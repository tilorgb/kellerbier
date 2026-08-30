import type { PickupDefinition } from '../../sim/pickup/definition.js';

/** Shared collider radius. Every pickup reads the same size as the original beer pickup (#17). */
const RADIUS = 4;

/**
 * Every pickup in the game.
 *
 * Health — Maß, Weißbier, Schwarzbier — drops in every run, unchanged. Beer is
 * the *Promille* pickup and is the one kind a sober run's drop tables never
 * name; see `drop-tables.ts`.
 *
 * The three food items are the only pickups that read differently in the two
 * runs: they heal in both, and their "lowers Promille" half is a sentence a
 * sober run has no business showing, so each carries a `soberDescription`
 * saying only what it actually does there (#85). Their heal numbers are
 * repeated in that second string rather than shared with the first, because
 * the two are written for different readers and the first one is not a
 * template.
 */
export const massFull: PickupDefinition = {
  id: 'mass-full',
  name: 'Maß',
  description: 'Health +2',
  radius: RADIUS,
  tint: 0xd9403a,
  label: 'M+',
  effect: { kind: 'health', pool: 'red', amount: 2 },
};

export const massHalf: PickupDefinition = {
  id: 'mass-half',
  name: 'Halbe Maß',
  description: 'Health +1',
  radius: RADIUS,
  tint: 0xd9403a,
  label: 'M',
  effect: { kind: 'health', pool: 'red', amount: 1 },
};

export const weissbier: PickupDefinition = {
  id: 'weissbier',
  name: 'Weißbier',
  description: 'Soul heart +2',
  radius: RADIUS,
  tint: 0x6fa8dc,
  label: 'W',
  effect: { kind: 'health', pool: 'soul', amount: 2 },
};

export const schwarzbier: PickupDefinition = {
  id: 'schwarzbier',
  name: 'Schwarzbier',
  description: 'Eternal heart +1',
  // Dark, "eternal" tint, but still visible against the room's own dark
  // background — the whole point of a Schwarzbier drop is that it reads on
  // sight.
  tint: 0x6a5a78,
  radius: RADIUS,
  label: 'S',
  effect: { kind: 'health', pool: 'eternal', amount: 1 },
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

export const brezn: PickupDefinition = {
  id: 'brezn',
  name: 'Brezn',
  description: 'Heal, lowers Promille',
  soberDescription: 'Health +1',
  radius: RADIUS,
  tint: 0xa9702f,
  label: 'Br',
  effect: { kind: 'food', heal: 1, promille: 0.3 },
};

export const obazda: PickupDefinition = {
  id: 'obazda',
  name: 'Obazda',
  description: 'Heal, lowers Promille',
  soberDescription: 'Health +2',
  radius: RADIUS,
  tint: 0xe8b23d,
  label: 'Oz',
  effect: { kind: 'food', heal: 2, promille: 0.5 },
};

export const radi: PickupDefinition = {
  id: 'radi',
  name: 'Radi',
  description: 'Heal, lowers Promille',
  soberDescription: 'Health +1',
  radius: RADIUS,
  tint: 0x9fd6a0,
  label: 'Ra',
  effect: { kind: 'food', heal: 1, promille: 0.2 },
};

export const beer: PickupDefinition = {
  id: 'beer',
  name: 'Bier',
  description: 'Heal, raises Promille',
  radius: RADIUS,
  tint: 0xf0c46a,
  label: 'Bi',
  effect: { kind: 'promille', heal: 1 },
};

/**
 * *"Nach zwölfe nimmer."* Generous through floor 3; from floor 4 it is spoiled
 * and hurts instead — see `sim/systems/pickup.ts` for the floor check. One
 * definition, one tint, one label — the sprite cannot betray the trap.
 */
export const weisswurst: PickupDefinition = {
  id: 'weisswurst',
  name: 'Weißwurst',
  description: 'Heal — spoils after floor 3',
  radius: RADIUS,
  tint: 0xecdcc0,
  label: 'Ww',
  effect: { kind: 'weisswurst', floorThreshold: 4, healBelowFloor: 4, damageAtOrAbove: 2 },
};

export const PICKUP_DEFINITIONS: readonly PickupDefinition[] = [
  massFull,
  massHalf,
  weissbier,
  schwarzbier,
  biermarke1,
  biermarke5,
  biermarke10,
  bierfassl,
  bierfasslPack,
  kellerschluessel,
  kellerschluesselRing,
  brezn,
  obazda,
  radi,
  beer,
  weisswurst,
];

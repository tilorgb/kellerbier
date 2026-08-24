import type { PickupDefinition } from '../../sim/pickup/definition.js';

/** Shared collider radius. Every pickup reads the same size as the original beer pickup (#17). */
const RADIUS = 4;

/**
 * Every pickup in the game.
 *
 * Health — Maß, Weißbier, Schwarzbier — drops in every run, unchanged. Beer is
 * the *Promille* pickup and is the one kind a sober run's drop tables never
 * name; see `drop-tables.ts`.
 */
export const massFull: PickupDefinition = {
  id: 'mass-full',
  radius: RADIUS,
  tint: 0xd9403a,
  label: 'M+',
  effect: { kind: 'health', pool: 'red', amount: 2 },
};

export const massHalf: PickupDefinition = {
  id: 'mass-half',
  radius: RADIUS,
  tint: 0xd9403a,
  label: 'M',
  effect: { kind: 'health', pool: 'red', amount: 1 },
};

export const weissbier: PickupDefinition = {
  id: 'weissbier',
  radius: RADIUS,
  tint: 0x6fa8dc,
  label: 'W',
  effect: { kind: 'health', pool: 'soul', amount: 2 },
};

export const schwarzbier: PickupDefinition = {
  id: 'schwarzbier',
  radius: RADIUS,
  // Dark, "eternal" tint, but still visible against the room's own dark
  // background — the whole point of a Schwarzbier drop is that it reads on
  // sight.
  tint: 0x6a5a78,
  label: 'S',
  effect: { kind: 'health', pool: 'eternal', amount: 1 },
};

export const biermarke1: PickupDefinition = {
  id: 'biermarke-1',
  radius: RADIUS,
  tint: 0xd4af37,
  label: '1',
  effect: { kind: 'currency', amount: 1 },
};

export const biermarke5: PickupDefinition = {
  id: 'biermarke-5',
  radius: RADIUS,
  tint: 0xe8c94a,
  label: '5',
  effect: { kind: 'currency', amount: 5 },
};

export const biermarke10: PickupDefinition = {
  id: 'biermarke-10',
  radius: RADIUS,
  tint: 0xf5de6b,
  label: '10',
  effect: { kind: 'currency', amount: 10 },
};

export const bierfassl: PickupDefinition = {
  id: 'bierfassl',
  radius: RADIUS,
  tint: 0xb5651d,
  label: 'Fa',
  effect: { kind: 'bombs', amount: 1 },
};

export const bierfasslPack: PickupDefinition = {
  id: 'bierfassl-pack',
  radius: RADIUS,
  tint: 0xb5651d,
  label: 'Fa+',
  effect: { kind: 'bombs', amount: 3 },
};

export const kellerschluessel: PickupDefinition = {
  id: 'kellerschluessel',
  radius: RADIUS,
  tint: 0xc9c9d4,
  label: 'K',
  effect: { kind: 'keys', amount: 1 },
};

export const kellerschluesselRing: PickupDefinition = {
  id: 'kellerschluessel-ring',
  radius: RADIUS,
  tint: 0xc9c9d4,
  label: 'K+',
  effect: { kind: 'keys', amount: 3 },
};

export const brezn: PickupDefinition = {
  id: 'brezn',
  radius: RADIUS,
  tint: 0xa9702f,
  label: 'Br',
  effect: { kind: 'food', heal: 1, promille: 0.3 },
};

export const obazda: PickupDefinition = {
  id: 'obazda',
  radius: RADIUS,
  tint: 0xe8b23d,
  label: 'Oz',
  effect: { kind: 'food', heal: 2, promille: 0.5 },
};

export const radi: PickupDefinition = {
  id: 'radi',
  radius: RADIUS,
  tint: 0x9fd6a0,
  label: 'Ra',
  effect: { kind: 'food', heal: 1, promille: 0.2 },
};

export const beer: PickupDefinition = {
  id: 'beer',
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

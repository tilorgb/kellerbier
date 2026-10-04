/**
 * What last hurt the player — `GameSim.notePlayerAttacker`. A non-negative
 * value is an enemy definition index; these codes cover everything else.
 * Its own module so the damage systems can import it without importing
 * `GameSim` itself.
 */
export const PLAYER_ATTACKER_NONE = -1;
export const PLAYER_ATTACKER_OWN_BOMB = -2;
export const PLAYER_ATTACKER_OTHER = -3;

/** What killed the player — `GameSim.killedBy`. */
export type PlayerKiller =
  | { readonly kind: 'enemy'; readonly name: string }
  | { readonly kind: 'ownBomb' }
  | { readonly kind: 'other' };

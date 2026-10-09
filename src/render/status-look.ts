import type { GameSim } from '../sim/game/sim.js';
import {
  STATUS_BURN,
  STATUS_DAZE,
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
  STATUS_POISON,
  STATUS_SCARED,
  STATUS_SLOW,
} from '../sim/systems/status-effects.js';
import { ENTITY_PALETTE, STATUS_LOOK_PALETTE, STATUS_POISON_TINT } from './palette.js';

/** How far a body's colour is mixed toward its status tint. */
const FREEZE_MIX = 0.65;
const POISON_MIX = 0.6;
const DAZE_MIX = 0.6;
const SLOW_MIX = 0.5;
const SCARED_MIX = 0.6;
/** Fire flickers between these two mixes, so it reads as alive rather than as a paint job. */
const BURN_MIX_LOW = 0.35;
const BURN_MIX_HIGH = 0.7;
const BURN_FLICKER_RATE = 0.018;
const BURN_GLOW_STRENGTH = 0.55;
/** Every other status glows softly in its own colour: a multiplied tint alone vanishes on a dark sprite. */
const GLOW_STRENGTH = 0.4;

/** The look a body's statuses give it: a tint to mix toward, and an optional emissive glow. */
export interface StatusLook {
  /** `-1` when the body carries no status; otherwise the colour to mix the body toward. */
  tint: number;
  mix: number;
  /** `0` for no glow. */
  glow: number;
  glowStrength: number;
}

export function createStatusLook(): StatusLook {
  return { tint: -1, mix: 0, glow: 0, glowStrength: 0 };
}

/**
 * Reads body `index`'s status row into `out`. Most urgent status wins the
 * tint and glow — frozen, then burning, poisoned, dazed, slowed — except that
 * a burning body always glows with fire, so it stays legible under frost or
 * poison. Presentation only: nothing in `step` reads this, so it can never
 * move a replay. Allocation-free.
 */
export function readStatusLook(
  sim: GameSim,
  index: number,
  nowMs: number,
  out: StatusLook,
): StatusLook {
  const data = sim.statusEffect.data;
  const base = index * STATUS_EFFECT_STRIDE;
  const burning = (data[base + STATUS_BURN] ?? 0) > 0;
  const flicker = Math.sin(nowMs * BURN_FLICKER_RATE + index * 1.7) * 0.5 + 0.5;

  out.glow = 0;
  out.glowStrength = 0;
  if ((data[base + STATUS_FREEZE] ?? 0) > 0) {
    out.tint = STATUS_LOOK_PALETTE.freezeTint;
    out.mix = FREEZE_MIX;
    out.glow = STATUS_LOOK_PALETTE.freezeTint;
    out.glowStrength = GLOW_STRENGTH;
  } else if (burning) {
    out.tint = STATUS_LOOK_PALETTE.burnTint;
    out.mix = BURN_MIX_LOW + (BURN_MIX_HIGH - BURN_MIX_LOW) * flicker;
  } else if ((data[base + STATUS_POISON] ?? 0) > 0) {
    out.tint = STATUS_POISON_TINT;
    out.mix = POISON_MIX;
    out.glow = STATUS_POISON_TINT;
    out.glowStrength = GLOW_STRENGTH;
  } else if ((data[base + STATUS_SCARED] ?? 0) > 0) {
    out.tint = STATUS_LOOK_PALETTE.scaredTint;
    out.mix = SCARED_MIX;
    out.glow = STATUS_LOOK_PALETTE.scaredTint;
    out.glowStrength = GLOW_STRENGTH;
  } else if ((data[base + STATUS_DAZE] ?? 0) > 0) {
    out.tint = ENTITY_PALETTE.dazedTint;
    out.mix = DAZE_MIX;
    out.glow = ENTITY_PALETTE.dazedTint;
    out.glowStrength = GLOW_STRENGTH;
  } else if ((data[base + STATUS_SLOW] ?? 0) > 0) {
    out.tint = STATUS_LOOK_PALETTE.slowTint;
    out.mix = SLOW_MIX;
    out.glow = STATUS_LOOK_PALETTE.slowTint;
    out.glowStrength = GLOW_STRENGTH;
  } else {
    out.tint = -1;
    out.mix = 0;
  }
  // Fire outranks every glow but stays legible under frost or poison's tint.
  if (burning) {
    out.glow = STATUS_LOOK_PALETTE.burnGlow;
    out.glowStrength = BURN_GLOW_STRENGTH * (0.5 + 0.5 * flicker);
  }
  return out;
}

import { StatId } from './definition.js';
import type { StatCaps } from './pipeline.js';

/**
 * The hard caps every run's stat pipeline resolves against.
 *
 * A floor of zero on everything except Fire Rate is the general rule —
 * a stat item math can push below zero is a stat that can go on to break
 * whatever reads it (a negative shot radius, a projectile that lives -4
 * ticks). Fire Rate's floor is the one the issue calls out by name:
 * fire rate is stored as a tick delay so it can be floored at 1 rather than
 * needing a divide-by-zero guard wherever it's read.
 */
export const DEFAULT_STAT_CAPS: StatCaps = {
  [StatId.Damage]: { min: 0, label: 'min Damage' },
  [StatId.FireRate]: { min: 1, label: 'min Fire Rate (1 tick)' },
  [StatId.Range]: { min: 1, label: 'min Range (1 tick)' },
  [StatId.ShotSpeed]: { min: 0, label: 'min Shot Speed' },
  [StatId.MoveSpeed]: { min: 0, label: 'min Move Speed' },
  [StatId.Luck]: { min: 0, label: 'min Luck' },
};

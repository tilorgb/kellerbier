import { StatId } from './definition.js';
import type { StatCaps } from './pipeline.js';

/**
 * The hard caps every run's stat pipeline resolves against.
 *
 * A floor of zero on everything except Schluckfrequenz is the general rule —
 * a stat item math can push below zero is a stat that can go on to break
 * whatever reads it (a negative shot radius, a projectile that lives -4
 * ticks). Schluckfrequenz's floor is the one the issue calls out by name:
 * fire rate is stored as a tick delay so it can be floored at 1 rather than
 * needing a divide-by-zero guard wherever it's read.
 */
export const DEFAULT_STAT_CAPS: StatCaps = {
  [StatId.Stammwuerze]: { min: 0, label: 'min Stammwürze' },
  [StatId.Schluckfrequenz]: { min: 1, label: 'min Schluckfrequenz (1 tick)' },
  [StatId.Reichweite]: { min: 1, label: 'min Reichweite (1 tick)' },
  [StatId.Wurfkraft]: { min: 0, label: 'min Wurfkraft' },
  [StatId.Gschwindigkeit]: { min: 0, label: 'min Gschwindigkeit' },
  [StatId.Dusel]: { min: 0, label: 'min Dusel' },
};

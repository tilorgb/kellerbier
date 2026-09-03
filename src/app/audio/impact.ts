import { EventKind } from '../../sim/events/queue.js';
import type { GameSim } from '../../sim/game/sim.js';

/**
 * The seam audio plugs into.
 *
 * `sfx-player.ts`'s `SynthImpactAudio` is #51's real implementation;
 * `SILENT_AUDIO` stays exported for tests and any environment without Web
 * Audio, the same role `ambience.ts`'s `SILENT_AMBIENCE` plays there.
 *
 * It reads the event queue after a step rather than being called from the
 * simulation, for the same reason everything else does: `sim/` has no idea an
 * audio system exists, and a headless test runs the same code path.
 */
export interface ImpactAudio {
  /** `enemyId` is `null` for a hit whose victim resolved to nothing living by the time this ran. */
  onHit(x: number, y: number, damage: number, enemyId: string | null): void;
  onDeath(x: number, y: number, enemyId: string | null): void;
  /** The player took damage, from any source — contact or a shot. */
  onPlayerHit(damage: number): void;
  /** The player's last half-Maß just went, with no eternal heart left to spend it (#15). */
  onPlayerDeath(): void;
  /** A shot expired against a wall or out of range, hitting nothing (`EventKind.ProjectileSpent`). */
  onWallHit(x: number, y: number): void;
  /** The player's own shot left the barrel (#234) — fires up to several times a second. */
  onPlayerShotFired(): void;
  /** An enemy's shot left the barrel (#234). */
  onEnemyShotFired(enemyId: string | null): void;
  /** An enemy entered a telegraphed wind-up — the audio half of the warning ring (#234). */
  onAttackWindup(enemyId: string | null): void;
  /** A body's on-death `splitOnDeath` behaviour produced children — a boss phase change or similar (#234). */
  onEnemySplit(): void;
}

/** The implementation until Web Audio is available. Deliberately silent, deliberately present. */
export const SILENT_AUDIO: ImpactAudio = {
  onHit: () => undefined,
  onDeath: () => undefined,
  onPlayerHit: () => undefined,
  onPlayerDeath: () => undefined,
  onWallHit: () => undefined,
  onPlayerShotFired: () => undefined,
  onEnemyShotFired: () => undefined,
  onAttackWindup: () => undefined,
  onEnemySplit: () => undefined,
};

/**
 * Reports this tick's impacts to an audio implementation.
 *
 * Call once after each `sim.step`, before the next one clears the queue.
 */
export function playImpactAudio(sim: GameSim, audio: ImpactAudio): void {
  const events = sim.events;
  const player = sim.playerIndex;
  events.forEach((slot) => {
    const x = events.x[slot] ?? 0;
    const y = events.y[slot] ?? 0;
    switch (events.kind[slot]) {
      case EventKind.ProjectileHit: {
        const victim = events.other[slot] ?? -1;
        audio.onHit(x, y, events.value[slot] ?? 0, sim.enemyIdAt(victim));
        break;
      }
      case EventKind.ProjectileSpent:
        audio.onWallHit(x, y);
        break;
      case EventKind.Damage:
        // Only ever pushed for the player — see `applyContact`/`applyHit`.
        audio.onPlayerHit(events.value[slot] ?? 0);
        break;
      case EventKind.Death:
        if (events.subject[slot] === player) {
          audio.onPlayerDeath();
        } else {
          audio.onDeath(x, y, sim.enemyIdAt(events.subject[slot] ?? -1));
        }
        break;
      case EventKind.ShotFired:
        if (events.subject[slot] === player) {
          audio.onPlayerShotFired();
        } else {
          audio.onEnemyShotFired(sim.enemyIdAt(events.subject[slot] ?? -1));
        }
        break;
      case EventKind.AttackWindup:
        audio.onAttackWindup(sim.enemyIdAt(events.subject[slot] ?? -1));
        break;
      case EventKind.EnemySplit:
        audio.onEnemySplit();
        break;
      default:
        break;
    }
  });
}

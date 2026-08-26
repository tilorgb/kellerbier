import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown between bursts (60/s), how many shards fan out, and their damage relative to Stammwürze. */
const COOLDOWN_TICKS = 45;
const SHARD_COUNT = 6;
const DAMAGE_SCALE = 0.5;

/**
 * Scherbenhaufen — the pile of glass left once one of Floor 5's chandeliers
 * comes down. Getting hit knocks a fresh one loose: a ring of shards fans
 * out from you.
 *
 * `onDamageTaken`, cooldown-gated the same way `watschn.ts` gates its own
 * retaliation — but the shape it triggers is `kirchweih-ratschn.ts`'s ring
 * burst rather than a single splash, the same reactive-engine primitive on
 * a different trigger (a hit taken, not a kill streak).
 */
export const scherbenhaufen: ItemDefinition = {
  id: 'scherbenhaufen',
  name: 'Scherbenhaufen',
  description: 'Getting hit fires a ring of glass shards outward',
  flavourText: 'Every piece catches the light differently. None of them catch it kindly.',
  sprite: 'scherbenhaufen',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onDamageTaken: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0 || ctx.amount <= 0) {
        return;
      }
      state.timer = COOLDOWN_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const playerX = sim.positionX(playerIndex);
      const playerY = sim.positionY(playerIndex);
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      for (let i = 0; i < SHARD_COUNT; i++) {
        const angle = (i / SHARD_COUNT) * Math.PI * 2;
        sim.spawnItemProjectile(playerX, playerY, Math.cos(angle), Math.sin(angle), { damage });
      }
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        state.timer -= 1;
      }
    },
  },
};

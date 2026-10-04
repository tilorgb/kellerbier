import type { ItemDefinition, ItemHookContext } from '../../sim/item/definition.js';

/**
 * `state.charge` is the phase; `state.timer` counts the current one down.
 * `EXPANDING` is not a phase of the cycle but the re-entrancy guard for the
 * volley: every shot a cone adds runs `onProjectileSpawn` again, this item's
 * own included, and a cone must not grow cones.
 */
const WAIT = 0;
const RAMP = 1;
const INHALE = 2;
const ARMED = 3;
const EXPANDING = 4;

type Sim = ItemHookContext['sim'];

/** A fresh wait, in ticks with fire held. Never 0, which `WAIT` reads as "not rolled yet". */
function rollWait(sim: Sim): number {
  const tuning = sim.tuning.sneeze;
  const min = Math.max(1, Math.round(tuning.waitMinTicks));
  const max = Math.max(min, Math.round(tuning.waitMaxTicks));
  return sim.random.itemEffects.nextInt(min, max + 1);
}

/**
 * Schnupftabak — snuff. Keep shooting and sooner or later it gets him: the
 * Schlauch slows, his eyes close, he holds his breath, and then he sneezes a
 * cone of shots of every size.
 *
 * The cycle is driven by the trigger, not the clock. The wait only counts
 * ticks with fire held; the build-up (a ramp of growing fire delay, then a
 * short full stop) is lost if fire is let go for longer than a grace window,
 * which is also what a knockdown or an open dialog amounts to, since
 * `sim.fireHeldTick` is not stamped through either. A lost build-up rolls a
 * new wait. Letting go on purpose to skip the slowdown is allowed: it costs
 * the sneeze.
 *
 * The sneeze is an ordinary squeeze this item has cleared the cooldown for.
 * That is what makes it combine: every other item's `onShoot` fires as it
 * would for any shot, and while `sim.squeezeInProgress` is set
 * `onProjectileSpawn` turns *each* shot of that squeeze — the aimed one and
 * whatever the others added — into its own cone. A Bauern-Mistgabel sneeze is
 * three cones. The cone's extra shots go through `spawnItemProjectile`, so
 * they pick up every other item's shot changes exactly as the shot they fan
 * out from did.
 *
 * The wait and the sizes are real rolls, from `sim.random.itemEffects`
 * (`docs/DECISIONS.md` #113) — the first item effect that is. Sauwetter and
 * Lebkuchenherz got away with a fixed cycle because theirs was a choice
 * among options; a sneeze that arrives on schedule is a charge attack.
 *
 * The slowdown is added to `sim.fireCooldown` per shot rather than returned
 * from `modifyStats`: it changes every tick of the ramp, `modifyStats` cannot
 * see the tuning, and a Fire Rate stat that crept up and snapped back every
 * ten seconds would make the stat readout lie about the build.
 */
export const schnupftabak: ItemDefinition = {
  id: 'schnupftabak',
  name: 'Schnupftabak',
  description: 'items.schnupftabak.description',
  flavourText: 'items.schnupftabak.flavourText',
  sprite: 'schnupftabak',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onRemove: (ctx) => {
      ctx.sim.setSneezeBuildUp(0);
    },
    // Runs at the end of the tick, after shooting: `fireHeldTick === tick`
    // is "the trigger was held this tick", and a shot this hook clears the
    // cooldown for leaves on the next one.
    onTick: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      const tuning = sim.tuning.sneeze;
      const held = sim.fireHeldTick === sim.tick;

      if (state.charge === WAIT) {
        if (state.timer <= 0) {
          state.timer = rollWait(sim);
        }
        if (!held) {
          return;
        }
        state.timer -= 1;
        if (state.timer <= 0) {
          state.charge = RAMP;
          state.timer = Math.max(1, Math.round(tuning.rampTicks));
          // The shot already on its way is late too, so the build-up is felt
          // from the tick it starts rather than one shot afterwards.
          sim.fireCooldown += Math.round(sim.stats.value('fireRate') * (tuning.minDelayScale - 1));
        }
        return;
      }

      // The sneeze went out on this tick's squeeze: back to waiting.
      if (state.charge === ARMED && sim.lastShotTick === sim.tick) {
        state.charge = WAIT;
        state.timer = rollWait(sim);
        sim.setSneezeBuildUp(0);
        return;
      }

      if (sim.tick - sim.fireHeldTick > tuning.graceTicks) {
        state.charge = WAIT;
        state.timer = rollWait(sim);
        sim.setSneezeBuildUp(0);
        return;
      }

      if (state.charge === RAMP) {
        state.timer -= 1;
        sim.setSneezeBuildUp(1 - state.timer / Math.max(1, tuning.rampTicks));
        if (state.timer > 0) {
          return;
        }
        if (tuning.inhaleTicks >= 1) {
          state.charge = INHALE;
          state.timer = Math.round(tuning.inhaleTicks);
          sim.playItemCue('sneeze-inhale');
          return;
        }
        // No held breath: the sneeze takes the place of the next shot.
        state.charge = ARMED;
        sim.fireCooldown = 0;
        return;
      }

      sim.setSneezeBuildUp(1);
      if (state.charge === INHALE) {
        state.timer -= 1;
        if (state.timer > 0) {
          // Two, not one: shooting counts the cooldown down before it tests it.
          sim.fireCooldown = Math.max(sim.fireCooldown, 2);
          return;
        }
        state.charge = ARMED;
      }
      // Armed until the trigger lets the sneeze out, whatever fire delay the
      // rest of the build would have imposed.
      sim.fireCooldown = 0;
    },
    onShoot: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      const tuning = sim.tuning.sneeze;
      if (state.charge === RAMP) {
        const progress = 1 - state.timer / Math.max(1, tuning.rampTicks);
        const scale =
          tuning.minDelayScale + (tuning.maxDelayScale - tuning.minDelayScale) * progress;
        sim.fireCooldown += Math.round(sim.stats.value('fireRate') * (scale - 1));
        return;
      }
      if (state.charge !== ARMED) {
        return;
      }
      sim.playItemCue('sneeze');
      // The engine adds an ordinary shot's kickback itself; this is the rest.
      const recoil = sim.tuning.shooting.kickback * (tuning.kickbackScale - 1);
      sim.pushPlayer(-ctx.directionX * recoil, -ctx.directionY * recoil);
    },
    onProjectileSpawn: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      if (state.charge !== ARMED || !sim.squeezeInProgress) {
        return;
      }
      const tuning = sim.tuning.sneeze;
      const random = sim.random.itemEffects;
      const projectiles = sim.projectiles;
      const source = ctx.projectile;
      state.charge = EXPANDING;

      // The shot the cone fans out from is its middle, and gets a size too.
      const sourceRoll = random.nextFloat();
      const sourceBig = sourceRoll < tuning.bigChance;
      const sourceSmall = !sourceBig && sourceRoll < tuning.bigChance + tuning.smallChance;
      projectiles.radius[source] =
        (projectiles.radius[source] ?? 0) *
        (sourceBig ? tuning.bigRadiusScale : sourceSmall ? tuning.smallRadiusScale : 1);
      projectiles.damage[source] =
        (projectiles.damage[source] ?? 0) *
        (sourceBig ? tuning.bigDamageScale : sourceSmall ? tuning.smallDamageScale : 1) *
        tuning.volleyDamageScale;
      sim.tintProjectile(source, 'schnupf');

      const originX = projectiles.x[source] ?? 0;
      const originY = projectiles.y[source] ?? 0;
      const baseAngle = Math.atan2(
        projectiles.velocityY[source] ?? 0,
        projectiles.velocityX[source] ?? 0,
      );
      const baseDamage = sim.stats.value('damage') * tuning.volleyDamageScale;
      const extras =
        Math.round(tuning.coneShots + tuning.coneShotsPerStack * (state.count - 1)) - 1;
      const step = extras > 0 ? tuning.coneRadians / extras : 0;
      for (let extra = 0; extra < extras; extra++) {
        // Evenly across the cone and either side of the middle shot, each
        // nudged off its mark so no two sneezes fan out alike.
        const offset =
          -tuning.coneRadians / 2 + step * (extra + 0.5) + (random.nextFloat() - 0.5) * step * 0.6;
        const roll = random.nextFloat();
        const big = roll < tuning.bigChance;
        const small = !big && roll < tuning.bigChance + tuning.smallChance;
        const slot = sim.spawnItemProjectile(
          originX,
          originY,
          Math.cos(baseAngle + offset),
          Math.sin(baseAngle + offset),
          {
            damage:
              baseDamage * (big ? tuning.bigDamageScale : small ? tuning.smallDamageScale : 1),
            radiusScale: big ? tuning.bigRadiusScale : small ? tuning.smallRadiusScale : 1,
            speedScale: 1 + (random.nextFloat() * 2 - 1) * tuning.speedJitter,
          },
        );
        // Snuff-brown unless another item has already painted the shot.
        if (slot >= 0 && (projectiles.tint[slot] ?? 0) === 0) {
          sim.tintProjectile(slot, 'schnupf');
        }
      }
      state.charge = ARMED;
    },
  },
};

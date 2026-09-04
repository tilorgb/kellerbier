import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { ParticleKind, type ParticleKindId } from '../particle/store.js';
import { DEFAULT_DEATH_EFFECT, dragFor, spray } from '../particle/effects.js';
import { EnemySize } from '../enemy/size.js';
import { ENEMY_STRIDE, isEnemyInvulnerable, markEnemyHit } from './enemy.js';
import { dispatchItemDamageTaken, dispatchItemHit, dispatchItemKill } from './items.js';
import { addPush } from './movement.js';

/**
 * What a hit does.
 *
 * This is the most important file in the game. Everything else is content;
 * this is the reason the content is worth playing. A hit fires the whole
 * package at once — flash, a local hit-stagger, knockback, shake, foam — and
 * none of the individual pieces is expensive or clever. What matters is that
 * they all happen, together, on the same frame.
 *
 * The stagger (`GameSim.hitStun`, spent in `stepEnemies`) is deliberately
 * local to whatever got hit, not a `requestHitstop` freeze of the whole
 * simulation: a hit rate high enough to matter — a held trigger against a
 * cluster, one burn tick landing on several bodies at once — used to
 * synchronise into the entire game stopping several times a second. See
 * `hitStun`'s doc comment on `GameSim` for the measurement.
 *
 * It reads the event queue rather than being called by collision, which is what
 * lets any of it be retuned, weakened for accessibility, or switched off
 * entirely without touching the code that decided a hit happened.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepImpact(sim: GameSim): void {
  const events = sim.events;
  const count = events.capacity;

  // A plain index walk rather than `forEach`, because this loop pushes new
  // events (deaths) while it runs, and appending to a list being iterated is
  // how a system ends up processing its own output.
  collect(sim);

  const hits = collected[COLLECTED_HITS] ?? 0;
  for (let entry = 0; entry < hits; entry++) {
    const slot = hitSlots[entry] ?? 0;
    if (slot >= count) {
      continue;
    }
    applyHit(sim, slot);
  }

  // Contacts and spends are read after hits and from their own buffers, because
  // the hit pass appends deaths to the queue while it runs and a single walk
  // would be reading a list it is still writing.
  const contacts = collected[COLLECTED_CONTACTS] ?? 0;
  for (let entry = 0; entry < contacts; entry++) {
    const slot = contactSlots[entry] ?? 0;
    if (slot >= count) {
      continue;
    }
    applyContact(sim, slot);
  }

  const spends = collected[COLLECTED_SPENDS] ?? 0;
  for (let entry = 0; entry < spends; entry++) {
    const slot = spentSlots[entry] ?? 0;
    if (slot >= count) {
      continue;
    }
    applySpend(sim, slot);
  }
}

/**
 * Hit event slots for this tick.
 *
 * A module-level buffer sized to the event queue, so the pass that reads hits
 * and the pass that writes deaths do not interleave — and so neither of them
 * allocates.
 */
const hitSlots = new Int32Array(1024);
/** The same, for shots that ended without hitting anything. */
const spentSlots = new Int32Array(1024);
/** And for bodies that touched something that hurts. */
const contactSlots = new Int32Array(256);
let collectSim: GameSim | null = null;

/**
 * How many of each landed in the buffers above.
 *
 * An `Int32Array` rather than three `let`s. A small integer in a module binding
 * is not boxed today, but nothing here says these are integers, and a double
 * stored into a module binding allocates a `HeapNumber` every time — which is
 * why the `no-hot-allocation` rule bans the shape rather than the bug.
 */
const COLLECTED_HITS = 0;
const COLLECTED_SPENDS = 1;
const COLLECTED_CONTACTS = 2;
const collected = new Int32Array(3);

function collect(sim: GameSim): void {
  collectSim = sim;
  collected[COLLECTED_HITS] = 0;
  collected[COLLECTED_SPENDS] = 0;
  collected[COLLECTED_CONTACTS] = 0;
  sim.events.forEach(collectEvent);
  collectSim = null;
}

function collectEvent(slot: number): void {
  const sim = collectSim;
  if (sim === null) {
    return;
  }
  const kind = sim.events.kind[slot];
  if (kind === EventKind.ProjectileHit) {
    append(hitSlots, COLLECTED_HITS, slot);
    return;
  }
  if (kind === EventKind.ProjectileSpent) {
    append(spentSlots, COLLECTED_SPENDS, slot);
    return;
  }
  if (kind === EventKind.Contact) {
    append(contactSlots, COLLECTED_CONTACTS, slot);
  }
}

/** Appends to one of the buffers, or drops the event if it is full. */
function append(buffer: Int32Array, counter: number, slot: number): void {
  const count = collected[counter] ?? 0;
  if (count < buffer.length) {
    buffer[count] = slot;
    collected[counter] = count + 1;
  }
}

/**
 * What touching something that hurts does.
 *
 * The same package as being shot — flash, knockback, shake — pointed at the
 * player instead of at what they were shooting, plus the one piece a contact
 * hit needs and a projectile hit does not: a window in which it cannot happen
 * again. Without it, standing in something empties the health bar in a tenth
 * of a second and the player never sees what killed them.
 *
 * No hit-stagger: the victim is always the player, and stunning the player's
 * own controls on every contact hit is not a "juicier" hit, it is dropped
 * input — see `hitStun`'s doc comment on `GameSim`. The i-frames below are
 * what keeps one hazard from reading as several.
 */
function applyContact(sim: GameSim, slot: number): void {
  const events = sim.events;
  const tuning = sim.tuning.impact;

  const victim = events.subject[slot] ?? 0;
  const damage = events.value[slot] ?? 0;
  if (damage <= 0 || sim.playerInvulnerableTicks > 0) {
    return;
  }

  sim.applyPlayerDamage(damage);
  dispatchItemDamageTaken(sim, damage);

  sim.flash.data[victim] = Math.min(255, Math.round(tuning.deathFlashTicks));
  sim.makePlayerInvulnerable(Math.round(tuning.contactInvulnerabilityTicks));

  // Thrown clear of what hurt them. Being hurt and left standing in the thing
  // that did it is how a player loses a second heart to the first mistake.
  const normalX = events.normalX[slot] ?? 0;
  const normalY = events.normalY[slot] ?? 0;
  addPush(sim, victim, normalX * tuning.contactKnockback, normalY * tuning.contactKnockback);

  sim.addShake(normalX, normalY, tuning.playerHitShake);
  events.push(EventKind.Damage, victim, events.other[slot] ?? 0, 0, 0, normalX, normalY, damage);

  if (sim.playerDead) {
    events.push(EventKind.Death, victim, events.other[slot] ?? 0, 0, 0, normalX, normalY, 0);
  }
}

function applyHit(sim: GameSim, slot: number): void {
  const events = sim.events;

  const target = events.subject[slot] ?? 0;
  const damage = events.value[slot] ?? 0;
  const hitX = events.x[slot] ?? 0;
  const hitY = events.y[slot] ?? 0;
  const normalX = events.normalX[slot] ?? 0;
  const normalY = events.normalY[slot] ?? 0;

  const isPlayer = target === sim.playerIndex;

  // A shot that lands during the player's i-frames does nothing at all —
  // matching `applyContact` exactly, so a body's contact hit and an enemy's
  // shot can't stack inside the same invulnerability window. Enemies have no
  // such window; being "invulnerable" for an enemy means curled up, which
  // `isEnemyInvulnerable` below covers instead.
  if (isPlayer && sim.playerInvulnerableTicks > 0) {
    return;
  }

  if (!isPlayer) {
    // A shot that arrives while the body is curled up splashes off it. The player
    // has to be able to tell that from a miss and from a hit that did nothing:
    // foam comes off it, the screen barely moves, and no health changes.
    if (isEnemyInvulnerable(sim, target)) {
      deflect(sim, hitX, hitY, normalX, normalY);
      return;
    }

    // Told to the body before its health changes, so a state machine sees the hit
    // whether or not the hit killed it.
    markEnemyHit(sim, target);
  }

  applyDamageAt(sim, target, damage, hitX, hitY, normalX, normalY, events.other[slot] ?? 0);
}

/**
 * The package a landed hit fires — health, flash, a local stagger, knockback,
 * shake, foam, a damage number, and the kill itself when it's lethal.
 *
 * Split out of `applyHit` so a Bierfassl's blast (`systems/bombs.ts`) fires
 * the exact same package a shot does, without going through a fake
 * `ProjectileHit` event to get there. `applyHit` still owns what `applyHit`
 * alone needs first — the player's i-frame check, an enemy's curled-up
 * deflect, and telling the enemy state machine it was hit — none of which a
 * blast goes through: a Bierfassl going off next to a curled Kellerassel is
 * not a shot missing, it is an explosion, and nothing in the room is spared
 * one for having its shell up.
 */
export function applyDamageAt(
  sim: GameSim,
  target: number,
  damage: number,
  hitX: number,
  hitY: number,
  normalX: number,
  normalY: number,
  cause: number,
  hitEffect: ParticleKindId = ParticleKind.Foam,
): void {
  const events = sim.events;
  const tuning = sim.tuning.impact;
  const isPlayer = target === sim.playerIndex;

  const health = sim.health.data;
  let killed = false;
  if (isPlayer) {
    // Soul, then red, then an eternal heart if one is banked — see
    // `GameSim.applyPlayerDamage`. Never removed from the world even at zero:
    // death is `sim.playerDead` becoming true, not the entity going away.
    // Destroying it would free the slot for the next enemy to spawn into, and
    // the camera would follow whatever landed there.
    sim.applyPlayerDamage(damage);
    dispatchItemDamageTaken(sim, damage);
    sim.makePlayerInvulnerable(Math.round(tuning.projectileInvulnerabilityTicks));
    // One signal for "the player took damage" regardless of source — matches
    // what `applyContact` already pushes for a contact hit, so audio and
    // rumble (#15) have a single event kind to listen for either.
    events.push(EventKind.Damage, target, cause, hitX, hitY, normalX, normalY, damage);
  } else {
    const remaining = (health[target * 2] ?? 0) - damage;
    killed = (health[target * 2 + 1] ?? 0) > 0 && remaining <= 0;
    health[target * 2] = Math.max(0, remaining);
    // A player's shot (or blast) landing on something else — #26's onHit,
    // fired whether or not this hit was the kill.
    dispatchItemHit(sim, target, damage, hitX, hitY);
  }

  // Flash. One tick of solid white, and the whole read of "that connected".
  sim.flash.data[target] = Math.min(
    255,
    Math.round(killed ? tuning.deathFlashTicks : tuning.flashTicks),
  );

  // Hit-stagger. Scaled by damage, capped hard — past about four ticks it stops
  // reading as impact and starts reading as a dropped frame. Local to the body
  // that was hit (see `hitStun` on `GameSim`), and skipped for the player (no
  // stunning someone's own controls) and for a kill (the body is about to
  // leave the world; the bigger flash/shake/particles below already say
  // "that one mattered more" without needing anything to hold still).
  if (!isPlayer && !killed) {
    const hitstun = Math.min(
      tuning.maxHitstunTicks,
      tuning.hitstunTicks + damage * tuning.hitstunPerDamage,
    );
    sim.requestHitStun(target, Math.round(hitstun));
  }

  // Knockback, along the way the shot was travelling, divided by mass. A heavy
  // enemy shrugging off what throws a light one is how mass becomes something
  // the player reads off the screen.
  const mass = Math.max(0.01, sim.body.data[target * 2 + 1] ?? 1);
  const impulse = (damage * tuning.knockback) / mass;
  addPush(sim, target, -normalX * impulse, -normalY * impulse);

  // Screenshake, directional and capped. Hitting something is what the player
  // does constantly on a run that is going well, so it is the cheapest of the
  // three: a kill earns more, and being hurt earns the most.
  const shake =
    target === sim.playerIndex
      ? tuning.playerHitShake
      : killed
        ? tuning.deathShake
        : damage * tuning.shakePerDamage;
  sim.addShake(-normalX, -normalY, shake);

  // What a creature comes apart into is authored on the creature (#153) —
  // beer splashes, a Schimmelfleck does not — and falls back to beer for
  // anything that names nothing, which is what every death used to throw.
  // A non-kill hit sprays `hitEffect` (Foam by default) rather than always
  // Foam, so a status tick (#248 — `stepStatusEffects` passes Spore for a
  // poison tick) reads as a distinct kind of hit rather than identical to a
  // shot or a claw landing.
  spray(
    sim,
    hitX,
    hitY,
    normalX,
    normalY,
    killed ? tuning.particlesOnDeath : tuning.particlesPerHit,
    killed ? deathEffectOf(sim, target) : hitEffect,
    tuning.particleSpread,
    1,
  );
  // A few hard sparks on top of the foam, on a hit that landed but did not
  // kill. Foam says "that connected"; the sparks are what make it *read* as
  // connecting rather than as the shot being absorbed — and there are few
  // enough of them that they never bury what is behind the body.
  if (!killed && tuning.particlesPerHit > 0) {
    spray(
      sim,
      hitX,
      hitY,
      normalX,
      normalY,
      HIT_SPARKS,
      ParticleKind.Spark,
      tuning.particleSpread * 0.5,
      1.5,
      0.5,
      0.7,
    );
  }

  if (tuning.damageNumbers) {
    sim.damageNumbers.spawn(
      hitX,
      hitY,
      normalX * 0.4,
      -1.4,
      Math.round(tuning.damageNumberLifeTicks),
      damage,
    );
  }

  if (killed) {
    events.push(EventKind.Death, target, cause, hitX, hitY, normalX, normalY, 0);
    dispatchItemKill(sim, target);
    sim.kill(target);
    // A kill is rare where hits are not, which is exactly the case
    // `requestHitstop`'s own doc comment still reserves the whole-simulation
    // freeze for (#23 amended #6 to keep an ordinary hit's stagger local for
    // that same reason). Boss kill gets closer to the player's own death
    // beat — the one enemy in the room worth a health bar earns something
    // closer to what losing the run does. Requesting it here, alongside the
    // kill's own flash/shake/particle numbers, is what makes "four kills on
    // one tick, one freeze" fall out of `requestHitstop`'s existing
    // longest-wins rule for free, with no extra guard needed.
    sim.requestHitstop(
      isBossKill(sim, target) ? tuning.bossKillFreezeTicks : tuning.killFreezeTicks,
    );
  } else if (isPlayer && sim.playerDead) {
    events.push(EventKind.Death, target, cause, hitX, hitY, normalX, normalY, 0);
  }
}

/**
 * What a shot that hit something invulnerable does.
 *
 * Everything a hit does except the parts that mean it landed: no damage, no
 * flash, no stagger, no knockback. A bullet that simply vanished into a curled
 * Kellerassel would read as the game having dropped it, which is the one thing
 * this must not look like.
 */
/** How many sparks a landed hit throws on top of its foam. Deliberately few. */
const HIT_SPARKS = 3;

/**
 * The particle kind `target` comes apart into.
 *
 * Reads the compiled enemy's own authored `deathEffect`. Anything that is not
 * an enemy — a barrel, a training target — throws beer like everything did
 * before this, which is the right answer for a prop full of it.
 */
function deathEffectOf(sim: GameSim, target: number): ParticleKindId {
  if (((sim.world.masks[target] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return DEFAULT_DEATH_EFFECT;
  }
  return sim.enemies.at(sim.enemy.data[target * ENEMY_STRIDE] ?? 0).deathEffect;
}

/**
 * Whether `target` is an authored boss — same mask check as `deathEffectOf`,
 * read before `sim.kill` (called just above this in `applyDamageAt`) queues
 * the slot's death; the mask itself survives until `world.flush()` at the
 * end of the tick, so reading it after `kill` here is still safe.
 */
function isBossKill(sim: GameSim, target: number): boolean {
  if (((sim.world.masks[target] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  return sim.enemies.at(sim.enemy.data[target * ENEMY_STRIDE] ?? 0).size === EnemySize.Boss;
}

function deflect(sim: GameSim, x: number, y: number, normalX: number, normalY: number): void {
  const tuning = sim.tuning.enemy;
  spray(
    sim,
    x,
    y,
    normalX,
    normalY,
    Math.round(tuning.deflectParticles),
    ParticleKind.Foam,
    sim.tuning.impact.particleSpread,
    1,
  );
  sim.addShake(-normalX, -normalY, tuning.deflectShake);
}

/**
 * What a shot that hit nothing does.
 *
 * A projectile that simply stops being drawn reads as a bug — the player fired
 * something and the game lost it. A shot that lands tells them instead that the
 * weapon has a range, which is the thing range items later move up and down.
 *
 * Two cases, told apart by whether the event carries a normal. A wall gives one,
 * and the beer comes back off it in a cone. Running out of range does not, and
 * the shot goes down where it is: a small splash in every direction, slower
 * than an impact, because nothing hit it — it fell.
 */
function applySpend(sim: GameSim, slot: number): void {
  const events = sim.events;
  const tuning = sim.tuning.impact;

  const x = events.x[slot] ?? 0;
  const y = events.y[slot] ?? 0;
  const normalX = events.normalX[slot] ?? 0;
  const normalY = events.normalY[slot] ?? 0;
  const hitWall = normalX !== 0 || normalY !== 0;

  spray(
    sim,
    x,
    y,
    normalX,
    normalY,
    Math.round(tuning.particlesOnSpend),
    ParticleKind.Splash,
    hitWall ? tuning.particleSpread : Math.PI,
    hitWall ? 1 : tuning.spentSpeedScale,
  );
}

/** Ages every particle, and drags it toward a stop. */
export function stepParticles(sim: GameSim): void {
  particleSim = sim;
  sim.particles.forEachLive(advanceParticle);
  sim.damageNumbers.forEachLive(advanceDamageNumber);
  particleSim = null;
}

let particleSim: GameSim | null = null;

function advanceParticle(index: number): void {
  const sim = particleSim;
  if (sim === null) {
    return;
  }
  const particles = sim.particles;

  const remaining = (particles.life[index] ?? 0) - 1;
  if (remaining <= 0) {
    particles.despawn(index);
    return;
  }
  particles.life[index] = remaining;

  const x = particles.x[index] ?? 0;
  const y = particles.y[index] ?? 0;
  particles.previousX[index] = x;
  particles.previousY[index] = y;

  // Per-kind (#153): a spore hangs in the air where a splinter drops. One
  // multiply on a number the loop already read, rather than a branch.
  const drag = dragFor(sim.tuning.impact.particleDrag, particles.kind[index] ?? 0);
  const velocityX = (particles.velocityX[index] ?? 0) * drag;
  const velocityY = (particles.velocityY[index] ?? 0) * drag;
  particles.velocityX[index] = velocityX;
  particles.velocityY[index] = velocityY;
  particles.x[index] = x + velocityX;
  particles.y[index] = y + velocityY;
}

/** Damage numbers pop upward and arc away. */
function advanceDamageNumber(index: number): void {
  const sim = particleSim;
  if (sim === null) {
    return;
  }
  const numbers = sim.damageNumbers;

  const remaining = (numbers.life[index] ?? 0) - 1;
  if (remaining <= 0) {
    numbers.despawn(index);
    return;
  }
  numbers.life[index] = remaining;

  const x = numbers.x[index] ?? 0;
  const y = numbers.y[index] ?? 0;
  numbers.previousX[index] = x;
  numbers.previousY[index] = y;

  // Rises, slows, then falls: the arc is what makes it read as a pop rather
  // than a label sliding up the screen.
  const velocityY = (numbers.velocityY[index] ?? 0) + 0.09;
  numbers.velocityY[index] = velocityY;
  numbers.x[index] = x + (numbers.velocityX[index] ?? 0);
  numbers.y[index] = y + velocityY;
}

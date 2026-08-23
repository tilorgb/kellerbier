import { circlesOverlap } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { addPush } from './movement.js';

/**
 * Bodies against bodies.
 *
 * Projectiles are handled by the collision system, which asks *when* along a
 * move something was struck. This asks a different question — two things are
 * overlapping right now, so where should they be instead — and the answer is
 * most of what makes a room feel occupied. A player who walks through enemies
 * is playing a game where enemies are pictures.
 *
 * Separation is shared out by mass, so shouldering a gnat aside barely slows
 * the player and walking into something heavy stops them. That is the same
 * number knockback divides by, which is what makes mass one property the player
 * can read off the screen instead of several that happen to agree.
 *
 * It runs after `stepCollision` so it can reuse the broadphase that was built
 * there; nothing between them moves anything.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Layers a body is pushed out of. Pickups are walked over, not into. */
const SOLID_LAYERS = CollisionLayer.Enemy | CollisionLayer.Obstacle;

let activeSim: GameSim | null = null;
let playerIndex = 0;
let playerX = 0;
let playerY = 0;
let playerRadius = 0;
let playerMass = 1;

export function stepContacts(sim: GameSim): void {
  if (sim.playerInvulnerableTicks > 0) {
    sim.tickPlayerInvulnerability();
  }

  const index = sim.playerIndex;
  activeSim = sim;
  playerIndex = index;
  playerX = sim.positionX(index);
  playerY = sim.positionY(index);
  playerRadius = sim.body.data[index * 2] ?? 0;
  playerMass = Math.max(0.01, sim.body.data[index * 2 + 1] ?? 1);

  sim.broadphase.query(playerX, playerY, playerRadius, resolveAgainstPlayer);

  activeSim = null;
}

function resolveAgainstPlayer(other: number): void {
  const sim = activeSim;
  if (sim === null || other === playerIndex) {
    return;
  }
  const layer = sim.collision.data[other * 2] ?? 0;
  if ((layer & SOLID_LAYERS) === 0) {
    return;
  }

  const body = sim.body.data;
  const otherRadius = body[other * 2] ?? 0;
  const otherX = sim.positionX(other);
  const otherY = sim.positionY(other);
  if (!circlesOverlap(playerX, playerY, playerRadius, otherX, otherY, otherRadius)) {
    return;
  }

  const reach = playerRadius + otherRadius;
  let awayX = playerX - otherX;
  let awayY = playerY - otherY;
  const distance = vectorLength(awayX, awayY);
  if (distance === 0) {
    // Exactly concentric, which happens when something spawns on top of the
    // player. Any direction will do; a fixed one keeps this deterministic.
    awayX = 1;
    awayY = 0;
  } else {
    awayX /= distance;
    awayY /= distance;
  }
  const overlap = reach - distance;

  // Split by mass: the lighter body gives way. A body with no mass to speak of
  // is shoved aside entirely, and one much heavier than the player moves the
  // player instead of moving.
  const otherMass = Math.max(0.01, body[other * 2 + 1] ?? 1);
  const playerShare = otherMass / (playerMass + otherMass);

  movePlayerClear(sim, awayX * overlap * playerShare, awayY * overlap * playerShare);
  slowPlayerInto(sim, awayX, awayY, playerShare);

  // The other body is displaced through its push channel rather than by writing
  // its position, so it slides out of the way over a few ticks and walls still
  // stop it. Shoving something into a wall must not push it through one.
  const otherShare = overlap * (1 - playerShare);
  addPush(sim, other, -awayX * otherShare, -awayY * otherShare);

  const damage = sim.contactDamage.data[other] ?? 0;
  if (damage > 0 && sim.playerInvulnerableTicks === 0) {
    // The normal points back at whatever was touched, matching the convention
    // every other impact event uses: away from the thing that caused it.
    sim.events.push(EventKind.Contact, playerIndex, other, playerX, playerY, awayX, awayY, damage);
  }
}

/**
 * Takes the player's speed *into* a body away from them.
 *
 * Only the inward part, and only the share the masses say. Motion along the
 * body — sliding around it — is left alone, so a crowd is something to be
 * worked through rather than a surface that grabs. Applied to velocity rather
 * than position because velocity is what carries into the next tick: correcting
 * the overlap alone lets a player walk into a wall of enemies at full speed and
 * shuffle the whole wall backwards.
 */
function slowPlayerInto(sim: GameSim, awayX: number, awayY: number, share: number): void {
  const drag = sim.tuning.movement.contactDrag;
  if (drag <= 0) {
    return;
  }
  const velocity = sim.velocity.data;
  const base = playerIndex * 2;
  const velocityX = velocity[base] ?? 0;
  const velocityY = velocity[base + 1] ?? 0;

  // Negative when the player is heading into whatever they touched. Heading
  // away is somebody leaving, and leaving is never resisted.
  const inward = velocityX * awayX + velocityY * awayY;
  if (inward >= 0) {
    return;
  }

  const bleed = inward * Math.min(1, share * drag);
  velocity[base] = velocityX - awayX * bleed;
  velocity[base + 1] = velocityY - awayY * bleed;
}

/**
 * Moves the player out of an overlap without moving them into a wall.
 *
 * Written straight into the transform rather than through the push channel: an
 * overlap is a state that should not exist, and correcting it over several
 * ticks is several ticks of standing inside an enemy.
 */
function movePlayerClear(sim: GameSim, deltaX: number, deltaY: number): void {
  const transform = sim.transform.data;
  const base = playerIndex * 4;
  const wantedX = playerX + deltaX;
  const wantedY = playerY + deltaY;

  if (sim.room.isClear(wantedX, wantedY, playerRadius)) {
    transform[base] = wantedX;
    transform[base + 1] = wantedY;
    playerX = wantedX;
    playerY = wantedY;
    return;
  }
  // Cornered. Take whichever single axis is still free rather than refusing to
  // move at all, which is what leaves a player wedged between a wall and
  // something walking into them.
  if (sim.room.isClear(wantedX, playerY, playerRadius)) {
    transform[base] = wantedX;
    playerX = wantedX;
    return;
  }
  if (sim.room.isClear(playerX, wantedY, playerRadius)) {
    transform[base + 1] = wantedY;
    playerY = wantedY;
  }
}

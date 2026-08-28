import type { GameSim } from '../../sim/game/sim.js';
import { ENEMY_MOTION_STRIDE, enemyTelegraphProgress } from '../../sim/systems/enemy.js';
import { AnimationState, type AnimationStateIndex } from './definition.js';

/**
 * Which animation state a body is in, derived from simulation state.
 *
 * Pure, in the sense the acceptance criterion on #150 asks for: it reads the
 * simulation and nothing else — no render-side memory, no wall clock, no
 * previous return value — so the same seed and the same input log produce the
 * same sequence of states at the same ticks, at any framerate, on any machine.
 * `render/animation/animator.ts` is where the *timing* lives, and timing is the
 * only thing about animation that a display's refresh rate is allowed to
 * change.
 *
 * `death` is deliberately not resolvable here. A dead enemy is not a body with
 * a flag on it — `World.destroy` frees the slot the tick it dies, and the
 * corpse the death clip plays on is a render-side object the animator owns
 * (see its corpse table). By the time anything could ask this function about a
 * dead entity, the entity is gone.
 */

/**
 * Movement below this many pixels per tick reads as standing still.
 *
 * Measured against what the simulation actually produces rather than picked:
 * the slowest thing in the roster moves an order of magnitude faster than
 * this, and separation push-apart (`sim/systems/collision.ts` nudging two
 * enemies out of each other) produces exactly the sub-pixel drift that would
 * otherwise flip a standing enemy into its walk cycle and back every few
 * frames.
 */
const MOVE_EPSILON_PX = 0.02;

/** Below this, a heading is not pointing anywhere in particular. */
const FACING_EPSILON = 0.001;

/**
 * Characters are authored facing **left**.
 *
 * Not an arbitrary pick: every character sprite in the game already is —
 * Kellerassel's antennae, Kuh's snout, Bierratte's head all sit at the left
 * edge of their strips. So `facing === -1` draws the art as authored and
 * `facing === 1` mirrors it, and no existing sprite had to be redrawn to
 * establish the convention.
 */
export const AUTHORED_FACING = -1;

/**
 * @hot — one call per animated body per frame, from `render/entities.ts`.
 */
export function resolveAnimationState(sim: GameSim, index: number): AnimationStateIndex {
  // A hit reads before anything else it interrupts. `flash` is the one-tick
  // white pop and `hitStun` the longer stagger the body cannot act through
  // (`GameSim.hitStun`); either one means "this body was just hit", and the
  // flinch pose is what makes a hit land visually even when the health bar is
  // off screen.
  if ((sim.flash.data[index] ?? 0) > 0 || (sim.hitStun.data[index] ?? 0) > 0) {
    return AnimationState.Hurt;
  }
  // The wind-up the telegraph ring is already drawn for. Sharing one source
  // means the pose and the ring can never disagree about how long the player
  // has to dodge.
  if (enemyTelegraphProgress(sim, index) > 0) {
    return AnimationState.Telegraph;
  }
  const dx = sim.positionX(index) - sim.previousX(index);
  const dy = sim.positionY(index) - sim.previousY(index);
  if (Math.abs(dx) > MOVE_EPSILON_PX || Math.abs(dy) > MOVE_EPSILON_PX) {
    return AnimationState.Move;
  }
  return AnimationState.Idle;
}

/**
 * Which way a body is facing: `-1` left, `1` right, or `0` for "no opinion,
 * keep whatever it was facing".
 *
 * Two sources, in order. The tick's own movement first, because that is what
 * the player sees. The enemy's stored heading second — `enemyMotion`'s heading
 * is simulation state that persists between ticks, so a body held still by
 * hit-stun or standing in its telegraph still faces the player rather than
 * snapping to a default. Only when both are silent does this return `0` and
 * let the caller hold the last value.
 *
 * That hold is the one piece of animator state that is not a function of the
 * current tick alone, and it is deliberately framerate-independent: it only
 * ever takes a value derived from the simulation, so rendering more often
 * cannot change what it holds — only how often it is sampled.
 *
 * @hot — one call per animated body per frame.
 */
export function resolveFacing(sim: GameSim, index: number): number {
  const dx = sim.positionX(index) - sim.previousX(index);
  if (Math.abs(dx) > MOVE_EPSILON_PX) {
    return dx < 0 ? -1 : 1;
  }
  const headingX = sim.enemyMotion.data[index * ENEMY_MOTION_STRIDE] ?? 0;
  if (Math.abs(headingX) > FACING_EPSILON) {
    return headingX < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * How long after a hit Alois holds the flinch pose.
 *
 * Matched to the `hurt` clip's own 150 ms rather than to an invulnerability
 * window: the window is a different length depending on what hit him
 * (`ImpactTuning`'s contact and projectile values, 60 and 40 ticks today), and
 * a flinch that lasts as long as the i-frames is a player who spends a second
 * of every hit unable to see their own walk cycle. Nine ticks at 60 Hz is
 * 150 ms — the clip plays once, hands back to idle, and the state stops asking
 * for it at about the same moment.
 */
const HURT_TICKS = 9;

/**
 * Which of the four body directions Alois's art is authored in. `Side` is
 * authored facing left (`AUTHORED_FACING`) and mirrored for the other way,
 * which is why there are three and not four.
 */
export const PlayerFacing = {
  South: 0,
  North: 1,
  Side: 2,
} as const;

export type PlayerFacingIndex = (typeof PlayerFacing)[keyof typeof PlayerFacing];

/** `PlayerFacing` as the suffix its strip is authored under — `alois-south.strip.png`. */
export const PLAYER_FACING_IDS = ['south', 'north', 'side'] as const;

export type PlayerFacingId = (typeof PLAYER_FACING_IDS)[number];

/**
 * Which animation state Alois is in, derived from simulation state.
 *
 * The enemy version of this (`resolveAnimationState`) deliberately cannot
 * resolve `death`, because `World.destroy` frees a dead enemy's slot on the
 * tick it dies and there is no entity left to ask. The player is the exact
 * opposite case and for a documented reason — `systems/impact.ts` never
 * removes the player from the world, "death is `sim.playerDead` becoming
 * true, not the entity going away" — so the player is the one body whose
 * death clip plays on the body itself rather than on a render-side corpse.
 *
 * @hot — one call per frame.
 */
export function resolvePlayerAnimationState(sim: GameSim): AnimationStateIndex {
  if (sim.playerDead) {
    return AnimationState.Death;
  }
  // Umgfalln (#17) is a knockdown, not a hit: nothing damaged him, so there is
  // no hurt stamp to read. It still has to read as "not in control", and the
  // flinch is the pose the fixed state list has for that — see
  // `docs/DECISIONS.md` #38 on why the player does not get a state of its own.
  if (sim.umgfallnTicks > 0) {
    return AnimationState.Hurt;
  }
  const hurtTick = sim.playerHurtTick;
  if (hurtTick >= 0 && sim.tick - hurtTick < HURT_TICKS) {
    return AnimationState.Hurt;
  }
  const index = sim.playerIndex;
  const dx = sim.positionX(index) - sim.previousX(index);
  const dy = sim.positionY(index) - sim.previousY(index);
  if (Math.abs(dx) > MOVE_EPSILON_PX || Math.abs(dy) > MOVE_EPSILON_PX) {
    return AnimationState.Move;
  }
  return AnimationState.Idle;
}

/** Where `resolvePlayerHeading` writes its answer. */
export interface PlayerHeading {
  facing: PlayerFacingIndex;
  /** The x-scale to draw at: `1` is the sprite as authored, `-1` is mirrored. */
  mirror: number;
}

/**
 * Which body direction to draw, and whether to mirror it: movement first, aim
 * second, and `false` for "no opinion, keep what you were facing".
 *
 * Written into `out` rather than returned as a fresh object, and the reason is
 * the `@hot` marker below rather than taste: this runs once per rendered
 * frame forever, and a two-field object sixty times a second is exactly the
 * periodic GC spike `docs/TECH_STACK.md` budgets against. `EntityAnimator`
 * makes the same trade by returning a bare `-1`/`0`/`1` from `resolveFacing`;
 * Alois needs two numbers rather than one, so he gets an out-parameter instead
 * of a packed integer nobody could read.
 *
 * Movement first because that is the question the player is asking of their
 * own sprite while they are moving — where am I going. Aim only decides the
 * body when he is standing still, which is the case where movement has nothing
 * to say and an idle body facing away from what it is shooting looks broken.
 * Where he is *aiming* while moving is carried by the Schlauch overlay
 * (`render/player-view.ts`), not by the body, which is the whole reason a
 * four-way body is enough for a twin-stick game (`docs/DECISIONS.md` #38).
 *
 * Horizontal wins a tie: a diagonal drawn as a side view keeps the face and
 * the Zapfanlage in frame, where drawing it as a back view hides both.
 *
 * @hot — one call per frame.
 */
export function resolvePlayerHeading(sim: GameSim, out: PlayerHeading): boolean {
  const index = sim.playerIndex;
  let dx = sim.positionX(index) - sim.previousX(index);
  let dy = sim.positionY(index) - sim.previousY(index);
  if (Math.abs(dx) <= MOVE_EPSILON_PX && Math.abs(dy) <= MOVE_EPSILON_PX) {
    dx = sim.aimDirectionX;
    dy = sim.aimDirectionY;
  }
  if (Math.abs(dx) < FACING_EPSILON && Math.abs(dy) < FACING_EPSILON) {
    return false;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    out.facing = PlayerFacing.Side;
    // The side strip is authored facing left (`AUTHORED_FACING`), so walking
    // left draws it as it was drawn and walking right flips it.
    out.mirror = dx < 0 ? 1 : -1;
    return true;
  }
  out.facing = dy > 0 ? PlayerFacing.South : PlayerFacing.North;
  out.mirror = 1;
  return true;
}

/**
 * Which of the Schlauch's eight authored octants points closest to `(x, y)`.
 *
 * Eight rather than four for the nozzle even though the body is four-way:
 * the nozzle is one small sprite with no walk cycle behind it, so the eight
 * directions cost eight frames rather than eight of everything, and aim is
 * the reading the player actually needs to be precise.
 */
export function schlauchOctant(x: number, y: number): number {
  const angle = Math.atan2(y, x);
  const octant = Math.round((angle / (Math.PI * 2)) * 8);
  return ((octant % 8) + 8) % 8;
}

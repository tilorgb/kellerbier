import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { PromilleTier } from '../sim/game/promille.js';
import { lerp } from '../sim/math.js';
import {
  AnimationState,
  ClipStateResolver,
  clipFrameAt,
  clipHasEnded,
  type AnimationStateIndex,
  type CompiledAnimationSet,
} from './animation/definition.js';
import { MAX_FRAME_DELTA_MS } from './animation/animator.js';
import {
  PLAYER_FACING_IDS,
  PlayerFacing,
  resolvePlayerAnimationState,
  resolvePlayerHeading,
  schlauchOctant,
  type PlayerFacingIndex,
  type PlayerHeading,
} from './animation/state.js';
import { SCHLAUCH_OCTANTS, type PlayerArt, type PlayerBodyKey } from './player-art.js';
import { ACTOR_SPRITE_SCALE } from './resolution.js';

/**
 * Where the Schlauch's nozzle hangs off the body, per facing, in *authored*
 * pixels from the sprite's centre.
 *
 * Read off the art rather than guessed: the Zapfanlage's tank sits on Alois's
 * left hip, which is screen-right when he faces the camera, screen-left when
 * he faces away, and on the near flank side-on. The x figure is mirrored along
 * with the body, so the hose stays on the tank when he turns around.
 */
const SCHLAUCH_ANCHOR: Readonly<Record<PlayerFacingIndex, { x: number; y: number }>> = {
  [PlayerFacing.South]: { x: 4, y: 1 },
  [PlayerFacing.North]: { x: -4, y: 1 },
  [PlayerFacing.Side]: { x: 2, y: 2 },
};

/**
 * Ticks the nozzle holds its firing frame after a shot.
 *
 * Six at 60 Hz is 100 ms, which is under the fastest fire delay the stat
 * pipeline will produce (`Schluckfrequenz` floors at one tick, but Promille's
 * best realistic rate is nearer eight): a stream reads as a *stream* — nozzle
 * lit the whole time — while a tap reads as one flare. Longer and a single
 * shot looks like a held trigger; shorter and a burst strobes.
 */
const FIRING_TICKS = 6;

/** Ticks of that window the nozzle is also kicked back along its own aim. */
const RECOIL_TICKS = 3;

/** How far back, in authored pixels. One. It is a 16px character. */
const RECOIL_PIXELS = 1;

/**
 * How far along the aim the nozzle sits, past the hip it is anchored to.
 *
 * Three authored pixels, which is what it takes to clear the torso. Without
 * it the hose is drawn from the hip *through* the body whenever he aims across
 * himself, and at 1x that reads as a grey band across his middle rather than
 * as a hose pointing somewhere.
 */
const SCHLAUCH_REACH = 3;

/**
 * From this tier up, Alois is drawn drunk.
 *
 * Beduselt rather than a number of the renderer's own choosing: it is exactly
 * where `promilleDriftScale` and `promilleWobbleAmplitude` start ramping, so
 * he begins *looking* unsteady on the same tier he begins *being* unsteady.
 *
 * Deliberately keyed off the tier and not off `sim.promilleDriftScale` — that
 * one is already multiplied by the no-drift accessibility toggle
 * (`GameSim.driftScale`), so reading it here would quietly make no-drift mode
 * sober Alois up. #151's acceptance criterion is the opposite: reduced-motion
 * and no-sway get "an Alois who is still readable and still drunk", which is
 * why the drunk read lives in authored *poses* — a lean, a wider stance,
 * half-lidded eyes, a flushed cheek — rather than in any motion this view
 * adds on top.
 */
const DRUNK_FROM_TIER = PromilleTier.Beduselt;

/**
 * Alois: body, and the Schlauch he shoots through (#151).
 *
 * Two sprites, not one, because a twin-stick game's whole proposition is that
 * where you are going and where you are shooting are two decisions. The body
 * is drawn in the direction he is *moving* — four ways, mirrored to three
 * strips — and the hose in the direction he is *aiming*, eight ways. Baking
 * the two together would be 32 versions of every walk frame; keeping them
 * apart is 8 extra frames total, and it is what makes "aim readable while
 * walking the other way" fall out for free rather than needing to be drawn.
 *
 * The clip machinery is #150's, unchanged: the same compiled sets, the same
 * `clipFrameAt`, the same #19 idle fallback. What this does *not* reuse is
 * `EntityAnimator` — that is a table keyed by entity slot with a corpse pool
 * hanging off it, and Alois is one body that never becomes a corpse (the sim
 * keeps his entity alive through death on purpose) and that changes clip set
 * whenever he turns a corner. Preserving clip phase across a set swap is the
 * thing the animator deliberately does *not* do — a recycled slot must not
 * inherit a stride — and is exactly what a body turning mid-walk needs.
 */
export class PlayerView {
  readonly container = new Container();

  private readonly art: PlayerArt;
  private readonly body: Sprite;
  private readonly schlauch: Sprite;
  private readonly clipStates = new ClipStateResolver();

  /** Authored pixels per world unit — the body's own scale, shared by the hose. */
  private readonly pixelScale: number;

  private facing: PlayerFacingIndex = PlayerFacing.South;
  private mirror = 1;
  /** Reused, because `sync` runs every frame and must not allocate. */
  private readonly heading: PlayerHeading = { facing: PlayerFacing.South, mirror: 1 };
  private requested: AnimationStateIndex = AnimationState.Idle;
  private playing: AnimationStateIndex = AnimationState.Idle;
  private elapsedMs = 0;
  private lastNowMs: number | null = null;
  private schlauchBehind = false;

  constructor(art: PlayerArt) {
    this.art = art;
    this.body = new Sprite(art.body.south.frames[0]);
    this.body.anchor.set(0.5, 0.5);
    // Drawn on the actor grid, exactly like `EntityView` draws every enemy
    // body: one authored pixel per internal pixel (`render/resolution.ts`'s
    // `ACTOR_SPRITE_SCALE`, `docs/DECISIONS.md` #42). Authoring at a higher
    // resolution for more detail (#26, #27) must not, by itself, change how
    // big Alois reads in the room — and it no longer can, because size is the
    // authored canvas rather than something inferred from it.
    //
    // This used to be `PLAYER_RADIUS / (texture.height / 2)`, which at 28
    // authored pixels against a radius of 7 happens to come out at the same
    // 0.5: Alois is the one body in the game already drawn on the grid, which
    // is why he is the reference the rest of the roster is being brought to
    // rather than the thing being changed. Worth stating plainly, because the
    // comment this replaces got it wrong: an Alois pixel is *half* the size of
    // a floor tile's, not the same. A 16px tile covers 16 world units, so it
    // is drawn two internal pixels per authored pixel (`TILE_SPRITE_SCALE`);
    // he is drawn at one. Foreground carries twice the detail of the
    // background, deliberately.
    this.pixelScale = ACTOR_SPRITE_SCALE;
    this.body.scale.set(this.pixelScale);
    // The hose takes the *body's* scale rather than one of its own — two
    // sprites sharing one character need one pixel size, or the nozzle renders
    // at a different resolution than the hand holding it.
    this.schlauch = new Sprite(art.schlauch.frames[0]);
    this.schlauch.anchor.set(0.5, 0.5);
    this.schlauch.scale.set(this.pixelScale);
    this.container.addChild(this.body, this.schlauch);
  }

  /** Where Alois is drawn, for anything that needs to point at him on screen. */
  screenPosition(): { readonly x: number; readonly y: number } {
    const point = this.container.getGlobalPosition();
    return { x: point.x, y: point.y };
  }

  /** The clip currently playing, for the debug overlay. */
  get playingState(): AnimationStateIndex {
    return this.playing;
  }

  /** The body strip currently drawn, for the debug overlay. */
  get bodyKey(): PlayerBodyKey {
    return this.keyFor(this.facing, this.drunk);
  }

  /** The strip frame currently drawn, for the debug overlay. */
  frame = 0;

  /** The Schlauch frame currently drawn, for the debug overlay. */
  schlauchFrame = 0;

  private drunk = false;

  /**
   * @hot — once per rendered frame.
   */
  sync(sim: GameSim, alpha: number, nowMs: number): void {
    const deltaMs =
      this.lastNowMs === null
        ? 0
        : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, nowMs - this.lastNowMs));
    this.lastNowMs = nowMs;

    const index = sim.playerIndex;
    const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
    const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
    this.container.position.set(x, y);

    if (resolvePlayerHeading(sim, this.heading)) {
      this.facing = this.heading.facing;
      this.mirror = this.heading.mirror;
    }
    const state = resolvePlayerAnimationState(sim);
    // A flinch is a flinch and a death is a death, drunk or not: those two
    // clips are authored on the sober strips only, so being hit sobers the
    // *art* up for as long as the clip runs. That is not a compromise — the
    // alternative was six more poses that differ from the sober ones by a
    // lean nobody reads through a hit flash — but it does have to be decided
    // here rather than left to the #19 idle fallback, which would silently
    // turn every drunk death into a drunk idle.
    this.drunk =
      sim.promilleTier >= DRUNK_FROM_TIER &&
      state !== AnimationState.Hurt &&
      state !== AnimationState.Death;

    const set = this.art.body[this.keyFor(this.facing, this.drunk)].clips;
    this.advance(set, state, deltaMs);

    const clip = set.clips[this.playing] ?? set.idle;
    this.frame = clipFrameAt(clip, this.elapsedMs);
    const frames = this.art.body[this.keyFor(this.facing, this.drunk)].frames;
    this.body.texture = frames[this.frame] ?? this.body.texture;
    this.body.scale.set(this.pixelScale * this.mirror, this.pixelScale);

    this.syncSchlauch(sim);
  }

  private keyFor(facing: PlayerFacingIndex, drunk: boolean): PlayerBodyKey {
    const id = PLAYER_FACING_IDS[facing];
    return drunk ? `drunk-${id}` : id;
  }

  /**
   * Advances the clip clock.
   *
   * `elapsedMs` survives a set swap on purpose. Turning a corner, or crossing
   * the Beduselt line mid-stride, swaps which strip is drawn but not what the
   * body is *doing*; restarting the walk from its contact frame every time he
   * turns is a visible stutter on every corner in the game. The clip lists are
   * authored to the same shape across all six body strips precisely so the
   * phase can carry.
   */
  private advance(set: CompiledAnimationSet, state: AnimationStateIndex, deltaMs: number): void {
    if (this.requested !== state) {
      this.requested = state;
      this.playing = this.clipStates.resolve(set, state);
      this.elapsedMs = 0;
    } else {
      this.elapsedMs += deltaMs;
      // The set may have changed under a state that did not. Re-resolve, in
      // case the new strip authors a clip the old one did not (the drunk
      // strips deliberately author only `idle` and `move`).
      this.playing = this.clipStates.resolve(set, this.playing);
    }
    const clip = set.clips[this.playing] ?? set.idle;
    if (!clip.holds && clipHasEnded(clip, this.elapsedMs)) {
      this.elapsedMs -= clip.totalMs;
      this.playing = AnimationState.Idle;
    }
  }

  private syncSchlauch(sim: GameSim): void {
    const aimX = sim.aimDirectionX;
    const aimY = sim.aimDirectionY;
    const sinceShot = sim.lastShotTick < 0 ? Number.POSITIVE_INFINITY : sim.tick - sim.lastShotTick;
    const firing = sinceShot < FIRING_TICKS;
    const octant = schlauchOctant(aimX, aimY);
    this.schlauchFrame = firing ? SCHLAUCH_OCTANTS + octant : octant;
    this.schlauch.texture = this.art.schlauch.frames[this.schlauchFrame] ?? this.schlauch.texture;

    // Dead men do not hold the hose up. The body's death clip folds him onto
    // the floor and the nozzle has nowhere sensible to be, so it goes away —
    // the one piece of Alois that is not drawn on the game-over beat.
    this.schlauch.visible = !sim.playerDead;

    const anchor = SCHLAUCH_ANCHOR[this.facing];
    const reach = SCHLAUCH_REACH - (sinceShot < RECOIL_TICKS ? RECOIL_PIXELS : 0);
    this.schlauch.position.set(
      (anchor.x * this.mirror + aimX * reach) * this.pixelScale,
      (anchor.y + aimY * reach) * this.pixelScale,
    );

    // Aiming away from the camera puts the hose behind him. Reordered only on
    // the frame it actually changes: a `Container` re-sort every frame is a
    // cost paid sixty times a second for a thing that changes when the player
    // sweeps the stick through the horizontal.
    const behind = aimY < 0;
    if (behind !== this.schlauchBehind) {
      this.schlauchBehind = behind;
      this.container.setChildIndex(this.schlauch, behind ? 0 : this.container.children.length - 1);
    }
  }

  /** Frees the GPU-side objects this view owns. */
  destroy(): void {
    this.container.destroy({ children: true });
  }

  /** The texture the body is currently drawing, for tests. */
  get bodyTexture(): Texture {
    return this.body.texture;
  }
}

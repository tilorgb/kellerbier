import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { ENTITY_PALETTE } from './palette.js';
import { tileGridScale } from './room.js';

/**
 * Draws every pedestal in the current room (#28): a light beam and a
 * bobbing item icon, one pair per entry in `GameSim.activePedestals` that
 * still holds an item.
 *
 * Not built on `EntityView`'s collidable-body iteration — a pedestal has no
 * collider (`sim/game/sim.ts`'s `PedestalRuntime` doc comment) — but it
 * follows the same sprite-pool idiom: sprites are handed out in draw order,
 * created on demand, and hidden rather than destroyed when the room has
 * fewer pedestals than the pool has slots.
 */
export class PedestalView {
  readonly container = new Container();

  private readonly sim: GameSim;
  private readonly itemTexture: Texture;
  private readonly beamTexture: Texture;
  /**
   * The plinth the item floats over (#152).
   *
   * A pedestal used to be a beam and a disc hanging in mid-air — the beam
   * read as light coming from nothing. `undefined` keeps that behaviour for
   * anywhere the sprite has not been loaded (tests, the bench scene).
   */
  private readonly plinthTexture: Texture | undefined;
  private readonly beams: Sprite[] = [];
  private readonly items: Sprite[] = [];
  private readonly plinths: Sprite[] = [];

  /** The plinth sits under the beam, which sits under the item: light comes off the stone, not through it. */
  private readonly plinthLayer = new Container();
  private readonly beamLayer = new Container();
  private readonly itemLayer = new Container();
  /**
   * `activePedestals` index -> sprite slot, or -1 for an empty pedestal that
   * drew nothing. Sprite slots are handed out densely (skipping empty
   * pedestals), so this indirection is what keeps `screenPositionFor` correct
   * when an earlier pedestal in the same room has already been emptied —
   * without it, index `k` into `activePedestals` and slot `k` into `items`
   * would silently drift apart the moment any pedestal before it is empty.
   */
  private readonly slotForPedestal: number[] = [];

  constructor(sim: GameSim, itemTexture: Texture, beamTexture: Texture, plinthTexture?: Texture) {
    this.sim = sim;
    this.itemTexture = itemTexture;
    this.beamTexture = beamTexture;
    this.plinthTexture = plinthTexture;
    this.container.addChild(this.plinthLayer);
    this.container.addChild(this.beamLayer);
    this.container.addChild(this.itemLayer);
  }

  sync(): void {
    const sim = this.sim;
    const tuning = sim.tuning.itemPool;
    const pedestals = sim.activePedestals;

    let used = 0;
    this.slotForPedestal.length = pedestals.length;
    for (const [index, pedestal] of pedestals.entries()) {
      if (pedestal.itemIndex < 0) {
        this.slotForPedestal[index] = -1;
        continue;
      }
      const item = sim.items.at(pedestal.itemIndex);
      const tint = ENTITY_PALETTE.itemQualityTints[item.quality];

      const beam = this.beamAt(used);
      const itemSprite = this.itemAt(used);
      this.slotForPedestal[index] = used;
      used += 1;

      beam.visible = true;
      beam.tint = tint;
      beam.position.set(pedestal.x, pedestal.y);

      // The plinth is untinted: the item's quality colour belongs to the item
      // and the light it throws, not to the stone it is standing on.
      const plinth = this.plinthAt(used - 1);
      if (plinth !== null) {
        plinth.visible = true;
        plinth.position.set(pedestal.x, pedestal.y);
      }

      const period = Math.max(1, tuning.bobPeriodTicks);
      // A phase offset per pedestal (from its own position) so two pedestals
      // in the same room don't bob in visible lockstep.
      const phase = ((pedestal.x + pedestal.y) / period) * Math.PI * 2;
      const bob = Math.sin((sim.tick / period) * Math.PI * 2 + phase) * tuning.bobAmplitude;

      itemSprite.visible = true;
      itemSprite.tint = tint;
      itemSprite.position.set(pedestal.x, pedestal.y - BEAM_HEIGHT * 0.6 + bob);
    }

    for (let slot = used; slot < this.beams.length; slot++) {
      const beam = this.beams[slot];
      if (beam !== undefined) {
        beam.visible = false;
      }
    }
    for (let slot = used; slot < this.items.length; slot++) {
      const itemSprite = this.items[slot];
      if (itemSprite !== undefined) {
        itemSprite.visible = false;
      }
    }
    for (let slot = used; slot < this.plinths.length; slot++) {
      const plinth = this.plinths[slot];
      if (plinth !== undefined) {
        plinth.visible = false;
      }
    }
  }

  /** `null` when no plinth sprite was loaded — the beam-and-disc behaviour from before #152. */
  private plinthAt(slot: number): Sprite | null {
    const texture = this.plinthTexture;
    if (texture === undefined) {
      return null;
    }
    const existing = this.plinths[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(texture);
    // The plinth is tile-category art like every other piece of room
    // furniture (`docs/DECISIONS.md` #48/#182) — `tileGridScale` keeps it
    // the same on-screen size whether it was authored at 16 or 32.
    created.scale.set(tileGridScale(texture));
    created.anchor.set(0.5, 0.5);
    this.plinths.push(created);
    this.plinthLayer.addChild(created);
    return created;
  }

  /**
   * The screen-space (global-stage) position of pedestal `pedestalIndex`'s
   * item icon, or `null` if it currently has no visible sprite (empty or out
   * of range). Read by `app/main.ts` after `sync` to anchor the approach
   * name plate — `Container.toGlobal` walks the same ancestor chain
   * `GameView.playerScreenPosition` already relies on, so this stays correct
   * through shake, sway and the camera-follow offset for free.
   */
  screenPositionFor(pedestalIndex: number): { readonly x: number; readonly y: number } | null {
    const slot = this.slotForPedestal[pedestalIndex];
    if (slot === undefined || slot < 0) {
      return null;
    }
    const sprite = this.items[slot];
    if (!sprite?.visible) {
      return null;
    }
    const point = sprite.getGlobalPosition();
    return { x: point.x, y: point.y };
  }

  private beamAt(slot: number): Sprite {
    const existing = this.beams[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.beamTexture);
    created.anchor.set(0.5, 1);
    created.width = BEAM_WIDTH;
    created.height = BEAM_HEIGHT;
    created.alpha = 0.3;
    this.beams.push(created);
    this.beamLayer.addChild(created);
    return created;
  }

  private itemAt(slot: number): Sprite {
    const existing = this.items[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.itemTexture);
    created.anchor.set(0.5);
    this.items.push(created);
    this.itemLayer.addChild(created);
    return created;
  }
}

/** Beam sprite size, in room pixels — tall and narrow, the pedestal's own footprint rather than the room's. */
const BEAM_WIDTH = 10;
const BEAM_HEIGHT = 26;

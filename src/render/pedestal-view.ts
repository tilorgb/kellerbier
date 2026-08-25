import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';

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
  private readonly beams: Sprite[] = [];
  private readonly items: Sprite[] = [];

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

  constructor(sim: GameSim, itemTexture: Texture, beamTexture: Texture) {
    this.sim = sim;
    this.itemTexture = itemTexture;
    this.beamTexture = beamTexture;
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
      const tint = QUALITY_TINT[item.quality];

      const beam = this.beamAt(used);
      const itemSprite = this.itemAt(used);
      this.slotForPedestal[index] = used;
      used += 1;

      beam.visible = true;
      beam.tint = tint;
      beam.position.set(pedestal.x, pedestal.y);

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

/**
 * Quality 0-3 tint, Isaac's own quality-colour convention loosely followed:
 * plain, then warmer, then a real "this one matters" gold. Placeholder art
 * (#34) — the whole point is a run can already tell an item's tier apart at
 * a glance before real sprites exist.
 */
const QUALITY_TINT = [0xd8d0c0, 0x7fd0e8, 0xb98af0, 0xf2c94c] as const;

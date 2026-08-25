import { Container, Graphics } from 'pixi.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { BLOCK_STRIDE } from '../sim/room/geometry.js';
import type { GameView } from '../render/view.js';
import { DrawCallCounter } from './draw-calls.js';
import { FrameMetrics } from './metrics.js';
import { type DebugContext, type DebugPanel, PANEL_WIDTH } from './panel.js';
import { CountsPanel } from './panels/counts.js';
import { FrameGraphPanel } from './panels/frame-graph.js';
import { PickupsPanel } from './panels/pickups.js';
import { RunInfoPanel } from './panels/run-info.js';
import { StatsPanel } from './panels/stats.js';

/** Collider outline colours, by layer. */
const LAYER_COLOURS: readonly (readonly [number, number])[] = [
  [CollisionLayer.Player, 0x6fd3f2],
  [CollisionLayer.Enemy, 0xf2566f],
  [CollisionLayer.PlayerProjectile, 0xf0c46a],
  [CollisionLayer.EnemyProjectile, 0xc06ff2],
  [CollisionLayer.Pickup, 0x8ef26f],
  [CollisionLayer.Obstacle, 0xf29b6f],
];

const PANEL_GAP = 6;
const PANEL_MARGIN = 8;

/**
 * The tool we will look at more than any other.
 *
 * Hidden by default, toggled with F1, and compiled out of a production build
 * entirely — the module is behind a dynamic import that only a dev build ever
 * reaches, so none of this reaches a player's download.
 *
 * When hidden it costs one boolean check per frame. Panels are only updated,
 * and colliders only drawn, while it is actually on screen.
 */
export class DebugOverlay {
  readonly metrics = new FrameMetrics();
  readonly drawCalls = new DrawCallCounter();

  private readonly sim: GameSim;
  private readonly view: GameView;
  private readonly gameScale: () => number;

  /** Panel plates, pinned to the screen. */
  private readonly panelLayer = new Container();
  /** Colliders and the grid, drawn in room space so they move with the camera. */
  private readonly worldLayer = new Container();

  private readonly hitboxes = new Graphics();
  private readonly grid = new Graphics();

  private readonly panels: DebugPanel[] = [];
  private readonly runInfo = new RunInfoPanel();

  private visible = false;
  private showHitboxes = true;
  private showGrid = false;
  private frame = 0;

  private detachInput: (() => void) | null = null;
  /** DOM-based dev tools (the tuning window, the projectile tag chooser) the overlay tears down alongside itself. */
  private readonly domTools: { destroy(): void }[] = [];

  constructor(sim: GameSim, view: GameView, uiLayer: Container, gameScale: () => number) {
    this.sim = sim;
    this.view = view;
    this.gameScale = gameScale;

    this.worldLayer.addChild(this.grid);
    this.worldLayer.addChild(this.hitboxes);
    view.worldLayer.addChild(this.worldLayer);
    // Panels go to the screen layer, not into the game: they are text, and text
    // made of game pixels is text nobody can read.
    uiLayer.addChild(this.panelLayer);

    this.addPanel(new FrameGraphPanel());
    this.addPanel(new CountsPanel());
    this.addPanel(this.runInfo);
    this.addPanel(new PickupsPanel());
    this.addPanel(new StatsPanel());

    this.setVisible(false);
  }

  /**
   * Adds a panel to the stack.
   *
   * This is the extension point later issues use — the stat inspector (#25,
   * landed) worked this way, and the room warp (#20), item spawner (#29) and
   * Promille slider (#17) are each just a class with a `view` and an
   * `update`, and nothing else has to change.
   */
  addPanel(panel: DebugPanel): void {
    this.panels.push(panel);
    this.panelLayer.addChild(panel.view);
    this.layOutPanels();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.panelLayer.visible = visible;
    this.worldLayer.visible = visible;
    if (!visible) {
      // Leaving stale geometry in the display list would keep it being
      // uploaded; clearing means a hidden overlay draws nothing at all.
      this.hitboxes.clear();
      this.grid.clear();
    }
  }

  /** Records a frame's timings. Called whether or not the overlay is visible. */
  record(simMs: number, renderMs: number, steps: number): void {
    this.metrics.record(simMs, renderMs, steps);
  }

  /**
   * Redraws the overlay. Returns immediately when hidden, which is the whole of
   * "no measurable cost when hidden".
   */
  sync(alpha: number): void {
    if (!this.visible) {
      return;
    }
    this.frame += 1;

    const context: DebugContext = {
      sim: this.sim,
      metrics: this.metrics,
      drawCalls: this.drawCalls,
      alpha,
      frame: this.frame,
    };
    for (const panel of this.panels) {
      panel.update(context);
    }

    this.drawHitboxes();
    this.drawGrid();
  }

  /**
   * Wires the overlay's keys and its free camera.
   *
   * Middle-drag pans and `0` recentres — deliberately not a key the game uses,
   * so opening the overlay never changes what a normal input does.
   */
  attach(target: Window, canvas: HTMLCanvasElement): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'F1':
          event.preventDefault();
          this.setVisible(!this.visible);
          return;
        case 'KeyH':
          if (this.visible) {
            this.showHitboxes = !this.showHitboxes;
          }
          return;
        case 'KeyG':
          if (this.visible) {
            this.showGrid = !this.showGrid;
          }
          return;
        case 'KeyC':
          if (this.visible) {
            void navigator.clipboard.writeText(this.runInfo.copyText);
          }
          return;
        case 'Digit0':
          if (this.visible) {
            this.view.cameraX = 0;
            this.view.cameraY = 0;
          }
          return;
        default:
          return;
      }
    };

    let panning = false;
    let panFromX = 0;
    let panFromY = 0;

    const onPointerDown = (event: MouseEvent): void => {
      if (!this.visible || event.button !== 1) {
        return;
      }
      event.preventDefault();
      panning = true;
      panFromX = event.clientX;
      panFromY = event.clientY;
    };
    const onPointerMove = (event: MouseEvent): void => {
      if (!panning) {
        return;
      }
      // The camera offset lives inside the scaled game, so a drag measured in
      // screen pixels has to be divided by that scale to move the room by the
      // distance the pointer actually travelled.
      const scale = this.gameScale();
      this.view.cameraX += (event.clientX - panFromX) / scale;
      this.view.cameraY += (event.clientY - panFromY) / scale;
      panFromX = event.clientX;
      panFromY = event.clientY;
    };
    const onPointerUp = (): void => {
      panning = false;
    };

    target.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('mousedown', onPointerDown);
    target.addEventListener('mousemove', onPointerMove);
    target.addEventListener('mouseup', onPointerUp);

    this.detachInput = () => {
      target.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('mousedown', onPointerDown);
      target.removeEventListener('mousemove', onPointerMove);
      target.removeEventListener('mouseup', onPointerUp);
    };
  }

  /**
   * Takes ownership of a DOM-based dev tool (the tuning window, the
   * projectile tag chooser) so one `destroy` tears every one of them down
   * along with the overlay itself.
   */
  ownDomTool(tool: { destroy(): void }): void {
    this.domTools.push(tool);
  }

  destroy(): void {
    this.detachInput?.();
    this.detachInput = null;
    for (const tool of this.domTools) {
      tool.destroy();
    }
    this.domTools.length = 0;
    this.drawCalls.detach();
  }

  private layOutPanels(): void {
    let y = PANEL_MARGIN;
    for (const panel of this.panels) {
      panel.view.position.set(PANEL_MARGIN, y);
      y += panel.height + PANEL_GAP;
    }
  }

  /**
   * Every collider, drawn from the same arrays collision reads.
   *
   * That is the point rather than a convenience: a hitbox display drawn from
   * sprite bounds would agree with the sprites and disagree with the damage,
   * which is exactly the bug this is meant to find.
   */
  private drawHitboxes(): void {
    this.hitboxes.clear();
    if (!this.showHitboxes) {
      return;
    }

    const sim = this.sim;
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.collidableMask;

    for (let index = 0; index < world.highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & required) !== required) {
        continue;
      }
      this.hitboxes
        .circle(sim.positionX(index), sim.positionY(index), sim.body.data[index * 2] ?? 0)
        .stroke({ width: 1, color: colourForLayer(sim.collision.data[index * 2] ?? 0) });
    }

    const projectiles = sim.projectiles;
    projectiles.forEachLive((slot) => {
      this.hitboxes
        .circle(projectiles.x[slot] ?? 0, projectiles.y[slot] ?? 0, projectiles.radius[slot] ?? 0)
        .stroke({ width: 1, color: 0xf0c46a, alpha: 0.8 });
    });

    // Room solids, so a wall that stops a shot somewhere unexpected is visible.
    const room = sim.room;
    this.hitboxes
      .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
      .stroke({ width: 1, color: 0x556070, alpha: 0.6 });
    for (let block = 0; block < room.blockCount; block++) {
      const base = block * BLOCK_STRIDE;
      const minX = room.blocks[base] ?? 0;
      const minY = room.blocks[base + 1] ?? 0;
      const maxX = room.blocks[base + 2] ?? 0;
      const maxY = room.blocks[base + 3] ?? 0;
      this.hitboxes
        .rect(minX, minY, maxX - minX, maxY - minY)
        .stroke({ width: 1, color: 0xf29b6f, alpha: 0.6 });
    }
  }

  /** Cell occupancy, shaded. Empty cells are drawn as an outline only. */
  private drawGrid(): void {
    this.grid.clear();
    if (!this.showGrid) {
      return;
    }

    const hash = this.sim.broadphase;
    const size = hash.cellSize;
    for (let row = 0; row < hash.rows; row++) {
      for (let column = 0; column < hash.columns; column++) {
        const occupancy = hash.occupancyAt(column, row);
        if (occupancy === 0) {
          this.grid
            .rect(column * size, row * size, size, size)
            .stroke({ width: 1, color: 0x2e2637, alignment: 0, alpha: 0.5 });
          continue;
        }
        this.grid
          .rect(column * size, row * size, size, size)
          .fill({ color: 0x6fa8dc, alpha: Math.min(0.5, 0.1 + occupancy * 0.08) })
          .stroke({ width: 1, color: 0x6fa8dc, alignment: 0, alpha: 0.5 });
      }
    }
  }
}

function colourForLayer(layer: number): number {
  for (const [bit, colour] of LAYER_COLOURS) {
    if ((layer & bit) !== 0) {
      return colour;
    }
  }
  return 0xffffff;
}

/** Width the panel column occupies, so callers can keep clear of it. */
export const DEBUG_PANEL_COLUMN_WIDTH = PANEL_WIDTH + PANEL_MARGIN * 2;

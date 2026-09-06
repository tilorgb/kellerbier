import { Container } from '../render/gfx/index.js';
import { INTERNAL_HEIGHT, WORLD_ZOOM } from '../render/resolution.js';
import type { GameView } from '../render/view.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { BLOCK_STRIDE } from '../sim/room/geometry.js';
import { DrawCallCounter } from './draw-calls.js';
import { FrameMetrics } from './metrics.js';
import { type DebugContext, type DebugPanel, PANEL_WIDTH } from './panel.js';
import { AnimationPanel } from './panels/animation.js';
import { ArtPipelinePanel } from './panels/art-pipeline.js';
import { CountsPanel } from './panels/counts.js';
import { FrameGraphPanel } from './panels/frame-graph.js';
import { PickupsPanel } from './panels/pickups.js';
import { RunInfoPanel } from './panels/run-info.js';
import { StatsPanel } from './panels/stats.js';
import { WorldLines } from './world-lines.js';

/** Collider outline colours, by layer. */
const LAYER_COLOURS: readonly (readonly [number, number])[] = [
  [CollisionLayer.Player, 0x6fd3f2],
  [CollisionLayer.Enemy, 0xf2566f],
  [CollisionLayer.PlayerProjectile, 0xf0c46a],
  [CollisionLayer.EnemyProjectile, 0xc06ff2],
  [CollisionLayer.Pickup, 0x8ef26f],
  [CollisionLayer.Obstacle, 0xf29b6f],
];

const PANEL_GAP = 4;
const PANEL_MARGIN = 4;
/** The height a column of panels has to fit in: the UI frame's, in UI pixels. */
const PANEL_COLUMN_HEIGHT = INTERNAL_HEIGHT;

/**
 * The tool we will look at more than any other.
 *
 * Hidden by default, toggled with the O key, and compiled out of a
 * production build entirely — the module is behind a dynamic import that
 * only a dev build ever reaches, so none of this reaches a player's download.
 *
 * Not an F-key: a hosted preview typically runs inside another page's
 * `iframe`/webview, where the browser chrome around it treats F1/F2/F3 as its
 * own shortcuts (help, find, …) before a `keydown` handler ever sees them —
 * `preventDefault` on our end is too late to stop that.
 *
 * Not a punctuation key either, for the same reason a second time: `code`
 * identifies a *physical* key, and the physical key at the US Backquote/
 * Minus/Equal positions carries a different — sometimes dead — key on other
 * layouts (a German QWERTZ keyboard puts `^`, `ß` and the dead `´` there).
 * `KeyO`/`KeyT`/`KeyI` (`tuning-window.ts`, `projectile-tag-chooser.ts`) sit
 * on the unshifted letter row instead: the one part of the keyboard QWERTY,
 * QWERTZ and AZERTY all agree on the physical position of, and nothing
 * `src/app/input/bindings.ts` binds a player action to claims any of them.
 *
 * When hidden it costs one boolean check per frame. Panels are only updated,
 * and colliders only drawn, while it is actually on screen.
 */
export class DebugOverlay {
  readonly metrics = new FrameMetrics();
  readonly drawCalls = new DrawCallCounter();

  /**
   * The run currently being watched.
   *
   * Not `readonly`, and that is the whole of the bug this pair used to carry:
   * `app/main.ts`'s `startRun` builds a **new** `GameSim` and a new `GameView`
   * on every restart — the title screen's Start, the `R` key, the seed box —
   * and destroys the old view. The overlay was handed one of each at boot and
   * kept them, so from the first restart onward every panel read a simulation
   * nobody was playing and `drawHitboxes` drew into a scene nobody was
   * rendering. In practice that meant the overlay was broken in every
   * session, since boot's own `startRun` runs before it is even mounted.
   * `setContext` is what keeps it pointed at the live run.
   */
  private sim: GameSim;
  private view: GameView;
  private readonly gameScale: () => number;

  /** Panel plates, pinned to the screen. */
  private readonly panelLayer = new Container();
  /**
   * Colliders and the grid, drawn in room space so they move with the camera.
   *
   * Line geometry in the `GameView`'s three.js scene, rebuilt by `setContext`
   * rather than re-parented: a restart's new view is a new scene, and the old
   * one is destroyed along with everything that hung off it.
   */
  private hitboxes = new WorldLines();
  private grid = new WorldLines();

  private readonly panels: DebugPanel[] = [];
  private readonly runInfo = new RunInfoPanel();
  /** Held because it is the one panel that reads the `GameView` directly, so it has to be re-pointed on a restart. */
  private readonly animationPanel: AnimationPanel;

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

    this.attachWorldLines();
    // Panels go to the UI layer, not into the world: they are text, and text
    // drawn in the room would be text that moves with the camera.
    uiLayer.addChild(this.panelLayer);

    this.animationPanel = new AnimationPanel(view.animator, view.player);
    this.addPanel(new FrameGraphPanel());
    this.addPanel(new CountsPanel());
    this.addPanel(this.runInfo);
    this.addPanel(new PickupsPanel());
    this.addPanel(new StatsPanel());
    this.addPanel(this.animationPanel);
    this.addPanel(new ArtPipelinePanel());

    this.setVisible(false);
  }

  /**
   * The tuning of the run being played — what the DOM tools (`tuning-window`,
   * `projectile-tag-chooser`) write into. A `GameSim` builds its own
   * `SimTuning`, so a restart replaces this too.
   */
  get tuning(): GameSim['tuning'] {
    return this.sim.tuning;
  }

  /** Builds this run's world-space line displays and hangs them off the live view's scene. */
  private attachWorldLines(): void {
    this.hitboxes.dispose();
    this.grid.dispose();
    this.hitboxes = new WorldLines();
    this.grid = new WorldLines();
    this.hitboxes.visible = this.visible;
    this.grid.visible = this.visible;
    this.grid.attach(this.view.scene);
    this.hitboxes.attach(this.view.scene);
  }

  /**
   * Points the overlay at the run `app/main.ts` just started.
   *
   * Called at the end of every `startRun`, including boot's own — so the
   * overlay is correct from the first frame rather than from the first restart
   * that happens to come after it was mounted. Everything the player toggled
   * (`visible`, and which of the two world-space displays are on) survives:
   * restarting a run to look at the same thing again is exactly when that
   * matters.
   */
  setContext(sim: GameSim, view: GameView): void {
    if (this.sim === sim && this.view === view) {
      return;
    }
    this.sim = sim;
    this.view = view;
    this.attachWorldLines();
    this.animationPanel.setSource(view.animator, view.player);
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
    this.hitboxes.visible = visible;
    this.grid.visible = visible;
    if (!visible) {
      // Leaving stale geometry in the scene would keep it being drawn;
      // emptying means a hidden overlay draws nothing at all.
      this.hitboxes.begin();
      this.hitboxes.end();
      this.grid.begin();
      this.grid.end();
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
        case 'KeyO':
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
      // The camera pan is in room units. A drag is measured in CSS pixels, so
      // it is divided by the canvas's scale (CSS pixels per internal pixel)
      // and then by the room's zoom (internal pixels per room unit), which
      // moves the room by the distance the pointer actually travelled — the
      // same feel the 2D camera had.
      const unitsPerCssPixel = 1 / (this.gameScale() * WORLD_ZOOM);
      this.view.cameraX += (event.clientX - panFromX) * unitsPerCssPixel;
      this.view.cameraY += (event.clientY - panFromY) * unitsPerCssPixel;
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
    this.hitboxes.dispose();
    this.grid.dispose();
    this.panelLayer.destroy({ children: true });
  }

  /**
   * Stacks the panels, wrapping into further columns when the frame is not
   * tall enough for all of them.
   *
   * One column was fine for five panels and stopped being fine at seven: the
   * art-pipeline panel already fell off the bottom before #150 added the
   * animation panel, which is a debug panel nobody can read — the exact
   * failure the overlay exists to prevent. The frame is the fixed 640×360
   * (`panel.ts` on why), so this is computed when a panel is added rather than
   * on a resize. The wrap deliberately overlaps the game rather than shrinking
   * it: `DEBUG_PANEL_COLUMN_WIDTH` is what the HUD keeps clear of
   * *permanently*, and a dev tool that is open for a few seconds at a time
   * should not move the HUD around.
   */
  private layOutPanels(): void {
    const available = PANEL_COLUMN_HEIGHT;
    let x = PANEL_MARGIN;
    let y = PANEL_MARGIN;
    for (const panel of this.panels) {
      if (y > PANEL_MARGIN && y + panel.height > available - PANEL_MARGIN) {
        x += PANEL_WIDTH + PANEL_GAP;
        y = PANEL_MARGIN;
      }
      panel.view.position.set(x, y);
      y += panel.height + PANEL_GAP;
    }
  }

  /**
   * Every collider, drawn from the same arrays collision reads.
   *
   * That is the point rather than a convenience: a hitbox display drawn from
   * sprite bounds would agree with the sprites and disagree with the damage,
   * which is exactly the bug this is meant to find. So the circles lie in the
   * floor plane at the simulation's own `(x, y)` — the plane collision is
   * computed in — however the sprite standing over them is drawn.
   *
   * **Two circles per body since `docs/DECISIONS.md` #73**, because there are
   * two: the solid one is the footprint — what it walks into, what pushes it,
   * what its contact damage reaches — and the faint one shifted up the room
   * from it is the hurtbox, what a shot has to cross. Drawing only the first
   * would make every "my shot went through it" report unanswerable, which is
   * the failure mode this whole display exists against. A body whose two
   * circles are the same (a pickup, anything spawned before the split) draws
   * one.
   */
  private drawHitboxes(): void {
    const lines = this.hitboxes;
    lines.begin();
    if (!this.showHitboxes) {
      lines.end();
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
      const colour = colourForLayer(sim.collision.data[index * 2] ?? 0);
      const x = sim.positionX(index);
      const y = sim.positionY(index);
      const footprint = sim.body.data[index * 2] ?? 0;
      lines.circle(x, y, footprint, colour);
      const hurtRadius = sim.hurtbox.data[index * 2] ?? 0;
      const hurtOffsetY = sim.hurtbox.data[index * 2 + 1] ?? 0;
      if (hurtRadius > 0 && (hurtRadius !== footprint || hurtOffsetY !== 0)) {
        lines.circle(x, y + hurtOffsetY, hurtRadius, colour, 0.45);
      }
    }

    const projectiles = sim.projectiles;
    projectiles.forEachLive((slot) => {
      lines.circle(
        projectiles.x[slot] ?? 0,
        projectiles.y[slot] ?? 0,
        projectiles.radius[slot] ?? 0,
        0xf0c46a,
        0.8,
      );
    });

    // Room solids, so a wall that stops a shot somewhere unexpected is visible.
    const room = sim.room;
    lines.rect(room.minX, room.minY, room.maxX, room.maxY, 0x556070, 0.6);
    for (let block = 0; block < room.blockCount; block++) {
      const base = block * BLOCK_STRIDE;
      lines.rect(
        room.blocks[base] ?? 0,
        room.blocks[base + 1] ?? 0,
        room.blocks[base + 2] ?? 0,
        room.blocks[base + 3] ?? 0,
        0xf29b6f,
        0.6,
      );
    }
    lines.end();
  }

  /**
   * Cell occupancy. Empty cells are a faint outline; an occupied cell is drawn
   * in the grid's colour, brighter the fuller it is, with a second outline
   * inset inside it — lines cannot fill, so the double border is what stands
   * in for the shaded cell the 2D display drew.
   */
  private drawGrid(): void {
    const lines = this.grid;
    lines.begin();
    if (!this.showGrid) {
      lines.end();
      return;
    }

    const hash = this.sim.broadphase;
    const size = hash.cellSize;
    for (let row = 0; row < hash.rows; row++) {
      for (let column = 0; column < hash.columns; column++) {
        const minX = column * size;
        const minY = row * size;
        const occupancy = hash.occupancyAt(column, row);
        if (occupancy === 0) {
          lines.rect(minX, minY, minX + size, minY + size, 0x2e2637, 0.5);
          continue;
        }
        const alpha = Math.min(1, 0.4 + occupancy * 0.15);
        lines.rect(minX, minY, minX + size, minY + size, 0x6fa8dc, alpha);
        lines.rect(minX + 1, minY + 1, minX + size - 1, minY + size - 1, 0x6fa8dc, alpha * 0.6);
      }
    }
    lines.end();
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

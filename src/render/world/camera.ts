import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { clamp } from '../../sim/math.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from '../resolution.js';

/**
 * The fixed camera.
 *
 * ## The same frame as the 2D game
 *
 * The 2D renderer showed exactly `INTERNAL_WIDTH / WORLD_ZOOM` by
 * `INTERNAL_HEIGHT / WORLD_ZOOM` room units — one single-screen room — and
 * for a multi-cell room slid that window after the player, clamped to the
 * room's frame (`view.ts`'s `followOffset`). This camera keeps both rules: it
 * is fitted once so a `VIEW_WIDTH × VIEW_HEIGHT` patch of floor fills the
 * internal frame from `ELEVATION` degrees up, and its *target* is that same
 * clamped viewport's centre. A `1x1` room therefore never scrolls, and a
 * `2x2` scrolls exactly as it did — the only thing that changed is the angle
 * the floor is seen from.
 *
 * ## One angle
 *
 * 56° above the floor, looking north. Steep enough that the floor reads as a
 * map the way a bullet hell needs it to — a shot's path is legible — and
 * shallow enough that a wall has a face and a sprite has feet. Chosen in the
 * proof of concept against 38° (more drama, less playfield) and 90° (the 2D
 * game); the debug overlay can still switch between them for tuning.
 */
export const ELEVATION = MathUtils.degToRad(56);

/** Room units one internal frame shows — a single-screen room's playfield plus wall band. */
export const VIEW_WIDTH = INTERNAL_WIDTH / WORLD_ZOOM;
export const VIEW_HEIGHT = INTERNAL_HEIGHT / WORLD_ZOOM;

const FOV = 34;
/** Fraction of the frame the fitted view fills, leaving a sliver so the wall tops are not clipped. */
const FIT = 0.985;
/** Tallest thing the fit has to keep in frame: the back wall's top edge. */
const FIT_HEIGHT = 26;

const SCRATCH = new Vector3();
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const RAY = new Raycaster();
const NDC = new Vector2();

export interface WorldPoint {
  x: number;
  y: number;
}

export class WorldCamera {
  readonly camera = new PerspectiveCamera(FOV, INTERNAL_WIDTH / INTERNAL_HEIGHT, 1, 2000);
  private elevationValue = ELEVATION;
  private distance = 300;
  private readonly direction = new Vector3();
  private readonly target = new Vector3();

  constructor() {
    this.setElevation(ELEVATION);
  }

  /** Radians above the floor. Billboards lean back by this much to face the camera. */
  get elevation(): number {
    return this.elevationValue;
  }

  get lean(): number {
    return -this.elevationValue;
  }

  setElevation(elevation: number): void {
    this.elevationValue = elevation;
    this.direction.set(0, Math.sin(elevation), Math.cos(elevation));
    this.fit();
  }

  /**
   * Finds the distance at which one view's worth of floor, plus the back
   * wall's height, just fits the frame — by projecting the view's corners and
   * pulling the camera back until they all land inside it.
   */
  private fit(): void {
    const corners = [
      new Vector3(-VIEW_WIDTH / 2, 0, -VIEW_HEIGHT / 2),
      new Vector3(VIEW_WIDTH / 2, 0, -VIEW_HEIGHT / 2),
      new Vector3(-VIEW_WIDTH / 2, 0, VIEW_HEIGHT / 2),
      new Vector3(VIEW_WIDTH / 2, 0, VIEW_HEIGHT / 2),
      new Vector3(-VIEW_WIDTH / 2, FIT_HEIGHT, -VIEW_HEIGHT / 2),
      new Vector3(VIEW_WIDTH / 2, FIT_HEIGHT, -VIEW_HEIGHT / 2),
    ];
    this.distance = 300;
    for (let pass = 0; pass < 8; pass++) {
      this.aim(0, 0, -VIEW_HEIGHT * 0.02);
      let extent = 0;
      for (const corner of corners) {
        SCRATCH.copy(corner).project(this.camera);
        extent = Math.max(extent, Math.abs(SCRATCH.x), Math.abs(SCRATCH.y));
      }
      this.distance *= extent / FIT;
    }
  }

  private aim(x: number, y: number, z: number): void {
    this.target.set(x, y, z);
    this.camera.position.copy(this.target).addScaledVector(this.direction, this.distance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /**
   * Points the camera at the centre of the clamped viewport around the
   * player, offset by shake, sway, the room-transition slide and the debug
   * pan — all in room units, all in the floor plane.
   */
  follow(
    playerX: number,
    playerY: number,
    frameWidth: number,
    frameHeight: number,
    offsetX: number,
    offsetY: number,
  ): void {
    const viewportX = clamp(playerX - VIEW_WIDTH / 2, 0, Math.max(0, frameWidth - VIEW_WIDTH));
    const viewportY = clamp(playerY - VIEW_HEIGHT / 2, 0, Math.max(0, frameHeight - VIEW_HEIGHT));
    this.aim(
      viewportX + VIEW_WIDTH / 2 + offsetX,
      0,
      viewportY + VIEW_HEIGHT / 2 - VIEW_HEIGHT * 0.02 + offsetY,
    );
  }

  /** A world point to internal-frame pixels (0..640, 0..360). */
  project(x: number, height: number, z: number, out: WorldPoint): WorldPoint {
    SCRATCH.set(x, height, z).project(this.camera);
    out.x = ((SCRATCH.x + 1) / 2) * INTERNAL_WIDTH;
    out.y = ((1 - SCRATCH.y) / 2) * INTERNAL_HEIGHT;
    return out;
  }

  /** How many internal pixels `units` room units span on the floor at `(x, z)`, along x. */
  projectedLength(x: number, z: number, units: number): number {
    const a = this.project(x, 0, z, { x: 0, y: 0 });
    const b = this.project(x + units, 0, z, { x: 0, y: 0 });
    return Math.abs(b.x - a.x);
  }

  /** Internal-frame pixels to the floor point under them, or null when the ray misses the floor. */
  unproject(px: number, py: number, out: WorldPoint): WorldPoint | null {
    NDC.set((px / INTERNAL_WIDTH) * 2 - 1, 1 - (py / INTERNAL_HEIGHT) * 2);
    RAY.setFromCamera(NDC, this.camera);
    const hit = RAY.ray.intersectPlane(FLOOR, SCRATCH);
    if (hit === null) {
      return null;
    }
    out.x = hit.x;
    out.y = hit.z;
    return out;
  }
}

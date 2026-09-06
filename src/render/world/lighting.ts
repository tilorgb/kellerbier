import {
  AmbientLight,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  PlaneGeometry,
  PointLight,
  RGBADepthPacking,
  type Scene,
  SphereGeometry,
  CylinderGeometry,
  CanvasTexture,
} from 'three';
import { TICKS_PER_SECOND } from '../../sim/time.js';

/**
 * Light. The reason the room is 3D.
 *
 * ## Two rigs
 *
 * A floor is either a **cellar** — dark, lit by the bulbs that hang in it,
 * every one a real point light with a cord and a glass — or under
 * **daylight**: a sky, a sun that casts the shadows, and a cloud that drifts
 * across the room every fifty seconds and takes the light with it. The
 * tileset says which (`FloorTileset.lighting`), and a room with no authored
 * `bulb` prop in a cellar gets two by default, because a cellar with no light
 * in it is a black screen, not a mood.
 *
 * ## What every rig shares
 *
 * A key directional light from high on the camera's side does the shadow
 * map: the back wall's inner face is the one the camera looks at and it is
 * lit, the side walls' shadows fall *outside* the room, and every body's
 * shadow lands behind it, up-screen, where it does not hide anything the
 * player is aiming at. Alois carries a soft lantern so he is never lost in a
 * dark corner, and every live player shot carries a small light of its own —
 * a thrown Maß lights the floor it flies over, which is the effect that
 * argued for all of this.
 *
 * ## The cloud, and why it is a shadow caster
 *
 * The 2D renderer drew Dorf & Acker's cloud as a multiply-blended sprite. Here
 * it is a plane above the room with a soft alpha texture that *casts a
 * shadow* through the same alpha-tested depth pass the sprites use: the
 * shadow it throws is a real one, it darkens the barrels and the Bauer as it
 * passes over them, not only the floor, and it costs one more caster.
 */
export type LightingRig = 'cellar' | 'daylight';

/** Point lights riding along with live player shots. */
export const SHOT_LIGHT_COUNT = 8;

const BULB_HEIGHT = 34;
const CLOUD_HEIGHT = 90;
const CLOUD_CYCLE_TICKS = TICKS_PER_SECOND * 50;
const CLOUD_CROSS_TICKS = TICKS_PER_SECOND * 16;

interface RigColours {
  readonly ambient: number;
  readonly ambientIntensity: number;
  readonly sky: number;
  readonly ground: number;
  readonly hemisphereIntensity: number;
  readonly key: number;
  readonly keyIntensity: number;
  readonly background: number;
}

const RIGS: Readonly<Record<LightingRig, RigColours>> = {
  cellar: {
    ambient: 0x7a6c88,
    ambientIntensity: 1.3,
    sky: 0x8a7aa0,
    ground: 0x3a2a1a,
    hemisphereIntensity: 0.5,
    key: 0xffe2b8,
    keyIntensity: 2.6,
    background: 0x07060a,
  },
  daylight: {
    ambient: 0xa8b4d0,
    ambientIntensity: 1.7,
    sky: 0xbfd4ff,
    ground: 0x6a5a3a,
    hemisphereIntensity: 1.1,
    key: 0xfff2d8,
    keyIntensity: 3.4,
    background: 0x2a3a2a,
  },
};

export class Lighting {
  private readonly scene: Scene;
  private readonly ambient = new AmbientLight(0xffffff, 1);
  private readonly hemisphere = new HemisphereLight(0xffffff, 0x000000, 1);
  private readonly key = new DirectionalLight(0xffffff, 1);
  private readonly lantern = new PointLight(0xffd9a6, 420, 120, 2);
  private readonly shotLights: PointLight[] = [];
  private readonly roomLights = new Group();
  private cloud: Mesh | null = null;
  private cloudSpanX = 0;
  private cloudCentreZ = 0;
  private rig: LightingRig = 'cellar';
  private reducedMotion = false;

  constructor(scene: Scene) {
    this.scene = scene;
    scene.add(
      this.ambient,
      this.hemisphere,
      this.key,
      this.key.target,
      this.lantern,
      this.roomLights,
    );
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    for (let i = 0; i < SHOT_LIGHT_COUNT; i++) {
      const light = new PointLight(0xffb347, 0, 70, 2);
      this.shotLights.push(light);
      scene.add(light);
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /**
   * Re-lights for a room: which rig, where its bulbs hang, how big it is (for
   * the key light's shadow frustum and the cloud's run).
   */
  onRoomChanged(
    rig: LightingRig,
    frameWidth: number,
    frameHeight: number,
    bulbs: readonly { readonly x: number; readonly y: number }[],
  ): void {
    this.rig = rig;
    const colours = RIGS[rig];
    this.ambient.color.setHex(colours.ambient);
    this.ambient.intensity = colours.ambientIntensity;
    this.hemisphere.color.setHex(colours.sky);
    this.hemisphere.groundColor.setHex(colours.ground);
    this.hemisphere.intensity = colours.hemisphereIntensity;
    this.key.color.setHex(colours.key);
    this.key.intensity = colours.keyIntensity;
    this.scene.background = null;

    // High on the camera's side, a touch east of centre; see the class comment.
    this.key.position.set(frameWidth * 0.62, 240, frameHeight * 1.9);
    this.key.target.position.set(frameWidth / 2, 0, frameHeight / 2);
    const shadow = this.key.shadow.camera;
    shadow.left = -frameWidth * 0.75;
    shadow.right = frameWidth * 0.75;
    shadow.top = frameHeight * 0.9;
    shadow.bottom = -frameHeight * 0.9;
    shadow.near = 50;
    shadow.far = 700;
    shadow.updateProjectionMatrix();

    this.roomLights.clear();
    this.cloud = null;
    if (rig === 'cellar') {
      const placed = bulbs.length > 0 ? bulbs : defaultBulbs(frameWidth, frameHeight);
      for (const bulb of placed) {
        this.addBulb(bulb.x, bulb.y);
      }
    } else {
      this.addCloud(frameWidth, frameHeight);
    }
  }

  /** A bare bulb on a cord: a warm point light with a small emissive glass where the filament is. */
  private addBulb(x: number, z: number): void {
    const light = new PointLight(0xffb870, 9000, 300, 2);
    light.position.set(x, BULB_HEIGHT, z);
    this.roomLights.add(light);
    const glass = new Mesh(
      new SphereGeometry(2, 10, 8),
      new MeshBasicMaterial({ color: 0xfff1c8 }),
    );
    glass.position.copy(light.position);
    this.roomLights.add(glass);
    const cord = new Mesh(
      new CylinderGeometry(0.4, 0.4, 40, 4),
      new MeshBasicMaterial({ color: 0x141018 }),
    );
    cord.position.set(x, BULB_HEIGHT + 22, z);
    this.roomLights.add(cord);
  }

  private addCloud(frameWidth: number, frameHeight: number): void {
    const texture = cloudTexture();
    if (texture === null) {
      return;
    }
    const width = frameWidth * 0.85;
    const depth = frameHeight * 0.6;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    const cloud = new Mesh(new PlaneGeometry(width, depth), material);
    cloud.customDepthMaterial = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      map: texture,
      alphaTest: 0.5,
    });
    cloud.castShadow = true;
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.set(-width, CLOUD_HEIGHT, frameHeight / 2);
    this.cloudSpanX = frameWidth + width;
    this.cloudCentreZ = frameHeight / 2;
    this.roomLights.add(cloud);
    this.cloud = cloud;
  }

  /** Drives the cloud along its cycle. Pure function of the tick, so a replay clouds over at the same moment. */
  sync(tick: number): void {
    const cloud = this.cloud;
    if (cloud === null) {
      return;
    }
    const phase = tick % CLOUD_CYCLE_TICKS;
    if (phase >= CLOUD_CROSS_TICKS || this.reducedMotion) {
      cloud.visible = false;
      return;
    }
    cloud.visible = true;
    const t = phase / CLOUD_CROSS_TICKS;
    const width = (cloud.geometry as PlaneGeometry).parameters.width;
    cloud.position.set(-width / 2 + this.cloudSpanX * t, CLOUD_HEIGHT, this.cloudCentreZ);
  }

  /** Alois's lantern follows him; out when he is dead. */
  syncLantern(x: number, z: number, lit: boolean): void {
    this.lantern.position.set(x, 16, z);
    this.lantern.intensity = lit ? (this.rig === 'cellar' ? 420 : 120) : 0;
  }

  /** Hands out the shot lights in order; `count` used this frame, the rest go dark. */
  shotLight(slot: number): PointLight | null {
    return this.shotLights[slot] ?? null;
  }

  dimShotLightsFrom(count: number): void {
    for (let i = count; i < SHOT_LIGHT_COUNT; i++) {
      const light = this.shotLights[i];
      if (light !== undefined) {
        light.intensity = 0;
      }
    }
  }

  get backgroundColour(): number {
    return RIGS[this.rig].background;
  }
}

function defaultBulbs(
  frameWidth: number,
  frameHeight: number,
): readonly { readonly x: number; readonly y: number }[] {
  return [
    { x: frameWidth * 0.3, y: frameHeight * 0.45 },
    { x: frameWidth * 0.7, y: frameHeight * 0.45 },
  ];
}

/** A soft cloud silhouette painted into a canvas, or null with no DOM (the headless bench). */
function cloudTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  context.fillStyle = 'rgba(0,0,0,1)';
  for (const puff of CLOUD_PUFFS) {
    const gradient = context.createRadialGradient(
      puff.x * size,
      puff.y * size,
      0,
      puff.x * size,
      puff.y * size,
      puff.r * size,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  return texture;
}

const CLOUD_PUFFS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 0.3, y: 0.5, r: 0.22 },
  { x: 0.5, y: 0.42, r: 0.26 },
  { x: 0.7, y: 0.52, r: 0.2 },
  { x: 0.45, y: 0.6, r: 0.18 },
  { x: 0.6, y: 0.6, r: 0.16 },
];

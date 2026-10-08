import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GameSim } from '../sim/game/sim.js';
import { WeatherPhase } from '../sim/hazard/weather.js';
import { BLOCK_STRIDE } from '../sim/room/geometry.js';
import { FloorHazardBar } from './world/flat.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * Floor 4's weather (#40), drawn from `sim.weather`: render-only, like
 * `CloudView` — a replay plays the same with or without it.
 *
 * **The avalanche's warning is a hatched band** across the top of each lane
 * (`FloorHazardBar`, the same hatch every explosive telegraph uses), blinking
 * faster as the rumble runs out. It is the copy of the warning that survives
 * reduced motion, where the snow dust the sim throws (`ParticleKind.Snow`) is
 * hidden. **The slide itself is a wall of snow**: a pale box the width of the
 * lane, sliding south with the front, lit like the room so it sits on the
 * floor rather than over it.
 *
 * **The wind gust's warning is the streaking snow** the sim throws, plus a
 * faint hatched band along the lane's upwind edge so a player with motion
 * off still sees which wall the wind comes from.
 */

/** Room units the warning band stands into the lane from its north edge. */
const WARNING_DEPTH = 12;
/** Room units the wind band stands into the lane from its upwind edge. */
const WIND_BAND_WIDTH = 10;
/** Room units the snow wall is deep (north to south) and tall. */
const FRONT_DEPTH = 10;
const FRONT_HEIGHT = 7;
/** Alpenglow pink for the warning, snow white for the slide. */
const WARNING_TINT = 0xe893a8;
const WIND_TINT = 0xb9c4cc;
const SNOW_COLOUR = 0xeef2f5;

export class WeatherView {
  readonly group = new Group();

  private readonly warningBars: FloorHazardBar[] = [];
  private readonly windBars: FloorHazardBar[] = [];
  private readonly fronts: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
  private readonly frontGeometry = new BoxGeometry(1, FRONT_HEIGHT, FRONT_DEPTH);
  private readonly frontMaterial = new MeshStandardMaterial({
    color: SNOW_COLOUR,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });

  sync(sim: GameSim): void {
    const weather = sim.weather;
    const tuning = sim.tuning.weather;
    const avalanche = weather.avalanche;
    const warning = weather.avalancheWarning(tuning);
    const progress = weather.avalancheProgress(tuning);
    for (let lane = 0; lane < avalanche.count; lane++) {
      const base = lane * BLOCK_STRIDE;
      const minX = avalanche.rects[base] ?? 0;
      const minY = avalanche.rects[base + 1] ?? 0;
      const maxX = avalanche.rects[base + 2] ?? 0;
      const maxY = avalanche.rects[base + 3] ?? 0;
      const width = maxX - minX;
      const bar = this.warningBarAt(lane);
      if (warning >= 0) {
        // Blinks about twice a second at first, four times by the end.
        const blinkRate = 4 + warning * 6;
        const blink = 0.55 + 0.45 * Math.sin(avalanche.ticks * blinkRate * 0.1);
        bar.place(
          (minX + maxX) / 2,
          minY + WARNING_DEPTH / 2,
          width,
          WARNING_DEPTH,
          0.35 + 0.5 * blink,
        );
      } else {
        bar.hide();
      }
      const front = this.frontAt(lane);
      if (progress >= 0) {
        front.visible = true;
        front.position.set(
          (minX + maxX) / 2,
          FRONT_HEIGHT / 2,
          minY + progress * (maxY - minY) - FRONT_DEPTH / 2,
        );
        front.scale.set(width, 1, 1);
      } else {
        front.visible = false;
      }
    }
    for (let lane = avalanche.count; lane < this.warningBars.length; lane++) {
      this.warningBars[lane]?.hide();
      const front = this.fronts[lane];
      if (front !== undefined) {
        front.visible = false;
      }
    }

    const wind = weather.wind;
    const windy = wind.count > 0 && wind.phase !== WeatherPhase.Quiet;
    for (let lane = 0; lane < wind.count; lane++) {
      const bar = this.windBarAt(lane);
      if (!windy) {
        bar.hide();
        continue;
      }
      const base = lane * BLOCK_STRIDE;
      const minX = wind.rects[base] ?? 0;
      const minY = wind.rects[base + 1] ?? 0;
      const maxX = wind.rects[base + 2] ?? 0;
      const maxY = wind.rects[base + 3] ?? 0;
      const edgeX =
        weather.windDirection > 0 ? minX + WIND_BAND_WIDTH / 2 : maxX - WIND_BAND_WIDTH / 2;
      const alpha = wind.phase === WeatherPhase.Active ? 0.5 : 0.3;
      bar.place(edgeX, (minY + maxY) / 2, WIND_BAND_WIDTH, maxY - minY, alpha);
    }
    for (let lane = wind.count; lane < this.windBars.length; lane++) {
      this.windBars[lane]?.hide();
    }
  }

  private warningBarAt(lane: number): FloorHazardBar {
    const existing = this.warningBars[lane];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorHazardBar(WARNING_TINT);
    created.mesh.layers.set(ACTOR_LAYER);
    this.group.add(created.mesh);
    this.warningBars[lane] = created;
    return created;
  }

  private windBarAt(lane: number): FloorHazardBar {
    const existing = this.windBars[lane];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorHazardBar(WIND_TINT);
    created.mesh.layers.set(ACTOR_LAYER);
    this.group.add(created.mesh);
    this.windBars[lane] = created;
    return created;
  }

  private frontAt(lane: number): Mesh<BoxGeometry, MeshStandardMaterial> {
    const existing = this.fronts[lane];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Mesh(this.frontGeometry, this.frontMaterial);
    created.castShadow = true;
    created.visible = false;
    created.layers.set(ACTOR_LAYER);
    this.group.add(created);
    this.fronts[lane] = created;
    return created;
  }

  destroy(): void {
    for (const bar of this.warningBars) {
      bar.dispose();
    }
    for (const bar of this.windBars) {
      bar.dispose();
    }
    this.frontGeometry.dispose();
    this.frontMaterial.dispose();
    this.group.removeFromParent();
  }
}

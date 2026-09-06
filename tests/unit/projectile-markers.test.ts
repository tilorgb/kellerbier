import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, type MeshBasicMaterial, Vector3 } from 'three';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { type Texture, textureFromPixels } from '../../src/render/gfx/index.js';
import { ProjectileView, type ProjectileArt } from '../../src/render/projectiles.js';

/**
 * #53's colourblind-safe projectile marker (`docs/GAME_DESIGN.md` §12):
 * `ProjectileView` draws a marker over every shot when the toggle is on — a
 * second set of instanced layers beside the shots' own, one per marker
 * texture — so friend/foe reads by shape and brightness as well as by
 * whatever hue the underlying shot art carries.
 */

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

/** A fresh one-pixel texture — distinct objects, so a layer can be told apart by which one it wears. */
function texture(): Texture {
  return textureFromPixels(1, 1, new Int32Array([0xffffff]));
}

function artWithMarkers(): { art: ProjectileArt; playerMarker: Texture; enemyMarker: Texture } {
  const playerMarker = texture();
  const enemyMarker = texture();
  return {
    art: {
      player: texture(),
      playerTags: [],
      enemyByName: {},
      enemyByFloor: { 1: texture() },
      fallback: texture(),
      teamMarkers: { player: playerMarker, enemy: enemyMarker },
    },
    playerMarker,
    enemyMarker,
  };
}

function artWithoutMarkers(): ProjectileArt {
  return {
    player: texture(),
    playerTags: [],
    enemyByName: {},
    enemyByFloor: { 1: texture() },
    fallback: texture(),
  };
}

/** How many marker instances the view is drawing with `marker`'s texture this frame — 0 if it has no such layer yet. */
function markerInstances(view: ProjectileView, marker: Texture): number {
  const layer = view.group.children.find(
    (child) =>
      child instanceof InstancedMesh &&
      (child.material as MeshBasicMaterial).map === marker.source.texture,
  ) as InstancedMesh | undefined;
  return layer?.count ?? 0;
}

describe('ProjectileView colourblind marker (#53)', () => {
  it('draws no marker at all when the toggle is off', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker, enemyMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);
    sim.projectiles.spawn(120, 100, 1, 0, 3, 1, 60, ProjectileTeam.Enemy, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.sync(1, 1);

    expect(markerInstances(view, playerMarker)).toBe(0);
    expect(markerInstances(view, enemyMarker)).toBe(0);
    // The two shots are drawn, one layer per team texture.
    expect(view.layerCount).toBe(2);
    expect(view.group.children).toHaveLength(2);
  });

  it('marks a player shot with the player texture and an enemy shot with the enemy texture, once enabled', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker, enemyMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);
    sim.projectiles.spawn(120, 100, 1, 0, 3, 1, 60, ProjectileTeam.Enemy, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);

    expect(markerInstances(view, playerMarker)).toBe(1);
    expect(markerInstances(view, enemyMarker)).toBe(1);
    // Markers are their own layers, not extra shot layers.
    expect(view.layerCount).toBe(2);
    expect(view.group.children).toHaveLength(4);
  });

  it('hides every marker again once the toggle is switched back off', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);
    expect(markerInstances(view, playerMarker)).toBe(1);

    view.setAccessibility({ colorblindPalette: false });
    view.sync(1, 1);
    expect(markerInstances(view, playerMarker)).toBe(0);
  });

  it("drops a slot's marker once that projectile is gone, even while the toggle stays on", () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker } = artWithMarkers();
    const slot = sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);
    expect(markerInstances(view, playerMarker)).toBe(1);

    sim.projectiles.despawn(slot);
    view.sync(1, 1);
    expect(markerInstances(view, playerMarker)).toBe(0);
  });

  it('never creates a marker layer at all when the art has none to draw', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const art = artWithoutMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    expect(() => {
      view.sync(1, 1);
    }).not.toThrow();
    // One shot layer and nothing else — no orphan marker layer appeared.
    expect(view.layerCount).toBe(1);
    expect(view.group.children).toHaveLength(1);
  });

  it('places the marker over the shot it belongs to', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 140, 0, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);

    const layers = view.group.children as InstancedMesh[];
    const shot = layers.find(
      (l) => (l.material as MeshBasicMaterial).map === art.player.source.texture,
    );
    const marker = layers.find(
      (l) => (l.material as MeshBasicMaterial).map === playerMarker.source.texture,
    );
    expect(shot).toBeDefined();
    expect(marker).toBeDefined();
    const shotAt = new Matrix4();
    const markerAt = new Matrix4();
    shot?.getMatrixAt(0, shotAt);
    marker?.getMatrixAt(0, markerAt);
    const shotPosition = new Vector3().setFromMatrixPosition(shotAt);
    const markerPosition = new Vector3().setFromMatrixPosition(markerAt);
    // Same x and z as the shot, a hair higher.
    expect(shotPosition.x).toBeCloseTo(100);
    expect(shotPosition.z).toBeCloseTo(140);
    expect(markerPosition.x).toBeCloseTo(shotPosition.x);
    expect(markerPosition.z).toBeCloseTo(shotPosition.z);
    expect(markerPosition.y).toBeGreaterThan(shotPosition.y);
  });
});

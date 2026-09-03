import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ProjectileView, type ProjectileArt } from '../../src/render/projectiles.js';

/**
 * #53's colourblind-safe projectile marker (`docs/GAME_DESIGN.md` §12):
 * `ProjectileView` overlays a pooled, texture-swapped marker sprite on every
 * shot when the toggle is on, so friend/foe reads by shape and brightness
 * as well as by whatever hue the underlying shot art carries.
 */

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

function artWithMarkers(): { art: ProjectileArt; playerMarker: Texture; enemyMarker: Texture } {
  const playerMarker = new Texture();
  const enemyMarker = new Texture();
  return {
    art: {
      player: new Texture(),
      playerTags: [],
      enemyByName: {},
      enemyByFloor: { 1: new Texture() },
      fallback: new Texture(),
      teamMarkers: { player: playerMarker, enemy: enemyMarker },
    },
    playerMarker,
    enemyMarker,
  };
}

function artWithoutMarkers(): ProjectileArt {
  return {
    player: new Texture(),
    playerTags: [],
    enemyByName: {},
    enemyByFloor: { 1: new Texture() },
    fallback: new Texture(),
  };
}

/** Marker sprites are siblings of the shot sprites in `container`, distinguishable by which marker texture they carry. */
function findMarkerSprites(view: ProjectileView, marker: Texture): readonly { visible: boolean }[] {
  return view.container.children.filter(
    (child) => (child as { texture?: Texture }).texture === marker,
  );
}

describe('ProjectileView colourblind marker (#53)', () => {
  it('draws no marker at all when the toggle is off', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker, enemyMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);
    sim.projectiles.spawn(120, 100, 1, 0, 3, 1, 60, ProjectileTeam.Enemy, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.sync(1, 1);

    expect(findMarkerSprites(view, playerMarker)).toHaveLength(0);
    expect(findMarkerSprites(view, enemyMarker)).toHaveLength(0);
  });

  it('marks a player shot with the player texture and an enemy shot with the enemy texture, once enabled', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker, enemyMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);
    sim.projectiles.spawn(120, 100, 1, 0, 3, 1, 60, ProjectileTeam.Enemy, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);

    const playerMarkers = findMarkerSprites(view, playerMarker);
    const enemyMarkers = findMarkerSprites(view, enemyMarker);
    expect(playerMarkers).toHaveLength(1);
    expect(enemyMarkers).toHaveLength(1);
    expect(playerMarkers[0]?.visible).toBe(true);
    expect(enemyMarkers[0]?.visible).toBe(true);
  });

  it('hides every marker again once the toggle is switched back off', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker } = artWithMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);
    expect(findMarkerSprites(view, playerMarker)[0]?.visible).toBe(true);

    view.setAccessibility({ colorblindPalette: false });
    view.sync(1, 1);
    expect(findMarkerSprites(view, playerMarker)[0]?.visible).toBe(false);
  });

  it("hides a slot's marker once that projectile is gone, even while the toggle stays on", () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const { art, playerMarker } = artWithMarkers();
    const slot = sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    view.sync(1, 1);
    expect(findMarkerSprites(view, playerMarker)[0]?.visible).toBe(true);

    sim.projectiles.despawn(slot);
    view.sync(1, 1);
    expect(findMarkerSprites(view, playerMarker)[0]?.visible).toBe(false);
  });

  it('never creates a marker at all when the art has none to draw', () => {
    const sim = new GameSim({ seed: 1, room: openRoom() });
    const art = artWithoutMarkers();
    sim.projectiles.spawn(100, 100, 1, 0, 3, 1, 60, ProjectileTeam.Player, 0);

    const view = new ProjectileView(sim.projectiles, art);
    view.setAccessibility({ colorblindPalette: true });
    expect(() => {
      view.sync(1, 1);
    }).not.toThrow();
    // One shot sprite and nothing else — no orphan marker object appeared.
    expect(view.container.children.length).toBe(1);
  });
});

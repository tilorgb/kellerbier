import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  loadSettings,
  sanitizeAccessibilitySettings,
  saveSettings,
} from '../../src/app/settings.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, ROOM_GEN_FLOOR_OVERRIDES } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { DUSK, stackWithTunnel } from '../../src/render/world/darkness.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { generateRoom, roomGenSeed } from '../../src/sim/room/generate-room.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { DEFAULT_ROOM_GEN_TUNING } from '../../src/sim/tuning.js';

/**
 * Floor 3's lantern-darkness rooms (#404): a room flag, rolled by the
 * generator on `wald`, refused on the roles a player must see in full, shown
 * by the renderer and switched off by an accessibility setting.
 */

function template(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'synthetic-dark',
    tileGrid: Array.from({ length: 9 }, () => '...............'),
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
    metadata: {
      floorTags: ['wald'],
      shape: '1x1',
      doors: { north: true, east: true, south: true, west: true },
      difficultyTier: 1,
      weight: 1,
      ...metadata,
    },
  };
}

const templates = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);

describe('the dark room flag', () => {
  it('compiles on a normal room and is absent unless set', () => {
    expect(validateRoomTemplate(template({ dark: true }), 'dark').metadata.dark).toBe(true);
    expect(validateRoomTemplate(template({}), 'lit').metadata.dark).toBeUndefined();
  });

  it('must be a boolean', () => {
    expect(() => validateRoomTemplate(template({ dark: 'yes' }), 'dark')).toThrow(/dark/);
  });

  it('is refused on boss, mini-boss, shop and treasure templates', () => {
    for (const specialRole of ['boss', 'miniboss', 'shop', 'treasure']) {
      expect(
        () => validateRoomTemplate(template({ dark: true, specialRole }), specialRole),
        specialRole,
      ).toThrow(/may not be set/);
    }
  });

  it('reaches the simulation as roomDark when the room loads', () => {
    const sim = new GameSim({ seed: 3, population: 'empty' });
    sim.loadRoom(template({ dark: true }), 3);
    expect(sim.roomDark).toBe(true);
    sim.loadRoom(template({}), 3);
    expect(sim.roomDark).toBe(false);
  });

  it('is set on some authored floor-3 rooms, and on no special-role room', () => {
    const dark = templates.filter((candidate) => candidate.metadata.dark === true);
    expect(dark.length).toBeGreaterThan(0);
    for (const candidate of dark) {
      expect(candidate.metadata.floorTags, candidate.id).toContain('wald');
      expect(candidate.metadata.specialRole, candidate.id).toBeUndefined();
    }
  });
});

describe('generated dark rooms', () => {
  const wald = { ...DEFAULT_ROOM_GEN_TUNING, ...ROOM_GEN_FLOOR_OVERRIDES.wald };

  it('wald turns the chance on at its starting value; every other floor leaves it off', () => {
    expect(wald.darkRoomChance).toBe(0.15);
    expect(DEFAULT_ROOM_GEN_TUNING.darkRoomChance).toBe(0);
    for (const [tag, override] of Object.entries(ROOM_GEN_FLOOR_OVERRIDES)) {
      if (tag !== 'wald') {
        expect(override.darkRoomChance ?? 0, tag).toBe(0);
      }
    }
  });

  it('rolls dark on roughly the tuned share of wald rooms, and never on another floor', () => {
    const roll = (floorTag: string, floor: number, params = DEFAULT_ROOM_GEN_TUNING): number => {
      let dark = 0;
      for (let seed = 0; seed < 200; seed++) {
        const generated = generateRoom(
          {
            roomId: `r${String(seed)}`,
            floor,
            floorTag,
            doors: ['north', 'south'],
            distanceFromStart: 2,
            bossDistance: 5,
            rng: new Rng(roomGenSeed(17, floor, `r${String(seed)}`, seed)),
          },
          params,
        );
        if (generated.metadata.dark === true) {
          dark += 1;
        }
      }
      return dark;
    };
    const waldDark = roll('wald', 3, wald);
    expect(waldDark).toBeGreaterThan(10);
    expect(waldDark).toBeLessThan(55);
    expect(roll('cellar', 1)).toBe(0);
    expect(roll('rural', 2)).toBe(0);
  });

  it('never puts a dark template in a floor start room', () => {
    const config = FLOOR_CONFIGS.find((candidate) => candidate.floorTag === 'wald');
    expect(config).toBeDefined();
    if (config === undefined) {
      return;
    }
    const byId = new Map(templates.map((candidate) => [candidate.id, candidate]));
    for (let seed = 0; seed < 60; seed++) {
      const plan = generateFloor(new Rng(seed + 900), config, templates);
      const start = plan.rooms.find((room) => room.role === 'start');
      expect(start, `seed ${String(seed)}`).toBeDefined();
      expect(byId.get(start?.templateId ?? '')?.metadata.dark, `seed ${String(seed)}`).not.toBe(
        true,
      );
    }
  });
});

describe('the darkness setting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to full, and off means no dusk at all', () => {
    expect(DEFAULT_ACCESSIBILITY_SETTINGS.darkness).toBe('full');
    expect(DUSK.off).toBeNull();
    expect(stackWithTunnel(DUSK.off)).toEqual({ darknessAlpha: 0, vignetteScale: 1 });
  });

  it('is a dusk shapes still read through, and reduced is clearly lighter (#424)', () => {
    const full = DUSK.full ?? 0;
    const reduced = DUSK.reduced ?? 0;
    // #404's near-black was 0.9; with no clear circle around the player the
    // room itself has to stay readable.
    expect(full).toBeGreaterThan(0.4);
    expect(full).toBeLessThan(0.75);
    expect(reduced).toBeGreaterThan(0);
    expect(reduced).toBeLessThan(full - 0.15);
  });

  it('sanitises an unknown or missing value back to the default', () => {
    expect(sanitizeAccessibilitySettings({ darkness: 'pitch' }).darkness).toBe('full');
    expect(sanitizeAccessibilitySettings({}).darkness).toBe('full');
    expect(sanitizeAccessibilitySettings({ darkness: 'reduced' }).darkness).toBe('reduced');
  });

  it('persists across a reload', () => {
    installFakeLocalStorage();
    saveSettings({ ...DEFAULT_ACCESSIBILITY_SETTINGS, darkness: 'off' });
    expect(loadSettings().darkness).toBe('off');
  });
});

describe('dusk stacked with the Promille tunnel', () => {
  /** Opacity where both overlays are at full strength, drawn one over the other. */
  const combined = (a: number, b: number): number => 1 - (1 - a) * (1 - b);

  it('keeps the dusk whole and thins the tunnel, without stacking into black', () => {
    const dusk = DUSK.full ?? 0;
    const tunnelAlpha = 0.8;
    const stacked = stackWithTunnel(dusk);
    expect(stacked.darknessAlpha).toBe(dusk);
    const total = combined(stacked.darknessAlpha, tunnelAlpha * stacked.vignetteScale);
    // No darker than the darker of the two alone — not the 0.92 two full overlays make.
    expect(total).toBeLessThanOrEqual(Math.max(dusk, tunnelAlpha));
    expect(combined(dusk, tunnelAlpha)).toBeGreaterThan(0.9);
    // And the tunnel is still there to be read.
    expect(stacked.vignetteScale).toBeGreaterThan(0.25);
  });

  it('leaves the tunnel alone in a room with no dusk', () => {
    expect(stackWithTunnel(null).vignetteScale).toBe(1);
  });
});

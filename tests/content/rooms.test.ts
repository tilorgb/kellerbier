import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  isMultiCellRoomTemplate,
  type RoomTemplate,
} from '../../src/content/rooms/definition.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { chooseSprinkle } from '../../src/sim/room/sprinkle.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';

describe('room templates', () => {
  it('validates every registered authored room', () => {
    // Not pinned to exactly 13: the room editor (#24) saves new templates
    // straight into this directory, and `ROOM_TEMPLATES` picks them up via a
    // glob (`src/content/rooms/index.ts`) — a floor of new content should not
    // have to touch this assertion to keep passing.
    expect(ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(13);
    for (const [index, room] of ROOM_TEMPLATES.entries()) {
      expect(() =>
        validateRoomTemplate(room, `room[${String(index)}].json`, ENEMY_DEFINITIONS),
      ).not.toThrow();
    }
  });

  it('keeps at least one ordinary room per playable floor tag for the generator to fall back on and sprinkle', () => {
    // The generator fills ordinary slots (#random-rooms); the authored ordinary
    // rooms that remain double as the sprinkle pool and as the floor
    // generator's eligibility fallback, so each playable tag needs one.
    const templates = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    for (const tag of ['cellar', 'rural']) {
      const ordinary = templates.filter(
        (template) =>
          template.metadata.specialRole === undefined && template.metadata.floorTags.includes(tag),
      );
      expect(ordinary.length).toBeGreaterThan(0);
    }
  });

  it('gives Floor 2 its own rural-only rooms, not just the cellar set with a new tileset (#273)', () => {
    // Before #273, every non-boss template floor 2 could draw was tagged
    // `cellar, rural` alike — the floor had no room of its own beyond its
    // boss arena. The acceptance criterion is "at least four rural-only
    // templates, spanning at least three shapes."
    const templates = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    const ruralOnly = templates.filter(
      (template) =>
        template.metadata.floorTags.includes('rural') &&
        !template.metadata.floorTags.includes('cellar'),
    );
    expect(ruralOnly.length).toBeGreaterThanOrEqual(4);
    expect(
      new Set(ruralOnly.map((template) => template.metadata.shape)).size,
    ).toBeGreaterThanOrEqual(3);
  });

  it('stands the Maibaum in an ordinary room with something to do at it (#273)', () => {
    // `docs/CONTENT_BIBLE.md` §1: "It can be climbed for a reward." Modelled
    // as the existing pedestal mechanic (`sim/systems/pedestal.ts`) rather
    // than a new interaction — the reward is exactly what pressing `use` at
    // any other pedestal already gives, framed here as climbing the pole for
    // it. The `maibaum` decorative prop itself is the plain two-tile scenery
    // version (`render/floor-art.ts`'s `PROP_TILE_NAMES`), not the
    // destructible `maypole` the boss arena's Maibaum-Dieb fight uses.
    const templates = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    const maibaumRoom = templates.find((template) => template.id === 'dorf-maibaum');
    if (maibaumRoom === undefined) {
      throw new Error('dorf-maibaum template not found');
    }
    expect(maibaumRoom.metadata.specialRole).toBeUndefined();
    const layouts = isMultiCellRoomTemplate(maibaumRoom) ? maibaumRoom.cells : [maibaumRoom];
    const props = layouts.flatMap((layout) => layout.decorativeProps.map((prop) => prop.type));
    expect(props).toContain('maibaum');
    expect(props).toContain('pedestal');
  });

  it('the sprinkle roll actually reaches every new rural-only template on floor 2 (#273)', () => {
    // Not enough that these templates are schema-valid and shape-eligible —
    // the acceptance criterion is that a real floor 2 can actually roll
    // them, the same real `generateFloor` + `chooseSprinkle` path
    // `app/main.ts`'s `rebuildProceduralRooms` uses.
    const pool: readonly RoomTemplate[] = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    const floor2Config = FLOOR_CONFIGS.find((config) => config.floor === 2);
    if (floor2Config === undefined) {
      throw new Error('no floor 2 config');
    }
    const expectedIds = new Set([
      'dorf-maibaum',
      'dorf-marktplatz',
      'dorf-hopfengarten',
      'dorf-stall',
      'dorf-acker',
    ]);
    const seenIds = new Set<string>();
    // A high sprinkle chance, same reasoning as `tests/unit/sprinkle.test.ts`:
    // makes every eligible template turn up without needing an enormous N.
    const authoredRoomChance = 0.6;
    for (let seed = 0; seed < 3000 && seenIds.size < expectedIds.size; seed++) {
      const plan = generateFloor(new Rng(seed + 1), floor2Config, pool);
      const alreadyPlaced = new Set<string>();
      for (const room of plan.rooms) {
        if (room.role !== 'normal' || room.staircaseTemplateId !== undefined) {
          continue;
        }
        const rng = new Rng(seed * 7919 + room.id.length + room.distanceFromStart);
        const sprinkle = chooseSprinkle(
          room,
          floor2Config.floorTag,
          pool,
          alreadyPlaced,
          authoredRoomChance,
          rng,
        );
        if (sprinkle !== null) {
          alreadyPlaced.add(sprinkle.id);
          if (expectedIds.has(sprinkle.id)) {
            seenIds.add(sprinkle.id);
          }
        }
      }
    }
    expect([...seenIds].sort()).toEqual([...expectedIds].sort());
  });

  it('keeps the corruption crates pure scenery — no pickup, no plate, nobody comments (#273)', () => {
    // `docs/CONTENT_BIBLE.md` §1: "Nobody comments on them." A crate prop
    // must never carry a pickup or a special role of its own — the whole
    // effect is that they're just there.
    const templates = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    const crateTypes = new Set(['crate-opa', 'crate-neu', 'crate-stack']);
    let checkedAny = false;
    for (const template of templates) {
      const layouts = isMultiCellRoomTemplate(template) ? template.cells : [template];
      for (const layout of layouts) {
        if (layout.decorativeProps.some((prop) => crateTypes.has(prop.type))) {
          checkedAny = true;
          expect(layout.pickupSpawns).toEqual([]);
        }
      }
    }
    expect(checkedAny).toBe(true);
  });

  it('loads the hand-authored JSON at the standard dimensions', () => {
    const template = validateRoomTemplate(cellarCrossroads, 'cellar.json', ENEMY_DEFINITIONS);
    if (isMultiCellRoomTemplate(template)) {
      throw new Error('cellar.json is a 1x1 template');
    }

    expect(template.tileGrid).toHaveLength(ROOM_ROWS);
    expect(template.tileGrid.every((row) => row.length === ROOM_COLUMNS)).toBe(true);
    expect(template.metadata.shape).toBe('1x1');
    expect(template.metadata.weight).toBeGreaterThan(0);
    expect(template.enemySpawns).toHaveLength(2);
  });

  it('resolves a reusable spawn group for different floors', () => {
    const floorOne = compileRoomTemplate(cellarCrossroads, 1, 'cellar.json', ENEMY_DEFINITIONS);
    const floorFive = compileRoomTemplate(cellarCrossroads, 5, 'cellar.json', ENEMY_DEFINITIONS);

    expect(floorOne.enemyIds).toEqual(['kellerassel', 'kellerassel']);
    expect(floorFive.enemyIds).toEqual(['bierratte', 'bierratte']);
    expect(floorOne.geometry.maxX - floorOne.geometry.minX).toBe(ROOM_COLUMNS * ROOM_TILE_UNITS);
    expect(floorOne.geometry.maxY - floorOne.geometry.minY).toBe(ROOM_ROWS * ROOM_TILE_UNITS);
  });

  it('names malformed fields and their source', () => {
    expect(() =>
      validateRoomTemplate(
        { ...cellarCrossroads, metadata: { ...cellarCrossroads.metadata, weight: 0 } },
        'broken-room.json',
      ),
    ).toThrow(/broken-room\.json\.metadata\.weight: must be greater than zero/);
  });

  it('compiles a "puddle" hazard into the room geometry\'s slick zone (#35)', () => {
    const withPuddle = {
      ...cellarCrossroads,
      hazards: [{ x: 10, y: 20, width: 30, height: 40, type: 'puddle' }],
    };
    const compiled = compileRoomTemplate(withPuddle, 1, 'with-puddle.json', ENEMY_DEFINITIONS);
    // Compiled coordinates carry the room's margin offset, the same as every
    // other spawn/prop position `compileRoomTemplate` returns.
    const [hazard] = compiled.hazards;
    expect(hazard).toMatchObject({ width: 30, height: 40, type: 'puddle' });
    expect(compiled.geometry.puddleCount).toBe(1);
    expect(compiled.geometry.isOnPuddle((hazard?.x ?? 0) + 15, (hazard?.y ?? 0) + 20)).toBe(true);
  });

  it('round-trips a non-"puddle" hazard without giving it slick behaviour', () => {
    const withDecor = {
      ...cellarCrossroads,
      hazards: [{ x: 10, y: 20, width: 30, height: 40, type: 'spikes' }],
    };
    const compiled = compileRoomTemplate(withDecor, 1, 'with-decor.json', ENEMY_DEFINITIONS);
    expect(compiled.hazards).toMatchObject([{ width: 30, height: 40, type: 'spikes' }]);
    expect(compiled.geometry.puddleCount).toBe(0);
  });

  it('rejects an unknown enemy in a spawn group', () => {
    const broken = {
      ...cellarCrossroads,
      spawnGroups: cellarCrossroads.spawnGroups.map((group) => ({
        ...group,
        choices: group.choices.map((choice) => ({ ...choice, enemyId: 'missing-enemy' })),
      })),
    };

    expect(() => validateRoomTemplate(broken, 'broken-room.json', ENEMY_DEFINITIONS)).toThrow(
      /broken-room\.json\.spawnGroups\[0\]\.choices\[0\]\.enemyId: does not name a registered enemy/,
    );
  });

  it('falls back to the nearest-floor choice instead of throwing when no choice covers the floor (#37)', () => {
    // A floor with no roster of its own authored yet — Floor 2 before #38's
    // boss landed was exactly this shape for one room. Compiling must not
    // throw: a content gap like this has to reach a player as *something*,
    // never as a frozen game.
    const template = {
      ...cellarCrossroads,
      spawnGroups: [
        {
          id: 'melee',
          count: 1,
          choices: [{ enemyId: 'kellerassel', minFloor: 1, maxFloor: 1 }],
        },
      ],
    };

    const compiled = compileRoomTemplate(template, 5, 'gap-room.json', ENEMY_DEFINITIONS);
    // The only authored choice, even though its own range (1-1) doesn't
    // cover floor 5 — the nearest floor with real content, not a crash.
    // cellarCrossroads' "melee" group is placed twice (two enemySpawns
    // entries), hence two identical results.
    expect(compiled.enemyIds).toEqual(['kellerassel', 'kellerassel']);
  });

  it("floor 2's mini-boss slot is reached through the real progression, and holds a real fight (#277)", () => {
    // `CLAUDE.md`'s "reachable means through the real progression, not just a
    // direct load": loading `dorf-miniboss.json` by hand proves the band
    // renders, not that a player ever meets it. This walks the same
    // `generateFloor` path `app/main.ts` does, on the floor-2 config, and
    // checks the slot is placed *and* what compiles into it.
    //
    // Floor 2 is already inside `HIGHEST_PLAYABLE_FLOOR`, so there is no gate
    // constant to bump here — this issue replaces a shipped room's occupants
    // rather than adding a floor. That is exactly why it is worth a test: the
    // gate being already open is easy to assume and cheap to check.
    const pool: readonly RoomTemplate[] = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    const floor2Config = FLOOR_CONFIGS.find((config) => config.floor === 2);
    if (floor2Config === undefined) {
      throw new Error('no floor 2 config');
    }

    const rolled = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const plan = generateFloor(new Rng(seed + 1), floor2Config, pool);
      expect(
        plan.minibossRoomIds.length,
        `seed ${String(seed)} placed no mini-boss room`,
      ).toBeGreaterThanOrEqual(1);
      for (const roomId of plan.minibossRoomIds) {
        const slot = plan.rooms.find((room) => room.id === roomId);
        const template = pool.find((room) => room.id === slot?.templateId);
        expect(template?.id).toBe('dorf-miniboss');
        // The same `chooseSpawnIndex` callback `GameSim.loadRoom` supplies from
        // the run's own enemy stream — without it a `count: 1` group always
        // lands on choice 0 and the second fight would never appear.
        const roll = new Rng(seed + 101);
        const compiled = compileRoomTemplate(
          template,
          2,
          'dorf-miniboss.json',
          ENEMY_DEFINITIONS,
          { cells: [{ col: 0, row: 0 }] },
          (count) => Math.floor(roll.nextFloat() * count),
        );
        for (const id of compiled.enemyIds) {
          rolled.add(id);
        }
      }
    }

    // Both fights turn up across the seeds — the slot is a real roll, not one
    // authored fight with a second one nobody meets — and the band always
    // arrives as all three of itself.
    expect(rolled.has('der-ladewagen')).toBe(true);
    expect(rolled.has('die-blaskapelle-tuba')).toBe(true);
    expect(rolled.has('die-blaskapelle-trompete')).toBe(true);
    expect(rolled.has('die-blaskapelle-posaune')).toBe(true);
    // ...and nothing else: the placeholder Kuh/Bauer are gone from the slot.
    expect([...rolled].sort()).toEqual([
      'der-ladewagen',
      'die-blaskapelle-posaune',
      'die-blaskapelle-trompete',
      'die-blaskapelle-tuba',
    ]);
  });

  it("places a choice's escorts with it, and only on the run that rolled it (#277)", () => {
    // Die Blaskapelle is three bodies standing in an authored formation, and
    // the formation is the fight. Escorts hang off the *choice* rather than
    // the group so the run that rolls Der Ladewagen does not get two
    // bandsmen standing next to a tractor.
    const template = {
      ...cellarCrossroads,
      enemySpawns: [{ x: 120, y: 72, group: 'melee' }],
      spawnGroups: [
        {
          id: 'melee',
          count: 1,
          choices: [
            {
              enemyId: 'die-blaskapelle-tuba',
              minFloor: 2,
              maxFloor: 2,
              escorts: [
                { enemyId: 'die-blaskapelle-trompete', dx: -44, dy: 14 },
                { enemyId: 'die-blaskapelle-posaune', dx: 44, dy: 14 },
              ],
            },
          ],
        },
      ],
    };

    const compiled = compileRoomTemplate(template, 2, 'band.json', ENEMY_DEFINITIONS);
    expect(compiled.enemyIds).toEqual([
      'die-blaskapelle-tuba',
      'die-blaskapelle-trompete',
      'die-blaskapelle-posaune',
    ]);
    // Positions are asserted as *offsets from the leader*, not absolutes: the
    // formation is the authored thing, and where the group's own spawn point
    // ends up is the template's business.
    const [tuba, trompete, posaune] = compiled.enemySpawns;
    expect(tuba).toBeDefined();
    expect([(trompete?.x ?? 0) - (tuba?.x ?? 0), (trompete?.y ?? 0) - (tuba?.y ?? 0)]).toEqual([
      -44, 14,
    ]);
    expect([(posaune?.x ?? 0) - (tuba?.x ?? 0), (posaune?.y ?? 0) - (tuba?.y ?? 0)]).toEqual([
      44, 14,
    ]);
  });

  it('rejects an escort naming an enemy that does not exist (#277)', () => {
    // A gap degrades (`nearestFloorChoice`); a *bug* throws, per
    // `docs/DECISIONS.md` #7 — and a misspelled escort is the second.
    const template = {
      ...cellarCrossroads,
      spawnGroups: [
        {
          id: 'melee',
          count: 1,
          choices: [
            {
              enemyId: 'kellerassel',
              minFloor: 1,
              maxFloor: 1,
              escorts: [{ enemyId: 'die-blaskapelle-trompette', dx: 8, dy: 0 }],
            },
          ],
        },
      ],
    };
    expect(() => validateRoomTemplate(template, 'typo.json', ENEMY_DEFINITIONS)).toThrow(
      /escorts\[0\]\.enemyId: does not name a registered enemy/,
    );
  });

  it('picks whichever authored choice is nearest the requested floor, either direction', () => {
    const template = {
      ...cellarCrossroads,
      spawnGroups: [
        {
          id: 'melee',
          count: 1,
          choices: [
            { enemyId: 'kellerassel', minFloor: 1, maxFloor: 2 },
            { enemyId: 'bierratte', minFloor: 6, maxFloor: 7 },
          ],
        },
      ],
    };

    // Floor 4 sits closer to the "1-2" choice's upper edge (distance 2) than
    // to the "6-7" choice's lower edge (distance 2 too — a tie, resolved by
    // declaration order) and floor 5 sits strictly closer to "6-7".
    expect(compileRoomTemplate(template, 4, 'gap-room.json', ENEMY_DEFINITIONS).enemyIds).toEqual([
      'kellerassel',
      'kellerassel',
    ]);
    expect(compileRoomTemplate(template, 5, 'gap-room.json', ENEMY_DEFINITIONS).enemyIds).toEqual([
      'bierratte',
      'bierratte',
    ]);
  });

  it('defaults to the first choice, but lets a caller pick between several simultaneously-eligible ones (#156)', () => {
    // Two choices both eligible for the same floor, on a `count: 1` group —
    // `dorf-marktplatz.json`'s own "market" shape, authored as "bauer or
    // gockel here" but, before this parameter existed, only ever able to
    // produce "bauer": `index % resolved.length` never reaches index 1 when
    // `count` is 1, so the second choice was dead weight, not a real
    // alternative.
    const template = {
      ...cellarCrossroads,
      spawnGroups: [
        {
          id: 'melee',
          count: 1,
          choices: [
            { enemyId: 'kellerassel', minFloor: 1, maxFloor: 7 },
            { enemyId: 'bierratte', minFloor: 1, maxFloor: 7 },
          ],
        },
      ],
    };

    // No callback: exactly the old behaviour, so every existing caller
    // (this file's own tests included) stays exactly as deterministic.
    expect(compileRoomTemplate(template, 1, 'two-choice.json', ENEMY_DEFINITIONS).enemyIds).toEqual(
      ['kellerassel', 'kellerassel'],
    );

    // A callback that always picks the last option reaches the choice the
    // default path never could.
    expect(
      compileRoomTemplate(
        template,
        1,
        'two-choice.json',
        ENEMY_DEFINITIONS,
        undefined,
        (count) => count - 1,
      ).enemyIds,
    ).toEqual(['bierratte', 'bierratte']);
  });

  it('never consults the picker for a group with only one eligible choice, or a cluster bigger than one', () => {
    let calls = 0;
    const countingPicker = (count: number): number => {
      calls += 1;
      return count - 1;
    };

    // `cellarCrossroads`'s own "melee" group: one choice, count 1 — nothing
    // to pick between, so the picker must never even be called.
    compileRoomTemplate(
      cellarCrossroads,
      1,
      'single-choice.json',
      ENEMY_DEFINITIONS,
      undefined,
      countingPicker,
    );
    expect(calls).toBe(0);

    // A cluster (`count > 1`) keeps its own `index % resolved.length` mix —
    // the picker is for a single-body group's dead alternative, not this.
    const clustered = {
      ...cellarCrossroads,
      spawnGroups: [
        {
          id: 'melee',
          count: 2,
          choices: [
            { enemyId: 'kellerassel', minFloor: 1, maxFloor: 7 },
            { enemyId: 'bierratte', minFloor: 1, maxFloor: 7 },
          ],
        },
      ],
    };
    const compiled = compileRoomTemplate(
      clustered,
      1,
      'clustered.json',
      ENEMY_DEFINITIONS,
      undefined,
      countingPicker,
    );
    expect(calls).toBe(0);
    expect(compiled.enemyIds).toEqual(['kellerassel', 'bierratte', 'kellerassel', 'bierratte']);
  });
});

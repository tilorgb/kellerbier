import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  isMultiCellRoomTemplate,
} from '../../src/content/rooms/definition.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';

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

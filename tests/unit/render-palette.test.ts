import { describe, expect, it } from 'vitest';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { DEFAULT_ROOM_THEME, roomThemeForFloor } from '../../src/render/palette.js';

describe('render/palette: roomThemeForFloor', () => {
  it.each(FLOOR_CONFIGS)('has its own RoomTheme for floor $floor ($name)', ({ floor }) => {
    const theme = roomThemeForFloor(floor);
    expect(theme).not.toBe(DEFAULT_ROOM_THEME);
  });

  it('gives every floor a theme distinct from every other floor', () => {
    const themes = FLOOR_CONFIGS.map((config) => roomThemeForFloor(config.floor));
    const serialized = themes.map((theme) => JSON.stringify(theme));
    expect(new Set(serialized).size).toBe(themes.length);
  });

  it('falls back to DEFAULT_ROOM_THEME for a floor with no authored theme', () => {
    expect(roomThemeForFloor(0)).toBe(DEFAULT_ROOM_THEME);
    expect(roomThemeForFloor(99)).toBe(DEFAULT_ROOM_THEME);
  });

  it("shares one highlight colour between a floor's wall and block edges", () => {
    // The one arrangement rule every `RoomTheme` — hand-tuned or derived —
    // follows (`palette.ts`'s own doc comment on `ROOM_THEMES`): a room's
    // obstacles pick up the same highlight its wall band does, rather than
    // inventing a second edge colour nothing else on the floor uses.
    for (const config of FLOOR_CONFIGS) {
      const theme = roomThemeForFloor(config.floor);
      expect(theme.blockEdge).toBe(theme.wallEdge);
    }
  });
});

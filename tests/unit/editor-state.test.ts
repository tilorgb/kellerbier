import { describe, expect, it } from 'vitest';
import { ROOM_SHAPES } from '../../src/content/rooms/definition.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { createBlankDraft, floorNumberForTags, fromRoomTemplate } from '../../src/editor/state.js';

describe('editor state: shape round-trip', () => {
  it.each(ROOM_SHAPES)(
    'fromRoomTemplate preserves shape %s rather than falling back to 1x1',
    (shape) => {
      const draft = createBlankDraft(shape, 'test-room');
      const raw = {
        id: draft.id,
        cells: draft.cells,
        metadata: { shape, floorTags: draft.floorTags },
      };

      expect(fromRoomTemplate(raw).shape).toBe(shape);
    },
  );
});

describe('editor state: floorNumberForTags', () => {
  it.each(FLOOR_CONFIGS)('resolves floorTag $floorTag to floor $floor', ({ floorTag, floor }) => {
    expect(floorNumberForTags([floorTag])).toBe(floor);
  });

  it("picks the first tag's floor when a draft carries several", () => {
    expect(floorNumberForTags(['rural', 'cellar'])).toBe(2);
  });

  it('falls back to floor 1 for an unrecognised or empty tag list', () => {
    expect(floorNumberForTags(['not-a-real-tag'])).toBe(1);
    expect(floorNumberForTags([])).toBe(1);
  });
});

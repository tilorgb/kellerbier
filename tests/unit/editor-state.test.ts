import { describe, expect, it } from 'vitest';
import { ROOM_SHAPES } from '../../src/content/rooms/definition.js';
import { createBlankDraft, fromRoomTemplate } from '../../src/editor/state.js';

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

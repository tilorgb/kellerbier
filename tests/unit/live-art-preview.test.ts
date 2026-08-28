import { describe, expect, it } from 'vitest';
import {
  LIVE_PREVIEW_MESSAGE_TYPE,
  isLiveArtPreviewMessage,
} from '../../src/render/live-art-preview.js';

const VALID = {
  type: LIVE_PREVIEW_MESSAGE_TYPE,
  name: 'kellerassel',
  category: 'character',
  width: 16,
  height: 16,
  pixels: 'AAAA',
};

describe('isLiveArtPreviewMessage', () => {
  it('accepts a well-formed message', () => {
    expect(isLiveArtPreviewMessage(VALID)).toBe(true);
  });

  it('rejects a message with the wrong type tag', () => {
    expect(isLiveArtPreviewMessage({ ...VALID, type: 'something-else' })).toBe(false);
  });

  it.each(['name', 'category', 'pixels'] as const)(
    'rejects a message with a non-string %s',
    (field) => {
      expect(isLiveArtPreviewMessage({ ...VALID, [field]: 42 })).toBe(false);
    },
  );

  it.each(['width', 'height'] as const)('rejects a message with a non-number %s', (field) => {
    expect(isLiveArtPreviewMessage({ ...VALID, [field]: '16' })).toBe(false);
  });

  it.each([null, undefined, 42, 'string', [], true])('rejects non-object value %s', (value) => {
    expect(isLiveArtPreviewMessage(value)).toBe(false);
  });
});

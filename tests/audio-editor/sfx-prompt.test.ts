import { describe, expect, it } from 'vitest';
import { suggestSfxPrompt } from '../../src/audio-editor/sfx-prompt.js';
import { SFX_DEFINITIONS } from '../../src/content/audio/sfx.js';

describe('suggestSfxPrompt', () => {
  it('gives every shipped sound an authored idea, not the derived fallback', () => {
    for (const sfx of SFX_DEFINITIONS) {
      const prompt = suggestSfxPrompt(sfx);
      expect(prompt, sfx.id).toContain('close microphone');
      expect(prompt, sfx.id).not.toContain(sfx.description.slice(0, 20));
    }
  });

  it('derives an idea from the synth parameters for an unknown id', () => {
    const prompt = suggestSfxPrompt({
      id: 'hit-new',
      description: 'A new thing (#999) takes a hit.',
      noise: { filter: { type: 'lowpass', frequencyHz: 300, q: 1 }, durationSeconds: 0.05, gain: 0.4 },
      tone: { instrument: 'brass-stab', note: 'C4', durationSeconds: 0.1 },
      repeat: { count: 3, intervalSeconds: 0.05 },
    });
    expect(prompt).toContain('A new thing takes a hit');
    expect(prompt).toContain('low dull thud');
    expect(prompt).toContain('brass stab note around C4');
    expect(prompt).toContain('3 rapid repeats');
  });
});

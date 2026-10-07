import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GENERATED_HEADING,
  SoundBenchOfflineError,
  benchRequestFor,
  forgetGeneratedFile,
  generateTakes,
  isRecordedAsGenerated,
  recordGeneratedFile,
  validateGeneratedOrigin,
} from '../../tools/audio-editor/sound-bench.mjs';

const ORIGIN = { prompt: 'a glass clink', seed: 1234, take: 2, count: 4 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('benchRequestFor', () => {
  it('asks for a one-shot unless told otherwise', () => {
    expect(benchRequestFor({ prompt: '  a glass clink  ' })).toMatchObject({
      prompt: 'a glass clink',
      pick: 'loudest',
      format: 'mp3',
    });
    expect(benchRequestFor({ prompt: 'rain', pick: 'all' }).pick).toBe('all');
  });

  it('refuses an empty prompt before the bench is ever called', () => {
    expect(() => benchRequestFor({ prompt: '   ' })).toThrow(/prompt/);
    expect(() => benchRequestFor({})).toThrow(/prompt/);
  });

  it('keeps the take length and count inside what the bench can make', () => {
    const request = benchRequestFor({ prompt: 'x', seconds: 900, count: 99 });
    expect(request.seconds).toBe(20);
    expect(request.count).toBe(8);
  });
});

describe('generateTakes', () => {
  it('says how to start the bench when nothing is listening', async () => {
    const offline = (): Promise<Response> => Promise.reject(new TypeError('fetch failed'));
    await expect(generateTakes({ prompt: 'x' }, offline)).rejects.toBeInstanceOf(
      SoundBenchOfflineError,
    );
    await expect(generateTakes({ prompt: 'x' }, offline)).rejects.toThrow(/start-sound-bench/);
  });

  it("passes the bench's own failure on rather than calling it offline", async () => {
    const failing = (): Promise<Response> =>
      Promise.resolve(json({ error: 'ComfyUI rejected the workflow' }, 500));
    await expect(generateTakes({ prompt: 'x' }, failing)).rejects.toThrow(/rejected the workflow/);
  });

  it('returns each usable take with its bytes, keeping its place in the batch, and counts the rest', async () => {
    const bench: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : '';
      if (url.endsWith('/generate')) {
        return Promise.resolve(
          json({
            seed: 77,
            format: 'mp3',
            takes: [
              { report: { ok: false, reason: 'silent' }, candidateUrl: null },
              {
                report: { ok: true, seconds: 0.4, events: 3, fillsTake: false },
                candidateUrl: '/result/x/take_00002_candidate.mp3',
              },
            ],
          }),
        );
      }
      expect(url).toMatch(/take_00002_candidate\.mp3$/);
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    };

    const result = await generateTakes({ prompt: 'a glass clink' }, bench);
    expect(result).toMatchObject({ prompt: 'a glass clink', seed: 77, count: 2, dropped: 1 });
    expect(result.takes).toEqual([
      { take: 2, seconds: 0.4, events: 3, fillsTake: false, dataBase64: 'AQID' },
    ]);
  });
});

describe('validateGeneratedOrigin', () => {
  it('accepts a prompt with a seed and a place in a batch', () => {
    expect(validateGeneratedOrigin(ORIGIN)).toBeNull();
  });

  it('names what is missing', () => {
    expect(validateGeneratedOrigin({ ...ORIGIN, prompt: '' })).toMatch(/prompt/);
    expect(validateGeneratedOrigin({ ...ORIGIN, seed: 1.5 })).toMatch(/seed/);
    expect(validateGeneratedOrigin(null)).toMatch(/prompt/);
  });
});

describe('the generated-files table', () => {
  const README = [
    '# Recorded audio assets',
    '',
    GENERATED_HEADING,
    '',
    'Prose.',
    '',
    '| File | Prompt | Seed | Added |',
    '|---|---|---|---|',
    '',
    '## What goes here',
    '',
    'More prose.',
    '',
  ].join('\n');

  const entry = { fileName: 'clink.mp3', origin: ORIGIN, date: '2026-10-07' };

  it('adds a row to the table, inside its own section', () => {
    const lines = recordGeneratedFile(README, entry).split('\n');
    const row = lines.indexOf('| `clink.mp3` | a glass clink | 1234, take 2 of 4 | 2026-10-07 |');
    expect(row).toBe(lines.indexOf('|---|---|---|---|') + 1);
    expect(row).toBeLessThan(lines.indexOf('## What goes here'));
  });

  it('replaces the row of a file generated again instead of listing it twice', () => {
    const once = recordGeneratedFile(README, entry);
    const twice = recordGeneratedFile(once, {
      ...entry,
      origin: { ...ORIGIN, prompt: 'a duller clink', seed: 9 },
    });
    expect(twice.split('\n').filter((line) => line.includes('`clink.mp3`'))).toEqual([
      '| `clink.mp3` | a duller clink | 9, take 2 of 4 | 2026-10-07 |',
    ]);
  });

  it('keeps a prompt with a pipe or a line break from breaking the row', () => {
    const text = recordGeneratedFile(README, {
      ...entry,
      origin: { ...ORIGIN, prompt: 'clink | clank\nthen silence' },
    });
    expect(text).toContain('| clink \\| clank then silence |');
  });

  it('tells a generated file from a recording, and forgets one that was recorded over', () => {
    const listed = recordGeneratedFile(README, entry);
    expect(isRecordedAsGenerated(listed, 'clink.mp3')).toBe(true);
    expect(isRecordedAsGenerated(listed, 'click.mp3')).toBe(false);
    expect(forgetGeneratedFile(listed, 'clink.mp3')).toBe(README);
    expect(forgetGeneratedFile(README, 'click.mp3')).toBe(README);
  });

  it('refuses to guess where the section is', () => {
    expect(() => recordGeneratedFile('# No such section\n', entry)).toThrow(/Generated files/);
  });

  it('can record into the README that is actually checked in', () => {
    const real = readFileSync('assets/audio/README.md', 'utf8');
    const recorded = recordGeneratedFile(real, entry);
    expect(isRecordedAsGenerated(recorded, 'clink.mp3')).toBe(true);
    expect(forgetGeneratedFile(recorded, 'clink.mp3')).toBe(real);
  });
});

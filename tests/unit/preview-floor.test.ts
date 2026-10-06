import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  choosePreviewFloor,
  closedIssueNumbers,
  floorTagsFromSource,
  pathFloor,
} from '../../tools/ci/preview-floor.mjs';

/**
 * The PR preview link's floor (`tools/ci/preview-floor.mjs`): Floor 3 work
 * opens on floor 3, whole-game work opens a normal run.
 */
const floorTags = floorTagsFromSource(readFileSync('src/content/floors/definition.ts', 'utf8'));
const { milestones } = JSON.parse(readFileSync('tools/roadmap/plan.json', 'utf8')) as {
  milestones: { id: string; name: string }[];
};

const choose = (input: {
  body?: string;
  issues?: { number: number; title?: string; labels?: string[] }[];
  files?: string[];
}) =>
  choosePreviewFloor({
    body: input.body ?? '',
    issues: input.issues ?? [],
    files: input.files ?? [],
    milestones,
    floorTags,
  });

describe('the preview link floor', () => {
  it('reads every floor tag out of the game config', () => {
    expect(floorTags).toMatchObject({ cellar: 1, rural: 2, wald: 3 });
  });

  it('opens Floor 3 work on floor 3, from the closed issue milestone', () => {
    const choice = choose({
      body: 'Closes #404',
      issues: [{ number: 404, title: 'Lantern-darkness rooms', labels: ['gameplay', 'M10'] }],
      files: ['src/render/view.ts'],
    });
    expect(choice.floor).toBe(3);
  });

  it('falls back to the issue title when the milestone names no single floor', () => {
    expect(
      choose({
        body: 'Fixes #9',
        issues: [{ number: 9, title: '[M10] Floor 3 — Enemy: Zecke', labels: ['M5'] }],
      }).floor,
    ).toBe(3);
  });

  it('gives whole-game work the plain link', () => {
    expect(
      choose({
        body: 'Closes #229',
        issues: [{ number: 229, title: 'Pace the game down', labels: ['M8'] }],
        files: ['src/sim/tuning.ts', 'src/render/view.ts'],
      }).floor,
    ).toBeNull();
    expect(choose({ files: ['src/app/settings.ts'] }).floor).toBeNull();
  });

  it('uses the changed files when no closed issue names a floor', () => {
    expect(
      choose({ files: ['src/content/rooms/wald-grove.json', 'src/sim/room/geometry.ts'] }).floor,
    ).toBe(3);
    expect(
      choose({ files: ['src/content/rooms/wald-grove.json', 'src/content/rooms/rural-farm.json'] })
        .floor,
    ).toBeNull();
  });

  it('never adds a floor parameter for floor 1 — a run starts there anyway', () => {
    expect(choose({ files: ['src/content/rooms/cellar-hall.json'] }).floor).toBeNull();
  });

  it('obeys an explicit line in the PR body over everything else', () => {
    const issues = [{ number: 404, labels: ['M10'] }];
    expect(choose({ body: 'Closes #404\nPreview floor: none', issues }).floor).toBeNull();
    expect(
      choose({ body: 'Preview floor: 2', files: ['src/content/rooms/wald-x.json'] }).floor,
    ).toBe(2);
  });

  it('reads the closing keywords GitHub itself honours', () => {
    expect(closedIssueNumbers('Closes #1, fixes #2 and Resolves #3. Part of #39.')).toEqual([
      1, 2, 3,
    ]);
  });

  it('only counts a floor tag as a whole path segment', () => {
    expect(pathFloor('tools/art/authoring/build-floor2-roster.mjs', floorTags)).toBe(2);
    expect(pathFloor('src/content/floors/definition.ts', floorTags)).toBeNull();
    expect(pathFloor('src/render/floor-art.ts', floorTags)).toBeNull();
  });
});

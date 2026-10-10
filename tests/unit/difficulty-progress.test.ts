import { describe, expect, it } from 'vitest';
import { type ProgressionContent, tierWonStatKey } from '../../src/app/meta/definition.js';
import {
  buildRunSetupView,
  earnedNames,
  highestTierOpen,
  withEverythingUnlocked,
  withRunWon,
} from '../../src/app/meta/progress.js';
import { migrateSave } from '../../src/app/save/migrations.js';
import { createDefaultSave, sanitizeSave, SAVE_SCHEMA_VERSION } from '../../src/app/save/schema.js';
import { alois } from '../../src/content/characters/alois.js';
import { resi } from '../../src/content/characters/resi.js';
import { DIFFICULTY_TIERS } from '../../src/content/progression/tiers.js';
import { RunSetupScreen } from '../../src/render/run-setup-screen.js';
import { installPixelFonts } from '../../src/render/ui/font.js';
import { UiKit } from '../../src/render/ui/kit.js';

installPixelFonts();

/**
 * Difficulty tiers (#505), meta side, and the run-setup screen they are
 * chosen on (#493): each character climbs their own ladder, one rung per
 * win, and the screen offers exactly the rungs that are open.
 */

const CONTENT: ProgressionContent = {
  unlocks: [],
  characters: [alois, { ...resi, requires: null }],
  tiers: DIFFICULTY_TIERS,
};

describe('the ladder per character (#505)', () => {
  it('starts closed, and a tier-0 win opens tier 1', () => {
    const fresh = createDefaultSave();
    expect(highestTierOpen(fresh, CONTENT, 'alois')).toBe(0);
    const won = withRunWon(fresh, 'alois', 0, CONTENT);
    expect(highestTierOpen(won, CONTENT, 'alois')).toBe(1);
  });

  it('opens the next rung for the winner only', () => {
    const save = withRunWon(createDefaultSave(), 'alois', 2, CONTENT);
    expect(highestTierOpen(save, CONTENT, 'alois')).toBe(3);
    expect(highestTierOpen(save, CONTENT, 'resi')).toBe(0);
  });

  it('never closes a rung on a lower win, and stops at the top', () => {
    const high = withRunWon(createDefaultSave(), 'alois', 3, CONTENT);
    expect(highestTierOpen(withRunWon(high, 'alois', 0, CONTENT), CONTENT, 'alois')).toBe(4);
    const top = withRunWon(high, 'alois', 5, CONTENT);
    expect(highestTierOpen(top, CONTENT, 'alois')).toBe(5);
    expect(top.statistics[tierWonStatKey('alois')]).toBe(6);
  });

  it('names a newly opened rung, with whose ladder it is on', () => {
    const save = withRunWon(createDefaultSave(), 'alois', 0, CONTENT);
    expect([...earnedNames(save, CONTENT).entries()]).toContainEqual([
      'tier:alois:1',
      'Tier 1 (Alois)',
    ]);
  });

  it('"unlock everything" opens every rung for everyone', () => {
    const save = withEverythingUnlocked(createDefaultSave(), CONTENT);
    expect(highestTierOpen(save, CONTENT, 'alois')).toBe(5);
    expect(highestTierOpen(save, CONTENT, 'resi')).toBe(5);
  });
});

describe('the run-setup view (#493)', () => {
  it('lists the roster and only the open rungs of the selected character', () => {
    const save = {
      ...withRunWon(createDefaultSave(), 'alois', 1, CONTENT),
      selectedCharacter: 'alois',
    };
    const view = buildRunSetupView(save, CONTENT);
    expect(view.selected).toBe('alois');
    expect(view.characters.map((row) => row.id)).toEqual(['alois', 'resi']);
    expect(view.highestOpen).toBe(2);
    expect(view.tiers.map((rung) => rung.tier)).toEqual([1, 2]);
    expect(view.tiers[0]?.adds.length).toBeGreaterThan(0);
  });
});

describe('the run-setup screen (#493/#505)', () => {
  function screen(save: ReturnType<typeof createDefaultSave>): {
    screen: RunSetupScreen;
    started: number[];
  } {
    const started: number[] = [];
    const setup = new RunSetupScreen(
      new UiKit(),
      {
        view: () => buildRunSetupView(save, CONTENT),
        cycleCharacter: () => undefined,
        onStart: (tier) => started.push(tier),
        onBack: () => undefined,
      },
      'en',
    );
    setup.resize(640, 360);
    setup.show();
    return { screen: setup, started };
  }

  it('defaults to the highest open tier, and steps through the open ones only', () => {
    const save = withRunWon(createDefaultSave(), 'alois', 1, CONTENT);
    const { screen: setup, started } = screen(save);
    expect(setup.selectedTier).toBe(2);
    setup.moveFocus(1); // the tier row
    setup.adjust(1);
    expect(setup.selectedTier).toBe(0); // wraps past the top back to the plain game
    setup.adjust(-1);
    expect(setup.selectedTier).toBe(2);
    setup.adjust(-1);
    expect(setup.selectedTier).toBe(1);
    setup.moveFocus(1); // Start
    setup.activate();
    expect(started).toEqual([1]);
  });

  it('starts on tier 0 when nothing is open, and the tier row cannot be chosen', () => {
    const { screen: setup, started } = screen(createDefaultSave());
    expect(setup.selectedTier).toBe(0);
    // The tier row is disabled, so one step down from the character row lands on Start.
    setup.moveFocus(1);
    setup.activate();
    expect(started).toEqual([0]);
  });
});

describe('save v11 (#505)', () => {
  it('back-fills a v10 run in progress with tier 0', () => {
    const v10 = {
      schemaVersion: 10,
      activeRun: {
        seed: 3,
        frames: [0, 0, 0, 0, 0],
        promilleUnlocked: true,
        character: 'alois',
        lockedItems: ['krapfen'],
      },
    };
    const migrated = sanitizeSave(migrateSave(v10));
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.activeRun?.tier).toBe(0);
    expect(migrated.activeRun?.lockedItems).toEqual(['krapfen']);
  });

  it('keeps a recorded tier on an active run and a replay', () => {
    const saved = sanitizeSave({
      schemaVersion: SAVE_SCHEMA_VERSION,
      activeRun: { seed: 1, frames: [0, 0, 0, 0, 0], tier: 3 },
      replays: [
        {
          id: 'r',
          seed: 1,
          frames: 'x',
          floor: 2,
          ticksSurvived: 9,
          kills: 0,
          recordedAt: 1,
          tier: 4,
        },
      ],
    });
    expect(saved.activeRun?.tier).toBe(3);
    expect(saved.replays[0]?.tier).toBe(4);
  });
});

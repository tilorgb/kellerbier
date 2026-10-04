import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { SKILL_PROFILES } from './lib/bot.js';
import { type PlaytestOutcome, runPlaytest } from './lib/harness.js';
import { type ItemIsolationRow, buildItemIsolation, formatItemIsolation } from './lib/items.js';

/**
 * #54's item question, asked one item at a time.
 *
 * The nightly sweep (`run.test.ts`) grants whole loadouts, so every item in a
 * loadout shares that loadout's result and its item table is "a lead to
 * check by hand, not a verdict" (`docs/BALANCE_METHODOLOGY.md` §2). This is
 * the check by hand, automated: each item on its own, against a run with no
 * items at all, on the same seeds and skill profiles — a paired comparison,
 * so what differs between the two rows is the item and nothing else.
 *
 * Off unless asked for. It is about a thousand runs, and nothing in it is a
 * gate except a crash:
 *
 *   PLAYTEST_ITEMS=1 npm run playtest          (8 seeds)
 *   PLAYTEST_ITEMS=20 npm run playtest         (20 seeds)
 *
 * Writes `playtest/items.json` and `playtest/items.md`.
 */

const requested = Math.trunc(Number(process.env.PLAYTEST_ITEMS)) || 0;
const SEED_COUNT = requested > 1 ? requested : 8;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => 201 + index);
const OUT_DIR = fileURLToPath(new URL('../../playtest/', import.meta.url));

function sweep(itemIds: readonly string[]): PlaytestOutcome[] {
  const outcomes: PlaytestOutcome[] = [];
  for (const seed of SEEDS) {
    for (const skill of Object.values(SKILL_PROFILES)) {
      outcomes.push(runPlaytest({ seed, items: ITEM_DEFINITIONS, loadoutItemIds: itemIds, skill }));
    }
  }
  return outcomes;
}

describe('item isolation (#54)', () => {
  it.skipIf(requested === 0)(
    'plays every item on its own against an empty-handed baseline, with no crash',
    () => {
      const baseline = sweep([]);
      const perItem = new Map<string, PlaytestOutcome[]>();
      for (const item of ITEM_DEFINITIONS) {
        perItem.set(item.id, sweep([item.id]));
      }

      const report = buildItemIsolation(baseline, perItem);
      mkdirSync(dirname(`${OUT_DIR}items.json`), { recursive: true });
      writeFileSync(`${OUT_DIR}items.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      const markdown = formatItemIsolation(report);
      writeFileSync(`${OUT_DIR}items.md`, `${markdown}\n`, 'utf8');
      process.stdout.write(`\n${markdown}\n`);

      const crashed: string[] = [];
      for (const [itemId, outcomes] of perItem) {
        for (const outcome of outcomes) {
          if (outcome.result === 'crashed') {
            crashed.push(
              `${itemId}, seed ${String(outcome.seed)}, ${outcome.skill}: ${outcome.errorMessage ?? 'unknown error'}`,
            );
          }
        }
      }
      expect(crashed).toEqual([]);
      expect(report.items.map((row: ItemIsolationRow) => row.itemId)).toHaveLength(
        ITEM_DEFINITIONS.length,
      );
    },
    30 * 60 * 1000,
  );
});

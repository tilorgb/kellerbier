import { describe, expect, it } from 'vitest';
import { DEATH_WORD_POOL } from '../../src/content/death-words.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { PICKUP_DEFINITIONS } from '../../src/content/pickups/index.js';
import { PromilleTier, type PromilleTierId } from '../../src/sim/game/promille.js';
import {
  promilleKaterLabel,
  promilleMeterLabel,
  promilleTierDisplayName,
} from '../../src/sim/game/promille.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../../src/render/resolution.js';
import { DISPLAY_FACE, TEXT_FACE } from '../../src/render/ui/font-compile.js';

/**
 * #154's third acceptance criterion, as arithmetic: *the longest German
 * string in the current UI fits its element without overflow, checked against
 * the real strings rather than English placeholders.*
 *
 * This is the whole reason the project owns its font rather than asking the
 * browser for `monospace`. Against a system face the question is unanswerable
 * without a screenshot on the machine in question; against bitmaps we drew,
 * it is a sum of advances, and it can fail a pull request.
 *
 * Everything below is in **UI pixels** — the units every HUD component lays
 * itself out in, and at the default text scale one of them is one pixel of
 * the 640×360 frame (`render/ui/text.ts`).
 */

/** Both sides of the neutral reskin (#33): a relabelled meter is still a real string. */
const RESKINS = [false, true] as const;

const TIERS: readonly PromilleTierId[] = [
  PromilleTier.Nuchtern,
  PromilleTier.Angeheitert,
  PromilleTier.Beduselt,
  PromilleTier.Vollrausch,
  PromilleTier.Sturzbesoffen,
  PromilleTier.Filmriss,
  PromilleTier.Umgfalln,
];

/** `HUD_MARGIN` in `app/main.ts`. The HUD's own inset from the frame. */
const HUD_MARGIN = 6;

/** Where `PromilleHud`'s label starts: its icon, its gap, its bar, and the gap after it. */
const PROMILLE_LABEL_X = 7 + 2 + 60 + 4;

/** `TextPlate`'s horizontal padding, both sides. */
const PLATE_PADDING_X = 10;

function fits(text: string, budget: number, what: string): void {
  const width = TEXT_FACE.measure(text);
  expect(
    width,
    `${what}: "${text}" is ${String(width)}px, over its ${String(budget)}px`,
  ).toBeLessThanOrEqual(budget);
}

describe('the real German UI strings fit the elements that draw them', () => {
  it('fits every Promille readout in the row left of the frame edge', () => {
    // The widest this line ever gets: the longest tier name, a two-digit
    // reading, the Kater suffix, and a Trinkfest that has moved off baseline.
    const budget = INTERNAL_WIDTH - HUD_MARGIN * 2 - PROMILLE_LABEL_X;
    for (const neutral of RESKINS) {
      for (const tier of TIERS) {
        const line = `${promilleTierDisplayName(tier, neutral)} 12.3‰ ${promilleKaterLabel(neutral)} T+9`;
        fits(line, budget, 'Promille row');
      }
    }
  });

  it('fits the meter label itself', () => {
    for (const neutral of RESKINS) {
      fits(promilleMeterLabel(neutral), 60, 'Promille meter label');
    }
  });

  it('fits every item name and its activation prompt in the active-item row', () => {
    // `ActiveItemHud`: the slot, a gap, then the label, which runs to the
    // frame's right edge.
    const budget = INTERNAL_WIDTH - HUD_MARGIN * 2 - (14 + 3);
    for (const item of ITEM_DEFINITIONS) {
      fits(`${item.name} [Leertaste]`, budget, 'active item row');
      fits(`${item.name} (rausch)`, budget, 'active item row, dormant');
      fits(`${item.name} 100%`, budget, 'active item row, charging');
    }
  });

  it('fits every held gated item on one row of the item-gate list', () => {
    const budget = INTERNAL_WIDTH - HUD_MARGIN * 2 - (8 + 3);
    for (const item of ITEM_DEFINITIONS) {
      fits(item.name, budget, 'item gate row');
    }
  });

  it('fits every pickup toast on a plate inside the frame', () => {
    // `pickupToast` is centred, so it may use the whole frame minus its own
    // plate padding — but a toast wider than that is a toast with its ends
    // hanging off both sides of the screen.
    const budget = INTERNAL_WIDTH - PLATE_PADDING_X - HUD_MARGIN * 2;
    for (const pickup of PICKUP_DEFINITIONS) {
      fits(`${pickup.name} — ${pickup.description}`, budget, 'pickup toast');
    }
    for (const item of ITEM_DEFINITIONS) {
      fits(`${item.name} — ${item.description}`, budget, 'item toast');
    }
  });

  it('fits every shop preview, price and all', () => {
    const budget = INTERNAL_WIDTH - PLATE_PADDING_X - HUD_MARGIN * 2;
    for (const item of ITEM_DEFINITIONS) {
      fits(
        `${item.name} — ${item.description} — 99 Biermarken (nicht genug)`,
        budget,
        'shop preview',
      );
    }
  });

  it('fits every pedestal name plate', () => {
    const budget = INTERNAL_WIDTH - PLATE_PADDING_X - HUD_MARGIN * 2;
    for (const item of ITEM_DEFINITIONS) {
      fits(`${item.name}  [use]`, budget, 'pedestal name plate');
    }
  });

  it('fits every floor name and its flavour line on the title card', () => {
    // The name is drawn in the display face at three times its authored size,
    // which is where a long floor name would run off a card first.
    const nameScale = 3;
    for (const config of FLOOR_CONFIGS) {
      const nameWidth = DISPLAY_FACE.measure(config.name) * nameScale;
      expect(
        nameWidth,
        `floor card: "${config.name}" is ${String(nameWidth)}px wide`,
      ).toBeLessThanOrEqual(INTERNAL_WIDTH - 24);
      fits(config.flavour, INTERNAL_WIDTH - 48, 'floor card flavour');
    }
  });

  it('fits every death word on the game-over screen', () => {
    const headlineScale = 3;
    for (const word of DEATH_WORD_POOL) {
      const width = DISPLAY_FACE.measure(word) * headlineScale;
      expect(width, `death word: "${word}" is ${String(width)}px wide`).toBeLessThanOrEqual(
        INTERNAL_WIDTH - 24,
      );
    }
  });

  it('keeps the whole top-left HUD stack inside the frame', () => {
    // Health (two rows of mugs), Promille, wallet, the active item and up to
    // ten gated-item rows, each with a two-pixel gap. A stack that ran past
    // the bottom of the frame would push its last rows off screen on the one
    // run that actually held ten gated items.
    const stack = 6 + (21 + 2) + (10 + 2) + (10 + 2) + (14 + 2) + 10 * 11;
    expect(stack).toBeLessThanOrEqual(INTERNAL_HEIGHT);
  });
});

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
import { seasonedTextWidth } from '../../src/render/ui/text.js';
import { LOCALES } from '../../src/i18n/locale.js';
import { t, type DictKey } from '../../src/i18n/translate.js';

/**
 * #154's third acceptance criterion, as arithmetic, extended by #52 to every
 * locale rather than just the one hand-picked German phrase it used to
 * check: *the longest real string in the current UI, in English, German or
 * Boarisch, fits its element without overflow.*
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

/** Resolves an item/pickup/curse/floor `description`/`flavourText` key in `locale`. */
function d(locale: (typeof LOCALES)[number], key: string): string {
  return t(locale, key as DictKey);
}

describe('every real UI string fits the elements that draw them, in every locale', () => {
  it('fits every Promille readout in the row left of the frame edge', () => {
    // The widest this line ever gets: the longest tier name, a two-digit
    // reading, the Kater suffix, and a Trinkfest that has moved off baseline.
    // Promille tier names are the mechanic's own vocabulary (like "Promille"
    // itself) and are not translated by locale — see `src/i18n/dictionaries/
    // en.ts`'s own doc comment — so this check stays locale-independent.
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

  it('fits every item name and its activation prompt in the active-item row, in every locale', () => {
    // `ActiveItemHud`: the slot, a gap, then the label, which runs to the
    // frame's right edge.
    const budget = INTERNAL_WIDTH - HUD_MARGIN * 2 - (14 + 3);
    for (const locale of LOCALES) {
      for (const item of ITEM_DEFINITIONS) {
        fits(
          t(locale, 'ui.hud.activeItemReady', {
            name: item.name,
            prompt: t(locale, 'ui.hud.unbound'),
          }),
          budget,
          `active item row (${locale})`,
        );
        fits(
          t(locale, 'ui.hud.activeItemDormant', { name: item.name, requirement: 'rausch' }),
          budget,
          `active item row, dormant (${locale})`,
        );
        fits(
          t(locale, 'ui.hud.activeItemCharging', { name: item.name, percent: 100 }),
          budget,
          `active item row, charging (${locale})`,
        );
      }
    }
  });

  it('fits every held gated item on one row of the item-gate list', () => {
    const budget = INTERNAL_WIDTH - HUD_MARGIN * 2 - (8 + 3);
    for (const item of ITEM_DEFINITIONS) {
      fits(item.name, budget, 'item gate row');
    }
  });

  it('fits every pickup toast on a plate inside the frame, in every locale', () => {
    // `pickupToast` is centred, so it may use the whole frame minus its own
    // plate padding — but a toast wider than that is a toast with its ends
    // hanging off both sides of the screen. Unlike the pedestal reveal panel
    // (`PEDESTAL_REVEAL_WRAP` in `app/main.ts`), this plate does not wrap, so
    // a too-long line runs straight off the screen rather than growing taller.
    const budget = INTERNAL_WIDTH - PLATE_PADDING_X - HUD_MARGIN * 2;
    for (const locale of LOCALES) {
      for (const pickup of PICKUP_DEFINITIONS) {
        fits(
          `${pickup.name} — ${d(locale, pickup.description)}`,
          budget,
          `pickup toast (${locale})`,
        );
      }
      // An item's toast (`GameSim.pickUpItem`) shows its flavour text rather
      // than its mechanical description — checked against the same unwrapped
      // budget as the pickup toast above, since a character's starting items
      // (the one path that reaches this toast rather than the wrapped pedestal
      // reveal panel) can show it before the run's first room even loads.
      for (const item of ITEM_DEFINITIONS) {
        const key = item.flavourText ?? item.description;
        fits(`${item.name} — ${d(locale, key)}`, budget, `item toast (${locale})`);
      }
    }
  });

  it('fits every shop preview, price and all, in every locale', () => {
    const budget = INTERNAL_WIDTH - PLATE_PADDING_X - HUD_MARGIN * 2;
    for (const locale of LOCALES) {
      const notEnough = t(locale, 'ui.hud.notEnough');
      for (const item of ITEM_DEFINITIONS) {
        fits(
          `${item.name} — ${d(locale, item.description)} — 99 Biermarken ${notEnough}`,
          budget,
          `shop preview (${locale})`,
        );
      }
    }
  });

  it('fits every pedestal name plate, in every locale', () => {
    const budget = INTERNAL_WIDTH - PLATE_PADDING_X - HUD_MARGIN * 2;
    for (const locale of LOCALES) {
      const useHint = t(locale, 'ui.hud.useHint');
      for (const item of ITEM_DEFINITIONS) {
        fits(`${item.name}  ${useHint}`, budget, `pedestal name plate (${locale})`);
      }
    }
  });

  it('fits every floor name and its flavour line on the title card, in every locale', () => {
    // The name is drawn in the display face at three times its authored size,
    // which is where a long floor name would run off a card first. The name
    // itself is Bavarian in every locale (`docs/CONTENT_BIBLE.md` §0), so
    // only the flavour line actually varies here.
    const nameScale = 3;
    for (const config of FLOOR_CONFIGS) {
      const nameWidth = DISPLAY_FACE.measure(config.name) * nameScale;
      expect(
        nameWidth,
        `floor card: "${config.name}" is ${String(nameWidth)}px wide`,
      ).toBeLessThanOrEqual(INTERNAL_WIDTH - 24);
      for (const locale of LOCALES) {
        // The flavour line carries a `*word*`-marked run (#221), drawn by
        // `SeasonedText` rather than plain `uiText` — its markers cost no
        // pixels, so the budget check measures the line the way it renders.
        const flavourBudget = INTERNAL_WIDTH - 48;
        const flavour = d(locale, config.flavour);
        const flavourWidth = seasonedTextWidth(flavour);
        expect(
          flavourWidth,
          `floor card flavour (${locale}): "${flavour}" is ${String(flavourWidth)}px, over its ${String(flavourBudget)}px`,
        ).toBeLessThanOrEqual(flavourBudget);
      }
    }
  });

  it('fits every death word on the game-over screen', () => {
    // The death-word pool stays Boarisch in every locale, the same "one
    // flavour word, not a translated sentence" rule item names follow — see
    // `docs/CONTENT_BIBLE.md` §7's own open question, settled that way by
    // #52 for consistency with every other proper-noun-shaped string.
    const headlineScale = 3;
    for (const word of DEATH_WORD_POOL) {
      const width = DISPLAY_FACE.measure(word) * headlineScale;
      expect(width, `death word: "${word}" is ${String(width)}px wide`).toBeLessThanOrEqual(
        INTERNAL_WIDTH - 24,
      );
    }
  });

  it('fits every title/pause/credits/game-over/victory/results menu label, in every locale', () => {
    // `Menu`'s own width grows to its widest label (`ui/menu.ts`), so this
    // is not an overflow risk the way a fixed-width plate is — but a label
    // long enough to blow well past the frame would still make an ugly,
    // unusable menu, so it gets a generous budget of its own.
    const budget = INTERNAL_WIDTH - HUD_MARGIN * 4;
    const menuKeys: readonly DictKey[] = [
      'ui.title.start',
      'ui.title.continue',
      'ui.title.settings',
      'ui.title.credits',
      'ui.title.quit',
      'ui.pause.resume',
      'ui.pause.quitToTitle',
      'ui.credits.back',
      'ui.gameOver.retry',
      'ui.gameOver.results',
      'ui.gameOver.hub',
      'ui.victory.retry',
      'ui.results.newRun',
      'ui.results.close',
      'ui.results.backToRun',
    ];
    for (const locale of LOCALES) {
      for (const key of menuKeys) {
        fits(t(locale, key), budget, `menu label (${locale})`);
      }
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

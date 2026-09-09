import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n/locale.js';
import { bar, de, dictKeys, en, t } from '../../src/i18n/translate.js';
import { CURSE_DEFINITIONS } from '../../src/content/curses/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { PICKUP_DEFINITIONS } from '../../src/content/pickups/index.js';

/**
 * The localisation layer's build-time gate (#52): every key `en.ts`
 * declares must resolve, to real non-empty text, in every other locale —
 * and every key any piece of content actually references must exist at
 * all. `de.ts`/`bar.ts` are already typed `Record<DictKey, string>`
 * (`src/i18n/translate.ts`), so a missing key is a TypeScript error before
 * this file ever runs; this suite is the second, human-readable half of
 * that guarantee — the one that survives an `as any` or a stale cast, and
 * the one whose failure message names the exact key and locale, the way
 * `docs/DECISIONS.md` #7's content-validation culture asks every other
 * content gap in this project to fail.
 */
describe('the localisation layer (#52)', () => {
  const dictionaries = { en, de, bar } as const;

  it('resolves every key in every locale, to real text', () => {
    const missing: string[] = [];
    for (const key of dictKeys()) {
      for (const locale of LOCALES) {
        const value = dictionaries[locale][key];
        if (typeof value !== 'string' || value.length === 0) {
          missing.push(`"${key}" is missing (or empty) in locale "${locale}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('has exactly the same key set in every locale — nothing extra, nothing missing', () => {
    const canonical = new Set<string>(dictKeys());
    for (const locale of LOCALES) {
      const keys = new Set(Object.keys(dictionaries[locale]));
      const missingHere = [...canonical].filter((key) => !keys.has(key));
      const extraHere = [...keys].filter((key) => !canonical.has(key));
      expect({ locale, missing: missingHere, extra: extraHere }).toEqual({
        locale,
        missing: [],
        extra: [],
      });
    }
  });

  /**
   * `t()` substitutes every `{name}`-shaped placeholder in a template — a
   * translation that dropped one, or a translator who renamed a variable
   * mid-sentence, would otherwise ship a literal `{seconds}` to a player
   * with no test ever noticing, because English alone would still look
   * right. Checked by re-parsing each locale's own placeholders rather than
   * assuming English's, so a translation is free to use a variable zero,
   * one or several times, in any order.
   */
  it('keeps every locale using the same set of {placeholders} as English', () => {
    const placeholdersIn = (text: string): Set<string> => {
      const found = new Set<string>();
      for (const match of text.matchAll(/\{(\w+)\}/g)) {
        found.add(match[1] ?? '');
      }
      return found;
    };
    const mismatches: string[] = [];
    for (const key of dictKeys()) {
      const englishVars = placeholdersIn(en[key]);
      for (const locale of LOCALES) {
        if (locale === 'en') {
          continue;
        }
        const localeVars = placeholdersIn(dictionaries[locale][key]);
        const missing = [...englishVars].filter((name) => !localeVars.has(name));
        const extra = [...localeVars].filter((name) => !englishVars.has(name));
        if (missing.length > 0 || extra.length > 0) {
          mismatches.push(
            `"${key}" in "${locale}": missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  /**
   * Every content-authored key — an item, a curse, a pickup or a floor's
   * `description`/`flavourText` — actually exists in the dictionary. This
   * is the other direction from the coverage checks above: a typo'd key in
   * a content file (`items.brezn.descriptoin`) round-trips through
   * TypeScript as a plain `string` and would otherwise only ever surface as
   * a literal key leaking onto a player's screen.
   */
  it('resolves every key that content actually references', () => {
    const referenced = new Set<string>();
    for (const item of ITEM_DEFINITIONS) {
      referenced.add(item.description);
      if (item.flavourText !== undefined) {
        referenced.add(item.flavourText);
      }
    }
    for (const curse of CURSE_DEFINITIONS) {
      referenced.add(curse.description);
    }
    for (const pickup of PICKUP_DEFINITIONS) {
      referenced.add(pickup.description);
      if (pickup.soberDescription !== undefined) {
        referenced.add(pickup.soberDescription);
      }
    }
    for (const floor of FLOOR_CONFIGS) {
      referenced.add(floor.flavour);
    }

    const canonical = new Set<string>(dictKeys());
    const unresolved = [...referenced].filter((key) => !canonical.has(key));
    expect(unresolved).toEqual([]);
  });

  it('substitutes named placeholders without leaking the braces', () => {
    expect(t('en', 'ui.gameOver.summary', { seconds: '12.3', kills: 4, floor: 'Der Keller' })).toBe(
      '12.3s survived   4 killed   Der Keller',
    );
    expect(t('de', 'ui.results.stats', { runs: 3, kills: 12 })).toBe('Läufe: 3    Kills: 12');
  });
});

import { en } from './dictionaries/en.js';
import { de } from './dictionaries/de.js';
import { bar } from './dictionaries/bar.js';
import type { Locale } from './locale.js';

/**
 * Every string key the game can show, derived from `en.ts` — the canonical
 * dictionary. `de.ts`/`bar.ts` are each typed `Record<DictKey, string>`, so
 * a key added here without a translation in either is a TypeScript error at
 * that dictionary's own declaration, not a runtime gap discovered by a
 * German-reading player. `tests/content/i18n-coverage.test.ts` checks the
 * same completeness again at test time, with a message naming the exact
 * key and locale, for the CI failure a `// @ts-expect-error` or an `as any`
 * on the wrong line could otherwise slip past.
 */
export type DictKey = keyof typeof en;

const DICTIONARIES: Readonly<Record<Locale, Readonly<Record<DictKey, string>>>> = {
  en,
  de,
  bar,
};

/**
 * Resolves `key` in `locale`, substituting `{name}`-style placeholders from
 * `vars` by name — never by position, so a translation is free to reorder
 * them (`ui.gameOver.summary`'s `{seconds}`/`{kills}`/`{floor}`, German and
 * Boarisch word order included). A placeholder with no matching entry in
 * `vars` is left as-is rather than silently dropped, so a missing var reads
 * as an obvious bug in the pull request that introduced it, not as text
 * quietly missing in front of a player.
 */
export function t(
  locale: Locale,
  key: DictKey,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const template = DICTIONARIES[locale][key];
  if (vars === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Every key `en.ts` declares — for the coverage test and the lint rule alike. */
export function dictKeys(): readonly DictKey[] {
  return Object.keys(en) as DictKey[];
}

export { en, de, bar };

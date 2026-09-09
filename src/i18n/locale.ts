/**
 * The three locales (#52): English, Hochdeutsch and Boarisch (Bavarian
 * dialect). Boarisch is a joke locale in the sense that it exists because
 * it is funny, not in the sense that it is a half-effort — it is a
 * complete, straight-faced translation, per `docs/CONTENT_BIBLE.md` §0.
 *
 * `en` is the default: it is what a fresh install with no saved preference
 * shows, and it is the locale every other dictionary's completeness is
 * checked against (`src/i18n/translate.ts`).
 */
export const LOCALES = ['en', 'de', 'bar'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Human-readable name for the locale switcher, in its *own* language. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  de: 'Deutsch',
  bar: 'Boarisch',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

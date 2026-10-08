import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import {
  promilleKaterLabel,
  promilleTierDisplayName,
  promilleTierEffects,
  type PromilleTierId,
} from '../sim/game/promille.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import type { PromilleTuning } from '../sim/tuning.js';

/**
 * What a Promille tier does, in words (#460) — shared by the tier-change toast
 * and the pause menu's Promille panel, so the two cannot describe the same
 * tier differently.
 *
 * Every number comes out of `tuning` (through `promilleTierEffects`) rather
 * than being typed into a dictionary string: retuning `vollrauschDamageBonus`
 * changes what the player is told, with no string to remember. The
 * dictionaries hold only the sentence shapes.
 *
 * Tier names are `promilleTierDisplayName`'s — the Bavarian words, or the
 * neutral "Kraft" reskin's (#33) when that accessibility option is on.
 */

/** `'+25% damage, +12% fire rate, tunnel vision'` — the effects of a tier alone, no name. */
export function promilleEffectsText(
  locale: Locale,
  tier: PromilleTierId,
  tuning: PromilleTuning,
  neutralReskin: boolean,
): string {
  const effects = promilleTierEffects(tier, tuning);
  if (effects.knockdown) {
    return t(locale, 'ui.promille.effectKnockdown', {
      seconds: Math.round(tuning.umgfallnKnockdownTicks / TICKS_PER_SECOND),
      kater: promilleKaterLabel(neutralReskin),
    });
  }
  const parts: string[] = [];
  if (effects.damagePercent === 0 && effects.fireRatePercent === 0) {
    parts.push(t(locale, 'ui.promille.effectNone'));
  } else {
    parts.push(
      t(locale, 'ui.promille.effectBonus', {
        damage: effects.damagePercent,
        rate: effects.fireRatePercent,
      }),
    );
  }
  if (effects.tunnelVision) {
    parts.push(t(locale, 'ui.promille.effectVision'));
  }
  if (effects.drift) {
    parts.push(t(locale, 'ui.promille.effectDrift'));
  }
  if (effects.wobble) {
    parts.push(t(locale, 'ui.promille.effectWobble'));
  }
  if (effects.gloom) {
    parts.push(t(locale, 'ui.promille.effectGloom'));
  }
  return parts.join(', ');
}

/** `'Angeheitert: +25% damage, +12% fire rate, tunnel vision'` — the tier-change toast. */
export function promilleToastText(
  locale: Locale,
  tier: PromilleTierId,
  tuning: PromilleTuning,
  neutralReskin: boolean,
): string {
  return t(locale, 'ui.promille.toast', {
    tier: promilleTierDisplayName(tier, neutralReskin),
    effects: promilleEffectsText(locale, tier, tuning, neutralReskin),
  });
}

/** The Kater (hangover) line: what it costs, for how long, and that eating ends it. */
export function promilleKaterText(
  locale: Locale,
  tuning: PromilleTuning,
  neutralReskin: boolean,
): string {
  return t(locale, 'ui.promille.katerLine', {
    name: promilleKaterLabel(neutralReskin),
    damage: Math.round((1 - tuning.katerDamageMultiplier) * 100),
    speed: Math.round((1 - tuning.katerMoveSpeedMultiplier) * 100),
    seconds: Math.round(tuning.katerDurationTicks / TICKS_PER_SECOND),
  });
}

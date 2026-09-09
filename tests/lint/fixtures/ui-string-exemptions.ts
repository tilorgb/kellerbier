// Fixture: every shape the no-hardcoded-ui-string rule is meant to leave
// alone — a translation-key call, a console/Error diagnostic, and CSS.
import { t } from '../../../src/i18n/translate.js';

export function build(locale: 'en' | 'de' | 'bar', el: HTMLElement): string {
  el.style.cssText = 'position:absolute;top:0;left:0;display:flex';
  el.className = 'kb-panel kb-panel-open';
  console.warn('developer diagnostic, not shown to a player');
  return t(locale, 'ui.title.start');
}

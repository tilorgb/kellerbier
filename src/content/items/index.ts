import type { ItemDefinition } from '../../sim/item/definition.js';
import { alpengluehen } from './alpengluehen.js';
import { bierdeckel } from './bierdeckel.js';
import { bierkrug } from './bierkrug.js';
import { brezn } from './brezn.js';
import { colaweizen } from './colaweizen.js';
import { derOrdner } from './der-ordner.js';
import { enzian } from './enzian.js';
import { fassldauben } from './fassldauben.js';
import { feuerwasser } from './feuerwasser.js';
import { foehn } from './foehn.js';
import { gamsbart } from './gamsbart.js';
import { haferlschuh } from './haferlschuh.js';
import { kraftbier } from './kraftbier.js';
import { lederhosn } from './lederhosn.js';
import { mass } from './mass.js';
import { masskrugstemmen } from './masskrugstemmen.js';
import { neuschwansteinBauplan } from './neuschwanstein-bauplan.js';
import { obazda } from './obazda.js';
import { radi } from './radi.js';
import { radler } from './radler.js';
import { reinheitsgebot1516 } from './reinheitsgebot-1516.js';
import { ruhigeHand } from './ruhige-hand.js';
import { russn } from './russn.js';
import { spezi } from './spezi.js';
import { steinkrug } from './steinkrug.js';
import { wadlbeisser } from './wadlbeisser.js';
import { weissblaueRauten } from './weissblaue-rauten.js';
import { wirtshausschlaeger } from './wirtshausschlaeger.js';
import { zwoaDreiGsuffa } from './zwoa-drei-gsuffa.js';

/**
 * Every item in the game.
 *
 * One list, exactly the same convention as `content/enemies/index.js` —
 * adding an item is adding to this array, nothing else. `ItemRegistry`
 * validates and sorts the lot at construction; `tests/content/items.test.ts`
 * builds one so a broken definition fails the build rather than a
 * playthrough. #29's roster: the three that proved #26's format end to end,
 * plus the first 26 real items — shot transformers, orbitals and familiars,
 * passives, trade-offs, chaos, and the Promille-gated set, per
 * `docs/CONTENT_BIBLE.md` §4. #59 is where this keeps growing toward 120+.
 */
export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  bierkrug,
  wirtshausschlaeger,
  feuerwasser,
  radler,
  spezi,
  mass,
  steinkrug,
  bierdeckel,
  colaweizen,
  radi,
  russn,
  brezn,
  wadlbeisser,
  derOrdner,
  lederhosn,
  haferlschuh,
  gamsbart,
  kraftbier,
  weissblaueRauten,
  reinheitsgebot1516,
  neuschwansteinBauplan,
  enzian,
  foehn,
  obazda,
  fassldauben,
  alpengluehen,
  ruhigeHand,
  masskrugstemmen,
  zwoaDreiGsuffa,
];

export {
  alpengluehen,
  bierdeckel,
  bierkrug,
  brezn,
  colaweizen,
  derOrdner,
  enzian,
  fassldauben,
  feuerwasser,
  foehn,
  gamsbart,
  haferlschuh,
  kraftbier,
  lederhosn,
  mass,
  masskrugstemmen,
  neuschwansteinBauplan,
  obazda,
  radi,
  radler,
  reinheitsgebot1516,
  ruhigeHand,
  russn,
  spezi,
  steinkrug,
  wadlbeisser,
  weissblaueRauten,
  wirtshausschlaeger,
  zwoaDreiGsuffa,
};

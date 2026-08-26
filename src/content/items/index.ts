import type { ItemDefinition } from '../../sim/item/definition.js';
import { almabtrieb } from './almabtrieb.js';
import { almhuettnJodler } from './almhuettn-jodler.js';
import { almrausch } from './almrausch.js';
import { alpengluehen } from './alpengluehen.js';
import { alpenkroneKronkorken } from './alpenkrone-kronkorken.js';
import { bergrettung } from './bergrettung.js';
import { bierdeckel } from './bierdeckel.js';
import { bierkrug } from './bierkrug.js';
import { blaskapelle } from './blaskapelle.js';
import { braumeisterVisier } from './braumeister-visier.js';
import { brezn } from './brezn.js';
import { colaweizen } from './colaweizen.js';
import { derOrdner } from './der-ordner.js';
import { enzian } from './enzian.js';
import { fassldauben } from './fassldauben.js';
import { feierabendbier } from './feierabendbier.js';
import { feuerwasser } from './feuerwasser.js';
import { fingerhakeln } from './fingerhakeln.js';
import { foehn } from './foehn.js';
import { gamsbart } from './gamsbart.js';
import { gamsohr } from './gamsohr.js';
import { haferlschuh } from './haferlschuh.js';
import { jagdhorn } from './jagdhorn.js';
import { kartoffelsalat } from './kartoffelsalat.js';
import { kastenschieber } from './kastenschieber.js';
import { kirchweihKranzl } from './kirchweih-kranzl.js';
import { kirchweihRatschn } from './kirchweih-ratschn.js';
import { kirtahutschn } from './kirtahutschn.js';
import { kraftbier } from './kraftbier.js';
import { kuhschelle } from './kuhschelle.js';
import { lawine } from './lawine.js';
import { lebkuchenherz } from './lebkuchenherz.js';
import { lederhosn } from './lederhosn.js';
import { loewenbrunnDoppelbock } from './loewenbrunn-doppelbock.js';
import { ludwigsSchwan } from './ludwigs-schwan.js';
import { marktweib } from './marktweib.js';
import { mass } from './mass.js';
import { masskrugstemmen } from './masskrugstemmen.js';
import { murmeltierpfiff } from './murmeltierpfiff.js';
import { neuschwansteinBauplan } from './neuschwanstein-bauplan.js';
import { nikolausgabe } from './nikolausgabe.js';
import { obazda } from './obazda.js';
import { peitschn } from './peitschn.js';
import { perchtenrute } from './perchtenrute.js';
import { radi } from './radi.js';
import { radler } from './radler.js';
import { reinheitsgebot1516 } from './reinheitsgebot-1516.js';
import { ruhigeHand } from './ruhige-hand.js';
import { russn } from './russn.js';
import { sanktAnzelmKlostersud } from './sankt-anzelm-klostersud.js';
import { sauwetter } from './sauwetter.js';
import { schmalzler } from './schmalzler.js';
import { schuhplattler } from './schuhplattler.js';
import { schutzengerl } from './schutzengerl.js';
import { seilbahn } from './seilbahn.js';
import { sonnwendfeuer } from './sonnwendfeuer.js';
import { spatenstich } from './spatenstich.js';
import { spezi } from './spezi.js';
import { steinkrug } from './steinkrug.js';
import { teufelsbraten } from './teufelsbraten.js';
import { wadlbeisser } from './wadlbeisser.js';
import { watschn } from './watschn.js';
import { watzmannkraxn } from './watzmannkraxn.js';
import { weissblaueRauten } from './weissblaue-rauten.js';
import { wildschuetz } from './wildschuetz.js';
import { wirtshausschlaeger } from './wirtshausschlaeger.js';
import { wolpertingerImRucksack } from './wolpertinger-im-rucksack.js';
import { zuckerrohrsirup } from './zuckerrohrsirup.js';
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
 * `docs/CONTENT_BIBLE.md` §4. #59's first batch of ten (toward 120+) adds
 * Ludwigs Schwan, Wolpertinger im Rucksack, Schuhplattler, Fingerhakeln and
 * Lebkuchenherz from the seed list, plus five new items in the same
 * categories: Löwenbrunn Doppelbock, Sankt Anzelm Klostersud, Alpenkrone
 * Kronkorken, Kirchweih-Kranzl and Kirchweih-Ratsch'n. #59's second batch
 * adds Peitschn, Sauwetter, Kuhschelle, Wildschütz, Watschn, Kartoffelsalat,
 * Nikolausgabe, Sonnwendfeuer, Bergrettung and Blaskapelle. #59's third
 * batch adds Spatenstich, Almabtrieb, Perchtenrute, Kirtahutschn,
 * Marktweib, Jagdhorn, Schmalzler, Watzmannkraxn, Schutzengerl (the
 * roster's first `angel`-pool item) and Teufelsbraten. #59's fourth batch,
 * drawn from Floor 4 (Die Alpen), Floor 6 (Die Brauerei) and the Almhütte
 * secret area, adds Almrausch, Gamsohr, Lawine, Seilbahn, Murmeltierpfiff,
 * Braumeister-Visier, Kastenschieber, Zuckerrohrsirup, Feierabendbier and
 * Almhüttn-Jodler.
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
  ludwigsSchwan,
  wolpertingerImRucksack,
  schuhplattler,
  fingerhakeln,
  lebkuchenherz,
  loewenbrunnDoppelbock,
  sanktAnzelmKlostersud,
  alpenkroneKronkorken,
  kirchweihKranzl,
  kirchweihRatschn,
  peitschn,
  sauwetter,
  kuhschelle,
  wildschuetz,
  watschn,
  kartoffelsalat,
  nikolausgabe,
  sonnwendfeuer,
  bergrettung,
  blaskapelle,
  spatenstich,
  almabtrieb,
  perchtenrute,
  kirtahutschn,
  marktweib,
  jagdhorn,
  schmalzler,
  watzmannkraxn,
  schutzengerl,
  teufelsbraten,
  almrausch,
  gamsohr,
  lawine,
  seilbahn,
  murmeltierpfiff,
  braumeisterVisier,
  kastenschieber,
  zuckerrohrsirup,
  feierabendbier,
  almhuettnJodler,
];

export {
  almabtrieb,
  almhuettnJodler,
  almrausch,
  alpengluehen,
  alpenkroneKronkorken,
  bergrettung,
  bierdeckel,
  bierkrug,
  blaskapelle,
  braumeisterVisier,
  brezn,
  colaweizen,
  derOrdner,
  enzian,
  fassldauben,
  feierabendbier,
  feuerwasser,
  fingerhakeln,
  foehn,
  gamsbart,
  gamsohr,
  haferlschuh,
  jagdhorn,
  kartoffelsalat,
  kastenschieber,
  kirchweihKranzl,
  kirchweihRatschn,
  kirtahutschn,
  kraftbier,
  kuhschelle,
  lawine,
  lebkuchenherz,
  lederhosn,
  loewenbrunnDoppelbock,
  ludwigsSchwan,
  marktweib,
  mass,
  masskrugstemmen,
  murmeltierpfiff,
  neuschwansteinBauplan,
  nikolausgabe,
  obazda,
  peitschn,
  perchtenrute,
  radi,
  radler,
  reinheitsgebot1516,
  ruhigeHand,
  russn,
  sanktAnzelmKlostersud,
  sauwetter,
  schmalzler,
  schuhplattler,
  schutzengerl,
  seilbahn,
  sonnwendfeuer,
  spatenstich,
  spezi,
  steinkrug,
  teufelsbraten,
  wadlbeisser,
  watschn,
  watzmannkraxn,
  weissblaueRauten,
  wildschuetz,
  wirtshausschlaeger,
  wolpertingerImRucksack,
  zuckerrohrsirup,
  zwoaDreiGsuffa,
};

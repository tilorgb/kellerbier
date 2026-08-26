import type { ItemDefinition } from '../../sim/item/definition.js';
import { ahnenbueste } from './ahnenbueste.js';
import { almabtrieb } from './almabtrieb.js';
import { almhuettnFeuer } from './almhuettn-feuer.js';
import { almhuettnJodler } from './almhuettn-jodler.js';
import { almrausch } from './almrausch.js';
import { alpengluehen } from './alpengluehen.js';
import { alpenkroneKronkorken } from './alpenkrone-kronkorken.js';
import { bauernMistgabel } from './bauern-mistgabel.js';
import { bedienungTablett } from './bedienung-tablett.js';
import { bergrettung } from './bergrettung.js';
import { bierdeckel } from './bierdeckel.js';
import { bierkrug } from './bierkrug.js';
import { blaskapelle } from './blaskapelle.js';
import { boellerschmeisser } from './boellerschmeisser.js';
import { braumeisterVisier } from './braumeister-visier.js';
import { brezn } from './brezn.js';
import { colaweizen } from './colaweizen.js';
import { derOrdner } from './der-ordner.js';
import { drudmaske } from './drudmaske.js';
import { enzian } from './enzian.js';
import { fassldauben } from './fassldauben.js';
import { feierabendbier } from './feierabendbier.js';
import { feuerwasser } from './feuerwasser.js';
import { fingerhakeln } from './fingerhakeln.js';
import { foehn } from './foehn.js';
import { gamsbart } from './gamsbart.js';
import { gamsohr } from './gamsohr.js';
import { gartenzwergHut } from './gartenzwerg-hut.js';
import { gluehbirn } from './gluehbirn.js';
import { gockelkamm } from './gockelkamm.js';
import { haferlschuh } from './haferlschuh.js';
import { heldensaalFackel } from './heldensaal-fackel.js';
import { hirschgeweih } from './hirschgeweih.js';
import { jagdhorn } from './jagdhorn.js';
import { kartoffelsalat } from './kartoffelsalat.js';
import { karussell } from './karussell.js';
import { kastenschieber } from './kastenschieber.js';
import { kerzenwachs } from './kerzenwachs.js';
import { kirchweihKranzl } from './kirchweih-kranzl.js';
import { kirchweihRatschn } from './kirchweih-ratschn.js';
import { kirtahutschn } from './kirtahutschn.js';
import { kraftbier } from './kraftbier.js';
import { kuhschelle } from './kuhschelle.js';
import { kuhweide } from './kuhweide.js';
import { lawine } from './lawine.js';
import { lebkuchenherz } from './lebkuchenherz.js';
import { lederhosn } from './lederhosn.js';
import { loewenbrunnDoppelbock } from './loewenbrunn-doppelbock.js';
import { ludwigsSchwan } from './ludwigs-schwan.js';
import { marktweib } from './marktweib.js';
import { mass } from './mass.js';
import { masskrugstemmen } from './masskrugstemmen.js';
import { murmeltierpfiff } from './murmeltierpfiff.js';
import { nebellaterne } from './nebellaterne.js';
import { neuschwansteinBauplan } from './neuschwanstein-bauplan.js';
import { nikolausgabe } from './nikolausgabe.js';
import { obazda } from './obazda.js';
import { opernarie } from './opernarie.js';
import { peitschn } from './peitschn.js';
import { perchtenrute } from './perchtenrute.js';
import { pilzsporen } from './pilzsporen.js';
import { radi } from './radi.js';
import { radler } from './radler.js';
import { reinheitsgebot1516 } from './reinheitsgebot-1516.js';
import { ritterschild } from './ritterschild.js';
import { rollfassReifen } from './rollfass-reifen.js';
import { ruhigeHand } from './ruhige-hand.js';
import { russn } from './russn.js';
import { sanktAnzelmKlostersud } from './sankt-anzelm-klostersud.js';
import { sauwetter } from './sauwetter.js';
import { scherbenhaufen } from './scherbenhaufen.js';
import { schiessbudenfigur } from './schiessbudenfigur.js';
import { schimmelsplitter } from './schimmelsplitter.js';
import { schmalzler } from './schmalzler.js';
import { schuhplattler } from './schuhplattler.js';
import { schutzengerl } from './schutzengerl.js';
import { seilbahn } from './seilbahn.js';
import { sonnwendfeuer } from './sonnwendfeuer.js';
import { spatenstich } from './spatenstich.js';
import { spezi } from './spezi.js';
import { spiegelsaal } from './spiegelsaal.js';
import { steinkrug } from './steinkrug.js';
import { teufelsbraten } from './teufelsbraten.js';
import { teufelstrittRuss } from './teufelstritt-russ.js';
import { teufelstrittstein } from './teufelstrittstein.js';
import { traktorAuspuff } from './traktor-auspuff.js';
import { wadlbeisser } from './wadlbeisser.js';
import { waldnebel } from './waldnebel.js';
import { waldschratKnueppel } from './waldschrat-knueppel.js';
import { watschn } from './watschn.js';
import { watzmannkraxn } from './watzmannkraxn.js';
import { weidezaun } from './weidezaun.js';
import { weissblaueRauten } from './weissblaue-rauten.js';
import { wildeGjoadHorn } from './wilde-gjoad-horn.js';
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
 * Almhüttn-Jodler. #59's fifth batch, drawn from Floor 5 (Schloss
 * Neuschwanstein), Floor 7 (Die Wiesn) and the Walhalla/Teufelstritt secret
 * areas, adds Opernarie, Kerzenwachs, Scherbenhaufen, Spiegelsaal (the
 * roster's first `splitting`-tagged item), Ritterschild, Bedienung-Tablett,
 * Schießbudenfigur, Karussell, Ahnenbüste and Teufelstrittstein. #59's sixth
 * batch, drawn from Floor 1 (Der Keller) and Floor 2 (Dorf & Acker), adds
 * Glühbirn, Schimmelsplitter, Rollfass-Reifen, Bauern-Mistgabel, Gockelkamm,
 * Gartenzwerg-Hut, Traktor-Auspuff (the roster's third `curse`-pooled item),
 * Böllerschmeißer, Kuhweide and Weidezaun. #59's seventh batch, drawn from
 * Floor 3 (Der Wald) and the Walhalla/Teufelstritt/Almhütte secret areas,
 * adds Waldschrat-Knüppel, Drudmaske (the roster's fourth `curse`-pooled
 * item), Hirschgeweih, Pilzsporen, Nebellaterne, Wilde-Gjoad-Horn,
 * Heldensaal-Fackel, Almhüttn-Feuer, Teufelstritt-Ruß and Waldnebel (the
 * roster's first `spectral`-tagged item).
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
  opernarie,
  kerzenwachs,
  scherbenhaufen,
  spiegelsaal,
  ritterschild,
  bedienungTablett,
  schiessbudenfigur,
  karussell,
  ahnenbueste,
  teufelstrittstein,
  gluehbirn,
  schimmelsplitter,
  rollfassReifen,
  bauernMistgabel,
  gockelkamm,
  gartenzwergHut,
  traktorAuspuff,
  boellerschmeisser,
  kuhweide,
  weidezaun,
  waldschratKnueppel,
  drudmaske,
  hirschgeweih,
  pilzsporen,
  nebellaterne,
  wildeGjoadHorn,
  heldensaalFackel,
  almhuettnFeuer,
  teufelstrittRuss,
  waldnebel,
];

export {
  ahnenbueste,
  almabtrieb,
  almhuettnFeuer,
  almhuettnJodler,
  almrausch,
  alpengluehen,
  alpenkroneKronkorken,
  bauernMistgabel,
  bedienungTablett,
  bergrettung,
  bierdeckel,
  bierkrug,
  blaskapelle,
  boellerschmeisser,
  braumeisterVisier,
  brezn,
  colaweizen,
  derOrdner,
  drudmaske,
  enzian,
  fassldauben,
  feierabendbier,
  feuerwasser,
  fingerhakeln,
  foehn,
  gamsbart,
  gamsohr,
  gartenzwergHut,
  gluehbirn,
  gockelkamm,
  haferlschuh,
  heldensaalFackel,
  hirschgeweih,
  jagdhorn,
  kartoffelsalat,
  karussell,
  kastenschieber,
  kerzenwachs,
  kirchweihKranzl,
  kirchweihRatschn,
  kirtahutschn,
  kraftbier,
  kuhschelle,
  kuhweide,
  lawine,
  lebkuchenherz,
  lederhosn,
  loewenbrunnDoppelbock,
  ludwigsSchwan,
  marktweib,
  mass,
  masskrugstemmen,
  murmeltierpfiff,
  nebellaterne,
  neuschwansteinBauplan,
  nikolausgabe,
  obazda,
  opernarie,
  peitschn,
  perchtenrute,
  pilzsporen,
  radi,
  radler,
  reinheitsgebot1516,
  ritterschild,
  rollfassReifen,
  ruhigeHand,
  russn,
  sanktAnzelmKlostersud,
  sauwetter,
  scherbenhaufen,
  schiessbudenfigur,
  schimmelsplitter,
  schmalzler,
  schuhplattler,
  schutzengerl,
  seilbahn,
  sonnwendfeuer,
  spatenstich,
  spezi,
  spiegelsaal,
  steinkrug,
  teufelsbraten,
  teufelstrittRuss,
  teufelstrittstein,
  traktorAuspuff,
  wadlbeisser,
  waldnebel,
  waldschratKnueppel,
  watschn,
  watzmannkraxn,
  weidezaun,
  weissblaueRauten,
  wildeGjoadHorn,
  wildschuetz,
  wirtshausschlaeger,
  wolpertingerImRucksack,
  zuckerrohrsirup,
  zwoaDreiGsuffa,
};

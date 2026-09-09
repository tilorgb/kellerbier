import type { ItemDefinition } from '../../sim/item/definition.js';
import { almabtrieb } from './almabtrieb.js';
import { apfelkuchenMitRosinen } from './apfelkuchen-mit-rosinen.js';
import { apfelkuchen } from './apfelkuchen.js';
import { apfelstrudel } from './apfelstrudel.js';
import { bauernMistgabel } from './bauern-mistgabel.js';
import { bierbank } from './bierbank.js';
import { bierbauch } from './bierbauch.js';
import { bierdeckel } from './bierdeckel.js';
import { bierkrug } from './bierkrug.js';
import { blaskapelle } from './blaskapelle.js';
import { blutwurz } from './blutwurz.js';
import { boellerschmeisser } from './boellerschmeisser.js';
import { braumeisterHammer } from './braumeister-hammer.js';
import { braumeisterSchuerze } from './braumeister-schuerze.js';
import { braumeisterVisier } from './braumeister-visier.js';
import { brezn } from './brezn.js';
import { brotzeitbrett } from './brotzeitbrett.js';
import { colaweizen } from './colaweizen.js';
import { derOrdner } from './der-ordner.js';
import { derRosinenklauber } from './der-rosinenklauber.js';
import { feierabendbier } from './feierabendbier.js';
import { feuerwehrhelm } from './feuerwehrhelm.js';
import { fingerhakeln } from './fingerhakeln.js';
import { gartenzwergHut } from './gartenzwerg-hut.js';
import { gugelhupf } from './gugelhupf.js';
import { haferlschuh } from './haferlschuh.js';
import { hendlgeruch } from './hendlgeruch.js';
import { kartoffelsalat } from './kartoffelsalat.js';
import { karussell } from './karussell.js';
import { kletzenbrot } from './kletzenbrot.js';
import { konterbier } from './konterbier.js';
import { kraftbier } from './kraftbier.js';
import { lebkuchenherz } from './lebkuchenherz.js';
import { lederhosn } from './lederhosn.js';
import { ludwigsSchwan } from './ludwigs-schwan.js';
import { luftballon } from './luftballon.js';
import { mass } from './mass.js';
import { neuschwansteinBauplan } from './neuschwanstein-bauplan.js';
import { obazda } from './obazda.js';
import { platzangst } from './platzangst.js';
import { radler } from './radler.js';
import { reinheitsgebot1516 } from './reinheitsgebot-1516.js';
import { riesenrad } from './riesenrad.js';
import { rosinenbrot } from './rosinenbrot.js';
import { rosinenschnaps } from './rosinenschnaps.js';
import { rosinenschnecke } from './rosinenschnecke.js';
import { ruhigeHand } from './ruhige-hand.js';
import { rumtopf } from './rumtopf.js';
import { sauwetter } from './sauwetter.js';
import { schluesselbund } from './schluesselbund.js';
import { schuhplattler } from './schuhplattler.js';
import { semmelknoedel } from './semmelknoedel.js';
import { sixpack } from './sixpack.js';
import { spezi } from './spezi.js';
import { steckerlfisch } from './steckerlfisch.js';
import { steinkrug } from './steinkrug.js';
import { studentenfutter } from './studentenfutter.js';
import { sudordnung1493 } from './sudordnung-1493.js';
import { traktorAuspuff } from './traktor-auspuff.js';
import { watschn } from './watschn.js';
import { weisswurst } from './weisswurst.js';
import { zwetschgendatschi } from './zwetschgendatschi.js';

/**
 * Every item in the game.
 *
 * One list, exactly the same convention as `content/enemies/index.js` —
 * adding an item is adding to this array, nothing else. `ItemRegistry`
 * validates and sorts the lot at construction; `tests/content/items.test.ts`
 * builds one so a broken definition fails the build rather than a
 * playthrough.
 *
 * Cut down hard from #59's 139-item roster to 51 by hand (2026-09), keeping
 * only the items whose design still earns its slot rather than every idea
 * that once shipped — the milestone-count tests that tracked growth toward
 * 120+ are gone with it (`tests/content/items.test.ts`); this file is the
 * roster now, not a waypoint toward a bigger one.
 *
 * Back to 61 with #237's ten `rosinen` items. That is not the old roster
 * creeping back: the run is *about* raisins and the pool contained exactly
 * one, so three quality-3 items existed whose entire cost was a restriction
 * on a set of size one. Every addition here is a member of that set and is
 * held to the same bar the cut was made against.
 */
export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  almabtrieb,
  apfelkuchen,
  apfelkuchenMitRosinen,
  apfelstrudel,
  bauernMistgabel,
  bierbank,
  bierbauch,
  bierdeckel,
  bierkrug,
  blaskapelle,
  blutwurz,
  boellerschmeisser,
  braumeisterHammer,
  braumeisterSchuerze,
  braumeisterVisier,
  brezn,
  brotzeitbrett,
  colaweizen,
  derOrdner,
  derRosinenklauber,
  feierabendbier,
  feuerwehrhelm,
  fingerhakeln,
  gartenzwergHut,
  gugelhupf,
  haferlschuh,
  hendlgeruch,
  kartoffelsalat,
  karussell,
  kletzenbrot,
  konterbier,
  kraftbier,
  lebkuchenherz,
  lederhosn,
  ludwigsSchwan,
  luftballon,
  mass,
  neuschwansteinBauplan,
  obazda,
  platzangst,
  radler,
  reinheitsgebot1516,
  riesenrad,
  rosinenbrot,
  rosinenschnaps,
  rosinenschnecke,
  ruhigeHand,
  rumtopf,
  sauwetter,
  schluesselbund,
  schuhplattler,
  semmelknoedel,
  sixpack,
  spezi,
  steckerlfisch,
  steinkrug,
  studentenfutter,
  sudordnung1493,
  traktorAuspuff,
  watschn,
  weisswurst,
  zwetschgendatschi,
];

export {
  almabtrieb,
  apfelkuchen,
  apfelkuchenMitRosinen,
  bauernMistgabel,
  bierbank,
  bierbauch,
  bierdeckel,
  bierkrug,
  blaskapelle,
  blutwurz,
  boellerschmeisser,
  braumeisterHammer,
  braumeisterSchuerze,
  braumeisterVisier,
  brezn,
  brotzeitbrett,
  colaweizen,
  derOrdner,
  derRosinenklauber,
  feierabendbier,
  feuerwehrhelm,
  fingerhakeln,
  gartenzwergHut,
  haferlschuh,
  hendlgeruch,
  kartoffelsalat,
  karussell,
  konterbier,
  kraftbier,
  lebkuchenherz,
  lederhosn,
  ludwigsSchwan,
  luftballon,
  mass,
  neuschwansteinBauplan,
  obazda,
  platzangst,
  radler,
  reinheitsgebot1516,
  riesenrad,
  ruhigeHand,
  sauwetter,
  schluesselbund,
  schuhplattler,
  sixpack,
  spezi,
  steckerlfisch,
  steinkrug,
  sudordnung1493,
  traktorAuspuff,
  watschn,
  weisswurst,
};

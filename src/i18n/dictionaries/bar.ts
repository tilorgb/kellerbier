import type { DictKey } from '../translate.js';

/**
 * The Boarisch (Bavarian dialect) dictionary (#52).
 *
 * The joke locale that is nonetheless a complete, straight-faced
 * translation (`docs/CONTENT_BIBLE.md` §0): every key `en.ts` declares has
 * a real dialect line here, the boring settings-screen strings included —
 * a half-committed dialect translation reads as mockery, a complete one
 * reads as affection, per the issue's own framing (#52).
 *
 * `Record<DictKey, string>`, same completeness guarantee `de.ts` gets from
 * TypeScript — see that file's doc comment.
 *
 * Orthography follows the spelling already used elsewhere in the game's own
 * dialect lines (`content/characters/resi.ts`'s "Schlog Die Große
 * Kellerassel im Keller", `content/death-words.ts`'s pool): dropped final
 * consonants, "i" for "ich", "ned"/"koa"/"a" for "nicht"/"kein"/"ein(e)",
 * apostrophes standing in for elided vowels. Item/curse/pickup/floor
 * **names** are not translated here — they are not dictionary keys at all.
 */
export const bar: Record<DictKey, string> = {
  // --- Title flow -----------------------------------------------------
  'ui.title.start': 'Auf geht’s',
  'ui.title.continue': 'Weiterspün',
  'ui.title.settings': 'Einstellunga',
  'ui.title.credits': 'Mitgwirkt ham',
  'ui.title.quit': 'Aufhean',

  'ui.pause.headline': 'Pausn',
  'ui.pause.resume': 'Weiterspün',
  'ui.pause.settings': 'Einstellunga',
  'ui.pause.quitToTitle': 'Zruck zum Titl',

  'ui.credits.headline': 'Mitgwirkt ham',
  'ui.credits.back': 'Zruck',
  'ui.credits.line1': 'A Spui vom tilorgb',
  'ui.credits.line2': 'Baut mit Claude Code',
  'ui.credits.line3': 'Engine: three.js',

  // --- A run ending -----------------------------------------------------
  'ui.gameOver.retry': 'No amoi',
  'ui.gameOver.results': 'Ergebnis',
  'ui.gameOver.hub': 'Titl',
  'ui.gameOver.summary': '{seconds}s duachghoitn   {kills} dawischt   {floor}',

  'ui.victory.headline': 'Sieg!',
  'ui.victory.epilogue': 'Geht no weiter.',
  'ui.victory.retry': 'No amoi',
  'ui.victory.results': 'Ergebnis',
  'ui.victory.hub': 'Titl',
  'ui.victory.summary': '{seconds}s   {kills} dawischt   {floor}',

  'ui.results.headline': 'Ergebnis',
  'ui.results.newRun': 'Neier Lauf',
  'ui.results.close': 'Zua',
  'ui.results.backToRun': 'Zruck zum Lauf',
  'ui.results.unlocked': 'Freigschoit',
  'ui.results.theBoard': 'D’Bestnliste',
  'ui.results.boardEmptyLine1': 'D’Bestnliste is no leer —',
  'ui.results.boardEmptyLine2': 'do hod no koaner eintrogn.',
  'ui.results.noRunsYet': 'No koa Lauf auf da Liste.',
  'ui.results.stats': 'Läuf: {runs}    Dawischt: {kills}',
  'ui.results.boardRow': '{place}.  {seconds}   {kills} dawischt   {floor}',
  'ui.results.noLastRun': 'No koa Lauf gspuit — da Keller wart.',
  'ui.results.lastRunDeathWord': '  „{word}“',
  'ui.results.lastRun': 'Letzta Lauf — {seconds}  ·  {kills} dawischt  ·  {floor}{word}',

  // --- Der Losbrunnen -----------------------------------------------------
  'ui.machinePicker.kaputt': 'Losbrunnen — hi.',
  'ui.machinePicker.emptyNothing': 'Losbrunnen — nix zum Füttern do.',
  'ui.machinePicker.emptyGone': 'Losbrunnen — {itemName} is weg.',
  'ui.machinePicker.unfedHint': 'Losbrunnen  [Aktion: Sach auswähln]',
  'ui.machinePicker.rollingHint': '…',
  'ui.machinePicker.moveChooseUseConfirm': '[Bewegung] wähln   [Aktion] bstätign',
  'ui.machinePicker.useConfirm': '[Aktion] bstätign',
  'ui.machinePicker.browseAndFeed': '[Bewegung] duachschaun   [Aktion] füttern',
  'ui.machinePicker.notEnoughBiermarken': 'ned gnua Biermarkn',
  'ui.machinePicker.useReroll': '[Aktion] no amoi würflen',
  'ui.machinePicker.rollingLabel': 'Würflt…',
  'ui.machinePicker.choosePlaceholder': 'a Sach auswähln zum Ofanga',
  'ui.machinePicker.unluckyBadge': 'PECH GHOBT',
  'ui.machinePicker.costLine': '{cost} Biermarkn   {breakChance}% dass er hi geht',

  // --- Floor title card -----------------------------------------------------
  'ui.floorTitleCard.ordinal.0': 'Nullta',
  'ui.floorTitleCard.ordinal.1': 'Easchta',
  'ui.floorTitleCard.ordinal.2': 'Zwoata',
  'ui.floorTitleCard.ordinal.3': 'Dritta',
  'ui.floorTitleCard.ordinal.4': 'Viadta',
  'ui.floorTitleCard.ordinal.5': 'Fünfta',
  'ui.floorTitleCard.ordinal.6': 'Sechsta',
  'ui.floorTitleCard.ordinal.7': 'Siebmta',
  'ui.floorTitleCard.ordinal.further': 'No a weidara',
  'ui.floorTitleCard.floorLabel': '{ordinal} Stock',
  'ui.floorTitleCard.xlBadge': 'A ungwöhnli grousa Stock.',

  // --- HUD -----------------------------------------------------
  'ui.hud.bossBanner': 'Bossraum',
  'ui.hud.useHint': '[Aktion]',
  'ui.hud.notEnough': '(ned gnua)',
  'ui.hud.setCompletionDescription': 'S’ganze {name}-Set — jeds Teil wirkt stärka im Verbund.',
  'ui.hud.setComplete': '{name} komplett! {description}',
  'ui.hud.sperrstundeCountdown': 'Sperrstunde — {seconds}s',
  'ui.hud.sperrstundeComing': 'Sperrstunde — da Ordner kimmt',
  'ui.hud.minimapHeader': '{floor}. Stock — {name}',
  'ui.hud.bossLabel': 'BOSS',
  'ui.hud.tapUse': 'Antippn',
  'ui.hud.confirmLoadReplay': 'Jetzt a Wiederhoing lodn? Des beendt den laffadn Lauf.',
  'ui.hud.blutwurzActive': 'Blutwurz — findsd dei Leich',
  'ui.hud.purseFlying': 'Geldbeutel: {biermarken} — fliagt',
  'ui.hud.purseEmpty': 'Geldbeutel leer — koa Kraft',
  'ui.hud.promilleUnlocked': '{meter} freigschoit',
  'ui.hud.promilleUnlockHint': 'D’Maß haut härta. Z’vui, und du foisd um.',
  'ui.hud.promilleUnlockHintNeutral': 'Aufladn haut härta. Z’vui, und du legst di hi.',
  'ui.hud.unbound': 'ned bleg',
  'ui.hud.activeItemDormant': '{name} ({requirement})',
  'ui.hud.activeItemReady': '{name} [{prompt}]',
  'ui.hud.activeItemCharging': '{name} {percent}%',

  // --- Settings screen -----------------------------------------------------
  'ui.settings.toggle': 'Einstellunga',
  'ui.settings.title': 'Einstellunga',

  'ui.settings.tab.video': 'Buidl',
  'ui.settings.tab.audio': 'Ton',
  'ui.settings.tab.controls': 'Steuerung',
  'ui.settings.tab.accessibility': 'Barrierefreiheit',
  'ui.settings.tab.privacy': 'Datnschutz',
  'ui.settings.tab.language': 'Sprach',

  'ui.settings.video.windowScale': 'Fenstagrößn',
  'ui.settings.video.auto': 'Automatisch',
  'ui.settings.video.toggleFullscreen': 'Vollbuidl um- und ausschoitn',
  'ui.settings.video.screenshake': 'Buidlwackla',
  'ui.settings.video.camerasway': 'Kamera-Gschwankl',
  'ui.settings.video.hitstop': 'Treffastopp',
  'ui.settings.video.reduceFlashing': 'Blitzeffekt runterdrahn',

  'ui.settings.audio.master': 'Ois zsamm',
  'ui.settings.audio.music': 'Musi',
  'ui.settings.audio.sfx': 'Effekt',
  'ui.settings.audio.voice': 'Stimm',

  'ui.settings.controls.action': 'Aktion',
  'ui.settings.controls.keyboard': 'Tastatua',
  'ui.settings.controls.gamepad': 'Gamepad',
  'ui.settings.controls.connectedPrefix': 'Controller drau: ',
  'ui.settings.controls.controllerFallback': 'Controller',
  'ui.settings.controls.nonStandard':
    ' — koa gwöhnlichs Layout, untn neich bleng, falls d’Tastn ned passn.',
  'ui.settings.controls.none':
    'Koa Controller dabei. Wenn oana drau hängt, druck a Tastn drauf. Manche Programm ' +
    '(z. B. Steam Input) legn an Controller auf d’Maus um und vaschteckn eam vom ' +
    'Browser — des für den Controller ausschoitn, falls d’Stick’n den Mauszeiga bewegn.',
  'ui.settings.controls.pressKey': 'Tastn drucka…',
  'ui.settings.controls.pressButton': 'Knopf drucka…',
  'ui.settings.controls.resetBindings': 'Ois neich bleng',
  'ui.settings.controls.deadZone': 'Gamepad-Totzon',
  'ui.settings.controls.aimAssist': 'Zielhüfe',

  'ui.settings.action.moveUp': 'Geh: aufi',
  'ui.settings.action.moveDown': 'Geh: obi',
  'ui.settings.action.moveLeft': 'Geh: links',
  'ui.settings.action.moveRight': 'Geh: rechts',
  'ui.settings.action.aimUp': 'Ziel: aufi',
  'ui.settings.action.aimDown': 'Ziel: obi',
  'ui.settings.action.aimLeft': 'Ziel: links',
  'ui.settings.action.aimRight': 'Ziel: rechts',
  'ui.settings.action.fire': 'Schiaßn',
  'ui.settings.action.bomb': 'Bombn',
  'ui.settings.action.use': 'Benutzn',
  'ui.settings.action.map': 'Kartn',
  'ui.settings.action.pause': 'Pausn',

  'ui.settings.accessibility.colourblind': 'Markierung für Farbnblinde bei Gschoss',
  'ui.settings.accessibility.textScale': 'Textgrößn',
  'ui.settings.accessibility.noDrift': 'Ohne-Drift-Modus',
  'ui.settings.accessibility.neutralReskin': 'Neutrale Ozoag (Kraft)',
  'ui.settings.accessibility.reducedMotion': 'Weniger Bewegung',
  'ui.settings.accessibility.slowMode': 'Zeitlupn',
  'ui.settings.accessibility.slowModeOff': 'Aus',
  'ui.settings.accessibility.reduceAudioDistortion': 'Promille-Tonvazerrung runterdrahn',

  'ui.settings.privacy.copy':
    'Playtest-Telemetrie is standardmäßig aus. Wennst des ospringst, wead nur auf dem ' +
    'Gerät do aufgschriebn: wia jeda Lauf ausgeht (gwunna oda hi ganga, auf wölchem ' +
    'Stock), wia lang jeda Raum zum Räumen braucht hod, wölche Sacha du dabei ghobt ' +
    'hast, und wia lang du auf jeda Promillestufn warst. Sunst nix — koa Nam, koa ' +
    'Konto, koan Standort, koane Möglichkeit rauszfinden, wer gspuit hod. A Lauf bleibt ' +
    'do gspeichert, bis dass du eam sölm als Datei exportierst; do wead nie automatisch ' +
    'irgendwas vaschickt.',
  'ui.settings.privacy.session': 'Sitzung',
  'ui.settings.privacy.runsRecordedOne': '1 Lauf aufgschriebn, wart auf’n Export.',
  'ui.settings.privacy.runsRecordedOther': '{count} Läuf aufgschriebn, wartn auf’n Export.',
  'ui.settings.privacy.exportButton': 'Ois Datei exportiern',
  'ui.settings.privacy.clearButton': 'Löschn',
  'ui.settings.privacy.shareToggle': 'Anonyme Playtest-Telemetrie teiln',

  // --- Floor flavour lines (name stays Bavarian in every locale) ---------
  'floors.cellar.flavour': 'Passt auf enkane *Fiaß* auf.',
  'floors.rural.flavour': 'Sunnig, friedli, *Blaskapell’n*.',
  'floors.wald.flavour': 'Schaug, a Hirsch!',
  'floors.alpen.flavour': 'Dünne Luft und hoate *Haxn*.',
  'floors.schloss.flavour': 'D’Einheimischn song zu seina Schönheit "*basst scho*".',
  'floors.brauerei.flavour': 'Iagendwer hod ma an *Rausch* ins letzte Bier neigmischt.',
  'floors.wiesn.flavour': 'Oans, zwoa, gsuffa!',

  // --- Curses -----------------------------------------------------
  'curses.nebel.description': 'Nebe vom Fluss. Koa Minikartn auf dem Stock.',
  'curses.kater.description': 'Du fangst den Stock mit an Kater o.',
  'curses.sperrstunde.description': 'Letzte Rundn. Bummelst, kimmt da Ordner.',
  'curses.foehn.description': 'Da Föhn druckt jed’n Schuss im Raum.',
  'curses.blaue-stunde.description': 'Tiafe Dämmarung. Dei Sicht langt bloß so weit.',

  // --- Pickups -----------------------------------------------------
  'pickups.mass-full.description': 'Hebt Promille',
  'pickups.mass-half.description': 'Hebt Promille (weniger)',
  'pickups.bratwurst-full.description': 'Hoit di, senkt Promille',
  'pickups.bratwurst-full.soberDescription': 'Lebm +2',
  'pickups.bratwurst-half.description': 'Hoit di, senkt Promille',
  'pickups.bratwurst-half.soberDescription': 'Lebm +1',
  'pickups.weisswurst-full.description': 'Seelnherz, senkt Promille',
  'pickups.weisswurst-full.soberDescription': 'Seelnherz +2',
  'pickups.weisswurst-half.description': 'Seelnherz, senkt Promille',
  'pickups.weisswurst-half.soberDescription': 'Seelnherz +1',
  'pickups.blutwurst-full.description': 'Ewigs Herz, senkt Promille',
  'pickups.blutwurst-full.soberDescription': 'Ewigs Herz +2',
  'pickups.blutwurst-half.description': 'Ewigs Herz, senkt Promille',
  'pickups.blutwurst-half.soberDescription': 'Ewigs Herz +1',
  'pickups.biermarke-1.description': 'Göld +1',
  'pickups.biermarke-5.description': 'Göld +5',
  'pickups.biermarke-10.description': 'Göld +10',
  'pickups.bierfassl.description': 'Bombn +1',
  'pickups.bierfassl-pack.description': 'Bombn +3',
  'pickups.kellerschluessel.description': 'Schlüssl +1',
  'pickups.kellerschluessel-ring.description': 'Schlüssl +3',
  'pickups.meisterschluessel.description': 'Macht d’Bosstür auf',

  // --- Items (name stays Bavarian in every locale) -----------------------
  'items.almabtrieb.description':
    'Schiaßn im Renna macht 2x Schadn. D’Renn-Gschoss ham a andare Farb.',
  'items.almabtrieb.flavourText': 'Renna und Ballern',
  'items.apfelkuchen.description': 'Hoit 4. Schadn +5%',
  'items.apfelkuchen.flavourText': 'Da beste Kuacha, den’s gibt.',
  'items.apfelkuchen-mit-rosinen.description': 'Hoit 4. Schadn +5%. Für imma Reichweitn -15%',
  'items.apfelkuchen-mit-rosinen.flavourText': 'Da schlechteste Kuacha, den’s gibt.',
  'items.apfelstrudel.description': 'Gschoss zertoaln si beim Einschlog. Schadn -25%',
  'items.apfelstrudel.flavourText':
    'So dünn zong, dass ma a Zeitung durchlesn kannt. Probiert hod’s no koana.',
  'items.bauern-mistgabel.description':
    'Kurza Mistgobl-Stoß: drei durchdringade Zinkn, 2x Schadn, koane Reichweitn',
  'items.bauern-mistgabel.flavourText':
    'Kündigt si scho vo weitem o. Funktioniert trotzdem jedsmoi.',
  'items.bierbank.description': 'Schiaßt zwoa Gschoss nebnanand. Schadn -20%',
  'items.bierbank.flavourText': 'Reserviert. Zuagebm, dass a ma reserviert hod, hod no koana.',
  'items.bierbauch.description': 'Trinkfest +1 solang du’n dabei host. Lauftempo -8%',
  'items.bierbauch.flavourText': 'Koa Fett. Stauraum.',
  'items.bierdeckel.description': 'Gschoss prallen vo Mauern o',
  'items.bierdeckel.flavourText':
    'Geht aa als Untersetza, falls d’s übers Herz bringst, eam higzlegn.',
  'items.bierkrug.description': 'Schadn +1 pro Stapl',
  'items.bierkrug.flavourText': 'Oana in jeda Hand is koa Stapl. Des is a Lebnsart.',
  'items.blaskapelle.description': 'A Klangring beschädigt ois um di rum, olle poa Sekundn',
  'items.blaskapelle.flavourText': 'Da Tubabläsa hod no nia a oanzigs Moi Luft hoin miaßn.',
  'items.blutwurz.description':
    'A Tod is ned s’End vom Lauf — solang d’ zruck zur Leich lafn konnst',
  'items.blutwurz.flavourText':
    'Blut. Geist. S’gleiche Woat, in zwoa Sprachn, de nia mitanand redn.',
  'items.boellerschmeisser.description':
    'Aktiv: an brennadn Böller higebm — der geht do, wo d’ stehst, a Sekundn später hi',
  'items.boellerschmeisser.flavourText':
    'D’Landstön is markiert. Trotzdem geht nia oana rechtzeitig weg.',
  'items.braumeister-hammer.description':
    'A Kill schickt a Druckwön durch ois, was sunst no in da Näh is',
  'items.braumeister-hammer.flavourText':
    'D’Fassl, de si ned auf de easchte Oat ozapfn lassn, kriang statt dem des do.',
  'items.braumeister-schuerze.description': 'Schiaßt an Fächa aus drei Gschoss. Schadn -30%',
  'items.braumeister-schuerze.flavourText': 'Er zielt, wia er oaschenkt. Geht nia daneb’n.',
  'items.braumeister-visier.description': 'Jeda 5. Schuss schiaßt a zsätzlis, durchdringads Salvn',
  'items.braumeister-visier.flavourText':
    'Er hod den gleichn Schuss scho zehntausndmoi obgebm. No nia daneb’n gwesn.',
  'items.brezn.description': 'A kreisade Brezn, de Gegna bei Berührung beschädigt',
  'items.brezn.flavourText': 'Leicht gsoizn. Schwer bewaffnet.',
  'items.brotzeitbrett.description': 'A Zimma räum bringt 1 Hoiung und a Biermarkn',
  'items.brotzeitbrett.flavourText': 'Radi, Kaas, a Brezn. Gonz alloa ferti wead damit no koana.',
  'items.colaweizen.description': 'Gschoss bleim pickn und langsam de Gegna. Schadn -20%',
  'items.colaweizen.flavourText': 'Iagendwo greint grod stad a Reinheitsgebot-Prüfa.',
  'items.der-ordner.description': 'Vertraute, de Gegna vo dia wegschubst',
  'items.der-ordner.flavourText': 'Oarm vaschränkt. Moanung gmacht.',
  'items.der-rosinenklauber.description':
    'Rosinen-Sacha valiern iahn Nochteil. Sperrt boade Reinheitspakte',
  'items.der-rosinenklauber.flavourText': 'Er vateidigt de Rosinen ned. Er isst’s bloß auf.',
  'items.feierabendbier.description': 'Hoit a bissl am Ofang vo jedm Stock. Kost a bissl Promille',
  'items.feierabendbier.flavourText':
    'Vadient in dera Sekundn, wo d’Schicht aus is. Koane Sekundn frira.',
  'items.feuerwehrhelm.description':
    'Gschoss san Löschwossa: jeda Treffa schubst des Ziel zruck. Gschossgschwindigkeit +25%',
  'items.feuerwehrhelm.flavourText': 'Gprüft gegn Hitz, Wucht und mindestens an Böllerschmeißer.',
  'items.fingerhakeln.description': 'Kontaktschadn, und zieht Gegna in da Näh zu dia her',
  'items.fingerhakeln.flavourText': 'Da Valiara zoit de nächste Rundn. Gibt imma a nächste Rundn.',
  'items.gartenzwerg-hut.description':
    'Ois 5s ohne Treffa kimmt a zsätzlichs Gschoss dazua (bis zu 3). A Treffa setzt’s zruck',
  'items.gartenzwerg-hut.flavourText':
    'Aufs Gsicht im Blumnbeet. Iagendwia is des trotzdem de Glückspose.',
  'items.gugelhupf.description':
    'Gschoss kreisn zruck zu dia und treffn af da Rückreis no amoi. Gschossgschwindigkeit -25%',
  'items.gugelhupf.flavourText':
    'A Kuacha mit am Loch drin, dass a durchgart. Des is da gonze Trick.',
  'items.haferlschuh.description': 'Lauftempo +15%, immun gegn rutschade Pfütz’n',
  'items.haferlschuh.flavourText':
    'Jeda Nagl vo Hand ineighaut, vo iagendwem, der des vui z’earnst nimmt.',
  'items.hendlgeruch.description': 'Zieht dauand entfernte Gegna zu dia her',
  'items.hendlgeruch.flavourText': 'Riacht ma an Kilometa weit. Olle im Kilometa hom jetzt Pläne.',
  'items.kartoffelsalat.description':
    'Gschoss zertoaln si beim Einschlog in zwoa Brockn. Reichweitn +15%',
  'items.kartoffelsalat.flavourText':
    'Jeds Familienrezept is des oanzig richtige, und olle mitanand kenna’s ned recht ham.',
  'items.karussell.description': 'Wenn d’ di bewegst, schubst d’ nahe Gegna mit',
  'items.karussell.flavourText':
    'Da Betreiba hod no nia an Sicherheitsbügel gprüft. D’Schlang wead nia kürza.',
  'items.kletzenbrot.description': 'Gschoss vagiftn, wos’ treffn. Schadn -15%',
  'items.kletzenbrot.flavourText': 'Hoit an Monat. Schmeckt aa so.',
  'items.konterbier.description': 'Trinka mit am Kater beseitigt eam sofort',
  'items.konterbier.flavourText': 'Hoor vom gleichn Hund. Da Hund denkt gern o di.',
  'items.kraftbier.description': 'Schadn +40%, Lauftempo -20%',
  'items.kraftbier.flavourText': 'De 9% aufm Etikett stengan ned zur Zier.',
  'items.lebkuchenherz.description':
    'A Spruch über’m Kopf mit am kloan Statuseffekt, der si vo Stock zu Stock ändert',
  'items.lebkuchenherz.flavourText': '"Ein Prosit" hod scho da Krug daneb’n ghobt.',
  'items.lederhosn.description': 'Fangt an Treffa pro Raum auf',
  'items.lederhosn.flavourText':
    'Steif gnua, dass s’vo alloa stengan bleibt. Manche song, des tuad s’eh scho.',
  'items.ludwigs-schwan.description':
    'Vertraute schiaßt ois poa Sekundn a zielsuachade Feda. Kost Biermarkn pro Stock',
  'items.ludwigs-schwan.flavourText': 'Paddlt in perfekte Kreis. Schickt dia de Rechnung.',
  'items.luftballon.description':
    'Gschoss kemman zu dia zruck, wenn’s iahne volle Reichweitn ghobt hom',
  'items.luftballon.flavourText': 'Mit Helium gfüllt. D’Gschoss brauchn’s ned, de Stimmung scho.',
  'items.mass.description':
    'A oanzigs riesigs, langsams Gschoss statt am Strahl. Schadn +200%, Feuerratn -66%',
  'items.mass.flavourText': 'A Liter. A Entscheidung. Koa Nochschenkn mitn im Kampf.',
  'items.neuschwanstein-bauplan.description': 'Grousa Statusschub. Kost jedn Stock mehr Biermarkn',
  'items.neuschwanstein-bauplan.flavourText': 'A unfertiga Flügl, ganz gnau eizoachnet.',
  'items.obazda.description': 'Valangsamt Gegna in dera Näh',
  'items.obazda.flavourText': 'Strenggnumma a Aufstrich. Vo da Konsistenz eher Mörtl.',
  'items.platzangst.description': 'Schadn +50%, Reichweitn -50%',
  'items.platzangst.flavourText':
    'Jeds Festzöt, Ellnbog o Ellnbog. Damit host scho vor a Weu Frieden gschlossn.',
  'items.radler.description': 'Schadn -50%, Feuerratn +100%',
  'items.radler.flavourText': 'A hoibs Bier. Doppelt so vui Streit, ob des zöht.',
  'items.reinheitsgebot-1516.description': 'Sperrt jeds Rosinen-Sach. Schadn +35%',
  'items.reinheitsgebot-1516.flavourText':
    'Wossa, Gerstn, Hopfa. Gschriebn, bevor iagendwer auf d’Idee kemma is, Rosinen zum dawähna.',
  'items.riesenrad.description':
    'A langsam kreisade Gondel, de bei Berührung Schadn macht und einfriert',
  'items.riesenrad.flavourText':
    'Offiziell für sechs Leit zuagelassn. Du bist mittlaweu de Oanzige, de no neipasst.',
  'items.rosinenbrot.description': 'Gschoss durchdringan an zsätzlichn Gegna. Reichweitn -20%',
  'items.rosinenbrot.flavourText': 'Iagendwer pickt’s raus. Iagendwer pickt’s imma raus.',
  'items.rosinenschnaps.description': 'Schadn +45%. Jeda Kill bringt 0,1 Promille dazua',
  'items.rosinenschnaps.flavourText': 'D’Ohma hod eam brennt. Da Ohma tuat’s ned laad.',
  'items.rosinenschnecke.description': 'Gschoss kurvn zum nächstn Ziel. Schadn -20%',
  'items.rosinenschnecke.flavourText': 'So fest zong, dass koana des End findt.',
  'items.ruhige-hand.description': 'Schadn +40% solang unta 0,5 Promille',
  'items.ruhige-hand.flavourText':
    'Des oanzige Sach im Zöt, des di vo da nächstn Rundn obhoitn wü.',
  'items.rumtopf.description': 'Schadn +80% — oba erst ab Vollrausch oda tiafer',
  'items.rumtopf.flavourText': 'Deckl drauf seit Juni. Nochgschaut hod no koana.',
  'items.sauwetter.description':
    'Gschoss ham bei jedm Schuss an andarn Statuseffekt: Brenna, Einfrian, Gift',
  'items.sauwetter.flavourText': 'Vier Jahreszeitn an oanam Nochmittog. Ab und zua in oana Minutn.',
  'items.schluesselbund.description':
    'Zoagt de Gheimraum vom Stock auf da Kartn. A Zimma räum bringt an Schlüssl',
  'items.schluesselbund.flavourText':
    'Passt in jeds Schloss im Keller. Warum, des z’erklärn is über dei Gehoitsstufn.',
  'items.schuhplattler.description': 'Kurz stostehn und a beschädigade Druckwön losn',
  'items.schuhplattler.flavourText': 'D’Physik dahinta is ned kloar. D’Begeistarung scho.',
  'items.semmelknoedel.description':
    'Gschoss treffn für 2x Schadn und fliang schwafällig. Gschossgschwindigkeit -40%',
  'items.semmelknoedel.flavourText': 'Schwar gnua, um a Argument z’sei.',
  'items.sixpack.description':
    'Aktiv: aufgsammelte Maß wandern in’n Träga — Knopfdruck trinkt oane',
  'items.sixpack.flavourText': 'Sechs Flaschn san koa Hortn. Sechs Flaschn san Planung.',
  'items.spezi.description': 'Schiaßt an zwoatn, abweichadn Schuss',
  'items.spezi.flavourText':
    'Beim Mischvahältnis is si koana einig. A Moanung hod trotzdem a jeda.',
  'items.steckerlfisch.description': 'Gschoss brenna bei am Treffa',
  'items.steckerlfisch.flavourText':
    'A Stund über offanem Feia gart. D’Gschoss ham’s schnö glernt.',
  'items.steinkrug.description': 'Gschoss fliang über Hindernis und spritzn beim Einschlog',
  'items.steinkrug.flavourText': 'Ned windschnittig. Söll a ned sei.',
  'items.studentenfutter.description':
    'Schadn +8% pro Kill in am Raum, bis zu +48%. Setzt si beim Räum zruck. Lauftempo -10%',
  'items.studentenfutter.flavourText': 'A Hand voi. Jedsmoi. A Hand voi.',
  'items.sudordnung-1493.description': 'Sperrt jeds Rosinen- und unreins Sach. Schadn +50%',
  'items.sudordnung-1493.flavourText':
    'Dreiazwanzg Joahr fria und strenga. Warum’s si ned durchgsetzt hod, woaß koana mehr.',
  'items.traktor-auspuff.description':
    'Beim Gehn bleibt a Spur aus giftign Auspuffwolkn zruck. Lauftempo +15%',
  'items.traktor-auspuff.flavourText': 'Ma heat eam zwoa Felda weida. Ois, was a Wahl hod, aa.',
  'items.watschn.description': 'A Treffa schickt a beschädigade Druckwön vo dia aus',
  'items.watschn.flavourText': 'D’bayerische Oat, Streit z’löse. Überraschad wirksam.',
  'items.weisswurst.description': 'Schadn +30% vor Stock 4. Donoch nix mehr',
  'items.weisswurst.flavourText':
    'D’Tradition sogt vorm Zwöfe-Läutn. Da Lauf sogt vor da Brauerei.',
  'items.zwetschgendatschi.description': 'A Raum ohne Treffa räum hoit 1. Reichweitn -15%',
  'items.zwetschgendatschi.flavourText': 'D’Zwetschgn san da Punkt. D’Rosinen san a Moanung.',
};

import type { DictKey } from '../translate.js';

/**
 * The German (Hochdeutsch) dictionary (#52).
 *
 * `Record<DictKey, string>` rather than `typeof en` on purpose: it means
 * every key `en.ts` declares must be present here with a `string` value, so
 * a key added to `en.ts` and forgotten here is a TypeScript error at this
 * declaration, naming the missing property, before it is ever a runtime
 * gap. See `src/i18n/translate.ts` and `tests/content/i18n-coverage.test.ts`.
 *
 * Item/curse/pickup/floor **names** are not translated here — they are not
 * dictionary keys at all, per `docs/CONTENT_BIBLE.md` §0.
 */
export const de: Record<DictKey, string> = {
  // --- Title flow -----------------------------------------------------
  'ui.title.start': 'Start',
  'ui.title.continue': 'Weiter',
  'ui.title.settings': 'Einstellungen',
  'ui.title.credits': 'Mitwirkende',
  'ui.title.quit': 'Beenden',
  'ui.title.tagline': 'Ein bayerisches Keller-Roguelike',

  'ui.pause.headline': 'Pause',
  'ui.pause.resume': 'Fortsetzen',
  'ui.pause.settings': 'Einstellungen',
  'ui.pause.quitToTitle': 'Zurück zum Titel',

  'ui.credits.headline': 'Mitwirkende',
  'ui.credits.back': 'Zurück',
  'ui.credits.line1': 'Ein Spiel von tilorgb',
  'ui.credits.line2': 'Gebaut mit Claude Code',
  'ui.credits.line3': 'Engine: three.js',

  // --- A run ending -----------------------------------------------------
  'ui.gameOver.retry': 'Nochmal',
  'ui.gameOver.results': 'Ergebnisse',
  'ui.gameOver.hub': 'Titel',
  'ui.gameOver.summary': '{seconds}s überlebt   {kills} getötet   {floor}',

  'ui.victory.headline': 'Sieg!',
  'ui.victory.epilogue': 'Fortsetzung folgt.',
  'ui.victory.retry': 'Nochmal',
  'ui.victory.results': 'Ergebnisse',
  'ui.victory.hub': 'Titel',
  'ui.victory.summary': '{seconds}s   {kills} getötet   {floor}',

  'ui.results.headline': 'Ergebnisse',
  'ui.results.newRun': 'Neuer Lauf',
  'ui.results.close': 'Schließen',
  'ui.results.backToRun': 'Zurück zum Lauf',
  'ui.results.unlocked': 'Freigeschaltet',
  'ui.results.theBoard': 'Die Bestenliste',
  'ui.results.boardEmptyLine1': 'Die Bestenliste ist noch leer —',
  'ui.results.boardEmptyLine2': 'hier hat noch niemand eingetragen.',
  'ui.results.noRunsYet': 'Noch keine Läufe auf der Liste.',
  'ui.results.stats': 'Läufe: {runs}    Kills: {kills}',
  'ui.results.boardRow': '{place}.  {seconds}   {kills} getötet   {floor}',
  'ui.results.noLastRun': 'Noch kein Lauf gespielt — der Keller wartet.',
  'ui.results.lastRunDeathWord': '  „{word}“',
  'ui.results.lastRun': 'Letzter Lauf — {seconds}  ·  {kills} getötet  ·  {floor}{word}',

  // --- Der Losbrunnen -----------------------------------------------------
  'ui.machinePicker.kaputt': 'Losbrunnen — kaputt.',
  'ui.machinePicker.emptyNothing': 'Losbrunnen — nichts zum Füttern da.',
  'ui.machinePicker.emptyGone': 'Losbrunnen — {itemName} ist weg.',
  'ui.machinePicker.unfedHint': 'Losbrunnen  [Aktion: Gegenstand wählen]',
  'ui.machinePicker.rollingHint': '…',
  'ui.machinePicker.moveChooseUseConfirm': '[Bewegung] wählen   [Aktion] bestätigen',
  'ui.machinePicker.useConfirm': '[Aktion] bestätigen',
  'ui.machinePicker.browseAndFeed': '[Bewegung] durchsehen   [Aktion] füttern',
  'ui.machinePicker.notEnoughBiermarken': 'nicht genug Biermarken',
  'ui.machinePicker.useReroll': '[Aktion] neu würfeln',
  'ui.machinePicker.rollingLabel': 'Würfelt…',
  'ui.machinePicker.choosePlaceholder': 'einen Gegenstand zum Start wählen',
  'ui.machinePicker.unluckyBadge': 'PECH',
  'ui.machinePicker.costLine': '{cost} Biermarken   {breakChance}% Bruchrisiko',

  // --- Floor title card -----------------------------------------------------
  'ui.floorTitleCard.ordinal.0': 'Nullter',
  'ui.floorTitleCard.ordinal.1': 'Erster',
  'ui.floorTitleCard.ordinal.2': 'Zweiter',
  'ui.floorTitleCard.ordinal.3': 'Dritter',
  'ui.floorTitleCard.ordinal.4': 'Vierter',
  'ui.floorTitleCard.ordinal.5': 'Fünfter',
  'ui.floorTitleCard.ordinal.6': 'Sechster',
  'ui.floorTitleCard.ordinal.7': 'Siebter',
  'ui.floorTitleCard.ordinal.further': 'Weiterer',
  'ui.floorTitleCard.floorLabel': '{ordinal} Stock',
  'ui.floorTitleCard.xlBadge': 'Ein ungewöhnlich großer Stock.',

  // --- HUD -----------------------------------------------------
  'ui.hud.bossBanner': 'Bossraum',
  'ui.hud.useHint': '[Aktion]',
  'ui.hud.notEnough': '(nicht genug)',
  'ui.hud.setCompletionDescription':
    'Das komplette {name}-Set — jedes Teil wirkt stärker im Verbund.',
  'ui.hud.setComplete': '{name} komplett! {description}',
  'ui.hud.sperrstundeCountdown': 'Sperrstunde — {seconds}s',
  'ui.hud.sperrstundeComing': 'Sperrstunde — der Ordner kommt',
  'ui.hud.minimapHeader': '{floor}. Stock — {name}',
  'ui.hud.bossLabel': 'BOSS',
  'ui.hud.tapUse': 'Antippen',
  'ui.hud.confirmLoadReplay': 'Jetzt eine Wiederholung laden? Das beendet den laufenden Lauf.',
  'ui.hud.blutwurzActive': 'Blutwurz — finde deine Leiche',
  'ui.hud.purseFlying': 'Geldbeutel: {biermarken} — fliegt',
  'ui.hud.purseEmpty': 'Geldbeutel leer — keine Kraft',
  'ui.hud.promilleUnlocked': '{meter} freigeschaltet',
  'ui.hud.promilleUnlockHint': 'Die Maß trifft härter. Zu viel, und du fällst um.',
  'ui.hud.promilleUnlockHintNeutral': 'Aufladen trifft härter. Zu viel, und du gehst zu Boden.',
  'ui.hud.unbound': 'nicht belegt',
  'ui.hud.activeItemDormant': '{name} ({requirement})',
  'ui.hud.activeItemReady': '{name} [{prompt}]',
  'ui.hud.activeItemCharging': '{name} {percent}%',

  // --- Settings screen -----------------------------------------------------
  'ui.settings.toggle': 'Einstellungen',
  'ui.settings.title': 'Einstellungen',
  'ui.settings.hint': 'Links/Rechts ändern   Enter bestätigen   Tab wechselt Reiter   Esc zurück',

  'ui.settings.tab.video': 'Video',
  'ui.settings.tab.audio': 'Audio',
  'ui.settings.tab.controls': 'Steuerung',
  'ui.settings.tab.accessibility': 'Barrierefreiheit',
  'ui.settings.tab.privacy': 'Datenschutz',
  'ui.settings.tab.language': 'Sprache',

  'ui.settings.video.windowScale': 'Fenstergröße',
  'ui.settings.video.auto': 'Automatisch',
  'ui.settings.video.toggleFullscreen': 'Vollbild umschalten',
  'ui.settings.video.fullscreen': 'Vollbild',
  'ui.settings.video.screenshake': 'Bildschirm-Wackler',
  'ui.settings.video.camerasway': 'Kameraschwanken',
  'ui.settings.video.hitstop': 'Trefferstopp',
  'ui.settings.video.reduceFlashing': 'Blitzeffekte reduzieren',

  'ui.settings.value.on': 'An',
  'ui.settings.value.off': 'Aus',

  'ui.settings.audio.master': 'Gesamt',
  'ui.settings.audio.music': 'Musik',
  'ui.settings.audio.sfx': 'Effekte',
  'ui.settings.audio.voice': 'Stimme',

  'ui.settings.controls.action': 'Aktion',
  'ui.settings.controls.rebindFor': 'Belegung für',
  'ui.settings.controls.keyboard': 'Tastatur',
  'ui.settings.controls.gamepad': 'Gamepad',
  'ui.settings.controls.connectedPrefix': 'Controller verbunden: ',
  'ui.settings.controls.controllerFallback': 'Controller',
  'ui.settings.controls.nonStandard':
    ' — untypisches Layout, unten neu belegen, falls die Tasten nicht stimmen.',
  'ui.settings.controls.none':
    'Kein Controller erkannt. Falls einer angeschlossen ist, drücke eine Taste darauf. ' +
    'Manche Programme (z. B. Steam Input) legen einen Controller auf die Maus und ' +
    'verstecken ihn vor dem Browser — das für diesen Controller ausschalten, falls die ' +
    'Sticks den Mauszeiger bewegen.',
  'ui.settings.controls.pressKey': 'Taste drücken…',
  'ui.settings.controls.pressButton': 'Knopf drücken…',
  'ui.settings.controls.resetBindings': 'Alle Belegungen zurücksetzen',
  'ui.settings.controls.deadZone': 'Gamepad-Totzone',
  'ui.settings.controls.aimAssist': 'Zielhilfe',

  'ui.settings.action.moveUp': 'Bewegen: hoch',
  'ui.settings.action.moveDown': 'Bewegen: runter',
  'ui.settings.action.moveLeft': 'Bewegen: links',
  'ui.settings.action.moveRight': 'Bewegen: rechts',
  'ui.settings.action.aimUp': 'Zielen: hoch',
  'ui.settings.action.aimDown': 'Zielen: runter',
  'ui.settings.action.aimLeft': 'Zielen: links',
  'ui.settings.action.aimRight': 'Zielen: rechts',
  'ui.settings.action.fire': 'Schießen',
  'ui.settings.action.bomb': 'Bombe',
  'ui.settings.action.use': 'Benutzen',
  'ui.settings.action.map': 'Karte',
  'ui.settings.action.pause': 'Pause',

  'ui.settings.accessibility.colourblind': 'Farbenblinden-Markierung für Projektile',
  'ui.settings.accessibility.textScale': 'Textgröße',
  'ui.settings.accessibility.noDrift': 'Kein-Drift-Modus',
  'ui.settings.accessibility.neutralReskin': 'Neutrale Anzeige (Kraft)',
  'ui.settings.accessibility.reducedMotion': 'Reduzierte Bewegung',
  'ui.settings.accessibility.slowMode': 'Zeitlupe',
  'ui.settings.accessibility.slowModeOff': 'Aus',
  'ui.settings.accessibility.reduceAudioDistortion': 'Promille-Audioverzerrung reduzieren',

  'ui.settings.privacy.copy':
    'Playtest-Telemetrie ist standardmäßig aus. Wird sie eingeschaltet, wird nur auf ' +
    'diesem Gerät aufgezeichnet: wie jeder Lauf endet (gewonnen oder gestorben, auf ' +
    'welchem Stock), wie lange jeder Raum zum Räumen brauchte, welche Gegenstände ' +
    'gehalten wurden und wie viel Zeit auf jeder Promille-Stufe verbracht wurde. Sonst ' +
    'nichts — kein Name, kein Konto, kein Standort, keine Möglichkeit herauszufinden, ' +
    'wer gespielt hat. Ein Lauf bleibt hier gespeichert, bis er selbst als Datei ' +
    'exportiert wird; es wird nie automatisch irgendetwas verschickt.',
  'ui.settings.privacy.session': 'Sitzung',
  'ui.settings.privacy.runsRecordedOne': '1 Lauf aufgezeichnet, wartet auf den Export.',
  'ui.settings.privacy.runsRecordedOther': '{count} Läufe aufgezeichnet, warten auf den Export.',
  'ui.settings.privacy.exportButton': 'Als Datei exportieren',
  'ui.settings.privacy.clearButton': 'Löschen',
  'ui.settings.privacy.shareToggle': 'Anonyme Playtest-Telemetrie teilen',

  // --- Floor flavour lines (name stays Bavarian in every locale) ---------
  'floors.cellar.flavour': 'Pass auf deine *Fiaß* auf.',
  'floors.rural.flavour': 'Sonnig, friedlich, *Blaskapell’n*.',
  'floors.wald.flavour': 'Ist das ein Reh? Oh, ein Reh!',
  'floors.alpen.flavour': 'Dünne Luft und harte *Haxn*.',
  'floors.schloss.flavour': 'Einheimische nennen seine Schönheit "*basst scho*".',
  'floors.brauerei.flavour': 'Irgendwer hat mir einen *Rausch* ins letzte Bier getan.',
  'floors.wiesn.flavour': 'Oans, zwoa, gsuffa!',

  // --- Curses -----------------------------------------------------
  'curses.nebel.description': 'Nebel vom Fluss. Keine Minikarte auf diesem Stock.',
  'curses.kater.description': 'Du startest den Stock mit einem Kater.',
  'curses.sperrstunde.description': 'Letzte Runde. Trödeln, und der Ordner holt dich.',
  'curses.foehn.description': 'Der Alpenwind schiebt jeden Schuss im Raum.',
  'curses.blaue-stunde.description': 'Tiefe Dämmerung. Deine Sicht reicht nur so weit.',

  // --- Pickups -----------------------------------------------------
  'pickups.mass-full.description': 'Erhöht Promille',
  'pickups.mass-half.description': 'Erhöht Promille (weniger)',
  'pickups.bratwurst-full.description': 'Heilt, senkt Promille',
  'pickups.bratwurst-full.soberDescription': 'Leben +2',
  'pickups.bratwurst-half.description': 'Heilt, senkt Promille',
  'pickups.bratwurst-half.soberDescription': 'Leben +1',
  'pickups.weisswurst-full.description': 'Seelenherz, senkt Promille',
  'pickups.weisswurst-full.soberDescription': 'Seelenherz +2',
  'pickups.weisswurst-half.description': 'Seelenherz, senkt Promille',
  'pickups.weisswurst-half.soberDescription': 'Seelenherz +1',
  'pickups.blutwurst-full.description': 'Ewiges Herz, senkt Promille',
  'pickups.blutwurst-full.soberDescription': 'Ewiges Herz +2',
  'pickups.blutwurst-half.description': 'Ewiges Herz, senkt Promille',
  'pickups.blutwurst-half.soberDescription': 'Ewiges Herz +1',
  'pickups.biermarke-1.description': 'Währung +1',
  'pickups.biermarke-5.description': 'Währung +5',
  'pickups.biermarke-10.description': 'Währung +10',
  'pickups.bierfassl.description': 'Bombe +1',
  'pickups.bierfassl-pack.description': 'Bombe +3',
  'pickups.kellerschluessel.description': 'Schlüssel +1',
  'pickups.kellerschluessel-ring.description': 'Schlüssel +3',
  'pickups.meisterschluessel.description': 'Öffnet die Bosstür',

  // --- Items (name stays Bavarian in every locale) -----------------------
  'items.almabtrieb.description':
    'Schüsse im Laufen machen 2x Schaden. "Laufschüsse" haben eine andere Farbe.',
  'items.almabtrieb.flavourText': 'Ballern im Laufen',
  'items.apfelkuchen.description': 'Heilt 4. Schaden +5%',
  'items.apfelkuchen.flavourText': 'Der beste Kuchen, den es gibt.',
  'items.apfelkuchen-mit-rosinen.description': 'Heilt 4. Schaden +5%. Dauerhaft Reichweite -15%',
  'items.apfelkuchen-mit-rosinen.flavourText': 'Der schlechteste Kuchen, den es gibt.',
  'items.apfelstrudel.description': 'Schüsse zerteilen sich beim Einschlag. Schaden -25%',
  'items.apfelstrudel.flavourText':
    'So dünn ausgezogen, dass man eine Zeitung durchlesen könnte. Probiert hat es noch niemand.',
  'items.bauern-mistgabel.description':
    'Kurzer Mistgabelstoß: drei durchdringende Zinken, 2x Schaden, keine Reichweite',
  'items.bauern-mistgabel.flavourText':
    'Kündigt sich schon von Weitem an. Funktioniert trotzdem jedes einzelne Mal.',
  'items.bierbank.description': 'Feuert zwei Schüsse nebeneinander. Schaden -20%',
  'items.bierbank.flavourText': 'Reserviert. Zugegeben hat das reservieren noch nie jemand.',
  'items.bierbauch.description': 'Trinkfest +1 solange gehalten. Lauftempo -8%',
  'items.bierbauch.flavourText': 'Kein Fett. Stauraum.',
  'items.bierdeckel.description': 'Schüsse prallen von Wänden ab',
  'items.bierdeckel.flavourText':
    'Funktioniert auch als Untersetzer, falls man es übers Herz bringt, ihn abzulegen.',
  'items.bierkrug.description': 'Schaden +1 pro Stapel',
  'items.bierkrug.flavourText': 'Einer in jeder Hand ist kein Stapel. Das ist ein Lebensstil.',
  'items.blaskapelle.description':
    'Ein Klangring beschädigt alles um dich herum, alle paar Sekunden',
  'items.blaskapelle.flavourText': 'Der Tubaspieler musste noch nie ein einziges Mal Luft holen.',
  'items.blutwurz.description':
    'Ein Tod beendet den Lauf nicht — solange du zur Leiche zurücklaufen kannst',
  'items.blutwurz.flavourText':
    'Blut. Geist. Dasselbe Wort, in zwei Sprachen, die nie miteinander reden.',
  'items.boellerschmeisser.description':
    'Aktiv: brennenden Böller ablegen — geht eine Sekunde später dort los, wo du stehst',
  'items.boellerschmeisser.flavourText':
    'Die Landestelle ist markiert. Trotzdem geht nie jemand rechtzeitig weg.',
  'items.braumeister-hammer.description':
    'Ein Kill schickt eine Druckwelle durch alles andere in der Nähe',
  'items.braumeister-hammer.flavourText':
    'Die Fässer, die sich nicht auf die leichte Art anzapfen lassen, kriegen stattdessen das hier.',
  'items.braumeister-schuerze.description': 'Feuert einen Fächer aus drei Schüssen. Schaden -30%',
  'items.braumeister-schuerze.flavourText': 'Er zielt, wie er einschenkt. Es geht nie daneben.',
  'items.braumeister-visier.description':
    'Jeder 5. Schuss feuert eine zusätzliche, durchdringende Salve',
  'items.braumeister-visier.flavourText':
    'Er hat denselben Schuss schon zehntausend Mal abgegeben. Er hat noch nie danebengelegen.',
  'items.brezn.description': 'Eine kreisende Brezn, die Gegner bei Berührung beschädigt',
  'items.brezn.flavourText': 'Leicht gesalzen. Schwer bewaffnet.',
  'items.brotzeitbrett.description': 'Einen Raum räumen heilt 1 und bringt eine Biermarke',
  'items.brotzeitbrett.flavourText':
    'Radi, Käse, eine Brezn. Allein aufgegessen hat das noch niemand.',
  'items.colaweizen.description': 'Schüsse bleiben kleben und verlangsamen Gegner. Schaden -20%',
  'items.colaweizen.flavourText': 'Irgendwo weint gerade still ein Reinheitsgebot-Prüfer.',
  'items.der-ordner.description': 'Vertrauter, der Gegner von dir wegschubst',
  'items.der-ordner.flavourText': 'Arme verschränkt. Meinung gemacht.',
  'items.der-rosinenklauber.description':
    'Rosinen-Gegenstände verlieren ihren Nachteil. Sperrt beide Reinheitspakte',
  'items.der-rosinenklauber.flavourText':
    'Er verteidigt die Rosinen nicht. Er isst sie einfach nur auf.',
  'items.feierabendbier.description':
    'Heilt ein wenig am Anfang jedes Stocks. Kostet ein wenig Promille',
  'items.feierabendbier.flavourText':
    'Verdient in der Sekunde, in der die Schicht endet. Keine Sekunde früher.',
  'items.feuerwehrhelm.description':
    'Schüsse sind Löschwasser: jeder Treffer schubst zurück. Schussgeschwindigkeit +25%',
  'items.feuerwehrhelm.flavourText':
    'Geprüft gegen Hitze, Wucht und mindestens einen Böllerschmeißer.',
  'items.fingerhakeln.description': 'Kontaktschaden, und zieht Gegner in der Nähe zu dir heran',
  'items.fingerhakeln.flavourText':
    'Der Verlierer zahlt die nächste Runde. Es gibt immer eine nächste Runde.',
  'items.gartenzwerg-hut.description':
    'Alle 5s ohne Treffer kommt ein Extraschuss dazu (bis zu 3). Ein Treffer setzt zurück',
  'items.gartenzwerg-hut.flavourText':
    'Kopfüber im Blumenbeet. Irgendwie ist das trotzdem die Glückspose.',
  'items.gugelhupf.description':
    'Schüsse kreisen zurück und treffen auf dem Rückweg erneut. Schussgeschwindigkeit -25%',
  'items.gugelhupf.flavourText':
    'Ein Kuchen mit Loch in der Mitte, damit er durchgart. Das ist der ganze Trick.',
  'items.haferlschuh.description': 'Lauftempo +15%, immun gegen rutschige Pfützen',
  'items.haferlschuh.flavourText':
    'Jeder Nagel von Hand geschlagen, von jemandem, der das viel zu ernst nimmt.',
  'items.hendlgeruch.description': 'Zieht ständig entfernte Gegner zu dir heran',
  'items.hendlgeruch.flavourText':
    'Trägt einen Kilometer weit. Alle im Umkreis eines Kilometers haben jetzt Pläne.',
  'items.kartoffelsalat.description':
    'Schüsse zerteilen sich beim Einschlag in zwei Brocken. Reichweite +15%',
  'items.kartoffelsalat.flavourText':
    'Jedes Familienrezept ist das einzig richtige, und sie können nicht alle recht haben.',
  'items.karussell.description': 'Bewegen schiebt nahe Gegner mit dir mit',
  'items.karussell.flavourText':
    'Der Betreiber hat noch nie einen Sicherheitsbügel geprüft. Die Schlange wird nie kürzer.',
  'items.kletzenbrot.description': 'Schüsse vergiften, was sie treffen. Schaden -15%',
  'items.kletzenbrot.flavourText': 'Hält sich einen Monat. Schmeckt auch so.',
  'items.konterbier.description': 'Trinken mit Kater beseitigt ihn sofort',
  'items.konterbier.flavourText': 'Haar vom selben Hund. Der Hund erinnert sich gern an dich.',
  'items.kraftbier.description': 'Schaden +40%, Lauftempo -20%',
  'items.kraftbier.flavourText': 'Die 9% auf dem Etikett stehen nicht zur Zierde.',
  'items.lebkuchenherz.description':
    'Ein Spruch überm Kopf mit kleinem Statuseffekt, der von Stock zu Stock wechselt',
  'items.lebkuchenherz.flavourText': '"Ein Prosit" war schon vom Krug daneben vergeben.',
  'items.lederhosn.description': 'Absorbiert einen Treffer pro Raum',
  'items.lederhosn.flavourText':
    'Steif genug, um von allein stehen zu bleiben. Manche sagen, das tut sie schon.',
  'items.ludwigs-schwan.description':
    'Vertrauter feuert alle paar Sekunden eine Zielfeder. Kostet Biermarken pro Stock',
  'items.ludwigs-schwan.flavourText': 'Paddelt in perfekten Kreisen. Schickt dir die Rechnung.',
  'items.luftballon.description':
    'Schüsse kehren zu dir zurück, nachdem sie ihre volle Reichweite erreicht haben',
  'items.luftballon.flavourText':
    'Mit Helium gefüllt. Die Schüsse brauchen es nicht, die Stimmung schon.',
  'items.mass.description':
    'Ein einziger riesiger, langsamer Schuss statt eines Strahls. Schaden +200%, Feuerrate -66%',
  'items.mass.flavourText': 'Ein Liter. Eine Entscheidung. Kein Nachschenken mitten im Kampf.',
  'items.neuschwanstein-bauplan.description':
    'Großer Statusschub. Kostet jeden Stock mehr Biermarken',
  'items.neuschwanstein-bauplan.flavourText':
    'Ein unfertiger Flügel, in beeindruckendem Detail gezeichnet.',
  'items.obazda.description': 'Verlangsamt Gegner in deiner Nähe',
  'items.obazda.flavourText': 'Streng genommen ein Aufstrich. Von der Konsistenz eher Mörtel.',
  'items.platzangst.description': 'Schaden +50%, Reichweite -50%',
  'items.platzangst.flavourText':
    'Jedes Festzelt, Ellbogen an Ellbogen. Damit hast du schon vor einer Weile Frieden geschlossen.',
  'items.radler.description': 'Schaden -50%, Feuerrate +100%',
  'items.radler.flavourText': 'Ein halbes Bier. Doppelt so viel Streit darüber, ob es zählt.',
  'items.reinheitsgebot-1516.description': 'Sperrt jeden Rosinen-Gegenstand. Schaden +35%',
  'items.reinheitsgebot-1516.flavourText':
    'Wasser, Gerste, Hopfen. Geschrieben, bevor irgendwer auf die Idee kam, Rosinen zu erwähnen.',
  'items.riesenrad.description':
    'Eine langsam kreisende Gondel, die bei Berührung Schaden macht und einfriert',
  'items.riesenrad.flavourText':
    'Offiziell für sechs Personen zugelassen. Du bist mittlerweile die Einzige, die noch reinpasst.',
  'items.rosinenbrot.description':
    'Schüsse durchdringen einen zusätzlichen Gegner. Reichweite -20%',
  'items.rosinenbrot.flavourText': 'Irgendwer pickt sie raus. Irgendwer pickt sie immer raus.',
  'items.rosinenschnaps.description': 'Schaden +45%. Jeder Kill fügt 0,1 Promille hinzu',
  'items.rosinenschnaps.flavourText': 'Die Oma hat ihn gebrannt. Der Oma tut es nicht leid.',
  'items.rosinenschnecke.description': 'Schüsse kurven zum nächsten Ziel. Schaden -20%',
  'items.rosinenschnecke.flavourText': 'So fest aufgerollt, dass niemand das Ende findet.',
  'items.ruhige-hand.description': 'Schaden +40% solange unter 0,5 Promille',
  'items.ruhige-hand.flavourText':
    'Der einzige Gegenstand im Zelt, der versucht, dich von der nächsten Runde abzuhalten.',
  'items.rumtopf.description': 'Schaden +80% — aber nur ab Vollrausch oder tiefer',
  'items.rumtopf.flavourText': 'Deckel drauf seit Juni. Nachgeschaut hat noch niemand.',
  'items.sauwetter.description':
    'Schüsse tragen bei jedem Schuss einen anderen Statuseffekt: Brennen, Einfrieren, Gift',
  'items.sauwetter.flavourText':
    'Vier Jahreszeiten an einem Nachmittag. Gelegentlich in einer Minute.',
  'items.schluesselbund.description':
    'Zeigt die Geheimräume des Stocks auf der Karte. Einen Raum räumen bringt einen Schlüssel',
  'items.schluesselbund.flavourText':
    'Passt in jedes Schloss im Keller. Warum, das zu erklären übersteigt deine Gehaltsstufe.',
  'items.schuhplattler.description':
    'Kurz stillstehen, um eine beschädigende Druckwelle freizusetzen',
  'items.schuhplattler.flavourText': 'Die Physik dahinter ist unklar. Die Begeisterung nicht.',
  'items.semmelknoedel.description':
    'Schüsse treffen für 2x Schaden und fliegen schwerfällig. Schussgeschwindigkeit -40%',
  'items.semmelknoedel.flavourText': 'Schwer genug, um ein Argument zu sein.',
  'items.sixpack.description':
    'Aktiv: aufgesammelte Maß wandern in den Träger — Knopfdruck trinkt eine',
  'items.sixpack.flavourText': 'Sechs Flaschen sind kein Horten. Sechs Flaschen sind Planung.',
  'items.spezi.description': 'Feuert einen zweiten, abweichenden Schuss',
  'items.spezi.flavourText':
    'Beim Mischverhältnis ist sich niemand einig. Eine Meinung hat trotzdem jeder.',
  'items.steckerlfisch.description': 'Schüsse brennen bei Treffer',
  'items.steckerlfisch.flavourText':
    'Eine Stunde über offenem Feuer gegart. Die Schüsse haben es schnell gelernt.',
  'items.steinkrug.description': 'Schüsse fliegen über Hindernisse und spritzen beim Einschlag',
  'items.steinkrug.flavourText': 'Nicht windschnittig. Soll er auch nicht sein.',
  'items.studentenfutter.description':
    'Schaden +8% je Kill im Raum, bis +48%. Setzt beim Räumen zurück. Lauftempo -10%',
  'items.studentenfutter.flavourText': 'Eine Handvoll. Jedes Mal. Eine Handvoll.',
  'items.sudordnung-1493.description':
    'Sperrt jeden Rosinen- und unreinen Gegenstand. Schaden +50%',
  'items.sudordnung-1493.flavourText':
    'Dreiundzwanzig Jahre früher und strenger. Warum es sich nicht durchgesetzt hat, weiß keiner mehr.',
  'items.traktor-auspuff.description':
    'Beim Laufen bleibt eine Spur aus giftigen Abgaswolken zurück. Lauftempo +15%',
  'items.traktor-auspuff.flavourText':
    'Man hört ihn zwei Felder weiter. Kann alles hören, das eine Wahl in der Sache hat.',
  'items.watschn.description': 'Getroffen werden schickt eine beschädigende Druckwelle von dir aus',
  'items.watschn.flavourText': 'Die bayerische Methode der Konfliktlösung. Überraschend wirksam.',
  'items.weisswurst.description': 'Schaden +30% vor Stock 4. Danach nichts mehr',
  'items.weisswurst.flavourText':
    'Die Tradition sagt vor dem Zwölfuhrläuten. Der Lauf sagt vor der Brauerei.',
  'items.zwetschgendatschi.description':
    'Einen Raum ohne Treffer zu räumen heilt 1. Reichweite -15%',
  'items.zwetschgendatschi.flavourText':
    'Die Zwetschgen sind der Punkt. Die Rosinen sind eine Meinung.',
};

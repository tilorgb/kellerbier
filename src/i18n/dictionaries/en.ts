/**
 * The canonical English dictionary (#52).
 *
 * This is the locale every other dictionary's completeness is checked
 * against — `keyof typeof en` is the whole key type (`src/i18n/translate.ts`),
 * so a key that exists here but not in `de.ts`/`bar.ts` is a TypeScript
 * compile error before it is ever a runtime one, and `tests/content/
 * i18n-coverage.test.ts` checks the same thing again at test time with a
 * message naming the exact key and locale.
 *
 * What is *not* here, deliberately (`docs/CONTENT_BIBLE.md` §0):
 * - Item, curse, pickup, floor, character and enemy **names** — Bavarian in
 *   every locale, authored once on the content definition itself.
 * - The death-word pool (`content/death-words.ts`) — Boarisch flavour in
 *   every locale, the same "one word, not a translated sentence" rule.
 * - "Promille" itself and its tier names (`sim/game/promille.ts`) — the
 *   mechanic's own vocabulary, not UI copy.
 * - `{n}`-style numeric suffixes (`%`, `x`) — notation, not language.
 *
 * Interpolation: a value containing `{name}` is filled in by `t()`'s third
 * argument (`src/i18n/translate.ts`) — `{seconds}`, `{kills}` and so on are
 * substituted by name, never by position, so a translation is free to
 * reorder them.
 */
export const en = {
  // --- Title flow -----------------------------------------------------
  'ui.title.start': 'Start',
  'ui.title.continue': 'Continue',
  'ui.title.settings': 'Settings',
  'ui.title.credits': 'Credits',
  'ui.title.quit': 'Quit',

  'ui.pause.headline': 'Paused',
  'ui.pause.resume': 'Resume',
  'ui.pause.settings': 'Settings',
  'ui.pause.quitToTitle': 'Quit to Title',

  'ui.credits.headline': 'Credits',
  'ui.credits.back': 'Back',
  'ui.credits.line1': 'A game by tilorgb',
  'ui.credits.line2': 'Built with Claude Code',
  'ui.credits.line3': 'Engine: three.js',

  // --- A run ending -----------------------------------------------------
  'ui.gameOver.retry': 'Retry',
  'ui.gameOver.results': 'Results',
  'ui.gameOver.hub': 'Hub',
  'ui.gameOver.summary': '{seconds}s survived   {kills} killed   {floor}',

  'ui.victory.headline': 'Victory!',
  'ui.victory.epilogue': 'To be continued.',
  'ui.victory.retry': 'Retry',
  'ui.victory.results': 'Results',
  'ui.victory.hub': 'Hub',
  'ui.victory.summary': '{seconds}s   {kills} killed   {floor}',

  'ui.results.headline': 'Results',
  'ui.results.newRun': 'New Run',
  'ui.results.close': 'Close',
  'ui.results.backToRun': 'Back to Run',
  'ui.results.unlocked': 'Unlocked',
  'ui.results.theBoard': 'The Board',
  'ui.results.boardEmptyLine1': 'The board is still empty —',
  'ui.results.boardEmptyLine2': 'nobody has written on it yet.',
  'ui.results.noRunsYet': 'No runs on the board yet.',
  'ui.results.stats': 'Runs: {runs}    Kills: {kills}',
  'ui.results.boardRow': '{place}.  {seconds}   {kills} killed   {floor}',
  'ui.results.noLastRun': 'No run played yet — the cellar is waiting.',
  'ui.results.lastRunDeathWord': '  "{word}"',
  'ui.results.lastRun': 'Last run — {seconds}  ·  {kills} killed  ·  {floor}{word}',

  // --- Der Losbrunnen -----------------------------------------------------
  'ui.machinePicker.kaputt': 'Losbrunnen — kaputt.',
  'ui.machinePicker.emptyNothing': 'Losbrunnen — nothing to feed it.',
  'ui.machinePicker.emptyGone': 'Losbrunnen — {itemName} is gone.',
  'ui.machinePicker.unfedHint': 'Losbrunnen  [use: choose an item]',
  'ui.machinePicker.rollingHint': '…',
  'ui.machinePicker.moveChooseUseConfirm': '[move] choose   [use] confirm',
  'ui.machinePicker.useConfirm': '[use] confirm',
  'ui.machinePicker.browseAndFeed': '[move] browse   [use] feed',
  'ui.machinePicker.notEnoughBiermarken': 'not enough Biermarken',
  'ui.machinePicker.useReroll': '[use] reroll',
  'ui.machinePicker.rollingLabel': 'Rolling…',
  'ui.machinePicker.choosePlaceholder': 'choose an item to begin',
  'ui.machinePicker.unluckyBadge': 'UNLUCKY',
  'ui.machinePicker.costLine': '{cost} Biermarken   {breakChance}% to break',

  // --- Floor title card -----------------------------------------------------
  'ui.floorTitleCard.ordinal.0': 'Zeroth',
  'ui.floorTitleCard.ordinal.1': 'First',
  'ui.floorTitleCard.ordinal.2': 'Second',
  'ui.floorTitleCard.ordinal.3': 'Third',
  'ui.floorTitleCard.ordinal.4': 'Fourth',
  'ui.floorTitleCard.ordinal.5': 'Fifth',
  'ui.floorTitleCard.ordinal.6': 'Sixth',
  'ui.floorTitleCard.ordinal.7': 'Seventh',
  'ui.floorTitleCard.ordinal.further': 'Further',
  'ui.floorTitleCard.floorLabel': '{ordinal} Floor',
  'ui.floorTitleCard.xlBadge': 'An unusually large floor.',

  // --- HUD -----------------------------------------------------
  'ui.hud.bossBanner': 'Boss Room',
  'ui.hud.useHint': '[use]',
  'ui.hud.notEnough': '(not enough)',
  'ui.hud.setCompletionDescription': 'The full {name} set — every piece is doing more together.',
  'ui.hud.setComplete': '{name} complete! {description}',
  'ui.hud.sperrstundeCountdown': 'Sperrstunde — {seconds}s',
  'ui.hud.sperrstundeComing': 'Sperrstunde — the Ordner are coming',
  'ui.hud.minimapHeader': '{floor}. Floor — {name}',
  'ui.hud.bossLabel': 'BOSS',
  'ui.hud.tapUse': 'Tap Use',
  'ui.hud.confirmLoadReplay': 'Load a replay now? This ends the run in progress.',
  'ui.hud.blutwurzActive': 'Blutwurz — find your corpse',
  'ui.hud.purseFlying': 'Purse: {biermarken} — flying',
  'ui.hud.purseEmpty': 'Purse empty — no power',
  'ui.hud.promilleUnlocked': '{meter} unlocked',
  'ui.hud.promilleUnlockHint': 'The Maß hits harder. Too much and you fall over.',
  'ui.hud.promilleUnlockHintNeutral': 'Charging up hits harder. Too much and you go down.',
  'ui.hud.unbound': 'unbound',
  'ui.hud.activeItemDormant': '{name} ({requirement})',
  'ui.hud.activeItemReady': '{name} [{prompt}]',
  'ui.hud.activeItemCharging': '{name} {percent}%',

  // --- Settings screen -----------------------------------------------------
  'ui.settings.toggle': 'settings',
  'ui.settings.title': 'Settings',

  'ui.settings.tab.video': 'Video',
  'ui.settings.tab.audio': 'Audio',
  'ui.settings.tab.controls': 'Controls',
  'ui.settings.tab.accessibility': 'Accessibility',
  'ui.settings.tab.privacy': 'Privacy',
  'ui.settings.tab.language': 'Language',

  'ui.settings.video.windowScale': 'Window scale',
  'ui.settings.video.auto': 'Auto',
  'ui.settings.video.toggleFullscreen': 'Toggle fullscreen',
  'ui.settings.video.screenshake': 'Screenshake',
  'ui.settings.video.camerasway': 'Camera sway',
  'ui.settings.video.hitstop': 'Hitstop',
  'ui.settings.video.reduceFlashing': 'Reduce flashing',

  'ui.settings.audio.master': 'Master',
  'ui.settings.audio.music': 'Music',
  'ui.settings.audio.sfx': 'SFX',
  'ui.settings.audio.voice': 'Voice',

  'ui.settings.controls.action': 'Action',
  'ui.settings.controls.keyboard': 'Keyboard',
  'ui.settings.controls.gamepad': 'Gamepad',
  'ui.settings.controls.connectedPrefix': 'Controller connected: ',
  'ui.settings.controls.controllerFallback': 'Controller',
  'ui.settings.controls.nonStandard':
    ' — non-standard layout, rebind below if the buttons are wrong.',
  'ui.settings.controls.none':
    'No controller detected. If one is plugged in, press a button on it. ' +
    'Some tools (e.g. Steam Input) map a controller to the mouse and hide it from the browser — ' +
    'turn that off for this pad if the sticks are moving the cursor.',
  'ui.settings.controls.pressKey': 'Press a key…',
  'ui.settings.controls.pressButton': 'Press a button…',
  'ui.settings.controls.resetBindings': 'Reset all bindings',
  'ui.settings.controls.deadZone': 'Gamepad dead zone',
  'ui.settings.controls.aimAssist': 'Aim assist',

  'ui.settings.action.moveUp': 'Move up',
  'ui.settings.action.moveDown': 'Move down',
  'ui.settings.action.moveLeft': 'Move left',
  'ui.settings.action.moveRight': 'Move right',
  'ui.settings.action.aimUp': 'Aim up',
  'ui.settings.action.aimDown': 'Aim down',
  'ui.settings.action.aimLeft': 'Aim left',
  'ui.settings.action.aimRight': 'Aim right',
  'ui.settings.action.fire': 'Fire',
  'ui.settings.action.bomb': 'Bomb',
  'ui.settings.action.use': 'Use',
  'ui.settings.action.map': 'Map',
  'ui.settings.action.pause': 'Pause',

  'ui.settings.accessibility.colourblind': 'Colourblind-safe projectile marker',
  'ui.settings.accessibility.textScale': 'Text scale',
  'ui.settings.accessibility.noDrift': 'No-drift mode',
  'ui.settings.accessibility.neutralReskin': 'Neutral reskin (Kraft)',
  'ui.settings.accessibility.reducedMotion': 'Reduced motion',
  'ui.settings.accessibility.slowMode': 'Slow-mode',
  'ui.settings.accessibility.slowModeOff': 'Off',
  'ui.settings.accessibility.reduceAudioDistortion': 'Reduce Promille audio distortion',

  'ui.settings.privacy.copy':
    'Playtest telemetry is off by default. Turning it on records, on this device only, ' +
    'how each run ends (won or died, on which floor), how long each room took to clear, ' +
    'which items were held, and how much time was spent at each Promille tier. Nothing ' +
    'else — no name, no account, no location, no way to identify who played. A run is ' +
    'kept here until you export it as a file yourself; nothing is ever sent anywhere ' +
    'automatically.',
  'ui.settings.privacy.session': 'Session',
  'ui.settings.privacy.runsRecordedOne': '1 run recorded, waiting to be exported.',
  'ui.settings.privacy.runsRecordedOther': '{count} runs recorded, waiting to be exported.',
  'ui.settings.privacy.exportButton': 'Export as file',
  'ui.settings.privacy.clearButton': 'Clear',
  'ui.settings.privacy.shareToggle': 'Share anonymous playtest telemetry',

  // --- Floor flavour lines (name stays Bavarian in every locale) ---------
  'floors.cellar.flavour': 'Watch your *Fiaß*.',
  'floors.rural.flavour': 'Sunny, peaceful, *Blaskapell’n*.',
  'floors.wald.flavour': 'Oh, deer!',
  'floors.alpen.flavour': 'Thin air and hard *Haxn*.',
  'floors.schloss.flavour': 'Locals describe its beauty as "*basst scho*."',
  'floors.brauerei.flavour': 'Someone put a *Rausch* in my last beer.',
  'floors.wiesn.flavour': 'Ole, ole, ole!',

  // --- Curses -----------------------------------------------------
  'curses.nebel.description': 'Fog off the river. No minimap for the floor.',
  'curses.kater.description': 'You start the floor hungover.',
  'curses.sperrstunde.description': 'Last call. Dawdle and the Ordner come for you.',
  'curses.foehn.description': 'The alpine wind pushes every shot in the room.',
  'curses.blaue-stunde.description': 'Heavy dusk. Your sight only carries so far.',

  // --- Pickups -----------------------------------------------------
  'pickups.mass-full.description': 'Raises Promille',
  'pickups.mass-half.description': 'Raises Promille (less)',
  'pickups.bratwurst-full.description': 'Heal, lowers Promille',
  'pickups.bratwurst-full.soberDescription': 'Health +2',
  'pickups.bratwurst-half.description': 'Heal, lowers Promille',
  'pickups.bratwurst-half.soberDescription': 'Health +1',
  'pickups.weisswurst-full.description': 'Soul heart, lowers Promille',
  'pickups.weisswurst-full.soberDescription': 'Soul heart +2',
  'pickups.weisswurst-half.description': 'Soul heart, lowers Promille',
  'pickups.weisswurst-half.soberDescription': 'Soul heart +1',
  'pickups.blutwurst-full.description': 'Eternal heart, lowers Promille',
  'pickups.blutwurst-full.soberDescription': 'Eternal heart +2',
  'pickups.blutwurst-half.description': 'Eternal heart, lowers Promille',
  'pickups.blutwurst-half.soberDescription': 'Eternal heart +1',
  'pickups.biermarke-1.description': 'Currency +1',
  'pickups.biermarke-5.description': 'Currency +5',
  'pickups.biermarke-10.description': 'Currency +10',
  'pickups.bierfassl.description': 'Bomb +1',
  'pickups.bierfassl-pack.description': 'Bomb +3',
  'pickups.kellerschluessel.description': 'Key +1',
  'pickups.kellerschluessel-ring.description': 'Key +3',
  'pickups.meisterschluessel.description': 'Opens the boss door',

  // --- Items (name stays Bavarian in every locale) -----------------------
  'items.almabtrieb.description':
    'Shooting while moving has 2x damage. The "moving shots" have different color.',
  'items.almabtrieb.flavourText': 'Run and Gun',
  'items.apfelkuchen.description': 'Heals 4. Damage +5%',
  'items.apfelkuchen.flavourText': 'Best Kuchen there is.',
  'items.apfelkuchen-mit-rosinen.description': 'Heals 4. Damage +5%. Permanently Range -15%',
  'items.apfelkuchen-mit-rosinen.flavourText': 'Worst Kuchen there is.',
  'items.apfelstrudel.description': 'Shots split apart on impact. Damage -25%',
  'items.apfelstrudel.flavourText':
    'Pulled thin enough to read a newspaper through. Nobody has tried.',
  'items.bauern-mistgabel.description':
    'Shots become a short pitchfork jab: three piercing prongs, 2x damage, no range',
  'items.bauern-mistgabel.flavourText':
    'Telegraphs the whole thing from a mile off. Still works every single time.',
  'items.bierbank.description': 'Fires two shots side by side. Damage -20%',
  'items.bierbank.flavourText': 'Reserved. Nobody has ever admitted to reserving it.',
  'items.bierbauch.description': 'Trinkfest +1 while held. Move Speed -8%',
  'items.bierbauch.flavourText': 'Not fat. Storage.',
  'items.bierdeckel.description': 'Shots ricochet off walls',
  'items.bierdeckel.flavourText': 'Also doubles as a coaster, if you can bear to put it down.',
  'items.bierkrug.description': 'Damage +1 per stack',
  'items.bierkrug.flavourText': 'One in each hand is not a stack. It is a lifestyle.',
  'items.blaskapelle.description': 'A sound ring damages everything around you every few seconds',
  'items.blaskapelle.flavourText': 'The tuba player has never once needed to breathe.',
  'items.blutwurz.description':
    'A death does not end the run — if you can walk back for the corpse',
  'items.blutwurz.flavourText':
    'Blut. Geist. Same word, in two languages that never talk to each other.',
  'items.boellerschmeisser.description':
    'Active: drop a lit Böller — it goes off where you stand, one second later',
  'items.boellerschmeisser.flavourText':
    'The landing spot is marked. Nobody ever moves in time regardless.',
  'items.braumeister-hammer.description':
    'A kill sends a shockwave through whatever else is nearby',
  'items.braumeister-hammer.flavourText':
    "The casks that don't tap the easy way meet this instead.",
  'items.braumeister-schuerze.description': 'Fires a fan of three shots. Damage -30%',
  'items.braumeister-schuerze.flavourText': 'He aims the way he pours. It never spills.',
  'items.braumeister-visier.description': 'Every 5th shot fires an extra, piercing volley',
  'items.braumeister-visier.flavourText':
    'He has fired the same shot ten thousand times. It has never once missed.',
  'items.brezn.description': 'An orbiting pretzel that damages enemies on contact',
  'items.brezn.flavourText': 'Lightly salted. Heavily weaponised.',
  'items.brotzeitbrett.description': 'Clearing a room heals 1 and grants a Biermarken',
  'items.brotzeitbrett.flavourText':
    'Radishes, cheese, a pretzel. Nobody has ever once finished one alone.',
  'items.colaweizen.description': 'Shots stick and slow enemies. Damage -20%',
  'items.colaweizen.flavourText': 'Somewhere, a Reinheitsgebot enforcer is quietly weeping.',
  'items.der-ordner.description': 'Familiar that shoves enemies away from you',
  'items.der-ordner.flavourText': 'Arms crossed. Opinions closed.',
  'items.der-rosinenklauber.description':
    'Rosinen items lose their drawback. Locks out both purity pacts',
  'items.der-rosinenklauber.flavourText':
    'He is not defending the raisins. He is just eating them.',
  'items.feierabendbier.description':
    'Heals a little at the start of every floor. Costs a little Promille',
  'items.feierabendbier.flavourText': 'Earned the second the shift ends. Not one second before.',
  'items.feuerwehrhelm.description':
    'Shots are hose water: every hit shoves its target back. Shot Speed +25%',
  'items.feuerwehrhelm.flavourText':
    'Rated to withstand heat, impact, and at least one Böllerschmeißer.',
  'items.fingerhakeln.description': 'Contact damage, and drags nearby enemies toward you',
  'items.fingerhakeln.flavourText': 'The loser buys the next round. There is always a next round.',
  'items.gartenzwerg-hut.description':
    'Every 5s without a hit adds an extra shot (up to 3). One hit resets it',
  'items.gartenzwerg-hut.flavourText':
    'Face down in the flower bed. Somehow this is still the lucky pose.',
  'items.gugelhupf.description':
    'Shots ring back to you, hitting again on the way. Shot Speed -25%',
  'items.gugelhupf.flavourText':
    'A cake with a hole in it, so it cooks through. That is the whole trick.',
  'items.haferlschuh.description': 'Move Speed +15%, immune to slick puddles',
  'items.haferlschuh.flavourText':
    'Every nail hand-driven by someone who takes this far too seriously.',
  'items.hendlgeruch.description': 'Constantly pulls distant enemies toward you',
  'items.hendlgeruch.flavourText':
    'Carries for a kilometre. Everyone within a kilometre now has plans.',
  'items.kartoffelsalat.description': 'Shots split into two chunks on impact. Range +15%',
  'items.kartoffelsalat.flavourText':
    'Every family recipe is the only correct one and they cannot all be right.',
  'items.karussell.description': 'Moving pushes nearby enemies along with you',
  'items.karussell.flavourText':
    'The operator has not once checked a safety harness. The line never gets shorter.',
  'items.kletzenbrot.description': 'Shots poison what they hit. Damage -15%',
  'items.kletzenbrot.flavourText': 'Keeps for a month. Tastes like it has.',
  'items.konterbier.description': 'Drinking while hungover instantly clears the Kater',
  'items.konterbier.flavourText': 'Hair of the dog. The dog remembers you fondly.',
  'items.kraftbier.description': 'Damage +40%, Move Speed -20%',
  'items.kraftbier.flavourText': 'The label does not say 9% for decoration.',
  'items.lebkuchenherz.description':
    'A slogan overhead with a small stat effect that changes floor to floor',
  'items.lebkuchenherz.flavourText': '"Ein Prosit" was already taken by the mug next to it.',
  'items.lederhosn.description': 'Absorbs one hit per room',
  'items.lederhosn.flavourText': 'Stiff enough to stand up on its own. Some say it already does.',
  'items.ludwigs-schwan.description':
    'Familiar fires a homing feather every couple of seconds. Costs Biermarken per floor',
  'items.ludwigs-schwan.flavourText': 'Paddles in perfect circles. Sends you the bill.',
  'items.luftballon.description': 'Shots return to you after traveling their full range',
  'items.luftballon.flavourText': 'Filled with helium. The shots do not need it, but morale does.',
  'items.mass.description': 'One huge, slow shot instead of a stream. Damage +200%, Fire Rate -66%',
  'items.mass.flavourText': 'One litre. One decision. No refills mid-fight.',
  'items.neuschwanstein-bauplan.description': 'Large stat boost. Costs more Biermarken every floor',
  'items.neuschwanstein-bauplan.flavourText': 'An unfinished wing, drawn in impressive detail.',
  'items.obazda.description': 'Slows enemies near you',
  'items.obazda.flavourText': 'Technically a dip. Structurally closer to mortar.',
  'items.platzangst.description': 'Damage +50%, Range -50%',
  'items.platzangst.flavourText':
    'Every festival tent, elbow to elbow. You made your peace with this a while ago.',
  'items.radler.description': 'Damage -50%, Fire Rate +100%',
  'items.radler.flavourText': 'Half a beer. Twice the argument about whether it counts as one.',
  'items.reinheitsgebot-1516.description': 'Locks out every rosinen item. Damage +35%',
  'items.reinheitsgebot-1516.flavourText':
    'Water, barley, hops. Written before anyone thought to mention raisins.',
  'items.riesenrad.description': 'A slow-orbiting gondola that damages and freezes on contact',
  'items.riesenrad.flavourText':
    'Officially rated for six people. You are, at this point, the only one who fits.',
  'items.rosinenbrot.description': 'Shots pierce one extra enemy. Range -20%',
  'items.rosinenbrot.flavourText': 'Somebody picks them out. Somebody always picks them out.',
  'items.rosinenschnaps.description': 'Damage +45%. Every kill adds 0.1 Promille',
  'items.rosinenschnaps.flavourText': 'Grandmother made it. Grandmother is not sorry.',
  'items.rosinenschnecke.description': 'Shots curl toward whatever is nearest. Damage -20%',
  'items.rosinenschnecke.flavourText': 'Wound tight enough that nobody can find the end of it.',
  'items.ruhige-hand.description': 'Damage +40% while under 0.5 Promille',
  'items.ruhige-hand.flavourText':
    'The only item in the tent trying to talk you out of another round.',
  'items.rumtopf.description': 'Damage +80% — but only in Vollrausch or deeper',
  'items.rumtopf.flavourText': 'Lid on since June. Nobody has looked.',
  'items.sauwetter.description':
    'Shots carry a different status effect every shot: burning, freezing, poison',
  'items.sauwetter.flavourText': 'Four seasons in one afternoon. Occasionally in one minute.',
  'items.schluesselbund.description':
    "Shows the floor's secret rooms on the map. Clearing a room grants a key",
  'items.schluesselbund.flavourText':
    'Fits every lock in the Keller. Explaining why is above your pay grade.',
  'items.schuhplattler.description': 'Stand still for a moment to release a damaging shockwave',
  'items.schuhplattler.flavourText': 'The physics of it are unclear. The enthusiasm is not.',
  'items.semmelknoedel.description': 'Shots hit for 2x and travel heavily. Shot Speed -40%',
  'items.semmelknoedel.flavourText': 'Heavy enough to be an argument.',
  'items.sixpack.description': 'Active: Maß you pick up go in the carrier — press to drink one',
  'items.sixpack.flavourText': 'Six bottles is not hoarding. Six bottles is planning.',
  'items.spezi.description': 'Fires a second, diverging shot',
  'items.spezi.flavourText': 'Nobody agrees on the ratio. Everybody has an opinion.',
  'items.steckerlfisch.description': 'Shots burn on hit',
  'items.steckerlfisch.flavourText':
    'Cooked over an open flame for an hour. The shots learned fast.',
  'items.steinkrug.description': 'Shots fly over obstacles and splash on impact',
  'items.steinkrug.flavourText': 'Not aerodynamic. Not meant to be.',
  'items.studentenfutter.description':
    'Damage +8% per kill in a room, up to +48%. Resets on clear. Move Speed -10%',
  'items.studentenfutter.flavourText': 'One handful. Every time. One handful.',
  'items.sudordnung-1493.description': 'Locks out every rosinen and impure item. Damage +50%',
  'items.sudordnung-1493.flavourText':
    'Twenty-three years earlier and stricter. Nobody remembers why it lost.',
  'items.traktor-auspuff.description':
    'Moving leaves a trail of poison exhaust clouds behind you. Move Speed +15%',
  'items.traktor-auspuff.flavourText':
    'You can hear it two fields over. So can everything with a choice in the matter.',
  'items.watschn.description': 'Getting hit sends a damaging shockwave out from you',
  'items.watschn.flavourText': 'The Bavarian conflict-resolution method. Surprisingly effective.',
  'items.weisswurst.description': 'Damage +30% before floor 4. Nothing after',
  'items.weisswurst.flavourText':
    'The tradition says before the noon bell. The run says before the Brauerei.',
  'items.zwetschgendatschi.description': 'Clearing a room without being hit heals 1. Range -15%',
  'items.zwetschgendatschi.flavourText': 'The plums are the point. The raisins are an opinion.',
} as const;

# Kellerbier Item Roster

Full list of all 139 items currently authored in `src/content/items/`. Generated from the
item definitions themselves (`src/sim/item/definition.ts`), so it reflects exactly what is
live in the game, not a design doc that can drift from the code.

**How to use this file:** make edits directly in this table (change descriptions, effects,
quality, pools, active/passive, etc.), add new rows for new items, or delete rows for items
to remove, then hand the updated file back and the corresponding `src/content/items/*.ts`
files will be updated to match. Keep the `ID` column stable for existing items — it is the key
used to map a row back to its source file. For a brand new item, leave `ID` blank or write
`NEW` and give it a descriptive `Name`; an id will be derived from the name.

Columns:
- **ID** — internal identifier (lower-case, no spaces), matches the file in `src/content/items/`.
- **Name** — the in-game (German) name.
- **Type** — `Active` (has a use button and charge bar) or `Passive` (always on while held).
- **Effect** — the short, literal effect text shown to the player.
- **Flavour Text** — in-character flavour line (not yet shown in-game, but authored).
- **Quality** — rarity/power tier, 0 (weakest) to 3 (strongest).
- **Pools** — which pools the item can be offered from (Treasure, Shop, Boss, Devil, Angel, Secret, Curse).
- **Promille Req.** — `Any`, `Sober` (never appears once Promille is unlocked), or `Rausch` (requires a Promille tier).

| ID | Name | Type | Effect | Flavour Text | Quality | Pools | Promille Req. |
|---|---|---|---|---|---|---|---|
| ahnenbueste | Ahnenbüste | Passive | Stammwürze grows with every floor you reach | Stone eyes. They have been watching the stairs since long before you arrived. | 3 | Secret, Boss | Any |
| almabtrieb | Almabtrieb | Passive | Kills build stacking speed. Getting hit resets it | Nobody has ever explained how forty cows agree on a direction. | 1 | Treasure, Shop, Boss | Any |
| almhuettn-feuer | Almhüttn-Feuer | Passive | Sober. Heals a little and lowers Promille a little at the start of every floor | Somebody is yodelling. It's the least threatening sound in the whole run. | 1 | Treasure, Secret | Sober |
| almhuettn-jodler | Almhüttn-Jodler | Passive | Standing still slowly heals you | Somebody up there has been yodelling since before anyone can remember arriving. | 1 | Treasure, Secret | Sober |
| almrausch | Almrausch | Passive | The higher your Promille, the harder you hit | The flower is mildly toxic. Nobody involved considers that the concerning part. | 2 | Treasure, Shop, Boss | Any |
| almrosenkranz | Almrosenkranz | Passive | Sober. Every third room cleared grants a soul heart | Picked sober, worn sober. The mountain does not negotiate on this one. | 1 | Treasure, Secret | Sober |
| alpengluehen | Alpenglühen | Passive | Shots gain burning. At high Promille, so do you | Beautiful from a distance. You are not at a distance. | 2 | Shop, Boss, Secret | Any |
| alpenkrone-kronkorken | Alpenkrone Kronkorken | Passive | Dusel +1 per stack. Kills pay out a Biermarken | Printed underside: "Leider nichts gewonnen." Every single time, until this one. | 0 | Treasure, Shop | Any |
| alpensegen | Alpensegen | Passive | Kills occasionally grant a Biermarken | Small mercies. Mostly financial. | 2 | Shop, Boss, Angel | Any |
| apfelkuchen | Apfelkuchen | Passive | Heals 4. Stammwürze +5% | Oma's. Still warm, if you get down there before Opa does. | 0 | Treasure, Shop | Any |
| apfelkuchen-mit-rosinen | Apfelkuchen (mit Rosinen) | Passive | Heals 4. Stammwürze +5%. Permanently Reichweite -15% | Somebody picked through the crate. Somebody else did not check hard enough. | 0 | Treasure, Shop | Any |
| bauern-mistgabel | Bauern-Mistgabel | Passive | The first shot fired in every room deals bonus damage | Telegraphs the whole thing from a mile off. Still works every single time. | 1 | Treasure, Shop, Boss | Any |
| bedienung-tablett | Bedienung-Tablett | Passive | Familiar throws a Maß at intervals that shorten every floor | She has not spilled one yet. She has also not slowed down once. | 2 | Shop, Boss | Any |
| bergrettung | Bergrettung | Active (charge 600, consumable) | Active: call in a soul heart, one use | They ask for your location. You do not actually know where you are. | 2 | Shop, Secret | Any |
| betrunkenentaumel | Betrunkenentaumel | Passive | Dusel +4, Wurfkraft -15% | Can't hit the broad side of a Bierzelt. Occasionally that turns out to help. | 1 | Shop, Secret | Rausch |
| bierbank | Bierbank | Passive | Dusel +1, Reichweite +5% | Reserved. Nobody has ever admitted to reserving it. | 0 | Treasure, Shop | Any |
| bierbauch | Bierbauch | Passive | Trinkfest +1 while held. Gschwindigkeit -8% | Not fat. Storage. | 2 | Treasure, Shop, Boss | Any |
| bierdeckel | Bierdeckel | Passive | Shots return to you, damaging on the way back | Also doubles as a coaster, if you can bear to put it down. | 1 | Treasure, Shop | Any |
| bierkrug | Bierkrug | Passive | Damage +1 per stack | One in each hand is not a stack. It is a lifestyle. | 0 | Treasure, Shop | Any |
| blaskapelle | Blaskapelle | Passive | A sound ring damages everything around you every few seconds | The tuba player has never once needed to breathe. | 2 | Treasure, Shop, Boss | Any |
| blutwurz | Blutwurz | Passive | A death does not end the run — if you can walk back for the corpse | Blut. Geist. Same word, in two languages that never talk to each other. | 3 | Treasure, Shop, Boss | Any |
| boellerschmeisser | Böllerschmeißer | Active (charge 420) | Active: drop a lit Böller — it goes off where you stand, one second later | The landing spot is marked. Nobody ever moves in time regardless. | 2 | Shop, Boss, Secret | Any |
| braumeister-hammer | Braumeister-Hammer | Passive | A kill sends a shockwave through whatever else is nearby | The casks that don't tap the easy way meet this instead. | 2 | Boss, Secret | Any |
| braumeister-schuerze | Braumeister-Schürze | Passive | Stammwürze +0.2 | He aims the way he pours. It never spills. | 1 | Treasure, Shop | Any |
| braumeister-visier | Braumeister-Visier | Passive | Every 5th shot fires an extra, piercing volley | He has fired the same shot ten thousand times. It has never once missed. | 2 | Shop, Boss | Any |
| brezn | Brezn | Passive | An orbiting pretzel that damages enemies on contact | Lightly salted. Heavily weaponised. | 1 | Treasure, Shop | Any |
| brotzeitbrett | Brotzeitbrett | Passive | Clearing a room heals 1 and grants a Biermarken | Radishes, cheese, a pretzel. Nobody has ever once finished one alone. | 0 | Treasure, Shop | Any |
| colaweizen | Colaweizen | Passive | Shots stick and slow enemies. Damage -20% | Somewhere, a Reinheitsgebot enforcer is quietly weeping. | 1 | Treasure, Shop | Any |
| der-ordner | Der Ordner | Passive | Familiar that shoves enemies away from you | Arms crossed. Opinions closed. | 1 | Treasure, Shop, Boss | Any |
| der-rosinenklauber | Der Rosinenklauber | Passive | Rosinen items lose their drawback. Locks out both purity pacts | He is not defending the raisins. He is just eating them. | 3 | Devil, Secret | Any |
| drudmaske | Drudmaske | Passive | Stammwürze +50% while low on health | It only shows up when you're already having a bad night. | 2 | Boss, Secret, Curse | Any |
| enzian | Enzian | Active (charge 900) | Active: ten seconds of huge fire rate, then Promille +1.0 | Distilled from a flower most people are legally not allowed to pick. | 2 | Shop, Boss, Secret | Any |
| fassanstich | Fassanstich | Passive | The first hit landed in every room deals extra splash damage | O'zapft is. Everything after the first tap is just details. | 1 | Treasure, Shop, Boss | Any |
| fassldauben | Fassldauben | Passive | Bierfassl blasts throw out four flying staves | The keg goes quiet. The staves do not. | 1 | Treasure, Shop, Secret | Any |
| feierabendbier | Feierabendbier | Passive | Heals a little at the start of every floor. Costs a little Promille | Earned the second the shift ends. Not one second before. | 1 | Treasure, Shop | Any |
| feiertagsruhe | Feiertagsruhe | Passive | Sober. Grants 2 seconds of invulnerability at the start of every floor | Everything is closed today. For one floor, so is harm. | 1 | Treasure, Shop, Secret | Sober |
| feuerschlucker | Feuerschlucker | Active (charge 540) | Active: shots burn on hit for a few seconds | Swallows fire for the crowd. Exhales it into you, mechanically speaking. | 2 | Shop, Boss, Secret | Rausch |
| feuerwasser | Feuerwasser | Active (charge 3, consumable) | Active: full heal, one use | Distilled by someone who was not asked to distill it. | 2 | Shop, Secret | Rausch |
| feuerwehrhelm | Feuerwehrhelm | Passive | Gschwindigkeit +10%, Wurfkraft +10% | Rated to withstand heat, impact, and at least one Böllerschmeißer. | 1 | Treasure, Shop | Any |
| fingerhakeln | Fingerhakeln | Passive | Contact damage, and drags nearby enemies toward you | The loser buys the next round. There is always a next round. | 2 | Shop, Boss, Secret | Rausch |
| foehn | Föhn | Passive | A slowly rotating wind pushes every projectile in the room | Half the valley blames the wind for their headache. The other half is lying. | 2 | Shop, Boss, Secret, Curse | Any |
| gamsbart | Gamsbart | Passive | Dusel +2 per stack | Grown, not bought. Allegedly. | 0 | Treasure, Shop | Any |
| gamsohr | Gamsohr | Passive | Reichweite +15%, Dusel +3. Gschwindigkeit -10% | One ear. The other one is a story nobody tells the same way twice. | 1 | Treasure, Shop | Any |
| gartenzwerg-hut | Gartenzwerg-Hut | Passive | Dusel rises the longer you go without taking a hit; one hit resets it | Face down in the flower bed. Somehow this is still the lucky pose. | 1 | Treasure, Shop | Any |
| gluecksklee | Glücksklee | Passive | Dusel +3 | Found by accident. Kept on purpose. | 1 | Treasure, Shop, Angel | Any |
| gluehbirn | Glühbirn | Passive | Reichweite +12% | Everything past its reach does not, officially, exist. | 0 | Treasure, Shop | Any |
| gockelkamm | Gockelkamm | Passive | Schluckfrequenz +25%, Reichweite -15% | Crows the instant the sun even considers rising. | 1 | Treasure, Shop | Any |
| haferlschuh | Haferlschuh | Passive | Move speed +15%, immune to slick puddles | Every nail hand-driven by someone who takes this far too seriously. | 0 | Treasure, Shop | Any |
| halbe-portion | Halbe Portion | Passive | Trinkfest -1 while held. Schluckfrequenz +10% | Two Radler in and already asking where the toilet is. | 1 | Treasure, Shop | Any |
| heldensaal-fackel | Heldensaal-Fackel | Passive | Wurfkraft +20% | The bust does not move. The plinth it stands on is a different story after dark. | 2 | Boss, Secret | Any |
| hendlgeruch | Hendlgeruch | Passive | Constantly pulls distant enemies toward you | Carries for a kilometre. Everyone within a kilometre now has plans. | 1 | Treasure, Shop, Secret | Any |
| hirschgeweih | Hirschgeweih | Passive | Shots arc, curving gently as they travel | Antlers this size, aerodynamics were never part of the plan. | 1 | Treasure, Shop | Any |
| jagdhorn | Jagdhorn | Active (charge 300) | Active: pulls every nearby enemy toward you | Every hunter in the valley owns one. Every hunter in the valley denies this. | 2 | Shop, Boss, Secret | Any |
| kartoffelsalat | Kartoffelsalat | Passive | Reichweite and Gschwindigkeit up. Wurfkraft down | Every family recipe is the only correct one and they cannot all be right. | 0 | Treasure, Shop | Any |
| karussell | Karussell | Passive | Moving pushes nearby enemies along with you | The operator has not once checked a safety harness. The line never gets shorter. | 1 | Treasure, Shop | Any |
| kastenschieber | Kastenschieber | Passive | Getting hit shoves every nearby enemy back | The crate is empty. The crate has always been empty. Nobody asks why he carries it. | 1 | Treasure, Shop | Any |
| kegelbahn | Kegelbahn | Passive | Shots bounce off walls | Every frame a spare. Never once, in living memory, a strike. | 1 | Treasure, Shop | Any |
| kerzenwachs | Kerzenwachs | Passive | Every 4th hit sets its target alight | The candelabra has not been re-lit by staff in three centuries. It manages anyway. | 1 | Treasure, Shop, Boss | Any |
| kesseltreiben | Kesseltreiben | Passive | Stammwürze +25%. Continuously pulls every enemy in the room toward you | The old way to hunt: stand still and let the valley come to you. | 2 | Shop, Boss, Secret, Curse | Any |
| kirchturmuhr | Kirchturmuhr | Active (charge 480) | Active: freezes every nearby enemy for a few seconds | Rings on the hour. For three seconds, so does everything else. | 2 | Shop, Boss, Secret | Any |
| kirchweih-kranzl | Kirchweih-Kranzl | Passive | While sober: Gschwindigkeit +15%, Dusel +2 | Worn once a year. Photographed every year. | 1 | Treasure, Shop | Sober |
| kirchweih-krapfen | Kirchweih-Krapfen | Passive | Every hit deals a small burst of extra damage around it | Deep-fried. The blast radius is, functionally, the warning label. | 2 | Shop, Boss | Any |
| kirchweih-ratschn | Kirchweih-Ratsch'n | Passive | Every 4 kills, fires a ring of shots outward | Deafening at arm’s length. Somehow still not the loudest thing at the fair. | 2 | Shop, Boss, Secret | Any |
| kirtahutschn | Kirtahutschn | Passive | Every so often, a brief burst of speed and invulnerability | The operator has seen things. The operator will not discuss them. | 2 | Shop, Boss, Secret | Any |
| kletterseil | Kletterseil | Passive | Shots stick to whatever they hit | Rated for a person's weight. Regularly asked to hold much stranger things. | 1 | Treasure, Shop | Any |
| konterbier | Konterbier | Passive | Drinking while hungover instantly clears the Kater | Hair of the dog. The dog remembers you fondly. | 1 | Treasure, Shop | Any |
| kraftbier | Kraftbier | Passive | Damage +40%, move speed -20% | The label does not say 9% for decoration. | 1 | Treasure, Shop | Any |
| krautstampfer | Krautstampfer | Passive | Stammwürze +1 | Somebody has to stomp it. Today, mechanically, that's you. | 0 | Treasure, Shop | Any |
| kuhschelle | Kuhschelle | Passive | Rings every few seconds, slowing every enemy within earshot | One bell. Every animal within a kilometre now knows where you are. | 1 | Treasure, Shop, Secret | Any |
| kuhweide | Kuhweide | Passive | Grants a soul heart on pickup | Grazing rights, sublet. The cows were not consulted. | 1 | Treasure, Shop | Any |
| lawine | Lawine | Active (charge 600) | Active: a big blast of damage and knockback around you | The Bergwacht has a pamphlet about this. Nobody reads it until afterward. | 2 | Shop, Boss, Secret | Rausch |
| lebkuchenherz | Lebkuchenherz | Passive | A slogan overhead with a small stat effect that changes floor to floor | "Ein Prosit" was already taken by the mug next to it. | 1 | Treasure, Shop, Boss | Any |
| lederhosn | Lederhosn | Passive | Absorbs one hit per room | Stiff enough to stand up on its own. Some say it already does. | 2 | Treasure, Shop | Any |
| lichterkette | Lichterkette | Passive | Wurfkraft +15% | Strung ourselves, floor to floor. Somehow never once caught fire. | 0 | Treasure, Shop | Any |
| lodenmantel | Lodenmantel | Passive | Every hit refunds a small sliver of the damage taken | Repels rain, wind, and roughly a quarter of everything else. | 1 | Treasure, Shop | Any |
| loewenbrunn-doppelbock | Löwenbrunn Doppelbock | Passive | Damage +50%, fire rate -25%, shots pierce | Brewed twice. Regretted once, the next morning. | 1 | Treasure, Shop | Any |
| ludwigs-schwan | Ludwigs Schwan | Passive | Familiar fires a homing feather every couple of seconds. Costs Biermarken per floor | Paddles in perfect circles. Sends you the bill. | 1 | Treasure, Shop, Secret | Any |
| luftballon | Luftballon | Passive | Shots return to you after traveling their full range | Filled with helium. The shots do not need it, but morale does. | 1 | Treasure, Shop | Any |
| marktstand | Marktstand | Passive | Clearing a room grants 2 Biermarken | Business is good. Nobody has ever asked what she's actually selling. | 0 | Treasure, Shop | Any |
| marktweib | Marktweib | Passive | Every third room cleared grants a Kellerschlüssel | She has never once given anyone the wrong change. | 1 | Treasure, Shop, Secret | Any |
| mass | Maß | Passive | One huge, slow shot instead of a stream. Damage +200%, fire rate -66% | One litre. One decision. No refills mid-fight. | 2 | Shop, Boss | Any |
| masskrugstemmen | Maßkrugstemmen | Passive | Damage climbs the longer you keep firing. Fire rate falls with it | The record is nineteen minutes. The record holder cannot lift a pen anymore. | 2 | Shop, Boss, Secret | Rausch |
| murmeltierpfiff | Murmeltierpfiff | Passive | Refunds a quarter of every hit you take | By the time you hear it, it has already seen you three times. | 1 | Treasure, Shop | Any |
| nachschank | Nachschank | Active (charge 180) | Active: a quick top-up. Heals 1, costs a little Promille. Fast cooldown | The Bedienung doesn't even wait for you to ask anymore. | 1 | Treasure, Shop | Any |
| nachtwache | Nachtwache | Passive | Sober. Reichweite +20%, Dusel +2 | Somebody has to stay sharp. Tonight, apparently, that's you. | 1 | Shop, Secret | Sober |
| nebellaterne | Nebellaterne | Passive | Reichweite +8%, Dusel +1 | Burns steady. Everything past its reach is, for tonight, none of your business. | 0 | Treasure, Shop | Any |
| neuschwanstein-bauplan | Neuschwanstein-Bauplan | Passive | Large stat boost. Costs more Biermarken every floor | An unfinished wing, drawn in impressive detail. | 2 | Shop, Boss, Devil | Any |
| nikolausgabe | Nikolausgabe | Passive | Clearing a room alternates between Biermarken and a little Promille | He remembers everything. He has never once explained his methodology. | 1 | Treasure, Shop, Secret | Any |
| obazda | Obazda | Passive | Slows enemies near you | Technically a dip. Structurally closer to mortar. | 1 | Treasure, Shop | Any |
| opernarie | Opernarie | Active (charge 480) | Active: a held note builds, then shatters everything around you | Every chandelier in the room agrees this is a bad idea. | 2 | Shop, Boss, Secret | Any |
| peitschn | Peitschn | Passive | Shots gain bouncing. Wurfkraft +15% | The crack is the sound barrier losing an argument with a cow herder. | 1 | Treasure, Shop | Any |
| perchtenrute | Perchtenrute | Passive | Kills scatter nearby enemies. Stammwürze -10% | It does not want your blood. It wants you to leave. | 2 | Boss, Secret, Curse | Any |
| pilzsporen | Pilzsporen | Passive | Shots poison on hit | Technically it's a spore cloud. Best not to think about the technicality too hard. | 1 | Treasure, Shop | Any |
| platzangst | Platzangst | Passive | Stammwürze +50%, Reichweite -50% | Every festival tent, elbow to elbow. You made your peace with this a while ago. | 2 | Shop, Boss, Secret, Curse | Any |
| radi | Radi | Passive | Shots curve in a wide spiral. Range +30% | Cut thin enough to read a newspaper through. Nobody knows why that helps. | 1 | Treasure, Shop | Any |
| radler | Radler | Passive | Damage -50%, fire rate +100% | Half a beer. Twice the argument about whether it counts as one. | 0 | Treasure, Shop | Any |
| reinheitsgebot-1516 | Reinheitsgebot 1516 | Passive | Locks out every rosinen item. Stammwürze +50% | Water, barley, hops. Written before anyone thought to mention raisins. | 3 | Shop, Boss, Devil | Any |
| riesenrad | Riesenrad | Passive | A slow-orbiting gondola that damages and freezes on contact | Officially rated for six people. You are, at this point, the only one who fits. | 2 | Treasure, Shop, Boss | Any |
| ritterschild | Ritterschild | Passive | Standing still blocks all damage. Moving does not | The trick is not the shield. The trick is standing there while it works. | 2 | Treasure, Shop, Boss | Any |
| rollfass-reifen | Rollfass-Reifen | Passive | Every hit shoves its target back | Rolls downhill enthusiastically. Refuses, on principle, to roll back up. | 1 | Treasure, Shop | Any |
| ruhige-hand | Ruhige Hand | Passive | Damage +40% while under 0.5 Promille | The only item in the tent trying to talk you out of another round. | 2 | Shop, Boss, Secret | Sober |
| russn | Russ'n | Passive | Shots home in on the nearest target | The lemonade did not ask to be here. It is here anyway. | 2 | Treasure, Shop | Any |
| sankt-anzelm-klostersud | Sankt Anzelm Klostersud | Passive | Clear a room without taking damage for a soul heart | The monks will not say what is in it. The monks never do. | 2 | Shop, Boss | Any |
| sauwetter | Sauwetter | Passive | Shots carry a different status effect every shot: burning, freezing, poison | Four seasons in one afternoon. Occasionally in one minute. | 2 | Shop, Boss, Secret, Curse | Any |
| scherbenhaufen | Scherbenhaufen | Passive | Getting hit fires a ring of glass shards outward | Every piece catches the light differently. None of them catch it kindly. | 2 | Shop, Boss, Secret | Any |
| schiessbudenfigur | Schießbudenfigur | Passive | Wurfkraft +15%, Reichweite +10% | Knock it down and it pops right back up. Nobody has ever asked how. | 1 | Treasure, Shop | Any |
| schimmelsplitter | Schimmelsplitter | Passive | Kills release a small burst of damage where they died | It kept spreading after it died. That part was already true before you found this. | 1 | Treasure, Shop, Boss | Any |
| schluesselbund | Schlüsselbund | Passive | Clearing a room grants a key | Fits every lock in the Keller. Explaining why is above your pay grade. | 0 | Treasure, Shop | Any |
| schmalzler | Schmalzler | Passive | Schluckfrequenz -25%. Dusel -2 | One pinch and the whole Stammtisch knows exactly where you are sitting. | 1 | Shop, Secret | Sober |
| schnapsleiche | Schnapsleiche | Passive | Stammwürze +60%, Gschwindigkeit -40% | Isn't going anywhere in particular. Neither, now, are you. | 2 | Shop, Boss, Secret | Rausch |
| schuhplattler | Schuhplattler | Passive | Stand still for a moment to release a damaging shockwave | The physics of it are unclear. The enthusiasm is not. | 2 | Shop, Boss | Any |
| schutzengerl | Schutzengerl | Passive | Kills occasionally heal a small amount | Somebody has been keeping score. Nobody has ever seen who. | 2 | Shop, Boss, Secret, Angel | Any |
| seilbahn | Seilbahn | Passive | Reichweite grows with every floor you reach | The view from the top is worth it. The queue at the bottom is not. | 1 | Treasure, Shop, Boss | Any |
| sonnwendfeuer | Sonnwendfeuer | Active (charge 480) | Active: jump the solstice fire for a burst of damage around you | Jump it and your wish comes true. The wish is usually "please do not catch fire." | 2 | Shop, Boss, Secret | Rausch |
| spatenstich | Spatenstich | Passive | Shots gain piercing. Stammwürze +30%, Schluckfrequenz -20% | The mayor gets three tries. The crowd counts every one out loud. | 1 | Treasure, Shop | Any |
| spezi | Spezi | Passive | Fires a second, diverging shot | Nobody agrees on the ratio. Everybody has an opinion. | 1 | Treasure, Shop | Any |
| spiegelsaal | Spiegelsaal | Passive | Shots split on impact | Ludwig ordered a thousand candles for this room. Nobody has ever counted the reflections. | 1 | Treasure, Shop | Any |
| standlkasse | Standlkasse | Passive | Each floor, spend 3 Biermarken for permanent Stammwürze if you can afford it | Everything has a price today. Yesterday's price does not come back. | 2 | Shop, Devil, Secret | Any |
| steckerlfisch | Steckerlfisch | Passive | Shots burn on hit | Cooked over an open flame for an hour. The shots learned fast. | 1 | Treasure, Shop | Any |
| steinkrug | Steinkrug | Passive | Shots fly over obstacles and splash on impact | Not aerodynamic. Not meant to be. | 1 | Treasure, Shop | Any |
| sudordnung-1493 | Sudordnung 1493 | Passive | Locks out every rosinen and impure item. Stammwürze +65% | Twenty-three years earlier and stricter. Nobody remembers why it lost. | 3 | Shop, Boss, Devil | Any |
| teufelsbraten | Teufelsbraten | Passive | Stammwürze +50%. Every kill costs a Biermarken | The recipe was never written down. The price always is. | 3 | Shop, Devil, Secret | Any |
| teufelstritt-russ | Teufelstritt-Ruß | Passive | Stammwürze +15%. Promille +0.3 every floor | Wipes off your boot easily enough. Never once off anything else. | 2 | Shop, Devil, Secret | Any |
| teufelstrittstein | Teufelstrittstein | Passive | Stammwürze +30%. Promille can never drop below 1.0 | The stone is warm to the touch. It has been warm for six hundred years. | 3 | Shop, Devil, Secret | Any |
| traktor-auspuff | Traktor-Auspuff | Passive | Gschwindigkeit +25%, Dusel -3 | You can hear it two fields over. So can everything with a choice in the matter. | 1 | Shop, Boss, Secret, Curse | Any |
| wadlbeisser | Wadlbeißer | Passive | Familiar dog that bites nearby enemies every couple of seconds | Twelve centimetres of shoulder height. Zero centimetres of restraint. | 1 | Treasure, Shop | Any |
| waldnebel | Waldnebel | Passive | Shots pass through walls | You can still see the room. The room, this once, cannot see you. | 1 | Treasure, Shop | Any |
| waldschrat-knueppel | Waldschrat-Knüppel | Passive | Hits briefly freeze their target | He only ever throws the one log. He has never once needed a second. | 2 | Shop, Boss, Secret | Any |
| watschn | Watschn | Passive | Getting hit sends a damaging shockwave out from you | The Bavarian conflict-resolution method. Surprisingly effective. | 2 | Shop, Boss, Secret | Rausch |
| watzmannkraxn | Watzmannkraxn | Passive | Reichweite +20%, Wurfkraft +15% | The mountain has a body count and a fan club. Frequently the same people. | 1 | Treasure, Shop, Boss | Any |
| weidezaun | Weidezaun | Passive | Getting hit grants a moment of extra invulnerability | Cows respect a fence. Nothing else in Bavaria does. | 1 | Treasure, Shop | Any |
| weissblaue-rauten | Weiß-blaue Rauten | Passive | Every eighth shot fires four extra in a lozenge pattern | A folk motif, not a coat of arms — and every soul in the Wiesn knows the difference. | 2 | Treasure, Shop, Boss | Any |
| weisswurst | Weißwurst | Passive | Stammwürze +30% before floor 4. Nothing after | The tradition says before the noon bell. The run says before the Brauerei. | 1 | Treasure, Shop | Any |
| wilde-gjoad-horn | Wilde-Gjoad-Horn | Active (charge 540) | Active: shots home in on enemies for a few seconds | The Hunt never misses. Borrow that, briefly, at your own risk. | 2 | Shop, Boss, Secret | Rausch |
| wildschuetz | Wildschütz | Passive | Familiar fires an aimed shot in your direction of travel every few seconds | Every Revier has one. Nobody has ever caught him. | 2 | Shop, Boss | Any |
| wirtshausschlaeger | Wirtshausschläger | Passive | Kill: currency +1 | The house always wins. Tonight the house is you. | 1 | Treasure, Boss | Any |
| wolpertinger-im-rucksack | Wolpertinger im Rucksack | Passive | A different stat buff every room you clear | Nobody has ever agreed on how many legs it had. | 2 | Treasure, Shop, Secret | Any |
| zuckerrohrsirup | Zuckerrohrsirup | Passive | Shots stick. Every sticky hit heals a little | The tank was rated for beer. Nobody consulted the tank. | 2 | Shop, Secret | Any |
| zwoa-drei-gsuffa | Zwoa, drei, gsuffa | Passive | Kills grant a stacking damage buff that fades if they stop | By the third round nobody remembers what they were counting. | 2 | Shop, Boss, Secret | Rausch |

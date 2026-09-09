# Kellerbier Item Roster

Full list of all 62 items currently authored in `src/content/items/`. Generated from the
item definitions themselves (`src/sim/item/definition.ts`), so it reflects exactly what is
live in the game, not a design doc that can drift from the code.

Cut down hard from a 139-item roster to 51 by hand (2026-09) — see the item-list handoff for
this pass: keep only the items whose design earns its slot, drop the boring/offensive/
over-represented-Alpine ones, and bring items back in later if they turn out to be worth it.

Redesigned for fun and visibility (2026-09, second pass): every item now either changes how a
room is played or is a deliberately basic stat item, and every item shows itself on screen —
on the shot it changed (a tinted shot, a bigger one, a fan of them), in the room (a drawn
shockwave, an exhaust trail, enemies shoved), or on a HUD row (`ItemDefinition.status`). See
`docs/DECISIONS.md`'s "every item is visible" entry for the rules this pass introduced.

Back to 61 with #237's ten `rosinen` items (2026-09, third pass). The run is *about* raisins and
the pool contained exactly one of them, which left three quality-3 items whose entire cost was a
restriction on a set of size one — so the two purity pacts were free damage and Der Rosinenklauber
was strictly the worst of the three. Every addition carries the tag, follows §8's "a clean item
plus an upgrade plus one legible cost" shape, and is held to the same bar the 139 → 51 cut was
made against. The pacts' own numbers were re-tuned against the real pool at the same time.

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
- **Flavour Text** — in-character flavour line, shown on the pickup toast.
- **Quality** — rarity/power tier, 0 (weakest) to 3 (strongest).
- **Pools** — which pools the item can be offered from (Treasure, Shop, Boss, Devil, Angel, Secret, Curse).
- **Promille Req.** — `Any`, `Sober` (never appears once Promille is unlocked), or `Rausch` (requires a Promille tier).

| ID | Name | Type | Effect | Flavour Text | Quality | Pools | Promille Req. |
|---|---|---|---|---|---|---|---|
| almabtrieb | Almabtrieb | Passive | Shooting while moving has 2x damage. The "moving shots" have different color. | Run and Gun | 2 | Treasure, Shop, Boss | Any |
| apfelkuchen | Apfelkuchen | Passive | Heals 4. Damage +5% | Best Kuchen there is. | 0 | Treasure, Shop | Any |
| apfelkuchen-mit-rosinen | Apfelkuchen (mit Rosinen) | Passive | Heals 4. Damage +5%. Permanently Range -15% | Worst Kuchen there is. | 1 | Treasure, Shop | Any |
| apfelstrudel | Apfelstrudel | Passive | Shots split apart on impact. Damage -25% | Pulled thin enough to read a newspaper through. Nobody has tried. | 2 | Treasure, Shop, Boss | Any |
| bauern-mistgabel | Bauern-Mistgabel | Passive | Shots become a short pitchfork jab: three piercing prongs, 2x damage, no range | Telegraphs the whole thing from a mile off. Still works every single time. | 2 | Shop, Boss, Secret | Any |
| bierbank | Bierbank | Passive | Fires two shots side by side. Damage -20% | Reserved. Nobody has ever admitted to reserving it. | 1 | Treasure, Shop | Any |
| bierbauch | Bierbauch | Passive | Trinkfest +1 while held. Move Speed -8% | Not fat. Storage. | 2 | Treasure, Shop, Boss | Any |
| bierdeckel | Bierdeckel | Passive | Shots ricochet off walls | Also doubles as a coaster, if you can bear to put it down. | 1 | Treasure, Shop | Any |
| bierkrug | Bierkrug | Passive | Damage +1 per stack | One in each hand is not a stack. It is a lifestyle. | 0 | Treasure, Shop | Any |
| blaskapelle | Blaskapelle | Passive | A sound ring damages everything around you every few seconds | The tuba player has never once needed to breathe. | 2 | Treasure, Shop, Boss | Any |
| blutwurz | Blutwurz | Passive | A death does not end the run — if you can walk back for the corpse | Blut. Geist. Same word, in two languages that never talk to each other. | 3 | Treasure, Shop, Boss | Any |
| boellerschmeisser | Böllerschmeißer | Active (charge 420) | Active: drop a lit Böller — it goes off where you stand, one second later | The landing spot is marked. Nobody ever moves in time regardless. | 2 | Shop, Boss, Secret | Any |
| braumeister-hammer | Braumeister-Hammer | Passive | A kill sends a shockwave through whatever else is nearby | The casks that don't tap the easy way meet this instead. | 2 | Boss, Secret | Any |
| braumeister-schuerze | Braumeister-Schürze | Passive | Fires a fan of three shots. Damage -30% | He aims the way he pours. It never spills. | 2 | Treasure, Shop, Boss | Any |
| braumeister-visier | Braumeister-Visier | Passive | Every 5th shot fires an extra, piercing volley | He has fired the same shot ten thousand times. It has never once missed. | 2 | Shop, Boss | Any |
| brezn | Brezn | Passive | An orbiting pretzel that damages enemies on contact | Lightly salted. Heavily weaponised. | 1 | Treasure, Shop | Any |
| brotzeitbrett | Brotzeitbrett | Passive | Clearing a room heals 1 and grants a Biermarken | Radishes, cheese, a pretzel. Nobody has ever once finished one alone. | 0 | Treasure, Shop | Any |
| colaweizen | Colaweizen | Passive | Shots stick and slow enemies. Damage -20% | Somewhere, a Reinheitsgebot enforcer is quietly weeping. | 1 | Treasure, Shop | Any |
| der-ordner | Der Ordner | Passive | Familiar that shoves enemies away from you | Arms crossed. Opinions closed. | 1 | Treasure, Shop, Boss | Any |
| der-rosinenklauber | Der Rosinenklauber | Passive | Rosinen items lose their drawback. Locks out both purity pacts | He is not defending the raisins. He is just eating them. | 3 | Devil, Secret | Any |
| feierabendbier | Feierabendbier | Passive | Heals a little at the start of every floor. Costs a little Promille | Earned the second the shift ends. Not one second before. | 1 | Treasure, Shop | Any |
| feuerwehrhelm | Feuerwehrhelm | Passive | Shots are hose water: every hit shoves its target back. Shot Speed +25% | Rated to withstand heat, impact, and at least one Böllerschmeißer. | 1 | Treasure, Shop | Any |
| fingerhakeln | Fingerhakeln | Passive | Contact damage, and drags nearby enemies toward you | The loser buys the next round. There is always a next round. | 2 | Shop, Boss, Secret | Rausch |
| gartenzwerg-hut | Gartenzwerg-Hut | Passive | Every 5s without a hit adds an extra shot (up to 3). One hit resets it | Face down in the flower bed. Somehow this is still the lucky pose. | 2 | Treasure, Shop, Boss | Any |
| gugelhupf | Gugelhupf | Passive | Shots ring back to you, hitting again on the way. Shot Speed -25% | A cake with a hole in it, so it cooks through. That is the whole trick. | 2 | Treasure, Shop, Boss | Any |
| haferlschuh | Haferlschuh | Passive | Move Speed +15%, immune to slick puddles | Every nail hand-driven by someone who takes this far too seriously. | 0 | Treasure, Shop | Any |
| hendlgeruch | Hendlgeruch | Passive | Constantly pulls distant enemies toward you | Carries for a kilometre. Everyone within a kilometre now has plans. | 1 | Treasure, Shop, Secret | Any |
| kartoffelsalat | Kartoffelsalat | Passive | Shots split into two chunks on impact. Range +15% | Every family recipe is the only correct one and they cannot all be right. | 1 | Treasure, Shop | Any |
| karussell | Karussell | Passive | Moving pushes nearby enemies along with you | The operator has not once checked a safety harness. The line never gets shorter. | 1 | Treasure, Shop | Any |
| kletzenbrot | Kletzenbrot | Passive | Shots poison what they hit. Damage -15% | Keeps for a month. Tastes like it has. | 2 | Shop, Boss, Secret | Any |
| konterbier | Konterbier | Passive | Drinking while hungover instantly clears the Kater | Hair of the dog. The dog remembers you fondly. | 1 | Treasure, Shop | Any |
| kraftbier | Kraftbier | Passive | Damage +40%, Move Speed -20% | The label does not say 9% for decoration. | 1 | Treasure, Shop | Any |
| lebkuchenherz | Lebkuchenherz | Passive | A slogan overhead with a small stat effect that changes floor to floor | "Ein Prosit" was already taken by the mug next to it. | 1 | Treasure, Shop, Boss | Any |
| lederhosn | Lederhosn | Passive | Absorbs one hit per room | Stiff enough to stand up on its own. Some say it already does. | 2 | Treasure, Shop | Any |
| ludwigs-schwan | Ludwigs Schwan | Passive | Familiar fires a homing feather every couple of seconds. Costs Biermarken per floor | Paddles in perfect circles. Sends you the bill. | 1 | Treasure, Shop, Secret | Any |
| luftballon | Luftballon | Passive | Shots return to you after traveling their full range | Filled with helium. The shots do not need it, but morale does. | 1 | Treasure, Shop | Any |
| mass | Maß | Passive | One huge, slow shot instead of a stream. Damage +200%, Fire Rate -66% | One litre. One decision. No refills mid-fight. | 2 | Shop, Boss | Any |
| neuschwanstein-bauplan | Neuschwanstein-Bauplan | Passive | Large stat boost. Costs more Biermarken every floor | An unfinished wing, drawn in impressive detail. | 2 | Shop, Boss, Devil | Any |
| obazda | Obazda | Passive | Slows enemies near you | Technically a dip. Structurally closer to mortar. | 1 | Treasure, Shop | Any |
| platzangst | Platzangst | Passive | Damage +50%, Range -50% | Every festival tent, elbow to elbow. You made your peace with this a while ago. | 2 | Shop, Boss, Secret, Curse | Any |
| radler | Radler | Passive | Damage -50%, Fire Rate +100% | Half a beer. Twice the argument about whether it counts as one. | 0 | Treasure, Shop | Any |
| reinheitsgebot-1516 | Reinheitsgebot 1516 | Passive | Locks out every rosinen item. Damage +35% | Water, barley, hops. Written before anyone thought to mention raisins. | 3 | Shop, Boss, Devil | Any |
| riesenrad | Riesenrad | Passive | A slow-orbiting gondola that damages and freezes on contact | Officially rated for six people. You are, at this point, the only one who fits. | 2 | Treasure, Shop, Boss | Any |
| rosinenbrot | Rosinenbrot | Passive | Shots pierce one extra enemy. Range -20% | Somebody picks them out. Somebody always picks them out. | 1 | Treasure, Shop | Any |
| rosinenschnaps | Rosinenschnaps | Passive | Damage +45%. Every kill adds 0.1 Promille | Grandmother made it. Grandmother is not sorry. | 3 | Shop, Boss, Devil | Any |
| rosinenschnecke | Rosinenschnecke | Passive | Shots curl toward whatever is nearest. Damage -20% | Wound tight enough that nobody can find the end of it. | 2 | Treasure, Shop, Boss | Any |
| ruhige-hand | Ruhige Hand | Passive | Damage +40% while under 0.5 Promille | The only item in the tent trying to talk you out of another round. | 2 | Shop, Boss, Secret | Sober |
| rumtopf | Rumtopf | Passive | Damage +80% — but only in Vollrausch or deeper | Lid on since June. Nobody has looked. | 3 | Devil, Secret | Rausch |
| sauwetter | Sauwetter | Passive | Shots carry a different status effect every shot: burning, freezing, poison | Four seasons in one afternoon. Occasionally in one minute. | 2 | Shop, Boss, Secret, Curse | Any |
| schluesselbund | Schlüsselbund | Passive | Shows the floor's secret rooms on the map. Clearing a room grants a key | Fits every lock in the Keller. Explaining why is above your pay grade. | 1 | Treasure, Shop, Secret | Any |
| schuhplattler | Schuhplattler | Passive | Stand still for a moment to release a damaging shockwave | The physics of it are unclear. The enthusiasm is not. | 2 | Shop, Boss | Any |
| semmelknoedel | Semmelknödel | Passive | Shots hit for 2x and travel heavily. Shot Speed -40% | Heavy enough to be an argument. | 2 | Treasure, Shop, Boss | Any |
| sixpack | Sixpack | Active (charge 1) | Active: Maß you pick up go in the carrier — press to drink one | Six bottles is not hoarding. Six bottles is planning. | 2 | Treasure, Shop, Boss, Secret | Any |
| spezi | Spezi | Passive | Fires a second, diverging shot | Nobody agrees on the ratio. Everybody has an opinion. | 1 | Treasure, Shop | Any |
| steckerlfisch | Steckerlfisch | Passive | Shots burn on hit | Cooked over an open flame for an hour. The shots learned fast. | 1 | Treasure, Shop | Any |
| steinkrug | Steinkrug | Passive | Shots fly over obstacles and splash on impact | Not aerodynamic. Not meant to be. | 1 | Treasure, Shop | Any |
| studentenfutter | Studentenfutter | Passive | Damage +8% per kill in a room, up to +48%. Resets on clear. Move Speed -10% | One handful. Every time. One handful. | 2 | Treasure, Shop, Boss | Any |
| sudordnung-1493 | Sudordnung 1493 | Passive | Locks out every rosinen and impure item. Damage +50% | Twenty-three years earlier and stricter. Nobody remembers why it lost. | 3 | Shop, Boss, Devil | Any |
| traktor-auspuff | Traktor-Auspuff | Passive | Moving leaves a trail of poison exhaust clouds behind you. Move Speed +15% | You can hear it two fields over. So can everything with a choice in the matter. | 1 | Shop, Boss, Secret, Curse | Any |
| watschn | Watschn | Passive | Getting hit sends a damaging shockwave out from you | The Bavarian conflict-resolution method. Surprisingly effective. | 2 | Shop, Boss, Secret | Rausch |
| weisswurst | Weißwurst | Passive | Damage +30% before floor 4. Nothing after | The tradition says before the noon bell. The run says before the Brauerei. | 1 | Treasure, Shop | Any |
| zwetschgendatschi | Zwetschgendatschi | Passive | Clearing a room without being hit heals 1. Range -15% | The plums are the point. The raisins are an opinion. | 1 | Treasure, Shop | Any |

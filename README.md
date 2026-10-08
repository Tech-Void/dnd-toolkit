# DnD Toolkit

A personal GM toolkit for D&D 5e: encounters, dungeon maps, room keys, treasure and plot hooks, generated **directly into Foundry VTT** as native scenes, tokens, walls, doors, journals, items and currency.

## Layout

```
packages/
  core/      Pure TypeScript generators. No Foundry dependency, so it is testable and reusable
             (future web app, CLI, Discord bot...). Every generator is seeded and deterministic.
  foundry/   Foundry VTT module. Bundles core and converts its JSON output into Foundry documents.
    static/  module.json + CSS, copied as-is into dist/
    dist/    Build output = the installable module folder
```

**Design rule:** generators return plain JSON (`DungeonMap`, `LootResult`, `PlotHook`). Only `packages/foundry/src/importers/` knows about Foundry. Every new feature is a core generator plus an importer.

## Map art (Forgotten Adventures)

Generated battlemaps, towns, dungeons and caves are painted with Forgotten Adventures art when it's installed. Without it they keep the built-in painted look.

**What the art covers:**
- **Ground:** real textures for grass, forest floor, dirt, cobbled streets, flagstones, plank floors, cave floor, rock and water.
- **Props:** FA art for trees, bushes, boulders, logs, tents, campfires, carts, wells, tables, chairs, bars, shelves, beds, barrels, crates, chests, rugs, altars, pillars and rubble.
- **Buildings:** timber or stone walls, and textured roofs on town buildings.
- **Small scenery:** flowers, stones and puddles scattered on open ground.
- **Dungeons:** clutter along the walls (crates, sacks, rubble, bones in the lair). It never covers doorways, trap triggers or loot piles.

Each map picks one look per kind of thing from its seed (one tree species, one wood tone, one roof style), so it hangs together. The same seed always paints the same way.

**Animated scenery** (module setting, on by default) adds FA's looping animations as video tiles:
- **Fire:** flames in campfires, hearths, braziers and on dungeon torches.
- **Outdoors:** fireflies over night meadows, swamps and farms.
- **Rooms:** flies over ossuaries, larders and dens; drifting dust in libraries, storerooms and ruins; sparkles in summoning circles and on crystals.
- **Caves:** spores in fungus groves and water dripping in caves and mines.

**Tree canopies** go on their own overhead tile that fades when a token walks beneath, with matching shadows on the ground.

**Setup:**
1. Foundry serves the art from `fa-assets` inside its Data folder (`%LOCALAPPDATA%\FoundryVTT\Data\fa-assets`). Only the files the painters use (about 12,600, 0.4 GB) live there, copied from the full FA library. The folder name is the module setting *Forgotten Adventures art folder*. Clear the setting to switch the art off.
2. `packages/foundry/static/fa-manifest.json` lists which files the painters use. It holds paths and grid sizes only, no art. After adding FA packs, rebuild it:

   `python packages/foundry/scripts/build-fa-manifest.py "B:/assets for dnd/FA_Assets_Webp" "%LOCALAPPDATA%/FoundryVTT/Data/fa-assets"`

   The second path is optional: with it, any newly used files are copied into the Foundry folder too.

## Dev workflow

```sh
npm install
npm test            # vitest, core generators
npm run demo [seed] # ASCII dungeon + loot + hook in the terminal
npm run typecheck
npm run build       # builds packages/foundry/dist
npm run dev -w @dnd-toolkit/foundry   # rebuild on save
```

`%LOCALAPPDATA%\FoundryVTT\Data\modules\dnd-toolkit` is a junction to `packages/foundry/dist`, so a rebuild followed by an F5 in Foundry picks up changes.

## Using it in Foundry

Enable **DnD Toolkit** in your world, then click the d20 button in the Token controls (GM only). Tools are grouped in a ribbon sidebar: **Encounters** (Encounter, NPC), **Maps** (Dungeon, Battlemap), **World** (Settlement, Travel), **Treasure** (Loot, Forge, Shop), **Story** (Plot Hook, Side Quest), **At the table** (Roll Requests, Traps & Puzzles, Handouts) and **Tools** (Import).

- **Encounter**: party level and size (or auto-detect from player characters), difficulty, shape, and **monster tags**. Click a monster's name for its statblock. *Place hidden* drops non-overlapping tokens around your view. *Place & fight* adds them to combat and rolls initiative. Click the lock next to a group to keep it, then *Generate* again to rebuild everything else around it (same seed, same result; the dice button rerolls). *Add a wave* stacks on reinforcements worth about half the budget, each arriving on a later round with *Bring in* to drop them into the running combat.
- **Dungeon**: choose *Rooms & corridors* or *Cave*. Caves come out *mixed* (open caverns in one part, tight tunnels in another), *open* or *tight*, split into chambers of very different sizes and numbered in exploration order from the entrance. Set a **monster theme** (e.g. `goblinoid`) and how many rooms hold **monsters** (few / some / many). Encounters are spread across the map rather than bunched in neighboring rooms, and the lair gets a high-difficulty fight and a hoard. Under *Lighting & extras*: **hidden rooms** (a dead end, or a carved closet, sealed behind a Foundry secret door with treasure inside), **loot piles** (treasure stashed in a corner with a find DC, pinned as GM-only notes, and placed on the map as hidden chests and sacks the players can find and loot; see *Loot on the map* below), **light sources** (none / sparse / well lit: wall torches, lair braziers and candles in dungeons; daylight at the entrance, glowing fungi, crystals and lava seams in caves), **darkness**, **global light** and **torch-bearers** (one creature in each humanoid group carries a lit torch). The preview shows a red dot where each monster will stand, gold squares for loot and purple outlines for hidden rooms and secret doors, with a room-by-room list below. *Create Scene* paints textured stone walls, makes walls, doors, secret doors, lights and darkness, and pins a room-key journal as map notes. Monsters are placed as hidden tokens away from the walls. **Locked doors** (none / a few / some / many) makes doors locked, stuck, barred or (from level 5) sealed by an arcane lock, favoring the lair and treasure rooms. Most locked doors have a key somewhere the party can reach without going through that door: carried by a room's monster (it drops with their treasure), in a loot pile, or stashed in a quiet room. Arcane locks have a password written somewhere. Keys can chain, but the dungeon can always be solved without picking or forcing anything. Each room trap gets **trigger squares** one step inside a doorway. The room key says which door is which, what opens it and where the key is. The preview shows gold dots for locked doors and red crossed squares for traps.
  - **Rooms with a purpose.** *Rooms* picks a theme (*Furnished: fit the monsters* by default), or *Bare rooms* to skip it. The themes:
    - **Bandit hideout:** barracks, mess hall, storeroom, armory, guard post, holding cells, the leader's quarters.
    - **Fortress:** bunks, war room, kitchen and a great hall with a throne.
    - **Crypt:** burial vaults, ossuary, chapel, embalming room, catacombs, the founder's tomb.
    - **Mine:** galleries propped with timber, a cart depot, smelting room, tool store, collapsed tunnels, the deep vein.
    - **Temple:** nave with pews, vestry, library, monks' cells, reliquary, ritual chamber.
    - **Wizard's tower:** laboratory, library, study, menagerie, summoning circle, sanctum.
    - **Natural caverns:** den, nest, larder, fungus grove, cave camp, the beast's hoard.

    Each room is furnished to match, with FA art: bedrolls in the barracks, coffins in the catacombs, forges and anvils in the smelting room, bookcases in the library, cages in the cells. Doorways, trap triggers and loot stay clear. The room key's title, description and finds follow the purpose: the armory has weapons, the library a book, the laboratory potions. The room's monsters are caught doing what the room is for: asleep in the barracks, eating in the mess hall, at prayer in the nave, mid-ritual in the ritual chamber.
  - **Puzzle** (on by default) guards the hidden room or a treasure room with a sealed door. The puzzle is in the room beside the door, and its clue is carved somewhere else in the dungeon (the room key says where, and gives the answer).
    - **The kinds:** levers to set ("Raise the Sun and the Crown; let the Moon sleep"), pressure plates to step on in order, statues to turn until they all face the door, or runes to touch in sequence.
    - **Playing it:** each piece is a tile on the map. A player stepping onto one is asked what they do: pull, turn left or right, touch. Plates press as soon as you step on them. Statues visibly turn and levers flip, and everyone sees what happened in chat.
    - **Getting it wrong:** a wrong order resets everything and costs something, a dart volley or a discharge, with save and damage buttons for you.
    - **Solving it:** the sealed door (or the secret door) opens.
- **Battlemap**: a quick one-fight map. Pick forest clearing, road ambush, cave grotto, shop, tavern, ruins or bandit camp (or random), a size, and day or night. *Create Scene* builds a painted scene with walls, doors and windows. Trees, boulders, pillars, shelves and tents block movement and sight. It also gets fire, lamp and glowing-mushroom lights, darkness for caves and night, and a battlefield-notes journal covering cover, difficult terrain and hazards. The preview marks where the party arrives (blue) and where enemies start (red). Tick the box to drop the current encounter there as hidden tokens. The Shop tab's *Battlemap* button builds that shop's floor.
  - **More settings:**
    - **Graveyard:** rows of headstones, open graves, statues, a mausoleum.
    - **Temple:** pews, an altar and pillars.
    - **Docks:** piers, rowboats, a warehouse and deep water.
    - **River bridge:** a fast river, reeds and the bridge as a choke point.
    - **Mine:** timber props, carts and lanterns.
    - **Farmstead:** a farmhouse, a barn with hay, and a fenced field of crops.
    - **Swamp:** mud, pools, dead trees, reeds, sometimes a stilt hut.

    Travel days in swamps now fight in a swamp.
  - **Elevation** raises a ledge, outcrop or dais (5 to 15 ft) on many maps. Its cliff edges block movement but not sight: climbing is an Athletics check, and a slope leads up. "+10 ft" floats up when a token reaches the top. Enemies like to hold the high ground.
  - **Fight** sets up the layout:
    - **Standoff:** the party on one side, the enemy on the other.
    - **Ambush:** the enemy is hidden behind cover close in on both flanks.
    - **Hold the line:** the party defends the middle behind makeshift barricades while attackers come from the edges.
    - **Random:** any of the three.
  - **Locked doors** locks shop storerooms (the shopkeeper has the key), bars back doors from inside, now and then jams a kitchen door, and locks about half the houses in a town. **Traps** hides snares, bear traps, deadfalls, caltrops and wasp nests around camps, roads and clearings, and pits, glyphs and runes in ruins and caves. They go on the ground between the party and the enemy, never on the props.
- **Forge**: one-of-a-kind magic items in seconds. Pick a kind (weapon, armor or shield, wondrous item, wand/staff/rod, or a relic with history and a drawback), a rarity (or let the party level decide), a damage theme (fire, cold, necrotic, radiant...) and optionally a base ("Greataxe", "ring", "staff"). Forge up to 10 at once, with curses never, sometimes or always. Each card has a **Curse / Lift curse** toggle, and the Loot tab and the dungeon extras have their own curse setting for unique hoard items. A curse is a nasty property and sometimes a penalty effect (a vulnerability, or -1 to saves or AC). Cursed items are created **unidentified**: players see a plain "Fine Longsword" with only its good properties until you identify it on the sheet. Weapons can roll keen (19-20 crits), vicious (extra crit dice), bane (bonus damage against a creature type, on the item's other-formula button) and combat riders. Worn items draw from about 35 effects: AC, saves, checks, initiative, resistances and immunities, darkvision, blindsight and tremorsense, flying, swimming and climbing speeds, attack and damage bonuses, spell DC, hit points, and ability scores. Powers are blasts, spell-attack bolts, healing or utilities like Blink Step and Haste. Relics may be sentient. **Edit** any item, or start from **New blank item**, and change every field: name, kind, base, rarity, value, bonus, attunement, curse, extra damage, crit range and dice, bane, effect rows (pick from the catalog or type any custom key), the power (kind, charges, recharge, save and DC, damage, area, range), appearance, notes and lore. The description is rebuilt from the numbers, so it never goes stale. Each comes with a name, appearance, properties scaled to its rarity, and a price. *Create item* or *Give to selected* builds a working dnd5e item with no formula editing: the magic bonus, extra damage on hit, charges that recover at dawn, a save DC and damage for its power (one click to roll it), and Active Effects (AC, saves, resistance, speed, darkvision, ability scores...) that switch on when attuned. Weapons and armor are copies of the real compendium item. Tick *Unique items* on the Loot tab, or in the dungeon's extras, and hoard magic items are forged too; giving loot or looting a pile builds them the same way. The Forge also makes **potions, elixirs, oils and philters**: healing, temporary effects (applied to the drinker from the chat card, with a duration), breath weapons, or utility effects such as walking on water, mist form or second sight. It makes **scrolls**, which hold one use of a blast, bolt, heal or utility power, need no spellcasting and crumble afterward. It makes **ammunition**: stacks of arrows, bolts, bullets or needles with a bonus, extra damage, riders such as bursting, seeking or knockdown, and slaying shots at high rarity. These come out as single-use dnd5e consumables. Curses work on them too: tainted potions, scrolls that bite back, ammunition that veers toward allies.
- **Doors and traps on the map** (automatic on generated scenes):
  - **Doors.** A locked, stuck or barred door starts *locked* in Foundry. When a player clicks it, they get a prompt for their selected character: *use the key* (if they carry it), *speak the password*, *pick the lock* (rolls their thieves' tools), or *force it* / *break it down* (rolls Athletics). The DC stays hidden. On a success the door unlocks, or bursts open if forced. A forced attempt that fails by 5 or more is noisy. You get a GM-only line in chat either way. GM pins (padlocks) on each locked door link to the room key.
  - **Traps.** Each trap is a Foundry Region you can see as a red square (players can't). A player's token that steps on it stops there. The game pauses, everyone sees "*Click!*", and you get a card with buttons: the triggering character's save (a roll request to their player), everyone's save, the trap's attack, its damage, *Resume the game* and *Re-arm*. A sprung trap disarms itself and shows on the map.
  - **Spotting traps.** Around each trap is a one-square warning ring. A character whose passive Perception (or Investigation, for magical traps) beats the trap's DC stops at the edge of the ring and spots it. Chat says what they noticed and the trap appears on the map. The trigger stays live until it's disarmed or avoided.
  - **Sneaking past.** Tokens you move as GM (monsters, or players' tokens) never set anything off.
  - **Setup.** Needs the module socket, so restart Foundry once after updating.
- **Camp & downtime** (Downtime). Players open **Camp** and **Projects & Downtime** from the token controls; you start camp from the toolkit's *Camp & Projects* tab, or with the *Camp* button on a travel day. The day counter only moves when the party breaks camp or you grant downtime days. There's no running clock.
  - **Making camp.** Everyone's screen gets the same camp window, in four phases:
    1. **Choose a spot.** Two or three sites for the terrain (a rock overhang, an oasis, a barrow mound), each with shelter, water and hidden tags, a perk and a risk. Players vote and you pick.
    2. **Set up camp.** Light a fire or don't: hot food and songs, but it can be seen. Players drag their portrait onto a job, or click it and then the job, and roll from their own sheet. The jobs: cook (temporary hit points for everyone), forage (food and herbs for brewing), hunt (meat and hides), tend wounds (an ally gets an extra Hit Die), mend gear, set alarms (the watch has advantage and the camp can't be surprised), scout (fewer surprises, plus a hint of what's coming), pray, stories and songs (an ally wakes inspired), search the site, turn in early, or two hours on a downtime project. DCs change with the site, the weather and the fire. Players drag their portraits between watches.
    3. **The night.** You reveal it watch by watch. Visitors, thieves, omens, weather turns, false alarms or an ambush land in a particular watch. Whoever is on that watch rolls (an Insight check for a visitor, Arcana for an omen), and everyone rolls the save in a storm. An ambush opens in the Encounter tab, or as a night camp battlemap with the fight ready to place.
    4. **Morning.** Everyone's gains, a suggested rest (full, broken or none) with warnings about cold or a fight, and one click to apply the rest, temporary HP, inspiration, extra Hit Dice, food, herbs, meat, finds and project hours. It posts a morning report to chat and the Journey Log.
  - **Food (optional).** Tick *Track food* and each camper eats a ration, foragers and hunters bring more in, and the window warns when someone will go hungry.
  - **Projects.** Every character's downtime projects are progress bars, with a marker at each check along the way.
    - **Kinds.** Players propose: read a book from their pack, train a tool, language or skill, craft something, research a question, or anything else.
    - **Approval.** You approve with the hours, the check DC and a note (or *Fast ×½* / *Slow ×1½*). Gold and materials are taken on approval.
    - **Progress.** Camp gives two hours an evening, and *Grant downtime days* gives 8 hours a day to each character's starred project.
    - **Checks.** At each check, progress stops until the player rolls from their sheet. A success is a breakthrough (+10%, or +20% beating the DC by 5). A failure is a setback, and a bad crafting failure also ruins materials. Every step is logged.
    - **Rewards.** Finishing one hands out the reward: proficiency or expertise on the sheet, the crafted item in the pack, spells copied into a wizard's spellbook, or a lore book's secret whispered to the reader.
  - **Skill books** turn up in treasure: a practical treatise on thieves' tools, a primer of Draconic, the Ranger's Almanac. Once a character has read one, training that subject goes 25% faster (two different books, 50%). Lore books hold a secret, and wizards' workbooks hold spells.
  - **Crafting.** It uses what the party harvests. About 25 recipes (potions of healing from herbs, hide armor from pelts, a scaled shield, arrows, antitoxin, alchemist's fire, spell scrolls, trail rations, trophy charms) check the right tool and pull the materials from the pack automatically. Anything else follows the general rule: half its price, 10 gp of work a day. A magic item takes workweeks by rarity, plus a rare ingredient harvested from a creature of high enough CR. Forge items have a *Craft as a project* button.
- **Campaign** (Story): the world's memory.
  - **Factions:** where the party stands with each, from hostile to devoted, with why it changed. Helping a faction annoys its rivals.
  - **People:** everyone they've met and what happened each time, with *Brief me* to whisper yourself the NPC's memory before a scene.
  - **Places, quests and a log:** quests have steps and a status, and everything leaves a dated line in the log.
  - **Adding things:** *Remember* on the NPC tab, *Add to campaign* on a settlement, and *Track quest* / *Track in campaign* on plot hooks and side quests. Tracking a side quest ties it into the world: the villain works for a faction the party has crossed (or a new one), and friends they already know become the patron and contacts.
  - **Plot hooks:** with *Use campaign people*, new hooks cast known friends as patrons and known enemies as villains.
  - **Quest Log:** the players get a journal of active and finished quests and faction standing, which updates itself and never shows your notes.
  - **Next session:** a prep page built from the campaign. Set where the party is heading (optional) and press *Prep next session*. You get:
    - what happened since the last prep, from the log
    - each active quest and its next step
    - what three factions do while the party isn't looking (by standing: an ambush, a favor, a move against a rival)
    - who's due to turn up again, and why
    - the road ahead, and any dungeons that still need a map
    - three ready fights (a hostile faction's, one for the road, a wildcard), each with *Place (hidden)*
    - four rumors, marked true or false for you
    - a loot bundle and the weather

    🎲 rerolls any part on its own. *Write to journal* keeps a GM-only "Next session" journal up to date.
- **Loot on the map** (automatic; needs the module socket, so restart Foundry once after updating). Treasure is something the players walk up to and take. Item Piles is no longer needed for this; it's still used for shop merchants.
  - **Where it comes from:** dungeon loot piles (hidden), fallen hostile creatures (their pocket money and harvestable parts), the end-of-fight treasure (*Drop it here for them to loot*), and the Loot tab's *Place on the map* (shift-click to hide it, DC 15).
  - **Walking up:** chests and sacks are drawn on the map. A player whose token walks next to one gets a loot window. Hidden ones only show up for a character whose passive Perception beats the pile's DC, and everyone sees "*Brakka spots something*". During a fight in that scene, nothing pops up; players open it when they're ready.
  - **Search / loot** (token controls, and the action bar): opens the pile you're standing by. Otherwise you choose Perception (look around) or Investigation (search carefully) and roll from your sheet. That reveals hidden piles and traps within about 10 feet whose DC the roll beats.
  - **Containers** come from the treasure rules:
    - **Locked:** *Pick the lock* uses thieves' tools; *Force it open* is Athletics, 2 harder, and loud if it fails.
    - **Trapped:** *Check it for traps* is Investigation against the trap's DC. A found trap can be disarmed with thieves' tools; failing by 5 sets it off. Opening an armed one springs it.
    - **When a trap springs:** you get its card with one-click save, attack and damage rolls.
    - **Mimics:** opening one gets you a button that swaps the chest for a Mimic token and rolls initiative. A good Investigation check spots it first.
  - **Taking things:** *Take all* or tick what to take. Coins and items go into the **party stash**, which is dnd5e's primary party group actor. The toolkit makes "The Party" and sets it as primary the first time anyone loots. Matching items stack. Everyone sees a line saying who took what.
    - **Sharing out:** players open the stash from the token controls (*Party stash*) and drag items to their own sheets.
    - **Harvesting:** monster parts on a body need a check (Survival, Nature, Arcana, Medicine or Religion at the part's DC). A failure ruins the part.
  - **Emptied piles** vanish. A body's pile goes when its token is deleted.
  - Both settings are on by default: *Combat: fallen foes can be searched* (world) turns off searchable bodies, and *Loot: open piles when a character walks up* (per player) turns off the pop-up.
- **Settlement** (World): a hamlet, village, town or city to arrive in.
  - **People and places:** a name and population, a few lines of character (looks, what it's known for, the mood), who runs it, notable folk with secrets, an inn (keeper, specialty, room price, a feature), a temple (deity, priest), and 1–7 shops with stock and keepers.
  - **Story hooks:** factions with goals and leaders, the local trouble (one click makes it a side quest), and rumors.
  - **The map:** streets, a market square with a well and stalls, and every building with walls, a door, a window and furniture. The temple, inn, hall and shops are placed in real buildings.
  - *Create town scene* puts the roofs on an overhead layer: players see inside a building only once they can see through its door or windows. Each named building gets a pin linked to its page in the town journal.
  - People open in the NPC tab, shops in the Shop tab (each with its own interior battlemap).
- **Travel** (World): overland journeys day by day.
  - **World map:** *Generate world map* paints a region of about 360 × 240 miles: coasts, forests, hills, mountains, swamps, desert or snow by climate, rivers running to the sea, towns joined by roads, and dungeons, lairs, landmarks and temples. Your campaign's places go on it first.
    - **The scene:** every place is a pin linked to its page in a GM-only *World atlas* journal. Players can't see a pin until you show them its page (give them Observer on it), so they find places as they go. *Add campaign places* pins anything added since.
    - **Trips:** pick *From* (or wherever the party is) and *To*, then *Plan the trip*. It finds the way, by road where it can, and draws it on the map. It fills in the journey below (miles become days at your pace, and the terrain it mostly crosses), then plans it.
    - **The party marker:** *Walk a day* moves it along the route by that day's miles, and *Arrive* skips to the end.
  - **Set up:** from, to, 1–21 days, terrain (road, grassland, forest, hills, mountains, swamp, desert, arctic, coast), climate, season and pace.
  - **Each day:** weather with its rules effect, miles made good (rough ground and storms slow you), a navigation DC off-road, a foraging DC, and one event. Events are a quiet day, an encounter (with the time it strikes and a Perception check for the watch), a hazard with its save or check (river fords, rockslides, sinkholes, sandstorms, thin ice…), a discovery that can become a side quest, or a meeting on the road.
  - **Buttons:** every check opens a roll request; encounters open in the Encounter tab or straight onto a matching battlemap with the fight ready to place; 🎲 rerolls a day; *Travel log* writes the trip to a journal.
- **Combat helpers** (automatic, each can be switched off in module settings): fights placed by the toolkit are tracked.
  - **Monster turn cards:** on each monster's turn you get a whispered card with its HP and what it does. The advice comes from its role, wits and wounds: the archer goes for the spellcaster, the skirmisher picks off the wounded and gets out, the wolf bolts when hurt, the cornered mage bargains, a breath weapon that's recharged goes first. One-click buttons roll each of its attacks and abilities, and another rolls a recharge.
  - **Legendary and lair actions:** legendary actions are offered at the end of every other creature's turn, with the cost spent for you, and refresh on the monster's own turn. At the top of each round, a boss fighting in its lair gets its lair actions. Bosses without any get three generated ones to choose from, by creature type with a DC from their CR.
  - **Quick combat** (module setting, on by default). On a player's turn their **action bar** pops up (or use *Quick actions* in the token controls). It shows their equipped weapons, prepared spells and usable abilities, with **Disadvantage / Normal / Advantage** to choose; the choice resets after each attack.
    1. **Click an action, then click the target** (Esc cancels). Area spells place their template, and everyone inside is affected.
    2. **It resolves itself:**
       - **Attacks** roll against the target's AC. HIT, MISS or CRITICAL! floats up, and a crit rolls double dice.
       - **Saving throws** are rolled by the targets: full damage on a failure, half on a success (nothing for cantrips).
       - **Damage and healing** are applied with resistances, immunities and vulnerabilities, and the number floats over the target.
       - **Spell slots, uses and charges** are spent through dnd5e as usual.
       - **The chat card** carries the real rolls (with Dice So Nice), plus a one-line result.
    3. **An effect plays for everyone:** a slash arc, a thrust, a hammer ring, an arrow in flight, a fire bolt, a ray, a burst, or a healing glow, colored by damage type. Hit tokens shudder, and missed projectiles fly past. With Sequencer and JB2A installed, it uses their animations instead.
    4. **Monster turns:** the turn card has a **Target** box, set to the foe its tactics pick (change it, or choose *Click a token*). The card's buttons use it:
       - **Attacks** go straight at the target, with no clicking.
       - **Multiattack** reads the statblock ("one with its bite and two with its claws") and rolls every attack. If the target drops partway, the rest go to the nearest foe still standing.
       - **Breath weapons and other areas** aim themselves where they catch the most of the party and the fewest of its friends. The button shows how many it'll hit.
       - **Conditions** on the monster show at the top of the card, with the rules on hover.
    5. **Undo:** damage is applied by the GM's client, and every hit gets a GM-only log line with an **Undo** button (for Shield, Uncanny Dodge or a change of heart).
  - **Party HUD** (client setting): a small panel everyone can drag around. It shows each character's HP and temporary HP bar, AC, condition icons, what they're concentrating on, spell slot pips, and death saves when they're down. Click a character to find their token; double-click to open your own sheet.
  - **Turn reminders** (world setting): at the start of a character's turn, the player (and you) get a whispered card with what their conditions mean ("Prone: standing up costs half your speed…"), exhaustion, and the spell they're concentrating on. At 0 HP it shows their death save tally with a **Death save** button. dnd5e already asks for concentration saves when a concentrating character takes damage.
  - **Surrender:** when morale breaks, a creature can surrender. It leaves the fight and tells you what it knows, and what it wants in return.
  - **Morale:** when a leader falls or half the group is down, you get a card to roll morale (Wisdom DC 10); those who fail flee, frightened.
  - **Waves:** reinforcements announce themselves on their round, with a button to bring them in.
  - **Loot:** fallen foes can be searched (see *Loot on the map*). When the last foe of a generated fight drops, you get the fight's treasure, to drop on the map for them to loot or give to a token.
  - **Threat meter:** the combat tracker shows how dangerous the foes still standing are for the party.
- **Traps & Puzzles** (At the table):
  - **Traps** hit as hard as the DMG's severity table says for the party's level (setback, dangerous, deadly; mechanical or magical). Each has a trigger, effect, save or attack, rider, spot and disarm DCs, and countermeasures, with one-click roll requests to spot it, survive it and disarm it. Dungeon rooms use these too.
  - **Puzzles** are classic riddles and mechanisms (statues, levers, scales, crystals…), with the solution, three hints you post one at a time, and what a wrong answer costs.
- **Handouts** (At the table): wanted posters, intercepted letters with a wax seal, and treasure maps, painted on aged parchment. Tie one to the current side quest and it names the villain, the prize, the lair and their mark. *Create & show players* makes a journal (an image page for the players, a GM page with the truth) and opens Foundry's show-to-players dialog.
- **Side Quest**: for when the table drifts off the main road. Start from **a quest type** (18 of them): bandit hideout, dragon hunt, necromancer's tomb, cult ritual, monster hunt, goblin warren, werewolf curse, smugglers' cove, fey bargain, haunted manor, pirate raid, giant raid, orc warband, thing from below, elemental rift, rogue construct, demonic incursion or Underdark expedition. Or start from **a keyword**: "silver serpent" becomes a silver dragon in an icy lair, "the bone choir" a necromancer's ritual, "manticore" a manticore hunt. The keyword is the seed, so the same words always give the same quest and the dice give a variation. Or go **fully random**. One named villain, one prize, one lair, one calling card and one region run through every mission (lead → road → delve → showdown), and each mission's clue points to the next. Fights try the most specific monsters first ("dragon+silver") and fall back ("dragon") until something fits the party. Under *Pick the foes yourself* you can set the villain's forces and the villain by tags, and make every fight easier or harder. Each mission card has an objective, a place, a contact NPC, a rolled fight, the checks it calls for with DCs, a reward and how it leads to the next. One click hands each piece to the right tab for building out: *Build map* opens the dungeon, cave or battlemap with its seed (and the fight ready to place), *Encounter* opens the fight to tweak or lock, *Contact* and *Hoard* open the NPC and the loot, and each check button becomes a roll request. 🎲 replaces a single mission. *Journal* writes up the whole quest.
- **Roll Requests**: ask players for a check or save without them typing anything. Pick a preset (spot the ambush, sneak past, dodge the trap, resist the poison…) or any skill, save or ability check, set a DC (shown or hidden), advantage or disadvantage, and who sees the roll (everyone, GM only or blind). Tick who should roll. Each player gets a popup with a **Roll** button that rolls from their own sheet with all their bonuses, plus a chat card in case they close it. Results land in a live table with ✓/✗, a group result (half must pass), a *roll for them* button for absent players, and a GM-only summary in chat when everyone has rolled. Skill requests also show everyone's passive score against the DC. Encounter cards have *Ask to roll* (e.g. Perception against the ambush), and side quest checks send straight here. Needs the module's socket, so restart Foundry once after updating.
- **Import** (paste & parse): paste a **whole statblock** (2014, 2024 or D&D Beyond) and *Create actor* builds a complete dnd5e NPC: abilities and save proficiencies, skills (proficiency or expertise worked out from the bonus and CR), AC, HP and formula, speeds, senses, damage resistances, immunities and vulnerabilities (with the nonmagical bypass), condition immunities, languages, CR, Legendary Resistance and legendary action counts, every trait, action, bonus action, reaction, legendary and lair action as a working item, and its spell list (prepared, at will and X/day) copied from your spell compendiums. *Create & place token* drops it on the map too. Or paste a spell, magic item, monster action or feature straight from a book, PDF or D&D Beyond (2014 and 2024 layouts both work) and get a working item without editing any formulas. Spells get level, school, components and materials, casting time, range, area, duration and concentration, attack or save, damage or healing (`1d8 + @mod`) and upcast or cantrip scaling. Magic items get type and base weapon or armor, rarity, attunement, +X bonus, extra damage, charges with dawn recovery, and Active Effects for AC, saves, resistances, darkvision and ability scores. Paste a statblock's whole Actions section and each one becomes its own attack (flat to-hit, reach or range, every damage part) or feature (save DC, area, Recharge 5-6, 3/Day, bonus action, legendary cost). A summary shows what was found and warns about anything it couldn't pin down, like "rarity varies" or "casts lightning bolt". Fix the name if needed, then *Create item* or *Add to selected*, one at a time or all at once. Ctrl+Enter parses.
- **Shop**: general store, blacksmith, armorer, weaponsmith, bowyer/fletcher, alchemist, jeweler, or magic shop, in a hamlet up to a metropolis. Settlement size sets stock depth and the highest magic rarity, and general stores never go past uncommon. Every shop comes with a name, a shopkeeper (race, personality, quirk), a price markup, a buy-back rate, a haggle DC and a rumor. Stock comes from your item compendiums, deduped across DDB and SRD spellings, with firearms and mounts excluded. You can send it to a journal or chat, or create an **Item Piles merchant** players can buy from. The markup becomes the merchant's buy price modifier.
- **NPC**: pick a role (commoner, merchant, innkeeper, guard, soldier, noble, priest, scholar, criminal, mage) and race, or leave them random. You get a name, age, occupation, look, voice, personality, what they want, a quirk, an opening line, and a GM-only secret. *Create actor* copies a fitting statblock from your compendiums (Guard, Veteran, Noble, Spy...) under the NPC's name, with the personality in its biography and the race set. *Place token* drops it at the center of your view. The Shop tab's *Keeper NPC* button fleshes out the shopkeeper the same way.
- **Loot**: individual or hoard treasure by CR, optionally **taken from** a creature type. Fights and dungeon lairs theme their treasure on their own monsters automatically.
  - **Theming.** Beasts, plants and constructs carry no coin. Their value is in **parts worth harvesting** (dire wolf pelts, owlbear claws, dragon scales, a fiend's ichor), each with a Survival, Nature, Arcana, Medicine or Religion DC, how long it keeps and who buys it. The dead keep **grave goods** and old-mint coins. Monstrosities and oozes have whatever their victims carried.
  - **Hoards.** Besides coins, gems, art and magic items, hoards add **potions and spell scrolls** by tier (scrolls become real dnd5e scrolls of that spell when your compendium has it), **trade goods** (silk, saffron, silver ingots, mithral bars), **curiosities with a hook** (a pawn ticket for "one sword, unusual", a compass that points at something), **gear** (thieves' tools, alchemist's fire, a spyglass) and a **container**. It might be an iron-bound chest, a sarcophagus or a nest of bones, sometimes locked, sometimes trapped (poison needle, glyph, gas, even a mimic).
  - **Individual treasure.** It sometimes adds a purse, a potion, a trinket or a piece of gear.
  - **The magic item list.** It covers about 220 SRD items.
  - **Getting it to the table.** Post it to chat, save it to a journal, or *Give to selected token*. That adds coins to dnd5e currency and items to the inventory, pulled from your compendiums by name when a match exists.
- **Plot Hook**: heroic, mystery, horror, intrigue or exploration hooks scaled to party level, built from about 250 table entries: patron, goal, location, complication, deadline, gold and bonus reward, plus a GM-only villain and twist. Every part is an editable field with its own 🎲 to reroll just that part. The read-aloud text rebuilds from the parts, or you can write your own. *Blank hook* starts from scratch.

Macro / module API:

```js
const tk = game.modules.get("dnd-toolkit").api;
const map = tk.generateDungeon({ seed: "crypt", width: 50, height: 40 });
await tk.createDungeonScene(map, { roomKey: tk.stockDungeon(map, { partyLevel: 5 }) });
await tk.giveLootToActor(tk.generateLoot({ cr: 8, mode: "hoard" }), game.user.character);
const catalog = await tk.getCatalog("compendium");
const enc = tk.generateEncounter({ catalog, partyLevel: 5, tags: "humanoid+orc", difficulty: "high" });
await tk.placeEncounter(enc, { startCombat: true });
Hooks.on("dnd-toolkit.ready", (api) => { /* other modules can extend here */ });
```

### Monster tags

| Query | Meaning |
|---|---|
| `humanoid+orc` | humanoid **and** orc (`+` or a space = and) |
| `undead, fiend` | undead **or** fiend (`,` `\|` or `or`) |
| `beast -swarm` | beasts, excluding swarms |
| `elves`, `woods`, `crypt`, `boss` | plurals and synonyms work (elf, forest, crypt, solo) |
| `red` | any word in a monster's name also matches |

Tags come from creature type, subtype, environment, curated themes (`bandit`, `cult`, `military`, `lycanthrope`...) and roles (`leader`, `brute`, `minion`, `caster`, `solo`...). Creature types match strictly, so `giant` finds Hill Giants but not Giant Rats.

**Race reskins:** generic "Any Race" statblocks (Veteran, Priest, Scout...) stand in for a race you ask for. `orc` gives "Orc Veteran, 7× Orc" and `elf` gives "Elf Knight, 4× Elf Scout". Real race statblocks are preferred whenever they fit. Non-combatants (Commoner, Noble, Spy) are only reskinned when explicitly asked for.

**Budgets** use the SRD 5.2 XP budget per character (low / moderate / high). *Deadly* is this toolkit's 1.5× high. Encounter shapes are solo, elite pair, leader & followers, mixed squad and horde. Each comes with role-based tactics, a situation, a terrain feature and optional treasure.

**Content source:** *My compendiums* reads your world NPCs, Actor compendiums and Item compendiums (see Content below). *Built-in SRD* uses the bundled list only.

## Roadmap

- [x] Encounters: XP budgets, tag search, race reskins, token placement, combat start
- [x] Encounter tweaks: lock a group and reroll the rest; "add a wave"
- [x] Cave maps
- [x] Quick battlemaps: clearing, road, cave, shop, tavern, ruins, camp, with lights, darkness and enemy start zones
- [x] Shops and merchant inventories (with Item Piles integration)
- [ ] More map styles: towns, wilderness hex; smoother cave walls; lights and ambient sound
- [ ] Stable / shipwright shop for mounts and vehicles
- [x] NPC generator: name, look, voice, motive, plus a dnd5e NPC actor from a statblock template
- [x] Forge: unique magic items built as working dnd5e items, also used for unique hoard loot
- [x] Paste & parse: spells, magic items, monster actions and features from book text into working items
- [ ] Rollable Table export for each generator
- [ ] Character sync: import from a JSON character format (see licensing note below)
- [ ] Settings for content packs: user-supplied JSON tables merged into the generators
- [ ] Release pipeline: GitHub Actions build plus a `module.json` manifest/download URL for one-click install

## Variety

Every generator shares a memory of the last 60 monsters you've used, across Encounter, dungeon rooms, side quests, travel and waves, and avoids them, so a session doesn't keep meeting the same creatures. Inside one dungeon, rooms avoid each other's monsters too. When tags don't name a creature type, the theme is picked by type rather than by monster count, so beasts don't win every time. Dungeons, side quests and travel each have an easier/standard/harder setting for their fights.

## Content

Personal-use toolkit: it builds on whatever is imported into Foundry (here via DDB Importer from owned books).

- **Monsters:** every Actor compendium plus world NPCs. Each statblock is analyzed once (legendary actions, spellcasting, melee vs ranged attacks, speed, skirmish traits, conditions it inflicts) to assign combat roles. The results are cached in the world setting `dnd-toolkit.roleCache`. After a big import, run `game.modules.get("dnd-toolkit").api.reanalyzeMonsters()` to redo all of them. New monsters are picked up automatically.
- **Treasure:** magic items come from Item compendiums by rarity. Variant families such as "Armor of Resistance" or "+2 weapons" count as one pick, so they don't crowd out everything else. Rolled items keep their UUIDs, so *Give to selected token* adds the exact compendium item.
- **Built-in SRD** (`packages/core/src/data`) is the fallback when no compendiums are installed. It also supplies hand-curated roles and themes that override derived ones for those monsters.

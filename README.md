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
- **Dungeon**: choose *Rooms & corridors* or *Cave*. Caves come out *mixed* (open caverns in one part, tight tunnels in another), *open* or *tight*, split into chambers of very different sizes and numbered in exploration order from the entrance. Set a **monster theme** (e.g. `goblinoid`) and how many rooms hold **monsters** (few / some / many). Encounters are spread across the map rather than bunched in neighboring rooms, and the lair gets a high-difficulty fight and a hoard. Under *Lighting & extras*: **hidden rooms** (a dead end, or a carved closet, sealed behind a Foundry secret door with treasure inside), **loot piles** (treasure stashed in a corner with a find DC, pinned as GM-only notes, plus hidden Item Piles piles when that module is active), **light sources** (none / sparse / well lit: wall torches, lair braziers and candles in dungeons; daylight at the entrance, glowing fungi, crystals and lava seams in caves), **darkness**, **global light** and **torch-bearers** (one creature in each humanoid group carries a lit torch). The preview shows a red dot where each monster will stand, gold squares for loot and purple outlines for hidden rooms and secret doors, with a room-by-room list below. *Create Scene* paints textured stone walls, makes walls, doors, secret doors, lights and darkness, and pins a room-key journal as map notes. Monsters are placed as hidden tokens away from the walls. **Locked doors** (none / a few / some / many) makes doors locked, stuck, barred or (from level 5) sealed by an arcane lock, favoring the lair and treasure rooms. Most locked doors have a key somewhere the party can reach without going through that door: carried by a room's monster (it drops with their treasure), in a loot pile, or stashed in a quiet room. Arcane locks have a password written somewhere. Keys can chain, but the dungeon can always be solved without picking or forcing anything. Each room trap gets **trigger squares** one step inside a doorway. The room key says which door is which, what opens it and where the key is. The preview shows gold dots for locked doors and red crossed squares for traps.
- **Battlemap**: a quick one-fight map. Pick forest clearing, road ambush, cave grotto, shop, tavern, ruins or bandit camp (or random), a size, and day or night. *Create Scene* builds a painted scene with walls, doors and windows. Trees, boulders, pillars, shelves and tents block movement and sight. It also gets fire, lamp and glowing-mushroom lights, darkness for caves and night, and a battlefield-notes journal covering cover, difficult terrain and hazards. The preview marks where the party arrives (blue) and where enemies start (red). Tick the box to drop the current encounter there as hidden tokens. The Shop tab's *Battlemap* button builds that shop's floor. **Locked doors** locks shop storerooms (the shopkeeper has the key), bars back doors from inside, now and then jams a kitchen door, and locks about half the houses in a town. **Traps** hides snares, bear traps, deadfalls, caltrops and wasp nests around camps, roads and clearings, and pits, glyphs and runes in ruins and caves. They go on the ground between the party and the enemy, never on the props.
- **Forge**: one-of-a-kind magic items in seconds. Pick a kind (weapon, armor or shield, wondrous item, wand/staff/rod, or a relic with history and a drawback), a rarity (or let the party level decide), a damage theme (fire, cold, necrotic, radiant...) and optionally a base ("Greataxe", "ring", "staff"). Forge up to 10 at once, with curses never, sometimes or always. Each card has a **Curse / Lift curse** toggle, and the Loot tab and the dungeon extras have their own curse setting for unique hoard items. A curse is a nasty property and sometimes a penalty effect (a vulnerability, or -1 to saves or AC). Cursed items are created **unidentified**: players see a plain "Fine Longsword" with only its good properties until you identify it on the sheet. Weapons can roll keen (19-20 crits), vicious (extra crit dice), bane (bonus damage against a creature type, on the item's other-formula button) and combat riders. Worn items draw from about 35 effects: AC, saves, checks, initiative, resistances and immunities, darkvision, blindsight and tremorsense, flying, swimming and climbing speeds, attack and damage bonuses, spell DC, hit points, and ability scores. Powers are blasts, spell-attack bolts, healing or utilities like Blink Step and Haste. Relics may be sentient. **Edit** any item, or start from **New blank item**, and change every field: name, kind, base, rarity, value, bonus, attunement, curse, extra damage, crit range and dice, bane, effect rows (pick from the catalog or type any custom key), the power (kind, charges, recharge, save and DC, damage, area, range), appearance, notes and lore. The description is rebuilt from the numbers, so it never goes stale. Each comes with a name, appearance, properties scaled to its rarity, and a price. *Create item* or *Give to selected* builds a working dnd5e item with no formula editing: the magic bonus, extra damage on hit, charges that recover at dawn, a save DC and damage for its power (one click to roll it), and Active Effects (AC, saves, resistance, speed, darkvision, ability scores...) that switch on when attuned. Weapons and armor are copies of the real compendium item. Tick *Unique items* on the Loot tab, or in the dungeon's extras, and hoard magic items are forged too; giving loot or creating Item Piles piles builds them the same way. The Forge also makes **potions, elixirs, oils and philters**: healing, temporary effects (applied to the drinker from the chat card, with a duration), breath weapons, or utility effects such as walking on water, mist form or second sight. It makes **scrolls**, which hold one use of a blast, bolt, heal or utility power, need no spellcasting and crumble afterward. It makes **ammunition**: stacks of arrows, bolts, bullets or needles with a bonus, extra damage, riders such as bursting, seeking or knockdown, and slaying shots at high rarity. These come out as single-use dnd5e consumables. Curses work on them too: tainted potions, scrolls that bite back, ammunition that veers toward allies.
- **Doors and traps on the map** (automatic on generated scenes):
  - **Doors.** A locked, stuck or barred door starts *locked* in Foundry. When a player clicks it, they get a prompt for their selected character: *use the key* (if they carry it), *speak the password*, *pick the lock* (rolls their thieves' tools), or *force it* / *break it down* (rolls Athletics). The DC stays hidden. On a success the door unlocks, or bursts open if forced. A forced attempt that fails by 5 or more is noisy. You get a GM-only line in chat either way. GM pins (padlocks) on each locked door link to the room key.
  - **Traps.** Each trap is a Foundry Region you can see as a red square (players can't). A player's token that steps on it stops there. The game pauses, everyone sees "*Click!*", and you get a card with buttons: the triggering character's save (a roll request to their player), everyone's save, the trap's attack, its damage, *Resume the game* and *Re-arm*. A sprung trap disarms itself and shows on the map.
  - **Spotting traps.** Around each trap is a one-square warning ring. A character whose passive Perception (or Investigation, for magical traps) beats the trap's DC stops at the edge of the ring and spots it. Chat says what they noticed and the trap appears on the map. The trigger stays live until it's disarmed or avoided.
  - **Sneaking past.** Tokens you move as GM (monsters, or players' tokens) never set anything off.
  - **Setup.** Needs the module socket, so restart Foundry once after updating.
- **Settlement** (World): a hamlet, village, town or city to arrive in.
  - **People and places:** a name and population, a few lines of character (looks, what it's known for, the mood), who runs it, notable folk with secrets, an inn (keeper, specialty, room price, a feature), a temple (deity, priest), and 1–7 shops with stock and keepers.
  - **Story hooks:** factions with goals and leaders, the local trouble (one click makes it a side quest), and rumors.
  - **The map:** streets, a market square with a well and stalls, and every building with walls, a door, a window and furniture. The temple, inn, hall and shops are placed in real buildings.
  - *Create town scene* puts the roofs on an overhead layer: players see inside a building only once they can see through its door or windows. Each named building gets a pin linked to its page in the town journal.
  - People open in the NPC tab, shops in the Shop tab (each with its own interior battlemap).
- **Travel** (World): overland journeys day by day.
  - **Set up:** from, to, 1–21 days, terrain (road, grassland, forest, hills, mountains, swamp, desert, arctic, coast), climate, season and pace.
  - **Each day:** weather with its rules effect, miles made good (rough ground and storms slow you), a navigation DC off-road, a foraging DC, and one event. Events are a quiet day, an encounter (with the time it strikes and a Perception check for the watch), a hazard with its save or check (river fords, rockslides, sinkholes, sandstorms, thin ice…), a discovery that can become a side quest, or a meeting on the road.
  - **Buttons:** every check opens a roll request; encounters open in the Encounter tab or straight onto a matching battlemap with the fight ready to place; 🎲 rerolls a day; *Travel log* writes the trip to a journal.
- **Combat helpers** (automatic, each can be switched off in module settings): fights placed by the toolkit are tracked.
  - **Morale:** when a leader falls or half the group is down, you get a card to roll morale (Wisdom DC 10); those who fail flee, frightened.
  - **Waves:** reinforcements announce themselves on their round, with a button to bring them in.
  - **Loot:** with Item Piles, the fallen become lootable piles. When the last foe drops you get the fight's treasure, to drop as a pile or give to a token.
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

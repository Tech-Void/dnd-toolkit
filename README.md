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

Enable **DnD Toolkit** in your world, then click the d20 button in the Token controls (GM only).

- **Encounter**: party level and size (or auto-detect from player characters), difficulty, shape, and **monster tags**. Click a monster's name for its statblock. *Place hidden* drops non-overlapping tokens around your view. *Place & fight* adds them to combat and rolls initiative. Click the lock next to a group to keep it, then *Generate* again to rebuild everything else around it (same seed, same result; the dice button rerolls). *Add a wave* stacks on reinforcements worth about half the budget, each arriving on a later round with *Bring in* to drop them into the running combat.
- **Dungeon**: choose *Rooms & corridors* or *Cave*. Caves come out *mixed* (open caverns in one part, tight tunnels in another), *open* or *tight*, split into chambers of very different sizes and numbered in exploration order from the entrance. Set a **monster theme** (e.g. `goblinoid`) and how many rooms hold **monsters** (few / some / many). Encounters are spread across the map rather than bunched in neighboring rooms, and the lair gets a high-difficulty fight and a hoard. Under *Lighting & extras*: **hidden rooms** (a dead end, or a carved closet, sealed behind a Foundry secret door with treasure inside), **loot piles** (treasure stashed in a corner with a find DC, pinned as GM-only notes, plus hidden Item Piles piles when that module is active), **light sources** (none / sparse / well lit: wall torches, lair braziers and candles in dungeons; daylight at the entrance, glowing fungi, crystals and lava seams in caves), **darkness**, **global light** and **torch-bearers** (one creature in each humanoid group carries a lit torch). The preview shows a red dot where each monster will stand, gold squares for loot and purple outlines for hidden rooms and secret doors, with a room-by-room list below. *Create Scene* paints textured stone walls, makes walls, doors, secret doors, lights and darkness, and pins a room-key journal as map notes. Monsters are placed as hidden tokens away from the walls.
- **Battlemap**: a quick one-fight map. Pick forest clearing, road ambush, cave grotto, shop, tavern, ruins or bandit camp (or random), a size, and day or night. *Create Scene* builds a painted scene with walls, doors and windows. Trees, boulders, pillars, shelves and tents block movement and sight. It also gets fire, lamp and glowing-mushroom lights, darkness for caves and night, and a battlefield-notes journal covering cover, difficult terrain and hazards. The preview marks where the party arrives (blue) and where enemies start (red). Tick the box to drop the current encounter there as hidden tokens. The Shop tab's *Battlemap* button builds that shop's floor.
- **Forge**: one-of-a-kind magic items in seconds. Pick a kind (weapon, armor or shield, wondrous item, wand/staff/rod, or a relic with history and a drawback), a rarity (or let the party level decide), a damage theme (fire, cold, necrotic, radiant...) and optionally a base ("Greataxe", "ring", "staff"). Forge up to 10 at once. Each comes with a name, appearance, properties scaled to its rarity, and a price. *Create item* or *Give to selected* builds a working dnd5e item with no formula editing: the magic bonus, extra damage on hit, charges that recover at dawn, a save DC and damage for its power (one click to roll it), and Active Effects (AC, saves, resistance, speed, darkvision, ability scores...) that switch on when attuned. Weapons and armor are copies of the real compendium item. Tick *Unique items* on the Loot tab, or in the dungeon's extras, and hoard magic items are forged too; giving loot or creating Item Piles piles builds them the same way.
- **Import** (paste & parse): paste a spell, magic item, monster action or feature straight from a book, PDF or D&D Beyond (2014 and 2024 layouts both work) and get a working item without editing any formulas. Spells get level, school, components and materials, casting time, range, area, duration and concentration, attack or save, damage or healing (`1d8 + @mod`) and upcast or cantrip scaling. Magic items get type and base weapon or armor, rarity, attunement, +X bonus, extra damage, charges with dawn recovery, and Active Effects for AC, saves, resistances, darkvision and ability scores. Paste a statblock's whole Actions section and each one becomes its own attack (flat to-hit, reach or range, every damage part) or feature (save DC, area, Recharge 5-6, 3/Day, bonus action, legendary cost). A summary shows what was found and warns about anything it couldn't pin down, like "rarity varies" or "casts lightning bolt". Fix the name if needed, then *Create item* or *Add to selected*, one at a time or all at once. Ctrl+Enter parses.
- **Shop**: general store, blacksmith, armorer, weaponsmith, bowyer/fletcher, alchemist, jeweler, or magic shop, in a hamlet up to a metropolis. Settlement size sets stock depth and the highest magic rarity, and general stores never go past uncommon. Every shop comes with a name, a shopkeeper (race, personality, quirk), a price markup, a buy-back rate, a haggle DC and a rumor. Stock comes from your item compendiums, deduped across DDB and SRD spellings, with firearms and mounts excluded. You can send it to a journal or chat, or create an **Item Piles merchant** players can buy from. The markup becomes the merchant's buy price modifier.
- **NPC**: pick a role (commoner, merchant, innkeeper, guard, soldier, noble, priest, scholar, criminal, mage) and race, or leave them random. You get a name, age, occupation, look, voice, personality, what they want, a quirk, an opening line, and a GM-only secret. *Create actor* copies a fitting statblock from your compendiums (Guard, Veteran, Noble, Spy...) under the NPC's name, with the personality in its biography and the race set. *Place token* drops it at the center of your view. The Shop tab's *Keeper NPC* button fleshes out the shopkeeper the same way.
- **Loot**: individual or hoard treasure by CR. Post it to chat, save it to a journal, or *Give to selected token*. That adds coins to dnd5e currency and items to the inventory, pulled from your compendiums by name when a match exists.
- **Plot Hook**: tone and level-scaled hooks with a GM-only twist.

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

## Content

Personal-use toolkit: it builds on whatever is imported into Foundry (here via DDB Importer from owned books).

- **Monsters:** every Actor compendium plus world NPCs. Each statblock is analyzed once (legendary actions, spellcasting, melee vs ranged attacks, speed, skirmish traits, conditions it inflicts) to assign combat roles. The results are cached in the world setting `dnd-toolkit.roleCache`. After a big import, run `game.modules.get("dnd-toolkit").api.reanalyzeMonsters()` to redo all of them. New monsters are picked up automatically.
- **Treasure:** magic items come from Item compendiums by rarity. Variant families such as "Armor of Resistance" or "+2 weapons" count as one pick, so they don't crowd out everything else. Rolled items keep their UUIDs, so *Give to selected token* adds the exact compendium item.
- **Built-in SRD** (`packages/core/src/data`) is the fallback when no compendiums are installed. It also supplies hand-curated roles and themes that override derived ones for those monsters.

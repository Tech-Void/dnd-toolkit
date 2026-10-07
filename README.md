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

- **Encounter**: party level and size (or auto-detect from player characters), difficulty, shape, and **monster tags**. Click a monster's name for its statblock. *Place hidden* drops non-overlapping tokens around your view. *Place & fight* adds them to combat and rolls initiative.
- **Dungeon**: choose *Rooms & corridors* or *Cave*. Caves are cellular-automata caverns joined by tunnels and split into natural chambers, numbered in exploration order from the entrance. Preview, then *Create Scene*. The scene gets a background image, walls, doors, token vision and fog, plus a room-key journal pinned as map notes. Set a **monster theme** (e.g. `goblinoid`) and every room's encounter fits it. A lair gets a high-difficulty fight and a hoard. Monsters can be placed as hidden tokens in their rooms.
- **Shop**: general store, blacksmith, armorer, weaponsmith, bowyer/fletcher, alchemist, jeweler, or magic shop, in a hamlet up to a metropolis. Settlement size sets stock depth and the highest magic rarity, and general stores never go past uncommon. Every shop comes with a name, a shopkeeper (race, personality, quirk), a price markup, a buy-back rate, a haggle DC and a rumor. Stock comes from your item compendiums, deduped across DDB and SRD spellings, with firearms and mounts excluded. You can send it to a journal or chat, or create an **Item Piles merchant** players can buy from. The markup becomes the merchant's buy price modifier.
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
- [ ] Encounter tweaks: lock a group and reroll the rest; "add a wave"
- [x] Cave maps
- [x] Shops and merchant inventories (with Item Piles integration)
- [ ] More map styles: towns, wilderness hex; smoother cave walls; lights and ambient sound
- [ ] Stable / shipwright shop for mounts and vehicles
- [ ] NPC generator: name, look, voice, motive, plus a dnd5e NPC actor from a statblock template
- [ ] Rollable Table export for each generator
- [ ] Character sync: import from a JSON character format (see licensing note below)
- [ ] Settings for content packs: user-supplied JSON tables merged into the generators
- [ ] Release pipeline: GitHub Actions build plus a `module.json` manifest/download URL for one-click install

## Content

Personal-use toolkit: it builds on whatever is imported into Foundry (here via DDB Importer from owned books).

- **Monsters:** every Actor compendium plus world NPCs. Each statblock is analyzed once (legendary actions, spellcasting, melee vs ranged attacks, speed, skirmish traits, conditions it inflicts) to assign combat roles. The results are cached in the world setting `dnd-toolkit.roleCache`. After a big import, run `game.modules.get("dnd-toolkit").api.reanalyzeMonsters()` to redo all of them. New monsters are picked up automatically.
- **Treasure:** magic items come from Item compendiums by rarity. Variant families such as "Armor of Resistance" or "+2 weapons" count as one pick, so they don't crowd out everything else. Rolled items keep their UUIDs, so *Give to selected token* adds the exact compendium item.
- **Built-in SRD** (`packages/core/src/data`) is the fallback when no compendiums are installed. It also supplies hand-curated roles and themes that override derived ones for those monsters.

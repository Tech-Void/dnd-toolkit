import { createRng, type Rng } from "./rng.ts";
import { FLOOR, roomCells, roomCenter, type DungeonMap, type LootPile, type Room, type RoomKey } from "./dungeon.ts";
import { emptyLoot, themedItems, type FindKind } from "./loot.ts";

// ---------------------------------------------------------------------------
// Rooms with a purpose: a dungeon follows a theme (bandit hideout, crypt, mine...), each room is
// something (barracks, ossuary, smelting room...) and is furnished to match. Furniture positions
// are decided here so the preview, the scene and the room key all agree.

export type DungeonTheme = "hideout" | "crypt" | "mine" | "temple" | "fortress" | "wizard" | "cavern";

export type FurnitureKind =
  | "bed" | "bedroll" | "table" | "chair" | "bench" | "barrel" | "crate" | "sack" | "weaponRack" | "chest" | "altar" | "coffin"
  | "sarcophagus" | "bookcase" | "shelf" | "rug" | "pillar" | "bones" | "skeleton" | "campfire" | "forge" | "anvil" | "mineCart"
  | "support" | "cauldron" | "cage" | "chains" | "pew" | "cupboard" | "bookstand" | "desk" | "glassware" | "hay" | "throne"
  | "mushrooms" | "rubble" | "candles";

/** A piece of furniture: its footprint, and which way its back faces (walls get backs against them). */
export interface Furnishing {
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  h: number;
  facing: "n" | "e" | "s" | "w";
}

type Place = "wall" | "center" | "corner" | "rows" | "anywhere";
interface Spec {
  kind: FurnitureKind;
  /** Size along the wall (or across a row) × depth. */
  size: [number, number];
  /** How many: a fixed range, or one per this many floor squares. */
  count: [number, number] | { per: number; max: number };
  place: Place;
  /** Chairs (or benches) around it, for tables. */
  around?: FurnitureKind;
}

interface Purpose {
  name: string;
  text: string[];
  furniture: Spec[];
  finds?: FindKind;
  /** How the room's monsters are caught, if anything is here. */
  situation?: string;
}

const s = (kind: FurnitureKind, size: [number, number], count: Spec["count"], place: Place, around?: FurnitureKind): Spec => ({ kind, size, count, place, around });

const PURPOSES: Record<string, Purpose> = {
  // Hideouts and fortresses
  barracks: { name: "Barracks", text: ["Bedrolls and battered cots crowd the floor, each with a pack and a pair of boots beside it.", "Bunks line the walls; the air reeks of sweat, smoke and cheap ale."], furniture: [s("bedroll", [1, 2], { per: 7, max: 8 }, "wall"), s("chest", [1, 1], [1, 2], "wall"), s("barrel", [1, 1], [0, 1], "corner")], situation: "Some of them are asleep: they start prone and unarmored, and can't act in the first round unless woken by noise." },
  bunks: { name: "Bunk room", text: ["Wooden beds stand in a neat row, blankets folded with military care."], furniture: [s("bed", [1, 2], { per: 6, max: 8 }, "wall"), s("chest", [1, 1], { per: 12, max: 3 }, "wall")], situation: "Off-duty guards, half-dressed: their AC is 2 lower until they spend an action donning armor." },
  mess: { name: "Mess hall", text: ["A long table is scarred with knife marks and set with half-eaten food.", "Benches, plates of cold stew and an upturned tankard or six."], furniture: [s("table", [3, 1], [1, 2], "center", "bench"), s("barrel", [1, 1], [1, 2], "corner"), s("sack", [1, 1], [1, 2], "wall")], finds: "supplies", situation: "They're eating, weapons stacked by the door: each needs an action to grab theirs." },
  kitchen: { name: "Kitchen", text: ["A soot-black hearth, a cauldron of something bubbling and a rat bold enough to stay."], furniture: [s("cauldron", [1, 1], [1, 1], "center"), s("table", [2, 1], [1, 1], "center"), s("barrel", [1, 1], [1, 3], "wall"), s("sack", [1, 1], [1, 3], "wall"), s("shelf", [2, 1], [1, 2], "wall")], finds: "supplies", situation: "The cook fights with a cleaver and a pot of boiling water (DC 12 Dex save, 2d6 fire, once)." },
  storeroom: { name: "Storeroom", text: ["Crates and barrels are stacked to the ceiling, some of them stolen goods with the merchant's stamp still on them.", "Sacks of grain, kegs and a mess of crates marked with three different guilds' seals."], furniture: [s("crate", [1, 1], { per: 4, max: 10 }, "wall"), s("barrel", [1, 1], { per: 8, max: 5 }, "wall"), s("sack", [1, 1], { per: 8, max: 5 }, "anywhere")], finds: "supplies" },
  armory: { name: "Armory", text: ["Racks of spears and swords line the walls, and a whetstone sits beside a half-sharpened axe."], furniture: [s("weaponRack", [2, 1], [2, 4], "wall"), s("chest", [1, 1], [1, 2], "wall"), s("table", [2, 1], [0, 1], "center")], finds: "weapons", situation: "They're arming up: they all have shields and the best weapons in the room." },
  guardpost: { name: "Guard post", text: ["A table with dice and a few copper coins, stools pushed back in a hurry."], furniture: [s("table", [1, 1], [1, 1], "center", "chair"), s("weaponRack", [2, 1], [0, 1], "wall"), s("barrel", [1, 1], [0, 1], "corner")], situation: "Bored guards playing dice: disadvantage on Perception checks to notice the party." },
  prison: { name: "Holding cells", text: ["Iron cages and chains bolted to the wall. One cage isn't empty.", "Shackles hang from the walls; tally marks cover the stone beside them."], furniture: [s("cage", [2, 2], [1, 3], "wall"), s("chains", [1, 1], [1, 3], "wall"), s("bones", [1, 1], [0, 1], "corner")], situation: "A prisoner calls out to the party, which might wake the guards (or might be a trick)." },
  quarters: { name: "Leader's quarters", text: ["A real bed, a good rug and a desk covered in maps and letters: someone here is in charge."], furniture: [s("bed", [2, 2], [1, 1], "wall"), s("rug", [3, 2], [1, 1], "center"), s("desk", [2, 1], [1, 1], "wall"), s("chair", [1, 1], [1, 1], "anywhere"), s("chest", [1, 1], [1, 2], "wall"), s("bookcase", [3, 1], [0, 1], "wall")], finds: "coins" },
  warroom: { name: "War room", text: ["A big table is covered with a map pinned down by daggers; little carved figures mark troop movements."], furniture: [s("table", [3, 2], [1, 1], "center", "chair"), s("bookcase", [3, 1], [0, 2], "wall"), s("weaponRack", [2, 1], [0, 1], "wall")], finds: "books" },
  hall: { name: "Great hall", text: ["Pillars hold up a high ceiling; a throne sits at the far end on a worn rug."], furniture: [s("throne", [1, 2], [1, 1], "wall"), s("rug", [3, 2], [1, 1], "center"), s("pillar", [1, 1], [2, 4], "corner"), s("table", [3, 1], [0, 2], "anywhere", "bench")], finds: "coins" },
  // Crypts
  vault: { name: "Burial vault", text: ["Stone sarcophagi stand in rows, their lids carved with the faces of the dead.", "Niches in the walls hold coffins stacked three high."], furniture: [s("sarcophagus", [1, 2], { per: 6, max: 6 }, "wall"), s("candles", [1, 1], [0, 2], "corner")], situation: "They rise from the coffins as the party enters the middle of the room." },
  ossuary: { name: "Ossuary", text: ["Skulls and long bones are stacked in patterns up every wall; the floor crunches."], furniture: [s("bones", [1, 1], { per: 4, max: 10 }, "wall"), s("skeleton", [1, 2], [1, 3], "anywhere")] },
  chapel: { name: "Funerary chapel", text: ["Pews face an altar draped in rotten black cloth; the candles are fresh."], furniture: [s("altar", [2, 1], [1, 1], "wall"), s("pew", [3, 1], { per: 8, max: 6 }, "rows"), s("candles", [1, 1], [1, 2], "corner")], finds: "potions" },
  embalming: { name: "Embalming room", text: ["A stone slab with channels for the blood, shelves of jars and a smell that never leaves."], furniture: [s("table", [2, 1], [1, 1], "center"), s("shelf", [2, 1], [1, 3], "wall"), s("cauldron", [1, 1], [0, 1], "corner"), s("glassware", [1, 1], [1, 3], "wall")], finds: "potions" },
  catacomb: { name: "Catacomb", text: ["Coffins in every niche, some of them open, some of them open from the inside."], furniture: [s("coffin", [1, 2], { per: 5, max: 8 }, "wall"), s("bones", [1, 1], [1, 3], "anywhere")] },
  tomb: { name: "Tomb of the founder", text: ["A great sarcophagus under four pillars, its lid carved with a warning nobody heeded."], furniture: [s("sarcophagus", [1, 2], [1, 1], "center"), s("pillar", [1, 1], [4, 4], "corner"), s("altar", [2, 1], [0, 1], "wall"), s("candles", [1, 1], [1, 2], "anywhere")], finds: "coins" },
  // Mines
  gallery: { name: "Worked gallery", text: ["Timber props hold up the ceiling; picks lie where they were dropped.", "A seam of ore glints along the wall, half dug out."], furniture: [s("support", [2, 1], [2, 4], "wall"), s("mineCart", [1, 1], [0, 1], "anywhere"), s("rubble", [1, 1], [1, 3], "corner")] },
  depot: { name: "Cart depot", text: ["Mine carts, some full of ore, wait by a ramp; a broken one lies on its side."], furniture: [s("mineCart", [1, 1], [2, 4], "anywhere"), s("crate", [1, 1], [1, 3], "wall"), s("barrel", [1, 1], [0, 2], "corner")], finds: "supplies" },
  smithy: { name: "Smelting room", text: ["A forge still glows; ingots cool beside an anvil.", "The heat hits like a wall: a furnace, bellows and a quench barrel."], furniture: [s("forge", [2, 2], [1, 1], "wall"), s("anvil", [1, 1], [1, 2], "anywhere"), s("barrel", [1, 1], [1, 2], "corner"), s("crate", [1, 1], [1, 2], "wall")], finds: "metal", situation: "The smith fights with a red-hot iron: +1d6 fire damage on their first hit." },
  bunkroom: { name: "Miners' bunkroom", text: ["Narrow beds, muddy boots and a table with a guttering lamp."], furniture: [s("bed", [1, 2], { per: 6, max: 6 }, "wall"), s("table", [1, 1], [1, 1], "center", "chair")] },
  toolstore: { name: "Tool store", text: ["Shelves of picks, shovels, rope and lamp oil."], furniture: [s("shelf", [2, 1], [2, 3], "wall"), s("crate", [1, 1], [1, 3], "wall"), s("barrel", [1, 1], [0, 2], "corner")], finds: "gear" },
  collapsed: { name: "Collapsed tunnel", text: ["Half the ceiling has come down; something has been digging through the rubble from the other side."], furniture: [s("rubble", [1, 1], { per: 3, max: 10 }, "anywhere"), s("support", [2, 1], [0, 2], "wall")] },
  deepvein: { name: "The deep vein", text: ["The richest seam in the mine, and the reason everyone down here died."], furniture: [s("support", [2, 1], [2, 3], "wall"), s("mineCart", [1, 1], [1, 2], "anywhere"), s("chest", [1, 1], [1, 1], "wall"), s("rubble", [1, 1], [1, 3], "corner")], finds: "metal" },
  // Temples
  nave: { name: "Nave", text: ["Rows of pews face an altar under a cracked stained-glass window.", "Pillars march toward an altar; the pews are full of dust and old offerings."], furniture: [s("altar", [2, 1], [1, 1], "wall"), s("pew", [3, 1], { per: 7, max: 8 }, "rows"), s("pillar", [1, 1], [0, 4], "corner"), s("candles", [1, 1], [1, 2], "anywhere")], situation: "They're at prayer: the first round of combat, they're still kneeling (prone)." },
  vestry: { name: "Vestry", text: ["Robes hang in a cupboard; a chest holds censers and holy water."], furniture: [s("cupboard", [2, 1], [1, 2], "wall"), s("chest", [1, 1], [1, 1], "wall"), s("table", [2, 1], [0, 1], "center")], finds: "potions" },
  library: { name: "Library", text: ["Bookcases floor to ceiling, a reading desk and a lamp burned down to the brass.", "Books everywhere: shelved, stacked, open, one of them still warm."], furniture: [s("bookcase", [3, 1], { per: 5, max: 8 }, "wall"), s("desk", [2, 1], [1, 2], "center"), s("chair", [1, 1], [1, 2], "anywhere"), s("bookstand", [1, 1], [0, 2], "anywhere"), s("rug", [3, 2], [0, 1], "center")], finds: "books" },
  cells: { name: "Monks' cells", text: ["Bare cots, a prayer stool and a single candle each."], furniture: [s("bed", [1, 2], { per: 6, max: 6 }, "wall"), s("candles", [1, 1], [1, 3], "corner")] },
  reliquary: { name: "Reliquary", text: ["A saint's relics in a gilded case on an altar, flanked by pillars."], furniture: [s("altar", [2, 1], [1, 1], "wall"), s("pillar", [1, 1], [2, 4], "corner"), s("chest", [1, 1], [1, 2], "wall"), s("candles", [1, 1], [1, 3], "anywhere")], finds: "coins" },
  ritual: { name: "Ritual chamber", text: ["A circle is daubed on the floor around a black altar; the candles burn with no smoke."], furniture: [s("altar", [2, 1], [1, 1], "center"), s("candles", [1, 1], [3, 5], "anywhere"), s("bones", [1, 1], [1, 3], "corner"), s("rug", [3, 3], [0, 1], "center")], finds: "potions", situation: "The ritual is underway: if it isn't stopped in 3 rounds, something answers it." },
  // Wizards
  lab: { name: "Laboratory", text: ["Alembics bubble over burners; one jar on the shelf is looking at the party.", "A workbench crowded with glassware, half-written notes and a scorched patch of floor."], furniture: [s("table", [2, 1], [1, 2], "center"), s("glassware", [1, 1], [2, 5], "anywhere"), s("cauldron", [1, 1], [0, 1], "corner"), s("shelf", [2, 1], [1, 3], "wall"), s("bookstand", [1, 1], [0, 1], "anywhere")], finds: "potions" },
  summoning: { name: "Summoning circle", text: ["A silver-inlaid circle covers the floor; the air hums, and one candle burns blue."], furniture: [s("rug", [3, 3], [1, 1], "center"), s("candles", [1, 1], [4, 4], "corner"), s("bookstand", [1, 1], [1, 1], "wall")], situation: "Something bound in the circle is waiting for anyone to break it." },
  menagerie: { name: "Menagerie", text: ["Cages of strange creatures, most of them empty, one of them recently."], furniture: [s("cage", [2, 2], [2, 4], "wall"), s("hay", [2, 2], [1, 2], "anywhere"), s("sack", [1, 1], [1, 2], "corner")] },
  study: { name: "Study", text: ["A writing desk, a comfortable chair and a fire long gone out."], furniture: [s("desk", [2, 1], [1, 1], "center"), s("chair", [1, 1], [1, 1], "anywhere"), s("bookcase", [3, 1], [1, 3], "wall"), s("rug", [3, 2], [1, 1], "center")], finds: "books" },
  sanctum: { name: "Sanctum", text: ["The heart of the tower: a lectern holds a spellbook, and the walls are warded with burning sigils."], furniture: [s("rug", [3, 3], [1, 1], "center"), s("bookstand", [1, 1], [1, 2], "anywhere"), s("chest", [1, 1], [1, 2], "wall"), s("bookcase", [3, 1], [1, 2], "wall"), s("desk", [2, 1], [0, 1], "wall")], finds: "books" },
  // Caves
  den: { name: "Den", text: ["Matted fur, gnawed bones and a heavy animal smell."], furniture: [s("hay", [2, 2], [1, 2], "anywhere"), s("bones", [1, 1], [2, 5], "anywhere")], situation: "The beasts are asleep in a heap: Stealth vs passive Perception to get the first strike." },
  nest: { name: "Nest", text: ["A huge nest of branches, bones and stolen cloth."], furniture: [s("hay", [2, 2], [1, 2], "center"), s("bones", [1, 1], [1, 4], "anywhere"), s("sack", [1, 1], [0, 2], "anywhere")] },
  larder: { name: "Larder", text: ["Carcasses hang from hooks; some of them were people."], furniture: [s("chains", [1, 1], [2, 4], "wall"), s("bones", [1, 1], [2, 5], "anywhere"), s("skeleton", [1, 2], [0, 2], "anywhere")] },
  grove: { name: "Fungus grove", text: ["Mushrooms the size of chairs, glowing faintly; the spores make eyes water."], furniture: [s("mushrooms", [1, 1], { per: 3, max: 12 }, "anywhere")] },
  camp: { name: "Cave camp", text: ["Bedrolls around a cold fire pit, crates of supplies and a lookout's stool."], furniture: [s("bedroll", [1, 2], [2, 4], "wall"), s("campfire", [1, 1], [1, 1], "center"), s("crate", [1, 1], [1, 3], "wall"), s("sack", [1, 1], [1, 2], "anywhere")], finds: "supplies", situation: "Around the fire, night-blind from it: they can't see past its light on the first round." },
  hoardcave: { name: "Den of the beast", text: ["Bones everywhere, and among them, the glint of things the beast's victims carried."], furniture: [s("bones", [1, 1], { per: 3, max: 12 }, "anywhere"), s("skeleton", [1, 2], [1, 3], "anywhere"), s("chest", [1, 1], [0, 1], "wall")], finds: "coins" },
  // Anywhere
  stash: { name: "Secret stash", text: ["Chests and strongboxes hidden away from even the dungeon's own residents."], furniture: [s("chest", [1, 1], [2, 4], "wall"), s("crate", [1, 1], [0, 2], "corner")], finds: "coins" },
  entry: { name: "Entry hall", text: ["The way in: the floor is worn smooth by boots, and the walls are scratched with warnings."], furniture: [s("barrel", [1, 1], [0, 2], "corner"), s("crate", [1, 1], [0, 2], "wall")] },
};

/** Theme: [purpose, weight] for ordinary rooms, the lair's purpose, the entrance's. */
export const DUNGEON_THEMES: Record<DungeonTheme, { label: string; rooms: [string, number][]; lair: string[]; entrance: string }> = {
  hideout: { label: "Bandit hideout", rooms: [["barracks", 3], ["mess", 2], ["storeroom", 3], ["armory", 2], ["guardpost", 2], ["prison", 1], ["kitchen", 1]], lair: ["quarters"], entrance: "guardpost" },
  fortress: { label: "Fortress", rooms: [["bunks", 3], ["armory", 2], ["mess", 2], ["kitchen", 2], ["warroom", 1], ["prison", 1], ["storeroom", 2], ["guardpost", 2]], lair: ["hall", "quarters"], entrance: "guardpost" },
  crypt: { label: "Crypt", rooms: [["vault", 3], ["ossuary", 2], ["chapel", 1], ["embalming", 1], ["catacomb", 3]], lair: ["tomb"], entrance: "entry" },
  mine: { label: "Mine", rooms: [["gallery", 4], ["depot", 2], ["smithy", 1], ["bunkroom", 1], ["toolstore", 2], ["collapsed", 2]], lair: ["deepvein"], entrance: "depot" },
  temple: { label: "Temple", rooms: [["nave", 1], ["vestry", 2], ["library", 1], ["cells", 3], ["reliquary", 1], ["kitchen", 1], ["storeroom", 1]], lair: ["ritual"], entrance: "entry" },
  wizard: { label: "Wizard's tower", rooms: [["lab", 3], ["library", 2], ["study", 2], ["menagerie", 1], ["summoning", 1], ["storeroom", 1]], lair: ["sanctum"], entrance: "entry" },
  cavern: { label: "Natural caverns", rooms: [["den", 3], ["nest", 2], ["larder", 1], ["grove", 2], ["camp", 1]], lair: ["hoardcave"], entrance: "entry" },
};

/** A theme to fit the monsters (and the map). */
export function guessTheme(map: DungeonMap, keys: readonly RoomKey[], tags = "", partyLevel = 3): DungeonTheme {
  const t = tags.toLowerCase();
  if (/kobold|dwarf|duergar|miner|earth/.test(t)) return "mine";
  if (/goblin|bandit|thug|orc|gnoll|hobgoblin|bugbear/.test(t)) return map.style === "cave" ? "cavern" : "hideout";
  const types = new Map<string, number>();
  for (const k of keys) for (const g of k.encounter?.groups ?? []) types.set(g.monster.type, (types.get(g.monster.type) ?? 0) + g.count);
  const top = [...types].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (map.style === "cave") return top === "humanoid" ? "hideout" : "cavern";
  if (top === "undead") return "crypt";
  if (top === "construct" || top === "aberration" || top === "elemental") return "wizard";
  if (top === "fiend" || top === "celestial") return "temple";
  if (top === "humanoid" || top === "giant") return partyLevel >= 7 ? "fortress" : "hideout";
  if (top === "beast" || top === "monstrosity" || top === "ooze" || top === "plant") return "mine";
  return createRng(map.seed).pick(["hideout", "crypt", "temple", "fortress", "wizard"] as const);
}

// --- Placement ---------------------------------------------------------------------------

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

interface Space {
  room: Room;
  inside: Set<string>;
  taken: Set<string>;
  floor: (x: number, y: number) => boolean;
}

const rectCells = (x: number, y: number, w: number, h: number) => {
  const out: [number, number][] = [];
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) out.push([cx, cy]);
  return out;
};

function fits(sp: Space, x: number, y: number, w: number, h: number) {
  return rectCells(x, y, w, h).every(([cx, cy]) => sp.inside.has(`${cx},${cy}`) && !sp.taken.has(`${cx},${cy}`));
}

function take(sp: Space, f: Furnishing) {
  for (const [x, y] of rectCells(f.x, f.y, f.w, f.h)) sp.taken.add(`${x},${y}`);
}

/** Which wall a rectangle's long side backs onto, if any. */
function wallSide(sp: Space, x: number, y: number, w: number, h: number): Furnishing["facing"] | null {
  const all = (cells: [number, number][]) => cells.every(([cx, cy]) => !sp.floor(cx, cy));
  if (w >= h) {
    if (all(rectCells(x, y - 1, w, 1))) return "n";
    if (all(rectCells(x, y + h, w, 1))) return "s";
  }
  if (h >= w) {
    if (all(rectCells(x - 1, y, 1, h))) return "w";
    if (all(rectCells(x + w, y, 1, h))) return "e";
  }
  return null;
}

function placeOne(rng: Rng, sp: Space, spec: Spec): Furnishing | null {
  const [along, depth] = spec.size;
  const shapes: [number, number][] = along === depth ? [[along, depth]] : [[along, depth], [depth, along]];
  const { room } = sp;
  const [rcx, rcy] = roomCenter(room);
  const options: { f: Furnishing; score: number }[] = [];
  for (const [w, h] of shapes) {
    for (let y = room.y - 1; y < room.y + room.h + 1; y++) {
      for (let x = room.x - 1; x < room.x + room.w + 1; x++) {
        if (!fits(sp, x, y, w, h)) continue;
        const side = wallSide(sp, x, y, w, h);
        const corner = side && ((side === "n" || side === "s") ? !sp.floor(x - 1, y) || !sp.floor(x + w, y) : !sp.floor(x, y - 1) || !sp.floor(x, y + h));
        const dist = Math.hypot(x + w / 2 - (rcx + 0.5), y + h / 2 - (rcy + 0.5));
        const facing = side ?? (w >= h ? rng.pick(["n", "s"] as const) : rng.pick(["e", "w"] as const));
        let score: number;
        if (spec.place === "wall") {
          if (!side) continue;
          score = rng.next();
        } else if (spec.place === "corner") {
          if (!corner) continue;
          score = rng.next();
        } else if (spec.place === "center") {
          if (side) continue;
          score = dist + rng.next() * 0.5;
        } else score = rng.next();
        options.push({ f: { kind: spec.kind, x, y, w, h, facing }, score });
      }
    }
  }
  if (!options.length) return null;
  options.sort((a, b) => a.score - b.score);
  const f = options[0]!.f;
  take(sp, f);
  return f;
}

/** Rows across the room (pews), split by a center aisle, facing the far wall. */
function placeRows(rng: Rng, sp: Space, spec: Spec, max: number): Furnishing[] {
  const { room } = sp;
  const out: Furnishing[] = [];
  const [cx] = roomCenter(room);
  for (let y = room.y + room.h - 2; y > room.y + 1 && out.length < max; y -= 2) {
    for (const [x0, x1] of [[room.x + 1, cx - 1], [cx + 1, room.x + room.w - 2]] as const) {
      const len = Math.min(spec.size[0], x1 - x0 + 1);
      if (len < 2 || out.length >= max) continue;
      const x = rng.chance(0.5) ? x0 : x1 - len + 1;
      if (!fits(sp, x, y, len, 1)) continue;
      const f: Furnishing = { kind: spec.kind, x, y, w: len, h: 1, facing: "s" };
      take(sp, f);
      out.push(f);
    }
  }
  return out;
}

/** Chairs (or benches) around a table. */
function seatAround(rng: Rng, sp: Space, t: Furnishing, kind: FurnitureKind): Furnishing[] {
  const out: Furnishing[] = [];
  if (kind === "bench") {
    for (const [y, facing] of [[t.y - 1, "s"], [t.y + t.h, "n"]] as const) {
      if (t.w >= 2 && fits(sp, t.x, y, t.w, 1)) {
        const f: Furnishing = { kind, x: t.x, y, w: t.w, h: 1, facing };
        take(sp, f);
        out.push(f);
      }
    }
    return out;
  }
  const seats: [number, number, Furnishing["facing"]][] = [];
  for (let x = t.x; x < t.x + t.w; x++) seats.push([x, t.y - 1, "n"], [x, t.y + t.h, "s"]);
  for (let y = t.y; y < t.y + t.h; y++) seats.push([t.x - 1, y, "w"], [t.x + t.w, y, "e"]);
  for (const [x, y, facing] of rng.shuffle(seats).slice(0, Math.max(2, Math.ceil(seats.length * 0.7)))) {
    if (!fits(sp, x, y, 1, 1)) continue;
    const f: Furnishing = { kind, x, y, w: 1, h: 1, facing };
    take(sp, f);
    out.push(f);
  }
  return out;
}

export interface FurnishOptions {
  theme?: DungeonTheme | "auto";
  partyLevel?: number;
  tags?: string;
  /** Put the room's finds in a loot pile (else into its treasure). */
  lootPiles?: boolean;
  seed?: string | number;
}

/**
 * Give every room a purpose and furniture to match. Returns new keys (with purpose, furniture,
 * a matching description and finds) and the theme used.
 */
export function furnishDungeon(map: DungeonMap, keys: readonly RoomKey[], o: FurnishOptions = {}): { keys: RoomKey[]; theme: DungeonTheme } {
  const rng = createRng(o.seed ?? `${map.seed}:furnish`);
  const theme = !o.theme || o.theme === "auto" ? guessTheme(map, keys, o.tags, o.partyLevel) : o.theme;
  const T = DUNGEON_THEMES[theme];
  const out: RoomKey[] = structuredClone([...keys]) as RoomKey[];
  const floor = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;
  // Keep doorways, trap triggers, loot piles and the label spot clear.
  const keep = new Set<string>();
  for (const w of map.walls) {
    if (!w.door) continue;
    const cells = w.y1 === w.y2 ? [[w.x1, w.y1 - 1], [w.x1, w.y1]] : [[w.x1 - 1, w.y1], [w.x1, w.y1]];
    for (const [x, y] of cells) keep.add(`${x},${y}`);
  }
  // Openings into a room (corridor squares next to it) stay clear too.
  for (const room of map.rooms) {
    const inside = new Set(roomCells(room).map(([x, y]) => `${x},${y}`));
    for (const [x, y] of roomCells(room)) for (const [dx, dy] of N4) if (floor(x + dx, y + dy) && !inside.has(`${x + dx},${y + dy}`)) keep.add(`${x},${y}`);
  }
  const used = new Map<string, number>();
  for (const key of out) {
    const room = map.rooms.find((r) => r.id === key.roomId);
    if (!room) continue;
    for (const [x, y] of key.trapCells ?? []) keep.add(`${x},${y}`);
    for (const p of key.piles ?? []) keep.add(`${p.cell[0]},${p.cell[1]}`);
    const [cx, cy] = roomCenter(room);
    const lair = /Lair/.test(key.title);
    const id = key.hidden ? "stash" : lair ? rng.pick(T.lair) : room.id === 1 ? T.entrance
      // Less of what's already been used, so rooms vary.
      : rng.weighted(T.rooms.map(([p, w]) => [p, w / (1 + (used.get(p) ?? 0) * 1.5)] as [string, number]));
    used.set(id, (used.get(id) ?? 0) + 1);
    const purpose = PURPOSES[id]!;
    const sp: Space = { room, inside: new Set(roomCells(room).map(([x, y]) => `${x},${y}`)), taken: new Set([...keep, `${cx},${cy}`]), floor };
    const area = roomCells(room).length;
    const furniture: Furnishing[] = [];
    for (const spec of purpose.furniture) {
      const n = Array.isArray(spec.count) ? rng.int(spec.count[0], spec.count[1]) : Math.min(spec.count.max, Math.max(1, Math.floor(area / spec.count.per)));
      if (spec.place === "rows") {
        furniture.push(...placeRows(rng, sp, spec, n));
        continue;
      }
      for (let i = 0; i < n; i++) {
        const f = placeOne(rng, sp, spec);
        if (!f) break;
        furniture.push(f);
        if (spec.around) furniture.push(...seatAround(rng, sp, f, spec.around));
      }
    }
    key.purpose = purpose.name;
    key.furniture = furniture;
    const base = lair ? `${key.title.split(" — ")[0]} — Lair` : key.title.split(" — ")[0]!;
    key.title = `${base}${key.hidden ? " — Hidden" : ""} — ${purpose.name}`;
    key.description = `${rng.pick(purpose.text)} ${key.description}`;
    if (key.encounter && purpose.situation && rng.chance(0.7)) key.encounter = { ...key.encounter, situation: purpose.situation };
    if (purpose.finds) {
      const items = themedItems(purpose.finds, o.partyLevel ?? 3, `${rng.seed}:${room.id}:finds`);
      if (items.length) {
        const spot = furniture.find((f) => ["chest", "shelf", "weaponRack", "bookcase", "desk", "table", "crate", "cupboard"].includes(f.kind));
        const where = spot ? `On and around the ${spot.kind.replace(/([A-Z])/g, " $1").toLowerCase()}` : "Lying about the room";
        if (o.lootPiles) {
          const cell: [number, number] = spot ? [spot.x, spot.y] : [cx, cy];
          const pile: LootPile = { cell, note: `${where}: what a ${purpose.name.toLowerCase()} would hold.`, dc: 0, loot: emptyLoot(`${rng.seed}:${room.id}`) };
          pile.loot.items.push(...items);
          pile.loot.totalValueGp = items.reduce((n, i) => n + i.valueGp * i.quantity, 0);
          (key.piles ??= []).push(pile);
        } else {
          key.loot ??= emptyLoot(`${rng.seed}:${room.id}`);
          key.loot.items.push(...items);
          key.loot.totalValueGp += items.reduce((n, i) => n + i.valueGp * i.quantity, 0);
        }
      }
    }
  }
  return { keys: out, theme };
}

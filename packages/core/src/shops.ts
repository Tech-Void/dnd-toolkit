import { createRng, type Rng } from "./rng.ts";
import { FIRST_NAMES } from "./data/names.ts";
import { generateHook } from "./hooks.ts";
import { EQUIPMENT_ROWS } from "./data/equipment.ts";
import { MAGIC_ITEMS, RARITY_VALUE_GP, type Rarity } from "./data/treasure.ts";

export type ItemCategory =
  | "weapon-melee" | "weapon-ranged" | "ammo"
  | "armor-light" | "armor-medium" | "armor-heavy" | "shield"
  | "potion" | "poison" | "scroll" | "wand-rod" | "ring" | "wondrous"
  | "gear" | "container" | "food" | "clothing" | "tool" | "instrument" | "gaming" | "gem" | "other";

/** Something a shop can sell. Mundane items have no rarity. */
export interface ShopItemRef {
  name: string;
  category: ItemCategory;
  priceGp: number;
  rarity?: Rarity;
  uuid?: string;
  /** Variant family ("armor of resistance"), so variants don't crowd a magic shop. */
  base?: string;
}

export type ShopType = "general" | "blacksmith" | "armorer" | "weaponsmith" | "fletcher" | "alchemist" | "jeweler" | "magic";
export type Settlement = "hamlet" | "village" | "town" | "city" | "metropolis";

interface ShopTypeDef {
  label: string;
  /** Mundane categories stocked. */
  mundane: ItemCategory[];
  /** Magic item categories stocked. */
  magic: ItemCategory[];
  /** Distinct mundane items in a town. */
  size: number;
  /** Magic slot multiplier relative to the settlement's base. */
  magicFactor: number;
  /** Highest rarity this kind of shop ever carries, whatever the settlement. */
  maxRarity?: Rarity;
  /** Items to stock whenever one matches (by name). */
  staples?: RegExp[];
  nouns: string[];
  goods: string;
}

export const SHOP_TYPES: Record<ShopType, ShopTypeDef> = {
  general: {
    label: "General store",
    mundane: ["gear", "container", "food", "clothing", "tool"],
    magic: ["potion"],
    size: 20,
    magicFactor: 0.5,
    maxRarity: "uncommon",
    staples: [/ration/i, /rope/i, /torch/i, /waterskin/i, /bedroll/i, /backpack/i, /tinderbox/i, /lantern/i],
    nouns: ["Lantern", "Wagon", "Barrel", "Satchel", "Crossroads", "Larder"],
    goods: "Goods & Sundries",
  },
  blacksmith: {
    label: "Blacksmith",
    mundane: ["weapon-melee", "armor-medium", "armor-heavy", "shield"],
    magic: ["weapon-melee", "armor-medium", "armor-heavy", "shield"],
    size: 14,
    magicFactor: 0.5,
    staples: [/^longsword$/i, /^shield$/i, /^chain mail$/i],
    nouns: ["Anvil", "Hammer", "Forge", "Tongs", "Bellows", "Ember"],
    goods: "Smithy",
  },
  armorer: {
    label: "Armorer",
    mundane: ["armor-light", "armor-medium", "armor-heavy", "shield"],
    magic: ["armor-light", "armor-medium", "armor-heavy", "shield"],
    size: 10,
    magicFactor: 0.6,
    nouns: ["Shield", "Bulwark", "Helm", "Gauntlet", "Rampart"],
    goods: "Armory",
  },
  weaponsmith: {
    label: "Weaponsmith",
    mundane: ["weapon-melee", "weapon-ranged", "ammo"],
    magic: ["weapon-melee", "weapon-ranged", "ammo"],
    size: 16,
    magicFactor: 0.6,
    nouns: ["Blade", "Edge", "Spear", "Whetstone", "Crossed Swords"],
    goods: "Arms",
  },
  fletcher: {
    label: "Bowyer & fletcher",
    mundane: ["weapon-ranged", "ammo"],
    magic: ["weapon-ranged", "ammo"],
    size: 8,
    magicFactor: 0.5,
    staples: [/^arrows?/i, /bolts?/i],
    nouns: ["Quiver", "Arrow", "Yew", "Fletching", "Bowstring"],
    goods: "Bows & Arrows",
  },
  alchemist: {
    label: "Alchemist",
    mundane: ["potion", "poison"],
    magic: ["potion", "scroll"],
    size: 8,
    magicFactor: 1.5,
    staples: [/healing/i, /antitoxin/i, /alchemist's fire/i],
    nouns: ["Alembic", "Cauldron", "Vial", "Mortar", "Green Flame"],
    goods: "Tinctures",
  },
  jeweler: {
    label: "Jeweler",
    mundane: ["gem"],
    magic: ["ring"],
    size: 10,
    magicFactor: 0.5,
    nouns: ["Gem", "Facet", "Locket", "Signet", "Prism"],
    goods: "Jewels",
  },
  magic: {
    label: "Magic shop",
    mundane: [],
    magic: ["potion", "scroll", "wand-rod", "ring", "wondrous", "weapon-melee", "weapon-ranged", "armor-light", "armor-medium", "armor-heavy", "shield", "ammo"],
    size: 0,
    magicFactor: 3,
    nouns: ["Arcanum", "Star", "Eye", "Curio", "Wyrm", "Lantern"],
    goods: "Curiosities",
  },
};

interface SettlementDef {
  label: string;
  stock: number;
  maxRarity: Rarity;
  /** Base number of magic items, before the shop type's factor. */
  magic: [number, number];
}

export const SETTLEMENTS: Record<Settlement, SettlementDef> = {
  hamlet: { label: "Hamlet", stock: 0.5, maxRarity: "common", magic: [0, 1] },
  village: { label: "Village", stock: 0.7, maxRarity: "uncommon", magic: [0, 2] },
  town: { label: "Town", stock: 1, maxRarity: "rare", magic: [1, 3] },
  city: { label: "City", stock: 1.3, maxRarity: "very rare", magic: [2, 4] },
  metropolis: { label: "Metropolis", stock: 1.6, maxRarity: "legendary", magic: [3, 6] },
};

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "very rare", "legendary"];
const RARITY_WEIGHT: Record<Rarity, number> = { common: 40, uncommon: 35, rare: 18, "very rare": 6, legendary: 1 };

// ---------------------------------------------------------------------------
// Built-in stock (used when no compendium items are supplied)

function guessMagicCategory(name: string): ItemCategory {
  if (/^potion/i.test(name)) return "potion";
  if (/^spell scroll/i.test(name)) return "scroll";
  if (/^weapon\b|sword|tongue|avenger/i.test(name)) return "weapon-melee";
  if (/^armor\b/i.test(name)) return "armor-heavy";
  if (/^ring\b/i.test(name)) return "ring";
  if (/^(wand|staff|rod)\b/i.test(name)) return "wand-rod";
  return "wondrous";
}

export const BUILTIN_SHOP_ITEMS: ShopItemRef[] = [
  ...EQUIPMENT_ROWS.trim().split("\n").map((line) => {
    const [name, category, price] = line.split("|") as [string, ItemCategory, string];
    return { name, category, priceGp: Number(price) };
  }),
  ...(Object.entries(MAGIC_ITEMS) as [Rarity, readonly string[]][]).flatMap(([rarity, names]) =>
    names.map((name) => ({ name, category: guessMagicCategory(name), priceGp: RARITY_VALUE_GP[rarity], rarity }))),
];

// ---------------------------------------------------------------------------
// Shopkeepers

const KEEPER_RACE_WEIGHTS: Partial<Record<ShopType, Partial<Record<string, number>>>> = {
  blacksmith: { dwarf: 30 },
  armorer: { dwarf: 30 },
  weaponsmith: { dwarf: 20, "half-orc": 10 },
  fletcher: { elf: 25, halfling: 10 },
  alchemist: { gnome: 25, tiefling: 10 },
  jeweler: { dwarf: 20, gnome: 15 },
  magic: { elf: 20, gnome: 15, tiefling: 15 },
};

const PERSONALITIES = [
  "gruff but scrupulously fair",
  "relentlessly cheerful and chatty",
  "suspicious of anyone carrying a weapon",
  "a born haggler who treats every sale as a contest",
  "distracted, always halfway through some other task",
  "warm and grandmotherly, presses snacks on customers",
  "nervous, glancing at the door whenever it opens",
  "proud of the wares to the point of arrogance",
  "world-weary former adventurer with stories for every item",
  "meticulous, writes every sale in a ledger",
  "flirtatious and theatrical",
  "pious; blesses each purchase",
];

const QUIRKS = [
  "keeps a one-eyed cat on the counter",
  "refuses to sell to anyone who won't give their name",
  "quotes prices in an obscure foreign currency first",
  "hums tavern songs constantly",
  "has a parrot that repeats the last price spoken",
  "won't open the back room without a password",
  "collects odd buttons and gives discounts for good ones",
  "insists on a handshake to seal every deal",
  "is visibly saving up to leave town",
  "owes money to a local gang",
  "has a sibling running the rival shop across the street",
  "keeps a cursed item on a high shelf, 'not for sale'",
];

const NAME_ADJECTIVES = ["Gilded", "Rusty", "Honest", "Crooked", "Silver", "Copper", "Laughing", "Sleeping", "Iron", "Red", "Wandering", "Lucky", "Old", "Hidden",
  "Brass",
  "Blue",
  "Merry",
  "Thrifty",
  "Black",
  "Golden",
  "Prancing",
  "Wise",
  "Humble",
  "Twisted",
  "Patient",
  "Brave",
  "Sly",
  "Busy",
  "Quiet",
  "Royal",
];

export interface ShopStockEntry {
  item: ShopItemRef;
  quantity: number;
  /** Asking price per unit, after the shop's markup. */
  priceGp: number;
}

export interface ShopKeeper {
  name: string;
  race: string;
  personality: string;
  quirk: string;
}

export interface Shop {
  seed: string;
  name: string;
  type: ShopType;
  settlement: Settlement;
  keeper: ShopKeeper;
  /** Markup on base prices, e.g. 1.15. */
  priceModifier: number;
  /** Fraction of base price the shop pays when buying from players. */
  sellModifier: number;
  haggleDc: number;
  rumor: string;
  stock: ShopStockEntry[];
}

export interface ShopOptions {
  type: ShopType;
  settlement?: Settlement;
  /** Items to choose from; defaults to the built-in list. */
  items?: readonly ShopItemRef[];
  seed?: string | number;
}

/** Quantity on the shelf for one stocked item. */
function quantityFor(rng: Rng, item: ShopItemRef, settlement: SettlementDef): number {
  if (item.rarity) return item.category === "potion" || item.category === "scroll" || item.category === "ammo" ? rng.int(1, 3) : 1;
  const scale = (n: number) => Math.max(1, Math.round(n * settlement.stock));
  switch (item.category) {
    case "food": return scale(rng.int(5, 20));
    case "ammo": return scale(rng.int(2, 8));
    case "gear": case "container": return scale(rng.int(1, 8));
    case "potion": case "poison": return scale(rng.int(1, 4));
    case "gem": return rng.int(1, 4);
    case "armor-heavy": case "armor-medium": return rng.int(1, 2);
    default: return scale(rng.int(1, 3));
  }
}

/** List price in gp; magic items without one get a typical price for their rarity. */
export const basePriceOf = (item: ShopItemRef) => (item.priceGp > 0 ? item.priceGp : item.rarity ? RARITY_VALUE_GP[item.rarity] : 0);

/** Round a gp price to something a merchant would actually say. */
export function roundPrice(gp: number): number {
  if (gp >= 100) return Math.round(gp / 5) * 5;
  if (gp >= 10) return Math.round(gp);
  if (gp >= 0.1) return Math.round(gp * 10) / 10;
  return Math.max(0.01, Math.round(gp * 100) / 100);
}

/** "12 gp 5 sp" style formatting. */
export function formatPrice(gp: number): string {
  const cp = Math.round(gp * 100);
  const parts: string[] = [];
  const g = Math.floor(cp / 100);
  const s = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  if (g) parts.push(`${g.toLocaleString("en-US")} gp`);
  if (s) parts.push(`${s} sp`);
  if (c) parts.push(`${c} cp`);
  return parts.join(" ") || "0 cp";
}

function pickFamily(rng: Rng, pool: ShopItemRef[]): ShopItemRef {
  const families = new Map<string, ShopItemRef[]>();
  for (const ref of pool) {
    const key = ref.base ?? ref.name;
    (families.get(key) ?? families.set(key, []).get(key)!).push(ref);
  }
  return rng.pick(rng.pick([...families.values()]));
}

export function generateShop(opts: ShopOptions): Shop {
  const rng = createRng(opts.seed);
  const def = SHOP_TYPES[opts.type];
  const settlement = opts.settlement ?? "town";
  const sdef = SETTLEMENTS[settlement];
  const items = opts.items ?? BUILTIN_SHOP_ITEMS;

  // Keeper
  const raceWeights = { human: 40, dwarf: 10, halfling: 10, elf: 10, gnome: 10, "half-orc": 6, tiefling: 6, dragonborn: 6, ...KEEPER_RACE_WEIGHTS[opts.type] };
  const race = rng.weighted(Object.entries(raceWeights) as [string, number][]);
  const keeper: ShopKeeper = { name: rng.pick(FIRST_NAMES[race]!), race, personality: rng.pick(PERSONALITIES), quirk: rng.pick(QUIRKS) };
  const name = rng.chance(0.5) ? `The ${rng.pick(NAME_ADJECTIVES)} ${rng.pick(def.nouns)}` : `${keeper.name}'s ${def.goods}`;

  // Prices: small places charge more for less; big cities compete.
  const baseMarkup = { hamlet: 1.2, village: 1.1, town: 1, city: 1, metropolis: 0.95 }[settlement];
  const priceModifier = Math.round((baseMarkup + rng.int(-10, 25) / 100) * 100) / 100;
  const sellModifier = Math.round((0.4 + rng.int(0, 20) / 100) * 100) / 100;
  const haggleDc = 10 + rng.int(0, 6) + (priceModifier >= 1.2 ? 2 : 0);

  const stock: ShopStockEntry[] = [];
  const chosen = new Set<string>();
  const add = (item: ShopItemRef) => {
    if (chosen.has(item.name)) return;
    chosen.add(item.name);
    stock.push({ item, quantity: quantityFor(rng, item, sdef), priceGp: roundPrice(basePriceOf(item) * priceModifier) });
  };

  // Mundane stock: staples first, then a random selection.
  const mundane = items.filter((i) => !i.rarity && i.priceGp > 0 && def.mundane.includes(i.category));
  for (const staple of def.staples ?? []) {
    const matches = mundane.filter((i) => staple.test(i.name));
    if (matches.length) add(rng.pick(matches));
  }
  const target = Math.round(def.size * sdef.stock);
  for (const item of rng.shuffle(mundane)) {
    if (stock.length >= target) break;
    // Small places rarely carry expensive goods.
    if (item.priceGp > 100 * sdef.stock * sdef.stock && rng.chance(0.7)) continue;
    add(item);
  }

  // Magic stock, capped by what the settlement can support.
  const maxIdx = Math.min(RARITY_ORDER.indexOf(sdef.maxRarity), RARITY_ORDER.indexOf(def.maxRarity ?? "legendary"));
  const magicPool = items.filter((i) => i.rarity && RARITY_ORDER.indexOf(i.rarity) <= maxIdx && def.magic.includes(i.category));
  const magicCount = Math.round(rng.int(sdef.magic[0], sdef.magic[1]) * def.magicFactor);
  const rarities = RARITY_ORDER.slice(0, maxIdx + 1).filter((r) => magicPool.some((i) => i.rarity === r));
  for (let i = 0; i < magicCount && rarities.length; i++) {
    const rarity = rng.weighted(rarities.map((r) => [r, RARITY_WEIGHT[r]] as const));
    add(pickFamily(rng, magicPool.filter((m) => m.rarity === rarity)));
  }

  // Mundane first, then magic; grouped by category.
  stock.sort((a, b) => Number(!!a.item.rarity) - Number(!!b.item.rarity) || a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));

  const hook = generateHook({ seed: `${rng.seed}:rumor` });
  const rumor = `Word is someone's looking for help to ${hook.goal}, out at ${hook.location}.`;

  return { seed: rng.seed, name, type: opts.type, settlement, keeper, priceModifier, sellModifier, haggleDc, rumor, stock };
}

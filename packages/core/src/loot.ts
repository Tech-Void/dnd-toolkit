import { createRng, type Rng } from "./rng.ts";
import { forgeItem, type CurseChance, type ForgedItem } from "./forge.ts";
import { ART, ARMOR_BASES, GEMS, MAGIC_ITEMS, RARITY_VALUE_GP, WEAPON_BASES, type Rarity } from "./data/treasure.ts";
import { bookItemName, lootBook, type Book } from "./books.ts";
import { materialTagFor, type MaterialTag } from "./crafting.ts";
import { CONTAINER_TRAPS, CONTAINERS, GEAR, GRAVE_GOODS, PARTS, POTIONS, SCROLL_LEVELS, SCROLL_RARITY, SCROLL_SPELLS, SCROLL_VALUE, SKILL_NAMES, TRADE_GOODS, TRINKETS } from "./data/loot-tables.ts";

export type LootMode = "individual" | "hoard";
export type Tier = 1 | 2 | 3 | 4;

export interface Coins {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export type LootKind = "gem" | "art" | "magic" | "consumable" | "trade" | "trinket" | "gear" | "part" | "key" | "book";

export interface LootItem {
  name: string;
  kind: LootKind;
  quantity: number;
  /** Value per unit in gp. */
  valueGp: number;
  rarity?: Rarity;
  /** Foundry UUID when the item came from a compendium pool. */
  uuid?: string;
  /** A one-of-a-kind item from the Forge. */
  forged?: ForgedItem;
  /** What it is, where it came from, how to use or sell it. */
  note?: string;
  /** Spell scrolls: the spell to look up and turn into a scroll. */
  spell?: { name: string; level: number };
  /** Books: what's in it (reading it is a downtime project). */
  book?: Book;
  /** Crafting material it counts as. */
  material?: MaterialTag;
  /** Harvested parts: the CR of the creature it came from (rare ingredients for magic items). */
  sourceCr?: number;
}

/** A magic item available for treasure, e.g. from the user's item compendiums. */
export interface MagicItemRef {
  name: string;
  rarity: Rarity;
  valueGp?: number;
  uuid?: string;
  /**
   * Grouping key so families of variants count once: "Armor of Resistance" covers its 13
   * armor/damage versions. Defaults to the name.
   */
  base?: string;
}

export type MagicItemPool = Partial<Record<Rarity, MagicItemRef[]>>;

/** What the treasure is kept in, and what guards it. */
export interface LootContainer {
  name: string;
  /** Thieves' tools DC, when locked. */
  lockDc?: number;
  /** A trap on it, in words. */
  trap?: string;
  /** DC to spot and disarm the trap. */
  trapDc?: number;
}

/** A creature the treasure came from: themes it and supplies harvestable parts. */
export interface LootSource {
  name: string;
  type: string;
  cr: number;
  count?: number;
}

export interface LootResult {
  seed: string;
  cr: number;
  tier: Tier;
  mode: LootMode;
  coins: Coins;
  items: LootItem[];
  totalValueGp: number;
  /** Creature type it's themed on, e.g. "undead". */
  theme?: string;
  container?: LootContainer;
  /** GM notes: why there are no coins, where the coins are from. */
  notes?: string[];
}

export interface LootOptions {
  /** Challenge rating of the encounter (individual) or the hoard's guardian/area. */
  cr: number;
  mode?: LootMode;
  /** Draw magic items from this pool instead of the built-in list (per rarity, when non-empty). */
  magicItems?: MagicItemPool;
  /** Forge unique magic items instead of picking standard ones. */
  forge?: boolean;
  /** Curse chance for forged items. */
  curse?: CurseChance;
  /** Creatures it came from: picks the theme and adds parts worth harvesting. */
  creatures?: readonly LootSource[];
  /** Creature type to theme it on (beasts carry no coin, the dead keep grave goods...). Default: from creatures, else none. */
  theme?: string;
  /** Add the extras: potions and scrolls, trade goods, trinkets, gear, parts and a container. Default true. */
  extras?: boolean;
  seed?: string | number;
}

type CoinDice = Partial<Record<keyof Coins, string>>;

const INDIVIDUAL: Record<Tier, readonly (readonly [CoinDice, number])[]> = {
  1: [[{ cp: "5d6" }, 30], [{ sp: "4d6" }, 30], [{ ep: "3d6" }, 10], [{ gp: "3d6" }, 25], [{ pp: "1d6" }, 5]],
  2: [[{ cp: "4d6*100", ep: "1d6*10" }, 30], [{ sp: "6d6*10", gp: "2d6*10" }, 30], [{ ep: "3d6*10", gp: "2d6*10" }, 10], [{ gp: "4d6*10" }, 25], [{ gp: "2d6*10", pp: "3d6" }, 5]],
  3: [[{ sp: "4d6*100", gp: "1d6*100" }, 20], [{ ep: "1d6*100", gp: "1d6*100" }, 15], [{ gp: "2d6*100", pp: "1d6*10" }, 40], [{ gp: "2d6*100", pp: "2d6*10" }, 25]],
  4: [[{ ep: "2d6*1000", gp: "8d6*100" }, 15], [{ gp: "1d6*1000", pp: "1d6*100" }, 40], [{ gp: "1d6*1000", pp: "2d6*100" }, 45]],
};

const HOARD_COINS: Record<Tier, CoinDice> = {
  1: { cp: "6d6*100", sp: "3d6*100", gp: "2d6*10" },
  2: { cp: "2d6*100", sp: "2d6*1000", gp: "6d6*100", pp: "3d6*10" },
  3: { gp: "4d6*1000", pp: "5d6*100" },
  4: { gp: "12d6*1000", pp: "8d6*1000" },
};

/** [kind, unit value, count dice] options for a hoard's valuables. */
type Valuables = readonly ["gem" | "art", number, string];
const HOARD_VALUABLES: Record<Tier, readonly (readonly [Valuables | null, number])[]> = {
  1: [[null, 25], [["gem", 10, "2d6"], 30], [["art", 25, "2d4"], 25], [["gem", 50, "2d6"], 20]],
  2: [[null, 10], [["art", 25, "2d4"], 20], [["gem", 50, "3d6"], 30], [["gem", 100, "3d6"], 25], [["art", 250, "2d4"], 15]],
  3: [[null, 5], [["art", 250, "2d4"], 25], [["art", 750, "2d4"], 25], [["gem", 500, "3d6"], 25], [["gem", 1000, "3d6"], 20]],
  4: [[null, 5], [["gem", 1000, "3d6"], 30], [["art", 2500, "1d10"], 30], [["art", 7500, "1d4"], 20], [["gem", 5000, "1d8"], 15]],
};

const HOARD_MAGIC: Record<Tier, { count: string; rarity: readonly (readonly [Rarity, number])[] }> = {
  1: { count: "1d4-1", rarity: [["common", 50], ["uncommon", 45], ["rare", 5]] },
  2: { count: "1d4", rarity: [["common", 20], ["uncommon", 50], ["rare", 25], ["very rare", 5]] },
  3: { count: "1d4+1", rarity: [["uncommon", 20], ["rare", 45], ["very rare", 30], ["legendary", 5]] },
  4: { count: "1d6+1", rarity: [["rare", 30], ["very rare", 45], ["legendary", 25]] },
};

const COIN_GP: Coins = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/** A loot result with nothing in it, to add things to by hand (a key, a single item). */
export function emptyLoot(seed: string | number = "empty"): LootResult {
  return { seed: String(seed), cr: 0, tier: 1, mode: "individual", coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, items: [], totalValueGp: 0 };
}

export function tierForCr(cr: number): Tier {
  if (cr <= 4) return 1;
  if (cr <= 10) return 2;
  if (cr <= 16) return 3;
  return 4;
}

function rollCoins(rng: Rng, dice: CoinDice): Coins {
  const coins: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  for (const [denom, expr] of Object.entries(dice) as [keyof Coins, string][]) {
    coins[denom] += rng.roll(expr);
  }
  return coins;
}

/** Turn generic "Weapon +1" style entries into a concrete item like "Longsword +1". */
function concretize(rng: Rng, name: string): string {
  if (name.startsWith("Weapon ")) return name.replace("Weapon", rng.pick(WEAPON_BASES));
  if (name.startsWith("Armor ")) return name.replace("Armor", rng.pick(ARMOR_BASES));
  if (name.startsWith("Ammunition ")) return name.replace("Ammunition", rng.pick(["Arrow", "Crossbow Bolt", "Sling Bullet"]));
  if (name === "Flame Tongue" || name === "Vorpal Sword" || name === "Holy Avenger" || name === "Dancing Sword") {
    return `${name} (${rng.pick(["Longsword", "Greatsword", "Scimitar", "Shortsword"])})`;
  }
  return name;
}

/** Pick a family of items uniformly, then one variant from it. */
function pickFromPool(rng: Rng, pool: MagicItemRef[]): MagicItemRef {
  const families = new Map<string, MagicItemRef[]>();
  for (const ref of pool) {
    const key = ref.base ?? ref.name;
    (families.get(key) ?? families.set(key, []).get(key)!).push(ref);
  }
  return rng.pick(rng.pick([...families.values()]));
}

/** Add an item, stacking duplicates. */
function addItem(items: LootItem[], item: LootItem) {
  const existing = items.find((i) => i.name === item.name && i.kind === item.kind);
  if (existing) existing.quantity += item.quantity;
  else items.push(item);
}

export function generateLoot(opts: LootOptions): LootResult {
  const rng = createRng(opts.seed);
  const mode = opts.mode ?? "individual";
  const tier = tierForCr(opts.cr);
  const items: LootItem[] = [];

  let coins: Coins;
  if (mode === "individual") {
    coins = rollCoins(rng, rng.weighted(INDIVIDUAL[tier]));
  } else {
    coins = rollCoins(rng, HOARD_COINS[tier]);

    const valuables = rng.weighted(HOARD_VALUABLES[tier]);
    if (valuables) {
      const [kind, value, countExpr] = valuables;
      const pool = (kind === "gem" ? GEMS : ART)[value]!;
      const count = rng.roll(countExpr);
      for (let i = 0; i < count; i++) {
        addItem(items, { name: rng.pick(pool), kind, quantity: 1, valueGp: value });
      }
    }

    const magic = HOARD_MAGIC[tier];
    const count = rng.roll(magic.count);
    for (let i = 0; i < count; i++) {
      const rarity = rng.weighted(magic.rarity);
      const pool = opts.magicItems?.[rarity];
      if (opts.forge) {
        const forged = forgeItem({ rarity, curse: opts.curse, seed: `${rng.seed}:forge:${i}` });
        addItem(items, { name: forged.name, kind: "magic", quantity: 1, valueGp: forged.valueGp, rarity, forged });
      } else if (pool?.length) {
        const ref = pickFromPool(rng, pool);
        addItem(items, { name: ref.name, kind: "magic", quantity: 1, valueGp: ref.valueGp || RARITY_VALUE_GP[rarity], rarity, uuid: ref.uuid });
      } else {
        const name = concretize(rng, rng.pick(MAGIC_ITEMS[rarity]));
        addItem(items, { name, kind: "magic", quantity: 1, valueGp: RARITY_VALUE_GP[rarity], rarity });
      }
    }
  }

  const result: LootResult = { seed: rng.seed, cr: opts.cr, tier, mode, coins, items, totalValueGp: 0 };
  if (opts.extras !== false) addExtras(result, opts);

  const coinValue = (Object.keys(result.coins) as (keyof Coins)[]).reduce((sum, k) => sum + result.coins[k] * COIN_GP[k], 0);
  const itemValue = result.items.reduce((sum, i) => sum + i.valueGp * i.quantity, 0);
  result.totalValueGp = Math.round(coinValue + itemValue);
  return result;
}

// ---------------------------------------------------------------------------
// Extras: everything beyond coins, gems and magic items. Rolled on their own stream, so a seed's
// coins and magic items stay the same with or without them.

/** Share of the usual coins a creature type carries: [individual, hoard]. */
const COIN_SHARE: Record<string, [number, number]> = {
  beast: [0, 0.3], plant: [0, 0.3], ooze: [0.4, 0.6], construct: [0, 0.5], elemental: [0, 0.5], monstrosity: [0.25, 0.8], aberration: [0.6, 1],
};
const COIN_WHY: Record<string, string> = {
  beast: "Beasts carry no coin; what's here belonged to their victims.",
  plant: "What coin there is was tangled in the roots and growth.",
  ooze: "The coins are what the ooze couldn't digest; they need a good wash.",
  construct: "Constructs carry nothing of their own; anything here was left in their keeping.",
  elemental: "Elementals have no use for coin; anything here was left behind by others.",
  monstrosity: "Most of this was dragged in with past meals.",
};
const SOCIAL = new Set(["humanoid", "giant", "fey", "fiend", "celestial"]);

/** The theme: what most of the creatures are. */
function themeOf(opts: LootOptions): string | undefined {
  if (opts.theme) return opts.theme;
  const counts = new Map<string, number>();
  for (const c of opts.creatures ?? []) counts.set(c.type, (counts.get(c.type) ?? 0) + (c.count ?? 1) * Math.max(0.5, c.cr));
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const POTION_RARITY: Record<Tier, readonly (readonly [Rarity, number])[]> = {
  1: [["common", 60], ["uncommon", 40]],
  2: [["common", 25], ["uncommon", 50], ["rare", 25]],
  3: [["uncommon", 30], ["rare", 50], ["very rare", 20]],
  4: [["rare", 40], ["very rare", 50], ["legendary", 10]],
};

function potion(rng: Rng, tier: Tier): LootItem {
  const rarity = rng.weighted(POTION_RARITY[tier]);
  const [name, valueGp] = rng.pick(POTIONS[rarity]);
  const item: LootItem = { name, kind: "consumable", quantity: 1, valueGp, rarity };
  if (name === "Potion of Poison") item.note = "It looks, smells and tastes exactly like a potion of healing.";
  if (name === "Potion of Resistance") item.note = `Resistance to ${rng.pick(["acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"])} damage for 1 hour.`;
  return item;
}

function scroll(rng: Rng, tier: Tier): LootItem {
  const level = rng.pick(SCROLL_LEVELS[tier]);
  const spell = rng.pick(SCROLL_SPELLS[level]!);
  const label = level === 0 ? "cantrip" : `${level}${["st", "nd", "rd"][level - 1] ?? "th"} level`;
  return { name: `Spell Scroll: ${spell}`, kind: "consumable", quantity: 1, valueGp: SCROLL_VALUE[level]!, rarity: SCROLL_RARITY[level], spell: { name: spell, level }, note: `${spell} (${label}). Anyone with the spell on their class list can cast it from the scroll.` };
}

/** Parts worth cutting from the bodies: one or two per kind of creature. */
function parts(rng: Rng, creatures: readonly LootSource[]): LootItem[] {
  const out: LootItem[] = [];
  const seen = new Set<string>();
  for (const c of creatures) {
    const table = PARTS[c.type];
    if (!table || seen.has(c.name) || seen.size >= 3) continue;
    seen.add(c.name);
    const chance = ["beast", "monstrosity", "dragon"].includes(c.type) ? 0.85 : 0.5;
    if (!rng.chance(chance)) continue;
    const base = Math.max(1, Math.round(2 * Math.pow(c.cr + 1, 1.6)));
    for (const [part, mult, skill, buyer] of rng.shuffle(table).slice(0, c.cr >= 5 && table.length > 1 ? 2 : 1)) {
      const dc = Math.min(25, 10 + Math.floor(c.cr / 2));
      out.push({
        name: `${cap(c.name)} ${part}`,
        kind: "part",
        material: materialTagFor(part) ?? (c.type === "dragon" || c.type === "fiend" || c.type === "elemental" || c.type === "celestial" ? "essence" : "reagent"),
        sourceCr: c.cr,
        quantity: c.count ?? 1,
        valueGp: Math.max(1, Math.round(base * mult)),
        note: `Harvest: DC ${dc} ${SKILL_NAMES[skill]} check, 10 minutes per creature; a failure ruins it. Spoils in 1d4 days unless preserved. Sells to ${buyer}.`,
      });
    }
  }
  return out;
}

function container(rng: Rng, theme: string, tier: Tier): LootContainer {
  const [name, lockable] = rng.pick(CONTAINERS[theme] ?? CONTAINERS.humanoid!);
  const c: LootContainer = { name };
  if (lockable && rng.chance(0.55)) c.lockDc = [12, 15, 18, 21][tier - 1]! + rng.int(-1, 1);
  if (lockable && rng.chance(0.25)) {
    const dc = [12, 14, 16, 18][tier - 1]! + rng.int(0, 1);
    const dmg = ["2d10", "4d10", "10d10", "18d10"][tier - 1]!;
    const [trapName, text] = rng.pick(CONTAINER_TRAPS.filter(([n]) => n !== "Mimic" || tier <= 2));
    c.trap = `${trapName}. ${text.replace("{dc}", String(dc)).replace("{dmg}", dmg).replace("{atk}", String(dc - 7))}`;
    c.trapDc = dc;
  }
  return c;
}

function addExtras(r: LootResult, opts: LootOptions) {
  const rng = createRng(`${r.seed}:extras`);
  const theme = themeOf(opts);
  const hoard = r.mode === "hoard";
  const add = (i: LootItem) => addItem(r.items, i);
  if (theme) r.theme = theme;
  const notes: string[] = [];

  // Coins by what the creatures are.
  const share = theme ? COIN_SHARE[theme]?.[hoard ? 1 : 0] : undefined;
  if (share !== undefined) {
    for (const k of Object.keys(r.coins) as (keyof Coins)[]) r.coins[k] = Math.floor(r.coins[k] * share);
    if (hoard && COIN_WHY[theme!]) notes.push(COIN_WHY[theme!]!);
    else if (!hoard && share === 0) notes.push("They carry no coin; the value is in what can be harvested from them.");
  }
  if (theme === "undead" && Object.values(r.coins).some((n) => n > 0)) notes.push("The coins are an old mint from a fallen kingdom; collectors pay a tenth over face value.");

  const social = !theme || SOCIAL.has(theme);
  const t = r.tier;
  if (hoard) {
    for (let i = rng.int(1, 1 + t); i > 0; i--) add(rng.chance(0.55) ? potion(rng, t) : scroll(rng, t));
    if (social && rng.chance(theme === "giant" || theme === "humanoid" || !theme ? 0.65 : 0.4)) {
      for (const [name, value, dice, , note] of rng.shuffle(TRADE_GOODS.filter(([, , , min]) => min <= t)).slice(0, rng.int(1, 2))) {
        add({ name, kind: "trade", quantity: rng.roll(dice) * (t >= 3 ? 3 : 1), valueGp: value, note, material: materialTagFor(name) });
      }
    }
    for (const [name, note] of rng.shuffle(TRINKETS).slice(0, rng.int(1, 2))) add({ name, kind: "trinket", quantity: 1, valueGp: rng.int(1, 10) * t, note });
    if (theme === "undead") for (const [name, valueGp, note] of rng.shuffle(GRAVE_GOODS).slice(0, rng.int(1, 3))) add({ name, kind: "art", quantity: 1, valueGp: valueGp * t, note });
    if (social && rng.chance(0.4)) gear(rng, t, add);
    if (social && rng.chance(0.35)) addBook(rng, t, add);
    r.container = container(rng, theme ?? "humanoid", t);
  } else {
    if (social && rng.chance(theme === "humanoid" || !theme ? 0.3 : 0.2)) add(rng.chance(0.7) ? potion(rng, t) : scroll(rng, t));
    if (social && rng.chance(0.3)) {
      const [name, note] = rng.pick(TRINKETS);
      add({ name, kind: "trinket", quantity: 1, valueGp: rng.int(1, 5), note });
    }
    if ((theme === "humanoid" || !theme) && rng.chance(0.35)) gear(rng, t, add);
    if ((theme === "humanoid" || !theme) && rng.chance(0.06)) addBook(rng, t, add);
    if (theme === "undead" && rng.chance(0.4)) {
      const [name, valueGp, note] = rng.pick(GRAVE_GOODS);
      add({ name, kind: "art", quantity: 1, valueGp, note });
    }
    if ((theme === "humanoid" || !theme) && rng.chance(0.35)) r.container = { name: rng.pick(["coin purse", "belt pouch", "money belt", "boot with a slit in the lining", "hollow walking stick"]) };
  }
  for (const p of parts(rng, opts.creatures ?? [])) add(p);
  if (notes.length) r.notes = notes;
}

function addBook(rng: Rng, tier: Tier, add: (i: LootItem) => void) {
  const book = lootBook(rng, tier);
  add({ name: bookItemName(book), kind: "book", quantity: 1, valueGp: book.valueGp, book, note: book.blurb });
}

function gear(rng: Rng, tier: Tier, add: (i: LootItem) => void) {
  const [name, valueGp] = rng.pick(GEAR.filter(([, , min]) => min <= tier));
  add({ name, kind: "gear", quantity: 1, valueGp });
}

import { createRng, type Rng } from "./rng.ts";
import { forgeItem, type ForgedItem } from "./forge.ts";
import { ART, ARMOR_BASES, GEMS, MAGIC_ITEMS, RARITY_VALUE_GP, WEAPON_BASES, type Rarity } from "./data/treasure.ts";

export type LootMode = "individual" | "hoard";
export type Tier = 1 | 2 | 3 | 4;

export interface Coins {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface LootItem {
  name: string;
  kind: "gem" | "art" | "magic";
  quantity: number;
  /** Value per unit in gp. */
  valueGp: number;
  rarity?: Rarity;
  /** Foundry UUID when the item came from a compendium pool. */
  uuid?: string;
  /** A one-of-a-kind item from the Forge. */
  forged?: ForgedItem;
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

export interface LootResult {
  seed: string;
  cr: number;
  tier: Tier;
  mode: LootMode;
  coins: Coins;
  items: LootItem[];
  totalValueGp: number;
}

export interface LootOptions {
  /** Challenge rating of the encounter (individual) or the hoard's guardian/area. */
  cr: number;
  mode?: LootMode;
  /** Draw magic items from this pool instead of the built-in list (per rarity, when non-empty). */
  magicItems?: MagicItemPool;
  /** Forge unique magic items instead of picking standard ones. */
  forge?: boolean;
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
        const forged = forgeItem({ rarity, seed: `${rng.seed}:forge:${i}` });
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

  const coinValue = (Object.keys(coins) as (keyof Coins)[]).reduce((sum, k) => sum + coins[k] * COIN_GP[k], 0);
  const itemValue = items.reduce((sum, i) => sum + i.valueGp * i.quantity, 0);

  return {
    seed: rng.seed,
    cr: opts.cr,
    tier,
    mode,
    coins,
    items,
    totalValueGp: Math.round(coinValue + itemValue),
  };
}

import { craftingHours, MAGIC_CRAFT } from "./projects.ts";
import type { LootItem } from "./loot.ts";
import type { Rarity } from "./data/treasure.ts";

// ---------------------------------------------------------------------------
// Crafting: recipes that turn harvested parts and trade goods into gear, and the general rule for
// making anything else (half its price in materials, 10 gp of work a day; magic items by rarity,
// with a rare ingredient from a dangerous enough creature).

/** What a material is good for. Harvested parts and trade goods carry one of these. */
export type MaterialTag = "hide" | "scales" | "bone" | "herbs" | "reagent" | "essence" | "metal" | "cloth" | "wood" | "feathers" | "meat";

export const MATERIAL_LABELS: Record<MaterialTag, string> = {
  hide: "hides and pelts", scales: "scales", bone: "bone, horn and teeth", herbs: "herbs", reagent: "reagents (glands, eyes, venom)",
  essence: "magical essences", metal: "metal", cloth: "cloth and silk", wood: "good wood", feathers: "feathers", meat: "meat",
};

/** Best guess at a material from an item's name, for things that didn't come from the toolkit. */
export function materialTagFor(name: string): MaterialTag | undefined {
  const n = name.toLowerCase();
  if (/heart's blood|ichor|essence|ectoplasm|core stone|arcane core|wing dust|grave dust|glamour/.test(n)) return "essence";
  if (/scale/.test(n)) return "scales";
  if (/pelt|hide|leather|\bfur|furs\b/.test(n)) return "hide";
  if (/feather/.test(n)) return "feathers";
  if (/bone|teeth|tooth|claw|horn|tusk|antler/.test(n)) return "bone";
  if (/herb|flower|root|leaf|leaves|mushroom|seed|moss|sap/.test(n)) return "herbs";
  if (/gland|organ|eye|venom|ink sac|residue|musk/.test(n)) return "reagent";
  if (/ingot|bar of|ore\b|nugget|fittings|gears/.test(n)) return "metal";
  if (/silk|linen|cloth|wool/.test(n)) return "cloth";
  if (/wood|timber|branch|heartwood/.test(n)) return "wood";
  if (/meat|venison|haunch/.test(n)) return "meat";
  return undefined;
}

/** A stack of something in a character's pack that could go into a recipe. */
export interface MaterialStack {
  /** Item id (Foundry) or name. */
  id: string;
  name: string;
  quantity: number;
  valueGp: number;
  tag?: MaterialTag;
  /** CR of the creature it came from (harvested parts). */
  sourceCr?: number;
}

export interface Recipe {
  id: string;
  name: string;
  category: "potions" | "alchemy" | "ammunition" | "armor" | "gear" | "scrolls" | "food" | "trinkets";
  /** What comes out. */
  output: Pick<LootItem, "name" | "kind" | "quantity" | "valueGp" | "rarity">;
  /** dnd5e tool key. */
  tool: string;
  hours: number;
  /** Gold on top of the materials. */
  gp: number;
  /** Materials by tag. */
  materials: { tag: MaterialTag; quantity: number }[];
  dc: number;
  note?: string;
}

const r = (id: string, name: string, category: Recipe["category"], output: Recipe["output"], tool: string, hours: number, gp: number, materials: Recipe["materials"], dc: number, note?: string): Recipe =>
  ({ id, name, category, output, tool, hours, gp, materials, dc, note });

export const RECIPES: Recipe[] = [
  r("healing", "Potion of Healing", "potions", { name: "Potion of Healing", kind: "consumable", quantity: 1, valueGp: 50, rarity: "common" }, "herb", 8, 15, [{ tag: "herbs", quantity: 2 }], 12),
  r("greater-healing", "Potion of Greater Healing", "potions", { name: "Potion of Greater Healing", kind: "consumable", quantity: 1, valueGp: 150, rarity: "uncommon" }, "herb", 24, 50, [{ tag: "herbs", quantity: 3 }, { tag: "reagent", quantity: 1 }], 15),
  r("climbing", "Potion of Climbing", "potions", { name: "Potion of Climbing", kind: "consumable", quantity: 1, valueGp: 75, rarity: "common" }, "alchemist", 8, 20, [{ tag: "reagent", quantity: 1 }], 13, "A spider's or gecko's parts work best."),
  r("antitoxin", "Antitoxin", "alchemy", { name: "Antitoxin", kind: "gear", quantity: 1, valueGp: 50 }, "herb", 8, 10, [{ tag: "herbs", quantity: 1 }, { tag: "reagent", quantity: 1 }], 12),
  r("alchemists-fire", "Alchemist's Fire", "alchemy", { name: "Alchemist's Fire", kind: "gear", quantity: 1, valueGp: 50 }, "alchemist", 8, 20, [{ tag: "reagent", quantity: 1 }], 13),
  r("acid", "Acid (vial)", "alchemy", { name: "Acid", kind: "gear", quantity: 1, valueGp: 25 }, "alchemist", 4, 10, [{ tag: "reagent", quantity: 1 }], 12),
  r("poison", "Basic Poison", "alchemy", { name: "Basic Poison", kind: "gear", quantity: 1, valueGp: 100 }, "pois", 8, 20, [{ tag: "reagent", quantity: 1 }], 13),
  r("healers-kit", "Healer's Kit", "gear", { name: "Healer's Kit", kind: "gear", quantity: 1, valueGp: 5 }, "herb", 4, 1, [{ tag: "herbs", quantity: 1 }, { tag: "cloth", quantity: 1 }], 10),
  r("arrows", "Arrows (20)", "ammunition", { name: "Arrows", kind: "gear", quantity: 20, valueGp: 0.05 }, "woodcarver", 4, 0, [{ tag: "wood", quantity: 1 }, { tag: "feathers", quantity: 1 }], 10),
  r("bolts", "Crossbow Bolts (20)", "ammunition", { name: "Crossbow Bolts", kind: "gear", quantity: 20, valueGp: 0.05 }, "woodcarver", 4, 0, [{ tag: "wood", quantity: 1 }], 10),
  r("bone-arrows", "Bone-tipped Arrows (20)", "ammunition", { name: "Bone-tipped Arrows", kind: "gear", quantity: 20, valueGp: 0.1 }, "woodcarver", 4, 0, [{ tag: "bone", quantity: 1 }, { tag: "wood", quantity: 1 }], 11, "Bone heads, favored by hunters who can't get iron."),
  r("leather", "Leather Armor", "armor", { name: "Leather Armor", kind: "gear", quantity: 1, valueGp: 10 }, "leatherworker", 16, 2, [{ tag: "hide", quantity: 2 }], 11),
  r("hide-armor", "Hide Armor", "armor", { name: "Hide Armor", kind: "gear", quantity: 1, valueGp: 10 }, "leatherworker", 8, 0, [{ tag: "hide", quantity: 3 }], 10),
  r("studded", "Studded Leather Armor", "armor", { name: "Studded Leather Armor", kind: "gear", quantity: 1, valueGp: 45 }, "leatherworker", 24, 10, [{ tag: "hide", quantity: 2 }, { tag: "metal", quantity: 1 }], 13),
  r("scale-shield", "Scaled Shield", "armor", { name: "Shield", kind: "gear", quantity: 1, valueGp: 30 }, "smith", 16, 5, [{ tag: "scales", quantity: 2 }, { tag: "wood", quantity: 1 }], 13, "A shield faced with monster scales. Looks fantastic."),
  r("caltrops", "Caltrops (bag of 20)", "gear", { name: "Caltrops", kind: "gear", quantity: 1, valueGp: 1 }, "smith", 4, 0, [{ tag: "metal", quantity: 1 }], 10),
  r("trap", "Hunting Trap", "gear", { name: "Hunting Trap", kind: "gear", quantity: 1, valueGp: 5 }, "smith", 8, 1, [{ tag: "metal", quantity: 1 }], 11),
  r("silk-rope", "Silk Rope (50 feet)", "gear", { name: "Silk Rope (50 feet)", kind: "gear", quantity: 1, valueGp: 10 }, "weaver", 8, 0, [{ tag: "cloth", quantity: 1 }], 11),
  r("cloak", "Fur-lined Cloak", "gear", { name: "Fur-lined Cloak", kind: "gear", quantity: 1, valueGp: 15 }, "leatherworker", 8, 1, [{ tag: "hide", quantity: 1 }, { tag: "cloth", quantity: 1 }], 11, "Advantage on saves against extreme cold while worn (the GM's call)."),
  r("scroll-0", "Spell Scroll (cantrip)", "scrolls", { name: "Spell Scroll (Cantrip)", kind: "consumable", quantity: 1, valueGp: 25, rarity: "common" }, "calligrapher", 8, 15, [], 12, "You must know the spell (or have it prepared) and cast it as you write."),
  r("scroll-1", "Spell Scroll (1st level)", "scrolls", { name: "Spell Scroll (1st Level)", kind: "consumable", quantity: 1, valueGp: 75, rarity: "common" }, "calligrapher", 8, 25, [], 13, "You must know the spell (or have it prepared) and cast it as you write."),
  r("scroll-2", "Spell Scroll (2nd level)", "scrolls", { name: "Spell Scroll (2nd Level)", kind: "consumable", quantity: 1, valueGp: 150, rarity: "uncommon" }, "calligrapher", 24, 100, [{ tag: "essence", quantity: 1 }], 14, "You must know the spell (or have it prepared) and cast it as you write."),
  r("scroll-3", "Spell Scroll (3rd level)", "scrolls", { name: "Spell Scroll (3rd Level)", kind: "consumable", quantity: 1, valueGp: 300, rarity: "uncommon" }, "calligrapher", 40, 150, [{ tag: "essence", quantity: 1 }], 15, "You must know the spell (or have it prepared) and cast it as you write."),
  r("rations", "Trail Rations (5 days)", "food", { name: "Rations", kind: "gear", quantity: 5, valueGp: 0.5 }, "cook", 4, 0, [{ tag: "meat", quantity: 1 }], 10, "Smoked and salted; they keep for weeks."),
  r("feast", "Hearty Feast", "food", { name: "Hearty Feast", kind: "gear", quantity: 1, valueGp: 10 }, "cook", 4, 2, [{ tag: "meat", quantity: 1 }, { tag: "herbs", quantity: 1 }], 13, "Shared at a long rest, each diner gains temporary hit points equal to the cook's level."),
  r("trophy", "Trophy Charm", "trinkets", { name: "Trophy Charm", kind: "trinket", quantity: 1, valueGp: 15 }, "woodcarver", 4, 0, [{ tag: "bone", quantity: 1 }], 10, "A carved token from a kill. Sells well to people who like a story."),
  r("dye", "Fine Dye", "trinkets", { name: "Jar of Fine Dye", kind: "trade", quantity: 1, valueGp: 12 }, "alchemist", 8, 2, [{ tag: "reagent", quantity: 1 }], 11),
];

/** Which tool a made-from-scratch item needs, by what it is. */
export function toolFor(name: string): string {
  const n = name.toLowerCase();
  if (/potion|elixir|philter|draught/.test(n)) return "alchemist";
  if (/oil|poison/.test(n)) return /poison/.test(n) ? "pois" : "alchemist";
  if (/scroll/.test(n)) return "calligrapher";
  if (/leather|hide|cloak|boots|gloves|belt|bracers/.test(n)) return "leatherworker";
  if (/ring|amulet|necklace|circlet|crown|brooch|gem|jewel/.test(n)) return "jeweler";
  if (/bow|arrow|bolt|staff|wand|rod|club|quarterstaff/.test(n)) return "woodcarver";
  if (/robe|cape|cloth|hat|rope/.test(n)) return "weaver";
  if (/sword|axe|mace|hammer|spear|dagger|mail|plate|armor|shield|helm|pick|trident|halberd|glaive|flail|lance/.test(n)) return "smith";
  return "tinker";
}

export interface CraftPlan {
  tool: string;
  hours: number;
  /** Total cost in gold (materials can pay some of it). */
  gp: number;
  /** Magic items: a rare ingredient from a creature of at least this CR. */
  ingredientCr?: number;
  dc: number;
}

/** The general rule for making anything: half its price (or the XGtE magic item cost), 10 gp of work a day. */
export function craftPlan(item: Pick<LootItem, "name" | "kind" | "valueGp" | "rarity">): CraftPlan {
  const magic = item.kind === "magic" || (item.kind === "consumable" && !!item.rarity && item.rarity !== "common");
  const tool = toolFor(item.name);
  if (magic && item.rarity) {
    const m = MAGIC_CRAFT[item.rarity];
    // Consumables (potions, scrolls) take and cost half.
    const half = item.kind === "consumable" ? 0.5 : 1;
    return { tool, hours: Math.max(8, Math.round(m.weeks * 40 * half)), gp: Math.round(m.gp * half), ingredientCr: m.minCr, dc: 12 + ["common", "uncommon", "rare", "very rare", "legendary"].indexOf(item.rarity) * 2 };
  }
  return { tool, hours: craftingHours(item.valueGp), gp: Math.max(1, Math.round(item.valueGp / 2)), dc: item.valueGp >= 100 ? 14 : 12 };
}

export interface MaterialMatch {
  ok: boolean;
  /** What would be used: stack id → quantity. */
  use: { id: string; name: string; quantity: number; valueGp: number }[];
  /** Tags still short, with how many. */
  missing: { tag: MaterialTag; quantity: number }[];
  /** Value of what's used, which counts toward the gold cost. */
  valueGp: number;
}

/** Pick materials for a recipe from what's in the pack (cheapest stacks first). */
export function matchMaterials(needs: readonly { tag: MaterialTag; quantity: number }[], stacks: readonly MaterialStack[]): MaterialMatch {
  const left = new Map(stacks.map((s) => [s.id, s.quantity]));
  const use: MaterialMatch["use"] = [];
  const missing: MaterialMatch["missing"] = [];
  for (const need of needs) {
    let want = need.quantity;
    for (const s of [...stacks].filter((s) => (s.tag ?? materialTagFor(s.name)) === need.tag).sort((a, b) => a.valueGp - b.valueGp)) {
      const have = left.get(s.id) ?? 0;
      const take = Math.min(have, want);
      if (!take) continue;
      left.set(s.id, have - take);
      want -= take;
      const prior = use.find((u) => u.id === s.id);
      if (prior) prior.quantity += take;
      else use.push({ id: s.id, name: s.name, quantity: take, valueGp: s.valueGp });
      if (!want) break;
    }
    if (want) missing.push({ tag: need.tag, quantity: want });
  }
  return { ok: !missing.length, use, missing, valueGp: use.reduce((n, u) => n + u.quantity * u.valueGp, 0) };
}

/** For a magic item: the rare ingredient that qualifies (a part from a creature of high enough CR). */
export function rareIngredient(stacks: readonly MaterialStack[], minCr: number): MaterialStack | undefined {
  return [...stacks].filter((s) => (s.sourceCr ?? -1) >= minCr && s.quantity > 0).sort((a, b) => (a.sourceCr ?? 0) - (b.sourceCr ?? 0))[0];
}

export const rarityOrder = (r?: Rarity) => ["common", "uncommon", "rare", "very rare", "legendary"].indexOf(r ?? "common");

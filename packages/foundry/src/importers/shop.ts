import { basePriceOf, formatPrice, SETTLEMENTS, SHOP_TYPES, type ItemCategory, type Shop, type ShopItemRef } from "@dnd-toolkit/core";
import { createJournal } from "./journal.ts";
import { resolveItemData } from "./items.ts";
import { esc, FOLDER_NAME, MODULE_ID } from "../util.ts";

const CATEGORY_LABELS: Partial<Record<ItemCategory, string>> = {
  "weapon-melee": "Melee weapons", "weapon-ranged": "Ranged weapons", ammo: "Ammunition",
  "armor-light": "Light armor", "armor-medium": "Medium armor", "armor-heavy": "Heavy armor", shield: "Shields",
  potion: "Potions & alchemy", poison: "Poisons", scroll: "Scrolls", "wand-rod": "Wands, rods & staves", ring: "Rings",
  wondrous: "Wondrous items", gear: "Adventuring gear", container: "Containers", food: "Food & drink",
  clothing: "Clothing", tool: "Tools", instrument: "Instruments", gaming: "Games", gem: "Gemstones", other: "Other",
};

export function shopHtml(shop: Shop): string {
  const k = shop.keeper;
  const rows = (entries: Shop["stock"]) =>
    entries.map((e) => {
      const label = e.item.uuid ? `@UUID[${e.item.uuid}]{${esc(e.item.name)}}` : esc(e.item.name);
      return `<tr><td>${label}${e.item.rarity ? ` <em>(${e.item.rarity})</em>` : ""}</td><td>${e.quantity}</td><td>${formatPrice(e.priceGp)}</td></tr>`;
    }).join("");
  const sections: string[] = [];
  const mundane = shop.stock.filter((e) => !e.item.rarity);
  const magic = shop.stock.filter((e) => e.item.rarity);
  const byCategory = new Map<string, Shop["stock"]>();
  for (const e of mundane) {
    const label = CATEGORY_LABELS[e.item.category] ?? "Other";
    (byCategory.get(label) ?? byCategory.set(label, []).get(label)!).push(e);
  }
  for (const [label, entries] of byCategory) sections.push(`<tr><th colspan="3">${label}</th></tr>${rows(entries)}`);
  if (magic.length) sections.push(`<tr><th colspan="3">Magic items</th></tr>${rows(magic)}`);

  return `<p><strong>${esc(SHOP_TYPES[shop.type].label)}</strong> · ${esc(SETTLEMENTS[shop.settlement].label.toLowerCase())}</p>` +
    `<p><strong>Keeper:</strong> ${esc(k.name)} (${esc(k.race)}), ${esc(k.personality)}; ${esc(k.quirk)}.</p>` +
    `<p><strong>Prices:</strong> ×${shop.priceModifier} list · buys at ${Math.round(shop.sellModifier * 100)}% · haggle DC ${shop.haggleDc} (Persuasion; success knocks 10% off)</p>` +
    `<p><strong>Rumor:</strong> ${esc(shop.rumor)}</p>` +
    `<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>${sections.join("")}</tbody></table>` +
    `<p><small>seed <code>${esc(shop.seed)}</code></small></p>`;
}

export function createShopJournal(shop: Shop) {
  return createJournal(shop.name, shopHtml(shop), { kind: "shop", seed: shop.seed });
}

export const itemPilesActive = () => !!game.modules.get("item-piles")?.active && !!(globalThis as any).game?.itempiles?.API;

/**
 * Create an Item Piles merchant actor stocked with the shop's items. Items keep their list price;
 * the shop's markup becomes the merchant's buy price modifier so Item Piles applies it.
 */
export async function createMerchant(shop: Shop): Promise<any> {
  if (!itemPilesActive()) throw new Error("Item Piles isn't active in this world.");
  const description = `<p>${esc(shop.keeper.name)} (${esc(shop.keeper.race)}), ${esc(shop.keeper.personality)}.</p>`;
  const { actorUuid } = await game.itempiles.API.createItemPile({
    createActor: true,
    actor: shop.name,
    folders: [FOLDER_NAME],
    itemPileFlags: {
      type: "merchant",
      buyPriceModifier: shop.priceModifier,
      sellPriceModifier: shop.sellModifier,
      infiniteQuantity: false,
      description,
    },
    tokenOverrides: { name: shop.name, actorLink: true },
  });
  const actor = await fromUuid(actorUuid);

  // Item Piles' actor-only path doesn't add items itself, so add them here.
  const items = await Promise.all(shop.stock.map(async (e) => {
    const data: any = await resolveItemData({ name: e.item.name, kind: e.item.rarity ? "magic" : "gem", quantity: e.quantity, valueGp: e.item.priceGp, rarity: e.item.rarity, uuid: e.item.uuid });
    if (data.system && "quantity" in data.system) data.system.quantity = e.quantity;
    // Item Piles prices from the item itself, so unpriced magic items need a price.
    if (data.system?.price && !(Number(data.system.price.value) > 0)) data.system.price = { value: basePriceOf(e.item), denomination: "gp" };
    return data;
  }));
  await actor.createEmbeddedDocuments("Item", items);
  await actor.setFlag(MODULE_ID, "shop", { seed: shop.seed, type: shop.type, settlement: shop.settlement });
  ui.notifications.info(`Created merchant "${shop.name}" — drag it onto a scene for players to shop.`);
  actor.sheet?.render(true);
  return actor;
}

// ---------------------------------------------------------------------------
// Shop catalog from the user's Item compendiums

const TO_GP: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/** dnd5e 3.x item type + subtype → shop category. */
export function categoryOf(type: string, subtype: string | undefined, rarity: boolean): ItemCategory {
  const sub = subtype ?? "";
  switch (type) {
    case "weapon":
      if (/R$/.test(sub)) return "weapon-ranged";
      if (/M$/.test(sub)) return "weapon-melee";
      return "other";
    case "equipment":
      if (sub === "light" || sub === "medium" || sub === "heavy") return `armor-${sub}`;
      if (sub === "shield") return "shield";
      if (sub === "clothing") return "clothing";
      if (sub === "ring") return "ring";
      if (sub === "rod" || sub === "wand") return "wand-rod";
      if (sub === "trinket" || sub === "wondrous") return rarity ? "wondrous" : "gear";
      return "other";
    case "consumable":
      if (sub === "ammo") return "ammo";
      if (sub === "potion") return "potion";
      if (sub === "poison") return "poison";
      if (sub === "scroll") return "scroll";
      if (sub === "wand" || sub === "rod") return "wand-rod";
      if (sub === "food") return "food";
      return rarity ? "wondrous" : "gear";
    case "tool":
      if (sub === "music") return "instrument";
      if (sub === "game") return "gaming";
      if (sub === "vehicle") return "other";
      return "tool";
    case "loot":
      if (sub === "gem") return "gem";
      if (sub === "gear") return "gear";
      return "other";
    case "container":
    case "backpack":
      return "container";
    default:
      return "other";
  }
}

/** Not shelf goods: firearms (setting-specific), mounts, vehicles and tack. */
const NOT_STOCKED = /\b(renaissance|modern|futuristic|pistol|musket|rifle|revolver|shotgun|laser|antimatter|blunderbuss|pepperbox|mortar|grenade|dynamite|donkey|mule|horse|pony|camel|elephant|mastiff|warhorse|cart|carriage|wagon|chariot|sled|saddle|barding|ship|boat|galley|keelboat|longship|rowboat|warship|airship)\b/i;

/**
 * Name key that matches DDB and SRD spellings of the same item:
 * "Poison, Basic (vial)" = "Basic Poison", "Flask of Holy Water" = "Holy Water (flask)".
 */
export function itemKey(name: string): string {
  return name
    .toLowerCase()
    // Keep numeric qualifiers ("(1st Level)", "(20)"); drop descriptive ones ("(Ingested)", "(vial)").
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => (/\d/.test(inner) ? ` ${inner} ` : " "))
    .split(/[^a-z0-9+]+/)
    .filter((w) => w && !["of", "the", "a", "an", "flask", "vial", "bottle", "pot"].includes(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .sort()
    .join(" ");
}

const RARITY: Record<string, ShopItemRef["rarity"]> = { common: "common", uncommon: "uncommon", rare: "rare", veryRare: "very rare", legendary: "legendary" };

let cache: Promise<ShopItemRef[]> | null = null;

/** An Item index entry (or full item data) as read from a compendium. */
export interface RawItem {
  name: string;
  type: string;
  uuid: string;
  system?: { rarity?: string; price?: { value?: number; denomination?: string }; type?: { value?: string } };
}

/** Turn compendium items into shop stock, in preference order; first spelling of an item wins. */
export function shopItemsFrom(entries: Iterable<RawItem>, familyOf: (name: string, type: string) => string): ShopItemRef[] {
  const out: ShopItemRef[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const key = itemKey(e.name);
    if (seen.has(key) || NOT_STOCKED.test(e.name)) continue;
    const price = e.system?.price;
    const priceGp = (Number(price?.value) || 0) * (TO_GP[price?.denomination ?? "gp"] ?? 1);
    const rarityRaw = e.system?.rarity ?? "";
    if (rarityRaw === "artifact") continue;
    const rarity = RARITY[rarityRaw];
    if (!rarity && priceGp <= 0) continue; // mundane items need a price to be sold
    const category = categoryOf(e.type, e.system?.type?.value, !!rarity);
    if (category === "other") continue;
    seen.add(key);
    out.push({ name: e.name, category, priceGp, rarity, uuid: e.uuid, base: rarity ? familyOf(e.name, e.type) : undefined });
  }
  return out;
}

async function buildShopItems(familyOf: (name: string, type: string) => string): Promise<ShopItemRef[]> {
  const rank: Record<string, number> = { world: 0, module: 1, system: 2 };
  const packs = [...game.packs]
    .filter((p: any) => p.documentName === "Item")
    .sort((a: any, b: any) => (rank[a.metadata.packageType] ?? 1) - (rank[b.metadata.packageType] ?? 1));
  const entries: RawItem[] = [];
  for (const pack of packs) {
    for (const e of await pack.getIndex({ fields: ["system.rarity", "system.price", "system.type.value"] })) {
      entries.push({ ...e, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}` });
    }
  }
  return shopItemsFrom(entries, familyOf);
}

export function getShopItems(familyOf: (name: string, type: string) => string): Promise<ShopItemRef[]> {
  cache ??= buildShopItems(familyOf).catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

export function resetShopItems() {
  cache = null;
}

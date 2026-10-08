import type { LootItem, LootResult, Rarity } from "@dnd-toolkit/core";
import { esc, isDnd5e, MODULE_ID } from "../util.ts";
import { forgedItemData } from "./forge.ts";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const DND5E_RARITY: Record<Rarity, string> = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  "very rare": "veryRare",
  legendary: "legendary",
};

const FALLBACK_ICON: Record<LootItem["kind"], string> = {
  gem: "icons/commodities/gems/gem-faceted-round-white.webp",
  art: "icons/commodities/treasure/figurine-idol.webp",
  magic: "icons/magic/symbols/runes-star-orange.webp",
  consumable: "icons/consumables/potions/bottle-round-corked-red.webp",
  trade: "icons/commodities/cloth/cloth-bolt-gold-red.webp",
  trinket: "icons/commodities/treasure/trinket-totem-bone-green.webp",
  gear: "icons/tools/hand/lockpicks-steel-grey.webp",
  part: "icons/commodities/biological/hand-clawed-blue.webp",
  key: "icons/sundries/misc/key-steel.webp",
  book: "icons/sundries/books/book-red-exclamation.webp",
};

/** dnd5e item type and subtype for things that aren't in any compendium. */
const FALLBACK_TYPE: Record<LootItem["kind"], [type: string, subtype: string]> = {
  gem: ["loot", "gem"], art: ["loot", "art"], magic: ["loot", "treasure"], consumable: ["consumable", "potion"], trade: ["loot", "treasure"],
  trinket: ["loot", "treasure"], gear: ["loot", "gear"], part: ["loot", "material"], key: ["loot", "gear"], book: ["loot", "treasure"],
};

/** What the toolkit remembers on an item: crafting material, source CR, book contents. */
const toolkitFlags = (item: LootItem) => ({
  generated: true,
  ...(item.material ? { material: item.material } : {}),
  ...(item.sourceCr !== undefined ? { sourceCr: item.sourceCr } : {}),
  ...(item.book ? { book: item.book } : {}),
});

/** A spell scroll built from the real spell (dnd5e makes the scroll), or null when the spell isn't found. */
async function scrollData(item: LootItem): Promise<any> {
  if (!item.spell || !isDnd5e()) return null;
  const spell = await compendiumItem(item.spell.name);
  const make = CONFIG.Item.documentClass?.createScrollFromSpell;
  if (spell?.type !== "spell" || !make) return null;
  const scroll = await make.call(CONFIG.Item.documentClass, spell);
  const data = scroll?.toObject?.() ?? scroll;
  if (!data) return null;
  delete data._id;
  data.system = { ...data.system, quantity: item.quantity };
  data.flags = { ...data.flags, [MODULE_ID]: toolkitFlags(item) };
  return data;
}

let index: Map<string, { pack: any; id: string }> | null = null;

/** Name → compendium entry across every Item compendium; system packs win ties. */
async function compendiumIndex() {
  if (index) return index;
  index = new Map();
  const isSystem = (p: any) => Number(p.metadata.packageType === "system");
  // System packs last, so their entries overwrite same-named module/world ones.
  const packs = [...game.packs].filter((p: any) => p.documentName === "Item").sort((a: any, b: any) => isSystem(a) - isSystem(b));
  for (const pack of packs) {
    for (const entry of await pack.getIndex()) index.set(normalize(entry.name), { pack, id: entry._id });
  }
  return index;
}

/** A compendium item by name (system packs win ties), e.g. "Longsword" for a forged blade. */
export async function compendiumItem(name: string): Promise<any> {
  const hit = (await compendiumIndex()).get(normalize(name));
  return hit ? hit.pack.getDocument(hit.id) : null;
}

/** Build item creation data: the real compendium item when one matches, else a generic loot item. */
export async function resolveItemData(item: LootItem): Promise<object> {
  // One-of-a-kind items from the Forge build themselves.
  if (item.forged) return forgedItemData(item.forged);
  const scroll = await scrollData(item);
  if (scroll) return scroll;
  // Keys, trinkets and harvested parts are one-offs; don't let a same-named compendium item stand in.
  const lookup = !["key", "trinket", "part", "trade", "book"].includes(item.kind);
  const hit = item.uuid || !lookup ? null : (await compendiumIndex()).get(normalize(item.name));
  const doc = item.uuid ? await fromUuid(item.uuid) : hit ? await hit.pack.getDocument(hit.id) : null;
  if (doc) {
    const data = doc.toObject();
    delete data._id;
    if (data.system && "quantity" in data.system) data.system.quantity = item.quantity;
    data.flags = { ...data.flags, [MODULE_ID]: toolkitFlags(item) };
    return data;
  }
  const [type, subtype] = FALLBACK_TYPE[item.kind];
  const what = item.kind === "magic" ? `${item.rarity} magic item` : item.kind === "key" ? "A key." : `${item.kind}, worth ${item.valueGp} gp${item.quantity > 1 ? " each" : ""}`;
  return {
    name: item.name,
    type: isDnd5e() ? type : Object.keys(game.system.documentTypes?.Item ?? { loot: 1 })[0],
    img: FALLBACK_ICON[item.kind],
    system: isDnd5e()
      ? {
          quantity: item.quantity,
          price: { value: item.valueGp, denomination: "gp" },
          rarity: item.rarity ? DND5E_RARITY[item.rarity] : "",
          type: { value: subtype },
          description: { value: `<p>${esc(item.note ?? what)}</p>` },
          ...(type === "consumable" ? { uses: { value: 1, max: "1", per: "charges", autoDestroy: true } } : {}),
        }
      : {},
    flags: { [MODULE_ID]: toolkitFlags(item) },
  };
}

/**
 * Give coins and items to an actor (dnd5e: coins go to system.currency). With `stack`, an item the
 * actor already has (same name and type) gets its quantity raised instead of a second copy.
 */
export async function giveLootToActor(loot: Pick<LootResult, "coins" | "items">, actor: any, { quiet = false, stack = false } = {}) {
  if (isDnd5e() && Object.values(loot.coins).some((n) => n > 0)) {
    const currency = { ...actor.system.currency };
    for (const [k, n] of Object.entries(loot.coins)) currency[k] = (currency[k] ?? 0) + n;
    await actor.update({ "system.currency": currency });
  }
  const items: any[] = await Promise.all(loot.items.map(resolveItemData));
  const fresh: any[] = [];
  for (const data of items) {
    const same = stack && actor.items.find((i: any) => i.name === data.name && i.type === data.type && "quantity" in (i.system ?? {}));
    if (same) await same.update({ "system.quantity": Number(same.system.quantity ?? 1) + Number(data.system?.quantity ?? 1) });
    else fresh.push(data);
  }
  if (fresh.length) await actor.createEmbeddedDocuments("Item", fresh);
  if (!quiet) ui.notifications.info(`Gave ${loot.items.length} item(s) and coins to ${actor.name}.`);
}

/** Clear the cached compendium index (e.g. after installing new content). */
export function resetItemIndex() {
  index = null;
}

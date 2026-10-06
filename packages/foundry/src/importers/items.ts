import type { LootItem, LootResult, Rarity } from "@dnd-toolkit/core";
import { esc, isDnd5e, MODULE_ID } from "../util.ts";

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
};

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

/** Build item creation data: the real compendium item when one matches, else a generic loot item. */
export async function resolveItemData(item: LootItem): Promise<object> {
  const hit = item.uuid ? null : (await compendiumIndex()).get(normalize(item.name));
  const doc = item.uuid ? await fromUuid(item.uuid) : hit ? await hit.pack.getDocument(hit.id) : null;
  if (doc) {
    const data = doc.toObject();
    delete data._id;
    if (data.system && "quantity" in data.system) data.system.quantity = item.quantity;
    data.flags = { ...data.flags, [MODULE_ID]: { generated: true } };
    return data;
  }
  return {
    name: item.name,
    type: isDnd5e() ? "loot" : Object.keys(game.system.documentTypes?.Item ?? { loot: 1 })[0],
    img: FALLBACK_ICON[item.kind],
    system: isDnd5e()
      ? {
          quantity: item.quantity,
          price: { value: item.valueGp, denomination: "gp" },
          rarity: item.rarity ? DND5E_RARITY[item.rarity] : "",
          description: { value: `<p>${esc(item.kind === "magic" ? `${item.rarity} magic item` : `${item.kind}, worth ${item.valueGp} gp`)}</p>` },
        }
      : {},
    flags: { [MODULE_ID]: { generated: true } },
  };
}

/** Give coins and items to an actor (dnd5e: coins go to system.currency). */
export async function giveLootToActor(loot: LootResult, actor: any) {
  if (isDnd5e()) {
    const currency = { ...actor.system.currency };
    for (const [k, n] of Object.entries(loot.coins)) currency[k] = (currency[k] ?? 0) + n;
    await actor.update({ "system.currency": currency });
  }
  const items = await Promise.all(loot.items.map(resolveItemData));
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
  ui.notifications.info(`Gave ${loot.items.length} item(s) and coins to ${actor.name}.`);
}

/** Clear the cached compendium index (e.g. after installing new content). */
export function resetItemIndex() {
  index = null;
}

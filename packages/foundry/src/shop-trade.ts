import {
  addToPurse,
  attitudeModifier,
  basePriceOf,
  buyPrice,
  formatPrice,
  haggleModifier,
  payFrom,
  roundPrice,
  sellPrice,
  SHOP_TYPES,
  type Coins,
  type Shop,
} from "@dnd-toolkit/core";
import { getCampaign } from "./campaign-store.ts";
import { giveLootToActor } from "./importers/items.ts";
import { categoryOf } from "./importers/shop.ts";
import { logSession } from "./rewards.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Shopping without Item Piles: the GM opens a shop for the players (or they walk into one in a
// town), and each buys and sells from their own purse or the party stash. Haggling is a Persuasion
// check once per visit; a keeper who knows the party (Campaign → People) gives them a better price.
// Players ask; the active GM's client checks the coins and moves the goods.

const SOCKET = `module.${MODULE_ID}`;

export interface OpenShop {
  id: string;
  shop: Shop;
  /** Price change per customer actor (from haggling). */
  mods: Record<string, number>;
}

export function registerShopSettings() {
  game.settings.register(MODULE_ID, "openShops", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => Hooks.callAll(`${MODULE_ID}.shopsChanged`),
  });
}

export const getShops = (): Record<string, OpenShop> => structuredClone(game.settings.get(MODULE_ID, "openShops") ?? {});
export const getShop = (id: string): OpenShop | null => getShops()[id] ?? null;
const saveShop = async (s: OpenShop) => game.settings.set(MODULE_ID, "openShops", { ...getShops(), [s.id]: s });

/** The keeper's attitude, if the campaign knows them. */
export function keeperAttitude(shop: Shop): number {
  return getCampaign().npcs.find((n) => n.name === shop.keeper.name)?.attitude ?? 0;
}

/** The total price change for one customer: their haggle plus the keeper's feelings. */
export const customerMod = (s: OpenShop, actorId: string) => (s.mods[actorId] ?? 0) + attitudeModifier(keeperAttitude(s.shop));

const TO_GP: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
/** An item's list price in gp. */
export const itemGp = (item: any) => Number(item.system?.price?.value ?? 0) * (TO_GP[item.system?.price?.denomination ?? "gp"] ?? 1);

/** Will this shop buy it? What it sells, plus gems and art at the jeweler, parts at the alchemist, curios at the general store. */
export function shopBuys(shop: Shop, item: any): boolean {
  if (!(itemGp(item) > 0) || item.type === "class" || item.type === "spell" || item.type === "feat" || item.type === "subclass" || item.type === "background" || item.type === "race") return false;
  const def = SHOP_TYPES[shop.type];
  const sub = item.system?.type?.value;
  const cat = categoryOf(item.type, sub, !!item.system?.rarity);
  if (def.mundane.includes(cat) || def.magic.includes(cat)) return true;
  if (item.type === "loot") {
    if (shop.type === "jeweler") return sub === "gem" || sub === "art" || sub === "treasure";
    if (shop.type === "alchemist") return sub === "material";
    if (shop.type === "general") return sub === "material" || sub === "treasure" || sub === "gear";
  }
  return shop.type === "magic" && !!item.system?.rarity;
}

/** Open a shop for players (GM): everyone (or just these users) gets its window. */
export async function openShopForPlayers(shop: Shop, userIds?: string[], { showGm = true } = {}) {
  const id = shop.seed.replace(/\W/g, "_");
  const existing = getShop(id);
  if (!existing) await saveShop({ id, shop, mods: {} });
  game.socket.emit(SOCKET, { kind: "shopOpen", id, userIds });
  if (!showGm) return id;
  const { ShopWindow } = await import("./shop-window.ts");
  ShopWindow.open(id);
  return id;
}

export type ShopRequest =
  | { op: "buy"; id: string; index: number; name: string; actorUuid: string; userId: string }
  | { op: "sell"; id: string; itemUuid: string; actorUuid: string; userId: string }
  | { op: "haggle"; id: string; actorUuid: string; total: number; userId: string };

export function shopRequest(msg: ShopRequest) {
  game.socket.emit(SOCKET, { kind: "shopOp", ...msg });
  if (game.users.activeGM?.isSelf) queue(() => resolveShop(msg));
}

let chain: Promise<unknown> = Promise.resolve();
const queue = (fn: () => Promise<unknown>) => (chain = chain.then(fn).catch((err) => console.error(`${MODULE_ID} | shop`, err)));

const say = (content: string) => ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content });
const whisperTo = (userId: string, content: string) => ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: [userId], content });
const noCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

async function resolveShop(msg: ShopRequest) {
  const s = getShop(msg.id);
  const actor = await fromUuid(msg.actorUuid);
  const user = game.users.get(msg.userId);
  if (!s || !actor || !user || !actor.testUserPermission(user, "OWNER")) return;
  const keeper = esc(s.shop.keeper.name);
  if (msg.op === "haggle") {
    if (s.mods[actor.id] !== undefined) return;
    const { mod, line } = haggleModifier(msg.total, s.shop.haggleDc);
    s.mods[actor.id] = mod;
    await saveShop(s);
    await say(`<p><i class="fa-solid fa-comments-dollar"></i> <strong>${esc(actor.name)}</strong> haggles with ${keeper} (${msg.total}), who ${esc(line)}.${mod < 0 && s.shop.rumor ? ` Warming up, they mention: <em>${esc(s.shop.rumor)}</em>` : ""}</p>`);
    return;
  }
  const mod = customerMod(s, actor.id);
  if (msg.op === "buy") {
    const entry = s.shop.stock[msg.index];
    if (!entry || entry.item.name !== msg.name || entry.quantity <= 0) return void whisperTo(msg.userId, `<p>${esc(msg.name)} is sold out.</p>`);
    const price = buyPrice(entry.priceGp, mod);
    const purse = payFrom({ ...noCoins(), ...actor.system.currency }, price);
    if (!purse) return void whisperTo(msg.userId, `<p>${esc(actor.name)} can't afford ${esc(entry.item.name)} (${formatPrice(price)}).</p>`);
    await actor.update({ "system.currency": purse });
    await giveLootToActor({ coins: noCoins(), items: [{ name: entry.item.name, kind: entry.item.rarity ? "magic" : "gear", quantity: 1, valueGp: basePriceOf(entry.item), rarity: entry.item.rarity, uuid: entry.item.uuid }] }, actor, { quiet: true, stack: true });
    entry.quantity -= 1;
    if (entry.quantity <= 0) s.shop.stock.splice(msg.index, 1);
    await saveShop(s);
    await say(`<p><i class="fa-solid fa-cart-shopping"></i> <strong>${esc(actor.name)}</strong> buys ${esc(entry.item.name)} from ${keeper} for ${formatPrice(price)}.</p>`);
    await logSession({ kind: "loot", text: `Bought ${entry.item.name} for ${formatPrice(price)}` });
    return;
  }
  if (msg.op === "sell") {
    const item = await fromUuid(msg.itemUuid);
    if (!item || item.parent?.uuid !== actor.uuid || !shopBuys(s.shop, item)) return;
    const base = itemGp(item);
    const price = sellPrice(base, s.shop.sellModifier, mod);
    const qty = Number(item.system?.quantity ?? 1);
    if (qty > 1) await item.update({ "system.quantity": qty - 1 });
    else await item.delete();
    await actor.update({ "system.currency": addToPurse({ ...noCoins(), ...actor.system.currency }, price) });
    // It goes on the shelf at the shop's markup.
    const shelf = s.shop.stock.find((e) => e.item.name === item.name);
    if (shelf) shelf.quantity += 1;
    else s.shop.stock.push({ item: { name: item.name, category: categoryOf(item.type, item.system?.type?.value, !!item.system?.rarity), priceGp: base, rarity: item.system?.rarity || undefined, uuid: item._stats?.compendiumSource ?? undefined }, quantity: 1, priceGp: roundPrice(base * s.shop.priceModifier) });
    await saveShop(s);
    await say(`<p><i class="fa-solid fa-hand-holding-dollar"></i> <strong>${esc(actor.name)}</strong> sells ${esc(item.name)} to ${keeper} for ${formatPrice(price)}.</p>`);
  }
}

export function initShops() {
  game.socket.on(SOCKET, async (msg: any) => {
    if (msg?.kind === "shopOpen" && (!msg.userIds || msg.userIds.includes(game.user.id))) {
      const { ShopWindow } = await import("./shop-window.ts");
      ShopWindow.open(msg.id);
    }
    if (msg?.kind === "shopOp" && game.users.activeGM?.isSelf) queue(() => resolveShop(msg));
  });
  Hooks.on(`${MODULE_ID}.shopsChanged`, async () => {
    const { ShopWindow } = await import("./shop-window.ts");
    ShopWindow.refreshAll();
  });
}

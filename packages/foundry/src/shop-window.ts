import { buyPrice, coinsText, formatPrice, sellPrice } from "@dnd-toolkit/core";
import { stashActor } from "./loot-piles.ts";
import { customerMod, getShop, itemGp, keeperAttitude, shopBuys, shopRequest } from "./shop-trade.ts";
import { esc, MODULE_ID } from "./util.ts";

// The shop window: the shelf (Buy), your pack or the party stash (Sell), who's paying, and a haggle.

const { ApplicationV2 } = foundry.applications.api;

export class ShopWindow extends ApplicationV2 {
  static #open = new Map<string, ShopWindow>();
  #id = "";
  #tab: "buy" | "sell" = "buy";
  #payer = "";
  #filter = "";

  constructor(options: object = {}) {
    super(options);
  }

  static open(id: string) {
    let w = this.#open.get(id);
    if (!w) {
      w = new ShopWindow({ id: `${MODULE_ID}-shop-${id}` });
      w.#id = id;
      this.#open.set(id, w);
    }
    return w.render({ force: true });
  }

  static refreshAll() {
    for (const w of this.#open.values()) if (w.rendered) w.render();
  }

  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "dt-shop-window"],
    window: { title: "Shop", icon: "fa-solid fa-store", resizable: true },
    position: { width: 520, height: 600 },
    actions: {
      tab: ShopWindow.#onTab,
      buy: ShopWindow.#onBuy,
      sell: ShopWindow.#onSell,
      haggle: ShopWindow.#onHaggle,
    },
  };

  get title() {
    return getShop(this.#id)?.shop.name ?? "Shop";
  }

  /** Who can pay: your characters, and the party stash if you can use it. */
  #payers(): any[] {
    const own = game.actors.filter((a: any) => a.type === "character" && a.isOwner && (game.user.isGM ? a.hasPlayerOwner : true));
    const stash = stashActor();
    return [...(stash?.isOwner ? [stash] : []), ...own];
  }

  #payerActor(): any {
    const list = this.#payers();
    return list.find((a) => a.id === this.#payer) ?? list.find((a) => a.id === game.user.character?.id) ?? list[0] ?? null;
  }

  async _renderHTML() {
    const s = getShop(this.#id);
    if (!s) return `<p class="dt-empty">This shop has closed.</p>`;
    const payer = this.#payerActor();
    const mod = payer ? customerMod(s, payer.id) : 0;
    const att = keeperAttitude(s.shop);
    const purse = payer ? coinsText({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...payer.system.currency }) || "no coins" : "";
    const haggled = payer && s.mods[payer.id] !== undefined;
    const head = `<div class="dt-shop-head">
      <p><strong>${esc(s.shop.keeper.name)}</strong> (${esc(s.shop.keeper.race)}), ${esc(s.shop.keeper.personality)}.${att ? ` <em>${att > 0 ? "Knows and likes the party." : "Remembers the party, and not fondly."}</em>` : ""}</p>
      <div class="dt-row">
        <label>Paying <select data-payer>${this.#payers().map((a) => `<option value="${a.id}" ${a === payer ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
        <span class="dt-shop-purse"><i class="fa-solid fa-coins"></i> ${esc(purse)}</span>
        <button type="button" data-action="haggle" ${!payer || haggled ? "disabled" : ""} title="Persuasion against the keeper, once per visit">${haggled ? `Haggled (${mod > 0 ? "+" : ""}${Math.round(mod * 100)}%)` : `<i class="fa-solid fa-comments-dollar"></i> Haggle`}</button>
      </div>
      <nav class="dt-camp-tabs"><button type="button" class="${this.#tab === "buy" ? "active" : ""}" data-action="tab" data-tab="buy">Buy</button><button type="button" class="${this.#tab === "sell" ? "active" : ""}" data-action="tab" data-tab="sell">Sell</button>
        <input type="search" data-filter value="${esc(this.#filter)}" placeholder="Find…"></nav></div>`;
    const f = this.#filter.toLowerCase();
    if (this.#tab === "buy") {
      const rows = s.shop.stock.map((e, i) => ({ e, i })).filter(({ e }) => !f || e.item.name.toLowerCase().includes(f)).map(({ e, i }) => `<tr class="${e.item.rarity ? "dt-magic" : ""}">
        <td>${esc(e.item.name)}${e.item.rarity ? ` <em>${esc(e.item.rarity)}</em>` : ""}</td><td class="dt-qty">${e.quantity}</td>
        <td class="dt-price">${formatPrice(buyPrice(e.priceGp, mod))}</td>
        <td><button type="button" data-action="buy" data-index="${i}" data-name="${esc(e.item.name)}" ${payer ? "" : "disabled"}>Buy</button></td></tr>`).join("");
      return `${head}<table class="dt-stock">${rows || `<tr><td class="dt-empty">Nothing on the shelves.</td></tr>`}</table>`;
    }
    const goods = payer ? [...payer.items].filter((i: any) => shopBuys(s.shop, i) && (!f || i.name.toLowerCase().includes(f))) : [];
    const rows = goods.map((i: any) => `<tr><td><img src="${esc(i.img)}" alt="" class="dt-shop-icon"> ${esc(i.name)}${Number(i.system?.quantity ?? 1) > 1 ? ` ×${i.system.quantity}` : ""}${i.system?.equipped ? " <small>(equipped)</small>" : ""}</td>
      <td class="dt-price">${formatPrice(sellPrice(itemGp(i), s.shop.sellModifier, mod))}</td>
      <td><button type="button" data-action="sell" data-uuid="${i.uuid}">Sell one</button></td></tr>`).join("");
    return `${head}<p class="dt-sub">${esc(s.shop.keeper.name)} buys what a ${esc(s.shop.type === "general" ? "general store" : s.shop.type)} deals in, at about ${Math.round(s.shop.sellModifier * 100)}% of its value.</p>
      <table class="dt-stock">${rows || `<tr><td class="dt-empty">Nothing ${payer ? esc(payer.name) : "you"} carry interests them.</td></tr>`}</table>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
    content.querySelector("select[data-payer]")?.addEventListener("change", (e) => {
      this.#payer = (e.target as HTMLSelectElement).value;
      this.render();
    });
    const filter = content.querySelector("input[data-filter]") as HTMLInputElement | null;
    filter?.addEventListener("change", () => {
      this.#filter = filter.value;
      this.render();
    });
  }

  async close(options?: any) {
    ShopWindow.#open.delete(this.#id);
    return super.close(options);
  }

  static #onTab(this: ShopWindow, _e: Event, target: HTMLElement) {
    this.#tab = target.dataset.tab as "buy" | "sell";
    this.render();
  }

  static #onBuy(this: ShopWindow, _e: Event, target: HTMLElement) {
    const payer = this.#payerActor();
    if (!payer) return;
    shopRequest({ op: "buy", id: this.#id, index: Number(target.dataset.index), name: target.dataset.name!, actorUuid: payer.uuid, userId: game.user.id });
  }

  static #onSell(this: ShopWindow, _e: Event, target: HTMLElement) {
    const payer = this.#payerActor();
    if (!payer) return;
    shopRequest({ op: "sell", id: this.#id, itemUuid: target.dataset.uuid!, actorUuid: payer.uuid, userId: game.user.id });
  }

  static async #onHaggle(this: ShopWindow) {
    const payer = this.#payerActor();
    const s = getShop(this.#id);
    if (!payer || !s) return;
    // The stash can't talk: the haggler is the user's own character, but the deal applies to whoever pays.
    const talker = payer.type === "group" ? game.user.character ?? payer : payer;
    const roll = await talker.rollSkill?.("per", { flavor: `${talker.name} haggles with ${s.shop.keeper.name}` });
    const total = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
    if (typeof total !== "number") return;
    shopRequest({ op: "haggle", id: this.#id, actorUuid: payer.uuid, total, userId: game.user.id });
  }
}

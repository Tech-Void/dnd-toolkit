import { coinsText, containerChoices, hasCoins, needsHarvest, type ContainerAttempt, type Pile } from "@dnd-toolkit/core";
import { getPile, openStash, pileRequest, stashActor } from "./loot-piles.ts";
import { esc, MODULE_ID } from "./util.ts";

// The loot window: what's in a pile, what's stopping you getting at it, and Take. Each player's
// window follows the pile (another player emptying it updates everyone's).

const { ApplicationV2 } = foundry.applications.api;

const ATTEMPTS: Record<ContainerAttempt, [label: string, icon: string]> = {
  open: ["Open it", "fa-box-open"],
  pick: ["Pick the lock (thieves' tools)", "fa-unlock-keyhole"],
  force: ["Force it open (Athletics)", "fa-hand-fist"],
  inspect: ["Check it for traps (Investigation)", "fa-magnifying-glass"],
  disarm: ["Disarm the trap (thieves' tools)", "fa-screwdriver-wrench"],
};

const skillLabel = (key: string) => CONFIG.DND5E?.skills?.[key]?.label ?? key;

export class LootWindow extends ApplicationV2 {
  static #open = new Map<string, LootWindow>();
  #regionUuid = "";
  #tokenId = "";
  #busy = false;

  constructor(options: object = {}) {
    super(options);
  }

  static open(regionUuid: string, tokenId: string) {
    let w = this.#open.get(regionUuid);
    if (!w) {
      w = new LootWindow({ id: `${MODULE_ID}-loot-${regionUuid.replace(/\W/g, "-")}` });
      w.#regionUuid = regionUuid;
      this.#open.set(regionUuid, w);
    }
    w.#tokenId = tokenId;
    return w.render({ force: true });
  }

  /** The pile changed (or went): redraw, or close with a word. */
  static refresh(regionUuid: string) {
    const w = this.#open.get(regionUuid);
    if (!w?.rendered) return;
    if (!fromUuidSync(regionUuid)) {
      ui.notifications.info("There's nothing left there.");
      w.close();
    } else {
      w.#busy = false;
      w.render();
    }
  }

  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "dt-loot-window"],
    window: { title: "Loot", icon: "fa-solid fa-sack-dollar", resizable: true },
    position: { width: 400, height: "auto" as const },
    actions: {
      attempt: LootWindow.#onAttempt,
      take: LootWindow.#onTake,
      harvest: LootWindow.#onHarvest,
      stash: () => openStash(),
    },
  };

  get title() {
    return this.#pile()?.name ?? "Loot";
  }

  #pile(): Pile | null {
    return getPile(fromUuidSync(this.#regionUuid));
  }

  #actor(): any {
    return canvas.tokens?.get(this.#tokenId)?.actor ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
  }

  async _renderHTML() {
    const pile = this.#pile();
    if (!pile || pile.hidden) return `<p class="dt-empty">Nothing here.</p>`;
    const actor = this.#actor();
    const c = pile.container;
    const status: string[] = [];
    if (c) {
      if (c.locked) status.push(`<li><i class="fa-solid fa-lock"></i> Locked.</li>`);
      if (c.trap?.state === "found") status.push(`<li class="dt-loot-warn"><i class="fa-solid fa-triangle-exclamation"></i> Trapped: ${esc(c.trap.name)}.</li>`);
      if (c.trap?.state === "disarmed") status.push(`<li><i class="fa-solid fa-check"></i> The ${esc(c.trap.name.toLowerCase())} is disarmed.</li>`);
      if (c.trap?.state === "sprung") status.push(`<li><i class="fa-solid fa-burst"></i> The ${esc(c.trap.name.toLowerCase())} went off.</li>`);
    }
    const head = `<p class="dt-loot-who">${pile.kind === "body" ? "Searching" : "At"} <strong>${esc(pile.name)}</strong>${actor ? ` as ${esc(actor.name)}` : ""}.</p>
      ${status.length ? `<ul class="dt-loot-status">${status.join("")}</ul>` : ""}`;
    if (!pile.open) {
      return `${head}<p class="dt-sub">It's shut. What does ${esc(actor?.name ?? "your character")} do?</p>
        <div class="dt-loot-actions">${containerChoices(pile).map((a) => `<button type="button" data-action="attempt" data-attempt="${a}" ${this.#busy ? "disabled" : ""}><i class="fa-solid ${ATTEMPTS[a][1]}"></i> ${ATTEMPTS[a][0]}</button>`).join("")}</div>`;
    }
    const coins = hasCoins(pile.loot.coins);
    const rows = pile.loot.items.map((i, n) => needsHarvest(i)
      ? `<li class="dt-loot-part"><span title="${esc(i.note ?? "")}">${i.quantity > 1 ? `${i.quantity}× ` : ""}${esc(i.name)}</span>
          <button type="button" data-action="harvest" data-index="${n}" ${this.#busy ? "disabled" : ""}><i class="fa-solid fa-hand-scissors"></i> Harvest (${esc(skillLabel(i.harvest!.skill))} DC ${i.harvest!.dc})</button></li>`
      : `<li><label title="${esc(i.note ?? "")}"><input type="checkbox" data-pick="${n}" checked> ${i.quantity > 1 ? `${i.quantity}× ` : ""}${esc(i.name)}${i.rarity ? ` <em>${esc(i.rarity)}</em>` : ""}</label></li>`);
    const takeable = coins || pile.loot.items.some((i) => !needsHarvest(i));
    const stash = stashActor();
    return `${head}
      <ul class="dt-loot-items">
        ${coins ? `<li><label><input type="checkbox" data-coins checked> <i class="fa-solid fa-coins"></i> ${esc(coinsText(pile.loot.coins))}</label></li>` : ""}
        ${rows.join("")}
      </ul>
      ${!rows.length && !coins ? `<p class="dt-empty">Empty.</p>` : ""}
      ${takeable ? `<div class="dt-loot-actions">
        <button type="button" data-action="take" data-all="1" ${this.#busy ? "disabled" : ""}><i class="fa-solid fa-hand-holding"></i> Take all</button>
        <button type="button" data-action="take" ${this.#busy ? "disabled" : ""}><i class="fa-solid fa-list-check"></i> Take ticked</button>
      </div>` : ""}
      <p class="dt-sub dt-loot-foot">It all goes to the party stash${stash ? ` (<a data-action="stash">${esc(stash.name)}</a>)` : ""}, to share out later.</p>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  async close(options?: any) {
    LootWindow.#open.delete(this.#regionUuid);
    return super.close(options);
  }

  async #busyWhile(fn: () => Promise<void>) {
    this.#busy = true;
    this.render();
    try {
      await fn();
    } finally {
      // The GM's reply rerenders it; this is the fallback.
      setTimeout(() => {
        this.#busy = false;
        if (this.rendered) this.render();
      }, 1500);
    }
  }

  static async #onAttempt(this: LootWindow, _e: Event, target: HTMLElement) {
    const attempt = target.dataset.attempt as ContainerAttempt;
    const actor = this.#actor();
    if (!actor) return ui.notifications.warn("Select your token.");
    let total = 0;
    if (attempt !== "open") {
      const tools = [...actor.items].find((i: any) => i.type === "tool" && /thieves/i.test(i.name));
      if ((attempt === "pick" || attempt === "disarm") && !tools) return ui.notifications.warn(`${actor.name} needs thieves' tools for that.`);
      const flavor = `${actor.name}: ${ATTEMPTS[attempt][0].replace(/ \(.*\)$/, "").toLowerCase()}`;
      const roll = attempt === "pick" || attempt === "disarm" ? await tools.rollToolCheck?.({ flavor }) : await actor.rollSkill?.(attempt === "force" ? "ath" : "inv", { flavor });
      const t = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
      if (typeof t !== "number") return;
      total = t;
    }
    await this.#busyWhile(async () => pileRequest({ op: "container", regionUuid: this.#regionUuid, actorName: actor.name, attempt, total }));
  }

  static async #onTake(this: LootWindow, _e: Event, target: HTMLElement) {
    const pile = this.#pile();
    const actor = this.#actor();
    if (!pile) return;
    const all = !!target.dataset.all;
    const ticked = [...this.element.querySelectorAll("input[data-pick]")].filter((b: any) => all || b.checked).map((b: any) => Number(b.dataset.pick));
    const coins = all || !!(this.element.querySelector("input[data-coins]") as HTMLInputElement | null)?.checked;
    if (!ticked.length && !coins) return ui.notifications.info("Tick what to take.");
    await this.#busyWhile(async () => pileRequest({ op: "take", regionUuid: this.#regionUuid, actorName: actor?.name ?? game.user.name, picks: ticked, names: ticked.map((i) => pile.loot.items[i]!.name), coins }));
  }

  static async #onHarvest(this: LootWindow, _e: Event, target: HTMLElement) {
    const pile = this.#pile();
    const actor = this.#actor();
    const index = Number(target.dataset.index);
    const item = pile?.loot.items[index];
    if (!item?.harvest) return;
    if (!actor) return ui.notifications.warn("Select your token.");
    const roll = await actor.rollSkill?.(item.harvest.skill, { flavor: `${actor.name} harvests the ${item.name.toLowerCase()}` });
    const total = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
    if (typeof total !== "number") return;
    await this.#busyWhile(async () => pileRequest({ op: "harvest", regionUuid: this.#regionUuid, actorName: actor.name, total, picks: [index], names: [item.name] }));
  }
}

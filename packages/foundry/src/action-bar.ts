import { esc, MODULE_ID } from "./util.ts";
import { quickAct, quickActions, type RollMode } from "./quick-combat.ts";

// The action bar: a player's weapons, spells and abilities as buttons, with advantage, normal or
// disadvantage to choose. Click one, click a target, and quick combat does the rest.

const { ApplicationV2 } = foundry.applications.api;

export class ActionBar extends ApplicationV2 {
  static #instance: ActionBar | null = null;
  #actorId: string | null = null;
  #tokenId: string | null = null;
  #mode: RollMode = "normal";

  static show(token: any) {
    const bar = (this.#instance ??= new ActionBar());
    bar.#actorId = token?.actor?.id ?? null;
    bar.#tokenId = token?.id ?? null;
    return bar.render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-actionbar`,
    classes: [MODULE_ID, "dt-actionbar"],
    window: { title: "Actions", icon: "fa-solid fa-hand-fist", resizable: true },
    position: { width: 560, height: "auto" as const },
    actions: {
      mode: ActionBar.#onMode,
      act: ActionBar.#onAct,
      search: ActionBar.#onSearch,
    },
  };

  #token(): any {
    return canvas.tokens?.get(this.#tokenId) ?? canvas.tokens?.controlled[0] ?? null;
  }

  async _renderHTML() {
    const token = this.#token();
    const actor = token?.actor ?? game.actors.get(this.#actorId);
    if (!actor) return `<p class="dt-empty">Select your token.</p>`;
    const actions = quickActions(actor);
    const group = (title: string, list: any[]) => list.length ? `<div class="dt-ab-group"><h4>${title}</h4>${list.map((i) => {
      const lvl = i.type === "spell" ? (i.system.level ? ` <small>${i.system.level}</small>` : ` <small>cantrip</small>`) : "";
      const uses = i.system?.uses?.max ? ` <small>${i.system.uses.value}/${i.system.uses.max}</small>` : "";
      return `<button type="button" data-action="act" data-item="${i.id}" title="${esc(i.name)}"><img src="${esc(i.img)}" alt=""><span>${esc(i.name)}${lvl}${uses}</span></button>`;
    }).join("")}</div>` : "";
    const modes: [RollMode, string, string][] = [["disadvantage", "Disadvantage", "fa-arrow-down"], ["normal", "Normal", "fa-equals"], ["advantage", "Advantage", "fa-arrow-up"]];
    return `<div class="dt-ab-head"><img src="${esc(token?.document?.texture?.src ?? actor.img)}" alt=""><strong>${esc(token?.name ?? actor.name)}</strong>
        <button type="button" class="dt-ab-search" data-action="search" title="Search the area, or loot the pile you're standing by"><i class="fa-solid fa-magnifying-glass"></i> Search / loot</button>
        <span class="dt-ab-modes">${modes.map(([m, label, icon]) => `<button type="button" class="${this.#mode === m ? "active" : ""}" data-action="mode" data-mode="${m}"><i class="fa-solid ${icon}"></i> ${label}</button>`).join("")}</span></div>
      ${group("Weapons", actions.filter((i) => i.type === "weapon"))}
      ${group("Spells", actions.filter((i) => i.type === "spell"))}
      ${group("Abilities & items", actions.filter((i) => i.type === "feat" || i.type === "consumable"))}
      ${actions.length ? "" : `<p class="dt-empty">No attacks or spells to use.</p>`}`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  static async #onSearch(this: ActionBar) {
    const { searchHere } = await import("./loot-piles.ts");
    searchHere(this.#token());
  }

  static #onMode(this: ActionBar, _e: Event, target: HTMLElement) {
    this.#mode = target.dataset.mode as RollMode;
    this.render();
  }

  static async #onAct(this: ActionBar, _e: Event, target: HTMLElement) {
    const token = this.#token();
    const actor = token?.actor ?? game.actors.get(this.#actorId);
    const item = actor?.items.get(target.dataset.item);
    if (!item) return;
    await quickAct(actor, item, this.#mode, token);
    // Advantage and disadvantage are per attack.
    this.#mode = "normal";
    this.render();
  }
}


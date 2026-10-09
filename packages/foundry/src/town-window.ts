import { innNight, innRound, servicePrice, TEMPLE_SERVICES } from "@dnd-toolkit/core";
import { stashActor } from "./loot-piles.ts";
import { partyActors } from "./rolls.ts";
import { keeperAttitude, sceneTown, townRequest } from "./town-places.ts";
import { esc, MODULE_ID } from "./util.ts";

// Inside a town building: the inn (rooms, a round, rumors), the temple (services), the hall (work).

const { ApplicationV2 } = foundry.applications.api;

export class TownWindow extends ApplicationV2 {
  static #instance: TownWindow | null = null;
  #sceneId = "";
  #place = 0;
  #tokenId = "";
  #payer = "";

  constructor(options: object = {}) {
    super(options);
  }

  static open(sceneId: string, place: number, tokenId?: string) {
    const w = (this.#instance ??= new TownWindow({ id: `${MODULE_ID}-town-place` }));
    w.#sceneId = sceneId;
    w.#place = place;
    w.#tokenId = tokenId ?? "";
    return w.render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "dt-town-window"],
    window: { title: "Town", icon: "fa-solid fa-house", resizable: true },
    position: { width: 440, height: "auto" as const },
    actions: {
      room: TownWindow.#onBuy,
      round: TownWindow.#onBuy,
      rumor: TownWindow.#onRumor,
      work: TownWindow.#onWork,
      service: TownWindow.#onService,
    },
  };

  #town() {
    return sceneTown(game.scenes.get(this.#sceneId));
  }

  get title() {
    return this.#town()?.places[this.#place]?.label ?? "Town";
  }

  #me(): any {
    return game.scenes.get(this.#sceneId)?.tokens.get(this.#tokenId)?.actor ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
  }

  #payers(): any[] {
    const stash = stashActor();
    return [...(stash?.isOwner ? [stash] : []), ...game.actors.filter((a: any) => a.type === "character" && a.isOwner)];
  }

  #payerActor() {
    const list = this.#payers();
    return list.find((a) => a.id === this.#payer) ?? list.find((a) => a.id === game.user.character?.id) ?? list[0] ?? null;
  }

  async _renderHTML() {
    const t = this.#town();
    const place = t?.places[this.#place];
    if (!t || !place) return `<p class="dt-empty">Nothing here.</p>`;
    const payer = this.#payerActor();
    const purse = `<label>Paying <select data-payer>${this.#payers().map((a) => `<option value="${a.id}" ${a === payer ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>`;
    const people = Math.max(1, partyActors().length);
    if (place.kind === "inn") {
      const inn = t.inn;
      return `<p><strong>${esc(inn.name)}</strong>. ${esc(inn.feature.charAt(0).toUpperCase() + inn.feature.slice(1))}.</p>
        <p>${esc(inn.keeper.name)} (${esc(inn.keeper.race)}) is behind the bar: ${esc(inn.keeper.personality)}. Tonight it's ${esc(inn.specialty)}.</p>
        <div class="dt-row">${purse}</div>
        <div class="dt-loot-actions">
          <button type="button" data-action="room" data-op="room"><i class="fa-solid fa-bed"></i> Rooms for the night (${innNight(inn.roomGp, people)} gp)</button>
          <button type="button" data-action="round" data-op="round"><i class="fa-solid fa-beer-mug-empty"></i> A round for the house (${innRound(people)} gp)</button>
          <button type="button" data-action="rumor"><i class="fa-solid fa-ear-listen"></i> Ask what's new</button>
        </div>`;
    }
    if (place.kind === "temple") {
      const tp = t.temple;
      const att = keeperAttitude(tp.priest.name);
      const me = this.#me();
      const targets = game.actors.filter((a: any) => a.type === "character" && a.hasPlayerOwner);
      return `<p>The temple of <strong>${esc(tp.deity)}</strong> (${esc(tp.domain)}). ${esc(tp.feature.charAt(0).toUpperCase() + tp.feature.slice(1))}.</p>
        <p>${esc(tp.priest.name)} offers the faith's services, for a donation.</p>
        <div class="dt-row">${purse}<label>For <select data-target>${targets.map((a: any) => `<option value="${a.uuid}" ${a === me ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label></div>
        <table class="dt-stock">${TEMPLE_SERVICES.map((s) => `<tr><td title="${esc(s.text)}"><strong>${esc(s.name)}</strong><br><small>${esc(s.text)}</small></td>
          <td class="dt-price">${servicePrice(s, t.size, att)} gp</td>
          <td><button type="button" data-action="service" data-service="${s.id}">Ask</button></td></tr>`).join("")}</table>`;
    }
    if (place.kind === "hall") {
      return `<p><strong>${esc(t.name)}</strong> is run by ${esc(t.government)}: ${esc(t.leader.name)}, ${esc(t.leader.personality)}.</p>
        ${t.factions.length ? `<p>Names you hear in the corridors: ${t.factions.map((f) => esc(f.name)).join(", ")}.</p>` : ""}
        <div class="dt-loot-actions"><button type="button" data-action="work"><i class="fa-solid fa-scroll"></i> Ask about work</button></div>`;
    }
    return `<p>${esc(place.label)}.</p>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
    content.querySelector("select[data-payer]")?.addEventListener("change", (e) => {
      this.#payer = (e.target as HTMLSelectElement).value;
    });
  }

  static #onBuy(this: TownWindow, _e: Event, target: HTMLElement) {
    const payer = this.#payerActor();
    if (!payer) return ui.notifications.warn("You have nothing to pay with.");
    townRequest({ op: target.dataset.op as "room" | "round", sceneId: this.#sceneId, payerUuid: payer.uuid, userId: game.user.id, people: Math.max(1, partyActors().length) });
  }

  static #onRumor(this: TownWindow) {
    townRequest({ op: "rumor", sceneId: this.#sceneId, userId: game.user.id, who: this.#me()?.name ?? game.user.name });
  }

  static #onWork(this: TownWindow) {
    townRequest({ op: "work", sceneId: this.#sceneId, userId: game.user.id, who: this.#me()?.name ?? game.user.name });
  }

  static #onService(this: TownWindow, _e: Event, target: HTMLElement) {
    const payer = this.#payerActor();
    const who = (this.element.querySelector("select[data-target]") as HTMLSelectElement | null)?.value;
    if (!payer || !who) return;
    townRequest({ op: "service", sceneId: this.#sceneId, payerUuid: payer.uuid, userId: game.user.id, service: target.dataset.service!, targetUuid: who });
  }
}

import {
  crLabel,
  DIFFICULTIES,
  generateDungeon,
  generateEncounter,
  generateHook,
  generateLoot,
  randomSeed,
  stockDungeon,
  tagCounts,
  TEMPLATES,
  type Difficulty,
  type DungeonMap,
  type Encounter,
  type EncounterTemplate,
  type HookTone,
  type LootMode,
  type LootResult,
  type PlotHook,
  type RoomKey,
} from "@dnd-toolkit/core";
import { drawDungeon } from "./render.ts";
import { getCatalog, getMagicItems, type CatalogSource } from "./catalog.ts";
import { createDungeonScene } from "./importers/scene.ts";
import { createJournal, encounterHtml, hookHtml, lootHtml, postToChat } from "./importers/journal.ts";
import { giveLootToActor } from "./importers/items.ts";
import { linkEncounter, placeEncounter } from "./importers/tokens.ts";
import { esc, MODULE_ID } from "./util.ts";

const { ApplicationV2 } = foundry.applications.api;

type Tab = "encounter" | "dungeon" | "loot" | "hook";

interface FormState {
  encounter: {
    seed: string;
    level: number;
    size: number;
    difficulty: Difficulty;
    template: EncounterTemplate | "auto";
    tags: string;
    source: CatalogSource;
    loot: boolean;
  };
  dungeon: { seed: string; width: number; height: number; rooms: number; level: number; size: number; tags: string; place: boolean; name: string };
  loot: { seed: string; cr: number; mode: LootMode };
  hook: { seed: string; level: number; tone: HookTone };
}

const QUICK_TAGS: [string, string[]][] = [
  ["Type", ["humanoid", "undead", "beast", "fiend", "monstrosity", "giant", "dragon", "fey", "aberration", "construct", "elemental", "ooze", "plant"]],
  ["Folk", ["human", "elf", "dwarf", "orc", "goblinoid", "kobold", "gnoll", "lizardfolk", "drow"]],
  ["Theme", ["bandit", "cult", "military", "demon", "devil", "lycanthrope", "golem", "swarm"]],
  ["Terrain", ["forest", "underdark", "crypt", "dungeon", "swamp", "mountain", "hill", "arctic", "desert", "coast", "urban"]],
];

/** Average level and count of player-owned characters, if any. */
export function detectParty(): { level: number; size: number } | null {
  const pcs = game.actors.filter((a: any) => a.type === "character" && a.hasPlayerOwner);
  if (!pcs.length) return null;
  const level = pcs.reduce((sum: number, a: any) => sum + (Number(a.system?.details?.level) || 1), 0) / pcs.length;
  return { level: Math.max(1, Math.min(20, Math.round(level))), size: pcs.length };
}

export class ToolkitApp extends ApplicationV2 {
  static #instance: ToolkitApp | null = null;

  static open(tab?: Tab) {
    this.#instance ??= new ToolkitApp();
    if (tab) this.#instance.tab = tab;
    return this.#instance.render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    classes: [MODULE_ID],
    window: { title: "DnD Toolkit", icon: "fa-solid fa-dice-d20", resizable: true },
    position: { width: 600, height: 720 },
    actions: {
      tab: ToolkitApp.#onTab,
      generate: ToolkitApp.#onGenerate,
      reroll: ToolkitApp.#onReroll,
      addTag: ToolkitApp.#onAddTag,
      detectParty: ToolkitApp.#onDetectParty,
      openMonster: ToolkitApp.#onOpenMonster,
      encPlace: ToolkitApp.#onEncPlace,
      encCombat: ToolkitApp.#onEncCombat,
      encChat: ToolkitApp.#onEncChat,
      encJournal: ToolkitApp.#onEncJournal,
      toScene: ToolkitApp.#onToScene,
      lootChat: ToolkitApp.#onLootChat,
      lootJournal: ToolkitApp.#onLootJournal,
      lootActor: ToolkitApp.#onLootActor,
      hookChat: ToolkitApp.#onHookChat,
      hookJournal: ToolkitApp.#onHookJournal,
    },
  };

  tab: Tab = "encounter";
  form: FormState;
  encounter: Encounter | null = null;
  dungeon: { map: DungeonMap; keys: RoomKey[] } | null = null;
  loot: LootResult | null = null;
  hook: PlotHook | null = null;
  /** Tag suggestions for the datalist, loaded from the catalog on first use. */
  tagList: string[] | null = null;
  #tagListLoading = false;

  constructor(options = {}) {
    super(options);
    const party = detectParty() ?? { level: 3, size: 4 };
    const hasActorPacks = [...game.packs].some((p: any) => p.documentName === "Actor");
    this.form = {
      encounter: { seed: "", level: party.level, size: party.size, difficulty: "moderate", template: "auto", tags: "", source: hasActorPacks ? "compendium" : "srd", loot: true },
      dungeon: { seed: "", width: 40, height: 30, rooms: 12, level: party.level, size: party.size, tags: "", place: true, name: "" },
      loot: { seed: "", cr: party.level, mode: "hoard" },
      hook: { seed: "", level: party.level, tone: "any" },
    };
  }

  // --- Rendering ------------------------------------------------------------

  async _renderHTML() {
    const tabBtn = (id: Tab, label: string, icon: string) =>
      `<button type="button" class="${this.tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><i class="${icon}"></i> ${label}</button>`;
    const body = { encounter: () => this.#encounterHtml(), dungeon: () => this.#dungeonHtml(), loot: () => this.#lootHtml(), hook: () => this.#hookHtml() }[this.tab]();
    return `
      <nav class="dt-tabs">
        ${tabBtn("encounter", "Encounter", "fa-solid fa-dragon")}
        ${tabBtn("dungeon", "Dungeon", "fa-solid fa-dungeon")}
        ${tabBtn("loot", "Loot", "fa-solid fa-coins")}
        ${tabBtn("hook", "Plot Hook", "fa-solid fa-scroll")}
      </nav>
      <section class="dt-body">${body}</section>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  _onRender() {
    const canvasEl = this.element.querySelector("canvas.dt-preview") as HTMLCanvasElement | null;
    if (canvasEl && this.dungeon) drawDungeon(canvasEl, this.dungeon.map, { cell: 12, labels: true });

    // Enter in a tag box generates immediately.
    for (const input of this.element.querySelectorAll("input[name=tags]") as NodeListOf<HTMLInputElement>) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        this.#readForm();
        this.#generate(input.dataset.group as keyof FormState);
      });
    }

    if ((this.tab === "encounter" || this.tab === "dungeon") && !this.tagList && !this.#tagListLoading) {
      this.#tagListLoading = true;
      getCatalog(this.form.encounter.source)
        .then((catalog) => {
          this.tagList = [...tagCounts(catalog)].filter(([t]) => t !== "anyrace").sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 300);
          this.#readForm();
          this.render();
        })
        .catch((err) => console.error(`${MODULE_ID} | catalog`, err))
        .finally(() => (this.#tagListLoading = false));
    }
  }

  #field(group: keyof FormState, name: string, label: string, input: string) {
    const attrs = `data-group="${group}" name="${name}"`;
    return `<label class="dt-field"><span>${label}</span>${input.replace(/^<(input|select)/, `<$1 ${attrs}`)}</label>`;
  }

  #select(group: keyof FormState, name: string, label: string, options: [string, string][], value: string) {
    return this.#field(group, name, label, `<select>${options.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`);
  }

  #seedRow(group: keyof FormState) {
    return `<div class="dt-row">
      ${this.#field(group, "seed", "Seed", `<input type="text" value="${esc(this.form[group].seed)}" placeholder="random">`)}
      <button type="button" data-action="generate" data-group="${group}"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate</button>
      <button type="button" data-action="reroll" data-group="${group}" title="New random seed"><i class="fa-solid fa-dice"></i></button>
    </div>`;
  }

  #tagsField(group: "encounter" | "dungeon", label: string) {
    const datalist = this.tagList ? `<datalist id="dt-taglist">${this.tagList.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>` : "";
    return this.#field(group, "tags", label, `<input type="text" list="dt-taglist" value="${esc(this.form[group].tags)}" placeholder="e.g. humanoid+orc · undead, fiend · beast -swarm">`) + datalist;
  }

  #partyFields(group: "encounter" | "dungeon") {
    const f = this.form[group];
    return `${this.#field(group, "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
      ${this.#field(group, "size", "Party size", `<input type="number" min="1" max="10" value="${f.size}">`)}
      <button type="button" data-action="detectParty" data-group="${group}" title="Use player characters' level and count"><i class="fa-solid fa-users"></i></button>`;
  }

  #encounterHtml() {
    const f = this.form.encounter;
    const chips = QUICK_TAGS.map(([label, tags]) =>
      `<div class="dt-chips"><span>${label}</span>${tags.map((t) => `<button type="button" class="dt-chip" data-action="addTag" data-group="encounter" data-tag="${t}">${t}</button>`).join("")}</div>`).join("");
    return `
      <div class="dt-row">${this.#partyFields("encounter")}</div>
      <div class="dt-row">
        ${this.#select("encounter", "difficulty", "Difficulty", DIFFICULTIES.map((d): [string, string] => [d, d]), f.difficulty)}
        ${this.#select("encounter", "template", "Shape", [["auto", "Auto"], ...Object.entries(TEMPLATES)] as [string, string][], f.template)}
        ${this.#select("encounter", "source", "Content from", [["compendium", "My compendiums"], ["srd", "Built-in SRD"]], f.source)}
      </div>
      <div class="dt-row">${this.#tagsField("encounter", "Monster tags")}</div>
      <details class="dt-quick"><summary>Quick tags <small>(click to add · "+" = and · "," = or · "-tag" = exclude)</small></summary>${chips}</details>
      <div class="dt-row">
        <label class="dt-check"><input type="checkbox" data-group="encounter" name="loot" ${f.loot ? "checked" : ""}> Roll treasure</label>
      </div>
      ${this.#seedRow("encounter")}
      ${this.encounter ? this.#encounterPreview(this.encounter) : `<p class="dt-empty">Pick tags (or leave blank for anything) and hit Generate — or press Enter in the tag box.</p>`}`;
  }

  #encounterPreview(e: Encounter) {
    const rows = e.groups
      .map((g) => `<li class="dt-monster">
          ${g.monster.img ? `<img src="${esc(g.monster.img)}" alt="">` : `<i class="fa-solid fa-skull"></i>`}
          <span class="dt-count">${g.count}×</span>
          ${g.monster.uuid ? `<a data-action="openMonster" data-uuid="${esc(g.monster.uuid)}">${esc(g.name)}</a>` : esc(g.name)}
          <span class="dt-sub">CR ${crLabel(g.monster.cr)}${g.role ? ` · ${g.role}` : ""} · ${(g.xpEach * g.count).toLocaleString()} XP</span>
        </li>`)
      .join("");
    const ratingNote = e.rating === e.difficulty ? "" : ` <em>(asked for ${e.difficulty})</em>`;
    return `
      <div class="dt-card">
        <p class="dt-enc-head"><strong>${esc(TEMPLATES[e.template])}</strong> · <span class="dt-rating dt-${e.rating}">${e.rating}</span>${ratingNote} · ${e.totalXp.toLocaleString()} / ${e.budget.toLocaleString()} XP</p>
        <ul class="dt-monsters">${rows}</ul>
        <ul class="dt-tactics">${e.tactics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <p><strong>Situation:</strong> ${esc(e.situation)}</p>
        <p><strong>Terrain:</strong> ${esc(e.terrain)}</p>
        ${e.loot ? `<details><summary>Treasure ≈ ${e.loot.totalValueGp.toLocaleString()} gp</summary>${lootHtml(e.loot)}</details>` : ""}
        ${e.warnings.map((w) => `<p class="dt-warn">⚠ ${esc(w)}</p>`).join("")}
      </div>
      <div class="dt-row dt-actions">
        <button type="button" data-action="encPlace" title="Place hidden tokens around the center of your view"><i class="fa-solid fa-eye-slash"></i> Place hidden</button>
        <button type="button" data-action="encCombat" title="Place visible tokens, add them to combat and roll initiative"><i class="fa-solid fa-swords"></i> Place &amp; fight</button>
        <button type="button" data-action="encChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
        <button type="button" data-action="encJournal"><i class="fa-solid fa-book"></i> Journal</button>
      </div>`;
  }

  #dungeonHtml() {
    const f = this.form.dungeon;
    const num = (name: "width" | "height" | "rooms", label: string, min: number, max: number) =>
      this.#field("dungeon", name, label, `<input type="number" min="${min}" max="${max}" value="${f[name]}">`);
    const d = this.dungeon;
    return `
      <div class="dt-row">${num("width", "Width", 16, 120)}${num("height", "Height", 12, 120)}${num("rooms", "Max rooms", 2, 40)}</div>
      <div class="dt-row">${this.#partyFields("dungeon")}</div>
      <div class="dt-row">${this.#tagsField("dungeon", "Monster theme")}</div>
      ${this.#seedRow("dungeon")}
      ${d ? `
        <div class="dt-preview-wrap"><canvas class="dt-preview"></canvas></div>
        <p class="dt-meta">${d.map.rooms.length} rooms · ${d.map.walls.filter((w) => w.door).length} doors · ${d.keys.filter((k) => k.encounter).length} encounters · seed <code>${esc(d.map.seed)}</code></p>
        <div class="dt-row">
          ${this.#field("dungeon", "name", "Scene name", `<input type="text" value="${esc(f.name)}" placeholder="Dungeon ${esc(d.map.seed)}">`)}
          <button type="button" data-action="toScene"><i class="fa-solid fa-map"></i> Create Scene</button>
        </div>
        <label class="dt-check"><input type="checkbox" data-group="dungeon" name="place" ${f.place ? "checked" : ""}> Place monster tokens (hidden) in their rooms</label>
        <p class="dt-hint">Creates the scene with walls, doors, vision, and a room-key journal (with linked statblocks) pinned as map notes.</p>`
      : `<p class="dt-empty">Set the options and hit Generate.</p>`}`;
  }

  #lootHtml() {
    const f = this.form.loot;
    const l = this.loot;
    return `
      <div class="dt-row">
        ${this.#field("loot", "cr", "Challenge rating", `<input type="number" min="0" max="30" step="0.25" value="${f.cr}">`)}
        ${this.#select("loot", "mode", "Type", [["individual", "Individual"], ["hoard", "Hoard"]], f.mode)}
        ${this.#select("encounter", "source", "Items from", [["compendium", "My compendiums"], ["srd", "Built-in SRD"]], this.form.encounter.source)}
      </div>
      ${this.#seedRow("loot")}
      ${l ? `
        <div class="dt-card">${lootHtml(l)}</div>
        <div class="dt-row dt-actions">
          <button type="button" data-action="lootChat"><i class="fa-solid fa-comment"></i> Post to chat</button>
          <button type="button" data-action="lootJournal"><i class="fa-solid fa-book"></i> Journal</button>
          <button type="button" data-action="lootActor"><i class="fa-solid fa-sack"></i> Give to selected token</button>
        </div>`
      : `<p class="dt-empty">Pick a CR and generate treasure.</p>`}`;
  }

  #hookHtml() {
    const f = this.form.hook;
    const h = this.hook;
    const tones: HookTone[] = ["any", "heroic", "mystery", "horror", "intrigue"];
    return `
      <div class="dt-row">
        ${this.#field("hook", "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
        ${this.#select("hook", "tone", "Tone", tones.map((t): [string, string] => [t, t]), f.tone)}
      </div>
      ${this.#seedRow("hook")}
      ${h ? `
        <div class="dt-card">${hookHtml(h)}</div>
        <div class="dt-row dt-actions">
          <button type="button" data-action="hookChat"><i class="fa-solid fa-comment"></i> Post to chat (GM)</button>
          <button type="button" data-action="hookJournal"><i class="fa-solid fa-book"></i> Journal</button>
        </div>`
      : `<p class="dt-empty">Generate an adventure hook.</p>`}`;
  }

  // --- State ----------------------------------------------------------------

  /** Copy current input values into this.form so re-renders keep them. */
  #readForm() {
    if (!this.element) return;
    const prevSource = this.form.encounter.source;
    for (const el of this.element.querySelectorAll("[data-group][name]") as NodeListOf<HTMLInputElement>) {
      const group = this.form[el.dataset.group as keyof FormState] as Record<string, unknown>;
      group[el.name] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    }
    if (this.form.encounter.source !== prevSource) this.tagList = null;
  }

  async #generate(group: keyof FormState) {
    const seed = this.form[group].seed || randomSeed();
    this.form[group].seed = seed;
    try {
      if (group === "encounter") {
        const f = this.form.encounter;
        const [catalog, magicItems] = await Promise.all([getCatalog(f.source), getMagicItems(f.source)]);
        const e = generateEncounter({ seed, catalog, magicItems, partyLevel: f.level, partySize: f.size, difficulty: f.difficulty, template: f.template, tags: f.tags, loot: f.loot });
        this.encounter = await linkEncounter(e);
      } else if (group === "dungeon") {
        const f = this.form.dungeon;
        const source = this.form.encounter.source;
        const [catalog, magicItems] = await Promise.all([getCatalog(source), getMagicItems(source)]);
        const map = generateDungeon({ seed, width: f.width, height: f.height, maxRooms: f.rooms });
        this.dungeon = { map, keys: stockDungeon(map, { partyLevel: f.level, partySize: f.size, tags: f.tags, catalog, magicItems }) };
      } else if (group === "loot") {
        const magicItems = await getMagicItems(this.form.encounter.source);
        this.loot = generateLoot({ seed, cr: this.form.loot.cr, mode: this.form.loot.mode, magicItems });
      } else {
        this.hook = generateHook({ seed, partyLevel: this.form.hook.level, tone: this.form.hook.tone });
      }
    } catch (err) {
      ui.notifications.warn(`DnD Toolkit: ${(err as Error).message}`);
    }
    this.render();
  }

  async #run(target: HTMLButtonElement, fn: () => Promise<unknown>) {
    target.disabled = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      ui.notifications.error(`DnD Toolkit: ${(err as Error).message}`);
    } finally {
      target.disabled = false;
    }
  }

  // --- Actions (bound to the app instance by ApplicationV2) -----------------

  static #onTab(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForm();
    this.tab = target.dataset.tab as Tab;
    this.render();
  }

  static #onGenerate(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForm();
    this.#generate(target.dataset.group as keyof FormState);
  }

  static #onReroll(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForm();
    const group = target.dataset.group as keyof FormState;
    this.form[group].seed = "";
    this.#generate(group);
  }

  static #onAddTag(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForm();
    const f = this.form[target.dataset.group as "encounter" | "dungeon"];
    const tag = target.dataset.tag!;
    f.tags = f.tags.trim() ? `${f.tags.trim()}+${tag}` : tag;
    this.render();
  }

  static #onDetectParty(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForm();
    const party = detectParty();
    if (!party) return ui.notifications.warn("No player-owned characters found.");
    Object.assign(this.form[target.dataset.group as "encounter" | "dungeon"], party);
    this.render();
  }

  static async #onOpenMonster(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const doc = await fromUuid(target.dataset.uuid!);
    doc?.sheet?.render(true);
  }

  static #onEncPlace(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const e = this.encounter;
    if (e) this.#run(target, async () => ui.notifications.info(`Placed ${(await placeEncounter(e, { hidden: true })).length} hidden tokens.`));
  }

  static #onEncCombat(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const e = this.encounter;
    if (e) this.#run(target, () => placeEncounter(e, { hidden: false, startCombat: true }));
  }

  static #onEncChat(this: ToolkitApp) {
    if (this.encounter) postToChat(encounterHtml(this.encounter), true);
  }

  static #onEncJournal(this: ToolkitApp) {
    const e = this.encounter;
    if (!e) return;
    const title = `Encounter: ${e.groups.map((g) => (g.count > 1 ? `${g.count}× ${g.name}` : g.name)).join(", ")}`;
    createJournal(title.length > 80 ? `${title.slice(0, 77)}…` : title, encounterHtml(e, { heading: true }), { kind: "encounter", seed: e.seed });
  }

  static #onToScene(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const d = this.dungeon;
    if (!d) return;
    this.#readForm();
    this.#run(target, async () => {
      const scene = await createDungeonScene(d.map, { name: this.form.dungeon.name || undefined, roomKey: d.keys, placeMonsters: this.form.dungeon.place });
      ui.notifications.info(`Created scene "${scene.name}".`);
    });
  }

  static #onLootChat(this: ToolkitApp) {
    if (this.loot) postToChat(`<h3>Treasure</h3>${lootHtml(this.loot)}`);
  }

  static #onLootJournal(this: ToolkitApp) {
    if (this.loot) createJournal(`Treasure (CR ${this.loot.cr}, ${this.loot.seed})`, lootHtml(this.loot), { kind: "loot", seed: this.loot.seed });
  }

  static async #onLootActor(this: ToolkitApp) {
    if (!this.loot) return;
    const actor = canvas.tokens?.controlled[0]?.actor ?? game.user.character;
    if (!actor) return ui.notifications.warn("Select a token (or assign yourself a character) first.");
    await giveLootToActor(this.loot, actor);
  }

  static #onHookChat(this: ToolkitApp) {
    if (this.hook) postToChat(hookHtml(this.hook), true);
  }

  static #onHookJournal(this: ToolkitApp) {
    if (this.hook) createJournal(this.hook.title, hookHtml(this.hook), { kind: "hook", seed: this.hook.seed });
  }
}

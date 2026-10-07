import {
  parsedFacts,
  parseText,
  type ParsedEntry,
  type ParsedKind,
  BASE_ARMOR,
  BASE_WEAPONS,
  DAMAGE_TYPES,
  FORGE_KINDS,
  forgedSubtitle,
  forgeItems,
  RARITIES,
  WONDROUS_SLOTS,
  type ForgedItem,
  type ForgeKind,
  type DamageType,
  type Rarity,
  addHiddenRooms,
  lightDungeon,
  type CaveOpenness,
  type DungeonLight,
  type LightAmount,
  type MonsterDensity,
  addWave,
  BATTLEMAP_SETTINGS,
  encounterSummary,
  generateBattlemap,
  generateNpc,
  NPC_RACES,
  NPC_ROLES,
  npcTraits,
  type Npc,
  type NpcRole,
  type Battlemap,
  type BattlemapSetting,
  type BattlemapSize,
  crLabel,
  DIFFICULTIES,
  encounterXp,
  rateEncounter,
  type EncounterGroup,
  formatPrice,
  generateShop,
  SETTLEMENTS,
  SHOP_TYPES,
  type Settlement,
  type Shop,
  type ShopType,
  generateCave,
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
  type MapStyle,
  type Encounter,
  type EncounterTemplate,
  type HookTone,
  type LootMode,
  type LootResult,
  type PlotHook,
  type RoomKey,
} from "@dnd-toolkit/core";
import { drawDungeon, drawDungeonOverlay } from "./render.ts";
import { drawBattlemap } from "./render-battlemap.ts";
import { createBattlemapScene } from "./importers/battlemap.ts";
import { createNpcActor, npcHtml, placeNpcToken } from "./importers/npc.ts";
import { createForgedItem, forgedHtml, giveForgedItems } from "./importers/forge.ts";
import { addParsedToActor, createParsedItems, parsedHtml } from "./importers/parsed.ts";
import { getCatalog, getMagicItems, itemFamily, type CatalogSource } from "./catalog.ts";
import { createMerchant, createShopJournal, getShopItems, itemPilesActive, shopHtml } from "./importers/shop.ts";
import { createDungeonScene } from "./importers/scene.ts";
import { createJournal, encounterHtml, hookHtml, lootHtml, postToChat } from "./importers/journal.ts";
import { giveLootToActor } from "./importers/items.ts";
import { linkEncounter, placeEncounter } from "./importers/tokens.ts";
import { esc, MODULE_ID } from "./util.ts";

const { ApplicationV2 } = foundry.applications.api;

export type Tab = "encounter" | "dungeon" | "battlemap" | "loot" | "forge" | "import" | "shop" | "npc" | "hook";

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
  dungeon: {
    seed: string;
    style: MapStyle;
    width: number;
    height: number;
    rooms: number;
    openness: CaveOpenness;
    level: number;
    size: number;
    tags: string;
    monsters: MonsterDensity;
    hidden: boolean;
    piles: boolean;
    /** Hoards hold unique forged items. */
    unique: boolean;
    lighting: LightAmount;
    /** Scene darkness in percent. */
    darkness: number;
    globalLight: boolean;
    torches: boolean;
    place: boolean;
    name: string;
  };
  battlemap: {
    seed: string;
    setting: BattlemapSetting | "random";
    size: BattlemapSize;
    night: boolean;
    name: string;
    /** Place the current encounter in the enemy zone. */
    place: boolean;
    /** Map title from the Shop tab, used for shop maps. */
    shopName: string;
  };
  loot: { seed: string; cr: number; mode: LootMode; forge: boolean };
  import: { seed: string; text: string; kind: ParsedKind | "auto" };
  forge: {
    seed: string;
    kind: ForgeKind | "random";
    rarity: Rarity | "auto";
    theme: DamageType | "random";
    base: string;
    level: number;
    count: number;
  };
  shop: { seed: string; type: ShopType; settlement: Settlement };
  npc: {
    seed: string;
    role: NpcRole | "random";
    race: string;
    /** Set by the Shop tab's "Keeper as NPC". */
    fixed: { name: string; race: string; personality: string; quirk: string; occupation: string } | null;
  };
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
    position: { width: 680, height: 760 },
    actions: {
      switchTab: ToolkitApp.#onTab,
      generate: ToolkitApp.#onGenerate,
      reroll: ToolkitApp.#onReroll,
      addTag: ToolkitApp.#onAddTag,
      detectParty: ToolkitApp.#onDetectParty,
      openDoc: ToolkitApp.#onOpenDoc,
      encPlace: ToolkitApp.#onEncPlace,
      encCombat: ToolkitApp.#onEncCombat,
      encLock: ToolkitApp.#onEncLock,
      encWave: ToolkitApp.#onEncWave,
      encWaveIn: ToolkitApp.#onEncWaveIn,
      encWaveRemove: ToolkitApp.#onEncWaveRemove,
      encChat: ToolkitApp.#onEncChat,
      encJournal: ToolkitApp.#onEncJournal,
      toScene: ToolkitApp.#onToScene,
      lootChat: ToolkitApp.#onLootChat,
      shopMerchant: ToolkitApp.#onShopMerchant,
      shopJournal: ToolkitApp.#onShopJournal,
      shopBattlemap: ToolkitApp.#onShopBattlemap,
      shopKeeper: ToolkitApp.#onShopKeeper,
      npcActor: ToolkitApp.#onNpcActor,
      importParse: ToolkitApp.#onImportParse,
      importClear: ToolkitApp.#onImportClear,
      importCreate: ToolkitApp.#onImportCreate,
      importGive: ToolkitApp.#onImportGive,
      importCreateAll: ToolkitApp.#onImportCreateAll,
      importGiveAll: ToolkitApp.#onImportGiveAll,
      forgeCreate: ToolkitApp.#onForgeCreate,
      forgeGive: ToolkitApp.#onForgeGive,
      forgeCreateAll: ToolkitApp.#onForgeCreateAll,
      forgeGiveAll: ToolkitApp.#onForgeGiveAll,
      forgeChat: ToolkitApp.#onForgeChat,
      npcToken: ToolkitApp.#onNpcToken,
      npcChat: ToolkitApp.#onNpcChat,
      npcJournal: ToolkitApp.#onNpcJournal,
      bmScene: ToolkitApp.#onBmScene,
      shopChat: ToolkitApp.#onShopChat,
      lootJournal: ToolkitApp.#onLootJournal,
      lootActor: ToolkitApp.#onLootActor,
      hookChat: ToolkitApp.#onHookChat,
      hookJournal: ToolkitApp.#onHookJournal,
    },
  };

  tab: Tab = "encounter";
  form: FormState;
  encounter: Encounter | null = null;
  /** Monster ids of encounter groups kept when generating again. */
  locked = new Set<string>();
  dungeon: { map: DungeonMap; keys: RoomKey[]; lights: DungeonLight[] } | null = null;
  battlemap: Battlemap | null = null;
  loot: LootResult | null = null;
  shop: Shop | null = null;
  forged: ForgedItem[] = [];
  parsed: ParsedEntry[] = [];
  npc: Npc | null = null;
  /** World actor made from the current NPC, so repeat clicks reuse it. */
  #npcActor: any = null;
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
      dungeon: {
        seed: "", style: "dungeon", width: 40, height: 30, rooms: 12, openness: "mixed", level: party.level, size: party.size, tags: "",
        monsters: "some", hidden: true, piles: true, unique: false, lighting: "sparse", darkness: 85, globalLight: false, torches: true, place: true, name: "",
      },
      battlemap: { seed: "", setting: "random", size: "medium", night: false, name: "", place: true, shopName: "" },
      loot: { seed: "", cr: party.level, mode: "hoard", forge: false },
      import: { seed: "", text: "", kind: "auto" },
      forge: { seed: "", kind: "random", rarity: "auto", theme: "random", base: "", level: party.level, count: 1 },
      shop: { seed: "", type: "general", settlement: "town" },
      npc: { seed: "", role: "random", race: "random", fixed: null },
      hook: { seed: "", level: party.level, tone: "any" },
    };
  }

  // --- Rendering ------------------------------------------------------------

  async _renderHTML() {
    const tabBtn = (id: Tab, label: string, icon: string) =>
      `<button type="button" class="${this.tab === id ? "active" : ""}" data-action="switchTab" data-tab="${id}"><i class="${icon}"></i> ${label}</button>`;
    const body = { encounter: () => this.#encounterHtml(), dungeon: () => this.#dungeonHtml(), battlemap: () => this.#battlemapHtml(), loot: () => this.#lootHtml(), forge: () => this.#forgeHtml(), import: () => this.#importHtml(), shop: () => this.#shopHtml(), npc: () => this.#npcHtml(), hook: () => this.#hookHtml() }[this.tab]();
    return `
      <nav class="dt-tabs">
        ${tabBtn("encounter", "Encounter", "fa-solid fa-dragon")}
        ${tabBtn("dungeon", "Dungeon", "fa-solid fa-dungeon")}
        ${tabBtn("battlemap", "Battlemap", "fa-solid fa-map-location-dot")}
        ${tabBtn("loot", "Loot", "fa-solid fa-coins")}
        ${tabBtn("forge", "Forge", "fa-solid fa-hammer")}
        ${tabBtn("import", "Import", "fa-solid fa-paste")}
        ${tabBtn("shop", "Shop", "fa-solid fa-store")}
        ${tabBtn("npc", "NPC", "fa-solid fa-user")}
        ${tabBtn("hook", "Hook", "fa-solid fa-scroll")}
      </nav>
      <section class="dt-body">${body}</section>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  _onRender() {
    const canvasEl = this.element.querySelector("canvas.dt-preview") as HTMLCanvasElement | null;
    if (canvasEl && this.dungeon) {
      drawDungeon(canvasEl, this.dungeon.map, { cell: 12, labels: true, lights: this.dungeon.lights });
      drawDungeonOverlay(canvasEl, this.dungeon.map, this.dungeon.keys, 12);
    }
    const bmCanvas = this.element.querySelector("canvas.dt-bm-preview") as HTMLCanvasElement | null;
    if (bmCanvas && this.battlemap) drawBattlemap(bmCanvas, this.battlemap, { cell: 20, preview: true });

    // Ctrl+Enter in the import box parses.
    const importBox = this.element.querySelector("textarea[name=text]") as HTMLTextAreaElement | null;
    importBox?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || !(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      this.#readForm();
      this.#parseImport();
    });

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

  #monsterRows(groups: readonly EncounterGroup[], lockable: boolean) {
    return groups
      .map((g) => {
        const locked = this.locked.has(g.monster.id);
        const lock = lockable
          ? `<button type="button" class="dt-lock ${locked ? "active" : ""}" data-action="encLock" data-id="${esc(g.monster.id)}" title="${locked ? "Locked: Generate keeps this group" : "Lock this group so Generate keeps it"}"><i class="fa-solid fa-${locked ? "lock" : "lock-open"}"></i></button>`
          : "";
        return `<li class="dt-monster">
          ${lock}
          ${g.monster.img ? `<img src="${esc(g.monster.img)}" alt="">` : `<i class="fa-solid fa-skull"></i>`}
          <span class="dt-count">${g.count}×</span>
          ${g.monster.uuid ? `<a data-action="openDoc" data-uuid="${esc(g.monster.uuid)}">${esc(g.name)}</a>` : esc(g.name)}
          <span class="dt-sub">CR ${crLabel(g.monster.cr)}${g.role ? ` · ${g.role}` : ""} · ${(g.xpEach * g.count).toLocaleString()} XP</span>
        </li>`;
      })
      .join("");
  }

  #encounterPreview(e: Encounter) {
    const ratingNote = e.rating === e.difficulty ? "" : ` <em>(asked for ${e.difficulty})</em>`;
    const allXp = encounterXp(e);
    const allRating = rateEncounter(allXp, e.partyLevel, e.partySize);
    const waves = (e.waves ?? [])
      .map((w, i) => `
        <div class="dt-wave">
          <p class="dt-enc-head"><strong>Wave ${i + 1}</strong> · round ${w.round} · ${w.xp.toLocaleString()} XP
            <button type="button" data-action="encWaveIn" data-index="${i}" title="Place visible tokens and add them to the current combat"><i class="fa-solid fa-person-running"></i> Bring in</button>
            <button type="button" data-action="encWaveRemove" data-index="${i}" title="Remove this wave"><i class="fa-solid fa-xmark"></i></button>
          </p>
          <p class="dt-sub">${esc(w.arrival)}</p>
          <ul class="dt-monsters">${this.#monsterRows(w.groups, false)}</ul>
        </div>`)
      .join("");
    return `
      <div class="dt-card">
        <p class="dt-enc-head"><strong>${esc(TEMPLATES[e.template])}</strong> · <span class="dt-rating dt-${e.rating}">${e.rating}</span>${ratingNote} · ${e.totalXp.toLocaleString()} / ${e.budget.toLocaleString()} XP</p>
        <ul class="dt-monsters">${this.#monsterRows(e.groups, true)}</ul>
        ${this.locked.size ? `<p class="dt-hint"><i class="fa-solid fa-lock"></i> Generate keeps locked groups and rebuilds the rest.</p>` : ""}
        <ul class="dt-tactics">${e.tactics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <p><strong>Situation:</strong> ${esc(e.situation)}</p>
        <p><strong>Terrain:</strong> ${esc(e.terrain)}</p>
        ${e.loot ? `<details><summary>Treasure ≈ ${e.loot.totalValueGp.toLocaleString()} gp</summary>${lootHtml(e.loot)}</details>` : ""}
        ${e.warnings.map((w) => `<p class="dt-warn">⚠ ${esc(w)}</p>`).join("")}
        ${waves ? `${waves}<p class="dt-enc-head">With waves: <span class="dt-rating dt-${allRating}">${allRating}</span> · ${allXp.toLocaleString()} XP</p>` : ""}
      </div>
      <div class="dt-row dt-actions">
        <button type="button" data-action="encPlace" title="Place hidden tokens around the center of your view"><i class="fa-solid fa-eye-slash"></i> Place hidden</button>
        <button type="button" data-action="encCombat" title="Place visible tokens, add them to combat and roll initiative"><i class="fa-solid fa-swords"></i> Place &amp; fight</button>
        <button type="button" data-action="encWave" title="Add reinforcements worth about half the budget"><i class="fa-solid fa-plus"></i> Add a wave</button>
        <button type="button" data-action="encChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
        <button type="button" data-action="encJournal"><i class="fa-solid fa-book"></i> Journal</button>
      </div>`;
  }

  #dungeonHtml() {
    const f = this.form.dungeon;
    const num = (name: "width" | "height" | "rooms", label: string, min: number, max: number) =>
      this.#field("dungeon", name, label, `<input type="number" min="${min}" max="${max}" value="${f[name]}">`);
    const check = (name: "hidden" | "piles" | "unique" | "globalLight" | "torches" | "place", label: string, title: string) =>
      `<label class="dt-check" title="${esc(title)}"><input type="checkbox" data-group="dungeon" name="${name}" ${f[name] ? "checked" : ""}> ${label}</label>`;
    const d = this.dungeon;
    const cave = f.style === "cave";
    return `
      <div class="dt-row">
        ${this.#select("dungeon", "style", "Style", [["dungeon", "Rooms & corridors"], ["cave", "Cave"]], f.style)}
        ${num("width", "Width", 16, 120)}${num("height", "Height", 12, 120)}${num("rooms", cave ? "Chambers" : "Max rooms", 2, 40)}
        ${cave ? this.#select("dungeon", "openness", "Openness", [["mixed", "Mixed"], ["open", "Open caverns"], ["tight", "Tight tunnels"]], f.openness) : ""}
      </div>
      <div class="dt-row">${this.#partyFields("dungeon")}</div>
      <div class="dt-row">
        ${this.#tagsField("dungeon", "Monster theme")}
        ${this.#select("dungeon", "monsters", "Monsters", [["few", "Few"], ["some", "Some"], ["many", "Many"]], f.monsters)}
      </div>
      <details class="dt-quick" open><summary>Lighting &amp; extras</summary>
        <div class="dt-row">
          ${this.#select("dungeon", "lighting", "Light sources", [["none", "None"], ["sparse", "Sparse"], ["lit", "Well lit"]], f.lighting)}
          ${this.#field("dungeon", "darkness", "Darkness %", `<input type="number" min="0" max="100" step="5" value="${f.darkness}">`)}
        </div>
        <div class="dt-checks">
          ${check("hidden", "Hidden rooms", "Seal a dead-end room or two behind secret doors, with treasure inside")}
          ${check("piles", "Loot piles", "Stash treasure in findable piles with a DC, pinned as GM-only notes (and hidden Item Piles piles if installed)")}
          ${check("unique", "Unique items", "Hoards hold one-of-a-kind items from the Forge instead of standard magic items")}
          ${check("torches", "Torch-bearers", "One creature in each humanoid group carries a lit torch")}
          ${check("globalLight", "Global light", "Light the whole scene regardless of darkness")}
        </div>
      </details>
      ${this.#seedRow("dungeon")}
      ${d ? `
        <div class="dt-preview-wrap"><canvas class="dt-preview"></canvas></div>
        <p class="dt-meta">${d.map.rooms.length} ${d.map.style === "cave" ? "chambers" : "rooms"} · ${d.map.walls.filter((w) => w.door && !w.secret).length} doors · ${d.map.walls.filter((w) => w.secret).length} secret · ${d.keys.filter((k) => k.encounter).length} encounters · ${d.lights.length} lights · seed <code>${esc(d.map.seed)}</code></p>
        <p class="dt-legend"><span class="dt-key dt-key-foe"></span> monster <span class="dt-key dt-key-loot"></span> loot pile <span class="dt-key dt-key-secret"></span> hidden / secret door</p>
        <details class="dt-rooms"><summary>Room by room</summary><ul>${d.keys.map((k) => this.#roomLine(k)).join("")}</ul></details>
        <div class="dt-row">
          ${this.#field("dungeon", "name", "Scene name", `<input type="text" value="${esc(f.name)}" placeholder="${d.map.style === "cave" ? "Cave" : "Dungeon"} ${esc(d.map.seed)}">`)}
          <button type="button" data-action="toScene"><i class="fa-solid fa-map"></i> Create Scene</button>
        </div>
        ${check("place", "Place monster tokens (hidden) in their rooms", "Drop each room's monsters where the red dots are")}
        <p class="dt-hint">Creates the scene with walls, doors, lights, darkness and vision, plus a GM-only room-key journal pinned as map notes (loot piles get their own pins).</p>`
      : `<p class="dt-empty">Set the options and hit Generate.</p>`}`;
  }

  #roomLine(k: RoomKey) {
    const bits = [
      k.encounter ? `${esc(encounterSummary(k.encounter))}` : "",
      k.trap ? "trap" : "",
      k.piles?.length ? `loot pile (DC ${k.piles.map((p) => p.dc).join(", ")})` : k.loot ? "treasure" : "",
    ].filter(Boolean);
    return `<li class="${k.hidden ? "dt-hidden-room" : ""}"><strong>${esc(k.title)}</strong>${bits.length ? ` · ${bits.join(" · ")}` : " · empty"}</li>`;
  }

  #battlemapHtml() {
    const f = this.form.battlemap;
    const m = this.battlemap;
    const e = this.encounter;
    const settings: [string, string][] = [["random", "Random"], ...(Object.entries(BATTLEMAP_SETTINGS) as [BattlemapSetting, { label: string }][]).map(([v, d]): [string, string] => [v, d.label])];
    const sizes: [string, string][] = [["small", "Small (20×15)"], ["medium", "Medium (28×20)"], ["large", "Large (36×26)"]];
    return `
      <div class="dt-row">
        ${this.#select("battlemap", "setting", "Setting", settings, f.setting)}
        ${this.#select("battlemap", "size", "Size", sizes, f.size)}
        <label class="dt-check"><input type="checkbox" data-group="battlemap" name="night" ${f.night ? "checked" : ""}> Night</label>
      </div>
      ${this.#seedRow("battlemap")}
      ${m ? `
        <div class="dt-preview-wrap"><canvas class="dt-preview dt-bm-preview"></canvas></div>
        <p class="dt-meta"><strong>${esc(m.title)}</strong> · ${m.width}×${m.height} squares · ${m.lights.length} lights${m.darkness ? ` · darkness ${m.darkness}` : ""} · <span class="dt-zone dt-zone-party">party start</span> <span class="dt-zone dt-zone-enemy">enemy start</span></p>
        <ul class="dt-tactics">${m.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        <label class="dt-check"><input type="checkbox" data-group="battlemap" name="place" ${f.place && e ? "checked" : ""} ${e ? "" : "disabled"}>
          ${e ? `Place the current encounter (hidden) at the enemy start: <em>${esc(encounterSummary(e))}</em>` : "Generate an encounter first to drop its monsters in too"}</label>
        <div class="dt-row">
          ${this.#field("battlemap", "name", "Scene name", `<input type="text" value="${esc(f.name)}" placeholder="${esc(m.title)}">`)}
          <button type="button" data-action="bmScene"><i class="fa-solid fa-map"></i> Create Scene</button>
        </div>
        <p class="dt-hint">Creates the scene with walls, doors, windows, lights and darkness, plus a battlefield notes journal.</p>`
      : `<p class="dt-empty">Pick a setting and hit Generate for a quick one-fight map.</p>`}`;
  }

  #lootHtml() {
    const f = this.form.loot;
    const l = this.loot;
    return `
      <div class="dt-row">
        ${this.#field("loot", "cr", "Challenge rating", `<input type="number" min="0" max="30" step="0.25" value="${f.cr}">`)}
        ${this.#select("loot", "mode", "Type", [["individual", "Individual"], ["hoard", "Hoard"]], f.mode)}
        <label class="dt-check" title="Hoard magic items are one-of-a-kind items from the Forge"><input type="checkbox" data-group="loot" name="forge" ${f.forge ? "checked" : ""}> Unique items</label>
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

  #shopHtml() {
    const f = this.form.shop;
    const s = this.shop;
    const types = (Object.entries(SHOP_TYPES) as [ShopType, { label: string }][]).map(([v, d]): [string, string] => [v, d.label]);
    const settlements = (Object.entries(SETTLEMENTS) as [Settlement, { label: string }][]).map(([v, d]): [string, string] => [v, d.label]);
    const piles = itemPilesActive();
    return `
      <div class="dt-row">
        ${this.#select("shop", "type", "Shop", types, f.type)}
        ${this.#select("shop", "settlement", "Settlement", settlements, f.settlement)}
        ${this.#select("encounter", "source", "Items from", [["compendium", "My compendiums"], ["srd", "Built-in SRD"]], this.form.encounter.source)}
      </div>
      ${this.#seedRow("shop")}
      ${s ? `
        <div class="dt-card dt-shop">
          <p class="dt-enc-head"><strong>${esc(s.name)}</strong> · ${esc(SHOP_TYPES[s.type].label.toLowerCase())} · ×${s.priceModifier} prices · haggle DC ${s.haggleDc}</p>
          <p>${esc(s.keeper.name)} (${esc(s.keeper.race)}), ${esc(s.keeper.personality)}; ${esc(s.keeper.quirk)}.</p>
          <table class="dt-stock">${s.stock.map((e) => `<tr class="${e.item.rarity ? "dt-magic" : ""}">
            <td>${e.item.uuid ? `<a data-action="openDoc" data-uuid="${esc(e.item.uuid)}">${esc(e.item.name)}</a>` : esc(e.item.name)}${e.item.rarity ? ` <em>${e.item.rarity}</em>` : ""}</td>
            <td class="dt-qty">${e.quantity}</td><td class="dt-price">${formatPrice(e.priceGp)}</td></tr>`).join("")}</table>
          <p><strong>Rumor:</strong> ${esc(s.rumor)}</p>
        </div>
        <div class="dt-row dt-actions">
          <button type="button" data-action="shopMerchant" ${piles ? "" : "disabled"} title="${piles ? "Create an Item Piles merchant players can buy from" : "Requires the Item Piles module"}"><i class="fa-solid fa-shop"></i> Item Piles merchant</button>
          <button type="button" data-action="shopKeeper" title="Flesh out the shopkeeper as an NPC with a voice, secret and actor"><i class="fa-solid fa-user"></i> Keeper NPC</button>
          <button type="button" data-action="shopBattlemap" title="Make a battlemap of this shop's floor"><i class="fa-solid fa-map-location-dot"></i> Battlemap</button>
          <button type="button" data-action="shopJournal"><i class="fa-solid fa-book"></i> Journal</button>
          <button type="button" data-action="shopChat"><i class="fa-solid fa-comment"></i> Chat</button>
        </div>`
      : `<p class="dt-empty">Pick a shop and settlement size, then generate.</p>`}`;
  }

  #forgeHtml() {
    const f = this.form.forge;
    const bases = f.kind === "weapon" ? BASE_WEAPONS.map(([n]) => n)
      : f.kind === "armor" ? BASE_ARMOR
      : f.kind === "wondrous" ? WONDROUS_SLOTS
      : f.kind === "wand" ? ["wand", "staff", "rod"]
      : [...BASE_WEAPONS.map(([n]) => n), ...BASE_ARMOR, ...WONDROUS_SLOTS, "wand", "staff", "rod"];
    const kinds: [string, string][] = [["random", "Random"], ...(Object.entries(FORGE_KINDS) as [string, string][])];
    const rarities: [string, string][] = [["auto", "By party level"], ...RARITIES.map((r): [string, string] => [r, r])];
    const themes: [string, string][] = [["random", "Random"], ...DAMAGE_TYPES.map((t): [string, string] => [t, t])];
    const cards = this.forged.map((it, i) => `
      <div class="dt-card dt-forged">
        <p class="dt-enc-head"><strong>${esc(it.name)}</strong> <span class="dt-rarity dt-r-${it.rarity.replace(" ", "-")}">${esc(it.kind === "relic" ? "artifact" : it.rarity)}</span> · ${it.valueGp.toLocaleString()} gp</p>
        ${forgedHtml(it)}
        <div class="dt-row dt-actions">
          <button type="button" data-action="forgeCreate" data-index="${i}" title="Create it in the Items sidebar and open its sheet"><i class="fa-solid fa-plus"></i> Create item</button>
          <button type="button" data-action="forgeGive" data-index="${i}" title="Add it to the selected token's (or your character's) inventory"><i class="fa-solid fa-hand-holding"></i> Give to selected</button>
        </div>
      </div>`).join("");
    return `
      <div class="dt-row">
        ${this.#select("forge", "kind", "Kind", kinds, f.kind)}
        ${this.#select("forge", "rarity", "Rarity", rarities, f.rarity)}
        ${this.#select("forge", "theme", "Theme", themes, f.theme)}
      </div>
      <div class="dt-row">
        ${this.#field("forge", "base", "Base (optional)", `<input type="text" list="dt-forge-bases" value="${esc(f.base)}" placeholder="random ${f.kind === "random" ? "item" : f.kind}">`)}
        <datalist id="dt-forge-bases">${bases.map((b) => `<option value="${esc(b)}">`).join("")}</datalist>
        ${this.#field("forge", "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
        ${this.#field("forge", "count", "How many", `<input type="number" min="1" max="10" value="${f.count}">`)}
      </div>
      ${this.#seedRow("forge")}
      ${this.forged.length ? `
        ${this.forged.length > 1 ? `<div class="dt-row dt-actions">
          <button type="button" data-action="forgeCreateAll"><i class="fa-solid fa-boxes-stacked"></i> Create all</button>
          <button type="button" data-action="forgeGiveAll"><i class="fa-solid fa-sack"></i> Give all to selected</button>
          <button type="button" data-action="forgeChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
        </div>` : `<div class="dt-row dt-actions"><button type="button" data-action="forgeChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button></div>`}
        ${cards}
        <p class="dt-hint">Items are real dnd5e items: magic bonus, extra damage, charges with a save button, and Active Effects that switch on when attuned. Tip: the Loot tab's and dungeon's "Unique items" boxes forge hoard items automatically.</p>`
      : `<p class="dt-empty">Pick a kind (or leave it random) and hit Generate. Set "How many" to forge a whole hoard at once.</p>`}`;
  }

  #importHtml() {
    const f = this.form.import;
    const kinds: [string, string][] = [["auto", "Detect"], ["spell", "Spell"], ["item", "Magic item"], ["action", "Monster action(s)"], ["feature", "Feature / feat"]];
    const cards = this.parsed.map((e, i) => `
      <div class="dt-card dt-parsed">
        <div class="dt-row">
          ${`<label class="dt-field"><span>Name</span><input type="text" class="dt-parsed-name" data-index="${i}" value="${esc(e.name)}"></label>`}
          <span class="dt-kind">${esc(e.kind)}</span>
        </div>
        <dl class="dt-facts">${parsedFacts(e).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") || "<dt>Mechanics</dt><dd>none found (text only)</dd>"}</dl>
        ${e.warnings.map((w) => `<p class="dt-warn">⚠ ${esc(w)}</p>`).join("")}
        <details><summary>Description</summary>${parsedHtml(e)}</details>
        <div class="dt-row dt-actions">
          <button type="button" data-action="importCreate" data-index="${i}"><i class="fa-solid fa-plus"></i> Create item</button>
          <button type="button" data-action="importGive" data-index="${i}" title="Add to the selected token's (or your character's) sheet"><i class="fa-solid fa-user-plus"></i> Add to selected</button>
        </div>
      </div>`).join("");
    return `
      <label class="dt-field"><span>Paste a spell, magic item, monster action(s) or feature straight from the book</span>
        <textarea data-group="import" name="text" rows="9" placeholder="Fireball&#10;3rd-level evocation&#10;Casting Time: 1 action&#10;Range: 150 feet&#10;...">${esc(f.text)}</textarea></label>
      <div class="dt-row">
        ${this.#select("import", "kind", "Read it as", kinds, f.kind)}
        <button type="button" data-action="importParse" title="Ctrl+Enter in the text box"><i class="fa-solid fa-wand-magic-sparkles"></i> Parse</button>
        <button type="button" data-action="importClear"><i class="fa-solid fa-eraser"></i> Clear</button>
      </div>
      ${this.parsed.length > 1 ? `<div class="dt-row dt-actions">
        <button type="button" data-action="importCreateAll"><i class="fa-solid fa-boxes-stacked"></i> Create all ${this.parsed.length}</button>
        <button type="button" data-action="importGiveAll"><i class="fa-solid fa-user-plus"></i> Add all to selected</button>
      </div>` : ""}
      ${cards || `<p class="dt-empty">Works with 2014 and 2024 book layouts and D&D Beyond copy. Spells get level, school, components, range, area, duration, save or attack, damage and upcasting; items get rarity, attunement, +X bonus, charges and Active Effects; a statblock's actions become attacks with their to-hit and damage. Check the summary, fix the name if needed, then create.</p>`}`;
  }

  /** Copy edited names from the import cards back into the parsed entries. */
  #syncParsedNames() {
    for (const input of this.element.querySelectorAll("input.dt-parsed-name") as NodeListOf<HTMLInputElement>) {
      const e = this.parsed[Number(input.dataset.index)];
      if (e && input.value.trim()) e.name = input.value.trim();
    }
  }

  #npcHtml() {
    const f = this.form.npc;
    const n = this.npc;
    const roles: [string, string][] = [["random", "Random"], ...(Object.entries(NPC_ROLES) as [NpcRole, { label: string }][]).map(([v, d]): [string, string] => [v, d.label])];
    const races: [string, string][] = [["random", "Random"], ...NPC_RACES.map((r): [string, string] => [r, r])];
    return `
      <div class="dt-row">
        ${this.#select("npc", "role", "Role", roles, f.role)}
        ${this.#select("npc", "race", "Race", races, f.race)}
      </div>
      ${f.fixed ? `<p class="dt-hint"><i class="fa-solid fa-store"></i> Keeping the shopkeeper ${esc(f.fixed.name)}. Change role or race to roll a new NPC.</p>` : ""}
      ${this.#seedRow("npc")}
      ${n ? `
        <div class="dt-card">
          <p class="dt-enc-head"><strong>${esc(n.name)}</strong> · ${esc(n.age)} ${esc(n.race)} ${esc(n.occupation)}</p>
          <ul class="dt-npc">${npcTraits(n).map(([label, text, gm]) => `<li class="${gm ? "dt-gm" : ""}"><strong>${esc(label)}${gm ? " (GM)" : ""}:</strong> ${esc(text)}</li>`).join("")}</ul>
        </div>
        <div class="dt-row dt-actions">
          <button type="button" data-action="npcActor" title="Copy the ${esc(n.statblock)} statblock as a named actor with this NPC in its biography"><i class="fa-solid fa-user-plus"></i> Create actor</button>
          <button type="button" data-action="npcToken" title="Create the actor (once) and drop its token at the center of your view"><i class="fa-solid fa-location-dot"></i> Place token</button>
          <button type="button" data-action="npcChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
          <button type="button" data-action="npcJournal"><i class="fa-solid fa-book"></i> Journal</button>
        </div>`
      : `<p class="dt-empty">Pick a role (or leave it random) and generate someone to talk to.</p>`}`;
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
        const locked = this.encounter?.groups.filter((g) => this.locked.has(g.monster.id)) ?? [];
        const race = locked.length ? this.encounter!.race : undefined;
        const e = generateEncounter({ seed, catalog, magicItems, partyLevel: f.level, partySize: f.size, difficulty: f.difficulty, template: f.template, tags: f.tags, loot: f.loot, locked, race });
        this.locked = new Set(locked.map((g) => g.monster.id));
        this.encounter = await linkEncounter(e);
      } else if (group === "dungeon") {
        const f = this.form.dungeon;
        const source = this.form.encounter.source;
        const [catalog, magicItems] = await Promise.all([getCatalog(source), getMagicItems(source)]);
        let map = f.style === "cave"
          ? generateCave({ seed, width: f.width, height: f.height, chambers: f.rooms, openness: f.openness })
          : generateDungeon({ seed, width: f.width, height: f.height, maxRooms: f.rooms });
        if (f.hidden) map = addHiddenRooms(map, map.rooms.length >= 10 ? 2 : 1);
        const keys = stockDungeon(map, { partyLevel: f.level, partySize: f.size, tags: f.tags, catalog, magicItems, monsters: f.monsters, lootPiles: f.piles, uniqueItems: f.unique });
        this.dungeon = { map, keys, lights: lightDungeon(map, keys, { amount: f.lighting }) };
      } else if (group === "battlemap") {
        const f = this.form.battlemap;
        this.battlemap = generateBattlemap({ seed, setting: f.setting, size: f.size, night: f.night, title: f.setting === "shop" && f.shopName ? f.shopName : undefined });
      } else if (group === "forge") {
        const f = this.form.forge;
        this.forged = forgeItems(f.count, { seed, kind: f.kind, rarity: f.rarity, theme: f.theme, base: f.base, partyLevel: f.level });
      } else if (group === "npc") {
        const f = this.form.npc;
        if (f.fixed && (f.role !== "merchant" || f.race !== f.fixed.race)) f.fixed = null;
        const fixed = f.fixed;
        this.npc = generateNpc({
          seed,
          role: fixed ? "merchant" : f.role,
          race: fixed?.race ?? f.race,
          name: fixed?.name,
          traits: fixed ? { personality: fixed.personality, quirk: fixed.quirk, occupation: fixed.occupation } : undefined,
        });
        this.#npcActor = null;
      } else if (group === "shop") {
        const f = this.form.shop;
        const items = this.form.encounter.source === "srd" ? undefined : await getShopItems(itemFamily);
        this.shop = generateShop({ seed, type: f.type, settlement: f.settlement, items });
      } else if (group === "loot") {
        const magicItems = await getMagicItems(this.form.encounter.source);
        this.loot = generateLoot({ seed, cr: this.form.loot.cr, mode: this.form.loot.mode, magicItems, forge: this.form.loot.forge });
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

  static async #onOpenDoc(this: ToolkitApp, _e: Event, target: HTMLElement) {
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

  static #onEncLock(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const id = target.dataset.id!;
    if (!this.locked.delete(id)) this.locked.add(id);
    this.#readForm();
    this.render();
  }

  static #onEncWave(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const e = this.encounter;
    if (!e) return;
    this.#run(target, async () => {
      const catalog = await getCatalog(this.form.encounter.source);
      this.encounter = await linkEncounter(addWave(e, { catalog }));
      this.#readForm();
      this.render();
    });
  }

  static #onEncWaveIn(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const wave = this.encounter?.waves?.[Number(target.dataset.index)];
    if (wave) this.#run(target, () => placeEncounter(wave, { hidden: false, startCombat: true }));
  }

  static #onEncWaveRemove(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const e = this.encounter;
    if (!e?.waves) return;
    const waves = e.waves.filter((_, i) => i !== Number(target.dataset.index));
    this.encounter = { ...e, waves: waves.length ? waves : undefined };
    this.#readForm();
    this.render();
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
      const f = this.form.dungeon;
      const scene = await createDungeonScene(d.map, {
        name: f.name || undefined,
        roomKey: d.keys,
        placeMonsters: f.place,
        lights: d.lights,
        darkness: Math.max(0, Math.min(100, f.darkness)) / 100,
        globalLight: f.globalLight,
        torchBearers: f.torches,
      });
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

  static #onShopMerchant(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const s = this.shop;
    if (s) this.#run(target, () => createMerchant(s));
  }

  static #onShopBattlemap(this: ToolkitApp) {
    if (!this.shop) return;
    this.#readForm();
    Object.assign(this.form.battlemap, { setting: "shop", shopName: this.shop.name, seed: "", name: "" });
    this.tab = "battlemap";
    this.#generate("battlemap");
  }

  static #onBmScene(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const m = this.battlemap;
    if (!m) return;
    this.#readForm();
    const f = this.form.battlemap;
    this.#run(target, async () => {
      const scene = await createBattlemapScene(m, { name: f.name || undefined, encounter: f.place ? this.encounter : null });
      ui.notifications.info(`Created scene "${scene.name}".`);
    });
  }

  static #onShopKeeper(this: ToolkitApp) {
    const s = this.shop;
    if (!s) return;
    this.#readForm();
    const k = s.keeper;
    const occupation = `owner of ${s.name}`;
    Object.assign(this.form.npc, { seed: "", role: "merchant", race: k.race, fixed: { name: k.name, race: k.race, personality: k.personality, quirk: k.quirk, occupation } });
    this.tab = "npc";
    this.#generate("npc");
  }

  /** The current NPC's world actor, created on first use. */
  async #ensureNpcActor() {
    if (!this.#npcActor || !game.actors.get(this.#npcActor.id)) this.#npcActor = await createNpcActor(this.npc!);
    return this.#npcActor;
  }

  static #onNpcActor(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    if (!this.npc) return;
    this.#run(target, async () => (await this.#ensureNpcActor())?.sheet?.render(true));
  }

  static #onNpcToken(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    if (!this.npc) return;
    this.#run(target, async () => placeNpcToken(await this.#ensureNpcActor()));
  }

  /** The selected token's actor, or the user's own character. */
  #recipient() {
    const actor = canvas.tokens?.controlled[0]?.actor ?? game.user.character;
    if (!actor) ui.notifications.warn("Select a token (or assign yourself a character) first.");
    return actor;
  }

  #parseImport() {
    this.parsed = parseText(this.form.import.text, this.form.import.kind);
    if (!this.parsed.length) ui.notifications.warn("Nothing to parse: paste some text first.");
    this.render();
  }

  static #onImportParse(this: ToolkitApp) {
    this.#readForm();
    this.#parseImport();
  }

  static #onImportClear(this: ToolkitApp) {
    this.form.import.text = "";
    this.parsed = [];
    this.render();
  }

  static #onImportCreate(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#syncParsedNames();
    const e = this.parsed[Number(target.dataset.index)];
    if (e) this.#run(target, () => createParsedItems([e]));
  }

  static #onImportGive(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#syncParsedNames();
    const e = this.parsed[Number(target.dataset.index)];
    const actor = e && this.#recipient();
    if (actor) this.#run(target, () => addParsedToActor([e], actor));
  }

  static #onImportCreateAll(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#syncParsedNames();
    this.#run(target, () => createParsedItems(this.parsed));
  }

  static #onImportGiveAll(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#syncParsedNames();
    const actor = this.parsed.length && this.#recipient();
    if (actor) this.#run(target, () => addParsedToActor(this.parsed, actor));
  }

  static #onForgeCreate(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const it = this.forged[Number(target.dataset.index)];
    if (it) this.#run(target, () => createForgedItem(it));
  }

  static #onForgeGive(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const it = this.forged[Number(target.dataset.index)];
    const actor = it && this.#recipient();
    if (actor) this.#run(target, () => giveForgedItems([it], actor));
  }

  static #onForgeCreateAll(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#run(target, async () => {
      for (const it of this.forged) await createForgedItem(it, { render: false });
      ui.notifications.info(`Created ${this.forged.length} items in the DnD Toolkit folder.`);
    });
  }

  static #onForgeGiveAll(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const actor = this.forged.length && this.#recipient();
    if (actor) this.#run(target, () => giveForgedItems(this.forged, actor));
  }

  static #onForgeChat(this: ToolkitApp) {
    if (this.forged.length) postToChat(this.forged.map((it) => `<h3>${esc(it.name)}</h3>${forgedHtml(it)}`).join(""), true);
  }

  static #onNpcChat(this: ToolkitApp) {
    if (this.npc) postToChat(npcHtml(this.npc), true);
  }

  static #onNpcJournal(this: ToolkitApp) {
    if (this.npc) createJournal(this.npc.name, npcHtml(this.npc, { heading: false }), { kind: "npc", seed: this.npc.seed });
  }

  static #onShopJournal(this: ToolkitApp) {
    if (this.shop) createShopJournal(this.shop);
  }

  static #onShopChat(this: ToolkitApp) {
    if (this.shop) postToChat(`<h3>${esc(this.shop.name)}</h3>${shopHtml(this.shop)}`);
  }

  static #onHookChat(this: ToolkitApp) {
    if (this.hook) postToChat(hookHtml(this.hook), true);
  }

  static #onHookJournal(this: ToolkitApp) {
    if (this.hook) createJournal(this.hook.title, hookHtml(this.hook), { kind: "hook", seed: this.hook.seed });
  }
}

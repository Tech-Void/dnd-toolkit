import {
  generateHandout,
  generatePuzzle,
  generateTrap,
  trapText,
  type Handout,
  type HandoutKind,
  type Puzzle,
  type Trap,
  type TrapKind,
  type TrapSeverity,
  planJourney,
  rerollDay,
  TERRAINS,
  type Climate,
  type Journey,
  type Pace,
  type Season,
  type Terrain,
  type TravelDay,
  generateTown,
  type Town,
  QUEST_TYPES,
  type QuestMode,
  generateSideQuest,
  rerollMission,
  type Mission,
  type SideQuest,
  curseItem,
  liftCurse,
  blankItem,
  blankPower,
  composeHookText,
  EFFECT_CATALOG,
  HOOK_TONES,
  rerollHookPart,
  type Ability,
  type CurseChance,
  type HookPart,
  type PowerKind,
  looksLikeStatblock,
  parseStatblock,
  type ParsedStatblock,
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
  placePuzzle,
  bindHook,
  bindSideQuest,
  fromTown,
  npcRecord,
  questFromHook,
  register,
  type FightLayout,
  DUNGEON_THEMES,
  furnishDungeon,
  type DungeonTheme,
  newCamp,
  AMMO_FORMS,
  CONSUMABLE_KINDS,
  CREATURE_TYPES,
  lockDoors,
  POTION_FORMS,
  type LockAmount,
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
import { drawDungeon, drawDungeonOverlay, drawInteractiveMarks } from "./render.ts";
import { drawBattlemap } from "./render-battlemap.ts";
import { battlemapArt, dungeonArt, type DungeonArt, type MapArt } from "./fa-assets.ts";
import { createBattlemapScene } from "./importers/battlemap.ts";
import { createNpcActor, npcHtml, placeNpcToken } from "./importers/npc.ts";
import { createForgedItem, forgedHtml, giveForgedItems } from "./importers/forge.ts";
import { addParsedToActor, createParsedItems, parsedHtml } from "./importers/parsed.ts";
import { createStatblockActor } from "./importers/statblock.ts";
import { CampApp } from "./camp-app.ts";
import { getCampaign, saveCampaign, updateCampaign } from "./campaign-store.ts";
import { bindCampaignInputs, campaignAction, campaignHtml, type CampaignView } from "./campaign-ui.ts";
import { currentDay, getCamp, startCamp } from "./downtime.ts";
import { ProjectsApp } from "./projects-app.ts";
import { ABILITIES, partyActors, passives, requests, rollForThem, rollLabel, sendRollRequest, SKILLS, summarize, type RollRequest } from "./rolls.ts";
import { journeyHtml, sideQuestHtml } from "./importers/journal.ts";
import { createTownJournal, createTownScene } from "./importers/town.ts";
import { createHandoutJournal, showToPlayers } from "./importers/handout.ts";
import { drawHandout } from "./render-handout.ts";
import { getCatalog, getMagicItems, itemFamily, type CatalogSource } from "./catalog.ts";
import { createMerchant, createShopJournal, getShopItems, itemPilesActive, shopHtml } from "./importers/shop.ts";
import { createDungeonScene } from "./importers/scene.ts";
import { createJournal, encounterHtml, hookHtml, lootHtml, postToChat } from "./importers/journal.ts";
import { giveLootToActor } from "./importers/items.ts";
import { linkEncounter, placeEncounter } from "./importers/tokens.ts";
import { esc, MODULE_ID } from "./util.ts";

const { ApplicationV2 } = foundry.applications.api;

export type Tab = "encounter" | "dungeon" | "battlemap" | "loot" | "forge" | "import" | "shop" | "npc" | "hook" | "sidequest" | "rolls" | "town" | "travel" | "traps" | "handouts" | "camp" | "campaign";

interface FormState {
  camp: {
    seed: string;
    terrain: Terrain;
    climate: Climate;
    season: Season;
    frequency: "rare" | "normal" | "frequent";
    foes: string;
    food: boolean;
    /** Characters left out of camp. */
    away: string;
  };
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
    curse: CurseChance;
    shift: string;
    locks: LockAmount;
    /** Rooms with a purpose: a theme, or "none" for bare rooms. */
    theme: DungeonTheme | "auto" | "none";
    /** A lever, plate, statue or rune puzzle that opens a sealed door. */
    puzzle: boolean;
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
    /** Hide traps where they fit (camps, roads, ruins, caves). */
    traps: boolean;
    /** Lock storerooms, back doors and houses. */
    locks: boolean;
    /** Raised ledges and outcrops. */
    elevation: boolean;
    layout: FightLayout | "random";
  };
  loot: { seed: string; cr: number; mode: LootMode; forge: boolean; curse: CurseChance; theme: string };
  import: { seed: string; text: string; kind: ParsedKind | "statblock" | "auto" };
  town: { seed: string; size: Settlement; name: string; level: number; night: boolean };
  traps: { seed: string; level: number; severity: TrapSeverity | "random"; kind: TrapKind | "any"; puzzle: "riddle" | "mechanism" | "any" };
  handouts: { seed: string; kind: HandoutKind | "random"; useQuest: boolean };
  travel: { seed: string; from: string; to: string; days: number; terrain: Terrain; climate: Climate; season: Season; pace: Pace; level: number; size: number; foes: string; frequency: "rare" | "normal" | "frequent"; shift: string };
  sidequest: { seed: string; mode: QuestMode; archetype: string; keyword: string; level: number; size: number; tone: HookTone; length: number; foes: string; boss: string; shift: string };
  rolls: {
    seed: string;
    prompt: string;
    /** "skill:prc", "save:dex" or "check:str". */
    roll: string;
    dc: number;
    showDc: boolean;
    advantage: RollRequest["advantage"];
    rollMode: RollRequest["rollMode"];
  };
  forge: {
    seed: string;
    curse: CurseChance;
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
  hook: { seed: string; level: number; tone: HookTone; campaign: boolean };
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

/** [label, prompt, roll, DC, roll mode] for one-click roll requests. */
const ROLL_PRESETS: [string, string, string, number, "publicroll" | "gmroll" | "blindroll"][] = [
  ["Spot the ambush", "Something feels wrong about this stretch of road.", "skill:prc", 13, "gmroll"],
  ["Sneak past", "You need to get past without being noticed.", "skill:ste", 13, "publicroll"],
  ["Find the way", "The trail has gone cold and the light is failing.", "skill:sur", 12, "publicroll"],
  ["Read their intent", "Something about their story doesn't sit right.", "skill:ins", 14, "blindroll"],
  ["Search the room", "You take a careful look around.", "skill:inv", 13, "gmroll"],
  ["Dodge the trap", "Click. The floor shifts under your feet.", "save:dex", 14, "publicroll"],
  ["Resist the poison", "A bitter taste lingers after that last sip.", "save:con", 13, "publicroll"],
  ["Hold your nerve", "A wave of dread rolls over you.", "save:wis", 13, "publicroll"],
  ["Recall lore", "You've heard of this before, haven't you?", "skill:his", 12, "publicroll"],
  ["Force it open", "It's stuck fast.", "skill:ath", 15, "publicroll"],
];

/** Sidebar: groups of ribbons, each group with its own color. */
const NAV: [group: string, color: string, tabs: [Tab, string, string][]][] = [
  ["Encounters", "#b5452f", [["encounter", "Encounter", "fa-dragon"], ["npc", "NPC", "fa-user"]]],
  ["Maps", "#3a7a5c", [["dungeon", "Dungeon", "fa-dungeon"], ["battlemap", "Battlemap", "fa-map-location-dot"]]],
  ["World", "#8a6a3a", [["town", "Settlement", "fa-city"], ["travel", "Travel", "fa-route"]]],
  ["Treasure", "#b8862b", [["loot", "Loot", "fa-coins"], ["forge", "Forge", "fa-hammer"], ["shop", "Shop", "fa-store"]]],
  ["Story", "#6a4c9c", [["hook", "Plot Hook", "fa-scroll"], ["sidequest", "Side Quest", "fa-signs-post"], ["campaign", "Campaign", "fa-landmark-flag"]]],
  ["At the table", "#2f8a8a", [["rolls", "Roll Requests", "fa-dice-d20"], ["traps", "Traps & Puzzles", "fa-skull-crossbones"], ["handouts", "Handouts", "fa-scroll"]]],
  ["Downtime", "#7a5a2f", [["camp", "Camp & Projects", "fa-campground"]]],
  ["Tools", "#3d6a94", [["import", "Import", "fa-paste"]]],
];

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
    position: { width: 820, height: 780 },
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
      questMap: ToolkitApp.#onQuestMap,
      townNpc: ToolkitApp.#onTownNpc,
      travelCheck: ToolkitApp.#onTravelCheck,
      trapRoll: ToolkitApp.#onTrapRoll,
      trapAsk: ToolkitApp.#onTrapAsk,
      trapChat: ToolkitApp.#onTrapChat,
      puzzleRoll: ToolkitApp.#onPuzzleRoll,
      puzzleShow: ToolkitApp.#onPuzzleShow,
      puzzleHint: ToolkitApp.#onPuzzleHint,
      handoutShow: ToolkitApp.#onHandoutShow,
      handoutJournal: ToolkitApp.#onHandoutJournal,
      travelFight: ToolkitApp.#onTravelFight,
      travelMap: ToolkitApp.#onTravelMap,
      travelQuest: ToolkitApp.#onTravelQuest,
      travelReroll: ToolkitApp.#onTravelReroll,
      travelJournal: ToolkitApp.#onTravelJournal,
      travelChat: ToolkitApp.#onTravelChat,
      travelCamp: ToolkitApp.#onTravelCamp,
      makeCamp: ToolkitApp.#onMakeCamp,
      openCamp: () => CampApp.open(),
      openProjects: () => ProjectsApp.open(),
      forgeCraft: ToolkitApp.#onForgeCraft,
      campaign: ToolkitApp.#onCampaign,
      campTrack: ToolkitApp.#onCampTrack,
      townShop: ToolkitApp.#onTownShop,
      townTrouble: ToolkitApp.#onTownTrouble,
      townScene: ToolkitApp.#onTownScene,
      townJournal: ToolkitApp.#onTownJournal,
      questEncounter: ToolkitApp.#onQuestEncounter,
      questNpc: ToolkitApp.#onQuestNpc,
      questLoot: ToolkitApp.#onQuestLoot,
      questCheck: ToolkitApp.#onQuestCheck,
      questReroll: ToolkitApp.#onQuestReroll,
      questJournal: ToolkitApp.#onQuestJournal,
      questChat: ToolkitApp.#onQuestChat,
      rollPreset: ToolkitApp.#onRollPreset,
      rollSend: ToolkitApp.#onRollSend,
      rollForThem: ToolkitApp.#onRollForThem,
      encAskRoll: ToolkitApp.#onEncAskRoll,
      importClear: ToolkitApp.#onImportClear,
      importCreate: ToolkitApp.#onImportCreate,
      importActor: ToolkitApp.#onImportActor,
      importActorPlace: ToolkitApp.#onImportActorPlace,
      importGive: ToolkitApp.#onImportGive,
      importCreateAll: ToolkitApp.#onImportCreateAll,
      importGiveAll: ToolkitApp.#onImportGiveAll,
      forgeCreate: ToolkitApp.#onForgeCreate,
      forgeEdit: ToolkitApp.#onForgeEdit,
      forgeCurse: ToolkitApp.#onForgeCurse,
      forgeEditorCurse: ToolkitApp.#onForgeEditorCurse,
      forgeEditorLift: ToolkitApp.#onForgeEditorLift,
      forgeNew: ToolkitApp.#onForgeNew,
      forgeSave: ToolkitApp.#onForgeSave,
      forgeCancel: ToolkitApp.#onForgeCancel,
      forgeEffectAdd: ToolkitApp.#onForgeEffectAdd,
      forgeEffectRemove: ToolkitApp.#onForgeEffectRemove,
      hookReroll: ToolkitApp.#onHookReroll,
      hookRebuild: ToolkitApp.#onHookRebuild,
      hookBlank: ToolkitApp.#onHookBlank,
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
  /** Index of the forged item open in the editor. */
  #forgeEditing: number | null = null;
  parsed: ParsedEntry[] = [];
  sidequest: SideQuest | null = null;
  town: Town | null = null;
  journey: Journey | null = null;
  trap: Trap | null = null;
  puzzle: Puzzle | null = null;
  /** How many of the puzzle's hints are showing. */
  #hintsShown = 0;
  handout: Handout | null = null;
  /** Encounters rolled for side quest missions, by mission id, and the tags that worked. */
  missionEncounters = new Map<string, Encounter>();
  missionTags = new Map<string, string>();
  /** Set by the dice button so a keyword quest rolls a variation instead of its fixed seed. */
  #questVariation = false;
  /** Monsters used recently by any generator, newest first; every generator avoids them. */
  #recent: string[] = (() => {
    try {
      return (game.settings.get(MODULE_ID, "recentMonsters") as string[]) ?? [];
    } catch {
      return [];
    }
  })();

  #remember(...encounters: (Encounter | undefined)[]) {
    const ids = encounters.flatMap((e) => e?.groups.map((g) => g.monster.id) ?? []);
    if (!ids.length) return;
    this.#recent = [...new Set([...ids, ...this.#recent])].slice(0, 60);
    game.settings.set(MODULE_ID, "recentMonsters", this.#recent).catch(() => {});
  }

  /** Characters unticked in the roll request list. */
  #rollSkip = new Set<string>();
  statblock: ParsedStatblock | null = null;
  npc: Npc | null = null;
  /** World actor made from the current NPC, so repeat clicks reuse it. */
  #npcActor: any = null;
  hook: PlotHook | null = null;
  /** Tag suggestions for the datalist, loaded from the catalog on first use. */
  tagList: string[] | null = null;
  #tagListLoading = false;

  constructor(options = {}) {
    super(options);
    Hooks.on(`${MODULE_ID}.rollsChanged`, () => {
      if (this.rendered && this.tab === "rolls") this.render();
    });
    const party = detectParty() ?? { level: 3, size: 4 };
    const hasActorPacks = [...game.packs].some((p: any) => p.documentName === "Actor");
    this.form = {
      encounter: { seed: "", level: party.level, size: party.size, difficulty: "moderate", template: "auto", tags: "", source: hasActorPacks ? "compendium" : "srd", loot: true },
      dungeon: {
        seed: "", style: "dungeon", width: 40, height: 30, rooms: 12, openness: "mixed", level: party.level, size: party.size, tags: "",
        monsters: "some", hidden: true, piles: true, unique: false, curse: "sometimes", shift: "0", locks: "some", theme: "auto", puzzle: true, lighting: "sparse", darkness: 85, globalLight: false, torches: true, place: true, name: "",
      },
      battlemap: { seed: "", setting: "random", size: "medium", night: false, name: "", place: true, shopName: "", traps: true, locks: true, elevation: true, layout: "standoff" },
      loot: { seed: "", cr: party.level, mode: "hoard", forge: false, curse: "never", theme: "" },
      import: { seed: "", text: "", kind: "auto" },
      town: { seed: "", size: "village", name: "", level: party.level, night: false },
      traps: { seed: "", level: party.level, severity: "random", kind: "any", puzzle: "any" },
      handouts: { seed: "", kind: "random", useQuest: true },
      travel: { seed: "", from: "", to: "", days: 3, terrain: "road", climate: "temperate", season: "summer", pace: "normal", level: party.level, size: party.size, foes: "", frequency: "normal", shift: "0" },
      sidequest: { seed: "", mode: "premade", archetype: "", keyword: "", level: party.level, size: party.size, tone: "any", length: 3, foes: "", boss: "", shift: "0" },
      rolls: { seed: "", prompt: "", roll: "skill:prc", dc: 13, showDc: false, advantage: "normal", rollMode: "publicroll" },
      camp: { seed: "", terrain: "forest", climate: "temperate", season: "summer", frequency: "normal", foes: "", food: false, away: "" },
      forge: { seed: "", curse: "never", kind: "random", rarity: "auto", theme: "random", base: "", level: party.level, count: 1 },
      shop: { seed: "", type: "general", settlement: "town" },
      npc: { seed: "", role: "random", race: "random", fixed: null },
      hook: { seed: "", level: party.level, tone: "any", campaign: true },
    };
  }

  // --- Rendering ------------------------------------------------------------

  async _renderHTML() {
    const ribbon = (id: Tab, label: string, icon: string) =>
      `<button type="button" class="dt-ribbon ${this.tab === id ? "active" : ""}" data-action="switchTab" data-tab="${id}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`;
    const body = { encounter: () => this.#encounterHtml(), dungeon: () => this.#dungeonHtml(), battlemap: () => this.#battlemapHtml(), loot: () => this.#lootHtml(), forge: () => this.#forgeHtml(), import: () => this.#importHtml(), sidequest: () => this.#sideQuestHtml(), town: () => this.#townHtml(), travel: () => this.#travelHtml(), camp: () => this.#campHtml(), campaign: () => campaignHtml(this.#campView, this.#campFilter), traps: () => this.#trapsHtml(), handouts: () => this.#handoutsHtml(), rolls: () => this.#rollsHtml(), shop: () => this.#shopHtml(), npc: () => this.#npcHtml(), hook: () => this.#hookHtml() }[this.tab]();
    const groups = NAV.map(([group, color, tabs]) => `
      <div class="dt-group" style="--ribbon: ${color}">
        <h4>${group}</h4>
        ${tabs.map(([id, label, icon]) => ribbon(id, label, icon)).join("")}
      </div>`).join("");
    return `<div class="dt-shell"><nav class="dt-side">${groups}</nav><section class="dt-body">${body}</section></div>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  _onRender() {
    const canvasEl = this.element.querySelector("canvas.dt-preview") as HTMLCanvasElement | null;
    if (canvasEl && this.dungeon) {
      const d = this.dungeon;
      const paint = (art: DungeonArt | null) => {
        drawDungeon(canvasEl, d.map, { cell: 12, labels: true, lights: d.lights, art, keys: d.keys });
        drawDungeonOverlay(canvasEl, d.map, d.keys, 12);
      };
      paint(null);
      dungeonArt(d.map, d.keys).then((art) => art && this.dungeon === d && canvasEl.isConnected && paint(art));
    }
    const handoutCanvas = this.element.querySelector("canvas.dt-handout-preview") as HTMLCanvasElement | null;
    if (handoutCanvas && this.handout) drawHandout(handoutCanvas, this.handout);
    const townCanvas = this.element.querySelector("canvas.dt-town-preview") as HTMLCanvasElement | null;
    if (townCanvas && this.town) {
      const t = this.town;
      drawBattlemap(townCanvas, t.map, { cell: 12, roofs: true, labels: true });
      battlemapArt(t.map).then((art) => art && this.town === t && townCanvas.isConnected
        && drawBattlemap(townCanvas, t.map, { cell: 12, roofs: true, labels: true, textures: art.textures, props: art.props, treeShadows: art.treeShadows, decor: art.decor, roofArt: art.roofs, wallArt: art.walls, lightArt: art.lights }));
    }
    const bmCanvas = this.element.querySelector("canvas.dt-bm-preview") as HTMLCanvasElement | null;
    if (bmCanvas && this.battlemap) {
      const m = this.battlemap;
      const paint = (art: MapArt | null) => {
        drawBattlemap(bmCanvas, m, { cell: 20, preview: true, textures: art?.textures, props: art?.props, treeShadows: art?.treeShadows, decor: art?.decor, wallArt: art?.walls, lightArt: art?.lights });
        drawInteractiveMarks(bmCanvas.getContext("2d")!, (m.traps ?? []).map((t) => t.cells), m.walls, 20);
      };
      paint(null);
      battlemapArt(m).then((art) => art && this.battlemap === m && bmCanvas.isConnected && paint(art));
    }

    if (this.tab === "campaign") bindCampaignInputs(this.element, () => this.render(), (v) => (this.#campFilter = v));
    for (const box of this.element.querySelectorAll("input[data-camper]") as NodeListOf<HTMLInputElement>) {
      box.addEventListener("change", () => {
        const away = new Set(this.form.camp.away.split(",").filter(Boolean));
        if (box.checked) away.delete(box.dataset.camper!);
        else away.add(box.dataset.camper!);
        this.form.camp.away = [...away].join(",");
        const hidden = this.element.querySelector('input[data-group="camp"][name="away"]') as HTMLInputElement | null;
        if (hidden) hidden.value = this.form.camp.away;
      });
    }

    // Fields that change what else the form shows re-render it straight away.
    for (const el of this.element.querySelectorAll('select[data-group="sidequest"][name="mode"], select[data-group="dungeon"][name="style"]') as NodeListOf<HTMLSelectElement>) {
      el.addEventListener("change", () => {
        this.#readForm();
        this.render();
      });
    }

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

    if (["encounter", "dungeon", "sidequest", "travel"].includes(this.tab) && !this.tagList && !this.#tagListLoading) {
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

  /** Autocomplete for tag boxes, from the monsters you have. */
  #tagDatalist() {
    return this.tagList ? `<datalist id="dt-taglist">${this.tagList.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>` : "";
  }

  #tagsField(group: "encounter" | "dungeon", label: string) {
    const datalist = this.#tagDatalist();
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
        <button type="button" data-action="encAskRoll" title="Ask the players for the roll this situation calls for (e.g. Perception against the ambush)"><i class="fa-solid fa-dice-d20"></i> Ask to roll</button>
        <button type="button" data-action="encChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
        <button type="button" data-action="encJournal"><i class="fa-solid fa-book"></i> Journal</button>
      </div>`;
  }

  #dungeonHtml() {
    const f = this.form.dungeon;
    const num = (name: "width" | "height" | "rooms", label: string, min: number, max: number) =>
      this.#field("dungeon", name, label, `<input type="number" min="${min}" max="${max}" value="${f[name]}">`);
    const check = (name: "hidden" | "piles" | "unique" | "globalLight" | "torches" | "place" | "puzzle", label: string, title: string) =>
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
          ${this.#select("dungeon", "curse", "Cursed unique items", [["never", "Never"], ["sometimes", "Sometimes"], ["always", "Always"]], f.curse)}
          ${this.#select("dungeon", "shift", "Fights", [["-1", "Easier"], ["0", "Standard"], ["1", "Harder"]], f.shift)}
          ${cave ? "" : this.#select("dungeon", "locks", "Locked doors", [["none", "None"], ["few", "A few"], ["some", "Some"], ["many", "Many"]], f.locks)}
          ${this.#select("dungeon", "theme", "Rooms", [["auto", "Furnished: fit the monsters"], ...(Object.entries(DUNGEON_THEMES) as [DungeonTheme, { label: string }][]).map(([v, t]): [string, string] => [v, `Furnished: ${t.label}`]), ["none", "Bare rooms"]], f.theme)}
        </div>
        <div class="dt-checks">
          ${check("hidden", "Hidden rooms", "Seal a dead-end room or two behind secret doors, with treasure inside")}
          ${check("piles", "Loot piles", "Stash treasure in findable piles with a DC, pinned as GM-only notes (and hidden Item Piles piles if installed)")}
          ${check("puzzle", "Puzzle", "A lever, pressure-plate, statue or rune puzzle that opens a sealed door (or the hidden room), with its clue carved in another room")}
          ${check("unique", "Unique items", "Hoards hold one-of-a-kind items from the Forge instead of standard magic items")}
          ${check("torches", "Torch-bearers", "One creature in each humanoid group carries a lit torch")}
          ${check("globalLight", "Global light", "Light the whole scene regardless of darkness")}
        </div>
      </details>
      ${this.#seedRow("dungeon")}
      ${d ? `
        <div class="dt-preview-wrap"><canvas class="dt-preview"></canvas></div>
        <p class="dt-meta">${d.map.rooms.length} ${d.map.style === "cave" ? "chambers" : "rooms"} · ${d.map.walls.filter((w) => w.door && !w.secret).length} doors (${d.map.walls.filter((w) => w.lock).length} locked) · ${d.map.walls.filter((w) => w.secret).length} secret · ${d.keys.filter((k) => k.encounter).length} encounters · ${d.keys.filter((k) => k.trapData).length} traps · ${d.lights.length} lights · seed <code>${esc(d.map.seed)}</code></p>
        <p class="dt-legend"><span class="dt-key dt-key-foe"></span> monster <span class="dt-key dt-key-loot"></span> loot pile <span class="dt-key dt-key-secret"></span> hidden / secret door <span class="dt-key dt-key-lock"></span> locked door <span class="dt-key dt-key-trap"></span> trap</p>
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
      k.trap ? `trap (${esc(k.trapData?.name ?? "")})` : "",
      k.notes?.some((n) => /key|password/i.test(n) && !/^Door/.test(n)) ? "key here" : "",
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
        <label class="dt-check" title="Snares and pits in camps, on roads and in ruins and caves: they stop a token, pause the game and give you the rolls"><input type="checkbox" data-group="battlemap" name="traps" ${f.traps ? "checked" : ""}> Traps</label>
        ${this.#select("battlemap", "layout", "Fight", [["standoff", "Standoff"], ["ambush", "Ambush (hidden close)"], ["defend", "Hold the line"], ["random", "Random"]], f.layout)}
        <label class="dt-check" title="Raised ledges, outcrops and daises with cliff edges: climb them or take the slope"><input type="checkbox" data-group="battlemap" name="elevation" ${f.elevation ? "checked" : ""}> Elevation</label>
        <label class="dt-check" title="Storerooms, back doors and houses can be locked, stuck or barred; players clicking one get to pick, force or unlock it"><input type="checkbox" data-group="battlemap" name="locks" ${f.locks ? "checked" : ""}> Locked doors</label>
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
        ${this.#select("loot", "theme", "Taken from", [["", "Anyone"], ...[...CREATURE_TYPES].sort().map((t): [string, string] => [t, t])], f.theme)}
        <label class="dt-check" title="Hoard magic items are one-of-a-kind items from the Forge"><input type="checkbox" data-group="loot" name="forge" ${f.forge ? "checked" : ""}> Unique items</label>
        ${this.#select("loot", "curse", "Curses", [["never", "Never"], ["sometimes", "Sometimes"], ["always", "Always"]], f.curse)}
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
      : f.kind === "potion" ? POTION_FORMS
      : f.kind === "ammo" ? AMMO_FORMS
      : f.kind === "scroll" ? []
      : [...BASE_WEAPONS.map(([n]) => n), ...BASE_ARMOR, ...WONDROUS_SLOTS, "wand", "staff", "rod", ...POTION_FORMS, ...AMMO_FORMS];
    const kinds: [string, string][] = [["random", "Random"], ...(Object.entries(FORGE_KINDS) as [string, string][])];
    const rarities: [string, string][] = [["auto", "By party level"], ...RARITIES.map((r): [string, string] => [r, r])];
    const themes: [string, string][] = [["random", "Random"], ...DAMAGE_TYPES.map((t): [string, string] => [t, t])];
    const cards = this.forged.map((it, i) => i === this.#forgeEditing ? this.#forgeEditorHtml(it) : `
      <div class="dt-card dt-forged">
        <p class="dt-enc-head"><strong>${esc(it.name)}</strong> <span class="dt-rarity dt-r-${it.rarity.replace(" ", "-")}">${esc(it.kind === "relic" ? "artifact" : it.rarity)}</span> · ${it.valueGp.toLocaleString()} gp</p>
        ${forgedHtml(it)}
        <div class="dt-row dt-actions">
          <button type="button" data-action="forgeCreate" data-index="${i}" title="Create it in the Items sidebar and open its sheet"><i class="fa-solid fa-plus"></i> Create item</button>
          <button type="button" data-action="forgeGive" data-index="${i}" title="Add it to the selected token's (or your character's) inventory"><i class="fa-solid fa-hand-holding"></i> Give to selected</button>
          <button type="button" data-action="forgeCraft" data-index="${i}" title="Have a character craft it as a downtime project (rare ingredient, gold and weeks of work)"><i class="fa-solid fa-hammer"></i> Craft as a project</button>
          <button type="button" data-action="forgeEdit" data-index="${i}" title="Change anything: name, numbers, effects, power, notes"><i class="fa-solid fa-pen"></i> Edit</button>
          <button type="button" data-action="forgeCurse" data-index="${i}" title="${it.cursed ? "Remove the curse" : "Add a random curse; the item is created unidentified, disguised as harmless"}"><i class="fa-solid fa-${it.cursed ? "hand-sparkles" : "skull"}"></i> ${it.cursed ? "Lift curse" : "Curse"}</button>
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
        ${this.#select("forge", "curse", "Curses", [["never", "Never"], ["sometimes", "Sometimes"], ["always", "Always"]], f.curse)}
      </div>
      ${this.#seedRow("forge")}
      <div class="dt-row"><button type="button" data-action="forgeNew" title="Build an item by hand from a blank template"><i class="fa-solid fa-file-circle-plus"></i> New blank item</button></div>
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
    const kinds: [string, string][] = [["auto", "Detect"], ["statblock", "Statblock (NPC)"], ["spell", "Spell"], ["item", "Magic item"], ["action", "Monster action(s)"], ["feature", "Feature / feat"]];
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
      ${this.statblock ? this.#statblockPreview(this.statblock) : ""}
      ${(cards || this.statblock) ? cards : `<p class="dt-empty">Paste a whole statblock to get an NPC actor, or a single spell, item or action. Works with 2014 and 2024 book layouts and D&D Beyond copy. Spells get level, school, components, range, area, duration, save or attack, damage and upcasting; items get rarity, attunement, +X bonus, charges and Active Effects; a statblock's actions become attacks with their to-hit and damage. Check the summary, fix the name if needed, then create.</p>`}`;
  }

  #statblockPreview(sb: ParsedStatblock) {
    const mod = (n: number) => { const m = Math.floor((n - 10) / 2); return m >= 0 ? `+${m}` : `${m}`; };
    const cr = sb.cr === 0.125 ? "1/8" : sb.cr === 0.25 ? "1/4" : sb.cr === 0.5 ? "1/2" : String(sb.cr);
    const speed = Object.entries(sb.speed).filter(([k, v]) => k !== "hover" && v).map(([k, v]) => (k === "walk" ? `${v} ft.` : `${k} ${v} ft.`)).join(", ");
    const senses = Object.entries(sb.senses).filter(([, v]) => v).map(([k, v]) => `${k} ${v} ft.`).join(", ");
    const sectionLabel: Record<string, string> = { traits: "Traits", actions: "Actions", bonus: "Bonus actions", reactions: "Reactions", legendary: `Legendary actions (${sb.legendaryActions}/round)`, lair: "Lair actions" };
    const sections = Object.entries(sb.sections).filter(([, list]) => list.length).map(([key, list]) =>
      `<p class="dt-sb-section"><strong>${esc(sectionLabel[key])}</strong></p><ul class="dt-sb-entries">${list.map((e) =>
        `<li><strong>${esc(e.name)}</strong>${parsedFacts(e).filter(([k]) => k !== "Use").map(([k, v]) => ` · ${esc(k)} ${esc(v)}`).join("")}</li>`).join("")}</ul>`).join("");
    const spells = sb.spellcasting?.spells ?? [];
    return `
      <div class="dt-card dt-statblock">
        <p class="dt-enc-head"><strong>${esc(sb.name)}</strong> · ${esc(`${sb.size} ${sb.type}${sb.subtype ? ` (${sb.subtype})` : ""}${sb.alignment ? `, ${sb.alignment}` : ""}`)} · CR ${cr}</p>
        <p>AC ${sb.ac.value}${sb.ac.note ? ` (${esc(sb.ac.note)})` : ""} · HP ${sb.hp.value}${sb.hp.formula ? ` (${esc(sb.hp.formula)})` : ""} · Speed ${esc(speed || "0 ft.")}</p>
        <table class="dt-abilities"><tr>${(["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => `<th>${a.toUpperCase()}</th>`).join("")}</tr>
          <tr>${(["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => `<td>${sb.abilities[a]} (${mod(sb.abilities[a])})${sb.saves[a] !== undefined ? `<br><small>save +${sb.saves[a]}</small>` : ""}</td>`).join("")}</tr></table>
        <p class="dt-sub">${[
          Object.keys(sb.skills).length ? `Skills ${Object.entries(sb.skills).map(([k, v]) => `${k} +${v}`).join(", ")}` : "",
          sb.resistances.length ? `Resists ${sb.resistances.join(", ")}` : "",
          sb.immunities.length ? `Immune ${sb.immunities.join(", ")}` : "",
          sb.conditionImmunities.length ? `Can't be ${sb.conditionImmunities.join(", ")}` : "",
          senses ? `Senses ${senses}` : "",
          sb.languages.length ? `Languages ${sb.languages.join(", ")}` : "",
          sb.legendaryResistances ? `Legendary Resistance ${sb.legendaryResistances}/day` : "",
        ].filter(Boolean).map(esc).join(" · ")}</p>
        ${sections}
        ${spells.length ? `<p class="dt-sb-section"><strong>Spells</strong> (${esc(sb.spellcasting?.ability ?? "?")}${sb.spellcasting?.dc ? `, DC ${sb.spellcasting.dc}` : ""})</p><p class="dt-sub">${spells.map((s) => esc(`${s.name}${s.mode === "atwill" ? " (at will)" : s.uses ? ` (${s.uses}/day)` : ""}`)).join(", ")}</p>` : ""}
        ${sb.warnings.map((w) => `<p class="dt-warn">⚠ ${esc(w)}</p>`).join("")}
        <div class="dt-row dt-actions">
          <button type="button" data-action="importActor" title="Create the NPC with every stat, feature, attack and spell"><i class="fa-solid fa-user-plus"></i> Create actor</button>
          <button type="button" data-action="importActorPlace" title="Create it and drop a token at the center of your view"><i class="fa-solid fa-location-dot"></i> Create &amp; place token</button>
        </div>
      </div>`;
  }

  /** Copy edited names from the import cards back into the parsed entries. */
  #syncParsedNames() {
    for (const input of this.element.querySelectorAll("input.dt-parsed-name") as NodeListOf<HTMLInputElement>) {
      const e = this.parsed[Number(input.dataset.index)];
      if (e && input.value.trim()) e.name = input.value.trim();
    }
  }

  #forgeEditorHtml(it: ForgedItem) {
    const opt = (pairs: [string, string][], v: string) => pairs.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    const input = (name: string, label: string, value: unknown, type = "text", extra = "") =>
      `<label class="dt-field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value ?? "")}" ${extra}></label>`;
    const sel = (name: string, label: string, pairs: [string, string][], v: string) => `<label class="dt-field"><span>${label}</span><select name="${name}">${opt(pairs, v)}</select></label>`;
    const area = (name: string, label: string, value: string, rows = 2) => `<label class="dt-field"><span>${label}</span><textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;
    const types: [string, string][] = DAMAGE_TYPES.map((t) => [t, t]);
    const abilities: [string, string][] = [["", "no save"], ["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
    const effectOptions = EFFECT_CATALOG.map((t): [string, string] => [t.id, t.label]);
    const effectRows = it.effects.map((e, r) => {
      const id = EFFECT_CATALOG.find((t) => t.key === e.key && t.mode === e.mode)?.id ?? "custom";
      return `<div class="dt-row dt-effect-row" data-row="${r}">
        <label class="dt-field"><span>Effect</span><select name="fx-id">${opt([...effectOptions, ["custom", "Custom key…"]], id)}</select></label>
        ${input("fx-value", "Value", e.value)}
        ${id === "custom" ? input("fx-key", "Key", e.key) : `<input type="hidden" name="fx-key" value="${esc(e.key)}">`}
        <button type="button" data-action="forgeEffectRemove" data-row="${r}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    }).join("");
    const p = it.power;
    const weapon = it.itemType === "weapon";
    return `
      <div class="dt-card dt-forge-editor">
        <p class="dt-enc-head"><strong>Edit item</strong></p>
        <div class="dt-row">${input("name", "Name", it.name)}${sel("kind", "Kind", Object.entries(FORGE_KINDS) as [string, string][], it.kind)}</div>
        <div class="dt-row">
          ${input("base", "Base", it.base, "text", `list="dt-forge-bases"`)}
          ${sel("rarity", "Rarity", RARITIES.map((r): [string, string] => [r, r]), it.rarity)}
          ${input("valueGp", "Value (gp)", it.valueGp, "number", `min="0"`)}
          ${input("bonus", "+ Bonus", it.bonus, "number", `min="0" max="3"`)}
        </div>
        <div class="dt-checks">
          <label class="dt-check"><input type="checkbox" name="attunement" ${it.attunement ? "checked" : ""}> Requires attunement</label>
          <button type="button" data-action="forgeEditorCurse" title="Add a random curse, or swap the current one"><i class="fa-solid fa-skull"></i> ${it.cursed ? "Reroll curse" : "Add curse"}</button>
          ${it.cursed ? `<button type="button" data-action="forgeEditorLift"><i class="fa-solid fa-hand-sparkles"></i> Lift curse</button>` : ""}
        </div>
        ${weapon ? `
          <div class="dt-row">
            ${input("dmg-formula", "Extra damage", it.damage[0]?.formula ?? "", "text", `placeholder="e.g. 1d6"`)}
            ${sel("dmg-type", "Type", types, it.damage[0]?.type ?? it.theme)}
            ${input("critThreshold", "Crit on", it.critThreshold ?? 20, "number", `min="15" max="20"`)}
            ${input("critDamage", "Extra crit dice", it.critDamage ?? "", "text", `placeholder="e.g. 2d6"`)}
          </div>
          <div class="dt-row">${input("bane-formula", "Bane damage", it.bane?.formula ?? "", "text", `placeholder="e.g. 2d6"`)}${input("bane-vs", "Against", it.bane?.vs ?? "", "text", `placeholder="e.g. undead"`)}</div>` : ""}
        <p class="dt-sb-section"><strong>Effects</strong> <small>(apply to whoever carries or attunes to it)</small></p>
        ${effectRows || `<p class="dt-sub">No effects.</p>`}
        <button type="button" data-action="forgeEffectAdd"><i class="fa-solid fa-plus"></i> Add effect</button>
        <p class="dt-sb-section"><strong>Power</strong> <small>(spends charges)</small></p>
        <div class="dt-row">
          ${sel("power-kind", "Kind", [["", "None"], ["blast", "Blast (area, save)"], ["bolt", "Bolt (spell attack)"], ["heal", "Healing"], ["utility", "Utility"]], p?.kind ?? "")}
          ${p ? input("power-name", "Name", p.name) + input("power-charges", "Charges", p.charges, "number", `min="1"`) + input("power-recharge", "Regains at dawn", p.recharge) + input("power-cost", "Cost", p.cost, "number", `min="1"`) : ""}
        </div>
        ${p ? `<div class="dt-row">
          ${p.kind !== "heal" && p.kind !== "bolt" ? sel("power-save", "Save", abilities, p.save?.ability ?? "") + input("power-dc", "DC", p.save?.dc ?? 13, "number", `min="5" max="30"`) : ""}
          ${p.kind !== "utility" ? input("power-dmg", p.kind === "heal" ? "Healing" : "Damage", p.damage?.formula ?? "") : ""}
          ${p.kind === "blast" || p.kind === "bolt" ? sel("power-type", "Type", types, (p.damage?.type as string) ?? it.theme) : ""}
          ${p.kind === "blast" ? input("power-area", "Area", p.area ?? "15-foot cone", "text", `placeholder="15-foot cone"`) : ""}
          ${p.kind === "bolt" ? input("power-range", "Range (ft)", p.range ?? 120, "number") : ""}
        </div>
        ${p.kind === "utility" ? area("power-effect", "What it does", p.effect ?? "") : ""}` : ""}
        ${area("appearance", "Appearance", it.appearance)}
        ${area("notes", "Other properties (one per line: riders, quirks, curses)", it.notes.join("\n"), 3)}
        ${it.kind === "relic" || it.history || it.sentience ? area("sentience", "Sentience", it.sentience ?? "") + area("history", "History", it.history ?? "") + area("drawback", "Drawback", it.drawback ?? "") : ""}
        <div class="dt-row dt-actions">
          <button type="button" data-action="forgeSave"><i class="fa-solid fa-check"></i> Save</button>
          <button type="button" data-action="forgeCancel"><i class="fa-solid fa-xmark"></i> Close editor</button>
        </div>
      </div>`;
  }

  /** Read the open editor back into its item (keeps unsaved typing across add/remove effect). */
  #readForgeEditor() {
    const i = this.#forgeEditing;
    const root = this.element?.querySelector(".dt-forge-editor") as HTMLElement | null;
    if (i === null || !root) return;
    const it = this.forged[i]!;
    const val = (name: string) => (root.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value?.trim() ?? "";
    const has = (name: string) => !!root.querySelector(`[name="${name}"]`);
    const checked = (name: string) => !!(root.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.checked;
    const num = (name: string, fallback: number) => (val(name) === "" ? fallback : Number(val(name)));

    it.name = val("name") || it.name;
    it.kind = (val("kind") as ForgeKind) || it.kind;
    it.base = val("base") || it.base;
    it.itemType = it.kind === "wand" || CONSUMABLE_KINDS.has(it.kind) ? "consumable" : it.kind === "weapon" || BASE_WEAPONS.some(([n]) => n === it.base) ? "weapon" : "equipment";
    it.rarity = (val("rarity") as Rarity) || it.rarity;
    it.valueGp = num("valueGp", it.valueGp);
    it.bonus = Math.max(0, Math.min(3, num("bonus", it.bonus)));
    it.attunement = checked("attunement");
    // A curse is its "Curse." notes and "Curse:" effects; editing them away lifts it.
    if (has("dmg-formula")) {
      const formula = val("dmg-formula");
      it.damage = formula ? [{ formula, type: val("dmg-type") as DamageType }] : [];
      const crit = num("critThreshold", 20);
      it.critThreshold = crit < 20 ? crit : undefined;
      it.critDamage = val("critDamage") || undefined;
      it.bane = val("bane-formula") ? { formula: val("bane-formula"), vs: val("bane-vs") || "a chosen foe" } : undefined;
    }
    it.effects = [...root.querySelectorAll(".dt-effect-row")].map((row) => {
      const id = (row.querySelector("[name=fx-id]") as HTMLSelectElement).value;
      const value = (row.querySelector("[name=fx-value]") as HTMLInputElement).value.trim();
      const t = EFFECT_CATALOG.find((e) => e.id === id);
      const key = t?.key ?? (row.querySelector("[name=fx-key]") as HTMLInputElement).value.trim();
      return { label: t?.label ?? "Custom", key, mode: t?.mode ?? "add", value: value || t?.sample || "" };
    });
    const kind = val("power-kind") as PowerKind | "";
    if (!kind) it.power = undefined;
    else if (!it.power || it.power.kind !== kind) it.power = blankPower(kind, it.rarity, it.theme);
    else {
      const p = it.power;
      p.name = val("power-name") || p.name;
      p.charges = num("power-charges", p.charges);
      p.recharge = val("power-recharge") || p.recharge;
      p.cost = num("power-cost", p.cost);
      if (has("power-save")) p.save = val("power-save") ? { ability: val("power-save") as Ability, dc: num("power-dc", 13) } : undefined;
      if (has("power-dmg")) p.damage = val("power-dmg") ? { formula: val("power-dmg"), type: p.kind === "heal" ? "healing" : ((val("power-type") || it.theme) as DamageType) } : undefined;
      if (has("power-area")) p.area = val("power-area");
      if (has("power-range")) p.range = num("power-range", 120);
      if (has("power-effect")) p.effect = val("power-effect");
    }
    it.appearance = val("appearance");
    it.notes = val("notes").split("\n").map((l) => l.trim()).filter(Boolean);
    it.cursed = it.notes.some((n) => n.startsWith("Curse.")) || it.effects.some((e) => e.label.startsWith("Curse:")) || undefined;
    if (has("history")) {
      it.sentience = val("sentience") || undefined;
      it.history = val("history") || undefined;
      it.drawback = val("drawback") || undefined;
    }
  }

  #trapsHtml() {
    const f = this.form.traps;
    const t = this.trap;
    const p = this.puzzle;
    const abilityName: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
    return `
      <div class="dt-row">
        ${this.#field("traps", "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
        ${this.#select("traps", "severity", "Severity", [["random", "Random"], ["setback", "Setback"], ["dangerous", "Dangerous"], ["deadly", "Deadly"]], f.severity)}
        ${this.#select("traps", "kind", "Trap", [["any", "Any"], ["mechanical", "Mechanical"], ["magical", "Magical"]], f.kind)}
        ${this.#select("traps", "puzzle", "Puzzle", [["any", "Any"], ["riddle", "Riddle"], ["mechanism", "Mechanism"]], f.puzzle)}
      </div>
      <div class="dt-row dt-actions">
        <button type="button" data-action="trapRoll"><i class="fa-solid fa-skull-crossbones"></i> New trap</button>
        <button type="button" data-action="puzzleRoll"><i class="fa-solid fa-puzzle-piece"></i> New puzzle</button>
      </div>
      ${t ? `
        <div class="dt-card">
          <p class="dt-enc-head"><strong>${esc(t.name)}</strong> · ${esc(t.severity)} · ${esc(t.kind)}</p>
          <p><strong>Trigger:</strong> ${esc(t.trigger)}. ${esc(t.effect)}</p>
          <p>${t.save ? `<strong>DC ${t.save.dc} ${abilityName[t.save.ability]} save</strong>, ${esc(t.damage!.formula)} ${esc(t.damage!.type)} (half on a success)${t.area ? `, ${esc(t.area)}` : ""}.` : `<strong>+${t.attackBonus} to hit</strong>, ${esc(t.damage!.formula)} ${esc(t.damage!.type)}.`} ${esc(t.rider ?? "")}</p>
          <p><strong>Spot:</strong> DC ${t.detect.dc} ${t.detect.skill === "prc" ? "Perception" : "Investigation"} · <strong>Disarm:</strong> DC ${t.disarm.dc}, ${esc(t.disarm.method)}</p>
          <p class="dt-sub">${esc(t.countermeasures)}</p>
          <div class="dt-row dt-actions dt-mission-actions">
            <button type="button" data-action="trapAsk" data-what="spot" title="Ask the party to notice it"><i class="fa-solid fa-eye"></i> Ask to spot it</button>
            ${t.save ? `<button type="button" data-action="trapAsk" data-what="save" title="It's sprung: ask for the save"><i class="fa-solid fa-dice-d20"></i> It's sprung: ask for the save</button>` : ""}
            <button type="button" data-action="trapAsk" data-what="disarm" title="Ask the rogue to disarm it"><i class="fa-solid fa-screwdriver-wrench"></i> Ask to disarm</button>
            <button type="button" data-action="trapChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
          </div>
        </div>` : ""}
      ${p ? `
        <div class="dt-card">
          <p class="dt-enc-head"><strong>${esc(p.title)}</strong> · ${esc(p.kind)}</p>
          <p>${esc(p.prompt)}</p>
          ${p.hints.slice(0, this.#hintsShown).map((h, i) => `<p class="dt-sub">Hint ${i + 1}: ${esc(h)}</p>`).join("")}
          <details><summary>Solution (GM)</summary><p>${esc(p.solution)}</p><p><strong>If they get it wrong:</strong> ${esc(p.failure)}</p><p><strong>If they solve it:</strong> ${esc(p.reward)}</p></details>
          <div class="dt-row dt-actions">
            <button type="button" data-action="puzzleShow" title="Post the puzzle to everyone"><i class="fa-solid fa-comment"></i> Show players</button>
            ${this.#hintsShown < p.hints.length ? `<button type="button" data-action="puzzleHint"><i class="fa-solid fa-lightbulb"></i> Give a hint (${this.#hintsShown + 1}/${p.hints.length})</button>` : ""}
          </div>
        </div>` : ""}
      ${!t && !p ? `<p class="dt-empty">Traps hit as hard as the DMG says for the party's level, with ready roll requests to spot, survive and disarm them. Puzzles come with the answer, three hints to drip-feed, and a price for getting it wrong.</p>` : ""}`;
  }

  #handoutsHtml() {
    const f = this.form.handouts;
    const h = this.handout;
    const q = this.sidequest;
    return `
      <div class="dt-row">
        ${this.#select("handouts", "kind", "Handout", [["random", "Random"], ["wanted", "Wanted poster"], ["letter", "Intercepted letter"], ["map", "Treasure map"]], f.kind)}
        <label class="dt-check" title="${q ? `Use ${esc(q.villainName)}, ${esc(q.macguffin)} and ${esc(q.lair)}` : "Generate a side quest first"}"><input type="checkbox" data-group="handouts" name="useQuest" ${f.useQuest && q ? "checked" : ""} ${q ? "" : "disabled"}> Tie it to the current side quest</label>
      </div>
      ${this.#seedRow("handouts")}
      ${h ? `
        <div class="dt-preview-wrap"><canvas class="dt-preview dt-handout-preview"></canvas></div>
        <p class="dt-sub"><strong>GM:</strong> ${esc(h.gmNote)}</p>
        <div class="dt-row dt-actions">
          <button type="button" data-action="handoutShow" title="Create the handout journal and open Foundry's show-to-players dialog"><i class="fa-solid fa-eye"></i> Create &amp; show players</button>
          <button type="button" data-action="handoutJournal"><i class="fa-solid fa-book"></i> Create journal only</button>
        </div>`
      : `<p class="dt-empty">Wanted posters, intercepted letters with a wax seal, and treasure maps, painted as images for the players. Tie one to the current side quest and it names the villain, the prize and the lair.</p>`}`;
  }

  #travelHtml() {
    const f = this.form.travel;
    const j = this.journey;
    const opts = <T extends string>(list: readonly T[]) => list.map((v): [string, string] => [v, v]);
    const who: Record<string, string> = { navigator: "Navigator", watch: "Watch", forager: "Forager", everyone: "Everyone" };
    const icon: Record<string, string> = { quiet: "fa-feather", encounter: "fa-dragon", hazard: "fa-triangle-exclamation", discovery: "fa-magnifying-glass", meeting: "fa-people-group" };
    const dayCard = (d: TravelDay) => `
      <div class="dt-card dt-travel-day">
        <p class="dt-enc-head"><span class="dt-step">${d.day}</span> <strong>Day ${d.day}</strong> · ${esc(d.weather.text)} · ${d.miles} miles</p>
        ${d.weather.effect ? `<p class="dt-sub">${esc(d.weather.effect)}</p>` : ""}
        <p><i class="fa-solid ${icon[d.event.kind]}"></i> ${esc(d.event.text)}</p>
        <div class="dt-row dt-actions dt-mission-actions">
          ${d.checks.map((c, i) => `<button type="button" data-action="travelCheck" data-day="${d.id}" data-check="${i}" title="Ask for this roll: ${esc(c.why)}"><i class="fa-solid fa-dice-d20"></i> ${who[c.who]}: ${esc(c.type === "save" ? `${c.key.toUpperCase()} save` : SKILLS[c.key] ?? c.key)} ${c.dc}</button>`).join("")}
          ${d.event.encounter ? `<button type="button" data-action="travelFight" data-day="${d.id}"><i class="fa-solid fa-dragon"></i> Encounter</button>
            <button type="button" data-action="travelMap" data-day="${d.id}" title="A ${esc(d.event.encounter.map)} battlemap with the fight ready to place"><i class="fa-solid fa-map"></i> Battlemap</button>` : ""}
          ${d.event.questKeyword ? `<button type="button" data-action="travelQuest" data-day="${d.id}" title="Turn this discovery into a side quest"><i class="fa-solid fa-signs-post"></i> Side quest</button>` : ""}
          <button type="button" data-action="travelCamp" title="Make camp for the night here: the terrain, climate and season carry over"><i class="fa-solid fa-campground"></i> Camp</button>
          <button type="button" data-action="travelReroll" data-day="${d.id}" title="Reroll this day"><i class="fa-solid fa-dice"></i></button>
        </div>
      </div>`;
    return `
      <div class="dt-row">
        ${this.#field("travel", "from", "From", `<input type="text" value="${esc(f.from)}" placeholder="the last town">`)}
        ${this.#field("travel", "to", "To", `<input type="text" value="${esc(f.to)}" placeholder="their destination">`)}
        ${this.#field("travel", "days", "Days", `<input type="number" min="1" max="21" value="${f.days}">`)}
      </div>
      <div class="dt-row">
        ${this.#select("travel", "terrain", "Terrain", (Object.entries(TERRAINS) as [Terrain, { label: string }][]).map(([k, v]): [string, string] => [k, v.label]), f.terrain)}
        ${this.#select("travel", "climate", "Climate", opts(["temperate", "cold", "hot"] as const), f.climate)}
        ${this.#select("travel", "season", "Season", opts(["spring", "summer", "autumn", "winter"] as const), f.season)}
        ${this.#select("travel", "pace", "Pace", [["slow", "Slow (stealthy)"], ["normal", "Normal"], ["fast", "Fast (−5 passive Perception)"]], f.pace)}
      </div>
      <div class="dt-row">
        ${this.#field("travel", "foes", "Foes (optional tags)", `<input type="text" list="dt-taglist" value="${esc(f.foes)}" placeholder="the terrain's own creatures">`)}
        ${this.#select("travel", "frequency", "Encounters", [["rare", "Rare"], ["normal", "Normal"], ["frequent", "Frequent"]], f.frequency)}
        ${this.#select("travel", "shift", "Fights", [["-1", "Easier"], ["0", "Standard"], ["1", "Harder"]], f.shift)}
      </div>
      ${this.#tagDatalist()}
      ${this.#seedRow("travel")}
      ${j ? `
        <p class="dt-enc-head"><strong>${esc(j.from)} → ${esc(j.to)}</strong> · ${j.days.length} days · ${j.totalMiles} miles of ${esc(TERRAINS[j.terrain].label.toLowerCase())} · ${esc(j.season)}</p>
        ${j.days.map(dayCard).join("")}
        <div class="dt-row dt-actions">
          <button type="button" data-action="travelJournal"><i class="fa-solid fa-book"></i> Travel log</button>
          <button type="button" data-action="travelChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
        </div>`
      : `<p class="dt-empty">Plan a journey day by day: weather, distance, the navigator's and forager's checks, and whatever the road throws at them. Every check is one click from a roll request.</p>`}`;
  }

  #townHtml() {
    const f = this.form.town;
    const t = this.town;
    const sizes = (Object.entries(SETTLEMENTS) as [Settlement, { label: string }][]).map(([v, d]): [string, string] => [v, d.label]);
    const npcLink = (n: Npc, key: string, role: string) =>
      `<li><a data-action="townNpc" data-who="${key}">${esc(n.name)}</a> <span class="dt-sub">${esc(role)}: ${esc(n.personality)}</span></li>`;
    return `
      <div class="dt-row">
        ${this.#select("town", "size", "Size", sizes, f.size)}
        ${this.#field("town", "name", "Name (optional)", `<input type="text" value="${esc(f.name)}" placeholder="random">`)}
        ${this.#field("town", "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
        <label class="dt-check"><input type="checkbox" data-group="town" name="night" ${f.night ? "checked" : ""}> Night</label>
      </div>
      ${this.#seedRow("town")}
      ${t ? `
        <div class="dt-preview-wrap"><canvas class="dt-preview dt-bm-preview dt-town-preview"></canvas></div>
        <p class="dt-sub">${t.places.map((p) => `<strong>${p.buildingId}</strong> ${esc(p.label)}`).join(" · ")} · other roofs are homes</p>
        <div class="dt-card">
          <p class="dt-enc-head"><strong>${esc(t.name)}</strong> · ${esc(SETTLEMENTS[t.size].label.toLowerCase())} of ${t.population.toLocaleString()}</p>
          <p>${t.description.map(esc).join(" ")}</p>
          <p><strong>Run by</strong> ${esc(t.government)}.</p>
          <ul class="dt-town-list">
            ${npcLink(t.leader, "leader", "leader")}
            ${npcLink(t.inn.keeper, "inn", `keeps ${t.inn.name}`)}
            ${npcLink(t.temple.priest, "temple", `priest of ${t.temple.deity}`)}
            ${t.notables.map((n, i) => npcLink(n, `notable:${i}`, n.occupation)).join("")}
          </ul>
          <p><strong>${esc(t.inn.name)}</strong> (building ${t.places.find((p) => p.kind === "inn")?.buildingId ?? "?"}): ${esc(t.inn.specialty)}; ${esc(t.inn.feature)}. Rooms ${t.inn.roomGp} gp.</p>
          <p><strong>Temple of ${esc(t.temple.deity)}</strong>, god of ${esc(t.temple.domain)}: it ${esc(t.temple.feature)}.</p>
          <p><strong>Shops:</strong> ${t.shops.map((sh, i) => `<a data-action="townShop" data-index="${i}">${esc(sh.name)}</a>`).join(" · ")}</p>
          <p><strong>Factions:</strong></p>
          <ul class="dt-town-list">${t.factions.map((fa, i) => `<li><strong>${esc(fa.name)}</strong> want to ${esc(fa.goal)}. Led by <a data-action="townNpc" data-who="faction:${i}">${esc(fa.leader.name)}</a>.</li>`).join("")}</ul>
          <p><strong>Trouble:</strong> ${esc(t.trouble.text)} <button type="button" class="dt-inline" data-action="townTrouble" title="Turn this into a side quest"><i class="fa-solid fa-signs-post"></i> Side quest</button></p>
          <p><strong>Rumors:</strong></p>
          <ul class="dt-town-list">${t.rumors.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
        </div>
        <div class="dt-row dt-actions">
          <button type="button" data-action="townScene" title="The town map with roofs, plus pins on every named building linked to the town journal"><i class="fa-solid fa-map"></i> Create town scene</button>
          <button type="button" data-action="townJournal"><i class="fa-solid fa-book"></i> Journal only</button>
          <button type="button" data-action="campTrack" data-what="town" title="Remember the town, its leader, notables and factions in the campaign"><i class="fa-solid fa-landmark-flag"></i> Add to campaign</button>
        </div>
        <p class="dt-hint">Roofs sit on an overhead layer: players see inside a building once they can see through its door or windows. Every shop also has a full interior battlemap via Shop → Battlemap.</p>`
      : `<p class="dt-empty">Generate a place to arrive in: who runs it, where to drink, buy and pray, who's scheming and what's wrong, with a map of every building.</p>`}`;
  }

  #sideQuestHtml() {
    const f = this.form.sidequest;
    const q = this.sidequest;
    const tones: [string, string][] = [["any", "any"], ...HOOK_TONES.map((t): [string, string] => [t, t])];
    const checkLabel = (c: Mission["checks"][number]) => `${c.type === "save" ? `${ABILITIES[c.key]} save` : SKILLS[c.key] ?? c.key} DC ${c.dc}`;
    const missionCard = (m: Mission, i: number) => {
      const enc = this.missionEncounters.get(m.id);
      const mapLabel = m.map ? (m.map.type === "battlemap" ? `${m.map.setting} battlemap` : m.map.type) : "";
      return `
      <div class="dt-card dt-mission">
        <p class="dt-enc-head"><span class="dt-step">${i + 1}</span> <strong>${esc(m.title)}</strong></p>
        <p>${esc(m.objective)}. <em>${esc(m.location)}</em></p>
        ${m.npc ? `<p><strong>Contact:</strong> ${esc(m.npc.name)}, ${esc(m.npc.occupation)}: ${esc(m.npc.personality)}</p>` : ""}
        ${enc ? `<p><strong>Fight (${esc(m.encounter!.difficulty)}):</strong> ${esc(encounterSummary(enc))}</p>` : m.encounter ? `<p><strong>Fight:</strong> ${esc(m.encounter.difficulty)} <code>${esc(m.encounter.tags[0] ?? "")}</code> (nothing in your monsters fits this level)</p>` : ""}
        ${m.checks.length ? `<p><strong>Checks:</strong> ${m.checks.map((c) => `${esc(checkLabel(c))} to ${esc(c.why)}`).join("; ")}</p>` : ""}
        <p class="dt-sub">${m.rewardGp ? `${m.rewardGp} gp${m.hoard ? " + a hoard" : ""} · ` : ""}${esc(m.leadsTo)}</p>
        <div class="dt-row dt-actions dt-mission-actions">
          ${m.map ? `<button type="button" data-action="questMap" data-mission="${m.id}" title="Open the ${esc(mapLabel)} in its tab with this seed (and this fight ready to place)"><i class="fa-solid fa-map"></i> Build ${esc(mapLabel)}</button>` : ""}
          ${m.encounter ? `<button type="button" data-action="questEncounter" data-mission="${m.id}" title="Open this fight in the Encounter tab to tweak, lock and place"><i class="fa-solid fa-dragon"></i> Encounter</button>` : ""}
          ${m.npc ? `<button type="button" data-action="questNpc" data-mission="${m.id}"><i class="fa-solid fa-user"></i> Contact</button>` : ""}
          ${m.hoard ? `<button type="button" data-action="questLoot" data-mission="${m.id}"><i class="fa-solid fa-coins"></i> Hoard</button>` : ""}
          ${m.checks.map((c, ci) => `<button type="button" data-action="questCheck" data-mission="${m.id}" data-check="${ci}" title="Ask the players for this roll"><i class="fa-solid fa-dice-d20"></i> ${esc(checkLabel(c))}</button>`).join("")}
          <button type="button" data-action="questReroll" data-mission="${m.id}" title="Replace this mission"><i class="fa-solid fa-dice"></i></button>
        </div>
      </div>`;
    };
    const modeRow = `
      <div class="dt-row">
        ${this.#select("sidequest", "mode", "Start from", [["premade", "A quest type"], ["keyword", "A keyword"], ["random", "Anything (random)"]], f.mode)}
        ${f.mode === "premade" ? this.#select("sidequest", "archetype", "Quest type", [["", "Random type"], ...QUEST_TYPES], f.archetype) : ""}
        ${f.mode === "keyword" ? this.#field("sidequest", "keyword", "Keyword", `<input type="text" value="${esc(f.keyword)}" placeholder="silver serpent, the bone choir, red wyrm…">`) : ""}
      </div>`;
    return `
      ${modeRow}
      <div class="dt-row">
        ${this.#field("sidequest", "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
        ${this.#field("sidequest", "size", "Party size", `<input type="number" min="1" max="10" value="${f.size}">`)}
        ${this.#select("sidequest", "tone", "Tone", tones, f.tone)}
        ${this.#field("sidequest", "length", "Missions", `<input type="number" min="2" max="5" value="${f.length}">`)}
      </div>
      <details class="dt-quick"><summary>Pick the foes yourself <small>(optional: overrides the quest type's monsters)</small></summary>
        <div class="dt-row">
          ${this.#field("sidequest", "foes", "Their forces (tags)", `<input type="text" list="dt-taglist" value="${esc(f.foes)}" placeholder="e.g. humanoid+orc · undead, fiend">`)}
          ${this.#field("sidequest", "boss", "The villain (tags)", `<input type="text" list="dt-taglist" value="${esc(f.boss)}" placeholder="e.g. dragon+green · beholder">`)}
          ${this.#select("sidequest", "shift", "Fights", [["-1", "Easier"], ["0", "Standard"], ["1", "Harder"]], f.shift)}
        </div>
        ${this.#tagDatalist()}
      </details>
      ${this.#seedRow("sidequest")}
      ${q ? `
        <div class="dt-card">
          <p class="dt-enc-head"><strong>${esc(q.title)}</strong> · ${esc(q.hook.tone)}</p>
          <p class="dt-sub">Villain: ${esc(q.hook.villain)} · Prize: ${esc(q.macguffin)} · Lair: ${esc(q.lair)} · Mark: ${esc(q.sigil)} · Region: ${esc(q.region)}</p>
          <p>${esc(q.hook.text)}</p>
          <p class="dt-sub">GM: the villain is ${esc(q.hook.villain)}; twist: ${esc(q.hook.twist)}.</p>
        </div>
        ${q.missions.map(missionCard).join("")}
        <div class="dt-row dt-actions">
          <button type="button" data-action="questJournal"><i class="fa-solid fa-book"></i> Journal (whole quest)</button>
          <button type="button" data-action="campTrack" data-what="sidequest" title="Tie it into the campaign: the villain works for a faction the party has crossed (or a new one), known friends become the patron and contacts, and the quest goes in the Quest Log"><i class="fa-solid fa-landmark-flag"></i> Track in campaign</button>
          <button type="button" data-action="questChat"><i class="fa-solid fa-comment"></i> Chat (GM)</button>
        </div>`
      : `<p class="dt-empty">When the table wanders off the main road. Pick a quest type (bandit hideout, dragon hunt, cult ritual…), type a keyword ("silver serpent" becomes a silver dragon in an icy lair, and the same keyword always gives the same quest), or go fully random. One villain, one prize and one lair run through every mission, each with a map seed, a themed fight, checks and rewards ready to build out.</p>`}`;
  }

  #rollsHtml() {
    const f = this.form.rolls;
    const actors = partyActors();
    const rollOptions = `<optgroup label="Skill checks">${Object.entries(SKILLS).map(([k, l]) => `<option value="skill:${k}" ${f.roll === `skill:${k}` ? "selected" : ""}>${l}</option>`).join("")}</optgroup>
      <optgroup label="Saving throws">${Object.entries(ABILITIES).map(([k, l]) => `<option value="save:${k}" ${f.roll === `save:${k}` ? "selected" : ""}>${l} save</option>`).join("")}</optgroup>
      <optgroup label="Ability checks">${Object.entries(ABILITIES).map(([k, l]) => `<option value="check:${k}" ${f.roll === `check:${k}` ? "selected" : ""}>${l} check</option>`).join("")}</optgroup>`;
    const [type, key] = f.roll.split(":") as [string, string];
    const passiveList = type === "skill" ? passives(key, actors.map((a: any) => a.id)) : [];
    const results = requests.slice(0, 5).map((state) => {
      const r = state.request;
      return `<div class="dt-card dt-roll-result">
        <p class="dt-enc-head"><strong>${esc(rollLabel(r))}</strong>${r.dc ? ` · DC ${r.dc}${r.showDc ? "" : " (hidden)"}` : ""}${r.prompt ? ` · <em>${esc(r.prompt)}</em>` : ""}</p>
        <ul class="dt-roll-rows">${r.actorIds.map((id) => {
          const res = state.results[id];
          const name = game.actors.get(id)?.name ?? "?";
          return `<li>${esc(name)}: ${res ? `<strong>${res.total}</strong>${res.passed === true ? ' <span class="dt-pass">✓</span>' : res.passed === false ? ' <span class="dt-fail">✗</span>' : ""}` : `<em>waiting…</em> <button type="button" data-action="rollForThem" data-request="${r.id}" data-actor="${id}" title="Roll it yourself">roll for them</button>`}</li>`;
        }).join("")}</ul>
        <p class="dt-sub">${esc(summarize(state))}</p>
      </div>`;
    }).join("");
    return `
      <div class="dt-chips"><span>Presets</span>${ROLL_PRESETS.map(([label], i) => `<button type="button" class="dt-chip" data-action="rollPreset" data-index="${i}">${esc(label)}</button>`).join("")}</div>
      ${this.#field("rolls", "prompt", "What the players see", `<input type="text" value="${esc(f.prompt)}" placeholder="Something rustles in the undergrowth…">`)}
      <div class="dt-row">
        <label class="dt-field"><span>Roll</span><select data-group="rolls" name="roll">${rollOptions}</select></label>
        ${this.#field("rolls", "dc", "DC (0 = none)", `<input type="number" min="0" max="35" value="${f.dc}">`)}
        ${this.#select("rolls", "advantage", "Roll with", [["normal", "Normal"], ["advantage", "Advantage"], ["disadvantage", "Disadvantage"]], f.advantage)}
        ${this.#select("rolls", "rollMode", "Who sees the roll", [["publicroll", "Everyone"], ["gmroll", "GM only"], ["blindroll", "Blind (not even the roller)"]], f.rollMode)}
      </div>
      <label class="dt-check"><input type="checkbox" data-group="rolls" name="showDc" ${f.showDc ? "checked" : ""}> Tell the players the DC</label>
      <p class="dt-sb-section"><strong>Who rolls</strong></p>
      <div class="dt-checks">${actors.length ? actors.map((a: any) => {
        const online = game.users.some((u: any) => u.active && !u.isGM && a.testUserPermission(u, "OWNER"));
        return `<label class="dt-check"><input type="checkbox" class="dt-roll-actor" value="${a.id}" ${this.#rollSkip.has(a.id) ? "" : "checked"}> ${esc(a.name)} <small>${online ? "🟢" : "⚪ offline"}</small></label>`;
      }).join("") : `<p class="dt-sub">No player characters found.</p>`}</div>
      <div class="dt-row dt-actions">
        <button type="button" data-action="rollSend"><i class="fa-solid fa-paper-plane"></i> Ask for the roll</button>
      </div>
      ${passiveList.length ? `<p class="dt-sub"><strong>Passive ${esc(SKILLS[key] ?? key)}:</strong> ${passiveList.map((p) => `${esc(p.name)} ${p.passive}${f.dc ? (p.passive >= f.dc ? " ✓" : " ✗") : ""}`).join(", ")}</p>` : ""}
      ${results || `<p class="dt-empty">Players get a popup with a Roll button that rolls from their own sheet (and a chat card, in case they close it). Results land here as they come in.</p>`}`;
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
          <button type="button" data-action="campTrack" data-what="npc" title="Remember them in the campaign: the party's met them"><i class="fa-solid fa-landmark-flag"></i> Remember</button>
        </div>`
      : `<p class="dt-empty">Pick a role (or leave it random) and generate someone to talk to.</p>`}`;
  }

  #hookHtml() {
    const f = this.form.hook;
    const h = this.hook;
    const tones: [string, string][] = [["any", "any"], ...HOOK_TONES.map((t): [string, string] => [t, t])];
    const part = (p: HookPart, label: string, value: string | number, gm = false) => `
      <div class="dt-row dt-hook-part">
        <label class="dt-field"><span>${label}${gm ? " (GM)" : ""}</span><input type="${p === "reward" ? "number" : "text"}" name="hook-${p}" value="${esc(value)}"></label>
        <button type="button" data-action="hookReroll" data-part="${p}" title="Reroll just this"><i class="fa-solid fa-dice"></i></button>
      </div>`;
    return `
      <div class="dt-row">
        ${this.#field("hook", "level", "Party level", `<input type="number" min="1" max="20" value="${f.level}">`)}
        ${this.#select("hook", "tone", "Tone", tones, f.tone)}
      </div>
      <label class="dt-check" title="Make the patron someone the party likes and the villain someone they've crossed (from the Campaign tab), when there's anyone"><input type="checkbox" data-group="hook" name="campaign" ${f.campaign ? "checked" : ""}> Use campaign people</label>
      ${this.#seedRow("hook")}
      <div class="dt-row"><button type="button" data-action="hookBlank" title="Write your own from empty fields"><i class="fa-solid fa-file-circle-plus"></i> Blank hook</button></div>
      ${h ? `
        <div class="dt-card dt-hook-editor">
          ${part("title", "Title", h.title)}
          ${part("patron", "Patron", h.patron)}
          ${part("goal", "Goal", h.goal)}
          ${part("location", "Location", h.location)}
          ${part("complication", "Complication", h.complication)}
          ${part("deadline", "Deadline", h.deadline)}
          ${part("reward", "Reward (gp)", h.rewardGp)}
          ${part("bonusReward", "Bonus reward", h.bonusReward)}
          ${part("villain", "Villain", h.villain, true)}
          ${part("twist", "Twist", h.twist, true)}
          <label class="dt-field"><span>Read-aloud text</span><textarea name="hook-text" rows="4">${esc(h.text)}</textarea></label>
          <div class="dt-row"><button type="button" data-action="hookRebuild" title="Rewrite the text from the fields above"><i class="fa-solid fa-rotate"></i> Rebuild text from parts</button></div>
        </div>
        <div class="dt-row dt-actions">
          <button type="button" data-action="hookChat"><i class="fa-solid fa-comment"></i> Post to chat (GM)</button>
          <button type="button" data-action="hookJournal"><i class="fa-solid fa-book"></i> Journal</button>
          <button type="button" data-action="campTrack" data-what="hook" title="Add it to the campaign's quests (and the players' Quest Log)"><i class="fa-solid fa-landmark-flag"></i> Track quest</button>
        </div>`
      : `<p class="dt-empty">Generate an adventure hook, then tweak any part by hand or reroll just that part.</p>`}`;
  }

  /** Copy the hook editor's fields back into the hook. */
  #readHookEditor() {
    const root = this.element?.querySelector(".dt-hook-editor");
    if (!root || !this.hook) return;
    const val = (name: string) => (root.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? "";
    const h = this.hook;
    for (const p of ["title", "patron", "goal", "location", "complication", "deadline", "bonusReward", "villain", "twist"] as const) h[p] = val(`hook-${p}`).trim();
    h.rewardGp = Number(val("hook-reward")) || 0;
    h.text = val("hook-text").trim();
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
        const e = generateEncounter({ seed, catalog, magicItems, partyLevel: f.level, partySize: f.size, difficulty: f.difficulty, template: f.template, tags: f.tags, loot: f.loot, locked, race, recent: this.#recent });
        this.locked = new Set(locked.map((g) => g.monster.id));
        this.encounter = await linkEncounter(e);
        this.#remember(e);
      } else if (group === "dungeon") {
        const f = this.form.dungeon;
        const source = this.form.encounter.source;
        const [catalog, magicItems] = await Promise.all([getCatalog(source), getMagicItems(source)]);
        let map = f.style === "cave"
          ? generateCave({ seed, width: f.width, height: f.height, chambers: f.rooms, openness: f.openness })
          : generateDungeon({ seed, width: f.width, height: f.height, maxRooms: f.rooms });
        if (f.hidden) map = addHiddenRooms(map, map.rooms.length >= 10 ? 2 : 1);
        let keys = stockDungeon(map, {
          partyLevel: f.level, partySize: f.size, tags: f.tags, catalog, magicItems, monsters: f.monsters, lootPiles: f.piles, uniqueItems: f.unique, curse: f.curse,
          difficultyShift: Number(f.shift) as -1 | 0 | 1, recent: this.#recent,
        });
        // Locks and keys (caves have no doors to lock).
        if (f.style !== "cave") ({ map, keys } = lockDoors(map, keys, { amount: f.locks, partyLevel: f.level }));
        // Rooms with a purpose: barracks, ossuaries, laboratories..., furnished to match.
        if (f.theme !== "none") keys = furnishDungeon(map, keys, { theme: f.theme, partyLevel: f.level, tags: f.tags, lootPiles: f.piles }).keys;
        // A puzzle guarding the hidden room or a treasure room, with its clue elsewhere.
        if (f.puzzle) {
          const pz = placePuzzle(map, keys, { partyLevel: f.level });
          if (pz) ({ map, keys } = pz);
        }
        this.#remember(...keys.map((k) => k.encounter));
        this.dungeon = { map, keys, lights: lightDungeon(map, keys, { amount: f.lighting }) };
      } else if (group === "battlemap") {
        const f = this.form.battlemap;
        this.battlemap = generateBattlemap({
          seed, setting: f.setting, size: f.size, night: f.night, title: f.setting === "shop" && f.shopName ? f.shopName : undefined,
          traps: f.traps, locks: f.locks, partyLevel: this.form.encounter.level, elevation: f.elevation, layout: f.layout,
        });
      } else if (group === "forge") {
        const f = this.form.forge;
        this.forged = forgeItems(f.count, { seed, kind: f.kind, rarity: f.rarity, theme: f.theme, base: f.base, partyLevel: f.level, curse: f.curse });
        this.#forgeEditing = null;
      } else if (group === "handouts") {
        const f = this.form.handouts;
        const q = this.sidequest;
        const context = f.useQuest && q ? { villain: q.hook.villain, macguffin: q.macguffin, lair: q.lair, sigil: q.sigil, region: q.region, town: this.town?.name } : { town: this.town?.name };
        this.handout = generateHandout({ seed, kind: f.kind, context });
      } else if (group === "travel") {
        const f = this.form.travel;
        this.journey = planJourney({
          seed, from: f.from, to: f.to, days: f.days, terrain: f.terrain, climate: f.climate, season: f.season, pace: f.pace, partyLevel: f.level,
          foes: f.foes, encounters: f.frequency, difficultyShift: Number(f.shift) as -1 | 0 | 1,
        });
      } else if (group === "town") {
        const f = this.form.town;
        const items = this.form.encounter.source === "srd" ? undefined : await getShopItems(itemFamily);
        this.town = generateTown({ seed, size: f.size, name: f.name, partyLevel: f.level, night: f.night, shopItems: items });
      } else if (group === "sidequest") {
        const f = this.form.sidequest;
        // A keyword is its own seed unless the dice asked for a variation.
        const keywordSeed = f.mode === "keyword" && f.keyword.trim() && !this.#questVariation ? undefined : seed;
        this.#questVariation = false;
        this.sidequest = generateSideQuest({
          seed: keywordSeed, mode: f.mode, archetype: f.archetype || undefined, keyword: f.keyword, partyLevel: f.level, tone: f.tone, length: f.length,
          foes: f.foes, boss: f.boss, difficultyShift: Number(f.shift) as -1 | 0 | 1,
        });
        if (!keywordSeed) f.seed = this.sidequest.seed;
        await this.#rollMissionEncounters();
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
        this.loot = generateLoot({ seed, cr: this.form.loot.cr, mode: this.form.loot.mode, magicItems, forge: this.form.loot.forge, curse: this.form.loot.curse, theme: this.form.loot.theme || undefined });
      } else {
        this.hook = generateHook({ seed, partyLevel: this.form.hook.level, tone: this.form.hook.tone });
        // People the party already knows as patron and villain, when the campaign has any.
        if (this.form.hook.campaign) this.hook = bindHook(getCampaign(), this.hook, seed);
      }
    } catch (err) {
      ui.notifications.warn(`DnD Toolkit: ${(err as Error).message}`);
    }
    this.render();
  }

  /** Roll each mission's fight from the current catalog, so the cards can show who's there. */
  async #rollMissionEncounters() {
    const q = this.sidequest;
    if (!q) return;
    const catalog = await getCatalog(this.form.encounter.source);
    this.missionEncounters.clear();
    this.missionTags.clear();
    for (const m of q.missions) {
      if (!m.encounter) continue;
      // Most specific tags first ("dragon+silver"), falling back ("dragon") until something fits the party.
      let fallback: [Encounter, string] | null = null;
      for (const tags of m.encounter.tags) {
        try {
          const e = generateEncounter({ seed: m.encounter.seed, catalog, partyLevel: q.partyLevel, partySize: this.form.sidequest.size, difficulty: m.encounter.difficulty, template: m.encounter.template, tags, loot: true, recent: this.#recent });
          if (!e.warnings.length) {
            fallback = [e, tags];
            break;
          }
          fallback ??= [e, tags];
        } catch {
          // Nothing with these tags in your monsters: try the next.
        }
      }
      if (fallback) {
        this.#remember(fallback[0]);
        this.missionEncounters.set(m.id, await linkEncounter(fallback[0]));
        this.missionTags.set(m.id, fallback[1]);
      }
    }
  }

  #mission(target: HTMLElement): Mission | undefined {
    return this.sidequest?.missions.find((m) => m.id === target.dataset.mission);
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
    if (group === "sidequest") this.#questVariation = true;
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
      const next = addWave(e, { catalog, recent: this.#recent });
      this.#remember({ ...next, groups: next.waves!.at(-1)!.groups });
      this.encounter = await linkEncounter(next);
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

  // --- Traps & puzzles

  static #onTrapRoll(this: ToolkitApp) {
    this.#readForm();
    const f = this.form.traps;
    this.trap = generateTrap({ partyLevel: f.level, severity: f.severity === "random" ? undefined : f.severity, kind: f.kind, seed: randomSeed() });
    this.render();
  }

  static #onTrapAsk(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const t = this.trap;
    if (!t) return;
    this.#readForm();
    const what = target.dataset.what;
    const ask = what === "spot" ? { prompt: "Something about this place feels off.", roll: `skill:${t.detect.skill}`, dc: t.detect.dc, rollMode: "gmroll" as const }
      : what === "save" ? { prompt: `${t.effect}`, roll: `save:${t.save!.ability}`, dc: t.save!.dc, rollMode: "publicroll" as const }
      : { prompt: `Disarming the ${t.name.toLowerCase()} (${t.disarm.method}).`, roll: t.disarm.method.startsWith("Arcana") ? "skill:arc" : "check:dex", dc: t.disarm.dc, rollMode: "publicroll" as const };
    Object.assign(this.form.rolls, ask);
    this.tab = "rolls";
    this.render();
  }

  static #onTrapChat(this: ToolkitApp) {
    if (this.trap) postToChat(`<p>${esc(trapText(this.trap))}</p><p><em>${esc(this.trap.countermeasures)}</em></p>`, true);
  }

  static #onPuzzleRoll(this: ToolkitApp) {
    this.#readForm();
    this.puzzle = generatePuzzle({ kind: this.form.traps.puzzle, seed: randomSeed() });
    this.#hintsShown = 0;
    this.render();
  }

  static #onPuzzleShow(this: ToolkitApp) {
    if (this.puzzle) postToChat(`<h3>${esc(this.puzzle.title)}</h3><p>${esc(this.puzzle.prompt)}</p>`);
  }

  static #onPuzzleHint(this: ToolkitApp) {
    const p = this.puzzle;
    if (!p || this.#hintsShown >= p.hints.length) return;
    postToChat(`<p><em>${esc(p.hints[this.#hintsShown]!)}</em></p>`);
    this.#hintsShown++;
    this.render();
  }

  // --- Handouts

  static #onHandoutShow(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const h = this.handout;
    if (h) this.#run(target, async () => showToPlayers((await createHandoutJournal(h)).image));
  }

  static #onHandoutJournal(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const h = this.handout;
    if (h) this.#run(target, async () => (await createHandoutJournal(h)).journal.sheet?.render(true));
  }

  // --- Travel: each day's checks and fights go to the other tabs.

  #day(target: HTMLElement): TravelDay | undefined {
    return this.journey?.days.find((d) => d.id === target.dataset.day);
  }

  static #onTravelCheck(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const d = this.#day(target);
    const c = d?.checks[Number(target.dataset.check)];
    if (!d || !c) return;
    this.#readForm();
    const lead = { navigator: "Navigator", watch: "Whoever's on watch", forager: "Whoever forages", everyone: "Everyone" }[c.who];
    Object.assign(this.form.rolls, {
      prompt: `Day ${d.day}. ${lead}: ${c.why.charAt(0).toUpperCase()}${c.why.slice(1)}.`,
      roll: `${c.type === "save" ? "save" : "skill"}:${c.key}`,
      dc: c.dc,
      rollMode: c.who === "watch" ? "gmroll" : "publicroll",
    });
    this.tab = "rolls";
    this.render();
  }

  static #onTravelFight(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const e = this.#day(target)?.event.encounter;
    if (!e) return;
    this.#readForm();
    Object.assign(this.form.encounter, { seed: e.seed, tags: e.tags, difficulty: e.difficulty, template: "auto", level: this.form.travel.level, size: this.form.travel.size });
    this.locked.clear();
    this.tab = "encounter";
    this.#generate("encounter");
  }

  static async #onTravelMap(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const d = this.#day(target);
    const e = d?.event.encounter;
    if (!d || !e) return;
    this.#readForm();
    // Roll the fight first so the battlemap can drop it in.
    Object.assign(this.form.encounter, { seed: e.seed, tags: e.tags, difficulty: e.difficulty, template: "auto", level: this.form.travel.level, size: this.form.travel.size });
    this.locked.clear();
    await this.#generate("encounter");
    Object.assign(this.form.battlemap, { seed: e.seed, setting: e.map, name: `Day ${d.day}: ${d.event.time ?? "on the road"}`, place: true, night: /dusk|watch|night/.test(d.event.time ?? "") });
    this.tab = "battlemap";
    this.#generate("battlemap");
  }

  static #onTravelQuest(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const k = this.#day(target)?.event.questKeyword;
    if (!k) return;
    this.#readForm();
    Object.assign(this.form.sidequest, { mode: "keyword", keyword: k, level: this.form.travel.level, seed: "" });
    this.tab = "sidequest";
    this.#generate("sidequest");
  }

  static #onTravelReroll(this: ToolkitApp, _e: Event, target: HTMLElement) {
    if (!this.journey || !target.dataset.day) return;
    this.#readForm();
    this.journey = rerollDay(this.journey, target.dataset.day, randomSeed());
    this.render();
  }

  static #onTravelJournal(this: ToolkitApp) {
    const j = this.journey;
    if (j) createJournal(`Travel log: ${j.from} to ${j.to}`, journeyHtml(j), { kind: "travel", seed: j.seed });
  }

  static #onTravelCamp(this: ToolkitApp) {
    this.#readForm();
    const j = this.journey;
    if (j) Object.assign(this.form.camp, { terrain: j.terrain, climate: j.climate, season: j.season, frequency: j.encounters ?? "normal", foes: j.foes ?? "" });
    this.tab = "camp";
    this.render();
  }

  static async #onMakeCamp(this: ToolkitApp) {
    this.#readForm();
    const f = this.form.camp;
    if (getCamp()) {
      CampApp.open();
      return ui.notifications.warn("The party is already camped; finish or cancel that camp first.");
    }
    const away = new Set(f.away.split(",").filter(Boolean));
    const campers = partyActors().filter((a: any) => !away.has(a.id)).map((a: any) => ({
      actorId: a.id, name: a.name, img: a.img, level: Number(a.system?.details?.level ?? 1),
    }));
    if (!campers.length) return ui.notifications.warn("Nobody to camp: there are no player characters (with a player owner).");
    const level = Math.round(campers.reduce((n, c) => n + c.level, 0) / campers.length);
    await startCamp(newCamp({ terrain: f.terrain, climate: f.climate, season: f.season, frequency: f.frequency, foes: f.foes || undefined, trackFood: f.food, partyLevel: level, day: currentDay(), campers, seed: randomSeed() }));
    CampApp.open();
  }

  #campView: CampaignView = "factions";
  #campFilter = "";

  /** Re-draw if this tab is showing (the campaign changed somewhere). */
  static refreshTab(tab: Tab) {
    const app = this.#instance;
    if (app?.rendered && app.tab === tab) app.render();
  }

  static async #onCampaign(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const view = await campaignAction(target, this.element);
    if (view) this.#campView = view;
    this.render();
  }

  /** Add whatever this tab made to the campaign. */
  static async #onCampTrack(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const day = currentDay();
    const what = target.dataset.what;
    if (what === "npc" && this.npc) {
      const n = this.npc;
      await updateCampaign((c) => register(c, { npcs: [npcRecord(n, day)] }, day));
      ui.notifications.info(`${n.name} is in the campaign now (Campaign → People).`);
    } else if (what === "town" && this.town) {
      const t = this.town;
      await updateCampaign((c) => register(c, fromTown(t, day), day));
      ui.notifications.info(`${t.name}, its people and factions are in the campaign.`);
    } else if (what === "hook" && this.hook) {
      const h = this.hook;
      const giver = getCampaign().npcs.find((n) => h.patron.startsWith(n.name));
      await updateCampaign((c) => register(c, { quests: [questFromHook(h, day, giver?.id)] }, day));
      ui.notifications.info("Tracked: it's in the Quest Log.");
    } else if (what === "sidequest" && this.sidequest) {
      const c = getCampaign();
      const bound = bindSideQuest(c, this.sidequest, day);
      this.sidequest = bound.quest;
      await saveCampaign(register(c, { ...bound.add, quests: [bound.record] }, day));
      ui.notifications.info(`Tracked: ${bound.quest.villainName} is behind it. The quest is in the Quest Log.`);
      this.render();
    }
  }

  static #onForgeCraft(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const it = this.forged[Number(target.dataset.index)];
    if (it) ProjectsApp.craftForged(it);
  }

  /** A night ambush from camp: the fight in the Encounter tab, or a night camp battlemap with it ready to place. */
  static async campFight(e: { tags: string; difficulty: Difficulty; seed: string }, o: { level: number; size: number; map: boolean }) {
    const app = (this.#instance ??= new ToolkitApp());
    Object.assign(app.form.encounter, { seed: e.seed, tags: e.tags, difficulty: e.difficulty, template: "auto", level: o.level, size: o.size });
    app.locked.clear();
    await app.#generate("encounter");
    if (o.map) {
      Object.assign(app.form.battlemap, { seed: e.seed, setting: "camp", name: "Ambush at camp", place: true, night: true });
      app.tab = "battlemap";
      await app.#generate("battlemap");
    } else app.tab = "encounter";
    app.render({ force: true });
  }

  #campHtml() {
    const f = this.form.camp;
    const away = new Set(f.away.split(",").filter(Boolean));
    const camp = getCamp();
    const opts = <T extends string>(list: readonly T[]) => list.map((v): [string, string] => [v, v]);
    return `
      <p class="dt-sub">Day <strong>${currentDay()}</strong>. The day only moves when the party breaks camp or you hand out downtime.</p>
      ${camp ? `<div class="dt-card"><p><i class="fa-solid fa-campground"></i> The party is camped (${esc(camp.phase)}).</p><button type="button" data-action="openCamp"><i class="fa-solid fa-campground"></i> Open the camp</button></div>` : ""}
      <h3>Make camp</h3>
      <div class="dt-row">
        ${this.#select("camp", "terrain", "Terrain", (Object.entries(TERRAINS) as [Terrain, { label: string }][]).map(([v, t]): [string, string] => [v, t.label]), f.terrain)}
        ${this.#select("camp", "climate", "Climate", opts(["temperate", "cold", "hot"] as const), f.climate)}
        ${this.#select("camp", "season", "Season", opts(["spring", "summer", "autumn", "winter"] as const), f.season)}
        ${this.#select("camp", "frequency", "Trouble at night", [["rare", "Rare"], ["normal", "Normal"], ["frequent", "Frequent"]], f.frequency)}
      </div>
      <div class="dt-row">
        ${this.#field("camp", "foes", "Night foes (optional tags)", `<input type="text" list="dt-taglist" value="${esc(f.foes)}" placeholder="the terrain's own creatures">`)}
        <label class="dt-check" title="Each camper eats a ration; foragers and hunters bring food in. Leave off to ignore food."><input type="checkbox" data-group="camp" name="food" ${f.food ? "checked" : ""}> Track food</label>
      </div>
      <div class="dt-row dt-campers">${partyActors().map((a: any) => `<label class="dt-check"><input type="checkbox" data-camper="${a.id}" ${away.has(a.id) ? "" : "checked"}> ${esc(a.name)}</label>`).join("") || `<span class="dt-muted">No player characters yet.</span>`}</div>
      <input type="hidden" data-group="camp" name="away" value="${esc(f.away)}">
      <div class="dt-row dt-actions">
        <button type="button" data-action="makeCamp" ${camp ? "disabled" : ""}><i class="fa-solid fa-campground"></i> Make camp</button>
        <button type="button" data-action="openProjects"><i class="fa-solid fa-book-open-reader"></i> Projects &amp; downtime</button>
      </div>
      <p class="dt-hint">Everyone gets the camp window. They vote on a spot, drag their characters onto jobs (cooking, foraging, hunting, tending wounds, keeping watch, studying…) and roll from their own sheets. You play the night out watch by watch, then apply the rest, boons and project progress in one click. Players open <strong>Camp</strong> and <strong>Projects</strong> from the token controls on the left.</p>`;
  }

  static #onTravelChat(this: ToolkitApp) {
    if (this.journey) postToChat(journeyHtml(this.journey), true);
  }

  // --- Settlement: hand its people, shops and trouble to the other tabs.

  static #onTownNpc(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const t = this.town;
    if (!t) return;
    const [who, i] = (target.dataset.who ?? "").split(":");
    const npc = who === "leader" ? t.leader : who === "inn" ? t.inn.keeper : who === "temple" ? t.temple.priest
      : who === "notable" ? t.notables[Number(i)] : who === "faction" ? t.factions[Number(i)]?.leader : undefined;
    if (!npc) return;
    this.#readForm();
    this.npc = npc;
    this.tab = "npc";
    this.render();
  }

  static #onTownShop(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const shop = this.town?.shops[Number(target.dataset.index)];
    if (!shop) return;
    this.#readForm();
    this.shop = shop;
    this.tab = "shop";
    this.render();
  }

  static #onTownTrouble(this: ToolkitApp) {
    const t = this.town;
    if (!t) return;
    this.#readForm();
    Object.assign(this.form.sidequest, { mode: "premade", archetype: t.trouble.archetype, level: this.form.town.level, seed: "" });
    this.tab = "sidequest";
    this.#generate("sidequest");
  }

  static #onTownScene(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const t = this.town;
    if (t) this.#run(target, async () => ui.notifications.info(`Created scene "${(await createTownScene(t)).name}".`));
  }

  static #onTownJournal(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const t = this.town;
    if (t) this.#run(target, () => createTownJournal(t));
  }

  // --- Side quest buildout: hand a mission's seeds to the other tabs.

  static #onQuestMap(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const m = this.#mission(target);
    if (!m?.map) return;
    this.#readForm();
    const q = this.sidequest!;
    // The mission's fight comes along, ready to place on the map.
    const enc = this.missionEncounters.get(m.id);
    if (enc) this.encounter = enc;
    if (m.map.type === "battlemap") {
      Object.assign(this.form.battlemap, { seed: m.map.seed, setting: m.map.setting ?? "random", name: m.title, place: !!enc });
      this.tab = "battlemap";
      this.#generate("battlemap");
    } else {
      Object.assign(this.form.dungeon, { seed: m.map.seed, style: m.map.type, tags: this.missionTags.get(m.id) ?? q.tags[0] ?? "", level: q.partyLevel, size: this.form.sidequest.size, name: m.title });
      this.tab = "dungeon";
      this.#generate("dungeon");
    }
  }

  static #onQuestEncounter(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const m = this.#mission(target);
    if (!m?.encounter) return;
    this.#readForm();
    Object.assign(this.form.encounter, { seed: m.encounter.seed, tags: this.missionTags.get(m.id) ?? m.encounter.tags[0] ?? "", difficulty: m.encounter.difficulty, template: m.encounter.template ?? "auto", level: this.sidequest!.partyLevel, size: this.form.sidequest.size });
    this.locked.clear();
    this.tab = "encounter";
    this.#generate("encounter");
  }

  static #onQuestNpc(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const m = this.#mission(target);
    if (!m?.npc) return;
    this.#readForm();
    this.npc = m.npc;
    this.tab = "npc";
    this.render();
  }

  static #onQuestLoot(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const m = this.#mission(target);
    if (!m?.hoard) return;
    this.#readForm();
    Object.assign(this.form.loot, { seed: m.hoard.seed, cr: m.hoard.cr, mode: "hoard" });
    this.tab = "loot";
    this.#generate("loot");
  }

  static #onQuestCheck(this: ToolkitApp, _e: Event, target: HTMLElement) {
    const c = this.#mission(target)?.checks[Number(target.dataset.check)];
    if (!c) return;
    this.#readForm();
    Object.assign(this.form.rolls, { prompt: `${c.why.charAt(0).toUpperCase()}${c.why.slice(1)}.`, roll: `${c.type === "save" ? "save" : "skill"}:${c.key}`, dc: c.dc });
    this.tab = "rolls";
    this.render();
  }

  static async #onQuestReroll(this: ToolkitApp, _e: Event, target: HTMLElement) {
    if (!this.sidequest || !target.dataset.mission) return;
    this.#readForm();
    this.sidequest = rerollMission(this.sidequest, target.dataset.mission, randomSeed());
    await this.#rollMissionEncounters();
    this.render();
  }

  static #onQuestJournal(this: ToolkitApp) {
    const q = this.sidequest;
    if (q) createJournal(q.title, sideQuestHtml(q, this.missionEncounters), { kind: "sidequest", seed: q.seed });
  }

  static #onQuestChat(this: ToolkitApp) {
    const q = this.sidequest;
    if (q) postToChat(sideQuestHtml(q, this.missionEncounters), true);
  }

  // --- Roll requests

  static #onRollPreset(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForm();
    const [, prompt, roll, dc, rollMode] = ROLL_PRESETS[Number(target.dataset.index)]!;
    Object.assign(this.form.rolls, { prompt, roll, dc, rollMode });
    this.render();
  }

  static #onRollSend(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#readForm();
    const boxes = [...this.element.querySelectorAll("input.dt-roll-actor")] as HTMLInputElement[];
    this.#rollSkip = new Set(boxes.filter((b) => !b.checked).map((b) => b.value));
    const actorIds = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!actorIds.length) return ui.notifications.warn("Tick at least one character.");
    const f = this.form.rolls;
    const [type, key] = f.roll.split(":") as [RollRequest["type"], string];
    this.#run(target, () => sendRollRequest({
      id: randomSeed(), prompt: f.prompt.trim(), type, key, dc: f.dc > 0 ? f.dc : null, showDc: f.showDc,
      advantage: f.advantage, rollMode: f.rollMode, actorIds,
    }));
  }

  static #onRollForThem(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    const state = requests.find((r) => r.request.id === target.dataset.request);
    if (state && target.dataset.actor) this.#run(target, () => rollForThem(state, target.dataset.actor!));
  }

  /** From an encounter: ask for the roll its situation calls for. */
  static #onEncAskRoll(this: ToolkitApp) {
    const e = this.encounter;
    if (!e) return;
    this.#readForm();
    const s = e.situation.toLowerCase();
    const roll = /stealth vs|ambush|hidden/.test(s) ? "skill:prc" : /surprise|stealth check/.test(s) ? "skill:ste" : /negotiab|deserter|argument/.test(s) ? "skill:ins" : "skill:prc";
    Object.assign(this.form.rolls, { prompt: e.situation, roll, dc: 10 + Math.max(2, Math.ceil(e.partyLevel / 2)), rollMode: roll === "skill:ste" ? "publicroll" : "gmroll" });
    this.tab = "rolls";
    this.render();
  }

  #parseImport() {
    const { text, kind } = this.form.import;
    this.statblock = null;
    this.parsed = [];
    if (kind === "statblock" || (kind === "auto" && looksLikeStatblock(text))) this.statblock = parseStatblock(text);
    else this.parsed = parseText(text, kind);
    if (!this.parsed.length && !this.statblock) ui.notifications.warn("Nothing to parse: paste some text first.");
    this.render();
  }

  static #onImportParse(this: ToolkitApp) {
    this.#readForm();
    this.#parseImport();
  }

  static #onImportClear(this: ToolkitApp) {
    this.form.import.text = "";
    this.parsed = [];
    this.statblock = null;
    this.render();
  }

  async #createStatblockActor(place: boolean) {
    const sb = this.statblock!;
    const { actor, missingSpells } = await createStatblockActor(sb);
    if (missingSpells.length) ui.notifications.warn(`DnD Toolkit: ${actor.name} created; these spells aren't in your compendiums: ${missingSpells.join(", ")}.`);
    else ui.notifications.info(`Created ${actor.name}.`);
    if (place) await placeNpcToken(actor);
    else actor.sheet?.render(true);
  }

  static #onImportActor(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    if (this.statblock) this.#run(target, () => this.#createStatblockActor(false));
  }

  static #onImportActorPlace(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    if (this.statblock) this.#run(target, () => this.#createStatblockActor(true));
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

  static #onForgeEdit(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForgeEditor();
    this.#readForm();
    this.#forgeEditing = Number(target.dataset.index);
    this.render();
  }

  static #onForgeCurse(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForgeEditor();
    const i = Number(target.dataset.index);
    const it = this.forged[i];
    if (it) this.forged[i] = it.cursed ? liftCurse(it) : curseItem(it, randomSeed());
    this.render();
  }

  static #onForgeEditorCurse(this: ToolkitApp) {
    this.#readForgeEditor();
    const i = this.#forgeEditing;
    if (i !== null && this.forged[i]) this.forged[i] = curseItem(this.forged[i]!, randomSeed());
    this.render();
  }

  static #onForgeEditorLift(this: ToolkitApp) {
    this.#readForgeEditor();
    const i = this.#forgeEditing;
    if (i !== null && this.forged[i]) this.forged[i] = liftCurse(this.forged[i]!);
    this.render();
  }

  static #onForgeNew(this: ToolkitApp) {
    this.#readForgeEditor();
    this.#readForm();
    this.forged.unshift(blankItem("wondrous"));
    this.#forgeEditing = 0;
    this.render();
  }

  static #onForgeSave(this: ToolkitApp) {
    this.#readForgeEditor();
    this.#readForm();
    this.#forgeEditing = null;
    this.render();
  }

  static #onForgeCancel(this: ToolkitApp) {
    this.#readForm();
    this.#forgeEditing = null;
    this.render();
  }

  static #onForgeEffectAdd(this: ToolkitApp) {
    this.#readForgeEditor();
    const it = this.#forgeEditing === null ? null : this.forged[this.#forgeEditing];
    const t = EFFECT_CATALOG[0]!;
    it?.effects.push({ label: t.label, key: t.key, mode: t.mode, value: t.sample });
    this.render();
  }

  static #onForgeEffectRemove(this: ToolkitApp, _e: Event, target: HTMLElement) {
    this.#readForgeEditor();
    const it = this.#forgeEditing === null ? null : this.forged[this.#forgeEditing];
    it?.effects.splice(Number(target.dataset.row), 1);
    this.render();
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
    this.#readForgeEditor();
    this.#run(target, async () => {
      for (const it of this.forged) await createForgedItem(it, { render: false });
      ui.notifications.info(`Created ${this.forged.length} items in the DnD Toolkit folder.`);
    });
  }

  static #onForgeGiveAll(this: ToolkitApp, _e: Event, target: HTMLButtonElement) {
    this.#readForgeEditor();
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

  static #onHookReroll(this: ToolkitApp, _e: Event, target: HTMLElement) {
    if (!this.hook) return;
    this.#readHookEditor();
    const textWasComposed = this.hook.text === composeHookText(this.hook);
    const next = rerollHookPart(this.hook, target.dataset.part as HookPart, randomSeed());
    // Keep a hand-written text unless it was the generated one.
    this.hook = textWasComposed ? next : { ...next, text: this.hook.text };
    this.render();
  }

  static #onHookRebuild(this: ToolkitApp) {
    if (!this.hook) return;
    this.#readHookEditor();
    this.hook.text = composeHookText(this.hook);
    this.render();
  }

  static #onHookBlank(this: ToolkitApp) {
    this.#readForm();
    const tone = this.form.hook.tone === "any" ? "heroic" : this.form.hook.tone;
    this.hook = {
      seed: `custom-${Date.now().toString(36)}`, title: "", text: "", patron: "", location: "", goal: "", complication: "", villain: "",
      deadline: "", rewardGp: 0, bonusReward: "", twist: "", tone, partyLevel: this.form.hook.level,
    };
    this.render();
  }

  static #onHookChat(this: ToolkitApp) {
    this.#readHookEditor();
    if (this.hook) postToChat(hookHtml(this.hook), true);
  }

  static #onHookJournal(this: ToolkitApp) {
    this.#readHookEditor();
    if (this.hook) createJournal(this.hook.title, hookHtml(this.hook), { kind: "hook", seed: this.hook.seed });
  }
}

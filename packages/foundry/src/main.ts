import * as core from "@dnd-toolkit/core";
import { detectParty, ToolkitApp } from "./app.ts";
import { getCatalog, getMagicItems, reanalyzeMonsters, resetCatalog } from "./catalog.ts";
import { createDungeonScene } from "./importers/scene.ts";
import { createJournal, createRoomKeyJournal, encounterHtml, hookHtml, lootHtml, postToChat } from "./importers/journal.ts";
import { ensureWorldActor, linkEncounter, placeEncounter } from "./importers/tokens.ts";
import { giveLootToActor, resetItemIndex, resolveItemData } from "./importers/items.ts";
import { MODULE_ID } from "./util.ts";

/**
 * Public API for macros and other modules:
 *   const tk = game.modules.get("dnd-toolkit").api;
 *   const map = tk.generateDungeon({ seed: "crypt" });
 *   await tk.createDungeonScene(map, { roomKey: tk.stockDungeon(map, { partyLevel: 4 }) });
 *
 *   // Encounter from your compendiums, dropped on the current scene with initiative rolled:
 *   const catalog = await tk.getCatalog("compendium");
 *   const enc = tk.generateEncounter({ catalog, partyLevel: 5, tags: "humanoid+orc", difficulty: "high" });
 *   await tk.placeEncounter(enc, { startCombat: true });
 */
const api = {
  ...core,
  open: (tab?: "encounter" | "dungeon" | "loot" | "hook") => ToolkitApp.open(tab),
  getCatalog,
  getMagicItems,
  resetCatalog,
  /** Re-read every compendium statblock to recompute combat roles. */
  reanalyzeMonsters,
  detectParty,
  placeEncounter,
  linkEncounter,
  ensureWorldActor,
  encounterHtml,
  createDungeonScene,
  createRoomKeyJournal,
  createJournal,
  postToChat,
  lootHtml,
  hookHtml,
  giveLootToActor,
  resolveItemData,
  resetItemIndex,
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "gridSize", {
    name: "Generated map grid size",
    hint: "Pixels per square for generated dungeon scenes. 100 is Foundry's default; lower values make smaller images.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 50, max: 200, step: 10 },
    default: 100,
  });
  // Combat roles derived from compendium statblocks, so each monster is only analyzed once.
  game.settings.register(MODULE_ID, "roleCache", { scope: "world", config: false, type: Object, default: {} });
  game.modules.get(MODULE_ID).api = api;
});

// New or deleted NPCs/compendium content changes what encounters can use.
for (const hook of ["createActor", "deleteActor", "createItem", "deleteItem", "updateCompendium"]) Hooks.on(hook, () => resetCatalog());

Hooks.once("ready", () => {
  Hooks.callAll(`${MODULE_ID}.ready`, api);
});

Hooks.on("getSceneControlButtons", (controls: any) => {
  if (!game.user.isGM) return;
  const tool = {
    name: MODULE_ID,
    title: "DnD Toolkit",
    icon: "fa-solid fa-dice-d20",
    button: true,
    order: 100,
    visible: true,
    onChange: () => ToolkitApp.open(),
  };
  if (Array.isArray(controls)) {
    // v12: array of controls, tools are arrays, buttons use onClick.
    controls.find((c: any) => c.name === "token")?.tools.push({ ...tool, onClick: tool.onChange });
  } else if (controls.tokens?.tools) {
    // v13+: records keyed by name, buttons use onChange.
    controls.tokens.tools[MODULE_ID] = tool;
  }
});

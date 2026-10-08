import * as core from "@dnd-toolkit/core";
import { detectParty, ToolkitApp, type Tab } from "./app.ts";
import { createBattlemapScene } from "./importers/battlemap.ts";
import { createNpcActor, npcHtml, placeNpcToken } from "./importers/npc.ts";
import { createForgedItem, forgedItemData, giveForgedItems } from "./importers/forge.ts";
import { addParsedToActor, createParsedItems, parsedItemData } from "./importers/parsed.ts";
import { createStatblockActor } from "./importers/statblock.ts";
import { getCatalog, getMagicItems, reanalyzeMonsters, resetCatalog } from "./catalog.ts";
import { createDungeonScene } from "./importers/scene.ts";
import { createJournal, createRoomKeyJournal, encounterHtml, hookHtml, lootHtml, postToChat } from "./importers/journal.ts";
import { ensureWorldActor, linkEncounter, placeEncounter } from "./importers/tokens.ts";
import { createMerchant, createShopJournal, getShopItems, resetShopItems, shopHtml } from "./importers/shop.ts";
import { giveLootToActor, resetItemIndex, resolveItemData } from "./importers/items.ts";
import { MODULE_ID } from "./util.ts";
import { initRollRequests, sendRollRequest } from "./rolls.ts";
import { initCombatHelpers, registerCombatSettings } from "./combat.ts";
import { initInteractive, noticeTrap, setTrapArmed, springTrap } from "./interactive.ts";

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
 *
 *   // Reinforcements; place them when they arrive (they join the running combat):
 *   const withWave = tk.addWave(enc, { catalog });
 *   await tk.placeEncounter(withWave.waves[0], { startCombat: true });
 */
const api = {
  ...core,
  open: (tab?: Tab) => ToolkitApp.open(tab),
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
  createMerchant,
  createShopJournal,
  getShopItems,
  shopHtml,
  createDungeonScene,
  /** await tk.createBattlemapScene(tk.generateBattlemap({ setting: "tavern", night: true }), { encounter }) */
  createBattlemapScene,
  /** const actor = await tk.createNpcActor(tk.generateNpc({ role: "guard" })); await tk.placeNpcToken(actor); */
  createNpcActor,
  /** await tk.giveForgedItems(tk.forgeItems(3, { kind: "weapon", rarity: "rare" }), actor) */
  createForgedItem,
  forgedItemData,
  giveForgedItems,
  /** await tk.addParsedToActor(tk.parseText(pastedStatblockActions), actor) */
  createParsedItems,
  addParsedToActor,
  parsedItemData,
  /** const { actor } = await tk.createStatblockActor(tk.parseStatblock(pastedStatblock)) */
  createStatblockActor,
  /** await tk.sendRollRequest({ id: "x", prompt: "", type: "skill", key: "prc", dc: 13, showDc: false, advantage: "normal", rollMode: "publicroll", actorIds: [...] }) */
  sendRollRequest,
  placeNpcToken,
  npcHtml,
  createRoomKeyJournal,
  createJournal,
  postToChat,
  lootHtml,
  hookHtml,
  giveLootToActor,
  resolveItemData,
  resetItemIndex,
  /** Called by trap Regions' scripts: a token stepped on a trap / walked up to one. */
  springTrap,
  noticeTrap,
  /** await tk.setTrapArmed(region, true) re-arms a sprung trap. */
  setTrapArmed,
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
  registerCombatSettings();
  // Monsters used lately, so generators don't keep reaching for the same ones.
  game.settings.register(MODULE_ID, "recentMonsters", { scope: "client", config: false, type: Array, default: [] });
  game.modules.get(MODULE_ID).api = api;
});

// New or deleted NPCs/compendium content changes what encounters can use.
for (const hook of ["createActor", "deleteActor", "createItem", "deleteItem", "updateCompendium"]) {
  Hooks.on(hook, () => {
    resetCatalog();
    resetShopItems();
  });
}

Hooks.once("ready", () => {
  initRollRequests();
  initCombatHelpers();
  initInteractive();
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

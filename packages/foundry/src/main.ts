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
import { initPuzzles, puzzleStep } from "./puzzles.ts";
import { initQuickCombat, quickAct, registerQuickCombatSettings } from "./quick-combat.ts";
import { ActionBar } from "./action-bar.ts";
import { initPartyHud, registerPartyHudSettings } from "./party-hud.ts";
import { registerPrepSettings } from "./session-prep.ts";
import { registerWorldSettings } from "./world-map.ts";
import { createPile, ensureStash, initPiles, openStash, pileEnter, placeLoot, registerPileSettings, searchHere } from "./loot-piles.ts";
import { CampApp } from "./camp-app.ts";
import { registerFaSettings } from "./fa-assets.ts";
import { registerCampaignSettings } from "./campaign-store.ts";
import { registerEffectSettings } from "./effects.ts";
import { ProjectsApp } from "./projects-app.ts";
import { grantDowntime, initDowntimeSocket, logJourney, registerDowntimeSettings } from "./downtime.ts";

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
  /** Called by puzzle Regions' scripts: a token stepped on a lever, plate, statue or rune. */
  puzzleStep,
  /** await tk.quickAct(actor, item, "advantage") — pick a target and resolve an attack, save or heal. */
  quickAct,
  /** await tk.setTrapArmed(region, true) re-arms a sprung trap. */
  setTrapArmed,
  /** Open the shared camp window, or the projects window. */
  openCamp: () => CampApp.open(),
  openProjects: (actorId?: string) => ProjectsApp.open(actorId),
  /** await tk.grantDowntime(game.actors.filter(a => a.hasPlayerOwner), 3) */
  grantDowntime,
  logJourney,
  /** Called by loot pile Regions' scripts: a token walked up to a pile. */
  pileEnter,
  /** await tk.placeLoot(canvas.scene, tk.generateLoot({ cr: 5, mode: "hoard" }), { x: 10, y: 4 }, { hidden: true, searchDc: 15 }) */
  placeLoot,
  createPile,
  /** Open the pile you're next to, or search around the selected token. */
  searchHere,
  ensureStash,
  openStash,
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
  registerDowntimeSettings(() => CampApp.refresh());
  registerFaSettings();
  registerCampaignSettings();
  registerQuickCombatSettings();
  registerEffectSettings();
  registerPartyHudSettings();
  registerPrepSettings();
  registerWorldSettings();
  registerPileSettings();
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
  initPuzzles();
  initQuickCombat();
  initPartyHud();
  initPiles();
  initDowntimeSocket();
  // Someone joining mid-camp gets the camp window too.
  CampApp.refresh();
  Hooks.callAll(`${MODULE_ID}.ready`, api);
});

Hooks.on(`${MODULE_ID}.campaignChanged`, () => ToolkitApp.refreshTab("campaign"));
// Projects redraw when a character's projects (or the day) change.
Hooks.on(`${MODULE_ID}.downtimeChanged`, () => ProjectsApp.refresh());
Hooks.on("updateActor", (_actor: any, change: any) => {
  if (change?.flags?.[MODULE_ID] || change?.system?.currency || change?.items) ProjectsApp.refresh();
});
for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, (item: any) => item.parent?.documentName === "Actor" && ProjectsApp.refresh());

Hooks.on("getSceneControlButtons", (controls: any) => {
  // Everyone: camp and projects.
  const shared = [
    { name: `${MODULE_ID}-camp`, title: "Camp", icon: "fa-solid fa-campground", button: true, visible: true, order: 101, onChange: () => CampApp.open() },
    { name: `${MODULE_ID}-projects`, title: "Projects & Downtime", icon: "fa-solid fa-book-open-reader", button: true, visible: true, order: 102, onChange: () => ProjectsApp.open() },
    { name: `${MODULE_ID}-actions`, title: "Quick actions (select your token)", icon: "fa-solid fa-hand-fist", button: true, visible: true, order: 103, onChange: () => ActionBar.show(canvas.tokens?.controlled[0]) },
    { name: `${MODULE_ID}-search`, title: "Search / loot (select your token)", icon: "fa-solid fa-magnifying-glass", button: true, visible: true, order: 104, onChange: () => searchHere() },
    { name: `${MODULE_ID}-stash`, title: "Party stash", icon: "fa-solid fa-sack-dollar", button: true, visible: true, order: 105, onChange: () => openStash() },
  ];
  if (Array.isArray(controls)) controls.find((c: any) => c.name === "token")?.tools.push(...shared.map((t) => ({ ...t, onClick: t.onChange })));
  else if (controls.tokens?.tools) for (const t of shared) controls.tokens.tools[t.name] = t;
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

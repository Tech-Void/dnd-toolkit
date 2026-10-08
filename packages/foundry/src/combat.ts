import { captiveTalk, lairActions, rateEncounter, turnAdvice, type EncounterGroup, type LootResult, type Wave } from "@dnd-toolkit/core";
import { lootHtml } from "./importers/journal.ts";
import { giveLootToActor, resolveItemData } from "./importers/items.ts";
import { itemPilesActive } from "./importers/shop.ts";
import { placeEncounter } from "./importers/tokens.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Help during fights with generated encounters: morale breaks when the leader falls or half the
// group is down, waves arrive on their round, the fallen can become loot piles, and the combat
// tracker shows how dangerous what's left still is.

const SETTINGS: [key: string, name: string, hint: string][] = [
  ["combatMorale", "Combat: morale checks", "When a generated fight's leader falls or half the group is down, offer a morale roll; those who fail flee (frightened)."],
  ["combatWaves", "Combat: waves on cue", "When combat reaches a wave's round, post a card to bring the reinforcements in."],
  ["combatLootPiles", "Combat: fallen foes become loot piles", "With Item Piles, a defeated monster from a generated fight turns into a lootable pile."],
  ["combatTreasure", "Combat: treasure when the fight ends", "When the last foe of a generated fight falls, post its treasure with buttons to hand it out."],
  ["combatMeter", "Combat: threat meter", "Show how dangerous the remaining foes are for the party, in the combat tracker."],
  ["combatTactics", "Combat: monster turn cards", "On each monster's turn, whisper the GM what it does (target, retreat, recharge ready) with buttons for its attacks and abilities."],
  ["combatLegendary", "Combat: legendary and lair actions", "Prompt legendary actions at the end of each other creature's turn (and refresh them on the monster's turn), and lair actions at the top of each round."],
];

export function registerCombatSettings() {
  for (const [key, name, hint] of SETTINGS) {
    game.settings.register(MODULE_ID, key, { name, hint, scope: "world", config: true, type: Boolean, default: true });
  }
}

const on = (key: string) => !!game.settings.get(MODULE_ID, key);
/** Only one client acts: the active GM. */
const isActingGm = () => game.user.isGM && (game.users.activeGM?.id ?? game.user.id) === game.user.id;
const hp = (actor: any) => Number(actor?.system?.attributes?.hp?.value ?? 1);
const encounterOf = (token: any): string | undefined => token?.getFlag?.(MODULE_ID, "encounter");

/** Tokens in the scene from the same generated fight. */
const fightTokens = (scene: any, id: string) => scene.tokens.filter((t: any) => encounterOf(t) === id);

const gmWhisper = () => game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
const card = (html: string, flags: object = {}) =>
  ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: gmWhisper(), content: `<div class="dt-combat-card">${html}</div>`, flags: { [MODULE_ID]: flags } });

const brokenFights = new Set<string>();

// --- A foe falls ---------------------------------------------------------------

async function onFoeDown(token: any) {
  const id = encounterOf(token);
  if (!id) return;
  const scene = token.parent;
  const all = fightTokens(scene, id);
  const standing = all.filter((t: any) => hp(t.actor) > 0);

  if (on("combatLootPiles") && itemPilesActive()) {
    try {
      await game.itempiles.API.turnTokensIntoItemPiles([token]);
    } catch (err) {
      console.warn(`${MODULE_ID} | loot pile`, err);
    }
  }

  if (!standing.length) {
    if (on("combatTreasure")) await announceTreasure(id, token);
    return;
  }
  if (!on("combatMorale") || brokenFights.has(id)) return;
  const leaderFell = !!token.getFlag(MODULE_ID, "leader");
  const halfDown = standing.length * 2 <= all.length;
  if (!leaderFell && !halfDown) return;
  brokenFights.add(id);
  await card(
    `<p><strong>${leaderFell ? `${esc(token.name)} falls!` : "Half of them are down."}</strong> The rest (${standing.map((t: any) => esc(t.name)).join(", ")}) must hold their nerve.</p>
     <button type="button" data-dt-morale="${id}" data-scene="${scene.id}"><i class="fa-solid fa-person-running"></i> Roll morale (Wisdom DC 10)</button>`,
  );
}

async function rollMorale(sceneId: string, id: string) {
  const scene = game.scenes.get(sceneId);
  if (!scene) return;
  const standing = fightTokens(scene, id).filter((t: any) => hp(t.actor) > 0);
  const lines: string[] = [];
  for (const t of standing) {
    const roll = await t.actor.rollAbilitySave("wis", { fastForward: true, chatMessage: false });
    const total = roll?.total ?? 0;
    const flees = total < 10;
    if (flees) await t.actor.toggleStatusEffect?.("frightened", { active: true });
    lines.push(`<li>${esc(t.name)} (${total}): ${flees ? `<strong>breaks</strong> <button type="button" data-dt-surrender="${t.id}" data-scene="${scene.id}" title="They throw down their weapons: out of the fight, and ready to talk"><i class="fa-solid fa-flag"></i> Surrenders</button>` : "holds"}</li>`);
  }
  await card(`<p><strong>Morale</strong></p><ul>${lines.join("")}</ul><p><em>Those who break are frightened: they Dash away, or surrender if cornered.</em></p>`);
}

/** A creature gives up: it leaves the fight (neutral, out of initiative) and the GM gets what it knows. */
async function surrender(sceneId: string, tokenId: string) {
  const token = game.scenes.get(sceneId)?.tokens.get(tokenId);
  if (!token) return;
  await token.update({ disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL });
  await token.actor?.toggleStatusEffect?.("frightened", { active: false });
  const combatant = game.combat?.combatants.find((c: any) => c.tokenId === tokenId);
  if (combatant) await combatant.update({ defeated: true });
  const boss = token.parent.tokens.find((t: any) => encounterOf(t) === encounterOf(token) && t.getFlag(MODULE_ID, "leader"))?.name;
  await card(`<p><i class="fa-solid fa-flag"></i> ${esc(captiveTalk(token.name, `${tokenId}:${game.combat?.round ?? 0}`, { boss }))}</p>`);
}

// --- Monster turns ---------------------------------------------------------------------

/** Items a monster can use on its turn, by activation type. */
const usable = (actor: any, types: string[]) => [...(actor?.items ?? [])].filter((i: any) => types.includes(i.system?.activation?.type) && ["weapon", "feat", "spell", "consumable"].includes(i.type));

const itemButton = (actor: any, i: any, extra = "") =>
  `<button type="button" data-dt-use="${i.id}" data-actor="${actor.uuid}" ${extra}>${esc(i.name)}${i.system?.recharge?.value ? ` <small>(${i.system.recharge.charged ? "ready" : `recharge ${i.system.recharge.value}+`})</small>` : ""}</button>`;

/** The current monster's turn: what it should do, and its actions as buttons. */
async function monsterTurn(combat: any) {
  const c = combat.combatant;
  const actor = c?.actor;
  const token = c?.token;
  if (!actor || actor.type !== "npc" || c.isDefeated || hp(actor) <= 0) return;
  // Legendary actions come back at the start of its turn.
  const legact = actor.system?.resources?.legact;
  if (legact?.max && legact.value < legact.max) await actor.update({ "system.resources.legact.value": legact.max });
  if (!on("combatTactics")) return;
  const maxHp = Number(actor.system?.attributes?.hp?.max ?? 1);
  const center = token?.object?.center ?? { x: token?.x ?? 0, y: token?.y ?? 0 };
  const gs = canvas.grid?.size ?? 100;
  const party = combat.combatants.filter((x: any) => x.actor?.type === "character" && !x.isDefeated && hp(x.actor) > 0);
  const foes = party.map((x: any) => {
    const o = x.token?.object?.center ?? { x: x.token?.x ?? 0, y: x.token?.y ?? 0 };
    return {
      name: x.name, hp: hp(x.actor) / Math.max(1, Number(x.actor.system?.attributes?.hp?.max ?? 1)),
      distance: Math.round(Math.hypot(o.x - center.x, o.y - center.y) / gs) * 5,
      caster: !!x.actor.system?.attributes?.spellcasting, ac: x.actor.system?.attributes?.ac?.value,
    };
  }).sort((a: any, b: any) => a.distance - b.distance);
  const allies = combat.combatants.filter((x: any) => x !== c && x.actor?.type === "npc" && (x.token?.disposition ?? -1) < 0 && !x.isDefeated && hp(x.actor) > 0).length;
  const actions = usable(actor, ["action", "bonus"]);
  const recharge = actions.filter((i: any) => i.system?.recharge?.value).map((i: any) => ({ name: i.name, ready: !!i.system.recharge.charged }));
  const advice = turnAdvice({
    name: actor.name, hp: hp(actor) / Math.max(1, maxHp), roles: token?.getFlag(MODULE_ID, "roles") ?? [], type: actor.system?.details?.type?.value,
    int: actor.system?.abilities?.int?.value, leader: !!token?.getFlag(MODULE_ID, "leader"), allies, foes, recharge,
    signature: actions.find((i: any) => /multiattack/i.test(i.name))?.name,
  });
  const pct = Math.round((hp(actor) / Math.max(1, maxHp)) * 100);
  const uncharged = actions.filter((i: any) => i.system?.recharge?.value && !i.system.recharge.charged);
  await card(`<p><strong>${esc(c.name)}</strong>'s turn <span class="dt-hpbar"><span style="width:${pct}%"></span></span> ${hp(actor)}/${maxHp} HP</p>
    <ul>${advice.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    <div class="dt-turn-actions">${actions.map((i: any) => itemButton(actor, i)).join("")}
      ${uncharged.map((i: any) => `<button type="button" data-dt-recharge="${i.id}" data-actor="${actor.uuid}"><i class="fa-solid fa-dice-six"></i> Recharge ${esc(i.name)}</button>`).join("")}</div>`);
}

/** At the end of each turn: any legendary creature (other than the one whose turn ended) may act. */
async function legendaryPrompt(combat: any, endedId: string | undefined) {
  for (const c of combat.combatants) {
    const actor = c.actor;
    const legact = actor?.system?.resources?.legact;
    if (!legact?.max || legact.value <= 0 || c.id === endedId || c.isDefeated || hp(actor) <= 0) continue;
    const options = usable(actor, ["legendary"]);
    if (!options.length) continue;
    await card(`<p><i class="fa-solid fa-crown"></i> <strong>${esc(c.name)}</strong> can take a legendary action (${legact.value} left):</p>
      <div class="dt-turn-actions">${options.map((i: any) => itemButton(actor, i, `data-legendary="${i.system?.activation?.cost ?? 1}"`)).join("")}</div>`);
  }
}

/** Top of the round: lair actions for any boss fighting in its lair. */
async function lairPrompt(combat: any) {
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor || c.isDefeated || hp(actor) <= 0) continue;
    const own = usable(actor, ["lair"]);
    const inLair = !!actor.system?.resources?.lair?.value || !!c.token?.getFlag(MODULE_ID, "lair");
    if (!own.length && !inLair) continue;
    const generated = own.length ? [] : lairActions(c.token?.getFlag(MODULE_ID, "type") ?? actor.system?.details?.type?.value ?? "any", Number(c.token?.getFlag(MODULE_ID, "cr") ?? actor.system?.details?.cr ?? 3), `${combat.id}:${combat.round}`);
    await card(`<p><i class="fa-solid fa-dungeon"></i> <strong>Initiative 20: ${esc(c.name)}'s lair acts</strong> (pick one, not the same twice in a row)</p>
      ${own.length ? `<div class="dt-turn-actions">${own.map((i: any) => itemButton(actor, i)).join("")}</div>` : `<ul>${generated.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`}`);
  }
}

// --- Treasure -------------------------------------------------------------------------

async function announceTreasure(id: string, lastToken: any) {
  const loot: LootResult | null = lastToken.parent?.getFlag(MODULE_ID, `encounters.${id}`)?.loot ?? null;
  if (!loot) {
    await card(`<p><strong>The last foe falls.</strong> No treasure was rolled for this fight; try the Loot tab.</p>`);
    return;
  }
  await card(
    `<p><strong>The last foe falls.</strong> Their treasure:</p>${lootHtml(loot)}
     ${itemPilesActive() ? `<button type="button" data-dt-pile="${id}" data-scene="${lastToken.parent.id}" data-x="${lastToken.x}" data-y="${lastToken.y}"><i class="fa-solid fa-sack-dollar"></i> Drop it as a loot pile here</button>` : ""}
     <button type="button" data-dt-give="${id}"><i class="fa-solid fa-hand-holding"></i> Give to selected token</button>`,
    { loot },
  );
}

async function dropLootPile(message: any, sceneId: string, x: number, y: number) {
  const loot: LootResult = message.getFlag(MODULE_ID, "loot");
  const items = await Promise.all(loot.items.map(resolveItemData));
  const currency = Object.fromEntries(Object.entries(loot.coins).filter(([, n]) => n > 0));
  await game.itempiles.API.createItemPile({
    sceneId,
    position: { x, y },
    items,
    actorOverrides: Object.keys(currency).length ? { system: { currency } } : undefined,
    tokenOverrides: { name: "Treasure" },
  });
}

// --- Waves -------------------------------------------------------------------------------

async function onRound(combat: any) {
  const scene = combat.scene ?? canvas.scene;
  if (!on("combatWaves") || !scene) return;
  const fights: Record<string, { waves: Wave[]; arrived: number[] }> = scene.getFlag(MODULE_ID, "encounters") ?? {};
  for (const [id, fight] of Object.entries(fights)) {
    fight.waves.forEach(async (wave, i) => {
      if (wave.round !== combat.round || fight.arrived.includes(i)) return;
      await scene.setFlag(MODULE_ID, `encounters.${id}.arrived`, [...fight.arrived, i]);
      const who = wave.groups.map((g: EncounterGroup) => (g.count > 1 ? `${g.count}× ${g.name}` : g.name)).join(", ");
      await card(
        `<p><strong>Round ${wave.round}: reinforcements!</strong> ${esc(who)}</p><p><em>${esc(wave.arrival)}</em></p>
         <button type="button" data-dt-wave="${id}" data-index="${i}" data-scene="${scene.id}"><i class="fa-solid fa-person-running"></i> Bring them in</button>`,
      );
    });
  }
}

async function bringWave(sceneId: string, id: string, index: number) {
  const scene = game.scenes.get(sceneId);
  const wave: Wave | undefined = scene?.getFlag(MODULE_ID, `encounters.${id}`)?.waves?.[index];
  if (!wave) return;
  await placeEncounter(wave, { scene, hidden: false, startCombat: true, encounterId: id });
}

// --- Threat meter ------------------------------------------------------------------------

export function threatMeter(combat: any): string {
  const party = combat.combatants.filter((c: any) => c.actor?.type === "character");
  const foes = combat.combatants.filter((c: any) => c.actor?.type === "npc" && (c.token?.disposition ?? -1) < 0);
  if (!party.length || !foes.length) return "";
  const xpOf = (c: any) => Number(c.actor.system?.details?.xp?.value ?? 0);
  const total = foes.reduce((s: number, c: any) => s + xpOf(c), 0);
  const left = foes.filter((c: any) => !c.isDefeated && hp(c.actor) > 0).reduce((s: number, c: any) => s + xpOf(c), 0);
  const level = Math.round(party.reduce((s: number, c: any) => s + Number(c.actor.system?.details?.level ?? 1), 0) / party.length);
  const rating = rateEncounter(left, level, party.length);
  const pct = total ? Math.round((left / total) * 100) : 0;
  return `<div class="dt-threat dt-threat-${rating}" title="Remaining foes' XP against the party's budget">
    <span>Threat: <strong>${rating}</strong></span><span>${left.toLocaleString()} / ${total.toLocaleString()} XP left</span>
    <div class="dt-threat-bar"><div style="width:${pct}%"></div></div></div>`;
}

// --- Wiring ------------------------------------------------------------------------------

export function initCombatHelpers() {
  // A token's HP hits 0: unlinked tokens update through their synthetic actor.
  Hooks.on("updateActor", (actor: any, change: any) => {
    if (!isActingGm()) return;
    const newHp = change?.system?.attributes?.hp?.value;
    if (newHp === undefined || newHp > 0) return;
    const token = actor.token ?? actor.getActiveTokens?.()[0]?.document;
    if (token && encounterOf(token)) onFoeDown(token);
  });

  Hooks.on("updateCombat", (combat: any, change: any, _opts: any) => {
    if (!isActingGm()) return;
    if ("round" in (change ?? {})) {
      onRound(combat);
      if (on("combatLegendary") && combat.round > 0) lairPrompt(combat);
    }
    if ("turn" in (change ?? {}) || "round" in (change ?? {})) {
      // The previous combatant's turn just ended.
      const turns = combat.turns ?? [];
      const prev = turns[(combat.turn - 1 + turns.length) % Math.max(1, turns.length)];
      if (on("combatLegendary") && combat.started) legendaryPrompt(combat, prev?.id);
      if (combat.started) monsterTurn(combat);
    }
  });

  Hooks.on("renderCombatTracker", (_app: any, html: any) => {
    if (!game.user.isGM || !on("combatMeter") || !game.combat) return;
    const root: HTMLElement = html[0] ?? html;
    root.querySelector(".dt-threat")?.remove();
    const meter = threatMeter(game.combat);
    if (!meter) return;
    const header = root.querySelector("#combat-round, .combat-tracker-header, header");
    header?.insertAdjacentHTML("afterend", meter);
  });

  Hooks.on("renderChatMessage", (message: any, html: any) => {
    if (!game.user.isGM) return;
    const root: HTMLElement = html[0] ?? html;
    const once = (button: HTMLButtonElement, fn: () => Promise<unknown>) =>
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await fn();
        } catch (err) {
          ui.notifications.error(`DnD Toolkit: ${(err as Error).message}`);
          button.disabled = false;
        }
      });
    for (const b of root.querySelectorAll("button[data-dt-morale]") as NodeListOf<HTMLButtonElement>) once(b, () => rollMorale(b.dataset.scene!, b.dataset.dtMorale!));
    for (const b of root.querySelectorAll("button[data-dt-surrender]") as NodeListOf<HTMLButtonElement>) once(b, () => surrender(b.dataset.scene!, b.dataset.dtSurrender!));
    // Monster actions: use the item (the dnd5e card rolls it); legendary ones spend their cost.
    for (const b of root.querySelectorAll("button[data-dt-use]") as NodeListOf<HTMLButtonElement>) {
      b.addEventListener("click", async () => {
        const actor = await fromUuid(b.dataset.actor!);
        const item = actor?.items.get(b.dataset.dtUse);
        if (!item) return;
        await item.use?.();
        const cost = Number(b.dataset.legendary ?? 0);
        const legact = actor.system?.resources?.legact;
        if (cost && legact) await actor.update({ "system.resources.legact.value": Math.max(0, legact.value - cost) });
      });
    }
    for (const b of root.querySelectorAll("button[data-dt-recharge]") as NodeListOf<HTMLButtonElement>) {
      once(b, async () => {
        const actor = await fromUuid(b.dataset.actor!);
        await actor?.items.get(b.dataset.dtRecharge)?.rollRecharge?.();
      });
    }
    for (const b of root.querySelectorAll("button[data-dt-wave]") as NodeListOf<HTMLButtonElement>) once(b, () => bringWave(b.dataset.scene!, b.dataset.dtWave!, Number(b.dataset.index)));
    for (const b of root.querySelectorAll("button[data-dt-pile]") as NodeListOf<HTMLButtonElement>) once(b, () => dropLootPile(message, b.dataset.scene!, Number(b.dataset.x), Number(b.dataset.y)));
    for (const b of root.querySelectorAll("button[data-dt-give]") as NodeListOf<HTMLButtonElement>) {
      once(b, async () => {
        const actor = canvas.tokens?.controlled[0]?.actor ?? game.user.character;
        if (!actor) throw new Error("Select a token first.");
        await giveLootToActor(message.getFlag(MODULE_ID, "loot"), actor);
      });
    }
  });
}

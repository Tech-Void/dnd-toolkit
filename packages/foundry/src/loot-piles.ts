import {
  generateLoot,
  harvest,
  lootLine,
  makePile,
  pileEmpty,
  searchFinds,
  takeFromPile,
  trapRolls,
  tryContainer,
  type ContainerAttempt,
  type LootResult,
  type Pile,
  type PileKind,
  type Trap,
} from "@dnd-toolkit/core";
import { faManifest, faUrl } from "./fa-assets.ts";
import { giveLootToActor } from "./importers/items.ts";
import { ensureWorldActor } from "./importers/tokens.ts";
import { resolveNotice, resolveSecret } from "./interactive.ts";
import { partyActors, sendRollRequest } from "./rolls.ts";
import { esc, MODULE_ID } from "./util.ts";
import { logSession } from "./rewards.ts";

const lootValue = (l: Pick<LootResult, "coins" | "items">) =>
  l.coins.gp + l.coins.pp * 10 + l.coins.ep * 0.5 + l.coins.sp * 0.1 + l.coins.cp * 0.01 + l.items.reduce((n, i) => n + i.valueGp * i.quantity, 0);

// ---------------------------------------------------------------------------
// Treasure on the map. A pile is a Region (a one-square ring around it) carrying the pile's state,
// plus a Tile for chests and sacks (bodies use their own token). Walking up opens the loot window;
// hidden piles need a passive Perception or a Search first; containers may be locked, trapped or
// hungry. Everything taken goes to the party stash (dnd5e's primary party group actor). Players
// only ask; the active GM's client checks and moves the items.

const SOCKET = `module.${MODULE_ID}`;
const gmIds = () => game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
const isActingGm = () => !!game.users.activeGM?.isSelf;

export function registerPileSettings() {
  game.settings.register(MODULE_ID, "pilesAutoOpen", {
    name: "Loot: open piles when a character walks up", hint: "Walking next to a visible pile opens its loot window (not during a fight in that scene; use Search / loot then).",
    scope: "client", config: true, type: Boolean, default: true,
  });
}

// --- State on the Region -------------------------------------------------------------------------

/** The pile kept on a Region (as JSON, so removed fields really go away). */
export function getPile(region: any): Pile | null {
  const raw = region?.flags?.[MODULE_ID]?.pile;
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
const setPile = (region: any, pile: Pile) => region.update({ [`flags.${MODULE_ID}.pile`]: JSON.stringify(pile) });

export const pileRegions = (scene: any = canvas.scene): any[] => [...(scene?.regions ?? [])].filter((r: any) => r.flags?.[MODULE_ID]?.pile);

// --- The party stash -------------------------------------------------------------------------------

/** The party stash: dnd5e's primary party, or a group actor made for it (GM only). */
export async function ensureStash(): Promise<any> {
  let party = stashActor();
  if (party) return party;
  party = game.actors.find((a: any) => a.type === "group" && a.getFlag(MODULE_ID, "stash"));
  if (!party) {
    const members = partyActors();
    const ownership: Record<string, number> = { default: 0 };
    for (const u of game.users) if (!u.isGM && members.some((m: any) => m.testUserPermission(u, "OWNER"))) ownership[u.id] = 3;
    party = await Actor.create({
      name: "The Party", type: "group", img: "icons/environment/people/group.webp", ownership,
      system: { type: { value: "party" }, members: members.map((m: any) => ({ actor: m.id })) },
      flags: { [MODULE_ID]: { stash: true } },
    });
  }
  try {
    await game.settings.set("dnd5e", "primaryParty", { actor: party.id });
  } catch {}
  return party;
}

export function stashActor(): any {
  try {
    const p = game.settings.get("dnd5e", "primaryParty")?.actor;
    if (p) return typeof p === "string" ? game.actors.get(p) : p;
  } catch {}
  return game.actors.find((a: any) => a.type === "group" && a.getFlag(MODULE_ID, "stash")) ?? null;
}

export function openStash() {
  const a = stashActor();
  if (!a) return ui.notifications.info("No party stash yet: it's made the first time someone loots something.");
  if (!a.testUserPermission(game.user, "OBSERVER")) return ui.notifications.warn("You can't see the party stash (ask the GM to give you access).");
  a.sheet.render(true);
}

// --- Making piles ----------------------------------------------------------------------------------

/** Top-down art for a pile: an FA chest or sack when the art is installed, else a core icon. */
async function pileImage(pile: Pile): Promise<string> {
  const chest = !!pile.container;
  const m = await faManifest();
  const fams = m ? Object.values(m.props[chest ? "chest" : "sack"] ?? {}) : [];
  const all = fams.flat();
  if (all.length) {
    let h = 0;
    for (const ch of pile.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return faUrl(all[h % all.length]![0]);
  }
  return chest ? "icons/containers/chest/chest-oak-steel-brown.webp" : "icons/containers/bags/sack-leather-brown.webp";
}

const ENTER = `await game.modules.get("${MODULE_ID}")?.api?.pileEnter?.(region, event);`;

export interface PlaceOptions {
  /** Top-left square and size in squares. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Draw a chest or sack tile (bodies don't: the token is the body). */
  tile?: boolean;
  /** GM-only line about where it's hidden. */
  note?: string;
  /** The token it's the body of. */
  bodyOf?: string;
}

/** Put a pile on a scene (GM). */
export async function createPile(scene: any, pile: Pile, o: PlaceOptions) {
  const gs = scene.grid.size;
  const w = o.w ?? 1;
  const h = o.h ?? 1;
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: `${pile.hidden ? "Hidden " : ""}${pile.name}`,
    color: "#d4a017",
    shapes: [{ type: "rectangle", x: (o.x - 1) * gs, y: (o.y - 1) * gs, width: (w + 2) * gs, height: (h + 2) * gs, rotation: 0, hole: false }],
    visibility: CONST.REGION_VISIBILITY.GAMEMASTER,
    behaviors: [{ type: "executeScript", name: "Walk up to it", system: { events: ["tokenMoveIn"], source: ENTER } }],
    flags: { [MODULE_ID]: { pile: JSON.stringify(pile), note: o.note ?? "", bodyOf: o.bodyOf ?? null } },
  }]);
  if (o.tile) {
    const [tile] = await scene.createEmbeddedDocuments("Tile", [{
      texture: { src: await pileImage(pile) }, x: o.x * gs, y: o.y * gs, width: w * gs, height: h * gs, hidden: pile.hidden,
      flags: { [MODULE_ID]: { pileRegion: region.id } },
    }]);
    await region.update({ [`flags.${MODULE_ID}.tileId`]: tile.id });
  }
  return region;
}

/** A pile from rolled treasure at a spot (GM). */
export async function placeLoot(scene: any, loot: LootResult, at: { x: number; y: number }, o: { kind?: PileKind; hidden?: boolean; searchDc?: number; name?: string; note?: string } = {}) {
  const pile = makePile(loot, { id: foundry.utils.randomID(), kind: o.kind ?? "treasure", hidden: o.hidden, searchDc: o.searchDc, name: o.name });
  return createPile(scene, pile, { x: at.x, y: at.y, tile: true, note: o.note });
}

/** A fallen creature can be searched: its pocket money and parts worth harvesting (GM). */
export async function createBodyPile(token: any) {
  const scene = token.parent;
  const actor = token.actor;
  if (!scene || !actor || pileRegions(scene).some((r) => r.flags[MODULE_ID].bodyOf === token.id)) return;
  const cr = Number(actor.system?.details?.cr ?? token.getFlag(MODULE_ID, "cr") ?? 0);
  const type = String(token.getFlag(MODULE_ID, "type") ?? actor.system?.details?.type?.value ?? "humanoid");
  const loot = generateLoot({ cr, mode: "individual", creatures: [{ name: actor.name, type, cr }], seed: `${token.id}:body` });
  if (!loot.items.length && !Object.values(loot.coins).some((n) => n > 0)) return;
  const pile = makePile({ ...loot, container: undefined }, { id: foundry.utils.randomID(), kind: "body", name: `${token.name}'s body` });
  const gs = scene.grid.size;
  await createPile(scene, pile, { x: Math.round(token.x / gs), y: Math.round(token.y / gs), w: Math.max(1, Math.round(token.width)), h: Math.max(1, Math.round(token.height)), bodyOf: token.id });
}

// --- Walking up and searching (player side) -------------------------------------------------------

const inFight = (scene: any) => !!game.combats?.find((c: any) => c.started && c.scene?.id === scene?.id);

async function openWindow(regionUuid: string, tokenId: string) {
  const { LootWindow } = await import("./loot-window.ts");
  LootWindow.open(regionUuid, tokenId);
}

/** Region script (every client; only the mover's acts): spot it if hidden, then open the window. */
export async function pileEnter(region: any, event: any) {
  if (event.name !== "tokenMoveIn" || !event.user?.isSelf || event.user.isGM) return;
  const token = event.data?.token;
  const pile = getPile(region);
  if (!token || token.hidden || !pile || !token.actor) return;
  if (pile.hidden) {
    const passive = Number(token.actor.system?.skills?.prc?.passive ?? 0);
    if (!searchFinds(pile, passive)) return;
    game.socket.emit(SOCKET, { kind: "pileFound", regionUuid: region.uuid, tokenName: token.name, how: `passive Perception ${passive}` });
  }
  if (inFight(region.parent) || !game.settings.get(MODULE_ID, "pilesAutoOpen")) {
    if (!pile.hidden) return;
    return ui.notifications.info(`${token.name} spots something worth a look. (Search / loot to open it.)`);
  }
  openWindow(region.uuid, token.id);
}

/** Is the token's centre inside the region's (rectangular) zone? */
const inShape = (r: any, token: any) => {
  const gs = token.parent.grid.size;
  const c = { x: token.x + (token.width * gs) / 2, y: token.y + (token.height * gs) / 2 };
  const s = r.shapes[0];
  return !!s && c.x >= s.x && c.x <= s.x + s.width && c.y >= s.y && c.y <= s.y + s.height;
};

/** The pile whose zone (the square ring around it) the token stands in. */
const regionAround = (scene: any, token: any) => pileRegions(scene).find((r: any) => inShape(r, token));

/** Search / loot: open the pile you're standing by, or search the area (Perception or Investigation). */
export async function searchHere(token: any = canvas.tokens?.controlled?.[0]) {
  const doc = token?.document ?? token;
  if (!doc?.actor) return ui.notifications.warn("Select your token first.");
  const near = regionAround(doc.parent, doc);
  const pile = near && getPile(near);
  if (near && pile && !pile.hidden) return openWindow(near.uuid, doc.id);
  // In a town doorway: go back inside.
  const door = [...doc.parent.regions].find((r: any) => r.flags?.[MODULE_ID]?.townPlace !== undefined && inShape(r, doc));
  if (door) {
    const { openPlace } = await import("./town-places.ts");
    return openPlace(doc.parent.id, door.flags[MODULE_ID].townPlace, doc.id);
  }
  const DialogV2 = foundry.applications.api.DialogV2;
  const skill: string | null = await DialogV2.wait({
    window: { title: `${doc.name} searches`, icon: "fa-solid fa-magnifying-glass" },
    content: `<p>Search the area around ${esc(doc.name)} (about 10 feet) for anything hidden: treasure, traps, secret doors.</p>`,
    buttons: [
      { action: "prc", label: "Look around (Perception)", default: true },
      { action: "inv", label: "Search carefully (Investigation)" },
    ],
    rejectClose: false,
  });
  if (!skill) return;
  const roll = await doc.actor.rollSkill?.(skill, { flavor: `${doc.name} searches the area` });
  const total = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
  if (typeof total !== "number") return;
  game.socket.emit(SOCKET, { kind: "pileSearch", sceneId: doc.parent.id, tokenId: doc.id, total, skill, userId: game.user.id });
}

/** Ask the GM to do something with a pile. */
export function pileRequest(msg: { op: "container" | "take" | "harvest"; regionUuid: string; actorName: string; attempt?: ContainerAttempt; total?: number; picks?: number[]; names?: string[]; coins?: boolean }) {
  game.socket.emit(SOCKET, { kind: "pileOp", ...msg });
  if (isActingGm()) queue(() => resolveOp({ kind: "pileOp", ...msg }));
}

// --- The GM side -------------------------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve();
/** One pile change at a time, so two players grabbing at once can't both get the potion. */
const queue = (fn: () => Promise<unknown>) => (chain = chain.then(fn).catch((err) => console.error(`${MODULE_ID} | loot pile`, err)));

const say = (content: string, whisper?: string[]) => ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content, ...(whisper ? { whisper } : {}) });

async function reveal(region: any, who: string, how: string) {
  const pile = getPile(region);
  if (!pile?.hidden) return false;
  pile.hidden = false;
  await setPile(region, pile);
  await region.update({ name: pile.name });
  const tile = region.flags[MODULE_ID].tileId && region.parent.tiles.get(region.flags[MODULE_ID].tileId);
  if (tile) await tile.update({ hidden: false });
  const note = region.flags[MODULE_ID].note;
  await say(`<p><i class="fa-solid fa-eye"></i> <strong>${esc(who)}</strong> spots something: ${esc(pile.name.toLowerCase())}${note ? ` (${esc(note)})` : ""}.</p>`);
  await say(`<p>${esc(who)} found ${esc(pile.name)} (${esc(how)} vs DC ${pile.searchDc ?? 10}).</p>`, gmIds());
  return true;
}

async function resolveSearch(msg: { sceneId: string; tokenId: string; total: number; skill: string; userId: string }) {
  const scene = game.scenes.get(msg.sceneId);
  const token = scene?.tokens.get(msg.tokenId);
  if (!token) return;
  const gs = scene.grid.size;
  const c = { x: token.x + (token.width * gs) / 2, y: token.y + (token.height * gs) / 2 };
  const near = (r: any) => {
    const b = r.object?.bounds ?? (() => {
      const s = r.shapes[0];
      return s ? { x: s.x, y: s.y, width: s.width, height: s.height } : null;
    })();
    if (!b) return false;
    // Within two squares of the zone's centre, i.e. ten feet of the thing itself.
    return Math.hypot(b.x + b.width / 2 - c.x, b.y + b.height / 2 - c.y) <= gs * 2.6;
  };
  let found = 0;
  const label = `${msg.skill === "inv" ? "Investigation" : "Perception"} ${msg.total}`;
  for (const r of pileRegions(scene).filter(near)) {
    const pile = getPile(r);
    if (pile && searchFinds(pile, msg.total) && (await reveal(r, token.name, label))) {
      found++;
      game.socket.emit(SOCKET, { kind: "pileOpen", userId: msg.userId, regionUuid: r.uuid, tokenId: token.id });
    }
  }
  // Traps nearby whose warning ring is still armed.
  for (const r of [...scene.regions].filter((x: any) => x.getFlag(MODULE_ID, "role") === "notice" && near(x) && x.behaviors.some((b: any) => !b.disabled))) {
    const trap: Trap | undefined = r.getFlag(MODULE_ID, "trap");
    if (trap && msg.total >= trap.detect.dc) {
      found++;
      await resolveNotice({ regionUuid: r.uuid, tokenName: token.name, passive: msg.total, how: label });
    }
  }
  // Secret doors nearby.
  for (const r of [...scene.regions].filter((x: any) => x.getFlag(MODULE_ID, "secretDoor") && near(x))) {
    if (await resolveSecret({ regionUuid: r.uuid, tokenName: token.name, total: msg.total, how: label })) found++;
  }
  if (!found) await say(`<p><i class="fa-solid fa-magnifying-glass"></i> ${esc(token.name)} searches the area and finds nothing.</p>`);
}

/** The container's trap went off: "Click!" for everyone, the rolls for the GM. */
async function trapSprung(region: any, pile: Pile, actorName: string) {
  const trap = pile.container?.trap;
  if (!trap) return;
  const rolls = trapRolls(trap.text);
  const tile = region.flags[MODULE_ID].tileId && region.parent.tiles.get(region.flags[MODULE_ID].tileId);
  if (tile && canvas.scene?.id === region.parent.id) canvas.interface?.createScrollingText?.({ x: tile.x + tile.width / 2, y: tile.y }, "Click!", { fontSize: 40, fill: "#ff5544", stroke: 0, strokeThickness: 5, duration: 2500 });
  await ChatMessage.create({
    speaker: { alias: "DnD Toolkit" }, whisper: gmIds(),
    content: `<div class="dt-trap-card"><h3><i class="fa-solid fa-triangle-exclamation"></i> ${esc(trap.name)}</h3>
      <p><strong>${esc(actorName)}</strong> set off the ${esc(pile.container!.name)}'s trap.</p><p>${esc(trap.text)}</p>
      <div class="dt-trap-buttons">
        ${rolls.save ? `<button type="button" data-dt-pile-trap="save">${esc(actorName)}: ${rolls.save.ability.toUpperCase()} save DC ${rolls.save.dc}</button>` : ""}
        ${rolls.attack !== undefined ? `<button type="button" data-dt-pile-trap="attack">Attack +${rolls.attack}</button>` : ""}
        ${rolls.damage ? `<button type="button" data-dt-pile-trap="damage">Damage ${esc(rolls.damage.formula)} ${esc(rolls.damage.type)}</button>` : ""}
      </div></div>`,
    flags: { [MODULE_ID]: { pileTrap: { ...rolls, actorName, name: trap.name } } },
  });
}

async function mimic(region: any, pile: Pile) {
  await ChatMessage.create({
    speaker: { alias: "DnD Toolkit" }, whisper: gmIds(),
    content: `<p><i class="fa-solid fa-teeth"></i> <strong>The ${esc(pile.container?.name ?? "chest")} is a mimic.</strong> It's adhesive: whoever touched it is stuck (grappled, escape DC 13).</p>
      <button type="button" data-dt-mimic="${region.uuid}"><i class="fa-solid fa-chess-pawn"></i> Replace it with a Mimic and roll initiative</button>`,
  });
}

/** Swap the chest for a Mimic token and start the fight (GM button). */
async function placeMimic(regionUuid: string) {
  const region = await fromUuid(regionUuid);
  if (!region) return;
  const scene = region.parent;
  const tile = region.flags[MODULE_ID].tileId && scene.tiles.get(region.flags[MODULE_ID].tileId);
  const s = region.shapes[0];
  const at = tile ? { x: tile.x, y: tile.y } : { x: s.x + scene.grid.size, y: s.y + scene.grid.size };
  const actor = await ensureWorldActor({ name: "Mimic" } as any);
  const data = (await actor.getTokenDocument({ x: at.x, y: at.y, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })).toObject();
  const [token] = await scene.createEmbeddedDocuments("Token", [data]);
  if (tile) await tile.delete();
  await region.delete();
  const combat = game.combats.find((c: any) => c.scene?.id === scene.id) ?? (await Combat.create({ scene: scene.id, active: true }));
  const [c] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: token.actorId }]);
  await combat.rollInitiative([c.id]);
}

async function resolveOp(msg: any) {
  if (msg.kind === "pileFound") {
    const region = await fromUuid(msg.regionUuid);
    if (region) await reveal(region, msg.tokenName, msg.how);
    return;
  }
  if (msg.kind === "pileSearch") return resolveSearch(msg);
  if (msg.kind !== "pileOp") return;
  const region = await fromUuid(msg.regionUuid);
  let pile = region && getPile(region);
  if (!pile) return;
  const who = esc(msg.actorName);
  if (msg.op === "container") {
    const r = tryContainer(pile, msg.attempt, msg.total ?? 0);
    pile = r.pile;
    await setPile(region, pile);
    await say(`<p><i class="fa-solid fa-box-open"></i> ${/^[a-z]/.test(r.text) ? `<strong>${who}</strong> ${esc(r.text)}` : esc(r.text)}</p>`);
    if (r.noisy) await say(`<p>The noise carries: anything nearby hears it.</p>`, gmIds());
    if (r.sprung) await trapSprung(region, pile, msg.actorName);
    if (r.outcome === "mimic" || r.outcome === "mimicFound") await mimic(region, pile);
  } else if (msg.op === "take") {
    // Only what's still there, by name, so a stale window can't take twice.
    const picks = (msg.picks as number[]).filter((i, k) => pile!.loot.items[i]?.name === msg.names?.[k]);
    const { taken, pile: after } = takeFromPile(pile, picks, !!msg.coins);
    if (!taken.items.length && !Object.values(taken.coins).some((n) => n > 0)) return;
    const stash = await ensureStash();
    await giveLootToActor(taken, stash, { quiet: true, stack: true });
    pile = after;
    await setPile(region, pile);
    await say(`<p><i class="fa-solid fa-sack-dollar"></i> <strong>${who}</strong> loots ${esc(pile.name.toLowerCase())}: ${esc(lootLine(taken))}. <em>Into the party stash.</em></p>`);
    await logSession({ kind: "loot", text: `${msg.actorName} looted ${pile.name.toLowerCase()}: ${lootLine(taken)}`, gp: lootValue(taken) });
  } else if (msg.op === "harvest") {
    const i = (msg.picks as number[])[0]!;
    if (pile.loot.items[i]?.name !== msg.names?.[0]) return;
    const r = harvest(pile, i, msg.total ?? 0);
    pile = r.pile;
    if (r.item) await giveLootToActor({ coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, items: [r.item] }, await ensureStash(), { quiet: true, stack: true });
    await setPile(region, pile);
    if (r.item) await logSession({ kind: "loot", text: `${msg.actorName} harvested ${r.item.name.toLowerCase()}`, gp: lootValue({ coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, items: [r.item] }) });
    await say(`<p><i class="fa-solid fa-hand-scissors"></i> <strong>${who}</strong> ${r.ok ? `harvests ${esc(r.item!.quantity > 1 ? `${r.item!.quantity}× ` : "")}${esc(r.item!.name)} (${msg.total}). <em>Into the party stash.</em>` : `ruins the ${esc(msg.names[0].toLowerCase())} (${msg.total}).`}</p>`);
  }
  // Emptied: the pile goes (a body stays where it fell).
  if (pile.open && pileEmpty(pile)) {
    const tile = region.flags[MODULE_ID].tileId && region.parent.tiles.get(region.flags[MODULE_ID].tileId);
    if (tile) await tile.delete();
    await region.delete();
  }
}

// --- Wiring -----------------------------------------------------------------------------------------

export function initPiles() {
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "pileOpen" && msg.userId === game.user.id) return void openWindow(msg.regionUuid, msg.tokenId);
    if (!isActingGm()) return;
    if (msg?.kind === "pileOp" || msg?.kind === "pileFound" || msg?.kind === "pileSearch") queue(() => resolveOp(msg));
  });
  // The window follows its pile.
  const refresh = async (region: any) => {
    if (!region.flags?.[MODULE_ID]?.pile) return;
    const { LootWindow } = await import("./loot-window.ts");
    LootWindow.refresh(region.uuid);
  };
  Hooks.on("updateRegion", refresh);
  Hooks.on("deleteRegion", refresh);
  // A body's pile goes with its token.
  Hooks.on("deleteToken", (token: any) => {
    if (!isActingGm()) return;
    for (const r of pileRegions(token.parent).filter((r: any) => r.flags[MODULE_ID].bodyOf === token.id)) r.delete();
  });
  Hooks.on("renderChatMessage", (message: any, html: any) => {
    if (!game.user.isGM) return;
    const root: HTMLElement = html[0] ?? html;
    const t = message.getFlag?.(MODULE_ID, "pileTrap");
    for (const b of root.querySelectorAll("button[data-dt-pile-trap]") as NodeListOf<HTMLButtonElement>) {
      b.addEventListener("click", async () => {
        const Roll = foundry.dice?.Roll ?? (globalThis as any).Roll;
        const what = b.dataset.dtPileTrap;
        if (what === "save" && t.save) {
          const actor = game.actors.getName(t.actorName) ?? canvas.tokens.placeables.find((x: any) => x.name === t.actorName)?.actor;
          if (actor) await sendRollRequest({ id: foundry.utils.randomID(), prompt: `${t.name}!`, type: "save", key: t.save.ability, dc: t.save.dc, showDc: true, advantage: "normal", rollMode: "publicroll", actorIds: [actor.id] });
        } else if (what === "attack") await new Roll(`1d20 + ${t.attack}`).toMessage({ flavor: `${t.name} attacks ${t.actorName}` });
        else if (what === "damage" && t.damage) await new Roll(t.damage.formula).toMessage({ flavor: `${t.name}: ${t.damage.type} damage` });
      });
    }
    for (const b of root.querySelectorAll("button[data-dt-mimic]") as NodeListOf<HTMLButtonElement>) {
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await placeMimic(b.dataset.dtMimic!);
        } catch (err) {
          ui.notifications.error(`DnD Toolkit: ${(err as Error).message}`);
          b.disabled = false;
        }
      });
    }
  });
}

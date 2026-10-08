import { ABILITY_NAMES, trapText, type DoorLock, type Trap } from "@dnd-toolkit/core";
import { partyActors, sendRollRequest } from "./rolls.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Things on the map players interact with: locked doors they can try to pick, force or unlock, and
// traps that stop a token, pause the game and hand the GM a card with the rolls ready.

const SOCKET = `module.${MODULE_ID}`;
const gmIds = () => game.users.filter((u: any) => u.isGM).map((u: any) => u.id);

// --- Doors --------------------------------------------------------------------------------

/** Wall fields for a door with a lock: Foundry's own LOCKED state, plus our lock for the player prompt. */
export function lockedDoorData(lock: DoorLock) {
  return { ds: CONST.WALL_DOOR_STATES.LOCKED, flags: { [MODULE_ID]: { lock } } };
}

export type DoorAttempt = "pick" | "force" | "key" | "password";

/** What a character can try on a door. */
export function doorChoices(lock: DoorLock): DoorAttempt[] {
  if (lock.kind === "locked") return lock.key ? ["key", "pick", "force"] : ["pick", "force"];
  if (lock.kind === "arcane") return lock.key ? ["password", "pick", "force"] : ["pick", "force"];
  return ["force"];
}

/** Does someone carrying these items have the key? ("the iron key" matches an item called "Iron key".) */
export function hasKey(lock: DoorLock, itemNames: readonly string[]): boolean {
  const want = (lock.key ?? "").replace(/^the\s+/i, "").trim().toLowerCase();
  return !!want && itemNames.some((n) => n.trim().toLowerCase() === want);
}

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const passwordMatches = (lock: DoorLock, said: string) => !!lock.key && plain(said) === plain(lock.key);

const DOOR_FEEL: Record<DoorLock["kind"], [title: string, text: string]> = {
  locked: ["The door is locked", "The handle turns, but the door doesn't."],
  stuck: ["The door is stuck", "It's stuck fast in its frame; it might give with some force."],
  barred: ["The door won't budge", "Something heavy holds it shut from the other side."],
  arcane: ["The door is sealed", "It's locked, and the keyhole glows faintly with magic."],
  sealed: ["The door won't open", "There's no handle and no keyhole. Something else in here must open it."],
};

/** Player side: the prompt when they click a locked door, and the roll. */
async function tryDoor(wall: any, lock: DoorLock) {
  const actor = canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!actor) {
    ui.notifications.warn("Select your token, then try the door again.");
    return;
  }
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return;
  const items: any[] = [...(actor.items ?? [])];
  const tools = items.find((i) => i.type === "tool" && /thieves/i.test(i.name));
  const choices = doorChoices(lock).filter((c) => c !== "key" || hasKey(lock, items.map((i) => i.name)));
  const labels: Record<DoorAttempt, string> = {
    key: "Use the key",
    password: "Speak the password",
    pick: tools ? "Pick the lock" : "Pick the lock (needs thieves' tools)",
    force: lock.kind === "barred" ? "Break it down" : "Force it",
  };
  const [title, feel] = DOOR_FEEL[lock.kind];
  const choice: string | null = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-door-closed" },
    content: `<div class="dt-door-prompt"><p><strong>${esc(actor.name)}</strong>: ${esc(feel)}</p>
      ${choices.includes("password") ? `<input type="text" name="password" placeholder="Say a word or phrase…" autocomplete="off">` : ""}</div>`,
    buttons: [
      ...choices.map((c) => ({
        action: c,
        label: labels[c],
        disabled: c === "pick" && !tools,
        callback: (_e: Event, button: any) => (c === "password" ? `password:${button.form?.elements?.password?.value ?? ""}` : c),
      })),
      { action: "leave", label: "Leave it" },
    ],
    rejectClose: false,
  });
  if (!choice || choice === "leave") return;

  let ok = false;
  let detail: string;
  let how: "unlock" | "open" = "unlock";
  if (choice === "key") {
    ok = true;
    detail = `unlocks it with ${lock.key}`;
  } else if (choice.startsWith("password:")) {
    const said = choice.slice("password:".length);
    ok = passwordMatches(lock, said);
    detail = `speaks "${said}" to the door`;
  } else {
    const dc = choice === "pick" ? lock.pickDc ?? 15 : lock.forceDc;
    const roll = choice === "pick"
      ? await tools?.rollToolCheck?.({ flavor: `${actor.name} picks the lock` })
      : await actor.rollSkill?.("ath", { flavor: `${actor.name} ${lock.kind === "barred" ? "tries to break the door down" : "tries to force the door"}` });
    const total = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
    if (typeof total !== "number") return;
    ok = total >= dc;
    how = choice === "pick" ? "unlock" : "open";
    detail = `${choice === "pick" ? "picks the lock" : "forces the door"}: ${total} vs DC ${dc}`;
    if (!ok && choice === "force" && dc - total >= 5) detail += ". The noise carries";
  }
  if (!ok && choice.startsWith("password")) ui.notifications.info("Nothing happens.");
  game.socket.emit(SOCKET, { kind: "doorAttempt", wallUuid: wall.uuid, actorName: actor.name, ok, how, detail });
}

/** GM side: open or unlock the door, and say what happened. */
async function resolveDoor(msg: { wallUuid: string; actorName: string; ok: boolean; how: "unlock" | "open"; detail: string }) {
  const wall = await fromUuid(msg.wallUuid);
  if (!wall) return;
  if (msg.ok) await wall.update({ ds: msg.how === "open" ? CONST.WALL_DOOR_STATES.OPEN : CONST.WALL_DOOR_STATES.CLOSED });
  ChatMessage.create({
    speaker: { alias: "DnD Toolkit" },
    whisper: gmIds(),
    content: `<p><i class="fa-solid fa-${msg.ok ? "lock-open" : "lock"}"></i> <strong>${esc(msg.actorName)}</strong> ${esc(msg.detail)}. ${msg.ok ? (msg.how === "open" ? "The door bursts open." : "It's unlocked.") : "It holds."}</p>`,
  });
}

/** Clicking a locked toolkit door (as a player) asks what they want to do about it. */
function patchDoors() {
  const DoorControl = foundry.canvas?.containers?.DoorControl ?? (globalThis as any).DoorControl;
  const proto = DoorControl?.prototype;
  if (!proto?._onMouseDown || proto._dtPatched) return;
  const original = proto._onMouseDown;
  proto._onMouseDown = function (this: any, event: any) {
    const result = original.call(this, event);
    const doc = this.wall?.document;
    const lock: DoorLock | undefined = doc?.getFlag?.(MODULE_ID, "lock");
    if (event?.button === 0 && lock && !game.user.isGM && !game.paused && doc.ds === CONST.WALL_DOOR_STATES.LOCKED) tryDoor(doc, lock);
    return result;
  };
  proto._dtPatched = true;
}

// --- Traps --------------------------------------------------------------------------------

const SPRING = `if (event.user.isGM || !game.users.activeGM?.isSelf || event.data.token?.hidden) return;
await game.modules.get("${MODULE_ID}")?.api?.springTrap?.(region, event);`;
const NOTICE = `await game.modules.get("${MODULE_ID}")?.api?.noticeTrap?.(region, event);`;

/**
 * Two Regions per trap: the trigger squares (stop the token, pause, spring it) and a one-square
 * ring around them where a sharp-eyed character (passive score vs the trap's DC) spots it first.
 */
export function trapRegionData(trap: Trap, cells: readonly [number, number][], gs: number, key: string) {
  const rect = (x: number, y: number, w: number, h: number) => ({ type: "rectangle", x: x * gs, y: y * gs, width: w * gs, height: h * gs, rotation: 0, hole: false });
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const [x1, y1] = [Math.max(...xs) + 1, Math.max(...ys) + 1];
  const flags = (role: string) => ({ [MODULE_ID]: { trap, role, trapKey: key } });
  return [
    {
      name: `Trap: ${trap.name}`,
      color: "#c0392b",
      shapes: cells.map(([x, y]) => rect(x, y, 1, 1)),
      visibility: CONST.REGION_VISIBILITY.GAMEMASTER,
      behaviors: [
        { type: "pauseGame", name: "Stop and pause", system: { once: false } },
        { type: "executeScript", name: "Spring the trap", system: { events: ["tokenMoveIn"], source: SPRING } },
      ],
      flags: flags("trap"),
    },
    {
      name: `Trap warning: ${trap.name}`,
      color: "#e67e22",
      shapes: [rect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2)],
      visibility: CONST.REGION_VISIBILITY.LAYER,
      behaviors: [{ type: "executeScript", name: "Notice it", system: { events: ["tokenPreMove"], source: NOTICE } }],
      flags: flags("notice"),
    },
  ];
}

/** The trap's regions in its scene (trigger and warning ring). */
function trapRegions(region: any): any[] {
  const key = region.getFlag(MODULE_ID, "trapKey");
  return [...(region.parent?.regions ?? [])].filter((r: any) => r.getFlag(MODULE_ID, "trapKey") === key);
}

/** Arm or disarm a trap. A disarmed (sprung or found) trap shows on the map for everyone. */
export async function setTrapArmed(region: any, armed: boolean) {
  for (const r of trapRegions(region)) {
    await r.updateEmbeddedDocuments("RegionBehavior", [...r.behaviors].map((b: any) => ({ _id: b.id, disabled: !armed })));
    if (r.getFlag(MODULE_ID, "role") === "trap") await r.update({ visibility: armed ? CONST.REGION_VISIBILITY.GAMEMASTER : CONST.REGION_VISIBILITY.ALWAYS });
  }
}

function floatText(sceneId: string, tokenId: string, text: string) {
  if (canvas.scene?.id !== sceneId) return;
  const token = canvas.tokens?.get(tokenId);
  if (!token) return;
  canvas.interface?.createScrollingText?.(token.center, text, {
    anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 40, fill: "#ff5544", stroke: 0x000000, strokeThickness: 5, duration: 2500, jitter: 0.2,
  });
}

/** The GM's card for a sprung trap. */
export function trapCardHtml(trap: Trap, who: string): string {
  const save = trap.save ? `${ABILITY_NAMES[trap.save.ability]} save DC ${trap.save.dc}` : "";
  return `<div class="dt-trap-card">
    <h3><i class="fa-solid fa-triangle-exclamation"></i> ${esc(trap.name)}</h3>
    <p><strong>${esc(who)}</strong> set it off (${esc(trap.trigger)}).</p>
    <p>${esc(trapText(trap))}</p>
    <div class="dt-trap-buttons">
      ${trap.save ? `<button type="button" data-dt-trap="save"><i class="fa-solid fa-dice-d20"></i> ${esc(who)}: ${esc(save)}</button>
      <button type="button" data-dt-trap="party"><i class="fa-solid fa-users"></i> Everyone: ${esc(save)}</button>` : ""}
      ${trap.attackBonus !== undefined ? `<button type="button" data-dt-trap="attack"><i class="fa-solid fa-crosshairs"></i> Attack +${trap.attackBonus}</button>` : ""}
      ${trap.damage ? `<button type="button" data-dt-trap="damage"><i class="fa-solid fa-burst"></i> Damage ${esc(trap.damage.formula)} ${esc(trap.damage.type)}</button>` : ""}
      <button type="button" data-dt-trap="resume"><i class="fa-solid fa-play"></i> Resume the game</button>
      <button type="button" data-dt-trap="rearm"><i class="fa-solid fa-rotate"></i> Re-arm</button>
    </div>
  </div>`;
}

/** Region script (active GM): the token stepped on it. Disarm it, say "Click!", give the GM the card. */
export async function springTrap(region: any, event: any) {
  const trap: Trap | undefined = region.getFlag(MODULE_ID, "trap");
  const token = event.data?.token;
  if (!trap || !token) return;
  await setTrapArmed(region, false);
  const text = { kind: "floatText", sceneId: region.parent.id, tokenId: token.id, text: "Click!" };
  game.socket.emit(SOCKET, text);
  floatText(text.sceneId, text.tokenId, text.text);
  await ChatMessage.create({ speaker: { alias: token.name }, content: `<p><em>Click.</em> Something gives way under ${esc(token.name)}'s foot.</p>` });
  await ChatMessage.create({
    speaker: { alias: "DnD Toolkit" },
    whisper: gmIds(),
    content: trapCardHtml(trap, token.name),
    flags: { [MODULE_ID]: { trapCard: { trap, regionUuid: region.uuid, tokenName: token.name, actorId: token.actor?.id ?? null } } },
  });
}

/** Region script (the mover's own client): a character whose passive score beats the DC stops and spots it. */
export async function noticeTrap(region: any, event: any) {
  if (event.name !== "tokenPreMove" || event.user?.isGM || !event.user?.isSelf) return;
  const trap: Trap | undefined = region.getFlag(MODULE_ID, "trap");
  const token = event.data?.token;
  const passive = token?.actor?.system?.skills?.[trap?.detect.skill ?? "prc"]?.passive;
  if (!trap || typeof passive !== "number" || passive < trap.detect.dc) return;
  const ENTER = (globalThis as any).Region?.MOVEMENT_SEGMENT_TYPES?.ENTER;
  const enter = event.data.segments?.find((s: any) => s.type === ENTER);
  if (enter) event.data.destination = enter.to;
  ui.notifications.info(`${token.name} notices something odd just ahead.`);
  game.socket.emit(SOCKET, { kind: "trapNoticed", regionUuid: region.uuid, tokenName: token.name, passive });
}

/** GM side: a character spotted a trap. Reveal it and stand down the warning ring. */
async function resolveNotice(msg: { regionUuid: string; tokenName: string; passive: number }) {
  if (!game.users.activeGM?.isSelf) return;
  const region = await fromUuid(msg.regionUuid);
  const trap: Trap | undefined = region?.getFlag(MODULE_ID, "trap");
  if (!region || !trap) return;
  await setTrapArmed(region, false);
  // It's been found, not sprung: the trigger squares stay live until it's disarmed or avoided.
  const trigger = trapRegions(region).find((r: any) => r.getFlag(MODULE_ID, "role") === "trap");
  if (trigger) await trigger.updateEmbeddedDocuments("RegionBehavior", [...trigger.behaviors].map((b: any) => ({ _id: b.id, disabled: false })));
  ChatMessage.create({
    speaker: { alias: "DnD Toolkit" },
    content: `<p><i class="fa-solid fa-eye"></i> <strong>${esc(msg.tokenName)}</strong> spots something: ${esc(trap.trigger)}. It's a trap.</p>`,
  });
  ChatMessage.create({
    speaker: { alias: "DnD Toolkit" },
    whisper: gmIds(),
    content: `<p>${esc(msg.tokenName)} found the ${esc(trap.name)} (passive ${msg.passive} vs DC ${trap.detect.dc}). Disarm: DC ${trap.disarm.dc}, ${esc(trap.disarm.method)}.</p>`,
  });
}

// --- Wiring ---------------------------------------------------------------------------------

export function initInteractive() {
  patchDoors();
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "floatText") floatText(msg.sceneId, msg.tokenId, msg.text);
    // Only one GM acts on the rest, so nothing happens twice.
    if (!game.users.activeGM?.isSelf) return;
    if (msg?.kind === "doorAttempt") resolveDoor(msg);
    else if (msg?.kind === "trapNoticed") resolveNotice(msg);
  });
  Hooks.on("renderChatMessage", (message: any, html: any) => {
    const card = message.getFlag?.(MODULE_ID, "trapCard");
    if (!card) return;
    const root: HTMLElement = html[0] ?? html;
    for (const button of root.querySelectorAll("button[data-dt-trap]") as NodeListOf<HTMLButtonElement>) {
      if (!game.user.isGM) {
        button.remove();
        continue;
      }
      button.addEventListener("click", () => trapButton(button.dataset.dtTrap!, card));
    }
  });
}

async function trapButton(action: string, card: { trap: Trap; regionUuid: string; tokenName: string; actorId: string | null }) {
  const { trap } = card;
  const ask = (actorIds: string[]) => sendRollRequest({
    id: foundry.utils.randomID(), prompt: `${trap.name}!`, type: "save", key: trap.save!.ability, dc: trap.save!.dc,
    showDc: true, advantage: "normal", rollMode: "publicroll", actorIds,
  });
  if (action === "save" && trap.save && card.actorId) await ask([card.actorId]);
  else if (action === "party" && trap.save) await ask(partyActors().map((a: any) => a.id));
  else if (action === "attack") await new (foundry.dice?.Roll ?? (globalThis as any).Roll)(`1d20 + ${trap.attackBonus ?? 0}`).toMessage({ flavor: `${trap.name} attacks ${card.tokenName}` });
  else if (action === "damage" && trap.damage) await new (foundry.dice?.Roll ?? (globalThis as any).Roll)(trap.damage.formula).toMessage({ flavor: `${trap.name}: ${trap.damage.type} damage` });
  else if (action === "resume") game.togglePause(false, true);
  else if (action === "rearm") {
    const region = await fromUuid(card.regionUuid);
    if (region) await setTrapArmed(region, true);
    ui.notifications.info(`${trap.name} is armed again.`);
  }
}

import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// GM roll requests: the GM asks for a check or save, each player gets a popup (and a chat card as a
// backup) with a Roll button that rolls from their own sheet, and the results come back to the GM.

export type RollType = "skill" | "save" | "check";

export interface RollRequest {
  id: string;
  /** What the players read, e.g. "Something rustles in the trees. Make a Perception check." */
  prompt: string;
  type: RollType;
  /** Skill code ("prc") or ability ("dex"). */
  key: string;
  dc: number | null;
  /** Tell the players the DC (and let dnd5e mark success or failure). */
  showDc: boolean;
  advantage: "normal" | "advantage" | "disadvantage";
  rollMode: "publicroll" | "gmroll" | "blindroll";
  actorIds: string[];
}

export interface RollResult {
  actorId: string;
  actorName: string;
  total: number;
  passed: boolean | null;
}

export interface RequestState {
  request: RollRequest;
  results: Record<string, RollResult>;
  sentAt: number;
}

const SOCKET = `module.${MODULE_ID}`;
export const SKILLS: Record<string, string> = {
  acr: "Acrobatics", ani: "Animal Handling", arc: "Arcana", ath: "Athletics", dec: "Deception", his: "History", ins: "Insight",
  itm: "Intimidation", inv: "Investigation", med: "Medicine", nat: "Nature", prc: "Perception", prf: "Performance",
  per: "Persuasion", rel: "Religion", slt: "Sleight of Hand", ste: "Stealth", sur: "Survival",
};
export const ABILITIES: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export const rollLabel = (r: Pick<RollRequest, "type" | "key">) =>
  r.type === "skill" ? `${SKILLS[r.key] ?? r.key} check` : r.type === "save" ? `${ABILITIES[r.key] ?? r.key} saving throw` : `${ABILITIES[r.key] ?? r.key} check`;

/** GM side: requests sent this session, newest first. */
export const requests: RequestState[] = [];

/** Player characters the GM can ask: characters with a player owner. */
export function partyActors(): any[] {
  return game.actors.filter((a: any) => a.type === "character" && a.hasPlayerOwner);
}

/** Active non-GM users who own this actor. */
const ownersOf = (actor: any) => game.users.filter((u: any) => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));

// --- Rolling -------------------------------------------------------------------

/** Roll for an actor from their own sheet, with the request's DC, advantage and visibility. */
async function rollFor(request: RollRequest, actor: any): Promise<RollResult | null> {
  const options: Record<string, unknown> = {
    fastForward: true,
    advantage: request.advantage === "advantage",
    disadvantage: request.advantage === "disadvantage",
    rollMode: request.rollMode,
    flavor: `${request.prompt ? `${request.prompt} — ` : ""}${rollLabel(request)}${request.dc && request.showDc ? ` (DC ${request.dc})` : ""}`,
    ...(request.dc && request.showDc ? { targetValue: request.dc } : {}),
  };
  const roll = request.type === "skill" ? await actor.rollSkill(request.key, options)
    : request.type === "save" ? await actor.rollAbilitySave(request.key, options)
    : await actor.rollAbilityTest(request.key, options);
  if (!roll) return null;
  return { actorId: actor.id, actorName: actor.name, total: roll.total, passed: request.dc ? roll.total >= request.dc : null };
}

/** Roll and report back to the GM (directly when we are the GM). */
async function rollAndReport(request: RollRequest, actorId: string) {
  const actor = game.actors.get(actorId);
  if (!actor?.isOwner) return;
  const result = await rollFor(request, actor);
  if (!result) return;
  if (game.user.isGM) receiveResult(request.id, result);
  else game.socket.emit(SOCKET, { kind: "rollResult", requestId: request.id, result });
}

// --- GM side -------------------------------------------------------------------

/** Ask the players. Shows a popup on their screens and posts a chat card with Roll buttons. */
export async function sendRollRequest(request: RollRequest) {
  requests.unshift({ request, results: {}, sentAt: Date.now() });
  requests.splice(10);
  game.socket.emit(SOCKET, { kind: "rollRequest", request });

  const actors = request.actorIds.map((id) => game.actors.get(id)).filter(Boolean);
  const whisper = [...new Set([...actors.flatMap((a: any) => ownersOf(a).map((u: any) => u.id)), ...game.users.filter((u: any) => u.isGM).map((u: any) => u.id)])];
  await ChatMessage.create({
    speaker: { alias: "Game Master" },
    whisper,
    content: `<div class="dt-roll-card">
      ${request.prompt ? `<p>${esc(request.prompt)}</p>` : ""}
      <p><strong>${esc(rollLabel(request))}</strong>${request.dc && request.showDc ? ` · DC ${request.dc}` : ""}${request.advantage !== "normal" ? ` · ${request.advantage}` : ""}</p>
      ${actors.map((a: any) => `<button type="button" data-dt-roll="${request.id}" data-actor="${a.id}"><i class="fa-solid fa-dice-d20"></i> Roll for ${esc(a.name)}</button>`).join("")}
    </div>`,
    flags: { [MODULE_ID]: { rollRequest: request } },
  });
  Hooks.callAll(`${MODULE_ID}.rollsChanged`);
}

function receiveResult(requestId: string, result: RollResult) {
  const state = requests.find((r) => r.request.id === requestId);
  if (!state || state.results[result.actorId]) return;
  state.results[result.actorId] = result;
  Hooks.callAll(`${MODULE_ID}.rollsChanged`);
  if (Object.keys(state.results).length === state.request.actorIds.length) postSummary(state);
}

/** Group result: with a DC, at least half must pass. */
export function summarize(state: RequestState): string {
  const rows = state.request.actorIds.map((id) => state.results[id] ?? { actorName: game.actors.get(id)?.name ?? "?", total: NaN, passed: null });
  const parts = rows.map((r) => `${r.actorName} ${Number.isNaN(r.total) ? "…" : r.total}${r.passed === true ? " ✓" : r.passed === false ? " ✗" : ""}`);
  const done = rows.filter((r) => r.passed !== null);
  const passed = done.filter((r) => r.passed).length;
  const group = state.request.dc && done.length === rows.length ? ` — group ${passed * 2 >= rows.length ? "succeeds" : "fails"} (${passed}/${rows.length})` : "";
  return `${parts.join(", ")}${group}`;
}

function postSummary(state: RequestState) {
  const r = state.request;
  ChatMessage.create({
    speaker: { alias: "DnD Toolkit" },
    whisper: game.users.filter((u: any) => u.isGM).map((u: any) => u.id),
    content: `<p><strong>${esc(rollLabel(r))}${r.dc ? ` DC ${r.dc}` : ""}</strong></p><p>${esc(summarize(state))}</p>`,
  });
}

/** GM rolls for a character whose player isn't around. */
export const rollForThem = (state: RequestState, actorId: string) => rollAndReport(state.request, actorId);

/** Passive scores for a skill, for "Stealth vs passive Perception" without asking anyone. */
export function passives(skill: string, actorIds: string[]): { name: string; passive: number }[] {
  return actorIds.map((id) => game.actors.get(id)).filter(Boolean).map((a: any) => ({ name: a.name, passive: a.system?.skills?.[skill]?.passive ?? 10 }));
}

// --- Player side ----------------------------------------------------------------

/** The popup: the prompt, the roll, and a Roll button per character this user plays. */
async function promptPlayer(request: RollRequest) {
  const mine = request.actorIds.map((id) => game.actors.get(id)).filter((a: any) => a?.isOwner);
  if (!mine.length) return;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return; // The chat card still works.
  for (const actor of mine) {
    await DialogV2.wait({
      window: { title: "The GM asks for a roll", icon: "fa-solid fa-dice-d20" },
      content: `<div class="dt-roll-prompt">${request.prompt ? `<p>${esc(request.prompt)}</p>` : ""}
        <p><strong>${esc(actor.name)}</strong>: ${esc(rollLabel(request))}${request.dc && request.showDc ? `, DC ${request.dc}` : ""}${request.advantage !== "normal" ? ` with ${request.advantage}` : ""}</p></div>`,
      buttons: [
        { action: "roll", label: "Roll", icon: "fa-solid fa-dice-d20", default: true, callback: () => rollAndReport(request, actor.id) },
        { action: "later", label: "Later (use the chat card)" },
      ],
      rejectClose: false,
    });
  }
}

/** Wire up the socket and chat-card buttons. Call once, on ready. */
export function initRollRequests() {
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "rollRequest" && !game.user.isGM) promptPlayer(msg.request);
    else if (msg?.kind === "rollResult" && game.user.isGM) receiveResult(msg.requestId, msg.result);
  });
  const rolled = new Set<string>();
  Hooks.on("renderChatMessage", (message: any, html: any) => {
    const request: RollRequest | undefined = message.getFlag?.(MODULE_ID, "rollRequest");
    if (!request) return;
    const root: HTMLElement = html[0] ?? html;
    for (const button of root.querySelectorAll("button[data-dt-roll]") as NodeListOf<HTMLButtonElement>) {
      const actor = game.actors.get(button.dataset.actor);
      // Only the character's owner (or the GM) can press it.
      if (!actor?.isOwner) {
        button.remove();
        continue;
      }
      button.addEventListener("click", async () => {
        const key = `${request.id}:${actor.id}`;
        if (rolled.has(key)) return;
        rolled.add(key);
        button.disabled = true;
        await rollAndReport(request, actor.id);
      });
    }
  });
}

import { chaseRoll, chaseRound, generateSkillChallenge, randomSeed, skillAttempt, startChase, type Chase, type ChaseEnv, type Complexity, type SkillChallenge } from "@dnd-toolkit/core";
import { logSession } from "./rewards.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// One shared tracker for a skill challenge or a chase. Players roll from their own sheets; the
// GM's client keeps score.

const SOCKET = `module.${MODULE_ID}`;
export type Challenge = SkillChallenge | Chase;

export function registerChallengeSettings() {
  game.settings.register(MODULE_ID, "challenge", {
    scope: "world", config: false, type: Object, default: {},
    onChange: async () => (await import("./challenge-window.ts")).ChallengeWindow.sync(),
  });
}

export const getChallenge = (): Challenge | null => {
  const c = game.settings.get(MODULE_ID, "challenge");
  return c && c.id ? structuredClone(c) : null;
};
const save = (c: Challenge | null) => game.settings.set(MODULE_ID, "challenge", c ?? {});

const say = (content: string) => ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content });

export async function beginSkillChallenge(level: number, complexity: Complexity) {
  const c = generateSkillChallenge({ level, complexity, seed: randomSeed() });
  await save(c);
  await say(`<p><i class="fa-solid fa-list-check"></i> <strong>${esc(c.title)}.</strong> ${esc(c.text)} <em>${c.need} successes before ${c.maxFail} failures; nobody uses the same skill twice in a row.</em></p>`);
}

export async function beginChase(o: { mode: "pursue" | "flee"; other: string; env: ChaseEnv; level: number; lead: number; otherBonus?: number }) {
  const c = startChase({ ...o, id: randomSeed() });
  await save(c);
  await say(`<p><i class="fa-solid fa-person-running"></i> <strong>${esc(c.title)}!</strong> ${esc(c.complication.text)}</p>`);
}

/** A player rolls: a skill in a skill challenge, or this round's complication in a chase. */
export function challengeRequest(msg: { who: string; skill: string; total: number }) {
  game.socket.emit(SOCKET, { kind: "challengeTry", ...msg });
  if (game.users.activeGM?.isSelf) resolveTry(msg);
}

async function resolveTry(msg: { who: string; skill: string; total: number }) {
  const c = getChallenge();
  if (!c || c.ended) return;
  if (c.kind === "skill") {
    const r = skillAttempt(c, msg.who, msg.skill, msg.total);
    if (r.challenge === c) return void say(`<p>${esc(r.text)}</p>`);
    await save(r.challenge);
    await say(`<p><i class="fa-solid fa-list-check"></i> ${esc(r.text)}</p>`);
    if (r.challenge.ended) await logSession({ kind: "note", text: `${r.challenge.title}: ${r.challenge.ended === "won" ? "succeeded" : "failed"}` });
  } else {
    await save(chaseRoll(c, msg.who, msg.total));
  }
}

/** GM: the other side rolls and the round resolves. */
export async function endChaseRound() {
  const c = getChallenge();
  if (!c || c.kind !== "chase" || c.ended) return;
  const Roll = foundry.dice?.Roll ?? (globalThis as any).Roll;
  const roll = await new Roll(`1d20 + ${c.otherBonus}`).evaluate();
  await roll.toMessage({ flavor: `${c.other}: ${c.complication.text}`, speaker: { alias: c.other } });
  const r = chaseRound(c, roll.total);
  await save(r.chase);
  await say(`<p><i class="fa-solid fa-person-running"></i> ${esc(r.text)}</p>`);
  if (r.chase.ended) await logSession({ kind: "note", text: `${r.chase.title}: ${r.chase.ended}` });
}

/** GM: nudge the lead or the score by hand. */
export async function nudgeChallenge(field: string, delta: number) {
  const c = getChallenge();
  if (!c) return;
  if (c.kind === "chase" && field === "lead") c.lead = Math.max(0, c.lead + delta);
  if (c.kind === "skill" && (field === "successes" || field === "failures")) c[field] = Math.max(0, c[field] + delta);
  delete c.ended;
  await save(c);
}

export const closeChallenge = () => save(null);

export function initChallenges() {
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "challengeTry" && game.users.activeGM?.isSelf) resolveTry(msg);
  });
  if (getChallenge()) import("./challenge-window.ts").then(({ ChallengeWindow }) => ChallengeWindow.sync());
}

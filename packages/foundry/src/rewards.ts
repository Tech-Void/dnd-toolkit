import { fightXp, levelForXp, questXp, rewardCoins, sessionRecap, xpShare, type CampaignQuest, type SessionEvent } from "@dnd-toolkit/core";
import { getCampaign } from "./campaign-store.ts";
import { giveLootToActor } from "./importers/items.ts";
import { partyActors } from "./rolls.ts";
import { ensureFolder, esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Rewards: when a fight ends, the GM gets its XP split ready to award; finishing a quest offers its
// gold and an XP award; crossing a level line tells the player; and everything the session handed
// out (XP, loot, quests, fights) is logged for an end-of-session recap.

interface SessionLog {
  n: number;
  /** Campaign log length when the session started (later entries go in the recap). */
  campaignStart: number;
  events: SessionEvent[];
}

export function registerRewardSettings() {
  game.settings.register(MODULE_ID, "sessionLog", { scope: "world", config: false, type: Object, default: { n: 1, campaignStart: 0, events: [] } });
  game.settings.register(MODULE_ID, "fightXp", {
    name: "Combat: XP card when a fight ends", hint: "When combat ends, whisper the GM the defeated foes' XP, split across the characters who fought, with an Award button.",
    scope: "world", config: true, type: Boolean, default: true,
  });
}

const gmIds = () => game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
const milestones = () => {
  try {
    return !!game.settings.get("dnd5e", "disableExperienceTracking");
  } catch {
    return false;
  }
};

const getLog = (): SessionLog => ({ n: 1, campaignStart: 0, events: [], ...structuredClone(game.settings.get(MODULE_ID, "sessionLog") ?? {}) });

/** Note something for the session recap (GM; players' events go through the GM anyway). */
export async function logSession(e: SessionEvent) {
  if (!game.user.isGM) return;
  const log = getLog();
  log.events.push(e);
  await game.settings.set(MODULE_ID, "sessionLog", log);
}

// --- XP --------------------------------------------------------------------------------------------

/** Give each actor `each` XP; tell anyone who levels up. */
export async function awardXp(actors: any[], each: number, reason: string) {
  if (!actors.length || each <= 0) return;
  const ups: string[] = [];
  for (const a of actors) {
    const xp = Number(a.system?.details?.xp?.value ?? 0);
    const level = Number(a.system?.details?.level ?? levelForXp(xp));
    await a.update({ "system.details.xp.value": xp + each });
    const to = levelForXp(xp + each);
    if (to > level) {
      ups.push(`${a.name} can reach level ${to}`);
      const owners = game.users.filter((u: any) => !u.isGM && a.testUserPermission(u, "OWNER")).map((u: any) => u.id);
      ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: [...owners, ...gmIds()], content: `<p><i class="fa-solid fa-arrow-up"></i> <strong>${esc(a.name)}</strong> has enough experience for level ${to}! Level up from the sheet when your GM says.</p>` });
    }
  }
  await ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content: `<p><i class="fa-solid fa-star"></i> <strong>+${each} XP</strong> each for ${esc(actors.map((a) => a.name).join(", "))} (${esc(reason)}).</p>` });
  await logSession({ kind: "xp", text: `+${each} XP each: ${reason}`, xp: each });
  for (const u of ups) await logSession({ kind: "level", text: u });
}

const xpCard = (total: number, actors: any[], reason: string, extra = "") => {
  const each = xpShare(total, actors.length);
  return `<div class="dt-combat-card dt-xp-card"><p>${extra}</p>
    ${milestones() ? `<p><em>XP tracking is off in dnd5e's settings (milestone levelling), so there's nothing to award.</em></p>` : `
    <p><strong>${total.toLocaleString()} XP</strong> for ${actors.length} character${actors.length === 1 ? "" : "s"}:</p>
    <div class="dt-row"><input type="number" min="0" value="${each}" data-xp-each style="width:6em"> XP each
      <button type="button" data-dt-xp="${esc(actors.map((a) => a.id).join(","))}" data-reason="${esc(reason)}"><i class="fa-solid fa-star"></i> Award</button></div>
    <p class="dt-sub">${esc(actors.map((a) => a.name).join(", "))}</p>`}</div>`;
};

/** Combat over: what was beaten, and its XP split across the characters who fought. */
async function fightOver(combat: any) {
  const foes = combat.combatants.filter((c: any) => c.actor?.type === "npc" && (c.token?.disposition ?? -1) < 0);
  const beaten = foes.filter((c: any) => c.isDefeated || Number(c.actor?.system?.attributes?.hp?.value ?? 1) <= 0);
  if (!beaten.length) return;
  const total = fightXp(beaten.map((c: any) => ({ xp: Number(c.actor.system?.details?.xp?.value) || undefined, cr: Number(c.actor.system?.details?.cr ?? 0) })));
  const fought = combat.combatants.filter((c: any) => c.actor?.type === "character").map((c: any) => c.actor);
  const actors = [...new Set(fought.length ? fought : partyActors())];
  const counts = new Map<string, number>();
  for (const c of beaten) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  const names = [...counts].map(([n, k]) => (k > 1 ? `${k}× ${n}` : n)).join(", ");
  await logSession({ kind: "fight", text: `Beat ${names}${beaten.length < foes.length ? ` (${foes.length - beaten.length} got away)` : ""}` });
  await ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: gmIds(), content: xpCard(total, actors, `beating ${names}`, `<strong>The fight is over.</strong> Beaten: ${esc(names)}.`) });
}

/** A quest is done: its gold to the stash and an XP award, one click each. */
export async function questReward(q: CampaignQuest) {
  await logSession({ kind: "quest", text: `${q.title}: done` });
  const party = partyActors();
  const level = party.length ? Math.round(party.reduce((n: number, a: any) => n + Number(a.system?.details?.level ?? 1), 0) / party.length) : 1;
  const total = questXp(level, Math.max(1, party.length));
  const coins = rewardCoins(q.reward ?? "");
  const coinText = Object.entries(coins).map(([k, n]) => `${n} ${k}`).join(", ");
  await ChatMessage.create({
    speaker: { alias: "DnD Toolkit" }, whisper: gmIds(),
    content: `${xpCard(total, party, `completing ${q.title}`, `<strong>Quest complete: ${esc(q.title)}.</strong> Reward: ${esc(q.reward || "none set")}.`)}
      ${coinText ? `<button type="button" data-dt-quest-coins='${esc(JSON.stringify(coins))}' data-reason="${esc(q.title)}"><i class="fa-solid fa-coins"></i> Pay ${esc(coinText)} into the party stash</button>` : ""}`,
  });
}

// --- Session recap ------------------------------------------------------------------------------

/** End the session: a recap journal the players can read, a chat card, and a fresh log. */
export async function endSession() {
  const log = getLog();
  const c = getCampaign();
  const world = c.log.slice(log.campaignStart).map((l) => `Day ${l.day}: ${l.text}`);
  const r = sessionRecap(log.n, log.events, world);
  if (!r.sections.length) return ui.notifications.info("Nothing to recap yet this session.");
  const html = `<p><strong>${r.xpEach ? `${r.xpEach.toLocaleString()} XP each` : "No XP awarded"}</strong>${r.lootGp ? ` · treasure worth about ${r.lootGp.toLocaleString()} gp` : ""}</p>
    ${r.sections.map((s) => `<h2>${esc(s.title)}</h2><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("")}`;
  const name = `Session ${r.number} recap`;
  const journal = await JournalEntry.create({ name, folder: await ensureFolder("JournalEntry"), ownership: { default: 2 }, pages: [{ name, type: "text", text: { content: html } }], flags: { [MODULE_ID]: { kind: "recap", n: r.number } } });
  await ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content: `<div class="dt-recap"><h3><i class="fa-solid fa-scroll"></i> ${esc(name)}</h3>${html}</div>` });
  await game.settings.set(MODULE_ID, "sessionLog", { n: r.number + 1, campaignStart: c.log.length, events: [] });
  journal.sheet.render(true);
}

export const sessionNumber = () => getLog().n;
export const sessionEventCount = () => getLog().events.length;

// --- Wiring ---------------------------------------------------------------------------------------

export function initRewards() {
  Hooks.on("deleteCombat", (combat: any) => {
    if (!game.users.activeGM?.isSelf || !combat.started || !game.settings.get(MODULE_ID, "fightXp")) return;
    fightOver(combat);
  });
  Hooks.on("renderChatMessage", (_m: any, html: any) => {
    if (!game.user.isGM) return;
    const root: HTMLElement = html[0] ?? html;
    for (const b of root.querySelectorAll("button[data-dt-xp]") as NodeListOf<HTMLButtonElement>) {
      b.addEventListener("click", async () => {
        const each = Number((b.closest(".dt-xp-card")?.querySelector("input[data-xp-each]") as HTMLInputElement | null)?.value ?? 0);
        const actors = b.dataset.dtXp!.split(",").map((id) => game.actors.get(id)).filter(Boolean);
        b.disabled = true;
        await awardXp(actors, each, b.dataset.reason ?? "");
      });
    }
    for (const b of root.querySelectorAll("button[data-dt-quest-coins]") as NodeListOf<HTMLButtonElement>) {
      b.addEventListener("click", async () => {
        b.disabled = true;
        const { ensureStash } = await import("./loot-piles.ts");
        const coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...JSON.parse(b.dataset.dtQuestCoins!) };
        const stash = await ensureStash();
        await giveLootToActor({ coins, items: [] }, stash, { quiet: true });
        const text = Object.entries(coins).filter(([, n]) => (n as number) > 0).map(([k, n]) => `${n} ${k}`).join(", ");
        await ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content: `<p><i class="fa-solid fa-coins"></i> ${esc(text)} paid into the party stash for ${esc(b.dataset.reason ?? "the quest")}.</p>` });
        const gp = coins.gp + coins.pp * 10 + coins.ep * 0.5 + coins.sp * 0.1 + coins.cp * 0.01;
        await logSession({ kind: "loot", text: `${text} for ${b.dataset.reason}`, gp });
      });
    }
  });
}

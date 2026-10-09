import { addLog, adjustAttitude, meetAgain, startTalk, talkAttitudeChange, talkSummary, tryTalk, type Approach, type Talk } from "@dnd-toolkit/core";
import { getCampaign, updateCampaign } from "./campaign-store.ts";
import { currentDay } from "./downtime.ts";
import { logSession } from "./rewards.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// A conversation everyone sees: the NPC's mood, their patience, what they've let slip. Players
// pick an approach and roll from their own sheet; the GM's client applies it. When it ends, the
// NPC remembers (Campaign → People) and their attitude to the party shifts.

const SOCKET = `module.${MODULE_ID}`;

export function registerTalkSettings() {
  game.settings.register(MODULE_ID, "talk", {
    scope: "world", config: false, type: Object, default: {},
    onChange: async () => {
      const { TalkWindow } = await import("./talk-window.ts");
      TalkWindow.sync();
    },
  });
}

export const getTalk = (): Talk | null => {
  const t = game.settings.get(MODULE_ID, "talk");
  return t && t.id ? structuredClone(t) : null;
};
const saveTalk = (t: Talk | null) => game.settings.set(MODULE_ID, "talk", t ?? {});

/** Start talking to someone (GM): asks what the party wants and what the NPC knows. */
export async function beginTalk(npc: { name: string; personality: string; motive: string; secret: string }, o: { npcId?: string; attitude?: number } = {}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const c = getCampaign();
  const known = o.npcId ? c.npcs.find((n) => n.id === o.npcId) : undefined;
  const result = await DialogV2.prompt({
    window: { title: `Talk to ${npc.name}`, icon: "fa-solid fa-comments" },
    content: `<div class="dt-talk-setup">
      <label>What do they want from ${esc(npc.name)}? <input type="text" name="ask" placeholder="e.g. let us into the vault"></label>
      <label>What ${esc(npc.name)} knows, one per line (told as they warm up)<textarea name="info" rows="4" placeholder="The guard changes at midnight."></textarea></label>
      <p class="dt-sub">Starting mood: ${known ? `${esc(String(known.attitude))} (from the campaign)` : "indifferent"}. Wants to ${esc(npc.motive)}. Secret: ${esc(npc.secret)}.</p></div>`,
    ok: {
      label: "Start",
      callback: (_e: Event, button: any) => ({ ask: button.form.elements.ask.value.trim(), info: button.form.elements.info.value.split("\n").map((l: string) => l.trim()).filter(Boolean) }),
    },
    rejectClose: false,
  });
  if (!result) return;
  const talk = startTalk(npc, { id: foundry.utils.randomID(), npcId: o.npcId, attitude: o.attitude ?? known?.attitude ?? 0, ask: result.ask, info: result.info });
  await saveTalk(talk);
  await ChatMessage.create({ speaker: { alias: npc.name }, content: `<p><i class="fa-solid fa-comments"></i> The party talks with <strong>${esc(npc.name)}</strong>${talk.ask ? `: they want ${esc(talk.ask)}` : ""}.</p>` });
}

/** A player (or the GM) tries an approach with a roll total. */
export function talkRequest(approach: Approach, total: number, who: string) {
  const msg = { kind: "talkTry", approach, total, who };
  game.socket.emit(SOCKET, msg);
  if (game.users.activeGM?.isSelf) resolveTry(msg);
}

async function resolveTry(msg: { approach: Approach; total: number; who: string }) {
  const t = getTalk();
  if (!t || t.ended) return;
  const { talk, text } = tryTalk(t, msg.approach, msg.total, msg.who);
  await saveTalk(talk);
  await ChatMessage.create({ speaker: { alias: talk.name }, content: `<p>${esc(text)}</p>` });
}

/** GM: nudge the mood or patience by hand. */
export async function adjustTalk(field: "mood" | "patience", delta: number) {
  const t = getTalk();
  if (!t) return;
  if (field === "mood") t.mood = Math.max(-3, Math.min(3, t.mood + delta));
  else t.patience = Math.max(0, t.patience + delta);
  if (t.ended && delta > 0) delete t.ended;
  await saveTalk(t);
}

/** GM: end it; the NPC remembers and their attitude shifts. */
export async function endTalk() {
  const t = getTalk();
  if (!t) return;
  const summary = talkSummary(t);
  const day = currentDay();
  const change = talkAttitudeChange(t);
  if (t.npcId && getCampaign().npcs.some((n) => n.id === t.npcId)) {
    await updateCampaign((c) => {
      let next = meetAgain(c, t.npcId!, summary, day);
      if (change) next = adjustAttitude(next, t.npcId!, change, "how the talk went", day);
      return next;
    });
  } else await updateCampaign((c) => addLog(c, day, "npc", summary));
  await logSession({ kind: "note", text: summary });
  await ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content: `<p><i class="fa-solid fa-comments"></i> ${esc(summary)}</p>` });
  await saveTalk(null);
}

export function initTalk() {
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "talkTry" && game.users.activeGM?.isSelf) resolveTry(msg);
  });
  // Someone joining mid-conversation sees it too.
  if (getTalk()) import("./talk-window.ts").then(({ TalkWindow }) => TalkWindow.sync());
}

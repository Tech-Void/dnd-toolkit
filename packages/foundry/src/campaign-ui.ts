import {
  addLog,
  adjustAttitude,
  adjustStanding,
  FACTION_KINDS,
  generateFaction,
  meetAgain,
  npcMemory,
  register,
  setQuestStatus,
  standingLabel,
  type CampaignState,
  type QuestStatus,
} from "@dnd-toolkit/core";
import { getCampaign, saveCampaign, updateCampaign } from "./campaign-store.ts";
import { currentDay } from "./downtime.ts";
import { createNpcActor } from "./importers/npc.ts";
import { prepAction, prepHtml } from "./session-prep.ts";
import { logSession, questReward } from "./rewards.ts";
import { beginTalk } from "./talk.ts";
import { esc } from "./util.ts";

// ---------------------------------------------------------------------------
// The Campaign tab: factions and where the party stands with them, the people they've met (and
// what those people remember), places, quests, and a running log. Buttons carry data-op; one
// handler does the rest.

export type CampaignView = "next" | "factions" | "people" | "places" | "quests" | "log";

const VIEWS: [CampaignView, string, string][] = [
  ["next", "Next session", "fa-clipboard-list"], ["factions", "Factions", "fa-flag"], ["people", "People", "fa-users"], ["places", "Places", "fa-location-dot"], ["quests", "Quests", "fa-scroll"], ["log", "Log", "fa-feather"],
];

const standingBar = (n: number) => `<span class="dt-standing s${n}" title="${standingLabel(n)}">${[-3, -2, -1, 0, 1, 2, 3].map((i) => `<i class="${i === n ? "on" : ""}"></i>`).join("")}<b>${standingLabel(n)}</b></span>`;
const op = (name: string, label: string, data: Record<string, string> = {}, title = "") =>
  `<button type="button" data-action="campaign" data-op="${name}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")} ${title ? `title="${esc(title)}"` : ""}>${label}</button>`;

export function campaignHtml(view: CampaignView, filter: string): string {
  const c = getCampaign();
  const tabs = VIEWS.map(([v, label, icon]) => `<button type="button" class="${v === view ? "active" : ""}" data-action="campaign" data-op="view" data-view="${v}"><i class="fa-solid ${icon}"></i> ${label} <small>${count(c, v)}</small></button>`).join("");
  const body = { next: () => prepHtml(), factions: factionsHtml, people: peopleHtml, places: placesHtml, quests: questsHtml, log: logHtml }[view](c, filter.toLowerCase());
  return `<p class="dt-sub">Day <strong>${currentDay()}</strong>. Use the <em>Remember</em> / <em>Track</em> buttons on the NPC, Settlement, Plot Hook and Side Quest tabs to add things here; the players' <strong>Quest Log</strong> journal updates by itself.</p>
    <div class="dt-camp-tabs">${tabs}</div>
    ${view === "people" ? `<input type="search" class="dt-camp-filter" data-campaign-filter value="${esc(filter)}" placeholder="Find someone…">` : ""}
    <div class="dt-campaign">${body}</div>`;
}

const count = (c: CampaignState, v: CampaignView) => ({ next: "", factions: c.factions.length, people: c.npcs.length, places: c.places.length, quests: c.quests.filter((q) => q.status === "active").length, log: c.log.length })[v];

function factionsHtml(c: CampaignState): string {
  const kinds = FACTION_KINDS.map((k) => `<option value="${k}">${k}</option>`).join("");
  const rows = c.factions.map((f) => {
    const leader = c.npcs.find((n) => n.id === f.leaderId);
    const base = c.places.find((p) => p.id === f.baseId);
    const rivals = f.rivals.map((r) => c.factions.find((x) => x.id === r)?.name).filter(Boolean);
    return `<div class="dt-card dt-faction">
      <p class="dt-enc-head"><strong>${esc(f.name)}</strong> <em>${esc(f.kind)}</em> ${standingBar(f.standing)}</p>
      <p>Wants to ${esc(f.goal)}.${leader ? ` Led by <strong>${esc(leader.name)}</strong>.` : ""}${base ? ` Based in ${esc(base.name)}.` : ""}${rivals.length ? ` At odds with ${esc(rivals.join(", "))}.` : ""}${f.tags ? ` <small>(foes: <code>${esc(f.tags)}</code>)</small>` : ""}</p>
      <div class="dt-row dt-actions">
        <input type="text" data-reason="${f.id}" placeholder="Why? (optional)">
        ${op("standing", `<i class="fa-solid fa-thumbs-down"></i>`, { id: f.id, delta: "-1" }, "Worse")}
        ${op("standing", `<i class="fa-solid fa-thumbs-up"></i>`, { id: f.id, delta: "1" }, "Better")}
        <select data-rival="${f.id}"><option value="">Add a rival…</option>${c.factions.filter((x) => x.id !== f.id && !f.rivals.includes(x.id)).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
        ${op("deleteFaction", `<i class="fa-solid fa-trash"></i>`, { id: f.id }, "Forget this faction")}
      </div>
      ${f.history.length ? `<details><summary>History</summary><ul>${f.history.slice().reverse().map((h) => `<li>Day ${h.day}: ${esc(h.text)}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  }).join("");
  return `<div class="dt-row"><label>New faction <select data-new-faction><option value="random">random kind</option>${kinds}</select></label>${op("newFaction", `<i class="fa-solid fa-plus"></i> Create`)}</div>${rows || `<p class="dt-empty">No factions yet.</p>`}`;
}

function peopleHtml(c: CampaignState, filter: string): string {
  const people = c.npcs.filter((n) => !filter || `${n.name} ${n.occupation}`.toLowerCase().includes(filter));
  const rows = people.map((n) => {
    const f = c.factions.find((x) => x.id === n.factionId);
    const p = c.places.find((x) => x.id === n.placeId);
    return `<div class="dt-card dt-person ${n.alive ? "" : "dead"}">
      <p class="dt-enc-head"><strong>${esc(n.name)}</strong> · ${esc(n.race)} ${esc(n.occupation)}${f ? ` · ${esc(f.name)}` : ""}${p ? ` · ${esc(p.name)}` : ""} ${standingBar(n.attitude)}</p>
      <p class="dt-sub">${esc(n.personality)}; ${esc(n.voice)}. Wants to ${esc(n.motive)}. <span class="dt-gm">Secret: ${esc(n.secret)}</span></p>
      <div class="dt-row dt-actions">
        <input type="text" data-met="${n.id}" placeholder="What happened this time?">
        ${op("met", `<i class="fa-solid fa-handshake"></i> Met again`, { id: n.id })}
        ${op("attitude", `<i class="fa-solid fa-thumbs-down"></i>`, { id: n.id, delta: "-1" }, "They like the party less")}
        ${op("attitude", `<i class="fa-solid fa-thumbs-up"></i>`, { id: n.id, delta: "1" }, "They like the party more")}
        ${op("brief", `<i class="fa-solid fa-comment"></i> Brief me`, { id: n.id }, "Whisper yourself what the party knows about them")}
        ${op("talk", `<i class="fa-solid fa-comments"></i> Talk`, { id: n.id }, "Start a conversation everyone sees, starting from how they feel about the party")}
        ${n.npc ? op("npcActor", `<i class="fa-solid fa-user-plus"></i> Actor`, { id: n.id }, "Create (or open) their actor") : ""}
        ${op("alive", n.alive ? `<i class="fa-solid fa-skull"></i>` : `<i class="fa-solid fa-heart"></i>`, { id: n.id }, n.alive ? "Mark dead" : "Mark alive")}
      </div>
      ${n.met.length ? `<details><summary>${n.met.length} meeting${n.met.length === 1 ? "" : "s"}</summary><ul>${n.met.slice().reverse().map((m) => `<li>Day ${m.day}: ${esc(m.text)}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  }).join("");
  return rows || `<p class="dt-empty">${filter ? "Nobody matches." : "Nobody yet. Use Remember on the NPC tab, or add a settlement."}</p>`;
}

function placesHtml(c: CampaignState): string {
  const rows = c.places.map((p) => {
    const people = c.npcs.filter((n) => n.placeId === p.id);
    const factions = c.factions.filter((f) => p.factionIds.includes(f.id) || f.baseId === p.id);
    return `<div class="dt-card"><p class="dt-enc-head"><strong>${esc(p.name)}</strong> · ${esc(p.kind)} · since day ${p.discovered}</p>
      ${p.notes ? `<p class="dt-sub">${esc(p.notes)}</p>` : ""}
      ${people.length ? `<p><strong>People:</strong> ${people.map((n) => esc(n.name)).join(", ")}</p>` : ""}
      ${factions.length ? `<p><strong>Factions:</strong> ${factions.map((f) => esc(f.name)).join(", ")}</p>` : ""}</div>`;
  }).join("");
  return `<div class="dt-row"><input type="text" data-new-place placeholder="Name a place to remember">${op("newPlace", `<i class="fa-solid fa-plus"></i> Add`)}</div>${rows || `<p class="dt-empty">No places yet.</p>`}`;
}

function questsHtml(c: CampaignState): string {
  const order: QuestStatus[] = ["active", "done", "failed"];
  const rows = [...c.quests].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map((q) => {
    const giver = c.npcs.find((n) => n.id === q.giverId);
    const f = c.factions.find((x) => x.id === q.factionId);
    return `<div class="dt-card dt-quest ${q.status}">
      <p class="dt-enc-head"><strong>${esc(q.title)}</strong>${giver ? ` · for ${esc(giver.name)}` : ""}${f ? ` · against ${esc(f.name)}` : ""}
        <select data-quest-status="${q.id}">${order.map((s) => `<option value="${s}" ${s === q.status ? "selected" : ""}>${s}</option>`).join("")}</select></p>
      <ul class="dt-steps">${q.steps.map((st, i) => `<li><label><input type="checkbox" data-quest-step="${q.id}" data-step="${i}" ${st.done ? "checked" : ""}> ${esc(st.text)}</label></li>`).join("")}</ul>
      <p class="dt-sub">Reward: ${esc(q.reward)} · <span class="dt-gm">${esc(q.notes)}</span></p>
    </div>`;
  }).join("");
  return `<div class="dt-row"><input type="text" data-new-quest placeholder="A quest the players took on">${op("newQuest", `<i class="fa-solid fa-plus"></i> Add`)}</div>${rows || `<p class="dt-empty">No quests yet. Track one from a side quest or a plot hook.</p>`}`;
}

function logHtml(c: CampaignState): string {
  const icon = { faction: "fa-flag", npc: "fa-user", place: "fa-location-dot", quest: "fa-scroll", note: "fa-feather" } as const;
  return `<div class="dt-row"><input type="text" data-new-note placeholder="Something worth remembering">${op("note", `<i class="fa-solid fa-plus"></i> Add`)}</div>
    <ul class="dt-camp-log">${c.log.slice().reverse().map((l) => `<li><span>Day ${l.day}</span> <i class="fa-solid ${icon[l.kind]}"></i> ${esc(l.text)}</li>`).join("") || `<li class="dt-muted">Nothing yet.</li>`}</ul>`;
}

/** Handle a Campaign tab button (returns a new view if it changed). */
export async function campaignAction(target: HTMLElement, root: HTMLElement): Promise<CampaignView | void> {
  const d = target.dataset;
  const day = currentDay();
  const value = (sel: string) => ((root.querySelector(sel) as HTMLInputElement | null)?.value ?? "").trim();
  if (d.op?.startsWith("prep")) return void (await prepAction(d.op, d, root));
  switch (d.op) {
    case "view":
      return d.view as CampaignView;
    case "standing":
      return void (await updateCampaign((c) => adjustStanding(c, d.id!, Number(d.delta), value(`[data-reason="${d.id}"]`), day)));
    case "attitude":
      return void (await updateCampaign((c) => adjustAttitude(c, d.id!, Number(d.delta), value(`[data-met="${d.id}"]`), day)));
    case "met":
      return void (await updateCampaign((c) => meetAgain(c, d.id!, value(`[data-met="${d.id}"]`), day)));
    case "brief": {
      const text = npcMemory(getCampaign(), d.id!);
      ChatMessage.create({ speaker: { alias: "Campaign" }, whisper: game.users.filter((u: any) => u.isGM).map((u: any) => u.id), content: `<p>${esc(text)}</p>` });
      return;
    }
    case "talk": {
      const n = getCampaign().npcs.find((x) => x.id === d.id);
      if (n) await beginTalk(n, { npcId: n.id, attitude: n.attitude });
      return;
    }
    case "alive":
      return void (await updateCampaign((c) => {
        const n = c.npcs.find((x) => x.id === d.id);
        if (n) n.alive = !n.alive;
        return n ? addLog(c, day, "npc", `${n.name} ${n.alive ? "is alive after all" : "is dead"}.`) : c;
      }));
    case "npcActor": {
      const c = getCampaign();
      const n = c.npcs.find((x) => x.id === d.id);
      if (!n?.npc) return;
      const existing = n.actorId && game.actors.get(n.actorId);
      if (existing) return void existing.sheet.render(true);
      const actor = await createNpcActor(n.npc);
      n.actorId = actor?.id;
      await saveCampaign(c);
      actor?.sheet?.render(true);
      return;
    }
    case "newFaction": {
      const kind = value("[data-new-faction]") || "random";
      const c = getCampaign();
      const { faction, leader } = generateFaction({ kind: kind as any, taken: c.factions.map((f) => f.name), seed: `${Date.now()}` });
      return void (await saveCampaign(register(c, { factions: [faction], npcs: [leader] }, day)));
    }
    case "deleteFaction":
      return void (await updateCampaign((c) => ({ ...c, factions: c.factions.filter((f) => f.id !== d.id).map((f) => ({ ...f, rivals: f.rivals.filter((r) => r !== d.id) })) })));
    case "newPlace": {
      const name = value("[data-new-place]");
      if (!name) return;
      return void (await updateCampaign((c) => register(c, { places: [{ id: foundry.utils.randomID(), name, kind: "landmark", notes: "", factionIds: [], discovered: day }] }, day)));
    }
    case "newQuest": {
      const title = value("[data-new-quest]");
      if (!title) return;
      return void (await updateCampaign((c) => register(c, { quests: [{ id: foundry.utils.randomID(), title, summary: "", status: "active", steps: [], reward: "", notes: "", started: day }] }, day)));
    }
    case "note": {
      const text = value("[data-new-note]");
      if (text) await updateCampaign((c) => addLog(c, day, "note", text));
      return;
    }
  }
}

/** Selects and checkboxes on the Campaign tab (statuses, steps, rivals). */
export function bindCampaignInputs(root: HTMLElement, rerender: () => void, onFilter: (v: string) => void) {
  const day = currentDay();
  for (const sel of root.querySelectorAll("select[data-quest-status]") as NodeListOf<HTMLSelectElement>) {
    sel.addEventListener("change", async () => {
      await updateCampaign((c) => setQuestStatus(c, sel.dataset.questStatus!, sel.value as QuestStatus, day));
      const q = getCampaign().quests.find((x) => x.id === sel.dataset.questStatus);
      if (q && sel.value === "done") await questReward(q);
      else if (q) await logSession({ kind: "quest", text: `${q.title}: ${sel.value}` });
    });
  }
  for (const box of root.querySelectorAll("input[data-quest-step]") as NodeListOf<HTMLInputElement>) {
    box.addEventListener("change", () => updateCampaign((c) => {
      const q = c.quests.find((x) => x.id === box.dataset.questStep);
      const step = q?.steps[Number(box.dataset.step)];
      if (!q || !step) return c;
      step.done = box.checked;
      return box.checked ? addLog(c, day, "quest", `${q.title}: ${step.text}`) : c;
    }));
  }
  for (const sel of root.querySelectorAll("select[data-rival]") as NodeListOf<HTMLSelectElement>) {
    sel.addEventListener("change", () => sel.value && updateCampaign((c) => {
      const a = c.factions.find((f) => f.id === sel.dataset.rival);
      const b = c.factions.find((f) => f.id === sel.value);
      if (!a || !b) return c;
      a.rivals = [...new Set([...a.rivals, b.id])];
      b.rivals = [...new Set([...b.rivals, a.id])];
      return addLog(c, day, "faction", `${a.name} and ${b.name} are rivals.`);
    }));
  }
  const filter = root.querySelector("input[data-campaign-filter]") as HTMLInputElement | null;
  filter?.addEventListener("change", () => {
    onFilter(filter.value);
    rerender();
  });
}

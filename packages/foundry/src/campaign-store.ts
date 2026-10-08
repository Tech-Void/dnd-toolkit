import { emptyCampaign, playerQuestLog, standingLabel, type CampaignState } from "@dnd-toolkit/core";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Where the campaign lives: a world setting the GM writes. Every change also refreshes the
// players' Quest Log journal (active and finished quests, never the GM's notes).

export function registerCampaignSettings() {
  game.settings.register(MODULE_ID, "campaign", {
    scope: "world", config: false, type: Object, default: emptyCampaign(),
    onChange: () => Hooks.callAll(`${MODULE_ID}.campaignChanged`),
  });
}

export const getCampaign = (): CampaignState => ({ ...emptyCampaign(), ...structuredClone(game.settings.get(MODULE_ID, "campaign") ?? {}) });

export async function saveCampaign(s: CampaignState) {
  await game.settings.set(MODULE_ID, "campaign", s);
  await syncQuestLog(s);
}

/** Change the campaign with a pure function and save it. */
export async function updateCampaign(fn: (s: CampaignState) => CampaignState) {
  await saveCampaign(fn(getCampaign()));
}

/** The players' Quest Log journal: one page, rewritten whenever a quest changes. */
async function syncQuestLog(s: CampaignState) {
  if (!s.quests.length) return;
  const { active, done } = playerQuestLog(s);
  const giver = (id?: string) => s.npcs.find((n) => n.id === id)?.name;
  const faction = (id?: string) => s.factions.find((f) => f.id === id);
  const quest = (q: (typeof active)[number]) => `<h2>${esc(q.title)}</h2>
    ${giver(q.giverId) ? `<p><em>For ${esc(giver(q.giverId)!)}</em></p>` : ""}
    <p>${esc(q.summary)}</p>
    <ul>${q.steps.map((st) => `<li>${st.done ? "✔" : "☐"} ${st.done ? `<s>${esc(st.text)}</s>` : esc(st.text)}</li>`).join("")}</ul>
    <p><strong>Reward:</strong> ${esc(q.reward)}</p>`;
  const known = s.factions.filter((f) => f.history.length || f.standing !== 0);
  const html = `${active.length ? active.map(quest).join("") : "<p><em>No quests in hand.</em></p>"}
    ${done.length ? `<h2>Finished</h2><ul>${done.map((q) => `<li>${q.status === "done" ? "✔" : "✘"} ${esc(q.title)}</li>`).join("")}</ul>` : ""}
    ${known.length ? `<h2>Standing</h2><ul>${known.map((f) => `<li>${esc(f.name)}: ${standingLabel(f.standing)}</li>`).join("")}</ul>` : ""}`;
  let journal = game.journal.find((j: any) => j.getFlag(MODULE_ID, "kind") === "questLog");
  journal ??= await JournalEntry.create({ name: "Quest Log", ownership: { default: 2 }, flags: { [MODULE_ID]: { kind: "questLog" } } });
  const page = journal.pages.contents[0];
  if (page) await page.update({ "text.content": html });
  else await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: "Quests", type: "text", text: { content: html } }]);
}

import type { Npc, Town } from "@dnd-toolkit/core";
import { ensureFolder, esc, MODULE_ID } from "../util.ts";
import { createBattlemapScene } from "./battlemap.ts";
import { shopHtml } from "./shop.ts";

const who = (n: Npc) => `${esc(n.name)} <em>(${esc(`${n.age} ${n.race} ${n.occupation}`)})</em>: ${esc(n.personality)}; ${esc(n.voice)}.`;

export function townOverviewHtml(t: Town): string {
  return `<p>${t.description.map(esc).join(" ")}</p>` +
    `<p><strong>Run by</strong> ${esc(t.government)}: ${who(t.leader)}</p>` +
    `<h3>Notable folk</h3><ul>${t.notables.map((n) => `<li>${who(n)} <em>Secret:</em> ${esc(n.secret)}.</li>`).join("")}</ul>` +
    `<h3>Factions</h3><ul>${t.factions.map((f) => `<li><strong>${esc(f.name)}</strong> want to ${esc(f.goal)}. Led by ${who(f.leader)}</li>`).join("")}</ul>` +
    `<h3>Trouble</h3><p>${esc(t.trouble.text)}</p>` +
    `<h3>Rumors</h3><ul>${t.rumors.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
}

export const innHtml = (t: Town) =>
  `<p>Run by ${who(t.inn.keeper)}</p><p><strong>Known for:</strong> ${esc(t.inn.specialty)}. <strong>Also:</strong> ${esc(t.inn.feature)}.</p><p>A room costs ${t.inn.roomGp} gp a night.</p>`;

export const templeHtml = (t: Town) =>
  `<p>A temple of <strong>${esc(t.temple.deity)}</strong>, god of ${esc(t.temple.domain)}. It ${esc(t.temple.feature)}.</p><p>Tended by ${who(t.temple.priest)}</p>`;

/** One journal for the whole place: an overview page, then the inn, temple and every shop. Returns page ids by building. */
export async function createTownJournal(t: Town): Promise<{ journal: any; pageFor: Map<number, string> }> {
  const pages: { name: string; html: string; building?: number }[] = [{ name: "Overview", html: townOverviewHtml(t) }];
  for (const p of t.places) {
    if (p.kind === "inn") pages.push({ name: p.label, html: innHtml(t), building: p.buildingId });
    else if (p.kind === "temple") pages.push({ name: p.label, html: templeHtml(t), building: p.buildingId });
    else if (p.kind === "shop" && p.shop !== undefined) pages.push({ name: p.label, html: shopHtml(t.shops[p.shop]!), building: p.buildingId });
    else if (p.kind === "hall") pages.push({ name: p.label, html: `<p>Where ${esc(t.government)} meet. ${who(t.leader)}</p>`, building: p.buildingId });
  }
  const journal = await JournalEntry.create({
    name: t.name,
    folder: await ensureFolder("JournalEntry"),
    pages: pages.map((p, i) => ({ name: p.name, type: "text", sort: i * 1000, text: { content: p.html }, flags: { [MODULE_ID]: { building: p.building } } })),
    flags: { [MODULE_ID]: { kind: "town", seed: t.seed } },
  });
  const pageFor = new Map<number, string>();
  for (const page of journal.pages) {
    const building = page.getFlag(MODULE_ID, "building");
    if (building) pageFor.set(building, page.id);
  }
  return { journal, pageFor };
}

const ICONS: Record<string, string> = {
  inn: "icons/svg/tankard.svg", temple: "icons/svg/temple.svg", shop: "icons/svg/hanging-sign.svg", hall: "icons/svg/castle.svg",
};

/** The town as a scene: the map with roofs, and a pin on every named building linked to its journal page. */
export async function createTownScene(t: Town) {
  const { journal, pageFor } = await createTownJournal(t);
  const notes = t.places.map((p) => {
    const b = t.map.buildings!.find((x) => x.id === p.buildingId)!;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, text: p.label, entryId: journal.id, pageId: pageFor.get(p.buildingId), icon: ICONS[p.kind] };
  });
  return createBattlemapScene(t.map, { name: t.name, notes, journalId: journal.id });
}

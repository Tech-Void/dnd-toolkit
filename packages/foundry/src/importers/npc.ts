import { npcSummary, npcTraits, type Npc } from "@dnd-toolkit/core";
import { findByName } from "../catalog.ts";
import { ensureFolder, esc, isDnd5e, MODULE_ID } from "../util.ts";

/** The NPC as HTML; `gm: false` leaves out the secret and statblock. */
export function npcHtml(n: Npc, { gm = true, heading = true } = {}): string {
  const rows = npcTraits(n)
    .filter(([, , gmOnly]) => gm || !gmOnly)
    .map(([label, text]) => `<li><strong>${esc(label)}:</strong> ${esc(text)}</li>`)
    .join("");
  return (heading ? `<h3>${esc(n.name)}</h3>` : "") +
    `<p><em>${esc(npcSummary(n).slice(n.name.length + 2))}</em></p><ul>${rows}</ul>` +
    (gm ? `<p><small>seed <code>${esc(n.seed)}</code></small></p>` : "");
}

/**
 * A world Actor for the NPC: a copy of its statblock from your compendiums (renamed, with the
 * personality in the biography), or a blank dnd5e NPC if the statblock isn't installed.
 */
export async function createNpcActor(n: Npc): Promise<any> {
  const folder = await ensureFolder("Actor");
  const biography = npcHtml(n, { heading: false });
  const flags = { [MODULE_ID]: { kind: "npc", seed: n.seed } };

  const hit = await findByName(n.statblock);
  const source = hit?.uuid ? await fromUuid(hit.uuid) : null;
  if (source) {
    const data = source.toObject();
    delete data._id;
    data.name = n.name;
    data.folder = folder;
    data.flags = { ...data.flags, ...flags };
    data.prototypeToken = { ...data.prototypeToken, name: n.name, actorLink: true };
    if (isDnd5e()) {
      data.system.details.biography = { ...data.system.details.biography, value: biography };
      if (data.system.details.type?.value === "humanoid") data.system.details.type.subtype = n.race;
    }
    return Actor.create(data);
  }
  if (hit === undefined) ui.notifications.warn(`DnD Toolkit: no "${n.statblock}" statblock in your compendiums; made a blank NPC.`);
  return Actor.create({
    name: n.name,
    type: isDnd5e() ? "npc" : Object.keys(game.system.documentTypes?.Actor ?? { npc: 1 })[0],
    folder,
    flags,
    prototypeToken: { name: n.name, actorLink: true },
    ...(isDnd5e() ? { system: { details: { biography: { value: biography }, type: { value: "humanoid", subtype: n.race } } } } : {}),
  });
}

/** Drop a token for the actor at the center of the current view. */
export async function placeNpcToken(actor: any) {
  const scene = canvas.scene;
  if (!scene) throw new Error("No active scene to place the token on.");
  const gs = scene.grid.size;
  const { x, y } = canvas.stage.pivot;
  // Snap to the grid, which starts after the scene's padding.
  const sx = canvas.dimensions?.sceneX ?? 0;
  const sy = canvas.dimensions?.sceneY ?? 0;
  const td = await actor.getTokenDocument({ x: sx + Math.floor((x - sx) / gs) * gs, y: sy + Math.floor((y - sy) / gs) * gs });
  return scene.createEmbeddedDocuments("Token", [td.toObject()]);
}

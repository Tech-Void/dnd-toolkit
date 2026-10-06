import type { Encounter, MonsterEntry } from "@dnd-toolkit/core";
import { findByName } from "../catalog.ts";
import { ensureFolder } from "../util.ts";

/** A world Actor for the monster, importing it from its compendium once and reusing it after. */
export async function ensureWorldActor(monster: MonsterEntry): Promise<any> {
  const uuid = monster.uuid ?? (await findByName(monster.name))?.uuid;
  if (!uuid) throw new Error(`"${monster.name}" isn't in any of your Actor compendiums.`);
  const doc = await fromUuid(uuid);
  if (!doc) throw new Error(`Couldn't load ${uuid}.`);
  if (!doc.pack) return doc;

  const existing = game.actors.find((a: any) => a._stats?.compendiumSource === uuid || a.getFlag("core", "sourceId") === uuid);
  if (existing) return existing;
  return game.actors.importFromCompendium(game.packs.get(doc.pack), doc.id, { folder: await ensureFolder("Actor") });
}

/** Fill in UUIDs for SRD-catalog encounters so journal and chat links work. */
export async function linkEncounter(encounter: Encounter): Promise<Encounter> {
  for (const g of encounter.groups) {
    if (!g.monster.uuid) {
      const hit = await findByName(g.monster.name);
      if (hit) g.monster = { ...g.monster, uuid: hit.uuid, img: hit.img };
    }
  }
  return encounter;
}

export interface PlaceOptions {
  scene?: any;
  /** Grid cells [x, y] tokens may occupy, in preference order. Default: around the view center. */
  cells?: [number, number][];
  hidden?: boolean;
  /** Add the tokens to the combat tracker and roll NPC initiative. */
  startCombat?: boolean;
}

/** Cells sorted by distance from a center cell. */
function cellsAround(cx: number, cy: number, radius: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) out.push([cx + dx, cy + dy]);
  return out.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
}

/** Place an encounter's tokens without overlapping each other or existing tokens. Returns the created tokens. */
export async function placeEncounter(encounter: Encounter, opts: PlaceOptions = {}) {
  const scene = opts.scene ?? canvas.scene;
  if (!scene) throw new Error("No active scene to place tokens on.");
  const gs = scene.grid.size;

  let candidates = opts.cells;
  if (!candidates) {
    const viewed = scene === canvas.scene;
    const px = viewed ? canvas.stage.pivot : { x: scene.width / 2, y: scene.height / 2 };
    const offX = viewed ? (canvas.dimensions?.sceneX ?? 0) : 0;
    const offY = viewed ? (canvas.dimensions?.sceneY ?? 0) : 0;
    candidates = cellsAround(Math.floor((px.x - offX) / gs), Math.floor((px.y - offY) / gs), 12);
  }
  const allowed = new Set(candidates.map(([x, y]) => `${x},${y}`));
  const restrict = !!opts.cells;

  const sceneX = scene === canvas.scene ? (canvas.dimensions?.sceneX ?? 0) : 0;
  const sceneY = scene === canvas.scene ? (canvas.dimensions?.sceneY ?? 0) : 0;
  const occupied = new Set<string>();
  for (const t of scene.tokens) {
    const tx = Math.floor((t.x - sceneX) / gs);
    const ty = Math.floor((t.y - sceneY) / gs);
    for (let dx = 0; dx < Math.max(1, t.width); dx++) for (let dy = 0; dy < Math.max(1, t.height); dy++) occupied.add(`${tx + dx},${ty + dy}`);
  }

  const claim = (size: number): [number, number] | null => {
    for (const [x, y] of candidates!) {
      const keys: string[] = [];
      for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) keys.push(`${x + dx},${y + dy}`);
      if (keys.some((k) => occupied.has(k) || (restrict && !allowed.has(k)))) continue;
      keys.forEach((k) => occupied.add(k));
      return [x, y];
    }
    return null;
  };

  const tokens: object[] = [];
  const problems: string[] = [];
  for (const g of encounter.groups) {
    let actor: any;
    try {
      actor = await ensureWorldActor(g.monster);
    } catch (err) {
      problems.push((err as Error).message);
      continue;
    }
    const size = Math.max(1, Math.round(actor.prototypeToken?.width ?? 1));
    for (let i = 0; i < g.count; i++) {
      // Fall back to 1×1 (overlapping the room edge is better than not placing it).
      const cell = claim(size) ?? claim(1) ?? candidates[0]!;
      const td = await actor.getTokenDocument({
        x: sceneX + cell[0] * gs,
        y: sceneY + cell[1] * gs,
        hidden: !!opts.hidden,
        name: g.name,
      });
      tokens.push(td.toObject());
    }
  }
  if (problems.length) ui.notifications.warn(`DnD Toolkit: ${[...new Set(problems)].join(" ")}`);

  const created = await scene.createEmbeddedDocuments("Token", tokens);
  if (opts.startCombat && created.length) {
    // Creates a combat for the viewed scene if there isn't one; returns the new combatants.
    const combatants = await TokenDocument.implementation.createCombatants(created);
    const combat = combatants?.[0]?.combat ?? game.combat;
    await combat?.rollInitiative(combatants.map((c: any) => c.id));
    ui.combat?.renderPopout?.();
  }
  return created;
}

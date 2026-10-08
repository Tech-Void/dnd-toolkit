import { lockPin, type Battlemap, type Encounter, type Prop } from "@dnd-toolkit/core";
import { lockedDoorData, trapRegionData } from "../interactive.ts";
import { battlemapToBlob, roofsToBlob } from "../render-battlemap.ts";
import { ambientLight, ensureFolder, esc, MODULE_ID } from "../util.ts";
import { createJournal } from "./journal.ts";
import { uploadImage } from "./scene.ts";
import { linkEncounter, placeEncounter } from "./tokens.ts";

export interface BattlemapSceneOptions {
  name?: string;
  /** Pixels per grid square. */
  gridSize?: number;
  /** Drop this encounter's tokens (hidden) in the enemy start zone. */
  encounter?: Encounter | null;
  /** Map pins, e.g. a settlement's buildings linked to its journal pages (grid units). */
  notes?: { x: number; y: number; text: string; entryId: string; pageId?: string; icon?: string }[];
  /** Use this journal instead of making a battlefield-notes one. */
  journalId?: string;
  activate?: boolean;
}

const ROUND = new Set<Prop["kind"]>(["tree", "boulder", "stalagmite", "pillar"]);

/** Wall loop around a blocking prop: an octagon for round things (a tree's trunk), a box for the rest. */
function propWalls(p: Prop, gs: number): number[][] {
  const cx = (p.x + p.w / 2) * gs;
  const cy = (p.y + p.h / 2) * gs;
  let pts: [number, number][];
  if (ROUND.has(p.kind)) {
    const r = Math.min(p.w, p.h) * gs * (p.kind === "tree" ? 0.22 : 0.4);
    pts = Array.from({ length: 8 }, (_, i) => [cx + Math.cos((i / 8) * Math.PI * 2) * r, cy + Math.sin((i / 8) * Math.PI * 2) * r]);
  } else {
    const inset = gs * 0.1;
    const [x1, y1, x2, y2] = [p.x * gs + inset, p.y * gs + inset, (p.x + p.w) * gs - inset, (p.y + p.h) * gs - inset];
    pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  }
  return pts.map(([x, y], i) => [Math.round(x), Math.round(y), Math.round(pts[(i + 1) % pts.length]![0]), Math.round(pts[(i + 1) % pts.length]![1])]);
}

export function battlemapNotesHtml(m: Battlemap): string {
  return `<ul>${m.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p><small>seed <code>${esc(m.seed)}</code></small></p>`;
}

/** A ready-to-fight Scene: painted background, walls, doors, windows, lights and darkness, plus optional enemy tokens. */
export async function createBattlemapScene(m: Battlemap, opts: BattlemapSceneOptions = {}) {
  const gs = opts.gridSize ?? game.settings.get(MODULE_ID, "gridSize") ?? 100;
  const name = opts.name ?? m.title;
  const { NONE, NORMAL } = CONST.WALL_SENSE_TYPES;
  const MOVE = CONST.WALL_MOVEMENT_TYPES.NORMAL;

  const blob = await battlemapToBlob(m, { cell: gs });
  const src = await uploadImage(blob, `battlemap-${m.setting}-${m.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.webp`);

  const walls: object[] = m.walls.map((w) => ({
    c: [w.x1 * gs, w.y1 * gs, w.x2 * gs, w.y2 * gs],
    door: w.door ? CONST.WALL_DOOR_TYPES.DOOR : CONST.WALL_DOOR_TYPES.NONE,
    move: MOVE,
    sight: w.window ? NONE : NORMAL,
    light: w.window ? NONE : NORMAL,
    sound: NORMAL,
    ...(w.lock ? lockedDoorData(w.lock) : {}),
  }));
  for (const p of m.props) {
    if (p.blocks === "none") continue;
    // "move" props (a cart, a hearth) stop feet but not eyes.
    const sees = p.blocks === "move" ? NONE : NORMAL;
    for (const c of propWalls(p, gs)) walls.push({ c, move: MOVE, sight: sees, light: sees, sound: NONE });
  }

  const lights = m.lights.map((l) => ambientLight(l, gs));

  const journal = opts.journalId ? { id: opts.journalId } : m.notes.length
    ? await createJournal(`${name} — Battlefield`, battlemapNotesHtml(m), { kind: "battlemap", seed: m.seed })
    : null;

  // Town roofs: one transparent overhead tile. VISION occlusion reveals what a token can actually
  // see beneath it, so stepping through a door shows that building's inside and nothing else.
  const tiles: object[] = [];
  if (m.buildings?.length) {
    const roofSrc = await uploadImage(await roofsToBlob(m, gs), `roofs-${m.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.png`);
    tiles.push({
      texture: { src: roofSrc },
      x: 0,
      y: 0,
      width: m.width * gs,
      height: m.height * gs,
      elevation: 20,
      occlusion: { mode: CONST.OCCLUSION_MODES.VISION, alpha: 0 },
      restrictions: { light: false, weather: true },
    });
  }
  const notes: object[] = (opts.notes ?? []).map((n) => ({
    entryId: n.entryId,
    pageId: n.pageId,
    x: Math.round(n.x * gs),
    y: Math.round(n.y * gs),
    text: n.text,
    texture: { src: n.icon ?? "icons/svg/house.svg" },
    iconSize: Math.round(gs * 0.6),
    fontSize: Math.round(gs * 0.3),
  }));
  // GM pins for locked doors and traps, linked to the battlefield notes.
  if (journal) {
    for (const w of m.walls.filter((w) => w.lock)) {
      notes.push({
        entryId: journal.id, pageId: undefined, x: Math.round(((w.x1 + w.x2) / 2) * gs), y: Math.round(((w.y1 + w.y2) / 2) * gs), text: lockPin(w.lock!),
        texture: { src: "icons/svg/padlock.svg", tint: "#f0c040" }, iconSize: Math.round(gs * 0.35), fontSize: Math.round(gs * 0.2),
      });
    }
    for (const t of m.traps ?? []) {
      notes.push({
        entryId: journal.id, pageId: undefined, x: Math.round((t.cells[0]![0] + 0.5) * gs), y: Math.round((t.cells[0]![1] + 0.5) * gs), text: `Trap: ${t.trap.name}`,
        texture: { src: "icons/svg/trap.svg", tint: "#ff5544" }, iconSize: Math.round(gs * 0.4), fontSize: Math.round(gs * 0.22),
      });
    }
  }

  const scene = await Scene.create({
    name,
    folder: await ensureFolder("Scene"),
    width: m.width * gs,
    height: m.height * gs,
    padding: 0,
    backgroundColor: "#000000",
    background: { src },
    grid: { type: CONST.GRID_TYPES.SQUARE, size: gs, distance: 5, units: "ft" },
    tokenVision: true,
    fog: { exploration: false },
    environment: { darknessLevel: m.darkness },
    journal: journal?.id ?? null,
    walls,
    lights,
    tiles,
    notes,
    foregroundElevation: 20,
    flags: { [MODULE_ID]: { seed: m.seed, kind: "battlemap", setting: m.setting } },
  });

  const regions = (m.traps ?? []).flatMap((t, i) => trapRegionData(t.trap, t.cells, gs, `trap-${i}`));
  if (regions.length) await scene.createEmbeddedDocuments("Region", regions);

  if (opts.encounter) {
    await linkEncounter(opts.encounter);
    await placeEncounter(opts.encounter, { scene, cells: m.zones.enemies, hidden: true });
  }

  if (opts.activate) await scene.activate();
  else await scene.view();
  return scene;
}

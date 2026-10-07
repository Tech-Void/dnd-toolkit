import type { Battlemap, Encounter, Prop } from "@dnd-toolkit/core";
import { battlemapToBlob } from "../render-battlemap.ts";
import { ensureFolder, esc, MODULE_ID } from "../util.ts";
import { createJournal } from "./journal.ts";
import { uploadImage } from "./scene.ts";
import { linkEncounter, placeEncounter } from "./tokens.ts";

export interface BattlemapSceneOptions {
  name?: string;
  /** Pixels per grid square. */
  gridSize?: number;
  /** Drop this encounter's tokens (hidden) in the enemy start zone. */
  encounter?: Encounter | null;
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
  }));
  for (const p of m.props) {
    if (p.blocks === "none") continue;
    // "move" props (a cart, a hearth) stop feet but not eyes.
    const sees = p.blocks === "move" ? NONE : NORMAL;
    for (const c of propWalls(p, gs)) walls.push({ c, move: MOVE, sight: sees, light: sees, sound: NONE });
  }

  const lights = m.lights.map((l) => ({
    x: Math.round(l.x * gs),
    y: Math.round(l.y * gs),
    config: {
      bright: l.bright,
      dim: l.dim,
      color: l.color,
      alpha: 0.35,
      animation: l.animation ? { type: l.animation === "fire" ? "flame" : l.animation, speed: 3, intensity: 3 } : {},
    },
  }));

  const journal = m.notes.length
    ? await createJournal(`${name} — Battlefield`, battlemapNotesHtml(m), { kind: "battlemap", seed: m.seed })
    : null;

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
    flags: { [MODULE_ID]: { seed: m.seed, kind: "battlemap", setting: m.setting } },
  });

  if (opts.encounter) {
    await linkEncounter(opts.encounter);
    await placeEncounter(opts.encounter, { scene, cells: m.zones.enemies, hidden: true });
  }

  if (opts.activate) await scene.activate();
  else await scene.view();
  return scene;
}

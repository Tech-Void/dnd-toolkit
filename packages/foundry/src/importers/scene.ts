import { createRng, type DungeonMap, type RoomKey } from "@dnd-toolkit/core";
import { dungeonToBlob } from "../render.ts";
import { ensureFolder, MODULE_ID } from "../util.ts";
import { createRoomKeyJournal } from "./journal.ts";
import { linkEncounter, placeEncounter } from "./tokens.ts";

const filePicker = () => foundry.applications?.apps?.FilePicker?.implementation ?? (globalThis as any).FilePicker;

async function uploadImage(blob: Blob, name: string): Promise<string> {
  const FP = filePicker();
  const dir = `worlds/${game.world.id}/${MODULE_ID}`;
  try {
    await FP.createDirectory("data", dir);
  } catch {
    // Already exists.
  }
  const file = new File([blob], name, { type: blob.type });
  const res = await FP.upload("data", dir, file, {}, { notify: false });
  if (!res?.path) throw new Error(`Upload of ${name} failed — check the GM has file upload permission.`);
  return res.path;
}

export interface SceneImportOptions {
  name?: string;
  /** Pixels per grid square. */
  gridSize?: number;
  /** Create a journal room key and pin each room as a map note. */
  roomKey?: RoomKey[];
  /** Place each room's encounter as hidden tokens. */
  placeMonsters?: boolean;
  activate?: boolean;
}

/** Create a fully playable Scene: background image, walls, doors, vision, and room notes. */
export async function createDungeonScene(map: DungeonMap, opts: SceneImportOptions = {}) {
  const gs = opts.gridSize ?? game.settings.get(MODULE_ID, "gridSize") ?? 100;
  const name = opts.name ?? `Dungeon ${map.seed}`;

  const blob = await dungeonToBlob(map, { cell: gs });
  const src = await uploadImage(blob, `dungeon-${map.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.webp`);

  const walls = map.walls.map((w) => ({
    c: [w.x1 * gs, w.y1 * gs, w.x2 * gs, w.y2 * gs],
    door: w.door ? CONST.WALL_DOOR_TYPES.DOOR : CONST.WALL_DOOR_TYPES.NONE,
  }));

  let journal: any = null;
  const notes: object[] = [];
  if (opts.roomKey?.length) {
    for (const key of opts.roomKey) if (key.encounter) await linkEncounter(key.encounter);
    journal = await createRoomKeyJournal(`${name} — Room Key`, opts.roomKey, map.seed);
    for (const key of opts.roomKey) {
      const room = map.rooms.find((r) => r.id === key.roomId);
      const page = journal.pages.find((p: any) => p.getFlag(MODULE_ID, "roomId") === key.roomId);
      if (!room || !page) continue;
      notes.push({
        entryId: journal.id,
        pageId: page.id,
        x: Math.round((room.x + room.w / 2) * gs),
        y: Math.round((room.y + room.h / 2) * gs),
        text: String(room.id),
        texture: { src: "icons/svg/book.svg" },
        iconSize: Math.round(gs * 0.5),
        fontSize: Math.round(gs * 0.3),
      });
    }
  }

  const scene = await Scene.create({
    name,
    folder: await ensureFolder("Scene"),
    width: map.width * gs,
    height: map.height * gs,
    padding: 0,
    backgroundColor: "#000000",
    background: { src },
    grid: { type: CONST.GRID_TYPES.SQUARE, size: gs, distance: 5, units: "ft" },
    tokenVision: true,
    fog: { exploration: true },
    journal: journal?.id ?? null,
    walls,
    notes,
    flags: { [MODULE_ID]: { seed: map.seed, kind: "dungeon" } },
  });

  if (opts.placeMonsters) {
    for (const key of opts.roomKey ?? []) {
      const room = map.rooms.find((r) => r.id === key.roomId);
      if (!room || !key.encounter) continue;
      // Shuffled interior cells, skipping the room's center where the map note sits.
      const cells: [number, number][] = [];
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) cells.push([x, y]);
      const cx = Math.floor(room.x + room.w / 2);
      const cy = Math.floor(room.y + room.h / 2);
      const shuffled = createRng(`${map.seed}:tokens:${room.id}`).shuffle(cells.filter(([x, y]) => x !== cx || y !== cy));
      await placeEncounter(key.encounter, { scene, cells: shuffled, hidden: true });
    }
  }

  if (opts.activate) await scene.activate();
  else await scene.view();
  return scene;
}

import { roomCenter, type DungeonLight, type DungeonMap, type LootPile, type RoomKey } from "@dnd-toolkit/core";
import { dungeonToBlob, tokenCells } from "../render.ts";
import { ambientLight, ensureFolder, isDnd5e, MODULE_ID } from "../util.ts";
import { resolveItemData } from "./items.ts";
import { createRoomKeyJournal } from "./journal.ts";
import { itemPilesActive } from "./shop.ts";
import { linkEncounter, placeEncounter } from "./tokens.ts";

// v13 namespaces it; v12 declares `class FilePicker` at the top level of a classic script, which is a
// global binding but not a property of globalThis.
const filePicker = () => foundry.applications?.apps?.FilePicker?.implementation ?? (typeof FilePicker === "undefined" ? undefined : FilePicker);

export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const FP = filePicker();
  if (!FP) throw new Error("Foundry's FilePicker isn't available, so the map image can't be uploaded.");
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
  /** Light sources: painted into the background and created as AmbientLights. */
  lights?: DungeonLight[];
  /** Scene darkness, 0 (daylight) to 1. Default 0. */
  darkness?: number;
  /** Let global illumination light the scene. */
  globalLight?: boolean;
  /** One creature in each humanoid group carries a torch. */
  torchBearers?: boolean;
  activate?: boolean;
}

/** A hidden Item Piles pile holding the loot, if Item Piles is active. */
async function createLootPile(scene: any, pile: LootPile, gs: number) {
  if (!itemPilesActive()) return;
  const items = await Promise.all(pile.loot.items.map(resolveItemData));
  const currency = Object.fromEntries(Object.entries(pile.loot.coins).filter(([, n]) => n > 0));
  await game.itempiles.API.createItemPile({
    sceneId: scene.id,
    position: { x: pile.cell[0] * gs, y: pile.cell[1] * gs },
    items,
    actorOverrides: isDnd5e() && Object.keys(currency).length ? { system: { currency } } : undefined,
    tokenOverrides: { name: "Loot", hidden: true },
  });
}

/** Create a fully playable Scene: background image, walls, doors, vision, and room notes. */
export async function createDungeonScene(map: DungeonMap, opts: SceneImportOptions = {}) {
  const gs = opts.gridSize ?? game.settings.get(MODULE_ID, "gridSize") ?? 100;
  const name = opts.name ?? `${map.style === "cave" ? "Cave" : "Dungeon"} ${map.seed}`;

  const blob = await dungeonToBlob(map, { cell: gs, lights: opts.lights });
  const src = await uploadImage(blob, `dungeon-${map.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.webp`);

  const walls = map.walls.map((w) => ({
    // Foundry wants whole pixels; smoothed cave walls fall between grid lines.
    c: [w.x1, w.y1, w.x2, w.y2].map((v) => Math.round(v * gs)),
    door: w.secret ? CONST.WALL_DOOR_TYPES.SECRET : w.door ? CONST.WALL_DOOR_TYPES.DOOR : CONST.WALL_DOOR_TYPES.NONE,
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
        x: Math.round((roomCenter(room)[0] + 0.5) * gs),
        y: Math.round((roomCenter(room)[1] + 0.5) * gs),
        text: String(room.id),
        texture: { src: "icons/svg/book.svg" },
        iconSize: Math.round(gs * 0.5),
        fontSize: Math.round(gs * 0.3),
      });
      // Loot piles get their own pins. The room key is GM-only, so players never see them.
      for (const pile of key.piles ?? []) {
        notes.push({
          entryId: journal.id,
          pageId: page.id,
          x: Math.round((pile.cell[0] + 0.5) * gs),
          y: Math.round((pile.cell[1] + 0.5) * gs),
          text: `Loot (DC ${pile.dc})`,
          texture: { src: "icons/svg/chest.svg", tint: "#e0b43a" },
          iconSize: Math.round(gs * 0.4),
          fontSize: Math.round(gs * 0.22),
        });
      }
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
    environment: { darknessLevel: opts.darkness ?? 0, globalLight: { enabled: !!opts.globalLight } },
    journal: journal?.id ?? null,
    walls,
    notes,
    lights: (opts.lights ?? []).map((l) => ambientLight(l, gs)),
    flags: { [MODULE_ID]: { seed: map.seed, kind: "dungeon" } },
  });

  if (opts.placeMonsters) {
    for (const key of opts.roomKey ?? []) {
      // Interior cells spread apart, away from the walls, the map note and any loot pile (same as the preview).
      if (key.encounter) await placeEncounter(key.encounter, { scene, cells: tokenCells(map, key), hidden: true, torchBearers: opts.torchBearers });
    }
  }
  for (const key of opts.roomKey ?? []) for (const pile of key.piles ?? []) await createLootPile(scene, pile, gs);

  if (opts.activate) await scene.activate();
  else await scene.view();
  return scene;
}

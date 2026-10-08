import { lockPin, roomCenter, type DungeonLight, type DungeonMap, type LootPile, type RoomKey, type WallSegment } from "@dnd-toolkit/core";
import { lockedDoorData, trapRegionData } from "../interactive.ts";
import { dungeonToBlob, tokenCells } from "../render.ts";
import { dungeonArt } from "../fa-assets.ts";
import { dungeonEffects, effectTiles } from "../effects.ts";
import { puzzleDoorFlag, puzzleSceneData } from "../puzzles.ts";
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

/** Which room's page a door's pin links to: the room side of it (not the corridor). */
const pinRoom = (w: WallSegment) => w.lock!.rooms.find((r) => r !== 0) ?? 0;

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

  const blob = await dungeonToBlob(map, { cell: gs, lights: opts.lights, art: await dungeonArt(map, opts.roomKey ?? []), keys: opts.roomKey });
  const src = await uploadImage(blob, `dungeon-${map.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.webp`);

  const walls = map.walls.map((w) => ({
    // Foundry wants whole pixels; smoothed cave walls fall between grid lines.
    c: [w.x1, w.y1, w.x2, w.y2].map((v) => Math.round(v * gs)),
    door: w.secret ? CONST.WALL_DOOR_TYPES.SECRET : w.door ? CONST.WALL_DOOR_TYPES.DOOR : CONST.WALL_DOOR_TYPES.NONE,
    // Locked, stuck and barred doors start LOCKED; players clicking one get to pick, force or unlock it.
    ...(w.lock ? lockedDoorData(w.lock) : {}),
  })).map((data, i) => {
    // The door a puzzle opens remembers which puzzle.
    const pid = puzzleDoorFlag(map, map.walls[i]!);
    return pid ? { ...data, flags: { [MODULE_ID]: { ...((data as any).flags?.[MODULE_ID] ?? {}), puzzleDoor: pid } } } : data;
  });

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
      // Trap triggers and locked doors get pins too.
      if (key.trapData && key.trapCells?.length) {
        const [tx, ty] = key.trapCells[0]!;
        notes.push({
          entryId: journal.id, pageId: page.id, x: Math.round((tx + 0.5) * gs), y: Math.round((ty + 0.5) * gs),
          text: `Trap: ${key.trapData.name}`, texture: { src: "icons/svg/trap.svg", tint: "#ff5544" }, iconSize: Math.round(gs * 0.4), fontSize: Math.round(gs * 0.22),
        });
      }
      for (const w of map.walls.filter((w) => w.lock && w.lock.rooms.includes(key.roomId) && pinRoom(w) === key.roomId)) {
        notes.push({
          entryId: journal.id, pageId: page.id, x: Math.round(((w.x1 + w.x2) / 2) * gs), y: Math.round(((w.y1 + w.y2) / 2) * gs),
          text: lockPin(w.lock!), texture: { src: w.lock!.kind === "locked" || w.lock!.kind === "arcane" ? "icons/svg/padlock.svg" : "icons/svg/door-locked-outline.svg", tint: "#f0c040" },
          iconSize: Math.round(gs * 0.35), fontSize: Math.round(gs * 0.2),
        });
      }
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
    tiles: await effectTiles(dungeonEffects(map, opts.roomKey ?? [], opts.lights ?? []), gs, map.seed),
    lights: (opts.lights ?? []).map((l) => ambientLight(l, gs)),
    flags: { [MODULE_ID]: { seed: map.seed, kind: "dungeon" } },
  });

  if (opts.placeMonsters) {
    for (const key of opts.roomKey ?? []) {
      // Interior cells spread apart, away from the walls, the map note and any loot pile (same as the preview).
      if (key.encounter) await placeEncounter(key.encounter, { scene, cells: tokenCells(map, key), hidden: true, torchBearers: opts.torchBearers, lair: /Lair/.test(key.title) });
    }
  }
  for (const key of opts.roomKey ?? []) for (const pile of key.piles ?? []) await createLootPile(scene, pile, gs);
  // Traps: trigger squares that stop and pause, and a ring where sharp eyes spot them first.
  const regions: object[] = (opts.roomKey ?? []).flatMap((k) => (k.trapData && k.trapCells?.length ? trapRegionData(k.trapData, k.trapCells, gs, `room-${k.roomId}`) : []));
  // Puzzles: a tile and a region for every lever, plate, statue and rune.
  const pz = await puzzleSceneData(map, gs);
  regions.push(...pz.regions);
  if (pz.tiles.length) await scene.createEmbeddedDocuments("Tile", pz.tiles);
  if (Object.keys(pz.flags).length) await scene.setFlag(MODULE_ID, "puzzles", pz.flags);
  if (regions.length) await scene.createEmbeddedDocuments("Region", regions);

  if (opts.activate) await scene.activate();
  else await scene.view();
  return scene;
}

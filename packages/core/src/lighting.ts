import { createRng, type Rng } from "./rng.ts";
import { FLOOR, lairRoom, roomCells, roomCenter, type DungeonMap, type RoomKey } from "./dungeon.ts";
import type { BattleLight } from "./battlemap.ts";

export type LightAmount = "none" | "sparse" | "lit";
export type LightKind = "torch" | "brazier" | "candles" | "fungi" | "crystal" | "lava" | "daylight" | "campfire";

export interface DungeonLight extends BattleLight {
  kind: LightKind;
}

const LIGHTS: Record<LightKind, Omit<BattleLight, "x" | "y">> = {
  torch: { bright: 10, dim: 25, color: "#ff9a3c", animation: "torch" },
  brazier: { bright: 15, dim: 30, color: "#ff7a1f", animation: "fire" },
  candles: { bright: 5, dim: 15, color: "#ffc46b", animation: "torch" },
  campfire: { bright: 15, dim: 30, color: "#ff9329", animation: "fire" },
  fungi: { bright: 0, dim: 15, color: "#4fd1c5", animation: "pulse" },
  crystal: { bright: 5, dim: 20, color: "#b07cff", animation: "pulse" },
  lava: { bright: 10, dim: 30, color: "#ff5a1a", animation: "fire" },
  daylight: { bright: 20, dim: 35, color: "#fff1d0" },
};

export interface LightOptions {
  amount?: LightAmount;
  seed?: string | number;
}

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Light sources for a stocked dungeon or cave. Dungeons get wall torches in rooms and corridors,
 * braziers in the lair and candles where the room description calls for them. Caves get a shaft of
 * daylight at the entrance, glowing fungi and crystals, now and then a lava seam, and a campfire in
 * the lair. Hidden rooms stay dark. "sparse" leaves most of the map dark; "lit" lights most rooms.
 */
export function lightDungeon(map: DungeonMap, keys: RoomKey[] = [], opts: LightOptions = {}): DungeonLight[] {
  const amount = opts.amount ?? "sparse";
  if (amount === "none") return [];
  const rng = createRng(opts.seed ?? `${map.seed}:lights`);
  const lit = amount === "lit";
  const lights: DungeonLight[] = [];
  const add = (kind: LightKind, x: number, y: number) => lights.push({ kind, x, y, ...LIGHTS[kind] });
  const floor = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;
  const lair = lairRoom(map);
  const keyFor = (id: number) => keys.find((k) => k.roomId === id);

  /** A floor cell against a wall, with the light set into the wall edge. */
  const onWall = (cells: [number, number][]): [number, number] | null => {
    const options: [number, number][] = [];
    for (const [x, y] of cells) {
      for (const [dx, dy] of N4) {
        if (!floor(x + dx, y + dy)) options.push([x + 0.5 + dx * 0.42, y + 0.5 + dy * 0.42]);
      }
    }
    return options.length ? rng.pick(options) : null;
  };
  const spaced = (x: number, y: number, gap: number) => lights.every((l) => Math.hypot(l.x - x, l.y - y) >= gap);

  for (const room of map.rooms) {
    if (room.hidden) continue;
    const cells = roomCells(room);
    const [cx, cy] = roomCenter(room);
    const text = keyFor(room.id)?.description.toLowerCase() ?? "";

    if (map.style === "cave") {
      if (room.id === 1) add("daylight", cx + 0.5, cy + 0.5);
      else if (/daylight/.test(text)) add("daylight", cx + 0.5, cy + 0.5);
      if (room === lair) {
        const [x, y] = rng.pick(cells);
        add("campfire", x + 0.5, y + 0.5);
      }
      if (/glow|fungus|fungi/.test(text) || rng.chance(lit ? 0.6 : 0.3)) placeMany(rng, "fungi", cells, lit ? 3 : 2);
      if (/crystal/.test(text) || rng.chance(lit ? 0.25 : 0.12)) placeMany(rng, "crystal", cells, lit ? 2 : 1);
      if (/sulfur|vent|lava|warm/.test(text) || rng.chance(0.06)) placeMany(rng, "lava", cells, 1);
      continue;
    }

    if (room === lair) {
      // Braziers flanking the middle of the lair.
      const sideways = room.w >= room.h;
      for (const d of [-1, 1]) {
        const x = sideways ? cx + d * Math.max(1, Math.floor(room.w / 4)) : cx;
        const y = sideways ? cy : cy + d * Math.max(1, Math.floor(room.h / 4));
        if (floor(x, y)) add("brazier", x + 0.5, y + 0.5);
      }
    }
    if (/candle|altar|shrine|feast/.test(text)) add("candles", cx + 0.5 + (rng.chance(0.5) ? 1 : -1), cy + 0.5);
    if (/glows/.test(text)) placeMany(rng, "fungi", cells, 2);
    if (room.id === 1 || room === lair || rng.chance(lit ? 1 : 0.35)) {
      const torches = lit ? Math.max(2, Math.round(cells.length / 20)) : 1;
      let placed = 0;
      for (let i = 0; i < torches * 6 && placed < torches; i++) {
        const spot = onWall(cells);
        if (!spot || !spaced(spot[0], spot[1], 3)) continue;
        add("torch", spot[0], spot[1]);
        placed++;
      }
    }
  }

  // Corridor torches, every so often.
  if (map.style !== "cave") {
    const inRoom = new Set(map.rooms.flatMap((r) => roomCells(r).map(([x, y]) => `${x},${y}`)));
    const hiddenRooms = map.rooms.filter((r) => r.hidden);
    const corridor: [number, number][] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (floor(x, y) && !inRoom.has(`${x},${y}`)) corridor.push([x, y]);
    const gap = lit ? 6 : 11;
    for (const [x, y] of rng.shuffle(corridor)) {
      // Corridors next to a hidden room stay dark so the light doesn't give it away.
      if (hiddenRooms.some((r) => x >= r.x - 2 && x < r.x + r.w + 2 && y >= r.y - 2 && y < r.y + r.h + 2)) continue;
      const spot = onWall([[x, y]]);
      if (spot && spaced(spot[0], spot[1], gap)) add("torch", spot[0], spot[1]);
    }
  }
  return lights;

  function placeMany(r: Rng, kind: LightKind, cells: [number, number][], count: number) {
    for (const [x, y] of r.shuffle(cells).slice(0, count)) if (spaced(x + 0.5, y + 0.5, 2)) add(kind, x + 0.5, y + 0.5);
  }
}

/** How dark a dungeon scene should be by default. */
export const defaultDarkness = (amount: LightAmount) => (amount === "lit" ? 0.6 : 0.9);

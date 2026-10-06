import { createRng, type Rng } from "./rng.ts";
import { generateLoot, type LootResult, type MagicItemPool } from "./loot.ts";
import { generateEncounter, type Encounter, type MonsterEntry } from "./encounter.ts";

export const ROCK = 0;
export const FLOOR = 1;

export interface DungeonOptions {
  width?: number;
  height?: number;
  maxRooms?: number;
  minRoomSize?: number;
  maxRoomSize?: number;
  /** 0..1 chance per room of an extra corridor, creating loops. */
  loopChance?: number;
  /** 0..1 chance that a single-width room entrance gets a door. */
  doorChance?: number;
  seed?: string | number;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A wall along cell edges, in grid units (multiply by grid size for pixels). */
export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  door: boolean;
}

export interface DungeonMap {
  seed: string;
  width: number;
  height: number;
  /** cells[y][x]: ROCK or FLOOR. */
  cells: number[][];
  rooms: Room[];
  walls: WallSegment[];
}

const center = (r: Room): [number, number] => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
const dist = (a: Room, b: Room) => {
  const [ax, ay] = center(a);
  const [bx, by] = center(b);
  return Math.hypot(ax - bx, ay - by);
};
const inRoom = (r: Room, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function placeRooms(rng: Rng, o: Required<Omit<DungeonOptions, "seed">>): Room[] {
  const rooms: Room[] = [];
  for (let attempt = 0; attempt < o.maxRooms * 30 && rooms.length < o.maxRooms; attempt++) {
    const w = rng.int(o.minRoomSize, o.maxRoomSize);
    const h = rng.int(o.minRoomSize, o.maxRoomSize);
    if (w + 2 > o.width || h + 2 > o.height) continue;
    const x = rng.int(1, o.width - w - 1);
    const y = rng.int(1, o.height - h - 1);
    // Keep at least one rock cell between rooms.
    const clash = rooms.some((r) => x < r.x + r.w + 1 && r.x < x + w + 1 && y < r.y + r.h + 1 && r.y < y + h + 1);
    if (!clash) rooms.push({ id: 0, x, y, w, h });
  }
  // Number rooms left-to-right, top-to-bottom so keys read naturally.
  rooms.sort((a, b) => a.y + a.x / 1000 - (b.y + b.x / 1000));
  rooms.forEach((r, i) => (r.id = i + 1));
  return rooms;
}

/** Prim's minimum spanning tree over room centers, plus random extra links for loops. */
function connections(rng: Rng, rooms: Room[], loopChance: number): [Room, Room][] {
  if (rooms.length < 2) return [];
  const links: [Room, Room][] = [];
  const connected = new Set<Room>([rooms[0]!]);
  while (connected.size < rooms.length) {
    let best: [Room, Room] | null = null;
    let bestD = Infinity;
    for (const a of connected) {
      for (const b of rooms) {
        if (connected.has(b)) continue;
        const d = dist(a, b);
        if (d < bestD) [best, bestD] = [[a, b], d];
      }
    }
    links.push(best!);
    connected.add(best![1]);
  }
  for (const a of rooms) {
    if (!rng.chance(loopChance)) continue;
    const others = rooms
      .filter((b) => b !== a && !links.some(([p, q]) => (p === a && q === b) || (p === b && q === a)))
      .sort((p, q) => dist(a, p) - dist(a, q));
    if (others[0]) links.push([a, others[0]]);
  }
  return links;
}

function carveCorridor(rng: Rng, cells: number[][], a: Room, b: Room) {
  const [ax, ay] = center(a);
  const [bx, by] = center(b);
  const horiz = (y: number, x1: number, x2: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) cells[y]![x] = FLOOR;
  };
  const vert = (x: number, y1: number, y2: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) cells[y]![x] = FLOOR;
  };
  if (rng.chance(0.5)) {
    horiz(ay, ax, bx);
    vert(bx, ay, by);
  } else {
    vert(ax, ay, by);
    horiz(by, ax, bx);
  }
}

/** Edge keys: "h,x,y" = horizontal edge on grid line y from x to x+1; "v,x,y" = vertical edge on line x from y to y+1. */
function findDoors(rng: Rng, cells: number[][], rooms: Room[], doorChance: number): Set<string> {
  const isFloor = (x: number, y: number) => cells[y]?.[x] === FLOOR;
  const doors = new Set<string>();

  for (const r of rooms) {
    // Each side: list of [edgeKey, outsideIsOpen] in order along the side.
    const sides: [string, boolean][][] = [[], [], [], []];
    for (let x = r.x; x < r.x + r.w; x++) {
      sides[0]!.push([`h,${x},${r.y}`, isFloor(x, r.y - 1)]);
      sides[1]!.push([`h,${x},${r.y + r.h}`, isFloor(x, r.y + r.h)]);
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      sides[2]!.push([`v,${r.x},${y}`, isFloor(r.x - 1, y)]);
      sides[3]!.push([`v,${r.x + r.w},${y}`, isFloor(r.x + r.w, y)]);
    }
    // Only single-width openings become doors; wide openings stay open archways.
    for (const side of sides) {
      side.forEach(([key, open], i) => {
        if (open && !side[i - 1]?.[1] && !side[i + 1]?.[1] && rng.chance(doorChance)) doors.add(key);
      });
    }
  }
  return doors;
}

/** Merge unit edges into long segments and add door segments. */
function buildWalls(cells: number[][], width: number, height: number, doors: Set<string>): WallSegment[] {
  const isFloor = (x: number, y: number) => cells[y]?.[x] === FLOOR;
  const hEdges = new Map<number, number[]>(); // y -> xs
  const vEdges = new Map<number, number[]>(); // x -> ys
  const push = (m: Map<number, number[]>, k: number, v: number) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFloor(x, y)) continue;
      if (!isFloor(x, y - 1)) push(hEdges, y, x);
      if (!isFloor(x, y + 1)) push(hEdges, y + 1, x);
      if (!isFloor(x - 1, y)) push(vEdges, x, y);
      if (!isFloor(x + 1, y)) push(vEdges, x + 1, y);
    }
  }

  const walls: WallSegment[] = [];
  const merge = (m: Map<number, number[]>, horizontal: boolean) => {
    for (const [line, positions] of m) {
      positions.sort((a, b) => a - b);
      let start = positions[0]!;
      let prev = start;
      for (let i = 1; i <= positions.length; i++) {
        const p = positions[i];
        if (p === prev + 1) {
          prev = p;
          continue;
        }
        walls.push(horizontal
          ? { x1: start, y1: line, x2: prev + 1, y2: line, door: false }
          : { x1: line, y1: start, x2: line, y2: prev + 1, door: false });
        if (p !== undefined) start = prev = p;
      }
    }
  };
  merge(hEdges, true);
  merge(vEdges, false);

  for (const key of doors) {
    const [dir, a, b] = key.split(",") as [string, string, string];
    const x = Number(a);
    const y = Number(b);
    walls.push(dir === "h" ? { x1: x, y1: y, x2: x + 1, y2: y, door: true } : { x1: x, y1: y, x2: x, y2: y + 1, door: true });
  }
  return walls;
}

export function generateDungeon(opts: DungeonOptions = {}): DungeonMap {
  const o = {
    width: 40,
    height: 30,
    maxRooms: 12,
    minRoomSize: 4,
    maxRoomSize: 9,
    loopChance: 0.15,
    doorChance: 0.7,
    ...opts,
  };
  const rng = createRng(opts.seed);
  const cells = Array.from({ length: o.height }, () => new Array<number>(o.width).fill(ROCK));

  const rooms = placeRooms(rng, o);
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y]![x] = FLOOR;
  }
  for (const [a, b] of connections(rng, rooms, o.loopChance)) carveCorridor(rng, cells, a, b);

  const doors = findDoors(rng, cells, rooms, o.doorChance);
  const walls = buildWalls(cells, o.width, o.height, doors);
  return { seed: rng.seed, width: o.width, height: o.height, cells, rooms, walls };
}

// ---------------------------------------------------------------------------
// Stocking: what is in each room.

export interface RoomKey {
  roomId: number;
  title: string;
  description: string;
  encounter?: Encounter;
  trap?: string;
  loot?: LootResult;
}

const ROOM_FEATURES = [
  "Collapsed shelving and rotted crates line the walls.",
  "A cracked fountain trickles brackish water.",
  "Faded murals depict a forgotten coronation.",
  "Bones are piled neatly in one corner, sorted by size.",
  "Chains hang from the ceiling, swaying though there is no wind.",
  "A cold draft carries the smell of wet stone and smoke.",
  "Scorch marks radiate from the center of the floor.",
  "An overturned altar lies beneath a defaced holy symbol.",
  "Moss glows faintly blue along the cracks in the walls.",
  "Dozens of candle stubs have melted into a single waxy mound.",
  "A rusted portcullis mechanism dominates one wall.",
  "Spider webs thick as curtains divide the room.",
  "The floor is ankle-deep in murky water.",
  "A long dining table is set for a feast that never came.",
  "Crude tally marks cover every reachable surface.",
];

const TRAPS = [
  "Pressure plate: poison darts (DC 13 Dex save, 2d10 poison)",
  "Tripwire: collapsing ceiling (DC 15 Dex save, 4d10 bludgeoning)",
  "Hidden pit, 10 ft deep (DC 12 Perception to spot, 1d6 falling)",
  "Glyph on the door: fire burst (DC 14 Dex save, 3d8 fire)",
  "Swinging blade from the wall (+6 to hit, 2d10 slashing)",
  "Rune of sleep (DC 13 Wis save or unconscious 1 minute)",
];

export interface StockOptions {
  partyLevel: number;
  partySize?: number;
  /** Monster tag query for the whole dungeon, e.g. "goblinoid" or "undead". */
  tags?: string;
  catalog?: readonly MonsterEntry[];
  magicItems?: MagicItemPool;
  seed?: string | number;
}

export function stockDungeon(map: DungeonMap, opts: StockOptions): RoomKey[] {
  const rng = createRng(opts.seed ?? `${map.seed}:stock`);
  const base = { partyLevel: opts.partyLevel, partySize: opts.partySize ?? 4, tags: opts.tags, catalog: opts.catalog, magicItems: opts.magicItems };
  // The lair is the largest room that isn't the entrance.
  const bossRoom = map.rooms.slice(1).reduce<Room | undefined>((big, r) => (!big || r.w * r.h > big.w * big.h ? r : big), undefined);
  // Don't pack more creatures into a room than it can comfortably hold.
  const capFor = (r: Room) => Math.max(1, Math.min(base.partySize * 2, Math.floor((r.w * r.h) / 3)));

  return map.rooms.map((room) => {
    const key: RoomKey = { roomId: room.id, title: `Room ${room.id}`, description: rng.pick(ROOM_FEATURES) };
    const seed = `${rng.seed}:${room.id}`;
    if (room.id === 1) {
      key.title = "Room 1 — Entrance";
      return key;
    }
    if (room === bossRoom) {
      key.title = `Room ${room.id} — Lair`;
      key.encounter = generateEncounter({ ...base, difficulty: "high", template: rng.pick(["leader", "solo", "elite"] as const), maxCreatures: capFor(room), seed });
      key.loot = generateLoot({ cr: Math.max(...key.encounter.groups.map((g) => g.monster.cr), opts.partyLevel), mode: "hoard", magicItems: opts.magicItems, seed });
      return key;
    }
    if (rng.chance(0.45)) {
      const difficulty = rng.weighted([["low", 2], ["moderate", 3], ["high", 1]] as const);
      key.encounter = generateEncounter({ ...base, difficulty, maxCreatures: capFor(room), loot: rng.chance(0.6), seed });
    }
    if (rng.chance(0.2)) key.trap = rng.pick(TRAPS);
    return key;
  });
}

/** Text rendering for CLI/debugging. Doors are not shown. */
export function renderAscii(map: DungeonMap): string {
  const rows = map.cells.map((row) => row.map((c): string => (c === FLOOR ? "." : "#")));
  for (const r of map.rooms) {
    const label = String(r.id);
    const [cx, cy] = center(r);
    for (let i = 0; i < label.length && inRoom(r, cx + i, cy); i++) rows[cy]![cx + i] = label[i]!;
  }
  return rows.map((r) => r.join("")).join("\n");
}

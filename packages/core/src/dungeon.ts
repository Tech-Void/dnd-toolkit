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

/** A room or cave chamber. x/y/w/h is the bounding box; irregular chambers also list their cells. */
export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Floor cells [x, y] of an irregular chamber. Absent = every cell in the box. */
  cells?: [number, number][];
  /** Where the room's label and map note go. Absent = box center. */
  center?: [number, number];
  /** Behind a secret door. */
  hidden?: boolean;
}

export const roomCenter = (r: Room): [number, number] => r.center ?? [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];

export function roomCells(r: Room): [number, number][] {
  if (r.cells) return r.cells;
  const out: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
}

export const roomArea = (r: Room) => r.cells?.length ?? r.w * r.h;

export type MapStyle = "dungeon" | "cave";

/** A wall along cell edges, in grid units (multiply by grid size for pixels). */
export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  door: boolean;
  /** A secret door: looks like wall until found. */
  secret?: boolean;
}

export interface DungeonMap {
  seed: string;
  style: MapStyle;
  width: number;
  height: number;
  /** cells[y][x]: ROCK or FLOOR. */
  cells: number[][];
  rooms: Room[];
  walls: WallSegment[];
  /** Smoothed floor outlines in grid units (caves); the walls follow these. */
  outlines?: [number, number][][];
}

const center = roomCenter;
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
export function buildWalls(cells: number[][], width: number, height: number, doors: Set<string>): WallSegment[] {
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
  return { seed: rng.seed, style: "dungeon", width: o.width, height: o.height, cells, rooms, walls };
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
  /** Behind a secret door. */
  hidden?: boolean;
  /** Treasure lying somewhere in the room, for the players to find. */
  piles?: LootPile[];
}

export interface LootPile {
  cell: [number, number];
  /** Where it is and how it's hidden, for the GM. */
  note: string;
  /** DC to notice it (Wisdom (Perception) or Intelligence (Investigation)). */
  dc: number;
  loot: LootResult;
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

const CAVE_FEATURES = [
  "Stalactites drip steadily into a shallow, ice-cold pool.",
  "Pale fungus carpets the floor and glows when stepped on.",
  "A narrow fissure in the ceiling lets in a thin shaft of daylight.",
  "Old campfire ash and gnawed bones mark a recent camp.",
  "An underground stream cuts across the chamber, knee-deep and fast.",
  "Bats roost thickly overhead; loud noises send them swirling.",
  "Crystal veins in the walls catch and scatter any light.",
  "The floor slopes sharply; loose scree makes footing treacherous.",
  "Crude pictographs of hunters and a great serpent cover one wall.",
  "A sulfurous vent hisses warm, foul-smelling air.",
  "Webs choke the upper reaches of the chamber.",
  "Collapsed rock has half-buried an old mining cart.",
  "Mud pools bubble lazily; the air is thick and warm.",
  "Thick roots push through the ceiling from the forest above.",
];

const TRAPS = [
  "Pressure plate: poison darts (DC 13 Dex save, 2d10 poison)",
  "Tripwire: collapsing ceiling (DC 15 Dex save, 4d10 bludgeoning)",
  "Hidden pit, 10 ft deep (DC 12 Perception to spot, 1d6 falling)",
  "Glyph on the door: fire burst (DC 14 Dex save, 3d8 fire)",
  "Swinging blade from the wall (+6 to hit, 2d10 slashing)",
  "Rune of sleep (DC 13 Wis save or unconscious 1 minute)",
];

export type MonsterDensity = "few" | "some" | "many";
/** Share of ordinary rooms (not the entrance or lair) that get an encounter. */
const DENSITY: Record<MonsterDensity, number> = { few: 0.25, some: 0.45, many: 0.65 };

const PILE_SPOTS = {
  dungeon: [
    "under a loose flagstone", "in a rotted backpack beside a skeleton", "behind a loose brick in the wall",
    "wrapped in oilcloth beneath a collapsed shelf", "inside a cracked funerary urn", "in a false bottom of an empty crate",
    "sewn into the lining of a moldering cloak", "in a small iron box under the rubble",
  ],
  cave: [
    "tucked into a crevice", "buried under loose scree", "in a waterlogged pack wedged between rocks",
    "in a hollow beneath a stalagmite", "inside the ribcage of something long dead", "in a nest of old bones and rags",
    "under a flat stone someone clearly moved", "in a leather sack hanging in the dark above a ledge",
  ],
};

export interface StockOptions {
  partyLevel: number;
  partySize?: number;
  /** Monster tag query for the whole dungeon, e.g. "goblinoid" or "undead". */
  tags?: string;
  catalog?: readonly MonsterEntry[];
  magicItems?: MagicItemPool;
  /** How many rooms hold monsters. Default "some". */
  monsters?: MonsterDensity;
  /** Put treasure in findable piles (GM notes with a DC) instead of only listing it. */
  lootPiles?: boolean;
  /** Hoards hold unique forged magic items instead of standard ones. */
  uniqueItems?: boolean;
  seed?: string | number;
}

/** The lair is the largest room that isn't the entrance. */
export const lairRoom = (map: DungeonMap): Room | undefined =>
  map.rooms.slice(1).reduce<Room | undefined>((big, r) => (!big || roomArea(r) > roomArea(big) ? r : big), undefined);

/** Pick up to `count` rooms, keeping them apart so encounters don't pile up next to each other. */
function spreadOut(rng: Rng, rooms: Room[], count: number, avoid: Room[], minGap: number): Set<Room> {
  const picked = new Set<Room>();
  const far = (r: Room, gap: number) => [...picked, ...avoid].every((o) => dist(o, r) >= gap);
  for (const gap of [minGap, minGap * 0.6, 0]) {
    for (const r of rng.shuffle(rooms)) {
      if (picked.size >= count) return picked;
      if (!picked.has(r) && far(r, gap)) picked.add(r);
    }
  }
  return picked;
}

const isRock = (map: DungeonMap, x: number, y: number) => map.cells[y]?.[x] !== FLOOR;
const rockNear = (map: DungeonMap, x: number, y: number) => {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isRock(map, x + dx, y + dy)) n++;
  return n;
};

/**
 * Cells for a room's tokens, best first: away from the walls (no half-in-the-rock tokens) and spread
 * out so the first picks aren't shoulder to shoulder. Skips the room's label spot and `skip` cells.
 */
export function placementCells(map: DungeonMap, room: Room, seed: string | number, skip: [number, number][] = []): [number, number][] {
  const rng = createRng(seed);
  const [cx, cy] = roomCenter(room);
  const blocked = new Set([`${cx},${cy}`, ...skip.map(([x, y]) => `${x},${y}`)]);
  const cells = rng.shuffle(roomCells(room).filter(([x, y]) => !blocked.has(`${x},${y}`)));
  const inner = cells.filter(([x, y]) => rockNear(map, x, y) === 0);
  const edge = cells.filter(([x, y]) => rockNear(map, x, y) > 0);
  // First a pass that leaves a gap between picks, then everything else.
  const spaced: [number, number][] = [];
  for (const c of inner) if (spaced.every(([x, y]) => Math.max(Math.abs(x - c[0]), Math.abs(y - c[1])) > 1)) spaced.push(c);
  const rest = inner.filter((c) => !spaced.includes(c));
  return [...spaced, ...rest, ...edge];
}

/** A cell along the room's walls, where things get stashed. */
function stashCell(rng: Rng, map: DungeonMap, room: Room): [number, number] {
  const [cx, cy] = roomCenter(room);
  const cells = roomCells(room).filter(([x, y]) => x !== cx || y !== cy);
  const snug = cells.filter(([x, y]) => rockNear(map, x, y) >= 3);
  return rng.pick(snug.length ? snug : cells.length ? cells : [[cx, cy]]);
}

export function stockDungeon(map: DungeonMap, opts: StockOptions): RoomKey[] {
  const rng = createRng(opts.seed ?? `${map.seed}:stock`);
  const base = { partyLevel: opts.partyLevel, partySize: opts.partySize ?? 4, tags: opts.tags, catalog: opts.catalog, magicItems: opts.magicItems };
  const lair = lairRoom(map);
  const style = map.style === "cave" ? "cave" : "dungeon";
  const noun = style === "cave" ? "Chamber" : "Room";
  // Don't pack more creatures into a room than it can comfortably hold.
  const capFor = (r: Room) => Math.max(1, Math.min(base.partySize * 2, Math.floor(roomArea(r) / 6)));

  // Encounter rooms, spread across the map. Hidden rooms are mostly quiet; the entrance always is.
  const ordinary = map.rooms.filter((r) => r.id !== 1 && r !== lair && !r.hidden);
  const gap = Math.sqrt((map.width * map.height) / Math.max(1, map.rooms.length)) * 0.9;
  const fights = spreadOut(rng, ordinary, Math.round(ordinary.length * DENSITY[opts.monsters ?? "some"]), lair ? [lair] : [], gap);

  const pile = (room: Room, loot: LootResult): LootPile => ({
    cell: stashCell(rng, map, room),
    note: `${loot.mode === "hoard" ? "The hoard is" : "A small cache is"} ${rng.pick(PILE_SPOTS[style])}.`,
    dc: rng.int(10, 15),
    loot,
  });

  return map.rooms.map((room) => {
    const key: RoomKey = { roomId: room.id, title: `${noun} ${room.id}`, description: rng.pick(style === "cave" ? CAVE_FEATURES : ROOM_FEATURES) };
    const seed = `${rng.seed}:${room.id}`;
    if (room.id === 1) {
      key.title = `${noun} 1 — Entrance`;
      return key;
    }
    if (room === lair) {
      key.title = `${noun} ${room.id} — Lair`;
      key.encounter = generateEncounter({ ...base, difficulty: "high", template: rng.pick(["leader", "solo", "elite"] as const), maxCreatures: capFor(room), seed });
      key.loot = generateLoot({ cr: Math.max(...key.encounter.groups.map((g) => g.monster.cr), opts.partyLevel), mode: "hoard", magicItems: opts.magicItems, forge: opts.uniqueItems, seed });
      if (opts.lootPiles) key.piles = [pile(room, key.loot)];
      return key;
    }
    if (room.hidden) {
      key.title = `${noun} ${room.id} — Hidden`;
      key.hidden = true;
      key.description = `Behind a secret door (DC ${rng.int(13, 16)} Wisdom (Perception) or Intelligence (Investigation) to find). ${key.description}`;
      key.loot = generateLoot({ cr: opts.partyLevel, mode: "hoard", magicItems: opts.magicItems, forge: opts.uniqueItems, seed: `${seed}:hidden` });
      if (opts.lootPiles) key.piles = [pile(room, key.loot)];
      if (rng.chance(0.3)) key.encounter = generateEncounter({ ...base, difficulty: "moderate", maxCreatures: capFor(room), seed });
      return key;
    }
    if (fights.has(room)) {
      const difficulty = rng.weighted([["low", 2], ["moderate", 3], ["high", 1]] as const);
      key.encounter = generateEncounter({ ...base, difficulty, maxCreatures: capFor(room), loot: !opts.lootPiles && rng.chance(0.6), seed });
    }
    if (rng.chance(0.2)) key.trap = rng.pick(TRAPS);
    // Scattered caches: about one room in four, more often where something lives.
    if (opts.lootPiles && rng.chance(key.encounter ? 0.45 : 0.2)) {
      key.piles = [pile(room, generateLoot({ cr: opts.partyLevel, mode: "individual", magicItems: opts.magicItems, seed: `${seed}:pile` }))];
    }
    return key;
  });
}

/** Text rendering for CLI/debugging. Doors are not shown. */
export function renderAscii(map: DungeonMap): string {
  const rows = map.cells.map((row) => row.map((c): string => (c === FLOOR ? "." : "#")));
  for (const r of map.rooms) {
    const label = String(r.id);
    const [cx, cy] = center(r);
    for (let i = 0; i < label.length && map.cells[cy]?.[cx + i] === FLOOR; i++) rows[cy]![cx + i] = label[i]!;
  }
  return rows.map((r) => r.join("")).join("\n");
}

import { createRng, type Rng } from "./rng.ts";
import { buildWalls, FLOOR, lairRoom, roomCenter, type DungeonMap, type Room, type WallSegment } from "./dungeon.ts";

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Unit edge between two neighboring cells, as a wall segment. */
function edgeSegment([ax, ay]: [number, number], [bx, by]: [number, number]): Omit<WallSegment, "door"> {
  const x = Math.max(ax, bx);
  const y = Math.max(ay, by);
  return ax === bx ? { x1: ax, y1: y, x2: ax + 1, y2: y } : { x1: x, y1: ay, x2: x, y2: ay + 1 };
}

const edgeKey = (a: [number, number], b: [number, number]) => {
  const s = edgeSegment(a, b);
  return `${s.x1},${s.y1},${s.x2},${s.y2}`;
};

/**
 * Seal `count` dead-end rooms (or cave chambers) behind secret doors. A candidate is a one-square
 * opening whose closing cuts off a pocket holding at least one room, but not the entrance or lair.
 * Returns a new map; hidden rooms are flagged and the doors are walls with `secret: true`.
 */
export function addHiddenRooms(map: DungeonMap, count = 1, seed?: string | number): DungeonMap {
  const rng = createRng(seed ?? `${map.seed}:hidden`);
  const floor = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;
  const rock = (x: number, y: number) => !floor(x, y);
  const total = map.cells.flat().filter((c) => c === FLOOR).length;
  const entrance = map.rooms[0];
  const lair = lairRoom(map);
  if (!entrance) return map;
  const [ex, ey] = roomCenter(entrance);
  const cave = map.style === "cave";

  // One-square openings. Caves also need straight rock on both sides so the door meets the smoothed wall.
  const candidates: [[number, number], [number, number]][] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!floor(x, y)) continue;
      // Horizontal step (x,y) → (x+1,y) crosses the vertical line x+1; its ends are at y and y+1.
      if (floor(x + 1, y)) {
        const top = cave ? rock(x, y - 1) && rock(x + 1, y - 1) : rock(x, y - 1) || rock(x + 1, y - 1);
        const bottom = cave ? rock(x, y + 1) && rock(x + 1, y + 1) : rock(x, y + 1) || rock(x + 1, y + 1);
        if (top && bottom) candidates.push([[x, y], [x + 1, y]]);
      }
      if (floor(x, y + 1)) {
        const left = cave ? rock(x - 1, y) && rock(x - 1, y + 1) : rock(x - 1, y) || rock(x - 1, y + 1);
        const right = cave ? rock(x + 1, y) && rock(x + 1, y + 1) : rock(x + 1, y) || rock(x + 1, y + 1);
        if (left && right) candidates.push([[x, y], [x, y + 1]]);
      }
    }
  }

  const sealed = new Set<string>();
  const reachable = () => {
    const seen = new Set<string>([`${ex},${ey}`]);
    const queue: [number, number][] = [[ex, ey]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]!;
      for (const [dx, dy] of N4) {
        const n: [number, number] = [x + dx, y + dy];
        const k = `${n[0]},${n[1]}`;
        if (!floor(...n) || seen.has(k) || sealed.has(edgeKey([x, y], n))) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    return seen;
  };

  const walls = [...map.walls];
  const hidden = new Set<number>();
  for (let n = 0; n < count; n++) {
    const options: { edge: [[number, number], [number, number]]; rooms: number[]; size: number }[] = [];
    // Measure each pocket against what's reachable with the earlier secret doors already shut.
    const before = reachable().size;
    for (const edge of rng.shuffle(candidates)) {
      const key = edgeKey(...edge);
      if (sealed.has(key)) continue;
      sealed.add(key);
      const seen = reachable();
      sealed.delete(key);
      const cutOff = before - seen.size;
      if (cutOff < 6 || cutOff > total * 0.3) continue;
      const inside = map.rooms.filter((r) => !hidden.has(r.id) && !seen.has(roomCenter(r).join(",")));
      if (!inside.length || inside.includes(entrance) || (lair && inside.includes(lair))) continue;
      options.push({ edge, rooms: inside.map((r) => r.id), size: cutOff });
    }
    if (!options.length) {
      // No dead end to seal: rooms-and-corridors maps get a closet carved off a room instead.
      if (cave) break;
      const closet = carveCloset(rng, map, walls, [entrance.id, ...(lair ? [lair.id] : []), ...hidden]);
      if (!closet) break;
      ({ map } = closet);
      walls.splice(0, walls.length, ...closet.map.walls);
      hidden.add(closet.room.id);
      continue;
    }
    // Prefer pockets of one room, small rather than sprawling.
    options.sort((a, b) => a.rooms.length - b.rooms.length || a.size - b.size);
    const pick = rng.pick(options.slice(0, 3));
    sealed.add(edgeKey(...pick.edge));
    for (const id of pick.rooms) hidden.add(id);
    const seg = edgeSegment(...pick.edge);
    const existing = walls.findIndex((w) => w.door && w.x1 === seg.x1 && w.y1 === seg.y1 && w.x2 === seg.x2 && w.y2 === seg.y2);
    if (existing >= 0) walls[existing] = { ...walls[existing]!, secret: true };
    else walls.push({ ...seg, door: true, secret: true });
  }
  if (!hidden.size) return map;
  // (`map` may have grown a closet; its walls are already in `walls`.)
  return { ...map, walls, rooms: map.rooms.map((r) => (hidden.has(r.id) ? { ...r, hidden: true } : r)) };
}

/**
 * Carve a small closet beside a room, one square of rock away, joined by a one-square passage with
 * a secret door where it meets the room. Walls are rebuilt with the existing doors kept.
 */
function carveCloset(rng: Rng, map: DungeonMap, walls: WallSegment[], avoid: number[]): { map: DungeonMap; room: Room } | null {
  const rockAt = (x: number, y: number) => x >= 1 && y >= 1 && x < map.width - 1 && y < map.height - 1 && map.cells[y]![x] !== FLOOR;
  const clear = (x: number, y: number, w: number, h: number) => {
    for (let cy = y - 1; cy <= y + h; cy++) for (let cx = x - 1; cx <= x + w; cx++) if (!rockAt(cx, cy)) return false;
    return true;
  };
  for (const room of rng.shuffle(map.rooms.filter((r) => !avoid.includes(r.id) && !r.cells))) {
    for (const side of rng.shuffle(["n", "s", "e", "w"] as const)) {
      const [w, h] = rng.pick([[3, 3], [3, 4], [4, 3]] as const);
      // Closet one rock square away from the room, centered on a random spot along that side.
      const along = side === "n" || side === "s" ? rng.int(room.x, room.x + room.w - 1) : rng.int(room.y, room.y + room.h - 1);
      let x: number, y: number, passage: [number, number], inside: [number, number];
      if (side === "n") [x, y, passage, inside] = [along - 1, room.y - 1 - h, [along, room.y - 1], [along, room.y]];
      else if (side === "s") [x, y, passage, inside] = [along - 1, room.y + room.h + 1, [along, room.y + room.h], [along, room.y + room.h - 1]];
      else if (side === "w") [x, y, passage, inside] = [room.x - 1 - w, along - 1, [room.x - 1, along], [room.x, along]];
      else [x, y, passage, inside] = [room.x + room.w + 1, along - 1, [room.x + room.w, along], [room.x + room.w - 1, along]];
      // The passage square must be rock with rock either side, so the door is exactly one square wide.
      const [px, py] = passage;
      const sideways = side === "n" || side === "s" ? [[px - 1, py], [px + 1, py]] : [[px, py - 1], [px, py + 1]];
      if (!clear(x, y, w, h) || !rockAt(px, py) || !sideways.every(([sx, sy]) => rockAt(sx!, sy!))) continue;

      const cells = map.cells.map((row) => [...row]);
      for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) cells[cy]![cx] = FLOOR;
      cells[py]![px] = FLOOR;
      const doorKeys = new Set(walls.filter((wall) => wall.door).map((wall) => (wall.y1 === wall.y2 ? `h,${wall.x1},${wall.y1}` : `v,${wall.x1},${wall.y1}`)));
      const secret = side === "n" || side === "s"
        ? { x1: px, y1: Math.max(py, inside[1]), x2: px + 1, y2: Math.max(py, inside[1]) }
        : { x1: Math.max(px, inside[0]), y1: py, x2: Math.max(px, inside[0]), y2: py + 1 };
      doorKeys.add(secret.y1 === secret.y2 ? `h,${secret.x1},${secret.y1}` : `v,${secret.x1},${secret.y1}`);
      const secrets = walls.filter((wall) => wall.secret);
      const rebuilt = buildWalls(cells, map.width, map.height, doorKeys).map((wall) => {
        const isSecret = [...secrets, secret].some((s) => s.x1 === wall.x1 && s.y1 === wall.y1 && s.x2 === wall.x2 && s.y2 === wall.y2);
        return wall.door && isSecret ? { ...wall, secret: true } : wall;
      });
      const newRoom: Room = { id: Math.max(...map.rooms.map((r) => r.id)) + 1, x, y, w, h, hidden: true };
      return { map: { ...map, cells, walls: rebuilt, rooms: [...map.rooms, newRoom] }, room: newRoom };
    }
  }
  return null;
}

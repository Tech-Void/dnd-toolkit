import { createRng, type Rng } from "./rng.ts";
import { FLOOR, roomCells, type DungeonMap, type LootPile, type Room, type RoomKey, type WallSegment } from "./dungeon.ts";
import { emptyLoot, type LootItem } from "./loot.ts";

// ---------------------------------------------------------------------------
// Locked, stuck and barred doors, and the keys that open them. Keys are always somewhere the party
// can reach without going through the door they open.

export type LockKind = "locked" | "stuck" | "barred" | "arcane";

export interface DoorLock {
  kind: LockKind;
  /** Thieves' tools DC (locked and arcane doors). */
  pickDc?: number;
  /** Strength (Athletics) DC to force it open. */
  forceDc: number;
  /** The key that opens it (an item), or the password (arcane). */
  key?: string;
  /** Where the key is, for the GM. */
  keyAt?: string;
  /** Room ids either side of the door (0 = corridor). */
  rooms: [number, number];
  /** Barred doors: the room whose side the bar is on; it lifts freely from there. */
  barSide?: number;
  /** Barred doors: the bar's side in words ("inside"), instead of a room. */
  barredFrom?: string;
}

export type LockAmount = "none" | "few" | "some" | "many";
const SHARE: Record<LockAmount, number> = { none: 0, few: 0.15, some: 0.3, many: 0.5 };

export interface LockOptions {
  /** How many doors are locked, stuck or barred. Default "some". */
  amount?: LockAmount;
  partyLevel?: number;
  seed?: string | number;
}

export const LOCK_LABEL: Record<LockKind, string> = { locked: "Locked", stuck: "Stuck", barred: "Barred", arcane: "Arcane lock" };

const KEY_METALS = ["iron", "brass", "bronze", "blackened iron", "copper", "silver", "bone", "rusted iron", "verdigris-green", "tin"];
const KEY_LOOKS = [
  "with a skull-shaped bow", "on a loop of red string", "with three teeth", "stamped with a crown", "with a tag reading \"cellar\"",
  "as long as a hand", "with a bow shaped like a coiled snake", "wrapped in a scrap of cloth", "with a broken-off ring", "tied to a wooden tag scratched with a rune",
  "with a tiny bell on its ring", "set with a chip of red glass",
];
const PASSWORDS = ["Ashes", "Nine Lanterns", "Velenmor", "Quiet Water", "Thorn and Crown", "Ever-Dawn", "Gallowglass", "Seventh Seal", "Mother of Moths", "Ironwake", "Saltmarrow", "Hollow King"];
const KEY_SPOTS = [
  "hangs from a nail beside the hearth", "lies under a loose stone in the corner", "is tucked inside an empty boot",
  "sits at the bottom of a cracked jug", "hangs on a hook behind a rotted tapestry", "is wedged in a crack above the door frame",
  "is hidden in a hollowed-out book", "lies in the dust under an overturned table",
];
const PASSWORD_SPOTS = [
  "is scratched into the underside of a table", "is written in chalk inside the hearth", "is carved, tiny, into a skull on the shelf",
  "is the last line of a diary lying here", "is embroidered into a moth-eaten banner", "is painted on the ceiling, only visible lying down",
];
const STUCK_WHY = ["swollen with damp", "warped in its frame", "rusted on its hinges", "jammed by fallen rubble on the far side"];

/** The lock in words, for the room key and the map pin. */
export function lockText(l: DoorLock): string {
  const force = `Force it: DC ${l.forceDc} Strength (Athletics).`;
  switch (l.kind) {
    case "locked":
      return `Locked. Pick it: DC ${l.pickDc} with thieves' tools. ${force}${l.key ? ` Key: ${l.key}${l.keyAt ? ` (${l.keyAt})` : ""}.` : " Its key is long lost."}`;
    case "stuck":
      return `Stuck. ${force} Failing by 5 or more makes enough noise to alert anything nearby.`;
    case "barred":
      return `Barred from ${l.barredFrom ?? `the ${l.barSide === undefined ? "far" : l.barSide ? `Room ${l.barSide}` : "corridor"} side`}, where the bar lifts freely. Break it down: DC ${l.forceDc} Strength (Athletics).`;
    case "arcane":
      return `Sealed by an arcane lock. Pick it: DC ${l.pickDc}. ${force} Knock or dispel magic opens it.${l.key ? ` Password: "${l.key}"${l.keyAt ? ` (${l.keyAt})` : ""}.` : ""}`;
  }
}

/** Short label for a map pin: "Locked (DC 15)". */
export const lockPin = (l: DoorLock) => `${LOCK_LABEL[l.kind]} (DC ${l.pickDc ?? l.forceDc})`;

/** The two cells either side of a door segment. */
export function doorCells(w: WallSegment): [[number, number], [number, number]] {
  return w.y1 === w.y2 ? [[w.x1, w.y1 - 1], [w.x1, w.y1]] : [[w.x1 - 1, w.y1], [w.x1, w.y1]];
}

const roomAt = (map: DungeonMap, x: number, y: number): Room | undefined =>
  map.rooms.find((r) => (r.cells ? r.cells.some(([cx, cy]) => cx === x && cy === y) : x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h));

const edgeOf = (w: WallSegment) => (w.y1 === w.y2 ? `h,${w.x1},${w.y1}` : `v,${w.x1},${w.y1}`);

/** Flood-fill floor from `start`, not crossing the blocked door edges. */
function flood(map: DungeonMap, start: [number, number], blocked: Set<string>): Set<string> {
  const seen = new Set([`${start[0]},${start[1]}`]);
  const queue = [start];
  const floor = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    const steps: [number, number, string][] = [[x + 1, y, `v,${x + 1},${y}`], [x - 1, y, `v,${x},${y}`], [x, y + 1, `h,${x},${y + 1}`], [x, y - 1, `h,${x},${y}`]];
    for (const [nx, ny, edge] of steps) {
      const k = `${nx},${ny}`;
      if (!floor(nx, ny) || seen.has(k) || blocked.has(edge)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** A cell along the room's walls, where a key gets stashed. */
function stash(rng: Rng, map: DungeonMap, room: Room): [number, number] {
  const cells = roomCells(room);
  const snug = cells.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => map.cells[y + dy!]?.[x + dx!] !== FLOOR).length >= 2);
  return rng.pick(snug.length ? snug : cells);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Lock some of a stocked dungeon's doors. Locked doors usually have a key, placed in a room the party
 * can reach without passing that door: carried by a room's monsters, added to a loot pile, or
 * stashed somewhere in a quiet room. Secret doors are left alone. Returns new copies of the map and key.
 */
export function lockDoors(map: DungeonMap, keys: readonly RoomKey[], opts: LockOptions = {}): { map: DungeonMap; keys: RoomKey[] } {
  const rng = createRng(opts.seed ?? `${map.seed}:locks`);
  const level = opts.partyLevel ?? 3;
  const walls = map.walls.map((w) => ({ ...w }));
  const out: RoomKey[] = structuredClone([...keys]) as RoomKey[];
  const amount = opts.amount ?? "some";
  const doors = walls.filter((w) => w.door && !w.secret);
  if (!doors.length || amount === "none") return { map: { ...map, walls }, keys: out };

  const keyFor = (id: number) => out.find((k) => k.roomId === id);
  const sides = (w: WallSegment): [number, number] => doorCells(w).map(([x, y]) => roomAt(map, x, y)?.id ?? 0) as [number, number];
  const entrance = map.rooms.find((r) => r.id === 1) ?? map.rooms[0];
  const start = entrance ? roomCells(entrance)[0]! : ([0, 0] as [number, number]);

  // Doors worth locking: into the lair, into rooms with treasure; less often at the entrance.
  const weight = (w: WallSegment) => {
    const [a, b] = sides(w);
    let wgt = 1;
    for (const id of [a, b]) {
      const k = keyFor(id);
      if (!k) continue;
      if (/Lair/.test(k.title)) wgt += 3;
      if (k.piles?.length || k.loot) wgt += 1.5;
      if (id === 1) wgt *= 0.4;
    }
    return wgt;
  };
  const count = Math.max(1, Math.round(doors.length * SHARE[amount]));
  const pool = doors.map((w) => [w, weight(w)] as [WallSegment, number]);
  const chosen: WallSegment[] = [];
  while (chosen.length < count && pool.length) {
    const w = rng.weighted(pool);
    chosen.push(w);
    pool.splice(pool.findIndex(([d]) => d === w), 1);
  }

  const metals = rng.shuffle(KEY_METALS);
  const passwords = rng.shuffle(PASSWORDS);
  const blocking = new Set<string>();
  const pickBase = rng.pick([12, 13, 15, 15, 16, 17]) + (level >= 11 ? 3 : level >= 5 ? 1 : 0);

  for (const door of chosen) {
    const kind = rng.weighted([["locked", 5], ["stuck", 3], ["barred", 2], ["arcane", level >= 5 ? 1 : 0]] as const);
    const rooms = sides(door);
    const pickDc = pickBase + rng.int(-1, 2);
    const lock: DoorLock = { kind, rooms, forceDc: 0 };
    door.lock = lock;

    // Which side is "behind" the door: the side that's cut off (or farther) when the door is shut.
    const edge = edgeOf(door);
    const reach = flood(map, start, new Set([...blocking, edge]));
    const [c0, c1] = doorCells(door);
    // Otherwise it guards the room, not the corridor.
    const behind = !reach.has(`${c1[0]},${c1[1]}`) ? rooms[1] : !reach.has(`${c0[0]},${c0[1]}`) ? rooms[0]
      : !rooms[0] ? rooms[1] : !rooms[1] ? rooms[0] : rooms[rng.int(0, 1)];
    const front = behind === rooms[0] ? rooms[1] : rooms[0];

    if (kind === "stuck") {
      lock.forceDc = rng.int(10, 14) + (level >= 11 ? 2 : 0);
      const why = rng.pick(STUCK_WHY);
      notes(keyFor(front), `Door to ${place(behind)}: ${lockText(lock)} It's ${why}.`);
      notes(keyFor(behind), `Door to ${place(front)}: ${lockText(lock)} It's ${why}.`);
      continue;
    }
    if (kind === "barred") {
      lock.forceDc = rng.int(18, 22);
      lock.barSide = behind;
      notes(keyFor(behind), `Door to ${place(front)}: a heavy bar holds it shut from this side; lifting it is free.`);
      notes(keyFor(front), `Door to ${place(behind)}: ${lockText(lock)}`);
      continue;
    }
    lock.pickDc = kind === "arcane" ? pickDc + 10 : pickDc;
    lock.forceDc = kind === "arcane" ? pickDc + 10 : pickDc + rng.int(1, 4);

    // A key (or a password) somewhere reachable with this door and every earlier keyed door shut.
    if (kind === "arcane" || rng.chance(0.75)) {
      blocking.add(edge);
      const open = flood(map, start, blocking);
      const reachable = map.rooms.filter((r) => r.id !== behind && roomCells(r).some(([x, y]) => open.has(`${x},${y}`)));
      const spots = reachable.map((r) => {
        const k = keyFor(r.id);
        return [r, (k?.encounter ? 3 : 0) + (k?.piles?.length ? 2 : 0) + (r.id === 1 ? 0.3 : 1)] as [Room, number];
      });
      if (spots.length) {
        const room = rng.weighted(spots);
        const k = keyFor(room.id);
        const target = place(behind);
        if (kind === "arcane") {
          lock.key = passwords.pop() ?? rng.pick(PASSWORDS);
          lock.keyAt = `Room ${room.id}`;
          notes(k, `The password to the arcane lock on ${target}, "${lock.key}", ${rng.pick(PASSWORD_SPOTS)}.`);
        } else {
          const metal = metals.pop() ?? rng.pick(KEY_METALS);
          const item: LootItem = { name: `${cap(metal)} key`, kind: "key", quantity: 1, valueGp: 0, note: `A ${metal} key ${rng.pick(KEY_LOOKS)}. It opens the locked door into ${target}.` };
          lock.key = `the ${metal} key`;
          lock.keyAt = `Room ${room.id}`;
          const leader = k?.encounter?.groups[0];
          if (leader && rng.chance(0.65)) {
            notes(k, `The ${leader.name.toLowerCase()} carries ${lock.key} (opens ${target}).`);
            lock.keyAt += `, carried by the ${leader.name.toLowerCase()}`;
            // It drops with the rest of the creature's treasure (or alone, if it has none).
            (k!.encounter!.loot ??= emptyLoot(`${rng.seed}:carried:${room.id}`)).items.push(item);
          } else if (k?.piles?.length) {
            k.piles[0]!.loot.items.push(item);
            notes(k, `The loot pile here holds ${lock.key} (opens ${target}).`);
          } else if (k) {
            const spot = rng.pick(KEY_SPOTS);
            const pile: LootPile = { cell: stash(rng, map, room), note: `The ${metal} key ${spot}.`, dc: rng.int(8, 13), loot: emptyLoot(`${rng.seed}:key:${room.id}`) };
            pile.loot.items.push(item);
            (k.piles ??= []).push(pile);
            notes(k, `${cap(lock.key)} (opens ${target}) ${spot}.`);
          }
        }
      } else {
        blocking.delete(edge);
      }
    }
    const text = lockText(lock);
    notes(keyFor(front), `Door to ${place(behind)}: ${text}`);
    notes(keyFor(behind), `Door to ${place(front)}: ${text} From this side it opens freely.`);
  }
  return { map: { ...map, walls }, keys: out };
}

const place = (roomId: number) => (roomId ? `Room ${roomId}` : "the corridor");

function notes(k: RoomKey | undefined, line: string) {
  if (k) (k.notes ??= []).push(line);
}

import { describe, expect, it } from "vitest";
import {
  addHiddenRooms,
  FLOOR,
  generateCave,
  generateDungeon,
  lairRoom,
  lightDungeon,
  placementCells,
  roomCenter,
  roomCells,
  stockDungeon,
  type DungeonMap,
} from "../src/index.ts";

/** Floor reachable from the entrance with secret doors shut. */
function reachable(map: DungeonMap): Set<string> {
  const secret = new Set(map.walls.filter((w) => w.secret).map((w) => `${w.x1},${w.y1},${w.x2},${w.y2}`));
  const crosses = (a: [number, number], b: [number, number]) => {
    const x = Math.max(a[0], b[0]);
    const y = Math.max(a[1], b[1]);
    return secret.has(a[0] === b[0] ? `${a[0]},${y},${a[0] + 1},${y}` : `${x},${a[1]},${x},${a[1] + 1}`);
  };
  const [sx, sy] = roomCenter(map.rooms[0]!);
  const seen = new Set([`${sx},${sy}`]);
  const queue: [number, number][] = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n: [number, number] = [x + dx, y + dy];
      if (map.cells[n[1]]?.[n[0]] !== FLOOR || seen.has(n.join(",")) || crosses([x, y], n)) continue;
      seen.add(n.join(","));
      queue.push(n);
    }
  }
  return seen;
}

describe("hidden rooms", () => {
  it("seals rooms behind secret doors, never the entrance or lair", () => {
    let found = 0;
    for (let i = 0; i < 20; i++) {
      for (const base of [generateDungeon({ seed: `h${i}` }), generateCave({ seed: `h${i}` })]) {
        const map = addHiddenRooms(base, 2);
        const hidden = map.rooms.filter((r) => r.hidden);
        if (!hidden.length) continue;
        found++;
        expect(map.walls.filter((w) => w.secret).length).toBeGreaterThan(0);
        expect(hidden).not.toContainEqual(expect.objectContaining({ id: 1 }));
        expect(hidden.map((r) => r.id)).not.toContain(lairRoom(map)!.id);
        // Shut the secret doors and the hidden rooms can't be reached; everything else can.
        const seen = reachable(map);
        for (const r of map.rooms) expect(seen.has(roomCenter(r).join(","))).toBe(!r.hidden);
      }
    }
    expect(found).toBeGreaterThan(20);
  });

  it("always finds room for one in a rooms-and-corridors dungeon, carving a closet if needed", () => {
    for (let i = 0; i < 30; i++) {
      const map = addHiddenRooms(generateDungeon({ seed: `c${i}` }), 1);
      const hidden = map.rooms.filter((r) => r.hidden);
      expect(hidden.length).toBeGreaterThan(0);
      const seen = reachable(map);
      for (const r of map.rooms) expect(seen.has(roomCenter(r).join(","))).toBe(!r.hidden);
      // Still every door a real one-square door.
      for (const w of map.walls.filter((wall) => wall.door)) expect(Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1)).toBe(1);
    }
  });

  it("leaves the map alone when asked for none", () => {
    const map = generateDungeon({ seed: "none" });
    expect(addHiddenRooms(map, 0)).toBe(map);
  });
});

describe("stocking", () => {
  it("spreads encounters out and honors the density", () => {
    let few = 0;
    let many = 0;
    for (let i = 0; i < 20; i++) {
      const map = generateDungeon({ seed: `s${i}`, maxRooms: 14 });
      few += stockDungeon(map, { partyLevel: 4, monsters: "few" }).filter((k) => k.encounter).length;
      many += stockDungeon(map, { partyLevel: 4, monsters: "many" }).filter((k) => k.encounter).length;
    }
    expect(many).toBeGreaterThan(few * 1.6);
  });

  it("makes findable loot piles with notes, including in hidden rooms", () => {
    for (let i = 0; i < 10; i++) {
      const map = addHiddenRooms(generateDungeon({ seed: `p${i}` }), 1);
      const keys = stockDungeon(map, { partyLevel: 5, lootPiles: true });
      const lair = keys.find((k) => k.title.endsWith("Lair"))!;
      expect(lair.piles?.[0]?.loot.mode).toBe("hoard");
      for (const k of keys) {
        const room = map.rooms.find((r) => r.id === k.roomId)!;
        if (room.hidden) expect(k.hidden && k.piles?.length).toBeTruthy();
        for (const p of k.piles ?? []) {
          expect(roomCells(room)).toContainEqual(p.cell);
          expect(p.note).toMatch(/\.$/);
          expect(p.dc).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });
});

describe("placementCells", () => {
  it("puts tokens away from walls first, spread apart", () => {
    const map = generateCave({ seed: "place" });
    const room = map.rooms.reduce((a, b) => (roomCells(b).length > roomCells(a).length ? b : a));
    const cells = placementCells(map, room, "x");
    expect(cells.length).toBe(roomCells(room).length - 1);
    const rockNear = ([x, y]: [number, number]) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => map.cells[y + dy]?.[x + dx] !== FLOOR));
    expect(cells.slice(0, 4).some(rockNear)).toBe(false);
    const [a, b] = cells;
    expect(Math.max(Math.abs(a![0] - b![0]), Math.abs(a![1] - b![1]))).toBeGreaterThan(1);
  });
});

describe("lightDungeon", () => {
  it("lights dungeons and caves to taste, and keeps hidden rooms dark", () => {
    for (let i = 0; i < 8; i++) {
      const dungeon = addHiddenRooms(generateDungeon({ seed: `l${i}` }), 1);
      const keys = stockDungeon(dungeon, { partyLevel: 3 });
      expect(lightDungeon(dungeon, keys, { amount: "none" })).toEqual([]);
      const sparse = lightDungeon(dungeon, keys, { amount: "sparse" });
      const lit = lightDungeon(dungeon, keys, { amount: "lit" });
      expect(lit.length).toBeGreaterThan(sparse.length);
      expect(lit.some((l) => l.kind === "brazier")).toBe(true);
      for (const r of dungeon.rooms.filter((room) => room.hidden)) {
        expect(lit.some((l) => l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h)).toBe(false);
      }
      const cave = generateCave({ seed: `l${i}` });
      const caveLights = lightDungeon(cave, stockDungeon(cave, { partyLevel: 3 }), { amount: "sparse" });
      expect(caveLights.some((l) => l.kind === "daylight")).toBe(true);
      expect(caveLights.every((l) => l.kind !== "torch")).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { createRng, FLOOR, generateDungeon, generateHook, generateLoot, stockDungeon, tierForCr } from "../src/index.ts";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = createRng("abc");
    const b = createRng("abc");
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("rolls dice within bounds", () => {
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      const r = rng.roll("2d6+3");
      expect(r).toBeGreaterThanOrEqual(5);
      expect(r).toBeLessThanOrEqual(15);
    }
    expect(rng.roll("1d1*100")).toBe(100);
    expect(rng.roll("7")).toBe(7);
    expect(() => rng.roll("banana")).toThrow();
  });
});

describe("loot", () => {
  it("maps CR to tier", () => {
    expect([0, 4, 5, 10, 11, 16, 17, 30].map(tierForCr)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("is reproducible and totals correctly", () => {
    const a = generateLoot({ cr: 12, mode: "hoard", seed: "x" });
    expect(generateLoot({ cr: 12, mode: "hoard", seed: "x" })).toEqual(a);
    expect(a.totalValueGp).toBeGreaterThan(0);
    expect(a.items.length).toBeGreaterThan(0);
  });
});

describe("dungeon", () => {
  const map = generateDungeon({ seed: "test", width: 40, height: 30 });

  it("places rooms inside bounds", () => {
    expect(map.rooms.length).toBeGreaterThan(3);
    for (const r of map.rooms) {
      expect(r.x).toBeGreaterThanOrEqual(1);
      expect(r.y).toBeGreaterThanOrEqual(1);
      expect(r.x + r.w).toBeLessThanOrEqual(map.width - 1);
      expect(r.y + r.h).toBeLessThanOrEqual(map.height - 1);
    }
  });

  it("connects every floor cell", () => {
    const start = map.rooms[0]!;
    const seen = new Set<string>();
    const stack: [number, number][] = [[start.x, start.y]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const k = `${x},${y}`;
      if (seen.has(k) || map.cells[y]?.[x] !== FLOOR) continue;
      seen.add(k);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    const floorCount = map.cells.flat().filter((c) => c === FLOOR).length;
    expect(seen.size).toBe(floorCount);
  });

  it("produces axis-aligned unit-grid walls", () => {
    expect(map.walls.length).toBeGreaterThan(0);
    for (const w of map.walls) expect(w.x1 === w.x2 || w.y1 === w.y2).toBe(true);
  });

  it("stocks every room", () => {
    const keys = stockDungeon(map, { partyLevel: 5 });
    expect(keys.map((k) => k.roomId)).toEqual(map.rooms.map((r) => r.id));
    expect(keys.some((k) => k.loot?.mode === "hoard")).toBe(true);
    expect(keys.some((k) => k.encounter)).toBe(true);
  });
});

describe("hooks", () => {
  it("respects tone and is reproducible", () => {
    const h = generateHook({ seed: "h", tone: "horror", partyLevel: 5 });
    expect(h.tone).toBe("horror");
    expect(generateHook({ seed: "h", tone: "horror", partyLevel: 5 })).toEqual(h);
  });
});

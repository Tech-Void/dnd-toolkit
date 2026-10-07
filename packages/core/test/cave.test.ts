import { describe, expect, it } from "vitest";
import { FLOOR, generateCave, roomArea, roomCenter, stockDungeon } from "../src/index.ts";

describe("generateCave", () => {
  const cave = generateCave({ seed: "test-cave" });
  const floor = cave.cells.flatMap((row, y) => row.map((c, x) => [x, y, c] as const)).filter(([, , c]) => c === FLOOR);

  it("is reproducible", () => {
    expect(generateCave({ seed: "test-cave" })).toEqual(cave);
  });

  it("is one connected cave of reasonable density", () => {
    const seen = new Set<string>();
    const stack: [number, number][] = [[floor[0]![0], floor[0]![1]]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const k = `${x},${y}`;
      if (seen.has(k) || cave.cells[y]?.[x] !== FLOOR) continue;
      seen.add(k);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    expect(seen.size).toBe(floor.length);
    const density = floor.length / (cave.width * cave.height);
    expect(density).toBeGreaterThan(0.3);
    expect(density).toBeLessThan(0.65);
  });

  it("partitions every floor cell into exactly one chamber", () => {
    expect(cave.rooms.length).toBeGreaterThanOrEqual(4);
    expect(cave.rooms.reduce((s, r) => s + roomArea(r), 0)).toBe(floor.length);
    for (const r of cave.rooms) {
      const [cx, cy] = roomCenter(r);
      expect(cave.cells[cy]![cx]).toBe(FLOOR);
      expect(r.cells!.some(([x, y]) => x === cx && y === cy)).toBe(true);
    }
  });

  it("has no doors and stocks like a dungeon", () => {
    expect(cave.walls.some((w) => w.door)).toBe(false);
    const keys = stockDungeon(cave, { partyLevel: 4 });
    expect(keys[0]!.title).toBe("Chamber 1 — Entrance");
    expect(keys.some((k) => k.title.endsWith("Lair"))).toBe(true);
  });
});

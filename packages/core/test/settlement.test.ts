import { describe, expect, it } from "vitest";
import { generateTown, QUEST_TYPES } from "../src/index.ts";

describe("generateTown", () => {
  it("is reproducible", () => {
    expect(generateTown({ seed: "same", size: "village" })).toEqual(generateTown({ seed: "same", size: "village" }));
  });

  it("scales with size and puts every place in a real building", () => {
    const expected: Record<string, [number, number]> = { hamlet: [1, 1], village: [2, 3], town: [4, 5], city: [5, 7] };
    for (const size of ["hamlet", "village", "town", "city"] as const) {
      for (let i = 0; i < 6; i++) {
        const t = generateTown({ size, seed: `${size}${i}` });
        const [min, max] = expected[size]!;
        expect(t.shops.length).toBeGreaterThanOrEqual(min);
        expect(t.shops.length).toBeLessThanOrEqual(max);
        expect(t.name.length).toBeGreaterThan(3);
        expect(t.leader.name).toBeTruthy();
        expect(t.rumors.length).toBeGreaterThanOrEqual(3);
        expect(QUEST_TYPES.map(([id]) => id)).toContain(t.trouble.archetype);
        const ids = new Set(t.map.buildings!.map((b) => b.id));
        for (const p of t.places) {
          expect(ids.has(p.buildingId)).toBe(true);
          expect(t.map.buildings!.find((b) => b.id === p.buildingId)!.kind).toBe(p.kind);
        }
        expect(t.places.map((p) => p.kind)).toEqual(expect.arrayContaining(["temple", "inn"]));
        expect(new Set(t.places.map((p) => p.buildingId)).size).toBe(t.places.length);
      }
    }
  });

  it("gives town maps walls, doors and windows for every building", () => {
    const t = generateTown({ size: "town", seed: "walls" });
    const doors = t.map.walls.filter((w) => w.door);
    const windows = t.map.walls.filter((w) => w.window);
    expect(doors.length).toBe(t.map.buildings!.length);
    expect(windows.length).toBe(t.map.buildings!.length);
  });
});

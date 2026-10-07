import { describe, expect, it } from "vitest";
import { BATTLEMAP_SETTINGS, generateBattlemap, reachableCells, type BattlemapSetting } from "../src/index.ts";

const SETTINGS = Object.keys(BATTLEMAP_SETTINGS) as BattlemapSetting[];

describe("generateBattlemap", () => {
  it("is reproducible", () => {
    for (const setting of SETTINGS) expect(generateBattlemap({ setting, seed: "same" })).toEqual(generateBattlemap({ setting, seed: "same" }));
  });

  it("lets the party reach every enemy start cell, in every setting and size", () => {
    for (const setting of SETTINGS) {
      for (const size of ["small", "medium", "large"] as const) {
        for (let i = 0; i < 6; i++) {
          const m = generateBattlemap({ setting, size, seed: `${setting}${size}${i}` });
          expect(m.zones.party.length).toBeGreaterThan(0);
          expect(m.zones.enemies.length).toBeGreaterThan(3);
          const reach = reachableCells(m, m.zones.party);
          for (const [x, y] of m.zones.enemies) expect(reach.has(`${x},${y}`)).toBe(true);
        }
      }
    }
  });

  it("keeps props on the map and off each other", () => {
    for (const setting of SETTINGS) {
      for (let i = 0; i < 6; i++) {
        const m = generateBattlemap({ setting, size: "small", seed: `p${i}` });
        const taken = new Set<string>();
        for (const p of m.props) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x + p.w).toBeLessThanOrEqual(m.width);
          expect(p.y + p.h).toBeLessThanOrEqual(m.height);
          if (p.kind === "rug") continue;
          for (let y = p.y; y < p.y + p.h; y++) {
            for (let x = p.x; x < p.x + p.w; x++) {
              expect(taken.has(`${x},${y}`)).toBe(false);
              taken.add(`${x},${y}`);
              expect(m.ground[y]![x]).not.toBe("rock");
            }
          }
        }
        // Nobody starts inside furniture.
        for (const [x, y] of [...m.zones.party, ...m.zones.enemies]) expect(taken.has(`${x},${y}`)).toBe(false);
      }
    }
  });

  it("gives buildings doors and caves darkness with some light", () => {
    for (let i = 0; i < 5; i++) {
      for (const setting of ["shop", "tavern"] as const) {
        const m = generateBattlemap({ setting, seed: `b${i}` });
        expect(m.walls.some((w) => w.door)).toBe(true);
        expect(m.walls.some((w) => w.window)).toBe(true);
        expect(m.lights.length).toBeGreaterThan(0);
        // Enemies start indoors, not in the street.
        for (const [, y] of m.zones.enemies) expect(y).toBeLessThan(m.height - 3);
      }
      const cave = generateBattlemap({ setting: "cave", seed: `c${i}` });
      expect(cave.darkness).toBe(1);
      // Rounded rock faces: the walls follow the smoothed outline, off the grid lines.
      expect(cave.outlines!.length).toBeGreaterThan(0);
      expect(cave.walls.some((w) => !Number.isInteger(w.x1))).toBe(true);
      expect(cave.lights.length).toBeGreaterThan(0);
    }
  });

  it("darkens outdoor maps at night", () => {
    expect(generateBattlemap({ setting: "clearing", seed: "n" }).darkness).toBe(0);
    expect(generateBattlemap({ setting: "clearing", night: true, seed: "n" }).darkness).toBeGreaterThan(0.5);
  });

  it("uses a given title and picks a setting at random", () => {
    expect(generateBattlemap({ setting: "shop", title: "Ye Olde Shoppe", seed: "t" }).title).toBe("Ye Olde Shoppe");
    const picked = new Set(Array.from({ length: 30 }, (_, i) => generateBattlemap({ setting: "random", size: "small", seed: `r${i}` }).setting));
    expect(picked.size).toBeGreaterThan(3);
  });
});

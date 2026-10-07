import { describe, expect, it } from "vitest";
import { FLOOR, floorOutlines, generateCave, generateDungeon, smoothLoop, type Point } from "../src/index.ts";

/** Shoelace area; positive for loops that run clockwise on screen (y down). */
const area = (loop: Point[]) => loop.reduce((s, [x1, y1], i) => {
  const [x2, y2] = loop[(i + 1) % loop.length]!;
  return s + (x1 * y2 - x2 * y1);
}, 0) / 2;

const floorCount = (cells: number[][]) => cells.flat().filter((c) => c === FLOOR).length;

describe("floorOutlines", () => {
  it("traces a single cell as a square", () => {
    expect(floorOutlines([[0, 0, 0], [0, 1, 0], [0, 0, 0]])).toEqual([[[1, 1], [2, 1], [2, 2], [1, 2]]]);
  });

  it("keeps corner-touching floor as separate loops and holes as their own loops", () => {
    expect(floorOutlines([[1, 0], [0, 1]])).toHaveLength(2);
    const ring = [[1, 1, 1], [1, 0, 1], [1, 1, 1]];
    const loops = floorOutlines(ring);
    expect(loops).toHaveLength(2);
    expect(loops.reduce((s, l) => s + area(l), 0)).toBe(8);
  });

  it("encloses exactly the floor of real maps", () => {
    for (let i = 0; i < 10; i++) {
      for (const map of [generateCave({ seed: `o${i}` }), generateDungeon({ seed: `o${i}` })]) {
        const loops = floorOutlines(map.cells);
        expect(loops.reduce((s, l) => s + area(l), 0)).toBe(floorCount(map.cells));
      }
    }
  });
});

describe("smoothed cave walls", () => {
  it("round the corners but stay close to the cell edges", () => {
    const square: Point[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const round = smoothLoop(square, 2);
    expect(round.length).toBe(16);
    for (const [x, y] of round) expect(Math.min(x, 4 - x, y, 4 - y)).toBeLessThanOrEqual(0.5);
  });

  it("gives caves closed, smooth walls with no doors", () => {
    const cave = generateCave({ seed: "smooth" });
    expect(cave.outlines!.length).toBeGreaterThan(0);
    expect(cave.walls.length).toBe(cave.outlines!.reduce((s, l) => s + l.length, 0));
    expect(cave.walls.some((w) => w.door)).toBe(false);
    // Off-grid points prove the corners were cut.
    expect(cave.walls.some((w) => !Number.isInteger(w.x1) || !Number.isInteger(w.y1))).toBe(true);
  });
});

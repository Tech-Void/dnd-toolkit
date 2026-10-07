import { FLOOR, type WallSegment } from "./dungeon.ts";

export type Point = [number, number];

/**
 * Closed outlines around the floor, in grid units, following cell edges. Each loop runs clockwise
 * on screen with the floor on its right; rock islands inside the floor get their own loops.
 * Only turning points are kept, so a straight wall is one edge.
 */
export function floorOutlines(cells: number[][]): Point[][] {
  const open = (x: number, y: number) => cells[y]?.[x] === FLOOR;
  // Directed boundary edges keyed by start vertex.
  const from = new Map<string, Point[]>();
  const add = (a: Point, b: Point) => {
    const key = `${a[0]},${a[1]}`;
    const list = from.get(key);
    if (list) list.push(b);
    else from.set(key, [b]);
  };
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y]!.length; x++) {
      if (!open(x, y)) continue;
      if (!open(x, y - 1)) add([x, y], [x + 1, y]);
      if (!open(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!open(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!open(x - 1, y)) add([x, y + 1], [x, y]);
    }
  }

  const loops: Point[][] = [];
  while (from.size) {
    const [startKey, ends] = from.entries().next().value!;
    const start = startKey.split(",").map(Number) as Point;
    const loop: Point[] = [start];
    let prev = start;
    let cur = ends.shift()!;
    if (!ends.length) from.delete(startKey);
    while (cur[0] !== start[0] || cur[1] !== start[1]) {
      loop.push(cur);
      const key = `${cur[0]},${cur[1]}`;
      const options = from.get(key)!;
      // Where two loops touch at a corner, turn toward the floor (right) so each loop stays tight.
      const dir: Point = [cur[0] - prev[0], cur[1] - prev[1]];
      const rank = (p: Point) => {
        const d: Point = [p[0] - cur[0], p[1] - cur[1]];
        if (d[0] === -dir[1] && d[1] === dir[0]) return 0; // right
        if (d[0] === dir[0] && d[1] === dir[1]) return 1; // straight
        return 2; // left
      };
      options.sort((a, b) => rank(a) - rank(b));
      const next = options.shift()!;
      if (!options.length) from.delete(key);
      prev = cur;
      cur = next;
    }
    loops.push(simplify(loop));
  }
  return loops;
}

/** Drop points that sit on a straight line between their neighbors. */
function simplify(loop: Point[]): Point[] {
  return loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length]!;
    const b = loop[(i + 1) % loop.length]!;
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

/** Chaikin corner cutting on a closed loop: each pass rounds every corner a little more. */
export function smoothLoop(loop: Point[], passes = 2): Point[] {
  let pts = loop;
  for (let pass = 0; pass < passes; pass++) {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    pts = out;
  }
  return pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}

/** Wall segments along closed loops. */
export const loopWalls = (loops: Point[][]): WallSegment[] =>
  loops.flatMap((loop) => loop.map(([x1, y1], i) => {
    const [x2, y2] = loop[(i + 1) % loop.length]!;
    return { x1, y1, x2, y2, door: false };
  }));

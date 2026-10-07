import { createRng, type Rng } from "./rng.ts";
import { FLOOR, ROCK, type DungeonMap, type Room } from "./dungeon.ts";
import { floorOutlines, loopWalls, smoothLoop } from "./outline.ts";

export interface CaveOptions {
  width?: number;
  height?: number;
  /** Starting fraction of rock, about 0.4 (open) to 0.52 (tight). */
  density?: number;
  /** Number of chambers to divide the cave into. Default scales with cave size. */
  chambers?: number;
  seed?: string | number;
}

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Count rock cells within `radius` (out of bounds counts as rock). */
function rockAround(cells: number[][], x: number, y: number, radius: number): number {
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if ((dx || dy) && cells[y + dy]?.[x + dx] !== FLOOR) n++;
    }
  }
  return n;
}

/**
 * Cellular automaton: random noise smoothed into caverns. Rock persists with 4+ rock neighbors and
 * open ground fills in with 5+, which settles into chambers joined by narrow passages.
 */
function automaton(rng: Rng, w: number, h: number, density: number): number[][] {
  const edge = (x: number, y: number) => x === 0 || y === 0 || x === w - 1 || y === h - 1;
  let cells = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (edge(x, y) || rng.chance(density) ? ROCK : FLOOR)));
  for (let step = 0; step < 5; step++) {
    cells = cells.map((row, y) =>
      row.map((cell, x) => {
        if (edge(x, y)) return ROCK;
        const near = rockAround(cells, x, y, 1);
        return near >= (cell === ROCK ? 4 : 5) ? ROCK : FLOOR;
      }));
  }
  return cells;
}

/** Label 4-connected open regions. */
function regions(cells: number[][]): [number, number][][] {
  const h = cells.length;
  const w = cells[0]!.length;
  const seen = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  const out: [number, number][][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y]![x] !== FLOOR || seen[y]![x]) continue;
      const region: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y]![x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        region.push([cx, cy]);
        for (const [dx, dy] of N4) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (cells[ny]?.[nx] === FLOOR && !seen[ny]![nx]) {
            seen[ny]![nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      out.push(region);
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Join separate caverns to the main one with winding tunnels; fill in pockets too small to matter.
 * Returns the final open area.
 */
function connectRegions(rng: Rng, cells: number[][], minSize: number): number {
  const all = regions(cells);
  if (!all.length) return 0;
  const main = all[0]!;
  const inMain = new Set(main.map(([x, y]) => `${x},${y}`));
  let open = main.length;

  for (const region of all.slice(1)) {
    if (region.length < minSize) {
      for (const [x, y] of region) cells[y]![x] = ROCK;
      continue;
    }
    // Closest pair of cells between this cavern and the main cave (sampled for speed).
    const sample = (list: [number, number][]) => (list.length > 200 ? rng.shuffle(list).slice(0, 200) : list);
    let best: [[number, number], [number, number]] | null = null;
    let bestD = Infinity;
    const mainCells = sample([...inMain].map((k) => k.split(",").map(Number) as [number, number]));
    for (const a of sample(region)) {
      for (const b of mainCells) {
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (d < bestD) [best, bestD] = [[a, b], d];
      }
    }
    if (!best) continue;
    // Dig a slightly wandering tunnel from the cavern toward the main cave.
    let [x, y] = best[0];
    const [tx, ty] = best[1];
    let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < 500) {
      const horizontal = x !== tx && (y === ty || rng.chance(0.5));
      if (rng.chance(0.15)) {
        // Wander sideways now and then so tunnels aren't ruler-straight.
        if (horizontal) y = Math.max(1, Math.min(cells.length - 2, y + rng.pick([-1, 1])));
        else x = Math.max(1, Math.min(cells[0]!.length - 2, x + rng.pick([-1, 1])));
      } else if (horizontal) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      cells[y]![x] = FLOOR;
    }
    for (const [cx, cy] of region) inMain.add(`${cx},${cy}`);
    open += region.length;
  }
  // Tunnels may have opened extra cells; count the real total.
  return cells.flat().filter((c) => c === FLOOR).length || open;
}

/** Walking distance from the nearest source over floor cells. */
function bfs(cells: number[][], sources: [number, number][]): number[][] {
  const dist = cells.map((row) => row.map(() => Infinity));
  const queue: [number, number][] = [];
  for (const [x, y] of sources) {
    dist[y]![x] = 0;
    queue.push([x, y]);
  }
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (cells[ny]?.[nx] === FLOOR && dist[ny]![nx] === Infinity) {
        dist[ny]![nx] = dist[y]![x]! + 1;
        queue.push([nx, ny]);
      }
    }
  }
  return dist;
}

/**
 * Split the cave into chambers: seeds go at open spots spread far apart (farthest-point sampling,
 * favoring cells away from walls), then each floor cell joins its nearest seed by walking distance.
 */
function chambers(rng: Rng, cells: number[][], count: number): Room[] {
  const floor: [number, number][] = [];
  cells.forEach((row, y) => row.forEach((c, x) => c === FLOOR && floor.push([x, y])));

  // Openness: distance to the nearest rock. Seeds prefer open cells so labels sit in chambers, not tunnels.
  const rocks: [number, number][] = [];
  cells.forEach((row, y) => row.forEach((c, x) => c !== FLOOR && rocks.push([x, y])));
  const openness = cells.map((row) => row.map(() => 0));
  for (const [x, y] of floor) {
    let best = 4;
    for (let r = 1; r < 4 && best === 4; r++) if (rockAround(cells, x, y, r) > 0) best = r;
    openness[y]![x] = best;
  }

  // Start at the open cell closest to the west edge: that's the entrance.
  const open = floor.filter(([x, y]) => openness[y]![x]! >= 2);
  const candidates = open.length >= count ? open : floor;
  const seeds: [number, number][] = [candidates.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && rng.chance(0.5)) ? b : a))];
  while (seeds.length < count) {
    const dist = bfs(cells, seeds);
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (const [x, y] of candidates) {
      const d = dist[y]![x]!;
      if (d === Infinity) continue;
      const score = d * (1 + 0.15 * openness[y]![x]!);
      if (score > bestScore) [best, bestScore] = [[x, y], score];
    }
    if (!best || bestScore < 4) break; // cave too small for more distinct chambers
    seeds.push(best);
  }

  // Assign every floor cell to its nearest seed.
  const owner = cells.map((row) => row.map(() => -1));
  const queue: [number, number][] = [];
  seeds.forEach(([x, y], i) => {
    owner[y]![x] = i;
    queue.push([x, y]);
  });
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (cells[ny]?.[nx] === FLOOR && owner[ny]![nx] === -1) {
        owner[ny]![nx] = owner[y]![x]!;
        queue.push([nx, ny]);
      }
    }
  }

  const groups: [number, number][][] = seeds.map(() => []);
  for (const [x, y] of floor) if (owner[y]![x]! >= 0) groups[owner[y]![x]!]!.push([x, y]);

  // Number chambers by walking distance from the entrance so keys read in exploration order.
  const fromEntrance = bfs(cells, [seeds[0]!]);
  const order = seeds.map((s, i) => i).sort((a, b) => fromEntrance[seeds[a]![1]]![seeds[a]![0]]! - fromEntrance[seeds[b]![1]]![seeds[b]![0]]!);

  return order.map((i, n) => {
    const g = groups[i]!;
    const xs = g.map(([x]) => x);
    const ys = g.map(([, y]) => y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { id: n + 1, x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1, cells: g, center: seeds[i]! };
  });
}

export function generateCave(opts: CaveOptions = {}): DungeonMap {
  const width = opts.width ?? 50;
  const height = opts.height ?? 40;
  const rng = createRng(opts.seed);

  // Retry until the main cavern is big enough to be worth playing (rare with sane densities).
  let cells: number[][] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    cells = automaton(rng, width, height, opts.density ?? 0.48);
    if (connectRegions(rng, cells, 12) >= width * height * 0.3) break;
  }

  const floorCount = cells.flat().filter((c) => c === FLOOR).length;
  const count = opts.chambers ?? Math.max(4, Math.min(14, Math.round(floorCount / 70)));
  const rooms = chambers(rng, cells, count);
  // Rounded rock faces instead of stair-stepped cell edges; the walls follow the same curves.
  const outlines = floorOutlines(cells).map((loop) => smoothLoop(loop, 2));
  return { seed: rng.seed, style: "cave", width, height, cells, rooms, walls: loopWalls(outlines), outlines };
}

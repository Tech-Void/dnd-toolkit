import { createRng, randomSeed, valueNoise } from "./rng.ts";
import { TERRAINS, type Climate, type Pace, type Terrain } from "./travel.ts";

// ---------------------------------------------------------------------------
// A region map: land and sea from noise, biomes from height, wetness and latitude, rivers running
// downhill, towns and dungeons where they'd make sense (the campaign's own places first), and roads
// between the towns. Routes follow the roads where they can; the party marker walks the route as
// the days pass.

export type WorldCell = Exclude<Terrain, "road"> | "water";

export type WorldPlaceKind = "city" | "town" | "village" | "dungeon" | "lair" | "landmark" | "temple";

export interface WorldPlace {
  id: string;
  name: string;
  kind: WorldPlaceKind;
  x: number;
  y: number;
  /** The campaign place it stands for. */
  campaignId?: string;
}

export interface WorldRoad {
  from: string;
  to: string;
  path: [number, number][];
}

export interface WorldTrip {
  from: string;
  to: string;
  path: [number, number][];
  /** Miles walked so far. */
  done: number;
  miles: number;
  /** Days walked so far. */
  day: number;
}

export interface WorldMap {
  seed: string;
  w: number;
  h: number;
  milesPerCell: number;
  climate: Climate;
  /** Row-major. */
  cells: WorldCell[];
  /** 0-1 per cell, for shading. */
  height: number[];
  rivers: [number, number][][];
  roads: WorldRoad[];
  places: WorldPlace[];
  party: { x: number; y: number; at?: string };
  trip?: WorldTrip;
}

export interface WorldOptions {
  w?: number;
  h?: number;
  milesPerCell?: number;
  climate?: Climate;
  /** Places to put on the map (from the campaign). */
  places?: { id: string; name: string; kind: string }[];
  /** How many more settlements and sites to add. */
  towns?: number;
  sites?: number;
  seed?: string | number;
}

const NAME_A = ["Oak", "Mill", "Raven", "Stone", "Ash", "Bright", "Cold", "Elder", "Fox", "Green", "High", "Iron", "Kings", "Marsh", "North", "Red", "Salt", "Thorn", "West", "Wolf", "Amber", "Barrow", "Copper", "Dun", "Hollow", "Moss", "Pike", "Silver", "Tall", "Black", "Grey", "Hart", "Long", "Swan"];
const NAME_B = ["ford", "bridge", "haven", "wick", "stead", "ton", "dale", "moor", "field", "hollow", "brook", "gate", "cross", "mere", "bury", "well", "watch", "fall", "ham", "holm", "by", "thorpe"];
const SITE_A = ["The Sunken", "The Broken", "The Howling", "The Black", "The Drowned", "The Forgotten", "The Pale", "The Shattered", "The Whispering", "The Crimson", "The Hollow", "The Iron"];
const SITE_B: Record<"dungeon" | "lair" | "landmark" | "temple", string[]> = {
  dungeon: ["Keep", "Crypt", "Vault", "Halls", "Catacombs", "Mine", "Tower", "Barrow", "Citadel"],
  lair: ["Den", "Nest", "Warren", "Pit", "Caves", "Roost"],
  landmark: ["Stones", "Oak", "Falls", "Spire", "Arch", "Standing Stone", "Watchtower"],
  temple: ["Shrine", "Abbey", "Chapel", "Sanctum"],
};

const idx = (m: { w: number }, x: number, y: number) => y * m.w + x;
export const worldCell = (m: WorldMap, x: number, y: number): WorldCell | undefined => (x < 0 || y < 0 || x >= m.w || y >= m.h ? undefined : m.cells[idx(m, x, y)]);

/** Is (x, y) on a road? */
export function onRoad(m: Pick<WorldMap, "roads">, x: number, y: number): boolean {
  return m.roads.some((r) => r.path.some(([px, py]) => px === x && py === y));
}

const MOVE_COST: Record<WorldCell, number> = { grassland: 1, coast: 1.2, desert: 2, forest: 2, hills: 2.5, swamp: 3.5, arctic: 3, mountains: 6, water: Infinity };

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Cheapest path between two cells (A*), or null. `cost` per entered cell; diagonals cost √2 as much. */
function findPath(m: Pick<WorldMap, "w" | "h">, from: [number, number], to: [number, number], cost: (x: number, y: number) => number): [number, number][] | null {
  const n = m.w * m.h;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = from[1] * m.w + from[0];
  const goal = to[1] * m.w + to[0];
  g[start] = 0;
  // A small binary heap keyed on f = g + h.
  const heap: [number, number][] = [[0, start]];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p]![0] <= heap[c]![0]) break;
      [heap[p], heap[c]] = [heap[c]!, heap[p]!];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let s = p;
        if (l < heap.length && heap[l]![0] < heap[s]![0]) s = l;
        if (r < heap.length && heap[r]![0] < heap[s]![0]) s = r;
        if (s === p) break;
        [heap[p], heap[s]] = [heap[s]!, heap[p]!];
        p = s;
      }
    }
    return top;
  };
  const hdist = (i: number) => Math.hypot((i % m.w) - to[0], Math.floor(i / m.w) - to[1]) * 0.5;
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      const step = cost(nx, ny) * (dx && dy ? Math.SQRT2 : 1);
      if (!Number.isFinite(step) && j !== goal) continue;
      const ng = g[i]! + (Number.isFinite(step) ? step : 1);
      if (ng < g[j]!) {
        g[j] = ng;
        came[j] = i;
        push(ng + hdist(j), j);
      }
    }
  }
  if (!Number.isFinite(g[goal]!)) return null;
  const path: [number, number][] = [];
  for (let i = goal; i !== -1; i = came[i]!) path.push([i % m.w, Math.floor(i / m.w)]);
  return path.reverse();
}

function biome(e: number, wet: number, cold: number, climate: Climate): WorldCell {
  if (e < 0.34) return "water";
  if (e < 0.38) return "coast";
  if (e > 0.8) return "mountains";
  if (cold > 0.78 && climate !== "hot") return "arctic";
  if (e > 0.67) return "hills";
  if (wet > 0.66 && e < 0.5) return "swamp";
  if (climate === "hot" ? wet < 0.42 : climate === "temperate" && wet < 0.2) return "desert";
  if (wet > 0.5) return "forest";
  return "grassland";
}

function siteKind(kind: string): WorldPlaceKind {
  if (kind === "settlement" || kind === "inn" || kind === "shop") return "town";
  if (kind === "temple") return "temple";
  if (kind === "dungeon" || kind === "lair" || kind === "landmark") return kind;
  return "landmark";
}

const isTown = (k: WorldPlaceKind) => k === "city" || k === "town" || k === "village";

/** A region map. */
export function generateWorld(o: WorldOptions = {}): WorldMap {
  const seed = String(o.seed ?? randomSeed());
  const rng = createRng(seed);
  const w = o.w ?? 60;
  const h = o.h ?? 40;
  const climate = o.climate ?? "temperate";
  // Height: three octaves, pushed down toward one or two coasts so there's sea on the map.
  const n1 = valueNoise(rng, w, h, 12);
  const n2 = valueNoise(rng, w, h, 5);
  const n3 = valueNoise(rng, w, h, 2.5);
  const wetN = valueNoise(rng, w, h, 9);
  const seaSides = rng.shuffle(["n", "s", "e", "w"] as const).slice(0, rng.int(1, 2));
  const height: number[] = [];
  const cells: WorldCell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let e = n1[y]![x]! * 0.6 + n2[y]![x]! * 0.28 + n3[y]![x]! * 0.12;
      for (const s of seaSides) {
        const d = s === "n" ? y / h : s === "s" ? 1 - y / h : s === "w" ? x / w : 1 - x / w;
        if (d < 0.25) e -= (0.25 - d) * 1.6;
      }
      e = Math.max(0, Math.min(1, e * 1.15 - 0.02));
      height.push(e);
      const cold = (climate === "cold" ? 0.42 : climate === "hot" ? -0.3 : 0.2) + (1 - y / h) * 0.32 + e * 0.2;
      cells.push(biome(e, wetN[y]![x]!, cold, climate));
    }
  }
  // Puddles (a lake of one to three cells) dry out into marsh.
  const seenWater = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (cells[i] !== "water" || seenWater[i]) continue;
    const group = [i];
    seenWater[i] = 1;
    for (let k = 0; k < group.length; k++) {
      const gx = group[k]! % w;
      const gy = Math.floor(group[k]! / w);
      for (const [dx, dy] of DIRS.slice(0, 4)) {
        const nx = gx + dx;
        const ny = gy + dy;
        const j = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && cells[j] === "water" && !seenWater[j]) {
          seenWater[j] = 1;
          group.push(j);
        }
      }
    }
    if (group.length <= 3) for (const j of group) {
      cells[j] = "swamp";
      height[j] = 0.36;
    }
  }
  const m: WorldMap = { seed, w, h, milesPerCell: o.milesPerCell ?? 6, climate, cells, height, rivers: [], roads: [], places: [], party: { x: Math.floor(w / 2), y: Math.floor(h / 2) } };

  // Rivers: from high ground down the valleys (the cheapest way through low land) to the nearest sea,
  // joining another river if they meet one.
  const water = cells.map((c, i) => (c === "water" ? i : -1)).filter((i) => i >= 0);
  const high = rng.shuffle(cells.map((c, i) => (c === "mountains" || c === "hills" ? i : -1)).filter((i) => i >= 0));
  const sources: number[] = [];
  const riverCount = rng.int(3, 5);
  for (const s of high) {
    if (sources.length >= riverCount) break;
    if (sources.every((o) => Math.hypot((o % w) - (s % w), Math.floor(o / w) - Math.floor(s / w)) >= 9)) sources.push(s);
  }
  const riverCells = new Set<number>();
  const meander = valueNoise(rng, w, h, 2);
  for (const s of water.length ? sources : []) {
    const sx = s % w;
    const sy = Math.floor(s / w);
    const sea = water.reduce((b, i) => (Math.hypot((i % w) - sx, Math.floor(i / w) - sy) < Math.hypot((b % w) - sx, Math.floor(b / w) - sy) ? i : b));
    const path = findPath(m, [sx, sy], [sea % w, Math.floor(sea / w)], (x, y) => 0.3 + height[idx(m, x, y)]! ** 2 * 12 + meander[y]![x]! * 1.6);
    if (!path) continue;
    const cut = path.findIndex(([x, y], i) => i > 0 && (riverCells.has(idx(m, x, y)) || cells[idx(m, x, y)] === "water"));
    const run = cut > 0 ? path.slice(0, cut + 1) : path;
    if (run.length < 6) continue;
    for (const [x, y] of run) riverCells.add(idx(m, x, y));
    m.rivers.push(run);
  }
  const river = new Set(m.rivers.flatMap((r) => r.map(([x, y]) => idx(m, x, y))));

  // The main landmass: places go there, so every one can be walked to.
  const landId = new Int32Array(w * h).fill(-1);
  const landSize: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === "water" || landId[i]! >= 0) continue;
    const id = landSize.length;
    const stack = [i];
    landId[i] = id;
    let size = 0;
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      for (const [dx, dy] of DIRS) {
        const nx = (j % w) + dx;
        const ny = Math.floor(j / w) + dy;
        const k = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && cells[k] !== "water" && landId[k]! < 0) {
          landId[k] = id;
          stack.push(k);
        }
      }
    }
    landSize.push(size);
  }
  const mainland = landSize.indexOf(Math.max(...landSize));

  // Places: campaign ones first, then more towns and sites, spaced apart, on ground that suits them.
  const taken = new Set<string>();
  const nameTown = () => {
    for (let i = 0; i < 50; i++) {
      const n = `${rng.pick(NAME_A)}${rng.pick(NAME_B)}`;
      if (!taken.has(n)) return n;
    }
    return `${rng.pick(NAME_A)}${rng.pick(NAME_B)} ${rng.int(2, 9)}`;
  };
  const nameSite = (k: Exclude<WorldPlaceKind, "city" | "town" | "village">) => {
    for (let i = 0; i < 50; i++) {
      const n = `${rng.pick(SITE_A)} ${rng.pick(SITE_B[k])}`;
      if (!taken.has(n)) return n;
    }
    return `${rng.pick(SITE_A)} ${rng.pick(SITE_B[k])} ${rng.int(2, 9)}`;
  };
  const score = (k: WorldPlaceKind, x: number, y: number) => {
    const c = cells[idx(m, x, y)]!;
    if (c === "water" || c === "mountains" || landId[idx(m, x, y)] !== mainland) return -1;
    if (m.places.some((p) => Math.hypot(p.x - x, p.y - y) < (isTown(k) && isTown(p.kind) ? 7 : 4))) return -1;
    if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) return -1;
    const nearWater = DIRS.some(([dx, dy]) => worldCell(m, x + dx, y + dy) === "water") || river.has(idx(m, x, y));
    if (isTown(k)) return ({ grassland: 3, coast: 3, forest: 1.5, hills: 1.5, desert: 0.6, swamp: 0.4, arctic: 0.5 } as Record<string, number>)[c]! + (nearWater ? 2 : 0) + rng.next();
    if (k === "lair") return ({ hills: 3, forest: 3, swamp: 3, arctic: 2, desert: 2, grassland: 0.5, coast: 1 } as Record<string, number>)[c]! + rng.next();
    return ({ hills: 2.5, forest: 2, swamp: 2, grassland: 1.5, desert: 2, arctic: 1.5, coast: 1 } as Record<string, number>)[c]! + rng.next() * 1.5;
  };
  const place = (k: WorldPlaceKind, name: string, campaignId?: string) => {
    let best: [number, number, number] | null = null;
    for (let i = 0; i < 400; i++) {
      const x = rng.int(0, w - 1);
      const y = rng.int(0, h - 1);
      const s = score(k, x, y);
      if (s > 0 && (!best || s > best[2])) best = [x, y, s];
    }
    if (!best) return;
    taken.add(name);
    m.places.push({ id: campaignId ?? `w${m.places.length}${rng.int(0, 36 ** 4).toString(36)}`, name, kind: k, x: best[0], y: best[1], campaignId });
  };
  for (const p of o.places ?? []) place(siteKind(p.kind), p.name, p.id);
  const towns = o.towns ?? 6;
  const haveTowns = m.places.filter((p) => isTown(p.kind)).length;
  for (let i = haveTowns; i < towns; i++) place(i === 0 ? "city" : i < 3 ? "town" : "village", nameTown());
  const sites = o.sites ?? 6;
  for (let i = 0; i < sites; i++) {
    const k = rng.weighted([["dungeon", 4], ["lair", 3], ["landmark", 2], ["temple", 1]] as const);
    place(k, nameSite(k));
  }

  // Roads: join the towns (nearest-neighbour tree, plus one loop), reusing road that's already there.
  const roadCells = new Set<number>();
  const roadCost = (x: number, y: number) => {
    const i = idx(m, x, y);
    if (roadCells.has(i)) return 0.35;
    return MOVE_COST[cells[i]!] + (river.has(i) ? 3 : 0);
  };
  const townList = m.places.filter((p) => isTown(p.kind) || p.kind === "temple");
  const joined = townList.slice(0, 1);
  const pending = townList.slice(1);
  const link = (a: WorldPlace, b: WorldPlace) => {
    const path = findPath(m, [a.x, a.y], [b.x, b.y], roadCost);
    if (!path) return false;
    for (const [x, y] of path) roadCells.add(idx(m, x, y));
    m.roads.push({ from: a.id, to: b.id, path });
    return true;
  };
  while (pending.length) {
    let bi = 0;
    let bj = 0;
    let bd = Infinity;
    pending.forEach((p, i) => joined.forEach((q, j) => {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bd) [bd, bi, bj] = [d, i, j];
    }));
    const [p] = pending.splice(bi, 1);
    if (link(joined[bj]!, p!)) joined.push(p!);
  }
  if (townList.length > 3) {
    const [a, b] = rng.shuffle(townList);
    if (!m.roads.some((r) => (r.from === a!.id && r.to === b!.id) || (r.from === b!.id && r.to === a!.id))) link(a!, b!);
  }
  const start = m.places.find((p) => p.kind === "city") ?? m.places[0];
  if (start) m.party = { x: start.x, y: start.y, at: start.id };
  return m;
}

/** Add campaign places the map doesn't have yet (keeps everything else). */
export function addWorldPlaces(m: WorldMap, places: { id: string; name: string; kind: string }[], seed?: string | number): WorldMap {
  const missing = places.filter((p) => !m.places.some((q) => q.campaignId === p.id || q.name === p.name));
  if (!missing.length) return m;
  // Generate a same-seed map with these places to find spots for them, then copy the spots over.
  const fresh = generateWorld({ w: m.w, h: m.h, climate: m.climate, milesPerCell: m.milesPerCell, seed: m.seed, places: missing, towns: 0, sites: 0 });
  const rng = createRng(seed ?? `${m.seed}:${m.places.length}`);
  const out = { ...m, places: [...m.places] };
  for (const p of fresh.places.filter((f) => f.campaignId)) {
    let { x, y } = p;
    // Nudge off anything already there.
    for (let i = 0; i < 20 && out.places.some((q) => Math.hypot(q.x - x, q.y - y) < 2); i++) {
      x = Math.max(1, Math.min(m.w - 2, x + rng.int(-2, 2)));
      y = Math.max(1, Math.min(m.h - 2, y + rng.int(-2, 2)));
    }
    if (m.cells[idx(m, x, y)] !== "water") out.places.push({ ...p, x, y });
  }
  return out;
}

export interface WorldRoute {
  path: [number, number][];
  miles: number;
  /** Days at each pace. */
  days: Record<Pace, number>;
  /** Share of the way by terrain (road counts as its own). */
  terrain: Partial<Record<Terrain, number>>;
  /** The terrain to plan the journey with. */
  main: Terrain;
}

const PACE_MILES: Record<Pace, number> = { slow: 18, normal: 24, fast: 30 };

/** The way from one place (or the party) to another: by road where it can. */
export function worldRoute(m: WorldMap, from: { x: number; y: number }, to: { x: number; y: number }): WorldRoute | null {
  const road = new Set(m.roads.flatMap((r) => r.path.map(([x, y]) => idx(m, x, y))));
  const river = new Set(m.rivers.flatMap((r) => r.map(([x, y]) => idx(m, x, y))));
  const path = findPath(m, [from.x, from.y], [to.x, to.y], (x, y) => {
    const i = idx(m, x, y);
    return road.has(i) ? 0.5 : MOVE_COST[m.cells[i]!] + (river.has(i) ? 1.5 : 0);
  });
  if (!path) return null;
  let miles = 0;
  const effort: Record<Pace, number> = { slow: 0, normal: 0, fast: 0 };
  const count: Partial<Record<Terrain, number>> = {};
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i]!;
    const [px, py] = path[i - 1]!;
    const step = Math.hypot(x - px, y - py) * m.milesPerCell;
    miles += step;
    const ci = idx(m, x, y);
    const t: Terrain = road.has(ci) ? "road" : (m.cells[ci] as Terrain);
    count[t] = (count[t] ?? 0) + 1;
    const slow = t !== "road" && TERRAINS[t]?.difficult ? 2 : 1;
    for (const p of Object.keys(effort) as Pace[]) effort[p] += (step * slow) / PACE_MILES[p];
  }
  const steps = Math.max(1, path.length - 1);
  const terrain = Object.fromEntries(Object.entries(count).map(([k, v]) => [k, Math.round((v! / steps) * 100) / 100])) as Partial<Record<Terrain, number>>;
  const wild = (Object.entries(terrain) as [Terrain, number][]).filter(([k]) => k !== "road").sort((a, b) => b[1] - a[1])[0];
  const main: Terrain = (terrain.road ?? 0) >= 0.6 || !wild ? "road" : wild[0];
  const days = Object.fromEntries((Object.keys(effort) as Pace[]).map((p) => [p, Math.max(1, Math.ceil(effort[p] - 0.15))])) as Record<Pace, number>;
  return { path, miles: Math.round(miles), days, terrain, main };
}

/** Start a trip along a route. */
export function startTrip(m: WorldMap, from: string, to: string, route: WorldRoute): WorldMap {
  return { ...m, trip: { from, to, path: route.path, done: 0, miles: route.miles, day: 0 }, party: { x: route.path[0]![0], y: route.path[0]![1] } };
}

/** Walk the party some miles along the trip. Arriving puts them at the destination. */
export function advanceTrip(m: WorldMap, miles: number): WorldMap {
  const t = m.trip;
  if (!t) return m;
  const done = Math.min(t.miles, t.done + Math.max(0, miles));
  // Find the point `done` miles along the path.
  let left = done;
  let pos: { x: number; y: number } = { x: t.path[0]![0], y: t.path[0]![1] };
  for (let i = 1; i < t.path.length; i++) {
    const [ax, ay] = t.path[i - 1]!;
    const [bx, by] = t.path[i]!;
    const seg = Math.hypot(bx - ax, by - ay) * m.milesPerCell;
    if (left <= seg) {
      const f = seg ? left / seg : 1;
      pos = { x: ax + (bx - ax) * f, y: ay + (by - ay) * f };
      break;
    }
    left -= seg;
    pos = { x: bx, y: by };
  }
  if (done >= t.miles) {
    const dest = m.places.find((p) => p.id === t.to);
    return { ...m, trip: undefined, party: dest ? { x: dest.x, y: dest.y, at: dest.id } : { ...pos } };
  }
  return { ...m, trip: { ...t, done, day: t.day + 1 }, party: pos };
}

export const worldPlace = (m: WorldMap, id: string) => m.places.find((p) => p.id === id);
export const isSettlement = isTown;

import { createRng, type Rng } from "./rng.ts";
import type { WallSegment } from "./dungeon.ts";

// ---------------------------------------------------------------------------
// Small, single-fight battlemaps: a clearing, a shop floor, a cave grotto...
// Everything is in grid cells; the Foundry importer turns it into a scene.

export type BattlemapSetting = "clearing" | "road" | "cave" | "shop" | "tavern" | "ruins" | "camp";
export type BattlemapSize = "small" | "medium" | "large";

export const BATTLEMAP_SETTINGS: Record<BattlemapSetting, { label: string; outdoor: boolean }> = {
  clearing: { label: "Forest clearing", outdoor: true },
  road: { label: "Road ambush", outdoor: true },
  cave: { label: "Cave grotto", outdoor: false },
  shop: { label: "Shop", outdoor: false },
  tavern: { label: "Tavern", outdoor: false },
  ruins: { label: "Ruins", outdoor: true },
  camp: { label: "Bandit camp", outdoor: true },
};

const SIZES: Record<BattlemapSize, [number, number]> = { small: [20, 15], medium: [28, 20], large: [36, 26] };

export type Ground = "grass" | "dirt" | "road" | "stone" | "wood" | "cave" | "water" | "rock";

export type PropKind =
  | "tree" | "bush" | "boulder" | "log" | "stalagmite" | "mushrooms" | "rubble" | "pillar" | "altar"
  | "table" | "chair" | "barrel" | "crate" | "counter" | "shelf" | "bed" | "chest" | "hearth" | "rug" | "stairs"
  | "campfire" | "tent" | "cart";

/** none: walk through it. move: blocks movement only. all: blocks movement and sight (gets walls). */
export type Blocks = "none" | "move" | "all";

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  blocks: Blocks;
  cover?: "half" | "three-quarters";
  difficult?: boolean;
}

export interface BattleWall extends WallSegment {
  /** Blocks movement but not sight or light. */
  window?: boolean;
}

export interface BattleLight {
  /** Center, in grid units. */
  x: number;
  y: number;
  /** Radii in feet. */
  bright: number;
  dim: number;
  color: string;
  animation?: "torch" | "fire" | "pulse";
}

export type Cell = [number, number];

export interface Battlemap {
  seed: string;
  setting: BattlemapSetting;
  title: string;
  night: boolean;
  width: number;
  height: number;
  /** ground[y][x] */
  ground: Ground[][];
  walls: BattleWall[];
  props: Prop[];
  lights: BattleLight[];
  /** Scene darkness, 0 (daylight) to 1. */
  darkness: number;
  /** Where the party arrives and where enemies start, each in preference order. */
  zones: { party: Cell[]; enemies: Cell[] };
  /** GM notes on the terrain: cover, difficult ground, hazards. */
  notes: string[];
}

export interface BattlemapOptions {
  setting?: BattlemapSetting | "random";
  size?: BattlemapSize;
  night?: boolean;
  /** Title for the map, e.g. the shop's name. */
  title?: string;
  seed?: string | number;
}

// ---------------------------------------------------------------------------
// Prop rules

const PROP_RULES: Record<PropKind, Omit<Prop, "kind" | "x" | "y" | "w" | "h">> = {
  tree: { blocks: "all", cover: "three-quarters" },
  bush: { blocks: "none", difficult: true },
  boulder: { blocks: "all", cover: "three-quarters" },
  log: { blocks: "none", cover: "half", difficult: true },
  stalagmite: { blocks: "all", cover: "three-quarters" },
  mushrooms: { blocks: "none" },
  rubble: { blocks: "none", difficult: true },
  pillar: { blocks: "all", cover: "three-quarters" },
  altar: { blocks: "move", cover: "half" },
  table: { blocks: "none", cover: "half", difficult: true },
  chair: { blocks: "none" },
  barrel: { blocks: "none", cover: "half", difficult: true },
  crate: { blocks: "none", cover: "half", difficult: true },
  counter: { blocks: "none", cover: "half", difficult: true },
  shelf: { blocks: "all", cover: "three-quarters" },
  bed: { blocks: "none", cover: "half", difficult: true },
  chest: { blocks: "none", cover: "half" },
  hearth: { blocks: "move" },
  rug: { blocks: "none" },
  stairs: { blocks: "none", difficult: true },
  campfire: { blocks: "none" },
  tent: { blocks: "all", cover: "three-quarters" },
  cart: { blocks: "move", cover: "three-quarters" },
};

/** Props drawn under everything else; they don't take up their cells. */
const UNDERLAY = new Set<PropKind>(["rug"]);

const FIRE: Omit<BattleLight, "x" | "y"> = { bright: 15, dim: 30, color: "#ff9329", animation: "fire" };
const LAMP: Omit<BattleLight, "x" | "y"> = { bright: 10, dim: 20, color: "#ffb75e", animation: "torch" };
const GLOW: Omit<BattleLight, "x" | "y"> = { bright: 0, dim: 10, color: "#4fd1c5", animation: "pulse" };

// ---------------------------------------------------------------------------
// Build context

/** -1 solid rock, 0 open/outside, 1+ rooms of a building. Walls go between cells of different regions. */
type Region = number;
type Opening = "door" | "window";

interface PlaceOptions {
  /** Only on these ground types. */
  ground?: Ground[];
  /** Override the kind's usual blocking (edge-of-map trees are walk-through scenery). */
  blocks?: Blocks;
  /** Only inside this building room. */
  region?: Region;
}

class Builder {
  readonly ground: Ground[][];
  readonly region: Region[][];
  /** Cells taken by a prop (or kept clear, e.g. in front of doors). */
  readonly used: boolean[][];
  readonly props: Prop[] = [];
  readonly lights: BattleLight[] = [];
  readonly openings = new Map<string, Opening>();
  /** Free-standing wall runs, e.g. broken ruin walls (edge keys). */
  readonly extraWalls = new Set<string>();
  readonly notes = new Set<string>();

  readonly rng: Rng;
  readonly w: number;
  readonly h: number;

  constructor(rng: Rng, w: number, h: number, ground: Ground) {
    this.rng = rng;
    this.w = w;
    this.h = h;
    this.ground = grid(w, h, ground);
    this.region = grid(w, h, 0);
    this.used = grid(w, h, false);
  }

  inside = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h;
  walkable = (x: number, y: number) => this.inside(x, y) && this.ground[y]![x] !== "rock" && this.region[y]![x] >= 0;
  free = (x: number, y: number) => this.walkable(x, y) && !this.used[y]![x];

  /** Blocking props need a clear ring so they never seal off part of the map. */
  #ringClear(x: number, y: number, w: number, h: number) {
    for (const p of this.props) {
      if (p.blocks === "none") continue;
      if (x - 1 < p.x + p.w && p.x < x + w + 1 && y - 1 < p.y + p.h && p.y < y + h + 1) return false;
    }
    return true;
  }

  /** Place a prop if its cells are free (and on allowed ground); returns it or null. */
  place(kind: PropKind, x: number, y: number, w = 1, h = 1, opts: PlaceOptions = {}): Prop | null {
    const prop: Prop = { kind, x, y, w, h, ...PROP_RULES[kind] };
    if (opts.blocks) prop.blocks = opts.blocks;
    const under = UNDERLAY.has(kind);
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (!this.walkable(cx, cy) || (!under && this.used[cy]![cx])) return null;
        if (opts.ground && !opts.ground.includes(this.ground[cy]![cx]!)) return null;
        if (opts.region !== undefined && this.region[cy]![cx] !== opts.region) return null;
        // Room props stay in one room, so a table never straddles a wall.
        if (this.region[cy]![cx] !== this.region[y]![x]) return null;
      }
    }
    if (prop.blocks !== "none" && !this.#ringClear(x, y, w, h)) return null;
    if (!under) for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) this.used[cy]![cx] = true;
    this.props.push(prop);
    return prop;
  }

  /** Try random spots (from `cells`, or anywhere) until `count` props are placed. */
  scatter(kind: PropKind, count: number, size: () => [number, number], where?: (x: number, y: number) => boolean, opts: PlaceOptions = {}) {
    let placed = 0;
    for (let i = 0; i < count * 40 && placed < count; i++) {
      const [w, h] = size();
      const x = this.rng.int(0, this.w - w);
      const y = this.rng.int(0, this.h - h);
      if (where && !where(x, y)) continue;
      if (this.place(kind, x, y, w, h, opts)) placed++;
    }
    return placed;
  }

  light(x: number, y: number, kind: Omit<BattleLight, "x" | "y">) {
    this.lights.push({ x, y, ...kind });
  }

  /** Mark a rectangle as a building room. */
  room(x: number, y: number, w: number, h: number, id: Region, ground: Ground) {
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        this.region[cy]![cx] = id;
        this.ground[cy]![cx] = ground;
      }
    }
  }

  /** Door or window on the edge between two neighboring cells; the cells either side stay clear. */
  opening(a: Cell, b: Cell, kind: Opening) {
    this.openings.set(edgeKey(a, b), kind);
    for (const [x, y] of [a, b]) if (this.inside(x, y)) this.used[y]![x] = true;
  }
}

const grid = <T>(w: number, h: number, v: T): T[][] => Array.from({ length: h }, () => new Array<T>(w).fill(v));

/** Unit edge between two 4-neighbor cells: "h:x,y" is the top edge of (x, y), "v:x,y" its left edge. */
function edgeKey(a: Cell, b: Cell): string {
  const [x, y] = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  return a[0] === b[0] ? `h:${x},${y}` : `v:${x},${y}`;
}

/** Smooth random field in [0, 1): bilinear value noise on a coarse lattice. */
function noise(rng: Rng, w: number, h: number, scale: number): number[][] {
  const lw = Math.ceil(w / scale) + 2;
  const lh = Math.ceil(h / scale) + 2;
  const lattice = Array.from({ length: lh }, () => Array.from({ length: lw }, () => rng.next()));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const at = (i: number, j: number) => lattice[j]![i]!;
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      return top * (1 - ty) + bottom * ty;
    }));
}

const edgeDist = (b: Builder, x: number, y: number) => Math.min(x, y, b.w - 1 - x, b.h - 1 - y);
const N4: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------------------------------------------------------------------------
// Outdoor pieces

/** Grass with dirt patches. */
function meadow(b: Builder) {
  const n = noise(b.rng, b.w, b.h, 5);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (n[y]![x]! > 0.68) b.ground[y]![x] = "dirt";
}

/** Thick decorative trees around the edges (walk-through canopy), sparser blocking trees inside. */
function treeLine(b: Builder, depth: number, keepClear?: (x: number, y: number) => boolean) {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const d = edgeDist(b, x, y);
      if (d >= depth || keepClear?.(x, y)) continue;
      if (b.rng.chance(d === 0 ? 0.55 : 0.35 / d)) b.place("tree", x, y, 1, 1, { blocks: "none", ground: ["grass", "dirt"] });
    }
  }
}

/** A shallow stream meandering across the map (vertical before any transpose). */
function stream(b: Builder) {
  let x = b.rng.int(Math.floor(b.w * 0.35), Math.floor(b.w * 0.65));
  const width = b.rng.int(1, 2);
  for (let y = 0; y < b.h; y++) {
    if (b.rng.chance(0.35)) x = Math.max(2, Math.min(b.w - 3 - width, x + b.rng.pick([-1, 1])));
    for (let i = 0; i < width; i++) b.ground[y]![x + i] = "water";
  }
  b.notes.add("The stream is shallow: difficult terrain.");
}

function campfire(b: Builder, x: number, y: number): boolean {
  if (!b.place("campfire", x, y, 1, 1, { ground: ["grass", "dirt", "cave", "stone"] })) return false;
  b.light(x + 0.5, y + 0.5, FIRE);
  b.notes.add("A creature that enters the campfire or starts its turn there takes 1d6 fire damage.");
  return true;
}

function clearing(b: Builder) {
  meadow(b);
  if (b.rng.chance(0.4)) stream(b);
  treeLine(b, 3);
  const area = b.w * b.h;
  b.scatter("tree", Math.round(area / 55), () => [1, 1], undefined, { ground: ["grass", "dirt"] });
  b.scatter("boulder", Math.round(area / 160), () => (b.rng.chance(0.3) ? [2, 2] : [1, 1]), undefined, { ground: ["grass", "dirt"] });
  b.scatter("bush", Math.round(area / 30), () => [1, 1], undefined, { ground: ["grass", "dirt"] });
  b.scatter("log", b.rng.int(1, 3), () => (b.rng.chance(0.5) ? [3, 1] : [1, 3]), undefined, { ground: ["grass", "dirt"] });
  if (b.rng.chance(0.35)) campfire(b, Math.floor(b.w / 2) + b.rng.int(-3, 3), Math.floor(b.h / 2) + b.rng.int(-2, 2));
  b.notes.add("Trees and boulders give three-quarters cover; fallen logs give half cover.");
  b.notes.add("Bushes are difficult terrain and lightly obscure whoever stands in them.");
}

/** Road across the map; the attackers wait in the tree line on both sides. */
function road(b: Builder): (x: number, y: number) => boolean {
  meadow(b);
  const center: number[] = [];
  let y = Math.floor(b.h / 2) + b.rng.int(-2, 2);
  for (let x = 0; x < b.w; x++) {
    if (x % 3 === 0 && b.rng.chance(0.5)) y = Math.max(3, Math.min(b.h - 4, y + b.rng.pick([-1, 1])));
    center.push(y);
    for (let dy = -1; dy <= 1; dy++) b.ground[y + dy]![x] = "road";
    for (const dy of [-2, 2]) if (b.rng.chance(0.5)) b.ground[y + dy]![x] = "dirt";
  }
  const offRoad = (x: number, y2: number) => Math.abs(y2 - center[x]!) >= 3;
  treeLine(b, 3, (x, y2) => !offRoad(x, y2));
  const area = b.w * b.h;
  b.scatter("tree", Math.round(area / 45), () => [1, 1], offRoad, { ground: ["grass", "dirt"] });
  b.scatter("bush", Math.round(area / 25), () => [1, 1], (x, y2) => Math.abs(y2 - center[x]!) >= 2, { ground: ["grass", "dirt"] });
  b.scatter("boulder", Math.round(area / 200), () => [1, 1], offRoad);
  // An overturned cart blocking the road, cargo spilled around it.
  const cx = b.rng.int(Math.floor(b.w * 0.45), Math.floor(b.w * 0.65));
  if (b.place("cart", cx, center[cx]! - 1, 3, 2)) {
    b.scatter("crate", b.rng.int(1, 3), () => [1, 1], (x, y2) => Math.abs(x - cx - 1) <= 4 && Math.abs(y2 - center[cx]!) <= 3);
    b.scatter("barrel", b.rng.int(1, 2), () => [1, 1], (x, y2) => Math.abs(x - cx - 1) <= 4 && Math.abs(y2 - center[cx]!) <= 3);
    b.notes.add("The overturned cart blocks the road and gives three-quarters cover; spilled cargo gives half cover.");
  }
  b.notes.add("Ambush: the attackers hide in the tree line on both sides of the road (Stealth vs passive Perception).");
  b.notes.add("Bushes are difficult terrain and lightly obscure whoever stands in them.");
  return (x, y2) => x > b.w * 0.3 && Math.abs(y2 - center[x]!) >= 2 && Math.abs(y2 - center[x]!) <= 6;
}

function ruins(b: Builder) {
  meadow(b);
  // A broken foundation of flagstones with crumbling walls around it.
  const fw = Math.floor(b.w * b.rng.next() * 0.2 + b.w * 0.45);
  const fh = Math.floor(b.h * b.rng.next() * 0.2 + b.h * 0.45);
  const fx = Math.floor((b.w - fw) / 2) + b.rng.int(-2, 2);
  const fy = Math.floor((b.h - fh) / 2) + b.rng.int(-1, 1);
  const overgrowth = noise(b.rng, b.w, b.h, 3);
  for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) b.ground[y]![x] = overgrowth[y]![x]! > 0.7 ? "grass" : "stone";

  // Perimeter walls in runs, with gaps where they have fallen.
  const perimeter: [Cell, Cell][] = [];
  for (let x = fx; x < fx + fw; x++) perimeter.push([[x, fy - 1], [x, fy]], [[x, fy + fh - 1], [x, fy + fh]]);
  for (let y = fy; y < fy + fh; y++) perimeter.push([[fx - 1, y], [fx, y]], [[fx + fw - 1, y], [fx + fw, y]]);
  let standing = true;
  for (const [a, c] of perimeter) {
    if (b.rng.chance(standing ? 0.18 : 0.35)) standing = !standing;
    if (standing) b.extraWalls.add(edgeKey(a, c));
    else if (b.rng.chance(0.4) && b.inside(...a)) b.place("rubble", a[0], a[1]);
  }

  // Two rows of pillars, some fallen.
  const rowsY = [fy + 2, fy + fh - 3];
  for (let x = fx + 2; x < fx + fw - 2; x += 3) {
    for (const y of rowsY) {
      if (b.rng.chance(0.3)) b.place("rubble", x, y, b.rng.chance(0.5) ? 2 : 1, 1);
      else b.place("pillar", x, y);
    }
  }
  const altarX = fx + Math.floor(fw / 2) - 1;
  b.place("altar", altarX, fy + 1, 2, 1);
  b.scatter("rubble", Math.round((fw * fh) / 25), () => [1, 1], (x, y) => x >= fx && x < fx + fw && y >= fy && y < fy + fh);
  b.scatter("bush", Math.round((b.w * b.h) / 40), () => [1, 1]);
  treeLine(b, 2);
  b.scatter("tree", Math.round((b.w * b.h) / 120), () => [1, 1], (x, y) => x < fx - 1 || x > fx + fw || y < fy - 1 || y > fy + fh, { ground: ["grass", "dirt"] });
  b.notes.add("Standing walls and pillars give three-quarters cover; rubble is difficult terrain.");
  b.notes.add("Climbing a crumbling wall takes a DC 12 Athletics check.");
}

function camp(b: Builder): (x: number, y: number) => boolean {
  meadow(b);
  const cx = Math.floor(b.w / 2) + b.rng.int(-2, 2);
  const cy = Math.floor(b.h / 2) + b.rng.int(-1, 1);
  const radius = Math.min(b.w, b.h) * 0.38;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (Math.hypot(x - cx, y - cy) < radius * (0.75 + b.rng.next() * 0.2)) b.ground[y]![x] = "dirt";
  campfire(b, cx, cy);
  // Logs as seats around the fire.
  b.place("log", cx - 1, cy - 2, 3, 1);
  b.place("log", cx - 1, cy + 2, 3, 1);
  // Tents in a ring.
  const tents = b.rng.int(3, 5);
  const start = b.rng.next() * Math.PI * 2;
  for (let i = 0; i < tents; i++) {
    const a = start + (i / tents) * Math.PI * 2;
    const [w, h] = b.rng.chance(0.5) ? [3, 2] : [2, 2];
    b.place("tent", Math.round(cx + Math.cos(a) * radius * 0.65 - w / 2), Math.round(cy + Math.sin(a) * radius * 0.6 - h / 2), w, h);
  }
  b.scatter("crate", b.rng.int(2, 4), () => [1, 1], (x, y) => Math.hypot(x - cx, y - cy) < radius);
  b.scatter("barrel", b.rng.int(1, 3), () => [1, 1], (x, y) => Math.hypot(x - cx, y - cy) < radius);
  b.scatter("chest", 1, () => [1, 1], (x, y) => Math.hypot(x - cx, y - cy) < radius);
  treeLine(b, 3);
  b.scatter("tree", Math.round((b.w * b.h) / 90), () => [1, 1], (x, y) => Math.hypot(x - cx, y - cy) > radius + 1, { ground: ["grass", "dirt"] });
  b.scatter("bush", Math.round((b.w * b.h) / 40), () => [1, 1], (x, y) => Math.hypot(x - cx, y - cy) > radius);
  b.notes.add("Tents block sight; anyone inside one is hidden until the flap is opened.");
  b.notes.add("Lookouts: one bandit watches the trees (passive Perception 12); the rest are around the fire.");
  return (x, y) => Math.hypot(x - cx, y - cy) < radius;
}

// ---------------------------------------------------------------------------
// Cave

function cave(b: Builder) {
  let carved = false;
  for (let attempt = 0; attempt < 20 && !carved; attempt++) {
    let cells = grid(b.w, b.h, false).map((row, y) => row.map((_, x) => edgeDist(b, x, y) > 0 && !b.rng.chance(0.42)));
    for (let step = 0; step < 4; step++) {
      cells = cells.map((row, y) =>
        row.map((open, x) => {
          if (edgeDist(b, x, y) === 0) return false;
          let rock = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !cells[y + dy]?.[x + dx]) rock++;
          return open ? rock < 5 : rock < 4;
        }));
    }
    // Keep the biggest cavern.
    const seen = grid(b.w, b.h, false);
    let biggest: Cell[] = [];
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (!cells[y]![x] || seen[y]![x]) continue;
        const region: Cell[] = [];
        const stack: Cell[] = [[x, y]];
        seen[y]![x] = true;
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          region.push([cx, cy]);
          for (const [dx, dy] of N4) {
            if (cells[cy + dy]?.[cx + dx] && !seen[cy + dy]![cx + dx]) {
              seen[cy + dy]![cx + dx] = true;
              stack.push([cx + dx, cy + dy]);
            }
          }
        }
        if (region.length > biggest.length) biggest = region;
      }
    }
    if (biggest.length < b.w * b.h * 0.4) continue;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) [b.ground[y]![x], b.region[y]![x]] = ["rock", -1];
    for (const [x, y] of biggest) [b.ground[y]![x], b.region[y]![x]] = ["cave", 0];
    carved = true;
  }
  if (!carved) {
    // Unlucky noise every time: fall back to one big oval chamber.
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const open = ((x - b.w / 2) / (b.w / 2 - 1)) ** 2 + ((y - b.h / 2) / (b.h / 2 - 1)) ** 2 < 1;
        [b.ground[y]![x], b.region[y]![x]] = open ? ["cave", 0] : ["rock", -1];
      }
    }
  }

  const floor: Cell[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.walkable(x, y)) floor.push([x, y]);
  // A dark pool.
  if (b.rng.chance(0.6)) {
    const start = b.rng.pick(floor);
    const pool: Cell[] = [start];
    const size = b.rng.int(5, 12);
    for (let i = 0; i < 60 && pool.length < size; i++) {
      const [px, py] = b.rng.pick(pool);
      const [dx, dy] = b.rng.pick(N4);
      if (b.walkable(px + dx, py + dy) && !pool.some(([x, y]) => x === px + dx && y === py + dy)) pool.push([px + dx, py + dy]);
    }
    for (const [x, y] of pool) b.ground[y]![x] = "water";
    b.notes.add("The pool is waist-deep: difficult terrain, and Small creatures must swim.");
  }
  const area = floor.length;
  b.scatter("stalagmite", Math.round(area / 45), () => [1, 1], undefined, { ground: ["cave"] });
  b.scatter("rubble", Math.round(area / 35), () => [1, 1], undefined, { ground: ["cave"] });
  const glows = b.rng.int(2, 4);
  for (let i = 0; i < glows; i++) {
    const [x, y] = b.rng.pick(floor);
    if (b.place("mushrooms", x, y, 1, 1, { ground: ["cave"] })) b.light(x + 0.5, y + 0.5, GLOW);
  }
  if (b.rng.chance(0.4)) {
    const [x, y] = b.rng.pick(floor);
    campfire(b, x, y);
  }
  if (b.rng.chance(0.4)) b.scatter("chest", 1, () => [1, 1], undefined, { ground: ["cave"] });
  b.notes.add("Darkness: the cave is unlit apart from what's marked. Stalagmites give three-quarters cover.");
  b.notes.add("Loose scree is difficult terrain.");
}

// ---------------------------------------------------------------------------
// Buildings

interface Hall {
  x: number;
  y: number;
  w: number;
  h: number;
  door: Cell;
}

/** A building with a street along the bottom; returns the main hall. */
function building(b: Builder): Hall {
  const street = 3;
  for (let y = b.h - street; y < b.h; y++) for (let x = 0; x < b.w; x++) b.ground[y]![x] = "stone";
  for (let y = 0; y < b.h - street; y++) for (let x = 0; x < b.w; x++) [b.ground[y]![x], b.region[y]![x]] = ["dirt", 0];
  const hall = { x: 1, y: 1, w: b.w - 2, h: b.h - street - 1 } as Hall;
  b.room(hall.x, hall.y, hall.w, hall.h, 1, "wood");
  const bottom = hall.y + hall.h - 1;
  const doorX = hall.x + b.rng.int(Math.floor(hall.w * 0.25), Math.floor(hall.w * 0.75));
  b.opening([doorX, bottom], [doorX, bottom + 1], "door");
  hall.door = [doorX, bottom];
  // Windows along the front, away from the door.
  for (let x = hall.x + 2; x < hall.x + hall.w - 2; x += b.rng.int(3, 5)) {
    if (Math.abs(x - doorX) > 2) b.opening([x, bottom], [x, bottom + 1], "window");
  }
  for (let y = hall.y + 2; y < bottom - 1; y += b.rng.int(4, 6)) {
    b.opening([hall.x, y], [hall.x - 1, y], "window");
    b.opening([hall.x + hall.w - 1, y], [hall.x + hall.w, y], "window");
  }
  return hall;
}

/** Lamps along a room's walls. */
function lamps(b: Builder, x: number, y: number, w: number, h: number, count: number) {
  for (let i = 0; i < count; i++) b.light(x + ((i + 0.5) / count) * w, y + 0.5, LAMP);
  if (h > 6) b.light(x + w / 2, y + h - 0.5, LAMP);
}

function shop(b: Builder) {
  const hall = building(b);
  // Storeroom along the back, behind a partition with a door.
  const depth = b.rng.int(3, 4);
  b.room(hall.x, hall.y, hall.w, depth, 2, "wood");
  const partY = hall.y + depth;
  const storeDoor = b.rng.chance(0.5) ? hall.x + 1 : hall.x + hall.w - 2;
  b.opening([storeDoor, partY - 1], [storeDoor, partY], "door");
  if (b.rng.chance(0.6)) {
    const backX = hall.x + b.rng.int(2, hall.w - 3);
    b.opening([backX, hall.y], [backX, hall.y - 1], "door");
  }
  // Counter across the shop floor with a gap at the storeroom door's side.
  const counterY = partY + 2;
  const gapLeft = storeDoor < hall.x + hall.w / 2;
  const counterLen = Math.max(3, Math.floor(hall.w * 0.55));
  const counterX = gapLeft ? hall.x + 2 : hall.x + hall.w - 2 - counterLen;
  b.place("counter", counterX, counterY, counterLen, 1);
  b.place("chest", gapLeft ? counterX + counterLen - 1 : counterX, counterY - 1);
  // Shelves on the side walls, display tables on the floor, stock in the back.
  const floorTop = counterY + 2;
  const floorBottom = hall.y + hall.h - 2;
  for (const x of [hall.x, hall.x + hall.w - 1]) {
    for (let y = floorTop; y + 2 <= floorBottom; y += 3) b.place("shelf", x, y, 1, 2);
  }
  for (let x = hall.x + 1; x + 3 < hall.x + hall.w; x += 4) b.place("shelf", x, hall.y, 3, 1, { region: 2 });
  const floorArea = hall.w * Math.max(1, floorBottom - floorTop);
  b.scatter("table", Math.max(2, Math.round(floorArea / 25)), () => (b.rng.chance(0.5) ? [2, 1] : [1, 2]), (x, y) => y >= floorTop && y <= floorBottom - 1, { region: 1 });
  b.scatter("barrel", Math.max(2, Math.round(floorArea / 30)), () => [1, 1], undefined, { region: 1 });
  b.scatter("crate", Math.round(floorArea / 40), () => [1, 1], (x, y) => y >= floorTop, { region: 1 });
  b.scatter("crate", b.rng.int(3, 6), () => [1, 1], undefined, { region: 2 });
  b.scatter("barrel", b.rng.int(1, 3), () => [1, 1], undefined, { region: 2 });
  b.place("rug", hall.door[0] - 1, hall.door[1] - 2, 3, 2);
  lamps(b, hall.x, hall.y + depth, hall.w, hall.h - depth, 2);
  b.light(hall.x + hall.w / 2, hall.y + 0.5, LAMP);
  b.notes.add("The counter gives half cover; vaulting it costs 5 extra feet of movement.");
  b.notes.add("Shelves block sight. Knocking one over (DC 13 Athletics) makes a 2-square line of difficult terrain.");
}

function tavern(b: Builder) {
  const hall = building(b);
  // Kitchen on one side.
  const kw = b.rng.int(4, 5);
  const kitchenLeft = b.rng.chance(0.5);
  const kx = kitchenLeft ? hall.x : hall.x + hall.w - kw;
  b.room(kx, hall.y, kw, Math.floor(hall.h * 0.6), 2, "stone");
  const partX = kitchenLeft ? kx + kw : kx - 1;
  const kdoorY = hall.y + b.rng.int(1, Math.floor(hall.h * 0.6) - 2);
  b.opening([partX, kdoorY], [kitchenLeft ? partX - 1 : partX + 1, kdoorY], "door");
  // Kitchen hearth against the back wall.
  const stoveX = kx + b.rng.int(1, kw - 3);
  if (b.place("hearth", stoveX, hall.y, 2, 1, { region: 2 })) b.light(stoveX + 1, hall.y + 0.5, FIRE);
  b.scatter("barrel", 2, () => [1, 1], undefined, { region: 2 });
  b.scatter("table", 1, () => [2, 1], undefined, { region: 2 });

  // Bar along the kitchen partition, with stools.
  const barX = kitchenLeft ? partX + 2 : partX - 2;
  const barTop = hall.y + 1;
  const barLen = Math.max(3, Math.floor(hall.h * 0.5));
  if (b.place("counter", barX, barTop, 1, barLen)) {
    for (let y = barTop; y < barTop + barLen; y += 2) b.place("chair", kitchenLeft ? barX + 1 : barX - 1, y);
  }
  b.place("barrel", kitchenLeft ? partX + 1 : partX - 1, barTop + barLen + 1);

  // Hearth on the far wall.
  const hx = kitchenLeft ? hall.x + hall.w - 1 : hall.x;
  const hy = hall.y + Math.floor(hall.h / 2) - 1;
  if (b.place("hearth", hx, hy, 1, 2) ?? b.place("hearth", hx, hy + 1, 1, 2)) b.light(hx + 0.5, hy + 1, FIRE);
  b.place("rug", kitchenLeft ? hx - 3 : hx + 1, hy - 1, 3, 4);

  // Tables with chairs around them.
  const tables = Math.round((hall.w * hall.h) / 30);
  let placed = 0;
  for (let i = 0; i < tables * 30 && placed < tables; i++) {
    const [w, h] = b.rng.weighted([[[2, 2], 3], [[2, 1], 2], [[1, 2], 2]] as const);
    const x = b.rng.int(hall.x + 1, hall.x + hall.w - 1 - w);
    const y = b.rng.int(hall.y + 1, hall.y + hall.h - 2 - h);
    // Leave a ring for chairs and an aisle.
    let roomy = true;
    for (let cy = y - 1; cy <= y + h && roomy; cy++) for (let cx = x - 1; cx <= x + w && roomy; cx++) if (!b.free(cx, cy) || b.region[cy]![cx] !== 1) roomy = false;
    if (!roomy || !b.place("table", x, y, w, h)) continue;
    placed++;
    const seats: Cell[] = [];
    for (let cx = x; cx < x + w; cx++) seats.push([cx, y - 1], [cx, y + h]);
    for (let cy = y; cy < y + h; cy++) seats.push([x - 1, cy], [x + w, cy]);
    for (const [cx, cy] of b.rng.shuffle(seats).slice(0, b.rng.int(2, seats.length))) b.place("chair", cx, cy);
  }
  // Stairs up in a front corner.
  b.place("stairs", kitchenLeft ? hall.x + hall.w - 2 : hall.x, hall.y + hall.h - 4, 1, 3);
  lamps(b, hall.x, hall.y, hall.w, hall.h, 3);
  b.notes.add("Tables can be tipped over (bonus action) for half cover. Chairs and stools make improvised weapons (1d4).");
  b.notes.add("The bar gives half cover; vaulting it costs 5 extra feet of movement. Shoving someone into a hearth deals 1d6 fire damage.");
}

// ---------------------------------------------------------------------------
// Zones, walls, assembly

/** BFS distances from a set of cells, honoring walls, closed terrain and blocking props. */
function distances(b: Builder, walls: Set<string>, from: Cell[]): number[][] {
  const blocked = grid(b.w, b.h, false);
  for (const p of b.props) if (p.blocks !== "none") for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) blocked[y]![x] = true;
  const dist = grid(b.w, b.h, Infinity);
  const queue: Cell[] = [];
  for (const [x, y] of from) {
    if (!b.walkable(x, y) || blocked[y]![x]) continue;
    dist[y]![x] = 0;
    queue.push([x, y]);
  }
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!b.walkable(nx, ny) || blocked[ny]![nx] || dist[ny]![nx] !== Infinity || walls.has(edgeKey([x, y], [nx, ny]))) continue;
      dist[ny]![nx] = dist[y]![x]! + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

/** Wall edges between different regions, plus free-standing walls; doors and windows stay open to movement only as doors. */
function wallEdges(b: Builder): Map<string, "wall" | Opening> {
  const edges = new Map<string, "wall" | Opening>();
  const add = (a: Cell, c: Cell) => {
    const key = edgeKey(a, c);
    edges.set(key, b.openings.get(key) ?? "wall");
  };
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (x > 0 && b.region[y]![x] !== b.region[y]![x - 1]) add([x - 1, y], [x, y]);
      if (y > 0 && b.region[y]![x] !== b.region[y - 1]![x]) add([x, y - 1], [x, y]);
    }
  }
  for (const key of b.extraWalls) if (!edges.has(key)) edges.set(key, "wall");
  return edges;
}

/** Merge unit edges into segments: runs of plain wall join up, doors and windows stay one cell wide. */
function segments(edges: Map<string, "wall" | Opening>): BattleWall[] {
  const out: BattleWall[] = [];
  const parse = (k: string) => k.slice(2).split(",").map(Number) as Cell;
  for (const dir of ["h", "v"] as const) {
    const keys = [...edges.keys()].filter((k) => k[0] === dir).map(parse);
    // Sort along the run: rows for horizontal edges, columns for vertical ones.
    keys.sort((a, c) => (dir === "h" ? a[1] - c[1] || a[0] - c[0] : a[0] - c[0] || a[1] - c[1]));
    let run: BattleWall | null = null;
    for (const [x, y] of keys) {
      const kind = edges.get(`${dir}:${x},${y}`)!;
      const seg: BattleWall = dir === "h" ? { x1: x, y1: y, x2: x + 1, y2: y, door: kind === "door" } : { x1: x, y1: y, x2: x, y2: y + 1, door: kind === "door" };
      if (kind === "window") seg.window = true;
      if (kind === "wall" && run && run.x2 === seg.x1 && run.y2 === seg.y1) {
        run.x2 = seg.x2;
        run.y2 = seg.y2;
        continue;
      }
      out.push(seg);
      run = kind === "wall" ? seg : null;
    }
  }
  return out;
}

/** Swap x and y everywhere, so outdoor maps run either way. */
function transpose(m: Battlemap): Battlemap {
  const sw = <T extends { x: number; y: number }>(o: T) => ({ ...o, x: o.y, y: o.x });
  return {
    ...m,
    width: m.height,
    height: m.width,
    ground: Array.from({ length: m.width }, (_, y) => Array.from({ length: m.height }, (_, x) => m.ground[x]![y]!)),
    walls: m.walls.map((w) => ({ ...w, x1: w.y1, y1: w.x1, x2: w.y2, y2: w.x2 })),
    props: m.props.map((p) => ({ ...sw(p), w: p.h, h: p.w })),
    lights: m.lights.map(sw),
    zones: { party: m.zones.party.map(([x, y]): Cell => [y, x]), enemies: m.zones.enemies.map(([x, y]): Cell => [y, x]) },
  };
}

const TITLES: Record<BattlemapSetting, string[]> = {
  clearing: ["Woodland clearing", "Mossy glade", "Hunter's clearing", "Quiet glade"],
  road: ["Ambush on the road", "Forest road", "Waylaid cart", "King's road"],
  cave: ["Cave grotto", "Dripping cavern", "Hidden cave", "Bandit hollow"],
  shop: ["Shop floor"],
  tavern: ["The Prancing Stag", "The Rusty Tankard", "The Sleeping Giant", "The Gilded Goose", "The Drowned Rat", "The Wayfarer's Rest"],
  ruins: ["Ruined chapel", "Old watchtower ruins", "Forgotten shrine", "Crumbling keep"],
  camp: ["Bandit camp", "Raiders' camp", "Smugglers' camp"],
};

export function generateBattlemap(opts: BattlemapOptions = {}): Battlemap {
  const rng = createRng(opts.seed);
  const setting = !opts.setting || opts.setting === "random" ? rng.pick(Object.keys(BATTLEMAP_SETTINGS) as BattlemapSetting[]) : opts.setting;
  const [w, h] = SIZES[opts.size ?? "medium"];
  const night = !!opts.night;

  // A few tries in case props leave the enemies unreachable (rare, since blocking props keep a clear ring).
  for (let attempt = 0; ; attempt++) {
    const b = new Builder(createRng(`${rng.seed}:${attempt}`), w, h, setting === "cave" ? "rock" : "grass");
    let enemyArea: ((x: number, y: number) => boolean) | undefined;
    if (setting === "clearing") clearing(b);
    else if (setting === "road") enemyArea = road(b);
    else if (setting === "cave") cave(b);
    else if (setting === "shop" || setting === "tavern") {
      if (setting === "shop") shop(b);
      else tavern(b);
      enemyArea = (x, y) => b.region[y]![x]! >= 1;
    }
    else if (setting === "ruins") ruins(b);
    else enemyArea = camp(b);

    const edges = wallEdges(b);
    const blocking = new Set([...edges].filter(([, k]) => k !== "door").map(([key]) => key));

    // The party comes in from the street, the road's start or the left edge (the cave's left end).
    let entry: Cell[];
    if (setting === "shop" || setting === "tavern") entry = cellsWhere(b, (x, y) => y >= h - 1);
    else if (setting === "cave") {
      const xs = cellsWhere(b, (x, y) => b.walkable(x, y)).map(([x]) => x);
      const minX = Math.min(...xs);
      entry = cellsWhere(b, (x) => x <= minX + 1);
    } else entry = cellsWhere(b, (x, y) => x === 0 && y > 1 && y < h - 2);
    const fromParty = distances(b, blocking, entry);
    const reachable = cellsWhere(b, (x, y) => fromParty[y]![x]! < Infinity && !b.used[y]![x]);
    if (!reachable.length && attempt < 8) continue;

    const party = reachable.filter(([x, y]) => fromParty[y]![x]! <= 2);
    const far = Math.max(...reachable.map(([x, y]) => fromParty[y]![x]!));
    // Enemies start in their area (the camp, the building, the tree line), or else as far from the party as it gets.
    let enemies = enemyArea ? reachable.filter(([x, y]) => enemyArea!(x, y) && fromParty[y]![x]! > 3) : [];
    if (!enemies.length) enemies = reachable.filter(([x, y]) => fromParty[y]![x]! >= far * 0.6);
    const enemyCells = b.rng.shuffle(enemies);
    if ((!party.length || !enemyCells.length) && attempt < 8) continue;

    const outdoor = BATTLEMAP_SETTINGS[setting].outdoor;
    if (night && outdoor) b.notes.add("Night: dim light under the open sky; the shadows past the firelight are darkness.");
    let map: Battlemap = {
      seed: rng.seed,
      setting,
      title: opts.title ?? b.rng.pick(TITLES[setting]),
      night,
      width: w,
      height: h,
      ground: b.ground,
      walls: segments(edges),
      props: [...b.props.filter((p) => UNDERLAY.has(p.kind)), ...b.props.filter((p) => !UNDERLAY.has(p.kind))],
      lights: b.lights,
      darkness: setting === "cave" ? 1 : night ? (outdoor ? 0.75 : 0.6) : 0,
      zones: { party: b.rng.shuffle(party), enemies: enemyCells },
      notes: [...b.notes],
    };
    // Outdoor maps can run top-to-bottom too.
    if (outdoor && b.rng.chance(0.5)) map = transpose(map);
    return map;
  }
}

function cellsWhere(b: Builder, test: (x: number, y: number) => boolean): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.walkable(x, y) && test(x, y)) out.push([x, y]);
  return out;
}

/** Everything that blocks movement: wall and window edges (not doors), rock and blocking props. */
function movementBlockers(m: Battlemap): { edges: Set<string>; cells: Set<string> } {
  const edges = new Set<string>();
  for (const w of m.walls) {
    if (w.door) continue;
    if (w.y1 === w.y2) for (let x = Math.min(w.x1, w.x2); x < Math.max(w.x1, w.x2); x++) edges.add(`h:${x},${w.y1}`);
    else for (let y = Math.min(w.y1, w.y2); y < Math.max(w.y1, w.y2); y++) edges.add(`v:${w.x1},${y}`);
  }
  const cells = new Set<string>();
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.ground[y]![x] === "rock") cells.add(`${x},${y}`);
  for (const p of m.props) if (p.blocks !== "none") for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) cells.add(`${x},${y}`);
  return { edges, cells };
}

/** Grid cells reachable on foot from `from` (doors count as open). */
export function reachableCells(m: Battlemap, from: readonly Cell[]): Set<string> {
  const { edges, cells } = movementBlockers(m);
  const seen = new Set<string>();
  const queue = from.filter(([x, y]) => !cells.has(`${x},${y}`));
  for (const [x, y] of queue) seen.add(`${x},${y}`);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of N4) {
      const n: Cell = [x + dx, y + dy];
      const key = `${n[0]},${n[1]}`;
      if (n[0] < 0 || n[1] < 0 || n[0] >= m.width || n[1] >= m.height || seen.has(key) || cells.has(key) || edges.has(edgeKey([x, y], n))) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return seen;
}

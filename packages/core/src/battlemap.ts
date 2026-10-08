import { createRng, valueNoise as noise, type Rng } from "./rng.ts";
import type { WallSegment } from "./dungeon.ts";
import { lockText, type DoorLock } from "./locks.ts";
import { generateTrap, trapText, type Trap } from "./traps.ts";
import { floorOutlines, loopWalls, smoothLoop, type Point } from "./outline.ts";

// ---------------------------------------------------------------------------
// Small, single-fight battlemaps: a clearing, a shop floor, a cave grotto...
// Everything is in grid cells; the Foundry importer turns it into a scene.

export type BattlemapSetting = "clearing" | "road" | "cave" | "shop" | "tavern" | "ruins" | "camp" | "town" | "graveyard" | "temple" | "docks" | "bridge" | "mine" | "farm" | "swamp";
export type BattlemapSize = "small" | "medium" | "large";

export const BATTLEMAP_SETTINGS: Record<BattlemapSetting, { label: string; outdoor: boolean }> = {
  clearing: { label: "Forest clearing", outdoor: true },
  road: { label: "Road ambush", outdoor: true },
  cave: { label: "Cave grotto", outdoor: false },
  shop: { label: "Shop", outdoor: false },
  tavern: { label: "Tavern", outdoor: false },
  ruins: { label: "Ruins", outdoor: true },
  camp: { label: "Bandit camp", outdoor: true },
  town: { label: "Town streets", outdoor: true },
  graveyard: { label: "Graveyard", outdoor: true },
  temple: { label: "Temple", outdoor: false },
  docks: { label: "Docks", outdoor: true },
  bridge: { label: "River bridge", outdoor: true },
  mine: { label: "Mine", outdoor: false },
  farm: { label: "Farmstead", outdoor: true },
  swamp: { label: "Swamp", outdoor: true },
};

export type TownSize = "hamlet" | "village" | "town" | "city";
/** Map size and number of cross streets per town size. */
const TOWN_SIZES: Record<TownSize, [w: number, h: number, crossStreets: number]> = {
  hamlet: [30, 22, 0], village: [40, 30, 1], town: [52, 38, 2], city: [64, 46, 3],
};

/** A building on a town map. Its interior is the region with this id; its roof is drawn separately. */
export interface TownBuilding {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The floor cell just inside the front door. */
  door: Cell;
  kind: "house" | "shop" | "inn" | "temple" | "hall";
  label?: string;
}

const SIZES: Record<BattlemapSize, [number, number]> = { small: [20, 15], medium: [28, 20], large: [36, 26] };

export type Ground = "grass" | "dirt" | "road" | "stone" | "wood" | "cave" | "water" | "rock" | "mud";

export type PropKind =
  | "tree" | "bush" | "boulder" | "log" | "stalagmite" | "mushrooms" | "rubble" | "pillar" | "altar"
  | "table" | "chair" | "barrel" | "crate" | "counter" | "shelf" | "bed" | "chest" | "hearth" | "rug" | "stairs"
  | "campfire" | "tent" | "cart" | "well"
  | "tombstone" | "grave" | "statue" | "pew" | "boat" | "crops" | "hay" | "fence" | "mineCart" | "support" | "deadTree" | "reeds";

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
  /** The edge of a ledge: blocks movement (climb it) but not sight. */
  cliff?: boolean;
}

/** Raised ground: its squares, how high, and where a slope or steps lead up. */
export interface Ledge {
  cells: Cell[];
  height: number;
  ramps: Cell[];
}

export type FightLayout = "standoff" | "ambush" | "defend";

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
  /** Smoothed outline of the open floor (caves); the walls follow it. */
  outlines?: Point[][];
  /** Town maps: the buildings, whose roofs go on an overhead layer. */
  buildings?: TownBuilding[];
  /** Traps on the ground: the squares that set each one off. */
  traps?: PlacedTrap[];
  /** Raised ground with cliff edges. */
  ledges?: Ledge[];
  /** How the fight is set up. */
  layout?: FightLayout;
}

export interface PlacedTrap {
  cells: Cell[];
  trap: Trap;
}

export interface BattlemapOptions {
  setting?: BattlemapSetting | "random";
  size?: BattlemapSize;
  night?: boolean;
  /** Title for the map, e.g. the shop's name. */
  title?: string;
  /** Town maps: how big a place. */
  townSize?: TownSize;
  /** Lock storerooms, back doors and houses. Default true. */
  locks?: boolean;
  /** Hide traps where they make sense (camps, roads, ruins, caves). Default false. */
  traps?: boolean;
  /** For trap damage and lock DCs. Default 3. */
  partyLevel?: number;
  /** Raised ledges, outcrops and daises where they fit. Default true. */
  elevation?: boolean;
  /** Standoff (default), ambush (enemies hidden close on both flanks) or defend (hold a point against attackers from the edges). */
  layout?: FightLayout | "random";
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
  well: { blocks: "move", cover: "half" },
  tombstone: { blocks: "none", cover: "half" },
  grave: { blocks: "none", difficult: true },
  statue: { blocks: "all", cover: "three-quarters" },
  pew: { blocks: "none", cover: "half", difficult: true },
  boat: { blocks: "none", difficult: true },
  crops: { blocks: "none", difficult: true },
  hay: { blocks: "none", cover: "half", difficult: true },
  fence: { blocks: "none", cover: "half", difficult: true },
  mineCart: { blocks: "none", cover: "half" },
  support: { blocks: "none" },
  deadTree: { blocks: "all", cover: "three-quarters" },
  reeds: { blocks: "none", difficult: true },
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
/** What a door is for, which decides whether it's locked. */
type DoorRole = "front" | "store" | "back" | "kitchen" | "house";

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
  readonly doorRoles = new Map<string, DoorRole>();
  /** Free-standing wall runs, e.g. broken ruin walls (edge keys). */
  readonly extraWalls = new Set<string>();
  /** Edges of raised ground (edge keys). */
  readonly cliffEdges = new Set<string>();
  readonly ledges: Ledge[] = [];
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
  opening(a: Cell, b: Cell, kind: Opening, role?: DoorRole) {
    this.openings.set(edgeKey(a, b), kind);
    if (role) this.doorRoles.set(edgeKey(a, b), role);
    for (const [x, y] of [a, b]) if (this.inside(x, y)) this.used[y]![x] = true;
  }
}

const grid = <T>(w: number, h: number, v: T): T[][] => Array.from({ length: h }, () => new Array<T>(w).fill(v));

/** Unit edge between two 4-neighbor cells: "h:x,y" is the top edge of (x, y), "v:x,y" its left edge. */
function edgeKey(a: Cell, b: Cell): string {
  const [x, y] = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  return a[0] === b[0] ? `h:${x},${y}` : `v:${x},${y}`;
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
// More places to fight

/** A low fence (or wall) as runs of props, with gaps; hopping it costs extra movement. */
function fenceLine(b: Builder, x: number, y: number, len: number, horizontal: boolean, gaps: number[] = []) {
  let start = 0;
  for (let i = 0; i <= len; i++) {
    if (i < len && !gaps.includes(i)) continue;
    const run = i - start;
    if (run > 0) {
      if (horizontal) b.place("fence", x + start, y, run, 1);
      else b.place("fence", x, y + start, 1, run);
    }
    start = i + 1;
  }
}

/** A small building with walls, a floor and a door on one side; returns its box. */
function hut(b: Builder, x: number, y: number, w: number, h: number, region: number, floor: Ground, door: "n" | "s" | "e" | "w"): { x: number; y: number; w: number; h: number; door: Cell } {
  b.room(x, y, w, h, region, floor);
  const mid = (a: number, len: number) => a + Math.floor(len / 2);
  const [inside, outside]: [Cell, Cell] = door === "s" ? [[mid(x, w), y + h - 1], [mid(x, w), y + h]]
    : door === "n" ? [[mid(x, w), y], [mid(x, w), y - 1]]
    : door === "e" ? [[x + w - 1, mid(y, h)], [x + w, mid(y, h)]]
    : [[x, mid(y, h)], [x - 1, mid(y, h)]];
  b.opening(inside, outside, "door");
  return { x, y, w, h, door: inside };
}

function graveyard(b: Builder): (x: number, y: number) => boolean {
  meadow(b);
  const x0 = 3;
  const y0 = 2;
  const x1 = b.w - 4;
  const y1 = b.h - 3;
  const gateY = Math.floor((y0 + y1) / 2);
  // A path from the gate to the mausoleum.
  const mw = b.rng.int(4, 6);
  const mh = b.rng.int(4, 5);
  const mx = x1 - mw - 1;
  const my = gateY - Math.floor(mh / 2);
  for (let x = x0; x < mx; x++) for (const dy of [0, 1]) b.ground[gateY + dy]![x] = "dirt";
  const crypt = hut(b, mx, my, mw, mh, 1, "stone", "w");
  b.place("altar", crypt.x + Math.floor(mw / 2) - 1, crypt.y + 1, 2, 1, { region: 1 });
  b.place("statue", crypt.x + mw - 2, crypt.y + mh - 2, 1, 1, { region: 1 });
  // Rows of graves: a headstone with a mound in front of it.
  for (let y = y0 + 2; y < y1 - 2; y += 3) {
    if (Math.abs(y - gateY) <= 1 || Math.abs(y + 1 - gateY) <= 1) continue;
    for (let x = x0 + 2; x < mx - 1; x += 2) {
      if (!b.rng.chance(0.78)) continue;
      if (b.rng.chance(0.08)) {
        b.place("grave", x, y + 1, 1, 2);
        continue;
      }
      if (b.place("tombstone", x, y)) for (const dy of [1, 2]) if (b.inside(x, y + dy) && !b.used[y + dy]![x]) b.ground[y + dy]![x] = "dirt";
    }
  }
  b.scatter("statue", b.rng.int(1, 2), () => [2, 2], (x, y) => x > x0 + 1 && x < mx - 2 && y > y0 && y < y1 - 2);
  fenceLine(b, x0, y0, x1 - x0 + 1, true);
  fenceLine(b, x0, y1, x1 - x0 + 1, true);
  fenceLine(b, x0, y0 + 1, y1 - y0 - 1, false, [gateY - y0 - 1, gateY - y0]);
  fenceLine(b, x1, y0 + 1, y1 - y0 - 1, false);
  b.scatter("deadTree", b.rng.int(2, 4), () => [1, 1], (x, y) => x > x0 && x < x1 && y > y0 && y < y1, { ground: ["grass", "dirt"] });
  treeLine(b, 2);
  b.notes.add("Headstones and the low wall give half cover; climbing the wall costs 5 extra feet of movement.");
  b.notes.add("Open graves are 6 feet deep: falling in deals 1d6 bludgeoning, and climbing out is a DC 10 Athletics check.");
  b.notes.add("The mausoleum door is stone and heavy: an action to open (DC 13 Athletics if it's jammed).");
  return (x, y) => x > b.w * 0.45;
}

function temple(b: Builder) {
  const hall = building(b);
  b.room(hall.x, hall.y, hall.w, hall.h, 1, "stone");
  // A vestry in a back corner.
  const vw = b.rng.int(3, 4);
  const vh = b.rng.int(3, 4);
  const left = b.rng.chance(0.5);
  const vx = left ? hall.x : hall.x + hall.w - vw;
  b.room(vx, hall.y, vw, vh, 2, "wood");
  b.opening([left ? vx + vw - 1 : vx, hall.y + 1], [left ? vx + vw : vx - 1, hall.y + 1], "door");
  b.scatter("chest", 1, () => [1, 1], undefined, { region: 2 });
  b.scatter("shelf", 1, () => [2, 1], undefined, { region: 2 });
  const cx = hall.x + Math.floor(hall.w / 2);
  b.place("altar", cx - 1, hall.y + 1, 2, 1);
  for (const sx of [cx - 4, cx + 3]) b.place("statue", sx, hall.y + 1, 1, 1);
  b.light(cx - 1.5, hall.y + 1.5, LAMP);
  b.light(cx + 1.5, hall.y + 1.5, LAMP);
  // Pews in rows on either side of the aisle.
  for (let y = hall.y + 4; y < hall.y + hall.h - 3; y += 2) {
    b.place("pew", cx - 4, y, 3, 1);
    b.place("pew", cx + 2, y, 3, 1);
  }
  // Pillars down both sides.
  for (let y = hall.y + 3; y < hall.y + hall.h - 2; y += 3) {
    b.place("pillar", hall.x + 1, y);
    b.place("pillar", hall.x + hall.w - 2, y);
  }
  lamps(b, hall.x, hall.y + 4, hall.w, hall.h - 4, 2);
  b.notes.add("Pews give half cover and are difficult terrain to climb over; pillars and statues give three-quarters cover.");
  b.notes.add("The altar is sacred: the GM may decide a fiend or undead touching it takes 1d6 radiant damage.");
}

function docks(b: Builder): (x: number, y: number) => boolean {
  const shore = Math.floor(b.h * 0.4);
  meadow(b);
  for (let y = shore; y < b.h; y++) for (let x = 0; x < b.w; x++) b.ground[y]![x] = "water";
  for (let x = 0; x < b.w; x++) for (const y of [shore, shore + 1]) b.ground[y]![x] = "wood";
  for (let x = 0; x < b.w; x++) b.ground[shore - 1]![x] = "road";
  // A warehouse on the shore.
  const ww = b.rng.int(6, 8);
  const wx = b.rng.int(Math.floor(b.w * 0.5), b.w - ww - 2);
  const wh = Math.max(3, shore - 3);
  hut(b, wx, 1, ww, wh, 1, "wood", "s");
  b.scatter("crate", b.rng.int(3, 6), () => [1, 1], undefined, { region: 1 });
  b.scatter("barrel", b.rng.int(2, 4), () => [1, 1], undefined, { region: 1 });
  // Piers out into the water, with boats tied alongside.
  const piers = b.rng.int(2, 3);
  for (let i = 0; i < piers; i++) {
    const px = Math.floor(((i + 0.5) * b.w) / piers) + b.rng.int(-2, 2);
    const end = b.rng.int(b.h - 5, b.h - 2);
    for (let y = shore + 2; y < end; y++) for (const dx of [0, 1]) if (b.inside(px + dx, y)) b.ground[y]![px + dx] = "wood";
    const side = b.rng.chance(0.5) ? -1 : 2;
    b.place("boat", px + (side < 0 ? -1 : 2), b.rng.int(shore + 3, Math.max(shore + 3, end - 4)), 1, 3);
    b.place("barrel", px, end - 1);
    b.light(px + 1, end - 0.5, LAMP);
  }
  b.scatter("crate", b.rng.int(3, 6), () => [1, 1], (x, y) => y === shore || y === shore + 1, { ground: ["wood"] });
  b.scatter("barrel", b.rng.int(2, 4), () => [1, 1], (x, y) => y === shore || y === shore + 1, { ground: ["wood"] });
  for (let x = 3; x < b.w; x += 8) b.light(x + 0.5, shore + 0.5, LAMP);
  b.notes.add("The water is deep: swimming creatures move at half speed and can't take reactions; armor heavier than leather means sinking (DC 12 Athletics each turn).");
  b.notes.add("Shoving someone off a pier drops them 5 feet into the water. Stacked crates give half cover.");
  b.notes.add("Boats rock underfoot: difficult terrain, and a DC 10 Dexterity save on a hit or be knocked prone.");
  return (x, y) => y >= shore;
}

function bridge(b: Builder): (x: number, y: number) => boolean {
  meadow(b);
  const width = b.rng.int(4, 6);
  let rx = Math.floor(b.w / 2) - Math.floor(width / 2);
  const banks: number[] = [];
  for (let y = 0; y < b.h; y++) {
    if (b.rng.chance(0.3)) rx = Math.max(Math.floor(b.w * 0.35), Math.min(Math.floor(b.w * 0.6), rx + b.rng.pick([-1, 1])));
    banks.push(rx);
    for (let i = 0; i < width; i++) b.ground[y]![rx + i] = "water";
    for (const dx of [-1, width]) if (b.rng.chance(0.6)) b.ground[y]![rx + dx] = "dirt";
  }
  const by = Math.floor(b.h / 2) + b.rng.int(-2, 2);
  const bx0 = Math.min(...banks.slice(by - 1, by + 2)) - 2;
  const bx1 = Math.max(...banks.slice(by - 1, by + 2)) + width + 1;
  for (let y = by - 1; y <= by + 1; y++) for (let x = bx0; x <= bx1; x++) b.ground[y]![x] = "wood";
  // A road up to the bridge on both banks.
  for (let x = 0; x < b.w; x++) if (b.ground[by]![x] !== "wood") for (const dy of [-1, 0, 1]) b.ground[by + dy]![x] = "road";
  const offRoad = (_x: number, y: number) => Math.abs(y - by) >= 3;
  b.scatter("reeds", Math.round(b.h * 1.2), () => [1, 1], (x, y) => offRoad(x, y) && [-1, 1].some((d) => b.ground[y]?.[x + d] === "water"));
  treeLine(b, 2, (x, y) => !offRoad(x, y));
  b.scatter("tree", Math.round((b.w * b.h) / 70), () => [1, 1], offRoad, { ground: ["grass", "dirt"] });
  b.scatter("bush", Math.round((b.w * b.h) / 35), () => [1, 1], offRoad, { ground: ["grass", "dirt"] });
  b.scatter("boulder", b.rng.int(2, 4), () => [1, 1], offRoad, { ground: ["grass", "dirt"] });
  b.notes.add("The river is 10 feet deep and fast: a creature in it makes a DC 12 Athletics check at the start of its turn or is swept 10 feet downstream.");
  b.notes.add("The bridge is three squares wide with a low rail: a creature shoved off falls 10 feet into the river.");
  b.notes.add("Reeds along the banks are difficult terrain and lightly obscure whoever crouches in them.");
  return (x) => x > (banks[0] ?? b.w / 2) + width;
}

function mine(b: Builder) {
  cave(b);
  const nearRock = (x: number, y: number) => N4.some(([dx, dy]) => !b.walkable(x + dx, y + dy));
  b.scatter("support", Math.round((b.w * b.h) / 60), () => [1, 1], nearRock, { ground: ["cave"] });
  b.scatter("mineCart", b.rng.int(2, 3), () => [1, 1], (x, y) => !nearRock(x, y), { ground: ["cave"] });
  b.scatter("crate", b.rng.int(2, 4), () => [1, 1], nearRock, { ground: ["cave"] });
  b.scatter("barrel", b.rng.int(1, 3), () => [1, 1], nearRock, { ground: ["cave"] });
  const floor = cellsWhere(b, (x, y) => b.ground[y]![x] === "cave" && !b.used[y]![x] && nearRock(x, y));
  for (let i = 0; i < 3 && floor.length; i++) {
    const [x, y] = b.rng.pick(floor);
    b.light(x + 0.5, y + 0.5, LAMP);
  }
  b.notes.add("Timber props hold up the roof: knocking one out (DC 15 Athletics) brings down rubble in a 10-foot square (DC 13 Dexterity save, 2d10 bludgeoning).");
  b.notes.add("Mine carts give half cover; shoving a loaded cart (DC 12 Athletics) sends it 20 feet: 2d6 bludgeoning to whatever it hits.");
}

function farm(b: Builder): (x: number, y: number) => boolean {
  meadow(b);
  // Farmhouse and barn along the top, a fenced field below.
  const house = hut(b, 2, 2, b.rng.int(6, 7), b.rng.int(4, 5), 1, "wood", "s");
  b.place("table", house.x + 1, house.y + 1, 2, 1, { region: 1 });
  b.place("bed", house.x + house.w - 2, house.y + 1, 1, 2, { region: 1 });
  b.place("hearth", house.x, house.y + house.h - 2, 1, 1, { region: 1 });
  b.light(house.x + 0.5, house.y + house.h - 1.5, FIRE);
  const bw = b.rng.int(7, 9);
  const barn = hut(b, b.w - bw - 3, 2, bw, b.rng.int(5, 6), 2, "dirt", "s");
  b.scatter("hay", b.rng.int(3, 5), () => (b.rng.chance(0.5) ? [2, 1] : [1, 2]), undefined, { region: 2 });
  b.scatter("barrel", b.rng.int(1, 2), () => [1, 1], undefined, { region: 2 });
  b.place("well", house.x + house.w + 2, house.y + house.h + 1);
  b.scatter("cart", 1, () => [2, 3], (x, y) => y > 2 && y < 10, { ground: ["grass", "dirt"] });
  // The field.
  const fx0 = 3;
  const fy0 = Math.floor(b.h * 0.5);
  const fx1 = b.w - 4;
  const fy1 = b.h - 3;
  for (let y = fy0 + 1; y < fy1; y++) for (let x = fx0 + 1; x < fx1; x++) b.ground[y]![x] = "dirt";
  for (let y = fy0 + 1; y < fy1; y += 2) for (let x = fx0 + 1; x < fx1; x++) if (b.rng.chance(0.85)) b.place("crops", x, y);
  fenceLine(b, fx0, fy0, fx1 - fx0 + 1, true, [Math.floor((fx1 - fx0) / 2), Math.floor((fx1 - fx0) / 2) + 1]);
  fenceLine(b, fx0, fy1, fx1 - fx0 + 1, true);
  b.scatter("hay", b.rng.int(1, 3), () => [2, 1], (x, y) => y < fy0 - 1 && y > 7, { ground: ["grass", "dirt"] });
  treeLine(b, 2);
  b.notes.add("The crops are waist-high: difficult terrain, and a crouching Medium creature is lightly obscured in them.");
  b.notes.add("Hay bales give half cover. The barn's loft (DC 10 Athletics up the ladder) gives a view over the whole farm.");
  return (x, y) => y >= fy0 || (x >= barn.x && y < barn.y + barn.h + 1);
}

function swamp(b: Builder): (x: number, y: number) => boolean {
  const n = noise(b.rng, b.w, b.h, 4);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) b.ground[y]![x] = n[y]![x]! < 0.32 ? "water" : n[y]![x]! < 0.52 ? "mud" : "grass";
  let hutBox: { x: number; y: number; w: number; h: number } | null = null;
  if (b.rng.chance(0.6)) {
    for (let i = 0; i < 30 && !hutBox; i++) {
      const x = b.rng.int(Math.floor(b.w * 0.55), b.w - 7);
      const y = b.rng.int(2, b.h - 7);
      hutBox = hut(b, x, y, 5, 4, 1, "wood", b.rng.pick(["s", "w"] as const));
    }
    if (hutBox) {
      b.scatter("barrel", 1, () => [1, 1], undefined, { region: 1 });
      b.scatter("bed", 1, () => [1, 2], undefined, { region: 1 });
      b.light(hutBox.x + 2.5, hutBox.y + 1.5, LAMP);
      b.notes.add("The hut stands on stilts over the water: its floor is 5 feet up, reached by a rickety ladder.");
    }
  }
  b.scatter("deadTree", Math.round((b.w * b.h) / 70), () => [1, 1], undefined, { ground: ["grass", "mud"] });
  b.scatter("tree", Math.round((b.w * b.h) / 140), () => [1, 1], undefined, { ground: ["grass"] });
  b.scatter("reeds", Math.round((b.w * b.h) / 18), () => [1, 1], (x, y) => N4.some(([dx, dy]) => b.ground[y + dy]?.[x + dx] === "water"), { ground: ["mud", "grass", "water"] });
  b.scatter("bush", Math.round((b.w * b.h) / 45), () => [1, 1], undefined, { ground: ["grass"] });
  b.scatter("log", b.rng.int(1, 3), () => (b.rng.chance(0.5) ? [3, 1] : [1, 3]), undefined, { ground: ["mud", "grass"] });
  treeLine(b, 2);
  b.notes.add("Mud is difficult terrain. The pools are waist-deep: difficult terrain, and Small creatures must swim.");
  b.notes.add("Reeds lightly obscure whoever stands in them; things lurk underwater (Stealth +2 for anything that can breathe there).");
  return (x, y) => (hutBox ? x >= hutBox.x - 3 : x > b.w * 0.5) && y >= 0;
}

// ---------------------------------------------------------------------------
// Elevation

/** Grounds a ledge can rise from, per setting. */
const LEDGE_GROUND: Partial<Record<BattlemapSetting, Ground[]>> = {
  clearing: ["grass", "dirt"], road: ["grass", "dirt"], camp: ["grass", "dirt"], ruins: ["stone", "grass"], graveyard: ["grass", "dirt"],
  cave: ["cave"], mine: ["cave"], bridge: ["grass", "dirt"], swamp: ["grass"],
};

/**
 * Raise a blob of open ground into a ledge 5-15 feet high, with cliff edges all round except where
 * a slope leads up. Props on it stay; walls, water and buildings are avoided.
 */
function raiseLedge(b: Builder, setting: BattlemapSetting): Ledge | null {
  const grounds = LEDGE_GROUND[setting];
  if (!grounds) return null;
  // Clear of free-standing walls (ruins) so a cliff never runs into one and the slope always leads somewhere.
  const nearWall = (x: number, y: number) => N4.some(([dx, dy]) => b.extraWalls.has(edgeKey([x, y], [x + dx, y + dy])));
  const ok = (x: number, y: number) => edgeDist(b, x, y) >= 3 && b.region[y]![x] === 0 && grounds.includes(b.ground[y]![x]!) && !nearWall(x, y);
  const n = noise(b.rng, b.w, b.h, 3);
  for (let attempt = 0; attempt < 30; attempt++) {
    // A rounded outcrop with a ragged rim, away from the map's edges.
    const cx = b.rng.int(5, b.w - 6);
    const cy = b.rng.int(4, b.h - 5);
    const rx = b.rng.int(2, Math.max(3, Math.floor(b.w / 8)));
    const ry = b.rng.int(2, Math.max(3, Math.floor(b.h / 7)));
    const cells: Cell[] = [];
    const has = new Set<string>();
    for (let y = cy - ry - 1; y <= cy + ry + 1; y++) {
      for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
        if (!b.inside(x, y) || !ok(x, y)) continue;
        const d = ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2;
        if (d <= 0.8 + n[y]![x]! * 0.45) {
          cells.push([x, y]);
          has.add(`${x},${y}`);
        }
      }
    }
    if (cells.length < 10) continue;
    // Fill pinholes so the top is solid.
    const edges: [Cell, Cell][] = [];
    for (const [x, y] of cells) for (const [dx, dy] of N4) if (!has.has(`${x + dx},${y + dy}`)) edges.push([[x, y], [x + dx, y + dy]]);
    // One or two slopes up, on the side facing the open map.
    const rampCount = b.rng.int(1, 2);
    const ramps: Cell[] = [];
    for (const [inside, outside] of b.rng.shuffle(edges)) {
      if (ramps.length >= rampCount) break;
      if (!b.walkable(...outside) || b.used[outside[1]]![outside[0]] || nearWall(...outside)) continue;
      if (ramps.some(([x, y]) => Math.abs(x - inside[0]) + Math.abs(y - inside[1]) < 4)) continue;
      ramps.push(inside);
    }
    if (!ramps.length) continue;
    const rampSet = new Set(ramps.map(([x, y]) => `${x},${y}`));
    for (const [inside, outside] of edges) {
      // The slope is open along its outer side (and the squares beside it stay clear).
      if (rampSet.has(`${inside[0]},${inside[1]}`) && b.walkable(...outside)) {
        b.used[outside[1]]![outside[0]] = true;
        continue;
      }
      b.cliffEdges.add(edgeKey(inside, outside));
    }
    const ledge: Ledge = { cells, height: b.rng.pick([5, 10, 10, 15]), ramps };
    b.ledges.push(ledge);
    return ledge;
  }
  return null;
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
  b.opening([doorX, bottom], [doorX, bottom + 1], "door", "front");
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
  b.opening([storeDoor, partY - 1], [storeDoor, partY], "door", "store");
  if (b.rng.chance(0.6)) {
    const backX = hall.x + b.rng.int(2, hall.w - 3);
    b.opening([backX, hall.y], [backX, hall.y - 1], "door", "back");
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
  b.opening([partX, kdoorY], [kitchenLeft ? partX - 1 : partX + 1, kdoorY], "door", "kitchen");
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
// Towns

function town(b: Builder, size: TownSize): TownBuilding[] {
  const { rng } = b;
  meadow(b);
  const [, , crosses] = TOWN_SIZES[size];
  // Main street, east to west.
  const midY = Math.floor(b.h / 2) + rng.int(-1, 1);
  for (let x = 0; x < b.w; x++) for (let y = midY - 1; y <= midY + 1; y++) b.ground[y]![x] = "road";
  // Cross streets, north to south.
  const crossXs: number[] = [];
  for (let i = 0; i < crosses; i++) {
    const x = Math.floor(((i + 1) * b.w) / (crosses + 1)) + rng.int(-2, 2);
    crossXs.push(x);
    for (let y = 0; y < b.h; y++) for (let dx = 0; dx < 2; dx++) b.ground[y]![x + dx] = "road";
  }
  // A cobbled square where the main street meets the first cross street, with a well and market stalls.
  const sqX = (crossXs[0] ?? Math.floor(b.w / 2)) + 1;
  const sqW = size === "city" ? 11 : size === "town" ? 9 : size === "village" ? 7 : 0;
  if (sqW) {
    const sqH = sqW - 2;
    for (let y = midY - Math.floor(sqH / 2); y <= midY + Math.floor(sqH / 2); y++) {
      for (let x = sqX - Math.floor(sqW / 2); x <= sqX + Math.floor(sqW / 2); x++) if (b.inside(x, y)) b.ground[y]![x] = "stone";
    }
    b.place("well", sqX, midY - Math.floor(sqH / 2) + 1);
    b.scatter("table", Math.round(sqW / 2), () => [1, 1], (x, y) => Math.abs(x - sqX) <= sqW / 2 - 1 && Math.abs(y - midY) <= sqH / 2 && Math.abs(y - midY) >= 2, { ground: ["stone"] });
    b.scatter("crate", 3, () => [1, 1], (x, y) => Math.abs(x - sqX) <= sqW / 2 && Math.abs(y - midY) <= sqH / 2, { ground: ["stone"] });
    b.scatter("barrel", 2, () => [1, 1], (x, y) => Math.abs(x - sqX) <= sqW / 2 && Math.abs(y - midY) <= sqH / 2, { ground: ["stone"] });
  } else {
    b.place("well", sqX, midY - 3);
  }

  // Lots along the streets. A lot needs a clear ring of open ground around it.
  const buildings: TownBuilding[] = [];
  let id = 1;
  /** Build on a lot if it (and a ring around it) is open ground; returns whether it did. */
  const lot = (x: number, y: number, w: number, h: number, door: Cell, outside: Cell): boolean => {
    for (let cy = y - 1; cy <= y + h; cy++) {
      for (let cx = x - 1; cx <= x + w; cx++) {
        if (cx < 1 || cy < 1 || cx >= b.w - 1 || cy >= b.h - 1) return false;
        if (!["grass", "dirt"].includes(b.ground[cy]![cx]!) || b.region[cy]![cx] !== 0 || b.used[cy]![cx]) return false;
      }
    }
    b.room(x, y, w, h, id, "wood");
    b.opening(door, outside, "door", "house");
    // A window on the back wall.
    const back: [Cell, Cell] = outside[1] > door[1] ? [[x + Math.floor(w / 2), y], [x + Math.floor(w / 2), y - 1]]
      : outside[1] < door[1] ? [[x + Math.floor(w / 2), y + h - 1], [x + Math.floor(w / 2), y + h]]
      : outside[0] > door[0] ? [[x, y + Math.floor(h / 2)], [x - 1, y + Math.floor(h / 2)]]
      : [[x + w - 1, y + Math.floor(h / 2)], [x + w, y + Math.floor(h / 2)]];
    b.opening(back[0], back[1], "window");
    buildings.push({ id, x, y, w, h, door, kind: "house" });
    id++;
    return true;
  };
  for (const side of [-1, 1]) {
    for (let x = rng.int(1, 3); x < b.w - 5; ) {
      const lw = rng.int(4, 7);
      const lh = rng.int(4, 6);
      const gap = rng.int(0, 1);
      const dx = x + Math.floor(lw / 2);
      const y0 = side < 0 ? midY - 2 - gap - lh : midY + 2 + gap;
      const built = side < 0 ? lot(x, y0, lw, lh, [dx, y0 + lh - 1], [dx, y0 + lh]) : lot(x, y0, lw, lh, [dx, y0], [dx, y0 - 1]);
      // Slide along until something fits, then leave a gap.
      x += built ? lw + rng.int(1, 3) : 1;
    }
  }
  for (const cx of crossXs) {
    for (const side of [-1, 1]) {
      for (let y = rng.int(1, 3); y < b.h - 5; ) {
        const lw = rng.int(4, 6);
        const lh = rng.int(4, 6);
        const gap = rng.int(0, 1);
        const dy = y + Math.floor(lh / 2);
        const x0 = side < 0 ? cx - 1 - gap - lw : cx + 2 + gap;
        const built = side < 0 ? lot(x0, y, lw, lh, [x0 + lw - 1, dy], [x0 + lw, dy]) : lot(x0, y, lw, lh, [x0, dy], [x0 - 1, dy]);
        y += built ? lh + rng.int(1, 3) : 1;
      }
    }
  }
  // A little furniture in each building.
  for (const bld of buildings) {
    b.scatter("table", 1, () => [1, 1], undefined, { region: bld.id });
    b.scatter("chair", rng.int(1, 2), () => [1, 1], undefined, { region: bld.id });
    b.scatter(rng.chance(0.5) ? "bed" : "barrel", 1, () => [1, 1], undefined, { region: bld.id });
  }
  // Trees and bushes in the open ground, lamps along the main street.
  treeLine(b, 2, (x, y) => b.ground[y]![x] === "road");
  b.scatter("tree", Math.round((b.w * b.h) / 160), () => [1, 1], undefined, { ground: ["grass", "dirt"], region: 0 });
  b.scatter("bush", Math.round((b.w * b.h) / 90), () => [1, 1], undefined, { ground: ["grass", "dirt"], region: 0 });
  for (let x = 3; x < b.w; x += 8) b.light(x + 0.5, midY - 1.5, LAMP);
  b.notes.add("Buildings have roofs on an overhead layer: a building's inside stays hidden until someone can see in through its door or windows.");
  b.notes.add("Market stalls and crates give half cover; the well blocks movement.");
  return buildings;
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
function wallEdges(b: Builder): Map<string, "wall" | "cliff" | Opening> {
  const edges = new Map<string, "wall" | "cliff" | Opening>();
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
  for (const key of b.cliffEdges) if (!edges.has(key)) edges.set(key, "cliff");
  return edges;
}

/** Merge unit edges into segments: runs of plain wall join up, doors and windows stay one cell wide. */
function segments(edges: Map<string, "wall" | "cliff" | Opening>): BattleWall[] {
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
      if (kind === "cliff") seg.cliff = true;
      const joins = (kind === "wall" || kind === "cliff") && run && !!run.cliff === (kind === "cliff");
      if (joins && run!.x2 === seg.x1 && run!.y2 === seg.y1) {
        run!.x2 = seg.x2;
        run!.y2 = seg.y2;
        continue;
      }
      out.push(seg);
      run = kind === "wall" || kind === "cliff" ? seg : null;
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
    outlines: m.outlines?.map((loop) => loop.map(([x, y]): Point => [y, x])),
    zones: { party: m.zones.party.map(([x, y]): Cell => [y, x]), enemies: m.zones.enemies.map(([x, y]): Cell => [y, x]) },
    traps: m.traps?.map((t) => ({ ...t, cells: t.cells.map(([x, y]): Cell => [y, x]) })),
    ledges: m.ledges?.map((l) => ({ ...l, cells: l.cells.map(([x, y]): Cell => [y, x]), ramps: l.ramps.map(([x, y]): Cell => [y, x]) })),
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
  town: ["Market street", "Town square", "Main street"],
  graveyard: ["Old churchyard", "Paupers' field", "The quiet acre", "Hillside cemetery"],
  temple: ["Chapel of the Dawn", "Shrine of the Harvest", "Temple of the Watchful Eye", "Old abbey church"],
  docks: ["Harbor wharf", "Fishermen's pier", "Smugglers' dock", "River landing"],
  bridge: ["Old stone ford", "Toll bridge", "Rope-bridge crossing", "Mill bridge"],
  mine: ["Abandoned mine", "Collapsed dig", "Silver seam", "Kobold-haunted shaft"],
  farm: ["Lonely farmstead", "Miller's homestead", "Pumpkin farm", "Hollow Creek farm"],
  swamp: ["Sunken marsh", "Witch's bog", "Fetid mire", "Reedwater fen"],
};

export function generateBattlemap(opts: BattlemapOptions = {}): Battlemap {
  const rng = createRng(opts.seed);
  // Towns are their own thing (sized by the town, not the battlemap size), so random never picks one.
  const setting = !opts.setting || opts.setting === "random" ? rng.pick((Object.keys(BATTLEMAP_SETTINGS) as BattlemapSetting[]).filter((s) => s !== "town")) : opts.setting;
  const townSize = opts.townSize ?? (opts.size === "small" ? "hamlet" : opts.size === "large" ? "town" : "village");
  const [w, h] = setting === "town" ? TOWN_SIZES[townSize].slice(0, 2) as [number, number] : SIZES[opts.size ?? "medium"];
  const caveLike = setting === "cave" || setting === "mine";
  const night = !!opts.night;

  // A few tries in case props leave the enemies unreachable (rare, since blocking props keep a clear ring).
  for (let attempt = 0; ; attempt++) {
    const b = new Builder(createRng(`${rng.seed}:${attempt}`), w, h, caveLike ? "rock" : "grass");
    let enemyArea: ((x: number, y: number) => boolean) | undefined;
    let buildings: TownBuilding[] | undefined;
    if (setting === "town") buildings = town(b, townSize);
    else if (setting === "clearing") clearing(b);
    else if (setting === "road") enemyArea = road(b);
    else if (setting === "cave") cave(b);
    else if (setting === "shop" || setting === "tavern") {
      if (setting === "shop") shop(b);
      else tavern(b);
      enemyArea = (x, y) => b.region[y]![x]! >= 1;
    }
    else if (setting === "ruins") ruins(b);
    else if (setting === "camp") enemyArea = camp(b);
    else if (setting === "graveyard") enemyArea = graveyard(b);
    else if (setting === "temple") {
      temple(b);
      enemyArea = (x, y) => b.region[y]![x]! >= 1 && y < b.h - 8;
    }
    else if (setting === "docks") enemyArea = docks(b);
    else if (setting === "bridge") enemyArea = bridge(b);
    else if (setting === "mine") mine(b);
    else if (setting === "farm") enemyArea = farm(b);
    else if (setting === "swamp") enemyArea = swamp(b);

    // Raised ground (before walls are worked out, so its cliff edges join them).
    const wantLedges = opts.elevation !== false && LEDGE_GROUND[setting] && b.rng.chance(setting === "cave" || setting === "mine" || setting === "ruins" ? 0.7 : 0.5);
    if (wantLedges) {
      const ledge = raiseLedge(b, setting);
      if (ledge) {
        b.notes.add(`Raised ground (${ledge.height} ft): climbing the cliff edge takes a DC ${10 + ledge.height / 5} Athletics check and costs extra movement; the slope ${ledge.ramps.length > 1 ? "or steps lead" : "leads"} up freely.`);
        b.notes.add("Creatures on the high ground have half cover against attacks from below, and can see over low cover.");
      }
    }
    const edges = wallEdges(b);
    // Caves get rounded rock faces instead of stair-stepped cell edges.
    const caveOutlines = setting === "cave" || setting === "mine" ? floorOutlines(b.region.map((row) => row.map((r) => (r >= 0 ? 1 : 0)))).map((l) => smoothLoop(l, 2)) : [];
    const blocking = new Set([...edges].filter(([, k]) => k !== "door").map(([key]) => key));

    // The party comes in from the street, the road's start or the left edge (the cave's left end).
    let entry: Cell[];
    if (setting === "shop" || setting === "tavern" || setting === "temple") entry = cellsWhere(b, (x, y) => y >= h - 1);
    else if (setting === "docks") entry = cellsWhere(b, (x, y) => x === 0 && b.ground[y]![x] !== "water");
    else if (setting === "cave" || setting === "mine") {
      const xs = cellsWhere(b, (x, y) => b.walkable(x, y)).map(([x]) => x);
      const minX = Math.min(...xs);
      entry = cellsWhere(b, (x) => x <= minX + 1);
    } else entry = cellsWhere(b, (x, y) => x === 0 && y > 1 && y < h - 2);
    const fromParty = distances(b, blocking, entry);
    const reachable = cellsWhere(b, (x, y) => fromParty[y]![x]! < Infinity && !b.used[y]![x]);
    if (!reachable.length && attempt < 8) continue;

    let party = reachable.filter(([x, y]) => fromParty[y]![x]! <= 2);
    const far = Math.max(...reachable.map(([x, y]) => fromParty[y]![x]!));
    // Enemies start in their area (the camp, the building, the tree line), or else as far from the party as it gets.
    let enemies = enemyArea ? reachable.filter(([x, y]) => enemyArea!(x, y) && fromParty[y]![x]! > 3) : [];
    if (!enemies.length) enemies = reachable.filter(([x, y]) => fromParty[y]![x]! >= far * 0.6);
    // On a map with high ground, the enemies like to hold it.
    const ledgeCells = new Set(b.ledges.flatMap((l) => l.cells.map(([x, y]) => `${x},${y}`)));
    const highEnemies = enemies.filter(([x, y]) => ledgeCells.has(`${x},${y}`));
    if (highEnemies.length >= 4) enemies = [...highEnemies, ...enemies.filter(([x, y]) => !ledgeCells.has(`${x},${y}`))];

    // How the fight is set up.
    const layout: FightLayout = !opts.layout || opts.layout === "random"
      ? opts.layout === "random" ? b.rng.weighted([["standoff", 2], ["ambush", 1], ["defend", 1]] as const) : "standoff"
      : opts.layout;
    if (layout === "ambush") {
      // Hidden close in, behind cover, on both sides of the party's way in.
      const covered = new Set(b.props.filter((p) => p.cover).flatMap((p) => {
        const near: string[] = [];
        for (let y = p.y - 1; y <= p.y + p.h; y++) for (let x = p.x - 1; x <= p.x + p.w; x++) near.push(`${x},${y}`);
        return near;
      }));
      const spots = reachable.filter(([x, y]) => fromParty[y]![x]! >= 4 && fromParty[y]![x]! <= 10 && covered.has(`${x},${y}`));
      if (spots.length >= 4) {
        enemies = spots;
        b.notes.add("Ambush: the enemies are hidden behind cover close to the party (Stealth vs passive Perception); anyone who doesn't notice them is surprised.");
      }
    } else if (layout === "defend") {
      // The party holds the middle; the enemy comes from the edges.
      const mid: Cell = [Math.floor(w / 2), Math.floor(h / 2)];
      const centre = distances(b, blocking, [mid]);
      const hold = reachable.filter(([x, y]) => centre[y]![x]! <= 3);
      const edgesIn = reachable.filter(([x, y]) => edgeDist(b, x, y) <= 1 && centre[y]![x]! < Infinity);
      if (hold.length >= 4 && edgesIn.length >= 4) {
        party = hold;
        enemies = edgesIn;
        // Makeshift barricades around the position, with gaps.
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          const x = Math.round(mid[0] + Math.cos(ang) * 5);
          const y = Math.round(mid[1] + Math.sin(ang) * 4);
          if (a % 3 !== 0 && b.free(x, y)) b.place(b.rng.pick(["crate", "barrel", "crate"] as const), x, y);
        }
        b.notes.add("Hold the line: the party defends the middle; the attackers come from the edges, in waves if you like. Barricades give half cover.");
      }
    }
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
      // Caves keep their smoothed rock walls, plus any ledge edges.
      walls: caveLike ? [...loopWalls(caveOutlines), ...segments(new Map([...edges].filter(([, k]) => k === "cliff")))] : segments(edges),
      outlines: setting === "cave" || setting === "mine" ? caveOutlines : undefined,
      props: [...b.props.filter((p) => UNDERLAY.has(p.kind)), ...b.props.filter((p) => !UNDERLAY.has(p.kind))],
      lights: b.lights,
      darkness: setting === "cave" || setting === "mine" ? 1 : night ? (outdoor ? 0.75 : 0.6) : 0,
      zones: { party: b.rng.shuffle(party), enemies: enemyCells },
      notes: [...b.notes],
      buildings,
      ledges: b.ledges.length ? b.ledges : undefined,
      layout,
    };
    // Locks and traps roll on their own stream, so they don't change the layout of a seed.
    const extra = createRng(`${rng.seed}:extras`);
    if (opts.locks !== false) lockBattlemap(map, b.doorRoles, extra, opts.partyLevel ?? 3);
    if (opts.traps) trapBattlemap(map, extra, opts.partyLevel ?? 3);
    // Outdoor maps can run top-to-bottom too (towns keep their streets as laid out).
    if (outdoor && setting !== "town" && b.rng.chance(0.5)) map = transpose(map);
    return map;
  }
}

/** Storerooms and back doors get locked or barred, house doors often locked; front doors stay open. */
function lockBattlemap(m: Battlemap, roles: Map<string, DoorRole>, rng: Rng, level: number) {
  const pick = () => rng.pick([12, 13, 14, 15, 15, 16]) + (level >= 11 ? 3 : level >= 5 ? 1 : 0);
  const notes: string[] = [];
  let houses = 0;
  let houseDc = 0;
  for (const w of m.walls) {
    if (!w.door) continue;
    const role = roles.get(w.y1 === w.y2 ? `h:${w.x1},${w.y1}` : `v:${w.x1},${w.y1}`);
    let lock: DoorLock | undefined;
    if (role === "store" && rng.chance(0.6)) {
      const dc = pick();
      lock = { kind: "locked", pickDc: dc, forceDc: dc + rng.int(1, 3), rooms: [0, 0], key: `the ${m.setting === "shop" ? "shopkeeper" : "owner"}'s key ring` };
      notes.push(`Storeroom door: ${lockText(lock)}`);
    } else if (role === "back" && rng.chance(0.5)) {
      lock = { kind: "barred", forceDc: rng.int(16, 20), rooms: [0, 0], barredFrom: "inside" };
      notes.push(`Back door: ${lockText(lock)}`);
    } else if (role === "kitchen" && rng.chance(0.12)) {
      lock = { kind: "stuck", forceDc: rng.int(8, 12), rooms: [0, 0] };
      notes.push(`Kitchen door: ${lockText(lock)}`);
    } else if (role === "house" && rng.chance(0.45)) {
      houseDc ||= pick();
      lock = { kind: "locked", pickDc: houseDc, forceDc: houseDc + 2, rooms: [0, 0], key: "the owner's key" };
      houses++;
    }
    if (lock) w.lock = lock;
  }
  if (houses) notes.push(`${houses} house door${houses === 1 ? " is" : "s are"} locked (DC ${houseDc} thieves' tools, DC ${houseDc + 2} Strength (Athletics) to force; the owners have keys).`);
  m.notes.push(...notes);
}

/** Where traps fit, and whether they're outdoor snares or old dungeon works. */
const TRAP_SETTINGS: Partial<Record<BattlemapSetting, { count: [number, number]; wild: boolean }>> = {
  camp: { count: [1, 3], wild: true }, road: { count: [1, 2], wild: true }, clearing: { count: [0, 2], wild: true },
  ruins: { count: [1, 2], wild: false }, cave: { count: [1, 2], wild: false },
  graveyard: { count: [0, 2], wild: true }, bridge: { count: [1, 2], wild: true }, farm: { count: [0, 2], wild: true },
  swamp: { count: [1, 2], wild: true }, mine: { count: [1, 2], wild: false },
};

/** Hide traps on open ground the party is likely to cross: nearer the enemy than the party, off the props. */
function trapBattlemap(m: Battlemap, rng: Rng, level: number) {
  const plan = TRAP_SETTINGS[m.setting];
  if (!plan) return;
  const taken = new Set<string>();
  for (const p of m.props) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) taken.add(`${x},${y}`);
  for (const [x, y] of m.zones.party.slice(0, 12)) taken.add(`${x},${y}`);
  for (const [x, y] of m.zones.enemies.slice(0, 6)) taken.add(`${x},${y}`);
  const reach = reachableCells(m, m.zones.party.slice(0, 1));
  const mean = (cells: Cell[]) => cells.reduce(([sx, sy], [x, y]) => [sx + x / cells.length, sy + y / cells.length], [0, 0]);
  const [px, py] = mean(m.zones.party.slice(0, 8));
  const [ex, ey] = mean(m.zones.enemies.slice(0, 8));
  const open = (x: number, y: number) => reach.has(`${x},${y}`) && !taken.has(`${x},${y}`) && !["water", "rock"].includes(m.ground[y]?.[x] ?? "rock");
  // On the way in: closer to the enemies than to the party.
  const spots = [...reach].map((k) => k.split(",").map(Number) as Cell)
    .filter(([x, y]) => open(x, y) && Math.hypot(x - ex, y - ey) < Math.hypot(x - px, y - py) && Math.hypot(x - ex, y - ey) > 2);
  const traps: PlacedTrap[] = [];
  for (let i = rng.int(...plan.count); i > 0 && spots.length; i--) {
    const trap = generateTrap({ partyLevel: level, wild: plan.wild, rough: !plan.wild, step: true, seed: `${rng.seed}:trap:${i}` });
    const [x, y] = spots.splice(rng.int(0, spots.length - 1), 1)[0]!;
    let cells: Cell[] = [[x, y]];
    if (/(10|15)-foot square/.test(trap.area ?? "")) {
      const block: Cell[] = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      if (block.every(([cx, cy]) => open(cx, cy))) cells = block;
    }
    for (const [cx, cy] of cells) taken.add(`${cx},${cy}`);
    // Keep the next trap out of this one's neighborhood.
    for (let j = spots.length - 1; j >= 0; j--) if (Math.abs(spots[j]![0] - x) <= 3 && Math.abs(spots[j]![1] - y) <= 3) spots.splice(j, 1);
    traps.push({ cells, trap });
    m.notes.push(`Trap: ${trapText(trap)}`);
  }
  if (traps.length) m.traps = traps;
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
    // Curved cave walls run through rock cells, which already block movement.
    if (w.door || ![w.x1, w.y1, w.x2, w.y2].every(Number.isInteger) || (w.x1 !== w.x2 && w.y1 !== w.y2)) continue;
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

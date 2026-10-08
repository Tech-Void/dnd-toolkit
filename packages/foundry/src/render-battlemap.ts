import { ROCK_STYLE, stoneTexture } from "./texture.ts";
import type { ArtImage } from "./fa-assets.ts";
import { createRng, floorOutlines, smoothLoop, type Battlemap, type Ground, type Point, type Prop, type Rng } from "@dnd-toolkit/core";

export interface BattlemapRenderOptions {
  /** Pixels per grid cell. */
  cell: number;
  /** GM preview extras: party (blue) and enemy (red) start zones, plus a faint grid. */
  preview?: boolean;
  /** Paint town roofs on top (the preview); scenes put them on an overhead tile instead. */
  roofs?: boolean;
  /** Number each building on its roof (GM preview). */
  labels?: boolean;
  /** Art textures per ground type (Forgotten Adventures); ground without one keeps the painted look. */
  textures?: Partial<Record<Ground, ArtImage>>;
  /** Art per prop kind (several variants each); kinds without art keep the drawn look. */
  props?: Partial<Record<Prop["kind"], ArtImage[]>>;
  /** Shadows under tree canopies, matched to the tree by variant code. */
  treeShadows?: ArtImage[];
  /** Small scenery scattered on open ground, by ground type. */
  decor?: Partial<Record<Ground, ArtImage[]>>;
  /** Roof textures for town buildings. */
  roofArt?: ArtImage[];
  /** Leave tree canopies out: the scene puts them on their own overhead tile. */
  noCanopy?: boolean;
  /** Wall textures (timber for buildings, stone for ruins), and door and window art. */
  wallArt?: { timber?: ArtImage; stone?: ArtImage; door?: ArtImage[]; window?: ArtImage[] };
  /** Light fittings: wall torches and freestanding lamps. */
  lightArt?: { wall: ArtImage[]; post: ArtImage[] };
}

/** Kinds whose art may spread past the footprint (a canopy over a trunk, a tent's guy ropes). */
const OVERHANG = new Set<Prop["kind"]>(["tree", "bush", "boulder", "stalagmite", "mushrooms", "campfire", "tent", "well", "rubble", "cart", "deadTree", "reeds", "statue"]);
/** Long, one-square-deep furniture built from repeated pieces. */
const MODULAR = new Set<Prop["kind"]>(["counter", "shelf", "fence"]);

/** Draw art centered on a box, at a given size in squares, turned a quarter if asked. */
function stamp(ctx: Ctx, a: ArtImage, cx: number, cy: number, w: number, h: number, c: number, turn: boolean, flip = false) {
  ctx.save();
  ctx.translate(cx, cy);
  if (turn) ctx.rotate(Math.PI / 2);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(a.img, (-w * c) / 2, (-h * c) / 2, w * c, h * c);
  ctx.restore();
}

/**
 * Draw a prop with art. Art the same size as the footprint (either way round) is drawn as-is;
 * canopies and the like keep their own size; long counters and shelves are built from pieces;
 * anything else is fitted to the footprint.
 */
function drawPropArt(ctx: Ctx, rng: Rng, p: Prop, c: number, variants: ArtImage[]) {
  const cx = (p.x + p.w / 2) * c;
  const cy = (p.y + p.h / 2) * c;
  if (OVERHANG.has(p.kind)) {
    // Trees: smaller canopies for trees that stand in the open, any size along the edges.
    const pool = p.kind === "tree" && p.blocks !== "none" ? variants.filter((a) => a.w <= 4) : variants;
    const a = rng.pick(pool.length ? pool : variants);
    // Bare dead trees are huge in FA; ours are the stunted, swamp-and-graveyard kind.
    const k = p.kind === "deadTree" ? 0.55 : 1;
    stamp(ctx, a, cx, cy, a.w * k, a.h * k, c, rng.chance(0.5), rng.chance(0.5));
    return;
  }
  const exact = variants.filter((a) => (a.w === p.w && a.h === p.h) || (a.w === p.h && a.h === p.w));
  if (exact.length) {
    const a = rng.pick(exact);
    const turn = a.w !== p.w;
    stamp(ctx, a, cx, cy, a.w, a.h, c, turn, !turn && p.w === p.h && rng.chance(0.5));
    return;
  }
  const along = Math.max(p.w, p.h);
  const deep = Math.min(p.w, p.h);
  const pieces = variants.filter((a) => Math.min(a.w, a.h) === deep && Math.max(a.w, a.h) <= along);
  if (p.kind === "counter" && pieces.length) {
    // FA bar sections have a faded start meant to tuck under the next piece: stretch the longest
    // one along the whole counter with that fade pushed past the end.
    const a = [...pieces].sort((x, y) => Math.max(y.w, y.h) - Math.max(x.w, x.h))[0]!;
    const horizontal = p.w >= p.h;
    const fade = 0.7;
    const span = along + fade;
    const turn = horizontal ? a.w < a.h : a.w > a.h;
    const px = horizontal ? (p.x + along / 2 - fade / 2) * c : cx;
    const py = horizontal ? cy : (p.y + along / 2 - fade / 2) * c;
    stamp(ctx, a, px, py, horizontal !== turn ? span : a.w, horizontal !== turn ? a.h : span, c, turn);
    return;
  }
  if (MODULAR.has(p.kind) && pieces.length) {
    // Lay pieces end to end so they fill the run exactly; the last one stretches if they can't.
    const horizontal = p.w >= p.h;
    const lengths = [...new Set(pieces.map((a) => Math.max(a.w, a.h)))];
    const plan = split(along, lengths) ?? [...Array(Math.floor(along / Math.min(...lengths))).fill(Math.min(...lengths))];
    if (!plan.length) plan.push(along);
    const total = plan.reduce((n, l) => n + l, 0);
    let at = 0;
    plan.forEach((len, i) => {
      const a = rng.pick(pieces.filter((x) => Math.max(x.w, x.h) === len).length ? pieces.filter((x) => Math.max(x.w, x.h) === len) : pieces);
      const span = i === plan.length - 1 ? len + (along - total) : len;
      const turn = horizontal ? a.w < a.h : a.w > a.h;
      const px = horizontal ? (p.x + at + span / 2) * c : cx;
      const py = horizontal ? cy : (p.y + at + span / 2) * c;
      stamp(ctx, a, px, py, horizontal !== turn ? span : a.w, horizontal !== turn ? a.h : span, c, turn);
      at += span;
    });
    return;
  }
  // Nearest in shape, scaled into the footprint.
  const a = [...variants].sort((x, y) => Math.abs(x.w * x.h - p.w * p.h) - Math.abs(y.w * y.h - p.w * p.h))[0]!;
  const turn = p.w !== p.h && (p.w > p.h) !== (a.w > a.h);
  const [aw, ah] = turn ? [a.h, a.w] : [a.w, a.h];
  const k = Math.min(p.w / aw, p.h / ah);
  stamp(ctx, a, cx, cy, a.w * k, a.h * k, c, turn);
}

/** Split a length into pieces of the given lengths exactly (longest first), or null if it can't be done. */
function split(total: number, lengths: number[]): number[] | null {
  const sorted = [...lengths].sort((a, b) => b - a);
  const go = (left: number): number[] | null => {
    if (left === 0) return [];
    for (const l of sorted) {
      if (l > left) continue;
      const rest = go(left - l);
      if (rest) return [l, ...rest];
    }
    return null;
  };
  return go(total);
}

/**
 * Raised ground: a lighter top, a rocky lip along the cliff edges with a drop shadow below, and
 * the slope marked with a few steps.
 */
function drawLedges(ctx: Ctx, m: Battlemap, c: number) {
  for (const l of m.ledges ?? []) {
    const has = new Set(l.cells.map(([x, y]) => `${x},${y}`));
    const mask = Array.from({ length: m.height }, (_, y) => Array.from({ length: m.width }, (_, x) => (has.has(`${x},${y}`) ? 1 : 0)));
    const path = loopsPath(floorOutlines(mask), c);
    // Shadow cast down and to the right of the cliff.
    const drop = 0.12 + l.height / 60;
    // The cliff's shadow falls on the ground below it, never on its own top.
    const outside = new Path2D();
    outside.rect(0, 0, m.width * c, m.height * c);
    outside.addPath(path);
    ctx.save();
    ctx.clip(outside, "evenodd");
    ctx.translate(c * drop * 0.7, c * drop);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fill(path, "evenodd");
    ctx.restore();
    ctx.save();
    ctx.clip(path, "evenodd");
    // The top catches more light than the ground below.
    ctx.fillStyle = `rgba(255, 240, 210, ${0.1 + l.height / 150})`;
    ctx.fillRect(0, 0, m.width * c, m.height * c);
    // A darker band just inside the rim, where the edge rounds over.
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(60, 45, 30, 0.35)";
    ctx.lineWidth = c * 0.35;
    ctx.stroke(path);
    ctx.restore();
    // The rim itself: a thin line of bare rock.
    ctx.strokeStyle = "rgba(48, 38, 28, 0.9)";
    ctx.lineWidth = c * 0.08;
    ctx.stroke(path);
    // Steps where the slope goes up.
    ctx.strokeStyle = "rgba(60, 50, 40, 0.6)";
    ctx.lineWidth = Math.max(1, c / 25);
    for (const [x, y] of l.ramps) {
      ctx.beginPath();
      for (let i = 1; i < 4; i++) seg(ctx, (x + 0.15) * c, (y + i / 4) * c, (x + 0.85) * c, (y + i / 4) * c);
      ctx.stroke();
    }
  }
}

/** Tree canopies only, for the overhead tile (or the preview). */
export function drawCanopies(ctx: Ctx, m: Battlemap, c: number, o: Pick<BattlemapRenderOptions, "props">) {
  const art = o.props?.tree;
  if (!art?.length) return;
  const rng = createRng(`${m.seed}:canopy`);
  for (const p of m.props) if (p.kind === "tree") drawPropArt(ctx, rng, p, c, art);
}

/** Soft shadows on the ground under every tree, matched to its canopy where FA has one. */
function drawTreeShadows(ctx: Ctx, m: Battlemap, c: number, o: BattlemapRenderOptions) {
  const art = o.props?.tree;
  if (!art?.length) return;
  // Replay the canopy choices so each shadow sits under its own tree.
  const rng = createRng(`${m.seed}:canopy`);
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const p of m.props) {
    if (p.kind !== "tree") continue;
    const pool = p.blocks !== "none" ? art.filter((a) => a.w <= 4) : art;
    const a = rng.pick(pool.length ? pool : art);
    const turn = rng.chance(0.5);
    const flip = rng.chance(0.5);
    const cx = (p.x + p.w / 2) * c;
    const cy = (p.y + p.h / 2) * c;
    const s = o.treeShadows?.find((x) => x.code === a.code && x.w === a.w) ?? o.treeShadows?.find((x) => x.w === a.w);
    if (s) stamp(ctx, s, cx + c * 0.25, cy + c * 0.3, s.w, s.h, c, turn, flip);
    else shadow(ctx, cx, cy, a.w * c * 0.42, a.h * c * 0.38, c);
  }
  ctx.restore();
}

/** Small scenery on open ground: never on props, walls or water, and sparse. */
function drawDecor(ctx: Ctx, m: Battlemap, c: number, o: BattlemapRenderOptions) {
  if (!o.decor) return;
  const rng = createRng(`${m.seed}:decor`);
  const taken = new Set<string>();
  for (const p of m.props) for (let y = p.y - 1; y <= p.y + p.h; y++) for (let x = p.x - 1; x <= p.x + p.w; x++) taken.add(`${x},${y}`);
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const g = m.ground[y]![x]!;
      const pool = o.decor[g];
      if (!pool?.length || taken.has(`${x},${y}`) || !rng.chance(g === "road" ? 0.03 : 0.08)) continue;
      const a = rng.pick(pool);
      const k = 0.55 + rng.next() * 0.4;
      ctx.save();
      ctx.translate((x + 0.2 + rng.next() * 0.6) * c, (y + 0.2 + rng.next() * 0.6) * c);
      ctx.rotate(rng.next() * Math.PI * 2);
      ctx.drawImage(a.img, (-a.w * c * k) / 2, (-a.h * c * k) / 2, a.w * c * k, a.h * c * k);
      ctx.restore();
    }
  }
}

type Ctx = CanvasRenderingContext2D;

const GROUND: Record<Ground, string> = {
  grass: "#5f7f3f",
  dirt: "#8b6d47",
  road: "#9c8462",
  stone: "#8d8a83",
  wood: "#9a6e44",
  cave: "#6b6157",
  water: "#3d6b86",
  rock: "#2a2622",
  mud: "#4f4130",
};

/** Natural ground gets rounded blobs so patches don't look like a spreadsheet; floors stay crisp. */
const ORGANIC = new Set<Ground>(["grass", "dirt", "road", "water", "cave", "mud"]);
/** Paint order: later layers spill over earlier ones. */
const LAYERS: Ground[] = ["rock", "grass", "mud", "dirt", "road", "cave", "stone", "water", "wood"];

/** Vary a hex color's lightness by `amount` (-1..1). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function blob(ctx: Ctx, rng: Rng, x: number, y: number, r: number, points: number, jag: number, fill: string, stroke?: string) {
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - jag + rng.next() * jag * 2);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, c: number) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(x + c * 0.08, y + c * 0.1, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Add a line to the current path. */
function seg(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, stroke?: string, lw = 1) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  }
}

// ---------------------------------------------------------------------------
// Ground

function groundDetail(ctx: Ctx, rng: Rng, g: Ground, px: number, py: number, c: number) {
  const base = GROUND[g];
  if (g === "wood") {
    // Planks: four boards per cell with a seam somewhere along each.
    const boards = 4;
    for (let i = 0; i < boards; i++) {
      const y = py + (i * c) / boards;
      rect(ctx, px, y, c, c / boards, shade(base, (rng.next() - 0.5) * 0.18));
      ctx.fillStyle = "rgba(40, 22, 10, 0.45)";
      ctx.fillRect(px, y, c, Math.max(1, c / 60));
      ctx.fillRect(px + rng.next() * c, y, Math.max(1, c / 60), c / boards);
    }
    return;
  }
  if (g === "stone") {
    // Flagstones: a 2×2 of slabs with mortar between them.
    const gap = Math.max(1, c * 0.04);
    rect(ctx, px, py, c, c, shade(base, -0.35));
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        rect(ctx, px + (i * c) / 2 + gap / 2, py + (j * c) / 2 + gap / 2, c / 2 - gap, c / 2 - gap, shade(base, (rng.next() - 0.5) * 0.22));
      }
    }
    return;
  }
  if (g === "rock") {
    if (rng.chance(0.3)) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = Math.max(1, c / 40);
      ctx.beginPath();
      ctx.moveTo(px + rng.next() * c, py + rng.next() * c);
      ctx.lineTo(px + rng.next() * c, py + rng.next() * c);
      ctx.stroke();
    }
    return;
  }
  // Specks: grass tufts, pebbles, ripples.
  const specks = g === "grass" ? 9 : g === "water" ? 3 : 6;
  for (let i = 0; i < specks; i++) {
    const x = px + rng.next() * c;
    const y = py + rng.next() * c;
    if (g === "grass") {
      ctx.strokeStyle = shade(base, rng.chance(0.5) ? 0.22 : -0.3);
      ctx.lineWidth = Math.max(1, c / 45);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.next() - 0.5) * c * 0.08, y - c * 0.09);
      ctx.stroke();
    } else if (g === "water") {
      ctx.strokeStyle = "rgba(200, 230, 255, 0.35)";
      ctx.lineWidth = Math.max(1, c / 40);
      ctx.beginPath();
      ctx.arc(x, y, c * 0.12, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      circle(ctx, x, y, c * (0.015 + rng.next() * 0.03), shade(base, (rng.next() - 0.5) * 0.6));
    }
  }
}

/** Path through a list of closed loops, in grid units. */
function loopsPath(loops: Point[][], c: number, offset = 0): Path2D {
  const path = new Path2D();
  for (const loop of loops) {
    loop.forEach(([x, y], i) => {
      if (i) path.lineTo((x + offset) * c, (y + offset) * c);
      else path.moveTo((x + offset) * c, (y + offset) * c);
    });
    path.closePath();
  }
  return path;
}

/** Smooth outline of every patch of one ground type. Padded a cell past the map edge so the border isn't rounded off. */
function groundPath(m: Battlemap, layer: Ground, c: number): Path2D | null {
  const at = (x: number, y: number) => m.ground[Math.max(0, Math.min(m.height - 1, y))]![Math.max(0, Math.min(m.width - 1, x))];
  const mask = Array.from({ length: m.height + 2 }, (_, y) => Array.from({ length: m.width + 2 }, (_, x) => (at(x - 1, y - 1) === layer ? 1 : 0)));
  const loops = floorOutlines(mask).map((loop) => smoothLoop(loop, 3));
  return loops.length ? loopsPath(loops, c, -1) : null;
}

/** Edge treatment per ground type: [color, width in cells]. Water gets a bank, the rest a soft rim. */
const RIMS: Partial<Record<Ground, [string, number][]>> = {
  water: [["rgba(52, 40, 24, 0.55)", 0.16], ["rgba(190, 225, 245, 0.35)", 0.05]],
  road: [["rgba(70, 50, 30, 0.18)", 0.1]],
  dirt: [["rgba(80, 60, 35, 0.15)", 0.08]],
};

function drawGround(ctx: Ctx, rng: Rng, m: Battlemap, c: number, o: Pick<BattlemapRenderOptions, "textures"> = {}) {
  /** A repeating fill for a ground type's texture, at its true size in squares. */
  const pattern = (g: Ground): CanvasPattern | null => {
    const t = o.textures?.[g];
    if (!t) return null;
    const p = ctx.createPattern(t.img, "repeat");
    p?.setTransform(new DOMMatrix().scale((c * t.w) / t.img.width));
    return p;
  };
  const counts = new Map<Ground, number>();
  for (const row of m.ground) for (const g of row) counts.set(g, (counts.get(g) ?? 0) + 1);
  // The most common ground is the backdrop; everything else is painted over it as smooth patches.
  const base = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  if (m.outlines) ctx.drawImage(stoneTexture(m.width, m.height, `${m.seed}:rock`, ROCK_STYLE), 0, 0, m.width * c, m.height * c);
  else {
    ctx.fillStyle = pattern(base) ?? GROUND[base];
    ctx.fillRect(0, 0, m.width * c, m.height * c);
  }

  for (const layer of LAYERS) {
    if (!counts.has(layer) && !(layer === "cave" && m.outlines)) continue;
    // Cave rock is the textured backdrop already.
    if (layer === "rock" && m.outlines) continue;
    const color = GROUND[layer];
    const tex = pattern(layer);
    if (!ORGANIC.has(layer) && layer !== "rock") {
      // Built floors stay crisp: planks and flagstones square to the grid.
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          if (m.ground[y]![x] !== layer) continue;
          if (tex) {
            ctx.fillStyle = tex;
            ctx.fillRect(x * c, y * c, c, c);
          } else {
            rect(ctx, x * c, y * c, c, c, color);
            groundDetail(ctx, rng, layer, x * c, y * c, c);
          }
        }
      }
      continue;
    }
    // A cave's floor follows the same outline as its walls (pools are painted on top).
    const path = layer === "cave" && m.outlines ? loopsPath(m.outlines, c) : groundPath(m, layer, c);
    if (!path) continue;
    ctx.fillStyle = tex ?? color;
    ctx.fill(path, "evenodd");
    ctx.save();
    ctx.clip(path, "evenodd");
    // A photo texture already has its own detail; painted ground gets mottling and specks.
    for (let y = 0; y < m.height && !tex; y++) {
      for (let x = 0; x < m.width; x++) {
        const here = m.ground[y]![x];
        if (here !== layer && !(layer === "cave" && here === "water")) continue;
        // Soft mottling, then tufts, pebbles or ripples.
        circle(ctx, (x + rng.next()) * c, (y + rng.next()) * c, c * (0.45 + rng.next() * 0.3), shade(color, (rng.next() - 0.5) * 0.1));
        groundDetail(ctx, rng, layer, x * c, y * c, c);
      }
    }
    ctx.restore();
    for (const [rim, width] of RIMS[layer] ?? []) {
      ctx.strokeStyle = rim;
      ctx.lineWidth = c * width;
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }
  }

  if (m.outlines) {
    // Cave walls: shadow just inside the rock face, then a crisp edge.
    const floor = loopsPath(m.outlines, c);
    ctx.save();
    ctx.clip(floor, "evenodd");
    ctx.lineJoin = "round";
    for (const [width, alpha] of [[0.6, 0.14], [0.3, 0.2]] as const) {
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = c * width;
      ctx.stroke(floor);
    }
    ctx.restore();
    ctx.strokeStyle = "#110e0b";
    ctx.lineWidth = c * 0.1;
    ctx.stroke(floor);
  }
}

// ---------------------------------------------------------------------------
// Props

function drawProp(ctx: Ctx, rng: Rng, p: Prop, c: number) {
  const x = p.x * c;
  const y = p.y * c;
  const w = p.w * c;
  const h = p.h * c;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = (Math.min(w, h) / 2);
  const line = Math.max(1, c / 35);
  ctx.lineWidth = line;

  switch (p.kind) {
    case "tombstone":
      rect(ctx, x + w * 0.25, y + h * 0.3, w * 0.5, h * 0.4, "#9b968c", "#3c3a36", line);
      return;
    case "grave":
      rect(ctx, x + w * 0.1, y + h * 0.05, w * 0.8, h * 0.9, "#2a2018", "#14100c", line);
      return;
    case "statue":
    case "deadTree":
      circle(ctx, cx, cy, r * 0.8, p.kind === "statue" ? "#a19c92" : "#4a3a2a");
      return;
    case "pew":
    case "fence":
    case "hay":
    case "support":
      rect(ctx, x + c * 0.1, y + c * 0.2, w - c * 0.2, h - c * 0.4, p.kind === "hay" ? "#c9a648" : "#6b4a2a", "#2e1d0f", line);
      return;
    case "boat":
      ctx.fillStyle = "#6d4a2a";
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.45, h * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "crops":
      for (let i = 0; i < 4; i++) circle(ctx, x + (0.25 + (i % 2) * 0.5) * w, y + (0.25 + Math.floor(i / 2) * 0.5) * h, r * 0.3, "#5d8a3a");
      return;
    case "reeds":
      ctx.strokeStyle = "#7a8a4a";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) seg(ctx, x + (0.2 + i * 0.15) * w, y + h * 0.9, x + (0.15 + i * 0.17) * w, y + h * 0.15);
      ctx.stroke();
      return;
    case "mineCart":
      rect(ctx, x + c * 0.15, y + c * 0.2, w - c * 0.3, h - c * 0.4, "#55504a", "#222", line);
      return;
    case "tree": {
      const size = r * (p.blocks === "none" ? 1.5 + rng.next() * 0.35 : 1.35 + rng.next() * 0.2);
      shadow(ctx, cx, cy, size, size * 0.9, c);
      const green = rng.pick(["#2f5a2a", "#3a6630", "#2d4f2f", "#456b2e"]);
      circle(ctx, cx, cy, size, shade(green, -0.25));
      for (let i = 0; i < 5; i++) {
        const a = rng.next() * Math.PI * 2;
        circle(ctx, cx + Math.cos(a) * size * 0.4, cy + Math.sin(a) * size * 0.4, size * (0.45 + rng.next() * 0.2), shade(green, (rng.next() - 0.3) * 0.25));
      }
      circle(ctx, cx - size * 0.25, cy - size * 0.25, size * 0.3, shade(green, 0.2));
      break;
    }
    case "bush": {
      const green = rng.pick(["#3f6b2f", "#4a7535", "#365e2c"]);
      for (let i = 0; i < 4; i++) circle(ctx, cx + (rng.next() - 0.5) * r, cy + (rng.next() - 0.5) * r, r * 0.5, shade(green, (rng.next() - 0.5) * 0.3));
      if (rng.chance(0.4)) for (let i = 0; i < 4; i++) circle(ctx, cx + (rng.next() - 0.5) * r * 1.2, cy + (rng.next() - 0.5) * r * 1.2, c * 0.03, "#a3262a");
      break;
    }
    case "boulder":
    case "stalagmite": {
      shadow(ctx, cx, cy, r * 0.9, r * 0.8, c);
      const gray = p.kind === "boulder" ? "#87837b" : "#7a6f62";
      blob(ctx, rng, cx, cy, r * 0.85, 9, 0.18, gray, shade(gray, -0.5));
      blob(ctx, rng, cx - r * 0.15, cy - r * 0.15, r * 0.5, 7, 0.2, shade(gray, 0.18));
      if (p.kind === "stalagmite") circle(ctx, cx - r * 0.12, cy - r * 0.12, r * 0.18, shade(gray, 0.35));
      break;
    }
    case "pillar": {
      shadow(ctx, cx, cy, r * 0.85, r * 0.8, c);
      circle(ctx, cx, cy, r * 0.8, "#a9a59c");
      ctx.strokeStyle = "#5f5b54";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      circle(ctx, cx, cy, r * 0.55, "#bdb9b0");
      break;
    }
    case "rubble": {
      for (let i = 0; i < 6 * p.w * p.h; i++) {
        blob(ctx, rng, x + rng.next() * w, y + rng.next() * h, c * (0.06 + rng.next() * 0.1), 6, 0.3, shade("#8a867e", (rng.next() - 0.5) * 0.4), "rgba(0,0,0,0.4)");
      }
      break;
    }
    case "log": {
      const horizontal = p.w >= p.h;
      const t = c * 0.32;
      shadow(ctx, cx, cy, horizontal ? w / 2 : t, horizontal ? t : h / 2, c);
      const lx = horizontal ? x + c * 0.1 : cx - t;
      const ly = horizontal ? cy - t : y + c * 0.1;
      const lw = horizontal ? w - c * 0.2 : t * 2;
      const lh = horizontal ? t * 2 : h - c * 0.2;
      rect(ctx, lx, ly, lw, lh, "#6b4a2b", "#3d2716", line);
      ctx.strokeStyle = "rgba(30, 18, 8, 0.5)";
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        if (horizontal) seg(ctx, lx, ly + (lh * i) / 4, lx + lw, ly + (lh * i) / 4 + (rng.next() - 0.5) * 4);
        else seg(ctx, lx + (lw * i) / 4, ly, lx + (lw * i) / 4 + (rng.next() - 0.5) * 4, ly + lh);
        ctx.stroke();
      }
      const end = horizontal ? [lx + lw, cy] : [cx, ly + lh];
      circle(ctx, end[0]!, end[1]!, t, "#b08a5a");
      circle(ctx, end[0]!, end[1]!, t * 0.5, "#8c6a40");
      break;
    }
    case "mushrooms": {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, c * 0.6);
      glow.addColorStop(0, "rgba(79, 209, 197, 0.45)");
      glow.addColorStop(1, "rgba(79, 209, 197, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - c * 0.2, y - c * 0.2, w + c * 0.4, h + c * 0.4);
      for (let i = 0; i < 5; i++) circle(ctx, cx + (rng.next() - 0.5) * c * 0.6, cy + (rng.next() - 0.5) * c * 0.6, c * (0.05 + rng.next() * 0.06), rng.pick(["#7ff5e6", "#4fd1c5", "#a6fff2"]));
      break;
    }
    case "altar": {
      shadow(ctx, cx, cy, w / 2, h / 2, c);
      rect(ctx, x + c * 0.05, y + c * 0.1, w - c * 0.1, h - c * 0.2, "#9b968c", "#4f4b45", line);
      rect(ctx, x + c * 0.15, y + c * 0.2, w - c * 0.3, h - c * 0.4, "#b5b0a5");
      rect(ctx, cx - c * 0.15, y + c * 0.1, c * 0.3, h - c * 0.2, "#7d2a2a");
      for (const dx of [-0.7, 0.7]) circle(ctx, cx + dx * (w / 2 - c * 0.15), cy, c * 0.06, "#f3e2a9");
      break;
    }
    case "table": {
      shadow(ctx, cx, cy, w / 2 - c * 0.05, h / 2 - c * 0.05, c);
      const tx = x + c * 0.1;
      const ty = y + c * 0.1;
      rect(ctx, tx, ty, w - c * 0.2, h - c * 0.2, "#7a5230", "#3f2815", line * 1.5);
      ctx.strokeStyle = "rgba(40, 22, 10, 0.4)";
      for (let i = 1; i < (p.w >= p.h ? 3 : 1) + 1; i++) {
        ctx.beginPath();
        ctx.moveTo(tx, ty + ((h - c * 0.2) * i) / 4);
        ctx.lineTo(tx + w - c * 0.2, ty + ((h - c * 0.2) * i) / 4);
        ctx.stroke();
      }
      // Mugs and plates.
      for (let i = 0; i < p.w * p.h; i++) if (rng.chance(0.6)) circle(ctx, tx + c * 0.15 + rng.next() * (w - c * 0.5), ty + c * 0.15 + rng.next() * (h - c * 0.5), c * 0.07, rng.pick(["#d9d2c0", "#8f8f8f", "#b07d3c"]));
      break;
    }
    case "chair": {
      rect(ctx, x + c * 0.28, y + c * 0.28, c * 0.44, c * 0.44, "#6e4a2a", "#3a2614", line);
      rect(ctx, x + c * 0.28, y + c * 0.22, c * 0.44, c * 0.1, "#55381f");
      break;
    }
    case "barrel": {
      shadow(ctx, cx, cy, r * 0.75, r * 0.7, c);
      circle(ctx, cx, cy, r * 0.72, "#7b5534");
      ctx.strokeStyle = "#2f2f2f";
      ctx.lineWidth = line * 1.5;
      for (const k of [0.72, 0.5]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = line;
      break;
    }
    case "crate": {
      shadow(ctx, cx, cy, r * 0.8, r * 0.8, c);
      const s = c * 0.12;
      rect(ctx, x + s, y + s, w - s * 2, h - s * 2, "#9a7448", "#4a3218", line * 1.5);
      ctx.strokeStyle = "#5e4223";
      ctx.beginPath();
      ctx.moveTo(x + s, y + s);
      ctx.lineTo(x + w - s, y + h - s);
      ctx.moveTo(x + w - s, y + s);
      ctx.lineTo(x + s, y + h - s);
      ctx.stroke();
      break;
    }
    case "counter": {
      shadow(ctx, cx, cy, w / 2, h / 2, c);
      rect(ctx, x + c * 0.05, y + c * 0.12, w - c * 0.1, h - c * 0.24, "#5e3d22", "#2e1d0f", line * 1.5);
      rect(ctx, x + c * 0.1, y + c * 0.18, w - c * 0.2, (h - c * 0.36) * 0.35, "#7d5532");
      for (let i = 0; i < p.w * p.h; i++) if (rng.chance(0.35)) circle(ctx, x + c * (i % p.w + 0.5), y + c * (Math.floor(i / p.w) + 0.55), c * 0.08, rng.pick(["#c9a227", "#9fb3c8", "#a33", "#ddd"]));
      break;
    }
    case "shelf": {
      rect(ctx, x + c * 0.06, y + c * 0.06, w - c * 0.12, h - c * 0.12, "#4f341d", "#24170b", line * 1.5);
      const items = Math.max(p.w, p.h) * 3;
      for (let i = 0; i < items; i++) {
        const along = (i + 0.5) / items;
        const ix = p.w >= p.h ? x + along * w : cx;
        const iy = p.w >= p.h ? cy : y + along * h;
        rect(ctx, ix - c * 0.08, iy - c * 0.12, c * 0.16, c * 0.24, rng.pick(["#a33", "#3a6ea5", "#c9a227", "#5a8a3a", "#ccc", "#7a4a8a"]));
      }
      break;
    }
    case "bed": {
      rect(ctx, x + c * 0.1, y + c * 0.05, w - c * 0.2, h - c * 0.1, "#6e4a2a", "#3a2614", line);
      rect(ctx, x + c * 0.15, y + c * 0.35, w - c * 0.3, h - c * 0.45, rng.pick(["#7d2a2a", "#2a4d7d", "#4d6b2a"]));
      rect(ctx, x + c * 0.2, y + c * 0.1, w - c * 0.4, c * 0.2, "#e8e2d0");
      break;
    }
    case "chest": {
      shadow(ctx, cx, cy, r * 0.6, r * 0.45, c);
      rect(ctx, x + c * 0.2, y + c * 0.28, c * 0.6, c * 0.44, "#7a4e22", "#2f1d0c", line * 1.5);
      ctx.fillStyle = "#d4a92a";
      ctx.fillRect(x + c * 0.2, y + c * 0.45, c * 0.6, c * 0.07);
      ctx.fillRect(x + c * 0.46, y + c * 0.42, c * 0.08, c * 0.14);
      break;
    }
    case "hearth": {
      rect(ctx, x + c * 0.05, y + c * 0.05, w - c * 0.1, h - c * 0.1, "#77726a", "#3a3631", line * 1.5);
      rect(ctx, x + c * 0.2, y + c * 0.2, w - c * 0.4, h - c * 0.4, "#2a2320");
      fire(ctx, rng, cx, cy, r * 0.5);
      break;
    }
    case "rug": {
      rect(ctx, x + c * 0.1, y + c * 0.1, w - c * 0.2, h - c * 0.2, "#7d2a2a");
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = line * 2;
      ctx.strokeRect(x + c * 0.2, y + c * 0.2, w - c * 0.4, h - c * 0.4);
      ctx.lineWidth = line;
      break;
    }
    case "stairs": {
      const steps = Math.max(p.w, p.h) * 4;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        if (p.h >= p.w) rect(ctx, x + c * 0.05, y + t * h, w - c * 0.1, h / steps, shade("#8a6640", -0.5 * (1 - t)), "#2e1d0f", line);
        else rect(ctx, x + t * w, y + c * 0.05, w / steps, h - c * 0.1, shade("#8a6640", -0.5 * (1 - t)), "#2e1d0f", line);
      }
      break;
    }
    case "campfire": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        blob(ctx, rng, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, r * 0.18, 6, 0.25, "#77736b", "#3a3631");
      }
      ctx.strokeStyle = "#4a2f17";
      ctx.lineWidth = c * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy - r * 0.3);
      ctx.lineTo(cx + r * 0.45, cy + r * 0.3);
      ctx.moveTo(cx - r * 0.45, cy + r * 0.3);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.3);
      ctx.stroke();
      ctx.lineWidth = line;
      fire(ctx, rng, cx, cy, r * 0.4);
      break;
    }
    case "tent": {
      shadow(ctx, cx, cy, w / 2, h / 2, c);
      const along = p.w >= p.h;
      const canvasColor = rng.pick(["#b8a27a", "#9c8a66", "#a88f6a", "#7f7a5c"]);
      const tx = x + c * 0.08;
      const ty = y + c * 0.08;
      const tw = w - c * 0.16;
      const th = h - c * 0.16;
      // Two slopes either side of the ridge.
      if (along) {
        rect(ctx, tx, ty, tw, th / 2, shade(canvasColor, 0.1));
        rect(ctx, tx, ty + th / 2, tw, th / 2, shade(canvasColor, -0.18));
      } else {
        rect(ctx, tx, ty, tw / 2, th, shade(canvasColor, 0.1));
        rect(ctx, tx + tw / 2, ty, tw / 2, th, shade(canvasColor, -0.18));
      }
      ctx.strokeStyle = shade(canvasColor, -0.55);
      ctx.lineWidth = line * 2;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.beginPath();
      if (along) seg(ctx, tx, cy, tx + tw, cy);
      else seg(ctx, cx, ty, cx, ty + th);
      ctx.stroke();
      ctx.lineWidth = line;
      break;
    }
    case "well": {
      shadow(ctx, cx, cy, r * 0.9, r * 0.85, c);
      circle(ctx, cx, cy, r * 0.85, "#7d786f");
      circle(ctx, cx, cy, r * 0.6, "#3d6b86");
      circle(ctx, cx - r * 0.15, cy - r * 0.15, r * 0.2, "rgba(200, 230, 255, 0.35)");
      ctx.strokeStyle = "#4a3a28";
      ctx.lineWidth = c * 0.08;
      ctx.beginPath();
      seg(ctx, cx - r * 0.9, cy, cx + r * 0.9, cy);
      ctx.stroke();
      ctx.lineWidth = line;
      break;
    }
    case "cart": {
      shadow(ctx, cx, cy, w / 2, h / 2, c);
      const along = p.w >= p.h;
      rect(ctx, x + c * 0.1, y + c * 0.15, w - c * 0.2, h - c * 0.3, "#7a5230", "#3a2614", line * 1.5);
      ctx.strokeStyle = "rgba(40, 22, 10, 0.5)";
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        const k = i / 4;
        if (along) seg(ctx, x + c * 0.1, y + c * 0.15 + (h - c * 0.3) * k, x + w - c * 0.1, y + c * 0.15 + (h - c * 0.3) * k);
        else seg(ctx, x + c * 0.1 + (w - c * 0.2) * k, y + c * 0.15, x + c * 0.1 + (w - c * 0.2) * k, y + h - c * 0.15);
        ctx.stroke();
      }
      // A wheel off to the side, and one still on.
      for (const [wx, wy] of along ? [[x + c * 0.6, y + c * 0.12], [x + w - c * 0.6, y + h - c * 0.12]] : [[x + c * 0.12, y + c * 0.6], [x + w - c * 0.12, y + h - c * 0.6]]) {
        ctx.strokeStyle = "#2a1a0c";
        ctx.lineWidth = c * 0.07;
        ctx.beginPath();
        ctx.arc(wx!, wy!, c * 0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = line;
      break;
    }
  }
}

function fire(ctx: Ctx, rng: Rng, x: number, y: number, r: number) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  glow.addColorStop(0, "rgba(255, 170, 60, 0.55)");
  glow.addColorStop(1, "rgba(255, 120, 30, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  for (const [color, k] of [["#d9461a", 1], ["#f08a24", 0.7], ["#ffd34d", 0.4]] as const) {
    for (let i = 0; i < 3; i++) circle(ctx, x + (rng.next() - 0.5) * r * 0.5, y + (rng.next() - 0.5) * r * 0.5, r * k * 0.6, color);
  }
}

// ---------------------------------------------------------------------------
// Walls

function drawWalls(ctx: Ctx, m: Battlemap, c: number, art?: BattlemapRenderOptions["wallArt"]) {
  // Cave walls are the rock itself.
  if (m.outlines) return;
  const ruin = m.setting === "ruins";
  const thick = c * (ruin ? 0.3 : 0.22);
  const tex = ruin ? art?.stone : art?.timber;
  if (tex) {
    // Thick walls of real timber or stone, with a dark edge and a shadow on the floor.
    const t = c * (ruin ? 0.34 : 0.28);
    const fill = ctx.createPattern(tex.img, "repeat");
    fill?.setTransform(new DOMMatrix().scale((c * tex.w) / tex.img.width));
    for (const w of m.walls) {
      if (w.door || w.window || w.cliff) continue;
      const x = Math.min(w.x1, w.x2) * c - t / 2;
      const y = Math.min(w.y1, w.y2) * c - t / 2;
      const ww = Math.abs(w.x2 - w.x1) * c + t;
      const hh = Math.abs(w.y2 - w.y1) * c + t;
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(x + c * 0.06, y + c * 0.08, ww, hh);
      ctx.fillStyle = fill ?? "#5b534a";
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = ruin ? "rgba(0, 0, 0, 0.1)" : "rgba(40, 22, 10, 0.25)";
      ctx.fillRect(x, y, ww, hh);
      ctx.strokeStyle = "#1c1814";
      ctx.lineWidth = Math.max(1, c / 25);
      ctx.strokeRect(x, y, ww, hh);
    }
  }
  ctx.lineCap = "square";
  for (const w of m.walls) {
    if (tex || w.door || w.window || w.cliff) continue;
    ctx.strokeStyle = ruin ? "#4f4b45" : "#2e2924";
    ctx.lineWidth = thick;
    ctx.beginPath();
    ctx.moveTo(w.x1 * c, w.y1 * c);
    ctx.lineTo(w.x2 * c, w.y2 * c);
    ctx.stroke();
    ctx.strokeStyle = ruin ? "#9b968c" : "#5b534a";
    ctx.lineWidth = thick * 0.45;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  for (const w of m.walls) {
    if (!w.door && !w.window) continue;
    const horizontal = w.y1 === w.y2;
    const x1 = w.x1 * c;
    const y1 = w.y1 * c;
    const fitting = w.door ? art?.door : art?.window;
    if (fitting?.length) {
      // FA doors and windows run across the middle of their square: center it on the wall edge.
      const a = fitting[(Math.abs(w.x1 * 31 + w.y1 * 17)) % fitting.length]!;
      const cx = horizontal ? x1 + c / 2 : x1;
      const cy = horizontal ? y1 : y1 + c / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (!horizontal) ctx.rotate(Math.PI / 2);
      ctx.drawImage(a.img, -c / 2, -c / 2, c, c);
      ctx.restore();
      continue;
    }
    if (w.door) {
      const t = thick * 0.8;
      const inset = c * 0.1;
      const [x, y, dw, dh] = horizontal ? [x1 + inset, y1 - t / 2, c - inset * 2, t] : [x1 - t / 2, y1 + inset, t, c - inset * 2];
      rect(ctx, x, y, dw, dh, "#8a5a2b", "#2e1d0f", Math.max(1, c / 30));
    } else {
      // Window: wall-colored frame with a pane of glass.
      ctx.strokeStyle = "#2e2924";
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(horizontal ? x1 + c : x1, horizontal ? y1 : y1 + c);
      ctx.stroke();
      ctx.strokeStyle = "#a9d4e8";
      ctx.lineWidth = thick * 0.4;
      ctx.beginPath();
      ctx.moveTo(horizontal ? x1 + c * 0.15 : x1, horizontal ? y1 : y1 + c * 0.15);
      ctx.lineTo(horizontal ? x1 + c * 0.85 : x1, horizontal ? y1 : y1 + c * 0.85);
      ctx.stroke();
    }
  }
}

/** Wall lamps: lights with no fire or glow prop under them. */
/** How far a point is from the nearest plain wall, and which way that wall lies (unit vector). */
function nearestWall(m: Battlemap, x: number, y: number): { d: number; dx: number; dy: number } | null {
  let best: { d: number; dx: number; dy: number } | null = null;
  for (const w of m.walls) {
    if (w.door || w.window || w.cliff) continue;
    const px = Math.max(Math.min(w.x1, w.x2), Math.min(Math.max(w.x1, w.x2), x));
    const py = Math.max(Math.min(w.y1, w.y2), Math.min(Math.max(w.y1, w.y2), y));
    const d = Math.hypot(px - x, py - y);
    if (d > 0 && (!best || d < best.d)) best = { d, dx: (px - x) / d, dy: (py - y) / d };
  }
  return best;
}

function drawLamps(ctx: Ctx, m: Battlemap, c: number, art?: BattlemapRenderOptions["lightArt"]) {
  const lit = new Set(m.props.filter((p) => p.kind === "campfire" || p.kind === "hearth" || p.kind === "mushrooms").flatMap((p) => {
    const cells: string[] = [];
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) cells.push(`${x},${y}`);
    return cells;
  }));
  for (const l of m.lights) {
    if (lit.has(`${Math.floor(l.x)},${Math.floor(l.y)}`)) continue;
    const glow = ctx.createRadialGradient(l.x * c, l.y * c, 0, l.x * c, l.y * c, c * 0.6);
    glow.addColorStop(0, "rgba(255, 190, 90, 0.5)");
    glow.addColorStop(1, "rgba(255, 190, 90, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(l.x * c - c * 0.6, l.y * c - c * 0.6, c * 1.2, c * 1.2);
    if (art && l.animation === "torch") {
      // A torch bracketed to the nearest wall, or a lamp post out in the open.
      const wall = nearestWall(m, l.x, l.y);
      const pool = wall && wall.d <= 0.75 ? art.wall : art.post;
      if (pool.length) {
        const a = pool[Math.abs(Math.round(l.x * 7 + l.y * 13)) % pool.length]!;
        ctx.save();
        ctx.translate(l.x * c, l.y * c);
        if (wall && wall.d <= 0.75 && pool === art.wall) {
          // The bracket is on the art's right edge: turn it to face the wall, then sit it against it.
          ctx.rotate(Math.atan2(wall.dy, wall.dx));
          ctx.translate((wall.d - 0.5) * c, 0);
        }
        ctx.drawImage(a.img, -c / 2, -c / 2, c, c);
        ctx.restore();
        continue;
      }
    }
    circle(ctx, l.x * c, l.y * c, c * 0.1, "#2e2924");
    circle(ctx, l.x * c, l.y * c, c * 0.06, "#ffcf6e");
  }
}

// ---------------------------------------------------------------------------

export function drawBattlemap(canvas: HTMLCanvasElement, m: Battlemap, o: BattlemapRenderOptions): void {
  const c = o.cell;
  canvas.width = m.width * c;
  canvas.height = m.height * c;
  const ctx = canvas.getContext("2d")!;
  const rng = createRng(`${m.seed}:paint`);

  drawGround(ctx, rng, m, c, o);
  drawLedges(ctx, m, c);
  drawDecor(ctx, m, c, o);
  drawTreeShadows(ctx, m, c, o);
  // Under-props (rugs) first, then low props, then tall ones (trees overhang everything).
  const order = (p: Prop) => (p.kind === "rug" ? 0 : p.kind === "tree" ? 2 : 1);
  const artRng = createRng(`${m.seed}:art`);
  const canopyArt = !!o.props?.tree?.length;
  for (const p of [...m.props].sort((a, b) => order(a) - order(b))) {
    if (p.kind === "tree" && canopyArt) continue;
    const art = o.props?.[p.kind];
    if (art?.length) drawPropArt(ctx, artRng, p, c, art);
    else drawProp(ctx, rng, p, c);
  }
  if (canopyArt && !o.noCanopy) drawCanopies(ctx, m, c, o);
  drawWalls(ctx, m, c, o.wallArt);
  drawLamps(ctx, m, c, o.lightArt);
  if (o.roofs) drawRoofs(ctx, m, c, o.labels, o.roofArt);

  if (o.preview) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= m.width; x++) seg(ctx, x * c, 0, x * c, m.height * c);
    for (let y = 0; y <= m.height; y++) seg(ctx, 0, y * c, m.width * c, y * c);
    ctx.stroke();
    for (const [cells, color] of [[m.zones.party, "rgba(60, 130, 255, 0.35)"], [m.zones.enemies, "rgba(230, 50, 50, 0.3)"]] as const) {
      ctx.fillStyle = color;
      for (const [x, y] of cells) ctx.fillRect(x * c, y * c, c, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Roofs

const ROOFS = ["#4a5361", "#8c3b2a", "#a68a52", "#4d7a6a", "#5a3e2b", "#6e5a4a"];

/** Gabled roofs over every town building, on a transparent canvas (or over the map for the preview). */
export function drawRoofs(ctx: Ctx, m: Battlemap, c: number, labels = false, art: ArtImage[] = []) {
  const rng = createRng(`${m.seed}:roofs`);
  /** A roof texture laid along the ridge. */
  const roofFill = (a: ArtImage, along: boolean) => {
    const p = ctx.createPattern(a.img, "repeat");
    p?.setTransform(new DOMMatrix().rotate(along ? 0 : 90).scale((c * a.w) / a.img.width));
    return p;
  };
  for (const b of m.buildings ?? []) {
    const over = c * 0.15;
    const x = b.x * c - over;
    const y = b.y * c - over;
    const w = b.w * c + over * 2;
    const h = b.h * c + over * 2;
    const color = rng.pick(ROOFS);
    // Ridge along the long side; one slope lit, one in shade.
    const along = b.w >= b.h;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(x + c * 0.12, y + c * 0.15, w, h);
    const tex = art.length ? roofFill(rng.pick(art), along) : null;
    if (tex) {
      // The texture, then light on one slope and shade on the other.
      ctx.fillStyle = tex;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255, 240, 210, 0.12)";
      if (along) ctx.fillRect(x, y, w, h / 2);
      else ctx.fillRect(x, y, w / 2, h);
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      if (along) ctx.fillRect(x, y + h / 2, w, h / 2);
      else ctx.fillRect(x + w / 2, y, w / 2, h);
    } else if (along) {
      rect(ctx, x, y, w, h / 2, shade(color, 0.12));
      rect(ctx, x, y + h / 2, w, h / 2, shade(color, -0.15));
    } else {
      rect(ctx, x, y, w / 2, h, shade(color, 0.12));
      rect(ctx, x + w / 2, y, w / 2, h, shade(color, -0.15));
    }
    // Courses of tile or thatch, running along the ridge (a textured roof has its own).
    ctx.strokeStyle = tex ? "rgba(0, 0, 0, 0)" : "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = Math.max(1, c / 30);
    ctx.beginPath();
    const step = c * 0.33;
    if (along) for (let ty = y + step; ty < y + h; ty += step) seg(ctx, x, ty, x + w, ty);
    else for (let tx = x + step; tx < x + w; tx += step) seg(ctx, tx, y, tx, y + h);
    ctx.stroke();
    ctx.strokeStyle = shade(color, -0.5);
    ctx.lineWidth = Math.max(2, c / 14);
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    if (along) seg(ctx, x, y + h / 2, x + w, y + h / 2);
    else seg(ctx, x + w / 2, y, x + w / 2, y + h);
    ctx.stroke();
    if (rng.chance(0.6)) {
      const chx = x + w * (0.2 + rng.next() * 0.6);
      const chy = y + h * (0.2 + rng.next() * 0.6);
      rect(ctx, chx - c * 0.18, chy - c * 0.18, c * 0.36, c * 0.36, "#6f6a62", "#2e2a26", Math.max(1, c / 30));
      rect(ctx, chx - c * 0.1, chy - c * 0.1, c * 0.2, c * 0.2, "#1d1a17");
    }
    if (labels) {
      const lx = x + w / 2;
      const ly = y + h / 2;
      circle(ctx, lx, ly, c * 0.55, "rgba(20, 20, 20, 0.75)");
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(c * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.id), lx, ly + c * 0.03);
    }
  }
}

export function roofsToBlob(m: Battlemap, cell: number, art: ArtImage[] = []): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = m.width * cell;
  canvas.height = m.height * cell;
  drawRoofs(canvas.getContext("2d")!, m, cell, false, art);
  // PNG keeps the transparency around the roofs.
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/png"));
}

/** Tree canopies alone on a transparent canvas, for an overhead tile that fades when tokens walk beneath. */
export function canopyToBlob(m: Battlemap, o: BattlemapRenderOptions): Promise<Blob> | null {
  if (!o.props?.tree?.length || !m.props.some((p) => p.kind === "tree")) return null;
  const canvas = document.createElement("canvas");
  canvas.width = m.width * o.cell;
  canvas.height = m.height * o.cell;
  drawCanopies(canvas.getContext("2d")!, m, o.cell, o);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.9));
}

export function battlemapToBlob(m: Battlemap, o: BattlemapRenderOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawBattlemap(canvas, m, o);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.9),
  );
}

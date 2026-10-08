import {
  createRng,
  FLOOR,
  floorOutlines,
  placementCells,
  roomCells,
  roomCenter,
  type DungeonLight,
  type DungeonMap,
  type Furnishing,
  type Rng,
  type RoomKey,
  type WallSegment,
} from "@dnd-toolkit/core";
import { CAVE_FLOOR_STYLE, ROCK_STYLE, stoneTexture } from "./texture.ts";
import type { DungeonArt } from "./fa-assets.ts";

export interface RenderOptions {
  /** Pixels per grid cell. */
  cell: number;
  /** Draw room numbers (GM preview only — never bake into player-visible backgrounds). */
  labels?: boolean;
  /** Light sources to paint into the scene (sconces, braziers, glowing fungi...). */
  lights?: DungeonLight[];
  /** Forgotten Adventures textures and clutter; without it the map keeps its painted look. */
  art?: DungeonArt | null;
  /** The room key, so clutter stays clear of doors, traps and loot (and the lair gets its bones). */
  keys?: RoomKey[];
}

const PALETTES = {
  dungeon: { floor: "#d6cbb3", grid: "rgba(60, 45, 30, 0.1)", wall: "#15110e", door: "#8a5a2b", label: "#8c2a1e" },
  cave: { floor: "#8f816c", grid: "", wall: "#110e0b", door: "#8a5a2b", label: "#962a1e" },
};

/** Vary a hex color's lightness by `amount` (-1..1). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The floor as one path: smooth for caves, cell edges for rooms and corridors. */
export function floorPath(map: DungeonMap, c: number): Path2D {
  const path = new Path2D();
  for (const loop of map.outlines ?? floorOutlines(map.cells)) {
    loop.forEach(([x, y], i) => {
      if (i) path.lineTo(x * c, y * c);
      else path.moveTo(x * c, y * c);
    });
    path.closePath();
  }
  return path;
}

/** Paint a light source as scenery; Foundry's AmbientLights do the actual lighting. */
function drawLight(ctx: CanvasRenderingContext2D, rng: Rng, l: DungeonLight, c: number) {
  const x = l.x * c;
  const y = l.y * c;
  switch (l.kind) {
    case "torch": {
      glow(ctx, x, y, c * 0.9, "255, 170, 80", 0.35);
      dot(ctx, x, y, c * 0.13, "#2a2420");
      dot(ctx, x, y, c * 0.08, "#ff9a3c");
      dot(ctx, x, y, c * 0.04, "#ffe08a");
      break;
    }
    case "brazier":
    case "campfire": {
      glow(ctx, x, y, c * 1.3, "255, 140, 50", 0.4);
      if (l.kind === "brazier") {
        dot(ctx, x, y, c * 0.36, "#3a3430");
        dot(ctx, x, y, c * 0.28, "#1d1916");
      } else {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          dot(ctx, x + Math.cos(a) * c * 0.3, y + Math.sin(a) * c * 0.3, c * 0.07, "#6f6a62");
        }
      }
      for (const [color, k] of [["#d9461a", 0.2], ["#f08a24", 0.14], ["#ffd34d", 0.07]] as const) {
        for (let i = 0; i < 3; i++) dot(ctx, x + (rng.next() - 0.5) * c * 0.15, y + (rng.next() - 0.5) * c * 0.15, c * k, color);
      }
      break;
    }
    case "candles": {
      glow(ctx, x, y, c * 0.7, "255, 200, 120", 0.3);
      for (let i = 0; i < 5; i++) {
        const cx = x + (rng.next() - 0.5) * c * 0.5;
        const cy = y + (rng.next() - 0.5) * c * 0.5;
        dot(ctx, cx, cy, c * 0.05, "#efe4c8");
        dot(ctx, cx, cy, c * 0.02, "#ffb347");
      }
      break;
    }
    case "fungi": {
      glow(ctx, x, y, c * 0.9, "79, 209, 197", 0.35);
      for (let i = 0; i < 6; i++) dot(ctx, x + (rng.next() - 0.5) * c * 0.7, y + (rng.next() - 0.5) * c * 0.7, c * (0.04 + rng.next() * 0.05), rng.pick(["#7ff5e6", "#4fd1c5", "#a6fff2"]));
      break;
    }
    case "crystal": {
      glow(ctx, x, y, c * 1, "176, 124, 255", 0.35);
      for (let i = 0; i < 3; i++) {
        const a = rng.next() * Math.PI * 2;
        const len = c * (0.25 + rng.next() * 0.2);
        ctx.fillStyle = rng.pick(["#c9a8ff", "#9a6bff", "#e2d4ff"]);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.lineTo(x + Math.cos(a + 1.9) * c * 0.08, y + Math.sin(a + 1.9) * c * 0.08);
        ctx.lineTo(x + Math.cos(a - 1.9) * c * 0.08, y + Math.sin(a - 1.9) * c * 0.08);
        ctx.fill();
      }
      break;
    }
    case "lava": {
      glow(ctx, x, y, c * 1.4, "255, 90, 26", 0.35);
      ctx.lineCap = "round";
      const a = rng.next() * Math.PI;
      const pts = [-1, -0.4, 0.3, 1].map((t) => [x + Math.cos(a) * t * c * 0.8 + (rng.next() - 0.5) * c * 0.25, y + Math.sin(a) * t * c * 0.8 + (rng.next() - 0.5) * c * 0.25]);
      for (const [color, width] of [["#3a120a", 0.22], ["#ff5a1a", 0.12], ["#ffd36b", 0.04]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = c * width;
        ctx.beginPath();
        pts.forEach(([px, py], i) => {
          if (i) ctx.lineTo(px!, py!);
          else ctx.moveTo(px!, py!);
        });
        ctx.stroke();
      }
      break;
    }
    case "daylight": {
      glow(ctx, x, y, c * 2.6, "255, 245, 215", 0.28);
      break;
    }
  }
}

const FACING = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 } as const;
const FURNITURE_COLOR: Partial<Record<Furnishing["kind"], string>> = {
  bed: "#7a5a3a", bedroll: "#6b5a44", table: "#8a6338", bench: "#7a5530", barrel: "#6d4a2a", crate: "#9a7a4a", chest: "#5a3a1e", altar: "#8d8a83",
  coffin: "#4a3424", sarcophagus: "#9b968c", bookcase: "#4e3420", shelf: "#6b4a2a", rug: "#7a2f2a", pillar: "#a19c92", bones: "#e2dccb", skeleton: "#e2dccb",
  forge: "#5a2a1a", anvil: "#3c3c40", mineCart: "#55504a", support: "#6d5030", cauldron: "#2e2e30", cage: "#4a4a4e", pew: "#6b4a2a", desk: "#6b4426",
};

/**
 * Room furniture: FA art fitted to each footprint and turned to put its back to the wall, or a
 * plain painted shape without the art.
 */
function drawFurniture(ctx: CanvasRenderingContext2D, c: number, keys: RoomKey[], art?: DungeonArt | null) {
  const rng = createRng(keys.map((k) => k.roomId).join(":") + ":furniture");
  // Rugs first, then everything else.
  const all = keys.flatMap((k) => k.furniture ?? []).sort((a, b) => Number(b.kind === "rug") - Number(a.kind === "rug"));
  for (const f of all) {
    const pool = art?.furniture[f.kind];
    const cx = (f.x + f.w / 2) * c;
    const cy = (f.y + f.h / 2) * c;
    ctx.save();
    ctx.translate(cx, cy);
    if (pool?.length) {
      // Prefer art the same size as the footprint (either way round).
      const exact = pool.filter((a) => (a.w === f.w && a.h === f.h) || (a.w === f.h && a.h === f.w));
      const a = rng.pick(exact.length ? exact : pool);
      let angle: number = FACING[f.facing];
      // After turning, the art's long side must run the same way as the footprint's.
      const quarter = Math.abs(Math.round(angle / (Math.PI / 2))) % 2 === 1;
      const [rw, rh] = quarter ? [a.h, a.w] : [a.w, a.h];
      if (f.w !== f.h && (f.w > f.h) !== (rw > rh)) angle += Math.PI / 2;
      const turned = Math.abs(Math.round(angle / (Math.PI / 2))) % 2 === 1;
      const [fw, fh] = turned ? [f.h, f.w] : [f.w, f.h];
      const k = Math.min(fw / a.w, fh / a.h);
      ctx.rotate(angle);
      ctx.drawImage(a.img, (-a.w * k * c) / 2, (-a.h * k * c) / 2, a.w * k * c, a.h * k * c);
    } else {
      ctx.fillStyle = FURNITURE_COLOR[f.kind] ?? "#7a6a55";
      ctx.strokeStyle = "rgba(20, 14, 8, 0.8)";
      ctx.lineWidth = Math.max(1, c / 30);
      const inset = f.kind === "rug" ? 0.05 : 0.15;
      ctx.fillRect((-f.w / 2 + inset) * c, (-f.h / 2 + inset) * c, (f.w - inset * 2) * c, (f.h - inset * 2) * c);
      ctx.strokeRect((-f.w / 2 + inset) * c, (-f.h / 2 + inset) * c, (f.w - inset * 2) * c, (f.h - inset * 2) * c);
    }
    ctx.restore();
  }
}

/** Torches on their brackets, braziers and candles, on top of the painted glow. */
function drawLightArt(ctx: CanvasRenderingContext2D, l: DungeonLight, c: number, art: DungeonArt) {
  const pick = (pool: { img: HTMLImageElement }[]) => pool[Math.abs(Math.round(l.x * 7 + l.y * 13)) % pool.length]!;
  if (l.kind === "torch" && art.torches.length) {
    // Torches sit 0.42 of a square from their cell's center toward the wall; the bracket is the art's right edge.
    const dx = l.x - (Math.floor(l.x) + 0.5);
    const dy = l.y - (Math.floor(l.y) + 0.5);
    ctx.save();
    ctx.translate((Math.floor(l.x) + 0.5) * c, (Math.floor(l.y) + 0.5) * c);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.drawImage(pick(art.torches).img, -c / 2, -c / 2, c, c);
    ctx.restore();
  } else if (l.kind === "brazier" && art.braziers.length) {
    ctx.drawImage(pick(art.braziers).img, (l.x - 0.5) * c, (l.y - 0.5) * c, c, c);
  } else if (l.kind === "candles" && art.candles.length) {
    for (const [ox, oy] of [[-0.22, -0.1], [0.18, -0.2], [0.05, 0.2]]) ctx.drawImage(pick(art.candles).img, (l.x + ox! - 0.35) * c, (l.y + oy! - 0.35) * c, c * 0.7, c * 0.7);
  }
}

/** A repeating fill for an art texture at its true size in squares. */
function artPattern(ctx: CanvasRenderingContext2D, t: { img: HTMLImageElement; w: number }, c: number): CanvasPattern | string {
  const p = ctx.createPattern(t.img, "repeat");
  p?.setTransform(new DOMMatrix().scale((c * t.w) / t.img.width));
  return p ?? "#555";
}

/**
 * Leave things lying along the walls: crates, sacks, rubble, mushrooms in caves, bones in the
 * lair. Never on doorways, trap triggers or loot piles (that would give them away).
 */
function drawClutter(ctx: CanvasRenderingContext2D, map: DungeonMap, c: number, art: DungeonArt, keys: RoomKey[]) {
  const rng = createRng(`${map.seed}:clutter`);
  const floor = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;
  const keep = new Set<string>();
  for (const k of keys) {
    for (const f of k.furniture ?? []) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) keep.add(`${x},${y}`);
    for (const [x, y] of k.trapCells ?? []) keep.add(`${x},${y}`);
    for (const p of k.piles ?? []) keep.add(`${p.cell[0]},${p.cell[1]}`);
  }
  for (const w of map.walls) {
    if (!w.door) continue;
    const cells = w.y1 === w.y2 ? [[w.x1, w.y1 - 1], [w.x1, w.y1]] : [[w.x1 - 1, w.y1], [w.x1, w.y1]];
    for (const [x, y] of cells) keep.add(`${x},${y}`);
  }
  const lair = keys.find((k) => /Lair/.test(k.title))?.roomId;
  for (const room of map.rooms) {
    const [cx, cy] = roomCenter(room);
    const spots = roomCells(room).filter(([x, y]) => (x !== cx || y !== cy) && !keep.has(`${x},${y}`)
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !floor(x + dx!, y + dy!)));
    const pool = room.id === lair && art.remains.length ? [...art.remains, ...art.clutter] : art.clutter;
    if (!pool.length) continue;
    const count = Math.min(spots.length, Math.round(roomCells(room).length / 10 * (0.5 + rng.next())));
    for (const [x, y] of rng.shuffle(spots).slice(0, count)) {
      const a = rng.pick(pool);
      ctx.save();
      ctx.translate((x + 0.5) * c, (y + 0.5) * c);
      ctx.rotate(rng.int(0, 3) * (Math.PI / 2) + (rng.next() - 0.5) * 0.4);
      const k = a.w > 1 || a.h > 1 ? 1 : 0.85;
      ctx.drawImage(a.img, (-a.w * c * k) / 2, (-a.h * c * k) / 2, a.w * c * k, a.h * c * k);
      ctx.restore();
    }
  }
}

export function drawDungeon(canvas: HTMLCanvasElement, map: DungeonMap, o: RenderOptions): void {
  const c = o.cell;
  const P = PALETTES[map.style ?? "dungeon"];
  const cave = map.style === "cave";
  const rng = createRng(`${map.seed}:paint`);
  canvas.width = map.width * c;
  canvas.height = map.height * c;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  const floor = floorPath(map, c);
  const W = canvas.width;
  const H = canvas.height;

  // Rock: textured stone, darkening toward the walls so the floor sits in a pit of shadow.
  const art = o.art;
  if (art?.rock) {
    ctx.fillStyle = artPattern(ctx, art.rock, c);
    ctx.fillRect(0, 0, W, H);
    // Solid rock reads darker than the floor.
    ctx.fillStyle = "rgba(10, 8, 6, 0.55)";
    ctx.fillRect(0, 0, W, H);
  } else ctx.drawImage(stoneTexture(map.width, map.height, `${map.seed}:rock`, ROCK_STYLE), 0, 0, W, H);
  const outside = new Path2D();
  outside.rect(0, 0, W, H);
  outside.addPath(floor);
  ctx.save();
  ctx.clip(outside, "evenodd");
  ctx.lineJoin = "round";
  for (const [width, alpha] of [[1.4, 0.18], [0.8, 0.25], [0.35, 0.35]] as const) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = c * width;
    ctx.stroke(floor);
  }
  ctx.restore();

  // Floor.
  ctx.save();
  ctx.clip(floor, "evenodd");
  if (art?.floor) {
    ctx.fillStyle = artPattern(ctx, art.floor, c);
    ctx.fillRect(0, 0, W, H);
  } else if (cave) {
    ctx.drawImage(stoneTexture(map.width, map.height, `${map.seed}:floor`, CAVE_FLOOR_STYLE), 0, 0, W, H);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.cells[y]![x] === FLOOR && rng.chance(0.3)) dot(ctx, (x + rng.next()) * c, (y + rng.next()) * c, c * 0.04, shade(P.floor, -0.4));
      }
    }
  } else {
    ctx.fillStyle = P.floor;
    ctx.fillRect(0, 0, W, H);
    // Flagstones: barely-there tone shifts, one slab per square.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.cells[y]![x] !== FLOOR) continue;
        ctx.fillStyle = shade(P.floor, (rng.next() - 0.5) * 0.07);
        ctx.fillRect(x * c + 1, y * c + 1, c - 2, c - 2);
      }
    }
    // A wash of the stone texture so the floor isn't flat.
    ctx.globalAlpha = 0.12;
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(stoneTexture(map.width, map.height, `${map.seed}:floor`, CAVE_FLOOR_STYLE, 8), 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  drawFurniture(ctx, c, o.keys ?? [], art);
  if (art) drawClutter(ctx, map, c, art, o.keys ?? []);
  if (P.grid && !art?.floor) {
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = Math.max(1, c / 60);
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) {
      ctx.moveTo(x * c, 0);
      ctx.lineTo(x * c, H);
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.moveTo(0, y * c);
      ctx.lineTo(W, y * c);
    }
    ctx.stroke();
  }
  // Inner shadow along the walls for depth.
  ctx.lineJoin = "round";
  for (const [width, alpha] of [[0.6, 0.12], [0.32, 0.18]] as const) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = c * width;
    ctx.stroke(floor);
  }
  for (const l of o.lights ?? []) {
    drawLight(ctx, rng, l, c);
    if (art) drawLightArt(ctx, l, c, art);
  }
  ctx.restore();

  // Crisp walls.
  ctx.strokeStyle = P.wall;
  ctx.lineWidth = Math.max(2, c * 0.12);
  ctx.lineJoin = "round";
  ctx.stroke(floor);

  for (const w of map.walls) {
    if (!w.door) continue;
    const horizontal = w.y1 === w.y2;
    const x1 = w.x1 * c;
    const y1 = w.y1 * c;
    if (w.secret) {
      // Looks like solid wall to the players; the GM preview marks it.
      ctx.strokeStyle = o.labels ? "#b04dff" : P.wall;
      ctx.lineWidth = Math.max(2, c * (o.labels ? 0.2 : 0.14));
      ctx.setLineDash(o.labels ? [c * 0.2, c * 0.12] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(w.x2 * c, w.y2 * c);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (art?.doors.length) {
      // FA doors run across the middle of their square: center one on the doorway.
      const a = art.doors[Math.abs(w.x1 * 31 + w.y1 * 17) % art.doors.length]!;
      ctx.save();
      ctx.translate(horizontal ? x1 + c / 2 : x1, horizontal ? y1 : y1 + c / 2);
      if (!horizontal) ctx.rotate(Math.PI / 2);
      ctx.drawImage(a.img, -c / 2, -c / 2, c, c);
      ctx.restore();
      continue;
    }
    // A plank door between two posts.
    const thick = Math.max(3, c * 0.18);
    const post = Math.max(2, c * 0.14);
    const len = c - post * 2;
    const [dx, dy, dw, dh] = horizontal ? [x1 + post, y1 - thick / 2, len, thick] : [x1 - thick / 2, y1 + post, thick, len];
    ctx.fillStyle = P.door;
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = "#2e1d0f";
    ctx.lineWidth = Math.max(1, c / 40);
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(dx + dw / 2, dy);
      ctx.lineTo(dx + dw / 2, dy + dh);
    } else {
      ctx.moveTo(dx, dy + dh / 2);
      ctx.lineTo(dx + dw, dy + dh / 2);
    }
    ctx.stroke();
    ctx.fillStyle = P.wall;
    for (const t of [0, 1]) {
      const px = horizontal ? x1 + t * (c - post) : x1 - post / 2;
      const py = horizontal ? y1 - post / 2 : y1 + t * (c - post);
      ctx.fillRect(px, py, post, post);
    }
  }

  if (o.labels) {
    const r = Math.max(6, c * 0.7);
    ctx.font = `bold ${Math.round(r * 1.1)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const room of map.rooms) {
      const [cx, cy] = roomCenter(room);
      const px = (cx + 0.5) * c;
      const py = (cy + 0.5) * c;
      ctx.fillStyle = room.hidden ? "#7a3bb8" : P.label;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(String(room.id), px, py + r * 0.05);
    }
  }
}

/** The cells each room's monsters will stand on, in the order they're filled. Shared with the scene importer. */
export const tokenCells = (map: DungeonMap, key: RoomKey) => {
  const room = map.rooms.find((r) => r.id === key.roomId);
  return room ? placementCells(map, room, `${map.seed}:tokens:${room.id}`, (key.piles ?? []).map((p) => p.cell)) : [];
};

/**
 * GM preview overlay: a dot per creature where its token will go (red; dark red in the lair),
 * gold squares for loot piles and dashed outlines around hidden rooms.
 */
/** Preview marks: trap triggers (red crossed squares) and locked, stuck or barred doors (gold dots). */
export function drawInteractiveMarks(ctx: CanvasRenderingContext2D, traps: readonly (readonly [number, number][])[], walls: readonly WallSegment[], c: number) {
  ctx.save();
  for (const cells of traps) {
    for (const [x, y] of cells) {
      ctx.fillStyle = "rgba(214, 40, 40, 0.35)";
      ctx.fillRect(x * c, y * c, c, c);
      ctx.strokeStyle = "#d62828";
      ctx.lineWidth = Math.max(1, c * 0.08);
      ctx.beginPath();
      ctx.moveTo((x + 0.2) * c, (y + 0.2) * c);
      ctx.lineTo((x + 0.8) * c, (y + 0.8) * c);
      ctx.moveTo((x + 0.8) * c, (y + 0.2) * c);
      ctx.lineTo((x + 0.2) * c, (y + 0.8) * c);
      ctx.stroke();
    }
  }
  for (const w of walls) {
    if (!w.lock) continue;
    ctx.fillStyle = w.lock.kind === "stuck" ? "#c98b3a" : w.lock.kind === "barred" ? "#8a5a2b" : w.lock.kind === "arcane" ? "#9d6cff" : "#f0c040";
    ctx.strokeStyle = "#2a1a05";
    ctx.lineWidth = Math.max(1, c * 0.06);
    ctx.beginPath();
    ctx.arc(((w.x1 + w.x2) / 2) * c, ((w.y1 + w.y2) / 2) * c, c * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawDungeonOverlay(canvas: HTMLCanvasElement, map: DungeonMap, keys: RoomKey[], c: number) {
  const ctx = canvas.getContext("2d")!;
  drawInteractiveMarks(ctx, keys.flatMap((k) => (k.trapCells ? [k.trapCells] : [])), map.walls, c);
  // Puzzle pieces: violet diamonds.
  for (const p of map.puzzles ?? []) {
    for (const el of p.elements) {
      const [x, y] = el.cell;
      ctx.fillStyle = "#9b6cff";
      ctx.strokeStyle = "#2a1650";
      ctx.lineWidth = Math.max(1, c * 0.06);
      ctx.beginPath();
      ctx.moveTo((x + 0.5) * c, (y + 0.15) * c);
      ctx.lineTo((x + 0.85) * c, (y + 0.5) * c);
      ctx.lineTo((x + 0.5) * c, (y + 0.85) * c);
      ctx.lineTo((x + 0.15) * c, (y + 0.5) * c);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  for (const key of keys) {
    const room = map.rooms.find((r) => r.id === key.roomId);
    if (!room) continue;
    if (room.hidden) {
      ctx.strokeStyle = "#b04dff";
      ctx.lineWidth = Math.max(1, c * 0.12);
      ctx.setLineDash([c * 0.4, c * 0.25]);
      const inside = new Set(roomCells(room).map(([x, y]) => `${x},${y}`));
      for (const [x, y] of roomCells(room)) {
        // Outline only the room's border.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (inside.has(`${x + dx},${y + dy}`)) continue;
          ctx.beginPath();
          const ex = dx === 1 ? x + 1 : x;
          const ey = dy === 1 ? y + 1 : y;
          ctx.moveTo(ex * c, ey * c);
          ctx.lineTo((dx ? ex : ex + 1) * c, (dy ? ey : ey + 1) * c);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
    for (const p of key.piles ?? []) {
      ctx.fillStyle = "#e0b43a";
      ctx.strokeStyle = "#4a3410";
      ctx.lineWidth = Math.max(1, c * 0.08);
      ctx.fillRect((p.cell[0] + 0.25) * c, (p.cell[1] + 0.25) * c, c * 0.5, c * 0.5);
      ctx.strokeRect((p.cell[0] + 0.25) * c, (p.cell[1] + 0.25) * c, c * 0.5, c * 0.5);
    }
    if (!key.encounter) continue;
    const count = key.encounter.groups.reduce((n, g) => n + g.count, 0);
    const lair = key.title.endsWith("Lair");
    for (const [x, y] of tokenCells(map, key).slice(0, count)) {
      dot(ctx, (x + 0.5) * c, (y + 0.5) * c, c * 0.32, lair ? "#7a0f0f" : "#d6332a");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1, c * 0.06);
      ctx.beginPath();
      ctx.arc((x + 0.5) * c, (y + 0.5) * c, c * 0.32, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function dungeonToBlob(map: DungeonMap, o: RenderOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawDungeon(canvas, map, o);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.9),
  );
}

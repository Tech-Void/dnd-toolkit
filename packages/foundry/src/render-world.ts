import { createRng, valueNoise, type WorldCell, type WorldMap } from "@dnd-toolkit/core";

// ---------------------------------------------------------------------------
// Paints a region map like an old atlas: soft colour fields for the land, little trees, hills and
// peaks drawn over them, rivers and dashed roads, place markers, a compass and a faded border.

type Ctx = CanvasRenderingContext2D;

const BASE: Record<WorldCell, [number, number, number]> = {
  water: [86, 128, 150], coast: [214, 196, 150], grassland: [170, 178, 112], forest: [104, 132, 82], hills: [168, 150, 104],
  mountains: [140, 128, 112], swamp: [112, 124, 92], desert: [222, 196, 140], arctic: [226, 230, 232],
};

const INK = "rgba(52, 40, 28, 0.85)";

/** Pixels per map cell. */
export const WORLD_CELL_PX = 50;

export function drawWorld(canvas: { width: number; height: number; getContext(t: "2d"): any }, m: WorldMap, makeCanvas: (w: number, h: number) => any, s = WORLD_CELL_PX) {
  const W = m.w * s;
  const H = m.h * s;
  canvas.width = W;
  canvas.height = H;
  const ctx: Ctx = canvas.getContext("2d");
  const rng = createRng(`${m.seed}:paint`);
  const at = (x: number, y: number) => m.cells[y * m.w + x]!;

  // Colour field, sampled F times finer than the cells: height is interpolated between cell
  // centres (so the shore curves instead of stepping), land colours blend between neighbours.
  const F = 4;
  const SEA = 0.34;
  const hAt = (x: number, y: number) => m.height[Math.max(0, Math.min(m.h - 1, y)) * m.w + Math.max(0, Math.min(m.w - 1, x))] ?? 0.5;
  const landColor = (x: number, y: number): [number, number, number] => {
    const cx = Math.max(0, Math.min(m.w - 1, x));
    const cy = Math.max(0, Math.min(m.h - 1, y));
    const c = at(cx, cy);
    const e = m.height[cy * m.w + cx] ?? 0.5;
    const base = c === "water" ? BASE.coast : BASE[c];
    const shade = 0.88 + Math.max(e, SEA) * 0.22;
    return [base[0] * shade, base[1] * shade, base[2] * shade];
  };
  const fw = m.w * F;
  const fh = m.h * F;
  // A little domain warp, so biome edges wobble instead of following the cell grid.
  const warpRng = createRng(`${m.seed}:warp`);
  const wx = valueNoise(warpRng, fw, fh, F * 1.5);
  const wy = valueNoise(warpRng, fw, fh, F * 1.5);
  const small = makeCanvas(fw, fh);
  const sctx: Ctx = small.getContext("2d");
  const img = sctx.createImageData(fw, fh);
  for (let py = 0; py < fh; py++) {
    for (let px = 0; px < fw; px++) {
      const gx = (px + 0.5) / F - 0.5 + (wx[py]![px]! - 0.5) * 0.9;
      const gy = (py + 0.5) / F - 0.5 + (wy[py]![px]! - 0.5) * 0.9;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const e = lerp(lerp(hAt(x0, y0), hAt(x0 + 1, y0), tx), lerp(hAt(x0, y0 + 1), hAt(x0 + 1, y0 + 1), tx), ty);
      let rgb: number[];
      if (e < SEA) {
        const d = Math.max(0, e) / SEA;
        rgb = BASE.water.map((v) => v * (0.55 + d * 0.5));
        // Shallows near the shore.
        if (e > SEA - 0.03) rgb = rgb.map((v, i) => lerp(v, [150, 190, 196][i]!, (e - (SEA - 0.03)) / 0.03 * 0.6));
      } else {
        const c00 = landColor(x0, y0), c10 = landColor(x0 + 1, y0), c01 = landColor(x0, y0 + 1), c11 = landColor(x0 + 1, y0 + 1);
        rgb = [0, 1, 2].map((i) => lerp(lerp(c00[i]!, c10[i]!, tx), lerp(c01[i]!, c11[i]!, tx), ty));
      }
      img.data.set([Math.min(255, rgb[0]!), Math.min(255, rgb[1]!), Math.min(255, rgb[2]!), 255], (py * fw + px) * 4);
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, W, H);

  // Coastline: marching squares on the cell-centre heights at sea level.
  ctx.strokeStyle = "rgba(40, 60, 70, 0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = -1; y < m.h; y++) {
    for (let x = -1; x < m.w; x++) {
      const v = [hAt(x, y), hAt(x + 1, y), hAt(x + 1, y + 1), hAt(x, y + 1)];
      const corners: [number, number][] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      const pts: [number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const a = v[k]!;
        const b = v[(k + 1) % 4]!;
        if ((a < SEA) !== (b < SEA)) {
          const t = (SEA - a) / (b - a);
          const [ax, ay] = corners[k]!;
          const [bx, by] = corners[(k + 1) % 4]!;
          pts.push([(ax + (bx - ax) * t + 0.5) * s, (ay + (by - ay) * t + 0.5) * s]);
        }
      }
      for (let k = 0; k + 1 < pts.length; k += 2) {
        ctx.moveTo(pts[k]![0], pts[k]![1]);
        ctx.lineTo(pts[k + 1]![0], pts[k + 1]![1]);
      }
    }
  }
  ctx.stroke();

  // Paper grain.
  for (let i = 0; i < (W * H) / 90; i++) {
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? "255,248,230" : "60,40,20"},${0.03 + rng.next() * 0.05})`;
    ctx.fillRect(rng.next() * W, rng.next() * H, 1 + rng.next() * 2, 1 + rng.next() * 2);
  }

  // Ripples offshore.
  ctx.strokeStyle = "rgba(230, 240, 245, 0.25)";
  ctx.lineWidth = 1.5;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (at(x, y) !== "water" || !rng.chance(0.12)) continue;
    const cx = (x + rng.next()) * s;
    const cy = (y + rng.next()) * s;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.25, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  // Rivers, smoothed through cell centres.
  const curve = (pts: [number, number][]) => {
    const p = pts.map(([x, y]) => [(x + 0.5) * s, (y + 0.5) * s] as [number, number]);
    ctx.beginPath();
    ctx.moveTo(p[0]![0], p[0]![1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i]![0] + p[i + 1]![0]) / 2;
      const my = (p[i]![1] + p[i + 1]![1]) / 2;
      ctx.quadraticCurveTo(p[i]![0], p[i]![1], mx, my);
    }
    const last = p.at(-1)!;
    ctx.lineTo(last[0], last[1]);
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const r of m.rivers) {
    curve(r);
    ctx.strokeStyle = "rgba(60, 100, 130, 0.9)";
    ctx.lineWidth = s * 0.16;
    ctx.stroke();
    ctx.strokeStyle = "rgba(140, 180, 200, 0.6)";
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
  }

  // Terrain marks, back to front so lower ones overlap the ones above.
  const draw: [number, () => void][] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = at(x, y);
    const jx = () => (x + 0.15 + rng.next() * 0.7) * s;
    const jy = () => (y + 0.2 + rng.next() * 0.65) * s;
    if (c === "forest") for (let i = 0; i < 3; i++) {
      const [px, py, r] = [jx(), jy(), s * (0.13 + rng.next() * 0.06)];
      draw.push([py, () => tree(ctx, px, py, r)]);
    }
    else if (c === "mountains" && rng.chance(0.8)) { const [px, py] = [(x + 0.5 + (rng.next() - 0.5) * 0.7) * s, (y + 0.6 + rng.next() * 0.4) * s]; const sz = s * (0.4 + rng.next() * 0.45); draw.push([py, () => peak(ctx, px, py, sz)]); }
    else if (c === "hills" && rng.chance(0.75)) { const [px, py] = [jx(), jy()]; draw.push([py, () => hill(ctx, px, py, s * 0.32)]); }
    else if (c === "swamp" && rng.chance(0.8)) { const [px, py] = [jx(), jy()]; draw.push([py, () => reeds(ctx, px, py, s * 0.18)]); }
    else if (c === "desert" && rng.chance(0.4)) { const [px, py] = [jx(), jy()]; draw.push([py, () => dune(ctx, px, py, s * 0.3)]); }
    else if (c === "arctic" && rng.chance(0.35)) { const [px, py] = [jx(), jy()]; draw.push([py, () => snow(ctx, px, py, s * 0.15)]); }
    else if (c === "grassland" && rng.chance(0.18)) { const [px, py] = [jx(), jy()]; draw.push([py, () => grass(ctx, px, py, s * 0.1)]); }
  }
  for (const [, fn] of draw.sort((a, b) => a[0] - b[0])) fn();

  // Roads: a pale bed with a dashed ink line.
  for (const r of m.roads) {
    curve(r.path);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(235, 220, 180, 0.55)";
    ctx.lineWidth = s * 0.16;
    ctx.stroke();
    ctx.setLineDash([s * 0.22, s * 0.14]);
    ctx.strokeStyle = "rgba(110, 70, 40, 0.9)";
    ctx.lineWidth = s * 0.07;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Places.
  for (const p of m.places) {
    const cx = (p.x + 0.5) * s;
    const cy = (p.y + 0.5) * s;
    if (p.kind === "city" || p.kind === "town" || p.kind === "village") town(ctx, cx, cy, s * (p.kind === "city" ? 0.42 : p.kind === "town" ? 0.34 : 0.26));
    else site(ctx, cx, cy, s * 0.28, p.kind);
  }

  // Border and compass.
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, "rgba(80,50,20,0)");
  v.addColorStop(1, "rgba(80,50,20,0.38)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  compass(ctx, W - s * 2.2, H - s * 2.4, s * 1.4);
}

function tree(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(40, 30, 20, 0.35)";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.3, y + r * 0.9, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4f6e3d";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(200, 220, 150, 0.35)";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function peak(ctx: Ctx, x: number, y: number, size: number) {
  const h = size;
  const w = size * 0.75;
  ctx.fillStyle = "#b5a58a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  // Shadow side.
  ctx.fillStyle = "rgba(70, 55, 40, 0.45)";
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w * 0.15, y);
  ctx.closePath();
  ctx.fill();
  // Snowcap.
  ctx.fillStyle = "rgba(250, 250, 250, 0.9)";
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x - w * 0.3, y - h * 0.62);
  ctx.lineTo(x - w * 0.08, y - h * 0.7);
  ctx.lineTo(x + w * 0.05, y - h * 0.6);
  ctx.lineTo(x + w * 0.3, y - h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

function hill(ctx: Ctx, x: number, y: number, r: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.fillStyle = "rgba(150, 128, 84, 0.55)";
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.quadraticCurveTo(x, y - r * 1.2, x + r, y);
  ctx.fill();
  ctx.stroke();
}

function reeds(ctx: Ctx, x: number, y: number, r: number) {
  ctx.strokeStyle = "rgba(50, 60, 35, 0.8)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.2, y);
  ctx.lineTo(x + r * 1.2, y);
  for (const dx of [-0.6, 0, 0.6]) {
    ctx.moveTo(x + dx * r, y);
    ctx.lineTo(x + dx * r * 1.4, y - r * (1.2 + Math.abs(dx)));
  }
  ctx.stroke();
}

function dune(ctx: Ctx, x: number, y: number, r: number) {
  ctx.strokeStyle = "rgba(140, 100, 50, 0.6)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(x, y + r, r, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();
}

function snow(ctx: Ctx, x: number, y: number, r: number) {
  ctx.strokeStyle = "rgba(150, 170, 190, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.stroke();
}

function grass(ctx: Ctx, x: number, y: number, r: number) {
  ctx.strokeStyle = "rgba(80, 90, 40, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x, y);
  ctx.lineTo(x + r, y - r);
  ctx.stroke();
}

function town(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(245, 235, 210, 0.9)";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Little roofs.
  ctx.fillStyle = "#9c4a32";
  const n = r > 18 ? 4 : r > 14 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.6;
    const hx = x + Math.cos(a) * r * 0.42;
    const hy = y + Math.sin(a) * r * 0.42;
    const b = r * 0.28;
    ctx.fillRect(hx - b, hy - b * 0.4, b * 2, b * 1.2);
    ctx.beginPath();
    ctx.moveTo(hx - b * 1.2, hy - b * 0.4);
    ctx.lineTo(hx, hy - b * 1.4);
    ctx.lineTo(hx + b * 1.2, hy - b * 0.4);
    ctx.fill();
  }
}

function site(ctx: Ctx, x: number, y: number, r: number, kind: string) {
  ctx.fillStyle = kind === "temple" ? "rgba(245, 235, 200, 0.9)" : kind === "landmark" ? "rgba(220, 210, 180, 0.9)" : "rgba(60, 40, 35, 0.9)";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (kind === "landmark") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (kind === "dungeon" || kind === "lair") {
    ctx.strokeStyle = "rgba(230, 200, 150, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y - r * 0.45);
    ctx.lineTo(x + r * 0.45, y + r * 0.45);
    ctx.moveTo(x + r * 0.45, y - r * 0.45);
    ctx.lineTo(x - r * 0.45, y + r * 0.45);
    ctx.stroke();
  }
}

function compass(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(245, 235, 210, 0.7)";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = i === 3 ? "#7a2e20" : "rgba(52, 40, 28, 0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.14, 0);
    ctx.lineTo(-r * 0.14, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.font = `bold ${Math.round(r * 0.3)}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -r - 6);
  ctx.restore();
}

export function worldToBlob(m: WorldMap): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawWorld(canvas, m, (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.9));
}

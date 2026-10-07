import { createRng, type Battlemap, type Ground, type Prop, type Rng } from "@dnd-toolkit/core";

export interface BattlemapRenderOptions {
  /** Pixels per grid cell. */
  cell: number;
  /** GM preview extras: party (blue) and enemy (red) start zones, plus a faint grid. */
  preview?: boolean;
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
};

/** Natural ground gets rounded blobs so patches don't look like a spreadsheet; floors stay crisp. */
const ORGANIC = new Set<Ground>(["grass", "dirt", "road", "water", "cave"]);
/** Paint order: later layers spill over earlier ones. */
const LAYERS: Ground[] = ["rock", "grass", "dirt", "road", "cave", "stone", "wood", "water"];

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

function drawGround(ctx: Ctx, rng: Rng, m: Battlemap, c: number) {
  for (const layer of LAYERS) {
    const color = GROUND[layer];
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (m.ground[y]![x] !== layer) continue;
        const px = x * c;
        const py = y * c;
        if (ORGANIC.has(layer) || layer === "rock") {
          const tone = shade(color, (rng.next() - 0.5) * 0.1);
          rect(ctx, px, py, c, c, tone);
          // Spill a little into neighbors for soft, rounded edges.
          circle(ctx, px + c / 2 + (rng.next() - 0.5) * c * 0.2, py + c / 2 + (rng.next() - 0.5) * c * 0.2, c * 0.68, tone);
        }
      }
    }
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (m.ground[y]![x] !== layer) continue;
        if (!ORGANIC.has(layer) && layer !== "rock") rect(ctx, x * c, y * c, c, c, color);
        groundDetail(ctx, rng, layer, x * c, y * c, c);
      }
    }
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

function drawWalls(ctx: Ctx, m: Battlemap, c: number) {
  // Cave walls are the rock itself.
  if (m.setting === "cave") return;
  const ruin = m.setting === "ruins";
  const thick = c * (ruin ? 0.3 : 0.22);
  ctx.lineCap = "square";
  for (const w of m.walls) {
    if (w.door || w.window) continue;
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
function drawLamps(ctx: Ctx, m: Battlemap, c: number) {
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

  drawGround(ctx, rng, m, c);
  // Under-props (rugs) first, then low props, then tall ones (trees overhang everything).
  const order = (p: Prop) => (p.kind === "rug" ? 0 : p.kind === "tree" ? 2 : 1);
  for (const p of [...m.props].sort((a, b) => order(a) - order(b))) drawProp(ctx, rng, p, c);
  drawWalls(ctx, m, c);
  drawLamps(ctx, m, c);

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

export function battlemapToBlob(m: Battlemap, o: BattlemapRenderOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawBattlemap(canvas, m, o);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.9),
  );
}

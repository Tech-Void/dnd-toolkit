import { createRng, type Handout, type Rng } from "@dnd-toolkit/core";
import { stoneTexture } from "./texture.ts";

// Handouts painted as images: parchment, ink, a wax seal, a rough map.

type Ctx = CanvasRenderingContext2D;
const INK = "#2b1d10";
const SERIF = "Georgia, 'Times New Roman', serif";
const PARCHMENT = { dark: [196, 170, 120] as [number, number, number], light: [240, 226, 192] as [number, number, number], veins: 0.15, scale: 0.6 };

/** Wrap text to a width; returns the lines. */
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Parchment with darkened, uneven edges; torn edges for letters. */
function parchment(ctx: Ctx, rng: Rng, w: number, h: number, seed: string, torn: boolean) {
  const path = new Path2D();
  if (torn) {
    // Jagged outline, a few pixels in from the edge.
    const pts: [number, number][] = [];
    const step = 18;
    for (let x = 0; x <= w; x += step) pts.push([x, 6 + rng.next() * 14]);
    for (let y = 0; y <= h; y += step) pts.push([w - 6 - rng.next() * 14, y]);
    for (let x = w; x >= 0; x -= step) pts.push([x, h - 6 - rng.next() * 14]);
    for (let y = h; y >= 0; y -= step) pts.push([6 + rng.next() * 14, y]);
    pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  } else path.rect(0, 0, w, h);
  ctx.save();
  ctx.clip(path);
  ctx.drawImage(stoneTexture(w / 40, h / 40, `${seed}:paper`, PARCHMENT, 40), 0, 0, w, h);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, "rgba(90, 60, 20, 0)");
  vignette.addColorStop(1, "rgba(90, 60, 20, 0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  // Stains.
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(120, 80, 30, ${0.05 + rng.next() * 0.07})`;
    ctx.beginPath();
    ctx.arc(rng.next() * w, rng.next() * h, 20 + rng.next() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function centered(ctx: Ctx, text: string, y: number, w: number, font: string, color = INK) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, y);
}

function wanted(ctx: Ctx, h: Handout, w: number, ht: number) {
  centered(ctx, h.title, 120, w, `bold 96px ${SERIF}`);
  centered(ctx, h.lines[0] ?? "", 175, w, `bold 30px ${SERIF}`, "#6a1a12");
  // A silhouette in an oval frame.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w / 2, 360, 150, 170, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(60, 40, 20, 0.12)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.clip();
  ctx.fillStyle = "rgba(40, 25, 10, 0.85)";
  ctx.beginPath();
  ctx.arc(w / 2, 320, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2, 520, 140, 120, 0, Math.PI, 0);
  ctx.fill();
  ctx.restore();
  centered(ctx, h.lines[1] ?? "", 600, w, `bold 50px ${SERIF}`);
  ctx.font = `italic 28px ${SERIF}`;
  let y = 650;
  for (const text of h.lines.slice(2)) for (const line of wrap(ctx, text, w - 140)) {
    centered(ctx, line, y, w, `italic 28px ${SERIF}`);
    y += 36;
  }
  centered(ctx, h.accent, ht - 170, w, `bold 56px ${SERIF}`, "#6a1a12");
  ctx.font = `22px ${SERIF}`;
  y = ht - 115;
  for (const line of wrap(ctx, h.footer, w - 140)) {
    centered(ctx, line, y, w, `22px ${SERIF}`);
    y += 28;
  }
}

function letter(ctx: Ctx, rng: Rng, h: Handout, w: number, ht: number) {
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `italic 30px ${SERIF}`;
  let y = 110;
  for (const para of h.lines) {
    for (const line of wrap(ctx, para, w - 160)) {
      // A slight wobble, like a hurried hand.
      ctx.save();
      ctx.translate(80, y);
      ctx.rotate((rng.next() - 0.5) * 0.01);
      ctx.fillText(line, 0, 0);
      ctx.restore();
      y += 44;
    }
    y += 18;
  }
  ctx.textAlign = "right";
  ctx.font = `italic 34px ${SERIF}`;
  ctx.fillText(h.footer, w - 90, y + 30);
  // Wax seal.
  const sx = w - 150;
  const sy = ht - 150;
  ctx.fillStyle = "#8a1c1c";
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 62 + (rng.next() - 0.5) * 10;
    if (i) ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    else ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5c0f0f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(sx, sy, 42, 0, Math.PI * 2);
  ctx.stroke();
  centered(ctx, h.accent, sy + 18, sx * 2, `bold 50px ${SERIF}`, "#5c0f0f");
}

function map(ctx: Ctx, rng: Rng, h: Handout, w: number, ht: number) {
  centered(ctx, h.title, 70, w, `bold 38px ${SERIF}`);
  // Coastline: the sea down one side.
  ctx.fillStyle = "rgba(70, 110, 130, 0.35)";
  ctx.beginPath();
  ctx.moveTo(w, 0);
  for (let y = 0; y <= ht; y += 20) ctx.lineTo(w * 0.78 + Math.sin(y / 60) * 30 + (rng.next() - 0.5) * 20, y);
  ctx.lineTo(w, ht);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 60, 70, 0.6)";
  ctx.lineWidth = 3;
  ctx.stroke();
  // A river, hills and trees.
  ctx.strokeStyle = "rgba(70, 110, 130, 0.7)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(60, ht * 0.3);
  for (let x = 60; x < w * 0.8; x += 30) ctx.lineTo(x, ht * 0.3 + Math.sin(x / 70) * 40 + x * 0.2);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = 80 + rng.next() * w * 0.6;
    const y = 120 + rng.next() * 140;
    ctx.beginPath();
    ctx.moveTo(x - 22, y + 16);
    ctx.lineTo(x, y - 16);
    ctx.lineTo(x + 22, y + 16);
    ctx.stroke();
  }
  for (let i = 0; i < 25; i++) {
    const x = 60 + rng.next() * w * 0.65;
    const y = ht * 0.55 + rng.next() * ht * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
  }
  // The route through the landmarks to the X.
  const spots: [number, number][] = (h.landmarks ?? []).map((_, i) => [120 + i * (w * 0.55) / 4 + rng.next() * 40, 220 + rng.next() * (ht - 420)]);
  const x: [number, number] = [w * 0.68, ht * 0.62 + rng.next() * 80];
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = "#6a1a12";
  ctx.lineWidth = 3;
  ctx.beginPath();
  [...spots, x].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `italic 22px ${SERIF}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  (h.landmarks ?? []).forEach((label, i) => {
    const [px, py] = spots[i]!;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(label, px, py - 14);
  });
  ctx.strokeStyle = "#a01c12";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x[0] - 26, x[1] - 26);
  ctx.lineTo(x[0] + 26, x[1] + 26);
  ctx.moveTo(x[0] + 26, x[1] - 26);
  ctx.lineTo(x[0] - 26, x[1] + 26);
  ctx.stroke();
  // Compass rose.
  const [cx, cy] = [w - 110, ht - 110];
  ctx.fillStyle = INK;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx! * 55, cy + dy! * 55);
    ctx.lineTo(cx + dy! * 10, cy - dx! * 10);
    ctx.lineTo(cx - dy! * 10, cy + dx! * 10);
    ctx.fill();
  }
  centered(ctx, "N", cy - 64, cx * 2, `bold 22px ${SERIF}`);
  ctx.font = `italic 20px ${SERIF}`;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.fillText(h.footer, 40, ht - 40);
}

export function drawHandout(canvas: HTMLCanvasElement, h: Handout) {
  const [w, ht] = h.kind === "map" ? [1100, 800] : [800, 1050];
  canvas.width = w;
  canvas.height = ht;
  const ctx = canvas.getContext("2d")!;
  const rng = createRng(`${h.seed}:ink`);
  parchment(ctx, rng, w, ht, h.seed, h.kind === "letter");
  if (h.kind === "wanted") wanted(ctx, h, w, ht);
  else if (h.kind === "letter") letter(ctx, rng, h, w, ht);
  else map(ctx, rng, h, w, ht);
}

export function handoutToBlob(h: Handout): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawHandout(canvas, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.92));
}

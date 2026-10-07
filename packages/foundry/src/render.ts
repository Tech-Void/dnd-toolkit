import { createRng, FLOOR, floorOutlines, roomCenter, type DungeonMap } from "@dnd-toolkit/core";

export interface RenderOptions {
  /** Pixels per grid cell. */
  cell: number;
  /** Draw room numbers (GM preview only — never bake into player-visible backgrounds). */
  labels?: boolean;
}

const PALETTES = {
  dungeon: { rock: "#2b2724", hatch: "rgba(235, 220, 190, 0.13)", floor: "#d6cbb3", grid: "rgba(60, 45, 30, 0.1)", wall: "#15110e", door: "#8a5a2b", label: "#8c2a1e" },
  cave: { rock: "#221e1a", hatch: "rgba(220, 200, 170, 0.1)", floor: "#8f816c", grid: "", wall: "#110e0b", door: "#8a5a2b", label: "#962a1e" },
};

/** Vary a hex color's lightness by `amount` (-1..1). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function drawDungeon(canvas: HTMLCanvasElement, map: DungeonMap, o: RenderOptions): void {
  const c = o.cell;
  const P = PALETTES[map.style ?? "dungeon"];
  const cave = map.style === "cave";
  const rng = createRng(`${map.seed}:paint`);
  canvas.width = map.width * c;
  canvas.height = map.height * c;
  const ctx = canvas.getContext("2d")!;
  const floorAt = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;

  // The floor as one path (smooth for caves, cell edges for rooms and corridors).
  const loops = map.outlines ?? floorOutlines(map.cells);
  const floorPath = new Path2D();
  for (const loop of loops) {
    loop.forEach(([x, y], i) => {
      if (i) floorPath.lineTo(x * c, y * c);
      else floorPath.moveTo(x * c, y * c);
    });
    floorPath.closePath();
  }

  // Rock, hatched in a band around the floor like a hand-drawn map.
  ctx.fillStyle = P.rock;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = P.hatch;
  ctx.lineWidth = Math.max(1, c / 28);
  ctx.lineCap = "round";
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (floorAt(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = floorAt(x + dx, y + dy);
      if (!near) continue;
      const a = rng.next() * Math.PI;
      const [ux, uy] = [Math.cos(a), Math.sin(a)];
      const cx = (x + 0.5) * c;
      const cy = (y + 0.5) * c;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const ox = -uy * i * c * 0.17;
        const oy = ux * i * c * 0.17;
        const len = c * (0.3 + rng.next() * 0.15);
        ctx.moveTo(cx + ox - ux * len, cy + oy - uy * len);
        ctx.lineTo(cx + ox + ux * len, cy + oy + uy * len);
      }
      ctx.stroke();
    }
  }

  // Floor, with soft texture, clipped to its outline.
  ctx.save();
  ctx.clip(floorPath, "evenodd");
  ctx.fillStyle = P.floor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!floorAt(x, y)) continue;
      if (cave) {
        // Mottled stone and a few pebbles.
        for (let i = 0; i < 2; i++) {
          ctx.fillStyle = shade(P.floor, (rng.next() - 0.5) * 0.16);
          ctx.beginPath();
          ctx.arc((x + rng.next()) * c, (y + rng.next()) * c, c * (0.3 + rng.next() * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
        if (rng.chance(0.3)) {
          ctx.fillStyle = shade(P.floor, -0.35);
          ctx.beginPath();
          ctx.arc((x + rng.next()) * c, (y + rng.next()) * c, c * 0.04, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Flagstones: barely-there tone shifts, one slab per square.
        ctx.fillStyle = shade(P.floor, (rng.next() - 0.5) * 0.07);
        ctx.fillRect(x * c + 1, y * c + 1, c - 2, c - 2);
      }
    }
  }
  if (P.grid) {
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = Math.max(1, c / 60);
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) {
      ctx.moveTo(x * c, 0);
      ctx.lineTo(x * c, canvas.height);
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.moveTo(0, y * c);
      ctx.lineTo(canvas.width, y * c);
    }
    ctx.stroke();
  }
  // Inner shadow along the walls for depth.
  ctx.lineJoin = "round";
  for (const [width, alpha] of [[0.6, 0.12], [0.32, 0.18]] as const) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = c * width;
    ctx.stroke(floorPath);
  }
  ctx.restore();

  // Crisp walls.
  ctx.strokeStyle = P.wall;
  ctx.lineWidth = Math.max(2, c * 0.12);
  ctx.lineJoin = "round";
  ctx.stroke(floorPath);

  // Doors: a plank door between two posts.
  for (const w of map.walls) {
    if (!w.door) continue;
    const horizontal = w.y1 === w.y2;
    const x1 = w.x1 * c;
    const y1 = w.y1 * c;
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
      ctx.fillStyle = P.label;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(String(room.id), px, py + r * 0.05);
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

import { FLOOR, type DungeonMap } from "@dnd-toolkit/core";

export interface RenderOptions {
  /** Pixels per grid cell. */
  cell: number;
  /** Draw room numbers (GM preview only — never bake into player-visible backgrounds). */
  labels?: boolean;
}

const COLORS = {
  rock: "#2a2520",
  floor: "#d8ccb1",
  grid: "rgba(60, 45, 30, 0.18)",
  wall: "#1a1612",
  door: "#8a5a2b",
  label: "rgba(120, 30, 20, 0.85)",
};

export function drawDungeon(canvas: HTMLCanvasElement, map: DungeonMap, o: RenderOptions): void {
  const { cell } = o;
  canvas.width = map.width * cell;
  canvas.height = map.height * cell;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = COLORS.rock;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = COLORS.floor;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.cells[y]![x] === FLOOR) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // Grid lines on floor only.
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = Math.max(1, cell / 50);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.cells[y]![x] === FLOOR) ctx.strokeRect(x * cell, y * cell, cell, cell);
    }
  }

  ctx.lineCap = "square";
  for (const w of map.walls) {
    if (w.door) continue;
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = Math.max(2, cell / 8);
    ctx.beginPath();
    ctx.moveTo(w.x1 * cell, w.y1 * cell);
    ctx.lineTo(w.x2 * cell, w.y2 * cell);
    ctx.stroke();
  }

  // Doors: a slab across the edge, inset from the corners.
  for (const w of map.walls) {
    if (!w.door) continue;
    const thick = Math.max(3, cell / 5);
    const inset = cell * 0.12;
    const horizontal = w.y1 === w.y2;
    const x = w.x1 * cell + (horizontal ? inset : -thick / 2);
    const y = w.y1 * cell + (horizontal ? -thick / 2 : inset);
    const width = horizontal ? cell - inset * 2 : thick;
    const height = horizontal ? thick : cell - inset * 2;
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = Math.max(1, cell / 30);
    ctx.strokeRect(x, y, width, height);
  }

  if (o.labels) {
    ctx.fillStyle = COLORS.label;
    ctx.font = `bold ${Math.round(cell * 1.1)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const r of map.rooms) ctx.fillText(String(r.id), (r.x + r.w / 2) * cell, (r.y + r.h / 2) * cell);
  }
}

export function dungeonToBlob(map: DungeonMap, o: RenderOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawDungeon(canvas, map, o);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/webp", 0.9),
  );
}

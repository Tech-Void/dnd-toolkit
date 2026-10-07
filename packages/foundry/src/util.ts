import type { BattleLight } from "@dnd-toolkit/core";

export const MODULE_ID = "dnd-toolkit";
export const FOLDER_NAME = "DnD Toolkit";

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Find or create this module's folder for a document type so generated content stays tidy. */
export async function ensureFolder(type: "Scene" | "JournalEntry" | "Item" | "Actor"): Promise<string> {
  const existing = game.folders.find((f: any) => f.type === type && f.name === FOLDER_NAME);
  if (existing) return existing.id;
  const folder = await Folder.create({ name: FOLDER_NAME, type, color: "#7a3b2e" });
  return folder.id;
}

export const isDnd5e = () => game.system.id === "dnd5e";

/** AmbientLight data for a generated light (grid units → pixels). */
export function ambientLight(l: BattleLight, gs: number) {
  return {
    x: Math.round(l.x * gs),
    y: Math.round(l.y * gs),
    config: {
      bright: l.bright,
      dim: l.dim,
      color: l.color,
      alpha: 0.35,
      animation: l.animation ? { type: l.animation === "fire" ? "flame" : l.animation, speed: 3, intensity: 3 } : {},
    },
  };
}

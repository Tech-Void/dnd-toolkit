import { describe, expect, it } from "vitest";
import { DUNGEON_THEMES, furnishDungeon, generateCave, generateDungeon, guessTheme, roomCells, stockDungeon, type DungeonTheme } from "../src/index.ts";

describe("rooms with a purpose", () => {
  it("furnishes every room without overlaps, inside the room, clear of doors and traps", () => {
    for (const theme of Object.keys(DUNGEON_THEMES) as DungeonTheme[]) {
      for (let s = 0; s < 4; s++) {
        const map = theme === "cavern" ? generateCave({ seed: `${theme}${s}` }) : generateDungeon({ seed: `${theme}${s}` });
        const keys = stockDungeon(map, { partyLevel: 5, lootPiles: true, seed: `k${s}` });
        const { keys: out } = furnishDungeon(map, keys, { theme, partyLevel: 5, lootPiles: true });
        const doorCells = new Set(map.walls.filter((w) => w.door).flatMap((w) => (w.y1 === w.y2 ? [[w.x1, w.y1 - 1], [w.x1, w.y1]] : [[w.x1 - 1, w.y1], [w.x1, w.y1]])).map(([x, y]) => `${x},${y}`));
        const seen = new Set<string>();
        for (const k of out) {
          expect(k.purpose).toBeTruthy();
          expect(k.title).toContain(k.purpose!);
          const inside = new Set(roomCells(map.rooms.find((r) => r.id === k.roomId)!).map(([x, y]) => `${x},${y}`));
          const traps = new Set((k.trapCells ?? []).map(([x, y]) => `${x},${y}`));
          for (const f of k.furniture ?? []) {
            for (let y = f.y; y < f.y + f.h; y++) {
              for (let x = f.x; x < f.x + f.w; x++) {
                const c = `${x},${y}`;
                expect(inside.has(c)).toBe(true);
                expect(seen.has(c)).toBe(false);
                expect(doorCells.has(c)).toBe(false);
                expect(traps.has(c)).toBe(false);
                seen.add(c);
              }
            }
          }
        }
        expect(out.reduce((n, k) => n + (k.furniture?.length ?? 0), 0)).toBeGreaterThan(5);
      }
    }
  });

  it("keeps the lair and hidden rooms recognizable and fills rooms with their finds", () => {
    const map = generateDungeon({ seed: "finds" });
    const keys = stockDungeon(map, { partyLevel: 6, lootPiles: true });
    const { keys: out } = furnishDungeon(map, keys, { theme: "hideout", partyLevel: 6, lootPiles: true });
    expect(out.some((k) => /Lair/.test(k.title) && k.purpose === "Leader's quarters")).toBe(true);
    const armory = out.find((k) => k.purpose === "Armory");
    if (armory) expect(armory.piles?.some((p) => p.loot.items.some((i) => i.kind === "gear" || i.kind === "magic"))).toBe(true);
  });

  it("guesses a theme from the monsters", () => {
    const map = generateDungeon({ seed: "g" });
    expect(guessTheme(map, [], "goblinoid")).toBe("hideout");
    expect(guessTheme(map, [], "kobold")).toBe("mine");
    expect(guessTheme(generateCave({ seed: "c" }), [], "")).toBe("cavern");
  });
});

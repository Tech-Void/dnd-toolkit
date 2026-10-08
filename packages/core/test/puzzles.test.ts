import { describe, expect, it } from "vitest";
import { addHiddenRooms, generateDungeon, placePuzzle, puzzleSolved, roomCells, sequenceOnTrack, stockDungeon, type MapPuzzleKind } from "../src/index.ts";

describe("map puzzles", () => {
  for (const kind of ["levers", "plates", "statues", "runes"] as MapPuzzleKind[]) {
    it(`${kind}: placed in a room, with a clue elsewhere, guarding a door`, () => {
      let placed = 0;
      for (let i = 0; i < 12; i++) {
        const map = addHiddenRooms(generateDungeon({ seed: `${kind}${i}` }), 1);
        const keys = stockDungeon(map, { partyLevel: 6, lootPiles: true });
        const r = placePuzzle(map, keys, { kind, partyLevel: 6 });
        if (!r) continue;
        placed++;
        const p = r.puzzle;
        const room = r.map.rooms.find((x) => x.id === p.roomId)!;
        const inside = new Set(roomCells(room).map(([x, y]) => `${x},${y}`));
        for (const el of p.elements) expect(inside.has(`${el.cell[0]},${el.cell[1]}`)).toBe(true);
        expect(new Set(p.elements.map((e) => `${e.cell}`)).size).toBe(p.elements.length);
        expect(r.keys.find((k) => k.roomId === p.clueRoomId)!.notes!.some((n) => n.includes(p.clue))).toBe(true);
        const door = r.map.walls.find((w) => w.x1 === p.door.x1 && w.y1 === p.door.y1 && w.x2 === p.door.x2 && w.y2 === p.door.y2)!;
        expect(door.secret || door.lock?.kind === "sealed").toBe(true);
        expect(r.map.puzzles).toContainEqual(p);
        // The solution solves it; the start doesn't.
        const values = p.kind === "levers" || p.kind === "statues" ? [...p.solution] : p.elements.map((e) => e.start);
        expect(puzzleSolved(p, { values, order: [...p.solution] })).toBe(true);
        if (p.kind === "levers" || p.kind === "statues") expect(puzzleSolved(p, { values: p.elements.map((e) => e.start), order: [] })).toBe(false);
        else {
          expect(sequenceOnTrack(p, [p.solution[1]!])).toBe(false);
          expect(p.onFail?.damage.formula).toMatch(/d6/);
        }
      }
      expect(placed).toBeGreaterThan(6);
    });
  }
});

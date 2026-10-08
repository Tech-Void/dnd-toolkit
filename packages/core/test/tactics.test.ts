import { describe, expect, it } from "vitest";
import { generateBattlemap, reachableCells } from "../src/index.ts";

describe("smarter battlemaps", () => {
  it("raises ledges with cliff edges and a way up", () => {
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const m = generateBattlemap({ setting: i % 2 ? "ruins" : "clearing", seed: `l${i}` });
      for (const l of m.ledges ?? []) {
        found++;
        expect(l.ramps.length).toBeGreaterThan(0);
        expect(m.walls.some((w) => w.cliff)).toBe(true);
        // Somebody can walk up onto it.
        const reach = reachableCells(m, m.zones.party.slice(0, 1));
        expect(l.cells.some(([x, y]) => reach.has(`${x},${y}`))).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(5);
    expect(generateBattlemap({ setting: "clearing", seed: "l2", elevation: false }).ledges).toBeUndefined();
  });

  it("sets up ambushes close in and defenses in the middle", () => {
    for (let i = 0; i < 8; i++) {
      const amb = generateBattlemap({ setting: "road", seed: `a${i}`, layout: "ambush" });
      expect(amb.layout).toBe("ambush");
      const def = generateBattlemap({ setting: "clearing", seed: `d${i}`, layout: "defend" });
      if (def.notes.some((n) => n.startsWith("Hold the line"))) {
        const mid = [def.width / 2, def.height / 2];
        const avg = def.zones.party.reduce((n, [x, y]) => n + Math.hypot(x - mid[0]!, y - mid[1]!), 0) / def.zones.party.length;
        expect(avg).toBeLessThan(5);
      }
    }
  });
});

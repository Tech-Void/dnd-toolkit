import { describe, expect, it } from "vitest";
import { generateBattlemap, reachableCells, type BattlemapSetting, type PropKind } from "../src/index.ts";

const SIGNATURE: Partial<Record<BattlemapSetting, PropKind[]>> = {
  graveyard: ["tombstone"], temple: ["pew", "altar"], docks: ["boat"], bridge: ["reeds"], mine: ["mineCart"], farm: ["crops", "hay"], swamp: ["reeds"],
};

describe("new battlemap settings", () => {
  for (const [setting, kinds] of Object.entries(SIGNATURE) as [BattlemapSetting, PropKind[]][]) {
    it(`${setting}: playable, with its own scenery`, () => {
      for (let i = 0; i < 6; i++) {
        const m = generateBattlemap({ setting, seed: `${setting}${i}`, traps: true });
        expect(m.zones.party.length).toBeGreaterThan(0);
        expect(m.zones.enemies.length).toBeGreaterThan(0);
        const reach = reachableCells(m, m.zones.party.slice(0, 1));
        expect(m.zones.enemies.some(([x, y]) => reach.has(`${x},${y}`))).toBe(true);
        for (const k of kinds) expect(m.props.some((p) => p.kind === k)).toBe(true);
        expect(m.notes.length).toBeGreaterThan(1);
      }
    });
  }

  it("swamps have mud, docks have deep water and a warehouse door", () => {
    expect(generateBattlemap({ setting: "swamp", seed: "s" }).ground.flat()).toContain("mud");
    const d = generateBattlemap({ setting: "docks", seed: "d" });
    expect(d.ground.flat().filter((g) => g === "water").length).toBeGreaterThan(50);
    expect(d.walls.some((w) => w.door)).toBe(true);
  });
});

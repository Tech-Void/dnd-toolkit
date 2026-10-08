import { describe, expect, it } from "vitest";
import { threatMeter } from "../src/combat.ts";

const pc = (level: number) => ({ actor: { type: "character", system: { details: { level }, attributes: { hp: { value: 20 } } } }, token: { disposition: 1 } });
const foe = (xp: number, hp: number, defeated = false) => ({ isDefeated: defeated, actor: { type: "npc", system: { details: { xp: { value: xp } }, attributes: { hp: { value: hp } } } }, token: { disposition: -1 } });

describe("threat meter", () => {
  it("rates what's left against the party", () => {
    const party = [pc(5), pc(5), pc(5), pc(5)];
    const full = threatMeter({ combatants: [...party, foe(1800, 50), foe(1100, 40), foe(450, 20)] });
    expect(full).toMatch(/3,350 \/ 3,350 XP left/);
    expect(full).toMatch(/Threat: <strong>moderate/);
    const late = threatMeter({ combatants: [...party, foe(1800, 0), foe(1100, 0, true), foe(450, 20)] });
    expect(late).toMatch(/450 \/ 3,350 XP left/);
    expect(late).toMatch(/Threat: <strong>trivial/);
  });

  it("stays out of the way without both sides", () => {
    expect(threatMeter({ combatants: [pc(3)] })).toBe("");
  });
});

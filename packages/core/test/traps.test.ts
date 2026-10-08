import { describe, expect, it } from "vitest";
import { generateHandout, generatePuzzle, generateTrap, trapText, type TrapSeverity } from "../src/index.ts";

describe("traps", () => {
  it("scales damage and DCs by severity and level, DMG-style", () => {
    const dmg = (severity: TrapSeverity, partyLevel: number) => generateTrap({ severity, partyLevel, seed: "t" }).damage!.formula;
    expect([dmg("setback", 2), dmg("dangerous", 8), dmg("deadly", 14), dmg("deadly", 20)]).toEqual(["1d10", "4d10", "18d10", "24d10"]);
    for (let i = 0; i < 40; i++) {
      const t = generateTrap({ seed: `x${i}`, partyLevel: 5 });
      expect(!!t.save !== (t.attackBonus !== undefined)).toBe(true);
      expect(t.detect.dc).toBeGreaterThanOrEqual(10);
      expect(trapText(t)).toMatch(/Spot it: DC \d+.*Disarm: DC \d+/);
    }
  });

  it("keeps to the kind asked for", () => {
    for (let i = 0; i < 20; i++) expect(generateTrap({ kind: "magical", seed: `m${i}` }).kind).toBe("magical");
  });
});

describe("puzzles", () => {
  it("always come with a solution, three hints and a cost", () => {
    for (let i = 0; i < 30; i++) {
      const p = generatePuzzle({ seed: `p${i}` });
      expect(p.solution.length).toBeGreaterThan(2);
      expect(p.hints).toHaveLength(3);
      expect(p.failure.length).toBeGreaterThan(5);
    }
  });
});

describe("handouts", () => {
  it("use the quest's threads when given", () => {
    const ctx = { villain: "Red Mara, leader of the Crow Knives", macguffin: "the baron's kidnapped daughter", lair: "an old quarry", sigil: "a red handprint", region: "the Ashfen" };
    const wanted = generateHandout({ kind: "wanted", context: ctx, seed: "w" });
    expect(wanted.lines).toContain("RED MARA");
    expect(wanted.footer).toMatch(/red handprint/);
    const letter = generateHandout({ kind: "letter", context: ctx, seed: "l" });
    expect(letter.lines.join(" ")).toMatch(/baron's kidnapped daughter.*an old quarry/);
    expect(letter.accent).toBe("R");
    const map = generateHandout({ kind: "map", context: ctx, seed: "m" });
    expect(map.title).toMatch(/old quarry/);
    expect(map.landmarks).toHaveLength(4);
  });

  it("work without any context", () => {
    for (const kind of ["wanted", "letter", "map"] as const) expect(generateHandout({ kind, seed: kind }).lines.length).toBeGreaterThan(2);
  });
});

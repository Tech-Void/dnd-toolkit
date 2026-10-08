import { describe, expect, it } from "vitest";
import { conditionReminders, deathSaveLine } from "../src/index.ts";

describe("conditionReminders", () => {
  it("orders by severity and folds incapacitated into stunned", () => {
    const r = conditionReminders(["poisoned", "incapacitated", "stunned", "prone", "nonsense"]);
    expect(r.map((l) => l.split(":")[0])).toEqual(["Stunned", "Prone", "Poisoned"]);
  });
  it("adds exhaustion and names the concentration spell", () => {
    const r = conditionReminders(["concentrating"], { exhaustion: 2, concentratingOn: "Bless" });
    expect(r[0]).toMatch(/^Concentrating on Bless/);
    expect(r[1]).toMatch(/^Exhaustion 2/);
  });
});

describe("deathSaveLine", () => {
  it("reads the tally", () => {
    expect(deathSaveLine(1, 2)).toBe("Dying: 1 success, 2 failures.");
    expect(deathSaveLine(3, 0)).toBe("Stable.");
    expect(deathSaveLine(0, 3)).toBe("Dead.");
  });
});

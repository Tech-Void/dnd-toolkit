import { describe, expect, it } from "vitest";
import { chaseRoll, chaseRound, generateSkillChallenge, skillAttempt, startChase } from "../src/index.ts";

describe("skill challenges", () => {
  it("counts successes and failures and stops repeats", () => {
    let c = generateSkillChallenge({ level: 3, complexity: "short", seed: "x" });
    expect(c.need).toBe(4);
    const [a, b] = c.skills;
    c = skillAttempt(c, "Wren", a!.skill, 30).challenge;
    expect(skillAttempt(c, "Wren", a!.skill, 30).text).toContain("twice in a row");
    c = skillAttempt(c, "Wren", b!.skill, 30).challenge;
    c = skillAttempt(c, "Brakka", a!.skill, 30).challenge;
    const r = skillAttempt(c, "Brakka", b!.skill, 30);
    expect(r.challenge.ended).toBe("won");
    let l = generateSkillChallenge({ level: 3, seed: "y" });
    for (const [i, who] of ["A", "B", "C"].entries()) l = skillAttempt(l, who, l.skills[i]!.skill, 1).challenge;
    expect(l.ended).toBe("lost");
    expect(skillAttempt(generateSkillChallenge({ level: 3, seed: "z" }), "A", "his-unlisted", 1).challenge.failures).toBe(1);
  });
});

describe("chases", () => {
  it("closes the gap when the party does better, and catches", () => {
    let c = startChase({ mode: "pursue", other: "the thief", env: "urban", level: 3, lead: 1, id: "c" });
    c = chaseRoll(chaseRoll(c, "A", 30), "B", 30);
    expect(chaseRoll(c, "A", 1).rolls.length).toBe(2);
    const r = chaseRound(c, 1);
    expect(r.chase.lead).toBe(0);
    expect(r.chase.ended).toBe("caught");
  });
  it("fleeing: doing well widens the gap; nobody gains on a tie", () => {
    let c = startChase({ mode: "flee", other: "the ogre", env: "wilderness", level: 2, lead: 5, id: "f" });
    expect(chaseRound(chaseRoll(c, "A", 30), 30).chase.lead).toBe(5);
    c = chaseRound(chaseRoll(c, "A", 30), 1).chase;
    expect(c.ended).toBe("escaped");
  });
});

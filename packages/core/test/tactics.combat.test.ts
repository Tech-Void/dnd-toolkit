import { describe, expect, it } from "vitest";
import { captiveTalk, lairActions, turnAdvice } from "../src/index.ts";

const foes = [
  { name: "Brakka", hp: 0.9, distance: 5 },
  { name: "Mira", hp: 0.3, distance: 20, caster: true },
];

describe("monster turns", () => {
  it("picks targets by role and wits", () => {
    expect(turnAdvice({ name: "Wolf", hp: 1, type: "beast", int: 3, allies: 2, foes }).join(" ")).toMatch(/nearest \(Brakka\)/);
    expect(turnAdvice({ name: "Archer", hp: 1, roles: ["artillery"], int: 10, allies: 2, foes }).join(" ")).toMatch(/Mira, the spellcaster/);
    expect(turnAdvice({ name: "Rogue", hp: 1, roles: ["skirmisher"], int: 12, allies: 2, foes }).join(" ")).toMatch(/Mira \(most wounded\)/);
  });

  it("knows when to run, bargain or go all in", () => {
    expect(turnAdvice({ name: "Wolf", hp: 0.2, type: "beast", int: 3, allies: 1, foes }).join(" ")).toMatch(/bolts/);
    expect(turnAdvice({ name: "Mage", hp: 0.2, int: 16, allies: 0, foes }).join(" ")).toMatch(/bargain/);
    expect(turnAdvice({ name: "Boss", hp: 0.2, leader: true, int: 12, allies: 3, foes }).join(" ")).toMatch(/desperate/);
    expect(turnAdvice({ name: "Dragon", hp: 1, roles: ["solo"], allies: 0, foes, recharge: [{ name: "Fire Breath", ready: true }] })[0]).toMatch(/Fire Breath is ready/);
  });

  it("writes lair actions with a DC from CR, and captives that know something", () => {
    const acts = lairActions("undead", 9, "x");
    expect(acts).toHaveLength(3);
    for (const a of acts) expect(a).not.toContain("{dc}");
    expect(acts.join(" ")).toMatch(/DC 13|restrained|hit points|zombies|ceiling|lights|Minions/);
    expect(captiveTalk("Grik", "s", { boss: "Red Mara" })).toMatch(/^Grik surrenders\. They know .+ and will talk/);
  });
});

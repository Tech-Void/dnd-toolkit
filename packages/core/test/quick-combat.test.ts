import { describe, expect, it } from "vitest";
import { attackOutcome, effectFor, halve, resultLine } from "../src/index.ts";

describe("quick combat", () => {
  it("resolves attacks: crits always hit, natural 1s always miss", () => {
    expect(attackOutcome(17, 12, 15)).toEqual({ hit: true, crit: false, fumble: false });
    expect(attackOutcome(14, 12, 15).hit).toBe(false);
    expect(attackOutcome(8, 20, 25)).toEqual({ hit: true, crit: true, fumble: false });
    expect(attackOutcome(30, 1, 10)).toEqual({ hit: false, crit: false, fumble: true });
    expect(attackOutcome(20, 19, 15, 19).crit).toBe(true);
  });

  it("picks an effect that fits the action", () => {
    expect(effectFor({ actionType: "mwak", damageTypes: ["slashing"] }).kind).toBe("slash");
    expect(effectFor({ actionType: "mwak", damageTypes: ["piercing"] }).kind).toBe("pierce");
    expect(effectFor({ actionType: "rwak", damageTypes: ["piercing"], weapon: "longbow" }).kind).toBe("arrow");
    expect(effectFor({ actionType: "rsak", damageTypes: ["fire"], spell: true })).toEqual({ kind: "bolt", color: "#ff7a1a" });
    expect(effectFor({ actionType: "rsak", damageTypes: ["lightning"], spell: true }).kind).toBe("ray");
    expect(effectFor({ actionType: "save", damageTypes: ["fire"], area: true, spell: true }).kind).toBe("burst");
    expect(effectFor({ actionType: "heal", damageTypes: ["healing"] }).kind).toBe("heal");
  });

  it("writes the result line", () => {
    expect(resultLine({ attacker: "Brakka", item: "Longsword", target: "the goblin", total: 17, ac: 15, outcome: { hit: true, crit: false, fumble: false }, damage: 9, types: ["slashing"] }))
      .toBe("Brakka's Longsword hits the goblin (17 vs AC 15): 9 slashing.");
    expect(resultLine({ attacker: "Mira", item: "Fireball", target: "Ogre", save: { ability: "dex", dc: 15, total: 17, passed: true }, damage: 14, types: ["fire"] }))
      .toBe("Ogre resists the Fireball (DEX 17 vs DC 15): 14 fire (half).");
    expect(halve(27)).toBe(13);
  });
});

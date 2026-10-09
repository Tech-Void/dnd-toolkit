import { describe, expect, it } from "vitest";
import { fightXp, levelForXp, levelUps, questXp, rewardCoins, sessionRecap, xpShare } from "../src/index.ts";

describe("rewards", () => {
  it("levels by XP", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(400000)).toBe(20);
  });
  it("adds up a fight and splits it", () => {
    expect(fightXp([{ cr: 0.25 }, { cr: 0.25 }, { cr: 1 }, { xp: 10 }])).toBe(50 + 50 + 200 + 10);
    expect(xpShare(310, 4)).toBe(77);
    expect(xpShare(310, 0)).toBe(0);
  });
  it("spots level ups", () => {
    expect(levelUps([{ name: "A", xp: 250, level: 1 }, { name: "B", xp: 100, level: 1 }], 100)).toEqual([{ name: "A", to: 2 }]);
  });
  it("sizes quest XP and reads coins", () => {
    expect(questXp(3, 4, "major")).toBe(questXp(3, 4) * 2);
    expect(rewardCoins("1,200 gp, 30 sp and a horse")).toEqual({ gp: 1200, sp: 30 });
  });
  it("recaps a session", () => {
    const r = sessionRecap(3, [{ kind: "xp", text: "+100 each", xp: 100 }, { kind: "loot", text: "a chest", gp: 52.5 }, { kind: "xp", text: "+50", xp: 50 }], ["Day 4: met Ilsa"]);
    expect(r.xpEach).toBe(150);
    expect(r.lootGp).toBe(53);
    expect(r.sections.map((s) => s.title)).toEqual(["Experience", "Treasure", "In the world"]);
  });
});

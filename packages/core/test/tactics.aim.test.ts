import { describe, expect, it } from "vitest";
import { bestAim, inArea, parseMultiattack, pickTarget } from "../src/index.ts";

const foes = [
  { name: "Brakka", hp: 0.9, distance: 5 },
  { name: "Ilsa", hp: 0.3, distance: 20 },
  { name: "Wren", hp: 0.8, distance: 40, caster: true },
];

describe("pickTarget", () => {
  it("animals go for the nearest, skirmishers for the weakest, artillery for casters", () => {
    expect(pickTarget({ name: "Wolf", hp: 1, type: "beast", allies: 2, foes })).toBe(0);
    expect(pickTarget({ name: "Goblin", hp: 1, roles: ["skirmisher"], allies: 2, foes })).toBe(1);
    expect(pickTarget({ name: "Archer", hp: 1, roles: ["artillery"], allies: 2, foes })).toBe(2);
    expect(pickTarget({ name: "Ogre", hp: 1, roles: ["brute"], allies: 0, foes })).toBe(0);
    expect(pickTarget({ name: "Nobody", hp: 1, allies: 0, foes: [] })).toBe(-1);
  });
});

describe("parseMultiattack", () => {
  it("splits named attacks", () => {
    const r = parseMultiattack("The dragon makes three attacks: one with its bite and two with its claws.", ["Bite", "Claw", "Frightful Presence"]);
    expect(r).toEqual([{ name: "Bite", count: 1 }, { name: "Claw", count: 2 }]);
  });
  it("handles '<n> <weapon> attacks'", () => {
    expect(parseMultiattack("<p>The knight makes two longsword attacks.</p>", ["Longsword", "Heavy Crossbow"])).toEqual([{ name: "Longsword", count: 2 }]);
  });
  it("falls back to the first attack for a bare count", () => {
    expect(parseMultiattack("The ogre makes two melee attacks.", ["Greatclub"])).toEqual([{ name: "Greatclub", count: 2 }]);
  });
});

describe("bestAim", () => {
  it("a cone faces the cluster", () => {
    const aim = bestAim({ x: 0, y: 0 }, { type: "cone", size: 6 }, [{ x: 4, y: 0 }, { x: 5, y: 1 }, { x: 0, y: -5 }])!;
    expect(aim.hits).toEqual([0, 1]);
    expect(inArea({ type: "cone", size: 6 }, aim, aim.direction, { x: 4, y: 0 })).toBe(true);
  });
  it("a sphere avoids friends", () => {
    const aim = bestAim({ x: 0, y: 0 }, { type: "circle", size: 2 }, [{ x: 10, y: 0 }, { x: 11, y: 1 }, { x: 20, y: 0 }], [{ x: 10, y: 1 }], 30)!;
    expect(aim.hits).toEqual([2]);
  });
  it("lines are thin", () => {
    expect(inArea({ type: "line", size: 12, width: 1 }, { x: 0, y: 0 }, 0, { x: 6, y: 1 })).toBe(false);
    expect(inArea({ type: "line", size: 12, width: 1 }, { x: 0, y: 0 }, 0, { x: 6, y: 0.3 })).toBe(true);
  });
});

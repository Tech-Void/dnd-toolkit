import { beforeAll, describe, expect, it } from "vitest";
import { generateTrap, type DoorLock } from "@dnd-toolkit/core";
import { doorChoices, hasKey, lockedDoorData, passwordMatches, trapCardHtml, trapRegionData } from "../src/interactive.ts";

beforeAll(() => {
  Object.assign(globalThis, { CONST: { WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 }, REGION_VISIBILITY: { LAYER: 0, GAMEMASTER: 1, ALWAYS: 2 } } });
});

const lock = (o: Partial<DoorLock>): DoorLock => ({ kind: "locked", pickDc: 15, forceDc: 17, rooms: [3, 0], ...o });

describe("doors", () => {
  it("starts locked, with the lock kept for the player prompt", () => {
    const data = lockedDoorData(lock({}));
    expect(data.ds).toBe(2);
    expect(data.flags["dnd-toolkit"].lock.pickDc).toBe(15);
  });

  it("offers what fits the lock", () => {
    expect(doorChoices(lock({ key: "the iron key" }))).toEqual(["key", "pick", "force"]);
    expect(doorChoices(lock({}))).toEqual(["pick", "force"]);
    expect(doorChoices(lock({ kind: "stuck" }))).toEqual(["force"]);
    expect(doorChoices(lock({ kind: "barred" }))).toEqual(["force"]);
    expect(doorChoices(lock({ kind: "arcane", key: "Nine Lanterns" }))).toEqual(["password", "pick", "force"]);
  });

  it("matches keys and passwords loosely", () => {
    const l = lock({ key: "the blackened iron key" });
    expect(hasKey(l, ["Rope", "Blackened iron key"])).toBe(true);
    expect(hasKey(l, ["Iron key"])).toBe(false);
    expect(hasKey(lock({}), ["Iron key"])).toBe(false);
    const a = lock({ kind: "arcane", key: "Thorn and Crown" });
    expect(passwordMatches(a, "  thorn AND crown!")).toBe(true);
    expect(passwordMatches(a, "thorn")).toBe(false);
  });
});

describe("trap regions", () => {
  const trap = generateTrap({ partyLevel: 5, step: true, seed: "t" });

  it("makes a trigger region and a warning ring around it", () => {
    const [trigger, ring] = trapRegionData(trap, [[4, 6], [5, 6]], 100, "room-3");
    expect(trigger!.shapes).toHaveLength(2);
    expect(trigger!.shapes[0]).toMatchObject({ type: "rectangle", x: 400, y: 600, width: 100, height: 100 });
    expect(trigger!.visibility).toBe(1);
    expect(trigger!.behaviors.map((b) => b.type)).toEqual(["pauseGame", "executeScript"]);
    expect(trigger!.behaviors[1]!.system).toMatchObject({ events: ["tokenMoveIn"] });
    expect(ring!.shapes[0]).toMatchObject({ x: 300, y: 500, width: 400, height: 300 });
    expect(ring!.behaviors[0]!.system).toMatchObject({ events: ["tokenPreMove"] });
    expect(trigger!.flags["dnd-toolkit"].trapKey).toBe(ring!.flags["dnd-toolkit"].trapKey);
  });

  it("gives the GM a card with the right rolls", () => {
    const html = trapCardHtml(trap, "Brakka");
    expect(html).toContain("Brakka");
    expect(html).toContain(trap.name);
    expect(html).toContain(trap.save ? 'data-dt-trap="party"' : 'data-dt-trap="attack"');
    expect(html).toContain('data-dt-trap="damage"');
  });
});

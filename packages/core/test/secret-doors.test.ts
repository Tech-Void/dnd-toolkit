import { describe, expect, it } from "vitest";
import { addHiddenRooms, generateDungeon, secretDoorDc, stockDungeon } from "../src/index.ts";

describe("secretDoorDc", () => {
  it("uses the hidden room's DC for its secret door", () => {
    let checked = 0;
    for (let i = 0; i < 15; i++) {
      const map = addHiddenRooms(generateDungeon({ seed: `sd${i}` }), 1);
      const keys = stockDungeon(map, { partyLevel: 3 });
      const hidden = keys.find((k) => k.hidden);
      const door = map.walls.find((w) => w.secret);
      if (!hidden || !door) continue;
      checked++;
      expect(hidden.secretDc).toBeGreaterThanOrEqual(13);
      expect(hidden.description).toContain(`DC ${hidden.secretDc}`);
      expect(secretDoorDc(map, keys, door)).toBe(hidden.secretDc);
    }
    expect(checked).toBeGreaterThan(3);
  });
});

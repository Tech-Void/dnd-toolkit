import { describe, expect, it } from "vitest";
import { addToPurse, attitudeModifier, buyPrice, haggleModifier, payFrom, purseCopper, sellPrice } from "../src/index.ts";

const purse = (o: Partial<Record<"cp" | "sp" | "ep" | "gp" | "pp", number>>) => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...o });

describe("trade", () => {
  it("pays small coins first and gives change", () => {
    expect(payFrom(purse({ gp: 10, sp: 3, cp: 5 }), 1.5)).toEqual(purse({ gp: 8, sp: 8, cp: 5 }));
    expect(payFrom(purse({ pp: 1 }), 2.25)).toEqual(purse({ gp: 7, sp: 7, cp: 5 }));
    expect(payFrom(purse({ gp: 1 }), 2)).toBeNull();
    const after = payFrom(purse({ gp: 50, sp: 20, cp: 40, ep: 2 }), 33.33)!;
    expect(purseCopper(after)).toBe(5000 + 200 + 40 + 100 - 3333);
  });
  it("adds coins", () => {
    expect(addToPurse(purse({ gp: 1 }), 2.35)).toEqual(purse({ gp: 3, sp: 3, cp: 5 }));
  });
  it("haggles and likes", () => {
    expect(haggleModifier(20, 15).mod).toBe(-0.15);
    expect(haggleModifier(15, 15).mod).toBe(-0.1);
    expect(haggleModifier(12, 15).mod).toBe(0);
    expect(haggleModifier(9, 15).mod).toBe(0.1);
    expect(attitudeModifier(2)).toBeCloseTo(-0.1);
    expect(buyPrice(100, -0.1)).toBe(90);
    expect(sellPrice(100, 0.5, -0.1)).toBe(55);
  });
});

import { describe, expect, it } from "vitest";
import { innNight, nextRumor, servicePrice, TEMPLE_SERVICES } from "../src/index.ts";

describe("town services", () => {
  it("prices by settlement and friendship", () => {
    const cure = TEMPLE_SERVICES[0]!;
    expect(servicePrice(cure, "town")).toBe(10);
    expect(servicePrice(cure, "metropolis")).toBe(13);
    expect(servicePrice(TEMPLE_SERVICES.find((s) => s.id === "raise")!, "town", 2)).toBe(1125);
  });
  it("charges the inn per head and tells rumors in turn", () => {
    expect(innNight(0.5, 4)).toBe(2);
    expect(nextRumor(["a", "b"], [])).toEqual({ index: 0, text: "a" });
    expect(nextRumor(["a", "b"], [0])).toEqual({ index: 1, text: "b" });
    expect(nextRumor(["a", "b"], [0, 1])?.index).toBe(0);
    expect(nextRumor([], [])).toBeNull();
  });
});

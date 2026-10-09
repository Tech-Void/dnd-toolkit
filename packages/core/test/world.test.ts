import { describe, expect, it } from "vitest";
import { addWorldPlaces, advanceTrip, generateWorld, startTrip, worldCell, worldRoute } from "../src/index.ts";

const campaign = [
  { id: "c1", name: "Ashford", kind: "settlement" },
  { id: "c2", name: "The Sunken Keep", kind: "dungeon" },
];

describe("generateWorld", () => {
  for (const seed of ["a", "b", "c", "d", "e"]) {
    it(`makes a playable region (${seed})`, () => {
      const m = generateWorld({ seed, places: campaign });
      expect(m.cells.length).toBe(m.w * m.h);
      expect(m.cells.filter((c) => c === "water").length).toBeGreaterThan(0);
      expect(m.places.find((p) => p.campaignId === "c1")?.kind).toBe("town");
      expect(m.places.find((p) => p.campaignId === "c2")?.kind).toBe("dungeon");
      for (const p of m.places) expect(worldCell(m, p.x, p.y)).not.toBe("water");
      const towns = m.places.filter((p) => ["city", "town", "village"].includes(p.kind));
      expect(towns.length).toBeGreaterThanOrEqual(4);
      expect(m.roads.length).toBeGreaterThanOrEqual(towns.length - 1);
      // Party starts in a place.
      expect(m.places.some((p) => p.id === m.party.at)).toBe(true);
    });
  }
  it("is stable per seed", () => {
    expect(generateWorld({ seed: "x" })).toEqual(generateWorld({ seed: "x" }));
  });
});

describe("routes and trips", () => {
  it("routes by road between towns, and the party walks it", () => {
    const m = generateWorld({ seed: "trip" });
    const road = m.roads[0]!;
    const a = m.places.find((p) => p.id === road.from)!;
    const b = m.places.find((p) => p.id === road.to)!;
    const r = worldRoute(m, a, b)!;
    expect(r.path[0]).toEqual([a.x, a.y]);
    expect(r.path.at(-1)).toEqual([b.x, b.y]);
    expect(r.terrain.road ?? 0).toBeGreaterThan(0.5);
    expect(r.main).toBe("road");
    expect(r.days.slow).toBeGreaterThanOrEqual(r.days.normal);
    expect(r.days.normal).toBeGreaterThanOrEqual(r.days.fast);
    let t = startTrip(m, a.id, b.id, r);
    t = advanceTrip(t, r.miles / 2);
    expect(t.trip?.done).toBeCloseTo(r.miles / 2);
    t = advanceTrip(t, r.miles);
    expect(t.trip).toBeUndefined();
    expect(t.party).toEqual({ x: b.x, y: b.y, at: b.id });
  });
  it("adds new campaign places without moving the rest", () => {
    const m = generateWorld({ seed: "add" });
    const n = addWorldPlaces(m, [{ id: "new", name: "Greyholm", kind: "settlement" }]);
    expect(n.places.length).toBe(m.places.length + 1);
    expect(n.places.slice(0, m.places.length)).toEqual(m.places);
    expect(addWorldPlaces(n, [{ id: "new", name: "Greyholm", kind: "settlement" }])).toBe(n);
  });
});

describe("hex-crawl", async () => {
  const { addDiscovery, exploreHex, isExplored, newlyFound, sightRadius } = await import("../src/index.ts");
  it("starts fogged around the party and reveals along the way", () => {
    const m = generateWorld({ seed: "fog", fog: true });
    expect(m.explored!.length).toBeGreaterThan(0);
    expect(m.explored!.length).toBeLessThan(m.w * m.h / 4);
    expect(isExplored(m, m.party.x, m.party.y)).toBe(true);
    const far = m.places.filter((p) => !m.found!.includes(p.id)).sort((a, b) => Math.hypot(b.x - m.party.x, b.y - m.party.y) - Math.hypot(a.x - m.party.x, a.y - m.party.y))[0]!;
    expect(isExplored(m, far.x, far.y)).toBe(false);
    const r = worldRoute(m, m.party, far)!;
    const arrived = advanceTrip(startTrip(m, m.party.at!, far.id, r), Infinity);
    expect(arrived.found).toContain(far.id);
    expect(newlyFound(m, arrived).map((p) => p.id)).toContain(far.id);
    expect(arrived.explored!.length).toBeGreaterThan(m.explored!.length);
    expect(sightRadius(m, m.party.x, m.party.y)).toBeGreaterThan(0);
  });
  it("exploring turns things up, sometimes a new place", () => {
    const m = generateWorld({ seed: "explore", fog: true });
    const away = { ...m, party: { x: Math.floor(m.w / 2), y: Math.floor(m.h / 2) } };
    const results = Array.from({ length: 60 }, (_, i) => exploreHex(away, `e${i}`));
    expect(new Set(results.map((r) => r.kind)).size).toBeGreaterThanOrEqual(3);
    const withPlace = results.find((r) => r.place);
    if (withPlace) expect(addDiscovery(m, withPlace.place!).found).toContain(withPlace.place!.id);
  });
  it("leaves unfogged maps alone", () => {
    const m = generateWorld({ seed: "clear" });
    expect(m.explored).toBeUndefined();
    expect(isExplored(m, 0, 0)).toBe(true);
  });
});

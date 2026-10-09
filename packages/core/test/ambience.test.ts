import { describe, expect, it } from "vitest";
import { classifyAudio, sceneMood, weatherEffect } from "../src/index.ts";

describe("ambience", () => {
  it("sorts audio by name", () => {
    expect(classifyAudio("dockside-soudscape-19369.mp3")).toContain("sea");
    expect(classifyAudio("Dungeon_01_v2.mp3")).toEqual(["dungeon"]);
    expect(classifyAudio("chicken-sounds-farm-background.mp3")).toContain("farm");
    expect(classifyAudio("talking-people-6368.mp3")).toEqual(expect.arrayContaining(["town", "tavern"]));
    expect(classifyAudio("modules/x/Epic%20Battle.ogg")).toContain("combat");
  });
  it("picks a scene's mood", () => {
    expect(sceneMood("dungeon", undefined, "cave")).toBe("cave");
    expect(sceneMood("battlemap", "tavern")).toBe("tavern");
    expect(sceneMood("battlemap", "graveyard")).toBe("crypt");
    expect(sceneMood("world")).toBe("travel");
  });
  it("matches weather", () => {
    expect(weatherEffect("Heavy rain and wind")).toBe("rainStorm");
    expect(weatherEffect("Light drizzle")).toBe("rain");
    expect(weatherEffect("Morning fog")).toBe("fog");
    expect(weatherEffect("Clear and warm")).toBe("");
    expect(weatherEffect("Windy", "autumn")).toBe("autumnLeaves");
  });
});

import { describe, expect, it } from "vitest";
import {
  FLOOR,
  forgeItem,
  forgedProperties,
  generateBattlemap,
  generateDungeon,
  generateLoot,
  generateTrap,
  lockDoors,
  lockText,
  roomCells,
  stockDungeon,
  type DungeonMap,
  type WallSegment,
} from "../src/index.ts";

const edge = (w: WallSegment) => (w.y1 === w.y2 ? `h,${w.x1},${w.y1}` : `v,${w.x1},${w.y1}`);

/** Floor reachable from the entrance without crossing `blocked` door edges. */
function reachable(map: DungeonMap, blocked: Set<string>): Set<string> {
  const start = roomCells(map.rooms.find((r) => r.id === 1)!)[0]!;
  const seen = new Set([`${start[0]},${start[1]}`]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [nx, ny, e] of [[x + 1, y, `v,${x + 1},${y}`], [x - 1, y, `v,${x},${y}`], [x, y + 1, `h,${x},${y + 1}`], [x, y - 1, `h,${x},${y}`]] as [number, number, string][]) {
      if (map.cells[ny]?.[nx] !== FLOOR || seen.has(`${nx},${ny}`) || blocked.has(e)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe("locked doors", () => {
  it("locks only real doors, and every key is reachable without its own door", () => {
    for (let s = 0; s < 25; s++) {
      const map = generateDungeon({ seed: `lk${s}` });
      const keys = stockDungeon(map, { partyLevel: 7, lootPiles: true, seed: `st${s}` });
      const { map: locked, keys: out } = lockDoors(map, keys, { amount: "many", partyLevel: 7, seed: `l${s}` });
      expect(map.walls.some((w) => w.lock)).toBe(false); // the input is untouched
      const lockedWalls = locked.walls.filter((w) => w.lock);
      expect(lockedWalls.length).toBeGreaterThan(0);
      for (const w of lockedWalls) {
        expect(w.door && !w.secret).toBe(true);
        expect(lockText(w.lock!)).toMatch(/DC \d+/);
      }
      // Play it out without picking or forcing anything: fetch whichever keys can be reached, open
      // those doors, repeat. Keys may chain, but every keyed door must open in the end.
      const keyed = lockedWalls.filter((w) => w.lock!.keyAt);
      const shut = new Set(keyed);
      for (let progress = true; progress; ) {
        progress = false;
        const open = reachable(locked, new Set([...shut].map(edge)));
        for (const w of [...shut]) {
          const room = locked.rooms.find((r) => r.id === Number(/Room (\d+)/.exec(w.lock!.keyAt!)![1]))!;
          if (roomCells(room).some(([x, y]) => open.has(`${x},${y}`))) {
            shut.delete(w);
            progress = true;
          }
        }
      }
      expect(shut.size).toBe(0);
      // Keys that are items turn up as loot somewhere.
      const items = out.flatMap((k) => [...(k.piles ?? []).flatMap((p) => p.loot.items), ...(k.encounter?.loot?.items ?? [])]);
      for (const w of keyed.filter((w) => w.lock!.kind === "locked" && !/carried/.test(w.lock!.keyAt!))) {
        expect(items.some((i) => i.kind === "key" && w.lock!.key!.toLowerCase().endsWith(i.name.toLowerCase()))).toBe(true);
      }
    }
  });

  it("leaves everything open when asked", () => {
    const map = generateDungeon({ seed: "open" });
    const { map: out } = lockDoors(map, stockDungeon(map, { partyLevel: 3 }), { amount: "none" });
    expect(out.walls.some((w) => w.lock)).toBe(false);
  });
});

describe("traps on maps", () => {
  it("gives dungeon traps trigger squares inside their room", () => {
    let found = 0;
    for (let s = 0; s < 15; s++) {
      const map = generateDungeon({ seed: `tr${s}` });
      for (const k of stockDungeon(map, { partyLevel: 4, seed: `t${s}` })) {
        if (!k.trapData) continue;
        found++;
        const cells = new Set(roomCells(map.rooms.find((r) => r.id === k.roomId)!).map(([x, y]) => `${x},${y}`));
        expect(k.trapCells!.length === 1 || k.trapCells!.length === 4).toBe(true);
        for (const [x, y] of k.trapCells!) expect(cells.has(`${x},${y}`)).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(5);
  });

  it("keeps wild traps outdoors and machinery out of caves", () => {
    const wild = new Set(Array.from({ length: 40 }, (_, i) => generateTrap({ wild: true, seed: `w${i}` }).name));
    expect(wild.has("Scything blade")).toBe(false);
    expect([...wild].some((n) => ["Bear trap", "Snare", "Deadfall", "Caltrop field", "Swinging log", "Wasp nest drop"].includes(n))).toBe(true);
    for (let i = 0; i < 40; i++) expect(["Flooding chamber", "Crushing walls", "Poison gas", "Bear trap"]).not.toContain(generateTrap({ rough: true, seed: `r${i}` }).name);
  });

  it("puts traps on camp maps and locks on shop doors, without moving anything else", () => {
    const plain = generateBattlemap({ setting: "camp", seed: "c1", locks: false });
    const trapped = generateBattlemap({ setting: "camp", seed: "c1", traps: true });
    expect(trapped.props).toEqual(plain.props);
    expect(trapped.traps?.length).toBeGreaterThan(0);
    const blocked = new Set(trapped.props.filter((p) => p.blocks !== "none").flatMap((p) => [`${p.x},${p.y}`]));
    for (const t of trapped.traps!) for (const [x, y] of t.cells) expect(blocked.has(`${x},${y}`)).toBe(false);
    const shops = Array.from({ length: 20 }, (_, i) => generateBattlemap({ setting: "shop", seed: `s${i}` }));
    expect(shops.some((m) => m.walls.some((w) => w.lock))).toBe(true);
    // The front door is never locked: the party has to get in.
    // The shop front runs along y = height - 3, above the street.
    for (const m of shops) for (const w of m.walls.filter((w) => w.lock)) expect(w.y1 === w.y2 && w.y1 === m.height - 3).toBe(false);
  });
});

describe("deeper loot", () => {
  it("adds extras on their own stream, so coins and magic items don't change", () => {
    const bare = generateLoot({ cr: 8, mode: "hoard", seed: "x", extras: false });
    const full = generateLoot({ cr: 8, mode: "hoard", seed: "x" });
    expect(full.coins).toEqual(bare.coins);
    for (const i of bare.items) expect(full.items).toContainEqual(i);
    expect(full.items.length).toBeGreaterThan(bare.items.length);
    expect(full.container).toBeDefined();
  });

  it("themes treasure on the creatures: beasts carry no coin but leave parts", () => {
    let parts = 0;
    for (let i = 0; i < 20; i++) {
      const l = generateLoot({ cr: 3, seed: `b${i}`, creatures: [{ name: "Dire Wolf", type: "beast", cr: 1, count: 3 }] });
      expect(Object.values(l.coins).every((n) => n === 0)).toBe(true);
      expect(l.theme).toBe("beast");
      parts += l.items.filter((it) => it.kind === "part").length;
      for (const it of l.items.filter((it) => it.kind === "part")) expect(it.note).toMatch(/Harvest: DC \d+/);
    }
    expect(parts).toBeGreaterThan(10);
  });

  it("gives the dead grave goods and humanoids gear, potions and scrolls", () => {
    const undead = Array.from({ length: 10 }, (_, i) => generateLoot({ cr: 6, mode: "hoard", theme: "undead", seed: `u${i}` }));
    expect(undead.every((l) => l.items.some((i) => i.kind === "art"))).toBe(true);
    const all = Array.from({ length: 30 }, (_, i) => generateLoot({ cr: 9, mode: "hoard", theme: "humanoid", seed: `h${i}` })).flatMap((l) => l.items);
    expect(all.some((i) => i.kind === "consumable" && i.spell)).toBe(true);
    expect(all.some((i) => i.kind === "consumable" && /Potion|Oil|Elixir|Philter/.test(i.name))).toBe(true);
    expect(all.some((i) => i.kind === "trade")).toBe(true);
    expect(all.some((i) => i.kind === "trinket" && i.note)).toBe(true);
  });
});

describe("forged consumables", () => {
  it("makes single-use potions and scrolls and stacks of ammunition", () => {
    for (let i = 0; i < 20; i++) {
      const p = forgeItem({ kind: "potion", rarity: "rare", seed: `p${i}` });
      expect(p.itemType).toBe("consumable");
      expect(p.attunement).toBe(false);
      expect(forgedProperties(p).length).toBeGreaterThan(0);
      if (p.power) expect(p.power.single).toBe(true);
      const s = forgeItem({ kind: "scroll", rarity: "uncommon", seed: `s${i}` });
      expect(s.power?.single).toBe(true);
      expect(s.base).toBe("Scroll");
      const a = forgeItem({ kind: "ammo", rarity: "rare", seed: `a${i}` });
      expect(a.quantity).toBe(10);
      expect(a.bonus).toBe(2);
      expect(forgedProperties(a)[0]).toMatch(/ammunition/);
    }
  });

  it("curses consumables when asked", () => {
    for (const kind of ["potion", "scroll", "ammo"] as const) {
      const it = forgeItem({ kind, curse: "always", seed: kind });
      expect(it.cursed).toBe(true);
      expect(it.notes.some((n) => n.startsWith("Curse."))).toBe(true);
    }
  });
});

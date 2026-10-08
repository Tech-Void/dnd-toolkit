import { createRng } from "./rng.ts";

// ---------------------------------------------------------------------------
// Running monsters well, fast: what a creature does on its turn (from its role, wits and wounds),
// lair actions for bosses that don't come with any, and what a captive will spill.

export interface TurnSituation {
  name: string;
  /** 0-1. */
  hp: number;
  /** Combat roles from the catalog: brute, skirmisher, artillery, controller, leader, solo, minion, soldier, support... */
  roles?: string[];
  /** Creature type. */
  type?: string;
  /** Intelligence score. */
  int?: number;
  leader?: boolean;
  /** Allies still standing, not counting itself. */
  allies: number;
  /** Party members it can see, nearest first. */
  foes: { name: string; hp: number; distance: number; caster?: boolean; ac?: number }[];
  /** Recharge abilities: ready or not. */
  recharge?: { name: string; ready: boolean }[];
  /** Multiattack or a signature action, if it has one. */
  signature?: string;
}

const lowest = <T>(list: T[], by: (x: T) => number) => [...list].sort((a, b) => by(a) - by(b))[0];

/** Two or three lines of advice for this creature's turn. */
export function turnAdvice(s: TurnSituation): string[] {
  const roles = new Set(s.roles ?? []);
  const smart = (s.int ?? 8) >= 10;
  const animal = (s.int ?? 8) <= 4 || s.type === "beast";
  const lines: string[] = [];
  const nearest = s.foes[0];
  const weakest = lowest(s.foes.filter((f) => f.distance <= 30), (f) => f.hp);
  const caster = s.foes.find((f) => f.caster && f.distance <= 60);

  // Wounded and outnumbered: the turn is about survival.
  if (s.hp <= 0.25 && !roles.has("solo") && !roles.has("minion")) {
    if (animal) lines.push("Badly hurt: it bolts, using all its movement to get away (opportunity attacks permitting).");
    else if (s.leader) lines.push("Bloodied and desperate: it throws everything into one big push, or orders the others to cover its escape.");
    else if (s.allies === 0) lines.push(smart ? "Alone and hurt: it tries to bargain (or surrenders if it can't escape)." : "Alone and hurt: it flees, or surrenders if cornered.");
    else lines.push("Hurt: it pulls back behind its allies and fights defensively (Dodge if nobody's in reach).");
  }
  for (const r of s.recharge ?? []) if (r.ready) lines.push(`${r.name} is ready: use it now${roles.has("controller") || /breath/i.test(r.name) ? ", catching as many of them as it can" : ""}.`);

  const target = (() => {
    if (animal) return nearest && `the nearest (${nearest.name})`;
    if (roles.has("artillery")) return caster ? `${caster.name}, the spellcaster` : weakest && `${weakest.name}, the most wounded in range`;
    if (roles.has("skirmisher")) return weakest && `${weakest.name} (most wounded), then Disengage or move off`;
    if (roles.has("leader") || roles.has("solo") || s.leader) return caster && smart ? `${caster.name}, the spellcaster` : weakest && `${weakest.name}, to drop someone`;
    if (roles.has("brute") || roles.has("soldier")) return nearest && `the nearest (${nearest.name}), standing between them and the weak ones`;
    if (roles.has("minion")) return nearest && `whoever its friends are already on (gang up for flanking)`;
    return smart ? weakest && `${weakest.name}, the most wounded in reach` : nearest && `the nearest (${nearest.name})`;
  })();
  if (target) lines.push(`Target: ${target}.`);
  if (s.signature && !lines.some((l) => l.includes(s.signature!))) lines.push(`Use ${s.signature}.`);
  if (roles.has("artillery") && nearest && nearest.distance <= 5) lines.push("Someone's in its face: step away first (it doesn't want to be in melee).");
  if (roles.has("controller")) lines.push("Look for a cluster of them to catch together, or split them up.");
  if (roles.has("support")) lines.push("Keep the others standing: heal or buff before attacking.");
  return lines.slice(0, 4);
}

// --- Lair actions ---------------------------------------------------------------------------

const LAIR: Record<string, string[]> = {
  undead: ["Grasping hands burst from the floor in a 20-foot square: DC {dc} Strength save or restrained until the next lair action.", "Necrotic mist fills a 15-foot radius: creatures inside can't regain hit points until the next lair action.", "The lair's dead stir: two zombies (or skeletons) claw up from the ground."],
  fiend: ["Flames gout from a crack in the floor: a 5-by-30-foot line, DC {dc} Dexterity save, 3d6 fire damage.", "Whispers fill every mind: one creature makes a DC {dc} Wisdom save or is frightened until the next lair action.", "Darkness swallows a 15-foot sphere (magical; it can see through it)."],
  dragon: ["The ground shakes: each creature on the ground makes a DC {dc} Dexterity save or is knocked prone.", "Stalactites fall on three points: DC {dc} Dexterity save, 3d6 piercing damage each.", "A cloud of choking smoke fills a 20-foot sphere until the next lair action: heavily obscured."],
  aberration: ["The walls ripple and lash out: one creature makes a DC {dc} Strength save or is pulled 15 feet toward the boss.", "Reality slips: one creature makes a DC {dc} Intelligence save or takes 2d10 psychic damage and can't take reactions.", "Slime coats a 20-foot square: difficult terrain, and DC {dc} Dexterity save or prone."],
  any: ["Part of the ceiling comes down: a 10-foot square, DC {dc} Dexterity save, 2d10 bludgeoning damage.", "The lights gutter out (or flare): the area within 30 feet of the boss becomes dim light until the next lair action.", "Minions answer the call: two of the weakest creatures in this fight arrive at the edge of the room."],
};

/** Three lair actions to choose from on initiative 20, for a boss without its own. */
export function lairActions(type: string, cr: number, seed?: string | number): string[] {
  const rng = createRng(seed);
  const dc = 10 + Math.max(1, Math.floor(cr / 3));
  const pool = [...(LAIR[type] ?? []), ...LAIR.any!];
  return rng.shuffle(pool).slice(0, 3).map((t) => t.replace(/\{dc\}/g, String(dc)));
}

// --- Captives ----------------------------------------------------------------------------

const KNOWS = [
  "how many more of them there are, and where they sleep",
  "the password at the {place} gate",
  "who's really giving the orders, and where they meet",
  "where the stolen goods are stashed",
  "that the {boss} is afraid of fire (or silver, or a name from their past)",
  "a hidden way in, through the old drainage tunnel",
  "that the prisoners are being moved at dawn",
  "which of their own they'd sell out for their freedom",
];

/** What a captive knows, and what it'll take to get it. */
export function captiveTalk(name: string, seed?: string | number, ctx: { boss?: string; place?: string } = {}): string {
  const rng = createRng(seed);
  const knows = rng.pick(KNOWS).replace("{place}", ctx.place ?? "north").replace("{boss}", ctx.boss ?? "boss");
  const price = rng.pick(["for their life", "for gold (10 gp a question)", "only under Intimidation (DC 13)", "if the party promises to let them go", "after a DC 12 Persuasion check, and they lie about one detail"]);
  return `${name} surrenders. They know ${knows}, and will talk ${price}.`;
}

/** Index into `foes` of the creature it goes after (same reasoning as the advice), or -1. */
export function pickTarget(s: TurnSituation): number {
  if (!s.foes.length) return -1;
  const roles = new Set(s.roles ?? []);
  const smart = (s.int ?? 8) >= 10;
  const animal = (s.int ?? 8) <= 4 || s.type === "beast";
  const idx = (f: TurnSituation["foes"][number] | undefined) => (f ? s.foes.indexOf(f) : 0);
  const inReach = s.foes.filter((f) => f.distance <= 30);
  const weakest = lowest(inReach.length ? inReach : s.foes, (f) => f.hp);
  const caster = s.foes.find((f) => f.caster && f.distance <= 60);
  if (animal) return 0;
  if (roles.has("artillery")) return idx(caster ?? weakest);
  if (roles.has("skirmisher")) return idx(weakest);
  if (roles.has("leader") || roles.has("solo") || s.leader) return idx(caster && smart ? caster : weakest);
  if (roles.has("brute") || roles.has("soldier") || roles.has("minion")) return 0;
  return smart ? idx(weakest) : 0;
}

// --- Multiattack -------------------------------------------------------------------------------

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, once: 1, twice: 2, thrice: 3 };

/**
 * Read a Multiattack description into the attacks it makes: "makes three attacks: one with its
 * bite and two with its claws" → bite ×1, claws ×2. Only names that match one of `attacks` are kept.
 */
export function parseMultiattack(text: string, attacks: readonly string[]): { name: string; count: number }[] {
  const t = text.toLowerCase().replace(/<[^>]+>/g, " ");
  const names = attacks.map((n) => ({ n, key: n.toLowerCase().replace(/\s*\(.*\)\s*/, "").trim() }));
  const find = (phrase: string) => names.find(({ key }) => phrase.includes(key) || key.includes(phrase.trim()) || phrase.includes(key.replace(/s$/, "")));
  const out = new Map<string, number>();
  // "one with its bite", "two with its claws", "two claw attacks", "three longsword attacks"
  for (const m of t.matchAll(/\b(one|two|three|four|five|six)\s+(?:attacks?\s+)?(?:with\s+(?:its|his|her|their)\s+)?([a-z' -]+?)(?:\s+attacks?)?(?=[,.;]| and | or |$)/g)) {
    const hit = find(m[2]!);
    if (hit) out.set(hit.n, (out.get(hit.n) ?? 0) + COUNT[m[1]!]!);
  }
  if (!out.size) {
    // "makes two attacks" with only one attack available.
    const total = /makes\s+(one|two|three|four|five|six)\s+(?:melee\s+|ranged\s+|weapon\s+)*attacks?/.exec(t);
    if (total && attacks.length) out.set(attacks[0]!, COUNT[total[1]!]!);
  }
  return [...out].map(([name, count]) => ({ name, count }));
}

// --- Aiming area effects -----------------------------------------------------------------------

export interface AimShape {
  type: "cone" | "line" | "circle";
  /** Length (cone/line) or radius (circle), in squares. */
  size: number;
  /** Line width in squares. */
  width?: number;
}

/** Is point p inside the area (origin o, pointing `deg`)? Grid units. 5e cones are as wide as they are long. */
export function inArea(shape: AimShape, o: { x: number; y: number }, deg: number, p: { x: number; y: number }): boolean {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const d = Math.hypot(dx, dy);
  if (shape.type === "circle") return d <= shape.size + 0.01;
  const a = (deg * Math.PI) / 180;
  const along = dx * Math.cos(a) + dy * Math.sin(a);
  const across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
  if (along < 0 || along > shape.size + 0.01) return false;
  if (shape.type === "line") return across <= (shape.width ?? 1) / 2 + 0.01;
  // Cone half-angle ≈ 26.57° (width equals length).
  return across <= along / 2 + 0.01;
}

/**
 * Point an area where it catches the most foes and the fewest friends. Cones and lines start at the
 * caster and turn to face; circles are centred on a foe (or between two). Returns the aim and who's in it.
 */
export function bestAim(origin: { x: number; y: number }, shape: AimShape, foes: { x: number; y: number }[], friends: { x: number; y: number }[] = [], range = 0): { x: number; y: number; direction: number; hits: number[] } | null {
  if (!foes.length) return null;
  let best: { x: number; y: number; direction: number; hits: number[]; score: number } | null = null;
  const score = (o: { x: number; y: number }, deg: number) => {
    const hits = foes.map((f, i) => (inArea(shape, o, deg, f) ? i : -1)).filter((i) => i >= 0);
    const ff = friends.filter((f) => inArea(shape, o, deg, f)).length;
    return { hits, score: hits.length * 10 - ff * 12 };
  };
  if (shape.type === "circle") {
    const centres = [...foes, ...foes.flatMap((a, i) => foes.slice(i + 1).map((b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })))];
    for (const c of centres) {
      if (range && Math.hypot(c.x - origin.x, c.y - origin.y) > range) continue;
      const r = score(c, 0);
      if (!best || r.score > best.score) best = { x: c.x, y: c.y, direction: 0, ...r };
    }
  } else {
    const angles = new Set<number>();
    for (let a = 0; a < 360; a += 5) angles.add(a);
    for (const f of foes) angles.add(Math.round((Math.atan2(f.y - origin.y, f.x - origin.x) * 180) / Math.PI + 360) % 360);
    for (const deg of angles) {
      const r = score(origin, deg);
      if (!best || r.score > best.score) best = { x: origin.x, y: origin.y, direction: deg, ...r };
    }
  }
  return best && best.hits.length ? { x: best.x, y: best.y, direction: best.direction, hits: best.hits } : null;
}

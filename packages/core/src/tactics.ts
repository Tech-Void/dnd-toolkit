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

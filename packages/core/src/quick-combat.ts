// ---------------------------------------------------------------------------
// Quick combat: the pure parts of "click an action, click a target, it resolves". Which effect to
// play for an action, how an attack roll comes out, and the one-line result.

export type EffectKind = "slash" | "pierce" | "bludgeon" | "arrow" | "bolt" | "ray" | "burst" | "heal" | "aura";

export interface ActionInfo {
  /** dnd5e action type: mwak, rwak, msak, rsak, save, heal, util. */
  actionType?: string;
  /** Damage types in the item's damage parts. */
  damageTypes: string[];
  /** Weapon properties / base, e.g. "longbow", "dagger"; and whether it's thrown. */
  weapon?: string;
  /** Has an area (template). */
  area?: boolean;
  /** Spell (vs weapon or feature). */
  spell?: boolean;
}

export const DAMAGE_COLORS: Record<string, string> = {
  fire: "#ff7a1a", cold: "#8fd6ff", lightning: "#b9c7ff", thunder: "#c9b3ff", acid: "#9be33a", poison: "#5fbf3a", necrotic: "#7a3fb0",
  radiant: "#ffe27a", psychic: "#ff6fd1", force: "#a98bff", slashing: "#f2f2f2", piercing: "#e8e8e8", bludgeoning: "#d8d0c0", healing: "#5cff8a",
};

const RANGED_WEAPONS = /bow|crossbow|sling|dart|blowgun|javelin|net/i;

/** The animation for an action. */
export function effectFor(a: ActionInfo): { kind: EffectKind; color: string } {
  const main = a.damageTypes[0] ?? (a.actionType === "heal" ? "healing" : "force");
  const color = DAMAGE_COLORS[main] ?? "#ffffff";
  if (a.actionType === "heal" || main === "healing") return { kind: "heal", color: DAMAGE_COLORS.healing! };
  if (a.area) return { kind: "burst", color };
  if (a.actionType === "rwak") return { kind: RANGED_WEAPONS.test(a.weapon ?? "") || !a.weapon ? "arrow" : "arrow", color };
  if (a.actionType === "rsak") return { kind: main === "lightning" || main === "radiant" || main === "necrotic" ? "ray" : "bolt", color };
  if (a.actionType === "msak") return { kind: "aura", color };
  if (a.actionType === "save") return { kind: a.spell ? "burst" : "aura", color };
  if (main === "piercing") return { kind: "pierce", color };
  if (main === "bludgeoning") return { kind: "bludgeon", color };
  return { kind: "slash", color };
}

export interface AttackOutcome {
  hit: boolean;
  crit: boolean;
  fumble: boolean;
}

/** A natural 20 (or the item's crit range) always hits and crits; a natural 1 always misses. */
export function attackOutcome(total: number, natural: number, ac: number, critThreshold = 20): AttackOutcome {
  const crit = natural >= critThreshold;
  const fumble = natural === 1;
  return { hit: crit || (!fumble && total >= ac), crit, fumble };
}

/** "Brakka's Longsword hits the goblin (17 vs AC 15): 9 slashing." */
export function resultLine(o: { attacker: string; item: string; target: string; total?: number; ac?: number; outcome?: AttackOutcome; damage?: number; types?: string[]; save?: { ability: string; dc: number; total: number; passed: boolean }; healing?: boolean }): string {
  const dmg = o.damage !== undefined ? `${o.damage}${o.types?.length ? ` ${o.types.join("/")}` : ""}` : "";
  if (o.healing) return `${o.attacker}'s ${o.item} heals ${o.target} for ${o.damage}.`;
  if (o.save) {
    const ab = o.save.ability.toUpperCase();
    return `${o.target} ${o.save.passed ? "resists" : "fails"} the ${o.item} (${ab} ${o.save.total} vs DC ${o.save.dc})${dmg ? `: ${dmg}${o.save.passed ? " (half)" : ""}` : ""}.`;
  }
  if (!o.outcome) return `${o.attacker} uses ${o.item} on ${o.target}.`;
  const vs = o.total !== undefined && o.ac !== undefined ? ` (${o.total} vs AC ${o.ac})` : "";
  if (!o.outcome.hit) return `${o.attacker}'s ${o.item} misses ${o.target}${o.outcome.fumble ? " badly (natural 1)" : vs}.`;
  return `${o.attacker}'s ${o.item} ${o.outcome.crit ? "CRITS" : "hits"} ${o.target}${vs}${dmg ? `: ${dmg}` : ""}.`;
}

/** Half damage, rounded down (saves). */
export const halve = (n: number) => Math.floor(n / 2);

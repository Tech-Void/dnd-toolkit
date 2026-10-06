import type { Role } from "./encounter.ts";

/** The parts of a statblock that say how a creature fights. Built from a Foundry actor. */
export interface StatSummary {
  name: string;
  cr: number;
  hp: number;
  legendary: boolean;
  /** NPC spellcaster level (dnd5e system.details.spellLevel). */
  spellLevel: number;
  spellCount: number;
  meleeAttacks: number;
  rangedAttacks: number;
  walk: number;
  fly: number;
  /** Names of features and actions. */
  features: string[];
  /** Lowercased plain text of action/feature descriptions. */
  text: string;
}

const LEADER_NAME = /\b(captain|chief|chieftain|warlord|war ?chief|lord|king|queen|boss|commander|general|leader|matriarch|patriarch|overseer|champion|high priest)\b/i;
const LEADER_FEATURE = /leadership|rally|commanding|command ally|battle cry|war cry|inspir|aura of authority|tactical|marshal/i;
const SKIRMISH_FEATURE = /nimble escape|cunning action|flyby|shadow stealth|evasion|hit and run|skirmish|disengage|teleport|blink|misty step|elusive/i;
// Conditions the creature inflicts ("the target is restrained"), not ones it resists ("against being charmed").
const HARD_CONTROL = /\b(?:is|are|becomes?|be)\s+(?:\w+\s+)?(?:grappled|restrained|paralyzed|stunned|charmed|petrified)\b/;
const SOFT_CONTROL = /\b(?:is|are|becomes?|be)\s+(?:\w+\s+)?(frightened|blinded|poisoned|incapacitated|deafened)\b/g;

/**
 * Lowercased plain text from a Foundry description: strips HTML and unwraps enrichers such as
 * `&Reference[restrained]{restrained}`, `@UUID[...]{Goblin}` and `[[/save con 14]]`.
 */
export function plainText(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/[@&]\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/[@&]\w+\[([^\]]*)\]/g, "$1")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Combat roles from a statblock, most important first (the first is used for tactics).
 * A heuristic: good enough to build sensible encounters, not a rules judgement.
 */
export function deriveRoles(s: StatSummary): Role[] {
  const roles = new Set<Role>();
  const featureText = s.features.join(" | ");

  if (s.legendary) roles.add("solo");
  if (LEADER_NAME.test(s.name) || LEADER_FEATURE.test(featureText)) roles.add("leader");
  if (s.spellLevel > 0 || s.spellCount >= 3) roles.add("caster");
  // A backup ranged weapon (Hill Giant's rock, Knight's crossbow) doesn't make a tough creature artillery.
  const frail = s.hp < 8 * s.cr + 20;
  if (s.rangedAttacks > s.meleeAttacks || (s.rangedAttacks > 0 && s.rangedAttacks === s.meleeAttacks && frail)) roles.add("artillery");
  const soft = new Set([...s.text.matchAll(SOFT_CONTROL)].map((m) => m[1]));
  if (HARD_CONTROL.test(s.text) || soft.size >= 2) roles.add("controller");
  if (s.fly >= 40 || s.walk >= 50 || SKIRMISH_FEATURE.test(featureText)) roles.add("skirmisher");
  if (s.meleeAttacks > 0 && !roles.has("artillery") && !roles.has("caster") && !roles.has("skirmisher")) roles.add("brute");
  if (s.cr <= 0.25 || s.hp <= 12) roles.add("minion");
  if (!roles.size) roles.add(s.cr >= 10 ? "solo" : "brute");
  return [...roles];
}

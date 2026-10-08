import type { Ability, ParsedStatblock, StatSection } from "@dnd-toolkit/core";
import { ensureFolder, esc, isDnd5e, MODULE_ID } from "../util.ts";
import { compendiumItem } from "./items.ts";
import { parsedItemData } from "./parsed.ts";

const CREATURE_TYPES = new Set(["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"]);
const TOKEN_SIZE: Record<string, number> = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };
const LANGUAGES: Record<string, string> = {
  common: "common", dwarvish: "dwarvish", elvish: "elvish", giant: "giant", gnomish: "gnomish", goblin: "goblin", halfling: "halfling", orc: "orc",
  abyssal: "abyssal", celestial: "celestial", "deep speech": "deep", draconic: "draconic", infernal: "infernal", primordial: "primordial",
  sylvan: "sylvan", undercommon: "undercommon", aquan: "aquan", auran: "auran", ignan: "ignan", terran: "terran", druidic: "druidic",
  "thieves' cant": "cant", gnoll: "gnoll", gith: "gith", aarakocra: "aarakocra",
};
const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
const SKILL_ABILITY: Record<string, Ability> = {
  acr: "dex", ani: "wis", arc: "int", ath: "str", dec: "cha", his: "int", ins: "wis", itm: "cha", inv: "int",
  med: "wis", nat: "int", prc: "wis", prf: "cha", per: "cha", rel: "int", slt: "dex", ste: "dex", sur: "wis",
};

const profBonus = (cr: number) => Math.max(2, Math.floor((Math.max(cr, 1) - 1) / 4) + 2);
const mod = (score: number) => Math.floor((score - 10) / 2);

/** What each section's features cost to use. */
function activationFor(section: StatSection, cost: number) {
  if (section === "bonus") return { type: "bonus", cost: 1, condition: "" };
  if (section === "reactions") return { type: "reaction", cost: 1, condition: "" };
  if (section === "legendary") return { type: "legendary", cost, condition: "" };
  if (section === "lair") return { type: "lair", cost: 1, condition: "" };
  return null;
}

/**
 * A complete dnd5e NPC actor from a parsed statblock: stats, saves, skills, senses, traits,
 * resources, every feature and attack as an item, and its spells copied from your compendiums.
 * Returns the actor and the names of any spells that couldn't be found.
 */
export async function createStatblockActor(sb: ParsedStatblock): Promise<{ actor: any; missingSpells: string[] }> {
  const pb = profBonus(sb.cr);
  const items: any[] = [];
  for (const section of Object.keys(sb.sections) as StatSection[]) {
    for (const entry of sb.sections[section]) {
      const data = await parsedItemData(entry);
      const activation = activationFor(section, entry.activation?.type === "legendary" ? entry.activation.cost : 1);
      if (activation && isDnd5e()) data.system.activation = activation;
      // Statblock features are monster features, not class feats.
      if (data.type === "feat" && isDnd5e()) data.system.type = { value: "monster" };
      items.push(data);
    }
  }

  const missingSpells: string[] = [];
  for (const spell of sb.spellcasting?.spells ?? []) {
    const doc = await compendiumItem(spell.name);
    if (!doc || doc.type !== "spell") {
      missingSpells.push(spell.name);
      continue;
    }
    const data = doc.toObject();
    delete data._id;
    data.system.preparation = { mode: spell.mode === "prepared" ? "prepared" : spell.mode, prepared: true };
    if (spell.mode === "innate" && spell.uses) data.system.uses = { value: spell.uses, max: String(spell.uses), per: "day", recovery: "" };
    items.push(data);
  }

  const languageCodes: string[] = [];
  const customLanguages: string[] = [];
  for (const l of sb.languages) {
    const code = LANGUAGES[l.toLowerCase()];
    if (code) languageCodes.push(code);
    else customLanguages.push(l);
  }

  const skills: Record<string, { value: number }> = {};
  for (const [code, bonus] of Object.entries(sb.skills)) {
    const over = bonus - mod(sb.abilities[SKILL_ABILITY[code]!]);
    // Twice the proficiency bonus over the modifier is expertise; any lesser boost is proficiency.
    skills[code] = { value: over >= pb * 2 ? 2 : over > 0 ? 1 : 0 };
  }

  const size = TOKEN_SIZE[sb.size] ?? 1;
  const physical = ["bludgeoning", "piercing", "slashing"];
  const actorData: any = {
    name: sb.name,
    type: isDnd5e() ? "npc" : Object.keys(game.system.documentTypes?.Actor ?? { npc: 1 })[0],
    folder: await ensureFolder("Actor"),
    flags: { [MODULE_ID]: { kind: "statblock" } },
    prototypeToken: {
      name: sb.name,
      width: size,
      height: size,
      disposition: CONST.TOKEN_DISPOSITIONS?.HOSTILE ?? -1,
      sight: { enabled: true, range: Math.max(sb.senses.darkvision, sb.senses.blindsight, sb.senses.truesight) || null },
    },
    items,
  };
  if (isDnd5e()) {
    actorData.system = {
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, { value: sb.abilities[a], proficient: sb.saves[a] !== undefined ? 1 : 0 }])),
      attributes: {
        ac: { calc: "flat", flat: sb.ac.value },
        hp: { value: sb.hp.value, max: sb.hp.value, formula: sb.hp.formula ?? "" },
        movement: { ...sb.speed, units: "ft" },
        senses: { ...sb.senses, units: "ft" },
        spellcasting: sb.spellcasting?.ability ?? "",
      },
      details: {
        cr: sb.cr,
        type: CREATURE_TYPES.has(sb.type) ? { value: sb.type, subtype: sb.subtype } : { value: "custom", custom: sb.type, subtype: sb.subtype },
        alignment: sb.alignment,
        spellLevel: sb.spellcasting?.level ?? 0,
        biography: { value: sb.ac.note ? `<p><em>Armor: ${esc(sb.ac.note)}</em></p>` : "" },
      },
      traits: {
        size: sb.size,
        languages: { value: languageCodes, custom: customLanguages.join("; ") },
        dr: { value: sb.resistances, bypasses: sb.physicalBypassMagic && sb.resistances.some((t) => physical.includes(t)) ? ["mgc"] : [] },
        di: { value: sb.immunities, bypasses: sb.physicalBypassMagic && sb.immunities.some((t) => physical.includes(t)) ? ["mgc"] : [] },
        dv: { value: sb.vulnerabilities },
        ci: { value: sb.conditionImmunities },
      },
      skills,
      resources: {
        legact: { value: sb.legendaryActions, max: sb.legendaryActions },
        legres: { value: sb.legendaryResistances, max: sb.legendaryResistances },
      },
    };
  }
  const actor = await Actor.create(actorData);
  return { actor, missingSpells };
}

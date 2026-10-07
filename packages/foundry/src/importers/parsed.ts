import type { ParsedEntry } from "@dnd-toolkit/core";
import { ensureFolder, esc, isDnd5e, MODULE_ID } from "../util.ts";
import { DND5E_RARITY, ICONS } from "./forge.ts";
import { compendiumItem } from "./items.ts";

/** Icons by damage type (all ship with Foundry core). */
const DAMAGE_ICONS: Record<string, string> = {
  fire: "icons/magic/fire/explosion-embers-evade-silhouette.webp",
  cold: "icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp",
  lightning: "icons/magic/lightning/barrier-shield-crackling-orb-pink.webp",
  thunder: "icons/magic/sonic/explosion-impact-shock-wave.webp",
  acid: "icons/magic/acid/projectile-bolts-salvo-green.webp",
  poison: "icons/magic/acid/projectile-bolts-salvo-green.webp",
  necrotic: "icons/magic/death/bones-crossed-gray.webp",
  radiant: "icons/magic/light/beam-explosion-orange.webp",
  psychic: "icons/magic/perception/eye-ringed-glow-angry-large-teal.webp",
  force: "icons/magic/symbols/chevron-elipse-circle-blue.webp",
  healing: "icons/magic/life/cross-beam-green.webp",
};
const SPELL_ICON = "icons/magic/symbols/runes-star-orange.webp";
const ATTACK_ICON = "icons/skills/melee/blade-tip-chipped-blood-red.webp";
const NATURAL_ICON = "icons/creatures/claws/claw-curved-jagged-gray.webp";
const CONSUMABLE_ICONS: Record<string, string> = {
  potion: "icons/consumables/potions/bottle-bulb-corked-glowing-red.webp",
  scroll: "icons/sundries/scrolls/scroll-bound-black-tan.webp",
  wand: ICONS.Wand!,
  rod: ICONS.Rod!,
};
const NATURAL = /\b(bite|claw|claws|tail|horn|horns|gore|slam|tentacle|tentacles|talons?|sting|hooves|beak|fist|tusk)\b/i;

const iconFor = (e: ParsedEntry, fallback: string) => DAMAGE_ICONS[e.damage[0]?.[1] ?? ""] ?? fallback;

export const parsedHtml = (e: ParsedEntry) => e.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");

/** dnd5e item data for a parsed spell, item, action or feature. */
export async function parsedItemData(e: ParsedEntry): Promise<any> {
  const flags = { [MODULE_ID]: { parsed: true } };
  const description = parsedHtml(e);
  if (!isDnd5e()) {
    return { name: e.name, type: Object.keys(game.system.documentTypes?.Item ?? { item: 1 })[0], flags, system: { description: { value: description } } };
  }

  let data: any;
  if (e.kind === "spell" && e.spell) {
    const s = e.spell;
    const properties = [s.components.v && "vocal", s.components.s && "somatic", s.components.m && "material", e.concentration && "concentration", s.ritual && "ritual"].filter(Boolean);
    data = {
      name: e.name,
      type: "spell",
      img: iconFor(e, SPELL_ICON),
      system: {
        level: s.level,
        school: s.school,
        properties,
        materials: { value: s.components.material ?? "", consumed: !!s.components.consumed, cost: s.components.cost ?? 0, supply: 0 },
        preparation: { mode: "prepared", prepared: false },
        scaling: s.scaling ?? { mode: s.level === 0 ? "cantrip" : "none", formula: null },
      },
    };
  } else if (e.kind === "item" && e.item) {
    const it = e.item;
    const base = it.base ? await compendiumItem(it.base) : null;
    data = base ? base.toObject() : { name: e.name, type: it.itemType, img: CONSUMABLE_ICONS[it.subtype] ?? ICONS[guessSlot(e.name)] ?? "icons/magic/symbols/runes-star-orange.webp", system: {} };
    delete data._id;
    const sys = data.system;
    data.name = e.name;
    if (it.rarity && it.rarity !== "artifact") sys.rarity = DND5E_RARITY[it.rarity];
    else if (it.rarity === "artifact") sys.rarity = "artifact";
    sys.attunement = it.attunement ? "required" : "";
    sys.identified = true;
    if (it.rarity && it.rarity !== "common") sys.properties = [...new Set([...(sys.properties ?? []), "mgc"])];
    if (!base) sys.type = { value: it.subtype };
    if (it.itemType === "weapon") {
      sys.magicalBonus = it.bonus ?? null;
      // A weapon's extra damage rides along with its own.
      sys.damage = { ...sys.damage, parts: [...(sys.damage?.parts ?? []), ...e.damage] };
    } else if (it.itemType === "equipment" && it.bonus) {
      sys.armor = { ...sys.armor, magicalBonus: it.bonus };
    }
    if (it.itemType === "consumable") sys.uses = { value: 1, max: "1", per: "charges", autoDestroy: it.subtype === "potion" || it.subtype === "scroll" };
    const MODES = CONST.ACTIVE_EFFECT_MODES;
    data.effects = [
      ...(data.effects ?? []),
      ...it.effects.map((f) => ({
        name: `${e.name}: ${f.label}`,
        img: data.img,
        transfer: true,
        disabled: false,
        changes: [{ key: f.key, mode: f.mode === "add" ? MODES.ADD : f.mode === "upgrade" ? MODES.UPGRADE : MODES.OVERRIDE, value: f.value }],
      })),
    ];
  } else if (e.attackBonus !== undefined) {
    // Monster attacks: a weapon with the to-hit exactly as written.
    const natural = NATURAL.test(e.name);
    data = {
      name: e.name,
      type: "weapon",
      img: natural ? NATURAL_ICON : ATTACK_ICON,
      system: {
        type: { value: natural ? "natural" : "simpleM" },
        equipped: true,
        proficient: 1,
        attack: { bonus: String(e.attackBonus), flat: true },
      },
    };
  } else {
    data = { name: e.name, type: "feat", img: iconFor(e, "icons/magic/symbols/runes-star-orange.webp"), system: { type: { value: e.kind === "action" ? "monster" : "" } } };
  }

  // Shared mechanics: when, how far, how big, what it rolls.
  const sys = data.system;
  data.flags = { ...data.flags, ...flags };
  sys.description = { ...sys.description, value: description };
  if (e.activation) sys.activation = { type: e.activation.type, cost: e.activation.cost, condition: e.activation.condition ?? "" };
  if (e.range) sys.range = { value: e.range.value, long: e.range.long ?? null, units: e.range.units };
  if (e.target) sys.target = { value: e.target.value, width: e.target.width ?? null, units: e.target.units, type: e.target.type };
  if (e.duration) sys.duration = { value: e.duration.value === null ? "" : String(e.duration.value), units: e.duration.units };
  if (e.actionType && !(e.kind === "item" && e.item?.itemType === "weapon")) sys.actionType = e.actionType;
  if (e.damage.length && !(e.kind === "item" && e.item?.itemType === "weapon")) sys.damage = { ...sys.damage, parts: e.damage };
  if (e.save) sys.save = { ability: e.save.ability, dc: e.save.dc ?? null, scaling: e.save.dc ? "flat" : "spell" };
  if (e.uses) sys.uses = { ...sys.uses, value: e.uses.max, max: String(e.uses.max), per: e.uses.per, recovery: e.uses.recovery ?? "" };
  if (e.recharge) sys.recharge = { value: e.recharge, charged: true };
  return data;
}

/** "Boots of Speed" → the Boots icon. */
function guessSlot(name: string): string {
  const n = name.toLowerCase();
  return ["Ring", "Amulet", "Cloak", "Boots", "Gloves", "Belt", "Circlet", "Bracers", "Wand", "Staff", "Rod"].find((s) => n.includes(s.toLowerCase())) ?? "Amulet";
}

export async function createParsedItems(entries: ParsedEntry[]) {
  const folder = await ensureFolder("Item");
  const data = await Promise.all(entries.map(parsedItemData));
  const items = await Item.createDocuments(data.map((d) => ({ ...d, folder })));
  if (items.length === 1) items[0].sheet?.render(true);
  else ui.notifications.info(`Created ${items.length} items in the DnD Toolkit folder.`);
  return items;
}

export async function addParsedToActor(entries: ParsedEntry[], actor: any) {
  const data = await Promise.all(entries.map(parsedItemData));
  await actor.createEmbeddedDocuments("Item", data);
  ui.notifications.info(`Added ${entries.length === 1 ? entries[0]!.name : `${entries.length} entries`} to ${actor.name}.`);
}

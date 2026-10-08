import { disguisedItem, forgedProperties, forgedSubtitle, type ForgedItem, type Rarity } from "@dnd-toolkit/core";
import { ensureFolder, esc, isDnd5e, MODULE_ID } from "../util.ts";
import { compendiumItem } from "./items.ts";

export const DND5E_RARITY: Record<Rarity, string> = { common: "common", uncommon: "uncommon", rare: "rare", "very rare": "veryRare", legendary: "legendary" };

export const ICONS: Record<string, string> = {
  Ring: "icons/equipment/finger/ring-ball-gold.webp",
  Amulet: "icons/equipment/neck/amulet-carved-stone-spiral-blue.webp",
  Cloak: "icons/equipment/back/cape-layered-blue.webp",
  Boots: "icons/equipment/feet/boots-armored-brass.webp",
  Gloves: "icons/equipment/hand/gauntlet-armored-black.webp",
  Belt: "icons/equipment/waist/belt-armored-steel.webp",
  Circlet: "icons/equipment/head/crown-gold-blue.webp",
  Bracers: "icons/equipment/wrist/bracelet-embossed-steel.webp",
  Wand: "icons/weapons/wands/wand-carved-fire.webp",
  Staff: "icons/weapons/staves/staff-animal-bird.webp",
  Rod: "icons/weapons/wands/wand-carved-stone-shard.webp",
  Potion: "icons/consumables/potions/bottle-round-corked-red.webp",
  Elixir: "icons/consumables/potions/bottle-bulb-corked-green.webp",
  Oil: "icons/consumables/potions/bottle-conical-corked-yellow.webp",
  Philter: "icons/consumables/potions/bottle-heart-pink.webp",
  Draught: "icons/consumables/potions/potion-tube-corked-blue.webp",
  Tincture: "icons/consumables/potions/vial-cork-empty.webp",
  Scroll: "icons/sundries/scrolls/scroll-runed-brown-purple.webp",
  Arrows: "icons/weapons/ammunition/arrows-war-brown.webp",
  "Crossbow Bolts": "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
  "Sling Bullets": "icons/weapons/ammunition/shot-round-blue.webp",
  "Blowgun Needles": "icons/weapons/ammunition/arrow-head-war-flight.webp",
};

/** "1 hour" → seconds, for a potion effect's duration. */
const seconds = (d?: string) => {
  const m = /(\d+)\s*(minute|hour|day)/.exec(d ?? "1 hour");
  return m ? Number(m[1]) * { minute: 60, hour: 3600, day: 86400 }[m[2] as "minute" | "hour" | "day"] : 3600;
};

/** [AC, dnd5e armor type] for building armor when the compendium copy isn't found. */
const ARMOR: Record<string, [number, string]> = {
  "Leather Armor": [11, "light"], "Studded Leather Armor": [12, "light"], "Hide Armor": [12, "medium"], "Chain Shirt": [13, "medium"],
  "Scale Mail": [14, "medium"], Breastplate: [14, "medium"], "Half Plate Armor": [15, "medium"], "Ring Mail": [14, "heavy"],
  "Chain Mail": [16, "heavy"], "Splint Armor": [17, "heavy"], "Plate Armor": [18, "heavy"], Shield: [2, "shield"],
};

/** Worn on the body (dnd5e "clothing") vs carried trinkets. */
const CLOTHING = new Set(["Cloak", "Boots", "Gloves", "Belt", "Circlet", "Bracers"]);

/** "15-foot cone" → dnd5e target data. */
function target(area?: string) {
  const m = /(\d+)-foot(?:-radius)? (cone|line|cube|sphere)(?:, (\d+) feet wide)?/.exec(area ?? "");
  return m ? { value: Number(m[1]), width: m[3] ? Number(m[3]) : null, units: "ft", type: m[2] } : undefined;
}

export function forgedHtml(i: ForgedItem): string {
  return `<p><em>${esc(forgedSubtitle(i))}</em></p>${i.appearance ? `<p>${esc(i.appearance)}</p>` : ""}` +
    `<ul>${forgedProperties(i).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` +
    (i.sentience ? `<p><strong>Sentience.</strong> ${esc(i.sentience)}</p>` : "") +
    (i.history ? `<p><strong>History.</strong> ${esc(i.history)}</p>` : "") +
    (i.drawback ? `<p><strong>Drawback.</strong> ${esc(i.drawback)}</p>` : "");
}

/**
 * dnd5e Item data for a forged item: built on the real compendium weapon or armor when there is
 * one, with the magic bonus, extra damage, charges, save and Active Effects filled in.
 */
export async function forgedItemData(i: ForgedItem): Promise<any> {
  const description = forgedHtml(i);
  const flags = { [MODULE_ID]: { forged: i } };
  if (!isDnd5e()) {
    return { name: i.name, type: Object.keys(game.system.documentTypes?.Item ?? { item: 1 })[0], flags, system: { description: { value: description } } };
  }

  const base = i.itemType === "consumable" || i.kind === "wondrous" || (i.kind === "relic" && i.itemType !== "weapon") ? null : await compendiumItem(i.base);
  const data: any = base ? base.toObject() : { name: i.name, type: i.itemType, img: ICONS[i.base], system: {} };
  delete data._id;
  const sys = data.system;
  data.name = i.name;
  data.flags = { ...data.flags, ...flags };
  sys.description = { ...sys.description, value: description };
  sys.rarity = DND5E_RARITY[i.rarity];
  sys.attunement = i.attunement ? "required" : "";
  sys.price = { value: i.valueGp, denomination: "gp" };
  sys.identified = !i.cursed;
  if (i.cursed) {
    // Players see a plain name and only the good parts until the GM identifies it.
    const disguise = disguisedItem(i);
    sys.unidentified = {
      name: disguise.name,
      description: `${i.appearance ? `<p>${esc(i.appearance)}</p>` : ""}<p>It hums faintly with magic.</p><ul>${disguise.properties.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`,
    };
  }
  sys.properties = [...new Set([...(sys.properties ?? []), "mgc"])];

  if (i.itemType === "weapon") {
    sys.magicalBonus = i.bonus || null;
    if (!base) {
      // No compendium weapon to copy: a plain martial melee weapon is close enough.
      sys.type = { value: "martialM" };
      sys.actionType = "mwak";
      sys.damage = { parts: [["1d8 + @mod", "slashing"]] };
    }
    sys.damage = { ...sys.damage, parts: [...(sys.damage?.parts ?? []), ...i.damage.map((d) => [d.formula, d.type])] };
    if (i.critThreshold || i.critDamage) sys.critical = { ...sys.critical, threshold: i.critThreshold ?? null, damage: i.critDamage ?? "" };
    // Bane damage is situational: it goes on the "other formula" button.
    if (i.bane) sys.formula = i.bane.formula;
  } else if (i.kind === "armor") {
    if (!base) {
      const [ac, type] = ARMOR[i.base] ?? [12, "light"];
      sys.type = { value: type };
      sys.armor = { value: ac, dex: type === "medium" ? 2 : type === "heavy" ? 0 : null };
      data.img = type === "shield" ? "icons/equipment/shield/heater-steel-worn.webp" : "icons/equipment/chest/breastplate-banded-steel.webp";
    }
    sys.armor = { ...sys.armor, magicalBonus: i.bonus || null };
  } else if (i.itemType === "equipment") {
    sys.type = { value: CLOTHING.has(i.base) ? "clothing" : "trinket" };
  } else if (i.kind === "ammo") {
    sys.type = { value: "ammo" };
    sys.quantity = i.quantity ?? 10;
    sys.magicalBonus = i.bonus || null;
    sys.damage = { parts: i.damage.map((d) => [d.formula, d.type]) };
  } else if (i.kind === "potion" || i.kind === "scroll") {
    sys.type = { value: i.kind === "scroll" ? "scroll" : "potion" };
    sys.activation = { type: "action", cost: 1 };
    sys.actionType = "util";
    sys.target = { value: 1, type: "creature" };
    sys.uses = { value: 1, max: "1", per: "charges", autoDestroy: true, prompt: true };
  } else {
    sys.type = { value: i.base === "Rod" ? "rod" : "wand" };
    sys.uses = { autoDestroy: false };
  }

  if (i.power) {
    const p = i.power;
    sys.uses = p.single ? sys.uses : { ...sys.uses, value: p.charges, max: String(p.charges), per: "dawn", recovery: p.recharge, prompt: true };
    // Weapons keep their attack; everything else rolls the power itself.
    if (i.itemType !== "weapon") {
      sys.activation = { type: /bonus action/i.test(p.effect ?? "") ? "bonus" : "action", cost: 1 };
      sys.actionType = { blast: "save", bolt: "rsak", heal: "heal", utility: p.save ? "save" : "util" }[p.kind];
      if (p.save) sys.save = { ability: p.save.ability, dc: p.save.dc, scaling: "flat" };
      sys.damage = { parts: p.damage ? [[p.damage.formula, p.damage.type]] : [] };
      const t = target(p.area);
      if (t) {
        sys.target = t;
        sys.range = { value: null, units: "self" };
      } else if (p.kind === "bolt") {
        sys.target = { value: 1, type: "creature" };
        sys.range = { value: p.range ?? 120, units: "ft" };
      } else if (p.kind === "heal") {
        sys.target = { value: 1, type: "creature" };
        sys.range = { value: null, units: "touch" };
      }
    }
  }

  const MODES = CONST.ACTIVE_EFFECT_MODES;
  data.effects = [
    ...(data.effects ?? []),
    ...i.effects.map((e) => ({
      name: `${i.name}: ${e.label}`,
      img: data.img,
      // Worn items grant their effects; potions apply theirs to the drinker from the chat card.
      transfer: i.kind !== "potion",
      disabled: false,
      ...(i.kind === "potion" ? { duration: { seconds: seconds(i.duration) } } : {}),
      changes: [{ key: e.key, mode: e.mode === "add" ? MODES.ADD : e.mode === "upgrade" ? MODES.UPGRADE : MODES.OVERRIDE, value: e.value }],
    })),
  ];
  return data;
}

/** Create the item in the world (Items sidebar, DnD Toolkit folder). */
export async function createForgedItem(i: ForgedItem, { render = true } = {}) {
  const data = await forgedItemData(i);
  const item = await Item.create({ ...data, folder: await ensureFolder("Item") });
  if (render) item?.sheet?.render(true);
  return item;
}

/** Put the item straight into an actor's inventory. */
export async function giveForgedItems(items: ForgedItem[], actor: any) {
  const data = await Promise.all(items.map(forgedItemData));
  await actor.createEmbeddedDocuments("Item", data);
  ui.notifications.info(`Gave ${items.length === 1 ? items[0]!.name : `${items.length} items`} to ${actor.name}.`);
}

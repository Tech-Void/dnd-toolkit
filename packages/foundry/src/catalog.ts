import {
  deriveRoles,
  normalizeTag,
  parseCr,
  plainText,
  SRD_MONSTERS,
  type MagicItemPool,
  type MagicItemRef,
  type MonsterEntry,
  type Rarity,
  type Role,
  type StatSummary,
} from "@dnd-toolkit/core";
import { MODULE_ID } from "./util.ts";

export type CatalogSource = "compendium" | "srd";

const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SRD_BY_NAME = new Map(SRD_MONSTERS.map((m) => [normalizeName(m.name), m]));

const INDEX_FIELDS = ["system.details.cr", "system.details.type", "system.details.environment"];

/** Variants that duplicate a real monster and only make sense when summoned by a spellcaster. */
const SKIP_NAMES = /\(summoner(?: variant)?\)/i;

const LEADER_WORDS = /\b(captain|chief|chieftain|warlord|lord|king|queen|boss|commander|general|leader|high priest|matriarch|patriarch)\b/i;
const CASTER_WORDS = /\b(mage|priest|shaman|warlock|wizard|sorcerer|cleric|druid|necromancer|witch|archmage|adept|cultist)\b/i;

/** Last-resort roles from the name alone, for creatures whose statblock hasn't been analyzed. */
function inferRoles(name: string, cr: number): Role[] {
  const roles: Role[] = [];
  if (LEADER_WORDS.test(name)) roles.push("leader");
  if (CASTER_WORDS.test(name)) roles.push("caster");
  if (cr <= 0.125) roles.push("minion");
  if (!roles.length) roles.push(cr >= 10 ? "solo" : "brute");
  return roles;
}

const words = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .split(/[,;()/]+|\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

export interface RawMonster {
  name: string;
  uuid: string;
  img?: string;
  cr: unknown;
  type: unknown;
  environment: unknown;
  source: string;
  /** Roles derived from the full statblock, when analyzed. */
  roles?: Role[];
}

export function toEntry(raw: RawMonster): MonsterEntry | null {
  if (raw.cr === null || raw.cr === undefined || raw.cr === "" || SKIP_NAMES.test(raw.name)) return null;
  const cr = typeof raw.cr === "number" ? raw.cr : parseCr(String(raw.cr));
  if (!Number.isFinite(cr)) return null;

  // dnd5e stores type as { value, subtype, swarm, custom }; older data may be a string.
  const typeData: any = raw.type;
  const type = String((typeof typeData === "object" ? typeData?.value || typeData?.custom : typeData) ?? "").toLowerCase();
  const subtype = typeof typeData === "object" ? String(typeData?.subtype ?? "") : "";

  const tags = new Set<string>();
  if (/any\s*race/i.test(subtype)) tags.add("anyrace");
  else for (const w of words(subtype)) tags.add(normalizeTag(w));
  if (typeData?.swarm) tags.add("swarm");
  for (const w of words(raw.environment)) tags.add(normalizeTag(w));

  const srd = SRD_BY_NAME.get(normalizeName(raw.name));
  for (const t of srd?.tags ?? []) tags.add(t);

  return {
    id: raw.uuid,
    uuid: raw.uuid,
    name: raw.name,
    cr,
    type: type || srd?.type || "unknown",
    tags: [...tags].filter(Boolean),
    // Hand-curated roles win, then roles read from the statblock, then a guess from the name.
    roles: srd?.roles ?? raw.roles ?? inferRoles(raw.name, cr),
    img: raw.img,
    source: raw.source,
  };
}

// ---------------------------------------------------------------------------
// Statblock analysis (cached in a world setting so it only runs once per monster)

/** Bump when deriveRoles changes so cached roles are recomputed. */
const ROLE_CACHE_VERSION = 1;

interface RoleCache {
  v: number;
  roles: Record<string, Role[]>;
}

export function summarizeActor(actor: any): StatSummary {
  const sys = actor.system ?? {};
  const items = [...(actor.items ?? [])];
  const nonSpells = items.filter((i: any) => i.type !== "spell");
  const actionType = (i: any) => i.system?.actionType;
  return {
    name: actor.name,
    cr: Number(sys.details?.cr) || 0,
    hp: Number(sys.attributes?.hp?.max) || 0,
    legendary: (Number(sys.resources?.legact?.max) || 0) > 0,
    spellLevel: Number(sys.details?.spellLevel) || 0,
    spellCount: items.length - nonSpells.length,
    meleeAttacks: items.filter((i: any) => ["mwak", "msak"].includes(actionType(i))).length,
    rangedAttacks: items.filter((i: any) => ["rwak", "rsak"].includes(actionType(i))).length,
    walk: Number(sys.attributes?.movement?.walk) || 0,
    fly: Number(sys.attributes?.movement?.fly) || 0,
    features: nonSpells.map((i: any) => i.name),
    text: nonSpells.map((i: any) => plainText(i.system?.description?.value ?? "")).join(" "),
  };
}

function loadRoleCache(): RoleCache {
  const stored = game.settings.get(MODULE_ID, "roleCache") as RoleCache | undefined;
  return stored?.v === ROLE_CACHE_VERSION ? { v: stored.v, roles: { ...stored.roles } } : { v: ROLE_CACHE_VERSION, roles: {} };
}

/** Load and analyze the statblocks we haven't seen yet. Returns true if anything was added. */
async function analyzeMissing(pack: any, ids: string[], cache: RoleCache): Promise<boolean> {
  if (!ids.length) return false;
  const note = ui.notifications.info(`DnD Toolkit: analyzing ${ids.length} statblocks in ${pack.metadata.label} (one-time)…`, { permanent: true });
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const docs = await pack.getDocuments({ _id__in: ids.slice(i, i + 100) });
      for (const doc of docs) cache.roles[doc.uuid] = deriveRoles(summarizeActor(doc));
    }
  } finally {
    ui.notifications.remove?.(note);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Monster catalog

let cache: Promise<MonsterEntry[]> | null = null;

/** Every NPC in the world and in Actor compendiums. Duplicate names: world > world packs > modules > system. */
async function buildCompendiumCatalog(): Promise<MonsterEntry[]> {
  const out: MonsterEntry[] = [];
  const seen = new Set<string>();
  const add = (e: MonsterEntry | null) => {
    if (!e || seen.has(normalizeName(e.name))) return;
    seen.add(normalizeName(e.name));
    out.push(e);
  };

  for (const a of game.actors) {
    if (a.type !== "npc") continue;
    const d = a.system?.details ?? {};
    add(toEntry({ name: a.name, uuid: a.uuid, img: a.img, cr: d.cr, type: d.type, environment: d.environment, source: "World", roles: deriveRoles(summarizeActor(a)) }));
  }

  const roleCache = loadRoleCache();
  let cacheChanged = false;
  const rank: Record<string, number> = { world: 0, module: 1, system: 2 };
  const packs = [...game.packs]
    .filter((p: any) => p.documentName === "Actor")
    .sort((a: any, b: any) => (rank[a.metadata.packageType] ?? 1) - (rank[b.metadata.packageType] ?? 1));

  for (const pack of packs) {
    const index = [...(await pack.getIndex({ fields: INDEX_FIELDS }))].filter((e: any) => (!e.type || e.type === "npc") && !SKIP_NAMES.test(e.name));
    const uuidOf = (e: any) => e.uuid ?? `Compendium.${pack.collection}.Actor.${e._id}`;
    // Only the GM can save the cache, so only the GM pays for the analysis.
    if (game.user.isGM) {
      const missing = index.filter((e: any) => !roleCache.roles[uuidOf(e)] && !SRD_BY_NAME.has(normalizeName(e.name)));
      try {
        if (await analyzeMissing(pack, missing.map((e: any) => e._id), roleCache)) cacheChanged = true;
      } catch (err) {
        console.warn(`${MODULE_ID} | couldn't analyze ${pack.collection}`, err);
      }
    }
    for (const e of index) {
      const get = (path: string) => foundry.utils.getProperty(e, path);
      add(toEntry({
        name: e.name,
        uuid: uuidOf(e),
        img: e.img,
        cr: get("system.details.cr"),
        type: get("system.details.type"),
        environment: get("system.details.environment"),
        source: pack.metadata.label,
        roles: roleCache.roles[uuidOf(e)],
      }));
    }
  }

  if (cacheChanged) await game.settings.set(MODULE_ID, "roleCache", roleCache);
  return out;
}

export function getCatalog(source: CatalogSource): Promise<MonsterEntry[]> {
  if (source === "srd") return Promise.resolve(SRD_MONSTERS);
  cache ??= buildCompendiumCatalog().catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

export function resetCatalog() {
  cache = null;
  itemCache = null;
}

/** Forget analyzed roles so every statblock is re-read on the next catalog build. */
export async function reanalyzeMonsters() {
  await game.settings.set(MODULE_ID, "roleCache", { v: ROLE_CACHE_VERSION, roles: {} });
  resetCatalog();
  return getCatalog("compendium");
}

/** Find the compendium/world version of a monster by name (for SRD entries that have no UUID). */
export async function findByName(name: string): Promise<MonsterEntry | undefined> {
  const key = normalizeName(name);
  return (await getCatalog("compendium")).find((m) => normalizeName(m.name) === key);
}

// ---------------------------------------------------------------------------
// Magic items for treasure

const RARITY: Record<string, Rarity> = { common: "common", uncommon: "uncommon", rare: "rare", veryRare: "very rare", "very rare": "very rare", legendary: "legendary" };
const TO_GP: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/**
 * Family key so variants count once: "Armor of Acid Resistance, Scale Mail" → "armor of resistance",
 * "Greataxe, +3" → "weapon +3", "Dragon Scale Mail (Black)" → "dragon scale mail".
 */
export function itemFamily(name: string, type: string): string {
  const plus = /,?\s*\+(\d)\b/.exec(name);
  if (plus && /^[^,]+,\s*\+\d$/.test(name.trim())) {
    const kind = type === "weapon" ? "weapon" : type === "equipment" ? "armor" : "ammunition";
    return `${kind} +${plus[1]}`;
  }
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .split(",")[0]!
    .replace(/\bof (acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder) resistance\b/i, "of resistance")
    .toLowerCase()
    .trim();
}

let itemCache: Promise<MagicItemPool> | null = null;

async function buildMagicItemPool(): Promise<MagicItemPool> {
  const pool: MagicItemPool = {};
  const seen = new Set<string>();
  const rank: Record<string, number> = { world: 0, module: 1, system: 2 };
  const packs = [...game.packs]
    .filter((p: any) => p.documentName === "Item")
    .sort((a: any, b: any) => (rank[a.metadata.packageType] ?? 1) - (rank[b.metadata.packageType] ?? 1));
  for (const pack of packs) {
    for (const e of await pack.getIndex({ fields: ["system.rarity", "system.price"] })) {
      const rarity = RARITY[foundry.utils.getProperty(e, "system.rarity") ?? ""];
      if (!rarity || e.type === "spell" || seen.has(normalizeName(e.name))) continue;
      seen.add(normalizeName(e.name));
      const price = foundry.utils.getProperty(e, "system.price");
      const ref: MagicItemRef = {
        name: e.name,
        rarity,
        uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`,
        valueGp: price?.value ? Math.round(price.value * (TO_GP[price.denomination] ?? 1)) : undefined,
        base: itemFamily(e.name, e.type),
      };
      (pool[rarity] ??= []).push(ref);
    }
  }
  return pool;
}

/** Magic items from the user's Item compendiums; empty for the built-in source. */
export function getMagicItems(source: CatalogSource): Promise<MagicItemPool | undefined> {
  if (source === "srd") return Promise.resolve(undefined);
  itemCache ??= buildMagicItemPool().catch((err) => {
    itemCache = null;
    throw err;
  });
  return itemCache;
}

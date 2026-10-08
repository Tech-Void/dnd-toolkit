import { createRng, type Rng } from "./rng.ts";
import { generateNpc, type Npc } from "./npc.ts";
import { composeHookText, type PlotHook } from "./hooks.ts";
import type { SideQuest } from "./sidequest.ts";
import type { Town } from "./settlement.ts";

// ---------------------------------------------------------------------------
// Campaign memory: the factions, people, places and quests of the world, and how the party stands
// with each. Generators can draw on it (the patron is someone the party already knows; the villain
// works for a faction they've crossed) and everything that happens leaves a line in the log.

/** -3 hostile … 0 neutral … +3 devoted. */
export const STANDING_LABELS: Record<string, string> = { "-3": "hostile", "-2": "unfriendly", "-1": "wary", "0": "neutral", "1": "friendly", "2": "allied", "3": "devoted" };
export const standingLabel = (n: number) => STANDING_LABELS[String(Math.max(-3, Math.min(3, Math.round(n))))]!;

export type FactionKind = "bandits" | "noble house" | "order" | "guild" | "cult" | "merchants" | "tribe" | "thieves" | "church" | "rebels";

export interface CampaignFaction {
  id: string;
  name: string;
  kind: FactionKind | string;
  goal: string;
  /** NPC id of the leader. */
  leaderId?: string;
  /** Place id of their base. */
  baseId?: string;
  standing: number;
  /** Monster tags for their soldiers, e.g. "humanoid+bandit". */
  tags?: string;
  /** Faction ids they're at odds with. */
  rivals: string[];
  notes: string;
  history: { day: number; text: string }[];
}

export interface CampaignNpc {
  id: string;
  name: string;
  race: string;
  occupation: string;
  look: string;
  personality: string;
  voice: string;
  motive: string;
  secret: string;
  factionId?: string;
  placeId?: string;
  /** How they feel about the party, -3..+3. */
  attitude: number;
  /** Every time the party has dealt with them. */
  met: { day: number; text: string }[];
  /** The Foundry actor, once made. */
  actorId?: string;
  alive: boolean;
  notes: string;
  /** The full generated NPC, for rebuilding an actor. */
  npc?: Npc;
}

export type PlaceKind = "settlement" | "dungeon" | "lair" | "landmark" | "inn" | "shop" | "temple";

export interface CampaignPlace {
  id: string;
  name: string;
  kind: PlaceKind | string;
  notes: string;
  factionIds: string[];
  /** Foundry scene and journal, when made. */
  sceneId?: string;
  journalId?: string;
  discovered: number;
}

export type QuestStatus = "active" | "done" | "failed";

export interface CampaignQuest {
  id: string;
  title: string;
  /** What the players were asked to do, in a sentence. */
  summary: string;
  giverId?: string;
  factionId?: string;
  status: QuestStatus;
  steps: { text: string; done: boolean }[];
  reward: string;
  /** GM only. */
  notes: string;
  started: number;
  ended?: number;
}

export interface CampaignLogEntry {
  day: number;
  text: string;
  kind: "faction" | "npc" | "place" | "quest" | "note";
}

export interface CampaignState {
  factions: CampaignFaction[];
  npcs: CampaignNpc[];
  places: CampaignPlace[];
  quests: CampaignQuest[];
  log: CampaignLogEntry[];
}

export const emptyCampaign = (): CampaignState => ({ factions: [], npcs: [], places: [], quests: [], log: [] });

const newId = (rng: Rng) => rng.int(0, 36 ** 8).toString(36).padStart(8, "0");

// --- Factions --------------------------------------------------------------------------

const FACTION_NAMES: Record<FactionKind, [string[], string[]]> = {
  bandits: [["The Crow Knives", "The Red Hand", "The Ashen Wolves", "Gallows Kin", "The Mudrats", "The Iron Jackals"], ["humanoid+bandit"]],
  "noble house": [["House Varlen", "House Ashdown", "House Merrow", "House Thorne", "House Caldris", "House Vane"], ["humanoid+noble"]],
  order: [["Order of the Silver Dawn", "The Grey Wardens", "Knights of the Ember Rose", "The Oathbound", "The Lantern Watch"], ["humanoid+knight"]],
  guild: [["The Lantern Guild", "The Copper Scales", "The Mason's Circle", "The Guild of Quills", "The Smiths' Hall"], ["humanoid"]],
  cult: [["Cult of the Drowned God", "The Hollow Choir", "The Children of Ash", "The Seventh Seal", "The Pale Brethren"], ["humanoid+cultist", "fiend", "undead"]],
  merchants: [["Brightwater Trading Company", "The Salt Road Consortium", "Varrow & Sons", "The Gilded Barge Company"], ["humanoid"]],
  tribe: [["The Ashfen Clans", "The Bone-Hill Tribe", "The Thunder Riders", "Clan Stonehoof"], ["humanoid+orc", "humanoid+gnoll", "giant"]],
  thieves: [["The Quiet Hand", "The Gutter Court", "The Velvet Knives", "The Nightjar Society"], ["humanoid+thief"]],
  church: [["The Temple of the Dawn", "The Harvest Church", "The Sisters of Mercy", "The Vigilant Eye"], ["humanoid+priest"]],
  rebels: [["The Free Banner", "The Broken Chain", "The Green Hoods", "The Ninth of Spring"], ["humanoid"]],
};

const FACTION_GOALS: Record<FactionKind, string[]> = {
  bandits: ["control the trade road and tax every wagon on it", "find the treasure their old captain buried", "take revenge on the town that hanged their leader"],
  "noble house": ["marry into the royal line", "recover lands lost a generation ago", "ruin a rival house without getting their hands dirty"],
  order: ["destroy an evil they sealed away a century ago", "recover a holy relic stolen from their chapel", "rebuild the order from its last few knights"],
  guild: ["corner the market on a rare material", "get a seat on the town council", "find out who's been murdering their members"],
  cult: ["wake something sleeping beneath the lake", "gather the pieces of a broken idol", "turn a town's leaders, one by one"],
  merchants: ["open a new trade route through dangerous country", "buy out every competitor in the region", "smuggle something they won't talk about"],
  tribe: ["take back their ancestral hunting grounds", "prove themselves to a new war-chief", "survive a hard winter by any means"],
  thieves: ["pull off the heist of the decade", "eliminate a rival gang", "own the city watch"],
  church: ["root out heresy in their own ranks", "build a great cathedral", "convert the frontier towns"],
  rebels: ["overthrow a tyrant lord", "free prisoners from a labor camp", "smuggle weapons to the villages"],
};

export const FACTION_KINDS = Object.keys(FACTION_NAMES) as FactionKind[];

export interface FactionOptions {
  kind?: FactionKind | "random";
  /** Names already in use (skipped). */
  taken?: string[];
  seed?: string | number;
}

/** A new faction with a leader. */
export function generateFaction(o: FactionOptions = {}): { faction: CampaignFaction; leader: CampaignNpc } {
  const rng = createRng(o.seed);
  const kind = !o.kind || o.kind === "random" ? rng.pick(FACTION_KINDS) : o.kind;
  const [names, tags] = FACTION_NAMES[kind];
  const name = rng.shuffle(names).find((n) => !o.taken?.includes(n)) ?? `${rng.pick(names)} ${rng.pick(["Remnant", "of the North", "Reborn"])}`;
  const role = kind === "church" || kind === "cult" ? "priest" : kind === "noble house" ? "noble" : kind === "order" ? "soldier" : kind === "merchants" || kind === "guild" ? "merchant" : kind === "thieves" || kind === "bandits" ? "criminal" : "commoner";
  const leader = npcRecord(generateNpc({ role, seed: `${rng.seed}:leader` }), 0);
  const faction: CampaignFaction = {
    id: newId(rng), name, kind, goal: rng.pick(FACTION_GOALS[kind]), leaderId: leader.id, standing: 0, tags: rng.pick(tags), rivals: [], notes: "", history: [],
  };
  leader.factionId = faction.id;
  leader.occupation = `leader of ${name}`;
  return { faction, leader };
}

// --- People ---------------------------------------------------------------------------------

/** A campaign record for a generated NPC. */
export function npcRecord(n: Npc, day: number, extra: Partial<CampaignNpc> = {}): CampaignNpc {
  return {
    id: createRng(`${n.seed}:${n.name}`).int(0, 36 ** 8).toString(36).padStart(8, "0"), name: n.name, race: n.race, occupation: n.occupation, look: n.look,
    personality: n.personality, voice: n.voice, motive: n.motive, secret: n.secret, attitude: 0, met: day ? [{ day, text: "First met." }] : [], alive: true, notes: "", npc: n, ...extra,
  };
}

/** What the party remembers about someone, for the GM before a scene. */
export function npcMemory(c: CampaignState, id: string): string {
  const n = c.npcs.find((x) => x.id === id);
  if (!n) return "";
  const f = c.factions.find((x) => x.id === n.factionId);
  const p = c.places.find((x) => x.id === n.placeId);
  const last = n.met.at(-1);
  return `${n.name}, ${n.occupation}${f ? ` (${f.name})` : ""}${p ? ` in ${p.name}` : ""}. ${standingLabel(n.attitude)} toward the party. ${n.personality}; wants to ${n.motive}.` +
    (last ? ` Last seen day ${last.day}: ${last.text}` : " They haven't met yet.");
}

// --- Changes (pure: they return a new state) --------------------------------------------------

const clone = (c: CampaignState): CampaignState => structuredClone(c);

export function addLog(c: CampaignState, day: number, kind: CampaignLogEntry["kind"], text: string): CampaignState {
  const s = clone(c);
  s.log.push({ day, kind, text });
  return s;
}

/** Shift a faction's standing (clamped to -3..+3) and remember why. */
export function adjustStanding(c: CampaignState, factionId: string, delta: number, reason: string, day: number): CampaignState {
  const s = clone(c);
  const f = s.factions.find((x) => x.id === factionId);
  if (!f) return s;
  const before = f.standing;
  f.standing = Math.max(-3, Math.min(3, f.standing + delta));
  const text = `${f.name}: ${standingLabel(before)} → ${standingLabel(f.standing)}${reason ? ` (${reason})` : ""}`;
  f.history.push({ day, text });
  s.log.push({ day, kind: "faction", text });
  // Their rivals notice: helping one costs a little with the other.
  if (delta > 0) for (const r of f.rivals) {
    const rival = s.factions.find((x) => x.id === r);
    if (rival && rival.standing > -3) {
      rival.standing -= 1;
      rival.history.push({ day, text: `Resents the party helping ${f.name}.` });
    }
  }
  return s;
}

export function adjustAttitude(c: CampaignState, npcId: string, delta: number, reason: string, day: number): CampaignState {
  const s = clone(c);
  const n = s.npcs.find((x) => x.id === npcId);
  if (!n) return s;
  n.attitude = Math.max(-3, Math.min(3, n.attitude + delta));
  n.met.push({ day, text: `${delta > 0 ? "Warmed to" : "Soured on"} the party${reason ? `: ${reason}` : ""}.` });
  return s;
}

/** The party meets someone again. */
export function meetAgain(c: CampaignState, npcId: string, text: string, day: number): CampaignState {
  const s = clone(c);
  const n = s.npcs.find((x) => x.id === npcId);
  if (!n) return s;
  n.met.push({ day, text: text || "Met again." });
  s.log.push({ day, kind: "npc", text: `Met ${n.name}${text ? `: ${text}` : "."}` });
  return s;
}

/** Add things, skipping any already known by name. */
export function register(c: CampaignState, add: Partial<CampaignState>, day: number): CampaignState {
  const s = clone(c);
  const known = <T extends { name?: string; title?: string }>(list: T[], x: T) => list.some((y) => (y.name ?? y.title) === (x.name ?? x.title));
  for (const f of add.factions ?? []) if (!known(s.factions, f)) {
    s.factions.push(f);
    s.log.push({ day, kind: "faction", text: `Learned of ${f.name}.` });
  }
  for (const n of add.npcs ?? []) if (!known(s.npcs, n)) s.npcs.push(n);
  for (const p of add.places ?? []) if (!known(s.places, p)) {
    s.places.push(p);
    s.log.push({ day, kind: "place", text: `Came to ${p.name}.` });
  }
  for (const q of add.quests ?? []) if (!known(s.quests, q)) {
    s.quests.push(q);
    s.log.push({ day, kind: "quest", text: `Took on: ${q.title}.` });
  }
  return s;
}

export function setQuestStatus(c: CampaignState, questId: string, status: QuestStatus, day: number): CampaignState {
  const s = clone(c);
  const q = s.quests.find((x) => x.id === questId);
  if (!q || q.status === status) return s;
  q.status = status;
  q.ended = status === "active" ? undefined : day;
  s.log.push({ day, kind: "quest", text: `${q.title}: ${status === "done" ? "completed" : status === "failed" ? "failed" : "taken up again"}.` });
  return s;
}

// --- From the generators ----------------------------------------------------------------------

/** A settlement: the place, its leader, notables, innkeeper, priest and factions. */
export function fromTown(t: Town, day: number): Partial<CampaignState> {
  const rng = createRng(`${t.seed}:campaign`);
  const place: CampaignPlace = { id: newId(rng), name: t.name, kind: "settlement", notes: t.description.join(" "), factionIds: [], discovered: day };
  const npcs: CampaignNpc[] = [
    npcRecord(t.leader, 0, { placeId: place.id, occupation: `${t.leader.occupation} (${t.government})` }),
    npcRecord(t.inn.keeper, 0, { placeId: place.id, occupation: `keeper of ${t.inn.name}` }),
    npcRecord(t.temple.priest, 0, { placeId: place.id, occupation: `priest of ${t.temple.deity}` }),
    ...t.notables.map((n) => npcRecord(n, 0, { placeId: place.id })),
  ];
  const factions: CampaignFaction[] = t.factions.map((f) => {
    const leader = npcRecord(f.leader, 0, { placeId: place.id });
    const faction: CampaignFaction = { id: newId(rng), name: f.name, kind: "local", goal: f.goal, leaderId: leader.id, baseId: place.id, standing: 0, rivals: [], notes: "", history: [] };
    leader.factionId = faction.id;
    npcs.push(leader);
    return faction;
  });
  place.factionIds = factions.map((f) => f.id);
  return { places: [place], npcs, factions };
}

/** A quest record from a side quest's missions. */
export function questFromSideQuest(q: SideQuest, day: number, giverId?: string, factionId?: string): CampaignQuest {
  return {
    id: createRng(`${q.seed}:quest`).int(0, 36 ** 8).toString(36), title: q.title, summary: q.hook.text, giverId, factionId, status: "active",
    steps: q.missions.map((m) => ({ text: `${m.title}: ${m.objective}`, done: false })), reward: `${q.hook.rewardGp} gp and ${q.hook.bonusReward}`,
    notes: `Villain: ${q.villainName}. Prize: ${q.macguffin}. Lair: ${q.lair}. Twist: ${q.hook.twist}`, started: day,
  };
}

export function questFromHook(h: PlotHook, day: number, giverId?: string): CampaignQuest {
  return {
    id: createRng(`${h.seed}:quest`).int(0, 36 ** 8).toString(36), title: h.title || "A job", summary: h.text, giverId, status: "active",
    steps: [{ text: h.goal, done: false }], reward: `${h.rewardGp} gp and ${h.bonusReward}`, notes: `Villain: ${h.villain}. Twist: ${h.twist}`, started: day,
  };
}

export interface BindOptions {
  /** Prefer an existing villainous faction for the villain (else one is made). */
  useFactions?: boolean;
  /** Use people the party already knows as contacts and patron. */
  usePeople?: boolean;
  seed?: string | number;
}

/**
 * Tie a side quest into the campaign: the villain works for a faction the party has crossed (or a
 * new one), the patron and contacts are people they already know where that fits, and the quest
 * goes into the log. Returns the quest (rewritten) and what to register.
 */
export function bindSideQuest(c: CampaignState, q: SideQuest, day: number, o: BindOptions = {}): { quest: SideQuest; add: Partial<CampaignState>; record: CampaignQuest } {
  const rng = createRng(o.seed ?? `${q.seed}:bind`);
  const quest: SideQuest = structuredClone(q);
  const add: Partial<CampaignState> = { factions: [], npcs: [] };
  // The villain's faction: someone the party is already on bad terms with, or new.
  let faction = o.useFactions !== false ? rng.shuffle(c.factions.filter((f) => f.standing <= -1)).at(0) : undefined;
  if (!faction) {
    const made = generateFaction({ kind: rng.pick(["bandits", "cult", "thieves", "tribe", "noble house"] as const), taken: c.factions.map((f) => f.name), seed: `${rng.seed}:faction` });
    made.leader.name = quest.villainName.split(",")[0]!.trim() || made.leader.name;
    made.faction.standing = -1;
    made.faction.goal = `${made.faction.goal}, and ${quest.macguffin} is part of it`;
    faction = made.faction;
    add.factions!.push(made.faction);
    add.npcs!.push(made.leader);
  } else {
    const leader = c.npcs.find((n) => n.id === faction!.leaderId);
    if (leader) {
      quest.villainName = `${leader.name}, leader of ${faction.name}`;
      quest.hook = { ...quest.hook, villain: quest.villainName };
    }
  }
  // Contacts the party knows, where there are friendly faces.
  const friends = rng.shuffle(c.npcs.filter((n) => n.alive && n.attitude >= 0 && !n.factionId));
  let giverId: string | undefined;
  if (o.usePeople !== false && friends.length) {
    const patron = friends[0]!;
    giverId = patron.id;
    quest.hook = { ...quest.hook, patron: `${patron.name}, ${patron.occupation}` };
    quest.hook.text = composeHookText(quest.hook);
    quest.missions.forEach((m, i) => {
      const friend = friends[i + 1];
      if (m.npc && friend?.npc && rng.chance(0.5)) m.npc = friend.npc;
    });
  }
  for (const m of quest.missions) if (m.npc && !c.npcs.some((n) => n.name === m.npc!.name)) add.npcs!.push(npcRecord(m.npc, 0));
  const record = questFromSideQuest(quest, day, giverId, faction.id);
  return { quest, add, record };
}

/** Pick someone the party knows for a role, if there is anyone (patrons are friends, villains enemies). */
export function knownFor(c: CampaignState, want: "friend" | "enemy", seed?: string | number): CampaignNpc | undefined {
  const rng = createRng(seed);
  const pool = c.npcs.filter((n) => n.alive && (want === "friend" ? n.attitude >= 1 : n.attitude <= -1 || (c.factions.find((f) => f.id === n.factionId)?.standing ?? 0) <= -1));
  return pool.length ? rng.pick(pool) : undefined;
}

/** A hook that uses the world: the patron is someone the party likes, the villain someone they've crossed. */
export function bindHook(c: CampaignState, h: PlotHook, seed?: string | number): PlotHook {
  const friend = knownFor(c, "friend", `${seed}:p`);
  const enemy = knownFor(c, "enemy", `${seed}:v`);
  const hook = { ...h };
  if (friend) hook.patron = `${friend.name}, ${friend.occupation}`;
  if (enemy) hook.villain = `${enemy.name}${enemy.factionId ? `, of ${c.factions.find((f) => f.id === enemy.factionId)?.name}` : ""}`;
  hook.text = composeHookText(hook);
  return hook;
}

/** The quest log the players see: active and finished quests, no GM notes. */
export function playerQuestLog(c: CampaignState): { active: CampaignQuest[]; done: CampaignQuest[] } {
  return { active: c.quests.filter((q) => q.status === "active"), done: c.quests.filter((q) => q.status !== "active") };
}

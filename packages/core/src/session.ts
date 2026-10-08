import { createRng, type Rng } from "./rng.ts";
import { standingLabel, type CampaignFaction, type CampaignNpc, type CampaignPlace, type CampaignQuest, type CampaignState } from "./campaign.ts";
import { rollWeather, TERRAINS, type Climate, type Season, type Terrain, type Weather } from "./travel.ts";
import type { Difficulty } from "./encounter.ts";

// ---------------------------------------------------------------------------
// Session prep: one page for the GM before the next game, drawn from the campaign. Where the
// quests stand and what's next, what the factions do while the party isn't looking, who's due to
// turn up again, the road or dungeon ahead, fights ready to drop in, rumors (some false), a loot
// bundle and the weather. Every part has a seed so it can be rerolled on its own.

export interface PrepQuest {
  id: string;
  title: string;
  next: string;
  giver?: string;
  faction?: string;
  /** Steps done / total. */
  progress: [number, number];
}

export interface PrepFactionMove {
  factionId: string;
  name: string;
  standing: string;
  move: string;
}

export interface PrepNpc {
  npcId: string;
  name: string;
  attitude: number;
  why: string;
  lastSeen?: number;
}

export interface PrepEncounter {
  why: string;
  tags: string;
  difficulty: Difficulty;
  seed: string;
}

export interface PrepRumor {
  text: string;
  true: boolean;
}

export interface SessionPrep {
  seed: string;
  day: number;
  quests: PrepQuest[];
  factions: PrepFactionMove[];
  npcs: PrepNpc[];
  ahead: string[];
  encounters: PrepEncounter[];
  rumors: PrepRumor[];
  weather: Weather;
  /** Challenge rating to roll the loot bundle at. */
  lootCr: number;
  /** What happened since the last prep, from the log. */
  recap: string[];
}

export interface PrepOptions {
  day: number;
  partyLevel: number;
  climate?: Climate;
  season?: Season;
  /** Where they're headed, if known. */
  destination?: { name: string; terrain?: Terrain; days?: number; kind?: string };
  /** Log entries after this day go in the recap. */
  since?: number;
  seed?: string | number;
}

const MOVES = {
  hostile: [
    "sends {n} after the party: an ambush on the road, or thugs at the inn",
    "puts a price on the party's heads; the next stranger who's too friendly might be collecting",
    "hits something the party cares about (a friend, a patron, their rooms) to send a message",
    "spreads lies about the party; prices go up and doors close in town",
  ],
  unfriendly: [
    "has someone watching the party and reporting back",
    "quietly works against the party's current quest: a witness vanishes, a door is locked",
    "tries to buy off someone the party trusts",
  ],
  neutral: [
    "makes a move toward their goal ({goal}), and it ripples outward",
    "loses something important and starts hiring to get it back",
    "picks a fight with a rival ({rival}); people are caught in the middle",
    "recruits openly in town; their numbers are growing",
  ],
  friendly: [
    "sends word of a danger the party hasn't seen yet",
    "asks the party for a favor, and offers a fair price",
    "has trouble of their own and could use a hand ({goal})",
  ],
  allied: [
    "offers help: a safe house, a guide, or a few soldiers for one job",
    "passes on a secret about the party's enemies",
    "needs the party urgently: their rivals ({rival}) are moving on them",
  ],
};

const NPC_REASONS = {
  friend: ["turns up with news (and a favor to ask)", "needs help: someone's leaning on them", "has found something the party was looking for", "wants to celebrate the party's last success (loudly, in public)"],
  enemy: ["turns up where the party least expects, with friends", "has been telling stories about the party", "wants a word: a truce, or a trap", "is seen meeting someone the party trusts"],
  neutral: ["crosses paths with the party again by chance", "is in trouble the party could fix, for a price", "has heard something useful and will trade it"],
};

const RUMOR_FRAMES = ["They say {x}.", "A drunk swears {x}.", "Word from the road: {x}.", "The {who} whisper that {x}.", "A letter in the wrong hands says {x}."];
const WHO = ["guards", "fishwives", "stablehands", "priests", "barmaids", "merchants", "children", "beggars"];
const GENERIC_TRUE = ["a caravan went missing on the north road and nobody's looking", "the old well at the crossroads is dry because something is drinking it", "someone is buying up every silver item in town", "a hermit in the hills pays gold for strange bones"];
const GENERIC_FALSE = ["the baron's daughter is a vampire", "there's a dragon in the old mill", "the temple's gold is fake", "a talking cat runs the thieves' guild"];

const pick = <T>(rng: Rng, list: readonly T[]) => rng.pick(list);
const fill = (s: string, f: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => f[k] ?? k);

function questLine(c: CampaignState, q: CampaignQuest): PrepQuest {
  const step = q.steps.find((s) => !s.done);
  return {
    id: q.id,
    title: q.title,
    next: step ? step.text : "All steps done: wrap it up (reward, consequences).",
    giver: c.npcs.find((n) => n.id === q.giverId)?.name,
    faction: c.factions.find((f) => f.id === q.factionId)?.name,
    progress: [q.steps.filter((s) => s.done).length, q.steps.length],
  };
}

function factionMove(rng: Rng, c: CampaignState, f: CampaignFaction): PrepFactionMove {
  const label = standingLabel(f.standing);
  const pool = f.standing <= -3 ? MOVES.hostile : f.standing <= -1 ? MOVES.unfriendly : f.standing >= 2 ? MOVES.allied : f.standing >= 1 ? MOVES.friendly : MOVES.neutral;
  const rival = c.factions.find((x) => f.rivals.includes(x.id))?.name ?? "a rival";
  const leader = c.npcs.find((n) => n.id === f.leaderId);
  const move = fill(pick(rng, pool), { goal: f.goal, rival, n: leader ? `${leader.name}'s people` : "a few of their own" });
  return { factionId: f.id, name: f.name, standing: label, move: move[0]!.toUpperCase() + move.slice(1) + "." };
}

function lastSeen(n: CampaignNpc) {
  return n.met.length ? Math.max(...n.met.map((m) => m.day)) : undefined;
}

/** A page of prep for the next session. */
export function sessionPrep(c: CampaignState, o: PrepOptions): SessionPrep {
  const seed = String(o.seed ?? `prep:${o.day}`);
  const part = (name: string) => createRng(`${seed}:${name}`);

  // Quests: active first, the most recent last (they're fresh in everyone's mind).
  const active = c.quests.filter((q) => q.status === "active");
  const quests = active.map((q) => questLine(c, q));

  // Factions: those tied to active quests, then the ones with feelings about the party, then the rest.
  const questFactions = new Set(active.map((q) => q.factionId).filter(Boolean));
  const rf = part("factions");
  const ranked = rf.shuffle(c.factions).sort((a, b) => Number(questFactions.has(b.id)) - Number(questFactions.has(a.id)) || Math.abs(b.standing) - Math.abs(a.standing));
  const factions = ranked.slice(0, 3).map((f) => factionMove(rf, c, f));

  // NPCs due: alive, met before, not seen for the longest (or tied to an active quest).
  const rn = part("npcs");
  const questNpcs = new Set(active.map((q) => q.giverId).filter(Boolean));
  const npcs = c.npcs
    .filter((n) => n.alive && (n.met.length || questNpcs.has(n.id) || n.attitude !== 0))
    .sort((a, b) => Number(questNpcs.has(b.id)) - Number(questNpcs.has(a.id)) || (lastSeen(a) ?? -1) - (lastSeen(b) ?? -1))
    .slice(0, 3)
    .map((n): PrepNpc => ({
      npcId: n.id,
      name: n.name,
      attitude: n.attitude,
      lastSeen: lastSeen(n),
      why: pick(rn, n.attitude >= 1 ? NPC_REASONS.friend : n.attitude <= -1 ? NPC_REASONS.enemy : NPC_REASONS.neutral),
    }));

  // The road or dungeon ahead.
  const ahead: string[] = [];
  const dest = o.destination;
  if (dest) {
    const t = dest.terrain ? TERRAINS[dest.terrain] : undefined;
    ahead.push(`Heading to ${dest.name}${dest.days ? ` (${dest.days} day${dest.days === 1 ? "" : "s"}${t ? ` through ${t.label.toLowerCase()}` : ""})` : t ? ` through ${t.label.toLowerCase()}` : ""}.`);
    if (t?.navDc) ahead.push(`Navigation DC ${t.navDc}; foraging DC ${t.forageDc}.${t.difficult ? " Difficult terrain: half speed." : ""}`);
  }
  const unvisited = c.places.filter((p: CampaignPlace) => (p.kind === "dungeon" || p.kind === "lair") && !p.sceneId);
  for (const p of unvisited.slice(0, 2)) ahead.push(`${p.name} (${p.kind}) hasn't been mapped yet: generate it before the session if they might go there.`);
  if (!ahead.length) ahead.push("No destination set: have a town, a road and a dungeon ready in case they wander.");

  // Encounters: one from a hostile faction, one from the terrain ahead, one wildcard.
  const re = part("encounters");
  const level = o.partyLevel;
  const encounters: PrepEncounter[] = [];
  const enemy = c.factions.filter((f) => f.standing < 0 && f.tags).sort((a, b) => a.standing - b.standing)[0];
  if (enemy) encounters.push({ why: `${enemy.name} strike back`, tags: enemy.tags!, difficulty: enemy.standing <= -2 ? "high" : "moderate", seed: `${seed}:enc:faction` });
  if (dest?.terrain) encounters.push({ why: `On the way to ${dest.name}`, tags: TERRAINS[dest.terrain].tags, difficulty: re.pick(["low", "moderate"] as const), seed: `${seed}:enc:road` });
  encounters.push({ why: "A wildcard (for when they go somewhere unexpected)", tags: "", difficulty: re.pick(["moderate", "high"] as const), seed: `${seed}:enc:wild` });
  if (encounters.length < 3) encounters.splice(1, 0, { why: "Trouble in town", tags: "humanoid", difficulty: "low", seed: `${seed}:enc:town` });

  // Rumors: about the factions and places they know (mostly true), padded with generic ones (half false).
  const rr = part("rumors");
  const rumors: PrepRumor[] = [];
  for (const f of rr.shuffle(c.factions).slice(0, 2)) rumors.push({ text: fill(pick(rr, RUMOR_FRAMES), { x: `${f.name} want to ${f.goal}`, who: pick(rr, WHO) }), true: true });
  for (const p of rr.shuffle(c.places.filter((p) => p.kind === "dungeon" || p.kind === "lair" || p.kind === "landmark")).slice(0, 1)) {
    const lie = rr.chance(0.35);
    rumors.push({ text: fill(pick(rr, RUMOR_FRAMES), { x: lie ? `${p.name} is empty now, picked clean years ago` : `something has moved into ${p.name}`, who: pick(rr, WHO) }), true: !lie });
  }
  while (rumors.length < 4) {
    const t = rr.chance(0.5);
    const x = pick(rr, t ? GENERIC_TRUE : GENERIC_FALSE);
    if (rumors.some((r) => r.text.includes(x))) continue;
    rumors.push({ text: fill(pick(rr, RUMOR_FRAMES), { x, who: pick(rr, WHO) }), true: t });
  }

  const weather = rollWeather(o.climate ?? "temperate", o.season ?? "summer", `${seed}:weather`);
  const recap = c.log.filter((l) => l.day > (o.since ?? -1)).slice(-8).map((l) => `Day ${l.day}: ${l.text}`);
  return { seed, day: o.day, quests, factions, npcs, ahead, encounters, rumors: rr.shuffle(rumors), weather, lootCr: Math.max(1, Math.round(level * 0.75)), recap };
}

export type PrepPart = "factions" | "npcs" | "encounters" | "rumors" | "weather";

/** Reroll one part of the prep, keeping the rest. */
export function rerollPrep(c: CampaignState, prep: SessionPrep, o: PrepOptions, part: PrepPart, seed: string | number): SessionPrep {
  const fresh = sessionPrep(c, { ...o, seed: `${prep.seed}:${part}:${seed}` });
  return { ...prep, [part]: fresh[part] };
}

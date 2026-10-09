import { createRng } from "./rng.ts";

// ---------------------------------------------------------------------------
// Skill challenges (so many successes before three failures, nobody using the same skill twice
// running) and chases (a lead that grows or shrinks each round as everyone deals with whatever the
// street or the forest throws at them).

export interface ChallengeSkill {
  skill: string;
  dc: number;
  /** What using it looks like here. */
  note: string;
}

export interface ChallengeLine {
  who: string;
  text: string;
}

export interface SkillChallenge {
  kind: "skill";
  id: string;
  title: string;
  text: string;
  need: number;
  maxFail: number;
  successes: number;
  failures: number;
  skills: ChallengeSkill[];
  /** DC for a skill that isn't listed (a creative idea the GM allows). */
  otherDc: number;
  /** The skill each character used last (they can't repeat it straight away). */
  last: Record<string, string>;
  log: ChallengeLine[];
  ended?: "won" | "lost";
}

export type Complexity = "short" | "normal" | "long";

interface Template {
  title: string;
  text: string;
  skills: [skill: string, note: string, hard?: boolean][];
}

const TEMPLATES: Template[] = [
  { title: "The tunnel is coming down", text: "Rock groans overhead and dust pours from the cracks. Get everyone out before it collapses.", skills: [["ath", "shoulder aside fallen beams"], ["acr", "dart through the gaps"], ["prc", "spot the way the air is moving"], ["sur", "read which passage leads up"], ["inv", "see which supports will hold", true]] },
  { title: "Crossing the flood", text: "The river is up and the ford is gone. Get the party, the gear and the mounts across.", skills: [["ath", "swim a line across"], ["ani", "calm the horses"], ["sur", "find the shallowest crossing"], ["nat", "read the current"], ["slt", "rig the rope fast", true]] },
  { title: "Before the council", text: "The town elders will decide whether to help, and half of them already distrust outsiders.", skills: [["per", "make the case"], ["ins", "see who's wavering"], ["his", "cite the old treaty"], ["rel", "invoke the gods' favor"], ["dec", "overstate what the party can offer", true]] },
  { title: "Tracking the beast", text: "It went into the hills at dawn. Follow it before the trail goes cold.", skills: [["sur", "read the tracks"], ["prc", "spot broken branches and blood"], ["nat", "guess where it'll go to ground"], ["ath", "keep up the pace over rough ground"], ["ste", "close in without spooking it", true]] },
  { title: "Into the keep unseen", text: "Get past the gate, the yard and the guardroom without raising the alarm.", skills: [["ste", "move in the shadows"], ["dec", "bluff past a sentry"], ["slt", "lift a key"], ["prc", "time the patrols"], ["acr", "go over the wall", true]] },
  { title: "Stopping the ritual", text: "The circle is already glowing. Unpick the working before it finishes.", skills: [["arc", "disrupt the sigils"], ["rel", "counter the invocation"], ["inv", "find the anchor stone"], ["ath", "drag the brazier out of the circle"], ["his", "remember how this rite was broken before", true]] },
  { title: "The storm at sea", text: "The ship is taking water and the mast is cracking. Keep her afloat until the squall passes.", skills: [["ath", "man the pumps"], ["acr", "climb the rigging"], ["sur", "read the sea"], ["per", "rally the crew"], ["med", "tend the injured sailors", true]] },
  { title: "Lost in the city", text: "Find someone who doesn't want to be found, in a city that isn't yours.", skills: [["inv", "follow the paper trail"], ["per", "charm the gossips"], ["itm", "lean on an informant"], ["ins", "spot who's lying"], ["ste", "tail a lead", true]] },
];

const NEED: Record<Complexity, [number, number]> = { short: [4, 3], normal: [6, 3], long: [8, 3] };

export const challengeDc = (level: number, hard = false) => Math.min(25, 12 + Math.floor(level / 3) + (hard ? 3 : 0));

export function generateSkillChallenge(o: { level: number; complexity?: Complexity; seed?: string | number; id?: string }): SkillChallenge {
  const rng = createRng(o.seed);
  const t = rng.pick(TEMPLATES);
  const [need, maxFail] = NEED[o.complexity ?? "normal"];
  return {
    kind: "skill", id: o.id ?? rng.seed, title: t.title, text: t.text, need, maxFail, successes: 0, failures: 0,
    skills: t.skills.map(([skill, note, hard]) => ({ skill, note, dc: challengeDc(o.level, hard) })),
    otherDc: challengeDc(o.level) + 2, last: {}, log: [],
  };
}

/** One character tries a skill. The same skill twice in a row isn't allowed. */
export function skillAttempt(c0: SkillChallenge, who: string, skill: string, total: number): { challenge: SkillChallenge; text: string; ok?: boolean } {
  if (c0.ended) return { challenge: c0, text: "It's already over." };
  if (c0.last[who] === skill) return { challenge: c0, text: `${who} can't use the same skill twice in a row.` };
  const c: SkillChallenge = { ...c0, last: { ...c0.last, [who]: skill }, log: [...c0.log] };
  const listed = c.skills.find((s) => s.skill === skill);
  const dc = listed?.dc ?? c.otherDc;
  const ok = total >= dc;
  if (ok) c.successes += 1;
  else c.failures += 1;
  let text = `${who} ${listed ? `tries to ${listed.note}` : "tries something else"}: ${total} vs DC ${dc}, ${ok ? "success" : "failure"} (${c.successes}/${c.need}, ${c.failures}/${c.maxFail} failures).`;
  if (c.successes >= c.need) {
    c.ended = "won";
    text += " They pull it off!";
  } else if (c.failures >= c.maxFail) {
    c.ended = "lost";
    text += " It slips away from them.";
  }
  c.log.push({ who, text });
  return { challenge: c, text, ok };
}

// --- Chases -----------------------------------------------------------------------------------------

export type ChaseEnv = "urban" | "wilderness" | "dungeon";

export interface Complication {
  text: string;
  skill: string;
  dc: number;
}

export interface Chase {
  kind: "chase";
  id: string;
  title: string;
  /** The party chases the quarry, or flees from it. */
  mode: "pursue" | "flee";
  /** The other side: who they're chasing or running from. */
  other: string;
  /** The other side's bonus on its checks. */
  otherBonus: number;
  env: ChaseEnv;
  level: number;
  /** Distance between the party and the other side, in rough steps (0 = caught). */
  lead: number;
  escapeAt: number;
  round: number;
  complication: Complication;
  /** This round's rolls by the party. */
  rolls: { who: string; total: number; ok: boolean }[];
  log: ChallengeLine[];
  ended?: "caught" | "escaped";
}

const COMPLICATIONS: Record<ChaseEnv, [text: string, skill: string][]> = {
  urban: [["A cart blocks the alley.", "acr"], ["A crowd fills the street.", "ath"], ["Washing lines and low awnings.", "acr"], ["A market stall to vault.", "ath"], ["A dead end: up the drainpipe!", "ath"], ["A beggar grabs at you, pleading.", "per"], ["Which way did they go?", "prc"], ["Guards shout to stop.", "dec"], ["Slick cobbles after the rain.", "acr"], ["A pack of dogs joins in.", "ani"]],
  wilderness: [["Thick brambles.", "ath"], ["A stream to cross.", "ath"], ["Loose scree underfoot.", "acr"], ["A fallen tree.", "acr"], ["The trail forks.", "sur"], ["Low branches in the gloom.", "prc"], ["A hidden gully.", "prc"], ["Mud sucks at your boots.", "ath"], ["Spooked wildlife bolts across the path.", "ani"], ["Fog rolls in.", "sur"]],
  dungeon: [["A pit across the corridor.", "ath"], ["Rubble half blocks the passage.", "acr"], ["Darkness ahead.", "prc"], ["A door that sticks.", "ath"], ["Slippery steps down.", "acr"], ["Three passages: which one?", "sur"], ["Cobwebs thick as curtains.", "ath"], ["A narrow ledge.", "acr"], ["A trap goes off behind them.", "prc"], ["A collapsed ceiling to squeeze through.", "acr"]],
};

export function chaseComplication(env: ChaseEnv, level: number, seed: string | number): Complication {
  const rng = createRng(seed);
  const [text, skill] = rng.pick(COMPLICATIONS[env]);
  return { text, skill, dc: Math.min(20, 10 + Math.floor(level / 3) + rng.int(0, 3)) };
}

export function startChase(o: { mode: "pursue" | "flee"; other: string; otherBonus?: number; env: ChaseEnv; level: number; lead?: number; id: string; seed?: string }): Chase {
  return {
    kind: "chase", id: o.id, title: o.mode === "pursue" ? `Chasing ${o.other}` : `Fleeing ${o.other}`, mode: o.mode, other: o.other,
    otherBonus: o.otherBonus ?? 3 + Math.floor(o.level / 4), env: o.env, level: o.level, lead: o.lead ?? 3, escapeAt: 6, round: 1,
    complication: chaseComplication(o.env, o.level, `${o.seed ?? o.id}:1`), rolls: [], log: [],
  };
}

/** A party member deals with this round's complication (any skill they can justify; listed one by default). */
export function chaseRoll(c0: Chase, who: string, total: number): Chase {
  if (c0.ended || c0.rolls.some((r) => r.who === who)) return c0;
  return { ...c0, rolls: [...c0.rolls, { who, total, ok: total >= c0.complication.dc }] };
}

/**
 * End the round: the party does well if most of them beat the complication; the other side rolls
 * its own (`otherTotal`). Party ahead and they're not: the gap closes (pursuing) or grows (fleeing).
 */
export function chaseRound(c0: Chase, otherTotal: number): { chase: Chase; text: string } {
  if (c0.ended) return { chase: c0, text: "The chase is over." };
  const c: Chase = { ...c0, log: [...c0.log] };
  const good = c.rolls.filter((r) => r.ok).length;
  const party = c.rolls.length > 0 && good * 2 >= c.rolls.length;
  const them = otherTotal >= c.complication.dc;
  // How the party is doing relative to the other side.
  const swing = party === them ? 0 : party ? 1 : -1;
  // Pursuing: doing well closes the gap. Fleeing: doing well widens it.
  c.lead += c.mode === "pursue" ? -swing : swing;
  const how = swing === 0 ? "Nobody gains ground." : swing > 0 ? "The party gains ground." : `${c.other} gains ground.`;
  let text = `Round ${c.round}: ${c.complication.text} The party ${party ? "handles it" : "struggles"} (${good}/${c.rolls.length}); ${c.other} ${them ? "gets through" : "is slowed"} (${otherTotal}). ${how}`;
  if (c.lead <= 0) {
    c.ended = "caught";
    text += c.mode === "pursue" ? ` They catch ${c.other}!` : ` ${c.other} catches them!`;
  } else if (c.lead >= c.escapeAt) {
    c.ended = "escaped";
    text += c.mode === "pursue" ? ` ${c.other} gets away.` : " They get away!";
  }
  c.log.push({ who: `Round ${c.round}`, text });
  if (!c.ended) {
    c.round += 1;
    c.rolls = [];
    c.complication = chaseComplication(c.env, c.level, `${c.id}:${c.round}`);
  }
  return { chase: c, text };
}

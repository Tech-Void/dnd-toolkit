// ---------------------------------------------------------------------------
// Social encounters: talking someone round. Their mood (-3 hostile … +3 devoted) moves with
// Persuasion, Deception and Intimidation; Insight reads what they want, and appealing to it works
// better. Patience runs out with every failure. Warming up, they tell what they know; at +2 they
// agree to what the party asks; at +3 they let slip their secret. Lies can be caught, threats
// work now and cost later.

export type Approach = "persuade" | "appeal" | "deceive" | "intimidate" | "insight";

export type TalkEnd = "agreed" | "cowed" | "walked" | "hostile";

export interface TalkLine {
  who: string;
  approach: Approach;
  total: number;
  dc: number;
  text: string;
}

export interface Talk {
  id: string;
  name: string;
  /** The campaign NPC, if it's someone known. */
  npcId?: string;
  personality: string;
  motive: string;
  secret: string;
  /** What the party wants from them. */
  ask: string;
  startMood: number;
  mood: number;
  patience: number;
  /** Things they know, told one at a time as they warm up. */
  info: string[];
  told: number;
  motiveKnown: boolean;
  secretTold: boolean;
  /** Times the party has lied to them (each lie is harder). */
  lies: number;
  threatened: boolean;
  ended?: TalkEnd;
  log: TalkLine[];
}

export const MOOD_LABELS = ["hostile", "unfriendly", "wary", "indifferent", "friendly", "warm", "devoted"];
export const moodLabel = (m: number) => MOOD_LABELS[Math.max(-3, Math.min(3, m)) + 3]!;

export const SKILL_FOR: Record<Approach, string> = { persuade: "per", appeal: "per", deceive: "dec", intimidate: "itm", insight: "ins" };

export interface TalkOptions {
  id: string;
  ask?: string;
  attitude?: number;
  info?: string[];
  npcId?: string;
}

/** Start a conversation with someone. */
export function startTalk(npc: { name: string; personality: string; motive: string; secret: string }, o: TalkOptions): Talk {
  const mood = Math.max(-3, Math.min(3, Math.round(o.attitude ?? 0)));
  return {
    id: o.id, name: npc.name, npcId: o.npcId, personality: npc.personality, motive: npc.motive, secret: npc.secret, ask: o.ask ?? "",
    startMood: mood, mood, patience: 3 + Math.max(0, mood), info: [...(o.info ?? [])], told: 0,
    motiveKnown: false, secretTold: false, lies: 0, threatened: false, log: [],
  };
}

/** How hard it is to move them, for each approach. */
export function talkDc(t: Talk, a: Approach): number {
  const base = Math.max(8, Math.min(22, 15 - 3 * t.mood));
  if (a === "insight") return 12 + Math.max(0, -t.mood);
  if (a === "appeal") return base - 3;
  if (a === "deceive") return base + 5 * t.lies;
  return base;
}

/** What can be tried right now. */
export function approaches(t: Talk): Approach[] {
  if (t.ended) return [];
  return ["persuade", ...(t.motiveKnown ? (["appeal"] as Approach[]) : []), "deceive", "intimidate", "insight"];
}

const clamp = (n: number) => Math.max(-3, Math.min(3, n));

/** One attempt by someone with a roll total. */
export function tryTalk(t0: Talk, a: Approach, total: number, who: string): { talk: Talk; text: string } {
  if (t0.ended) return { talk: t0, text: `${t0.name} is done talking.` };
  const t: Talk = { ...t0, info: [...t0.info], log: [...t0.log] };
  const dc = talkDc(t0, a);
  const ok = total >= dc;
  const big = total >= dc + 5;
  const bad = total <= dc - 5;
  const lines: string[] = [];
  switch (a) {
    case "insight":
      if (ok) {
        if (!t.motiveKnown) lines.push(`${who} reads ${t.name}: they want to ${t.motive}.`);
        else lines.push(`${who} sees nothing new; ${t.name} still wants to ${t.motive}.`);
        t.motiveKnown = true;
        if (big && t.lies === 0 && !t.secretTold) lines.push(`There's something they're not saying.`);
      } else lines.push(`${who} can't read ${t.name}.`);
      break;
    case "persuade":
    case "appeal":
      if (ok) {
        const step = a === "appeal" && big ? 2 : 1;
        t.mood = clamp(t.mood + step);
        lines.push(a === "appeal" ? `${who} speaks to what ${t.name} wants, and it lands.` : `${who} makes a good case.`);
      } else {
        t.patience -= 1;
        if (bad) t.mood = clamp(t.mood - 1);
        lines.push(bad ? `${who}'s words go down badly.` : `${t.name} isn't convinced.`);
      }
      break;
    case "deceive":
      if (ok) {
        t.mood = clamp(t.mood + 1);
        t.lies += 1;
        lines.push(`${who}'s story holds. (Each lie after this is harder.)`);
      } else {
        t.mood = clamp(t.mood - 2);
        t.patience -= 2;
        lines.push(`${t.name} catches ${who} in a lie.`);
      }
      break;
    case "intimidate":
      t.threatened = true;
      if (ok) {
        t.ended = "cowed";
        t.mood = clamp(t.mood - 1);
        lines.push(`${t.name} gives in to ${who}, for now. They won't forget it.`);
      } else if (bad) {
        t.ended = "hostile";
        t.mood = -3;
        lines.push(`${t.name} won't be threatened: this turns ugly.`);
      } else {
        t.mood = clamp(t.mood - 1);
        t.patience -= 1;
        lines.push(`${t.name} bristles at ${who}'s threat.`);
      }
      break;
  }
  // Warming up: they tell what they know, agree, and spill the secret.
  if (ok && a !== "insight" && a !== "intimidate" && t.mood >= 1 && t.told < t.info.length) {
    lines.push(`${t.name} tells them: ${t.info[t.told]}`);
    t.told += 1;
  }
  if (!t.ended && t.mood >= 3 && !t.secretTold) {
    t.secretTold = true;
    lines.push(`Trusting them now, ${t.name} admits: ${t.secret}.`);
  }
  if (!t.ended && t.mood >= 2 && ok && a !== "insight") {
    t.ended = "agreed";
    lines.push(t.ask ? `${t.name} agrees: ${t.ask}.` : `${t.name} agrees to help.`);
  }
  if (!t.ended && t.mood <= -3) {
    t.ended = "hostile";
    lines.push(`${t.name} has had enough of them.`);
  }
  if (!t.ended && t.patience <= 0) {
    t.ended = "walked";
    lines.push(`${t.name}'s patience runs out; the conversation is over.`);
  }
  const text = lines.join(" ");
  t.log.push({ who, approach: a, total, dc, text });
  return { talk: t, text };
}

/** How the conversation should change their standing with the party (campaign attitude). */
export function talkAttitudeChange(t: Talk): number {
  let d = t.mood - t.startMood;
  if (t.threatened) d -= 1;
  if (t.ended === "hostile") d = Math.min(d, -1);
  return Math.max(-2, Math.min(2, d));
}

/** A line for the campaign log. */
export function talkSummary(t: Talk): string {
  const end = { agreed: "agreed to help", cowed: "gave in under threat", walked: "walked away", hostile: "turned hostile" }[t.ended ?? "walked"];
  const extras = [t.told ? `told ${t.told} thing${t.told === 1 ? "" : "s"}` : "", t.secretTold ? "let their secret slip" : "", t.lies ? `was lied to ${t.lies}×` : ""].filter(Boolean);
  return `Talked with ${t.name}${t.ask ? ` (wanted: ${t.ask})` : ""}: ${end}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
}

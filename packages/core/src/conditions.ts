// ---------------------------------------------------------------------------
// Turn-start reminders: what each condition means for the creature whose turn it is, in one line.

export const CONDITION_REMINDERS: Record<string, string> = {
  blinded: "Blinded: you can't see; your attacks have disadvantage, attacks against you have advantage.",
  charmed: "Charmed: you can't attack your charmer, and they have advantage on social checks with you.",
  deafened: "Deafened: you can't hear (no verbal cues, and you fail checks that need hearing).",
  frightened: "Frightened: disadvantage on checks and attacks while you can see the source; you can't move closer to it.",
  grappled: "Grappled: your speed is 0. Use your action to escape (Athletics or Acrobatics vs their Athletics).",
  incapacitated: "Incapacitated: no actions or reactions.",
  invisible: "Invisible: your attacks have advantage, attacks against you have disadvantage.",
  paralyzed: "Paralyzed: no actions or movement; you fail Str and Dex saves, and hits from within 5 ft are crits.",
  petrified: "Petrified: you're stone. No actions or movement, resistance to all damage.",
  poisoned: "Poisoned: disadvantage on attack rolls and ability checks.",
  prone: "Prone: standing up costs half your speed; your attacks have disadvantage; melee attacks against you have advantage.",
  restrained: "Restrained: speed 0, disadvantage on attacks and Dex saves; attacks against you have advantage.",
  stunned: "Stunned: no actions or movement; you fail Str and Dex saves; attacks against you have advantage.",
  unconscious: "Unconscious: you drop what you hold and fall prone; hits from within 5 ft are crits.",
  concentrating: "Concentrating: taking damage means a Constitution save (DC 10 or half the damage).",
  dodging: "Dodging ends now, unless you Dodge again.",
  hiding: "Hidden: your position is unknown until you attack or make noise.",
  burning: "Burning: take the fire damage now, or use an action to put it out.",
  bleeding: "Bleeding: take the bleed damage now, unless someone stops it (Medicine check or any healing).",
  surprised: "Surprised: you can't move or act this turn.",
};

const EXHAUSTION = [
  "",
  "Exhaustion 1: disadvantage on ability checks.",
  "Exhaustion 2: also, your speed is halved.",
  "Exhaustion 3: also, disadvantage on attacks and saves.",
  "Exhaustion 4: also, your hit point maximum is halved.",
  "Exhaustion 5: also, your speed is 0.",
  "Exhaustion 6: death.",
];

/** One reminder line per condition (unknown ones are skipped), most limiting first. */
export function conditionReminders(statuses: Iterable<string>, opts: { exhaustion?: number; concentratingOn?: string } = {}): string[] {
  const order = Object.keys(CONDITION_REMINDERS);
  const set = new Set([...statuses].map((s) => s.toLowerCase()));
  // Paralyzed, stunned, petrified and unconscious already include incapacitated.
  if (["paralyzed", "stunned", "petrified", "unconscious"].some((s) => set.has(s))) set.delete("incapacitated");
  const severity = ["unconscious", "petrified", "paralyzed", "stunned", "surprised", "incapacitated", "restrained", "grappled", "prone", "frightened", "blinded", "poisoned"];
  const rank = (s: string) => (severity.includes(s) ? severity.indexOf(s) : severity.length + order.indexOf(s));
  const lines = [...set].filter((s) => CONDITION_REMINDERS[s]).sort((a, b) => rank(a) - rank(b)).map((s) => {
    if (s === "concentrating" && opts.concentratingOn) return `Concentrating on ${opts.concentratingOn}: taking damage means a Constitution save (DC 10 or half the damage).`;
    return CONDITION_REMINDERS[s]!;
  });
  const ex = Math.min(6, Math.max(0, Math.floor(opts.exhaustion ?? 0)));
  if (ex) lines.push(EXHAUSTION[ex]!);
  return lines;
}

/** Where a dying character stands: "2 successes, 1 failure". */
export function deathSaveLine(success: number, failure: number): string {
  if (failure >= 3) return "Dead.";
  if (success >= 3) return "Stable.";
  const p = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : w === "success" ? "es" : "s"}`;
  return `Dying: ${p(success, "success")}, ${p(failure, "failure")}.`;
}

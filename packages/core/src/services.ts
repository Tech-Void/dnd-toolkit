// ---------------------------------------------------------------------------
// What a town's temple and inn sell besides goods: healing and restoration by the priests, a room
// and a meal at the inn. Prices follow the usual spellcasting-service rates.

export type ServiceEffect = "heal" | "condition" | "exhaustion" | "curse" | "raise" | "none";

export interface TempleService {
  id: string;
  name: string;
  gp: number;
  effect: ServiceEffect;
  /** Healing roll. */
  formula?: string;
  /** Conditions it can lift. */
  conditions?: string[];
  text: string;
}

export const TEMPLE_SERVICES: TempleService[] = [
  { id: "cure", name: "Cure wounds", gp: 10, effect: "heal", formula: "1d8 + 3", text: "A prayer and a warm hand: heals 1d8 + 3." },
  { id: "healing-word", name: "Prayer of healing", gp: 30, effect: "heal", formula: "2d8 + 3", text: "A longer rite: heals 2d8 + 3." },
  { id: "lesser", name: "Lesser restoration", gp: 40, effect: "condition", conditions: ["blinded", "deafened", "paralyzed", "poisoned", "diseased"], text: "Ends being blinded, deafened, paralyzed or poisoned (or a disease)." },
  { id: "remove-curse", name: "Remove curse", gp: 90, effect: "curse", text: "Lifts a curse (and breaks attunement to a cursed item). The GM handles the details." },
  { id: "greater", name: "Greater restoration", gp: 450, effect: "exhaustion", text: "Removes a level of exhaustion (or a charm, petrification or curse; ask the GM). Needs 100 gp of diamond dust, included." },
  { id: "raise", name: "Raise dead", gp: 1250, effect: "raise", text: "Returns a creature dead less than ten days, with a 500 gp diamond (included). The GM handles the rite." },
];

/** Price for a service: a city temple charges more, a hamlet shrine less; a friend of the faith less again. */
export function servicePrice(s: TempleService, settlement: string, attitude = 0): number {
  const place = ({ hamlet: 0.8, village: 0.9, town: 1, city: 1.1, metropolis: 1.25 } as Record<string, number>)[settlement] ?? 1;
  return Math.max(1, Math.round(s.gp * place * (1 - 0.05 * Math.max(-3, Math.min(3, attitude)))));
}

/** The inn: a night's rooms for the party, and a round for the house. */
export const innNight = (roomGp: number, people: number) => Math.round(roomGp * Math.max(1, people) * 100) / 100;
export const innRound = (people: number) => Math.round(Math.max(1, people) * 0.4 * 10) / 10;

/** The next rumor someone hasn't heard (they come round again once all are told). */
export function nextRumor(rumors: readonly string[], told: readonly number[]): { index: number; text: string } | null {
  if (!rumors.length) return null;
  const fresh = rumors.map((_, i) => i).filter((i) => !told.includes(i));
  const index = fresh.length ? fresh[0]! : told.length % rumors.length;
  return { index, text: rumors[index]! };
}

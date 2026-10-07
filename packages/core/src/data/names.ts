/** First names by race. Shopkeepers and NPCs both draw from these; keep existing entries in order (seeds depend on it). */
export const FIRST_NAMES: Record<string, string[]> = {
  human: ["Aldric", "Bertha", "Corin", "Dagna", "Edda", "Fenwick", "Greta", "Hollis", "Ilse", "Jory", "Marta", "Osric"],
  dwarf: ["Brottor", "Dagnal", "Eberk", "Gunnloda", "Helja", "Kildrak", "Orsik", "Rurik", "Thora", "Vondal"],
  halfling: ["Andry", "Bree", "Cade", "Eldon", "Kithri", "Lyle", "Merla", "Nedda", "Perrin", "Seraphina"],
  elf: ["Adrie", "Caelynn", "Erevan", "Faral", "Ielenia", "Laucian", "Naivara", "Quelenna", "Thamior", "Vadania"],
  gnome: ["Alston", "Bimpnottin", "Boddynock", "Carlin", "Ellyjobell", "Fonkin", "Nissa", "Orryn", "Roywyn", "Zook"],
  "half-orc": ["Dench", "Engong", "Holg", "Imsh", "Krusk", "Myev", "Ovak", "Shautha", "Sutha", "Volen"],
  tiefling: ["Akmenos", "Bryseis", "Damakos", "Kallista", "Lerissa", "Mordai", "Nemeia", "Orianna", "Skamos", "Rieta"],
  dragonborn: ["Arjhan", "Biri", "Donaar", "Harann", "Kava", "Medrash", "Nala", "Perra", "Sora", "Torinn"],
};

/** Family, clan or house names by race. Half-orcs go by epithets instead. */
export const SURNAMES: Record<string, string[]> = {
  human: ["Ashdown", "Blackwood", "Crane", "Dunmore", "Fairweather", "Greaves", "Harrow", "Kettle", "Marsh", "Pennywhistle", "Thatcher", "Vane"],
  dwarf: ["Balderk", "Battlehammer", "Fireforge", "Gorunn", "Holderhek", "Ironfist", "Loderr", "Rumnaheim", "Strakeln", "Ungart"],
  halfling: ["Brushgather", "Goodbarrel", "Greenbottle", "High-hill", "Hilltopple", "Leagallow", "Tealeaf", "Thorngage", "Tosscobble", "Underbough"],
  elf: ["Amakiir", "Amastacia", "Galanodel", "Holimion", "Ilphelkiir", "Liadon", "Meliamne", "Nailo", "Siannodel", "Xiloscient"],
  gnome: ["Beren", "Daergel", "Folkor", "Garrick", "Nackle", "Murnig", "Ningel", "Raulnor", "Scheppen", "Timbers"],
  tiefling: ["Ash", "Ember", "Hope", "Quarrel", "Sorrow", "Torment", "Vigil", "Whisper", "Wander", "Reverie"],
  dragonborn: ["Clethtinthiallor", "Daardendrian", "Delmirev", "Drachedandion", "Kepeshkmolik", "Kerrhylon", "Myastan", "Nemmonis", "Norixius", "Prexijandilin"],
};

export const EPITHETS = ["the Grim", "Skullsplitter", "the Quiet", "Tusk", "Ironhide", "the Unbowed", "Half-Ear", "Stonejaw", "the Patient", "Redhand"];
